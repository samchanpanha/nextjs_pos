import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PosOrder } from '../types/pos';
import {
  classifyKdsTicketPriority,
  countNewPriorityOrders,
  sortKdsNewOrders,
} from './kdsPriority';

function makeOrder(overrides: Partial<PosOrder>): PosOrder {
  const nowIso = '2026-11-18T12:00:00.000Z';
  return {
    id: 'ord_1',
    branchId: 'branch_bkk1',
    orderNumber: 101,
    tableName: 'T01',
    channel: 'dine_in',
    status: 'sent',
    guests: 2,
    items: [],
    currentRound: 1,
    manualDiscountPercent: 0,
    manualDiscountUsd: 0,
    promoDiscountUsd: 0,
    pointsRedeemed: 0,
    depositAppliedUsd: 0,
    totalUsd: 10,
    totalKhr: 41000,
    paidUsd: 0,
    paidKhr: 0,
    changeUsd: 0,
    changeKhr: 0,
    cashierName: 'Staff',
    createdAt: nowIso,
    updatedAt: nowIso,
    kdsSubmittedAt: nowIso,
    ...overrides,
  };
}

describe('kdsPriority', () => {
  const baseNow = Date.parse('2026-11-18T12:20:00.000Z');

  it('classifies freshly auto-routed QR orders in NEW column as QR AUTO · HIGH PRIORITY', () => {
    const qrOrder = makeOrder({
      id: 'ord_qr_1',
      channel: 'qr_table',
      sourceQrId: 'qr_123',
      kdsSubmittedAt: '2026-11-18T12:19:30.000Z',
    });
    const info = classifyKdsTicketPriority(qrOrder, {
      column: 'new',
      warnMinutes: 8,
      lateMinutes: 15,
      nowMs: baseNow,
    });

    assert.equal(info.isPriorityNew, true);
    assert.equal(info.isQrOrigin, true);
    assert.equal(info.isJustIn, true);
    assert.equal(info.tier, 'qr_rush');
    assert.equal(info.label, 'QR AUTO · HIGH PRIORITY');
  });

  it('classifies brand new POS orders (<3m) as NEW PRIORITY and clears new-order priority once cooking', () => {
    const freshPosOrder = makeOrder({
      id: 'ord_pos_1',
      channel: 'dine_in',
      kdsSubmittedAt: '2026-11-18T12:18:30.000Z',
    });

    const newInfo = classifyKdsTicketPriority(freshPosOrder, {
      column: 'new',
      warnMinutes: 8,
      lateMinutes: 15,
      nowMs: baseNow,
    });
    assert.equal(newInfo.isPriorityNew, true);
    assert.equal(newInfo.tier, 'just_in');
    assert.equal(newInfo.label, 'NEW PRIORITY');

    const cookingInfo = classifyKdsTicketPriority(freshPosOrder, {
      column: 'cooking',
      warnMinutes: 8,
      lateMinutes: 15,
      nowMs: baseNow,
    });
    assert.equal(cookingInfo.isPriorityNew, false);
    assert.equal(cookingInfo.tier, 'in_progress');
  });

  it('sorts overdue and QR rush orders ahead of standard new orders', () => {
    const standard = makeOrder({
      id: 'ord_std',
      kdsSubmittedAt: '2026-11-18T12:14:00.000Z', // 6m ago
    });
    const qrRush = makeOrder({
      id: 'ord_qr',
      channel: 'qr_table',
      sourceQrId: 'qr_9',
      kdsSubmittedAt: '2026-11-18T12:19:00.000Z', // 1m ago
    });
    const overdue = makeOrder({
      id: 'ord_late',
      kdsSubmittedAt: '2026-11-18T12:00:00.000Z', // 20m ago
    });

    const sorted = sortKdsNewOrders([standard, qrRush, overdue], {
      warnMinutes: 8,
      lateMinutes: 15,
      nowMs: baseNow,
    });

    assert.deepEqual(
      sorted.map((o) => o.id),
      ['ord_qr', 'ord_late', 'ord_std']
    );

    const counts = countNewPriorityOrders([standard, qrRush, overdue], {
      warnMinutes: 8,
      lateMinutes: 15,
      nowMs: baseNow,
    });
    assert.equal(counts.totalNew, 3);
    assert.equal(counts.highPriorityCount, 2);
    assert.equal(counts.qrPriorityCount, 1);
  });
});
