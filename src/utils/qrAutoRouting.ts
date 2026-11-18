import type {
  AuditLogEntry,
  BranchConfig,
  OrderLineItem,
  PosAppState,
  PosOrder,
  PosTable,
  QrIncomingOrder,
} from '../types/pos';
import { calculateOrderTotals } from './posMath';

export interface RouteQrOrderInput {
  state: PosAppState;
  payload: Omit<QrIncomingOrder, 'id' | 'createdAt' | 'status'>;
  qrId?: string;
  orderId?: string;
  nowIso?: string;
}

export interface RouteQrOrderResult {
  state: PosAppState;
  qrItem: QrIncomingOrder;
  order: PosOrder | null;
  tableUpdated: PosTable | null;
  assignedOrderNumber: number;
  autoRouted: boolean;
}

function makeUid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function computeOrderWithTotals(order: PosOrder, branch: BranchConfig, nowIso: string): PosOrder {
  const totals = calculateOrderTotals({
    items: order.items,
    exchangeRate: branch.exchangeRate,
    rielRounding: branch.rielRounding,
    vatPercent: branch.vatPercent,
    serviceChargePercent: branch.serviceChargePercent,
    manualDiscountPercent: order.manualDiscountPercent,
    manualDiscountUsd: order.manualDiscountUsd,
    promoDiscountUsd: order.promoDiscountUsd,
    pointsRedeemed: order.pointsRedeemed,
    pointsValuePer100: branch.pointsValuePer100,
    depositAppliedUsd: order.depositAppliedUsd,
  });

  return {
    ...order,
    totalUsd: totals.totalUsd,
    totalKhr: totals.totalKhr,
    updatedAt: nowIso,
  };
}

/**
 * Pure helper shared between client context and server SQLite repository
 * to route incoming Guest QR orders either straight to KDS ('auto')
 * or into the manual approval queue ('review').
 */
export function routeIncomingQrOrder(input: RouteQrOrderInput): RouteQrOrderResult {
  const { state, payload } = input;
  const nowIso = input.nowIso || new Date().toISOString();
  const qrId = input.qrId || makeUid('qr');

  const targetBranch =
    state.branches.find((b) => b.id === payload.branchId) ||
    state.branches.find((b) => b.id === state.activeBranchId) ||
    state.branches[0];

  const isAuto = targetBranch?.qrMode === 'auto';

  const qrItem: QrIncomingOrder = {
    ...payload,
    id: qrId,
    createdAt: nowIso,
    status: isAuto ? 'accepted' : 'pending',
  };

  if (!isAuto || !targetBranch) {
    return {
      state: {
        ...state,
        qrQueue: [qrItem, ...state.qrQueue],
      },
      qrItem,
      order: null,
      tableUpdated: null,
      assignedOrderNumber: state.nextOrderNumber,
      autoRouted: false,
    };
  }

  const existingTableOrder = payload.tableId
    ? state.orders.find(
        (o) =>
          o.branchId === payload.branchId &&
          o.tableId === payload.tableId &&
          o.status !== 'paid' &&
          o.status !== 'voided'
      )
    : undefined;

  const newLines: OrderLineItem[] = payload.items.map((it, idx) => ({
    id: `${qrId}_oi_${idx}`,
    menuItemId: it.menuItemId,
    nameEn: it.nameEn,
    nameKh: it.nameKh,
    nameVi: it.nameVi,
    unitPriceUsd: it.unitPriceUsd,
    qty: it.qty,
    station: it.station,
    category: it.category,
    optionLabel: it.optionLabel,
    orderedBy: it.orderedBy,
    note: payload.note,
    round: existingTableOrder ? existingTableOrder.currentRound : 1,
    sentToKitchen: true,
    kdsStatus: 'new',
  }));

  let nextOrders: PosOrder[];
  let nextTables: PosTable[] = state.tables;
  let nextOrderNumber = state.nextOrderNumber;
  let resultingOrder: PosOrder;
  let tableUpdated: PosTable | null = null;

  if (existingTableOrder) {
    resultingOrder = computeOrderWithTotals(
      {
        ...existingTableOrder,
        items: [...existingTableOrder.items, ...newLines],
        status: 'sent',
        sourceQrId: qrItem.id,
        memberPhone: existingTableOrder.memberPhone || payload.phone,
        kdsSubmittedAt: existingTableOrder.kdsSubmittedAt || nowIso,
      },
      targetBranch,
      nowIso
    );
    nextOrders = state.orders.map((o) => (o.id === existingTableOrder.id ? resultingOrder : o));
  } else {
    const newOrderId = input.orderId || makeUid('ord_qr');
    const assignedNumber = state.nextOrderNumber;
    resultingOrder = computeOrderWithTotals(
      {
        id: newOrderId,
        branchId: payload.branchId,
        orderNumber: assignedNumber,
        tableId: payload.tableId,
        tableName: payload.tableName,
        channel: payload.channel,
        status: 'sent',
        guests: 2,
        items: newLines,
        currentRound: 1,
        manualDiscountPercent: 0,
        manualDiscountUsd: 0,
        promoDiscountUsd: 0,
        pointsRedeemed: 0,
        memberPhone: payload.phone,
        depositAppliedUsd: 0,
        totalUsd: 0,
        totalKhr: 0,
        paidUsd: 0,
        paidKhr: 0,
        changeUsd: 0,
        changeKhr: 0,
        cashierName: 'QR Self-Order',
        sourceQrId: qrItem.id,
        kdsSubmittedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      targetBranch,
      nowIso
    );
    nextOrders = [resultingOrder, ...state.orders];
    nextOrderNumber += 1;

    if (payload.tableId) {
      nextTables = state.tables.map((t) => {
        if (t.id === payload.tableId) {
          const updated: PosTable = {
            ...t,
            status: 'occupied',
            currentOrderId: resultingOrder.id,
            openedAt: t.openedAt || nowIso,
          };
          tableUpdated = updated;
          return updated;
        }
        return t;
      });
    }
  }

  const auditEntry: AuditLogEntry = {
    id: `${qrId}_audit`,
    branchId: payload.branchId,
    actorName: `Guest (${payload.tableName})`,
    action: 'QR order auto-routed to KDS',
    detail: `Order #${resultingOrder.orderNumber} (${payload.tableName}) · ${payload.items.reduce(
      (s, i) => s + i.qty,
      0
    )} item(s) sent straight to Kitchen Display`,
    severity: 'info',
    createdAt: nowIso,
  };

  return {
    state: {
      ...state,
      nextOrderNumber,
      orders: nextOrders,
      tables: nextTables,
      qrQueue: [qrItem, ...state.qrQueue],
      auditLogs: [auditEntry, ...state.auditLogs],
    },
    qrItem,
    order: resultingOrder,
    tableUpdated,
    assignedOrderNumber: resultingOrder.orderNumber,
    autoRouted: true,
  };
}
