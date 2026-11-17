import React, { useEffect, useState } from 'react';
import {
  ShoppingBag,
  Wallet,
  CalendarDays,
  ChefHat,
  Receipt,
  Clock,
  BarChart3,
  BookOpen,
  Package,
  Grid2x2,
  Tag,
  Users,
  FileSpreadsheet,
  Building2,
  History,
  Star,
  Settings,
  Bell,
  Eye,
  Wifi,
  WifiOff,
  ChevronDown,
  LogOut,
  KeyRound,
  AlertCircle,
  Check,
  X,
  QrCode,
  Plus,
  Lock,
  Database,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutGrid,
  Truck,
  Landmark,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import { getNavLabel, I18N } from '../data/i18n';
import {
  isModuleEnabledForTenant,
  MODULE_GROUP_LABELS,
  SAAS_MODULE_REGISTRY,
  type ModuleGroupId,
} from '../modules/registry';
import type { LanguageCode, NavSection } from '../types/pos';
import {
  canAccessNavSection,
  getFirstAllowedNavSection,
  isSuperAdmin,
} from '../utils/permissions';
import { isDemoStaffAccount } from '../utils/tenantAccess';
import {
  isSubscriptionActive,
  SUBSCRIPTION_PLAN_LIST,
  type SubscriptionPlan,
} from '../utils/subscription';
import { normalizeInvoiceTemplate } from '../utils/invoiceTemplate';
import { CommandPalette } from './CommandPalette';
import { CompanyLogoBadge } from './CompanyLogoBadge';
import { SubscriptionKhqrCard } from './SubscriptionKhqrCard';
import { TenantRegistrationModal } from './TenantRegistrationModal';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const {
    state,
    tenants,
    activeTenantId,
    activeBranch,
    activeStaff,
    platformSettings,
    language,
    setLanguage,
    navSection,
    setNavSection,
    setExternalMode,
    switchTenant,
    switchBranch,
    firebaseUser,
    cloudStatus,
    sseConnected,
    signInWithGoogle,
    signOutGoogle,
    exitToWelcome,
    acceptQrOrder,
    rejectQrOrder,
    toggleOfflineMode,
    syncOfflineBills,
    switchActiveStaff,
    activateTenantSubscription,
    resetDemoData,
    toasts,
    dismissToast,
    aiStockAlerts,
    dismissAiStockAlert,
    receiptOrder,
  } = usePos();

  const isAdminActor = isSuperAdmin(activeStaff);

  const [registerTenantOpen, setRegisterTenantOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [gatePlan, setGatePlan] = useState<SubscriptionPlan>(state.plan || 'daily');
  const [gatePeriods, setGatePeriods] = useState<number>(1);
  const subscriptionActive = isSubscriptionActive(state.subscriptionStatus, state.planDaysLeft);

  const t = I18N[language];
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  );
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [pinSwitchModal, setPinSwitchModal] = useState(false);
  const [targetStaffId, setTargetStaffId] = useState(activeStaff.id);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [supportText, setSupportText] = useState('');
  const [supportSentCode, setSupportSentCode] = useState('');

  useEffect(() => {
    const id = setInterval(() => {
      setClock(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      );
    }, 15000);
    return () => clearInterval(id);
  }, []);

  // Global keyboard shortcuts: Ctrl+K / Cmd+K for Command Palette, Alt+1..4 for fast operations
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      } else if (!isAdminActor && e.altKey && e.key === '1') {
        e.preventDefault();
        setNavSection('sell');
      } else if (!isAdminActor && e.altKey && e.key === '2') {
        e.preventDefault();
        setNavSection('kds');
      } else if (!isAdminActor && e.altKey && e.key === '3') {
        e.preventDefault();
        setNavSection('todays_money');
      } else if (!isAdminActor && e.altKey && e.key === '4') {
        e.preventDefault();
        setNavSection('bills');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAdminActor, setNavSection]);

  const currentShift = state.shifts.find(
    (s) => s.branchId === activeBranch.id && s.status === 'open'
  );
  const pendingQr = isAdminActor
    ? []
    : state.qrQueue.filter((q) => q.branchId === activeBranch.id && q.status === 'pending');
  const lowIngredients = isAdminActor
    ? []
    : state.ingredients.filter((i) => i.branchId === activeBranch.id && i.onHand <= i.minLevel);
  const branchAiStockAlerts = isAdminActor
    ? []
    : aiStockAlerts.filter((a) => a.branchId === activeBranch.id);
  const aiAlertIngredientIds = new Set(branchAiStockAlerts.map((a) => a.ingredientId));
  const extraLowIngredients = lowIngredients.filter((i) => !aiAlertIngredientIds.has(i.id));
  const offlineBillsCount = state.orders.filter((o) => o.offlinePendingSync).length;
  const totalNotifications =
    pendingQr.length + branchAiStockAlerts.length + extraLowIngredients.length;

  const navItems: {
    id: NavSection;
    icon: typeof ShoppingBag;
    group: ModuleGroupId;
    simple?: boolean;
    hiddenIf?: boolean;
  }[] = [
    { id: 'sell', icon: ShoppingBag, group: 'operations', simple: true },
    { id: 'kds', icon: ChefHat, group: 'operations' },
    { id: 'todays_money', icon: Wallet, group: 'operations', simple: true },
    { id: 'bills', icon: Receipt, group: 'operations', simple: true },
    {
      id: 'reservations',
      icon: CalendarDays,
      group: 'operations',
      hiddenIf: !activeBranch.reservationsEnabled,
    },
    { id: 'shift_drawer', icon: Clock, group: 'operations' },
    { id: 'menu_prices', icon: BookOpen, group: 'catalog_crm' },
    { id: 'stock', icon: Package, group: 'catalog_crm' },
    { id: 'purchase_orders', icon: Truck, group: 'catalog_crm' },
    { id: 'tables_areas', icon: Grid2x2, group: 'catalog_crm' },
    { id: 'promotion', icon: Tag, group: 'catalog_crm' },
    { id: 'reports', icon: BarChart3, group: 'finance_compliance' },
    { id: 'sales_book', icon: FileSpreadsheet, group: 'finance_compliance' },
    { id: 'accounting', icon: Landmark, group: 'finance_compliance' },
    { id: 'audit_log', icon: History, group: 'finance_compliance' },
    { id: 'staff', icon: Users, group: 'saas_platform' },
    { id: 'chain', icon: Building2, group: 'saas_platform' },
    { id: 'saas_hub', icon: Database, group: 'saas_platform' },
    { id: 'plan_billing', icon: Star, group: 'saas_platform' },
    { id: 'settings', icon: Settings, group: 'saas_platform', simple: true },
  ];

  const visibleNav = navItems.filter((item) => {
    if (item.hiddenIf) return false;
    if (
      !isModuleEnabledForTenant(
        item.id,
        state.featureFlags,
        activeBranch.reservationsEnabled
      )
    ) {
      return false;
    }
    if (!canAccessNavSection(activeStaff, item.id, state.ownerPermissions)) return false;
    if (activeBranch.simpleMode && activeStaff.role !== 'admin') {
      return Boolean(item.simple);
    }
    return true;
  });

  const groupedNav = (['operations', 'catalog_crm', 'finance_compliance', 'saas_platform'] as ModuleGroupId[])
    .map((grp) => ({
      group: grp,
      label: MODULE_GROUP_LABELS[grp][language],
      items: visibleNav.filter((v) => v.group === grp),
    }))
    .filter((g) => g.items.length > 0);

  const currentSectionAllowed = canAccessNavSection(
    activeStaff,
    navSection,
    state.ownerPermissions
  );
  const fallbackAllowedSection = getFirstAllowedNavSection(
    activeStaff,
    state.ownerPermissions
  );

  const handlePinSwitch = (e: React.FormEvent) => {
    e.preventDefault();
    if (switchActiveStaff(targetStaffId, pinInput)) {
      setPinSwitchModal(false);
      setPinInput('');
      setPinError('');
    } else {
      setPinError('Invalid PIN for selected staff member.');
    }
  };

  return (
    <div
      className={`h-screen overflow-hidden flex bg-[#F4F6F5] text-slate-900 ${
        receiptOrder ? 'no-print' : ''
      }`}
    >
      {/* Dark Emerald Grouped Sidebar (Collapsible Rail <-> Full SaaS Drawer) */}
      <aside
        className={`no-print hidden md:flex shrink-0 flex-col bg-[#08382D] text-emerald-100 select-none transition-all duration-200 ${
          sidebarExpanded ? 'w-56' : 'w-[82px]'
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-2.5">
          <button
            type="button"
            onClick={() => setNavSection('sell')}
            aria-label="XAIWork POS Home"
            className="flex items-center gap-2 min-w-0"
          >
            {(() => {
              const tpl = normalizeInvoiceTemplate(activeBranch.invoiceTemplate, {
                shopName: activeBranch.name || state.shopName,
                branchCode: activeBranch.code,
                businessType: state.businessType,
              });
              return (
                <CompanyLogoBadge
                  logoImageUrl={tpl.logoImageUrl}
                  logoIcon={tpl.logoIcon}
                  logoText={tpl.logoText}
                  alt={`${state.shopName} logo`}
                  className="h-9 w-9 rounded-lg text-xs shrink-0"
                  iconClassName="h-4 w-4"
                  bgClassName="bg-emerald-600"
                  textClassName="text-white"
                />
              );
            })()}
            {sidebarExpanded && (
              <div className="text-left min-w-0">
                <div className="text-xs font-bold text-white truncate">{state.shopName}</div>
                <div className="text-[10px] text-emerald-300/80 font-mono truncate">
                  {state.businessCode}
                </div>
              </div>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSidebarExpanded((v) => !v)}
            title={sidebarExpanded ? 'Collapse sidebar' : 'Expand grouped sidebar'}
            className="p-1.5 rounded-lg text-emerald-200/75 hover:bg-white/10 hover:text-white"
          >
            {sidebarExpanded ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 space-y-3 px-1.5" aria-label="POS Modules">
          {groupedNav.map((grp) => (
            <div key={grp.group} className="space-y-0.5">
              {sidebarExpanded ? (
                <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300/60">
                  {grp.label}
                </div>
              ) : (
                <div className="mx-2 my-1 border-t border-white/10 first:hidden" />
              )}
              {grp.items.map((item) => {
                const Icon = item.icon;
                const active = navSection === item.id;
                const modDef = SAAS_MODULE_REGISTRY.find((m) => m.id === item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={!sidebarExpanded ? `${getNavLabel(item.id, language)} — ${modDef?.subtitle || ''}` : undefined}
                    onClick={() => setNavSection(item.id)}
                    className={`w-full rounded-lg transition-colors ${
                      sidebarExpanded
                        ? 'flex items-center gap-2.5 px-2.5 py-2 text-left'
                        : 'flex flex-col items-center justify-center px-1 py-1.5 text-center'
                    } ${
                      active
                        ? 'bg-emerald-600/40 text-white font-semibold shadow-2xs'
                        : 'text-emerald-100/75 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span
                      className={
                        sidebarExpanded
                          ? 'text-xs truncate flex-1'
                          : 'text-[10px] leading-tight line-clamp-2 mt-0.5'
                      }
                    >
                      {getNavLabel(item.id, language)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="no-print h-14 bg-white border-b border-slate-200 px-3 sm:px-5 flex items-center justify-between gap-3">
          {/* Left: Branch Selector + Rate + Shift */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => setBranchMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-emerald-50/70 px-3 py-1.5 text-left hover:bg-emerald-50 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate max-w-[160px]">
                    {isAdminActor ? `${state.shopName} (Governance)` : activeBranch.name}
                  </div>
                  <div className="text-[10px] text-emerald-800 whitespace-nowrap">
                    {isAdminActor
                      ? `Tenant ${state.businessCode} · Switch Workspace`
                      : `Branch ${state.branches.findIndex((b) => b.id === activeBranch.id) + 1} of ${state.branches.length} · ${activeBranch.code} · ${t.switchBranch}`}
                  </div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              </button>

              {branchMenuOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-40 w-72 rounded-xl border border-slate-200 bg-white shadow-lg p-2 space-y-2">
                  {!isAdminActor && (
                    <div>
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Branches · {state.shopName}
                      </div>
                      {state.branches.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            switchBranch(b.id);
                            setBranchMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs ${
                            b.id === activeBranch.id
                              ? 'bg-emerald-50 text-emerald-900 font-semibold'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>
                            {b.name} ({b.code})
                          </span>
                          {b.id === activeBranch.id && <Check className="h-3.5 w-3.5" />}
                        </button>
                      ))}
                    </div>
                  )}

                  {isAdminActor ? (
                    <div className={isAdminActor ? '' : 'border-t border-slate-100 pt-1.5'}>
                      <div className="px-2 py-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <span>Admin Tenants ({tenants.length})</span>
                        <button
                          type="button"
                          onClick={() => {
                            setBranchMenuOpen(false);
                            setRegisterTenantOpen(true);
                          }}
                          className="inline-flex items-center gap-0.5 text-emerald-800 hover:underline normal-case font-semibold"
                        >
                          <Plus className="h-3 w-3" /> Register new
                        </button>
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {tenants.map((tn) => (
                          <button
                            key={tn.id}
                            type="button"
                            onClick={() => {
                              switchTenant(tn.id);
                              setBranchMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs ${
                              tn.id === activeTenantId
                                ? 'bg-slate-900 text-white font-semibold'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span className="truncate">{tn.name}</span>
                            <span
                              className={`text-[10px] font-mono ml-2 ${
                                tn.id === activeTenantId ? 'text-emerald-300' : 'text-slate-400'
                              }`}
                            >
                              {tn.branchCode}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-slate-100 pt-1.5 px-2.5 py-1 text-[10px] text-slate-500">
                      Tenant Workspace: <strong className="text-slate-800">{state.shopName}</strong> ({state.businessCode})
                    </div>
                  )}
                </div>
              )}
            </div>

            {isAdminActor ? (
              <div className="hidden lg:flex items-center gap-2 text-xs pl-1">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1 font-bold text-emerald-300 whitespace-nowrap">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  PLATFORM CONTROL PLANE · STORE DATA DISABLED
                </span>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700 whitespace-nowrap">
                  Plan: {state.plan.toUpperCase()} ({state.planDaysLeft}d)
                </span>
              </div>
            ) : (
              <div className="hidden lg:flex items-center gap-2.5 text-xs tabular-nums pl-1">
                {state.isDemoTenant && (
                  <div className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-bold text-indigo-900 whitespace-nowrap">
                    <span>USER DEMO STORE</span>
                    <button
                      type="button"
                      onClick={() => resetDemoData()}
                      title="Reset Demo Store POS, PO & Accounting sandbox data"
                      className="inline-flex items-center gap-0.5 rounded bg-indigo-800 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-indigo-900"
                    >
                      <RotateCcw className="h-2.5 w-2.5" /> Reset
                    </button>
                  </div>
                )}

                <span className="font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1 whitespace-nowrap">
                  1$ = {activeBranch.exchangeRate.toLocaleString()} ៛
                </span>

                <button
                  type="button"
                  onClick={() => setNavSection('shift_drawer')}
                  className={`rounded-md px-2.5 py-1 font-medium whitespace-nowrap border ${
                    currentShift
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  {currentShift
                    ? `${t.shiftOpen} · ${new Date(currentShift.openedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}`
                    : t.shiftClosed}
                </button>

                <button
                  type="button"
                  onClick={() => setNavSection('plan_billing')}
                  className={`rounded-md px-2 py-1 font-semibold whitespace-nowrap border ${
                    subscriptionActive
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                  }`}
                >
                  {state.plan.toUpperCase()} ·{' '}
                  {subscriptionActive ? `${state.planDaysLeft}d left` : 'Subscription Required'}
                </button>
              </div>
            )}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Command Palette Launcher (Ctrl+K / Cmd+K) */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title="Quick Search & Command Palette (Ctrl+K)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              <Search className="h-3.5 w-3.5 text-emerald-700" />
              <span className="hidden xl:inline">Quick Jump</span>
              <kbd className="hidden sm:inline rounded bg-white border border-slate-200 px-1.5 py-0.2 text-[10px] font-mono text-slate-500">
                ⌘K
              </kbd>
            </button>

            {/* Offline / SQLite Live Sync Button */}
            <button
              type="button"
              onClick={() => {
                if (state.offlineMode) syncOfflineBills();
                else toggleOfflineMode();
              }}
              title={
                state.offlineMode
                  ? 'Click to go online & flush queued bills to SQLite'
                  : 'SQLite WAL + SSE Sync Active (click to test offline queue)'
              }
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap ${
                state.offlineMode
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-emerald-200 bg-emerald-50/60 text-emerald-900 hover:bg-emerald-50'
              }`}
            >
              {state.offlineMode ? (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-amber-700" />
                  <span>
                    {t.offlineMode}
                    {offlineBillsCount > 0 ? ` (${offlineBillsCount})` : ''}
                  </span>
                </>
              ) : (
                <>
                  <Database className="h-3.5 w-3.5 text-emerald-700" />
                  <span>
                    {cloudStatus === 'syncing'
                      ? 'Saving SQLite...'
                      : sseConnected
                        ? 'SQLite Live'
                        : 'SQLite Synced'}
                  </span>
                </>
              )}
            </button>

            {/* Language Selector */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
              {(['kh', 'en', 'vi'] as LanguageCode[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLanguage(l)}
                  className={`px-2 py-1 rounded-md transition-colors ${
                    language === l ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {l === 'kh' ? 'ខ្មែរ' : l.toUpperCase()}
                </button>
              ))}
            </div>

            <span className="hidden xl:inline text-xs font-mono font-semibold text-slate-700 tabular-nums px-1">
              {clock}
            </span>

            {/* Guest QR Preview Shortcut (Store Users only) */}
            {!isAdminActor && (
              <button
                type="button"
                onClick={() => setExternalMode('qr')}
                title="Open Guest QR Menu (/qr)"
                aria-label="Open Guest QR Menu"
                className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              >
                <QrCode className="h-4 w-4" />
              </button>
            )}

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                aria-label="Notifications"
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              >
                <Bell className="h-4 w-4" />
                {totalNotifications > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white tabular-nums">
                    {totalNotifications}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-40 w-80 rounded-xl border border-slate-200 bg-white shadow-lg p-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                    <span className="text-xs font-bold text-slate-900">Alerts &amp; QR Orders</span>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      aria-label="Close notifications"
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {pendingQr.length === 0 &&
                  branchAiStockAlerts.length === 0 &&
                  extraLowIngredients.length === 0 ? (
                    <p className="text-xs text-slate-500 py-3 text-center">No pending alerts.</p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {pendingQr.map((qr) => (
                        <div
                          key={qr.id}
                          className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between font-semibold text-slate-900">
                            <span>QR Order · {qr.tableName}</span>
                            <span className="tabular-nums">
                              ${qr.items.reduce((s, i) => s + i.unitPriceUsd * i.qty, 0).toFixed(2)}
                            </span>
                          </div>
                          <div className="mt-1 text-slate-600">
                            {qr.items.map((i) => `${i.qty}× ${i.nameEn}`).join(', ')}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                acceptQrOrder(qr.id);
                                setNotifOpen(false);
                              }}
                              className="flex-1 rounded-md bg-emerald-800 px-2.5 py-1 font-semibold text-white hover:bg-emerald-900"
                            >
                              Accept &amp; Send
                            </button>
                            <button
                              type="button"
                              onClick={() => rejectQrOrder(qr.id)}
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}

                      {branchAiStockAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          className={`rounded-lg border p-2.5 text-xs space-y-1.5 ${
                            alert.urgency === 'out' || alert.urgency === 'critical'
                              ? 'border-red-200 bg-red-50/70'
                              : 'border-amber-200 bg-amber-50/80'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span
                                className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                  alert.urgency === 'out' || alert.urgency === 'critical'
                                    ? 'bg-red-100 text-red-900'
                                    : 'bg-amber-100 text-amber-900'
                                }`}
                              >
                                AI Stock Monitor ·{' '}
                                {alert.urgency === 'out'
                                  ? 'Out of stock'
                                  : alert.estimatedDaysRemaining !== null
                                    ? `${alert.estimatedDaysRemaining}d left`
                                    : 'Low stock'}
                              </span>
                              <div className="font-semibold text-slate-900 mt-1">
                                {alert.ingredientName} ({alert.onHand} {alert.unit})
                              </div>
                            </div>
                            <button
                              type="button"
                              aria-label={`Dismiss alert for ${alert.ingredientName}`}
                              onClick={() => dismissAiStockAlert(alert.id)}
                              className="text-slate-400 hover:text-slate-700"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-700 leading-snug">{alert.message}</p>
                          <div className="flex items-center justify-between pt-0.5">
                            <span className="text-[11px] text-slate-500">
                              Run-out: {alert.predictedRunOutDate}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setNavSection('stock');
                                setNotifOpen(false);
                              }}
                              className="font-semibold text-emerald-900 underline"
                            >
                              Open Stock
                            </button>
                          </div>
                        </div>
                      ))}

                      {extraLowIngredients.map((ing) => (
                        <div
                          key={ing.id}
                          className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs flex items-center justify-between"
                        >
                          <span>
                            Low stock: <strong>{ing.nameEn}</strong> ({ing.onHand} {ing.unit})
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setNavSection('stock');
                              setNotifOpen(false);
                            }}
                            className="font-semibold text-amber-900 underline"
                          >
                            View
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Customer Display Launcher (Store Users only) */}
            {!isAdminActor && (
              <button
                type="button"
                onClick={() => setExternalMode('display')}
                title="Open Customer Display (/display)"
                aria-label="Open Customer Display"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              >
                <Eye className="h-4 w-4" />
              </button>
            )}

            {/* Staff / Account Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white pl-1.5 pr-2.5 py-1 hover:bg-slate-50"
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                    activeStaff.role === 'admin'
                      ? 'bg-slate-900'
                      : activeStaff.role === 'owner'
                        ? 'bg-emerald-700'
                        : 'bg-amber-500'
                  }`}
                >
                  {activeStaff.name.charAt(0).toUpperCase()}
                </span>
                <div className="hidden sm:block text-left leading-tight">
                  <div className="text-xs font-semibold text-slate-900 truncate max-w-[110px]">
                    {activeStaff.name}
                  </div>
                  <div className="text-[10px] text-slate-500">{activeStaff.roleLabel}</div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {accountOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-40 w-64 rounded-xl border border-slate-200 bg-white shadow-lg p-2 text-xs">
                  <div className="px-2.5 py-2 border-b border-slate-100 mb-1">
                    <div className="font-bold text-slate-900">{activeStaff.name}</div>
                    <div className="text-slate-500">
                      {firebaseUser
                        ? firebaseUser.email
                        : state.isDemoTenant
                          ? '24h Sample Shop (Local)'
                          : `${state.shopName} (${state.businessCode})`}
                    </div>
                  </div>
                  {!firebaseUser ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        void signInWithGoogle();
                      }}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-emerald-800 font-semibold hover:bg-emerald-50"
                    >
                      <Database className="h-3.5 w-3.5" />
                      Connect SQLite Owner Session
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        void signOutGoogle();
                      }}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-slate-700 hover:bg-slate-50"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Disconnect SQLite Session
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      setTargetStaffId(activeStaff.id);
                      setPinSwitchModal(true);
                    }}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-slate-700 hover:bg-slate-50"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Switch staff by PIN
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      setExternalMode('book');
                    }}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-slate-700 hover:bg-slate-50"
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    Online booking page (/book)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      setExternalMode('group');
                    }}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-slate-700 hover:bg-slate-50"
                  >
                    <Users className="h-3.5 w-3.5" />
                    Group order link (/group)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      setSupportModalOpen(true);
                      setSupportSentCode('');
                    }}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-slate-700 hover:bg-slate-50"
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                    Report a problem
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      exitToWelcome();
                    }}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-red-700 hover:bg-red-50 mt-1 border-t border-slate-100"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out to welcome screen
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Workspace (or Subscription Activation Gate) */}
        <main className="flex-1 min-h-0 overflow-auto">
          {!subscriptionActive ? (
            <div className="p-4 sm:p-8 max-w-3xl mx-auto">
              <div className="rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden">
                <div className="bg-[#0A3D31] px-6 py-4 text-white flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">
                      <Lock className="h-5 w-5" />
                    </div>
                    <div>
                      <h1 className="text-base font-bold">
                        Subscription Required to Use {state.shopName}
                      </h1>
                      <p className="text-xs text-emerald-100/85">
                        Activate your tenant workspace with Bakong KHQR (starting at $1 / day)
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={exitToWelcome}
                    className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                  >
                    Switch / Sign Out
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div
                    className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
                    role="radiogroup"
                    aria-label="Choose activation plan"
                  >
                    {SUBSCRIPTION_PLAN_LIST.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={gatePlan === p.id}
                        onClick={() => {
                          setGatePlan(p.id);
                          setGatePeriods(1);
                        }}
                        className={`rounded-xl border p-3 text-left text-xs transition-all ${
                          gatePlan === p.id
                            ? 'border-emerald-700 bg-emerald-50/70 ring-1 ring-emerald-700'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{p.name}</span>
                          <span className="font-extrabold text-emerald-800 tabular-nums">
                            {p.billingLabel}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">{p.tagline}</p>
                      </button>
                    ))}
                  </div>

                  <SubscriptionKhqrCard
                    plan={gatePlan}
                    periods={gatePeriods}
                    onPeriodsChange={setGatePeriods}
                    businessCode={state.businessCode}
                    businessName={state.shopName}
                    exchangeRate={activeBranch.exchangeRate}
                    initialCurrency={activeBranch.khqrDefaultCurrency || 'USD'}
                    confirmLabel="Confirm Paid (Sandbox) & Unlock POS"
                    onPaymentConfirmed={(res) => activateTenantSubscription(res)}
                  />
                </div>
              </div>
            </div>
          ) : !currentSectionAllowed ? (
            <div className="p-6 max-w-lg mx-auto">
              <div className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-base font-bold text-slate-900">
                      Permission Restricted
                    </h1>
                    <p className="text-xs text-slate-500">
                      Signed in as <strong>{activeStaff.name}</strong> ({activeStaff.roleLabel})
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Your current account does not hold the <span className="font-mono font-semibold">{navSection}</span>{' '}
                  permission in <strong>{state.shopName}</strong>. Ask your Tenant Owner or Super Admin to grant access, or switch staff by PIN.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNavSection(fallbackAllowedSection)}
                    className="rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
                  >
                    Go to {getNavLabel(fallbackAllowedSection, language)}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetStaffId(activeStaff.id);
                      setPinSwitchModal(true);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Switch Staff by PIN
                  </button>
                </div>
              </div>
            </div>
          ) : (
            children
          )}
        </main>

        {/* Mobile Bottom Navigation + All Modules Drawer Trigger */}
        <nav className="no-print md:hidden border-t border-slate-200 bg-white px-2 py-1.5 flex items-center justify-around text-[11px]">
          {(['sell', 'kds', 'todays_money', 'bills'] as NavSection[])
            .filter((id) => canAccessNavSection(activeStaff, id, state.ownerPermissions))
            .map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setNavSection(id);
                  setMobileDrawerOpen(false);
                }}
                className={`px-2.5 py-1.5 rounded-lg font-medium ${
                  navSection === id ? 'bg-emerald-800 text-white' : 'text-slate-600'
                }`}
              >
                {getNavLabel(id, language)}
              </button>
            ))}
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold bg-slate-100 text-slate-800"
          >
            <LayoutGrid className="h-3.5 w-3.5 text-emerald-700" />
            Modules ({visibleNav.length})
          </button>
        </nav>
      </div>

      {/* Mobile All-Modules Drawer */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden bg-slate-900/50 flex flex-col justify-end"
          onClick={() => setMobileDrawerOpen(false)}
        >
          <div
            className="bg-white rounded-t-2xl max-h-[82vh] overflow-y-auto p-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">All SaaS Modules</h3>
                <p className="text-[11px] text-slate-500">
                  {state.shopName} · {activeBranch.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1.5 rounded-lg bg-slate-100 text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {groupedNav.map((grp) => (
              <div key={grp.group} className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {grp.label}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {grp.items.map((item) => {
                    const Icon = item.icon;
                    const active = navSection === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setNavSection(item.id);
                          setMobileDrawerOpen(false);
                        }}
                        className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center ${
                          active
                            ? 'border-emerald-700 bg-emerald-50 text-emerald-950 font-semibold'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        <Icon className="h-4 w-4 mb-1 text-emerald-800" />
                        <span className="text-[11px] leading-tight">
                          {getNavLabel(item.id, language)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating Toast Notification Stack */}
      {toasts.length > 0 && (
        <div className="no-print fixed bottom-16 md:bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-xs font-medium shadow-lg border backdrop-blur-xs ${
                toast.tone === 'success'
                  ? 'bg-emerald-950/95 text-emerald-50 border-emerald-700'
                  : toast.tone === 'warning'
                    ? 'bg-amber-950/95 text-amber-50 border-amber-700'
                    : toast.tone === 'error'
                      ? 'bg-red-950/95 text-red-50 border-red-700'
                      : 'bg-slate-900/95 text-white border-slate-700'
              }`}
            >
              <span>{toast.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-white/60 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Staff PIN Switch Modal */}
      {pinSwitchModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Switch staff by PIN"
        >
          <form
            onSubmit={handlePinSwitch}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-3"
          >
            <h3 className="text-base font-bold text-slate-900">Switch staff account</h3>
            <div>
              <label htmlFor="switch-staff-select" className="block text-xs font-semibold text-slate-700 mb-1">
                Staff member
              </label>
              <select
                id="switch-staff-select"
                value={targetStaffId}
                onChange={(e) => setTargetStaffId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {state.staff
                  .filter(
                    (s) =>
                      s.active &&
                      !(platformSettings.demoUsersDisabled && isDemoStaffAccount(s, state))
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.roleLabel}) — PIN {s.pin}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor="switch-staff-pin" className="block text-xs font-semibold text-slate-700 mb-1">
                4-digit PIN
              </label>
              <input
                id="switch-staff-pin"
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Enter PIN"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            {pinError && <p className="text-xs text-red-600">{pinError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPinSwitchModal(false)}
                className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
              >
                Switch
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Report a Problem Modal */}
      {supportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Report a problem"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-slate-900">Report a problem to Support</h3>
            {supportSentCode ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                Support ticket logged with code <strong className="font-mono">{supportSentCode}</strong>.
                XAIWork support team has received your branch diagnostics.
              </div>
            ) : (
              <>
                <textarea
                  rows={3}
                  value={supportText}
                  onChange={(e) => setSupportText(e.target.value)}
                  placeholder="Describe what happened..."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSupportModalOpen(false)}
                    className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!supportText.trim()) return;
                      setSupportSentCode(`SUP-${Math.floor(100000 + Math.random() * 900000)}`);
                      setSupportText('');
                    }}
                    className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white"
                  >
                    Send report
                  </button>
                </div>
              </>
            )}
            {supportSentCode && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setSupportModalOpen(false)}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <TenantRegistrationModal
        open={registerTenantOpen}
        onClose={() => setRegisterTenantOpen(false)}
      />
    </div>
  );
}
