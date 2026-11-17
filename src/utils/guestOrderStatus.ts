import type { OrderLineItem, PosOrder, QrIncomingOrder } from '../types/pos';

export type GuestOrderStage = 'received' | 'preparing' | 'ready' | 'served' | 'declined';

export interface GuestItemStatusSummary {
  id: string;
  nameEn: string;
  nameKh: string;
  nameVi: string;
  qty: number;
  station: 'kitchen' | 'bar';
  stage: Exclude<GuestOrderStage, 'declined'>;
}

export interface GuestLiveOrderStatus {
  stage: GuestOrderStage;
  orderNumber?: number;
  tableName: string;
  updatedAt: string;
  itemCount: number;
  kitchenStage: Exclude<GuestOrderStage, 'declined'> | null;
  barStage: Exclude<GuestOrderStage, 'declined'> | null;
  items: GuestItemStatusSummary[];
  awaitingConfirmation: boolean;
}

function mapLineKdsStatus(status: OrderLineItem['kdsStatus']): Exclude<GuestOrderStage, 'declined'> {
  switch (status) {
    case 'cooking':
      return 'preparing';
    case 'ready':
      return 'ready';
    case 'served':
      return 'served';
    case 'draft':
    case 'new':
    default:
      return 'received';
  }
}

function aggregateStages(
  stages: Exclude<GuestOrderStage, 'declined'>[]
): Exclude<GuestOrderStage, 'declined'> | null {
  if (stages.length === 0) return null;
  if (stages.every((s) => s === 'served')) return 'served';
  if (stages.every((s) => s === 'ready' || s === 'served')) return 'ready';
  if (stages.some((s) => s === 'preparing' || s === 'ready' || s === 'served')) {
    return 'preparing';
  }
  return 'received';
}

export function resolveGuestOrderLiveStatus(input: {
  branchId: string;
  selectedTableId?: string;
  selectedTableName?: string;
  orders: PosOrder[];
  qrQueue: QrIncomingOrder[];
  submittedOrderNumber?: number | null;
}): GuestLiveOrderStatus | null {
  const targetTableId = input.selectedTableId || '';
  const targetTableName = input.selectedTableName || 'Counter QR';

  // 1. Check most recent matching QR submission for this table/counter
  const matchingQr = input.qrQueue.find((q) => {
    if (q.branchId !== input.branchId) return false;
    if (targetTableId) return q.tableId === targetTableId;
    return !q.tableId && q.channel === 'qr_counter';
  });

  if (matchingQr && matchingQr.status === 'pending') {
    return {
      stage: 'received',
      orderNumber: input.submittedOrderNumber ?? undefined,
      tableName: matchingQr.tableName || targetTableName,
      updatedAt: matchingQr.createdAt,
      itemCount: matchingQr.items.reduce((s, i) => s + i.qty, 0),
      kitchenStage: null,
      barStage: null,
      items: matchingQr.items.map((it, idx) => ({
        id: `${matchingQr.id}_${idx}`,
        nameEn: it.nameEn,
        nameKh: it.nameKh,
        nameVi: it.nameVi,
        qty: it.qty,
        station: it.station,
        stage: 'received',
      })),
      awaitingConfirmation: true,
    };
  }

  // 2. Match active KDS / POS order (prioritizing explicit sourceQrId link, then tableId, then Counter QR)
  const branchOrders = input.orders.filter(
    (o) => o.branchId === input.branchId && o.status !== 'voided'
  );

  let matchedOrder: PosOrder | undefined;
  if (matchingQr) {
    matchedOrder = branchOrders.find((o) => o.sourceQrId === matchingQr.id);
  }
  if (!matchedOrder && input.submittedOrderNumber != null) {
    matchedOrder = branchOrders.find((o) => o.orderNumber === input.submittedOrderNumber);
  }
  if (!matchedOrder) {
    if (targetTableId) {
      matchedOrder = branchOrders.find(
        (o) =>
          o.tableId === targetTableId &&
          o.status !== 'paid' &&
          o.items.some((i) => i.sentToKitchen && !i.voided)
      );
    } else {
      matchedOrder = branchOrders.find(
        (o) =>
          !o.tableId &&
          o.channel === 'qr_counter' &&
          o.status !== 'paid' &&
          o.items.some((i) => i.sentToKitchen && !i.voided)
      );
    }
  }

  if (matchedOrder) {
    const activeItems = matchedOrder.items.filter((i) => !i.voided);
    const sentItems = activeItems.filter((i) => i.sentToKitchen);
    const trackedItems = sentItems.length > 0 ? sentItems : activeItems;

    if (trackedItems.length === 0) return null;

    const itemSummaries: GuestItemStatusSummary[] = trackedItems.map((i) => ({
      id: i.id,
      nameEn: i.nameEn,
      nameKh: i.nameKh,
      nameVi: i.nameVi,
      qty: i.qty,
      station: i.station,
      stage: mapLineKdsStatus(i.kdsStatus),
    }));

    let overallStage =
      aggregateStages(itemSummaries.map((i) => i.stage)) || 'received';

    if (matchedOrder.status === 'served' || matchedOrder.status === 'paid') {
      overallStage = 'served';
    } else if (matchedOrder.status === 'ready' && overallStage !== 'served') {
      overallStage = 'ready';
    } else if (matchedOrder.status === 'cooking' && overallStage === 'received') {
      overallStage = 'preparing';
    }

    const kitchenStage = aggregateStages(
      itemSummaries.filter((i) => i.station === 'kitchen').map((i) => i.stage)
    );
    const barStage = aggregateStages(
      itemSummaries.filter((i) => i.station === 'bar').map((i) => i.stage)
    );

    return {
      stage: overallStage,
      orderNumber: matchedOrder.orderNumber,
      tableName: matchedOrder.tableName,
      updatedAt: matchedOrder.updatedAt,
      itemCount: trackedItems.reduce((s, i) => s + i.qty, 0),
      kitchenStage,
      barStage,
      items: itemSummaries,
      awaitingConfirmation: false,
    };
  }

  if (matchingQr && matchingQr.status === 'rejected') {
    return {
      stage: 'declined',
      orderNumber: input.submittedOrderNumber ?? undefined,
      tableName: matchingQr.tableName || targetTableName,
      updatedAt: matchingQr.createdAt,
      itemCount: matchingQr.items.reduce((s, i) => s + i.qty, 0),
      kitchenStage: null,
      barStage: null,
      items: [],
      awaitingConfirmation: false,
    };
  }

  return null;
}
