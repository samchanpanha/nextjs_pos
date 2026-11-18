import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Ingredient, MenuItem, Recipe } from '../types/pos';
import { analyzeMenuLowStock } from './sellLowStock';

const branchId = 'branch_bkk1';

const ingredients: Ingredient[] = [
  {
    id: 'ing_tea',
    branchId,
    nameEn: 'Black tea leaves',
    nameKh: 'ស្លឹកតែខ្មៅ',
    unit: 'g',
    purchaseUnit: '500g bag',
    purchaseUnitSize: 500,
    onHand: 180,
    minLevel: 300,
    used7d: 100,
    avgCostUsd: 0.014,
  },
  {
    id: 'ing_beef',
    branchId,
    nameEn: 'Beef tenderloin',
    nameKh: 'សាច់គោ',
    unit: 'g',
    purchaseUnit: '1kg pack',
    purchaseUnitSize: 1000,
    onHand: 0,
    minLevel: 1500,
    used7d: 2100,
    avgCostUsd: 0.011,
  },
  {
    id: 'ing_coffee',
    branchId,
    nameEn: 'Coffee beans',
    nameKh: 'គ្រាប់កាហ្វេ',
    unit: 'g',
    purchaseUnit: '1kg bag',
    purchaseUnitSize: 1000,
    onHand: 4500,
    minLevel: 1000,
    used7d: 500,
    avgCostUsd: 0.012,
  },
  {
    id: 'ing_sugar',
    branchId,
    nameEn: 'Palm sugar',
    nameKh: 'ស្ករត្នោត',
    unit: 'g',
    purchaseUnit: '1kg',
    purchaseUnitSize: 1000,
    onHand: 90,
    minLevel: 200,
    used7d: 50,
    avgCostUsd: 0.005,
  },
];

const menuItems: MenuItem[] = [
  {
    id: 'm_tea',
    branchId,
    nameEn: 'Khmer iced black tea',
    nameKh: 'តែទឹកកក',
    nameVi: 'Trà đá',
    category: 'Coffee & tea',
    priceUsd: 2.25,
    station: 'bar',
    initials: 'BT',
    active: true,
  },
  {
    id: 'm_loklak',
    branchId,
    nameEn: 'Beef lok lak',
    nameKh: 'ឡុកឡាក់សាច់គោ',
    nameVi: 'Bò lúc lắc',
    category: 'Main dishes',
    priceUsd: 6.5,
    station: 'kitchen',
    initials: 'BL',
    active: true,
  },
  {
    id: 'm_espresso',
    branchId,
    nameEn: 'Hot espresso',
    nameKh: 'កាហ្វេក្តៅ',
    nameVi: 'Espresso',
    category: 'Coffee & tea',
    priceUsd: 2.0,
    station: 'bar',
    initials: 'HE',
    active: true,
  },
];

const recipes: Recipe[] = [
  { menuItemId: 'm_tea', lines: [{ ingredientId: 'ing_tea', qtyPerPortion: 15 }] },
  { menuItemId: 'm_loklak', lines: [{ ingredientId: 'ing_beef', qtyPerPortion: 180 }] },
  { menuItemId: 'm_espresso', lines: [{ ingredientId: 'ing_coffee', qtyPerPortion: 18 }] },
];

describe('analyzeMenuLowStock', () => {
  it('flags menu items whose ingredients are depleted (out) or below minLevel / <=5 servings (critical)', () => {
    const res = analyzeMenuLowStock({
      menuItems,
      recipes,
      ingredients,
      branchId,
    });

    assert.equal(res.outCount, 1);
    assert.equal(res.criticalCount, 1);
    assert.equal(res.totalAlertCount, 2);

    assert.equal(res.alerts[0].menuItemId, 'm_loklak');
    assert.equal(res.alerts[0].severity, 'out');
    assert.equal(res.alerts[0].maxServingsLeft, 0);

    assert.equal(res.alerts[1].menuItemId, 'm_tea');
    assert.equal(res.alerts[1].severity, 'critical');
    assert.equal(res.alerts[1].maxServingsLeft, 12);
    assert.equal(res.alerts[1].limitingIngredient.ingredientId, 'ing_tea');

    // Hot espresso has plenty of stock so it is not flagged
    assert.equal(res.alertByMenuItemId.get('m_espresso'), undefined);

    // Unlinked Palm sugar is still surfaced under unlinkedLowIngredients
    assert.equal(res.unlinkedLowIngredients.length, 1);
    assert.equal(res.unlinkedLowIngredients[0].ingredientId, 'ing_sugar');
  });

  it('flags items with <= 5 servings remaining even if onHand is slightly above minLevel', () => {
    const tightIngredients: Ingredient[] = [
      { ...ingredients[2], onHand: 75, minLevel: 50 }, // 75 / 18 = 4 servings left
    ];
    const res = analyzeMenuLowStock({
      menuItems: [menuItems[2]],
      recipes: [recipes[2]],
      ingredients: tightIngredients,
      branchId,
      criticalServingsThreshold: 5,
    });

    assert.equal(res.totalAlertCount, 1);
    assert.equal(res.alerts[0].severity, 'critical');
    assert.equal(res.alerts[0].maxServingsLeft, 4);
  });
});
