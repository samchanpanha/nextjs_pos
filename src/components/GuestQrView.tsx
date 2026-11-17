import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Receipt,
  Plus,
  Minus,
  ShoppingBag,
  Users,
  CheckCircle2,
  ChefHat,
  Clock,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import { I18N } from '../data/i18n';
import type { LanguageCode, MenuItem } from '../types/pos';
import { usdToKhr } from '../utils/posMath';
import { submitPublicServiceAlertToSqlite } from '../lib/sqliteClient';
import { resolveGuestOrderLiveStatus, type GuestOrderStage } from '../utils/guestOrderStatus';

const STAGE_COPY: Record<
  LanguageCode,
  {
    liveOrderStatus: string;
    syncedWithKds: string;
    awaitingConfirm: string;
    declinedTitle: string;
    declinedSubtitle: string;
    stages: { id: 'received' | 'preparing' | 'ready' | 'served'; label: string; hint: string }[];
  }
> = {
  en: {
    liveOrderStatus: 'Live Order Status',
    syncedWithKds: 'Synced with KDS',
    awaitingConfirm: 'Waiting for cashier confirmation',
    declinedTitle: 'Order could not be confirmed',
    declinedSubtitle: 'Please tap Call staff if you need help with your order.',
    stages: [
      { id: 'received', label: 'Received', hint: 'Sent to kitchen' },
      { id: 'preparing', label: 'Preparing', hint: 'Cooking now' },
      { id: 'ready', label: 'Ready', hint: 'Ready to serve' },
      { id: 'served', label: 'Served', hint: 'Enjoy your meal' },
    ],
  },
  kh: {
    liveOrderStatus: 'ស្ថានភាពការកម្ម៉ង់ផ្ទាល់',
    syncedWithKds: 'ភ្ជាប់ផ្ទាល់ជាមួយផ្ទះបាយ',
    awaitingConfirm: 'កំពុងរង់ចាំបុគ្គលិកបញ្ជាក់',
    declinedTitle: 'ការកម្ម៉ង់មិនត្រូវបានបញ្ជាក់ទេ',
    declinedSubtitle: 'សូមចុច ហៅបុគ្គលិក ប្រសិនបើត្រូវការជំនួយ។',
    stages: [
      { id: 'received', label: 'បានទទួល', hint: 'ផ្ញើទៅផ្ទះបាយ' },
      { id: 'preparing', label: 'កំពុងចម្អិន', hint: 'កំពុងរៀបចំ' },
      { id: 'ready', label: 'រួចរាល់', hint: 'រួចរាល់សម្រាប់បម្រើ' },
      { id: 'served', label: 'បានបម្រើ', hint: 'សូមពិសាដោយឆ្ងាញ់' },
    ],
  },
  vi: {
    liveOrderStatus: 'Trạng thái món trực tiếp',
    syncedWithKds: 'Đồng bộ với bếp KDS',
    awaitingConfirm: 'Đang chờ thu ngân xác nhận',
    declinedTitle: 'Đơn chưa được xác nhận',
    declinedSubtitle: 'Vui lòng nhấn Gọi nhân viên để được hỗ trợ.',
    stages: [
      { id: 'received', label: 'Đã nhận', hint: 'Đã gửi bếp' },
      { id: 'preparing', label: 'Đang làm', hint: 'Đang chế biến' },
      { id: 'ready', label: 'Sẵn sàng', hint: 'Sẵn sàng phục vụ' },
      { id: 'served', label: 'Đã lên món', hint: 'Chúc ngon miệng' },
    ],
  },
};

function stageIndex(stage: GuestOrderStage): number {
  switch (stage) {
    case 'received':
      return 0;
    case 'preparing':
      return 1;
    case 'ready':
      return 2;
    case 'served':
      return 3;
    default:
      return -1;
  }
}

export function GuestQrView() {
  const {
    state,
    activeTenantId,
    activeBranch,
    language,
    setLanguage,
    submitGuestQrOrder,
    setExternalMode,
  } = usePos();
  const t = I18N[language];
  const copy = STAGE_COPY[language];
  const branchTables = state.tables.filter((tb) => tb.branchId === activeBranch.id);
  const [selectedTableId, setSelectedTableId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get('table');
    if (tableParam) {
      if (tableParam.toLowerCase() === 'counter') return '';
      const match = branchTables.find(
        (tb) => tb.name.toLowerCase() === tableParam.toLowerCase() || tb.id === tableParam
      );
      if (match) return match.id;
    }
    return branchTables[2]?.id || branchTables[0]?.id || '';
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get('table');
    if (!tableParam) return;
    if (tableParam.toLowerCase() === 'counter') {
      setSelectedTableId('');
      return;
    }
    const match = branchTables.find(
      (tb) => tb.name.toLowerCase() === tableParam.toLowerCase() || tb.id === tableParam
    );
    if (match) setSelectedTableId(match.id);
  }, [activeBranch.id]);

  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState<{ item: MenuItem; qty: number }[]>([]);
  const [note, setNote] = useState('');
  const [phone, setPhone] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [submittedNumber, setSubmittedNumber] = useState<number | null>(null);
  const [serviceAlert, setServiceAlert] = useState('');

  const menu = state.menuItems.filter((m) => m.branchId === activeBranch.id && m.active);
  const categories = ['All', ...Array.from(new Set(menu.map((m) => m.category)))];
  const selectedTable = branchTables.find((tb) => tb.id === selectedTableId);

  const liveOrderStatus = useMemo(
    () =>
      resolveGuestOrderLiveStatus({
        branchId: activeBranch.id,
        selectedTableId: selectedTable?.id || '',
        selectedTableName: selectedTable ? selectedTable.name : 'Counter QR',
        orders: state.orders,
        qrQueue: state.qrQueue,
        submittedOrderNumber: submittedNumber,
      }),
    [
      activeBranch.id,
      selectedTable?.id,
      selectedTable?.name,
      state.orders,
      state.qrQueue,
      submittedNumber,
    ]
  );

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) return prev.map((c) => (c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c));
      return [...prev, { item, qty: 1 }];
    });
  };

  const updateCartQty = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.item.id === itemId ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0)
    );
  };

  const subtotal = cart.reduce((s, c) => s + c.item.priceUsd * c.qty, 0);
  const totalCount = cart.reduce((s, c) => s + c.qty, 0);

  const handleSendOrder = () => {
    if (cart.length === 0) return;
    const orderNo = submitGuestQrOrder({
      branchId: activeBranch.id,
      tableId: selectedTable?.id,
      tableName: selectedTable ? selectedTable.name : 'Counter QR',
      channel: selectedTable ? 'qr_table' : 'qr_counter',
      phone: phone.trim() || undefined,
      note: note.trim() || undefined,
      items: cart.map((c) => ({
        menuItemId: c.item.id,
        nameEn: c.item.nameEn,
        nameKh: c.item.nameKh,
        nameVi: c.item.nameVi,
        unitPriceUsd: c.item.priceUsd,
        qty: c.qty,
        station: c.item.station,
        category: c.item.category,
      })),
    });
    setSubmittedNumber(orderNo);
    setCart([]);
    setCartOpen(false);
  };

  const getTitle = (m: { nameEn: string; nameKh?: string; nameVi?: string }) =>
    language === 'kh' && m.nameKh ? m.nameKh : language === 'vi' && m.nameVi ? m.nameVi : m.nameEn;

  const activeStageIdx = liveOrderStatus ? stageIndex(liveOrderStatus.stage) : -1;

  return (
    <div className="min-h-screen bg-[#E9ECEA] py-4 px-3 flex justify-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden flex flex-col">
        {/* Header */}
        <header className="bg-[#0A3D31] text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExternalMode('pos')}
              aria-label="Back to POS"
              className="rounded-md bg-white/10 p-1.5 hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="text-sm font-bold">{activeBranch.name}</div>
              <div className="text-[11px] text-emerald-200">
                {selectedTable ? `Table ${selectedTable.name}` : 'Order at Counter'}
              </div>
            </div>
          </div>

          <div className="inline-flex rounded-md bg-black/25 p-0.5 text-[11px] font-semibold">
            {(['kh', 'en', 'vi'] as LanguageCode[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLanguage(l)}
                className={`px-2 py-0.5 rounded ${
                  language === l ? 'bg-amber-400 text-slate-900' : 'text-emerald-100'
                }`}
              >
                {l === 'kh' ? 'ខ្មែរ' : l.toUpperCase()}
              </button>
            ))}
          </div>
        </header>

        {/* Quick Table Switch + Call Staff / Ask for Bill + Live KDS Order Status */}
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-600">សួស្តី · Welcome! Scan, choose, send.</span>
            <select
              aria-label="Select QR table"
              value={selectedTableId}
              onChange={(e) => {
                setSelectedTableId(e.target.value);
                setSubmittedNumber(null);
              }}
              className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold"
            >
              <option value="">Counter Takeaway</option>
              {branchTables.map((tb) => (
                <option key={tb.id} value={tb.id}>
                  Table {tb.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setServiceAlert('Staff notified for your table.');
                void submitPublicServiceAlertToSqlite(activeTenantId, {
                  branchId: activeBranch.id,
                  tableName: selectedTable ? selectedTable.name : 'Counter QR',
                  alertType: 'call_staff',
                }).catch(() => undefined);
              }}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-2 text-slate-800 hover:bg-slate-100"
            >
              <Bell className="h-3.5 w-3.5 text-amber-600" />
              {t.callStaff}
            </button>
            <button
              type="button"
              onClick={() => {
                setServiceAlert('Bill requested — cashier notified.');
                void submitPublicServiceAlertToSqlite(activeTenantId, {
                  branchId: activeBranch.id,
                  tableName: selectedTable ? selectedTable.name : 'Counter QR',
                  alertType: 'ask_bill',
                }).catch(() => undefined);
              }}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-2 text-slate-800 hover:bg-slate-100"
            >
              <Receipt className="h-3.5 w-3.5 text-emerald-700" />
              {t.askForBill}
            </button>
            <button
              type="button"
              onClick={() => setExternalMode('group')}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 py-2 text-emerald-900 hover:bg-emerald-100"
            >
              <Users className="h-3.5 w-3.5" />
              Group link
            </button>
          </div>

          {serviceAlert && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-900">
              {serviceAlert}
            </div>
          )}

          {/* Real-Time KDS Order Status Indicator */}
          {liveOrderStatus && (
            <section
              aria-label="Live order status"
              data-testid="guest-order-status-tracker"
              className={`rounded-xl border p-3.5 space-y-3 ${
                liveOrderStatus.stage === 'declined'
                  ? 'border-red-200 bg-red-50/70'
                  : liveOrderStatus.stage === 'ready'
                    ? 'border-emerald-300 bg-emerald-50/80'
                    : 'border-slate-200 bg-slate-50/80'
              }`}
            >
              {liveOrderStatus.stage === 'declined' ? (
                <div className="flex items-start gap-2.5 text-xs">
                  <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-red-900">{copy.declinedTitle}</div>
                    <div className="text-red-700 mt-0.5">{copy.declinedSubtitle}</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex h-2 w-2 rounded-full bg-emerald-600 animate-pulse shrink-0" />
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {copy.liveOrderStatus}
                        {liveOrderStatus.orderNumber ? ` · #${liveOrderStatus.orderNumber}` : ''}
                      </span>
                    </div>
                    <span
                      data-testid="guest-order-current-stage"
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                        liveOrderStatus.stage === 'ready' || liveOrderStatus.stage === 'served'
                          ? 'bg-emerald-800 text-white'
                          : liveOrderStatus.stage === 'preparing'
                            ? 'bg-amber-500 text-white'
                            : 'bg-slate-800 text-white'
                      }`}
                    >
                      {copy.stages[Math.max(0, activeStageIdx)]?.label}
                    </span>
                  </div>

                  {/* 4-Step Visual Progress Bar */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {copy.stages.map((st, idx) => {
                      const isDone = idx < activeStageIdx;
                      const isCurrent = idx === activeStageIdx;
                      const StepIcon =
                        st.id === 'received'
                          ? Clock
                          : st.id === 'preparing'
                            ? ChefHat
                            : st.id === 'ready'
                              ? CheckCircle2
                              : UtensilsCrossed;
                      return (
                        <div key={st.id} className="space-y-1 text-center">
                          <div
                            className={`h-1.5 rounded-full transition-colors ${
                              isDone || isCurrent
                                ? st.id === 'preparing' && isCurrent
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-700'
                                : 'bg-slate-200'
                            }`}
                          />
                          <div
                            className={`inline-flex items-center justify-center gap-1 text-[11px] font-semibold ${
                              isCurrent
                                ? 'text-slate-900 font-bold'
                                : isDone
                                  ? 'text-emerald-800'
                                  : 'text-slate-400'
                            }`}
                          >
                            <StepIcon className="h-3 w-3 shrink-0" />
                            <span>{st.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Subtitle & Station Sync Info */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-slate-600">
                    <span>
                      {liveOrderStatus.awaitingConfirmation
                        ? copy.awaitingConfirm
                        : copy.stages[Math.max(0, activeStageIdx)]?.hint}
                    </span>
                    <span className="text-slate-500">{copy.syncedWithKds}</span>
                  </div>

                  {/* Tracked Items with per-item KDS badge */}
                  <div className="border-t border-slate-200/80 pt-2 space-y-1">
                    {liveOrderStatus.items.slice(0, 4).map((item) => {
                      const itemLabel =
                        copy.stages.find((s) => s.id === item.stage)?.label || item.stage;
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 text-[11px]"
                        >
                          <span className="text-slate-700 truncate">
                            <strong className="tabular-nums">{item.qty}×</strong> {getTitle(item)}
                          </span>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              item.stage === 'ready' || item.stage === 'served'
                                ? 'bg-emerald-100 text-emerald-900'
                                : item.stage === 'preparing'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {itemLabel}
                          </span>
                        </div>
                      );
                    })}
                    {liveOrderStatus.items.length > 4 && (
                      <div className="text-[10px] text-slate-400">
                        +{liveOrderStatus.items.length - 4} more items
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          )}
        </div>

        {/* Category Pills */}
        <div className="px-4 py-2.5 flex gap-1.5 overflow-x-auto border-b border-slate-100">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                category === cat ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Dish List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[430px]">
          {menu
            .filter((m) => category === 'All' || m.category === category)
            .map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.nameEn}
                      referrerPolicy="no-referrer"
                      className="h-14 w-14 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-lg bg-amber-50 flex items-center justify-center font-bold text-amber-800 shrink-0">
                      {item.initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1 mb-0.5">
                      {item.itemType === 'service' && (
                        <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                          Service
                        </span>
                      )}
                      {item.isBestSeller && (
                        <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                          Best seller
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-slate-900 truncate">{getTitle(item)}</div>
                    <div className="text-xs text-slate-500 truncate">{item.nameKh}</div>
                    <div className="mt-0.5 text-xs font-bold text-emerald-800 tabular-nums">
                      ${item.priceUsd.toFixed(2)}{' '}
                      <span className="text-slate-500 font-normal">
                        {usdToKhr(
                          item.priceUsd,
                          activeBranch.exchangeRate,
                          activeBranch.rielRounding
                        ).toLocaleString()}{' '}
                        ៛
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => addToCart(item)}
                  aria-label={`Add ${item.nameEn}`}
                  className="h-8 w-8 rounded-full bg-[#0A3D31] text-white flex items-center justify-center shrink-0 hover:bg-[#082E25]"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            ))}
        </div>

        {/* Sticky Cart Bar */}
        {totalCount > 0 && (
          <div className="border-t border-slate-200 bg-white p-4">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="w-full rounded-xl bg-[#0B5D47] py-3 px-4 text-sm font-bold text-white flex items-center justify-between tabular-nums"
            >
              <span className="inline-flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                Review cart ({totalCount})
              </span>
              <span>${subtotal.toFixed(2)}</span>
            </button>
          </div>
        )}

        {/* Cart Drawer Modal */}
        {cartOpen && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-3"
            role="dialog"
            aria-modal="true"
            aria-label="Your QR cart"
          >
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-base font-bold text-slate-900">
                  Your cart · {selectedTable ? `Table ${selectedTable.name}` : 'Counter'}
                </h3>
                <button
                  type="button"
                  onClick={() => setCartOpen(false)}
                  className="text-xs font-semibold text-slate-500"
                >
                  Close
                </button>
              </div>

              <div className="space-y-2 max-h-52 overflow-y-auto">
                {cart.map((c) => (
                  <div key={c.item.id} className="flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-900">{c.item.nameEn}</div>
                      <div className="text-slate-500 tabular-nums">${c.item.priceUsd.toFixed(2)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateCartQty(c.item.id, -1)}
                        className="h-6 w-6 rounded border border-slate-200 flex items-center justify-center"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-4 text-center font-bold tabular-nums">{c.qty}</span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(c.item.id, 1)}
                        className="h-6 w-6 rounded border border-slate-200 flex items-center justify-center"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note for the kitchen (e.g. no onion, less spicy)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number for loyalty points (optional)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />

              <button
                type="button"
                onClick={handleSendOrder}
                className="w-full rounded-xl bg-[#0B5D47] py-3 text-sm font-bold text-white hover:bg-[#094A38] tabular-nums"
              >
                {t.sendOrder} · ${subtotal.toFixed(2)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
