import type { Ingredient, MenuItem, RecipeLine } from '../types/pos';
import { roundCurrency } from './posMath';

export type MarginHealthTier = 'healthy' | 'moderate' | 'low' | 'loss' | 'unlinked';

export interface RecipeLineBreakdown {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  qtyPerPortion: number;
  unitCostUsd: number;
  lineCostUsd: number;
  costSharePct: number;
  onHand: number;
  portionsAvailable: number | null;
  missingIngredient: boolean;
}

export interface MenuMarginCalculation {
  menuItemId: string;
  menuPriceUsd: number;
  exactFoodCostUsd: number;
  foodCostUsd: number;
  grossProfitUsd: number;
  profitMarginPct: number;
  foodCostPct: number;
  hasLinkedIngredients: boolean;
  hasSavedRecipe: boolean;
  healthTier: MarginHealthTier;
  maxServingsFromStock: number | null;
  lineBreakdowns: RecipeLineBreakdown[];
}

export interface BranchMarginRow {
  menuItem: MenuItem;
  calculation: MenuMarginCalculation;
}

export interface BranchMarginSummary {
  totalMenuItems: number;
  linkedMenuItems: number;
  unlinkedMenuItems: number;
  avgProfitMarginPct: number;
  avgFoodCostPct: number;
  lowMarginCount: number;
  highestMarginItem: { menuItemId: string; nameEn: string; profitMarginPct: number } | null;
  lowestMarginItem: { menuItemId: string; nameEn: string; profitMarginPct: number } | null;
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function classifyMarginHealth(
  profitMarginPct: number,
  menuPriceUsd: number,
  hasLinkedIngredients: boolean
): MarginHealthTier {
  if (!hasLinkedIngredients) return 'unlinked';
  if (menuPriceUsd <= 0 || profitMarginPct < 0) return 'loss';
  if (profitMarginPct >= 65) return 'healthy';
  if (profitMarginPct >= 45) return 'moderate';
  return 'low';
}

export function calculateMenuProfitMargin(input: {
  menuItemId: string;
  menuPriceUsd: number;
  lines: RecipeLine[];
  ingredients: Ingredient[];
  hasSavedRecipe?: boolean;
}): MenuMarginCalculation {
  const safePrice = Number.isFinite(input.menuPriceUsd) ? Math.max(0, input.menuPriceUsd) : 0;
  const ingMap = new Map(input.ingredients.map((i) => [i.id, i]));

  const rawLines = input.lines.map((line) => {
    const ing = ingMap.get(line.ingredientId);
    const qty = Number.isFinite(line.qtyPerPortion) ? Math.max(0, line.qtyPerPortion) : 0;
    const unitCost = ing && Number.isFinite(ing.avgCostUsd) ? Math.max(0, ing.avgCostUsd) : 0;
    const lineCost = roundTo(qty * unitCost, 4);
    const onHand = ing && Number.isFinite(ing.onHand) ? Math.max(0, ing.onHand) : 0;
    const portionsAvailable = ing && qty > 0 ? Math.floor(onHand / qty) : null;
    return {
      ingredientId: line.ingredientId,
      ingredientName: ing ? ing.nameEn : 'Unknown ingredient',
      unit: ing ? ing.unit : '',
      qtyPerPortion: qty,
      unitCostUsd: unitCost,
      lineCostUsd: lineCost,
      onHand,
      portionsAvailable,
      missingIngredient: !ing,
    };
  });

  const exactFoodCostUsd = roundTo(
    rawLines.reduce((sum, l) => sum + l.lineCostUsd, 0),
    4
  );

  const lineBreakdowns: RecipeLineBreakdown[] = rawLines.map((l) => ({
    ...l,
    costSharePct: exactFoodCostUsd > 0 ? roundTo((l.lineCostUsd / exactFoodCostUsd) * 100, 1) : 0,
  }));

  const hasLinkedIngredients = rawLines.some((l) => l.qtyPerPortion > 0 && !l.missingIngredient);
  const foodCostUsd = roundCurrency(exactFoodCostUsd);
  const grossProfitUsd = roundCurrency(safePrice - exactFoodCostUsd);

  const profitMarginPct =
    safePrice > 0
      ? roundTo(((safePrice - exactFoodCostUsd) / safePrice) * 100, 1)
      : exactFoodCostUsd > 0
        ? -100
        : 0;

  const foodCostPct =
    safePrice > 0 ? roundTo((exactFoodCostUsd / safePrice) * 100, 1) : exactFoodCostUsd > 0 ? 100 : 0;

  const finitePortions = lineBreakdowns
    .map((l) => l.portionsAvailable)
    .filter((v): v is number => v !== null);
  const maxServingsFromStock = finitePortions.length > 0 ? Math.min(...finitePortions) : null;

  const healthTier = classifyMarginHealth(profitMarginPct, safePrice, hasLinkedIngredients);

  return {
    menuItemId: input.menuItemId,
    menuPriceUsd: safePrice,
    exactFoodCostUsd,
    foodCostUsd,
    grossProfitUsd,
    profitMarginPct,
    foodCostPct,
    hasLinkedIngredients,
    hasSavedRecipe: Boolean(input.hasSavedRecipe),
    healthTier,
    maxServingsFromStock,
    lineBreakdowns,
  };
}

export function summarizeBranchMargins(rows: BranchMarginRow[]): BranchMarginSummary {
  const totalMenuItems = rows.length;
  const linked = rows.filter((r) => r.calculation.hasLinkedIngredients);
  const linkedMenuItems = linked.length;
  const unlinkedMenuItems = totalMenuItems - linkedMenuItems;

  if (linkedMenuItems === 0) {
    return {
      totalMenuItems,
      linkedMenuItems: 0,
      unlinkedMenuItems,
      avgProfitMarginPct: 0,
      avgFoodCostPct: 0,
      lowMarginCount: 0,
      highestMarginItem: null,
      lowestMarginItem: null,
    };
  }

  const avgProfitMarginPct = roundTo(
    linked.reduce((sum, r) => sum + r.calculation.profitMarginPct, 0) / linkedMenuItems,
    1
  );
  const avgFoodCostPct = roundTo(
    linked.reduce((sum, r) => sum + r.calculation.foodCostPct, 0) / linkedMenuItems,
    1
  );
  const lowMarginCount = linked.filter(
    (r) => r.calculation.healthTier === 'low' || r.calculation.healthTier === 'loss'
  ).length;

  const sortedByMargin = [...linked].sort(
    (a, b) => a.calculation.profitMarginPct - b.calculation.profitMarginPct
  );
  const lowest = sortedByMargin[0];
  const highest = sortedByMargin[sortedByMargin.length - 1];

  return {
    totalMenuItems,
    linkedMenuItems,
    unlinkedMenuItems,
    avgProfitMarginPct,
    avgFoodCostPct,
    lowMarginCount,
    highestMarginItem: {
      menuItemId: highest.menuItem.id,
      nameEn: highest.menuItem.nameEn,
      profitMarginPct: highest.calculation.profitMarginPct,
    },
    lowestMarginItem: {
      menuItemId: lowest.menuItem.id,
      nameEn: lowest.menuItem.nameEn,
      profitMarginPct: lowest.calculation.profitMarginPct,
    },
  };
}

export function normalizeRecipeLines(lines: RecipeLine[]): RecipeLine[] {
  return lines
    .filter((l) => Boolean(l.ingredientId) && Number.isFinite(l.qtyPerPortion) && l.qtyPerPortion > 0)
    .map((l) => ({
      ingredientId: l.ingredientId,
      qtyPerPortion: Number(l.qtyPerPortion),
    }));
}

export function areRecipeLinesEqual(a: RecipeLine[], b: RecipeLine[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (line, idx) =>
      line.ingredientId === b[idx]?.ingredientId &&
      Math.abs((line.qtyPerPortion || 0) - (b[idx]?.qtyPerPortion || 0)) < 1e-6
  );
}
