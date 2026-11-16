import { useState } from 'react';
import { ArrowLeft, Monitor, CheckCircle2 } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { usdToKhr } from '../utils/posMath';
import { generateBakongKhqrPayload, isMerchantKhqrConfigured } from '../utils/bakongKhqr';
import { QrCodeBox } from './QrCodeBox';

export function CustomerDisplayView() {
  const { state, activeBranch, setExternalMode } = usePos();
  const [paired, setPaired] = useState(true);
  const [codeInput, setCodeInput] = useState('');
  const [pairError, setPairError] = useState('');

  const activeOrder = state.displayActiveOrderId
    ? state.orders.find((o) => o.id === state.displayActiveOrderId && o.status !== 'paid')
    : null;

  const preparingOrders = state.orders.filter(
    (o) => o.branchId === activeBranch.id && (o.status === 'sent' || o.status === 'cooking')
  );
  const readyOrders = state.orders.filter(
    (o) => o.branchId === activeBranch.id && o.status === 'ready'
  );

  const featuredBestSellers = state.menuItems
    .filter((m) => m.branchId === activeBranch.id && m.active && m.isBestSeller)
    .slice(0, 4);

  const handlePair = (e: React.FormEvent) => {
    e.preventDefault();
    if (codeInput.trim() === activeBranch.displayPairingCode || codeInput.trim() === '000000') {
      setPaired(true);
      setPairError('');
    } else {
      setPairError(`Invalid code. Use pairing code ${activeBranch.displayPairingCode}.`);
    }
  };

  if (!paired) {
    return (
      <div className="min-h-screen bg-[#08382D] flex items-center justify-center p-6 text-white">
        <form
          onSubmit={handlePair}
          className="w-full max-w-sm rounded-2xl bg-white text-slate-900 p-6 shadow-xl space-y-4"
        >
          <div className="flex items-center gap-2 text-emerald-900 font-bold">
            <Monitor className="h-5 w-5" />
            <span>Pair Customer Display (/display)</span>
          </div>
          <p className="text-xs text-slate-600">
            Enter the 6-digit pairing code shown in Settings → Customer display (demo code:{' '}
            <strong className="font-mono">{activeBranch.displayPairingCode}</strong>).
          </p>
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="6-digit code"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-lg tracking-widest"
          />
          {pairError && <p className="text-xs text-red-600">{pairError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setExternalMode('pos')}
              className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-semibold"
            >
              Back
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg bg-emerald-800 py-2 text-xs font-semibold text-white"
            >
              Pair screen
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6F5] flex flex-col">
      <header className="bg-[#0A3D31] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExternalMode('pos')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to POS
          </button>
          <div>
            <div className="text-base font-bold">{activeBranch.name}</div>
            <div className="text-xs text-emerald-200">
              Customer Display · Pairing code {activeBranch.displayPairingCode}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPaired(false)}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-white/10"
        >
          Change pairing
        </button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-6">
        {/* Left: Active Order or Featured Menu */}
        <section className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
          {activeOrder && activeOrder.items.length > 0 ? (
            <>
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Your Order · {activeOrder.tableName}</h2>
                    <p className="text-xs text-slate-500">Order #{activeOrder.orderNumber}</p>
                  </div>
                  <span className="text-xs font-mono text-slate-500">
                    1 USD = {activeBranch.exchangeRate.toLocaleString()} ៛
                  </span>
                </div>

                <div className="space-y-3">
                  {activeOrder.items
                    .filter((i) => !i.voided)
                    .map((line) => (
                      <div key={line.id} className="flex items-center justify-between text-sm">
                        <div>
                          <div className="font-semibold text-slate-900">
                            {line.qty}× {line.nameEn}
                          </div>
                          <div className="text-xs text-slate-500">{line.nameKh}</div>
                        </div>
                        <div className="text-right tabular-nums font-bold text-slate-900">
                          ${(line.unitPriceUsd * line.qty).toFixed(2)}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div className="tabular-nums">
                  <div className="text-xs text-slate-500">Total due</div>
                  <div className="text-4xl font-extrabold text-emerald-900">
                    ${activeOrder.totalUsd.toFixed(2)}
                  </div>
                  <div className="text-lg font-bold text-amber-700">
                    {usdToKhr(
                      activeOrder.totalUsd,
                      activeBranch.exchangeRate,
                      activeBranch.rielRounding
                    ).toLocaleString()}{' '}
                    ៛
                  </div>
                </div>

                {isMerchantKhqrConfigured(activeBranch.khqrBakongId) ? (
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <QrCodeBox
                      value={
                        generateBakongKhqrPayload({
                          accountType: activeBranch.khqrAccountType || 'individual',
                          bakongAccountId: activeBranch.khqrBakongId.trim(),
                          merchantId: activeBranch.khqrMerchantId,
                          acquiringBank: activeBranch.khqrAcquiringBank,
                          merchantName: activeBranch.khqrAccountName || activeBranch.name,
                          merchantCity: activeBranch.khqrCity || 'Phnom Penh',
                          currency: activeBranch.khqrDefaultCurrency || 'USD',
                          amount:
                            (activeBranch.khqrDefaultCurrency || 'USD') === 'KHR'
                              ? usdToKhr(
                                  activeOrder.totalUsd,
                                  activeBranch.exchangeRate,
                                  activeBranch.rielRounding
                                )
                              : activeOrder.totalUsd,
                          billNumber: `ORD-${activeOrder.orderNumber}`,
                          storeLabel: activeBranch.code,
                          terminalLabel: 'DISP1',
                          mcc: activeBranch.khqrMcc || '5812',
                        }).qrString
                      }
                      size={110}
                      label="KHQR scan to pay"
                    />
                    <div className="text-xs text-slate-600 max-w-[145px]">
                      <div className="font-bold text-red-700">Scan Bakong KHQR</div>
                      <div className="text-[10px] font-mono text-slate-500 truncate">
                        {activeBranch.khqrBakongId}
                      </div>
                      <p className="mt-1">Bakong, ABA, ACLEDA &amp; Wing apps accepted</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                    <div className="font-bold text-slate-900">Pay at Counter</div>
                    <p className="mt-0.5">Cash, Card &amp; Bank transfer accepted</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div>
              <h2 className="text-xl font-bold text-slate-900">Best sellers today</h2>
              <p className="text-xs text-slate-500 mb-4">
                សួស្តី! Popular dishes &amp; drinks at {activeBranch.name}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {featuredBestSellers.map((dish) => (
                  <div
                    key={dish.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"
                  >
                    {dish.imageUrl ? (
                      <img
                        src={dish.imageUrl}
                        alt={dish.nameEn}
                        referrerPolicy="no-referrer"
                        className="h-16 w-16 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-lg bg-amber-50 flex items-center justify-center font-bold text-amber-800 shrink-0">
                        {dish.initials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">{dish.nameEn}</div>
                      <div className="text-xs text-slate-500 truncate">{dish.nameKh}</div>
                      <div className="mt-1 text-sm font-bold text-emerald-800 tabular-nums">
                        ${dish.priceUsd.toFixed(2)} ·{' '}
                        {usdToKhr(
                          dish.priceUsd,
                          activeBranch.exchangeRate,
                          activeBranch.rielRounding
                        ).toLocaleString()}{' '}
                        ៛
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Right: Preparing vs Ready to Collect Number Board */}
        <section className="lg:col-span-5 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-bold text-slate-700 border-b border-slate-100 pb-2 mb-3">
              Preparing
            </h3>
            <div className="space-y-2">
              {preparingOrders.length === 0 ? (
                <p className="text-xs text-slate-400">All orders served</p>
              ) : (
                preparingOrders.map((o) => (
                  <div
                    key={o.id}
                    className="rounded-lg bg-slate-100 px-3 py-2 text-lg font-bold font-mono text-slate-800 tabular-nums"
                  >
                    #{o.orderNumber} <span className="text-xs font-sans font-normal text-slate-500">{o.tableName}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-950 text-white p-5">
            <h3 className="text-sm font-bold text-emerald-200 border-b border-emerald-800 pb-2 mb-3 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Ready to collect
            </h3>
            <div className="space-y-2.5">
              {readyOrders.length === 0 ? (
                <p className="text-xs text-emerald-300/70">Waiting for next order</p>
              ) : (
                readyOrders.map((o) => (
                  <div
                    key={o.id}
                    className="rounded-xl bg-emerald-600 px-4 py-3 text-2xl font-extrabold font-mono text-white tabular-nums"
                  >
                    #{o.orderNumber}
                    <div className="text-xs font-sans font-medium text-emerald-100">{o.tableName}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
