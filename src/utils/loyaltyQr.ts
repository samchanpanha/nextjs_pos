import type { MemberCustomer } from '../types/pos';
import { normalizeCustomerPhone } from './loyaltyEngine';
import { roundCurrency } from './posMath';

export const LOYALTY_QR_PREFIX = 'XAIWORK-POS-LOYALTY';

export interface LoyaltyQrPayload {
  memberId?: string;
  phone?: string;
}

/**
 * Build the payload encoded into a member's loyalty QR card. The format is
 * deliberately compact so it stays scannable on printed cards:
 *   XAIWORK-POS-LOYALTY|v1|<memberId>|<normalized phone>
 */
export function buildLoyaltyQrPayload(
  member: Pick<MemberCustomer, 'id' | 'phone'>
): string {
  return `${LOYALTY_QR_PREFIX}|v1|${member.id}|${normalizeCustomerPhone(member.phone)}`;
}

/**
 * Parse a scanned loyalty QR payload. Accepts the native payload format plus
 * legacy fallbacks (a bare normalized phone number or a `mem_...` id) so
 * hand-keyed / wedge-scanner input still resolves.
 */
export function parseLoyaltyQrPayload(raw: string): LoyaltyQrPayload | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(LOYALTY_QR_PREFIX)) {
    const parts = trimmed.split('|');
    if (parts.length < 4 || parts[0] !== LOYALTY_QR_PREFIX) return null;
    const memberId = parts[2]?.trim() || undefined;
    const phone = normalizeCustomerPhone(parts[3] || '') || undefined;
    if (!memberId && !phone) return null;
    return { memberId, phone };
  }

  const phone = normalizeCustomerPhone(trimmed);
  if (phone && /^\+?[\d\s()-]{6,}$/.test(trimmed)) {
    return { phone };
  }
  if (/^mem_[A-Za-z0-9_-]+$/.test(trimmed)) {
    return { memberId: trimmed };
  }
  return null;
}

/** Resolve a scanned payload to an enrolled member, preferring the member id. */
export function findMemberByLoyaltyQr(
  members: MemberCustomer[],
  raw: string
): MemberCustomer | undefined {
  const payload = parseLoyaltyQrPayload(raw);
  if (!payload) return undefined;

  if (payload.memberId) {
    const byId = members.find((m) => m.id === payload.memberId);
    if (byId) return byId;
  }
  if (payload.phone) {
    const target = payload.phone;
    return members.find((m) => normalizeCustomerPhone(m.phone) === target);
  }
  return undefined;
}

export interface LoyaltyProgramSummary {
  activeMembers: number;
  totalPointsOutstanding: number;
  pointsOutstandingValueUsd: number;
  totalLifetimeSpendUsd: number;
  pointsIssued: number;
  pointsRedeemed: number;
  earningVisits: number;
  goldMembers: number;
  silverMembers: number;
}

/** Aggregate the loyalty ledger for the program tracking dashboard. */
export function summarizeLoyaltyProgram(params: {
  members: MemberCustomer[];
  pointsValuePer100: number;
}): LoyaltyProgramSummary {
  const { members, pointsValuePer100 } = params;

  let totalPointsOutstanding = 0;
  let totalLifetimeSpendUsd = 0;
  let pointsIssued = 0;
  let pointsRedeemed = 0;
  let earningVisits = 0;
  let goldMembers = 0;
  let silverMembers = 0;

  for (const member of members) {
    totalPointsOutstanding += Math.max(0, member.points);
    totalLifetimeSpendUsd += Math.max(0, member.totalSpentUsd);
    if (member.tier === 'Gold') goldMembers += 1;
    else if (member.tier === 'Silver') silverMembers += 1;

    for (const tx of member.loyaltyHistory || []) {
      if (tx.pointsDelta > 0) pointsIssued += tx.pointsDelta;
      else pointsRedeemed += Math.abs(tx.pointsDelta);
      if (tx.type === 'earn') earningVisits += 1;
    }
  }

  return {
    activeMembers: members.length,
    totalPointsOutstanding,
    pointsOutstandingValueUsd: roundCurrency(
      (totalPointsOutstanding / 100) * Math.max(0, pointsValuePer100)
    ),
    totalLifetimeSpendUsd: roundCurrency(totalLifetimeSpendUsd),
    pointsIssued,
    pointsRedeemed,
    earningVisits,
    goldMembers,
    silverMembers,
  };
}
