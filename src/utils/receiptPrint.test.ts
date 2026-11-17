import test from 'node:test';
import assert from 'node:assert/strict';
import type { PosOrder } from '../types/pos';
import { findMostRecentlyCompletedOrder } from './receiptPrint';

function makeOrder(overrides: Partial<PosOrder>): PosOrder {
  return {
    id: 'ord_1',
    branchId: 'branch_bkk1',
    orderNumber: 1,
    tableName: 'T01',
    channel: 'dine_in',
    status: 'open',
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
    cashierName: 'Sokha',
    createdAt: '2026-11-17T08:00:00.000Z',
    updatedAt: '2026-11-17T08:00:00.000Z',
    ...overrides,
  };
}

test('findMostRecentlyCompletedOrder returns null when branch has no paid orders', () => {
  const orders: PosOrder[] = [
    makeOrder({ id: 'ord_open', status: 'open', orderNumber: 10 }),
    makeOrder({ id: 'ord_void', status: 'voided', orderNumber: 11 }),
    makeOrder({ id: 'ord_other_branch', branchId: 'branch_sr', status: 'paid', orderNumber: 12 }),
  ];

  assert.equal(findMostRecentlyCompletedOrder(orders, 'branch_bkk1'), null);
});

test('findMostRecentlyCompletedOrder selects paid order with newest closedAt timestamp', () => {
  const older = makeOrder({
    id: 'ord_old',
    orderNumber: 2,
    status: 'paid',
    closedAt: '2026-11-17T09:10:00.000Z',
  });
  const newest = makeOrder({
    id: 'ord_new',
    orderNumber: 101,
    status: 'paid',
    closedAt: '2026-11-17T11:36:00.000Z',
  });
  const openHigherNum = makeOrder({
    id: 'ord_open_102',
    orderNumber: 102,
    status: 'sent',
    updatedAt: '2026-11-17T12:00:00.000Z',
  });

  const picked = findMostRecentlyCompletedOrder([older, openHigherNum, newest], 'branch_bkk1');
  assert.equal(picked?.id, 'ord_new');
});

test('findMostRecentlyCompletedOrder breaks equal timestamps by highest orderNumber', () => {
  const ts = '2026-11-17T10:00:00.000Z';
  const a = makeOrder({ id: 'ord_a', orderNumber: 14, status: 'paid', closedAt: ts });
  const b = makeOrder({ id: 'ord_b', orderNumber: 19, status: 'paid', closedAt: ts });

  const picked = findMostRecentlyCompletedOrder([a, b], 'branch_bkk1');
  assert.equal(picked?.id, 'ord_b');
});
