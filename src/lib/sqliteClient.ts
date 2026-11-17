import type {
  PlatformSettings,
  PosAppState,
  QrIncomingOrder,
  Reservation,
  SaasUser,
  SqliteEngineStats,
} from '../types/pos';
import type { SubscriptionPlan } from '../utils/subscription';

const SESSION_TOKEN_KEY = 'xaiwork_sqlite_session_token_v1';

export const CLIENT_TAB_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tab_${Math.random().toString(36).slice(2, 10)}`;

export function getStoredSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredSessionToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // ignore private mode storage error
  }
}

function buildHeaders(extra?: {
  staffRole?: string;
  adminPin?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Tab-Id': CLIENT_TAB_ID,
  };
  const token = getStoredSessionToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (extra?.staffRole) {
    headers['X-Pos-Staff-Role'] = extra.staffRole;
  }
  if (extra?.adminPin) {
    headers['X-Pos-Admin-Pin'] = extra.adminPin;
  }
  return headers;
}

export class SyncConflictClientError extends Error {
  readonly code = 'SYNC_CONFLICT' as const;
  readonly status = 409;
  readonly clientVersion: number;
  readonly serverVersion: number;
  readonly serverOrdersCount?: number;

  constructor(params: {
    message: string;
    clientVersion: number;
    serverVersion: number;
    serverOrdersCount?: number;
  }) {
    super(params.message);
    this.name = 'SyncConflictClientError';
    this.clientVersion = params.clientVersion;
    this.serverVersion = params.serverVersion;
    this.serverOrdersCount = params.serverOrdersCount;
  }
}

async function parseApiJson<T>(res: Response): Promise<T> {
  const payload = (await res.json().catch(() => ({}))) as T & {
    ok?: boolean;
    error?: string;
    code?: string;
    clientVersion?: number;
    serverVersion?: number;
    serverOrdersCount?: number;
  };
  if (res.status === 409 || payload.code === 'SYNC_CONFLICT') {
    throw new SyncConflictClientError({
      message: payload.error || 'Sync conflict with main server.',
      clientVersion: Number(payload.clientVersion ?? 0),
      serverVersion: Number(payload.serverVersion ?? 0),
      serverOrdersCount:
        typeof payload.serverOrdersCount === 'number' ? payload.serverOrdersCount : undefined,
    });
  }
  if (!res.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return payload;
}

// ---------------------------------------------------------------------------
// SaaS Account Auth (SQLite Backed)
// ---------------------------------------------------------------------------
export interface AuthSessionResponse {
  ok: boolean;
  user: SaasUser | null;
  token?: string;
  isSuperAdmin?: boolean;
  tenants: PosAppState[];
  platformSettings: PlatformSettings;
}

export async function fetchCurrentSession(): Promise<AuthSessionResponse> {
  const res = await fetch('/api/auth/me', {
    method: 'GET',
    headers: buildHeaders(),
  });
  return parseApiJson<AuthSessionResponse>(res);
}

export async function registerSaasAccount(params: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<AuthSessionResponse> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(params),
  });
  const data = await parseApiJson<AuthSessionResponse>(res);
  if (data.token) {
    setStoredSessionToken(data.token);
  }
  return data;
}

export async function loginSaasAccount(params: {
  email: string;
  password: string;
}): Promise<AuthSessionResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(params),
  });
  const data = await parseApiJson<AuthSessionResponse>(res);
  if (data.token) {
    setStoredSessionToken(data.token);
  }
  return data;
}

export async function resetSaasAccountPassword(params: {
  email: string;
  newPassword?: string;
}): Promise<{ ok: boolean; message: string }> {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(params),
  });
  return parseApiJson<{ ok: boolean; message: string }>(res);
}

export async function logoutSaasAccount(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: buildHeaders(),
    });
  } finally {
    setStoredSessionToken(null);
  }
}

export async function verifyStaffPinOnSqlite(params: {
  businessCode?: string;
  username: string;
  pin: string;
}): Promise<{
  ok: boolean;
  tenant: PosAppState;
  staffId: string;
  isAdmin: boolean;
}> {
  const res = await fetch('/api/auth/staff-pin', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(params),
  });
  return parseApiJson<{
    ok: boolean;
    tenant: PosAppState;
    staffId: string;
    isAdmin: boolean;
  }>(res);
}

// ---------------------------------------------------------------------------
// Multi-Tenant Persistence & Subscription APIs
// ---------------------------------------------------------------------------
export async function fetchAccessibleTenants(extra?: {
  staffRole?: string;
  adminPin?: string;
}): Promise<{ tenants: PosAppState[]; platformSettings: PlatformSettings }> {
  const res = await fetch('/api/tenants', {
    method: 'GET',
    headers: buildHeaders(extra),
  });
  return parseApiJson<{ tenants: PosAppState[]; platformSettings: PlatformSettings }>(res);
}

export async function fetchTenantFromSqlite(
  tenantId: string,
  businessCode?: string
): Promise<PosAppState> {
  const qs = businessCode ? `?businessCode=${encodeURIComponent(businessCode)}` : '';
  const res = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}${qs}`, {
    method: 'GET',
    headers: buildHeaders(),
  });
  const data = await parseApiJson<{ ok: boolean; tenant: PosAppState }>(res);
  return data.tenant;
}

export async function createTenantInSqlite(
  tenant: PosAppState,
  extra?: { staffRole?: string; adminPin?: string }
): Promise<PosAppState> {
  const res = await fetch('/api/tenants', {
    method: 'POST',
    headers: buildHeaders(extra),
    body: JSON.stringify({ tenant }),
  });
  const data = await parseApiJson<{ ok: boolean; tenant: PosAppState }>(res);
  return data.tenant;
}

export async function saveTenantToSqlite(
  tenant: PosAppState,
  extra?: {
    staffRole?: string;
    adminPin?: string;
    expectedVersion?: number;
    forceOverwrite?: boolean;
  }
): Promise<PosAppState> {
  const tid = tenant.tenantId || 'tenant_lotus_bkk1';
  const res = await fetch(`/api/tenants/${encodeURIComponent(tid)}`, {
    method: 'PUT',
    headers: buildHeaders(extra),
    body: JSON.stringify({
      tenant: { ...tenant, tenantId: tid },
      expectedVersion: extra?.expectedVersion,
      forceOverwrite: extra?.forceOverwrite,
    }),
  });
  const data = await parseApiJson<{ ok: boolean; tenant: PosAppState }>(res);
  return data.tenant;
}

export async function activateSubscriptionInSqlite(params: {
  tenantId: string;
  businessCode?: string;
  plan: SubscriptionPlan;
  days?: number;
  paymentRef: string;
  amountUsd?: number;
  actorName?: string;
}): Promise<PosAppState> {
  const res = await fetch(
    `/api/tenants/${encodeURIComponent(params.tenantId)}/subscription/activate`,
    {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(params),
    }
  );
  const data = await parseApiJson<{ ok: boolean; tenant: PosAppState }>(res);
  return data.tenant;
}

export async function deleteTenantFromSqlite(
  tenantId: string,
  extra?: { staffRole?: string; adminPin?: string }
): Promise<void> {
  const res = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}`, {
    method: 'DELETE',
    headers: buildHeaders(extra),
  });
  await parseApiJson<{ ok: boolean }>(res);
}

export async function savePlatformSettingsToSqlite(
  settings: PlatformSettings,
  extra?: { staffRole?: string; adminPin?: string }
): Promise<PlatformSettings> {
  const res = await fetch('/api/platform/settings', {
    method: 'PUT',
    headers: buildHeaders(extra),
    body: JSON.stringify(settings),
  });
  const data = await parseApiJson<{ ok: boolean; settings: PlatformSettings }>(res);
  return data.settings;
}

export async function fetchSqliteEngineStats(): Promise<SqliteEngineStats> {
  const res = await fetch('/api/platform/sqlite-stats', {
    method: 'GET',
    headers: buildHeaders(),
  });
  const data = await parseApiJson<{ ok: boolean; stats: SqliteEngineStats }>(res);
  return data.stats;
}

export async function exportTenantBackupFromSqlite(
  tenantId: string,
  businessCode?: string
): Promise<{ exportedAt: string; engine: string; tenant: PosAppState }> {
  const qs = businessCode ? `?businessCode=${encodeURIComponent(businessCode)}` : '';
  const res = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/backup${qs}`, {
    method: 'GET',
    headers: buildHeaders(),
  });
  return parseApiJson<{ exportedAt: string; engine: string; tenant: PosAppState }>(res);
}

export async function restoreTenantBackupToSqlite(
  tenantId: string,
  tenant: PosAppState,
  extra?: { staffRole?: string; adminPin?: string }
): Promise<PosAppState> {
  const res = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/restore`, {
    method: 'POST',
    headers: buildHeaders(extra),
    body: JSON.stringify({ tenant }),
  });
  const data = await parseApiJson<{ ok: boolean; tenant: PosAppState }>(res);
  return data.tenant;
}

// ---------------------------------------------------------------------------
// Public Guest QR & Reservation Endpoints
// ---------------------------------------------------------------------------
export async function submitPublicQrOrderToSqlite(
  tenantId: string,
  payload: Omit<QrIncomingOrder, 'id' | 'createdAt' | 'status'>
): Promise<void> {
  const res = await fetch(`/api/public/tenant/${encodeURIComponent(tenantId)}/qr-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await parseApiJson<{ ok: boolean }>(res);
}

export async function submitPublicServiceAlertToSqlite(
  tenantId: string,
  payload: {
    branchId: string;
    tableName: string;
    alertType: 'call_staff' | 'ask_bill';
  }
): Promise<void> {
  const res = await fetch(
    `/api/public/tenant/${encodeURIComponent(tenantId)}/service-alert`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  await parseApiJson<{ ok: boolean }>(res);
}

export async function submitPublicReservationToSqlite(
  tenantId: string,
  payload: Omit<Reservation, 'id' | 'code' | 'createdAt'>
): Promise<Reservation> {
  const res = await fetch(
    `/api/public/tenant/${encodeURIComponent(tenantId)}/reservation`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  const data = await parseApiJson<{ ok: boolean; reservation: Reservation }>(res);
  return data.reservation;
}

// ---------------------------------------------------------------------------
// Real-Time Server-Sent Events (SSE) Listener
// ---------------------------------------------------------------------------
export interface SqliteRealtimeEvent {
  type:
    | 'connected'
    | 'tenant_updated'
    | 'tenant_deleted'
    | 'platform_settings_updated'
    | 'qr_order_received'
    | 'reservation_received';
  tenantId?: string;
  version?: number;
  actorUid?: string;
  clientTabId?: string;
  summary?: string;
  timestamp: string;
}

export function subscribeToSqliteRealtime(
  tenantIds: string[],
  onEvent: (event: SqliteRealtimeEvent) => void,
  onStatusChange?: (connected: boolean) => void
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  const token = getStoredSessionToken();
  const params = new URLSearchParams();
  if (tenantIds.length > 0) {
    params.set('tenantIds', tenantIds.join(','));
  }
  if (token) {
    params.set('token', token);
  }

  const source = new EventSource(`/api/realtime/stream?${params.toString()}`);

  source.onopen = () => {
    onStatusChange?.(true);
  };

  source.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data) as SqliteRealtimeEvent;
      onEvent(parsed);
    } catch {
      // ignore non-JSON frames
    }
  };

  source.onerror = () => {
    onStatusChange?.(false);
  };

  return () => {
    source.close();
  };
}
