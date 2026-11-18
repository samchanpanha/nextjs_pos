import type { PosOrder } from '../types/pos';

export type KdsTicketColumn = 'new' | 'cooking' | 'ready' | 'served';
export type KdsPriorityTier =
  | 'overdue'
  | 'qr_rush'
  | 'qr'
  | 'just_in'
  | 'warn'
  | 'standard_new'
  | 'in_progress';

export interface KdsTicketPriorityInfo {
  isPriorityNew: boolean;
  isQrOrigin: boolean;
  isJustIn: boolean;
  tier: KdsPriorityTier;
  label: string;
  sublabel: string;
  sortRank: number;
  elapsedMinutes: number;
}

export interface ClassifyKdsPriorityInput {
  column: KdsTicketColumn;
  warnMinutes: number;
  lateMinutes: number;
  nowMs?: number;
  newWindowMinutes?: number;
}

export function isQrOriginatedOrder(order: Pick<PosOrder, 'sourceQrId' | 'channel'>): boolean {
  return (
    Boolean(order.sourceQrId) ||
    order.channel === 'qr_table' ||
    order.channel === 'qr_counter' ||
    order.channel === 'group'
  );
}

/**
 * Classifies KDS ticket priority so newly arrived and QR auto-routed orders
 * surface with clear visual priority indicators in the NEW column.
 */
export function classifyKdsTicketPriority(
  order: PosOrder,
  input: ClassifyKdsPriorityInput
): KdsTicketPriorityInfo {
  const nowMs = input.nowMs ?? Date.now();
  const warnMin = Math.max(1, input.warnMinutes || 8);
  const lateMin = Math.max(warnMin, input.lateMinutes || 15);
  const newWindowMin = Math.max(1, input.newWindowMinutes ?? 3);

  const submittedMs = Date.parse(order.kdsSubmittedAt || order.createdAt);
  const safeSubmittedMs = Number.isFinite(submittedMs) ? submittedMs : nowMs;
  const elapsedMinutes = Math.max(0, Math.round((nowMs - safeSubmittedMs) / 60000));
  const isQrOrigin = isQrOriginatedOrder(order);
  const isJustIn = elapsedMinutes <= 2;

  if (input.column !== 'new') {
    return {
      isPriorityNew: false,
      isQrOrigin,
      isJustIn: false,
      tier: 'in_progress',
      label: isQrOrigin ? 'QR ORDER' : '',
      sublabel: '',
      sortRank: 99,
      elapsedMinutes,
    };
  }

  if (isQrOrigin && elapsedMinutes <= 5) {
    return {
      isPriorityNew: true,
      isQrOrigin: true,
      isJustIn,
      tier: 'qr_rush',
      label: 'QR AUTO · HIGH PRIORITY',
      sublabel: isJustIn ? 'Just in · Auto-routed' : `${elapsedMinutes}m · Auto-routed`,
      sortRank: 0,
      elapsedMinutes,
    };
  }

  if (elapsedMinutes <= newWindowMin) {
    return {
      isPriorityNew: true,
      isQrOrigin: false,
      isJustIn,
      tier: 'just_in',
      label: 'NEW PRIORITY',
      sublabel: isJustIn ? 'Just arrived' : `${elapsedMinutes}m ago`,
      sortRank: 1,
      elapsedMinutes,
    };
  }

  if (elapsedMinutes >= lateMin) {
    return {
      isPriorityNew: true,
      isQrOrigin,
      isJustIn: false,
      tier: 'overdue',
      label: 'OVERDUE PRIORITY',
      sublabel: `${elapsedMinutes}m waiting`,
      sortRank: 2,
      elapsedMinutes,
    };
  }

  if (isQrOrigin) {
    return {
      isPriorityNew: true,
      isQrOrigin: true,
      isJustIn: false,
      tier: 'qr',
      label: 'QR PRIORITY',
      sublabel: 'Guest self-order',
      sortRank: 3,
      elapsedMinutes,
    };
  }

  if (elapsedMinutes >= warnMin) {
    return {
      isPriorityNew: true,
      isQrOrigin: false,
      isJustIn: false,
      tier: 'warn',
      label: 'DUE SOON',
      sublabel: `${elapsedMinutes}m elapsed`,
      sortRank: 4,
      elapsedMinutes,
    };
  }

  return {
    isPriorityNew: true,
    isQrOrigin: false,
    isJustIn: false,
    tier: 'standard_new',
    label: 'NEW ORDER',
    sublabel: 'Awaiting prep',
    sortRank: 5,
    elapsedMinutes,
  };
}

/**
 * Sorts NEW column tickets with overdue/QR rush/fresh priority tickets first,
 * breaking ties by newest arrival timestamp so incoming orders surface immediately.
 */
export function sortKdsNewOrders(
  orders: PosOrder[],
  input: Omit<ClassifyKdsPriorityInput, 'column'>
): PosOrder[] {
  return [...orders].sort((a, b) => {
    const pa = classifyKdsTicketPriority(a, { ...input, column: 'new' });
    const pb = classifyKdsTicketPriority(b, { ...input, column: 'new' });
    if (pa.sortRank !== pb.sortRank) {
      return pa.sortRank - pb.sortRank;
    }
    const ta = Date.parse(a.kdsSubmittedAt || a.createdAt) || 0;
    const tb = Date.parse(b.kdsSubmittedAt || b.createdAt) || 0;
    return tb - ta;
  });
}

export function countNewPriorityOrders(
  orders: PosOrder[],
  input: Omit<ClassifyKdsPriorityInput, 'column'>
): { totalNew: number; highPriorityCount: number; qrPriorityCount: number } {
  let highPriorityCount = 0;
  let qrPriorityCount = 0;
  for (const ord of orders) {
    const p = classifyKdsTicketPriority(ord, { ...input, column: 'new' });
    if (p.tier === 'overdue' || p.tier === 'qr_rush' || p.tier === 'qr' || p.tier === 'just_in') {
      highPriorityCount += 1;
    }
    if (p.isQrOrigin) {
      qrPriorityCount += 1;
    }
  }
  return {
    totalNew: orders.length,
    highPriorityCount,
    qrPriorityCount,
  };
}
