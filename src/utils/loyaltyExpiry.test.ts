import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LoyaltyTransaction, MemberCustomer } from '../types/pos';
import {
  buildLoyaltyExpiryAdjustments,
  buildMemberPointLots,
  computeMemberExpiry,
  POINTS_EXPIRY_DAYS,
  summarizeLoyaltyExpiry,
} from './loyaltyExpiry';

function tx(
  id: string,
  delta: number,
  createdAt: string,
  type: LoyaltyTransaction['type'] = 'earn'
): LoyaltyTransaction {
  return {
    id,
    memberId: 'mem_x',
    type,
    pointsDelta: delta,
    balanceAfter: 0,
    description: `${type} ${delta}`,
    createdAt,
  };
}

const members: MemberCustomer[] = [
  {
    id: 'mem_a',
    name: 'Dara',
    phone: '012 111 111',
    points: 120, // 100 + 50 - 30 redemption
    totalSpentUsd: 200,
    tier: 'Silver',
    lastVisit: '2026-11-01',
    loyaltyHistory: [
      tx('t3', -30, '2026-06-01T10:00:00Z', 'redeem_discount'),
      tx('t2', 50, '2026-01-01T10:00:00Z'),
      tx('t1', 100, '2025-01-01T10:00:00Z'),
    ],
  },
  {
    id: 'mem_b',
    name: 'Sophea',
    phone: '012 222 222',
    points: 200,
    totalSpentUsd: 300,
    tier: 'Gold',
    lastVisit: '2026-11-10',
    loyaltyHistory: [tx('t4', 200, '2026-11-01T10:00:00Z')],
  },
  {
    id: 'mem_c',
    name: 'Chanthy',
    phone: '012 333 333',
    points: 60,
    totalSpentUsd: 80,
    tier: 'Member',
    lastVisit: '2026-10-01',
    loyaltyHistory: [tx('t5', 60, '2025-12-01T10:00:00Z')],
  },
];

const opts = { referenceDate: '2026-11-17', windowDays: 30, expiryDays: POINTS_EXPIRY_DAYS };

describe('loyaltyExpiry utilities', () => {
  it('rebuilds point lots with FIFO redemption consumption', () => {
    const lots = buildMemberPointLots(members[0]!);
    // Oldest lot (100) partially consumed by the 30-pt redemption -> 70 left
    assert.equal(lots.length, 2);
    assert.equal(lots[0]?.remaining, 70);
    assert.equal(lots[1]?.remaining, 50);
  });

  it('computes expiring and already-expired points per member', () => {
    const a = computeMemberExpiry(members[0]!, opts);
    assert.equal(a.expiringPoints, 70); // lot expiring 2026-01-01
    assert.equal(a.expiredPoints, 70);
    assert.equal(a.nextExpiryDate, '2026-01-01');

    const b = computeMemberExpiry(members[1]!, opts);
    assert.equal(b.expiringPoints, 0); // expires 2027-11-01, outside the window
    assert.equal(b.expiredPoints, 0);

    const c = computeMemberExpiry(members[2]!, opts);
    assert.equal(c.expiringPoints, 60); // expires 2026-12-01, inside 30d window
    assert.equal(c.expiredPoints, 0);
    assert.equal(c.nextExpiryDate, '2026-12-01');
  });

  it('summarizes the program expiry exposure', () => {
    const summary = summarizeLoyaltyExpiry(members, opts);
    assert.equal(summary.affectedMembers, 2);
    assert.equal(summary.expiringPoints, 130);
    assert.equal(summary.expiredPoints, 70);
    assert.equal(summary.nextExpiryDate, '2026-01-01');
    assert.equal(summary.rows[0]?.memberId, 'mem_a'); // largest exposure first
    assert.equal(summary.rows[1]?.memberId, 'mem_c');
  });

  it('builds adjustments only for already-expired lots, capped at the balance', () => {
    const adjustments = buildLoyaltyExpiryAdjustments(members, opts);
    assert.equal(adjustments.length, 1);
    assert.equal(adjustments[0]?.memberId, 'mem_a');
    assert.equal(adjustments[0]?.points, 70);
    assert.match(adjustments[0]?.description || '', /expired/i);
  });

  it('returns nothing when no points have expired', () => {
    const fresh: MemberCustomer[] = [
      {
        id: 'mem_fresh',
        name: 'Fresh',
        phone: '012 444 444',
        points: 100,
        totalSpentUsd: 50,
        tier: 'Member',
        lastVisit: '2026-11-16',
        loyaltyHistory: [tx('t6', 100, '2026-11-16T10:00:00Z')],
      },
    ];
    assert.equal(summarizeLoyaltyExpiry(fresh, opts).expiringPoints, 0);
    assert.deepEqual(buildLoyaltyExpiryAdjustments(fresh, opts), []);
  });
});
