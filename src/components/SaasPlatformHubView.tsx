import {
  Activity,
  CheckCircle2,
  Code2,
  Database,
  Download,
  HardDrive,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Upload,
  Wifi,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePos } from '../context/PosContext';
import {
  exportTenantBackupFromSqlite,
  fetchSqliteEngineStats,
  restoreTenantBackupToSqlite,
} from '../lib/sqliteClient';
import { OPTIONAL_FEATURE_TOGGLES, SAAS_MODULE_REGISTRY } from '../modules/registry';
import type { PosAppState, SqliteEngineStats } from '../types/pos';
import { canAccessNavSection, isSuperAdmin } from '../utils/permissions';

export function SaasPlatformHubView() {
  const {
    state,
    activeBranch,
    activeStaff,
    platformSettings,
    setDemoUsersDisabled,
    sseConnected,
    cloudStatus,
    setNavSection,
    toggleTenantFeatureFlag,
    reloadTenantsFromSqlite,
    notify,
  } = usePos();

  const isAdminActor = isSuperAdmin(activeStaff);

  const [stats, setStats] = useState<SqliteEngineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyBackup, setBusyBackup] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSqliteEngineStats();
      setStats(data);
    } catch {
      // ignore offline error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats, state.version]);

  const handleExportBackup = async () => {
    const tid = state.tenantId || 'tenant_lotus_bkk1';
    setBusyBackup(true);
    try {
      const snapshot = await exportTenantBackupFromSqlite(tid, state.businessCode);
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.businessCode.toLowerCase()}_sqlite_backup_${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify('Exported portable SQLite workspace backup (.json)', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Export failed', 'error');
    } finally {
      setBusyBackup(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusyBackup(true);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as { tenant?: PosAppState } & Partial<PosAppState>;
      const payload = (parsed.tenant || parsed) as PosAppState;
      if (!payload || !Array.isArray(payload.branches)) {
        throw new Error('Invalid backup file format.');
      }
      const tid = state.tenantId || 'tenant_lotus_bkk1';
      await restoreTenantBackupToSqlite(tid, payload, {
        staffRole: activeStaff.role,
        adminPin: activeStaff.role === 'admin' ? activeStaff.pin : undefined,
      });
      await reloadTenantsFromSqlite();
      await loadStats();
      notify('Workspace restored into SQLite successfully!', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Restore failed', 'error');
    } finally {
      setBusyBackup(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 rounded-2xl p-5 sm:p-6 text-white shadow-lg flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-400/15 border border-emerald-400/30 text-emerald-200 text-xs font-medium">
            <Database size={13} />
            Firebase Retired · Self-Hosted SQLite WAL Engine Active
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            SQLite Database & Modular SaaS Control Hub
          </h1>
          <p className="text-xs sm:text-sm text-emerald-100/85 max-w-2xl">
            ACID multi-tenant persistence powered by Node native SQLite ({stats?.sqliteVersion || '3.51+'}{' '}
            WAL), real-time SSE cross-device sync, append-only audit security, and pluggable module
            feature flags.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void loadStats()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-medium border border-white/15 transition"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh Telemetry
          </button>
          {isAdminActor ? (
            <button
              type="button"
              onClick={() => setDemoUsersDisabled(!platformSettings.demoUsersDisabled)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                platformSettings.demoUsersDisabled
                  ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                  : 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300'
              }`}
            >
              <ShieldCheck size={14} />
              {platformSettings.demoUsersDisabled
                ? 'Re-Enable User Demo Store'
                : 'User Demo Store: Active'}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busyBackup}
                onClick={() => void handleExportBackup()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-400 text-emerald-950 hover:bg-emerald-300 text-xs font-semibold transition disabled:opacity-60"
              >
                <Download size={14} />
                Export SQLite Backup
              </button>
              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-medium border border-white/20 cursor-pointer transition">
                <Upload size={14} />
                Restore JSON
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => void handleRestoreFile(e)}
                />
              </label>
            </>
          )}
        </div>
      </div>

      {isAdminActor && (
        <div className="rounded-2xl border border-slate-300 bg-slate-900 p-4 text-xs text-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white">
                Platform-Only Super Admin — Tenant Operational Store Data Disabled
              </div>
              <div className="text-slate-300 mt-0.5">
                Super Admin manages SaaS tenants, plans, module feature flags, and role permissions only. Private store POS orders, inventory, Purchase Orders, and Accounting ledgers are masked. Sign in to the <strong>User Demo Store</strong> (<code className="text-emerald-300">owner@lotuscafe.kh</code> / <code className="text-emerald-300">guide_chu</code>) to manage &amp; test store features.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNavSection('chain')}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 font-bold text-slate-950 hover:bg-emerald-400 whitespace-nowrap"
          >
            Manage Tenants →
          </button>
        </div>
      )}

      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Database Engine</span>
            <HardDrive size={15} className="text-emerald-700" />
          </div>
          <div className="text-lg font-bold text-slate-900">
            SQLite {stats?.sqliteVersion || '3.51'}
          </div>
          <div className="text-xs text-emerald-700 font-medium mt-1">
            {stats?.journalMode || 'WAL'} Mode · {formatBytes(stats?.dbSizeBytes || 0)}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Live Sync Bus</span>
            <Wifi size={15} className={sseConnected ? 'text-emerald-600' : 'text-amber-600'} />
          </div>
          <div className="text-lg font-bold text-slate-900">
            {cloudStatus === 'synced' ? 'ACID Synced' : cloudStatus.toUpperCase()}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            SSE Stream: {sseConnected ? 'Connected' : 'Standby'} · Rev #{state.version || 1}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>SaaS Tenants</span>
            <ShieldCheck size={15} className="text-blue-600" />
          </div>
          <div className="text-lg font-bold text-slate-900">
            {stats?.totalTenants ?? 1} Workspace(s)
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {stats?.activeTenants ?? 1} active · {stats?.suspendedTenants ?? 0} suspended
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>{isAdminActor ? 'SaaS Billing Revenue' : 'SQLite Settled GMV'}</span>
            <Activity size={15} className="text-purple-600" />
          </div>
          <div className="text-lg font-bold text-slate-900">
            $
            {(isAdminActor
              ? stats?.subscriptionRevenueUsd ?? 0
              : stats?.paidOrdersGmvUsd ?? 0
            ).toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {isAdminActor
              ? 'Tenant store GMV masked for privacy'
              : `${stats?.totalOrders ?? state.orders.length} orders · SaaS Billing $${(stats?.subscriptionRevenueUsd ?? 0).toFixed(2)}`}
          </div>
        </div>
      </div>

      {/* Modular SaaS Feature Flags + SQLite Table Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Per-Tenant Feature Flags */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sliders size={17} className="text-emerald-700" />
                Workspace Modular Feature Flags ({state.shopName})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Enable or hide optional SaaS modules per tenant. Stored in{' '}
                <code className="px-1 py-0.5 bg-slate-100 rounded text-[11px]">
                  tenant_feature_flags
                </code>{' '}
                so cashier sidebars stay clean and fast.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              {state.businessCode}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {OPTIONAL_FEATURE_TOGGLES.map((feat) => {
              const isEnabled =
                feat.key === 'reservations' && !activeBranch.reservationsEnabled
                  ? false
                  : state.featureFlags?.[feat.key] !== false;
              return (
                <div
                  key={feat.key}
                  className={`p-3.5 rounded-xl border transition flex items-start justify-between gap-3 ${
                    isEnabled
                      ? 'border-emerald-200 bg-emerald-50/35'
                      : 'border-slate-200 bg-slate-50/70 opacity-75'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                      {feat.label}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {feat.description}
                    </p>
                    {isEnabled &&
                      canAccessNavSection(activeStaff, feat.moduleId, state.ownerPermissions) && (
                        <button
                          type="button"
                          onClick={() => setNavSection(feat.moduleId)}
                          className="text-[11px] font-semibold text-emerald-700 hover:underline"
                        >
                          Open module →
                        </button>
                      )}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    onClick={() => {
                      toggleTenantFeatureFlag(feat.key, !isEnabled);
                      notify(
                        `${feat.label} ${!isEnabled ? 'enabled' : 'hidden'} for ${state.shopName}`,
                        'info'
                      );
                    }}
                    className={`w-10 h-5.5 rounded-full transition relative shrink-0 mt-0.5 ${
                      isEnabled ? 'bg-emerald-700' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${
                        isEnabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* SQLite Relational Schema Live Row Counts */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Database size={17} className="text-emerald-700" />
                SQLite Relational Tables (19)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Path: <code className="text-[11px]">{stats?.dbPath || './data/xaiwork_pos.db'}</code>
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
              <CheckCircle2 size={12} /> Foreign Keys ON
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
            {Object.entries(stats?.tableCounts || {}).map(([tableName, rowCount]) => (
              <div
                key={tableName}
                className="px-3.5 py-2 flex items-center justify-between text-xs hover:bg-slate-50"
              >
                <span className="font-mono text-slate-700">{tableName}</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-semibold">
                  {rowCount.toLocaleString()} rows
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SaaS Module Registry Directory & Developer Extensibility */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers size={17} className="text-emerald-700" />
              Registered SaaS Modules ({SAAS_MODULE_REGISTRY.length}) & Future Extensibility
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Every module in <code className="text-[11px]">src/modules/registry.ts</code>{' '}
              automatically wires into RBAC permissions, Command Palette (<kbd>Ctrl+K</kbd>), mobile
              drawer, and SQLite tables.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl font-medium">
            <Code2 size={14} /> Add migration in <code>schema.ts</code> + register in{' '}
            <code>registry.ts</code>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SAAS_MODULE_REGISTRY.map((mod) => {
            const allowed = canAccessNavSection(activeStaff, mod.id, state.ownerPermissions);
            return (
              <button
                key={mod.id}
                type="button"
                disabled={!allowed}
                onClick={() => {
                  if (allowed) setNavSection(mod.id);
                }}
                className={`text-left p-3.5 rounded-xl border transition group ${
                  allowed
                    ? 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30'
                    : 'border-slate-200 bg-slate-50/70 opacity-75 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-800">
                    {mod.title}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-600">
                    {!allowed && isAdminActor ? 'Store User Only' : mod.recommendedPlan}
                  </span>
                </div>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{mod.subtitle}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {mod.sqliteTables.map((tbl) => (
                  <span
                    key={tbl}
                    className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-mono text-slate-600"
                  >
                    {tbl}
                  </span>
                ))}
              </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent SaaS Subscription Ledger */}
      {stats && stats.recentSubscriptions.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sparkles size={15} className="text-amber-600" />
            Recent SQLite Subscription Payments Ledger
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="py-2 pr-3">Tenant</th>
                  <th className="py-2 pr-3">Plan</th>
                  <th className="py-2 pr-3">Days</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">KHQR Ref</th>
                  <th className="py-2">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.recentSubscriptions.map((sub) => (
                  <tr key={sub.id}>
                    <td className="py-2 pr-3 font-medium text-slate-900">{sub.tenantName}</td>
                    <td className="py-2 pr-3 uppercase font-semibold text-emerald-700">
                      {sub.plan}
                    </td>
                    <td className="py-2 pr-3">+{sub.daysGranted}d</td>
                    <td className="py-2 pr-3 font-semibold">${sub.amountUsd.toFixed(2)}</td>
                    <td className="py-2 pr-3 font-mono text-slate-500">{sub.paymentRef}</td>
                    <td className="py-2 text-slate-500">
                      {sub.createdAt.slice(0, 16).replace('T', ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
