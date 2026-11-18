import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSeedState } from '../data/seedData';
import { routeIncomingQrOrder } from './qrAutoRouting';

describe('routeIncomingQrOrder', () => {
  it('routes incoming QR guest orders directly to KDS as sent/new and occupies a free table when qrMode is auto', () => {
    const base = createSeedState();
    const freeTable = base.tables.find((t) => t.branchId === 'branch_bkk1' && t.status === 'free')!;
    const prevOrdersCount = base.orders.length;

    const result = routeIncomingQrOrder({
      state: base,
      nowIso: '2026-11-18T12:00:00.000Z',
      payload: {
        branchId: 'branch_bkk1',
        tableId: freeTable.id,
        tableName: freeTable.name,
        channel: 'qr_table',
        note: 'Extra lime',
        items: [
          {
            menuItemId: 'm_iced_coffee',
            nameEn: 'Iced coffee with condensed milk',
            nameKh: 'កាហ្វេទឹកដោះគោទឹកកក',
            nameVi: 'Cà phê sữa đá',
            unitPriceUsd: 2.5,
            qty: 2,
            station: 'bar',
            category: 'Coffee & tea',
          },
        ],
      },
    });

    assert.equal(result.autoRouted, true);
    assert.equal(result.qrItem.status, 'accepted');
    assert.ok(result.order);
    assert.equal(result.order?.status, 'sent');
    assert.equal(result.order?.sourceQrId, result.qrItem.id);
    assert.equal(result.order?.kdsSubmittedAt, '2026-11-18T12:00:00.000Z');
    assert.equal(result.order?.items[0].sentToKitchen, true);
    assert.equal(result.order?.items[0].kdsStatus, 'new');
    assert.equal(result.order?.items[0].note, 'Extra lime');
    assert.equal(result.state.orders.length, prevOrdersCount + 1);
    assert.equal(result.state.nextOrderNumber, base.nextOrderNumber + 1);

    const updatedTable = result.state.tables.find((t) => t.id === freeTable.id)!;
    assert.equal(updatedTable.status, 'occupied');
    assert.equal(updatedTable.currentOrderId, result.order?.id);
  });

  it('appends QR items to an existing open table order and computes updated totals', () => {
    const base = createSeedState();
    const occupiedOrder = base.orders.find(
      (o) => o.branchId === 'branch_bkk1' && o.tableId && o.status !== 'paid' && o.status !== 'voided'
    )!;
    const prevCount = occupiedOrder.items.length;

    const result = routeIncomingQrOrder({
      state: base,
      nowIso: '2026-11-18T12:05:00.000Z',
      payload: {
        branchId: 'branch_bkk1',
        tableId: occupiedOrder.tableId,
        tableName: occupiedOrder.tableName,
        channel: 'qr_table',
        items: [
          {
            menuItemId: 'm_spring_rolls',
            nameEn: 'Fried spring rolls',
            nameKh: 'ណែមចៀន',
            nameVi: 'Chả giò giòn',
            unitPriceUsd: 3.25,
            qty: 1,
            station: 'kitchen',
            category: 'Starters',
          },
        ],
      },
    });

    assert.equal(result.autoRouted, true);
    assert.equal(result.order?.id, occupiedOrder.id);
    assert.equal(result.assignedOrderNumber, occupiedOrder.orderNumber);
    assert.equal(result.state.orders.length, base.orders.length);
    assert.equal(result.order?.items.length, prevCount + 1);
    assert.ok((result.order?.totalUsd || 0) > occupiedOrder.totalUsd);
  });

  it('queues as pending without creating a KDS order when branch qrMode is review', () => {
    const base = createSeedState();
    const reviewState = {
      ...base,
      branches: base.branches.map((b) =>
        b.id === 'branch_bkk1' ? { ...b, qrMode: 'review' as const } : b
      ),
    };

    const result = routeIncomingQrOrder({
      state: reviewState,
      nowIso: '2026-11-18T12:10:00.000Z',
      payload: {
        branchId: 'branch_bkk1',
        tableName: 'Counter QR',
        channel: 'qr_counter',
        items: [
          {
            menuItemId: 'm_iced_coffee',
            nameEn: 'Iced coffee with condensed milk',
            nameKh: 'កាហ្វេទឹកដោះគោទឹកកក',
            nameVi: 'Cà phê sữa đá',
            unitPriceUsd: 2.5,
            qty: 1,
            station: 'bar',
            category: 'Coffee & tea',
          },
        ],
      },
    });

    assert.equal(result.autoRouted, false);
    assert.equal(result.qrItem.status, 'pending');
    assert.equal(result.order, null);
    assert.equal(result.state.orders.length, reviewState.orders.length);
  });
});
