import type { DatabaseSync } from 'node:sqlite';

export interface MigrationDef {
  version: number;
  name: string;
  upSql: string;
}

export const SQLITE_MIGRATIONS: MigrationDef[] = [
  {
    version: 1,
    name: '001_initial_multi_tenant_saas_pos_schema',
    upSql: `
      CREATE TABLE IF NOT EXISTS platform_settings (
        id TEXT PRIMARY KEY,
        demo_users_disabled INTEGER NOT NULL DEFAULT 0,
        maintenance_banner TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL DEFAULT 'System'
      );

      CREATE TABLE IF NOT EXISTS saas_accounts (
        uid TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'owner',
        email_verified INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        last_login_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS saas_sessions (
        token TEXT PRIMARY KEY,
        uid TEXT NOT NULL,
        active_tenant_id TEXT,
        active_staff_id TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (uid) REFERENCES saas_accounts(uid) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_saas_sessions_uid ON saas_sessions(uid);
      CREATE INDEX IF NOT EXISTS idx_saas_sessions_expires ON saas_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        owner_uid TEXT,
        shop_name TEXT NOT NULL,
        business_code TEXT NOT NULL UNIQUE COLLATE NOCASE,
        business_type TEXT NOT NULL DEFAULT 'restaurant',
        is_demo_tenant INTEGER NOT NULL DEFAULT 0,
        tenant_status TEXT NOT NULL DEFAULT 'active',
        plan TEXT NOT NULL DEFAULT 'daily',
        plan_days_left INTEGER NOT NULL DEFAULT 0,
        subscription_status TEXT NOT NULL DEFAULT 'pending',
        subscription_expires_at TEXT,
        subscription_ref TEXT,
        subscription_paid_usd REAL,
        referral_code TEXT NOT NULL DEFAULT '',
        active_branch_id TEXT NOT NULL,
        active_staff_id TEXT NOT NULL,
        owner_permissions_json TEXT NOT NULL DEFAULT '[]',
        next_order_number INTEGER NOT NULL DEFAULT 1,
        next_invoice_seq INTEGER NOT NULL DEFAULT 1,
        display_active_order_id TEXT,
        display_show_khqr INTEGER NOT NULL DEFAULT 0,
        daily_revenue_json TEXT NOT NULL DEFAULT '[]',
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tenants_owner_uid ON tenants(owner_uid);
      CREATE INDEX IF NOT EXISTS idx_tenants_business_code ON tenants(business_code);

      CREATE TABLE IF NOT EXISTS tenant_feature_flags (
        tenant_id TEXT NOT NULL,
        module_key TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, module_key),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS branches (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        exchange_rate REAL NOT NULL DEFAULT 4100,
        vat_percent REAL NOT NULL DEFAULT 10,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS staff_members (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        username TEXT NOT NULL COLLATE NOCASE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        pin TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        is_demo INTEGER NOT NULL DEFAULT 0,
        permissions_json TEXT NOT NULL DEFAULT '[]',
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_staff_tenant_username ON staff_members(tenant_id, username);

      CREATE TABLE IF NOT EXISTS menu_items (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        category TEXT NOT NULL,
        item_type TEXT NOT NULL DEFAULT 'product',
        name_en TEXT NOT NULL,
        price_usd REAL NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_menu_tenant_branch ON menu_items(tenant_id, branch_id);

      CREATE TABLE IF NOT EXISTS pos_tables (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        area TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'free',
        seats INTEGER NOT NULL DEFAULT 4,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_tables_tenant_branch ON pos_tables(tenant_id, branch_id);

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        order_number INTEGER NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        total_usd REAL NOT NULL DEFAULT 0,
        total_khr REAL NOT NULL DEFAULT 0,
        payment_method TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_orders_tenant_branch_status ON orders(tenant_id, branch_id, status);
      CREATE INDEX IF NOT EXISTS idx_orders_tenant_created ON orders(tenant_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS qr_incoming_orders (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_qr_tenant_status ON qr_incoming_orders(tenant_id, status);

      CREATE TABLE IF NOT EXISTS shifts (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        cashier_name TEXT NOT NULL,
        status TEXT NOT NULL,
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        data_json TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_shifts_tenant_branch ON shifts(tenant_id, branch_id, status);

      CREATE TABLE IF NOT EXISTS ingredients (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        name_en TEXT NOT NULL,
        on_hand REAL NOT NULL DEFAULT 0,
        min_level REAL NOT NULL DEFAULT 0,
        data_json TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS recipes (
        menu_item_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        lines_json TEXT NOT NULL,
        PRIMARY KEY (tenant_id, menu_item_id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        ingredient_id TEXT NOT NULL,
        movement_type TEXT NOT NULL,
        qty_delta REAL NOT NULL,
        created_at TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        code TEXT NOT NULL,
        status TEXT NOT NULL,
        date_time TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS promotions_loyalty (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        record_kind TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        code_or_phone TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        data_json TEXT NOT NULL,
        PRIMARY KEY (tenant_id, record_kind, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_promo_tenant_kind ON promotions_loyalty(tenant_id, record_kind);

      CREATE TABLE IF NOT EXISTS vat_invoices (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        invoice_no TEXT NOT NULL,
        invoice_type TEXT NOT NULL,
        status TEXT NOT NULL,
        total_usd REAL NOT NULL DEFAULT 0,
        date TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_invoices_tenant_date ON vat_invoices(tenant_id, date DESC);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        action TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        created_at TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_logs(tenant_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS subscription_payments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        tenant_name TEXT NOT NULL,
        plan TEXT NOT NULL,
        days_granted INTEGER NOT NULL,
        amount_usd REAL NOT NULL,
        payment_ref TEXT NOT NULL,
        paid_by_uid TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sub_payments_tenant ON subscription_payments(tenant_id, created_at DESC);
    `,
  },
  {
    version: 2,
    name: '002_accounting_and_purchase_orders_schema',
    upSql: `
      ALTER TABLE tenants ADD COLUMN next_po_seq INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE tenants ADD COLUMN next_journal_seq INTEGER NOT NULL DEFAULT 1;

      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL DEFAULT 'all',
        sort_order INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        vattin TEXT,
        payment_terms TEXT NOT NULL DEFAULT 'cod',
        active INTEGER NOT NULL DEFAULT 1,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id, active);

      CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        po_number TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        status TEXT NOT NULL,
        payment_status TEXT NOT NULL DEFAULT 'unpaid',
        total_usd REAL NOT NULL DEFAULT 0,
        balance_due_usd REAL NOT NULL DEFAULT 0,
        order_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_po_tenant_branch ON purchase_orders(tenant_id, branch_id, status);

      CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        code TEXT NOT NULL,
        name_en TEXT NOT NULL,
        account_type TEXT NOT NULL,
        normal_balance TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, code),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_coa_tenant_type ON chart_of_accounts(tenant_id, account_type);

      CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        entry_no TEXT NOT NULL,
        entry_date TEXT NOT NULL,
        source_type TEXT NOT NULL,
        total_debit_usd REAL NOT NULL DEFAULT 0,
        total_credit_usd REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_journal_tenant_date ON journal_entries(tenant_id, entry_date DESC);

      CREATE TABLE IF NOT EXISTS operating_expenses (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        voucher_no TEXT NOT NULL,
        expense_date TEXT NOT NULL,
        account_code TEXT NOT NULL,
        total_usd REAL NOT NULL DEFAULT 0,
        payment_status TEXT NOT NULL DEFAULT 'paid',
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON operating_expenses(tenant_id, expense_date DESC);
    `,
  },
];

export const TRACKED_SQLITE_TABLES = [
  'saas_accounts',
  'saas_sessions',
  'tenants',
  'tenant_feature_flags',
  'branches',
  'staff_members',
  'menu_items',
  'pos_tables',
  'orders',
  'qr_incoming_orders',
  'shifts',
  'ingredients',
  'recipes',
  'stock_movements',
  'suppliers',
  'purchase_orders',
  'chart_of_accounts',
  'journal_entries',
  'operating_expenses',
  'reservations',
  'promotions_loyalty',
  'vat_invoices',
  'audit_logs',
  'subscription_payments',
] as const;

export function runSqliteMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
    .all() as { version: number }[];
  const appliedVersions = new Set(appliedRows.map((r) => Number(r.version)));

  const insertStmt = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
  );

  for (const migration of SQLITE_MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(migration.upSql);
      insertStmt.run(migration.version, migration.name, new Date().toISOString());
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }
}
