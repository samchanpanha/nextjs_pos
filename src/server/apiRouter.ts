import { GoogleGenAI, Type } from '@google/genai';
import express, { type Request, type Response } from 'express';
import type { PosAppState } from '../types/pos';
import type { SubscriptionPlan } from '../utils/subscription';
import { generateUid } from './db/authSecurity';
import type { AuthenticatedContext, PosSqliteRepository } from './db/posRepository';
import { realtimeHub } from './realtimeHub';

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

      const saved = repo.saveTenantState(incoming, { auth });

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
  // Bakong NBC Live KHQR Verification
  // ---------------------------------------------------------------------------
  router.post('/bakong/check-md5', async (req: Request, res: Response) => {
    const md5 = typeof req.body?.md5 === 'string' ? req.body.md5.trim().toLowerCase() : '';
    if (!/^[a-f0-9]{32}$/.test(md5)) {
      res.status(400).json({
        configured: Boolean(bakongToken),
        paid: false,
        error: 'Invalid 32-character hex MD5 hash.',
      });
      return;
    }

    if (!bakongToken) {
      res.json({
        configured: false,
        paid: false,
        message: 'BAKONG_API_TOKEN is not configured; using instant confirmation mode.',
      });
      return;
    }

    try {
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

      const isPaid = payload.responseCode === 0 && Boolean(payload.data);
      res.json({
        configured: true,
        paid: isPaid,
        responseCode: payload.responseCode ?? null,
        responseMessage: payload.responseMessage || '',
        transaction: payload.data || null,
      });
    } catch (err) {
      res.status(502).json({
        configured: true,
        paid: false,
        error: err instanceof Error ? err.message : 'Failed to reach Bakong Open API.',
      });
    }
  });

  router.get('/bakong/status', (_req: Request, res: Response) => {
    res.json({
      configured: Boolean(bakongToken),
      baseUrl: bakongBaseUrl,
    });
  });

  // ---------------------------------------------------------------------------
  // Gemini AI Menu Photo Extractor & Owner Assistant
  // ---------------------------------------------------------------------------
  router.post('/ai/extract-menu', async (req: Request, res: Response) => {
    const { imageBase64, mimeType } = req.body ?? {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({ error: 'imageBase64 is required.' });
      return;
    }
    if (!geminiApiKey) {
      res.json({ configured: false, items: [] });
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
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
      });

      const parsed = JSON.parse(response.text || '[]');
      res.json({ configured: true, items: Array.isArray(parsed) ? parsed : [] });
    } catch (err) {
      res.status(500).json({
        configured: true,
        items: [],
        error: err instanceof Error ? err.message : 'Gemini menu extraction failed.',
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
      res.json({ configured: false, answer: '' });
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are an experienced Cambodian restaurant & retail POS business advisor. Use concise bullet points with exact USD and KHR numbers from the store data below.\n\nSTORE DATA:\n${JSON.stringify(contextSummary ?? {})}\n\nOWNER QUESTION:\n${question}`,
      });
      res.json({
        configured: true,
        answer: (response.text || '').trim(),
      });
    } catch (err) {
      res.status(500).json({
        configured: true,
        answer: '',
        error: err instanceof Error ? err.message : 'Gemini assistant query failed.',
      });
    }
  });

  return router;
}
