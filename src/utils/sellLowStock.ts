import type { Ingredient, MenuItem, Recipe } from '../types/pos';

export type MenuLowStockSeverity = 'out' | 'critical';

export interface MenuStockLimitingIngredient {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  onHand: number;
  minLevel: number;
  qtyPerPortion: number;
  servingsLeft: number;
  belowMinLevel: boolean;
}

export interface LowStockMenuItemAlert {
  menuItemId: string;
  nameEn: string;
  nameKh: string;
  nameVi: string;
  category: string;
  station: 'kitchen' | 'bar';
  severity: MenuLowStockSeverity;
  maxServingsLeft: number;
  limitingIngredient: MenuStockLimitingIngredient;
  linkedIngredientCount: number;
  reason: string;
}

export interface UnlinkedLowIngredient {
  ingredientId: string;
  nameEn: string;
  unit: string;
  onHand: number;
  minLevel: number;
  severity: MenuLowStockSeverity;
}

export interface MenuLowStockSummary {
  alerts: LowStockMenuItemAlert[];
  outCount: number;
  criticalCount: number;
  totalAlertCount: number;
  alertByMenuItemId: Map<string, LowStockMenuItemAlert>;
  unlinkedLowIngredients: UnlinkedLowIngredient[];
}

/**
 * Evaluates current branch Inventory ingredients and Recipe links to identify
 * menu items that have reached a critical stock threshold (or run out of stock).
 */
export function analyzeMenuLowStock(input: {
  menuItems: MenuItem[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  branchId: string;
  criticalServingsThreshold?: number;
}): MenuLowStockSummary {
  const servingsThreshold = Math.max(1, input.criticalServingsThreshold ?? 5);

  const branchIngredients = input.ingredients.filter((i) => i.branchId === input.branchId);
  const ingredientMap = new Map<string, Ingredient>(branchIngredients.map((i) => [i.id, i]));
  const recipeMap = new Map<string, Recipe>(input.recipes.map((r) => [r.menuItemId, r]));

  const referencedIngredientIds = new Set<string>();
  const alerts: LowStockMenuItemAlert[] = [];

  for (const item of input.menuItems) {
    if (item.branchId !== input.branchId || !item.active) continue;

    const recipe = recipeMap.get(item.id);
    const candidateLines: { ingredientId: string; qtyPerPortion: number }[] = [];

    if (recipe && recipe.lines.length > 0) {
      for (const l of recipe.lines) {
        if (l.ingredientId && l.qtyPerPortion > 0) {
          candidateLines.push({ ingredientId: l.ingredientId, qtyPerPortion: l.qtyPerPortion });
        }
      }
    } else if (item.options && item.options.length > 0) {
      // Fallback check: if an item has no saved recipe yet but references ingredients in options
      for (const opt of item.options) {
        for (const ch of opt.choices) {
          if (ch.extraIngredientId && ch.extraQty && ch.extraQty > 0) {
            candidateLines.push({ ingredientId: ch.extraIngredientId, qtyPerPortion: ch.extraQty });
          }
        }
      }
    }

    if (candidateLines.length === 0) continue;

    const evaluated: MenuStockLimitingIngredient[] = [];
    for (const line of candidateLines) {
      const ing = ingredientMap.get(line.ingredientId);
      if (!ing) continue;
      referencedIngredientIds.add(ing.id);

      const safeOnHand = Math.max(0, Number(ing.onHand) || 0);
      const safeMin = Math.max(0, Number(ing.minLevel) || 0);
      const servingsLeft = Math.floor(safeOnHand / line.qtyPerPortion);
      const belowMinLevel = safeOnHand <= safeMin;

      evaluated.push({
        ingredientId: ing.id,
        ingredientName: ing.nameEn,
        unit: ing.unit,
        onHand: safeOnHand,
        minLevel: safeMin,
        qtyPerPortion: line.qtyPerPortion,
        servingsLeft,
        belowMinLevel,
      });
    }

    if (evaluated.length === 0) continue;

    const maxServingsLeft = Math.min(...evaluated.map((e) => e.servingsLeft));
    const hasOutIngredient = evaluated.some((e) => e.onHand <= 0 || e.servingsLeft <= 0);
    const hasLowMinIngredient = evaluated.some((e) => e.belowMinLevel);
    const isCriticalServings = maxServingsLeft <= servingsThreshold;

    if (!hasOutIngredient && !hasLowMinIngredient && !isCriticalServings) {
      continue;
    }

    // Choose the most constrained ingredient as the limiting factor
    const sortedEvaluated = [...evaluated].sort((a, b) => {
      if (a.servingsLeft !== b.servingsLeft) return a.servingsLeft - b.servingsLeft;
      const ratioA = a.minLevel > 0 ? a.onHand / a.minLevel : a.onHand;
      const ratioB = b.minLevel > 0 ? b.onHand / b.minLevel : b.onHand;
      return ratioA - ratioB;
    });
    const limiting = sortedEvaluated[0];
    const severity: MenuLowStockSeverity = hasOutIngredient ? 'out' : 'critical';

    const reason =
      severity === 'out'
        ? `${limiting.ingredientName} depleted (${limiting.onHand} ${limiting.unit})`
        : limiting.belowMinLevel
          ? `${limiting.ingredientName} below min (${limiting.onHand}/${limiting.minLevel} ${limiting.unit})`
          : `Only ${maxServingsLeft} serving${maxServingsLeft === 1 ? '' : 's'} left (${limiting.ingredientName})`;

    alerts.push({
      menuItemId: item.id,
      nameEn: item.nameEn,
      nameKh: item.nameKh,
      nameVi: item.nameVi,
      category: item.category,
      station: item.station,
      severity,
      maxServingsLeft,
      limitingIngredient: limiting,
      linkedIngredientCount: evaluated.length,
      reason,
    });
  }

  alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'out' ? -1 : 1;
    if (a.maxServingsLeft !== b.maxServingsLeft) return a.maxServingsLeft - b.maxServingsLeft;
    return a.nameEn.localeCompare(b.nameEn);
  });

  const alertByMenuItemId = new Map<string, LowStockMenuItemAlert>(
    alerts.map((a) => [a.menuItemId, a])
  );

  const unlinkedLowIngredients: UnlinkedLowIngredient[] = branchIngredients
    .filter((ing) => !referencedIngredientIds.has(ing.id) && ing.onHand <= ing.minLevel)
    .map((ing) => ({
      ingredientId: ing.id,
      nameEn: ing.nameEn,
      unit: ing.unit,
      onHand: Math.max(0, Number(ing.onHand) || 0),
      minLevel: Math.max(0, Number(ing.minLevel) || 0),
      severity: (ing.onHand <= 0 ? 'out' : 'critical') as MenuLowStockSeverity,
    }))
    .sort((a, b) => a.onHand - b.onHand);

  const outCount = alerts.filter((a) => a.severity === 'out').length;
  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;

  return {
    alerts,
    outCount,
    criticalCount,
    totalAlertCount: alerts.length,
    alertByMenuItemId,
    unlinkedLowIngredients,
  };
}
