import type { BranchConfig, PosOrder } from '../types/pos';
import {
  generateBakongKhqrPayload,
  isMerchantKhqrConfigured,
  type KhqrCurrency,
} from './bakongKhqr';
import { usdToKhr } from './posMath';

export interface OrderKhqrCandidate {
  md5: string;
  currency: KhqrCurrency;
  amount: number;
  terminalLabel: 'POS1' | 'DISP1';
  qrString: string;
  billNumber: string;
}

export interface BakongCheckTransactionResponse {
  ok?: boolean;
  configured?: boolean;
  paid?: boolean;
  pending?: boolean;
  matchedMd5?: string;
  md5?: string;
  source?: string;
  transactionRef?: string | null;
  transaction?: {
    hash?: string;
    externalRef?: string;
    fromAccountId?: string;
    toAccountId?: string;
    currency?: string;
    amount?: number;
  } | null;
  message?: string;
  error?: string;
}

export interface ParsedBakongCallback {
  md5: string;
  paid: boolean;
  transactionRef: string;
  hash?: string;
  externalRef?: string;
  fromAccountId?: string;
  toAccountId?: string;
  currency?: string;
  amount?: number;
}

export function isValidMd5Hex(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value.trim().toLowerCase());
}

export function normalizeMd5List(md5?: unknown, md5s?: unknown): string[] {
  const raw: string[] = [];
  if (typeof md5 === 'string') {
    raw.push(md5);
  }
  if (Array.isArray(md5s)) {
    for (const item of md5s) {
      if (typeof item === 'string') raw.push(item);
    }
  }
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const candidate of raw) {
    const clean = candidate.trim().toLowerCase();
    if (/^[a-f0-9]{32}$/.test(clean) && !seen.has(clean)) {
      seen.add(clean);
      valid.push(clean);
    }
  }
  return valid;
}

/**
 * Parses an inbound Bakong KHQR webhook/callback payload.
 * Supports both flat callback fields and NBC Bakong Open API envelope `{ responseCode, data }`.
 */
export function parseBakongCallbackBody(body: unknown): ParsedBakongCallback | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const nestedData =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : {};

  const rawMd5 =
    (typeof root.md5 === 'string' ? root.md5 : undefined) ??
    (typeof nestedData.md5 === 'string' ? nestedData.md5 : undefined);
  if (!rawMd5) return null;
  const md5 = rawMd5.trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(md5)) return null;

  const statusStr = String(root.status ?? nestedData.status ?? '').trim().toLowerCase();
  const responseCode =
    typeof root.responseCode === 'number'
      ? root.responseCode
      : typeof nestedData.responseCode === 'number'
        ? nestedData.responseCode
        : undefined;

  const isFailedStatus =
    statusStr === 'failed' ||
    statusStr === 'rejected' ||
    statusStr === 'cancelled' ||
    statusStr === 'expired';
  const paid = !isFailedStatus && (responseCode === undefined || responseCode === 0);

  const hash =
    typeof nestedData.hash === 'string'
      ? nestedData.hash
      : typeof root.hash === 'string'
        ? root.hash
        : undefined;
  const externalRef =
    typeof nestedData.externalRef === 'string'
      ? nestedData.externalRef
      : typeof root.externalRef === 'string'
        ? root.externalRef
        : undefined;
  const txRefRaw =
    typeof root.transactionRef === 'string'
      ? root.transactionRef
      : typeof nestedData.transactionRef === 'string'
        ? nestedData.transactionRef
        : undefined;

  const transactionRef =
    (txRefRaw || hash || externalRef || `KHQR-${md5.slice(0, 8).toUpperCase()}`).trim();

  return {
    md5,
    paid,
    transactionRef,
    hash,
    externalRef,
    fromAccountId:
      typeof nestedData.fromAccountId === 'string'
        ? nestedData.fromAccountId
        : typeof root.fromAccountId === 'string'
          ? root.fromAccountId
          : undefined,
    toAccountId:
      typeof nestedData.toAccountId === 'string'
        ? nestedData.toAccountId
        : typeof root.toAccountId === 'string'
          ? root.toAccountId
          : undefined,
    currency:
      typeof nestedData.currency === 'string'
        ? nestedData.currency
        : typeof root.currency === 'string'
          ? root.currency
          : undefined,
    amount:
      typeof nestedData.amount === 'number'
        ? nestedData.amount
        : typeof root.amount === 'number'
          ? root.amount
          : undefined,
  };
}

export function shouldPollOrderKhqr(params: {
  order?: PosOrder | null;
  branch?: BranchConfig | null;
  offlineMode?: boolean;
  totalUsd?: number;
}): boolean {
  const { order, branch, offlineMode, totalUsd } = params;
  if (!order || !branch) return false;
  if (offlineMode) return false;
  if (order.status === 'paid' || order.status === 'voided') return false;
  if (!order.items.some((i) => !i.voided)) return false;
  const dueUsd = typeof totalUsd === 'number' ? totalUsd : order.totalUsd;
  if (!(dueUsd > 0)) return false;
  return isMerchantKhqrConfigured(branch.khqrBakongId);
}

/**
 * Generates deterministic KHQR MD5 candidates for an active POS order across
 * PayModal (`POS1` in USD/KHR) and Customer Display (`DISP1`) so SellView polling
 * detects callbacks regardless of which screen or currency the customer scanned.
 */
export function buildOrderKhqrCandidates(params: {
  order?: PosOrder | null;
  branch?: BranchConfig | null;
  totalUsd: number;
  totalKhr?: number;
}): OrderKhqrCandidate[] {
  const { order, branch } = params;
  if (!order || !branch) return [];
  if (order.status === 'paid' || order.status === 'voided') return [];
  if (!isMerchantKhqrConfigured(branch.khqrBakongId)) return [];
  if (!(params.totalUsd > 0)) return [];

  const totalKhr =
    typeof params.totalKhr === 'number' && params.totalKhr > 0
      ? params.totalKhr
      : usdToKhr(params.totalUsd, branch.exchangeRate, branch.rielRounding);

  const defaultCur: KhqrCurrency = branch.khqrDefaultCurrency === 'KHR' ? 'KHR' : 'USD';
  const altCur: KhqrCurrency = defaultCur === 'USD' ? 'KHR' : 'USD';
  const billNumber = `ORD-${order.orderNumber}`;

  const specs: { currency: KhqrCurrency; terminalLabel: 'POS1' | 'DISP1' }[] = [
    { currency: defaultCur, terminalLabel: 'POS1' },
    { currency: altCur, terminalLabel: 'POS1' },
    { currency: defaultCur, terminalLabel: 'DISP1' },
  ];

  const seenMd5 = new Set<string>();
  const out: OrderKhqrCandidate[] = [];

  for (const spec of specs) {
    const amount = spec.currency === 'KHR' ? totalKhr : params.totalUsd;
    const result = generateBakongKhqrPayload({
      accountType: branch.khqrAccountType || 'individual',
      bakongAccountId: branch.khqrBakongId.trim(),
      merchantId: branch.khqrMerchantId,
      acquiringBank: branch.khqrAcquiringBank,
      merchantName: branch.khqrAccountName || branch.name,
      merchantCity: branch.khqrCity || 'Phnom Penh',
      currency: spec.currency,
      amount,
      billNumber,
      storeLabel: branch.code,
      terminalLabel: spec.terminalLabel,
      mcc: branch.khqrMcc || '5812',
    });

    const md5 = result.md5.toLowerCase();
    if (seenMd5.has(md5)) continue;
    seenMd5.add(md5);

    out.push({
      md5,
      currency: spec.currency,
      amount,
      terminalLabel: spec.terminalLabel,
      qrString: result.qrString,
      billNumber,
    });
  }

  return out;
}

export function matchPaidBakongResult(
  candidates: OrderKhqrCandidate[],
  apiResult: BakongCheckTransactionResponse,
  totals: { totalUsd: number; totalKhr: number }
): {
  matched: OrderKhqrCandidate;
  paymentRef: string;
  paidUsd: number;
  paidKhr: number;
} | null {
  if (!apiResult.paid || candidates.length === 0) return null;

  const targetMd5 = (apiResult.matchedMd5 || apiResult.md5 || '').trim().toLowerCase();
  const matched =
    (targetMd5 ? candidates.find((c) => c.md5 === targetMd5) : undefined) || candidates[0];

  const paymentRef =
    (
      apiResult.transactionRef ||
      apiResult.transaction?.hash ||
      apiResult.transaction?.externalRef ||
      `KHQR-${matched.md5.slice(0, 8).toUpperCase()}`
    ).trim();

  return {
    matched,
    paymentRef,
    paidUsd: matched.currency === 'USD' ? totals.totalUsd : 0,
    paidKhr: matched.currency === 'KHR' ? totals.totalKhr : 0,
  };
}
