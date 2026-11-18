import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import express, { type Request, type Response } from 'express';
import type { PosAppState } from '../types/pos';
import {
  buildUpcomingForecastDates,
  normalizeAiForecastReport,
  type AiForecastRequestPayload,
  type RawGeminiForecastPayload,
} from '../utils/aiForecast';
import {
  normalizeAiStockMonitorReport,
  type AiStockMonitorRequestPayload,
  type RawGeminiStockMonitorPayload,
} from '../utils/aiStockMonitor';
import {
  normalizeAiPairingsReport,
  type AiPairingsRequestPayload,
  type RawGeminiPairingsPayload,
} from '../utils/aiPairings';
import {
  normalizeAiShiftOptimizationReport,
  type RawGeminiShiftOptimizationPayload,
  type ShiftOptimizationRequestPayload,
} from '../utils/aiShiftOptimization';
import { isValidBakongAccountId } from '../utils/bakongKhqr';
import { normalizeMd5List, parseBakongCallbackBody } from '../utils/bakongPolling';
import type { SubscriptionPlan } from '../utils/subscription';
import { generateUid } from './db/authSecurity';
import {
  SyncConflictError,
  type AuthenticatedContext,
  type PosSqliteRepository,
} from './db/posRepository';
import { realtimeHub } from './realtimeHub';

interface ConfirmedBakongCallback {
  md5: string;
  transactionRef: string;
  source: 'callback' | 'sandbox' | 'bakong_api';
  transaction: {
    hash?: string;
    externalRef?: string;
    fromAccountId?: string;
    toAccountId?: string;
    currency?: string;
    amount?: number;
  } | null;
  recordedAtMs: number;
}

function extractAuth(req: Request, repo: PosSqliteRepository): AuthenticatedContext {
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : typeof req.query.token === 'string'
      ? req.query.token
      : '';

  const baseAuth = repo.authenticateToken(bearer || null);

  // Support local Super Admin PIN session (`staff_admin` PIN `0000`) when explicitly passed
  const staffRoleHeader = String(req.headers['x-pos-staff-role'] || '');
  const adminPinHeader = String(req.headers['x-pos-admin-pin'] || '');
  if (!baseAuth.isSuperAdmin && staffRoleHeader === 'admin' && adminPinHeader === '0000') {
    return {
      ...baseAuth,
      isSuperAdmin: true,
    };
  }

  return baseAuth;
}

export function createApiRouter(repo: PosSqliteRepository): express.Router {
  const router = express.Router();

  const bakongBaseUrl = (
    process.env.BAKONG_BASE_URL || 'https://api-bakong.nbc.gov.kh'
  ).replace(/\/+$/, '');
  const bakongToken = (process.env.BAKONG_API_TOKEN || '').trim();
  const geminiApiKey = (process.env.GEMINI_API_KEY || '').trim();
  const telegramBotToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();

  // ---------------------------------------------------------------------------
  // Health & SQLite Engine Status
  // ---------------------------------------------------------------------------
  router.get('/health', (_req: Request, res: Response) => {
    const stats = repo.getSqliteEngineStats();
    res.json({
      status: 'ok',
      database: {
        engine: stats.engine,
        sqliteVersion: stats.sqliteVersion,
        journalMode: stats.journalMode,
        totalTenants: stats.totalTenants,
        totalOrders: stats.totalOrders,
      },
      sseClients: realtimeHub.getConnectedCount(),
      bakongLiveConfigured: Boolean(bakongToken),
      bakongBaseUrl,
      geminiConfigured: Boolean(geminiApiKey),
      telegramConfigured: Boolean(telegramBotToken),
      timestamp: new Date().toISOString(),
    });
  });

  // ---------------------------------------------------------------------------
  // Self-Hosted SQLite SaaS Authentication
  // ---------------------------------------------------------------------------
  router.post('/auth/register', (req: Request, res: Response) => {
    try {
      const { email, password, displayName } = req.body ?? {};
      const { user, token } = repo.registerAccount({
        email: String(email || ''),
        password: String(password || ''),
        displayName: displayName ? String(displayName) : undefined,
      });
      const auth = repo.authenticateToken(token);
      const tenants = repo.listAccessibleTenants(auth);
      const platformSettings = repo.getPlatformSettings();
      res.status(201).json({ ok: true, user, token, tenants, platformSettings });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Registration failed.',
      });
    }
  });

  router.post('/auth/login', (req: Request, res: Response) => {
    try {
      const { email, password } = req.body ?? {};
      const { user, token } = repo.loginAccount({
        email: String(email || ''),
        password: String(password || ''),
      });
      const auth = repo.authenticateToken(token);
      const tenants = repo.listAccessibleTenants(auth);
      const platformSettings = repo.getPlatformSettings();
      res.json({ ok: true, user, token, tenants, platformSettings });
    } catch (err) {
      res.status(401).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Sign-in failed.',
      });
    }
  });

  router.post('/auth/logout', (req: Request, res: Response) => {
    const auth = extractAuth(req, repo);
    if (auth.token) {
      repo.revokeSession(auth.token);
    }
    res.json({ ok: true });
  });

  router.post('/auth/reset-password', (req: Request, res: Response) => {
    try {
      const { email, newPassword } = req.body ?? {};
      const result = repo.resetAccountPassword({
        email: String(email || ''),
        newPassword: newPassword ? String(newPassword) : undefined,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Password reset failed.',
      });
    }
  });

  router.get('/auth/me', (req: Request, res: Response) => {
    const auth = extractAuth(req, repo);
    const tenants = repo.listAccessibleTenants(auth);
    const platformSettings = repo.getPlatformSettings();
    res.json({
      ok: true,
      user: auth.user,
      isSuperAdmin: auth.isSuperAdmin,
      tenants,
      platformSettings,
    });
  });

  router.post('/auth/staff-pin', (req: Request, res: Response) => {
    try {
      const { businessCode, username, pin } = req.body ?? {};
      const result = repo.verifyTenantStaffPin({
        businessCode: businessCode ? String(businessCode) : undefined,
        username: String(username || ''),
        pin: String(pin || ''),
      });
      if (!result.ok || !result.tenant) {
        res.status(401).json({ ok: false, error: result.error || 'Invalid credentials.' });
        return;
      }
      res.json({
        ok: true,
        tenant: result.tenant,
        staffId: result.staffId,
        isAdmin: Boolean(result.isAdmin),
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Staff verification failed.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Platform Settings & SQLite Telemetry
  // ---------------------------------------------------------------------------
  router.get('/platform/settings', (_req: Request, res: Response) => {
    res.json({ ok: true, settings: repo.getPlatformSettings() });
  });

  router.put('/platform/settings', (req: Request, res: Response) => {
    const auth = extractAuth(req, repo);
    if (!auth.isSuperAdmin) {
      res.status(403).json({
        ok: false,
        error: 'Only Super Admin can update global platform settings.',
      });
      return;
    }
    const actorName = String(req.body?.updatedBy || auth.user?.displayName || 'Super Admin');
    const updated = repo.savePlatformSettings(req.body ?? {}, actorName);
    realtimeHub.broadcast({
      type: 'platform_settings_updated',
      actorUid: auth.user?.uid,
      timestamp: new Date().toISOString(),
    });
    res.json({ ok: true, settings: updated });
  });

  router.get('/platform/sqlite-stats', (req: Request, res: Response) => {
    const auth = extractAuth(req, repo);
    const stats = repo.getSqliteEngineStats();
    res.json({
      ok: true,
      stats: auth.isSuperAdmin
        ? { ...stats, paidOrdersGmvUsd: 0 }
        : stats,
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-Tenant CRUD & Atomic SQLite Sync
  // ---------------------------------------------------------------------------
  router.get('/tenants', (req: Request, res: Response) => {
    const auth = extractAuth(req, repo);
    const tenants = repo.listAccessibleTenants(auth);
    const platformSettings = repo.getPlatformSettings();
    res.json({ ok: true, tenants, platformSettings });
  });

  router.get('/tenants/:tenantId', (req: Request, res: Response) => {
    const auth = extractAuth(req, repo);
    const tenantId = String(req.params.tenantId);
    const businessCode =
      typeof req.query.businessCode === 'string' ? req.query.businessCode : undefined;

    if (!repo.canAccessTenant(tenantId, auth, businessCode)) {
      res.status(403).json({ ok: false, error: 'Access denied to this tenant workspace.' });
      return;
    }

    const tenant = repo.loadTenantState(tenantId);
    if (!tenant) {
      res.status(404).json({ ok: false, error: 'Tenant not found.' });
      return;
    }
    res.json({
      ok: true,
      tenant: auth.isSuperAdmin ? repo.redactTenantOperationalDataForAdmin(tenant) : tenant,
    });
  });

  router.post('/tenants', (req: Request, res: Response) => {
    try {
      const auth = extractAuth(req, repo);
      const incoming = req.body?.tenant as PosAppState | undefined;
      if (!incoming || !incoming.tenantId || !incoming.businessCode) {
        res.status(400).json({ ok: false, error: 'Valid tenant payload required.' });
        return;
      }

      const saved = repo.saveTenantState(
        {
          ...incoming,
          ownerUid: incoming.ownerUid || auth.user?.uid,
        },
        { auth, bypassSecurityControls: true }
      );

      // If newly registered with an active paid subscription, record in subscription_payments
      if (saved.subscriptionStatus === 'active' && saved.subscriptionPaidUsd && saved.tenantId) {
        repo.db
          .prepare(
            `INSERT OR IGNORE INTO subscription_payments (id, tenant_id, tenant_name, plan, days_granted, amount_usd, payment_ref, paid_by_uid, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            generateUid('subpay'),
            saved.tenantId,
            saved.shopName,
            saved.plan,
            saved.planDaysLeft || 1,
            saved.subscriptionPaidUsd,
            saved.subscriptionRef || 'INITIAL_REG',
            auth.user?.uid ?? null,
            new Date().toISOString()
          );
      }

      realtimeHub.broadcast({
        type: 'tenant_updated',
        tenantId: saved.tenantId,
        version: saved.version,
        actorUid: auth.user?.uid,
        clientTabId: String(req.headers['x-client-tab-id'] || ''),
        timestamp: new Date().toISOString(),
      });

      res.status(201).json({ ok: true, tenant: saved });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to create tenant.',
      });
    }
  });

  router.put('/tenants/:tenantId', (req: Request, res: Response) => {
    try {
      const auth = extractAuth(req, repo);
      const tenantId = String(req.params.tenantId);
      const incoming = req.body?.tenant as PosAppState | undefined;

      if (!incoming || incoming.tenantId !== tenantId) {
        res.status(400).json({ ok: false, error: 'Mismatched tenantId in payload.' });
        return;
      }

      const existing = repo.loadTenantState(tenantId);
      if (existing && !repo.canAccessTenant(tenantId, auth, incoming.businessCode)) {
        res.status(403).json({ ok: false, error: 'Access denied to modify this tenant.' });
        return;
      }

      const expectedVersion =
        typeof req.body?.expectedVersion === 'number' && Number.isFinite(req.body.expectedVersion)
          ? Number(req.body.expectedVersion)
          : undefined;
      const forceOverwrite = Boolean(req.body?.forceOverwrite);

      const saved = repo.saveTenantState(incoming, {
        auth,
        expectedVersion,
        forceOverwrite,
      });

      realtimeHub.broadcast({
        type: 'tenant_updated',
        tenantId: saved.tenantId,
        version: saved.version,
        actorUid: auth.user?.uid,
        clientTabId: String(req.headers['x-client-tab-id'] || ''),
        timestamp: new Date().toISOString(),
      });

      res.json({
        ok: true,
        tenant: auth.isSuperAdmin ? repo.redactTenantOperationalDataForAdmin(saved) : saved,
      });
    } catch (err) {
      if (err instanceof SyncConflictError) {
        res.status(409).json({
          ok: false,
          code: err.code,
          error: err.message,
          clientVersion: err.clientVersion,
          serverVersion: err.serverVersion,
          serverOrdersCount: err.serverOrdersCount,
        });
        return;
      }
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to save tenant state.',
      });
    }
  });

  router.post('/tenants/:tenantId/subscription/activate', (req: Request, res: Response) => {
    try {
      const auth = extractAuth(req, repo);
      const tenantId = String(req.params.tenantId);
      const { plan, days, paymentRef, amountUsd, actorName, businessCode } = req.body ?? {};

      if (!repo.canAccessTenant(tenantId, auth, businessCode)) {
        res.status(403).json({ ok: false, error: 'Access denied.' });
        return;
      }

      if (!plan || !paymentRef) {
        res.status(400).json({ ok: false, error: 'plan and paymentRef are required.' });
        return;
      }

      const saved = repo.activateTenantSubscription({
        tenantId,
        plan: plan as SubscriptionPlan,
        days: days ? Number(days) : undefined,
        paymentRef: String(paymentRef),
        amountUsd: amountUsd !== undefined ? Number(amountUsd) : undefined,
        actorUid: auth.user?.uid,
        actorName: actorName ? String(actorName) : auth.user?.displayName,
      });

      realtimeHub.broadcast({
        type: 'tenant_updated',
        tenantId: saved.tenantId,
        version: saved.version,
        actorUid: auth.user?.uid,
        clientTabId: String(req.headers['x-client-tab-id'] || ''),
        summary: 'subscription_activated',
        timestamp: new Date().toISOString(),
      });

      res.json({ ok: true, tenant: saved });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Subscription activation failed.',
      });
    }
  });

  router.delete('/tenants/:tenantId', (req: Request, res: Response) => {
    try {
      const auth = extractAuth(req, repo);
      const tenantId = String(req.params.tenantId);
      const existing = repo.loadTenantState(tenantId);
      if (!existing) {
        res.status(404).json({ ok: false, error: 'Tenant not found.' });
        return;
      }

      const isOwner = Boolean(auth.user && existing.ownerUid === auth.user.uid);
      if (!auth.isSuperAdmin && !isOwner) {
        res.status(403).json({
          ok: false,
          error: 'Only Super Admin or the workspace owner can delete a tenant.',
        });
        return;
      }

      repo.deleteTenant(tenantId);
      realtimeHub.broadcast({
        type: 'tenant_deleted',
        tenantId,
        actorUid: auth.user?.uid,
        timestamp: new Date().toISOString(),
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Delete tenant failed.',
      });
    }
  });

  router.get('/tenants/:tenantId/backup', (req: Request, res: Response) => {
    const auth = extractAuth(req, repo);
    const tenantId = String(req.params.tenantId);
    const businessCode =
      typeof req.query.businessCode === 'string' ? req.query.businessCode : undefined;
    if (!repo.canAccessTenant(tenantId, auth, businessCode)) {
      res.status(403).json({ ok: false, error: 'Access denied.' });
      return;
    }
    const tenant = repo.loadTenantState(tenantId);
    if (!tenant) {
      res.status(404).json({ ok: false, error: 'Tenant not found.' });
      return;
    }
    res.json({
      ok: true,
      exportedAt: new Date().toISOString(),
      engine: 'xaiwork-sqlite-v2',
      tenant,
    });
  });

  router.post('/tenants/:tenantId/restore', (req: Request, res: Response) => {
    try {
      const auth = extractAuth(req, repo);
      const tenantId = String(req.params.tenantId);
      const incoming = req.body?.tenant as PosAppState | undefined;
      if (!incoming) {
        res.status(400).json({ ok: false, error: 'Backup tenant payload required.' });
        return;
      }
      if (!repo.canAccessTenant(tenantId, auth, incoming.businessCode)) {
        res.status(403).json({ ok: false, error: 'Access denied.' });
        return;
      }
      const restored = repo.saveTenantState(
        { ...incoming, tenantId },
        { auth, bypassSecurityControls: auth.isSuperAdmin }
      );
      realtimeHub.broadcast({
        type: 'tenant_updated',
        tenantId,
        version: restored.version,
        timestamp: new Date().toISOString(),
      });
      res.json({ ok: true, tenant: restored });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Restore failed.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Public Guest QR Ordering & Online Reservations (Cross-Device Ready)
  // ---------------------------------------------------------------------------
  router.get('/public/tenant/:codeOrId', (req: Request, res: Response) => {
    const key = String(req.params.codeOrId);
    const tenant = repo.loadTenantState(key) || repo.findTenantByBusinessCode(key);
    if (!tenant || tenant.tenantStatus === 'suspended') {
      res.status(404).json({ ok: false, error: 'Storefront not available.' });
      return;
    }
    res.json({
      ok: true,
      tenant: {
        tenantId: tenant.tenantId,
        shopName: tenant.shopName,
        businessCode: tenant.businessCode,
        activeBranchId: tenant.activeBranchId,
        branches: tenant.branches,
        menuItems: tenant.menuItems.filter((m) => m.active),
        tables: tenant.tables,
        reservations: tenant.reservations,
        groupSessions: tenant.groupSessions,
      },
    });
  });

  router.post('/public/tenant/:tenantId/qr-order', (req: Request, res: Response) => {
    try {
      const tenantId = String(req.params.tenantId);
      const saved = repo.appendGuestQrOrder(tenantId, req.body);
      realtimeHub.broadcast({
        type: 'qr_order_received',
        tenantId,
        version: saved.version,
        timestamp: new Date().toISOString(),
      });
      res.status(201).json({ ok: true, qrQueueCount: saved.qrQueue.length });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to submit QR order.',
      });
    }
  });

  router.post('/public/tenant/:tenantId/service-alert', (req: Request, res: Response) => {
    try {
      const tenantId = String(req.params.tenantId);
      const { branchId, tableName, alertType } = req.body ?? {};
      const saved = repo.appendGuestServiceAlert({
        tenantId,
        branchId: String(branchId || ''),
        tableName: String(tableName || 'Table'),
        alertType: alertType === 'ask_bill' ? 'ask_bill' : 'call_staff',
      });
      realtimeHub.broadcast({
        type: 'tenant_updated',
        tenantId,
        version: saved.version,
        summary: `guest_${alertType}`,
        timestamp: new Date().toISOString(),
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to alert staff.',
      });
    }
  });

  router.post('/public/tenant/:tenantId/reservation', (req: Request, res: Response) => {
    try {
      const tenantId = String(req.params.tenantId);
      const { state, reservation } = repo.appendOnlineReservation(tenantId, req.body);
      realtimeHub.broadcast({
        type: 'reservation_received',
        tenantId,
        version: state.version,
        timestamp: new Date().toISOString(),
      });
      res.status(201).json({ ok: true, reservation });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to create reservation.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Real-Time Server-Sent Events (SSE) Sync Stream
  // ---------------------------------------------------------------------------
  router.get('/realtime/stream', (req: Request, res: Response) => {
    const auth = extractAuth(req, repo);
    const requestedTenants = String(req.query.tenantIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const allowedSet = new Set<string>();
    if (auth.isSuperAdmin) {
      allowedSet.add('*');
    } else {
      for (const tid of requestedTenants) {
        if (repo.canAccessTenant(tid, auth)) {
          allowedSet.add(tid);
        }
      }
      for (const t of repo.listAccessibleTenants(auth)) {
        if (t.tenantId) allowedSet.add(t.tenantId);
      }
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(
      `data: ${JSON.stringify({
        type: 'connected',
        engine: 'sqlite-wal-sse',
        timestamp: new Date().toISOString(),
      })}\n\n`
    );

    const clientId = generateUid('sse');
    const remove = realtimeHub.addClient({
      id: clientId,
      res,
      uid: auth.user?.uid,
      isAdmin: auth.isSuperAdmin,
      tenantIds: allowedSet,
    });

    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        clearInterval(heartbeat);
        remove();
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      remove();
    });
  });

  // ---------------------------------------------------------------------------
  // Bakong NBC Live KHQR Verification, Polling & Callback Webhook
  // ---------------------------------------------------------------------------
  const confirmedKhqrCallbacks = new Map<string, ConfirmedBakongCallback>();

  const pruneExpiredCallbacks = () => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [k, v] of confirmedKhqrCallbacks.entries()) {
      if (v.recordedAtMs < cutoff) {
        confirmedKhqrCallbacks.delete(k);
      }
    }
  };

  router.post('/bakong/callback', (req: Request, res: Response) => {
    pruneExpiredCallbacks();
    const parsed = parseBakongCallbackBody(req.body);
    if (!parsed) {
      res.status(400).json({
        ok: false,
        error: 'Valid 32-character hex md5 is required in Bakong callback payload.',
      });
      return;
    }

    if (!parsed.paid) {
      confirmedKhqrCallbacks.delete(parsed.md5);
      res.json({
        ok: true,
        recorded: false,
        paid: false,
        md5: parsed.md5,
        message: 'Callback marked transaction as not paid.',
      });
      return;
    }

    const record: ConfirmedBakongCallback = {
      md5: parsed.md5,
      transactionRef: parsed.transactionRef,
      source: 'callback',
      transaction: {
        hash: parsed.hash || parsed.transactionRef,
        externalRef: parsed.externalRef,
        fromAccountId: parsed.fromAccountId,
        toAccountId: parsed.toAccountId,
        currency: parsed.currency,
        amount: parsed.amount,
      },
      recordedAtMs: Date.now(),
    };
    confirmedKhqrCallbacks.set(parsed.md5, record);

    realtimeHub.broadcast({
      type: 'ping',
      summary: `bakong_callback:${parsed.md5}`,
      timestamp: new Date().toISOString(),
    });

    res.json({
      ok: true,
      recorded: true,
      paid: true,
      md5: parsed.md5,
      transactionRef: record.transactionRef,
      transaction: record.transaction,
    });
  });

  const handleCheckBakongTransaction = async (req: Request, res: Response) => {
    pruneExpiredCallbacks();
    const body = (req.body ?? {}) as {
      md5?: unknown;
      md5s?: unknown;
      simulatePaid?: unknown;
    };
    const md5List = normalizeMd5List(body.md5, body.md5s);
    const simulatePaid = Boolean(body.simulatePaid);

    if (md5List.length === 0) {
      res.status(400).json({
        ok: false,
        configured: Boolean(bakongToken),
        paid: false,
        error: 'Invalid 32-character hex MD5 hash.',
      });
      return;
    }

    // 1. Check existing confirmed webhook/callback records first
    for (const md5 of md5List) {
      const hit = confirmedKhqrCallbacks.get(md5);
      if (hit) {
        res.json({
          ok: true,
          configured: Boolean(bakongToken),
          paid: true,
          matchedMd5: md5,
          md5,
          source: hit.source,
          transactionRef: hit.transactionRef,
          transaction: hit.transaction,
          message:
            hit.source === 'callback'
              ? 'Bakong KHQR callback confirmed payment.'
              : 'Bakong KHQR payment verified.',
        });
        return;
      }
    }

    // 2. Explicit sandbox confirmation trigger (from Confirm Paid Sandbox button)
    if (simulatePaid) {
      const targetMd5 = md5List[0];
      const ref = `KHQR-SANDBOX-${targetMd5.slice(0, 6).toUpperCase()}`;
      confirmedKhqrCallbacks.set(targetMd5, {
        md5: targetMd5,
        transactionRef: ref,
        source: 'sandbox',
        transaction: { hash: ref },
        recordedAtMs: Date.now(),
      });
      res.json({
        ok: true,
        configured: Boolean(bakongToken),
        paid: true,
        matchedMd5: targetMd5,
        md5: targetMd5,
        source: 'sandbox',
        transactionRef: ref,
        transaction: { hash: ref },
        message: 'Bakong KHQR sandbox payment confirmed.',
      });
      return;
    }

    // 3. When BAKONG_API_TOKEN is absent, remain in non-blocking callback listener mode
    if (!bakongToken) {
      res.json({
        ok: true,
        configured: false,
        paid: false,
        pending: true,
        checkedCount: md5List.length,
        source: 'callback_listener',
        message: 'Listening for Bakong KHQR callback (no BAKONG_API_TOKEN configured).',
      });
      return;
    }

    // 4. Query NBC Bakong Open API check_transaction_by_md5 for candidate hashes
    try {
      let lastMessage = 'Transaction pending in Bakong.';
      let lastResponseCode: number | null = null;

      for (const md5 of md5List) {
        const upstream = await fetch(`${bakongBaseUrl}/v1/check_transaction_by_md5`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bakongToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ md5 }),
        });

        const payload = (await upstream.json().catch(() => ({}))) as {
          responseCode?: number;
          responseMessage?: string;
          data?: {
            hash?: string;
            fromAccountId?: string;
            toAccountId?: string;
            currency?: string;
            amount?: number;
            externalRef?: string;
          } | null;
        };

        lastResponseCode = payload.responseCode ?? null;
        if (payload.responseMessage) {
          lastMessage = payload.responseMessage;
        }

        if (payload.responseCode === 0 && payload.data) {
          const ref =
            payload.data.hash ||
            payload.data.externalRef ||
            `KHQR-${md5.slice(0, 8).toUpperCase()}`;
          confirmedKhqrCallbacks.set(md5, {
            md5,
            transactionRef: ref,
            source: 'bakong_api',
            transaction: payload.data,
            recordedAtMs: Date.now(),
          });
          res.json({
            ok: true,
            configured: true,
            paid: true,
            matchedMd5: md5,
            md5,
            source: 'bakong_api',
            responseCode: payload.responseCode,
            responseMessage: payload.responseMessage || '',
            transactionRef: ref,
            transaction: payload.data,
            message: 'Bakong KHQR payment verified via Bakong API.',
          });
          return;
        }
      }

      res.json({
        ok: true,
        configured: true,
        paid: false,
        pending: true,
        checkedCount: md5List.length,
        source: 'bakong_api',
        responseCode: lastResponseCode,
        responseMessage: lastMessage,
        transaction: null,
        message: lastMessage,
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        configured: true,
        paid: false,
        error: err instanceof Error ? err.message : 'Failed to reach Bakong Open API.',
      });
    }
  };

  router.post('/bakong/check-transaction', (req: Request, res: Response) => {
    void handleCheckBakongTransaction(req, res);
  });

  router.post('/bakong/check-md5', (req: Request, res: Response) => {
    void handleCheckBakongTransaction(req, res);
  });

  router.post('/bakong/verify-account', async (req: Request, res: Response) => {
    const accountId = typeof req.body?.accountId === 'string' ? req.body.accountId.trim() : '';
    if (!accountId || !isValidBakongAccountId(accountId)) {
      res.status(400).json({
        valid: false,
        configured: Boolean(bakongToken),
        message: 'Expected a valid Bakong Account ID (e.g. myshop@abaa).',
      });
      return;
    }

    if (!bakongToken) {
      res.json({
        valid: true,
        configured: false,
        message: `Format verified for ${accountId} (sandbox mode; set BAKONG_API_TOKEN for live NBC check).`,
      });
      return;
    }

    try {
      const upstream = await fetch(`${bakongBaseUrl}/v1/check_bakong_account`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bakongToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountId }),
      });
      const payload = (await upstream.json().catch(() => ({}))) as {
        responseCode?: number;
        responseMessage?: string;
      };
      const valid = payload.responseCode === 0;
      res.json({
        valid,
        configured: true,
        message:
          payload.responseMessage ||
          (valid ? `Verified Bakong account ${accountId}.` : 'Bakong account not found.'),
      });
    } catch (err) {
      res.status(502).json({
        valid: false,
        configured: true,
        error: err instanceof Error ? err.message : 'Unable to reach Bakong verification endpoint.',
      });
    }
  });

  router.get('/bakong/status', (_req: Request, res: Response) => {
    res.json({
      configured: Boolean(bakongToken),
      baseUrl: bakongBaseUrl,
      callbackListenerActive: true,
      confirmedCallbacksCached: confirmedKhqrCallbacks.size,
    });
  });

  // ---------------------------------------------------------------------------
  // Gemini AI Menu Photo Extractor, Owner Assistant & 7-Day Revenue Forecast
  // ---------------------------------------------------------------------------
  const GEMINI_MODEL = 'gemini-4-hydrogen';
  const forecastResponseCache = new Map<
    string,
    { forecast: ReturnType<typeof normalizeAiForecastReport>; cachedAtMs: number }
  >();
  const inFlightForecasts = new Map<
    string,
    Promise<ReturnType<typeof normalizeAiForecastReport>>
  >();
  const FORECAST_CACHE_TTL_MS = 15 * 60 * 1000;
  const stockMonitorResponseCache = new Map<
    string,
    { report: ReturnType<typeof normalizeAiStockMonitorReport>; cachedAtMs: number }
  >();
  const inFlightStockMonitors = new Map<
    string,
    Promise<ReturnType<typeof normalizeAiStockMonitorReport>>
  >();
  const pairingsResponseCache = new Map<
    string,
    { report: ReturnType<typeof normalizeAiPairingsReport>; cachedAtMs: number }
  >();
  const inFlightPairings = new Map<
    string,
    Promise<ReturnType<typeof normalizeAiPairingsReport>>
  >();
  const shiftOptResponseCache = new Map<
    string,
    { optimization: ReturnType<typeof normalizeAiShiftOptimizationReport>; cachedAtMs: number }
  >();
  const inFlightShiftOpts = new Map<
    string,
    Promise<ReturnType<typeof normalizeAiShiftOptimizationReport>>
  >();

  const createGeminiClient = (apiKey: string) =>
    new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

  const unwrapGeminiMessage = (rawMsg: string): string => {
    const trimmed = rawMsg.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as {
          error?: { message?: string; status?: string; code?: number };
          message?: string;
        };
        const nested = parsed?.error?.message || parsed?.message;
        if (typeof nested === 'string' && nested.trim()) {
          return nested.trim();
        }
      } catch {
        // Ignore parse failure and fall back to rawMsg
      }
    }
    return trimmed;
  };

  const parseGeminiError = (err: unknown): { status: number; message: string; retryable: boolean } => {
    const rawMsg = err instanceof Error ? err.message : String(err || 'Gemini request failed.');
    const cleanMsg = unwrapGeminiMessage(rawMsg);
    const lower = cleanMsg.toLowerCase();
    const numericStatus =
      typeof (err as { status?: unknown })?.status === 'number'
        ? (err as { status: number }).status
        : undefined;

    if (
      numericStatus === 403 ||
      lower.includes('permission_denied') ||
      lower.includes('api_key_invalid') ||
      lower.includes('api key not valid')
    ) {
      return {
        status: numericStatus === 400 ? 400 : 403,
        message: 'Gemini API key is invalid or unauthorized. Please check GEMINI_API_KEY in Settings > Secrets.',
        retryable: false,
      };
    }

    if (numericStatus === 429 || lower.includes('resource_exhausted') || lower.includes('429')) {
      return {
        status: 429,
        message: 'Gemini rate limit reached (429). Please wait a moment and try refreshing the forecast.',
        retryable: true,
      };
    }

    if (numericStatus === 404 || lower.includes('not_found')) {
      return {
        status: 404,
        message: 'Configured Gemini model was not found.',
        retryable: false,
      };
    }

    if (
      numericStatus === 503 ||
      lower.includes('503') ||
      lower.includes('unavailable') ||
      lower.includes('high demand')
    ) {
      return {
        status: 503,
        message: 'Gemini is temporarily experiencing high demand (503). Please click Retry Forecast in a moment.',
        retryable: true,
      };
    }

    const retryable =
      numericStatus === 500 ||
      numericStatus === 502 ||
      lower.includes('timeout') ||
      lower.includes('network') ||
      lower.includes('fetch failed');

    return {
      status: numericStatus && numericStatus >= 400 ? numericStatus : 502,
      message: cleanMsg || 'Gemini service request failed.',
      retryable,
    };
  };

  const withGeminiRetry = async <T>(fn: () => Promise<T>, maxRetries = 0): Promise<T> => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const parsed = parseGeminiError(err);
        if (!parsed.retryable || attempt === maxRetries) {
          throw err;
        }
        const delayMs = 400 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastErr;
  };

  router.post('/ai/forecast', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Partial<AiForecastRequestPayload> & {
      forceRefresh?: boolean;
    };
    const branchId = typeof body.branchId === 'string' ? body.branchId.trim() : 'default';
    const branchName = typeof body.branchName === 'string' ? body.branchName.trim() : 'Main Branch';
    const exchangeRate =
      typeof body.exchangeRate === 'number' && body.exchangeRate > 0 ? body.exchangeRate : 4100;
    const rielRounding =
      typeof body.rielRounding === 'number' && body.rielRounding > 0 ? body.rielRounding : 100;
    const historicalDays = Array.isArray(body.historicalDays) ? body.historicalDays : [];
    const upcomingDates =
      Array.isArray(body.upcomingDates) && body.upcomingDates.length === 7
        ? body.upcomingDates
        : buildUpcomingForecastDates(
            typeof body.referenceDate === 'string' ? body.referenceDate : undefined,
            7
          );
    const prior7DayTotalUsd =
      typeof body.prior7DayTotalUsd === 'number' && Number.isFinite(body.prior7DayTotalUsd)
        ? body.prior7DayTotalUsd
        : historicalDays.slice(-7).reduce((s, d) => s + (Number(d.netSalesUsd) || 0), 0);
    const forceRefresh = Boolean(body.forceRefresh);

    if (!geminiApiKey) {
      res.status(503).json({
        ok: false,
        configured: false,
        error:
          'Gemini API key is not configured. Open Settings > Secrets to provide GEMINI_API_KEY.',
      });
      return;
    }

    if (historicalDays.length === 0 && (Number(body.todayCollectedUsd) || 0) <= 0) {
      res.status(400).json({
        ok: false,
        configured: true,
        error: 'At least one day of historical or today sales data is required to generate a forecast.',
      });
      return;
    }

    const cacheKey = [
      branchId,
      body.referenceDate || '',
      Number(body.todayCollectedUsd || 0).toFixed(2),
      Number(body.todayPaidBills || 0),
      historicalDays.map((d) => `${d.date}:${Number(d.netSalesUsd || 0).toFixed(2)}`).join('|'),
    ].join('::');

    if (!forceRefresh) {
      const cached = forecastResponseCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAtMs < FORECAST_CACHE_TTL_MS) {
        res.json({
          ok: true,
          configured: true,
          cached: true,
          model: GEMINI_MODEL,
          forecast: cached.forecast,
        });
        return;
      }
    }

    try {
      let pending = !forceRefresh ? inFlightForecasts.get(cacheKey) : undefined;
      if (!pending) {
        pending = (async () => {
          const ai = createGeminiClient(geminiApiKey);
          const promptPayload = {
            branchName,
            referenceDate: body.referenceDate || new Date().toISOString().slice(0, 10),
            exchangeRateKhrPerUsd: exchangeRate,
            prior7DayTotalUsd,
            prior7DayAvgUsd: body.prior7DayAvgUsd ?? 0,
            todayLiveStats: {
              collectedUsd: body.todayCollectedUsd ?? 0,
              paidBills: body.todayPaidBills ?? 0,
              avgBillUsd: body.avgBillUsd ?? 0,
            },
            historicalDailyRevenue: historicalDays,
            topItems: Array.isArray(body.topItems) ? body.topItems : [],
            categoryBreakdown: Array.isArray(body.categoryBreakdown) ? body.categoryBreakdown : [],
            targetForecastDates: upcomingDates,
          };

          const callForecastModel = (modelName: string, timeoutMs: number) =>
            ai.models.generateContent({
              model: modelName,
              contents: [
                'Analyze the historical daily sales, today live POS totals, category mix, and top-selling items below to produce a realistic 7-day revenue prediction in USD for each exact date in targetForecastDates.',
                'Account for weekday vs weekend patterns evident in historicalDailyRevenue and keep numbers grounded in the store run-rate.',
                '',
                JSON.stringify(promptPayload),
              ].join('\n'),
              config: {
                abortSignal: AbortSignal.timeout(timeoutMs),
                systemInstruction:
                  'You are a senior financial forecasting analyst for a Cambodian POS business. Return crisp, practical insights and calibrated USD revenue projections anchored strictly to the provided historical data and targetForecastDates.',
                ...(modelName === GEMINI_MODEL
                  ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                  : {}),
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    summary: {
                      type: Type.STRING,
                      description: '2-sentence executive summary of the 7-day outlook with USD figures.',
                    },
                    trendDirection: {
                      type: Type.STRING,
                      description: 'One of: up, flat, or down relative to prior 7 days.',
                    },
                    keyDrivers: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: '2 to 3 concise drivers observed in the sales history.',
                    },
                    recommendations: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: '2 to 3 actionable staffing, inventory, or promo recommendations.',
                    },
                    days: {
                      type: Type.ARRAY,
                      description: 'Exactly 7 daily forecast entries matching targetForecastDates in order.',
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          date: { type: Type.STRING, description: 'YYYY-MM-DD date from targetForecastDates' },
                          dayLabel: { type: Type.STRING, description: 'Short weekday e.g. Mon, Tue' },
                          predictedRevenueUsd: { type: Type.NUMBER },
                          lowUsd: { type: Type.NUMBER, description: 'Conservative lower bound in USD' },
                          highUsd: { type: Type.NUMBER, description: 'Optimistic upper bound in USD' },
                          confidencePct: { type: Type.NUMBER, description: 'Confidence 0 to 100' },
                          driverNote: { type: Type.STRING, description: 'Short 3-8 word explanation for that day' },
                        },
                        required: [
                          'date',
                          'dayLabel',
                          'predictedRevenueUsd',
                          'lowUsd',
                          'highUsd',
                          'confidencePct',
                          'driverNote',
                        ],
                      },
                    },
                  },
                  required: ['summary', 'trendDirection', 'keyDrivers', 'recommendations', 'days'],
                },
              },
            });

          let usedModel = GEMINI_MODEL;
          let response;
          try {
            response = await withGeminiRetry(() => callForecastModel(GEMINI_MODEL, 12000));
          } catch (primaryErr) {
            const parsedPrimary = parseGeminiError(primaryErr);
            const errName = (primaryErr as { name?: string })?.name || '';
            const isTransientCapacityOrTimeout =
              parsedPrimary.status === 503 ||
              errName === 'TimeoutError' ||
              errName === 'AbortError' ||
              parsedPrimary.message.toLowerCase().includes('timeout') ||
              parsedPrimary.message.toLowerCase().includes('abort');
            if (!isTransientCapacityOrTimeout) {
              throw primaryErr;
            }
            usedModel = 'gemini-3.1-flash-lite';
            response = await callForecastModel(usedModel, 18000);
          }

          const rawText = (response.text ?? '').trim();
          if (!rawText) {
            throw new Error('Gemini returned an empty forecast response. Please retry.');
          }

          let parsedRaw: RawGeminiForecastPayload;
          try {
            parsedRaw = JSON.parse(rawText) as RawGeminiForecastPayload;
          } catch {
            throw new Error('Unable to parse structured forecast JSON from Gemini response.');
          }

          const normalized = normalizeAiForecastReport(parsedRaw, {
            model: usedModel,
            generatedAt: new Date().toISOString(),
            exchangeRate,
            rielRounding,
            prior7DayTotalUsd,
            upcomingDates,
          });
          forecastResponseCache.set(cacheKey, {
            forecast: normalized,
            cachedAtMs: Date.now(),
          });
          return normalized;
        })().finally(() => {
          inFlightForecasts.delete(cacheKey);
        });

        inFlightForecasts.set(cacheKey, pending);
      }

      const forecast = await pending;
      res.json({
        ok: true,
        configured: true,
        model: GEMINI_MODEL,
        forecast,
      });
    } catch (err) {
      const parsedErr = parseGeminiError(err);
      res.status(parsedErr.status).json({
        ok: false,
        configured: true,
        error: parsedErr.message,
      });
    }
  });

  router.post('/ai/stock-monitor', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Partial<AiStockMonitorRequestPayload> & {
      forceRefresh?: boolean;
    };
    const branchId = typeof body.branchId === 'string' ? body.branchId.trim() : 'default';
    const branchName = typeof body.branchName === 'string' ? body.branchName.trim() : 'Main Branch';
    const referenceDate =
      typeof body.referenceDate === 'string' && body.referenceDate.trim()
        ? body.referenceDate.trim().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    const alertThresholdDays =
      typeof body.alertThresholdDays === 'number' && body.alertThresholdDays > 0
        ? Math.min(14, Math.max(1, Math.round(body.alertThresholdDays)))
        : 5;
    const ingredients = Array.isArray(body.ingredients) ? body.ingredients : [];
    const historicalDays = Array.isArray(body.historicalDays) ? body.historicalDays : [];
    const forceRefresh = Boolean(body.forceRefresh);

    if (!geminiApiKey) {
      res.status(503).json({
        ok: false,
        configured: false,
        error:
          'Gemini API key is not configured. Open Settings > Secrets to provide GEMINI_API_KEY.',
      });
      return;
    }

    if (ingredients.length === 0) {
      res.status(400).json({
        ok: false,
        configured: true,
        error: 'At least one tracked branch ingredient is required for AI Stock Monitor analysis.',
      });
      return;
    }

    const normalizedPayload: AiStockMonitorRequestPayload = {
      branchId,
      branchName,
      referenceDate,
      alertThresholdDays,
      recentPaidBills: Number(body.recentPaidBills || 0),
      prior7DaySalesUsd: Number(body.prior7DaySalesUsd || 0),
      avgDailySalesUsd: Number(body.avgDailySalesUsd || 0),
      historicalDays,
      ingredients,
    };

    const cacheKey = [
      branchId,
      referenceDate,
      String(alertThresholdDays),
      String(normalizedPayload.recentPaidBills),
      ingredients
        .map(
          (i) =>
            `${i.ingredientId}:${Number(i.onHand || 0).toFixed(1)}:${Number(i.minLevel || 0)}:${Number(i.observedUsed7d || 0).toFixed(1)}`
        )
        .sort()
        .join('|'),
    ].join('::');

    if (!forceRefresh) {
      const cached = stockMonitorResponseCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAtMs < FORECAST_CACHE_TTL_MS) {
        res.json({
          ok: true,
          configured: true,
          cached: true,
          model: cached.report.model,
          report: cached.report,
        });
        return;
      }
    }

    try {
      let pending = !forceRefresh ? inFlightStockMonitors.get(cacheKey) : undefined;
      if (!pending) {
        pending = (async () => {
          const ai = createGeminiClient(geminiApiKey);
          const promptPayload = {
            branchName,
            referenceDate,
            alertThresholdDays,
            recentPaidBills: normalizedPayload.recentPaidBills,
            prior7DaySalesUsd: normalizedPayload.prior7DaySalesUsd,
            avgDailySalesUsd: normalizedPayload.avgDailySalesUsd,
            historicalDays,
            ingredients: ingredients.map((i) => ({
              ingredientId: i.ingredientId,
              ingredientName: i.ingredientName,
              unit: i.unit,
              purchaseUnit: i.purchaseUnit,
              purchaseUnitSize: i.purchaseUnitSize,
              onHand: i.onHand,
              minLevel: i.minLevel,
              observedUsed7d: i.observedUsed7d,
              recentOrderUsage: i.recentOrderUsage,
              baselineDailyBurn: i.baselineDailyBurn,
              baselineDaysRemaining: i.baselineDaysRemaining,
              linkedDishNames: i.linkedDishNames,
            })),
          };

          const callStockMonitorModel = (modelName: string, timeoutMs: number) =>
            ai.models.generateContent({
              model: modelName,
              contents: [
                'Analyze the branch historical sales trend, order consumption, and current ingredient balances below to predict daily usage burn rate, estimated days remaining until stockout, practical reorder quantities, and concise staff alert messages for each ingredientId.',
                'Anchor dailyBurnRate closely to observedUsed7d / 7 adjusted modestly for recent sales velocity and linked dish demand.',
                '',
                JSON.stringify(promptPayload),
              ].join('\n'),
              config: {
                abortSignal: AbortSignal.timeout(timeoutMs),
                systemInstruction:
                  'You are an AI inventory and supply-chain operations analyst for a Cambodian café and restaurant POS. Return accurate, practical ingredient depletion forecasts and clear staff low-stock notifications.',
                ...(modelName === GEMINI_MODEL
                  ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                  : {}),
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    summary: {
                      type: Type.STRING,
                      description:
                        '2-sentence operational summary highlighting urgent stockout risks and procurement priorities.',
                    },
                    recommendedActions: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: '2 to 4 concise, actionable restock or prep steps for staff.',
                    },
                    predictions: {
                      type: Type.ARRAY,
                      description: 'One prediction entry per input ingredientId.',
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          ingredientId: { type: Type.STRING },
                          dailyBurnRate: {
                            type: Type.NUMBER,
                            description: 'Predicted daily consumption in base unit.',
                          },
                          estimatedDaysRemaining: {
                            type: Type.NUMBER,
                            description: 'Estimated days until onHand hits zero.',
                          },
                          suggestedReorderQty: {
                            type: Type.NUMBER,
                            description:
                              'Recommended purchase quantity in base unit (0 if healthy).',
                          },
                          rationale: {
                            type: Type.STRING,
                            description: 'Brief explanation citing sales velocity or linked dishes.',
                          },
                          staffAlertMessage: {
                            type: Type.STRING,
                            description:
                              'Concise staff notification alert specifying days left and reorder action.',
                          },
                        },
                        required: [
                          'ingredientId',
                          'dailyBurnRate',
                          'estimatedDaysRemaining',
                          'suggestedReorderQty',
                          'rationale',
                          'staffAlertMessage',
                        ],
                      },
                    },
                  },
                  required: ['summary', 'recommendedActions', 'predictions'],
                },
              },
            });

          let usedModel = GEMINI_MODEL;
          let response;
          try {
            response = await withGeminiRetry(() => callStockMonitorModel(GEMINI_MODEL, 12000));
          } catch (primaryErr) {
            const parsedPrimary = parseGeminiError(primaryErr);
            const errName = (primaryErr as { name?: string })?.name || '';
            const isTransientCapacityOrTimeout =
              parsedPrimary.status === 503 ||
              errName === 'TimeoutError' ||
              errName === 'AbortError' ||
              parsedPrimary.message.toLowerCase().includes('timeout') ||
              parsedPrimary.message.toLowerCase().includes('abort');
            if (!isTransientCapacityOrTimeout) {
              throw primaryErr;
            }
            usedModel = 'gemini-3.1-flash-lite';
            response = await callStockMonitorModel(usedModel, 18000);
          }

          const rawText = (response.text ?? '').trim();
          if (!rawText) {
            throw new Error('Gemini returned an empty stock monitor response. Please retry.');
          }

          let parsedRaw: RawGeminiStockMonitorPayload;
          try {
            parsedRaw = JSON.parse(rawText) as RawGeminiStockMonitorPayload;
          } catch {
            throw new Error('Unable to parse structured stock monitor JSON from Gemini response.');
          }

          const normalized = normalizeAiStockMonitorReport(parsedRaw, {
            model: usedModel,
            generatedAt: new Date().toISOString(),
            payload: normalizedPayload,
          });
          stockMonitorResponseCache.set(cacheKey, {
            report: normalized,
            cachedAtMs: Date.now(),
          });
          return normalized;
        })().finally(() => {
          inFlightStockMonitors.delete(cacheKey);
        });

        inFlightStockMonitors.set(cacheKey, pending);
      }

      const report = await pending;
      res.json({
        ok: true,
        configured: true,
        model: report.model,
        report,
      });
    } catch (err) {
      const parsedErr = parseGeminiError(err);
      res.status(parsedErr.status).json({
        ok: false,
        configured: true,
        error: parsedErr.message,
      });
    }
  });

  router.post('/ai/pairings', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Partial<AiPairingsRequestPayload> & {
      forceRefresh?: boolean;
    };
    const branchId = typeof body.branchId === 'string' ? body.branchId.trim() : 'default';
    const branchName = typeof body.branchName === 'string' ? body.branchName.trim() : 'Main Branch';
    const exchangeRate =
      typeof body.exchangeRate === 'number' && body.exchangeRate > 0 ? body.exchangeRate : 4100;
    const rielRounding =
      typeof body.rielRounding === 'number' && body.rielRounding > 0 ? body.rielRounding : 100;
    const historicalOrdersAnalyzed = Math.max(0, Number(body.historicalOrdersAnalyzed || 0));
    const cartItems = Array.isArray(body.cartItems) ? body.cartItems : [];
    const candidates = Array.isArray(body.candidates) ? body.candidates : [];
    const forceRefresh = Boolean(body.forceRefresh);

    if (!geminiApiKey) {
      res.status(503).json({
        ok: false,
        configured: false,
        error:
          'Gemini API key is not configured. Open Settings > Secrets to provide GEMINI_API_KEY.',
      });
      return;
    }

    if (cartItems.length === 0) {
      res.status(400).json({
        ok: false,
        configured: true,
        error: 'At least one item in the active cart is required to suggest pairings.',
      });
      return;
    }

    const normalizedPayload: AiPairingsRequestPayload = {
      branchId,
      branchName,
      exchangeRate,
      rielRounding,
      historicalOrdersAnalyzed,
      cartItems,
      candidates,
    };

    if (candidates.length === 0) {
      res.json({
        ok: true,
        configured: true,
        model: GEMINI_MODEL,
        report: normalizeAiPairingsReport(
          { summary: 'All active menu items are already on this ticket.', pairings: [] },
          { model: GEMINI_MODEL, generatedAt: new Date().toISOString(), payload: normalizedPayload }
        ),
      });
      return;
    }

    const cacheKey = [
      branchId,
      String(historicalOrdersAnalyzed),
      cartItems
        .map((c) => c.menuItemId)
        .sort()
        .join(','),
    ].join('::');

    if (!forceRefresh) {
      const cached = pairingsResponseCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAtMs < FORECAST_CACHE_TTL_MS) {
        res.json({
          ok: true,
          configured: true,
          cached: true,
          model: cached.report.model,
          report: cached.report,
        });
        return;
      }
    }

    try {
      let pending = !forceRefresh ? inFlightPairings.get(cacheKey) : undefined;
      if (!pending) {
        pending = (async () => {
          const ai = createGeminiClient(geminiApiKey);
          const promptPayload = {
            branchName,
            historicalOrdersAnalyzed,
            currentCart: cartItems.map((c) => ({
              menuItemId: c.menuItemId,
              nameEn: c.nameEn,
              category: c.category,
              station: c.station,
              qty: c.qty,
              unitPriceUsd: c.unitPriceUsd,
            })),
            candidateAddOns: candidates.map((c) => ({
              menuItemId: c.menuItemId,
              nameEn: c.nameEn,
              category: c.category,
              station: c.station,
              priceUsd: c.priceUsd,
              isBestSeller: c.isBestSeller,
              isCatalogPairing: c.isCatalogPairing,
              coOrderCount: c.coOrderCount,
              coOrderConfidencePct: c.coOrderConfidencePct,
              totalHistoricalOrders: c.totalHistoricalOrders,
              totalHistoricalUnits: c.totalHistoricalUnits,
            })),
          };

          const callPairingsModel = (modelName: string, timeoutMs: number) =>
            ai.models.generateContent({
              model: modelName,
              contents: [
                'Recommend the top 3 high-conversion add-ons or upsells from candidateAddOns to pair with currentCart.',
                'Prioritize items with strong historical coOrderCount, isCatalogPairing, totalHistoricalOrders popularity, and natural meal/drink complementarity (e.g. pairing iced coffee, starters, or dessert with main dishes).',
                'Only return menuItemId values that exist verbatim in candidateAddOns and never suggest items already in currentCart.',
                '',
                JSON.stringify(promptPayload),
              ].join('\n'),
              config: {
                abortSignal: AbortSignal.timeout(timeoutMs),
                systemInstruction:
                  'You are a hospitality upsell strategist for a Cambodian café and restaurant POS. Recommend 2 to 3 concise, relevant add-on pairings grounded strictly in historical order patterns and candidateAddOns.',
                ...(modelName === GEMINI_MODEL
                  ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                  : {}),
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    summary: {
                      type: Type.STRING,
                      description: '1 concise sentence summarizing the upsell theme for this cart.',
                    },
                    pairings: {
                      type: Type.ARRAY,
                      description: 'Up to 3 ranked pairing recommendations from candidateAddOns.',
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          menuItemId: {
                            type: Type.STRING,
                            description: 'Exact menuItemId from candidateAddOns.',
                          },
                          tag: {
                            type: Type.STRING,
                            description:
                              'Short 2-3 word label e.g. Frequent pairing, Drink pairing, Popular add-on, Dessert upsell.',
                          },
                          reason: {
                            type: Type.STRING,
                            description:
                              'Concise 6-14 word reason referencing historical order patterns or flavor complementarity.',
                          },
                          confidencePct: {
                            type: Type.NUMBER,
                            description: 'Recommendation confidence between 50 and 99.',
                          },
                        },
                        required: ['menuItemId', 'tag', 'reason', 'confidencePct'],
                      },
                    },
                  },
                  required: ['summary', 'pairings'],
                },
              },
            });

          let usedModel = GEMINI_MODEL;
          let response;
          try {
            response = await withGeminiRetry(() => callPairingsModel(GEMINI_MODEL, 10000));
          } catch (primaryErr) {
            const parsedPrimary = parseGeminiError(primaryErr);
            const errName = (primaryErr as { name?: string })?.name || '';
            const isTransientCapacityOrTimeout =
              parsedPrimary.status === 503 ||
              errName === 'TimeoutError' ||
              errName === 'AbortError' ||
              parsedPrimary.message.toLowerCase().includes('timeout') ||
              parsedPrimary.message.toLowerCase().includes('abort');
            if (!isTransientCapacityOrTimeout) {
              throw primaryErr;
            }
            usedModel = 'gemini-3.1-flash-lite';
            response = await callPairingsModel(usedModel, 15000);
          }

          const rawText = (response.text ?? '').trim();
          if (!rawText) {
            throw new Error('Gemini returned an empty pairings response. Please retry.');
          }

          let parsedRaw: RawGeminiPairingsPayload;
          try {
            parsedRaw = JSON.parse(rawText) as RawGeminiPairingsPayload;
          } catch {
            throw new Error('Unable to parse structured pairings JSON from Gemini response.');
          }

          const normalized = normalizeAiPairingsReport(parsedRaw, {
            model: usedModel,
            generatedAt: new Date().toISOString(),
            payload: normalizedPayload,
          });
          pairingsResponseCache.set(cacheKey, {
            report: normalized,
            cachedAtMs: Date.now(),
          });
          return normalized;
        })().finally(() => {
          inFlightPairings.delete(cacheKey);
        });

        inFlightPairings.set(cacheKey, pending);
      }

      const report = await pending;
      res.json({
        ok: true,
        configured: true,
        model: report.model,
        report,
      });
    } catch (err) {
      const parsedErr = parseGeminiError(err);
      res.status(parsedErr.status).json({
        ok: false,
        configured: true,
        error: parsedErr.message,
      });
    }
  });

  router.post('/ai/extract-menu', async (req: Request, res: Response) => {
    const { imageBase64, mimeType } = req.body ?? {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({ error: 'imageBase64 is required.' });
      return;
    }
    if (!geminiApiKey) {
      res.status(503).json({
        configured: false,
        items: [],
        error: 'Gemini API key is not configured in Settings > Secrets.',
      });
      return;
    }

    try {
      const ai = createGeminiClient(geminiApiKey);
      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: typeof mimeType === 'string' ? mimeType : 'image/jpeg',
                    data: imageBase64,
                  },
                },
                {
                  text: 'Extract menu items from this Cambodian restaurant or retail menu photo. Return JSON array with nameEn, nameKh, category, priceUsd (number), station ("kitchen" for food or "bar" for drinks), and itemType ("product" or "service").',
                },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  nameEn: { type: Type.STRING },
                  nameKh: { type: Type.STRING },
                  category: { type: Type.STRING },
                  priceUsd: { type: Type.NUMBER },
                  station: { type: Type.STRING },
                  itemType: { type: Type.STRING },
                },
                required: ['nameEn', 'category', 'priceUsd'],
              },
            },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? '[]').trim());
      res.json({ configured: true, items: Array.isArray(parsed) ? parsed : [] });
    } catch (err) {
      const parsedErr = parseGeminiError(err);
      res.status(parsedErr.status).json({
        configured: true,
        items: [],
        error: parsedErr.message,
      });
    }
  });

  router.post('/ai/ask-owner', async (req: Request, res: Response) => {
    const { question, contextSummary } = req.body ?? {};
    if (!question || typeof question !== 'string') {
      res.status(400).json({ error: 'question is required.' });
      return;
    }
    if (!geminiApiKey) {
      res.status(503).json({
        configured: false,
        answer: '',
        error: 'Gemini API key is not configured in Settings > Secrets.',
      });
      return;
    }

    try {
      const ai = createGeminiClient(geminiApiKey);
      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: `You are an experienced Cambodian restaurant & retail POS business advisor. Use concise bullet points with exact USD and KHR numbers from the store data below.\n\nSTORE DATA:\n${JSON.stringify(contextSummary ?? {})}\n\nOWNER QUESTION:\n${question}`,
        })
      );
      res.json({
        configured: true,
        answer: (response.text ?? '').trim(),
      });
    } catch (err) {
      const parsedErr = parseGeminiError(err);
      res.status(parsedErr.status).json({
        configured: true,
        answer: '',
        error: parsedErr.message,
      });
    }
  });

  router.post('/ai/shift-optimization', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Partial<ShiftOptimizationRequestPayload> & {
      forceRefresh?: boolean;
    };

    if (!geminiApiKey) {
      res.status(503).json({
        ok: false,
        configured: false,
        error:
          'Gemini API key is not configured. Open Settings > Secrets to provide GEMINI_API_KEY.',
      });
      return;
    }

    const branchId = typeof body.branchId === 'string' ? body.branchId : 'branch_bkk1';
    const branchName = typeof body.branchName === 'string' ? body.branchName : 'Store Branch';
    const daypartTraffic = Array.isArray(body.daypartTraffic) ? body.daypartTraffic : [];
    const historicalDays = Array.isArray(body.historicalDays) ? body.historicalDays : [];
    const targetShifts = Array.isArray(body.targetShifts) ? body.targetShifts : [];

    if (targetShifts.length === 0) {
      res.status(400).json({
        ok: false,
        configured: true,
        error: 'targetShifts and sales history are required to optimize shift staffing.',
      });
      return;
    }

    const payload: ShiftOptimizationRequestPayload = {
      branchId,
      branchName,
      referenceDate:
        typeof body.referenceDate === 'string'
          ? body.referenceDate
          : new Date().toISOString().slice(0, 10),
      exchangeRate: typeof body.exchangeRate === 'number' ? body.exchangeRate : 4100,
      observedPeakWindow:
        typeof body.observedPeakWindow === 'string'
          ? body.observedPeakWindow
          : 'Lunch Rush (11:00 – 15:00)',
      avgDailyRevenueUsd: Number(body.avgDailyRevenueUsd) || 0,
      avgDailyOrders: Number(body.avgDailyOrders) || 0,
      weekendLiftPct: Number(body.weekendLiftPct) || 0,
      upcomingReservationsCount: Number(body.upcomingReservationsCount) || 0,
      closedShiftsSampled: Number(body.closedShiftsSampled) || 0,
      currentBranchStaffCount: Number(body.currentBranchStaffCount) || 1,
      currentRoleCounts: body.currentRoleCounts ?? {
        cashiers: 1,
        kitchen: 1,
        barOrFloor: 1,
        supervisor: 1,
      },
      daypartTraffic,
      historicalDays,
      targetShifts,
    };

    const forceRefresh = Boolean(body.forceRefresh);
    const cacheKey = [
      branchId,
      payload.referenceDate,
      payload.currentBranchStaffCount,
      payload.upcomingReservationsCount,
      daypartTraffic.map((d) => `${d.id}:${d.orderCount}`).join('|'),
      historicalDays.slice(-7).map((h) => `${h.date}:${h.netSalesUsd}`).join('|'),
    ].join('::');

    if (!forceRefresh) {
      const cached = shiftOptResponseCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAtMs < FORECAST_CACHE_TTL_MS) {
        res.json({
          ok: true,
          configured: true,
          cached: true,
          model: GEMINI_MODEL,
          optimization: cached.optimization,
        });
        return;
      }
    }

    try {
      let pending = !forceRefresh ? inFlightShiftOpts.get(cacheKey) : undefined;
      if (!pending) {
        pending = (async () => {
          const ai = createGeminiClient(geminiApiKey);
          const callShiftOptModel = (modelName: string, timeoutMs: number) =>
            ai.models.generateContent({
              model: modelName,
              contents: [
                'Analyze this store historical daily revenue, daypart order distribution, reservations, and current active roster to recommend ideal staffing headcounts and roles for each upcoming shift in targetShifts.',
                'Ensure recommendedTotalStaff equals cashiers + kitchen + barOrFloor + supervisor and explain how predicted traffic informs each shift.',
                '',
                JSON.stringify(payload),
              ].join('\n'),
              config: {
                abortSignal: AbortSignal.timeout(timeoutMs),
                systemInstruction:
                  'You are a senior hospitality & retail operations labor planner in Cambodia. Return calibrated, practical shift staffing plans strictly grounded in the store traffic history and targetShifts provided.',
                ...(modelName === GEMINI_MODEL
                  ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                  : {}),
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    summary: {
                      type: Type.STRING,
                      description: '2-sentence executive summary of peak traffic patterns and staffing plan.',
                    },
                    peakWindow: {
                      type: Type.STRING,
                      description: 'Predicted busiest shift window e.g. 11:30 – 14:30 Lunch Rush.',
                    },
                    trafficTrend: {
                      type: Type.STRING,
                      description: 'One of: growing, steady, or variable.',
                    },
                    shiftRecommendations: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          shiftName: { type: Type.STRING },
                          timeWindow: { type: Type.STRING },
                          dayLabel: { type: Type.STRING },
                          expectedTrafficLevel: {
                            type: Type.STRING,
                            description: 'One of: high, moderate, or low',
                          },
                          expectedOrders: { type: Type.NUMBER },
                          expectedRevenueUsd: { type: Type.NUMBER },
                          recommendedTotalStaff: { type: Type.NUMBER },
                          roleBreakdown: {
                            type: Type.OBJECT,
                            properties: {
                              cashiers: { type: Type.INTEGER },
                              kitchen: { type: Type.INTEGER },
                              barOrFloor: { type: Type.INTEGER },
                              supervisor: { type: Type.INTEGER },
                            },
                            required: ['cashiers', 'kitchen', 'barOrFloor', 'supervisor'],
                          },
                          rationale: { type: Type.STRING },
                        },
                        required: [
                          'shiftName',
                          'timeWindow',
                          'dayLabel',
                          'expectedTrafficLevel',
                          'expectedOrders',
                          'expectedRevenueUsd',
                          'recommendedTotalStaff',
                          'roleBreakdown',
                          'rationale',
                        ],
                      },
                    },
                    optimizationActions: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: '2 to 3 actionable shift scheduling tips.',
                    },
                  },
                  required: [
                    'summary',
                    'peakWindow',
                    'trafficTrend',
                    'shiftRecommendations',
                    'optimizationActions',
                  ],
                },
              },
            });

          let usedModel = GEMINI_MODEL;
          let response;
          try {
            response = await withGeminiRetry(() => callShiftOptModel(GEMINI_MODEL, 12000));
          } catch (primaryErr) {
            const parsedPrimary = parseGeminiError(primaryErr);
            const errName = (primaryErr as { name?: string })?.name || '';
            const isTransientCapacityOrTimeout =
              parsedPrimary.status === 503 ||
              errName === 'TimeoutError' ||
              errName === 'AbortError' ||
              parsedPrimary.message.toLowerCase().includes('timeout') ||
              parsedPrimary.message.toLowerCase().includes('abort');
            if (!isTransientCapacityOrTimeout) {
              throw primaryErr;
            }
            usedModel = 'gemini-3.1-flash-lite';
            response = await callShiftOptModel(usedModel, 18000);
          }

          const rawText = (response.text ?? '').trim();
          if (!rawText) {
            throw new Error('Gemini returned an empty shift optimization response.');
          }
          let parsedRaw: RawGeminiShiftOptimizationPayload;
          try {
            parsedRaw = JSON.parse(rawText) as RawGeminiShiftOptimizationPayload;
          } catch {
            throw new Error('Unable to parse structured shift optimization JSON from Gemini.');
          }

          const normalized = normalizeAiShiftOptimizationReport(parsedRaw, {
            model: usedModel,
            generatedAt: new Date().toISOString(),
            payload,
          });
          shiftOptResponseCache.set(cacheKey, {
            optimization: normalized,
            cachedAtMs: Date.now(),
          });
          return normalized;
        })().finally(() => {
          inFlightShiftOpts.delete(cacheKey);
        });

        inFlightShiftOpts.set(cacheKey, pending);
      }

      const optimization = await pending;
      res.json({
        ok: true,
        configured: true,
        model: optimization.model,
        optimization,
      });
    } catch (err) {
      const parsedErr = parseGeminiError(err);
      res.status(parsedErr.status).json({
        ok: false,
        configured: true,
        error: parsedErr.message,
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Telegram Bot Report & Alert Dispatch
  // ---------------------------------------------------------------------------
  router.post('/telegram/send', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      channel?: string;
      botHandle?: string;
      message?: string;
      branchName?: string;
      isTest?: boolean;
    };
    const channel = String(body.channel || '').trim();
    const botHandle = String(body.botHandle || '').trim();
    const message = String(body.message || '').trim();

    if (!channel) {
      res.status(400).json({
        ok: false,
        error: 'Target Telegram channel or group chat ID (e.g. @lotuscafebkk1 or -100...) is required.',
      });
      return;
    }
    if (!message) {
      res.status(400).json({
        ok: false,
        error: 'Message payload cannot be empty.',
      });
      return;
    }

    if (!telegramBotToken) {
      res.json({
        ok: true,
        deliveredViaTelegramApi: false,
        channel,
        botHandle: botHandle || '@StorePosBot',
        dispatchedAt: new Date().toISOString(),
        notice:
          'TELEGRAM_BOT_TOKEN is not set in server Secrets — validated payload & queued local preview dispatch.',
      });
      return;
    }

    try {
      const tgRes = await fetch(
        `https://api.telegram.org/bot${encodeURIComponent(telegramBotToken)}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: channel,
            text: message,
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(10000),
        }
      );
      const tgData = (await tgRes.json().catch(() => ({}))) as {
        ok?: boolean;
        description?: string;
        result?: { message_id?: number };
      };
      if (!tgRes.ok || !tgData.ok) {
        res.status(502).json({
          ok: false,
          deliveredViaTelegramApi: false,
          error: tgData.description || `Telegram Bot API returned HTTP ${tgRes.status}.`,
        });
        return;
      }
      res.json({
        ok: true,
        deliveredViaTelegramApi: true,
        channel,
        botHandle: botHandle || '@StorePosBot',
        messageId: tgData.result?.message_id ?? null,
        dispatchedAt: new Date().toISOString(),
        notice: `Delivered via Telegram Bot API to ${channel}.`,
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        deliveredViaTelegramApi: false,
        error: err instanceof Error ? err.message : 'Unable to reach Telegram Bot API.',
      });
    }
  });

  return router;
}
