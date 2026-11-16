import type {
  PlatformSettings,
  PosAppState,
  StaffMember,
  TenantSummary,
} from '../types/pos';
import { isSuperAdmin } from './permissions';

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  demoUsersDisabled: false,
};

const SEEDED_DEMO_USER_IDS = new Set([
  'staff_sophea',
  'staff_vanna',
  'staff_sokha',
  'staff_dara',
  'staff_bopha',
  'staff_kosal',
  'staff_rithy',
]);

const SEEDED_DEMO_USERNAMES = new Set([
  'guide_chu',
  'guide_quanly',
  'guide_thungan',
  'guide_phucvu',
  'guide_bep',
  'guide_bar',
  'guide_chaymon',
]);

export function isDemoTenantWorkspace(
  tenant?: Pick<PosAppState, 'tenantId' | 'isDemoTenant' | 'businessCode'> | null
): boolean {
  if (!tenant) return false;
  if (tenant.isDemoTenant === true) return true;
  if (tenant.tenantId === 'tenant_lotus_bkk1') return true;
  return tenant.businessCode === 'BKK1_GUIDE_KH';
}

export function isDemoStaffAccount(
  member?: Pick<StaffMember, 'id' | 'username' | 'role' | 'isDemo'> | null,
  tenant?: Pick<PosAppState, 'tenantId' | 'isDemoTenant' | 'businessCode'> | null
): boolean {
  if (!member) return false;
  // Super Admin is NEVER treated as a demo account so Admin can never lock themselves out.
  if (member.role === 'admin') return false;
  if (member.isDemo === true) return true;
  if (member.isDemo === false) return false;

  const cleanUser = member.username.trim().toLowerCase();
  if (cleanUser.startsWith('guide_') || SEEDED_DEMO_USERNAMES.has(cleanUser)) {
    return true;
  }
  if (isDemoTenantWorkspace(tenant) && SEEDED_DEMO_USER_IDS.has(member.id)) {
    return true;
  }
  return false;
}

export function canStartDemoMode(platform: PlatformSettings): boolean {
  return !platform.demoUsersDisabled;
}

export function countDemoUsersAcrossTenants(
  tenantStates: Record<string, PosAppState>
): number {
  let count = 0;
  for (const st of Object.values(tenantStates)) {
    for (const member of st.staff) {
      if (isDemoStaffAccount(member, st)) {
        count += 1;
      }
    }
  }
  return count;
}

export function canActorAuthenticateInTenant(params: {
  member?: StaffMember | null;
  tenant?: Pick<PosAppState, 'tenantId' | 'isDemoTenant' | 'businessCode' | 'tenantStatus'> | null;
  platform: PlatformSettings;
}): { ok: boolean; reason?: string } {
  const { member, tenant, platform } = params;
  if (!member || !member.active) {
    return { ok: false, reason: 'This user account is disabled.' };
  }
  if (member.role === 'admin') {
    return { ok: true };
  }
  if (platform.demoUsersDisabled && isDemoStaffAccount(member, tenant)) {
    return {
      ok: false,
      reason:
        'Demo user accounts have been disabled by Super Admin. Sign in with your registered tenant workspace or Admin credentials.',
    };
  }
  if (tenant?.tenantStatus === 'suspended') {
    return {
      ok: false,
      reason: 'This tenant workspace is currently suspended by Super Admin.',
    };
  }
  return { ok: true };
}

export function getVisibleTenantsForActor(params: {
  allTenants: TenantSummary[];
  isEnteredPos: boolean;
  actor?: Pick<StaffMember, 'role' | 'active'> | null;
  activeTenantId: string;
  firebaseUid?: string | null;
  isCloudAdmin?: boolean;
  platform: PlatformSettings;
}): TenantSummary[] {
  const {
    allTenants,
    isEnteredPos,
    actor,
    activeTenantId,
    firebaseUid,
    isCloudAdmin,
    platform,
  } = params;

  if (isEnteredPos) {
    // Super Admin sees and manages ALL tenants across the platform.
    if (isSuperAdmin(actor)) {
      return allTenants;
    }
    // Non-admin tenants ONLY display their own active tenant workspace (strict data isolation).
    return allTenants.filter((t) => t.id === activeTenantId);
  }

  // Welcome / pre-auth screen:
  if (firebaseUid) {
    if (isCloudAdmin) {
      return allTenants;
    }
    return allTenants.filter(
      (t) =>
        t.ownerUid === firebaseUid &&
        !(platform.demoUsersDisabled && t.isDemoTenant)
    );
  }

  // Unauthenticated guests on Welcome screen cannot browse private tenants' data.
  return [];
}

export function canSwitchToTenant(params: {
  actor?: Pick<StaffMember, 'role' | 'active'> | null;
  targetTenantId: string;
  activeTenantId: string;
  targetTenant?: Pick<PosAppState, 'ownerUid' | 'isDemoTenant' | 'tenantStatus'> | null;
  firebaseUid?: string | null;
  isCloudAdmin?: boolean;
}): boolean {
  const { actor, targetTenantId, activeTenantId, targetTenant, firebaseUid, isCloudAdmin } = params;
  if (!targetTenant) return false;
  if (isSuperAdmin(actor) || isCloudAdmin) return true;
  if (targetTenantId === activeTenantId) return true;
  if (firebaseUid && targetTenant.ownerUid && targetTenant.ownerUid === firebaseUid) {
    return targetTenant.tenantStatus !== 'suspended';
  }
  return false;
}

export function resolveTenantStaffSignIn(params: {
  tenantStates: Record<string, PosAppState>;
  activeTenantId: string;
  username: string;
  pinOrPassword: string;
  businessCode?: string;
  platform: PlatformSettings;
}): { ok: boolean; tenantId?: string; staff?: StaffMember; error?: string } {
  const { tenantStates, activeTenantId, username, pinOrPassword, businessCode, platform } = params;
  const cleanUser = username.trim().toLowerCase();
  const cleanPin = pinOrPassword.trim();
  const cleanCode = (businessCode || '').trim().toUpperCase();

  if (!cleanUser) {
    return { ok: false, error: 'Enter your username.' };
  }
  if (!cleanPin) {
    return { ok: false, error: 'Enter your PIN or password.' };
  }

  const findMemberInTenant = (st: PosAppState): StaffMember | undefined =>
    st.staff.find((s) => s.username.toLowerCase() === cleanUser) ||
    st.staff.find((s) => s.name.toLowerCase().includes(cleanUser));

  // 1. Explicit tenant business code sign-in
  if (cleanCode) {
    const entry = Object.entries(tenantStates).find(
      ([, st]) => st.businessCode.toUpperCase() === cleanCode
    );
    if (!entry) {
      return {
        ok: false,
        error: `Tenant workspace "${cleanCode}" not found. Verify your business code or register a new tenant.`,
      };
    }
    const [tid, tenant] = entry;
    const matched = findMemberInTenant(tenant);
    if (!matched) {
      return {
        ok: false,
        error: `User "${username.trim()}" not found in tenant ${cleanCode}.`,
      };
    }
    if (matched.pin && cleanPin !== matched.pin && cleanPin.length <= 4) {
      return { ok: false, error: 'Invalid 4-digit PIN for this account.' };
    }
    const authCheck = canActorAuthenticateInTenant({ member: matched, tenant, platform });
    if (!authCheck.ok) {
      return { ok: false, error: authCheck.reason };
    }
    return { ok: true, tenantId: tid, staff: matched };
  }

  // 2. Super Admin login works across any tenant even when demo users are disabled
  if (cleanUser === 'admin') {
    const preferred = tenantStates[activeTenantId];
    const ordered = preferred
      ? [[activeTenantId, preferred] as [string, PosAppState], ...Object.entries(tenantStates).filter(([id]) => id !== activeTenantId)]
      : Object.entries(tenantStates);
    for (const [tid, tenant] of ordered) {
      const adminMember = tenant.staff.find((s) => s.role === 'admin' && s.active);
      if (adminMember) {
        if (adminMember.pin && cleanPin !== adminMember.pin && cleanPin.length <= 4) {
          return { ok: false, error: 'Invalid 4-digit PIN for Super Admin.' };
        }
        return { ok: true, tenantId: tid, staff: adminMember };
      }
    }
  }

  // 3. Check active tenant first
  const activeTenant = tenantStates[activeTenantId];
  if (activeTenant) {
    const matched = findMemberInTenant(activeTenant);
    if (matched) {
      const pinMatches = !matched.pin || cleanPin === matched.pin || cleanPin.length > 4;
      const authCheck = canActorAuthenticateInTenant({
        member: matched,
        tenant: activeTenant,
        platform,
      });
      if (pinMatches && authCheck.ok) {
        return { ok: true, tenantId: activeTenantId, staff: matched };
      }
      // If active tenant matched a disabled demo user, still check non-demo tenants before failing if it's a shared username like 'owner', otherwise return reason
      if (!authCheck.ok && isDemoStaffAccount(matched, activeTenant)) {
        const nonDemoHits: { tid: string; staff: StaffMember }[] = [];
        for (const [tid, st] of Object.entries(tenantStates)) {
          if (tid === activeTenantId || isDemoTenantWorkspace(st)) continue;
          const m = findMemberInTenant(st);
          if (m && (!m.pin || cleanPin === m.pin || cleanPin.length > 4)) {
            const chk = canActorAuthenticateInTenant({ member: m, tenant: st, platform });
            if (chk.ok) nonDemoHits.push({ tid, staff: m });
          }
        }
        if (nonDemoHits.length === 1) {
          return { ok: true, tenantId: nonDemoHits[0].tid, staff: nonDemoHits[0].staff };
        }
        return { ok: false, error: authCheck.reason };
      }
      if (!pinMatches) {
        // Could the user belong to another registered tenant with the same username (e.g. 'owner')?
        const otherHits: { tid: string; staff: StaffMember }[] = [];
        for (const [tid, st] of Object.entries(tenantStates)) {
          if (tid === activeTenantId) continue;
          const m = findMemberInTenant(st);
          if (m && m.pin === cleanPin) {
            const chk = canActorAuthenticateInTenant({ member: m, tenant: st, platform });
            if (chk.ok) otherHits.push({ tid, staff: m });
          }
        }
        if (otherHits.length === 1) {
          return { ok: true, tenantId: otherHits[0].tid, staff: otherHits[0].staff };
        }
        return { ok: false, error: 'Invalid 4-digit PIN for this account.' };
      }
      if (!authCheck.ok) {
        return { ok: false, error: authCheck.reason };
      }
    }
  }

  // 4. Scan remaining tenants for an exact credential match
  const hits: { tid: string; tenant: PosAppState; staff: StaffMember }[] = [];
  let blockedReason: string | undefined;
  for (const [tid, st] of Object.entries(tenantStates)) {
    if (tid === activeTenantId) continue;
    const m = findMemberInTenant(st);
    if (!m) continue;
    const pinOk = !m.pin || cleanPin === m.pin || cleanPin.length > 4;
    if (!pinOk) continue;
    const chk = canActorAuthenticateInTenant({ member: m, tenant: st, platform });
    if (chk.ok) {
      hits.push({ tid, tenant: st, staff: m });
    } else if (!blockedReason) {
      blockedReason = chk.reason;
    }
  }

  if (hits.length === 1) {
    return { ok: true, tenantId: hits[0].tid, staff: hits[0].staff };
  }
  if (hits.length > 1) {
    return {
      ok: false,
      error: 'Multiple workspaces match this username and PIN. Enter your Tenant Code to sign in.',
    };
  }
  if (blockedReason) {
    return { ok: false, error: blockedReason };
  }

  return {
    ok: false,
    error: platform.demoUsersDisabled
      ? 'Account not found or demo accounts are disabled. Enter your Tenant Code + credentials, or sign in as Admin.'
      : 'Account not found. Try admin (0000), guide_chu (1111), or tap Try 24h Demo Shop.',
  };
}
