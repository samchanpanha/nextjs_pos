import type { PosOrder } from '../types/pos';

function getOrderCompletionTimeMs(order: PosOrder): number {
  const candidate = order.closedAt || order.updatedAt || order.createdAt;
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Finds the most recently completed (`status === 'paid'`) order for the given branch.
 * Orders are ranked by completion timestamp (`closedAt || updatedAt || createdAt`),
 * breaking ties by highest `orderNumber`.
 */
export function findMostRecentlyCompletedOrder(
  orders: PosOrder[],
  branchId: string
): PosOrder | null {
  let latest: PosOrder | null = null;
  let latestTime = -Infinity;

  for (const order of orders) {
    if (order.branchId !== branchId || order.status !== 'paid') continue;
    const timeMs = getOrderCompletionTimeMs(order);
    if (
      !latest ||
      timeMs > latestTime ||
      (timeMs === latestTime && order.orderNumber > latest.orderNumber)
    ) {
      latest = order;
      latestTime = timeMs;
    }
  }

  return latest;
}
