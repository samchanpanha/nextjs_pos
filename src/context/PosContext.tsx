import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import {
  createAuditLogInFirestore,
  createInvoiceInFirestore,
  ensureAdminInFirestore,
  ensureUserAndShop,
  fetchPlatformConfigFromFirestore,
  getShopIdForTenant,
  listUserShopsFromFirestore,
  registerTenantInFirestore,
  savePlatformConfigInFirestore,
  syncBranchToFirestore,
  syncIngredientToFirestore,
  syncMenuItemToFirestore,
  syncOrderToFirestore,
  syncReservationToFirestore,
  syncShiftToFirestore,
  syncStaffMemberToFirestore,
  syncTableToFirestore,
  updateShopOwnerPermissionsInFirestore,
  updateShopSubscriptionInFirestore,
  updateShopTenantStatusInFirestore,
} from '../lib/firestoreSync';
import {
  createSeedState,
  createTenantSeedState,
  type DemoPresetType,
  type RegisterTenantParams,
} from '../data/seedData';
import type {
  AuditLogEntry,
  BranchConfig,
  ExternalMode,
  Ingredient,
  LanguageCode,
  MenuItem,
  NavSection,
  OrderChannel,
  PettyCashEntry,
  PlatformSettings,
  PosAppState,
  PosOrder,
  PosTable,
  PrepaidPackTemplate,
  QrIncomingOrder,
  Reservation,
  ShiftRecord,
  StaffMember,
  TenantStatus,
  TenantSummary,
  VatInvoice,
} from '../types/pos';
import {
  calculateDrawerReconciliation,
  calculateOrderTotals,
  roundCurrency,
  usdToKhr,
  type OrderLineItem,
  type PromotionRule,
} from '../utils/posMath';
import {
  ALL_PERMISSIONS,
  canAssignRole,
  canEditSettings,
  canGrantPermission,
  canManageOwnerGrants,
  DEFAULT_OWNER_TENANT_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  getEffectivePermissions,
  getFirstAllowedNavSection,
  hasPermission,
  isSuperAdmin,
  normalizePermissions,
  type PermissionKey,
} from '../utils/permissions';
import {
  canEditTenantBranchSettings,
  normalizeInvoiceTemplate,
} from '../utils/invoiceTemplate';
import {
  calculateExtendedDays,
  type SubscriptionPlan,
} from '../utils/subscription';
import {
  canActorAuthenticateInTenant,
  canStartDemoMode,
  canSwitchToTenant,
  countDemoUsersAcrossTenants,
  DEFAULT_PLATFORM_SETTINGS,
  getVisibleTenantsForActor,
  isDemoStaffAccount,
  isDemoTenantWorkspace,
  resolveTenantStaffSignIn,
} from '../utils/tenantAccess';

const STORAGE_KEY = 'xaiwork_pos_state_v1';
const TENANTS_STORAGE_KEY = 'xaiwork_pos_tenants_v1';
const PLATFORM_STORAGE_KEY = 'xaiwork_pos_platform_v1';

interface MultiTenantStorage {
  activeTenantId: string;
  states: Record<string, PosAppState>;
}

interface PosContextValue {
  state: PosAppState;
  activeBranch: BranchConfig;
  activeStaff: StaffMember;
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  navSection: NavSection;
  setNavSection: (section: NavSection) => void;
  externalMode: ExternalMode;
  setExternalMode: (mode: ExternalMode) => void;
  isEnteredPos: boolean;
  platformSettings: PlatformSettings;
  demoUsersCount: number;
  setDemoUsersDisabled: (disabled: boolean) => boolean;
  setTenantStatus: (tenantId: string, status: TenantStatus) => boolean;
  deleteTenantWorkspace: (tenantId: string) => boolean;
  startDemoPreset: (preset: DemoPresetType) => void;
  staffSignIn: (
    username: string,
    pinOrPassword: string,
    businessCode?: string
  ) => { ok: boolean; error?: string };
  exitToWelcome: () => void;
  firebaseUser: User | null;
  shopId: string | null;
  authLoading: boolean;
  cloudStatus: 'demo' | 'synced' | 'syncing' | 'error';
  signInWithGoogle: () => Promise<void>;
  signOutGoogle: () => Promise<void>;
  selectedTableId: string | null;
  setSelectedTableId: (tableId: string | null) => void;
  activeOrderId: string | null;
  setActiveOrderId: (orderId: string | null) => void;
  receiptOrder: PosOrder | null;
  setReceiptOrder: (order: PosOrder | null) => void;
  tenants: TenantSummary[];
  activeTenantId: string;
  registerTenant: (params: RegisterTenantParams) => Promise<string>;
  switchTenant: (tenantId: string) => void;
  switchBranch: (branchId: string) => void;
  openTableOrder: (tableId: string) => string;
  createTakeAwayOrder: (channel: OrderChannel) => string;
  addItemToOrder: (
    orderId: string,
    item: MenuItem,
    optionLabel?: string,
    deltaUsd?: number,
    orderedBy?: string
  ) => void;
  updateOrderItemQty: (orderId: string, lineId: string, delta: number) => void;
  updateOrderItemNote: (orderId: string, lineId: string, note: string) => void;
  clearDraftItems: (orderId: string) => void;
  sendOrderToKitchen: (orderId: string) => void;
  advanceKdsOrder: (orderId: string, nextStatus: 'cooking' | 'ready' | 'served') => void;
  voidOrderItem: (orderId: string, lineId: string, managerPin: string) => boolean;
  moveOrderToTable: (orderId: string, targetTableId: string) => void;
  splitOrderItems: (orderId: string, lineIds: string[]) => string | null;
  applyOrderDiscount: (orderId: string, percent: number, flatUsd: number, managerPin: string) => boolean;
  setOrderPromoCode: (orderId: string, code: string) => void;
  attachMemberToOrder: (orderId: string, phone: string, redeemPoints: number) => void;
  applyPrepaidPack: (orderId: string, customerPackId: string) => void;
  settleOrderPayment: (
    orderId: string,
    params: {
      method: 'Cash' | 'KHQR' | 'Bank transfer' | 'Card' | 'Split';
      paidUsd: number;
      paidKhr: number;
      changeUsd: number;
      changeKhr: number;
      paymentRef?: string;
      promoDiscountUsd?: number;
      appliedPromoName?: string;
      totalUsd?: number;
      totalKhr?: number;
    }
  ) => void;
  submitGuestQrOrder: (payload: Omit<QrIncomingOrder, 'id' | 'createdAt' | 'status'>) => number;
  acceptQrOrder: (qrId: string) => void;
  rejectQrOrder: (qrId: string) => void;
  createGroupSession: (groupName: string, organiserName: string, pickupTime: string) => string;
  addGroupSessionItem: (
    sessionId: string,
    participantName: string,
    item: MenuItem,
    note?: string
  ) => void;
  submitGroupSessionToPos: (sessionId: string) => number | null;
  createReservation: (payload: Omit<Reservation, 'id' | 'code' | 'createdAt'>) => void;
  confirmReservation: (resId: string) => void;
  payReservationDeposit: (resId: string) => void;
  seatReservation: (resId: string, tableId: string) => void;
  cancelReservation: (resId: string, noShow?: boolean) => void;
  openShift: (openingUsd: number, openingKhr: number) => void;
  addPettyCash: (entry: Omit<PettyCashEntry, 'id' | 'createdAt' | 'actorName'>) => void;
  closeShift: (countedUsd: number, countedKhr: number, managerPin?: string) => boolean;
  addIngredient: (ing: Omit<Ingredient, 'id' | 'branchId' | 'used7d'>) => void;
  recordIngredientPurchase: (ingredientId: string, qtyAdded: number, totalCostUsd: number) => void;
  recordIngredientWaste: (ingredientId: string, qtyWasted: number, note: string) => void;
  recordStockCount: (ingredientId: string, actualQty: number) => void;
  saveRecipe: (menuItemId: string, lines: { ingredientId: string; qtyPerPortion: number }[]) => void;
  saveMenuItem: (item: Partial<MenuItem> & { nameEn: string; category: string; priceUsd: number; station: 'kitchen' | 'bar' }) => void;
  deleteMenuItem: (itemId: string) => void;
  importMenuItems: (
    items: { nameEn: string; nameKh: string; nameVi: string; category: string; priceUsd: number; station: 'kitchen' | 'bar' }[]
  ) => void;
  saveTable: (table: { id?: string; name: string; area: PosTable['area']; seats: number }) => void;
  deleteTable: (tableId: string) => void;
  togglePromotion: (promoId: string) => void;
  addPromotion: (promo: Omit<PromotionRule, 'id'>) => void;
  addPrepaidTemplate: (tpl: Omit<PrepaidPackTemplate, 'id'>) => void;
  sellPrepaidPack: (templateId: string, customerName: string, phone: string) => void;
  voidCustomerPack: (packId: string) => void;
  saveStaffMember: (
    member: Omit<StaffMember, 'id' | 'lastSignIn'> & { id?: string },
    targetTenantId?: string
  ) => void;
  switchActiveStaff: (staffId: string, pin: string) => boolean;
  tenantStates: Record<string, PosAppState>;
  isAdminUser: boolean;
  hasCurrentPermission: (perm: PermissionKey) => boolean;
  updateStaffPermissions: (
    staffId: string,
    permissions: PermissionKey[],
    targetTenantId?: string
  ) => boolean;
  updateTenantOwnerPermissions: (
    tenantId: string,
    ownerPermissions: PermissionKey[]
  ) => boolean;
  grantAllStaffInTenant: (targetTenantId?: string) => boolean;
  updateBranchSettingsForTenant: (
    tenantId: string,
    branchId: string,
    partial: Partial<BranchConfig>
  ) => boolean;
  issueTaxInvoice: (invoiceId: string, buyerName: string, buyerVattin: string) => void;
  createCreditNote: (invoiceId: string) => void;
  updateBranchSettings: (partial: Partial<BranchConfig>) => void;
  addBranch: (name: string, code: string) => void;
  setPlan: (plan: SubscriptionPlan) => void;
  activateTenantSubscription: (params: {
    plan: SubscriptionPlan;
    days: number;
    amountUsd: number;
    paymentRef: string;
  }) => void;
  toggleOfflineMode: () => void;
  syncOfflineBills: () => void;
  setDisplayOrder: (orderId: string | null, showKhqr: boolean) => void;
  resetDemoData: () => void;
}

const PosContext = createContext<PosContextValue | null>(null);

function normalizeTenantRbac(st: PosAppState): PosAppState {
  const ownerPermissions = Array.isArray(st.ownerPermissions)
    ? normalizePermissions(st.ownerPermissions, false)
    : [...DEFAULT_OWNER_TENANT_PERMISSIONS];
  const hasAdmin = st.staff.some((s) => s.role === 'admin');
  const baseStaff: StaffMember[] = hasAdmin
    ? st.staff
    : [
        {
          id: 'staff_admin',
          name: 'System Admin',
          username: 'admin',
          roleLabel: 'Super Admin',
          role: 'admin',
          pin: '0000',
          active: true,
          lastSignIn: new Date().toISOString().slice(0, 16).replace('T', ' '),
          permissions: [...ALL_PERMISSIONS],
        },
        ...st.staff,
      ];
  const isDemoTenant =
    typeof st.isDemoTenant === 'boolean' ? st.isDemoTenant : isDemoTenantWorkspace(st);
  const normalizedStaff: StaffMember[] = baseStaff.map((s) => ({
    ...s,
    isDemo:
      typeof s.isDemo === 'boolean'
        ? s.role === 'admin'
          ? false
          : s.isDemo
        : isDemoStaffAccount(s, { ...st, isDemoTenant }),
    permissions:
      s.role === 'admin'
        ? [...ALL_PERMISSIONS]
        : s.role === 'owner'
          ? [...ownerPermissions]
          : Array.isArray(s.permissions)
            ? normalizePermissions(s.permissions, false)
            : [...(DEFAULT_ROLE_PERMISSIONS[s.role] || [])],
  }));
  const normalizedBranches = st.branches.map((b) => ({
    ...b,
    invoiceTemplate: normalizeInvoiceTemplate(b.invoiceTemplate, {
      shopName: b.name || st.shopName,
      branchCode: b.code,
      businessType: st.businessType,
    }),
  }));
  return {
    ...st,
    isDemoTenant,
    tenantStatus: st.tenantStatus === 'suspended' ? 'suspended' : 'active',
    branches: normalizedBranches,
    ownerPermissions,
    staff: normalizedStaff,
  };
}

function loadInitialPlatformSettings(): PlatformSettings {
  try {
    const raw = localStorage.getItem(PLATFORM_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PlatformSettings;
      if (parsed && typeof parsed.demoUsersDisabled === 'boolean') {
        return {
          demoUsersDisabled: parsed.demoUsersDisabled,
          updatedAt: parsed.updatedAt,
          updatedBy: parsed.updatedBy,
        };
      }
    }
  } catch {
    // ignore corrupted storage
  }
  return DEFAULT_PLATFORM_SETTINGS;
}

function loadInitialState(): PosAppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PosAppState;
      if (parsed && Array.isArray(parsed.branches) && parsed.branches.length > 0) {
        return normalizeTenantRbac(parsed);
      }
    }
  } catch {
    // ignore corrupted storage
  }
  return createSeedState('restaurant');
}

function getInitialUrlFlags(): { autostart: boolean; mode: ExternalMode } {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.toLowerCase();
  const autostart = params.get('autostart') === '1' || path === '/pos';
  let mode: ExternalMode = 'pos';
  const m = params.get('mode');
  if (m === 'kds' || path === '/kds') mode = 'kds';
  else if (m === 'display' || path === '/display') mode = 'display';
  else if (m === 'qr' || path.startsWith('/qr')) mode = 'qr';
  else if (m === 'group' || path.startsWith('/group')) mode = 'group';
  else if (m === 'book' || path.startsWith('/book')) mode = 'book';
  return { autostart: autostart || mode !== 'pos', mode };
}

function loadMultiTenantInitial(): MultiTenantStorage {
  try {
    const multiRaw = localStorage.getItem(TENANTS_STORAGE_KEY);
    if (multiRaw) {
      const parsed = JSON.parse(multiRaw) as MultiTenantStorage;
      if (
        parsed &&
        parsed.activeTenantId &&
        parsed.states &&
        parsed.states[parsed.activeTenantId]?.branches?.length > 0
      ) {
        const normalizedStates: Record<string, PosAppState> = {};
        for (const [k, v] of Object.entries(parsed.states)) {
          normalizedStates[k] = normalizeTenantRbac(v);
        }
        return {
          activeTenantId: parsed.activeTenantId,
          states: normalizedStates,
        };
      }
    }
  } catch {
    // ignore corrupted multi-tenant storage
  }
  const single = loadInitialState();
  const tid = single.tenantId || 'tenant_lotus_bkk1';
  const normalized: PosAppState = normalizeTenantRbac({ ...single, tenantId: tid });
  return {
    activeTenantId: tid,
    states: { [tid]: normalized },
  };
}

export function PosProvider({ children }: { children: React.ReactNode }) {
  const initialFlags = useMemo(() => getInitialUrlFlags(), []);
  const initialMulti = useMemo(() => loadMultiTenantInitial(), []);
  const initialPlatform = useMemo(() => loadInitialPlatformSettings(), []);
  const [rawTenantStates, setRawTenantStates] = useState<Record<string, PosAppState>>(
    initialMulti.states
  );
  const [activeTenantId, setActiveTenantId] = useState<string>(initialMulti.activeTenantId);
  const [state, setState] = useState<PosAppState>(
    () => initialMulti.states[initialMulti.activeTenantId] || loadInitialState()
  );
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(initialPlatform);
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [navSection, setNavSection] = useState<NavSection>('sell');
  const [externalMode, setExternalMode] = useState<ExternalMode>(initialFlags.mode);
  const [isEnteredPos, setIsEnteredPos] = useState<boolean>(() => {
    if (!initialFlags.autostart) return false;
    const initState = initialMulti.states[initialMulti.activeTenantId] || loadInitialState();
    const initActor =
      initState.staff.find((s) => s.id === initState.activeStaffId) || initState.staff[0];
    return canActorAuthenticateInTenant({
      member: initActor,
      tenant: initState,
      platform: initialPlatform,
    }).ok;
  });
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<PosOrder | null>(null);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isCloudAdmin, setIsCloudAdmin] = useState<boolean>(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [cloudStatus, setCloudStatus] = useState<'demo' | 'synced' | 'syncing' | 'error'>('demo');

  useEffect(() => {
    try {
      localStorage.setItem(PLATFORM_STORAGE_KEY, JSON.stringify(platformSettings));
    } catch {
      // ignore storage quota errors
    }
  }, [platformSettings]);

  useEffect(() => {
    const tid = state.tenantId || activeTenantId;
    setRawTenantStates((prev) => {
      const nextMap = { ...prev, [tid]: state };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        localStorage.setItem(
          TENANTS_STORAGE_KEY,
          JSON.stringify({ activeTenantId: tid, states: nextMap })
        );
      } catch {
        // ignore storage quota errors
      }
      return nextMap;
    });
  }, [state, activeTenantId]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        setCloudStatus('syncing');
        try {
          const cloudAdminFlag = await ensureAdminInFirestore(user);
          setIsCloudAdmin(cloudAdminFlag);
          const sid = await ensureUserAndShop(user, state);
          setShopId(sid);
          const remotePlatform = await fetchPlatformConfigFromFirestore().catch(() => null);
          if (remotePlatform) {
            setPlatformSettings((prev) => ({ ...prev, ...remotePlatform }));
          }
          if (cloudAdminFlag) {
            setState((prev) => {
              const adminAccount = prev.staff.find((s) => s.role === 'admin');
              return adminAccount ? { ...prev, activeStaffId: adminAccount.id } : prev;
            });
          }
          // Discover any additional registered cloud tenants for this user (or all tenants for Super Admin)
          const cloudShops = await listUserShopsFromFirestore(user.uid, cloudAdminFlag);
          if (cloudShops.length > 0) {
            setRawTenantStates((prev) => {
              const next = { ...prev };
              for (const cs of cloudShops) {
                const existingKey = Object.keys(next).find(
                  (k) => next[k].businessCode.toUpperCase() === cs.businessCode.toUpperCase()
                );
                if (existingKey) {
                  next[existingKey] = normalizeTenantRbac({
                    ...next[existingKey],
                    ownerUid: cs.ownerUid,
                    tenantStatus: cs.tenantStatus,
                    isDemoTenant: cs.isDemo,
                    ownerPermissions: cs.ownerPermissions ?? next[existingKey].ownerPermissions,
                  });
                } else if (cs.name) {
                  const seeded = createTenantSeedState({
                    businessName: cs.name,
                    businessCode: cs.businessCode,
                    businessType:
                      (cs.businessType as 'restaurant' | 'cafe' | 'retail' | 'services') ||
                      'restaurant',
                    ownerName: user.displayName || 'Owner',
                    ownerPin: '1111',
                    exchangeRate: 4100,
                    vatPercent: 10,
                    khqrAccountId: cs.khqrAccountId || '',
                    khqrAccountName: cs.khqrMerchantName || cs.name,
                    khqrAccountType: 'individual',
                    khqrDefaultCurrency: 'USD',
                    plan: cs.plan,
                    planDays: cs.planDaysLeft ?? 1,
                    subscriptionStatus: cs.subscriptionStatus ?? 'active',
                    subscriptionRef: cs.subscriptionRef,
                    ownerUid: cs.ownerUid,
                  });
                  const tid = cs.shopId;
                  next[tid] = normalizeTenantRbac({
                    ...seeded,
                    tenantId: tid,
                    ownerUid: cs.ownerUid,
                    tenantStatus: cs.tenantStatus,
                    isDemoTenant: cs.isDemo,
                    ownerPermissions: cs.ownerPermissions ?? [...DEFAULT_OWNER_TENANT_PERMISSIONS],
                  });
                }
              }
              return next;
            });
          }
          setCloudStatus('synced');
        } catch (err) {
          console.error('Firebase shop sync error:', err);
          setCloudStatus('error');
        }
      } else {
        setIsCloudAdmin(false);
        setShopId(null);
        setCloudStatus('demo');
      }
      setAuthLoading(false);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allTenants = useMemo<TenantSummary[]>(() => {
    return Object.entries(rawTenantStates).map(([tid, st]) => {
      const mainBranch = st.branches[0];
      const owner = st.staff.find((s) => s.role === 'owner') || st.staff[0];
      return {
        id: tid,
        name: st.shopName,
        businessCode: st.businessCode,
        businessType: st.businessType || 'restaurant',
        ownerUid: st.ownerUid,
        isDemoTenant: st.isDemoTenant,
        tenantStatus: st.tenantStatus || 'active',
        plan: st.plan,
        planDaysLeft: st.planDaysLeft ?? 0,
        subscriptionStatus:
          st.subscriptionStatus ?? ((st.planDaysLeft ?? 0) > 0 ? 'active' : 'pending'),
        khqrAccountId: mainBranch?.khqrBakongId || '',
        khqrAccountName: mainBranch?.khqrAccountName || st.shopName,
        ownerName: owner?.name || 'Owner',
        ownerPermissions: st.ownerPermissions ?? [...DEFAULT_OWNER_TENANT_PERMISSIONS],
        branchCode: mainBranch?.code || 'MAIN',
        createdAt: st.auditLogs[st.auditLogs.length - 1]?.createdAt || new Date().toISOString(),
      };
    });
  }, [rawTenantStates]);

  const demoUsersCount = useMemo(
    () => countDemoUsersAcrossTenants(rawTenantStates),
    [rawTenantStates]
  );

  const activeBranch = useMemo(
    () => state.branches.find((b) => b.id === state.activeBranchId) || state.branches[0],
    [state.branches, state.activeBranchId]
  );

  const activeStaff = useMemo(
    () => state.staff.find((s) => s.id === state.activeStaffId) || state.staff[0],
    [state.staff, state.activeStaffId]
  );

  // Strict actor-isolated tenant list & state map:
  // Super Admin sees all multi-tenants; non-admin tenants ONLY see their own tenant's data.
  const tenants = useMemo<TenantSummary[]>(
    () =>
      getVisibleTenantsForActor({
        allTenants,
        isEnteredPos,
        actor: isEnteredPos ? activeStaff : null,
        activeTenantId: state.tenantId || activeTenantId,
        firebaseUid: firebaseUser?.uid,
        isCloudAdmin,
        platform: platformSettings,
      }),
    [
      allTenants,
      isEnteredPos,
      activeStaff,
      state.tenantId,
      activeTenantId,
      firebaseUser?.uid,
      isCloudAdmin,
      platformSettings,
    ]
  );

  const tenantStates = useMemo<Record<string, PosAppState>>(() => {
    const currentTid = state.tenantId || activeTenantId;
    if (isEnteredPos && isSuperAdmin(activeStaff)) {
      return { ...rawTenantStates, [currentTid]: state };
    }
    if (!isEnteredPos && firebaseUser && isCloudAdmin) {
      return rawTenantStates;
    }
    return { [currentTid]: state };
  }, [rawTenantStates, state, activeTenantId, isEnteredPos, activeStaff, firebaseUser, isCloudAdmin]);

  // Ensure a disabled demo user or suspended non-admin tenant cannot stay inside POS
  useEffect(() => {
    if (!isEnteredPos) return;
    const check = canActorAuthenticateInTenant({
      member: activeStaff,
      tenant: state,
      platform: platformSettings,
    });
    if (!check.ok) {
      setIsEnteredPos(false);
      setExternalMode('pos');
    }
  }, [isEnteredPos, activeStaff, state, platformSettings]);

  const appendAudit = (
    prev: PosAppState,
    action: string,
    detail: string,
    severity: AuditLogEntry['severity'] = 'info'
  ): AuditLogEntry => {
    const entry: AuditLogEntry = {
      id: `al_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      branchId: prev.activeBranchId,
      actorName: prev.staff.find((s) => s.id === prev.activeStaffId)?.name || 'Staff',
      action,
      detail,
      severity,
      createdAt: new Date().toISOString(),
    };
    if (firebaseUser && shopId && !prev.offlineMode) {
      void createAuditLogInFirestore(shopId, firebaseUser.uid, entry).catch(() => {});
    }
    return entry;
  };

  const syncOrderCloud = (order: PosOrder, offline: boolean) => {
    if (firebaseUser && shopId && !offline) {
      void syncOrderToFirestore(shopId, firebaseUser.uid, order).catch(() => {});
    }
  };

  const syncTableCloud = (table: PosTable, offline: boolean) => {
    if (firebaseUser && shopId && !offline) {
      void syncTableToFirestore(shopId, firebaseUser.uid, table).catch(() => {});
    }
  };

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
    setIsEnteredPos(true);
  };

  const signOutGoogle = async () => {
    await signOut(auth);
    setIsCloudAdmin(false);
    setShopId(null);
    setCloudStatus('demo');
  };

  const startDemoPreset = (preset: DemoPresetType) => {
    if (!canStartDemoMode(platformSettings)) return;
    const fresh = createSeedState(preset);
    setState(fresh);
    setActiveTenantId(fresh.tenantId || 'tenant_lotus_bkk1');
    setSelectedTableId(null);
    setActiveOrderId(null);
    setNavSection('sell');
    setExternalMode('pos');
    setIsEnteredPos(true);
  };

  const staffSignIn = (username: string, pinOrPassword: string, businessCode?: string) => {
    const currentTid = state.tenantId || activeTenantId;
    const mergedMap = { ...rawTenantStates, [currentTid]: state };
    const resolved = resolveTenantStaffSignIn({
      tenantStates: mergedMap,
      activeTenantId: currentTid,
      username,
      pinOrPassword,
      businessCode,
      platform: platformSettings,
    });
    if (!resolved.ok || !resolved.tenantId || !resolved.staff) {
      return {
        ok: false,
        error: resolved.error || 'Sign-in failed.',
      };
    }

    const targetTenant = normalizeTenantRbac(mergedMap[resolved.tenantId]);
    const nextState = { ...targetTenant, activeStaffId: resolved.staff.id };
    setActiveTenantId(resolved.tenantId);
    setState(nextState);
    setSelectedTableId(null);
    setActiveOrderId(null);
    if (!hasPermission(resolved.staff, navSection, nextState.ownerPermissions)) {
      setNavSection(getFirstAllowedNavSection(resolved.staff, nextState.ownerPermissions));
    }
    setExternalMode('pos');
    setIsEnteredPos(true);
    if (firebaseUser) {
      setShopId(
        resolved.tenantId.startsWith('shop_')
          ? resolved.tenantId
          : getShopIdForTenant(firebaseUser.uid, resolved.tenantId)
      );
    }
    return { ok: true };
  };

  const exitToWelcome = () => {
    setExternalMode('pos');
    setIsEnteredPos(false);
  };

  const registerTenant = async (params: RegisterTenantParams): Promise<string> => {
    const fresh = createTenantSeedState({
      ...params,
      ownerUid: firebaseUser?.uid || params.ownerUid,
    });
    const tid = fresh.tenantId!;
    setRawTenantStates((prev) => ({ ...prev, [tid]: fresh }));
    setActiveTenantId(tid);
    setState(fresh);
    setSelectedTableId(null);
    setActiveOrderId(null);
    setNavSection('sell');
    setExternalMode('pos');
    setIsEnteredPos(true);

    if (firebaseUser) {
      setCloudStatus('syncing');
      try {
        const sid = await registerTenantInFirestore(firebaseUser, fresh);
        setShopId(sid);
        setCloudStatus('synced');
      } catch (err) {
        console.error('Cloud tenant registration error:', err);
        setCloudStatus('error');
      }
    }
    return tid;
  };

  const switchTenant = (tenantId: string) => {
    const currentTid = state.tenantId || activeTenantId;
    const target = rawTenantStates[tenantId];
    if (
      !canSwitchToTenant({
        actor: isEnteredPos ? activeStaff : null,
        targetTenantId: tenantId,
        activeTenantId: currentTid,
        targetTenant: target,
        firebaseUid: firebaseUser?.uid,
        isCloudAdmin,
      })
    ) {
      return;
    }
    if (!target) return;
    const normalized = normalizeTenantRbac(target);
    // Preserve Admin persona when Super Admin switches across tenants
    const preserveAdmin = activeStaff.role === 'admin' || isCloudAdmin;
    const adminInTarget = normalized.staff.find((s) => s.role === 'admin');
    const nextState =
      preserveAdmin && adminInTarget
        ? { ...normalized, activeStaffId: adminInTarget.id }
        : normalized;
    const nextActor =
      nextState.staff.find((s) => s.id === nextState.activeStaffId) || nextState.staff[0];
    setActiveTenantId(tenantId);
    setState(nextState);
    setSelectedTableId(null);
    setActiveOrderId(null);
    if (!hasPermission(nextActor, navSection, nextState.ownerPermissions)) {
      setNavSection(getFirstAllowedNavSection(nextActor, nextState.ownerPermissions));
    }
    setExternalMode('pos');
    setIsEnteredPos(true);
    if (firebaseUser) {
      setShopId(
        tenantId.startsWith('shop_') ? tenantId : getShopIdForTenant(firebaseUser.uid, tenantId)
      );
    }
  };

  const setDemoUsersDisabled = (disabled: boolean): boolean => {
    if (!isSuperAdmin(activeStaff) && !isCloudAdmin) return false;
    const nextSettings: PlatformSettings = {
      demoUsersDisabled: disabled,
      updatedAt: new Date().toISOString(),
      updatedBy: activeStaff.name,
    };
    setPlatformSettings(nextSettings);
    setState((prev) => {
      const log = appendAudit(
        prev,
        disabled ? 'Demo users disabled' : 'Demo users enabled',
        `${activeStaff.name} ${disabled ? 'disabled' : 're-enabled'} all demo user accounts and 24h sample shops globally`,
        'warning'
      );
      return { ...prev, auditLogs: [log, ...prev.auditLogs] };
    });
    if (firebaseUser) {
      void savePlatformConfigInFirestore(firebaseUser.uid, disabled).catch(() => {});
    }
    return true;
  };

  const setTenantStatus = (tenantId: string, status: TenantStatus): boolean => {
    if (!isSuperAdmin(activeStaff) && !isCloudAdmin) return false;
    const currentTid = state.tenantId || activeTenantId;
    const target = tenantId === currentTid ? state : rawTenantStates[tenantId];
    if (!target) return false;

    const applyStatus = (prev: PosAppState): PosAppState => {
      const log = appendAudit(
        prev,
        status === 'suspended' ? 'Tenant suspended' : 'Tenant activated',
        `${activeStaff.name} set workspace ${prev.shopName} status to ${status}`,
        status === 'suspended' ? 'alert' : 'info'
      );
      return {
        ...prev,
        tenantStatus: status,
        auditLogs: [log, ...prev.auditLogs],
      };
    };

    if (tenantId === currentTid) {
      setState(applyStatus);
    } else {
      setRawTenantStates((prevMap) => ({
        ...prevMap,
        [tenantId]: prevMap[tenantId] ? applyStatus(prevMap[tenantId]) : prevMap[tenantId],
      }));
    }

    if (firebaseUser && !target.offlineMode) {
      const targetShopId =
        tenantId === currentTid && shopId
          ? shopId
          : tenantId.startsWith('shop_')
            ? tenantId
            : getShopIdForTenant(target.ownerUid || firebaseUser.uid, tenantId);
      void updateShopTenantStatusInFirestore(targetShopId, status).catch(() => {});
    }
    return true;
  };

  const deleteTenantWorkspace = (tenantId: string): boolean => {
    if (!isSuperAdmin(activeStaff) && !isCloudAdmin) return false;
    const currentTid = state.tenantId || activeTenantId;
    if (tenantId === currentTid) return false;
    if (Object.keys(rawTenantStates).length <= 1) return false;
    if (!rawTenantStates[tenantId]) return false;
    setRawTenantStates((prevMap) => {
      const copy = { ...prevMap };
      delete copy[tenantId];
      try {
        localStorage.setItem(
          TENANTS_STORAGE_KEY,
          JSON.stringify({ activeTenantId: currentTid, states: copy })
        );
      } catch {
        // ignore
      }
      return copy;
    });
    return true;
  };

  const switchBranch = (branchId: string) => {
    setState((prev) => ({ ...prev, activeBranchId: branchId }));
    setSelectedTableId(null);
    setActiveOrderId(null);
  };

  const recomputeOrderTotals = (order: PosOrder, branch: BranchConfig): PosOrder => {
    const totals = calculateOrderTotals({
      items: order.items,
      exchangeRate: branch.exchangeRate,
      rielRounding: branch.rielRounding,
      vatPercent: branch.vatPercent,
      serviceChargePercent: branch.serviceChargePercent,
      manualDiscountPercent: order.manualDiscountPercent,
      manualDiscountUsd: order.manualDiscountUsd,
      promoDiscountUsd: order.promoDiscountUsd,
      pointsRedeemed: order.pointsRedeemed,
      pointsValuePer100: branch.pointsValuePer100,
      depositAppliedUsd: order.depositAppliedUsd,
    });
    return {
      ...order,
      totalUsd: totals.totalUsd,
      totalKhr: totals.totalKhr,
      updatedAt: new Date().toISOString(),
    };
  };

  const openTableOrder = (tableId: string): string => {
    const existingTable = state.tables.find((t) => t.id === tableId);
    if (existingTable?.currentOrderId) {
      const existingOrder = state.orders.find(
        (o) => o.id === existingTable.currentOrderId && o.status !== 'paid' && o.status !== 'voided'
      );
      if (existingOrder) {
        setSelectedTableId(tableId);
        setActiveOrderId(existingOrder.id);
        return existingOrder.id;
      }
    }

    const newOrderId = `ord_${Date.now()}`;
    const orderNum = state.nextOrderNumber;
    const newOrder: PosOrder = {
      id: newOrderId,
      branchId: state.activeBranchId,
      orderNumber: orderNum,
      tableId,
      tableName: existingTable?.name || 'Table',
      channel: 'dine_in',
      status: 'open',
      guests: existingTable?.seats || 2,
      items: [],
      currentRound: 1,
      manualDiscountPercent: 0,
      manualDiscountUsd: 0,
      promoDiscountUsd: 0,
      pointsRedeemed: 0,
      depositAppliedUsd: 0,
      totalUsd: 0,
      totalKhr: 0,
      paidUsd: 0,
      paidKhr: 0,
      changeUsd: 0,
      changeKhr: 0,
      cashierName: activeStaff.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setState((prev) => {
      const updatedTables = prev.tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              status: 'occupied' as const,
              guests: t.seats,
              openedAt: new Date().toISOString(),
              currentOrderId: newOrderId,
            }
          : t
      );
      const updatedTable = updatedTables.find((t) => t.id === tableId);
      if (updatedTable) syncTableCloud(updatedTable, prev.offlineMode);
      syncOrderCloud(newOrder, prev.offlineMode);

      return {
        ...prev,
        nextOrderNumber: prev.nextOrderNumber + 1,
        orders: [newOrder, ...prev.orders],
        tables: updatedTables,
        displayActiveOrderId: newOrderId,
      };
    });

    setSelectedTableId(tableId);
    setActiveOrderId(newOrderId);
    return newOrderId;
  };

  const createTakeAwayOrder = (channel: OrderChannel): string => {
    const newOrderId = `ord_${Date.now()}`;
    const orderNum = state.nextOrderNumber;
    const labelMap: Record<string, string> = {
      take_away: `Take-away #${orderNum}`,
      grab: `Grab #${orderNum}`,
      foodpanda: `foodpanda #${orderNum}`,
    };
    const newOrder: PosOrder = {
      id: newOrderId,
      branchId: state.activeBranchId,
      orderNumber: orderNum,
      tableName: labelMap[channel] || `Take-away #${orderNum}`,
      channel,
      status: 'open',
      guests: 1,
      items: [],
      currentRound: 1,
      manualDiscountPercent: 0,
      manualDiscountUsd: 0,
      promoDiscountUsd: 0,
      pointsRedeemed: 0,
      depositAppliedUsd: 0,
      totalUsd: 0,
      totalKhr: 0,
      paidUsd: 0,
      paidKhr: 0,
      changeUsd: 0,
      changeKhr: 0,
      cashierName: activeStaff.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setState((prev) => {
      syncOrderCloud(newOrder, prev.offlineMode);
      return {
        ...prev,
        nextOrderNumber: prev.nextOrderNumber + 1,
        orders: [newOrder, ...prev.orders],
        displayActiveOrderId: newOrderId,
      };
    });
    setSelectedTableId(null);
    setActiveOrderId(newOrderId);
    return newOrderId;
  };

  const addItemToOrder = (
    orderId: string,
    item: MenuItem,
    optionLabel?: string,
    deltaUsd = 0,
    orderedBy?: string
  ) => {
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const orders = prev.orders.map((ord) => {
        if (ord.id !== orderId) return ord;
        const unitPriceUsd = roundCurrency(item.priceUsd + deltaUsd);
        const existingDraft = ord.items.find(
          (l) =>
            !l.sentToKitchen &&
            !l.voided &&
            l.menuItemId === item.id &&
            (l.optionLabel || '') === (optionLabel || '') &&
            (l.orderedBy || '') === (orderedBy || '')
        );
        let nextItems: OrderLineItem[];
        if (existingDraft) {
          nextItems = ord.items.map((l) =>
            l.id === existingDraft.id ? { ...l, qty: l.qty + 1 } : l
          );
        } else {
          const newLine: OrderLineItem = {
            id: `oi_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            menuItemId: item.id,
            nameEn: item.nameEn,
            nameKh: item.nameKh,
            nameVi: item.nameVi,
            unitPriceUsd,
            qty: 1,
            station: item.station,
            category: item.category,
            optionLabel,
            orderedBy,
            round: ord.currentRound,
            sentToKitchen: false,
            kdsStatus: 'draft',
          };
          nextItems = [...ord.items, newLine];
        }
        const updated = recomputeOrderTotals({ ...ord, items: nextItems }, branch);
        syncOrderCloud(updated, prev.offlineMode);
        return updated;
      });
      return { ...prev, orders, displayActiveOrderId: orderId };
    });
  };

  const updateOrderItemQty = (orderId: string, lineId: string, delta: number) => {
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const orders = prev.orders.map((ord) => {
        if (ord.id !== orderId) return ord;
        const nextItems = ord.items
          .map((l) => (l.id === lineId ? { ...l, qty: l.qty + delta } : l))
          .filter((l) => l.qty > 0);
        const updated = recomputeOrderTotals({ ...ord, items: nextItems }, branch);
        syncOrderCloud(updated, prev.offlineMode);
        return updated;
      });
      return { ...prev, orders };
    });
  };

  const updateOrderItemNote = (orderId: string, lineId: string, note: string) => {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((ord) =>
        ord.id !== orderId
          ? ord
          : {
              ...ord,
              items: ord.items.map((l) => (l.id === lineId ? { ...l, note } : l)),
              updatedAt: new Date().toISOString(),
            }
      ),
    }));
  };

  const clearDraftItems = (orderId: string) => {
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const orders = prev.orders.map((ord) => {
        if (ord.id !== orderId) return ord;
        const nextItems = ord.items.filter((l) => l.sentToKitchen);
        return recomputeOrderTotals({ ...ord, items: nextItems }, branch);
      });
      return { ...prev, orders };
    });
  };

  const sendOrderToKitchen = (orderId: string) => {
    setState((prev) => {
      const orders = prev.orders.map((ord) => {
        if (ord.id !== orderId) return ord;
        const hasDraft = ord.items.some((l) => !l.sentToKitchen && !l.voided);
        if (!hasDraft) return ord;
        const nextItems = ord.items.map((l) =>
          !l.sentToKitchen && !l.voided
            ? { ...l, sentToKitchen: true, kdsStatus: 'new' as const }
            : l
        );
        const updated: PosOrder = {
          ...ord,
          status: ord.status === 'open' ? 'sent' : ord.status,
          currentRound: ord.currentRound + 1,
          items: nextItems,
          updatedAt: new Date().toISOString(),
        };
        syncOrderCloud(updated, prev.offlineMode);
        return updated;
      });
      return { ...prev, orders };
    });
  };

  const advanceKdsOrder = (orderId: string, nextStatus: 'cooking' | 'ready' | 'served') => {
    setState((prev) => {
      const targetOrder = prev.orders.find((o) => o.id === orderId);
      const orders = prev.orders.map((ord) => {
        if (ord.id !== orderId) return ord;
        const nextItems = ord.items.map((l) => {
          if (!l.sentToKitchen || l.voided) return l;
          return { ...l, kdsStatus: nextStatus };
        });
        const updated: PosOrder = {
          ...ord,
          status: ord.status === 'paid' ? 'paid' : nextStatus,
          items: nextItems,
          updatedAt: new Date().toISOString(),
        };
        syncOrderCloud(updated, prev.offlineMode);
        return updated;
      });

      const tables = prev.tables.map((t) => {
        if (targetOrder?.tableId && t.id === targetOrder.tableId) {
          const tableStatus =
            nextStatus === 'ready' ? 'ready' : nextStatus === 'served' ? 'occupied' : t.status;
          const updatedTable: PosTable = { ...t, status: tableStatus };
          syncTableCloud(updatedTable, prev.offlineMode);
          return updatedTable;
        }
        return t;
      });

      return { ...prev, orders, tables };
    });
  };

  const verifyManagerPin = (pin: string) =>
    state.staff.some(
      (s) =>
        s.active &&
        s.pin === pin &&
        (hasPermission(s, 'void_discount_override', state.ownerPermissions) ||
          s.role === 'admin')
    );

  const voidOrderItem = (orderId: string, lineId: string, managerPin: string): boolean => {
    if (!verifyManagerPin(managerPin)) return false;
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      let voidedLabel = '';
      const orders = prev.orders.map((ord) => {
        if (ord.id !== orderId) return ord;
        const nextItems = ord.items.map((l) => {
          if (l.id === lineId) {
            voidedLabel = `${l.qty}× ${l.nameEn}`;
            return { ...l, voided: true };
          }
          return l;
        });
        return recomputeOrderTotals({ ...ord, items: nextItems }, branch);
      });
      const log = appendAudit(prev, 'Void item', `Voided ${voidedLabel} on order ${orderId}`, 'alert');
      return { ...prev, orders, auditLogs: [log, ...prev.auditLogs] };
    });
    return true;
  };

  const moveOrderToTable = (orderId: string, targetTableId: string) => {
    setState((prev) => {
      const ord = prev.orders.find((o) => o.id === orderId);
      const targetTable = prev.tables.find((t) => t.id === targetTableId);
      if (!ord || !targetTable || targetTable.status !== 'free') return prev;
      const oldTableId = ord.tableId;
      const tables = prev.tables.map((t) => {
        if (t.id === oldTableId) {
          const freeTable: PosTable = { ...t, status: 'free', currentOrderId: undefined, guests: undefined, openedAt: undefined };
          syncTableCloud(freeTable, prev.offlineMode);
          return freeTable;
        }
        if (t.id === targetTableId) {
          const busyTable: PosTable = {
            ...t,
            status: 'occupied',
            currentOrderId: orderId,
            guests: ord.guests,
            openedAt: ord.createdAt,
          };
          syncTableCloud(busyTable, prev.offlineMode);
          return busyTable;
        }
        return t;
      });
      const orders = prev.orders.map((o) =>
        o.id === orderId ? { ...o, tableId: targetTableId, tableName: targetTable.name } : o
      );
      return { ...prev, tables, orders };
    });
    setSelectedTableId(targetTableId);
  };

  const splitOrderItems = (orderId: string, lineIds: string[]): string | null => {
    const src = state.orders.find((o) => o.id === orderId);
    if (!src || lineIds.length === 0) return null;
    const movedLines = src.items.filter((l) => lineIds.includes(l.id));
    const remainingLines = src.items.filter((l) => !lineIds.includes(l.id));
    if (movedLines.length === 0 || remainingLines.length === 0) return null;

    const newOrderId = `ord_split_${Date.now()}`;
    const branch = activeBranch;
    const splitOrder: PosOrder = recomputeOrderTotals(
      {
        ...src,
        id: newOrderId,
        orderNumber: state.nextOrderNumber,
        tableName: `${src.tableName} (Split)`,
        tableId: undefined,
        items: movedLines,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      branch
    );

    setState((prev) => {
      const orders = prev.orders.map((o) =>
        o.id === orderId ? recomputeOrderTotals({ ...o, items: remainingLines }, branch) : o
      );
      return {
        ...prev,
        nextOrderNumber: prev.nextOrderNumber + 1,
        orders: [splitOrder, ...orders],
      };
    });
    setActiveOrderId(newOrderId);
    return newOrderId;
  };

  const applyOrderDiscount = (
    orderId: string,
    percent: number,
    flatUsd: number,
    managerPin: string
  ): boolean => {
    if (percent > 10 || flatUsd > 5) {
      if (!verifyManagerPin(managerPin)) return false;
    }
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const orders = prev.orders.map((o) =>
        o.id === orderId
          ? recomputeOrderTotals(
              { ...o, manualDiscountPercent: percent, manualDiscountUsd: flatUsd },
              branch
            )
          : o
      );
      const log = appendAudit(
        prev,
        'Manual discount',
        `Applied ${percent > 0 ? `${percent}%` : `$${flatUsd}`} discount`,
        'warning'
      );
      return { ...prev, orders, auditLogs: [log, ...prev.auditLogs] };
    });
    return true;
  };

  const setOrderPromoCode = (orderId: string, code: string) => {
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const promo = prev.promotions.find(
        (p) => p.active && p.code && p.code.toUpperCase() === code.trim().toUpperCase()
      );
      const orders = prev.orders.map((o) => {
        if (o.id !== orderId) return o;
        const discountUsd = promo ? promo.discountUsd ?? 1.5 : 0;
        return recomputeOrderTotals(
          {
            ...o,
            promoCode: code.trim().toUpperCase(),
            promoDiscountUsd: discountUsd,
            appliedPromoName: promo?.nameEn,
          },
          branch
        );
      });
      return { ...prev, orders };
    });
  };

  const attachMemberToOrder = (orderId: string, phone: string, redeemPoints: number) => {
    const cleanPhone = phone.replace(/\s+/g, '');
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const member = prev.members.find((m) => m.phone.replace(/\s+/g, '') === cleanPhone);
      const safeRedeem = member ? Math.min(member.points, Math.max(0, redeemPoints)) : 0;
      const orders = prev.orders.map((o) =>
        o.id === orderId
          ? recomputeOrderTotals(
              {
                ...o,
                memberId: member?.id,
                memberPhone: cleanPhone,
                pointsRedeemed: safeRedeem,
              },
              branch
            )
          : o
      );
      return { ...prev, orders };
    });
  };

  const applyPrepaidPack = (orderId: string, customerPackId: string) => {
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const pack = prev.customerPacks.find((p) => p.id === customerPackId && p.usesLeft > 0 && p.active);
      if (!pack) return prev;
      const tpl = prev.prepaidTemplates.find((t) => t.id === pack.templateId);
      const orders = prev.orders.map((o) => {
        if (o.id !== orderId) return o;
        let usedOne = false;
        const nextItems = o.items.map((item) => {
          if (!usedOne && !item.voided && tpl?.categories.includes(item.category)) {
            usedOne = true;
            return { ...item, coveredByPack: true };
          }
          return item;
        });
        return recomputeOrderTotals({ ...o, prepaidCustomerPackId: pack.id, items: nextItems }, branch);
      });
      return { ...prev, orders };
    });
  };

  const settleOrderPayment: PosContextValue['settleOrderPayment'] = (orderId, params) => {
    const currentOrder = state.orders.find((o) => o.id === orderId);
    if (!currentOrder) return;
    const nowIso = new Date().toISOString();
    const updatedOrder: PosOrder = {
      ...currentOrder,
      status: 'paid',
      paymentMethod: params.method,
      paymentRef: params.paymentRef,
      promoDiscountUsd:
        typeof params.promoDiscountUsd === 'number'
          ? params.promoDiscountUsd
          : currentOrder.promoDiscountUsd,
      appliedPromoName: params.appliedPromoName ?? currentOrder.appliedPromoName,
      totalUsd: typeof params.totalUsd === 'number' ? params.totalUsd : currentOrder.totalUsd,
      totalKhr: typeof params.totalKhr === 'number' ? params.totalKhr : currentOrder.totalKhr,
      paidUsd: params.paidUsd,
      paidKhr: params.paidKhr,
      changeUsd: params.changeUsd,
      changeKhr: params.changeKhr,
      closedAt: nowIso,
      updatedAt: nowIso,
      offlinePendingSync: state.offlineMode,
      items: currentOrder.items.map((l) => ({
        ...l,
        sentToKitchen: true,
        kdsStatus: l.kdsStatus === 'draft' ? 'new' : l.kdsStatus,
      })),
    };
    syncOrderCloud(updatedOrder, state.offlineMode);

    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const ord = prev.orders.find((o) => o.id === orderId);
      if (!ord) return prev;

      // Free table if dine-in
      const tables = prev.tables.map((t) => {
        if (ord.tableId && t.id === ord.tableId) {
          const freeT: PosTable = {
            ...t,
            status: 'free',
            guests: undefined,
            openedAt: undefined,
            currentOrderId: undefined,
          };
          syncTableCloud(freeT, prev.offlineMode);
          return freeT;
        }
        return t;
      });

      // Deduct inventory by recipes
      const stockLogs = [...prev.stockHistory];
      const ingredients = prev.ingredients.map((ing) => ({ ...ing }));
      for (const line of ord.items.filter((l) => !l.voided)) {
        const recipe = prev.recipes.find((r) => r.menuItemId === line.menuItemId);
        if (!recipe) continue;
        for (const rLine of recipe.lines) {
          const targetIng = ingredients.find((i) => i.id === rLine.ingredientId);
          if (targetIng) {
            const deduct = rLine.qtyPerPortion * line.qty;
            targetIng.onHand = Math.max(0, roundCurrency(targetIng.onHand - deduct));
            targetIng.used7d = roundCurrency(targetIng.used7d + deduct);
            stockLogs.unshift({
              id: `sh_${Date.now()}_${Math.random()}`,
              ingredientId: targetIng.id,
              ingredientName: targetIng.nameEn,
              type: 'sale_deduct',
              qtyDelta: -deduct,
              note: `Bill #${ord.orderNumber}`,
              createdAt: nowIso,
            });
            if (firebaseUser && shopId && !prev.offlineMode) {
              void syncIngredientToFirestore(shopId, firebaseUser.uid, targetIng).catch(() => {});
            }
          }
        }
      }

      // Deduct prepaid pack use if used
      const customerPacks = prev.customerPacks.map((p) =>
        p.id === ord.prepaidCustomerPackId ? { ...p, usesLeft: Math.max(0, p.usesLeft - 1) } : p
      );

      // Update member points (no points if offline)
      const members = prev.members.map((m) => {
        if (prev.offlineMode || !ord.memberPhone || m.phone !== ord.memberPhone) return m;
        const earned = Math.floor(updatedOrder.totalUsd * branch.pointsPerDollar);
        const nextPoints = Math.max(0, m.points - ord.pointsRedeemed + earned);
        const nextSpent = roundCurrency(m.totalSpentUsd + updatedOrder.totalUsd);
        const tier: 'Member' | 'Silver' | 'Gold' =
          nextSpent >= 500 ? 'Gold' : nextSpent >= 100 ? 'Silver' : 'Member';
        return { ...m, points: nextPoints, totalSpentUsd: nextSpent, tier, lastVisit: nowIso.slice(0, 10) };
      });

      // Issue VAT invoice
      const seqStr = String(prev.nextInvoiceSeq).padStart(6, '0');
      const invoiceNo = `${branch.code}XX-2026-${seqStr}`;
      const exclVat = roundCurrency(updatedOrder.totalUsd / (1 + branch.vatPercent / 100));
      const vatAmt = roundCurrency(updatedOrder.totalUsd - exclVat);
      const newInv: VatInvoice = {
        id: `inv_${Date.now()}`,
        branchId: branch.id,
        date: nowIso.slice(0, 10),
        invoiceNo,
        invoiceType: 'commercial',
        buyerName: '—',
        buyerVattin: '',
        exclVatUsd: exclVat,
        vatUsd: vatAmt,
        totalUsd: updatedOrder.totalUsd,
        totalKhr: updatedOrder.totalKhr,
        status: 'issued',
        orderId: ord.id,
      };
      if (firebaseUser && shopId && !prev.offlineMode) {
        void createInvoiceInFirestore(shopId, firebaseUser.uid, newInv).catch(() => {});
      }

      // Update daily revenue history last bucket
      const dailyRevenueHistory = prev.dailyRevenueHistory.map((d, idx) =>
        idx === prev.dailyRevenueHistory.length - 1
          ? {
              ...d,
              netSalesUsd: roundCurrency(d.netSalesUsd + exclVat),
              bills: d.bills + 1,
              guests: d.guests + ord.guests,
            }
          : d
      );

      // Update active shift expected cash
      const shifts = prev.shifts.map((s) => {
        if (s.status !== 'open' || s.branchId !== branch.id) return s;
        if (params.method !== 'Cash' && params.method !== 'Split') return s;
        return {
          ...s,
          expectedUsd: roundCurrency(s.expectedUsd + params.paidUsd - params.changeUsd),
          expectedKhr: Math.round(s.expectedKhr + params.paidKhr - params.changeKhr),
        };
      });

      return {
        ...prev,
        orders: prev.orders.map((o) => (o.id === orderId ? updatedOrder : o)),
        tables,
        ingredients,
        stockHistory: stockLogs.slice(0, 50),
        customerPacks,
        members,
        invoices: [newInv, ...prev.invoices],
        nextInvoiceSeq: prev.nextInvoiceSeq + 1,
        dailyRevenueHistory,
        shifts,
        displayActiveOrderId: null,
        displayShowKhqr: false,
      };
    });

    setSelectedTableId(null);
    setActiveOrderId(null);
    setReceiptOrder(updatedOrder);
  };

  const submitGuestQrOrder: PosContextValue['submitGuestQrOrder'] = (payload) => {
    const num = state.nextOrderNumber;
    const qrItem: QrIncomingOrder = {
      ...payload,
      id: `qr_${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: activeBranch.qrMode === 'auto' ? 'accepted' : 'pending',
    };

    if (activeBranch.qrMode === 'auto') {
      const ordId = `ord_qr_${Date.now()}`;
      const lines: OrderLineItem[] = payload.items.map((it, idx) => ({
        id: `oi_qr_${Date.now()}_${idx}`,
        menuItemId: it.menuItemId,
        nameEn: it.nameEn,
        nameKh: it.nameKh,
        nameVi: it.nameVi,
        unitPriceUsd: it.unitPriceUsd,
        qty: it.qty,
        station: it.station,
        category: it.category,
        optionLabel: it.optionLabel,
        orderedBy: it.orderedBy,
        round: 1,
        sentToKitchen: true,
        kdsStatus: 'new',
      }));
      const ord = recomputeOrderTotals(
        {
          id: ordId,
          branchId: payload.branchId,
          orderNumber: num,
          tableId: payload.tableId,
          tableName: payload.tableName,
          channel: payload.channel,
          status: 'sent',
          guests: 1,
          items: lines,
          currentRound: 1,
          manualDiscountPercent: 0,
          manualDiscountUsd: 0,
          promoDiscountUsd: 0,
          pointsRedeemed: 0,
          memberPhone: payload.phone,
          depositAppliedUsd: 0,
          totalUsd: 0,
          totalKhr: 0,
          paidUsd: 0,
          paidKhr: 0,
          changeUsd: 0,
          changeKhr: 0,
          cashierName: 'QR Self-Order',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        activeBranch
      );
      setState((prev) => ({
        ...prev,
        nextOrderNumber: prev.nextOrderNumber + 1,
        orders: [ord, ...prev.orders],
        qrQueue: [qrItem, ...prev.qrQueue],
      }));
    } else {
      setState((prev) => ({
        ...prev,
        nextOrderNumber: prev.nextOrderNumber + 1,
        qrQueue: [qrItem, ...prev.qrQueue],
      }));
    }
    return num;
  };

  const acceptQrOrder = (qrId: string) => {
    setState((prev) => {
      const qr = prev.qrQueue.find((q) => q.id === qrId);
      if (!qr || qr.status !== 'pending') return prev;
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const existingTableOrder = qr.tableId
        ? prev.orders.find((o) => o.tableId === qr.tableId && o.status !== 'paid' && o.status !== 'voided')
        : null;

      const newLines: OrderLineItem[] = qr.items.map((it, idx) => ({
        id: `oi_qr_${Date.now()}_${idx}`,
        menuItemId: it.menuItemId,
        nameEn: it.nameEn,
        nameKh: it.nameKh,
        nameVi: it.nameVi,
        unitPriceUsd: it.unitPriceUsd,
        qty: it.qty,
        station: it.station,
        category: it.category,
        optionLabel: it.optionLabel,
        orderedBy: it.orderedBy,
        note: qr.note,
        round: existingTableOrder ? existingTableOrder.currentRound : 1,
        sentToKitchen: true,
        kdsStatus: 'new',
      }));

      let nextOrders: PosOrder[];
      let nextTables = prev.tables;
      let nextOrderNum = prev.nextOrderNumber;

      if (existingTableOrder) {
        nextOrders = prev.orders.map((o) =>
          o.id === existingTableOrder.id
            ? recomputeOrderTotals(
                { ...o, items: [...o.items, ...newLines], status: 'sent' },
                branch
              )
            : o
        );
      } else {
        const newId = `ord_qr_${Date.now()}`;
        const created = recomputeOrderTotals(
          {
            id: newId,
            branchId: qr.branchId,
            orderNumber: prev.nextOrderNumber,
            tableId: qr.tableId,
            tableName: qr.tableName,
            channel: qr.channel,
            status: 'sent',
            guests: 2,
            items: newLines,
            currentRound: 1,
            manualDiscountPercent: 0,
            manualDiscountUsd: 0,
            promoDiscountUsd: 0,
            pointsRedeemed: 0,
            memberPhone: qr.phone,
            depositAppliedUsd: 0,
            totalUsd: 0,
            totalKhr: 0,
            paidUsd: 0,
            paidKhr: 0,
            changeUsd: 0,
            changeKhr: 0,
            cashierName: 'QR Approved',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          branch
        );
        nextOrders = [created, ...prev.orders];
        nextOrderNum += 1;
        if (qr.tableId) {
          nextTables = prev.tables.map((t) =>
            t.id === qr.tableId
              ? { ...t, status: 'occupied' as const, currentOrderId: newId, openedAt: new Date().toISOString() }
              : t
          );
        }
      }

      return {
        ...prev,
        nextOrderNumber: nextOrderNum,
        orders: nextOrders,
        tables: nextTables,
        qrQueue: prev.qrQueue.map((q) => (q.id === qrId ? { ...q, status: 'accepted' } : q)),
      };
    });
  };

  const rejectQrOrder = (qrId: string) => {
    setState((prev) => ({
      ...prev,
      qrQueue: prev.qrQueue.map((q) => (q.id === qrId ? { ...q, status: 'rejected' } : q)),
    }));
  };

  const createGroupSession = (groupName: string, organiserName: string, pickupTime: string) => {
    const id = `grp_${Date.now().toString(36)}`;
    setState((prev) => ({
      ...prev,
      groupSessions: [
        {
          id,
          branchId: prev.activeBranchId,
          groupName,
          organiserName,
          pickupTime,
          items: [],
          submitted: false,
          createdAt: new Date().toISOString(),
        },
        ...prev.groupSessions,
      ],
    }));
    return id;
  };

  const addGroupSessionItem = (
    sessionId: string,
    participantName: string,
    item: MenuItem,
    note?: string
  ) => {
    setState((prev) => ({
      ...prev,
      groupSessions: prev.groupSessions.map((g) => {
        if (g.id !== sessionId || g.submitted) return g;
        return {
          ...g,
          items: [
            ...g.items,
            {
              id: `gi_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              participantName,
              menuItemId: item.id,
              nameEn: item.nameEn,
              unitPriceUsd: item.priceUsd,
              qty: 1,
              note,
            },
          ],
        };
      }),
    }));
  };

  const submitGroupSessionToPos = (sessionId: string): number | null => {
    const session = state.groupSessions.find((g) => g.id === sessionId);
    if (!session || session.submitted || session.items.length === 0) return null;
    const ordNum = state.nextOrderNumber;
    const ordId = `ord_grp_${Date.now()}`;
    const lines: OrderLineItem[] = session.items.map((gi) => {
      const m = state.menuItems.find((mi) => mi.id === gi.menuItemId);
      return {
        id: `oi_${gi.id}`,
        menuItemId: gi.menuItemId,
        nameEn: gi.nameEn,
        nameKh: m?.nameKh || gi.nameEn,
        nameVi: m?.nameVi || gi.nameEn,
        unitPriceUsd: gi.unitPriceUsd,
        qty: gi.qty,
        station: m?.station || 'kitchen',
        category: m?.category || 'Main dishes',
        note: gi.note,
        orderedBy: gi.participantName,
        round: 1,
        sentToKitchen: true,
        kdsStatus: 'new',
      };
    });

    const newOrd = recomputeOrderTotals(
      {
        id: ordId,
        branchId: session.branchId,
        orderNumber: ordNum,
        tableName: `Group · ${session.groupName} (${session.pickupTime})`,
        channel: 'group',
        status: 'sent',
        guests: session.items.length,
        items: lines,
        currentRound: 1,
        manualDiscountPercent: 0,
        manualDiscountUsd: 0,
        promoDiscountUsd: 0,
        pointsRedeemed: 0,
        depositAppliedUsd: 0,
        totalUsd: 0,
        totalKhr: 0,
        paidUsd: 0,
        paidKhr: 0,
        changeUsd: 0,
        changeKhr: 0,
        cashierName: 'Group Link',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      activeBranch
    );

    setState((prev) => ({
      ...prev,
      nextOrderNumber: prev.nextOrderNumber + 1,
      orders: [newOrd, ...prev.orders],
      groupSessions: prev.groupSessions.map((g) =>
        g.id === sessionId ? { ...g, submitted: true, orderNumber: ordNum } : g
      ),
    }));
    return ordNum;
  };

  const createReservation: PosContextValue['createReservation'] = (payload) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const res: Reservation = {
      ...payload,
      id: `res_${Date.now()}`,
      code,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => {
      if (firebaseUser && shopId && !prev.offlineMode) {
        void syncReservationToFirestore(shopId, firebaseUser.uid, res).catch(() => {});
      }
      return { ...prev, reservations: [res, ...prev.reservations] };
    });
  };

  const confirmReservation = (resId: string) => {
    setState((prev) => ({
      ...prev,
      reservations: prev.reservations.map((r) => (r.id === resId ? { ...r, status: 'confirmed' } : r)),
    }));
  };

  const payReservationDeposit = (resId: string) => {
    setState((prev) => ({
      ...prev,
      reservations: prev.reservations.map((r) => (r.id === resId ? { ...r, depositPaid: true } : r)),
    }));
  };

  const seatReservation = (resId: string, tableId: string) => {
    const res = state.reservations.find((r) => r.id === resId);
    if (!res) return;
    const ordId = openTableOrder(tableId);
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      return {
        ...prev,
        reservations: prev.reservations.map((r) =>
          r.id === resId ? { ...r, status: 'seated', tableId } : r
        ),
        orders: prev.orders.map((o) =>
          o.id === ordId
            ? recomputeOrderTotals(
                {
                  ...o,
                  guests: res.guests,
                  depositAppliedUsd: res.depositPaid ? res.depositUsd : 0,
                  reservationId: res.id,
                },
                branch
              )
            : o
        ),
      };
    });
    setNavSection('sell');
  };

  const cancelReservation = (resId: string, noShow = false) => {
    setState((prev) => ({
      ...prev,
      reservations: prev.reservations.map((r) =>
        r.id === resId ? { ...r, status: noShow ? 'no_show' : 'cancelled' } : r
      ),
    }));
  };

  const openShift = (openingUsd: number, openingKhr: number) => {
    const newShift: ShiftRecord = {
      id: `shift_${Date.now()}`,
      branchId: state.activeBranchId,
      cashierName: activeStaff.name,
      status: 'open',
      openingUsd,
      openingKhr,
      countedUsd: 0,
      countedKhr: 0,
      expectedUsd: openingUsd,
      expectedKhr: openingKhr,
      varianceUsd: 0,
      varianceKhr: 0,
      pettyCash: [],
      openedAt: new Date().toISOString(),
    };
    setState((prev) => {
      if (firebaseUser && shopId && !prev.offlineMode) {
        void syncShiftToFirestore(shopId, firebaseUser.uid, newShift).catch(() => {});
      }
      const log = appendAudit(
        prev,
        'Shift opened',
        `Opening float $${openingUsd.toFixed(2)} + ${openingKhr.toLocaleString()} ៛`
      );
      return {
        ...prev,
        shifts: [newShift, ...prev.shifts],
        auditLogs: [log, ...prev.auditLogs],
      };
    });
  };

  const addPettyCash: PosContextValue['addPettyCash'] = (entry) => {
    setState((prev) => {
      const fullEntry: PettyCashEntry = {
        ...entry,
        id: `pc_${Date.now()}`,
        actorName: activeStaff.name,
        createdAt: new Date().toISOString(),
      };
      const shifts = prev.shifts.map((s) => {
        if (s.status !== 'open' || s.branchId !== prev.activeBranchId) return s;
        const deltaUsd = entry.currency === 'USD' ? (entry.type === 'in' ? entry.amount : -entry.amount) : 0;
        const deltaKhr = entry.currency === 'KHR' ? (entry.type === 'in' ? entry.amount : -entry.amount) : 0;
        return {
          ...s,
          expectedUsd: roundCurrency(s.expectedUsd + deltaUsd),
          expectedKhr: Math.round(s.expectedKhr + deltaKhr),
          pettyCash: [fullEntry, ...s.pettyCash],
        };
      });
      return { ...prev, shifts };
    });
  };

  const closeShift = (countedUsd: number, countedKhr: number, managerPin?: string): boolean => {
    const current = state.shifts.find((s) => s.status === 'open' && s.branchId === state.activeBranchId);
    if (!current) return false;

    const recon = calculateDrawerReconciliation({
      openingUsd: current.openingUsd,
      openingKhr: current.openingKhr,
      cashPaidUsd: Math.max(0, current.expectedUsd - current.openingUsd),
      cashPaidKhr: Math.max(0, current.expectedKhr - current.openingKhr),
      cashChangeUsd: 0,
      cashChangeKhr: 0,
      pettyCashInUsd: 0,
      pettyCashOutUsd: 0,
      pettyCashInKhr: 0,
      pettyCashOutKhr: 0,
      countedUsd,
      countedKhr,
    });

    if (Math.abs(recon.varianceUsd) > activeBranch.varianceLimitUsd) {
      if (!managerPin || !verifyManagerPin(managerPin)) {
        return false;
      }
    }

    setState((prev) => {
      const closed: ShiftRecord = {
        ...current,
        status: 'closed',
        countedUsd,
        countedKhr,
        varianceUsd: recon.varianceUsd,
        varianceKhr: recon.varianceKhr,
        closedAt: new Date().toISOString(),
      };
      if (firebaseUser && shopId && !prev.offlineMode) {
        void syncShiftToFirestore(shopId, firebaseUser.uid, closed).catch(() => {});
      }
      const log = appendAudit(
        prev,
        'Shift closed',
        `Counted $${countedUsd.toFixed(2)} (variance $${recon.varianceUsd.toFixed(2)})`,
        Math.abs(recon.varianceUsd) > 0.01 ? 'warning' : 'info'
      );
      return {
        ...prev,
        shifts: prev.shifts.map((s) => (s.id === current.id ? closed : s)),
        auditLogs: [log, ...prev.auditLogs],
      };
    });
    return true;
  };

  const addIngredient: PosContextValue['addIngredient'] = (ing) => {
    const newIng: Ingredient = {
      ...ing,
      id: `ing_${Date.now()}`,
      branchId: state.activeBranchId,
      used7d: 0,
    };
    setState((prev) => {
      if (firebaseUser && shopId && !prev.offlineMode) {
        void syncIngredientToFirestore(shopId, firebaseUser.uid, newIng).catch(() => {});
      }
      return { ...prev, ingredients: [newIng, ...prev.ingredients] };
    });
  };

  const recordIngredientPurchase = (ingredientId: string, qtyAdded: number, totalCostUsd: number) => {
    setState((prev) => {
      const ing = prev.ingredients.find((i) => i.id === ingredientId);
      if (!ing || qtyAdded <= 0) return prev;
      const oldValue = ing.onHand * ing.avgCostUsd;
      const nextOnHand = ing.onHand + qtyAdded;
      const nextAvgCost = (oldValue + totalCostUsd) / nextOnHand;
      const updated = { ...ing, onHand: nextOnHand, avgCostUsd: Number(nextAvgCost.toFixed(5)) };
      return {
        ...prev,
        ingredients: prev.ingredients.map((i) => (i.id === ingredientId ? updated : i)),
        stockHistory: [
          {
            id: `sh_${Date.now()}`,
            ingredientId,
            ingredientName: ing.nameEn,
            type: 'purchase',
            qtyDelta: qtyAdded,
            costUsd: totalCostUsd,
            note: 'Goods in purchase',
            createdAt: new Date().toISOString(),
          },
          ...prev.stockHistory,
        ],
      };
    });
  };

  const recordIngredientWaste = (ingredientId: string, qtyWasted: number, note: string) => {
    setState((prev) => {
      const ing = prev.ingredients.find((i) => i.id === ingredientId);
      if (!ing || qtyWasted <= 0) return prev;
      const updated = { ...ing, onHand: Math.max(0, ing.onHand - qtyWasted) };
      return {
        ...prev,
        ingredients: prev.ingredients.map((i) => (i.id === ingredientId ? updated : i)),
        stockHistory: [
          {
            id: `sh_${Date.now()}`,
            ingredientId,
            ingredientName: ing.nameEn,
            type: 'waste',
            qtyDelta: -qtyWasted,
            note: note || 'Kitchen waste',
            createdAt: new Date().toISOString(),
          },
          ...prev.stockHistory,
        ],
      };
    });
  };

  const recordStockCount = (ingredientId: string, actualQty: number) => {
    setState((prev) => {
      const ing = prev.ingredients.find((i) => i.id === ingredientId);
      if (!ing) return prev;
      const delta = actualQty - ing.onHand;
      const updated = { ...ing, onHand: Math.max(0, actualQty) };
      return {
        ...prev,
        ingredients: prev.ingredients.map((i) => (i.id === ingredientId ? updated : i)),
        stockHistory: [
          {
            id: `sh_${Date.now()}`,
            ingredientId,
            ingredientName: ing.nameEn,
            type: 'count_adjust',
            qtyDelta: delta,
            note: 'Physical stock count',
            createdAt: new Date().toISOString(),
          },
          ...prev.stockHistory,
        ],
      };
    });
  };

  const saveRecipe = (menuItemId: string, lines: { ingredientId: string; qtyPerPortion: number }[]) => {
    setState((prev) => {
      const exists = prev.recipes.some((r) => r.menuItemId === menuItemId);
      const recipes = exists
        ? prev.recipes.map((r) => (r.menuItemId === menuItemId ? { menuItemId, lines } : r))
        : [...prev.recipes, { menuItemId, lines }];
      return { ...prev, recipes };
    });
  };

  const saveMenuItem: PosContextValue['saveMenuItem'] = (item) => {
    setState((prev) => {
      const id = item.id || `m_${Date.now()}`;
      const initials = item.nameEn
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() || '')
        .join('');
      const full: MenuItem = {
        id,
        branchId: prev.activeBranchId,
        itemType: item.itemType === 'service' ? 'service' : 'product',
        nameEn: item.nameEn,
        nameKh: item.nameKh || item.nameEn,
        nameVi: item.nameVi || item.nameEn,
        description: item.description,
        category: item.category,
        priceUsd: item.priceUsd,
        station: item.station,
        imageUrl: item.imageUrl,
        initials: initials || 'MN',
        isBestSeller: item.isBestSeller ?? false,
        isNew: item.isNew ?? false,
        active: item.active ?? true,
        options: item.options,
        oftenOrderedWith: item.oftenOrderedWith,
      };
      if (firebaseUser && shopId && !prev.offlineMode) {
        void syncMenuItemToFirestore(shopId, firebaseUser.uid, full).catch(() => {});
      }
      const exists = prev.menuItems.some((m) => m.id === id);
      return {
        ...prev,
        menuItems: exists
          ? prev.menuItems.map((m) => (m.id === id ? full : m))
          : [full, ...prev.menuItems],
      };
    });
  };

  const deleteMenuItem = (itemId: string) => {
    setState((prev) => ({
      ...prev,
      menuItems: prev.menuItems.filter((m) => m.id !== itemId),
    }));
  };

  const importMenuItems: PosContextValue['importMenuItems'] = (items) => {
    items.forEach((it) => saveMenuItem(it));
  };

  const saveTable: PosContextValue['saveTable'] = (table) => {
    setState((prev) => {
      const id = table.id || `t_${Date.now()}`;
      const full: PosTable = {
        id,
        branchId: prev.activeBranchId,
        name: table.name,
        area: table.area,
        seats: table.seats,
        status: 'free',
      };
      if (firebaseUser && shopId && !prev.offlineMode) {
        void syncTableToFirestore(shopId, firebaseUser.uid, full).catch(() => {});
      }
      const exists = prev.tables.some((t) => t.id === id);
      return {
        ...prev,
        tables: exists
          ? prev.tables.map((t) => (t.id === id ? { ...t, ...table } : t))
          : [...prev.tables, full],
      };
    });
  };

  const deleteTable = (tableId: string) => {
    setState((prev) => ({
      ...prev,
      tables: prev.tables.filter((t) => t.id !== tableId),
    }));
  };

  const togglePromotion = (promoId: string) => {
    setState((prev) => ({
      ...prev,
      promotions: prev.promotions.map((p) => (p.id === promoId ? { ...p, active: !p.active } : p)),
    }));
  };

  const addPromotion = (promo: Omit<PromotionRule, 'id'>) => {
    setState((prev) => ({
      ...prev,
      promotions: [{ ...promo, id: `promo_${Date.now()}` }, ...prev.promotions],
    }));
  };

  const addPrepaidTemplate = (tpl: Omit<PrepaidPackTemplate, 'id'>) => {
    setState((prev) => ({
      ...prev,
      prepaidTemplates: [{ ...tpl, id: `pack_${Date.now()}` }, ...prev.prepaidTemplates],
    }));
  };

  const sellPrepaidPack = (templateId: string, customerName: string, phone: string) => {
    const tpl = state.prepaidTemplates.find((t) => t.id === templateId);
    if (!tpl) return;
    const expiry = new Date(Date.now() + tpl.validDays * 86400000).toISOString().slice(0, 10);
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    setState((prev) => ({
      ...prev,
      customerPacks: [
        {
          id: `cpack_${Date.now()}`,
          templateId,
          packName: tpl.name,
          customerName,
          phone: phone.replace(/\s+/g, ''),
          code,
          usesLeft: tpl.totalUses,
          totalUses: tpl.totalUses,
          validUntil: expiry,
          branchName: activeBranch.name,
          active: true,
        },
        ...prev.customerPacks,
      ],
    }));
  };

  const voidCustomerPack = (packId: string) => {
    setState((prev) => {
      const log = appendAudit(prev, 'Void prepaid pack', `Voided pack ${packId}`, 'warning');
      return {
        ...prev,
        customerPacks: prev.customerPacks.map((p) => (p.id === packId ? { ...p, active: false } : p)),
        auditLogs: [log, ...prev.auditLogs],
      };
    });
  };

  const isAdminUser = useMemo(
    () =>
      isSuperAdmin(activeStaff) ||
      Boolean(
        firebaseUser &&
          firebaseUser.email?.toLowerCase() === 'samchanpanha2021@gmail.com' &&
          firebaseUser.emailVerified
      ),
    [activeStaff, firebaseUser]
  );

  const hasCurrentPermission = useCallback(
    (perm: PermissionKey) => hasPermission(activeStaff, perm, state.ownerPermissions),
    [activeStaff, state.ownerPermissions]
  );

  const saveStaffMember: PosContextValue['saveStaffMember'] = (member, targetTenantId) => {
    const currentTid = state.tenantId || activeTenantId;
    const tid = targetTenantId || currentTid;
    if (!isSuperAdmin(activeStaff) && tid !== currentTid) return;
    const targetTenant = tid === currentTid ? state : rawTenantStates[tid];
    if (!targetTenant) return;

    const actor = activeStaff;
    const isExisting = Boolean(member.id && targetTenant.staff.some((s) => s.id === member.id));
    const existingMember = member.id ? targetTenant.staff.find((s) => s.id === member.id) : undefined;

    if (!isExisting && !canAssignRole(actor, member.role, state.ownerPermissions)) {
      return;
    }
    if (
      isExisting &&
      existingMember &&
      actor.role !== 'admin' &&
      (existingMember.role === 'admin' || existingMember.role === 'owner' || member.role === 'admin' || member.role === 'owner')
    ) {
      return;
    }

    const id = member.id || `staff_${Date.now()}`;
    const permissions =
      member.role === 'admin'
        ? [...ALL_PERMISSIONS]
        : member.role === 'owner'
          ? [...(targetTenant.ownerPermissions ?? DEFAULT_OWNER_TENANT_PERMISSIONS)]
          : normalizePermissions(
              member.permissions ?? existingMember?.permissions ?? DEFAULT_ROLE_PERMISSIONS[member.role],
              false
            );
    const full: StaffMember = {
      ...member,
      id,
      isDemo: member.isDemo ?? existingMember?.isDemo ?? false,
      permissions,
      lastSignIn:
        existingMember?.lastSignIn || new Date().toISOString().slice(0, 16).replace('T', ' '),
    };

    const applyUpdate = (prev: PosAppState): PosAppState => {
      const exists = prev.staff.some((s) => s.id === id);
      const staff = exists ? prev.staff.map((s) => (s.id === id ? full : s)) : [...prev.staff, full];
      return { ...prev, staff };
    };

    if (tid === currentTid) {
      setState(applyUpdate);
    } else {
      setRawTenantStates((prevMap) => ({
        ...prevMap,
        [tid]: prevMap[tid] ? applyUpdate(prevMap[tid]) : prevMap[tid],
      }));
    }

    if (firebaseUser && !targetTenant.offlineMode) {
      const targetShopId =
        tid === currentTid && shopId
          ? shopId
          : tid.startsWith('shop_')
            ? tid
            : getShopIdForTenant(firebaseUser.uid, tid);
      void syncStaffMemberToFirestore(targetShopId, firebaseUser.uid, full).catch(() => {});
    }
  };

  const updateStaffPermissions: PosContextValue['updateStaffPermissions'] = (
    staffId,
    nextPermissions,
    targetTenantId
  ) => {
    const currentTid = state.tenantId || activeTenantId;
    const tid = targetTenantId || currentTid;
    if (!isSuperAdmin(activeStaff) && tid !== currentTid) return false;
    const targetTenant = tid === currentTid ? state : rawTenantStates[tid];
    if (!targetTenant) return false;
    const targetMember = targetTenant.staff.find((s) => s.id === staffId);
    if (!targetMember || targetMember.role === 'admin') return false;

    const actor = activeStaff;
    if (targetMember.role === 'owner') {
      if (!canManageOwnerGrants(actor)) return false;
      return updateTenantOwnerPermissions(tid, nextPermissions);
    }

    const currentEffective = getEffectivePermissions(targetMember, targetTenant.ownerPermissions);
    const normalizedNext = normalizePermissions(nextPermissions, false);

    // Check every added/removed permission against actor's grant authority
    const allChanged = new Set<PermissionKey>([...currentEffective, ...normalizedNext]);
    for (const perm of allChanged) {
      const was = currentEffective.includes(perm);
      const willBe = normalizedNext.includes(perm);
      if (was !== willBe && !canGrantPermission(actor, targetMember, perm, state.ownerPermissions)) {
        return false;
      }
    }

    const applyUpdate = (prev: PosAppState): PosAppState => {
      const log = appendAudit(
        prev,
        'Staff permissions updated',
        `${actor.name} updated ${targetMember.name} (${normalizedNext.length} permissions)`,
        'warning'
      );
      return {
        ...prev,
        staff: prev.staff.map((s) =>
          s.id === staffId ? { ...s, permissions: normalizedNext } : s
        ),
        auditLogs: [log, ...prev.auditLogs],
      };
    };

    if (tid === currentTid) {
      setState(applyUpdate);
    } else {
      setRawTenantStates((prevMap) => ({
        ...prevMap,
        [tid]: prevMap[tid] ? applyUpdate(prevMap[tid]) : prevMap[tid],
      }));
    }

    if (firebaseUser && !targetTenant.offlineMode) {
      const targetShopId =
        tid === currentTid && shopId
          ? shopId
          : tid.startsWith('shop_')
            ? tid
            : getShopIdForTenant(firebaseUser.uid, tid);
      void syncStaffMemberToFirestore(targetShopId, firebaseUser.uid, {
        ...targetMember,
        permissions: normalizedNext,
      }).catch(() => {});
    }

    return true;
  };

  const updateTenantOwnerPermissions: PosContextValue['updateTenantOwnerPermissions'] = (
    tenantId,
    ownerPermissions
  ) => {
    if (!canManageOwnerGrants(activeStaff)) return false;
    const currentTid = state.tenantId || activeTenantId;
    const targetTenant = tenantId === currentTid ? state : rawTenantStates[tenantId];
    if (!targetTenant) return false;

    const normalized = normalizePermissions(ownerPermissions, false);
    const applyUpdate = (prev: PosAppState): PosAppState => {
      const log = appendAudit(
        prev,
        'Tenant owner grants updated',
        `${activeStaff.name} set owner permissions for ${prev.shopName} (${normalized.length} granted)`,
        'warning'
      );
      return {
        ...prev,
        ownerPermissions: normalized,
        staff: prev.staff.map((s) =>
          s.role === 'owner' ? { ...s, permissions: normalized } : s
        ),
        auditLogs: [log, ...prev.auditLogs],
      };
    };

    if (tenantId === currentTid) {
      setState(applyUpdate);
    } else {
      setRawTenantStates((prevMap) => ({
        ...prevMap,
        [tenantId]: prevMap[tenantId] ? applyUpdate(prevMap[tenantId]) : prevMap[tenantId],
      }));
    }

    if (firebaseUser && !targetTenant.offlineMode) {
      const targetShopId =
        tenantId === currentTid && shopId
          ? shopId
          : tenantId.startsWith('shop_')
            ? tenantId
            : getShopIdForTenant(firebaseUser.uid, tenantId);
      void updateShopOwnerPermissionsInFirestore(targetShopId, normalized).catch(() => {});
      for (const ownerMember of targetTenant.staff.filter((s) => s.role === 'owner')) {
        void syncStaffMemberToFirestore(targetShopId, firebaseUser.uid, {
          ...ownerMember,
          permissions: normalized,
        }).catch(() => {});
      }
    }

    return true;
  };

  const grantAllStaffInTenant: PosContextValue['grantAllStaffInTenant'] = (targetTenantId) => {
    const currentTid = state.tenantId || activeTenantId;
    const tid = targetTenantId || currentTid;
    if (!isSuperAdmin(activeStaff) && tid !== currentTid) return false;
    const targetTenant = tid === currentTid ? state : rawTenantStates[tid];
    if (!targetTenant) return false;
    if (activeStaff.role !== 'admin' && !hasPermission(activeStaff, 'permissions_grant', state.ownerPermissions)) {
      return false;
    }
    const maxPool =
      activeStaff.role === 'admin'
        ? [...DEFAULT_OWNER_TENANT_PERMISSIONS]
        : getEffectivePermissions(activeStaff, state.ownerPermissions).filter((p) => p !== 'full_admin');

    const applyUpdate = (prev: PosAppState): PosAppState => {
      const nextOwnerPerms =
        activeStaff.role === 'admin' ? [...DEFAULT_OWNER_TENANT_PERMISSIONS] : prev.ownerPermissions;
      const log = appendAudit(
        prev,
        'Bulk full grant',
        `${activeStaff.name} granted maximum available permissions to team in ${prev.shopName}`,
        'warning'
      );
      return {
        ...prev,
        ownerPermissions: nextOwnerPerms,
        staff: prev.staff.map((s) => {
          if (s.role === 'admin') return { ...s, permissions: [...ALL_PERMISSIONS] };
          if (s.role === 'owner') {
            return activeStaff.role === 'admin' ? { ...s, permissions: [...DEFAULT_OWNER_TENANT_PERMISSIONS] } : s;
          }
          return { ...s, permissions: [...maxPool] };
        }),
        auditLogs: [log, ...prev.auditLogs],
      };
    };

    if (tid === currentTid) {
      setState(applyUpdate);
    } else {
      setRawTenantStates((prevMap) => ({
        ...prevMap,
        [tid]: prevMap[tid] ? applyUpdate(prevMap[tid]) : prevMap[tid],
      }));
    }
    return true;
  };

  const updateBranchSettingsForTenant: PosContextValue['updateBranchSettingsForTenant'] = (
    tenantId,
    branchId,
    partial
  ) => {
    const currentTid = state.tenantId || activeTenantId;
    if (
      !canEditTenantBranchSettings(
        activeStaff,
        tenantId,
        currentTid,
        state.ownerPermissions
      )
    ) {
      return false;
    }
    const targetTenant =
      tenantId === currentTid ? state : rawTenantStates[tenantId];
    if (!targetTenant) return false;
    const applyUpdate = (prev: PosAppState): PosAppState => {
      const branches = prev.branches.map((b) =>
        b.id === branchId ? { ...b, ...partial } : b
      );
      const updated = branches.find((b) => b.id === branchId);
      if (updated && firebaseUser && !prev.offlineMode) {
        const targetShopId =
          tenantId === currentTid && shopId
            ? shopId
            : tenantId.startsWith('shop_')
              ? tenantId
              : getShopIdForTenant(firebaseUser.uid, tenantId);
        void syncBranchToFirestore(targetShopId, firebaseUser.uid, updated).catch(() => {});
      }
      return { ...prev, branches };
    };
    if (tenantId === currentTid) {
      setState(applyUpdate);
    } else {
      setRawTenantStates((prevMap) => ({
        ...prevMap,
        [tenantId]: prevMap[tenantId] ? applyUpdate(prevMap[tenantId]) : prevMap[tenantId],
      }));
    }
    return true;
  };

  const switchActiveStaff = (staffId: string, pin: string): boolean => {
    const target = state.staff.find((s) => s.id === staffId && s.active);
    if (!target || target.pin !== pin) return false;
    const authCheck = canActorAuthenticateInTenant({
      member: target,
      tenant: state,
      platform: platformSettings,
    });
    if (!authCheck.ok) return false;
    setState((prev) => ({ ...prev, activeStaffId: staffId }));
    if (!hasPermission(target, navSection, state.ownerPermissions)) {
      setNavSection(getFirstAllowedNavSection(target, state.ownerPermissions));
    }
    return true;
  };

  const issueTaxInvoice = (invoiceId: string, buyerName: string, buyerVattin: string) => {
    setState((prev) => {
      const orig = prev.invoices.find((i) => i.id === invoiceId);
      if (!orig) return prev;
      const seqStr = String(prev.nextInvoiceSeq).padStart(6, '0');
      const branch = prev.branches.find((b) => b.id === orig.branchId) || prev.branches[0];
      const replacement: VatInvoice = {
        ...orig,
        id: `inv_${Date.now()}`,
        invoiceNo: `${branch.code}XX-2026-${seqStr}`,
        invoiceType: 'tax',
        buyerName,
        buyerVattin,
        status: 'issued',
        replacesInvoiceNo: orig.invoiceNo,
      };
      return {
        ...prev,
        nextInvoiceSeq: prev.nextInvoiceSeq + 1,
        invoices: [
          replacement,
          ...prev.invoices.map((i) => (i.id === invoiceId ? { ...i, status: 'replaced' as const } : i)),
        ],
      };
    });
  };

  const createCreditNote = (invoiceId: string) => {
    setState((prev) => {
      const orig = prev.invoices.find((i) => i.id === invoiceId);
      if (!orig) return prev;
      const seqStr = String(prev.nextInvoiceSeq).padStart(6, '0');
      const branch = prev.branches.find((b) => b.id === orig.branchId) || prev.branches[0];
      const cn: VatInvoice = {
        ...orig,
        id: `inv_cn_${Date.now()}`,
        invoiceNo: `${branch.code}CN-2026-${seqStr}`,
        invoiceType: 'credit_note',
        status: 'issued',
        replacesInvoiceNo: orig.invoiceNo,
      };
      const log = appendAudit(prev, 'Credit note issued', `Credit note for ${orig.invoiceNo}`, 'warning');
      return {
        ...prev,
        nextInvoiceSeq: prev.nextInvoiceSeq + 1,
        invoices: [cn, ...prev.invoices],
        auditLogs: [log, ...prev.auditLogs],
      };
    });
  };

  const updateBranchSettings = (partial: Partial<BranchConfig>) => {
    if (!canEditSettings(activeStaff, state.ownerPermissions)) return;
    setState((prev) => {
      const branches = prev.branches.map((b) =>
        b.id === prev.activeBranchId ? { ...b, ...partial } : b
      );
      const updated = branches.find((b) => b.id === prev.activeBranchId);
      if (updated && firebaseUser && shopId && !prev.offlineMode) {
        void syncBranchToFirestore(shopId, firebaseUser.uid, updated).catch(() => {});
      }
      return { ...prev, branches };
    });
  };

  const addBranch = (name: string, code: string) => {
    const newBranch: BranchConfig = {
      ...activeBranch,
      id: `branch_${Date.now()}`,
      name,
      code: code.toUpperCase().slice(0, 6),
    };
    setState((prev) => ({
      ...prev,
      branches: [...prev.branches, newBranch],
      activeBranchId: newBranch.id,
    }));
  };

  const setPlan = (plan: SubscriptionPlan) => {
    setState((prev) => ({ ...prev, plan }));
  };

  const activateTenantSubscription: PosContextValue['activateTenantSubscription'] = (params) => {
    setState((prev) => {
      const nextDays = calculateExtendedDays(
        prev.planDaysLeft,
        prev.subscriptionStatus,
        params.days
      );
      const expiresAt = new Date(Date.now() + nextDays * 86400000).toISOString();
      const log = appendAudit(
        prev,
        'Subscription paid (Bakong KHQR)',
        `Plan ${params.plan.toUpperCase()} +${params.days}d ($${params.amountUsd.toFixed(2)}) · Ref ${params.paymentRef}`,
        'info'
      );
      if (firebaseUser && shopId && !prev.offlineMode) {
        void updateShopSubscriptionInFirestore(shopId, {
          plan: params.plan,
          subscriptionStatus: 'active',
          subscriptionRef: params.paymentRef,
          planDaysLeft: nextDays,
          subscriptionExpiresAt: expiresAt,
        }).catch(() => {});
      }
      return {
        ...prev,
        plan: params.plan,
        planDaysLeft: nextDays,
        subscriptionStatus: 'active',
        subscriptionRef: params.paymentRef,
        subscriptionPaidUsd: Number(((prev.subscriptionPaidUsd ?? 0) + params.amountUsd).toFixed(2)),
        subscriptionExpiresAt: expiresAt,
        auditLogs: [log, ...prev.auditLogs],
      };
    });
  };

  const toggleOfflineMode = () => {
    setState((prev) => ({ ...prev, offlineMode: !prev.offlineMode }));
  };

  const syncOfflineBills = () => {
    setState((prev) => {
      const pending = prev.orders.filter((o) => o.offlinePendingSync);
      if (firebaseUser && shopId) {
        pending.forEach((o) => void syncOrderToFirestore(shopId, firebaseUser.uid, o).catch(() => {}));
      }
      return {
        ...prev,
        offlineMode: false,
        orders: prev.orders.map((o) => ({ ...o, offlinePendingSync: false })),
      };
    });
  };

  const setDisplayOrder = useCallback((orderId: string | null, showKhqr: boolean) => {
    setState((prev) => {
      if (prev.displayActiveOrderId === orderId && prev.displayShowKhqr === showKhqr) {
        return prev;
      }
      return { ...prev, displayActiveOrderId: orderId, displayShowKhqr: showKhqr };
    });
  }, []);

  const resetDemoData = () => {
    if (!canStartDemoMode(platformSettings)) return;
    if (!isSuperAdmin(activeStaff) && !state.isDemoTenant) return;
    const fresh = createSeedState('restaurant');
    const keepAdmin = activeStaff.role === 'admin';
    const adminUser = fresh.staff.find((s) => s.role === 'admin');
    setState(keepAdmin && adminUser ? { ...fresh, activeStaffId: adminUser.id } : fresh);
    setActiveTenantId(fresh.tenantId || 'tenant_lotus_bkk1');
    setSelectedTableId(null);
    setActiveOrderId(null);
  };

  const value: PosContextValue = {
    state,
    activeBranch,
    activeStaff,
    language,
    setLanguage,
    navSection,
    setNavSection,
    externalMode,
    setExternalMode,
    isEnteredPos,
    platformSettings,
    demoUsersCount,
    setDemoUsersDisabled,
    setTenantStatus,
    deleteTenantWorkspace,
    startDemoPreset,
    staffSignIn,
    exitToWelcome,
    firebaseUser,
    shopId,
    authLoading,
    cloudStatus,
    signInWithGoogle,
    signOutGoogle,
    selectedTableId,
    setSelectedTableId,
    activeOrderId,
    setActiveOrderId,
    receiptOrder,
    setReceiptOrder,
    tenants,
    activeTenantId,
    registerTenant,
    switchTenant,
    switchBranch,
    openTableOrder,
    createTakeAwayOrder,
    addItemToOrder,
    updateOrderItemQty,
    updateOrderItemNote,
    clearDraftItems,
    sendOrderToKitchen,
    advanceKdsOrder,
    voidOrderItem,
    moveOrderToTable,
    splitOrderItems,
    applyOrderDiscount,
    setOrderPromoCode,
    attachMemberToOrder,
    applyPrepaidPack,
    settleOrderPayment,
    submitGuestQrOrder,
    acceptQrOrder,
    rejectQrOrder,
    createGroupSession,
    addGroupSessionItem,
    submitGroupSessionToPos,
    createReservation,
    confirmReservation,
    payReservationDeposit,
    seatReservation,
    cancelReservation,
    openShift,
    addPettyCash,
    closeShift,
    addIngredient,
    recordIngredientPurchase,
    recordIngredientWaste,
    recordStockCount,
    saveRecipe,
    saveMenuItem,
    deleteMenuItem,
    importMenuItems,
    saveTable,
    deleteTable,
    togglePromotion,
    addPromotion,
    addPrepaidTemplate,
    sellPrepaidPack,
    voidCustomerPack,
    saveStaffMember,
    switchActiveStaff,
    tenantStates,
    isAdminUser,
    hasCurrentPermission,
    updateStaffPermissions,
    updateTenantOwnerPermissions,
    grantAllStaffInTenant,
    updateBranchSettingsForTenant,
    issueTaxInvoice,
    createCreditNote,
    updateBranchSettings,
    addBranch,
    setPlan,
    activateTenantSubscription,
    toggleOfflineMode,
    syncOfflineBills,
    setDisplayOrder,
    resetDemoData,
  };

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error('usePos must be used within PosProvider');
  return ctx;
}
