import type { LoyaltyTransaction, MemberCustomer } from '../types/pos';

/** Points older than this (rolling, from the earning transaction) expire. */
export const POINTS_EXPIRY_DAYS = 365;

/** Default look-ahead window surfaced in the dashboard / member profile. */
export const EXPIRY_WARNING_WINDOW_DAYS = 30;

interface PointLot {
  tx: LoyaltyTransaction;
  remaining: number;
}

/**
 * Rebuild the member's unexpired point lots from their ledger using FIFO:
 * redemptions consume the oldest earned lots first. The ledger is capped at
 * 100 entries, so very old lots may already have been trimmed — the remaining
 * balance is still authoritative for the member's spendable points.
 */
export function buildMemberPointLots(member: MemberCustomer): PointLot[] {
  const history = [...(member.loyaltyHistory || [])].reverse(); // oldest first
  const lots: PointLot[] = [];

  for (const tx of history) {
    if (tx.pointsDelta > 0) {
      lots.push({ tx, remaining: tx.pointsDelta });
      continue;
    }
    if (tx.pointsDelta < 0) {
      let toConsume = Math.abs(tx.pointsDelta);
      for (const lot of lots) {
        if (toConsume <= 0) break;
        const take = Math.min(lot.remaining, toConsume);
        lot.remaining -= take;
        toConsume -= take;
      }
    }
  }

  return lots.filter((lot) => lot.remaining > 0);
}

export interface MemberExpiryInfo {
  expiringPoints: number;
  expiredPoints: number;
  nextExpiryDate: string | null;
}

function toDateSlice(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Points from a member that expire within the look-ahead window (inclusive). */
export function computeMemberExpiry(
  member: MemberCustomer,
  opts: { referenceDate: string; expiryDays?: number; windowDays?: number }
): MemberExpiryInfo {
  const expiryDays = opts.expiryDays ?? POINTS_EXPIRY_DAYS;
  const windowDays = opts.windowDays ?? EXPIRY_WARNING_WINDOW_DAYS;
  const refMs = Date.parse(opts.referenceDate);
  if (!Number.isFinite(refMs)) {
    return { expiringPoints: 0, expiredPoints: 0, nextExpiryDate: null };
  }

  const windowCutoffMs = refMs + windowDays * 86_400_000;
  let expiringPoints = 0;
  let expiredPoints = 0;
  let nextExpiryDate: string | null = null;

  for (const lot of buildMemberPointLots(member)) {
    const earnedMs = Date.parse(lot.tx.createdAt);
    if (!Number.isFinite(earnedMs)) continue;
    const expiryMs = earnedMs + expiryDays * 86_400_000;
    if (expiryMs > windowCutoffMs) continue;

    expiringPoints += lot.remaining;
    if (expiryMs <= refMs) expiredPoints += lot.remaining;

    const expiryDate = toDateSlice(expiryMs);
    if (!nextExpiryDate || expiryDate < nextExpiryDate) nextExpiryDate = expiryDate;
  }

  return {
    expiringPoints: Math.round(expiringPoints),
    expiredPoints: Math.round(expiredPoints),
    nextExpiryDate,
  };
}

export interface LoyaltyExpirySummary {
  affectedMembers: number;
  expiringPoints: number;
  expiredPoints: number;
  nextExpiryDate: string | null;
  rows: {
    memberId: string;
    memberName: string;
    phone: string;
    expiringPoints: number;
    expiredPoints: number;
    nextExpiryDate: string | null;
  }[];
}

export function summarizeLoyaltyExpiry(
  members: MemberCustomer[],
  opts: { referenceDate: string; expiryDays?: number; windowDays?: number }
): LoyaltyExpirySummary {
  let expiringPoints = 0;
  let expiredPoints = 0;
  let nextExpiryDate: string | null = null;
  const rows: LoyaltyExpirySummary['rows'] = [];

  for (const member of members) {
    const info = computeMemberExpiry(member, opts);
    if (info.expiringPoints <= 0) continue;
    expiringPoints += info.expiringPoints;
    expiredPoints += info.expiredPoints;
    if (info.nextExpiryDate && (!nextExpiryDate || info.nextExpiryDate < nextExpiryDate)) {
      nextExpiryDate = info.nextExpiryDate;
    }
    rows.push({
      memberId: member.id,
      memberName: member.name,
      phone: member.phone,
      expiringPoints: info.expiringPoints,
      expiredPoints: info.expiredPoints,
      nextExpiryDate: info.nextExpiryDate,
    });
  }

  rows.sort((a, b) => b.expiringPoints - a.expiringPoints);

  return {
    affectedMembers: rows.length,
    expiringPoints,
    expiredPoints,
    nextExpiryDate,
    rows,
  };
}

export interface LoyaltyExpiryAdjustment {
  memberId: string;
  memberName: string;
  phone: string;
  points: number;
  description: string;
}

/** Build the ledger adjustments that remove already-expired point lots. */
export function buildLoyaltyExpiryAdjustments(
  members: MemberCustomer[],
  opts: { referenceDate: string; expiryDays?: number }
): LoyaltyExpiryAdjustment[] {
  const refMs = Date.parse(opts.referenceDate);
  if (!Number.isFinite(refMs)) return [];

  const adjustments: LoyaltyExpiryAdjustment[] = [];
  for (const member of members) {
    let expired = 0;
    for (const lot of buildMemberPointLots(member)) {
      const earnedMs = Date.parse(lot.tx.createdAt);
      if (!Number.isFinite(earnedMs)) continue;
      if (earnedMs + (opts.expiryDays ?? POINTS_EXPIRY_DAYS) * 86_400_000 <= refMs) {
        expired += lot.remaining;
      }
    }
    if (expired > 0) {
      adjustments.push({
        memberId: member.id,
        memberName: member.name,
        phone: member.phone,
        points: Math.min(expired, Math.max(0, member.points)),
        description: `Points expired after ${opts.expiryDays ?? POINTS_EXPIRY_DAYS} days (rolling)`,
      });
    }
  }
  return adjustments;
}
