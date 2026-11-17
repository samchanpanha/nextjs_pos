import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PosOrder, QrIncomingOrder } from '../types/pos';
import { resolveGuestOrderLiveStatus } from './guestOrderStatus';

function makeOrder(partial: Partial<PosOrder> & Pick<PosOrder, 'id' | 'status' | 'items'>): PosOrder {
  return {
    branchId: 'b1',
    orderNumber: 105,
    tableId: 't_03',
    tableName: 'T03',
    channel: 'qr_table',
    guests: 2,
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
    cashierName: 'QR',
    createdAt: '2026-11-17T04:00:00Z',
    updatedAt: '2026-11-17T04:05:00Z',
    ...partial,
  };
}

describe('guestOrderStatus utilities', () => {
  it('shows Received (awaiting confirmation) while QR order is pending in queue', () => {
    const qrQueue: QrIncomingOrder[] = [
      {
        id: 'qr_1',
        branchId: 'b1',
        tableId: 't_03',
        tableName: 'T03',
        channel: 'qr_table',
        createdAt: '2026-11-17T04:00:00Z',
        status: 'pending',
        items: [
          {
            menuItemId: 'm1',
            nameEn: 'Fish amok',
            nameKh: 'អាម៉ុក',
            nameVi: 'Amok',
            unitPriceUsd: 6,
            qty: 1,
            station: 'kitchen',
            category: 'Mains',
          },
        ],
      },
    ];

    const status = resolveGuestOrderLiveStatus({
      branchId: 'b1',
      selectedTableId: 't_03',
      selectedTableName: 'T03',
      orders: [],
      qrQueue,
      submittedOrderNumber: 106,
    });

    assert.ok(status);
    assert.equal(status.stage, 'received');
    assert.equal(status.awaitingConfirmation, true);
    assert.equal(status.orderNumber, 106);
  });

  it('tracks live KDS progression from Received -> Preparing -> Ready -> Served', () => {
    const order = makeOrder({
      id: 'ord_qr_1',
      sourceQrId: 'qr_1',
      status: 'sent',
      items: [
        {
          id: 'li_1',
          menuItemId: 'm1',
          nameEn: 'Fish amok',
          nameKh: 'អាម៉ុក',
          nameVi: 'Amok',
          unitPriceUsd: 6,
          qty: 1,
          station: 'kitchen',
          category: 'Mains',
          round: 1,
          sentToKitchen: true,
          kdsStatus: 'new',
        },
        {
          id: 'li_2',
          menuItemId: 'm2',
          nameEn: 'Iced Latte',
          nameKh: 'ឡាតេ',
          nameVi: 'Latte',
          unitPriceUsd: 3,
          qty: 1,
          station: 'bar',
          category: 'Coffee',
          round: 1,
          sentToKitchen: true,
          kdsStatus: 'cooking',
        },
      ],
    });

    // Mixed new kitchen + cooking bar => overall 'preparing', station split accurate
    const preparing = resolveGuestOrderLiveStatus({
      branchId: 'b1',
      selectedTableId: 't_03',
      orders: [order],
      qrQueue: [],
    });
    assert.ok(preparing);
    assert.equal(preparing.stage, 'preparing');
    assert.equal(preparing.kitchenStage, 'received');
    assert.equal(preparing.barStage, 'preparing');
    assert.equal(preparing.awaitingConfirmation, false);

    // Both ready => overall 'ready'
    const readyOrder: PosOrder = {
      ...order,
      status: 'ready',
      items: order.items.map((i) => ({ ...i, kdsStatus: 'ready' })),
    };
    const ready = resolveGuestOrderLiveStatus({
      branchId: 'b1',
      selectedTableId: 't_03',
      orders: [readyOrder],
      qrQueue: [],
    });
    assert.equal(ready?.stage, 'ready');
    assert.equal(ready?.kitchenStage, 'ready');
    assert.equal(ready?.barStage, 'ready');

    // Served => overall 'served'
    const servedOrder: PosOrder = {
      ...order,
      status: 'served',
      items: order.items.map((i) => ({ ...i, kdsStatus: 'served' })),
    };
    const served = resolveGuestOrderLiveStatus({
      branchId: 'b1',
      selectedTableId: 't_03',
      orders: [servedOrder],
      qrQueue: [],
    });
    assert.equal(served?.stage, 'served');
  });

  it('tracks Counter QR orders when no tableId is selected', () => {
    const counterOrder = makeOrder({
      id: 'ord_paid_1',
      tableId: undefined,
      tableName: 'Counter QR · Dara',
      channel: 'qr_counter',
      orderNumber: 1,
      status: 'ready',
      items: [
        {
          id: 'oi_p1',
          menuItemId: 'm_amok',
          nameEn: 'Fish amok',
          nameKh: 'អាម៉ុកត្រី',
          nameVi: 'Amok',
          unitPriceUsd: 6,
          qty: 1,
          station: 'kitchen',
          category: 'Main dishes',
          round: 1,
          sentToKitchen: true,
          kdsStatus: 'ready',
        },
      ],
    });

    const counterStatus = resolveGuestOrderLiveStatus({
      branchId: 'b1',
      selectedTableId: '',
      selectedTableName: 'Counter QR',
      orders: [counterOrder],
      qrQueue: [],
    });
    assert.ok(counterStatus);
    assert.equal(counterStatus.stage, 'ready');
    assert.equal(counterStatus.orderNumber, 1);
  });
});
