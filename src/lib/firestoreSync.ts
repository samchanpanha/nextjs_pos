import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from './firebase';
import type {
  PlatformSettings,
  PosAppState,
  PosOrder,
  PosTable,
  MenuItem,
  Ingredient,
  Reservation,
  VatInvoice,
  AuditLogEntry,
  ShiftRecord,
  BranchConfig,
  StaffMember,
  TenantStatus,
} from '../types/pos';
import {
  DEFAULT_OWNER_TENANT_PERMISSIONS,
  normalizePermissions,
  type PermissionKey,
} from '../utils/permissions';
import type { SubscriptionPlan, SubscriptionStatus } from '../utils/subscription';
import { normalizeInvoiceTemplate } from '../utils/invoiceTemplate';

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'item_1';
}

export function getShopIdForUser(uid: string): string {
  return sanitizeId(`shop_${uid.slice(0, 24)}`);
}

export function getShopIdForTenant(uid: string, tenantId?: string): string {
  if (tenantId) {
    return sanitizeId(`shop_${uid.slice(0, 12)}_${tenantId}`);
  }
  return getShopIdForUser(uid);
}

export async function ensureUserAndShop(user: User, seedState: PosAppState): Promise<string> {
  const shopId = getShopIdForUser(user.uid);
  const profilePath = `users/${user.uid}/private/info`;

  try {
    await setDoc(
      doc(db, 'users', user.uid, 'private', 'info'),
      {
        uid: user.uid,
        email: (user.email ?? '').slice(0, 200),
        displayName: (user.displayName ?? 'Shop Owner').slice(0, 120),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, profilePath);
  }

  const shopRef = doc(db, 'shops', shopId);
  const mainBranch = seedState.branches[0];
  try {
    const snap = await getDoc(shopRef);
    if (!snap.exists()) {
      await setDoc(shopRef, {
        ownerUid: user.uid,
        name: seedState.shopName.slice(0, 120),
        businessCode: seedState.businessCode.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32),
        businessType: seedState.businessType || 'restaurant',
        plan: seedState.plan,
        subscriptionStatus: seedState.subscriptionStatus || 'active',
        subscriptionRef: (seedState.subscriptionRef ?? '').slice(0, 80),
        planDaysLeft: Math.max(0, Math.min(3650, Number(seedState.planDaysLeft) || 0)),
        subscriptionExpiresAt: (seedState.subscriptionExpiresAt ?? '').slice(0, 64),
        khqrAccountId: (mainBranch?.khqrBakongId ?? '').slice(0, 64),
        khqrAccountType: mainBranch?.khqrAccountType || 'individual',
        khqrMerchantName: (mainBranch?.khqrAccountName ?? seedState.shopName).slice(0, 64),
        khqrCity: (mainBranch?.khqrCity ?? 'Phnom Penh').slice(0, 48),
        khqrDefaultCurrency: mainBranch?.khqrDefaultCurrency || 'USD',
        tenantStatus: seedState.tenantStatus || 'active',
        isDemo: Boolean(seedState.isDemoTenant),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await Promise.all([
        ...seedState.branches.map((b) => syncBranchToFirestore(shopId, user.uid, b)),
        ...seedState.staff.map((st) => syncStaffMemberToFirestore(shopId, user.uid, st)),
        ...seedState.menuItems.map((m) => syncMenuItemToFirestore(shopId, user.uid, m)),
        ...seedState.tables.map((t) => syncTableToFirestore(shopId, user.uid, t)),
        ...seedState.ingredients.map((i) => syncIngredientToFirestore(shopId, user.uid, i)),
      ]);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `shops/${shopId}`);
  }

  return shopId;
}

export async function registerTenantInFirestore(user: User, tenantState: PosAppState): Promise<string> {
  const shopId = getShopIdForTenant(user.uid, tenantState.tenantId);
  const shopRef = doc(db, 'shops', shopId);
  const mainBranch = tenantState.branches[0];

  try {
    await setDoc(shopRef, {
      ownerUid: user.uid,
      name: tenantState.shopName.slice(0, 120),
      businessCode: tenantState.businessCode.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32),
      businessType: tenantState.businessType || 'restaurant',
      plan: tenantState.plan,
      subscriptionStatus: tenantState.subscriptionStatus || 'pending',
      subscriptionRef: (tenantState.subscriptionRef ?? '').slice(0, 80),
      planDaysLeft: Math.max(0, Math.min(3650, Number(tenantState.planDaysLeft) || 0)),
      subscriptionExpiresAt: (tenantState.subscriptionExpiresAt ?? '').slice(0, 64),
      khqrAccountId: (mainBranch?.khqrBakongId ?? '').slice(0, 64),
      khqrAccountType: mainBranch?.khqrAccountType || 'individual',
      khqrMerchantName: (mainBranch?.khqrAccountName ?? tenantState.shopName).slice(0, 64),
      khqrCity: (mainBranch?.khqrCity ?? 'Phnom Penh').slice(0, 48),
      khqrDefaultCurrency: mainBranch?.khqrDefaultCurrency || 'USD',
      tenantStatus: tenantState.tenantStatus || 'active',
      isDemo: Boolean(tenantState.isDemoTenant),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await Promise.all([
      ...tenantState.branches.map((b) => syncBranchToFirestore(shopId, user.uid, b)),
      ...tenantState.staff.map((st) => syncStaffMemberToFirestore(shopId, user.uid, st)),
      ...tenantState.menuItems.map((m) => syncMenuItemToFirestore(shopId, user.uid, m)),
      ...tenantState.tables.map((t) => syncTableToFirestore(shopId, user.uid, t)),
      ...tenantState.ingredients.map((i) => syncIngredientToFirestore(shopId, user.uid, i)),
    ]);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `shops/${shopId}`);
  }

  return shopId;
}

export async function ensureAdminInFirestore(user: User): Promise<boolean> {
  const email = (user.email ?? '').toLowerCase();
  const isBootstrappedEmail = email === 'samchanpanha2021@gmail.com' && user.emailVerified;
  const adminRef = doc(db, 'admins', sanitizeId(user.uid));
  try {
    const snap = await getDoc(adminRef);
    if (snap.exists()) {
      return snap.data()?.role === 'admin';
    }
    if (isBootstrappedEmail) {
      await setDoc(adminRef, {
        uid: user.uid,
        email: (user.email ?? '').slice(0, 200),
        displayName: (user.displayName ?? 'Super Admin').slice(0, 120),
        role: 'admin',
        updatedAt: serverTimestamp(),
      });
      return true;
    }
    return false;
  } catch {
    return isBootstrappedEmail;
  }
}

export async function updateShopOwnerPermissionsInFirestore(
  shopId: string,
  ownerPermissions: PermissionKey[]
): Promise<void> {
  const path = `shops/${shopId}`;
  try {
    await setDoc(
      doc(db, 'shops', shopId),
      {
        ownerPermissions: normalizePermissions(ownerPermissions, false).slice(0, 30),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function syncStaffMemberToFirestore(
  shopId: string,
  ownerUid: string,
  member: StaffMember
): Promise<void> {
  const id = sanitizeId(member.id);
  const path = `shops/${shopId}/staff/${id}`;
  try {
    await setDoc(doc(db, 'shops', shopId, 'staff', id), {
      ownerUid,
      name: member.name.slice(0, 120),
      username: member.username.slice(0, 64),
      roleLabel: (member.roleLabel || member.role).slice(0, 64),
      role: member.role,
      pin: (member.pin || '0000').slice(0, 8),
      active: Boolean(member.active),
      isDemo: Boolean(member.isDemo),
      permissions: normalizePermissions(member.permissions, member.role === 'admin').slice(0, 30),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function fetchPlatformConfigFromFirestore(): Promise<PlatformSettings | null> {
  const path = 'platform/config';
  try {
    const snap = await getDoc(doc(db, 'platform', 'config'));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      demoUsersDisabled: Boolean(data.demoUsersDisabled),
      updatedBy: typeof data.updatedByUid === 'string' ? data.updatedByUid : undefined,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function savePlatformConfigInFirestore(
  adminUid: string,
  demoUsersDisabled: boolean
): Promise<void> {
  const path = 'platform/config';
  try {
    await setDoc(
      doc(db, 'platform', 'config'),
      {
        demoUsersDisabled: Boolean(demoUsersDisabled),
        updatedByUid: adminUid.slice(0, 128),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateShopTenantStatusInFirestore(
  shopId: string,
  tenantStatus: TenantStatus
): Promise<void> {
  const path = `shops/${shopId}`;
  try {
    await setDoc(
      doc(db, 'shops', shopId),
      {
        tenantStatus,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateShopSubscriptionInFirestore(
  shopId: string,
  params: {
    plan: SubscriptionPlan;
    subscriptionStatus: SubscriptionStatus;
    subscriptionRef: string;
    planDaysLeft: number;
    subscriptionExpiresAt: string;
  }
): Promise<void> {
  const path = `shops/${shopId}`;
  try {
    await setDoc(
      doc(db, 'shops', shopId),
      {
        plan: params.plan,
        subscriptionStatus: params.subscriptionStatus,
        subscriptionRef: params.subscriptionRef.slice(0, 80),
        planDaysLeft: Math.max(0, Math.min(3650, Math.round(params.planDaysLeft))),
        subscriptionExpiresAt: params.subscriptionExpiresAt.slice(0, 64),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function listUserShopsFromFirestore(
  ownerUid: string,
  asAdmin = false
): Promise<
  {
    shopId: string;
    ownerUid: string;
    name: string;
    businessCode: string;
    businessType?: string;
    tenantStatus: TenantStatus;
    isDemo: boolean;
    plan: SubscriptionPlan;
    subscriptionStatus?: SubscriptionStatus;
    planDaysLeft?: number;
    subscriptionRef?: string;
    khqrAccountId?: string;
    khqrMerchantName?: string;
    ownerPermissions?: PermissionKey[];
  }[]
> {
  try {
    const snap = asAdmin
      ? await getDocs(collection(db, 'shops'))
      : await getDocs(query(collection(db, 'shops'), where('ownerUid', '==', ownerUid)));
    return snap.docs.map((d) => {
      const data = d.data();
      const rawPlan = data.plan;
      const plan: SubscriptionPlan =
        rawPlan === 'daily' || rawPlan === 'standard' || rawPlan === 'premium'
          ? rawPlan
          : 'daily';
      const rawStatus = data.subscriptionStatus;
      const subscriptionStatus: SubscriptionStatus =
        rawStatus === 'active' || rawStatus === 'pending' || rawStatus === 'expired'
          ? rawStatus
          : 'active';
      const ownerPermissions = Array.isArray(data.ownerPermissions)
        ? normalizePermissions(data.ownerPermissions, false)
        : [...DEFAULT_OWNER_TENANT_PERMISSIONS];
      const tenantStatus: TenantStatus =
        data.tenantStatus === 'suspended' ? 'suspended' : 'active';
      return {
        shopId: d.id,
        ownerUid: String(data.ownerUid || ownerUid),
        name: String(data.name || ''),
        businessCode: String(data.businessCode || ''),
        businessType: typeof data.businessType === 'string' ? data.businessType : undefined,
        tenantStatus,
        isDemo: Boolean(data.isDemo),
        plan,
        subscriptionStatus,
        planDaysLeft: typeof data.planDaysLeft === 'number' ? data.planDaysLeft : undefined,
        subscriptionRef: typeof data.subscriptionRef === 'string' ? data.subscriptionRef : undefined,
        khqrAccountId: typeof data.khqrAccountId === 'string' ? data.khqrAccountId : undefined,
        khqrMerchantName: typeof data.khqrMerchantName === 'string' ? data.khqrMerchantName : undefined,
        ownerPermissions,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'shops');
  }
}

export async function syncBranchToFirestore(
  shopId: string,
  ownerUid: string,
  branch: BranchConfig
): Promise<void> {
  const id = sanitizeId(branch.id);
  const path = `shops/${shopId}/branches/${id}`;
  const tpl = normalizeInvoiceTemplate(branch.invoiceTemplate, {
    shopName: branch.name,
    branchCode: branch.code,
  });
  try {
    await setDoc(doc(db, 'shops', shopId, 'branches', id), {
      ownerUid,
      name: branch.name.slice(0, 120),
      code: branch.code.slice(0, 32),
      address: (branch.address ?? '').slice(0, 200),
      phone: (branch.phone ?? '').slice(0, 48),
      vattin: (branch.vattin ?? '').slice(0, 48),
      exchangeRate: Number(branch.exchangeRate) || 4100,
      vatPercent: Number(branch.vatPercent) || 0,
      serviceChargePercent: Number(branch.serviceChargePercent) || 0,
      rielRounding: Number(branch.rielRounding) || 100,
      simpleMode: Boolean(branch.simpleMode),
      reservationsEnabled: Boolean(branch.reservationsEnabled),
      qrMode: branch.qrMode,
      khqrBakongId: (branch.khqrBakongId ?? '').slice(0, 64),
      khqrAccountName: (branch.khqrAccountName ?? '').slice(0, 64),
      khqrAccountType: branch.khqrAccountType || 'individual',
      khqrMerchantId: (branch.khqrMerchantId ?? '').slice(0, 48),
      khqrAcquiringBank: (branch.khqrAcquiringBank ?? '').slice(0, 64),
      khqrCity: (branch.khqrCity ?? 'Phnom Penh').slice(0, 48),
      khqrDefaultCurrency: branch.khqrDefaultCurrency || 'USD',
      khqrMcc: (branch.khqrMcc ?? '5812').slice(0, 8),
      invoiceTemplate: tpl,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncMenuItemToFirestore(
  shopId: string,
  ownerUid: string,
  item: MenuItem
): Promise<void> {
  const id = sanitizeId(item.id);
  const path = `shops/${shopId}/menuItems/${id}`;
  const safeImageUrl =
    typeof item.imageUrl === 'string' && item.imageUrl.length <= 65000 ? item.imageUrl : '';
  try {
    await setDoc(doc(db, 'shops', shopId, 'menuItems', id), {
      ownerUid,
      branchId: sanitizeId(item.branchId),
      itemType: item.itemType === 'service' ? 'service' : 'product',
      nameEn: item.nameEn.slice(0, 120),
      nameKh: (item.nameKh ?? '').slice(0, 120),
      nameVi: (item.nameVi ?? '').slice(0, 120),
      category: item.category.slice(0, 64),
      priceUsd: Number(item.priceUsd) || 0,
      station: item.station,
      imageUrl: safeImageUrl,
      isBestSeller: Boolean(item.isBestSeller),
      isNew: Boolean(item.isNew),
      active: Boolean(item.active),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncTableToFirestore(
  shopId: string,
  ownerUid: string,
  table: PosTable
): Promise<void> {
  const id = sanitizeId(table.id);
  const path = `shops/${shopId}/tables/${id}`;
  try {
    await setDoc(doc(db, 'shops', shopId, 'tables', id), {
      ownerUid,
      branchId: sanitizeId(table.branchId),
      name: table.name.slice(0, 48),
      area: table.area.slice(0, 64),
      seats: Math.max(1, Math.min(100, Number(table.seats) || 4)),
      status: table.status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncOrderToFirestore(
  shopId: string,
  ownerUid: string,
  order: PosOrder
): Promise<void> {
  const id = sanitizeId(order.id);
  const path = `shops/${shopId}/orders/${id}`;
  const ref = doc(db, 'shops', shopId, 'orders', id);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      const existingData = existing.data();
      if (existingData?.status === 'paid' || existingData?.status === 'voided') {
        return;
      }
      await setDoc(
        ref,
        {
          tableId: order.tableId ?? '',
          status: order.status,
          totalUsd: Number(order.totalUsd) || 0,
          totalKhr: Number(order.totalKhr) || 0,
          paymentMethod: order.paymentMethod ?? '',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await setDoc(ref, {
        ownerUid,
        branchId: sanitizeId(order.branchId),
        orderNumber: Number(order.orderNumber) || 1,
        tableId: order.tableId ?? '',
        channel: order.channel,
        status: order.status,
        totalUsd: Number(order.totalUsd) || 0,
        totalKhr: Number(order.totalKhr) || 0,
        paymentMethod: order.paymentMethod ?? '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncShiftToFirestore(
  shopId: string,
  ownerUid: string,
  shift: ShiftRecord
): Promise<void> {
  const id = sanitizeId(shift.id);
  const path = `shops/${shopId}/shifts/${id}`;
  const ref = doc(db, 'shops', shopId, 'shifts', id);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      if (existing.data()?.status === 'closed') return;
      await setDoc(
        ref,
        {
          status: shift.status,
          countedUsd: Number(shift.countedUsd) || 0,
          countedKhr: Number(shift.countedKhr) || 0,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await setDoc(ref, {
        ownerUid,
        branchId: sanitizeId(shift.branchId),
        cashierName: shift.cashierName.slice(0, 80),
        status: shift.status,
        openingUsd: Number(shift.openingUsd) || 0,
        openingKhr: Number(shift.openingKhr) || 0,
        countedUsd: Number(shift.countedUsd) || 0,
        countedKhr: Number(shift.countedKhr) || 0,
        openedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncIngredientToFirestore(
  shopId: string,
  ownerUid: string,
  ing: Ingredient
): Promise<void> {
  const id = sanitizeId(ing.id);
  const path = `shops/${shopId}/ingredients/${id}`;
  try {
    await setDoc(doc(db, 'shops', shopId, 'ingredients', id), {
      ownerUid,
      branchId: sanitizeId(ing.branchId),
      nameEn: ing.nameEn.slice(0, 120),
      nameKh: (ing.nameKh ?? '').slice(0, 120),
      unit: ing.unit.slice(0, 24),
      onHand: Math.max(0, Number(ing.onHand) || 0),
      minLevel: Math.max(0, Number(ing.minLevel) || 0),
      avgCostUsd: Math.max(0, Number(ing.avgCostUsd) || 0),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncReservationToFirestore(
  shopId: string,
  ownerUid: string,
  res: Reservation
): Promise<void> {
  const id = sanitizeId(res.id);
  const path = `shops/${shopId}/reservations/${id}`;
  const ref = doc(db, 'shops', shopId, 'reservations', id);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      const s = existing.data()?.status;
      if (s === 'seated' || s === 'cancelled' || s === 'no_show') return;
      await setDoc(
        ref,
        {
          dateTime: res.dateTime.slice(0, 40),
          guests: Math.max(1, Number(res.guests) || 1),
          depositUsd: Math.max(0, Number(res.depositUsd) || 0),
          status: res.status,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await setDoc(ref, {
        ownerUid,
        branchId: sanitizeId(res.branchId),
        guestName: res.guestName.slice(0, 80),
        dateTime: res.dateTime.slice(0, 40),
        guests: Math.max(1, Number(res.guests) || 1),
        depositUsd: Math.max(0, Number(res.depositUsd) || 0),
        status: res.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function createInvoiceInFirestore(
  shopId: string,
  ownerUid: string,
  inv: VatInvoice
): Promise<void> {
  const id = sanitizeId(inv.id);
  const path = `shops/${shopId}/invoices/${id}`;
  try {
    await setDoc(doc(db, 'shops', shopId, 'invoices', id), {
      ownerUid,
      branchId: sanitizeId(inv.branchId),
      invoiceNo: inv.invoiceNo.slice(0, 64),
      invoiceType: inv.invoiceType,
      exclVatUsd: Math.max(0, Number(inv.exclVatUsd) || 0),
      vatUsd: Math.max(0, Number(inv.vatUsd) || 0),
      totalUsd: Math.max(0, Number(inv.totalUsd) || 0),
      totalKhr: Math.max(0, Number(inv.totalKhr) || 0),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function createAuditLogInFirestore(
  shopId: string,
  ownerUid: string,
  log: AuditLogEntry
): Promise<void> {
  const id = sanitizeId(log.id);
  const path = `shops/${shopId}/auditLogs/${id}`;
  try {
    await setDoc(doc(db, 'shops', shopId, 'auditLogs', id), {
      ownerUid,
      branchId: sanitizeId(log.branchId),
      actorName: log.actorName.slice(0, 80),
      action: log.action.slice(0, 80),
      detail: log.detail.slice(0, 240),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function fetchShopCloudStats(shopId: string, ownerUid: string) {
  const ordersPath = `shops/${shopId}/orders`;
  const menuPath = `shops/${shopId}/menuItems`;
  try {
    const [ordersSnap, menuSnap] = await Promise.all([
      getDocs(query(collection(db, 'shops', shopId, 'orders'), where('ownerUid', '==', ownerUid))),
      getDocs(query(collection(db, 'shops', shopId, 'menuItems'), where('ownerUid', '==', ownerUid))),
    ]);
    return {
      cloudOrdersCount: ordersSnap.size,
      cloudMenuCount: menuSnap.size,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `${ordersPath} | ${menuPath}`);
  }
}
