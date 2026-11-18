import React, { useEffect, useMemo, useState } from 'react';
import {
  Package,
  Plus,
  Trash2,
  ClipboardCheck,
  ChefHat,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Link2,
  Search,
  RotateCcw,
  Sparkles,
  Truck,
  TrendingDown,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import { roundCurrency, usdToKhr } from '../utils/posMath';
import { AiStockMonitorPanel } from './AiStockMonitorPanel';
import { AutoRestockPanel } from './AutoRestockPanel';
import { InventoryProjectionPanel } from './InventoryProjectionPanel';
import {
  areRecipeLinesEqual,
  calculateMenuProfitMargin,
  normalizeRecipeLines,
  summarizeBranchMargins,
  type MarginHealthTier,
} from '../utils/recipeMargin';
import type { RecipeLine } from '../types/pos';

type StockSubTab =
  | 'stock'
  | 'projection'
  | 'ai_monitor'
  | 'auto_restock'
  | 'recipes'
  | 'history'
  | 'margin';
type MarginFilter = 'all' | 'linked' | 'unlinked' | 'low';
type MarginSort = 'margin_asc' | 'margin_desc' | 'cost_desc' | 'name_asc';

function tierBadgeClass(tier: MarginHealthTier): string {
  switch (tier) {
    case 'healthy':
      return 'bg-emerald-100 text-emerald-900 border-emerald-200';
    case 'moderate':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'low':
      return 'bg-orange-100 text-orange-900 border-orange-200';
    case 'loss':
      return 'bg-red-100 text-red-900 border-red-200';
    case 'unlinked':
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

function tierLabel(tier: MarginHealthTier): string {
  switch (tier) {
    case 'healthy':
      return 'Healthy';
    case 'moderate':
      return 'Moderate';
    case 'low':
      return 'Low margin';
    case 'loss':
      return 'Negative margin';
    case 'unlinked':
    default:
      return 'Unlinked';
  }
}

export function InventoryView() {
  const {
    state,
    activeBranch,
    addIngredient,
    recordIngredientPurchase,
    recordIngredientWaste,
    recordStockCount,
    saveRecipe,
    saveMenuItem,
    aiStockAlerts,
    setIngredientPreferredSupplier,
  } = usePos();

  const [subTab, setSubTab] = useState<StockSubTab>('stock');
  const [selectedIngId, setSelectedIngId] = useState<string>('');
  const [actionMode, setActionMode] = useState<'purchase' | 'waste' | 'count' | null>(null);
  const [qtyInput, setQtyInput] = useState('');
  const [costInput, setCostInput] = useState('');
  const [noteInput, setNoteInput] = useState('');

  // Add ingredient form
  const [showAddIng, setShowAddIng] = useState(false);
  const [newNameEn, setNewNameEn] = useState('');
  const [newNameKh, setNewNameKh] = useState('');
  const [newUnit, setNewUnit] = useState('g');
  const [newPurchaseUnit, setNewPurchaseUnit] = useState('kg');
  const [newPurchaseSize, setNewPurchaseSize] = useState('1000');
  const [newOnHand, setNewOnHand] = useState('5000');
  const [newMinLevel, setNewMinLevel] = useState('1000');
  const [newAvgCost, setNewAvgCost] = useState('0.008');

  const branchMenu = useMemo(
    () => state.menuItems.filter((m) => m.branchId === activeBranch.id),
    [state.menuItems, activeBranch.id]
  );

  const branchIngredients = useMemo(() => {
    return state.ingredients
      .filter((i) => i.branchId === activeBranch.id)
      .sort((a, b) => {
        const aLow = a.onHand <= a.minLevel ? 0 : 1;
        const bLow = b.onHand <= b.minLevel ? 0 : 1;
        if (aLow !== bLow) return aLow - bLow;
        return a.nameEn.localeCompare(b.nameEn);
      });
  }, [state.ingredients, activeBranch.id]);

  const branchSuppliers = useMemo(
    () =>
      (state.suppliers || []).filter(
        (s) => s.active && (s.branchId === activeBranch.id || s.branchId === 'all')
      ),
    [state.suppliers, activeBranch.id]
  );

  const totalStockValue = useMemo(
    () =>
      roundCurrency(
        branchIngredients.reduce((sum, i) => sum + i.onHand * i.avgCostUsd, 0)
      ),
    [branchIngredients]
  );

  const lowCount = branchIngredients.filter((i) => i.onHand <= i.minLevel).length;

  // Recipe & real-time profit margin editor state
  const [recipeMenuId, setRecipeMenuId] = useState<string>(branchMenu[0]?.id || '');
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeFilter, setRecipeFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [draftLines, setDraftLines] = useState<RecipeLine[]>([]);
  const [priceDraft, setPriceDraft] = useState<string>('');
  const [savedNotice, setSavedNotice] = useState<'recipe' | 'price' | null>(null);

  // Margin overview tab state
  const [marginSearch, setMarginSearch] = useState('');
  const [marginFilter, setMarginFilter] = useState<MarginFilter>('all');
  const [marginSort, setMarginSort] = useState<MarginSort>('margin_asc');

  useEffect(() => {
    if (!branchMenu.some((m) => m.id === recipeMenuId)) {
      setRecipeMenuId(branchMenu[0]?.id || '');
    }
  }, [activeBranch.id, branchMenu, recipeMenuId]);

  const selectedMenuItem = useMemo(
    () => branchMenu.find((m) => m.id === recipeMenuId) || null,
    [branchMenu, recipeMenuId]
  );

  const activeSavedRecipe = useMemo(
    () => state.recipes.find((r) => r.menuItemId === recipeMenuId),
    [state.recipes, recipeMenuId]
  );

  // Sync draft lines and target price whenever the active menu item or saved recipe changes
  useEffect(() => {
    setDraftLines(activeSavedRecipe ? activeSavedRecipe.lines.map((l) => ({ ...l })) : []);
    setPriceDraft(selectedMenuItem ? selectedMenuItem.priceUsd.toFixed(2) : '');
  }, [recipeMenuId, activeSavedRecipe, selectedMenuItem?.priceUsd]);

  useEffect(() => {
    setSavedNotice(null);
  }, [recipeMenuId, activeBranch.id]);

  const recipeMap = useMemo(() => {
    return new Map(state.recipes.map((r) => [r.menuItemId, r]));
  }, [state.recipes]);

  const branchMarginRows = useMemo(() => {
    return branchMenu.map((menuItem) => {
      const saved = recipeMap.get(menuItem.id);
      const calculation = calculateMenuProfitMargin({
        menuItemId: menuItem.id,
        menuPriceUsd: menuItem.priceUsd,
        lines: saved?.lines || [],
        ingredients: branchIngredients,
        hasSavedRecipe: Boolean(saved && saved.lines.length > 0),
      });
      return { menuItem, calculation };
    });
  }, [branchMenu, recipeMap, branchIngredients]);

  const branchMarginSummary = useMemo(
    () => summarizeBranchMargins(branchMarginRows),
    [branchMarginRows]
  );

  // Live real-time profit margin calculation for the active menu item as draft lines or price edit change
  const parsedLivePrice = useMemo(() => {
    if (!selectedMenuItem) return 0;
    const numeric = Number(priceDraft);
    if (priceDraft.trim() === '' || Number.isNaN(numeric)) return selectedMenuItem.priceUsd;
    return Math.max(0, numeric);
  }, [priceDraft, selectedMenuItem]);

  const liveCalculation = useMemo(() => {
    return calculateMenuProfitMargin({
      menuItemId: selectedMenuItem?.id || '',
      menuPriceUsd: parsedLivePrice,
      lines: draftLines,
      ingredients: branchIngredients,
      hasSavedRecipe: Boolean(activeSavedRecipe && activeSavedRecipe.lines.length > 0),
    });
  }, [selectedMenuItem, parsedLivePrice, draftLines, branchIngredients, activeSavedRecipe]);

  const normalizedDraftLines = useMemo(() => normalizeRecipeLines(draftLines), [draftLines]);
  const savedLines = useMemo(() => activeSavedRecipe?.lines || [], [activeSavedRecipe]);
  const hasUnsavedRecipeChanges = useMemo(
    () => !areRecipeLinesEqual(normalizedDraftLines, savedLines),
    [normalizedDraftLines, savedLines]
  );
  const hasPriceChange = Boolean(
    selectedMenuItem && Math.abs(parsedLivePrice - selectedMenuItem.priceUsd) >= 0.005
  );

  const duplicateIngredientIds = useMemo(() => {
    const counts = new Map<string, number>();
    draftLines.forEach((l) => {
      if (l.ingredientId) counts.set(l.ingredientId, (counts.get(l.ingredientId) || 0) + 1);
    });
    return new Set(Array.from(counts.entries()).filter(([, c]) => c > 1).map(([id]) => id));
  }, [draftLines]);

  const filteredRecipeMenuRows = useMemo(() => {
    const q = recipeSearch.trim().toLowerCase();
    return branchMarginRows.filter(({ menuItem, calculation }) => {
      if (recipeFilter === 'linked' && !calculation.hasLinkedIngredients) return false;
      if (recipeFilter === 'unlinked' && calculation.hasLinkedIngredients) return false;
      if (!q) return true;
      return (
        menuItem.nameEn.toLowerCase().includes(q) ||
        menuItem.nameKh.toLowerCase().includes(q) ||
        menuItem.category.toLowerCase().includes(q)
      );
    });
  }, [branchMarginRows, recipeSearch, recipeFilter]);

  const filteredMarginRows = useMemo(() => {
    const q = marginSearch.trim().toLowerCase();
    const list = branchMarginRows.filter(({ menuItem, calculation }) => {
      if (marginFilter === 'linked' && !calculation.hasLinkedIngredients) return false;
      if (marginFilter === 'unlinked' && calculation.hasLinkedIngredients) return false;
      if (
        marginFilter === 'low' &&
        !(calculation.hasLinkedIngredients && (calculation.healthTier === 'low' || calculation.healthTier === 'loss'))
      ) {
        return false;
      }
      if (!q) return true;
      return (
        menuItem.nameEn.toLowerCase().includes(q) ||
        menuItem.nameKh.toLowerCase().includes(q) ||
        menuItem.category.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (marginSort === 'name_asc') return a.menuItem.nameEn.localeCompare(b.menuItem.nameEn);
      if (marginSort === 'cost_desc') {
        return b.calculation.exactFoodCostUsd - a.calculation.exactFoodCostUsd;
      }
      // Put linked items first for margin sorts
      if (a.calculation.hasLinkedIngredients !== b.calculation.hasLinkedIngredients) {
        return a.calculation.hasLinkedIngredients ? -1 : 1;
      }
      if (marginSort === 'margin_desc') {
        return b.calculation.profitMarginPct - a.calculation.profitMarginPct;
      }
      return a.calculation.profitMarginPct - b.calculation.profitMarginPct;
    });
  }, [branchMarginRows, marginSearch, marginFilter, marginSort]);

  const handleSelectRecipeMenu = (id: string) => {
    setRecipeMenuId(id);
    setSavedNotice(null);
  };

  const handleAddIngredientLine = () => {
    if (branchIngredients.length === 0) return;
    const usedIds = new Set(draftLines.map((l) => l.ingredientId));
    const nextIngredient = branchIngredients.find((i) => !usedIds.has(i.id)) || branchIngredients[0];
    const defaultQty = nextIngredient.unit === 'pcs' ? 1 : 50;
    setDraftLines((prev) => [...prev, { ingredientId: nextIngredient.id, qtyPerPortion: defaultQty }]);
    setSavedNotice(null);
  };

  const handleSaveRecipe = () => {
    if (!selectedMenuItem) return;
    const cleaned = normalizeRecipeLines(draftLines);
    saveRecipe(selectedMenuItem.id, cleaned);
    setDraftLines(cleaned);
    setSavedNotice('recipe');
  };

  const handleApplyNewPrice = () => {
    if (!selectedMenuItem) return;
    const updatedPrice = roundCurrency(Math.max(0, parsedLivePrice));
    saveMenuItem({
      ...selectedMenuItem,
      priceUsd: updatedPrice,
    });
    setPriceDraft(updatedPrice.toFixed(2));
    setSavedNotice('price');
  };

  const handleStockActionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(qtyInput);
    if (!selectedIngId || Number.isNaN(qty)) return;
    if (actionMode === 'purchase') {
      recordIngredientPurchase(selectedIngId, qty, Math.max(0, Number(costInput) || 0));
    } else if (actionMode === 'waste') {
      recordIngredientWaste(selectedIngId, qty, noteInput);
    } else if (actionMode === 'count') {
      recordStockCount(selectedIngId, qty);
    }
    setActionMode(null);
    setQtyInput('');
    setCostInput('');
    setNoteInput('');
  };

  const handleCreateIngredient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNameEn.trim()) return;
    addIngredient({
      nameEn: newNameEn.trim(),
      nameKh: newNameKh.trim() || newNameEn.trim(),
      unit: newUnit,
      purchaseUnit: newPurchaseUnit,
      purchaseUnitSize: Number(newPurchaseSize) || 1,
      onHand: Number(newOnHand) || 0,
      minLevel: Number(newMinLevel) || 0,
      avgCostUsd: Number(newAvgCost) || 0,
    });
    setShowAddIng(false);
    setNewNameEn('');
    setNewNameKh('');
  };

  const exchangeRate = activeBranch.exchangeRate || 4100;
  const rielRounding = activeBranch.rielRounding || 100;

  const branchAiAlerts = useMemo(
    () => aiStockAlerts.filter((a) => a.branchId === activeBranch.id),
    [aiStockAlerts, activeBranch.id]
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Stock &amp; recipes</h1>
          <p className="text-xs text-slate-500">
            Weighted-average inventory, AI stockout monitoring, ingredient-to-dish linking, and real-time profit margin
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Inventory sections">
          {(
            [
              { id: 'stock', label: 'Stock' },
              { id: 'projection', label: 'Inventory Projection' },
              { id: 'ai_monitor', label: 'AI Stock Monitor' },
              { id: 'auto_restock', label: 'Auto-Restock' },
              { id: 'recipes', label: 'Recipes & margin' },
              { id: 'history', label: 'History' },
              { id: 'margin', label: 'Cost & margin' },
            ] as { id: StockSubTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={subTab === tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                subTab === tab.id
                  ? 'bg-emerald-800 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.id === 'projection' && <TrendingDown className="h-3.5 w-3.5" />}
              {tab.id === 'ai_monitor' && <Sparkles className="h-3.5 w-3.5" />}
              {tab.id === 'auto_restock' && <Truck className="h-3.5 w-3.5" />}
              <span>{tab.label}</span>
              {tab.id === 'ai_monitor' && branchAiAlerts.length > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    subTab === 'ai_monitor'
                      ? 'bg-white/20 text-white'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {branchAiAlerts.length}
                </span>
              )}
              {tab.id === 'auto_restock' && lowCount > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    subTab === 'auto_restock'
                      ? 'bg-white/20 text-white'
                      : 'bg-red-100 text-red-900'
                  }`}
                >
                  {lowCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Total inventory value</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
            ${totalStockValue.toFixed(2)}
          </div>
          <div className="text-xs text-slate-500">{branchIngredients.length} tracked ingredients</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Low / out of stock alerts</div>
          <div
            className={`mt-1 text-2xl font-bold tabular-nums ${
              lowCount > 0 ? 'text-amber-700' : 'text-emerald-800'
            }`}
          >
            {lowCount}
          </div>
          <div className="text-xs text-slate-500">Sorted to top for quick restock</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">Dishes linked &amp; avg margin</span>
            {branchMarginSummary.linkedMenuItems > 0 && (
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 tabular-nums">
                {branchMarginSummary.avgProfitMarginPct.toFixed(1)}% avg
              </span>
            )}
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
            {branchMarginSummary.linkedMenuItems} / {branchMarginSummary.totalMenuItems}
          </div>
          <div className="text-xs text-slate-500">Auto-deducted &amp; costed per sale</div>
        </div>
      </div>

      {subTab === 'stock' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-800">
              <Sparkles className="h-4 w-4 text-emerald-800 shrink-0" />
              <span>
                {branchAiAlerts.length > 0 ? (
                  <>
                    <strong>AI Stock Monitor:</strong> {branchAiAlerts.length} predicted low-stock{' '}
                    {branchAiAlerts.length === 1 ? 'ingredient' : 'ingredients'} flagged for staff
                    restock.
                  </>
                ) : (
                  <>
                    <strong>AI Stock Monitor:</strong> Predict ingredient run-out dates from sales
                    history &amp; trigger automated staff alerts.
                  </>
                )}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTab('projection')}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 whitespace-nowrap shrink-0"
              >
                <TrendingDown className="h-3.5 w-3.5" />
                Inventory Projection
              </button>
              <button
                type="button"
                onClick={() => setSubTab('auto_restock')}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 whitespace-nowrap shrink-0"
              >
                <Truck className="h-3.5 w-3.5" />
                Auto-Restock drafts
                {lowCount > 0 && (
                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-900 tabular-nums">
                    {lowCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSubTab('ai_monitor')}
                className="rounded-lg bg-emerald-800 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-900 whitespace-nowrap shrink-0"
              >
                Open AI Stock Monitor
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Package className="h-4 w-4 text-emerald-800" />
              Ingredients on hand
            </h2>
            <button
              type="button"
              onClick={() => setShowAddIng((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900"
            >
              <Plus className="h-3.5 w-3.5" /> Add ingredient
            </button>
          </div>

          {showAddIng && (
            <form
              onSubmit={handleCreateIngredient}
              className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs"
            >
              <input
                required
                aria-label="Ingredient name (English)"
                placeholder="Ingredient name (EN)"
                value={newNameEn}
                onChange={(e) => setNewNameEn(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
              />
              <input
                aria-label="Ingredient name (Khmer)"
                placeholder="Name (Khmer)"
                value={newNameKh}
                onChange={(e) => setNewNameKh(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
              />
              <input
                aria-label="Base unit"
                placeholder="Base unit (g, ml, pcs)"
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
              />
              <input
                aria-label="Purchase unit"
                placeholder="Purchase unit (kg, L)"
                value={newPurchaseUnit}
                onChange={(e) => setNewPurchaseUnit(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
              />
              <input
                type="number"
                aria-label="Purchase unit size"
                placeholder="Purchase unit size"
                value={newPurchaseSize}
                onChange={(e) => setNewPurchaseSize(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 tabular-nums"
              />
              <input
                type="number"
                aria-label="Starting on hand"
                placeholder="Starting on hand"
                value={newOnHand}
                onChange={(e) => setNewOnHand(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 tabular-nums"
              />
              <input
                type="number"
                aria-label="Min alert level"
                placeholder="Min alert level"
                value={newMinLevel}
                onChange={(e) => setNewMinLevel(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 tabular-nums"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.0001"
                  aria-label="Average cost per unit"
                  placeholder="Avg cost/unit $"
                  value={newAvgCost}
                  onChange={(e) => setNewAvgCost(e.target.value)}
                  className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 tabular-nums"
                />
                <button
                  type="submit"
                  className="rounded bg-emerald-800 px-3 py-1.5 font-semibold text-white"
                >
                  Save
                </button>
              </div>
            </form>
          )}

          {actionMode && (
            <form
              onSubmit={handleStockActionSubmit}
              className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-wrap items-end gap-3 text-xs"
            >
              <div>
                <span className="block font-bold text-slate-800 mb-1">
                  {actionMode === 'purchase'
                    ? 'Goods In (Purchase)'
                    : actionMode === 'waste'
                      ? 'Record Waste / Spoilage'
                      : 'Physical Stock Count'}{' '}
                  — {branchIngredients.find((i) => i.id === selectedIngId)?.nameEn}
                </span>
                <input
                  type="number"
                  step="any"
                  required
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                  placeholder={
                    actionMode === 'count' ? 'Actual counted qty' : 'Quantity in base unit'
                  }
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 tabular-nums"
                />
              </div>
              {actionMode === 'purchase' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Total Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={costInput}
                    onChange={(e) => setCostInput(e.target.value)}
                    placeholder="0.00"
                    className="w-28 rounded border border-slate-300 bg-white px-2.5 py-1.5 tabular-nums"
                  />
                </div>
              )}
              {actionMode === 'waste' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Reason</label>
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="Expired / spilled"
                    className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
                  />
                </div>
              )}
              <button
                type="submit"
                className="rounded-lg bg-emerald-800 px-3.5 py-1.5 font-semibold text-white"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setActionMode(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700"
              >
                Cancel
              </button>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Ingredient</th>
                  <th className="py-2 pr-3 font-semibold text-right">On Hand</th>
                  <th className="py-2 pr-3 font-semibold text-right">Min Level</th>
                  <th className="py-2 pr-3 font-semibold text-right">Avg Cost</th>
                  <th className="py-2 pr-3 font-semibold text-right">Stock Value</th>
                  <th className="py-2 pr-3 font-semibold">Preferred Supplier</th>
                  <th className="py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branchIngredients.map((ing) => {
                  const isLow = ing.onHand <= ing.minLevel;
                  return (
                    <tr key={ing.id} className={isLow ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-slate-900">{ing.nameEn}</div>
                        <div className="text-[11px] text-slate-500">{ing.nameKh}</div>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        <span className={isLow ? 'font-bold text-amber-800' : 'font-semibold'}>
                          {ing.onHand.toLocaleString()} {ing.unit}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-500">
                        {ing.minLevel.toLocaleString()} {ing.unit}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        ${ing.avgCostUsd.toFixed(4)}/{ing.unit}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">
                        ${(ing.onHand * ing.avgCostUsd).toFixed(2)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <select
                          aria-label={`Preferred supplier for ${ing.nameEn}`}
                          value={ing.preferredSupplierId || ''}
                          onChange={(e) => setIngredientPreferredSupplier(ing.id, e.target.value)}
                          className="max-w-[11rem] rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-700"
                        >
                          <option value="">Auto-match</option>
                          {branchSuppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedIngId(ing.id);
                            setActionMode('purchase');
                          }}
                          className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800"
                        >
                          Goods in
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedIngId(ing.id);
                            setActionMode('waste');
                          }}
                          className="rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-700"
                        >
                          Waste
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedIngId(ing.id);
                            setActionMode('count');
                            setQtyInput(String(ing.onHand));
                          }}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                        >
                          Count
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'recipes' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left column: Menu item picker with live/saved margin badges */}
          <div className="lg:col-span-4 lg:border-r lg:border-slate-100 lg:pr-4 flex flex-col gap-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                Menu items ({branchMenu.length})
              </h2>
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  aria-label="Search menu items"
                  placeholder="Search menu item..."
                  value={recipeSearch}
                  onChange={(e) => setRecipeSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2.5 py-1.5 text-xs focus:bg-white focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {(['all', 'linked', 'unlinked'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setRecipeFilter(f)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${
                      recipeFilter === f
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
              {filteredRecipeMenuRows.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No matching menu items.</p>
              ) : (
                filteredRecipeMenuRows.map(({ menuItem, calculation }) => {
                  const isSelected = recipeMenuId === menuItem.id;
                  const shownCalc = isSelected ? liveCalculation : calculation;
                  return (
                    <button
                      key={menuItem.id}
                      type="button"
                      onClick={() => handleSelectRecipeMenu(menuItem.id)}
                      className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                        isSelected
                          ? 'bg-emerald-800 text-white font-semibold'
                          : 'hover:bg-slate-50 text-slate-700 border border-transparent hover:border-slate-200'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate">{menuItem.nameEn}</div>
                        <div
                          className={`text-[11px] truncate ${
                            isSelected ? 'text-emerald-100' : 'text-slate-400'
                          }`}
                        >
                          {menuItem.category} · ${menuItem.priceUsd.toFixed(2)}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums border ${
                          isSelected
                            ? 'bg-white/15 text-white border-white/25'
                            : tierBadgeClass(shownCalc.healthTier)
                        }`}
                      >
                        {shownCalc.hasLinkedIngredients
                          ? `${shownCalc.profitMarginPct.toFixed(1)}%`
                          : 'Unlinked'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right column: Ingredient linking + Real-time Profit Margin studio */}
          <div className="lg:col-span-8 space-y-4">
            {selectedMenuItem ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <ChefHat className="h-4 w-4 text-emerald-800" />
                        {selectedMenuItem.nameEn}
                      </h2>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tierBadgeClass(
                          liveCalculation.healthTier
                        )}`}
                      >
                        {tierLabel(liveCalculation.healthTier)}
                      </span>
                      {hasUnsavedRecipeChanges && (
                        <span className="rounded-md bg-amber-100 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          Unsaved draft
                        </span>
                      )}
                      {savedNotice === 'recipe' && !hasUnsavedRecipeChanges && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" /> Recipe saved
                        </span>
                      )}
                      {savedNotice === 'price' && !hasPriceChange && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" /> Menu price updated
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedMenuItem.nameKh} · {selectedMenuItem.category} · Real-time food cost vs menu price
                    </p>
                  </div>

                  {/* Quick menu price check / update */}
                  <div className="flex items-end gap-2">
                    <div>
                      <label
                        htmlFor="recipe-menu-price-input"
                        className="block text-[11px] font-semibold text-slate-600 mb-0.5"
                      >
                        Menu price ($)
                      </label>
                      <input
                        id="recipe-menu-price-input"
                        type="number"
                        step="0.05"
                        min="0"
                        value={priceDraft}
                        onChange={(e) => {
                          setPriceDraft(e.target.value);
                          setSavedNotice(null);
                        }}
                        className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-right tabular-nums focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                    {hasPriceChange && (
                      <button
                        type="button"
                        onClick={handleApplyNewPrice}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Apply price
                      </button>
                    )}
                  </div>
                </div>

                {/* Real-time Profit Margin Live Dashboard */}
                <div
                  data-testid="realtime-margin-panel"
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                      <div className="text-[11px] text-slate-500">Menu Price</div>
                      <div className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">
                        ${liveCalculation.menuPriceUsd.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-slate-400 tabular-nums">
                        {usdToKhr(liveCalculation.menuPriceUsd, exchangeRate, rielRounding).toLocaleString()} ៛
                      </div>
                    </div>

                    <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                      <div className="text-[11px] text-slate-500">Food Cost (Live)</div>
                      <div className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">
                        ${liveCalculation.foodCostUsd.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        {liveCalculation.hasLinkedIngredients
                          ? `${liveCalculation.foodCostPct.toFixed(1)}% of price`
                          : 'No ingredients linked'}
                      </div>
                    </div>

                    <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                      <div className="text-[11px] text-slate-500">Gross Profit</div>
                      <div
                        className={`mt-0.5 text-lg font-bold tabular-nums ${
                          liveCalculation.grossProfitUsd >= 0 ? 'text-emerald-800' : 'text-red-700'
                        }`}
                      >
                        ${liveCalculation.grossProfitUsd.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-slate-400 tabular-nums">
                        {liveCalculation.grossProfitUsd >= 0
                          ? `${usdToKhr(liveCalculation.grossProfitUsd, exchangeRate, rielRounding).toLocaleString()} ៛`
                          : 'Below cost'}
                      </div>
                    </div>

                    <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                      <div className="text-[11px] text-slate-500">Profit Margin</div>
                      <div
                        data-testid="live-profit-margin-pct"
                        className={`mt-0.5 text-lg font-bold tabular-nums ${
                          !liveCalculation.hasLinkedIngredients
                            ? 'text-slate-400'
                            : liveCalculation.healthTier === 'healthy'
                              ? 'text-emerald-800'
                              : liveCalculation.healthTier === 'moderate'
                                ? 'text-amber-700'
                                : 'text-red-700'
                        }`}
                      >
                        {liveCalculation.hasLinkedIngredients
                          ? `${liveCalculation.profitMarginPct.toFixed(1)}%`
                          : '—'}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        {liveCalculation.maxServingsFromStock !== null
                          ? `${liveCalculation.maxServingsFromStock} portions in stock`
                          : 'Target >= 65%'}
                      </div>
                    </div>
                  </div>

                  {/* Cost vs Margin split bar */}
                  {liveCalculation.hasLinkedIngredients && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-600">
                        <span>Food cost share: {liveCalculation.foodCostPct.toFixed(1)}%</span>
                        <span>Profit margin: {liveCalculation.profitMarginPct.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden flex">
                        <div
                          className="h-full bg-amber-500 transition-all"
                          style={{
                            width: `${Math.min(100, Math.max(0, liveCalculation.foodCostPct))}%`,
                          }}
                        />
                        <div
                          className={`h-full transition-all ${
                            liveCalculation.profitMarginPct >= 65
                              ? 'bg-emerald-600'
                              : liveCalculation.profitMarginPct >= 45
                                ? 'bg-emerald-500'
                                : 'bg-orange-500'
                          }`}
                          style={{
                            width: `${Math.min(100, Math.max(0, liveCalculation.profitMarginPct))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Linked ingredient lines */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 flex items-center gap-1.5">
                      <Link2 className="h-3.5 w-3.5 text-emerald-800" />
                      Linked ingredients ({draftLines.length})
                    </h3>
                    <button
                      type="button"
                      onClick={handleAddIngredientLine}
                      disabled={branchIngredients.length === 0}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      + Add ingredient line
                    </button>
                  </div>

                  {duplicateIngredientIds.size > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                      Duplicate ingredient selected. Combine quantities into one line for cleaner stock deduction.
                    </div>
                  )}

                  {draftLines.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center space-y-2">
                      <p className="text-xs text-slate-600">
                        No ingredients linked to <strong>{selectedMenuItem.nameEn}</strong> yet.
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Add ingredients below to auto-deduct inventory on sale and calculate profit margin in real time.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                            <th className="py-2 px-3 font-semibold">Ingredient</th>
                            <th className="py-2 px-2 font-semibold text-right">Qty / portion</th>
                            <th className="py-2 px-2 font-semibold text-right">Unit cost</th>
                            <th className="py-2 px-2 font-semibold text-right">Line cost</th>
                            <th className="py-2 px-2 font-semibold text-right">Cost %</th>
                            <th className="py-2 px-2 font-semibold text-right">Remove</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {draftLines.map((line, idx) => {
                            const ing = branchIngredients.find((i) => i.id === line.ingredientId);
                            const breakdown = liveCalculation.lineBreakdowns[idx];
                            const lineCost = breakdown ? breakdown.lineCostUsd : 0;
                            const costSharePct = breakdown ? breakdown.costSharePct : 0;
                            return (
                              <tr key={`${line.ingredientId}_${idx}`} className="hover:bg-slate-50/70">
                                <td className="py-2 px-3">
                                  <select
                                    aria-label={`Ingredient row ${idx + 1}`}
                                    value={line.ingredientId}
                                    onChange={(e) => {
                                      const nextId = e.target.value;
                                      setDraftLines((prev) =>
                                        prev.map((l, i) =>
                                          i === idx ? { ...l, ingredientId: nextId } : l
                                        )
                                      );
                                      setSavedNotice(null);
                                    }}
                                    className="w-full min-w-[170px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                                  >
                                    {branchIngredients.map((i) => (
                                      <option key={i.id} value={i.id}>
                                        {i.nameEn} ({i.unit}) · ${i.avgCostUsd.toFixed(4)}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-2 px-2 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      aria-label={`Quantity per portion for row ${idx + 1}`}
                                      value={line.qtyPerPortion}
                                      onChange={(e) => {
                                        const val = Math.max(0, Number(e.target.value) || 0);
                                        setDraftLines((prev) =>
                                          prev.map((l, i) =>
                                            i === idx ? { ...l, qtyPerPortion: val } : l
                                          )
                                        );
                                        setSavedNotice(null);
                                      }}
                                      className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right tabular-nums"
                                    />
                                    <span className="w-8 text-left text-slate-500">
                                      {ing?.unit || ''}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2 px-2 text-right tabular-nums text-slate-500">
                                  ${(ing?.avgCostUsd ?? 0).toFixed(4)}
                                </td>
                                <td className="py-2 px-2 text-right tabular-nums font-semibold text-slate-900">
                                  ${lineCost.toFixed(3)}
                                </td>
                                <td className="py-2 px-2 text-right tabular-nums text-slate-500">
                                  {costSharePct.toFixed(1)}%
                                </td>
                                <td className="py-2 px-2 text-right">
                                  <button
                                    type="button"
                                    aria-label="Remove line"
                                    onClick={() => {
                                      setDraftLines((prev) => prev.filter((_, i) => i !== idx));
                                      setSavedNotice(null);
                                    }}
                                    className="text-red-600 p-1.5 hover:bg-red-50 rounded-md"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSaveRecipe}
                        className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
                      >
                        Save Recipe
                      </button>
                      {hasUnsavedRecipeChanges && (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftLines(savedLines.map((l) => ({ ...l })));
                            setSavedNotice(null);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Reset
                        </button>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {liveCalculation.exactFoodCostUsd > 0
                        ? `Exact recipe cost: $${liveCalculation.exactFoodCostUsd.toFixed(4)} per serving`
                        : 'Add ingredient quantities to compute recipe cost'}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500 py-8 text-center">
                No menu items available for this branch.
              </p>
            )}
          </div>
        </div>
      )}

      {subTab === 'history' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-emerald-800" />
            Stock movement history
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Time</th>
                  <th className="py-2 pr-3 font-semibold">Ingredient</th>
                  <th className="py-2 pr-3 font-semibold">Type</th>
                  <th className="py-2 pr-3 font-semibold text-right">Qty Delta</th>
                  <th className="py-2 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.stockHistory.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2 pr-3 text-slate-500">
                      {new Date(h.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 font-semibold">{h.ingredientName}</td>
                    <td className="py-2 pr-3 capitalize">{h.type.replace('_', ' ')}</td>
                    <td
                      className={`py-2 pr-3 text-right font-mono font-semibold tabular-nums ${
                        h.qtyDelta >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {h.qtyDelta >= 0 ? '+' : ''}
                      {h.qtyDelta}
                    </td>
                    <td className="py-2 text-slate-600">{h.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'margin' && (
        <div className="space-y-4">
          {/* Margin portfolio summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="text-[11px] text-slate-500">Avg Profit Margin</div>
              <div className="mt-1 text-xl font-bold text-emerald-800 tabular-nums">
                {branchMarginSummary.linkedMenuItems > 0
                  ? `${branchMarginSummary.avgProfitMarginPct.toFixed(1)}%`
                  : '—'}
              </div>
              <div className="text-[11px] text-slate-500">
                {branchMarginSummary.highestMarginItem
                  ? `Top: ${branchMarginSummary.highestMarginItem.nameEn} (${branchMarginSummary.highestMarginItem.profitMarginPct.toFixed(1)}%)`
                  : 'Link recipes to calculate'}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="text-[11px] text-slate-500">Avg Food Cost %</div>
              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                {branchMarginSummary.linkedMenuItems > 0
                  ? `${branchMarginSummary.avgFoodCostPct.toFixed(1)}%`
                  : '—'}
              </div>
              <div className="text-[11px] text-slate-500">Industry café target: 25–35%</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="text-[11px] text-slate-500">Linked Menu Items</div>
              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                {branchMarginSummary.linkedMenuItems} / {branchMarginSummary.totalMenuItems}
              </div>
              <div className="text-[11px] text-slate-500">
                {branchMarginSummary.unlinkedMenuItems} waiting for recipe link
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="text-[11px] text-slate-500">Low Margin Alerts (&lt;45%)</div>
              <div
                className={`mt-1 text-xl font-bold tabular-nums ${
                  branchMarginSummary.lowMarginCount > 0 ? 'text-amber-700' : 'text-emerald-800'
                }`}
              >
                {branchMarginSummary.lowMarginCount}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {branchMarginSummary.lowestMarginItem
                  ? `Lowest: ${branchMarginSummary.lowestMarginItem.nameEn} (${branchMarginSummary.lowestMarginItem.profitMarginPct.toFixed(1)}%)`
                  : 'No linked items yet'}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-800" />
                Dish food cost &amp; profit margin
              </h2>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    aria-label="Filter dishes in profit margin table"
                    placeholder="Search dish or category..."
                    value={marginSearch}
                    onChange={(e) => setMarginSearch(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2.5 py-1.5 text-xs focus:bg-white focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'linked', label: 'Linked' },
                      { id: 'unlinked', label: 'Unlinked' },
                      { id: 'low', label: 'Low (<45%)' },
                    ] as { id: MarginFilter; label: string }[]
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setMarginFilter(f.id)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        marginFilter === f.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <select
                  aria-label="Sort profit margin rows"
                  value={marginSort}
                  onChange={(e) => setMarginSort(e.target.value as MarginSort)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                >
                  <option value="margin_asc">Margin: Low to High</option>
                  <option value="margin_desc">Margin: High to Low</option>
                  <option value="cost_desc">Food Cost: High to Low</option>
                  <option value="name_asc">Name: A to Z</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Dish</th>
                    <th className="py-2 pr-3 font-semibold">Ingredients Linked</th>
                    <th className="py-2 pr-3 font-semibold text-right">Menu Price</th>
                    <th className="py-2 pr-3 font-semibold text-right">Food Cost</th>
                    <th className="py-2 pr-3 font-semibold text-right">Gross Profit</th>
                    <th className="py-2 pr-3 font-semibold text-right">Profit Margin %</th>
                    <th className="py-2 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMarginRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        No dishes match the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredMarginRows.map(({ menuItem, calculation }) => {
                      const ingSummary = calculation.lineBreakdowns
                        .filter((l) => !l.missingIngredient && l.qtyPerPortion > 0)
                        .map((l) => `${l.ingredientName} (${l.qtyPerPortion}${l.unit})`)
                        .join(', ');

                      return (
                        <tr key={menuItem.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 pr-3">
                            <div className="font-semibold text-slate-900">{menuItem.nameEn}</div>
                            <div className="text-[11px] text-slate-500">
                              {menuItem.nameKh} · {menuItem.category}
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 max-w-[220px]">
                            {calculation.hasLinkedIngredients ? (
                              <div className="text-[11px] text-slate-600 truncate" title={ingSummary}>
                                <span className="font-semibold text-slate-800">
                                  {calculation.lineBreakdowns.length}
                                </span>{' '}
                                · {ingSummary}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">No ingredients linked</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums font-medium">
                            ${calculation.menuPriceUsd.toFixed(2)}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            {calculation.hasLinkedIngredients ? (
                              <div>
                                <div className="font-medium text-slate-900">
                                  ${calculation.foodCostUsd.toFixed(2)}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {calculation.foodCostPct.toFixed(1)}% cost
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            {calculation.hasLinkedIngredients ? (
                              <div>
                                <div
                                  className={`font-semibold ${
                                    calculation.grossProfitUsd >= 0
                                      ? 'text-emerald-800'
                                      : 'text-red-700'
                                  }`}
                                >
                                  ${calculation.grossProfitUsd.toFixed(2)}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {calculation.grossProfitUsd >= 0
                                    ? `${usdToKhr(calculation.grossProfitUsd, exchangeRate, rielRounding).toLocaleString()} ៛`
                                    : 'Loss'}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            <span
                              className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${tierBadgeClass(
                                calculation.healthTier
                              )}`}
                            >
                              {calculation.hasLinkedIngredients
                                ? `${calculation.profitMarginPct.toFixed(1)}%`
                                : 'Unlinked'}
                            </span>
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                handleSelectRecipeMenu(menuItem.id);
                                setSubTab('recipes');
                              }}
                              className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                            >
                              {calculation.hasLinkedIngredients ? 'Edit recipe' : 'Link ingredients'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'projection' && (
        <InventoryProjectionPanel
          onOpenAutoRestock={() => setSubTab('auto_restock')}
          onRestockIngredient={(ingredientId, suggestedQty) => {
            const ing = branchIngredients.find((i) => i.id === ingredientId);
            setSelectedIngId(ingredientId);
            setActionMode('purchase');
            setQtyInput(String(suggestedQty));
            if (ing) {
              setCostInput(roundCurrency(suggestedQty * ing.avgCostUsd).toFixed(2));
            }
            setSubTab('stock');
          }}
        />
      )}

      {subTab === 'ai_monitor' && (
        <AiStockMonitorPanel
          onRestockIngredient={(ingredientId, suggestedQty) => {
            const ing = branchIngredients.find((i) => i.id === ingredientId);
            setSelectedIngId(ingredientId);
            setActionMode('purchase');
            setQtyInput(String(suggestedQty));
            if (ing) {
              setCostInput(roundCurrency(suggestedQty * ing.avgCostUsd).toFixed(2));
            }
            setSubTab('stock');
          }}
        />
      )}

      {subTab === 'auto_restock' && (
        <AutoRestockPanel onOpenMonitor={() => setSubTab('ai_monitor')} />
      )}
    </div>
  );
}
