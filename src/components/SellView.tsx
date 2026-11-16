import { useEffect, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Minus,
  Send,
  Utensils,
  Grid,
  Users,
  ArrowRightLeft,
  Scissors,
  Trash2,
  Calendar,
  ShoppingCart,
  X,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import { I18N } from '../data/i18n';
import type { MenuItem, OrderChannel } from '../types/pos';
import { calculateOrderTotals, usdToKhr } from '../utils/posMath';
import { PayModal } from './PayModal';

const QUICK_NOTES = ['No ice', 'Less ice', 'Less sugar', 'Less spicy', 'No onion', 'Serve first'];

export function SellView() {
  const {
    state,
    activeBranch,
    language,
    selectedTableId,
    activeOrderId,
    setActiveOrderId,
    setSelectedTableId,
    openTableOrder,
    createTakeAwayOrder,
    addItemToOrder,
    updateOrderItemQty,
    updateOrderItemNote,
    clearDraftItems,
    sendOrderToKitchen,
    voidOrderItem,
    setOrderGuests,
    cancelEmptyOrder,
    voidOrder,
    moveOrderToTable,
    splitOrderItems,
  } = usePos();

  const t = I18N[language];
  const [subTab, setSubTab] = useState<'tables' | 'menu'>('tables');
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [voidOrderModalOpen, setVoidOrderModalOpen] = useState(false);
  const [voidOrderReason, setVoidOrderReason] = useState('Customer cancelled');
  const [tableFilter, setTableFilter] = useState<'all' | 'occupied' | 'free'>('all');
  const [areaFilter, setAreaFilter] = useState<string>('Indoor');
  const [typeFilter, setTypeFilter] = useState<'all' | 'product' | 'service'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [editingLineNoteId, setEditingLineNoteId] = useState<string | null>(null);
  const [optionItem, setOptionItem] = useState<MenuItem | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitLineIds, setSplitLineIds] = useState<string[]>([]);
  const [voidModalLineId, setVoidModalLineId] = useState<string | null>(null);
  const [voidPin, setVoidPin] = useState('');
  const [voidError, setVoidError] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);

  const branchTables = state.tables.filter((tb) => tb.branchId === activeBranch.id);
  const branchMenu = state.menuItems.filter((m) => m.branchId === activeBranch.id && m.active);
  const categories = ['All', ...Array.from(new Set(branchMenu.map((m) => m.category)))];

  const activeOrder = state.orders.find(
    (o) => o.id === activeOrderId && o.status !== 'paid' && o.status !== 'voided'
  );

  // Keyboard shortcuts F2 search, F3 send to kitchen, F9 pay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setSubTab('menu');
        setTimeout(() => searchInputRef.current?.focus(), 20);
      } else if (e.key === 'F3' && activeOrder) {
        e.preventDefault();
        sendOrderToKitchen(activeOrder.id);
      } else if (e.key === 'F9' && activeOrder && activeOrder.items.length > 0) {
        e.preventDefault();
        setPayModalOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeOrder, sendOrderToKitchen]);

  const handleSelectTable = (tableId: string) => {
    openTableOrder(tableId);
    setSubTab('menu');
  };

  const handleCreateTakeAway = (channel: OrderChannel) => {
    createTakeAwayOrder(channel);
    setSubTab('menu');
  };

  const handleDishClick = (item: MenuItem) => {
    let targetOrderId = activeOrder?.id;
    if (!targetOrderId) {
      targetOrderId = createTakeAwayOrder('take_away');
    }
    if (item.options && item.options.length > 0) {
      setOptionItem(item);
      return;
    }
    addItemToOrder(targetOrderId, item);
  };

  const draftItems = activeOrder ? activeOrder.items.filter((i) => !i.sentToKitchen && !i.voided) : [];
  const sentItems = activeOrder ? activeOrder.items.filter((i) => i.sentToKitchen && !i.voided) : [];

  const totals = activeOrder
    ? calculateOrderTotals({
        items: activeOrder.items,
        exchangeRate: activeBranch.exchangeRate,
        rielRounding: activeBranch.rielRounding,
        vatPercent: activeBranch.vatPercent,
        serviceChargePercent: activeBranch.serviceChargePercent,
        manualDiscountPercent: activeOrder.manualDiscountPercent,
        manualDiscountUsd: activeOrder.manualDiscountUsd,
        promoDiscountUsd: activeOrder.promoDiscountUsd,
        pointsRedeemed: activeOrder.pointsRedeemed,
        pointsValuePer100: activeBranch.pointsValuePer100,
        depositAppliedUsd: activeOrder.depositAppliedUsd,
      })
    : null;

  // "Often ordered with" suggestions (Page 8)
  const suggestedIds = new Set<string>();
  activeOrder?.items.forEach((l) => {
    const m = branchMenu.find((mi) => mi.id === l.menuItemId);
    m?.oftenOrderedWith?.forEach((sid) => suggestedIds.add(sid));
  });
  const suggestions = branchMenu.filter(
    (m) => suggestedIds.has(m.id) && !activeOrder?.items.some((l) => l.menuItemId === m.id)
  );

  const filteredMenu = branchMenu.filter((item) => {
    const itemType = item.itemType === 'service' ? 'service' : 'product';
    const typeOk = typeFilter === 'all' || itemType === typeFilter;
    const catOk = categoryFilter === 'All' || item.category === categoryFilter;
    const q = searchQuery.trim().toLowerCase();
    const searchOk =
      !q ||
      item.nameEn.toLowerCase().includes(q) ||
      item.nameKh.toLowerCase().includes(q) ||
      item.nameVi.toLowerCase().includes(q);
    return typeOk && catOk && searchOk;
  });

  const areas = ['Indoor', 'Garden', 'Bar counter', 'Take-away'];
  const visibleTables = branchTables.filter((tb) => {
    const areaOk = tb.area === areaFilter;
    const statusOk =
      tableFilter === 'all' ||
      (tableFilter === 'free' && tb.status === 'free') ||
      (tableFilter === 'occupied' && tb.status !== 'free');
    return areaOk && statusOk;
  });

  const openTakeAwayOrders = state.orders.filter(
    (o) =>
      o.branchId === activeBranch.id &&
      !o.tableId &&
      o.status !== 'paid' &&
      o.status !== 'voided'
  );

  const getDishName = (item: MenuItem) => {
    if (language === 'kh' && item.nameKh) return item.nameKh;
    if (language === 'vi' && item.nameVi) return item.nameVi;
    return item.nameEn;
  };

  return (
    <div className="h-full min-h-0 flex flex-col lg:flex-row overflow-hidden">
      {/* Left Workspace: Tables or Menu */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col p-4 gap-3 overflow-hidden">
        {/* Top Sub-switcher + Search */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setSubTab('tables')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                  subTab === 'tables' ? 'bg-[#0A3D31] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Grid className="h-3.5 w-3.5" />
                <span>
                  {t.tables} {branchTables.filter((tb) => tb.status !== 'free').length}/{branchTables.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSubTab('menu')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                  subTab === 'menu' ? 'bg-[#0A3D31] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Utensils className="h-3.5 w-3.5" />
                <span>{t.menu}</span>
              </button>
            </div>
          </div>

          {subTab === 'menu' ? (
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchDishes}
                className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
              />
            </div>
          ) : (
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
              {(['all', 'occupied', 'free'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTableFilter(f)}
                  className={`px-3 py-1 rounded-md capitalize ${
                    tableFilter === f ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* TABLES VIEW */}
        {subTab === 'tables' && (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-3">
            {/* Area tabs + Quick Takeaway channels */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {areas.map((area) => {
                  const countInArea = branchTables.filter((tb) => tb.area === area);
                  const busyInArea = countInArea.filter((tb) => tb.status !== 'free').length;
                  return (
                    <button
                      key={area}
                      type="button"
                      onClick={() => setAreaFilter(area)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors ${
                        areaFilter === area
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {area === 'Take-away'
                        ? `Take-away · Delivery (${openTakeAwayOrders.length})`
                        : `${area} ${busyInArea}/${countInArea.length}`}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCreateTakeAway('take_away')}
                  className="rounded-lg bg-[#0B5D47] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#094A38]"
                >
                  {t.takeAwayOrder}
                </button>
                <button
                  type="button"
                  onClick={() => handleCreateTakeAway('grab')}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                >
                  + Grab
                </button>
                <button
                  type="button"
                  onClick={() => handleCreateTakeAway('foodpanda')}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100"
                >
                  + foodpanda
                </button>
              </div>
            </div>

            {areaFilter === 'Take-away' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {openTakeAwayOrders.length === 0 ? (
                  <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">
                    No open take-away or delivery orders. Tap <strong>+ Take-away order</strong> to start.
                  </div>
                ) : (
                  openTakeAwayOrders.map((ord) => (
                    <button
                      key={ord.id}
                      type="button"
                      onClick={() => {
                        setSelectedTableId(null);
                        setActiveOrderId(ord.id);
                        setSubTab('menu');
                      }}
                      className="rounded-xl bg-[#0B5D47] text-white p-4 text-left hover:bg-[#094A38] transition-colors flex flex-col justify-between min-h-[116px]"
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="truncate">{ord.tableName}</span>
                        <span className="uppercase text-[10px] text-emerald-200">{ord.status}</span>
                      </div>
                      <div className="mt-4 flex items-baseline justify-between tabular-nums">
                        <span className="text-[11px] text-emerald-200">{ord.items.length} items</span>
                        <span className="text-base font-bold">${ord.totalUsd.toFixed(2)}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {visibleTables.map((tb) => {
                  const ord = tb.currentOrderId
                    ? state.orders.find((o) => o.id === tb.currentOrderId)
                    : undefined;
                  const elapsedMin = tb.openedAt
                    ? Math.max(1, Math.round((Date.now() - new Date(tb.openedAt).getTime()) / 60000))
                    : 0;
                  const upcomingRes = state.reservations.find(
                    (r) =>
                      r.branchId === activeBranch.id &&
                      r.tableId === tb.id &&
                      (r.status === 'confirmed' || r.status === 'pending')
                  );
                  const isBusy = tb.status !== 'free';

                  return (
                    <button
                      key={tb.id}
                      type="button"
                      onClick={() => handleSelectTable(tb.id)}
                      className={`rounded-xl p-3.5 text-left transition-all flex flex-col justify-between min-h-[118px] border ${
                        isBusy
                          ? 'bg-[#0B5D47] border-[#0A4D3B] text-white hover:bg-[#094D3B]'
                          : 'bg-white border-slate-200 text-slate-900 hover:border-emerald-700'
                      } ${selectedTableId === tb.id ? 'ring-2 ring-amber-400' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-bold">{tb.name}</span>
                        {isBusy ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-100 tabular-nums">
                            <Users className="h-3 w-3" />
                            {tb.guests || tb.seats} · {elapsedMin}m
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">{tb.seats} seats</span>
                        )}
                      </div>

                      <div className="my-2 space-y-1">
                        {tb.status === 'ready' && (
                          <span className="inline-block rounded bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                            {t.readyToServe}
                          </span>
                        )}
                        {isBusy && elapsedMin >= activeBranch.kdsLateMinutes && (
                          <span className="inline-block rounded bg-red-500/85 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            Late {elapsedMin}m
                          </span>
                        )}
                        {!isBusy && upcomingRes && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                            <Calendar className="h-3 w-3" />
                            {upcomingRes.dateTime.slice(11, 16)} · {upcomingRes.guests}g
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline justify-between text-xs tabular-nums">
                        <span className={isBusy ? 'text-emerald-200' : 'text-slate-400'}>
                          {isBusy ? `#${ord?.orderNumber || ''}` : t.free}
                        </span>
                        {isBusy && ord && (
                          <span className="text-sm font-bold text-white">${ord.totalUsd.toFixed(2)}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* MENU VIEW */}
        {subTab === 'menu' && (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-3">
            {/* Item Type Filter + Categories */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
                {(['all', 'product', 'service'] as const).map((tf) => {
                  const count =
                    tf === 'all'
                      ? branchMenu.length
                      : branchMenu.filter((m) => (m.itemType === 'service' ? 'service' : 'product') === tf).length;
                  return (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setTypeFilter(tf)}
                      className={`rounded-md px-2.5 py-1 transition-colors ${
                        typeFilter === tf
                          ? 'bg-[#0A3D31] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tf === 'all' ? 'All' : tf === 'product' ? 'Products' : 'Services'}{' '}
                      <span className="tabular-nums opacity-75">({count})</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      categoryFilter === cat
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {cat === 'All' ? `${t.all} ${branchMenu.length}` : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Dish Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredMenu.map((item) => {
                const qtyInCart =
                  activeOrder?.items
                    .filter((l) => l.menuItemId === item.id && !l.voided)
                    .reduce((s, l) => s + l.qty, 0) || 0;
                const priceKhr = usdToKhr(
                  item.priceUsd,
                  activeBranch.exchangeRate,
                  activeBranch.rielRounding
                );
                const isService = item.itemType === 'service';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleDishClick(item)}
                    className={`relative rounded-xl border bg-white p-3 text-left transition-all hover:border-emerald-700 flex flex-col justify-between ${
                      qtyInCart > 0 ? 'border-amber-400 ring-1 ring-amber-300' : 'border-slate-200'
                    }`}
                  >
                    {qtyInCart > 0 && (
                      <span className="absolute left-2.5 top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white tabular-nums">
                        {qtyInCart}
                      </span>
                    )}
                    <div className="flex justify-end text-[10px] font-semibold capitalize">
                      {isService ? (
                        <span className="text-amber-700">Service</span>
                      ) : (
                        <span className="text-slate-400">{item.station}</span>
                      )}
                    </div>

                    <div className="my-2 flex justify-center">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.nameEn}
                          referrerPolicy="no-referrer"
                          className="h-20 w-20 rounded-full object-cover border border-slate-100"
                        />
                      ) : (
                        <div className="h-20 w-20 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-lg font-bold text-amber-800">
                          {item.initials}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-slate-900 line-clamp-2 min-h-[2rem]">
                        {getDishName(item)}
                      </div>
                      <div className="mt-1.5 flex items-baseline justify-between tabular-nums">
                        <span className="text-sm font-bold text-slate-900">
                          ${item.priceUsd.toFixed(2)}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {priceKhr.toLocaleString()} ៛
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Mobile Cart Bar (< lg) */}
      {activeOrder && !mobileCartOpen && (
        <div className="lg:hidden fixed bottom-14 inset-x-3 z-30">
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            className="w-full flex items-center justify-between rounded-xl bg-[#0A3D31] text-white px-4 py-3 shadow-xl border border-emerald-500/30"
          >
            <div className="flex items-center gap-2.5">
              <ShoppingCart className="h-4 w-4 text-amber-300" />
              <span className="text-xs font-bold">
                {activeOrder.tableName} · #{activeOrder.orderNumber} (
                {activeOrder.items.filter((i) => !i.voided).reduce((s, i) => s + i.qty, 0)} items)
              </span>
            </div>
            <span className="text-sm font-extrabold tabular-nums">
              ${activeOrder.totalUsd.toFixed(2)} →
            </span>
          </button>
        </div>
      )}

      {/* Right Order Ticket Panel */}
      <aside
        className={`${
          mobileCartOpen
            ? 'fixed inset-0 z-40 flex'
            : 'hidden lg:flex'
        } w-full lg:w-[370px] shrink-0 min-h-0 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white flex-col overflow-hidden`}
      >
        {!activeOrder ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <Utensils className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">No table selected</h3>
            <p className="mt-1 text-xs text-slate-500">
              Tap a table on the floor plan or start a take-away order.
            </p>
            <button
              type="button"
              onClick={() => handleCreateTakeAway('take_away')}
              className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              {t.takeAwayOrder}
            </button>
          </div>
        ) : (
          <>
            {/* Ticket Header */}
            <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-slate-900">{activeOrder.tableName}</span>
                  <span className="text-xs text-slate-500 font-mono">#{activeOrder.orderNumber}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                  <span>
                    {activeOrder.items.some((i) => i.sentToKitchen)
                      ? `Round ${activeOrder.currentRound}`
                      : 'Draft ticket'}
                  </span>
                  <span>·</span>
                  <div className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5">
                    <Users className="h-3 w-3 text-slate-500" />
                    <button
                      type="button"
                      onClick={() => setOrderGuests(activeOrder.id, activeOrder.guests - 1)}
                      className="px-1 font-bold text-slate-600 hover:text-slate-900"
                    >
                      −
                    </button>
                    <span className="font-semibold text-slate-800 tabular-nums">
                      {activeOrder.guests}g
                    </span>
                    <button
                      type="button"
                      onClick={() => setOrderGuests(activeOrder.id, activeOrder.guests + 1)}
                      className="px-1 font-bold text-slate-600 hover:text-slate-900"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {!activeOrder.items.some((i) => i.sentToKitchen && !i.voided) ? (
                  <button
                    type="button"
                    onClick={() => {
                      cancelEmptyOrder(activeOrder.id);
                      setMobileCartOpen(false);
                    }}
                    title="Cancel empty draft & release table"
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                  >
                    Release
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setVoidPin('');
                      setVoidError('');
                      setVoidOrderModalOpen(true);
                    }}
                    title="Void entire order (Manager PIN)"
                    className="rounded-lg border border-red-200 bg-red-50/70 p-1.5 text-red-700 hover:bg-red-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {activeOrder.tableId && (
                  <button
                    type="button"
                    onClick={() => setMoveModalOpen(true)}
                    title="Move table"
                    aria-label="Move table"
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                  </button>
                )}
                {activeOrder.items.filter((i) => !i.voided).length >= 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSplitLineIds([]);
                      setSplitModalOpen(true);
                    }}
                    title="Split bill"
                    aria-label="Split bill"
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
                  >
                    <Scissors className="h-3.5 w-3.5" />
                  </button>
                )}
                {mobileCartOpen && (
                  <button
                    type="button"
                    onClick={() => setMobileCartOpen(false)}
                    aria-label="Close mobile cart"
                    className="lg:hidden rounded-lg border border-slate-200 p-1.5 text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Ticket Lines */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {/* Draft (Not Sent) Items */}
              {draftItems.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold tracking-wide text-amber-700">
                      {t.newDishesNotSent}
                    </span>
                    <button
                      type="button"
                      onClick={() => clearDraftItems(activeOrder.id)}
                      className="text-[11px] text-slate-500 hover:text-red-600"
                    >
                      {t.clearAll}
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {draftItems.map((line) => (
                      <div key={line.id} className="rounded-lg border border-slate-200 p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingLineNoteId(editingLineNoteId === line.id ? null : line.id)
                            }
                            className="text-left min-w-0"
                          >
                            <div className="text-xs font-semibold text-slate-900">
                              {line.nameEn}
                              {line.optionLabel ? ` (${line.optionLabel})` : ''}
                            </div>
                            <div className="text-[11px] text-emerald-700">
                              {line.note ? `Note: ${line.note}` : 'Tap to add a note'}
                            </div>
                          </button>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              aria-label={`Decrease ${line.nameEn}`}
                              onClick={() => updateOrderItemQty(activeOrder.id, line.id, -1)}
                              className="h-6 w-6 rounded border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-5 text-center text-xs font-bold tabular-nums">
                              {line.qty}
                            </span>
                            <button
                              type="button"
                              aria-label={`Increase ${line.nameEn}`}
                              onClick={() => updateOrderItemQty(activeOrder.id, line.id, 1)}
                              className="h-6 w-6 rounded border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                            <span className="w-12 text-right text-xs font-bold tabular-nums">
                              ${(line.unitPriceUsd * line.qty).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {editingLineNoteId === line.id && (
                          <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5">
                            <div className="flex flex-wrap gap-1">
                              {QUICK_NOTES.map((qn) => (
                                <button
                                  key={qn}
                                  type="button"
                                  onClick={() => updateOrderItemNote(activeOrder.id, line.id, qn)}
                                  className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100"
                                >
                                  {qn}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              value={line.note || ''}
                              onChange={(e) =>
                                updateOrderItemNote(activeOrder.id, line.id, e.target.value)
                              }
                              placeholder="Other note..."
                              className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Already Sent Items */}
              {sentItems.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold tracking-wide text-slate-500 mb-2">
                    SENT TO KITCHEN / BAR
                  </div>
                  <div className="space-y-1.5">
                    {sentItems.map((line) => (
                      <div
                        key={line.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800">
                            <span className="tabular-nums font-bold">{line.qty}×</span> {line.nameEn}
                            {line.orderedBy ? ` (${line.orderedBy})` : ''}
                          </div>
                          <div className="text-[10px] text-slate-500 capitalize">
                            Round {line.round} · {line.kdsStatus}
                            {line.note ? ` · ${line.note}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-semibold tabular-nums">
                            ${(line.unitPriceUsd * line.qty).toFixed(2)}
                          </span>
                          <button
                            type="button"
                            aria-label={`Void ${line.nameEn}`}
                            onClick={() => {
                              setVoidModalLineId(line.id);
                              setVoidPin('');
                              setVoidError('');
                            }}
                            className="text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Often ordered with suggestions */}
              {suggestions.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5">
                  <div className="text-[11px] font-semibold text-amber-900 mb-1.5">
                    Often ordered with
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.slice(0, 3).map((sg) => (
                      <button
                        key={sg.id}
                        type="button"
                        onClick={() => addItemToOrder(activeOrder.id, sg)}
                        className="rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 hover:bg-amber-100"
                      >
                        + {sg.nameEn} <span className="tabular-nums text-emerald-800">${sg.priceUsd.toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Ticket Footer */}
            {totals && (
              <div className="border-t border-slate-200 p-4 bg-slate-50/60 space-y-3">
                <div className="flex items-baseline justify-between tabular-nums">
                  <span className="text-sm font-semibold text-slate-700">{t.total}</span>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-slate-900">${totals.totalUsd.toFixed(2)}</div>
                    <div className="text-xs text-slate-500">= {totals.totalKhr.toLocaleString()} ៛</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={draftItems.length === 0}
                    onClick={() => sendOrderToKitchen(activeOrder.id)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-45"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>
                      {t.sendToKitchen} ({draftItems.reduce((s, i) => s + i.qty, 0)}) · F3
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={activeOrder.items.filter((i) => !i.voided).length === 0}
                    onClick={() => setPayModalOpen(true)}
                    className="rounded-xl bg-[#0B5D47] px-3 py-2.5 text-xs font-bold text-white hover:bg-[#094A38] disabled:opacity-45 tabular-nums"
                  >
                    {t.pay} ${totals.totalUsd.toFixed(2)} · F9
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </aside>

      {/* Option Selector Modal */}
      {optionItem && activeOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Choose options for ${optionItem.nameEn}`}
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-slate-900">{optionItem.nameEn}</h3>
            {optionItem.options?.map((grp) => (
              <div key={grp.name} className="space-y-2">
                <div className="text-xs font-semibold text-slate-600">{grp.name}</div>
                <div className="grid grid-cols-2 gap-2">
                  {grp.choices.map((ch) => (
                    <button
                      key={ch.label}
                      type="button"
                      onClick={() => {
                        addItemToOrder(activeOrder.id, optionItem, ch.label, ch.deltaUsd);
                        setOptionItem(null);
                      }}
                      className="rounded-lg border border-slate-200 p-2.5 text-left hover:border-emerald-700 hover:bg-emerald-50"
                    >
                      <div className="text-xs font-semibold text-slate-900">{ch.label}</div>
                      <div className="text-[11px] text-emerald-800 tabular-nums">
                        ${(optionItem.priceUsd + ch.deltaUsd).toFixed(2)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setOptionItem(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Table Modal */}
      {moveModalOpen && activeOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Move order to another table"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-slate-900">Move {activeOrder.tableName} to free table</h3>
            <div className="grid grid-cols-3 gap-2">
              {branchTables
                .filter((tb) => tb.status === 'free')
                .map((tb) => (
                  <button
                    key={tb.id}
                    type="button"
                    onClick={() => {
                      moveOrderToTable(activeOrder.id, tb.id);
                      setMoveModalOpen(false);
                    }}
                    className="rounded-lg border border-slate-200 p-2.5 text-xs font-semibold hover:border-emerald-700 hover:bg-emerald-50"
                  >
                    {tb.name}
                  </button>
                ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setMoveModalOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Bill Modal */}
      {splitModalOpen && activeOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Split bill"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-slate-900">Select items to split into new bill</h3>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {activeOrder.items
                .filter((i) => !i.voided)
                .map((l) => {
                  const checked = splitLineIds.includes(l.id);
                  return (
                    <label
                      key={l.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-2.5 text-xs cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSplitLineIds((prev) =>
                              checked ? prev.filter((x) => x !== l.id) : [...prev, l.id]
                            )
                          }
                        />
                        <span>
                          {l.qty}× {l.nameEn}
                        </span>
                      </span>
                      <span className="tabular-nums font-semibold">
                        ${(l.unitPriceUsd * l.qty).toFixed(2)}
                      </span>
                    </label>
                  );
                })}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSplitModalOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={splitLineIds.length === 0}
                onClick={() => {
                  splitOrderItems(activeOrder.id, splitLineIds);
                  setSplitModalOpen(false);
                }}
                className="rounded-lg bg-emerald-800 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-45"
              >
                Create split bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Item Manager PIN Modal */}
      {voidModalLineId && activeOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Void sent item"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-slate-900">Manager PIN required to void</h3>
            <input
              type="password"
              value={voidPin}
              onChange={(e) => setVoidPin(e.target.value)}
              placeholder="Manager PIN (e.g. 2222)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
            {voidError && <p className="text-xs text-red-600">{voidError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidModalLineId(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const ok = voidOrderItem(activeOrder.id, voidModalLineId, voidPin);
                  if (!ok) setVoidError('Invalid manager PIN');
                  else setVoidModalLineId(null);
                }}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white"
              >
                Void item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Entire Order Modal */}
      {voidOrderModalOpen && activeOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Void entire order"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-slate-900">
              Void Entire Order #{activeOrder.orderNumber}
            </h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason</label>
              <input
                type="text"
                value={voidOrderReason}
                onChange={(e) => setVoidOrderReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Manager / Owner PIN
              </label>
              <input
                type="password"
                value={voidPin}
                onChange={(e) => setVoidPin(e.target.value)}
                placeholder="e.g. 2222 or 1111"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            {voidError && <p className="text-xs text-red-600">{voidError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setVoidOrderModalOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const ok = voidOrder(activeOrder.id, voidOrderReason, voidPin);
                  if (!ok) setVoidError('Invalid Manager/Owner PIN');
                  else {
                    setVoidOrderModalOpen(false);
                    setMobileCartOpen(false);
                  }
                }}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white"
              >
                Void Entire Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Modal */}
      {payModalOpen && activeOrder && (
        <PayModal order={activeOrder} onClose={() => setPayModalOpen(false)} />
      )}
    </div>
  );
}
