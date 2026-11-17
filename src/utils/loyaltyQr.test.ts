import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MemberCustomer } from '../types/pos';
import {
  buildLoyaltyQrPayload,
  findMemberByLoyaltyQr,
  LOYALTY_QR_PREFIX,
  parseLoyaltyQrPayload,
  summarizeLoyaltyProgram,
} from './loyaltyQr';

const members: MemberCustomer[] = [
  {
    id: 'mem_a',
    name: 'Dara Chan',
    phone: '012 888 999',
    points: 320,
    totalSpentUsd: 145.5,
    tier: 'Silver',
    lastVisit: '2026-11-16',
    loyaltyHistory: [
      {
        id: 'ltx_1',
        memberId: 'mem_a',
        orderId: 'o1',
        orderNumber: 101,
        type: 'earn',
        pointsDelta: 120,
        balanceAfter: 120,
        description: 'Earned from Bill #101 ($12.00)',
        amountUsd: 12,
        createdAt: '2026-11-15T10:00:00Z',
      },
      {
        id: 'ltx_2',
        memberId: 'mem_a',
        orderId: 'o2',
        orderNumber: 102,
        type: 'redeem_discount',
        pointsDelta: -50,
        balanceAfter: 70,
        description: 'Redeemed $0.50 discount on #102',
        amountUsd: 0.5,
        createdAt: '2026-11-16T10:00:00Z',
      },
    ],
  },
  {
    id: 'mem_b',
    name: 'Sophea Meas',
    phone: '017445220',
    points: 900,
    totalSpentUsd: 620,
    tier: 'Gold',
    lastVisit: '2026-11-17',
    loyaltyHistory: [
      {
        id: 'ltx_3',
        memberId: 'mem_b',
        orderId: 'o3',
        orderNumber: 103,
        type: 'earn',
        pointsDelta: 900,
        balanceAfter: 900,
        description: 'Earned from Bill #103 ($90.00)',
        amountUsd: 90,
        createdAt: '2026-11-17T09:00:00Z',
      },
    ],
  },
];

describe('loyaltyQr utilities', () => {
  it('builds and parses a member QR payload', () => {
    const payload = buildLoyaltyQrPayload({ id: 'mem_a', phone: '012 888 999' });
    assert.equal(payload, `${LOYALTY_QR_PREFIX}|v1|mem_a|012888999`);

    const parsed = parseLoyaltyQrPayload(payload);
    assert.deepEqual(parsed, { memberId: 'mem_a', phone: '012888999' });
  });

  it('parses legacy phone and member-id fallbacks', () => {
    assert.deepEqual(parseLoyaltyQrPayload('012 888 999'), { phone: '012888999' });
    assert.deepEqual(parseLoyaltyQrPayload('+855 17 445 220'), { phone: '+85517445220' });
    assert.deepEqual(parseLoyaltyQrPayload('mem_b'), { memberId: 'mem_b' });
    assert.equal(parseLoyaltyQrPayload('hello world'), null);
    assert.equal(parseLoyaltyQrPayload(''), null);
    assert.equal(parseLoyaltyQrPayload(`${LOYALTY_QR_PREFIX}|v1|only-id`), null);
  });

  it('resolves a scanned payload to the member', () => {
    const byId = findMemberByLoyaltyQr(members, buildLoyaltyQrPayload(members[0]!));
    assert.equal(byId?.id, 'mem_a');

    const byPhone = findMemberByLoyaltyQr(members, '017 445 220');
    assert.equal(byPhone?.id, 'mem_b');

    // Stale id with a valid phone falls back to the phone match
    const stale = findMemberByLoyaltyQr(
      members,
      `${LOYALTY_QR_PREFIX}|v1|mem_missing|012888999`
    );
    assert.equal(stale?.id, 'mem_a');

    assert.equal(findMemberByLoyaltyQr(members, '099 999 999'), undefined);
  });

  it('summarizes the loyalty program ledger', () => {
    const summary = summarizeLoyaltyProgram({ members, pointsValuePer100: 1 });
    assert.equal(summary.activeMembers, 2);
    assert.equal(summary.totalPointsOutstanding, 1220);
    assert.equal(summary.pointsOutstandingValueUsd, 12.2);
    assert.equal(summary.totalLifetimeSpendUsd, 765.5);
    assert.equal(summary.pointsIssued, 1020);
    assert.equal(summary.pointsRedeemed, 50);
    assert.equal(summary.earningVisits, 2);
    assert.equal(summary.goldMembers, 1);
    assert.equal(summary.silverMembers, 1);
  });

  it('handles an empty member list', () => {
    const summary = summarizeLoyaltyProgram({ members: [], pointsValuePer100: 1 });
    assert.equal(summary.activeMembers, 0);
    assert.equal(summary.totalPointsOutstanding, 0);
    assert.equal(summary.pointsOutstandingValueUsd, 0);
  });
});
