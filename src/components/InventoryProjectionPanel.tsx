import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CalendarClock,
  PackagePlus,
  Search,
  TrendingDown,
  Truck,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import {
  buildInventoryProjection,
  type OrderByUrgencyStatus,
  type ProjectedIngredientItem,
  type ProjectionScenarioMode,
} from '../utils/inventoryProjection';

interface InventoryProjectionPanelProps {
  onRestockIngredient?: (ingredientId: string, suggestedQty: number) => void;
  onOpenAutoRestock?: () => void;
}

function orderByStatusLabel(status: OrderByUrgencyStatus): string {
  switch (status) {
    case 'overdue':
      return 'Order today';
    case 'upcoming':
      return 'Order soon';
    case 'planned':
      return 'Scheduled';
    case 'healthy':
    default:
      return 'Buffered';
  }
}

function orderByStatusTextClass(status: OrderByUrgencyStatus): string {
  switch (status) {
    case 'overdue':
      return 'text-red-700 font-bold';
    case 'upcoming':
      return 'text-amber-800 font-bold';
    case 'planned':
      return 'text-emerald-800 font-semibold';
    case 'healthy':
    default:
      return 'text-slate-500 font-medium';
  }
}

export function InventoryProjectionPanel({
  onRestockIngredient,
  onOpenAutoRestock,
}: InventoryProjectionPanelProps) {
  const { state, activeBranch } = usePos();

  const [horizonDays, setHorizonDays] = useState<number>(14);
  const [leadTimeDays, setLeadTimeDays] = useState<number>(2);
  const [safetyBufferDays, setSafetyBufferDays] = useState<number>(2);
  const [scenarioMode, setScenarioMode] = useState<ProjectionScenarioMode>('historical');
  const [filterMode, setFilterMode] = useState<'all' | 'low_only'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIngId, setSelectedIngId] = useState<string>('');

  const projection = useMemo(
    () =>
      buildInventoryProjection({
        branch: activeBranch,
        ingredients: state.ingredients,
        recipes: state.recipes,
        menuItems: state.menuItems,
        orders: state.orders,
        stockHistory: state.stockHistory,
        dailyRevenueHistory: state.dailyRevenueHistory,
        suppliers: state.suppliers || [],
        purchaseOrders: state.purchaseOrders || [],
        options: {
          forecastHorizonDays: horizonDays,
          leadTimeDays,
          safetyBufferDays,
          scenarioMode,
        },
      }),
    [
      activeBranch,
      state.ingredients,
      state.recipes,
      state.menuItems,
      state.orders,
      state.stockHistory,
      state.dailyRevenueHistory,
      state.suppliers,
      state.purchaseOrders,
      horizonDays,
      leadTimeDays,
      safetyBufferDays,
      scenarioMode,
    ]
  );

  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projection.items.filter((item) => {
      if (filterMode === 'low_only' && !item.isLowStock) return false;
      if (!q) return true;
      return (
        item.ingredientName.toLowerCase().includes(q) ||
        item.nameKh.toLowerCase().includes(q) ||
        (item.supplierName || '').toLowerCase().includes(q) ||
        item.linkedDishes.some((d) => d.toLowerCase().includes(q))
      );
    });
  }, [projection.items, filterMode, searchQuery]);

  useEffect(() => {
    if (visibleItems.length === 0) return;
    if (!visibleItems.some((item) => item.ingredientId === selectedIngId)) {
      setSelectedIngId(visibleItems[0].ingredientId);
    }
  }, [visibleItems, selectedIngId]);

  const selectedItem: ProjectedIngredientItem | null = useMemo(() => {
    return (
      projection.items.find((i) => i.ingredientId === selectedIngId) ||
      visibleItems[0] ||
      projection.items[0] ||
      null
    );
  }, [projection.items, visibleItems, selectedIngId]);

  const orderByChartLabel = useMemo(() => {
    if (!selectedItem || !selectedItem.orderByDate) return null;
    const match = selectedItem.dailySeries.find((pt) => pt.date === selectedItem.orderByDate);
    return match ? match.label : null;
  }, [selectedItem]);

  return (
    <div data-testid="inventory-projection-panel" className="space-y-4">
      {/* Main Control & Parameter Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-emerald-800" />
              Inventory Depletion Projection &amp; Order-By Planner
            </h2>
            <p className="text-xs text-slate-500">
              Uses {projection.historicalDaysAnalyzed || 0} days of historical sales velocity,
              recipe consumption, and waste logs to predict stockout dates and optimal order-by
              deadlines.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenAutoRestock && (
              <button
                type="button"
                onClick={onOpenAutoRestock}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap shrink-0"
              >
                <Truck className="h-3.5 w-3.5" />
                Draft Supplier POs
              </button>
            )}
          </div>
        </div>

        {/* Projection Parameters Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <label className="block text-xs">
            <span className="block text-[11px] font-semibold text-slate-600 mb-1">
              Forecast Horizon
            </span>
            <select
              aria-label="Forecast horizon"
              value={horizonDays}
              onChange={(e) => setHorizonDays(Number(e.target.value) || 14)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
            >
              <option value={7}>Next 7 days</option>
              <option value={14}>Next 14 days</option>
              <option value={30}>Next 30 days</option>
            </select>
          </label>

          <label className="block text-xs">
            <span className="block text-[11px] font-semibold text-slate-600 mb-1">
              Supplier Lead Time
            </span>
            <select
              aria-label="Supplier lead time"
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(Number(e.target.value) || 2)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
            >
              <option value={1}>1 day (Same/next day)</option>
              <option value={2}>2 days (Standard)</option>
              <option value={3}>3 days</option>
              <option value={5}>5 days (Regional)</option>
            </select>
          </label>

          <label className="block text-xs">
            <span className="block text-[11px] font-semibold text-slate-600 mb-1">
              Safety Stock Buffer
            </span>
            <select
              aria-label="Safety stock buffer"
              value={safetyBufferDays}
              onChange={(e) => setSafetyBufferDays(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
            >
              <option value={0}>0 days (Just-in-time)</option>
              <option value={1}>1 day buffer</option>
              <option value={2}>2 days buffer</option>
              <option value={3}>3 days buffer</option>
            </select>
          </label>

          <label className="block text-xs">
            <span className="block text-[11px] font-semibold text-slate-600 mb-1">
              Sales Demand Pace
            </span>
            <select
              aria-label="Sales demand pace"
              value={scenarioMode}
              onChange={(e) => setScenarioMode(e.target.value as ProjectionScenarioMode)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
            >
              <option value="historical">
                Historical Trend ({projection.historicalTrendFactor.toFixed(2)}×)
              </option>
              <option value="busy">Busy Period (+20% traffic)</option>
              <option value="slow">Quiet Period (-15% traffic)</option>
            </select>
          </label>
        </div>
      </div>

      {/* 4-Column KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Order Today / Overdue</div>
          <div
            data-testid="projection-immediate-count"
            className={`mt-1 text-2xl font-bold tabular-nums ${
              projection.immediateOrderCount > 0 ? 'text-red-700' : 'text-emerald-800'
            }`}
          >
            {projection.immediateOrderCount}
          </div>
          <div className="text-xs text-slate-500">
            Below min or inside {leadTimeDays + safetyBufferDays}d lead buffer
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Low-Stock Order-By Items</div>
          <div
            data-testid="projection-low-count"
            className={`mt-1 text-2xl font-bold tabular-nums ${
              projection.lowStockItemCount > 0 ? 'text-amber-700' : 'text-emerald-800'
            }`}
          >
            {projection.lowStockItemCount}
          </div>
          <div className="text-xs text-slate-500">
            Est. ${projection.totalEstimatedOrderUsd.toFixed(2)} reorder value
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Sales Velocity Multiplier</div>
          <div
            data-testid="projection-velocity-factor"
            className="mt-1 text-2xl font-bold text-slate-900 tabular-nums"
          >
            {projection.effectiveMultiplier.toFixed(2)}×
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            7d avg ${projection.recent7dAvgSalesUsd.toFixed(0)} vs $
            {projection.baselineAvgSalesUsd.toFixed(0)}/d
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Earliest Projected Run-Out</div>
          <div className="mt-1 text-lg font-bold text-slate-900 truncate">
            {projection.earliestDepletionItem
              ? projection.earliestDepletionItem.ingredientName
              : 'All stable'}
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            {projection.earliestDepletionItem
              ? `${projection.earliestDepletionItem.predictedDepletionDate} · Order by ${
                  projection.earliestDepletionItem.orderByDate || '—'
                }`
              : 'No ingredients tracked'}
          </div>
        </div>
      </div>

      {/* Selected Ingredient Depletion Trajectory Chart */}
      {selectedItem && (
        <div
          data-testid="inventory-projection-chart"
          className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Stock Depletion Curve — {selectedItem.ingredientName}
              </h3>
              <p className="text-xs text-slate-500 tabular-nums">
                On hand {selectedItem.onHand.toLocaleString()} {selectedItem.unit}
                {' · '}
                Projected burn {selectedItem.projectedDailyBurn.toLocaleString()}{' '}
                {selectedItem.unit}/day
                {' · '}
                Depletes {selectedItem.predictedDepletionDate}
                {selectedItem.orderByDate ? ` · Order by ${selectedItem.orderByDate}` : ''}
              </p>
            </div>
            <div className="text-xs text-slate-500 tabular-nums">
              Min threshold: {selectedItem.minLevel.toLocaleString()} {selectedItem.unit}
            </div>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={selectedItem.dailySeries}
                margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="stockProjGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#047857" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#047857" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                />
                <Tooltip
                  formatter={(value) => [
                    `${Number(value ?? 0).toLocaleString()} ${selectedItem.unit}`,
                    'Projected Stock',
                  ]}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as { date?: string } | undefined;
                    return row?.date ? `${String(label)} (${row.date})` : String(label);
                  }}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                  }}
                />
                {selectedItem.minLevel > 0 && (
                  <ReferenceLine
                    y={selectedItem.minLevel}
                    stroke="#d97706"
                    strokeDasharray="4 4"
                    label={{
                      value: `Min ${selectedItem.minLevel.toLocaleString()}`,
                      position: 'insideTopRight',
                      fill: '#b45309',
                      fontSize: 11,
                    }}
                  />
                )}
                {orderByChartLabel && (
                  <ReferenceLine
                    x={orderByChartLabel}
                    stroke="#dc2626"
                    strokeDasharray="3 3"
                    label={{
                      value: 'Order By',
                      position: 'top',
                      fill: '#b91c1c',
                      fontSize: 11,
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="projectedOnHand"
                  stroke="#047857"
                  strokeWidth={2.25}
                  fill="url(#stockProjGrad)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Low-Stock & Order-By Projection Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                filterMode === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Ingredients ({projection.items.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('low_only')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                filterMode === 'low_only'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Low-Stock &amp; At-Risk ({projection.lowStockItemCount})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Filter projected ingredients"
              placeholder="Filter ingredient, dish, or supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2.5 py-1.5 text-xs focus:bg-white focus:border-emerald-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table data-testid="inventory-projection-table" className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-3 font-semibold">Ingredient</th>
                <th className="py-2 pr-3 font-semibold text-right">On Hand / Min</th>
                <th className="py-2 pr-3 font-semibold text-right">Projected Burn</th>
                <th className="py-2 pr-3 font-semibold text-right">Est. Depletion</th>
                <th className="py-2 pr-3 font-semibold">Order By Date</th>
                <th className="py-2 pr-3 font-semibold text-right">Suggested Order</th>
                <th className="py-2 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    <div>No ingredients match your current projection filter.</div>
                    {(filterMode !== 'all' || searchQuery) && (
                      <button
                        type="button"
                        onClick={() => {
                          setFilterMode('all');
                          setSearchQuery('');
                        }}
                        className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Show all ingredients
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                visibleItems.map((item) => {
                  const isSelected = selectedItem?.ingredientId === item.ingredientId;
                  return (
                    <tr
                      key={item.ingredientId}
                      onClick={() => setSelectedIngId(item.ingredientId)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-emerald-50/70'
                          : item.orderByStatus === 'overdue'
                            ? 'bg-red-50/35 hover:bg-red-50/60'
                            : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-slate-900">{item.ingredientName}</div>
                        <div className="text-[11px] text-slate-500">
                          {item.nameKh}
                          {item.supplierName ? ` · ${item.supplierName}` : ''}
                        </div>
                        {item.openPoIncomingQty > 0 && (
                          <div className="text-[11px] font-medium text-emerald-800 tabular-nums">
                            Incoming PO: +{item.openPoIncomingQty.toLocaleString()} {item.unit}
                            {item.openPoExpectedDate ? ` (ETA ${item.openPoExpectedDate})` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        <div
                          className={`font-semibold ${
                            item.onHand <= item.minLevel ? 'text-red-700' : 'text-slate-900'
                          }`}
                        >
                          {item.onHand.toLocaleString()} {item.unit}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Min {item.minLevel.toLocaleString()} {item.unit}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        <div className="font-medium text-slate-900">
                          {item.projectedDailyBurn > 0
                            ? `${item.projectedDailyBurn.toLocaleString()} ${item.unit}/d`
                            : 'Minimal'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {item.observedUsed7d.toLocaleString()} {item.unit} / 7d
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        <div className="font-bold text-slate-900">
                          {item.daysUntilDepletion !== null
                            ? `${item.daysUntilDepletion.toFixed(1)}d`
                            : '—'}
                        </div>
                        <div className="text-[11px] text-slate-500 inline-flex items-center justify-end gap-1">
                          <CalendarClock className="h-3 w-3 shrink-0" />
                          <span>{item.predictedDepletionDate}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums">
                        <div className={orderByStatusTextClass(item.orderByStatus)}>
                          {item.orderByDate ? (
                            item.daysUntilOrderBy === 0 ? (
                              <>Order today ({item.orderByDate})</>
                            ) : (
                              <>By {item.orderByDate}</>
                            )
                          ) : (
                            'No order needed'
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {orderByStatusLabel(item.orderByStatus)}
                          {item.daysUntilOrderBy !== null && item.daysUntilOrderBy > 0
                            ? ` · in ${item.daysUntilOrderBy}d`
                            : ''}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {item.suggestedReorderQty > 0 ? (
                          <div>
                            <div className="font-semibold text-slate-900">
                              {item.suggestedPacks} × {item.purchaseUnit}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              +{item.suggestedReorderQty.toLocaleString()} {item.unit} · ~$
                              {item.estimatedOrderCostUsd.toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">Sufficient</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        {onRestockIngredient && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRestockIngredient(
                                item.ingredientId,
                                item.suggestedReorderQty > 0
                                  ? item.suggestedReorderQty
                                  : item.purchaseUnitSize
                              );
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                          >
                            <PackagePlus className="h-3 w-3" />
                            Restock
                          </button>
                        )}
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
  );
}
