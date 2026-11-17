import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Ingredient, MenuItem } from '../types/pos';
import {
  areRecipeLinesEqual,
  calculateMenuProfitMargin,
  classifyMarginHealth,
  normalizeRecipeLines,
  summarizeBranchMargins,
} from './recipeMargin';

const sampleIngredients: Ingredient[] = [
  {
    id: 'ing-beans',
    branchId: 'b1',
    nameEn: 'Roasted Coffee Beans',
    nameKh: 'គ្រាប់កាហ្វេ',
    unit: 'g',
    purchaseUnit: 'kg',
    purchaseUnitSize: 1000,
    onHand: 2000,
    minLevel: 500,
    used7d: 600,
    avgCostUsd: 0.02, // $20/kg
  },
  {
    id: 'ing-milk',
    branchId: 'b1',
    nameEn: 'Fresh Milk',
    nameKh: 'ទឹកដោះគោស្រស់',
    unit: 'ml',
    purchaseUnit: 'L',
    purchaseUnitSize: 1000,
    onHand: 1500,
    minLevel: 400,
    used7d: 900,
    avgCostUsd: 0.002, // $2/L
  },
  {
    id: 'ing-steak',
    branchId: 'b1',
    nameEn: 'Ribeye Beef',
    nameKh: 'សាច់គោ',
    unit: 'g',
    purchaseUnit: 'kg',
    purchaseUnitSize: 1000,
    onHand: 800,
    minLevel: 200,
    used7d: 400,
    avgCostUsd: 0.03, // $30/kg
  },
];

describe('recipeMargin utilities', () => {
  it('calculates real-time food cost, gross profit, margin %, food cost %, and stock portions', () => {
    const result = calculateMenuProfitMargin({
      menuItemId: 'm-latte',
      menuPriceUsd: 3.5,
      lines: [
        { ingredientId: 'ing-beans', qtyPerPortion: 20 }, // $0.40
        { ingredientId: 'ing-milk', qtyPerPortion: 200 }, // $0.40
      ],
      ingredients: sampleIngredients,
      hasSavedRecipe: true,
    });

    assert.equal(result.exactFoodCostUsd, 0.8);
    assert.equal(result.foodCostUsd, 0.8);
    assert.equal(result.grossProfitUsd, 2.7);
    assert.equal(result.profitMarginPct, 77.1);
    assert.equal(result.foodCostPct, 22.9);
    assert.equal(result.hasLinkedIngredients, true);
    assert.equal(result.healthTier, 'healthy');
    // Milk has 1500ml / 200ml = 7 portions (bottleneck over 2000g / 20g = 100)
    assert.equal(result.maxServingsFromStock, 7);
    assert.equal(result.lineBreakdowns[0]?.costSharePct, 50);
    assert.equal(result.lineBreakdowns[1]?.costSharePct, 50);
  });

  it('flags low and loss margin tiers accurately', () => {
    // 200g beef = $6.00 on a $8.00 dish -> 25% margin (low)
    const lowMargin = calculateMenuProfitMargin({
      menuItemId: 'm-beef',
      menuPriceUsd: 8.0,
      lines: [{ ingredientId: 'ing-steak', qtyPerPortion: 200 }],
      ingredients: sampleIngredients,
    });
    assert.equal(lowMargin.profitMarginPct, 25);
    assert.equal(lowMargin.healthTier, 'low');

    // 300g beef = $9.00 on a $8.00 dish -> -12.5% margin (loss)
    const lossMargin = calculateMenuProfitMargin({
      menuItemId: 'm-beef-loss',
      menuPriceUsd: 8.0,
      lines: [{ ingredientId: 'ing-steak', qtyPerPortion: 300 }],
      ingredients: sampleIngredients,
    });
    assert.equal(lossMargin.grossProfitUsd, -1.0);
    assert.equal(lossMargin.profitMarginPct, -12.5);
    assert.equal(lossMargin.healthTier, 'loss');
  });

  it('handles unlinked dishes and missing ingredients gracefully', () => {
    const unlinked = calculateMenuProfitMargin({
      menuItemId: 'm-empty',
      menuPriceUsd: 4.5,
      lines: [],
      ingredients: sampleIngredients,
      hasSavedRecipe: false,
    });
    assert.equal(unlinked.hasLinkedIngredients, false);
    assert.equal(unlinked.healthTier, 'unlinked');
    assert.equal(unlinked.foodCostUsd, 0);
    assert.equal(unlinked.grossProfitUsd, 4.5);
    assert.equal(unlinked.maxServingsFromStock, null);

    const missing = calculateMenuProfitMargin({
      menuItemId: 'm-missing',
      menuPriceUsd: 5,
      lines: [{ ingredientId: 'does-not-exist', qtyPerPortion: 50 }],
      ingredients: sampleIngredients,
    });
    assert.equal(missing.hasLinkedIngredients, false);
    assert.equal(missing.lineBreakdowns[0]?.missingIngredient, true);
    assert.equal(missing.foodCostUsd, 0);
  });

  it('handles zero selling price edge case without division-by-zero NaN', () => {
    const zeroPrice = calculateMenuProfitMargin({
      menuItemId: 'm-free',
      menuPriceUsd: 0,
      lines: [{ ingredientId: 'ing-beans', qtyPerPortion: 10 }],
      ingredients: sampleIngredients,
    });
    assert.equal(zeroPrice.profitMarginPct, -100);
    assert.equal(zeroPrice.foodCostPct, 100);
    assert.equal(zeroPrice.healthTier, 'loss');
    assert.equal(classifyMarginHealth(50, 5, true), 'moderate');
  });

  it('summarizes branch portfolio margins across linked and unlinked items', () => {
    const menuItems: MenuItem[] = [
      {
        id: 'm-latte',
        branchId: 'b1',
        nameEn: 'Iced Latte',
        nameKh: 'ឡាតេ',
        nameVi: 'Latte',
        category: 'Coffee',
        priceUsd: 3.5,
        station: 'bar',
        initials: 'IL',
        active: true,
      },
      {
        id: 'm-beef',
        branchId: 'b1',
        nameEn: 'Ribeye Plate',
        nameKh: 'សាច់គោ',
        nameVi: 'Bo',
        category: 'Mains',
        priceUsd: 8.0,
        station: 'kitchen',
        initials: 'RP',
        active: true,
      },
      {
        id: 'm-tea',
        branchId: 'b1',
        nameEn: 'Jasmine Tea',
        nameKh: 'តែ',
        nameVi: 'Tra',
        category: 'Tea',
        priceUsd: 2.0,
        station: 'bar',
        initials: 'JT',
        active: true,
      },
    ];

    const rows = [
      {
        menuItem: menuItems[0],
        calculation: calculateMenuProfitMargin({
          menuItemId: 'm-latte',
          menuPriceUsd: 3.5,
          lines: [
            { ingredientId: 'ing-beans', qtyPerPortion: 20 },
            { ingredientId: 'ing-milk', qtyPerPortion: 200 },
          ],
          ingredients: sampleIngredients,
          hasSavedRecipe: true,
        }),
      },
      {
        menuItem: menuItems[1],
        calculation: calculateMenuProfitMargin({
          menuItemId: 'm-beef',
          menuPriceUsd: 8.0,
          lines: [{ ingredientId: 'ing-steak', qtyPerPortion: 200 }],
          ingredients: sampleIngredients,
          hasSavedRecipe: true,
        }),
      },
      {
        menuItem: menuItems[2],
        calculation: calculateMenuProfitMargin({
          menuItemId: 'm-tea',
          menuPriceUsd: 2.0,
          lines: [],
          ingredients: sampleIngredients,
          hasSavedRecipe: false,
        }),
      },
    ];

    const summary = summarizeBranchMargins(rows);
    assert.equal(summary.totalMenuItems, 3);
    assert.equal(summary.linkedMenuItems, 2);
    assert.equal(summary.unlinkedMenuItems, 1);
    assert.equal(summary.avgProfitMarginPct, 51.1); // (77.1 + 25.0) / 2 = 51.05 -> 51.1
    assert.equal(summary.lowMarginCount, 1);
    assert.equal(summary.highestMarginItem?.menuItemId, 'm-latte');
    assert.equal(summary.lowestMarginItem?.menuItemId, 'm-beef');
  });

  it('normalizes and compares recipe line arrays cleanly', () => {
    const cleaned = normalizeRecipeLines([
      { ingredientId: 'a', qtyPerPortion: 10 },
      { ingredientId: 'b', qtyPerPortion: 0 },
      { ingredientId: '', qtyPerPortion: 5 },
    ]);
    assert.deepEqual(cleaned, [{ ingredientId: 'a', qtyPerPortion: 10 }]);
    assert.equal(
      areRecipeLinesEqual([{ ingredientId: 'a', qtyPerPortion: 10 }], [{ ingredientId: 'a', qtyPerPortion: 10 }]),
      true
    );
    assert.equal(
      areRecipeLinesEqual([{ ingredientId: 'a', qtyPerPortion: 10 }], [{ ingredientId: 'a', qtyPerPortion: 15 }]),
      false
    );
  });
});
