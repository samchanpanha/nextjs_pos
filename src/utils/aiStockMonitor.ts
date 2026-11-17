import type {
  BranchConfig,
  DailyRevenuePoint,
  Ingredient,
  MenuItem,
  PosOrder,
  Recipe,
  StockHistoryEntry,
} from '../types/pos';
import { roundCurrency } from './posMath';

export type StockUrgencyTier = 'out' | 'critical' | 'warning' | 'healthy';

export interface StockIngredientSignal {
  ingredientId: string;
  ingredientName: string;
  nameKh: string;
  unit: string;
  purchaseUnit: string;
  purchaseUnitSize: number;
  onHand: number;
  minLevel: number;
  avgCostUsd: number;
  trackedUsed7d: number;
  recentOrderUsage: number;
  recentWaste7d: number;
  observedUsed7d: number;
  baselineDailyBurn: number;
  baselineDaysRemaining: number | null;
  linkedDishNames: string[];
}

export interface AiStockMonitorRequestPayload {
  branchId: string;
  branchName: string;
  referenceDate: string;
  alertThresholdDays: number;
  recentPaidBills: number;
  prior7DaySalesUsd: number;
  avgDailySalesUsd: number;
  historicalDays: DailyRevenuePoint[];
  ingredients: StockIngredientSignal[];
}

export interface RawGeminiStockPrediction {
  ingredientId?: string;
  dailyBurnRate?: number;
  estimatedDaysRemaining?: number;
  suggestedReorderQty?: number;
  rationale?: string;
  staffAlertMessage?: string;
}

export interface RawGeminiStockMonitorPayload {
  summary?: string;
  recommendedActions?: string[];
  predictions?: RawGeminiStockPrediction[];
}

export interface AiStockPredictionItem {
  ingredientId: string;
  ingredientName: string;
  nameKh: string;
  unit: string;
  purchaseUnit: string;
  onHand: number;
  minLevel: number;
  avgCostUsd: number;
  dailyBurnRate: number;
  estimatedDaysRemaining: number | null;
  predictedRunOutDate: string;
  urgency: StockUrgencyTier;
  shouldNotifyStaff: boolean;
  suggestedReorderQty: number;
  estimatedReorderCostUsd: number;
  rationale: string;
  staffAlertMessage: string;
}

export interface AiStockMonitorReport {
  model: string;
  generatedAt: string;
  referenceDate: string;
  alertThresholdDays: number;
  summary: string;
  criticalCount: number;
  warningCount: number;
  alertCount: number;
  recommendedActions: string[];
  items: AiStockPredictionItem[];
}

export interface AiStaffStockAlert {
  id: string;
  branchId: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  onHand: number;
  minLevel: number;
  estimatedDaysRemaining: number | null;
  predictedRunOutDate: string;
  urgency: StockUrgencyTier;
  suggestedReorderQty: number;
  message: string;
  createdAt: string;
  fingerprint: string;
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function addDaysIso(referenceDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(referenceDate.trim());
  const base = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : (() => {
        const now = new Date();
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      })();
  const wholeDays = Math.max(0, Math.round(days));
  base.setUTCDate(base.getUTCDate() + wholeDays);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  const d = String(base.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildStockMonitorPayload(input: {
  branch: Pick<BranchConfig, 'id' | 'name'>;
  ingredients: Ingredient[];
  recipes: Recipe[];
  menuItems: MenuItem[];
  orders: PosOrder[];
  stockHistory: StockHistoryEntry[];
  dailyRevenueHistory: DailyRevenuePoint[];
  referenceDate?: string;
  alertThresholdDays?: number;
}): AiStockMonitorRequestPayload {
  const referenceDate = (input.referenceDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const alertThresholdDays =
    typeof input.alertThresholdDays === 'number' && input.alertThresholdDays > 0
      ? Math.min(14, Math.max(1, Math.round(input.alertThresholdDays)))
      : 5;

  const branchIngredients = input.ingredients.filter((i) => i.branchId === input.branch.id);
  const branchMenu = input.menuItems.filter((m) => m.branchId === input.branch.id);
  const menuMap = new Map(branchMenu.map((m) => [m.id, m]));
  const recipeMap = new Map(input.recipes.map((r) => [r.menuItemId, r]));

  const branchOrders = input.orders.filter(
    (o) => o.branchId === input.branch.id && o.status !== 'voided'
  );
  const paidOrders = branchOrders.filter((o) => o.status === 'paid');

  // Aggregate order-level recipe consumption per ingredient
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

  // Aggregate recent 7-day waste from stock history
  const sevenDaysAgoMs = Date.parse(referenceDate) - 7 * 86400000;
  const wasteByIngredient = new Map<string, number>();
  for (const entry of input.stockHistory) {
    if (entry.type !== 'waste') continue;
    const ts = Date.parse(entry.createdAt);
    if (Number.isFinite(ts) && ts < sevenDaysAgoMs) continue;
    const prev = wasteByIngredient.get(entry.ingredientId) || 0;
    wasteByIngredient.set(entry.ingredientId, prev + Math.abs(entry.qtyDelta));
  }

  // Linked dish names per ingredient
  const linkedDishesByIngredient = new Map<string, string[]>();
  for (const recipe of input.recipes) {
    const menu = menuMap.get(recipe.menuItemId);
    if (!menu) continue;
    for (const line of recipe.lines) {
      const list = linkedDishesByIngredient.get(line.ingredientId) || [];
      if (!list.includes(menu.nameEn)) {
        list.push(menu.nameEn);
      }
      linkedDishesByIngredient.set(line.ingredientId, list);
    }
  }

  const recent7 = input.dailyRevenueHistory.slice(-7);
  const prior7DaySalesUsd = roundCurrency(
    recent7.reduce((s, d) => s + (Number(d.netSalesUsd) || 0), 0)
  );
  const avgDailySalesUsd =
    recent7.length > 0 ? roundCurrency(prior7DaySalesUsd / recent7.length) : 0;

  const ingredients: StockIngredientSignal[] = branchIngredients.map((ing) => {
    const trackedUsed7d = Math.max(0, Number(ing.used7d) || 0);
    const recentOrderUsage = roundTo(orderUsageByIngredient.get(ing.id) || 0, 2);
    const recentWaste7d = roundTo(wasteByIngredient.get(ing.id) || 0, 2);
    // Use trackedUsed7d as 7-day base, supplemented if active orders/waste exceed it
    const observedUsed7d = roundTo(Math.max(trackedUsed7d, recentOrderUsage) + recentWaste7d * 0.5, 2);
    const baselineDailyBurn = roundTo(observedUsed7d / 7, 2);
    const baselineDaysRemaining =
      ing.onHand <= 0
        ? 0
        : baselineDailyBurn > 0
          ? roundTo(ing.onHand / baselineDailyBurn, 1)
          : null;

    return {
      ingredientId: ing.id,
      ingredientName: ing.nameEn,
      nameKh: ing.nameKh,
      unit: ing.unit,
      purchaseUnit: ing.purchaseUnit,
      purchaseUnitSize: Math.max(1, Number(ing.purchaseUnitSize) || 1),
      onHand: Math.max(0, Number(ing.onHand) || 0),
      minLevel: Math.max(0, Number(ing.minLevel) || 0),
      avgCostUsd: Math.max(0, Number(ing.avgCostUsd) || 0),
      trackedUsed7d,
      recentOrderUsage,
      recentWaste7d,
      observedUsed7d,
      baselineDailyBurn,
      baselineDaysRemaining,
      linkedDishNames: linkedDishesByIngredient.get(ing.id) || [],
    };
  });

  return {
    branchId: input.branch.id,
    branchName: input.branch.name,
    referenceDate,
    alertThresholdDays,
    recentPaidBills: paidOrders.length,
    prior7DaySalesUsd,
    avgDailySalesUsd,
    historicalDays: recent7,
    ingredients,
  };
}

export function buildStockMonitorFingerprint(
  tenantId: string,
  payload: AiStockMonitorRequestPayload
): string {
  const ingKey = payload.ingredients
    .map(
      (i) =>
        `${i.ingredientId}:${i.onHand.toFixed(1)}:${i.minLevel}:${i.observedUsed7d.toFixed(1)}`
    )
    .sort()
    .join('|');
  return [
    tenantId,
    payload.branchId,
    payload.referenceDate,
    String(payload.alertThresholdDays),
    String(payload.recentPaidBills),
    ingKey,
  ].join('::');
}

export function classifyStockUrgency(input: {
  onHand: number;
  minLevel: number;
  estimatedDaysRemaining: number | null;
  alertThresholdDays: number;
}): StockUrgencyTier {
  if (input.onHand <= 0) return 'out';
  if (
    input.onHand <= input.minLevel ||
    (input.estimatedDaysRemaining !== null && input.estimatedDaysRemaining <= 3)
  ) {
    return 'critical';
  }
  if (
    input.estimatedDaysRemaining !== null &&
    input.estimatedDaysRemaining <= input.alertThresholdDays
  ) {
    return 'warning';
  }
  return 'healthy';
}

export function normalizeAiStockMonitorReport(
  raw: RawGeminiStockMonitorPayload,
  meta: {
    model: string;
    generatedAt: string;
    payload: AiStockMonitorRequestPayload;
  }
): AiStockMonitorReport {
  const rawPreds = new Map(
    (Array.isArray(raw.predictions) ? raw.predictions : [])
      .filter((p) => typeof p.ingredientId === 'string' && p.ingredientId.trim())
      .map((p) => [p.ingredientId!.trim(), p])
  );

  const items: AiStockPredictionItem[] = meta.payload.ingredients.map((signal) => {
    const aiPred = rawPreds.get(signal.ingredientId);
    const aiBurn =
      aiPred && typeof aiPred.dailyBurnRate === 'number' && Number.isFinite(aiPred.dailyBurnRate)
        ? Math.max(0, roundTo(aiPred.dailyBurnRate, 2))
        : signal.baselineDailyBurn;

    // Anchor daily burn rate so AI never hallucinates 0 or 100x drift from observed sales burn
    const burnRate =
      signal.baselineDailyBurn > 0
        ? roundTo(
            Math.min(
              signal.baselineDailyBurn * 2.5,
              Math.max(signal.baselineDailyBurn * 0.4, aiBurn)
            ),
            2
          )
        : aiBurn;

    const computedDays =
      signal.onHand <= 0
        ? 0
        : burnRate > 0
          ? roundTo(signal.onHand / burnRate, 1)
          : null;

    const aiDays =
      aiPred &&
      typeof aiPred.estimatedDaysRemaining === 'number' &&
      Number.isFinite(aiPred.estimatedDaysRemaining) &&
      aiPred.estimatedDaysRemaining >= 0
        ? roundTo(aiPred.estimatedDaysRemaining, 1)
        : null;

    // Prefer consistent mathematical depletion from calibrated burnRate (or AI days if within sane band)
    const estimatedDaysRemaining =
      signal.onHand <= 0
        ? 0
        : computedDays !== null
          ? aiDays !== null && Math.abs(aiDays - computedDays) <= Math.max(2, computedDays * 0.35)
            ? aiDays
            : computedDays
          : aiDays;

    const predictedRunOutDate =
      signal.onHand <= 0
        ? 'Depleted'
        : estimatedDaysRemaining !== null
          ? addDaysIso(meta.payload.referenceDate, Math.floor(estimatedDaysRemaining))
          : 'Stable (>30d)';

    const urgency = classifyStockUrgency({
      onHand: signal.onHand,
      minLevel: signal.minLevel,
      estimatedDaysRemaining,
      alertThresholdDays: meta.payload.alertThresholdDays,
    });

    const shouldNotifyStaff = urgency === 'out' || urgency === 'critical' || urgency === 'warning';

    // Target 7-day buffer + minLevel safety stock, rounded up to purchaseUnitSize
    const target7dNeed = Math.max(signal.minLevel * 1.5, burnRate * 7) - signal.onHand;
    const minPracticalOrder = Math.max(signal.purchaseUnitSize, Math.ceil(target7dNeed));
    const roundedPacks = Math.max(1, Math.ceil(minPracticalOrder / signal.purchaseUnitSize));
    const fallbackReorderQty = roundedPacks * signal.purchaseUnitSize;

    const suggestedReorderQty =
      aiPred &&
      typeof aiPred.suggestedReorderQty === 'number' &&
      Number.isFinite(aiPred.suggestedReorderQty) &&
      aiPred.suggestedReorderQty > 0
        ? Math.round(aiPred.suggestedReorderQty)
        : shouldNotifyStaff
          ? fallbackReorderQty
          : 0;

    const estimatedReorderCostUsd = roundCurrency(suggestedReorderQty * signal.avgCostUsd);

    const defaultRationale =
      burnRate > 0
        ? `Burning ~${burnRate} ${signal.unit}/day (${signal.observedUsed7d} ${signal.unit} over 7 days${
            signal.linkedDishNames.length > 0
              ? ` across ${signal.linkedDishNames.slice(0, 2).join(', ')}`
              : ''
          }).`
        : 'Minimal sales depletion recorded over the past 7 days.';

    const rationale =
      aiPred && typeof aiPred.rationale === 'string' && aiPred.rationale.trim()
        ? aiPred.rationale.trim()
        : defaultRationale;

    const defaultAlertMsg =
      urgency === 'out'
        ? `${signal.ingredientName} is OUT OF STOCK (0 ${signal.unit}). Reorder ${suggestedReorderQty} ${signal.unit} immediately.`
        : shouldNotifyStaff
          ? `${signal.ingredientName}: ${
              estimatedDaysRemaining !== null
                ? `~${estimatedDaysRemaining}d left (run-out ${predictedRunOutDate})`
                : `below min level (${signal.onHand}/${signal.minLevel} ${signal.unit})`
            } — order ${suggestedReorderQty} ${signal.unit}.`
          : `${signal.ingredientName} stock healthy (${signal.onHand} ${signal.unit}).`;

    const staffAlertMessage =
      aiPred && typeof aiPred.staffAlertMessage === 'string' && aiPred.staffAlertMessage.trim()
        ? aiPred.staffAlertMessage.trim()
        : defaultAlertMsg;

    return {
      ingredientId: signal.ingredientId,
      ingredientName: signal.ingredientName,
      nameKh: signal.nameKh,
      unit: signal.unit,
      purchaseUnit: signal.purchaseUnit,
      onHand: signal.onHand,
      minLevel: signal.minLevel,
      avgCostUsd: signal.avgCostUsd,
      dailyBurnRate: burnRate,
      estimatedDaysRemaining,
      predictedRunOutDate,
      urgency,
      shouldNotifyStaff,
      suggestedReorderQty,
      estimatedReorderCostUsd,
      rationale,
      staffAlertMessage,
    };
  });

  // Sort most urgent first
  const urgencyRank: Record<StockUrgencyTier, number> = {
    out: 0,
    critical: 1,
    warning: 2,
    healthy: 3,
  };

  items.sort((a, b) => {
    const rankDiff = urgencyRank[a.urgency] - urgencyRank[b.urgency];
    if (rankDiff !== 0) return rankDiff;
    const aDays = a.estimatedDaysRemaining ?? 9999;
    const bDays = b.estimatedDaysRemaining ?? 9999;
    return aDays - bDays;
  });

  const criticalCount = items.filter((i) => i.urgency === 'out' || i.urgency === 'critical').length;
  const warningCount = items.filter((i) => i.urgency === 'warning').length;
  const alertCount = items.filter((i) => i.shouldNotifyStaff).length;

  const summary =
    typeof raw.summary === 'string' && raw.summary.trim()
      ? raw.summary.trim()
      : alertCount > 0
        ? `${criticalCount} critical and ${warningCount} upcoming low-stock ingredients detected from recent sales velocity.`
        : 'All tracked ingredients have sufficient inventory buffer beyond the alert threshold.';

  const recommendedActions = Array.isArray(raw.recommendedActions)
    ? raw.recommendedActions
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .slice(0, 4)
    : [];

  return {
    model: meta.model,
    generatedAt: meta.generatedAt,
    referenceDate: meta.payload.referenceDate,
    alertThresholdDays: meta.payload.alertThresholdDays,
    summary,
    criticalCount,
    warningCount,
    alertCount,
    recommendedActions,
    items,
  };
}

export function buildStaffAlertsFromReport(
  branchId: string,
  report: AiStockMonitorReport
): AiStaffStockAlert[] {
  return report.items
    .filter((item) => item.shouldNotifyStaff)
    .map((item) => {
      const fingerprint = `${branchId}:${item.ingredientId}:${item.onHand}:${item.urgency}:${item.predictedRunOutDate}`;
      return {
        id: `ai_alert_${branchId}_${item.ingredientId}`,
        branchId,
        ingredientId: item.ingredientId,
        ingredientName: item.ingredientName,
        unit: item.unit,
        onHand: item.onHand,
        minLevel: item.minLevel,
        estimatedDaysRemaining: item.estimatedDaysRemaining,
        predictedRunOutDate: item.predictedRunOutDate,
        urgency: item.urgency,
        suggestedReorderQty: item.suggestedReorderQty,
        message: item.staffAlertMessage,
        createdAt: report.generatedAt,
        fingerprint,
      };
    });
}
