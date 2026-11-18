import type {
  BranchConfig,
  DailyRevenuePoint,
  Ingredient,
  MenuItem,
  PosOrder,
  PurchaseOrder,
  Recipe,
  StockHistoryEntry,
  Supplier,
} from '../types/pos';
import { matchIngredientSupplier } from './accountingEngine';
import { addDaysIso, type StockUrgencyTier } from './aiStockMonitor';
import { roundCurrency } from './posMath';

export type ProjectionScenarioMode = 'historical' | 'busy' | 'slow';
export type OrderByUrgencyStatus = 'overdue' | 'upcoming' | 'planned' | 'healthy';

export interface InventoryProjectionOptions {
  referenceDate?: string;
  forecastHorizonDays?: number;
  leadTimeDays?: number;
  safetyBufferDays?: number;
  scenarioMode?: ProjectionScenarioMode;
}

export interface DailyStockProjectionPoint {
  dayIndex: number;
  date: string;
  label: string;
  projectedOnHand: number;
  minLevel: number;
  reorderTriggerPoint: number;
}

export interface ProjectedIngredientItem {
  ingredientId: string;
  ingredientName: string;
  nameKh: string;
  unit: string;
  purchaseUnit: string;
  purchaseUnitSize: number;
  onHand: number;
  minLevel: number;
  avgCostUsd: number;
  /** Raw 7-day baseline consumption in base units. */
  observedUsed7d: number;
  /** Daily burn before sales-trend scaling. */
  baseDailyBurn: number;
  /** Daily burn scaled by historical sales velocity & selected scenario. */
  projectedDailyBurn: number;
  /** Estimated days until stock reaches 0 at projectedDailyBurn (null if zero burn & positive stock). */
  daysUntilDepletion: number | null;
  /** Estimated days until stock hits minLevel (null if zero burn). */
  daysUntilMinLevel: number | null;
  /** Predicted calendar date (YYYY-MM-DD) when stock depletes to 0, or 'Depleted' / 'Stable (>60d)'. */
  predictedDepletionDate: string;
  /** Calendar date (YYYY-MM-DD) by which an order must be placed to avoid stockout after leadTime + buffer. */
  orderByDate: string | null;
  /** Days remaining from referenceDate until orderByDate (0 means order today / overdue). */
  daysUntilOrderBy: number | null;
  orderByStatus: OrderByUrgencyStatus;
  urgency: StockUrgencyTier;
  isLowStock: boolean;
  /** Suggested reorder quantity in base units (rounded to purchaseUnitSize). */
  suggestedReorderQty: number;
  suggestedPacks: number;
  estimatedOrderCostUsd: number;
  supplierName: string | null;
  openPoIncomingQty: number;
  openPoExpectedDate: string | null;
  linkedDishes: string[];
  dailySeries: DailyStockProjectionPoint[];
}

export interface InventoryProjectionSummary {
  branchId: string;
  branchName: string;
  referenceDate: string;
  forecastHorizonDays: number;
  leadTimeDays: number;
  safetyBufferDays: number;
  scenarioMode: ProjectionScenarioMode;
  historicalTrendFactor: number;
  effectiveMultiplier: number;
  recent7dAvgSalesUsd: number;
  baselineAvgSalesUsd: number;
  historicalDaysAnalyzed: number;
  immediateOrderCount: number;
  upcomingOrderCount: number;
  lowStockItemCount: number;
  totalEstimatedOrderUsd: number;
  earliestDepletionItem: ProjectedIngredientItem | null;
  items: ProjectedIngredientItem[];
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatShortDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = Math.max(0, Math.min(11, Number(match[2]) - 1));
  return `${monthNames[monthIdx]} ${Number(match[3])}`;
}

/**
 * Computes recent 7-day daily sales velocity vs full historical daily average
 * so projected ingredient burn reflects accelerating or softening demand.
 */
export function computeHistoricalSalesVelocity(dailyRevenueHistory: DailyRevenuePoint[]): {
  recent7dAvgSalesUsd: number;
  baselineAvgSalesUsd: number;
  historicalTrendFactor: number;
  daysAnalyzed: number;
} {
  const valid = dailyRevenueHistory.filter(
    (d) => typeof d.netSalesUsd === 'number' && Number.isFinite(d.netSalesUsd) && d.netSalesUsd >= 0
  );
  if (valid.length === 0) {
    return {
      recent7dAvgSalesUsd: 0,
      baselineAvgSalesUsd: 0,
      historicalTrendFactor: 1,
      daysAnalyzed: 0,
    };
  }

  const totalSales = valid.reduce((sum, d) => sum + d.netSalesUsd, 0);
  const baselineAvgSalesUsd = roundCurrency(totalSales / valid.length);
  const recent7 = valid.slice(-7);
  const recent7dAvgSalesUsd = roundCurrency(
    recent7.reduce((sum, d) => sum + d.netSalesUsd, 0) / recent7.length
  );

  // Exclude today's partial day when comparing full prior days if >= 8 days exist
  const fullRecent = valid.length >= 8 ? valid.slice(-8, -1) : recent7;
  const priorBaseline = valid.length >= 14 ? valid.slice(0, -1) : valid;
  const fullRecentAvg =
    fullRecent.reduce((sum, d) => sum + d.netSalesUsd, 0) / Math.max(1, fullRecent.length);
  const priorAvg =
    priorBaseline.reduce((sum, d) => sum + d.netSalesUsd, 0) / Math.max(1, priorBaseline.length);

  const rawRatio = priorAvg > 0 ? fullRecentAvg / priorAvg : 1;
  // Clamp to a realistic operational band (0.75x .. 1.45x) so anomalies do not distort projections
  const historicalTrendFactor = roundTo(Math.min(1.45, Math.max(0.75, rawRatio)), 2);

  return {
    recent7dAvgSalesUsd,
    baselineAvgSalesUsd,
    historicalTrendFactor,
    daysAnalyzed: valid.length,
  };
}

export function buildInventoryProjection(input: {
  branch: Pick<BranchConfig, 'id' | 'name'>;
  ingredients: Ingredient[];
  recipes: Recipe[];
  menuItems: MenuItem[];
  orders: PosOrder[];
  stockHistory: StockHistoryEntry[];
  dailyRevenueHistory: DailyRevenuePoint[];
  suppliers?: Supplier[];
  purchaseOrders?: PurchaseOrder[];
  options?: InventoryProjectionOptions;
}): InventoryProjectionSummary {
  const opts = input.options || {};
  const referenceDate = (opts.referenceDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const forecastHorizonDays = Math.min(
    60,
    Math.max(7, Math.round(opts.forecastHorizonDays ?? 14))
  );
  const leadTimeDays = Math.min(14, Math.max(1, Math.round(opts.leadTimeDays ?? 2)));
  const safetyBufferDays = Math.min(14, Math.max(0, Math.round(opts.safetyBufferDays ?? 2)));
  const scenarioMode: ProjectionScenarioMode = opts.scenarioMode || 'historical';

  const velocity = computeHistoricalSalesVelocity(input.dailyRevenueHistory || []);
  const scenarioFactor =
    scenarioMode === 'busy' ? 1.2 : scenarioMode === 'slow' ? 0.85 : 1.0;
  const effectiveMultiplier = roundTo(velocity.historicalTrendFactor * scenarioFactor, 2);

  const branchIngredients = input.ingredients.filter((i) => i.branchId === input.branch.id);
  const branchMenu = input.menuItems.filter((m) => m.branchId === input.branch.id);
  const menuMap = new Map(branchMenu.map((m) => [m.id, m]));
  const recipeMap = new Map(input.recipes.map((r) => [r.menuItemId, r]));

  const branchOrders = input.orders.filter(
    (o) => o.branchId === input.branch.id && o.status !== 'voided'
  );

  // Recipe-linked order consumption
  const orderUsageByIngredient = new Map<string, number>();
  for (const order of branchOrders) {
    for (const line of order.items) {
      if (line.voided) continue;
      const recipe = recipeMap.get(line.menuItemId);
      if (!recipe) continue;
      for (const rLine of recipe.lines) {
        const prev = orderUsageByIngredient.get(rLine.ingredientId) || 0;
        orderUsageByIngredient.set(
          rLine.ingredientId,
          prev + Math.max(0, rLine.qtyPerPortion) * Math.max(0, line.qty)
        );
      }
    }
  }

  // Recent 7-day stock ledger deductions & waste
  const refMs = Date.parse(referenceDate);
  const sevenDaysAgoMs = (Number.isFinite(refMs) ? refMs : Date.now()) - 7 * 86400000;
  const wasteByIngredient = new Map<string, number>();
  const saleDeductByIngredient = new Map<string, number>();

  for (const entry of input.stockHistory) {
    const ts = Date.parse(entry.createdAt);
    if (Number.isFinite(ts) && ts < sevenDaysAgoMs) continue;
    if (entry.type === 'waste') {
      wasteByIngredient.set(
        entry.ingredientId,
        (wasteByIngredient.get(entry.ingredientId) || 0) + Math.abs(entry.qtyDelta)
      );
    } else if (entry.type === 'sale_deduct') {
      saleDeductByIngredient.set(
        entry.ingredientId,
        (saleDeductByIngredient.get(entry.ingredientId) || 0) + Math.abs(entry.qtyDelta)
      );
    }
  }

  const linkedDishesByIngredient = new Map<string, string[]>();
  for (const recipe of input.recipes) {
    const menu = menuMap.get(recipe.menuItemId);
    if (!menu) continue;
    for (const line of recipe.lines) {
      const list = linkedDishesByIngredient.get(line.ingredientId) || [];
      if (!list.includes(menu.nameEn)) list.push(menu.nameEn);
      linkedDishesByIngredient.set(line.ingredientId, list);
    }
  }

  const activeSuppliers = (input.suppliers || []).filter(
    (s) => s.active && (s.branchId === input.branch.id || s.branchId === 'all')
  );

  // Incoming quantities from open POs
  const incomingPoByIngredient = new Map<string, { qty: number; expectedDate: string | null }>();
  for (const po of input.purchaseOrders || []) {
    if (
      po.branchId !== input.branch.id ||
      (po.status !== 'sent' && po.status !== 'partially_received')
    ) {
      continue;
    }
    for (const line of po.lines) {
      if (!line.ingredientId) continue;
      const remaining = Math.max(0, (line.orderedQty || 0) - (line.receivedQty || 0));
      if (remaining <= 0) continue;
      const existing = incomingPoByIngredient.get(line.ingredientId);
      const nextQty = (existing?.qty || 0) + remaining;
      const nextExp =
        !existing?.expectedDate || (po.expectedDate && po.expectedDate < existing.expectedDate)
          ? po.expectedDate || null
          : existing.expectedDate;
      incomingPoByIngredient.set(line.ingredientId, { qty: nextQty, expectedDate: nextExp });
    }
  }

  const leadAndBufferDays = leadTimeDays + safetyBufferDays;

  const items: ProjectedIngredientItem[] = branchIngredients.map((ing) => {
    const onHand = Math.max(0, Number(ing.onHand) || 0);
    const minLevel = Math.max(0, Number(ing.minLevel) || 0);
    const trackedUsed7d = Math.max(0, Number(ing.used7d) || 0);
    const orderUsage = orderUsageByIngredient.get(ing.id) || 0;
    const ledgerSaleDeduct = saleDeductByIngredient.get(ing.id) || 0;
    const waste7d = wasteByIngredient.get(ing.id) || 0;

    const observedUsed7d = roundTo(
      Math.max(trackedUsed7d, orderUsage, ledgerSaleDeduct) + waste7d * 0.5,
      2
    );
    const baseDailyBurn = roundTo(observedUsed7d / 7, 2);
    const projectedDailyBurn = roundTo(baseDailyBurn * effectiveMultiplier, 2);

    const daysUntilDepletion =
      onHand <= 0
        ? 0
        : projectedDailyBurn > 0
          ? roundTo(onHand / projectedDailyBurn, 1)
          : null;

    const daysUntilMinLevel =
      onHand <= minLevel
        ? 0
        : projectedDailyBurn > 0
          ? roundTo((onHand - minLevel) / projectedDailyBurn, 1)
          : null;

    const predictedDepletionDate =
      onHand <= 0
        ? 'Depleted'
        : daysUntilDepletion !== null
          ? daysUntilDepletion <= 60
            ? addDaysIso(referenceDate, Math.floor(daysUntilDepletion))
            : 'Stable (>60d)'
          : 'No usage logged';

    // Order-by date guarantees stock does not deplete before leadTimeDays + safetyBufferDays
    let daysUntilOrderBy: number | null = null;
    let orderByDate: string | null = null;
    let orderByStatus: OrderByUrgencyStatus = 'healthy';

    if (onHand <= 0 || onHand <= minLevel) {
      daysUntilOrderBy = 0;
      orderByDate = referenceDate;
      orderByStatus = 'overdue';
    } else if (daysUntilDepletion !== null) {
      const rawOrderInDays = Math.floor(daysUntilDepletion - leadAndBufferDays);
      if (rawOrderInDays <= 0) {
        daysUntilOrderBy = 0;
        orderByDate = referenceDate;
        orderByStatus = 'overdue';
      } else if (daysUntilDepletion <= forecastHorizonDays + leadAndBufferDays) {
        daysUntilOrderBy = rawOrderInDays;
        orderByDate = addDaysIso(referenceDate, rawOrderInDays);
        orderByStatus = rawOrderInDays <= 3 ? 'upcoming' : 'planned';
      } else if (daysUntilDepletion <= 60) {
        daysUntilOrderBy = rawOrderInDays;
        orderByDate = addDaysIso(referenceDate, rawOrderInDays);
        orderByStatus = 'healthy';
      }
    }

    const isLowStock =
      onHand <= minLevel ||
      orderByStatus === 'overdue' ||
      orderByStatus === 'upcoming' ||
      (daysUntilDepletion !== null && daysUntilDepletion <= forecastHorizonDays);

    const urgency: StockUrgencyTier =
      onHand <= 0
        ? 'out'
        : onHand <= minLevel || (daysUntilDepletion !== null && daysUntilDepletion <= leadAndBufferDays)
          ? 'critical'
          : daysUntilDepletion !== null && daysUntilDepletion <= forecastHorizonDays
            ? 'warning'
            : 'healthy';

    const purchaseUnitSize = Math.max(1, Number(ing.purchaseUnitSize) || 1);
    const targetCoverDays = Math.max(7, leadAndBufferDays + 5);
    const targetBaseUnits = Math.max(minLevel * 1.5, projectedDailyBurn * targetCoverDays);
    const deficit = Math.max(purchaseUnitSize, targetBaseUnits - onHand);
    const suggestedPacks = isLowStock ? Math.max(1, Math.ceil(deficit / purchaseUnitSize)) : 0;
    const suggestedReorderQty = suggestedPacks * purchaseUnitSize;
    const estimatedOrderCostUsd = roundCurrency(suggestedReorderQty * (Number(ing.avgCostUsd) || 0));

    const matchedSupplier = matchIngredientSupplier(ing, activeSuppliers);
    const openPo = incomingPoByIngredient.get(ing.id);

    // Trigger threshold in base units where order must be placed to survive leadTimeDays + safetyBufferDays
    const reorderTriggerPoint = roundTo(
      Math.max(minLevel, projectedDailyBurn * leadAndBufferDays),
      1
    );

    // Build daily trajectory points over forecastHorizonDays
    const dailySeries: DailyStockProjectionPoint[] = [];
    for (let day = 0; day <= forecastHorizonDays; day++) {
      const dateIso = addDaysIso(referenceDate, day);
      const projected = Math.max(0, roundTo(onHand - projectedDailyBurn * day, 1));
      dailySeries.push({
        dayIndex: day,
        date: dateIso,
        label: day === 0 ? 'Today' : formatShortDate(dateIso),
        projectedOnHand: projected,
        minLevel,
        reorderTriggerPoint,
      });
    }

    return {
      ingredientId: ing.id,
      ingredientName: ing.nameEn,
      nameKh: ing.nameKh,
      unit: ing.unit,
      purchaseUnit: ing.purchaseUnit,
      purchaseUnitSize,
      onHand,
      minLevel,
      avgCostUsd: Math.max(0, Number(ing.avgCostUsd) || 0),
      observedUsed7d,
      baseDailyBurn,
      projectedDailyBurn,
      daysUntilDepletion,
      daysUntilMinLevel,
      predictedDepletionDate,
      orderByDate,
      daysUntilOrderBy,
      orderByStatus,
      urgency,
      isLowStock,
      suggestedReorderQty,
      suggestedPacks,
      estimatedOrderCostUsd,
      supplierName: matchedSupplier?.name || null,
      openPoIncomingQty: openPo?.qty || 0,
      openPoExpectedDate: openPo?.expectedDate || null,
      linkedDishes: linkedDishesByIngredient.get(ing.id) || [],
      dailySeries,
    };
  });

  // Sort most urgent order-by dates first
  const statusRank: Record<OrderByUrgencyStatus, number> = {
    overdue: 0,
    upcoming: 1,
    planned: 2,
    healthy: 3,
  };
  items.sort((a, b) => {
    const rankDiff = statusRank[a.orderByStatus] - statusRank[b.orderByStatus];
    if (rankDiff !== 0) return rankDiff;
    const aDays = a.daysUntilDepletion ?? 9999;
    const bDays = b.daysUntilDepletion ?? 9999;
    if (aDays !== bDays) return aDays - bDays;
    return a.ingredientName.localeCompare(b.ingredientName);
  });

  const immediateOrderCount = items.filter((i) => i.orderByStatus === 'overdue').length;
  const upcomingOrderCount = items.filter(
    (i) => i.orderByStatus === 'upcoming' || i.orderByStatus === 'planned'
  ).length;
  const lowStockItemCount = items.filter((i) => i.isLowStock).length;
  const totalEstimatedOrderUsd = roundCurrency(
    items.reduce((sum, i) => sum + i.estimatedOrderCostUsd, 0)
  );
  const earliestDepletionItem =
    items.find((i) => i.daysUntilDepletion !== null) || items[0] || null;

  return {
    branchId: input.branch.id,
    branchName: input.branch.name,
    referenceDate,
    forecastHorizonDays,
    leadTimeDays,
    safetyBufferDays,
    scenarioMode,
    historicalTrendFactor: velocity.historicalTrendFactor,
    effectiveMultiplier,
    recent7dAvgSalesUsd: velocity.recent7dAvgSalesUsd,
    baselineAvgSalesUsd: velocity.baselineAvgSalesUsd,
    historicalDaysAnalyzed: velocity.daysAnalyzed,
    immediateOrderCount,
    upcomingOrderCount,
    lowStockItemCount,
    totalEstimatedOrderUsd,
    earliestDepletionItem,
    items,
  };
}
