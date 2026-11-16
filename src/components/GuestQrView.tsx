import { useState } from 'react';
import { ArrowLeft, Bell, Receipt, Plus, Minus, ShoppingBag, Users, CheckCircle2 } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { I18N } from '../data/i18n';
import type { LanguageCode, MenuItem } from '../types/pos';
import { usdToKhr } from '../utils/posMath';

export function GuestQrView() {
  const { state, activeBranch, language, setLanguage, submitGuestQrOrder, setExternalMode } = usePos();
  const t = I18N[language];
  const branchTables = state.tables.filter((tb) => tb.branchId === activeBranch.id);
  const [selectedTableId, setSelectedTableId] = useState<string>(branchTables[2]?.id || '');
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

  const getTitle = (m: MenuItem) =>
    language === 'kh' && m.nameKh ? m.nameKh : language === 'vi' && m.nameVi ? m.nameVi : m.nameEn;

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

        {/* Quick Table Switch + Call Staff / Ask for Bill */}
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-600">សួស្តី · Welcome! Scan, choose, send.</span>
            <select
              aria-label="Select QR table"
              value={selectedTableId}
              onChange={(e) => setSelectedTableId(e.target.value)}
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
              onClick={() => setServiceAlert('Staff notified for your table.')}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-2 text-slate-800 hover:bg-slate-100"
            >
              <Bell className="h-3.5 w-3.5 text-amber-600" />
              {t.callStaff}
            </button>
            <button
              type="button"
              onClick={() => setServiceAlert('Bill requested — cashier notified.')}
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

          {submittedNumber !== null && (
            <div className="rounded-xl bg-emerald-900 text-white p-3.5 flex items-center gap-2.5 text-xs">
              <CheckCircle2 className="h-5 w-5 text-emerald-300 shrink-0" />
              <div>
                <div className="font-bold">Order #{submittedNumber} sent!</div>
                <div className="text-emerald-100">
                  {activeBranch.qrMode === 'auto'
                    ? 'Sent directly to kitchen.'
                    : 'Waiting for cashier confirmation.'}
                </div>
              </div>
            </div>
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
