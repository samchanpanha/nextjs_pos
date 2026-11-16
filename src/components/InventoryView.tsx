import React, { useMemo, useState } from 'react';
import { Package, Plus, Trash2, ClipboardCheck, ChefHat, DollarSign } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { roundCurrency } from '../utils/posMath';

type StockSubTab = 'stock' | 'recipes' | 'history' | 'margin';

export function InventoryView() {
  const {
    state,
    activeBranch,
    addIngredient,
    recordIngredientPurchase,
    recordIngredientWaste,
    recordStockCount,
    saveRecipe,
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

  // Recipe editor
  const branchMenu = state.menuItems.filter((m) => m.branchId === activeBranch.id);
  const [recipeMenuId, setRecipeMenuId] = useState<string>(branchMenu[0]?.id || '');

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

  const totalStockValue = useMemo(
    () =>
      roundCurrency(
        branchIngredients.reduce((sum, i) => sum + i.onHand * i.avgCostUsd, 0)
      ),
    [branchIngredients]
  );

  const lowCount = branchIngredients.filter((i) => i.onHand <= i.minLevel).length;

  const activeRecipe = state.recipes.find((r) => r.menuItemId === recipeMenuId);
  const [draftLines, setDraftLines] = useState<{ ingredientId: string; qtyPerPortion: number }[]>(
    activeRecipe?.lines || []
  );

  const handleSelectRecipeMenu = (id: string) => {
    setRecipeMenuId(id);
    const found = state.recipes.find((r) => r.menuItemId === id);
    setDraftLines(found?.lines || []);
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

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Stock &amp; recipes</h1>
          <p className="text-xs text-slate-500">
            Weighted-average inventory, automatic recipe deduction on sale, waste &amp; margin analysis
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(['stock', 'recipes', 'history', 'margin'] as StockSubTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setSubTab(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                subTab === tab
                  ? 'bg-emerald-800 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab === 'margin' ? 'Cost & margin' : tab}
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
          <div className="text-xs text-slate-500">Dishes linked to recipes</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
            {state.recipes.length} / {branchMenu.length}
          </div>
          <div className="text-xs text-slate-500">Auto-deducted when paid</div>
        </div>
      </div>

      {subTab === 'stock' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
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
                placeholder="Ingredient name (EN)"
                value={newNameEn}
                onChange={(e) => setNewNameEn(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
              />
              <input
                placeholder="Name (Khmer)"
                value={newNameKh}
                onChange={(e) => setNewNameKh(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
              />
              <input
                placeholder="Base unit (g, ml, pcs)"
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
              />
              <input
                placeholder="Purchase unit (kg, L)"
                value={newPurchaseUnit}
                onChange={(e) => setNewPurchaseUnit(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5"
              />
              <input
                type="number"
                placeholder="Purchase unit size"
                value={newPurchaseSize}
                onChange={(e) => setNewPurchaseSize(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 tabular-nums"
              />
              <input
                type="number"
                placeholder="Starting on hand"
                value={newOnHand}
                onChange={(e) => setNewOnHand(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 tabular-nums"
              />
              <input
                type="number"
                placeholder="Min alert level"
                value={newMinLevel}
                onChange={(e) => setNewMinLevel(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 tabular-nums"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.0001"
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
        <div className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border-r border-slate-100 pr-3 space-y-1 max-h-96 overflow-y-auto">
            <h2 className="text-xs font-bold uppercase text-slate-500 mb-2">Select menu item</h2>
            {branchMenu.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleSelectRecipeMenu(m.id)}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs ${
                  recipeMenuId === m.id
                    ? 'bg-emerald-800 text-white font-semibold'
                    : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="truncate">{m.nameEn}</span>
                <span className="tabular-nums opacity-80">${m.priceUsd.toFixed(2)}</span>
              </button>
            ))}
          </div>

          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ChefHat className="h-4 w-4 text-emerald-800" />
                Recipe for {branchMenu.find((m) => m.id === recipeMenuId)?.nameEn}
              </h2>
              <button
                type="button"
                onClick={() => {
                  const first = branchIngredients[0];
                  if (!first) return;
                  setDraftLines((prev) => [...prev, { ingredientId: first.id, qtyPerPortion: 100 }]);
                }}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                + Add ingredient line
              </button>
            </div>

            {draftLines.length === 0 ? (
              <p className="text-xs text-slate-500 py-6">
                No ingredients attached yet. Add ingredient lines to auto-deduct stock on every sale.
              </p>
            ) : (
              <div className="space-y-2">
                {draftLines.map((line, idx) => {
                  const ing = branchIngredients.find((i) => i.id === line.ingredientId);
                  return (
                    <div key={`${line.ingredientId}_${idx}`} className="flex items-center gap-2 text-xs">
                      <select
                        value={line.ingredientId}
                        onChange={(e) =>
                          setDraftLines((prev) =>
                            prev.map((l, i) =>
                              i === idx ? { ...l, ingredientId: e.target.value } : l
                            )
                          )
                        }
                        className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5"
                      >
                        {branchIngredients.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nameEn} ({i.unit})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="any"
                        value={line.qtyPerPortion}
                        onChange={(e) =>
                          setDraftLines((prev) =>
                            prev.map((l, i) =>
                              i === idx ? { ...l, qtyPerPortion: Number(e.target.value) || 0 } : l
                            )
                          )
                        }
                        className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-right tabular-nums"
                      />
                      <span className="w-10 text-slate-500">{ing?.unit}</span>
                      <button
                        type="button"
                        aria-label="Remove line"
                        onClick={() => setDraftLines((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-red-600 p-1 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => saveRecipe(recipeMenuId, draftLines)}
                className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
              >
                Save Recipe
              </button>
            </div>
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
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-800" />
            Dish cost &amp; gross margin
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Dish</th>
                  <th className="py-2 pr-3 font-semibold">Category</th>
                  <th className="py-2 pr-3 font-semibold text-right">Selling Price</th>
                  <th className="py-2 pr-3 font-semibold text-right">Recipe Cost</th>
                  <th className="py-2 pr-3 font-semibold text-right">Gross Profit</th>
                  <th className="py-2 font-semibold text-right">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branchMenu.map((m) => {
                  const rec = state.recipes.find((r) => r.menuItemId === m.id);
                  const cost = rec
                    ? roundCurrency(
                        rec.lines.reduce((s, l) => {
                          const ing = branchIngredients.find((i) => i.id === l.ingredientId);
                          return s + (ing ? ing.avgCostUsd * l.qtyPerPortion : 0);
                        }, 0)
                      )
                    : 0;
                  const profit = roundCurrency(m.priceUsd - cost);
                  const marginPct = m.priceUsd > 0 ? Math.round((profit / m.priceUsd) * 100) : 0;
                  return (
                    <tr key={m.id}>
                      <td className="py-2 pr-3 font-semibold text-slate-900">{m.nameEn}</td>
                      <td className="py-2 pr-3 text-slate-500">{m.category}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">${m.priceUsd.toFixed(2)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                        {rec ? `$${cost.toFixed(2)}` : 'No recipe'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums font-semibold text-emerald-800">
                        ${profit.toFixed(2)}
                      </td>
                      <td className="py-2 text-right tabular-nums font-bold">
                        {rec ? `${marginPct}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
