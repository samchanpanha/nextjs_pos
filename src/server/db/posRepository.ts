import fs from 'node:fs';
import { createSeedState } from '../../data/seedData';
import type {
  AuditLogEntry,
  BranchConfig,
  CustomerPack,
  DailyRevenuePoint,
  GroupOrderSession,
  Ingredient,
  JournalEntry,
  LedgerAccount,
  LoyaltyMember,
  MenuItem,
  OperatingExpense,
  Order,
  PlatformSettings,
  PosAppState,
  PosTable,
  PrepaidPackTemplate,
  Promotion,
  PurchaseOrder,
  QrIncomingOrder,
  RecipeLine,
  Reservation,
  SaasUser,
  ShiftRecord,
  SqliteEngineStats,
  StaffMember,
  StockMovement,
  Supplier,
  VatInvoice,
} from '../../types/pos';
import { createDefaultChartOfAccounts } from '../../utils/accountingEngine';
import {
  ALL_PERMISSIONS,
  DEFAULT_OWNER_TENANT_PERMISSIONS,
  normalizePermissions,
  type PermissionKey,
} from '../../utils/permissions';
import {
  calculateExtendedDays,
  computeSubscriptionAmountUsd,
  computeSubscriptionDays,
  type SubscriptionPlan,
} from '../../utils/subscription';
import {
  generateSessionToken,
  generateUid,
  hashPassword,
  verifyPassword,
} from './authSecurity';
import { runSqliteMigrations, TRACKED_SQLITE_TABLES } from './schema';
import type { SqliteConnection } from './sqliteDriver';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AuthenticatedContext {
  user: SaasUser | null;
  token?: string;
  isSuperAdmin: boolean;
}

export class SyncConflictError extends Error {
  readonly code = 'SYNC_CONFLICT' as const;
  readonly status = 409;
  readonly clientVersion: number;
  readonly serverVersion: number;
  readonly serverOrdersCount: number;

  constructor(params: {
    clientVersion: number;
    serverVersion: number;
    serverOrdersCount: number;
  }) {
    super(
      `Sync conflict: main server is at version v${params.serverVersion} while this terminal synced from v${params.clientVersion}.`
    );
    this.name = 'SyncConflictError';
    this.clientVersion = params.clientVersion;
    this.serverVersion = params.serverVersion;
    this.serverOrdersCount = params.serverOrdersCount;
  }
}

export class PosSqliteRepository {
  private conn: SqliteConnection;

  constructor(conn: SqliteConnection) {
    this.conn = conn;
    runSqliteMigrations(this.conn.db);
    this.ensureBootstrapData();
  }

  get db() {
    return this.conn.db;
  }

  private ensureBootstrapData(): void {
    const nowIso = new Date().toISOString();

    const platformRow = this.db
      .prepare('SELECT id FROM platform_settings WHERE id = ?')
      .get('global') as { id: string } | undefined;

    if (!platformRow) {
      this.db
        .prepare(
          `INSERT INTO platform_settings (id, demo_users_disabled, maintenance_banner, updated_at, updated_by)
           VALUES (?, 0, '', ?, 'System')`
        )
        .run('global', nowIso);
    }

    const adminRow = this.db
      .prepare('SELECT uid FROM saas_accounts WHERE email = ?')
      .get('admin@xaiwork.kh') as { uid: string } | undefined;

    if (!adminRow) {
      this.db
        .prepare(
          `INSERT INTO saas_accounts (uid, email, password_hash, display_name, role, email_verified, created_at, last_login_at)
           VALUES (?, ?, ?, ?, 'admin', 1, ?, ?)`
        )
        .run(
          'usr_super_admin',
          'admin@xaiwork.kh',
          hashPassword('admin1234'),
          'System Super Admin',
          nowIso,
          nowIso
        );
    }

    const demoOwnerRow = this.db
      .prepare('SELECT uid FROM saas_accounts WHERE email = ?')
      .get('owner@lotuscafe.kh') as { uid: string } | undefined;

    if (!demoOwnerRow) {
      this.db
        .prepare(
          `INSERT INTO saas_accounts (uid, email, password_hash, display_name, role, email_verified, created_at, last_login_at)
           VALUES (?, ?, ?, ?, 'owner', 1, ?, ?)`
        )
        .run(
          'usr_demo_owner',
          'owner@lotuscafe.kh',
          hashPassword('lotus1234'),
          'Channary (Lotus Owner)',
          nowIso,
          nowIso
        );
    }

    const existingDemoTenant = this.db
      .prepare('SELECT id FROM tenants WHERE id = ?')
      .get('tenant_lotus_bkk1') as { id: string } | undefined;

    if (!existingDemoTenant) {
      const demoSeed = createSeedState('restaurant');
      this.saveTenantState(
        {
          ...demoSeed,
          ownerUid: 'usr_demo_owner',
        },
        { bypassSecurityControls: true }
      );
    } else {
      const demoJournalCount =
        (
          this.db
            .prepare('SELECT COUNT(*) as c FROM journal_entries WHERE tenant_id = ?')
            .get('tenant_lotus_bkk1') as { c: number } | undefined
        )?.c ?? 0;

      if (demoJournalCount === 0) {
        const currentDemo = this.loadTenantState('tenant_lotus_bkk1');
        if (currentDemo) {
          const demoSeed = createSeedState('restaurant');
          const mergedOwnerPerms = Array.from(
            new Set([
              ...(currentDemo.ownerPermissions || []),
              ...(demoSeed.ownerPermissions || []),
            ])
          );
          this.saveTenantState(
            {
              ...currentDemo,
              ownerPermissions: mergedOwnerPerms,
              featureFlags: {
                ...demoSeed.featureFlags,
                ...(currentDemo.featureFlags || {}),
                purchase_orders: true,
                accounting: true,
              },
              suppliers:
                currentDemo.suppliers && currentDemo.suppliers.length > 0
                  ? currentDemo.suppliers
                  : demoSeed.suppliers,
              purchaseOrders:
                currentDemo.purchaseOrders && currentDemo.purchaseOrders.length > 0
                  ? currentDemo.purchaseOrders
                  : demoSeed.purchaseOrders,
              accounts:
                currentDemo.accounts && currentDemo.accounts.length > 0
                  ? currentDemo.accounts
                  : demoSeed.accounts,
              journalEntries: demoSeed.journalEntries,
              expenses:
                currentDemo.expenses && currentDemo.expenses.length > 0
                  ? currentDemo.expenses
                  : demoSeed.expenses,
              nextPoSeq: currentDemo.nextPoSeq || demoSeed.nextPoSeq,
              nextJournalSeq: currentDemo.nextJournalSeq || demoSeed.nextJournalSeq,
            },
            { bypassSecurityControls: true }
          );
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Platform Settings
  // ---------------------------------------------------------------------------
  getPlatformSettings(): PlatformSettings {
    const row = this.db
      .prepare(
        'SELECT demo_users_disabled, maintenance_banner, updated_at, updated_by FROM platform_settings WHERE id = ?'
      )
      .get('global') as
      | {
          demo_users_disabled: number;
          maintenance_banner: string;
          updated_at: string;
          updated_by: string;
        }
      | undefined;

    if (!row) {
      return { demoUsersDisabled: false };
    }
    return {
      demoUsersDisabled: Boolean(row.demo_users_disabled),
      maintenanceBanner: row.maintenance_banner || undefined,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  savePlatformSettings(patch: Partial<PlatformSettings>, actorName = 'Super Admin'): PlatformSettings {
    const current = this.getPlatformSettings();
    const updated: PlatformSettings = {
      demoUsersDisabled:
        patch.demoUsersDisabled !== undefined
          ? Boolean(patch.demoUsersDisabled)
          : current.demoUsersDisabled,
      maintenanceBanner:
        patch.maintenanceBanner !== undefined
          ? patch.maintenanceBanner
          : current.maintenanceBanner || '',
      updatedAt: new Date().toISOString(),
      updatedBy: actorName,
    };

    this.db
      .prepare(
        `INSERT INTO platform_settings (id, demo_users_disabled, maintenance_banner, updated_at, updated_by)
         VALUES ('global', ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           demo_users_disabled = excluded.demo_users_disabled,
           maintenance_banner = excluded.maintenance_banner,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`
      )
      .run(
        updated.demoUsersDisabled ? 1 : 0,
        updated.maintenanceBanner || '',
        updated.updatedAt!,
        updated.updatedBy!
      );

    return updated;
  }

  // ---------------------------------------------------------------------------
  // SaaS Accounts & Sessions (Self-Hosted SQLite Auth)
  // ---------------------------------------------------------------------------
  registerAccount(params: {
    email: string;
    password: string;
    displayName?: string;
  }): { user: SaasUser; token: string } {
    const email = params.email.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!params.password || params.password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    const exists = this.db
      .prepare('SELECT uid FROM saas_accounts WHERE email = ?')
      .get(email) as { uid: string } | undefined;

    if (exists) {
      throw new Error('An account with this email already exists. Please sign in.');
    }

    const nowIso = new Date().toISOString();
    const uid = generateUid('usr');
    const displayName =
      (params.displayName || '').trim() || email.split('@')[0] || 'Business Owner';

    const role: SaasUser['role'] = email === 'admin@xaiwork.kh' ? 'admin' : 'owner';

    this.db
      .prepare(
        `INSERT INTO saas_accounts (uid, email, password_hash, display_name, role, email_verified, created_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(uid, email, hashPassword(params.password), displayName, role, nowIso, nowIso);

    const user: SaasUser = {
      uid,
      email,
      displayName,
      role,
      emailVerified: true,
      createdAt: nowIso,
    };

    const token = this.createSession(uid);
    return { user, token };
  }

  loginAccount(params: {
    email: string;
    password: string;
  }): { user: SaasUser; token: string } {
    const email = params.email.trim().toLowerCase();
    const row = this.db
      .prepare(
        'SELECT uid, email, password_hash, display_name, role, email_verified, created_at FROM saas_accounts WHERE email = ?'
      )
      .get(email) as
      | {
          uid: string;
          email: string;
          password_hash: string;
          display_name: string;
          role: SaasUser['role'];
          email_verified: number;
          created_at: string;
        }
      | undefined;

    if (!row || !verifyPassword(params.password, row.password_hash)) {
      throw new Error('Invalid email or password.');
    }

    const nowIso = new Date().toISOString();
    this.db
      .prepare('UPDATE saas_accounts SET last_login_at = ? WHERE uid = ?')
      .run(nowIso, row.uid);

    const user: SaasUser = {
      uid: row.uid,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      emailVerified: Boolean(row.email_verified),
      createdAt: row.created_at,
    };

    const token = this.createSession(row.uid);
    return { user, token };
  }

  resetAccountPassword(params: { email: string; newPassword?: string }): {
    ok: boolean;
    message: string;
  } {
    const email = params.email.trim().toLowerCase();
    const row = this.db
      .prepare('SELECT uid FROM saas_accounts WHERE email = ?')
      .get(email) as { uid: string } | undefined;

    if (!row) {
      // Return generic success message to prevent user enumeration unless resetting directly
      return {
        ok: true,
        message: 'If this email is registered, password recovery has been processed.',
      };
    }

    if (params.newPassword && params.newPassword.length >= 6) {
      this.db
        .prepare('UPDATE saas_accounts SET password_hash = ? WHERE uid = ?')
        .run(hashPassword(params.newPassword), row.uid);
      return {
        ok: true,
        message: 'Password updated in SQLite! You can now sign in with your new password.',
      };
    }

    return {
      ok: true,
      message: 'Account verified in SQLite. Enter a new password (6+ chars) to reset immediately.',
    };
  }

  createSession(uid: string, activeTenantId?: string, activeStaffId?: string): string {
    const token = generateSessionToken();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const expiresIso = new Date(now + SESSION_DURATION_MS).toISOString();

    this.db
      .prepare(
        `INSERT INTO saas_sessions (token, uid, active_tenant_id, active_staff_id, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(token, uid, activeTenantId ?? null, activeStaffId ?? null, expiresIso, nowIso);

    return token;
  }

  revokeSession(token: string): void {
    this.db.prepare('DELETE FROM saas_sessions WHERE token = ?').run(token);
  }

  authenticateToken(token?: string | null): AuthenticatedContext {
    if (!token) {
      return { user: null, isSuperAdmin: false };
    }

    const row = this.db
      .prepare(
        `SELECT s.token, s.expires_at, a.uid, a.email, a.display_name, a.role, a.email_verified, a.created_at
         FROM saas_sessions s
         JOIN saas_accounts a ON a.uid = s.uid
         WHERE s.token = ?`
      )
      .get(token) as
      | {
          token: string;
          expires_at: string;
          uid: string;
          email: string;
          display_name: string;
          role: SaasUser['role'];
          email_verified: number;
          created_at: string;
        }
      | undefined;

    if (!row) {
      return { user: null, isSuperAdmin: false };
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      this.revokeSession(row.token);
      return { user: null, isSuperAdmin: false };
    }

    const user: SaasUser = {
      uid: row.uid,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      emailVerified: Boolean(row.email_verified),
      createdAt: row.created_at,
    };

    return {
      user,
      token: row.token,
      isSuperAdmin: user.role === 'admin',
    };
  }

  // ---------------------------------------------------------------------------
  // Tenant Access & Isolation Helpers
  // ---------------------------------------------------------------------------
  canAccessTenant(
    tenantId: string,
    auth: AuthenticatedContext,
    explicitBusinessCode?: string
  ): boolean {
    if (auth.isSuperAdmin) return true;

    const row = this.db
      .prepare('SELECT id, owner_uid, is_demo_tenant, business_code FROM tenants WHERE id = ?')
      .get(tenantId) as
      | {
          id: string;
          owner_uid: string | null;
          is_demo_tenant: number;
          business_code: string;
        }
      | undefined;

    if (!row) return false;

    const platform = this.getPlatformSettings();
    if (row.is_demo_tenant) {
      return !platform.demoUsersDisabled;
    }

    if (auth.user && row.owner_uid && row.owner_uid === auth.user.uid) {
      return true;
    }

    if (!row.owner_uid) {
      return true;
    }

    if (
      explicitBusinessCode &&
      explicitBusinessCode.trim().toUpperCase() === row.business_code.toUpperCase()
    ) {
      return true;
    }

    return false;
  }

  listAccessibleTenants(auth: AuthenticatedContext): PosAppState[] {
    const platform = this.getPlatformSettings();

    let rows: { id: string }[];
    if (auth.isSuperAdmin) {
      rows = this.db
        .prepare('SELECT id FROM tenants ORDER BY is_demo_tenant DESC, created_at ASC')
        .all() as { id: string }[];
    } else if (auth.user) {
      rows = this.db
        .prepare(
          `SELECT id FROM tenants
           WHERE owner_uid = ?
              OR owner_uid IS NULL
              OR (is_demo_tenant = 1 AND ? = 0)
           ORDER BY is_demo_tenant DESC, created_at ASC`
        )
        .all(auth.user.uid, platform.demoUsersDisabled ? 1 : 0) as { id: string }[];
    } else {
      // Unauthenticated terminal mode: return demo tenant (when enabled) + unclaimed local tenants
      rows = this.db
        .prepare(
          `SELECT id FROM tenants
           WHERE owner_uid IS NULL
              OR (is_demo_tenant = 1 AND ? = 0)
           ORDER BY is_demo_tenant DESC, created_at ASC`
        )
        .all(platform.demoUsersDisabled ? 1 : 0) as { id: string }[];
    }

    const states: PosAppState[] = [];
    for (const r of rows) {
      const hydrated = this.loadTenantState(r.id);
      if (hydrated) {
        states.push(
          auth.isSuperAdmin
            ? this.redactTenantOperationalDataForAdmin(hydrated)
            : hydrated
        );
      }
    }
    return states;
  }

  /**
   * Strips store operational, inventory, PO, and financial records from Super Admin payloads
   * so Super Admin manages SaaS system infrastructure & permissions ONLY.
   */
  redactTenantOperationalDataForAdmin(state: PosAppState): PosAppState {
    return {
      ...state,
      storeDataRedactedForAdmin: true,
      menuItems: [],
      tables: [],
      orders: [],
      qrQueue: [],
      shifts: [],
      ingredients: [],
      recipes: [],
      stockHistory: [],
      suppliers: [],
      purchaseOrders: [],
      accounts: [],
      journalEntries: [],
      expenses: [],
      reservations: [],
      promotions: [],
      prepaidTemplates: [],
      customerPacks: [],
      members: [],
      invoices: [],
      groupSessions: [],
      dailyRevenueHistory: [],
      displayActiveOrderId: null,
    };
  }

  findTenantByBusinessCode(businessCode: string): PosAppState | null {
    const clean = businessCode.trim().toUpperCase();
    if (!clean) return null;
    const row = this.db
      .prepare('SELECT id FROM tenants WHERE UPPER(business_code) = ?')
      .get(clean) as { id: string } | undefined;
    if (!row) return null;
    return this.loadTenantState(row.id);
  }

  /**
   * Cross-device Staff PIN + Business Code Sign-In directly against SQLite!
   */
  verifyTenantStaffPin(params: {
    businessCode?: string;
    username: string;
    pin: string;
  }): {
    ok: boolean;
    error?: string;
    tenant?: PosAppState;
    staffId?: string;
    isAdmin?: boolean;
  } {
    const cleanCode = (params.businessCode || '').trim().toUpperCase();
    const cleanUser = params.username.trim().toLowerCase();
    const cleanPin = params.pin.trim();
    const platform = this.getPlatformSettings();

    // Super Admin login works globally across any tenant (with operational store data disabled/redacted)
    if ((cleanUser === 'admin' || cleanUser === 'superadmin') && cleanPin === '0000') {
      const rawTenant = cleanCode
        ? this.findTenantByBusinessCode(cleanCode)
        : (this.listAccessibleTenants({ user: null, isSuperAdmin: true })[0] ?? null);
      if (!rawTenant) {
        return { ok: false, error: 'No workspace found.' };
      }
      const targetTenant = this.redactTenantOperationalDataForAdmin(rawTenant);
      const adminStaff = targetTenant.staff.find((s) => s.role === 'admin') ?? targetTenant.staff[0];
      return {
        ok: true,
        tenant: targetTenant,
        staffId: adminStaff?.id || 'staff_admin',
        isAdmin: true,
      };
    }

    let candidateTenants: PosAppState[] = [];
    if (cleanCode) {
      const found = this.findTenantByBusinessCode(cleanCode);
      if (!found) {
        return {
          ok: false,
          error: `Business Code "${cleanCode}" was not found in SQLite.`,
        };
      }
      candidateTenants = [found];
    } else {
      const allRows = this.db
        .prepare('SELECT id FROM tenants ORDER BY is_demo_tenant DESC, created_at ASC')
        .all() as { id: string }[];
      candidateTenants = allRows
        .map((r) => this.loadTenantState(r.id))
        .filter((t): t is PosAppState => Boolean(t));
    }

    for (const tenant of candidateTenants) {
      if (tenant.tenantStatus === 'suspended') {
        if (cleanCode) {
          return {
            ok: false,
            error: `Workspace "${tenant.shopName}" is suspended. Please contact system administrator.`,
          };
        }
        continue;
      }

      if (platform.demoUsersDisabled && tenant.isDemoTenant) {
        if (cleanCode) {
          return {
            ok: false,
            error: 'Demo workspaces are currently disabled by Super Admin.',
          };
        }
        continue;
      }

      const matched = tenant.staff.find(
        (s) =>
          s.active &&
          s.pin === cleanPin &&
          (s.username.toLowerCase() === cleanUser || s.name.toLowerCase() === cleanUser)
      );

      if (matched) {
        if (platform.demoUsersDisabled && matched.isDemo && matched.role !== 'admin') {
          return {
            ok: false,
            error: 'Demo user accounts are disabled by Super Admin.',
          };
        }
        return {
          ok: true,
          tenant,
          staffId: matched.id,
          isAdmin: matched.role === 'admin',
        };
      }
    }

    return {
      ok: false,
      error: cleanCode
        ? `Invalid username or 4-digit PIN for workspace ${cleanCode}.`
        : 'Invalid Business Code, username, or 4-digit PIN.',
    };
  }

  // ---------------------------------------------------------------------------
  // Atomic Multi-Table Tenant Hydration & Persistence
  // ---------------------------------------------------------------------------
  loadTenantState(tenantId: string): PosAppState | null {
    const tenantRow = this.db
      .prepare('SELECT * FROM tenants WHERE id = ?')
      .get(tenantId) as Record<string, unknown> | undefined;

    if (!tenantRow) return null;

    const parseJson = <T>(raw: unknown, fallback: T): T => {
      if (typeof raw !== 'string' || !raw) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    };

    const branches = (
      this.db
        .prepare('SELECT data_json FROM branches WHERE tenant_id = ? ORDER BY sort_order ASC')
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<BranchConfig>(r.data_json, {} as BranchConfig));

    const staff = (
      this.db
        .prepare('SELECT data_json FROM staff_members WHERE tenant_id = ? ORDER BY sort_order ASC')
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<StaffMember>(r.data_json, {} as StaffMember));

    const menuItems = (
      this.db
        .prepare('SELECT data_json FROM menu_items WHERE tenant_id = ? ORDER BY sort_order ASC')
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<MenuItem>(r.data_json, {} as MenuItem));

    const tables = (
      this.db
        .prepare('SELECT data_json FROM pos_tables WHERE tenant_id = ? ORDER BY sort_order ASC')
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<PosTable>(r.data_json, {} as PosTable));

    const orders = (
      this.db
        .prepare('SELECT data_json FROM orders WHERE tenant_id = ? ORDER BY sort_order ASC')
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<Order>(r.data_json, {} as Order));

    const qrQueue = (
      this.db
        .prepare(
          'SELECT data_json FROM qr_incoming_orders WHERE tenant_id = ? ORDER BY sort_order ASC'
        )
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<QrIncomingOrder>(r.data_json, {} as QrIncomingOrder));

    const shifts = (
      this.db
        .prepare('SELECT data_json FROM shifts WHERE tenant_id = ? ORDER BY sort_order ASC')
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<ShiftRecord>(r.data_json, {} as ShiftRecord));

    const ingredients = (
      this.db
        .prepare('SELECT data_json FROM ingredients WHERE tenant_id = ? ORDER BY sort_order ASC')
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<Ingredient>(r.data_json, {} as Ingredient));

    const recipes = (
      this.db
        .prepare(
          'SELECT menu_item_id, lines_json FROM recipes WHERE tenant_id = ? ORDER BY sort_order ASC'
        )
        .all(tenantId) as { menu_item_id: string; lines_json: string }[]
    ).map((r) => ({
      menuItemId: r.menu_item_id,
      lines: parseJson<RecipeLine[]>(r.lines_json, []),
    }));

    const stockHistory = (
      this.db
        .prepare(
          'SELECT data_json FROM stock_movements WHERE tenant_id = ? ORDER BY sort_order ASC'
        )
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<StockMovement>(r.data_json, {} as StockMovement));

    const suppliers = (
      this.db
        .prepare('SELECT data_json FROM suppliers WHERE tenant_id = ? ORDER BY sort_order ASC')
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<Supplier>(r.data_json, {} as Supplier));

    const purchaseOrders = (
      this.db
        .prepare(
          'SELECT data_json FROM purchase_orders WHERE tenant_id = ? ORDER BY sort_order ASC'
        )
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<PurchaseOrder>(r.data_json, {} as PurchaseOrder));

    const rawAccounts = (
      this.db
        .prepare(
          'SELECT data_json FROM chart_of_accounts WHERE tenant_id = ? ORDER BY sort_order ASC'
        )
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<LedgerAccount>(r.data_json, {} as LedgerAccount));
    const accounts = rawAccounts.length > 0 ? rawAccounts : createDefaultChartOfAccounts();

    const journalEntries = (
      this.db
        .prepare(
          'SELECT data_json FROM journal_entries WHERE tenant_id = ? ORDER BY sort_order ASC'
        )
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<JournalEntry>(r.data_json, {} as JournalEntry));

    const expenses = (
      this.db
        .prepare(
          'SELECT data_json FROM operating_expenses WHERE tenant_id = ? ORDER BY sort_order ASC'
        )
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<OperatingExpense>(r.data_json, {} as OperatingExpense));

    const reservations = (
      this.db
        .prepare('SELECT data_json FROM reservations WHERE tenant_id = ? ORDER BY sort_order ASC')
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<Reservation>(r.data_json, {} as Reservation));

    const promoRows = this.db
      .prepare(
        'SELECT record_kind, data_json FROM promotions_loyalty WHERE tenant_id = ? ORDER BY sort_order ASC'
      )
      .all(tenantId) as { record_kind: string; data_json: string }[];

    const promotions: Promotion[] = [];
    const prepaidTemplates: PrepaidPackTemplate[] = [];
    const customerPacks: CustomerPack[] = [];
    const members: LoyaltyMember[] = [];
    const groupSessions: GroupOrderSession[] = [];

    for (const r of promoRows) {
      if (r.record_kind === 'promotion') {
        promotions.push(parseJson<Promotion>(r.data_json, {} as Promotion));
      } else if (r.record_kind === 'prepaid_template') {
        prepaidTemplates.push(
          parseJson<PrepaidPackTemplate>(r.data_json, {} as PrepaidPackTemplate)
        );
      } else if (r.record_kind === 'customer_pack') {
        customerPacks.push(parseJson<CustomerPack>(r.data_json, {} as CustomerPack));
      } else if (r.record_kind === 'member') {
        members.push(parseJson<LoyaltyMember>(r.data_json, {} as LoyaltyMember));
      } else if (r.record_kind === 'group_session') {
        groupSessions.push(parseJson<GroupOrderSession>(r.data_json, {} as GroupOrderSession));
      }
    }

    const invoices = (
      this.db
        .prepare('SELECT data_json FROM vat_invoices WHERE tenant_id = ? ORDER BY sort_order ASC')
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<VatInvoice>(r.data_json, {} as VatInvoice));

    const auditLogs = (
      this.db
        .prepare(
          'SELECT data_json FROM audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 300'
        )
        .all(tenantId) as { data_json: string }[]
    ).map((r) => parseJson<AuditLogEntry>(r.data_json, {} as AuditLogEntry));

    const flagRows = this.db
      .prepare('SELECT module_key, enabled FROM tenant_feature_flags WHERE tenant_id = ?')
      .all(tenantId) as { module_key: string; enabled: number }[];
    const featureFlags: Record<string, boolean> = {};
    for (const f of flagRows) {
      featureFlags[f.module_key] = Boolean(f.enabled);
    }

    return {
      tenantId: String(tenantRow.id),
      ownerUid: tenantRow.owner_uid ? String(tenantRow.owner_uid) : undefined,
      isDemoTenant: Boolean(tenantRow.is_demo_tenant),
      tenantStatus: (tenantRow.tenant_status as PosAppState['tenantStatus']) || 'active',
      shopName: String(tenantRow.shop_name),
      businessCode: String(tenantRow.business_code),
      businessType: (tenantRow.business_type as PosAppState['businessType']) || 'restaurant',
      plan: (tenantRow.plan as SubscriptionPlan) || 'daily',
      planDaysLeft: Number(tenantRow.plan_days_left ?? 0),
      subscriptionStatus:
        (tenantRow.subscription_status as PosAppState['subscriptionStatus']) || 'pending',
      subscriptionExpiresAt: tenantRow.subscription_expires_at
        ? String(tenantRow.subscription_expires_at)
        : undefined,
      subscriptionRef: tenantRow.subscription_ref
        ? String(tenantRow.subscription_ref)
        : undefined,
      subscriptionPaidUsd:
        tenantRow.subscription_paid_usd !== null && tenantRow.subscription_paid_usd !== undefined
          ? Number(tenantRow.subscription_paid_usd)
          : undefined,
      referralCode: String(tenantRow.referral_code || ''),
      activeBranchId: String(tenantRow.active_branch_id || branches[0]?.id || 'branch_main'),
      branches,
      activeStaffId: String(tenantRow.active_staff_id || staff[0]?.id || 'staff_owner'),
      ownerPermissions: normalizePermissions(
        parseJson<PermissionKey[]>(
          tenantRow.owner_permissions_json,
          DEFAULT_OWNER_TENANT_PERMISSIONS
        ),
        false
      ),
      staff,
      menuItems,
      tables,
      orders,
      qrQueue,
      shifts,
      ingredients,
      recipes,
      stockHistory,
      suppliers,
      purchaseOrders,
      accounts,
      journalEntries,
      expenses,
      reservations,
      promotions,
      prepaidTemplates,
      customerPacks,
      members,
      invoices,
      auditLogs,
      groupSessions,
      dailyRevenueHistory: parseJson<DailyRevenuePoint[]>(tenantRow.daily_revenue_json, []),
      nextOrderNumber: Number(tenantRow.next_order_number ?? 1),
      nextInvoiceSeq: Number(tenantRow.next_invoice_seq ?? 1),
      nextPoSeq: Number(tenantRow.next_po_seq ?? 1),
      nextJournalSeq: Number(tenantRow.next_journal_seq ?? 1),
      offlineMode: false,
      displayActiveOrderId: tenantRow.display_active_order_id
        ? String(tenantRow.display_active_order_id)
        : null,
      displayShowKhqr: Boolean(tenantRow.display_show_khqr),
      featureFlags,
      version: Number(tenantRow.version ?? 1),
    };
  }

  /**
   * Saves full tenant state inside a single ACID SQLite transaction while enforcing
   * security_spec.md invariants:
   *  - Non-admin callers cannot self-escalate `plan`, `subscriptionStatus`, `tenantStatus`,
   *    or `ownerPermissions` on an existing tenant.
   *  - `audit_logs` are strictly append-only (`INSERT OR IGNORE`).
   */
  saveTenantState(
    incoming: PosAppState,
    options?: {
      auth?: AuthenticatedContext;
      bypassSecurityControls?: boolean;
      expectedVersion?: number;
      forceOverwrite?: boolean;
    }
  ): PosAppState {
    const isSuperAdmin = Boolean(
      options?.bypassSecurityControls || options?.auth?.isSuperAdmin
    );
    const nowIso = new Date().toISOString();

    return this.conn.withTransaction(() => {
      const tenantId = incoming.tenantId || `tenant_${Date.now().toString(36)}`;
      const existingRow = this.db
        .prepare(
          `SELECT id, owner_uid, tenant_status, plan, plan_days_left, subscription_status,
                  subscription_expires_at, subscription_ref, subscription_paid_usd,
                  owner_permissions_json, version, created_at
           FROM tenants WHERE id = ?`
        )
        .get(tenantId) as Record<string, unknown> | undefined;

      if (
        existingRow &&
        typeof options?.expectedVersion === 'number' &&
        Number.isFinite(options.expectedVersion) &&
        !options.forceOverwrite
      ) {
        const serverVersion = Number(existingRow.version ?? 1);
        if (serverVersion !== options.expectedVersion) {
          const orderCountRow = this.db
            .prepare('SELECT COUNT(*) as cnt FROM orders WHERE tenant_id = ?')
            .get(tenantId) as { cnt?: number } | undefined;
          throw new SyncConflictError({
            clientVersion: options.expectedVersion,
            serverVersion,
            serverOrdersCount: Number(orderCountRow?.cnt ?? 0),
          });
        }
      }

      // Ensure unique businessCode across tenants
      const cleanBusinessCode = incoming.businessCode
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '_');

      const codeConflict = this.db
        .prepare('SELECT id FROM tenants WHERE UPPER(business_code) = ? AND id != ?')
        .get(cleanBusinessCode, tenantId) as { id: string } | undefined;

      if (codeConflict) {
        throw new Error(`Business code "${cleanBusinessCode}" is already taken by another tenant.`);
      }

      // Enforce security_spec.md §3.3 on existing tenants for non-Super-Admin callers
      let effectivePlan = incoming.plan;
      let effectivePlanDaysLeft = incoming.planDaysLeft;
      let effectiveSubStatus = incoming.subscriptionStatus || 'pending';
      let effectiveSubExpiresAt = incoming.subscriptionExpiresAt ?? null;
      let effectiveSubRef = incoming.subscriptionRef ?? null;
      let effectiveSubPaidUsd = incoming.subscriptionPaidUsd ?? null;
      let effectiveTenantStatus = incoming.tenantStatus || 'active';
      let effectiveOwnerPermsJson = JSON.stringify(
        normalizePermissions(incoming.ownerPermissions ?? DEFAULT_OWNER_TENANT_PERMISSIONS, false)
      );
      let effectiveOwnerUid =
        incoming.ownerUid ||
        (existingRow?.owner_uid ? String(existingRow.owner_uid) : options?.auth?.user?.uid || null);

      if (existingRow && !isSuperAdmin) {
        effectivePlan = (existingRow.plan as SubscriptionPlan) || incoming.plan;
        effectivePlanDaysLeft = Number(existingRow.plan_days_left ?? incoming.planDaysLeft);
        effectiveSubStatus =
          (existingRow.subscription_status as PosAppState['subscriptionStatus']) || 'pending';
        effectiveSubExpiresAt = existingRow.subscription_expires_at
          ? String(existingRow.subscription_expires_at)
          : null;
        effectiveSubRef = existingRow.subscription_ref
          ? String(existingRow.subscription_ref)
          : null;
        effectiveSubPaidUsd =
          existingRow.subscription_paid_usd !== null &&
          existingRow.subscription_paid_usd !== undefined
            ? Number(existingRow.subscription_paid_usd)
            : null;
        effectiveTenantStatus =
          (existingRow.tenant_status as PosAppState['tenantStatus']) || 'active';
        effectiveOwnerPermsJson = String(
          existingRow.owner_permissions_json || effectiveOwnerPermsJson
        );
        if (existingRow.owner_uid) {
          effectiveOwnerUid = String(existingRow.owner_uid);
        }
      }

      const nextVersion = existingRow ? Number(existingRow.version ?? 1) + 1 : 1;
      const createdAt = existingRow ? String(existingRow.created_at) : nowIso;
      const preserveOperationalStoreData = Boolean(
        existingRow &&
          !options?.bypassSecurityControls &&
          (isSuperAdmin || incoming.storeDataRedactedForAdmin)
      );

      this.db
        .prepare(
          `INSERT INTO tenants (
             id, owner_uid, shop_name, business_code, business_type, is_demo_tenant,
             tenant_status, plan, plan_days_left, subscription_status, subscription_expires_at,
             subscription_ref, subscription_paid_usd, referral_code, active_branch_id,
             active_staff_id, owner_permissions_json, next_order_number, next_invoice_seq,
             next_po_seq, next_journal_seq,
             display_active_order_id, display_show_khqr, daily_revenue_json, version,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             owner_uid = excluded.owner_uid,
             shop_name = excluded.shop_name,
             business_code = excluded.business_code,
             business_type = excluded.business_type,
             is_demo_tenant = excluded.is_demo_tenant,
             tenant_status = excluded.tenant_status,
             plan = excluded.plan,
             plan_days_left = excluded.plan_days_left,
             subscription_status = excluded.subscription_status,
             subscription_expires_at = excluded.subscription_expires_at,
             subscription_ref = excluded.subscription_ref,
             subscription_paid_usd = excluded.subscription_paid_usd,
             referral_code = excluded.referral_code,
             active_branch_id = excluded.active_branch_id,
             active_staff_id = excluded.active_staff_id,
             owner_permissions_json = excluded.owner_permissions_json,
             next_order_number = excluded.next_order_number,
             next_invoice_seq = excluded.next_invoice_seq,
             next_po_seq = excluded.next_po_seq,
             next_journal_seq = excluded.next_journal_seq,
             display_active_order_id = excluded.display_active_order_id,
             display_show_khqr = excluded.display_show_khqr,
             daily_revenue_json = excluded.daily_revenue_json,
             version = excluded.version,
             updated_at = excluded.updated_at`
        )
        .run(
          tenantId,
          effectiveOwnerUid,
          incoming.shopName,
          cleanBusinessCode,
          incoming.businessType || 'restaurant',
          incoming.isDemoTenant ? 1 : 0,
          effectiveTenantStatus,
          effectivePlan,
          effectivePlanDaysLeft,
          effectiveSubStatus,
          effectiveSubExpiresAt,
          effectiveSubRef,
          effectiveSubPaidUsd,
          incoming.referralCode || '',
          incoming.activeBranchId,
          incoming.activeStaffId,
          effectiveOwnerPermsJson,
          preserveOperationalStoreData
            ? Number(existingRow?.next_order_number ?? incoming.nextOrderNumber)
            : incoming.nextOrderNumber,
          preserveOperationalStoreData
            ? Number(existingRow?.next_invoice_seq ?? incoming.nextInvoiceSeq)
            : incoming.nextInvoiceSeq,
          preserveOperationalStoreData
            ? Number(existingRow?.next_po_seq ?? incoming.nextPoSeq ?? 1)
            : (incoming.nextPoSeq ?? 1),
          preserveOperationalStoreData
            ? Number(existingRow?.next_journal_seq ?? incoming.nextJournalSeq ?? 1)
            : (incoming.nextJournalSeq ?? 1),
          preserveOperationalStoreData
            ? (existingRow?.display_active_order_id ? String(existingRow.display_active_order_id) : null)
            : (incoming.displayActiveOrderId ?? null),
          incoming.displayShowKhqr ? 1 : 0,
          preserveOperationalStoreData
            ? String(existingRow?.daily_revenue_json || '[]')
            : JSON.stringify(incoming.dailyRevenueHistory || []),
          nextVersion,
          createdAt,
          nowIso
        );

      // Feature flags
      if (incoming.featureFlags) {
        this.db
          .prepare('DELETE FROM tenant_feature_flags WHERE tenant_id = ?')
          .run(tenantId);
        const flagStmt = this.db.prepare(
          `INSERT INTO tenant_feature_flags (tenant_id, module_key, enabled, updated_at)
           VALUES (?, ?, ?, ?)`
        );
        for (const [k, v] of Object.entries(incoming.featureFlags)) {
          flagStmt.run(tenantId, k, v ? 1 : 0, nowIso);
        }
      }

      // Branches
      this.db.prepare('DELETE FROM branches WHERE tenant_id = ?').run(tenantId);
      const branchStmt = this.db.prepare(
        `INSERT INTO branches (id, tenant_id, sort_order, code, name, exchange_rate, vat_percent, data_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      incoming.branches.forEach((b, idx) => {
        branchStmt.run(
          b.id,
          tenantId,
          idx,
          b.code,
          b.name,
          b.exchangeRate,
          b.vatPercent,
          JSON.stringify(b),
          nowIso
        );
      });

      // Staff members (protect full_admin escalation if non-Super-Admin)
      this.db.prepare('DELETE FROM staff_members WHERE tenant_id = ?').run(tenantId);
      const staffStmt = this.db.prepare(
        `INSERT INTO staff_members (id, tenant_id, sort_order, username, name, role, pin, active, is_demo, permissions_json, data_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      incoming.staff.forEach((s, idx) => {
        const sanitizedPerms =
          s.role === 'admin'
            ? [...ALL_PERMISSIONS]
            : (s.permissions || []).filter((p) => p !== 'full_admin');
        const cleanStaff: StaffMember = {
          ...s,
          permissions: sanitizedPerms,
        };
        staffStmt.run(
          cleanStaff.id,
          tenantId,
          idx,
          cleanStaff.username,
          cleanStaff.name,
          cleanStaff.role,
          cleanStaff.pin,
          cleanStaff.active ? 1 : 0,
          cleanStaff.isDemo ? 1 : 0,
          JSON.stringify(cleanStaff.permissions),
          JSON.stringify(cleanStaff),
          nowIso
        );
      });

      if (!preserveOperationalStoreData) {
      // Menu items
      this.db.prepare('DELETE FROM menu_items WHERE tenant_id = ?').run(tenantId);
      const menuStmt = this.db.prepare(
        `INSERT INTO menu_items (id, tenant_id, branch_id, sort_order, category, item_type, name_en, price_usd, active, data_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      incoming.menuItems.forEach((m, idx) => {
        menuStmt.run(
          m.id,
          tenantId,
          m.branchId,
          idx,
          m.category,
          m.itemType || 'product',
          m.nameEn,
          m.priceUsd,
          m.active ? 1 : 0,
          JSON.stringify(m),
          nowIso
        );
      });

      // Tables
      this.db.prepare('DELETE FROM pos_tables WHERE tenant_id = ?').run(tenantId);
      const tableStmt = this.db.prepare(
        `INSERT INTO pos_tables (id, tenant_id, branch_id, sort_order, area, name, status, seats, data_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      incoming.tables.forEach((t, idx) => {
        tableStmt.run(
          t.id,
          tenantId,
          t.branchId,
          idx,
          t.area,
          t.name,
          t.status,
          t.seats,
          JSON.stringify(t),
          nowIso
        );
      });

      // Orders
      this.db.prepare('DELETE FROM orders WHERE tenant_id = ?').run(tenantId);
      const orderStmt = this.db.prepare(
        `INSERT INTO orders (id, tenant_id, branch_id, sort_order, order_number, channel, status, total_usd, total_khr, payment_method, created_at, updated_at, data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      incoming.orders.forEach((o, idx) => {
        orderStmt.run(
          o.id,
          tenantId,
          o.branchId,
          idx,
          o.orderNumber,
          o.channel,
          o.status,
          o.totalUsd,
          o.totalKhr,
          o.paymentMethod ?? null,
          o.createdAt,
          o.updatedAt,
          JSON.stringify(o)
        );
      });

      // QR Incoming Queue
      this.db
        .prepare('DELETE FROM qr_incoming_orders WHERE tenant_id = ?')
        .run(tenantId);
      const qrStmt = this.db.prepare(
        `INSERT INTO qr_incoming_orders (id, tenant_id, branch_id, sort_order, channel, status, created_at, data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      incoming.qrQueue.forEach((q, idx) => {
        qrStmt.run(
          q.id,
          tenantId,
          q.branchId,
          idx,
          q.channel,
          q.status,
          q.createdAt,
          JSON.stringify(q)
        );
      });

      // Shifts
      this.db.prepare('DELETE FROM shifts WHERE tenant_id = ?').run(tenantId);
      const shiftStmt = this.db.prepare(
        `INSERT INTO shifts (id, tenant_id, branch_id, sort_order, cashier_name, status, opened_at, closed_at, data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      incoming.shifts.forEach((s, idx) => {
        shiftStmt.run(
          s.id,
          tenantId,
          s.branchId,
          idx,
          s.cashierName,
          s.status,
          s.openedAt,
          s.closedAt ?? null,
          JSON.stringify(s)
        );
      });

      // Ingredients
      this.db.prepare('DELETE FROM ingredients WHERE tenant_id = ?').run(tenantId);
      const ingStmt = this.db.prepare(
        `INSERT INTO ingredients (id, tenant_id, branch_id, sort_order, name_en, on_hand, min_level, data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      incoming.ingredients.forEach((ing, idx) => {
        ingStmt.run(
          ing.id,
          tenantId,
          ing.branchId,
          idx,
          ing.nameEn,
          ing.onHand,
          ing.minLevel,
          JSON.stringify(ing)
        );
      });

      // Recipes
      this.db.prepare('DELETE FROM recipes WHERE tenant_id = ?').run(tenantId);
      const recStmt = this.db.prepare(
        `INSERT INTO recipes (menu_item_id, tenant_id, sort_order, lines_json)
         VALUES (?, ?, ?, ?)`
      );
      incoming.recipes.forEach((r, idx) => {
        recStmt.run(r.menuItemId, tenantId, idx, JSON.stringify(r.lines || []));
      });

      // Stock Movements
      this.db.prepare('DELETE FROM stock_movements WHERE tenant_id = ?').run(tenantId);
      const smStmt = this.db.prepare(
        `INSERT INTO stock_movements (id, tenant_id, sort_order, ingredient_id, movement_type, qty_delta, created_at, data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      incoming.stockHistory.forEach((sm, idx) => {
        smStmt.run(
          sm.id,
          tenantId,
          idx,
          sm.ingredientId,
          sm.type,
          sm.qtyDelta,
          sm.createdAt,
          JSON.stringify(sm)
        );
      });

      // Reservations
      this.db.prepare('DELETE FROM reservations WHERE tenant_id = ?').run(tenantId);
      const resStmt = this.db.prepare(
        `INSERT INTO reservations (id, tenant_id, branch_id, sort_order, code, status, date_time, data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      incoming.reservations.forEach((res, idx) => {
        resStmt.run(
          res.id,
          tenantId,
          res.branchId,
          idx,
          res.code,
          res.status,
          res.dateTime,
          JSON.stringify(res)
        );
      });

      // Promotions, Packs, Members, Group Sessions
      this.db
        .prepare('DELETE FROM promotions_loyalty WHERE tenant_id = ?')
        .run(tenantId);
      const promoStmt = this.db.prepare(
        `INSERT INTO promotions_loyalty (id, tenant_id, record_kind, sort_order, code_or_phone, active, data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      incoming.promotions.forEach((p, idx) => {
        promoStmt.run(
          p.id,
          tenantId,
          'promotion',
          idx,
          p.code || '',
          p.active ? 1 : 0,
          JSON.stringify(p)
        );
      });
      incoming.prepaidTemplates.forEach((pt, idx) => {
        promoStmt.run(
          pt.id,
          tenantId,
          'prepaid_template',
          idx,
          '',
          pt.active ? 1 : 0,
          JSON.stringify(pt)
        );
      });
      incoming.customerPacks.forEach((cp, idx) => {
        promoStmt.run(
          cp.id,
          tenantId,
          'customer_pack',
          idx,
          cp.code || cp.phone,
          cp.active ? 1 : 0,
          JSON.stringify(cp)
        );
      });
      incoming.members.forEach((mem, idx) => {
        promoStmt.run(
          mem.id,
          tenantId,
          'member',
          idx,
          mem.phone,
          1,
          JSON.stringify(mem)
        );
      });
      incoming.groupSessions.forEach((gs, idx) => {
        promoStmt.run(
          gs.id,
          tenantId,
          'group_session',
          idx,
          gs.organiserName,
          gs.submitted ? 0 : 1,
          JSON.stringify(gs)
        );
      });

      // VAT Invoices
      this.db.prepare('DELETE FROM vat_invoices WHERE tenant_id = ?').run(tenantId);
      const invStmt = this.db.prepare(
        `INSERT INTO vat_invoices (id, tenant_id, branch_id, sort_order, invoice_no, invoice_type, status, total_usd, date, data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      incoming.invoices.forEach((inv, idx) => {
        invStmt.run(
          inv.id,
          tenantId,
          inv.branchId,
          idx,
          inv.invoiceNo,
          inv.invoiceType,
          inv.status,
          inv.totalUsd,
          inv.date,
          JSON.stringify(inv)
        );
      });

      // Suppliers
      this.db.prepare('DELETE FROM suppliers WHERE tenant_id = ?').run(tenantId);
      const supStmt = this.db.prepare(
        `INSERT INTO suppliers (id, tenant_id, branch_id, sort_order, name, category, vattin, payment_terms, active, data_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      (incoming.suppliers || []).forEach((sup, idx) => {
        supStmt.run(
          sup.id,
          tenantId,
          sup.branchId || 'all',
          idx,
          sup.name,
          sup.category,
          sup.vattin ?? null,
          sup.paymentTerms || 'cod',
          sup.active ? 1 : 0,
          JSON.stringify(sup),
          nowIso
        );
      });

      // Purchase Orders
      this.db.prepare('DELETE FROM purchase_orders WHERE tenant_id = ?').run(tenantId);
      const poStmt = this.db.prepare(
        `INSERT INTO purchase_orders (id, tenant_id, branch_id, sort_order, po_number, supplier_id, status, payment_status, total_usd, balance_due_usd, order_date, due_date, data_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      (incoming.purchaseOrders || []).forEach((po, idx) => {
        poStmt.run(
          po.id,
          tenantId,
          po.branchId,
          idx,
          po.poNumber,
          po.supplierId,
          po.status,
          po.paymentStatus || 'unpaid',
          po.totalUsd,
          po.balanceDueUsd,
          po.orderDate,
          po.dueDate || po.expectedDate || po.orderDate,
          JSON.stringify(po),
          nowIso
        );
      });

      // Chart of Accounts
      const effectiveAccounts =
        incoming.accounts && incoming.accounts.length > 0
          ? incoming.accounts
          : createDefaultChartOfAccounts();
      this.db.prepare('DELETE FROM chart_of_accounts WHERE tenant_id = ?').run(tenantId);
      const coaStmt = this.db.prepare(
        `INSERT INTO chart_of_accounts (id, tenant_id, sort_order, code, name_en, account_type, normal_balance, active, data_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      effectiveAccounts.forEach((acc, idx) => {
        coaStmt.run(
          acc.id,
          tenantId,
          idx,
          acc.code,
          acc.nameEn,
          acc.type,
          acc.normalBalance,
          acc.active ? 1 : 0,
          JSON.stringify(acc),
          nowIso
        );
      });

      // Double-Entry Journal Entries
      this.db.prepare('DELETE FROM journal_entries WHERE tenant_id = ?').run(tenantId);
      const jeStmt = this.db.prepare(
        `INSERT INTO journal_entries (id, tenant_id, branch_id, sort_order, entry_no, entry_date, source_type, total_debit_usd, total_credit_usd, created_at, data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      (incoming.journalEntries || []).forEach((je, idx) => {
        jeStmt.run(
          je.id,
          tenantId,
          je.branchId,
          idx,
          je.entryNo,
          je.date,
          je.sourceType,
          je.totalDebitUsd,
          je.totalCreditUsd,
          je.createdAt,
          JSON.stringify(je)
        );
      });

      // Operating Expenses
      this.db.prepare('DELETE FROM operating_expenses WHERE tenant_id = ?').run(tenantId);
      const expStmt = this.db.prepare(
        `INSERT INTO operating_expenses (id, tenant_id, branch_id, sort_order, voucher_no, expense_date, account_code, total_usd, payment_status, data_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      (incoming.expenses || []).forEach((exp, idx) => {
        expStmt.run(
          exp.id,
          tenantId,
          exp.branchId,
          idx,
          exp.voucherNo,
          exp.date,
          exp.expenseAccountCode,
          exp.totalUsd,
          exp.paymentStatus || 'paid',
          JSON.stringify(exp),
          nowIso
        );
      });
      } // end if (!preserveOperationalStoreData)

      // Audit Logs — STRICTLY APPEND-ONLY (`INSERT OR IGNORE`) per security_spec.md §3.4!
      const auditStmt = this.db.prepare(
        `INSERT OR IGNORE INTO audit_logs (id, tenant_id, branch_id, actor_name, action, severity, created_at, data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      incoming.auditLogs.forEach((al) => {
        auditStmt.run(
          al.id,
          tenantId,
          al.branchId,
          al.actorName,
          al.action,
          al.severity || 'info',
          al.createdAt,
          JSON.stringify(al)
        );
      });

      return this.loadTenantState(tenantId)!;
    });
  }

  /**
   * Dedicated Subscription Activation endpoint logic (records payment in `subscription_payments`
   * and updates tenant plan/days atomically).
   */
  activateTenantSubscription(params: {
    tenantId: string;
    plan: SubscriptionPlan;
    days?: number;
    paymentRef: string;
    amountUsd?: number;
    actorUid?: string;
    actorName?: string;
  }): PosAppState {
    return this.conn.withTransaction(() => {
      const current = this.loadTenantState(params.tenantId);
      if (!current) {
        throw new Error('Tenant not found.');
      }

      const periods = params.plan === 'daily' ? Math.max(1, Math.round(params.days || 1)) : 1;
      const addedDays =
        params.plan === 'daily'
          ? computeSubscriptionDays('daily', periods)
          : params.days && params.days > 0
            ? Math.round(params.days)
            : computeSubscriptionDays(params.plan, 1);
      const grantedDays = calculateExtendedDays(
        current.planDaysLeft,
        current.subscriptionStatus,
        addedDays
      );
      const paidUsd =
        params.amountUsd !== undefined
          ? Number(params.amountUsd)
          : computeSubscriptionAmountUsd(params.plan, periods);
      const nowIso = new Date().toISOString();
      const expiresIso = new Date(Date.now() + grantedDays * 86400000).toISOString();

      this.db
        .prepare(
          `INSERT INTO subscription_payments (id, tenant_id, tenant_name, plan, days_granted, amount_usd, payment_ref, paid_by_uid, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          generateUid('subpay'),
          params.tenantId,
          current.shopName,
          params.plan,
          addedDays,
          paidUsd,
          params.paymentRef,
          params.actorUid ?? null,
          nowIso
        );

      const auditEntry: AuditLogEntry = {
        id: generateUid('al'),
        branchId: current.activeBranchId,
        actorName: params.actorName || 'Owner',
        action: 'Subscription activated (KHQR)',
        detail: `${params.plan.toUpperCase()} · +${addedDays}d (${grantedDays}d active) · $${paidUsd.toFixed(2)} · Ref ${params.paymentRef}`,
        severity: 'info',
        createdAt: nowIso,
      };

      return this.saveTenantState(
        {
          ...current,
          plan: params.plan,
          planDaysLeft: grantedDays,
          subscriptionStatus: 'active',
          subscriptionRef: params.paymentRef,
          subscriptionPaidUsd: paidUsd,
          subscriptionExpiresAt: expiresIso,
          auditLogs: [auditEntry, ...current.auditLogs],
        },
        { bypassSecurityControls: true }
      );
    });
  }

  deleteTenant(tenantId: string): boolean {
    if (tenantId === 'tenant_lotus_bkk1') {
      throw new Error('Cannot delete the built-in system reference workspace.');
    }
    const res = this.db.prepare('DELETE FROM tenants WHERE id = ?').run(tenantId);
    return Number(res.changes) > 0;
  }

  // ---------------------------------------------------------------------------
  // Public Guest QR & Online Booking Mutations (Cross-Device Ready!)
  // ---------------------------------------------------------------------------
  appendGuestQrOrder(
    tenantId: string,
    payload: Omit<QrIncomingOrder, 'id' | 'createdAt' | 'status'>
  ): PosAppState {
    const state = this.loadTenantState(tenantId);
    if (!state) throw new Error('Tenant not found.');

    const qrOrder: QrIncomingOrder = {
      ...payload,
      id: generateUid('qr'),
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    return this.saveTenantState(
      {
        ...state,
        qrQueue: [qrOrder, ...state.qrQueue],
      },
      { bypassSecurityControls: true }
    );
  }

  appendGuestServiceAlert(params: {
    tenantId: string;
    branchId: string;
    tableName: string;
    alertType: 'call_staff' | 'ask_bill';
  }): PosAppState {
    const state = this.loadTenantState(params.tenantId);
    if (!state) throw new Error('Tenant not found.');
    const nowIso = new Date().toISOString();

    const auditEntry: AuditLogEntry = {
      id: generateUid('al'),
      branchId: params.branchId,
      actorName: `Guest (${params.tableName})`,
      action: params.alertType === 'ask_bill' ? 'Guest requested bill' : 'Guest called staff',
      detail: `${params.tableName} tapped "${params.alertType === 'ask_bill' ? 'Ask for bill' : 'Call staff'}" on QR menu`,
      severity: 'warning',
      createdAt: nowIso,
    };

    const nextTables =
      params.alertType === 'ask_bill'
        ? state.tables.map((t) =>
            t.branchId === params.branchId &&
            t.name.toLowerCase() === params.tableName.toLowerCase() &&
            t.status === 'occupied'
              ? { ...t, pendingTransferAlert: true }
              : t
          )
        : state.tables;

    return this.saveTenantState(
      {
        ...state,
        tables: nextTables,
        auditLogs: [auditEntry, ...state.auditLogs],
      },
      { bypassSecurityControls: true }
    );
  }

  appendOnlineReservation(
    tenantId: string,
    payload: Omit<Reservation, 'id' | 'code' | 'createdAt'>
  ): { state: PosAppState; reservation: Reservation } {
    const state = this.loadTenantState(tenantId);
    if (!state) throw new Error('Tenant not found.');

    const code = `R${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const reservation: Reservation = {
      ...payload,
      id: generateUid('res'),
      code,
      createdAt: new Date().toISOString(),
    };

    const nextState = this.saveTenantState(
      {
        ...state,
        reservations: [reservation, ...state.reservations],
      },
      { bypassSecurityControls: true }
    );

    return { state: nextState, reservation };
  }

  // ---------------------------------------------------------------------------
  // SQLite Engine Stats & SaaS Analytics
  // ---------------------------------------------------------------------------
  getSqliteEngineStats(): SqliteEngineStats {
    const verRow = this.db.prepare('SELECT sqlite_version() AS v').get() as { v: string };
    const journalRow = this.db.prepare('PRAGMA journal_mode').get() as {
      journal_mode: string;
    };

    let dbSizeBytes = 0;
    if (this.conn.dbPath !== ':memory:' && fs.existsSync(this.conn.dbPath)) {
      dbSizeBytes = fs.statSync(this.conn.dbPath).size;
      if (fs.existsSync(`${this.conn.dbPath}-wal`)) {
        dbSizeBytes += fs.statSync(`${this.conn.dbPath}-wal`).size;
      }
    }

    const tableCounts: Record<string, number> = {};
    for (const table of TRACKED_SQLITE_TABLES) {
      const r = this.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
      tableCounts[table] = Number(r.c ?? 0);
    }

    const tenantSummary = this.db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN tenant_status = 'active' THEN 1 ELSE 0 END) AS active_cnt,
           SUM(CASE WHEN tenant_status = 'suspended' THEN 1 ELSE 0 END) AS suspended_cnt,
           SUM(CASE WHEN is_demo_tenant = 1 THEN 1 ELSE 0 END) AS demo_cnt
         FROM tenants`
      )
      .get() as {
      total: number;
      active_cnt: number;
      suspended_cnt: number;
      demo_cnt: number;
    };

    const gmvRow = this.db
      .prepare(
        `SELECT
           COUNT(*) AS total_orders,
           COALESCE(SUM(CASE WHEN status = 'paid' THEN total_usd ELSE 0 END), 0) AS paid_gmv
         FROM orders`
      )
      .get() as { total_orders: number; paid_gmv: number };

    const subRevRow = this.db
      .prepare('SELECT COALESCE(SUM(amount_usd), 0) AS rev FROM subscription_payments')
      .get() as { rev: number };

    const recentSubscriptions = (
      this.db
        .prepare(
          `SELECT id, tenant_id, tenant_name, plan, days_granted, amount_usd, payment_ref, created_at
           FROM subscription_payments
           ORDER BY created_at DESC
           LIMIT 10`
        )
        .all() as {
        id: string;
        tenant_id: string;
        tenant_name: string;
        plan: SubscriptionPlan;
        days_granted: number;
        amount_usd: number;
        payment_ref: string;
        created_at: string;
      }[]
    ).map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      tenantName: r.tenant_name,
      plan: r.plan,
      daysGranted: Number(r.days_granted),
      amountUsd: Number(r.amount_usd),
      paymentRef: r.payment_ref,
      createdAt: r.created_at,
    }));

    return {
      engine: 'node:sqlite (Native WAL)',
      sqliteVersion: verRow.v,
      journalMode: journalRow.journal_mode.toUpperCase(),
      dbPath:
        this.conn.dbPath === ':memory:'
          ? ':memory:'
          : this.conn.dbPath.replace(process.cwd(), '.'),
      dbSizeBytes,
      tableCounts,
      totalTenants: Number(tenantSummary.total ?? 0),
      activeTenants: Number(tenantSummary.active_cnt ?? 0),
      suspendedTenants: Number(tenantSummary.suspended_cnt ?? 0),
      demoTenants: Number(tenantSummary.demo_cnt ?? 0),
      totalOrders: Number(gmvRow.total_orders ?? 0),
      paidOrdersGmvUsd: Number(Number(gmvRow.paid_gmv ?? 0).toFixed(2)),
      subscriptionRevenueUsd: Number(Number(subRevRow.rev ?? 0).toFixed(2)),
      recentSubscriptions,
      checkedAt: new Date().toISOString(),
    };
  }
}
