import React, { useMemo, useState } from 'react';
import {
  Wallet,
  Banknote,
  Receipt,
  TrendingUp,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Printer,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import { calculateDrawerReconciliation, roundCurrency, usdToKhr } from '../utils/posMath';
import { AiForecastWidget } from './AiForecastWidget';

const USD_DENOMS = [100, 50, 20, 10, 5, 1] as const;
const KHR_DENOMS = [100000, 50000, 20000, 10000, 5000, 1000, 500] as const;

export function TodaysMoneyView() {
  const {
    state,
    activeBranch,
    setNavSection,
    setActiveOrderId,
    setSelectedTableId,
    setReceiptOrder,
  } = usePos();

  const branchOrders = useMemo(
    () => state.orders.filter((o) => o.branchId === activeBranch.id),
    [state.orders, activeBranch.id]
  );

  const paidOrders = useMemo(
    () => branchOrders.filter((o) => o.status === 'paid'),
    [branchOrders]
  );

  const unpaidOrders = useMemo(
    () => branchOrders.filter((o) => o.status !== 'paid' && o.status !== 'voided'),
    [branchOrders]
  );

  const currentShift = state.shifts.find(
    (s) => s.branchId === activeBranch.id && s.status === 'open'
  );

  const totalCollectedUsd = roundCurrency(paidOrders.reduce((s, o) => s + o.totalUsd, 0));
  const totalCollectedKhr = usdToKhr(
    totalCollectedUsd,
    activeBranch.exchangeRate,
    activeBranch.rielRounding
  );

  const paymentBreakdown = useMemo(() => {
    const map: Record<string, number> = {
      Cash: 0,
      KHQR: 0,
      'Bank transfer': 0,
      Card: 0,
      Split: 0,
    };
    paidOrders.forEach((o) => {
      const m = o.paymentMethod || 'Cash';
      map[m] = roundCurrency((map[m] || 0) + o.totalUsd);
    });
    return Object.entries(map).filter(([, v]) => v > 0);
  }, [paidOrders]);

  const bestSellers = useMemo(() => {
    const counts = new Map<string, { name: string; qty: number; rev: number }>();
    paidOrders.forEach((o) => {
      o.items
        .filter((i) => !i.voided)
        .forEach((i) => {
          const prev = counts.get(i.menuItemId) || { name: i.nameEn, qty: 0, rev: 0 };
          counts.set(i.menuItemId, {
            name: i.nameEn,
            qty: prev.qty + i.qty,
            rev: roundCurrency(prev.rev + i.unitPriceUsd * i.qty),
          });
        });
    });
    return Array.from(counts.values())
      .sort((a, b) => b.rev - a.rev)
      .slice(0, 6);
  }, [paidOrders]);

  const openOrderInSell = (orderId: string, tableId?: string) => {
    setSelectedTableId(tableId || null);
    setActiveOrderId(orderId);
    setNavSection('sell');
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Today&apos;s money</h1>
          <p className="text-xs text-slate-500">
            Live cash &amp; digital takings for {activeBranch.name} · 1$ ={' '}
            {activeBranch.exchangeRate.toLocaleString()} ៛
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setNavSection('shift_drawer')}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Open Shift &amp; Drawer
          </button>
          <button
            type="button"
            onClick={() => setNavSection('sell')}
            className="rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
          >
            Back to Sell
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Collected today</span>
            <Wallet className="h-4 w-4 text-emerald-700" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            ${totalCollectedUsd.toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 tabular-nums mt-0.5">
            {totalCollectedKhr.toLocaleString()} ៛ · {paidOrders.length} paid bills
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Expected in cash drawer</span>
            <Banknote className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            ${(currentShift?.expectedUsd ?? 0).toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 tabular-nums mt-0.5">
            + {(currentShift?.expectedKhr ?? 0).toLocaleString()} ៛{' '}
            {currentShift ? '(Shift open)' : '(No open shift)'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Unpaid open bills</span>
            <Receipt className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            ${roundCurrency(unpaidOrders.reduce((s, o) => s + o.totalUsd, 0)).toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 tabular-nums mt-0.5">
            {unpaidOrders.length} active tables / orders
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Average bill</span>
            <TrendingUp className="h-4 w-4 text-emerald-700" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            $
            {paidOrders.length > 0
              ? (totalCollectedUsd / paidOrders.length).toFixed(2)
              : '0.00'}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Incl. VAT &amp; service</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Payment Method Breakdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Payment methods</h2>
          {paymentBreakdown.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No paid bills yet today.</p>
          ) : (
            <div className="space-y-3">
              {paymentBreakdown.map(([method, amount]) => {
                const pct =
                  totalCollectedUsd > 0 ? Math.round((amount / totalCollectedUsd) * 100) : 0;
                return (
                  <div key={method} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">{method}</span>
                      <span className="tabular-nums text-slate-700 font-semibold">
                        ${amount.toFixed(2)} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-700"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <h3 className="text-sm font-bold text-slate-900 mt-6 mb-3">Top selling dishes</h3>
          <div className="space-y-2">
            {bestSellers.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between text-xs border-b border-slate-100 pb-1.5"
              >
                <span className="text-slate-800 truncate pr-2">
                  {item.name} <span className="text-slate-400">×{item.qty}</span>
                </span>
                <span className="font-semibold tabular-nums text-slate-900">
                  ${item.rev.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Unpaid Open Orders + Recent Paid Bills */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900">
                Unpaid orders ({unpaidOrders.length})
              </h2>
              <span className="text-xs text-slate-500">Click any order to resume or pay</span>
            </div>
            {unpaidOrders.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">All orders are settled.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {unpaidOrders.map((ord) => (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => openOrderInSell(ord.id, ord.tableId)}
                    className="rounded-lg border border-slate-200 p-3 text-left hover:border-emerald-500 hover:bg-emerald-50/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        #{ord.orderNumber} · {ord.tableName}
                      </span>
                      <span className="text-xs font-bold text-emerald-800 tabular-nums">
                        ${ord.totalUsd.toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>
                        {ord.items.filter((i) => !i.voided).length} items · {ord.status}
                      </span>
                      <span className="tabular-nums">
                        {ord.totalKhr.toLocaleString()} ៛
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900 mb-3">
              Recent paid bills ({paidOrders.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Bill #</th>
                    <th className="py-2 pr-3 font-semibold">Table / Channel</th>
                    <th className="py-2 pr-3 font-semibold">Method</th>
                    <th className="py-2 pr-3 font-semibold text-right">USD</th>
                    <th className="py-2 pr-3 font-semibold text-right">KHR</th>
                    <th className="py-2 font-semibold text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paidOrders.slice(0, 8).map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="py-2 pr-3 font-mono font-semibold">#{o.orderNumber}</td>
                      <td className="py-2 pr-3">{o.tableName}</td>
                      <td className="py-2 pr-3">{o.paymentMethod || 'Cash'}</td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                        ${o.totalUsd.toFixed(2)}
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-500 tabular-nums">
                        {o.totalKhr.toLocaleString()} ៛
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setReceiptOrder(o)}
                          className="text-emerald-800 font-semibold hover:underline"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <AiForecastWidget />
    </div>
  );
}

export function ShiftDrawerView() {
  const { state, activeBranch, activeStaff, openShift, addPettyCash, closeShift } = usePos();

  const branchShifts = state.shifts.filter((s) => s.branchId === activeBranch.id);
  const currentShift = branchShifts.find((s) => s.status === 'open');

  // Open shift form
  const [openingUsd, setOpeningUsd] = useState('100');
  const [openingKhr, setOpeningKhr] = useState('400000');

  // Petty cash form
  const [pettyType, setPettyType] = useState<'in' | 'out'>('out');
  const [pettyCurrency, setPettyCurrency] = useState<'USD' | 'KHR'>('USD');
  const [pettyAmount, setPettyAmount] = useState('');
  const [pettyNote, setPettyNote] = useState('');

  // Close shift denomination counter
  const [usdCounts, setUsdCounts] = useState<Record<number, number>>({
    100: 0,
    50: 1,
    20: 2,
    10: 1,
    5: 0,
    1: 0,
  });
  const [khrCounts, setKhrCounts] = useState<Record<number, number>>({
    100000: 1,
    50000: 4,
    20000: 5,
    10000: 0,
    5000: 0,
    1000: 0,
    500: 0,
  });
  const [managerPin, setManagerPin] = useState('');
  const [closeFeedback, setCloseFeedback] = useState('');

  const countedUsd = useMemo(
    () => USD_DENOMS.reduce((sum, d) => sum + d * (usdCounts[d] || 0), 0),
    [usdCounts]
  );
  const countedKhr = useMemo(
    () => KHR_DENOMS.reduce((sum, d) => sum + d * (khrCounts[d] || 0), 0),
    [khrCounts]
  );

  const recon = useMemo(() => {
    if (!currentShift) return null;
    return calculateDrawerReconciliation({
      openingUsd: currentShift.openingUsd,
      openingKhr: currentShift.openingKhr,
      cashPaidUsd: Math.max(0, currentShift.expectedUsd - currentShift.openingUsd),
      cashPaidKhr: Math.max(0, currentShift.expectedKhr - currentShift.openingKhr),
      cashChangeUsd: 0,
      cashChangeKhr: 0,
      pettyCashInUsd: 0,
      pettyCashOutUsd: 0,
      pettyCashInKhr: 0,
      pettyCashOutKhr: 0,
      countedUsd,
      countedKhr,
    });
  }, [currentShift, countedUsd, countedKhr]);

  const needsManagerPin =
    recon !== null && Math.abs(recon.varianceUsd) > activeBranch.varianceLimitUsd;

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    openShift(Math.max(0, Number(openingUsd) || 0), Math.max(0, Number(openingKhr) || 0));
    setCloseFeedback('');
  };

  const handlePettyCash = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(pettyAmount);
    if (!amt || amt <= 0) return;
    addPettyCash({
      type: pettyType,
      currency: pettyCurrency,
      amount: amt,
      note: pettyNote.trim() || (pettyType === 'out' ? 'Petty expense' : 'Float top-up'),
    });
    setPettyAmount('');
    setPettyNote('');
  };

  const handleCloseShift = () => {
    const ok = closeShift(countedUsd, countedKhr, managerPin);
    if (!ok) {
      setCloseFeedback(
        `Variance exceeds $${activeBranch.varianceLimitUsd}. Enter owner/manager PIN (1111 or 2222) to approve.`
      );
    } else {
      setManagerPin('');
      setCloseFeedback('Shift closed and Z-report recorded.');
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Shift &amp; cash drawer</h1>
          <p className="text-xs text-slate-500">
            Dual USD / KHR cash float, petty cash, denomination counter, and Z-report
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-semibold ${
              currentShift
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {currentShift ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {currentShift ? `Open · ${currentShift.cashierName}` : 'Shift closed'}
          </span>
        </div>
      </div>

      {closeFeedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
          <span>{closeFeedback}</span>
        </div>
      )}

      {!currentShift ? (
        <form
          onSubmit={handleOpenShift}
          className="rounded-xl border border-slate-200 bg-white p-6 max-w-lg space-y-4"
        >
          <div className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Clock className="h-5 w-5 text-emerald-800" />
            <span>Open new shift drawer</span>
          </div>
          <p className="text-xs text-slate-500">
            Count your starting float in both USD and Khmer Riel before taking cash orders.
            Cashier: <strong>{activeStaff.name}</strong>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="open-usd" className="block text-xs font-semibold text-slate-700 mb-1">
                Opening Float (USD)
              </label>
              <input
                id="open-usd"
                type="number"
                step="0.01"
                value={openingUsd}
                onChange={(e) => setOpeningUsd(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="open-khr" className="block text-xs font-semibold text-slate-700 mb-1">
                Opening Float (KHR ៛)
              </label>
              <input
                id="open-khr"
                type="number"
                step="100"
                value={openingKhr}
                onChange={(e) => setOpeningKhr(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900"
          >
            Open Shift Now
          </button>
        </form>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: Shift Summary & Petty Cash */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Active shift ledger</h2>
              <div className="space-y-1.5 text-xs tabular-nums">
                <div className="flex justify-between text-slate-600">
                  <span>Opened at</span>
                  <span>{new Date(currentShift.openedAt).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Opening float</span>
                  <span>
                    ${currentShift.openingUsd.toFixed(2)} +{' '}
                    {currentShift.openingKhr.toLocaleString()} ៛
                  </span>
                </div>
                {!activeBranch.blindClose ? (
                  <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-100">
                    <span>Expected in drawer</span>
                    <span>
                      ${currentShift.expectedUsd.toFixed(2)} +{' '}
                      {currentShift.expectedKhr.toLocaleString()} ៛
                    </span>
                  </div>
                ) : (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-900">
                    Blind close enabled: expected totals hidden until Z-report is submitted.
                  </div>
                )}
              </div>
            </div>

            {/* Petty Cash In/Out */}
            <form
              onSubmit={handlePettyCash}
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
            >
              <h2 className="text-sm font-bold text-slate-900">Petty cash in / out</h2>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPettyType('out')}
                  className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 text-xs font-semibold ${
                    pettyType === 'out'
                      ? 'border-red-300 bg-red-50 text-red-800'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <ArrowUpRight className="h-3.5 w-3.5" /> Cash Out
                </button>
                <button
                  type="button"
                  onClick={() => setPettyType('in')}
                  className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 text-xs font-semibold ${
                    pettyType === 'in'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <ArrowDownLeft className="h-3.5 w-3.5" /> Cash In
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select
                  aria-label="Petty cash currency"
                  value={pettyCurrency}
                  onChange={(e) => setPettyCurrency(e.target.value as 'USD' | 'KHR')}
                  className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold"
                >
                  <option value="USD">USD ($)</option>
                  <option value="KHR">KHR (៛)</option>
                </select>
                <input
                  type="number"
                  step="any"
                  value={pettyAmount}
                  onChange={(e) => setPettyAmount(e.target.value)}
                  placeholder="Amount"
                  className="col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-xs tabular-nums"
                />
              </div>
              <input
                type="text"
                value={pettyNote}
                onChange={(e) => setPettyNote(e.target.value)}
                placeholder="Reason (e.g. Ice delivery, TukTuk)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Record Petty Cash
              </button>

              {currentShift.pettyCash.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-1.5 max-h-40 overflow-y-auto">
                  {currentShift.pettyCash.map((pc) => (
                    <div key={pc.id} className="flex justify-between text-[11px] text-slate-600">
                      <span>
                        {pc.type === 'out' ? '−' : '+'} {pc.note}
                      </span>
                      <span className="font-mono font-semibold tabular-nums">
                        {pc.currency === 'USD'
                          ? `$${pc.amount.toFixed(2)}`
                          : `${pc.amount.toLocaleString()} ៛`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </form>
          </div>

          {/* Right: Denomination Counter & Close Shift */}
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                Count drawer &amp; close shift (Z-report)
              </h2>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Printer className="h-3.5 w-3.5" /> Print Z-Report
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* USD Notes */}
              <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-800 border-b border-slate-100 pb-1.5">
                  <span>USD Notes</span>
                  <span className="tabular-nums text-emerald-800">${countedUsd.toFixed(2)}</span>
                </div>
                {USD_DENOMS.map((d) => (
                  <div key={d} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-semibold w-14">${d}</span>
                    <input
                      type="number"
                      min={0}
                      aria-label={`Count of $${d} bills`}
                      value={usdCounts[d] ?? 0}
                      onChange={(e) =>
                        setUsdCounts((prev) => ({
                          ...prev,
                          [d]: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      className="w-20 rounded border border-slate-300 px-2 py-1 text-right tabular-nums"
                    />
                    <span className="w-20 text-right tabular-nums text-slate-600">
                      ${(d * (usdCounts[d] || 0)).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {/* KHR Notes */}
              <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-800 border-b border-slate-100 pb-1.5">
                  <span>KHR Notes (៛)</span>
                  <span className="tabular-nums text-emerald-800">
                    {countedKhr.toLocaleString()} ៛
                  </span>
                </div>
                {KHR_DENOMS.map((d) => (
                  <div key={d} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-semibold w-20">{d.toLocaleString()} ៛</span>
                    <input
                      type="number"
                      min={0}
                      aria-label={`Count of ${d} Riel notes`}
                      value={khrCounts[d] ?? 0}
                      onChange={(e) =>
                        setKhrCounts((prev) => ({
                          ...prev,
                          [d]: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      className="w-20 rounded border border-slate-300 px-2 py-1 text-right tabular-nums"
                    />
                    <span className="w-24 text-right tabular-nums text-slate-600">
                      {(d * (khrCounts[d] || 0)).toLocaleString()} ៛
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {recon && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3 text-xs tabular-nums">
                <div>
                  <span className="text-slate-500">Counted total:</span>{' '}
                  <strong className="text-slate-900">
                    ${countedUsd.toFixed(2)} + {countedKhr.toLocaleString()} ៛
                  </strong>
                </div>
                {!activeBranch.blindClose && (
                  <div
                    className={`font-semibold ${
                      Math.abs(recon.varianceUsd) > activeBranch.varianceLimitUsd
                        ? 'text-red-700'
                        : 'text-emerald-800'
                    }`}
                  >
                    Variance: {recon.varianceUsd >= 0 ? '+' : ''}
                    ${recon.varianceUsd.toFixed(2)} ({recon.varianceKhr >= 0 ? '+' : ''}
                    {recon.varianceKhr.toLocaleString()} ៛)
                  </div>
                )}
              </div>
            )}

            {needsManagerPin && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
                  <span>
                    Variance exceeds ${activeBranch.varianceLimitUsd}. Manager PIN required (1111 or
                    2222):
                  </span>
                </div>
                <input
                  type="password"
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  placeholder="Manager PIN"
                  className="w-32 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCloseShift}
                className="rounded-lg bg-emerald-800 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-900"
              >
                Close Shift &amp; Save Z-Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Closed Shift History */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-900 mb-3">Shift history</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-3 font-semibold">Cashier</th>
                <th className="py-2 pr-3 font-semibold">Opened</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold text-right">Expected USD</th>
                <th className="py-2 pr-3 font-semibold text-right">Counted USD</th>
                <th className="py-2 font-semibold text-right">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branchShifts.map((s) => (
                <tr key={s.id}>
                  <td className="py-2 pr-3 font-medium">{s.cashierName}</td>
                  <td className="py-2 pr-3 text-slate-500">
                    {new Date(s.openedAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                        s.status === 'open'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">${s.expectedUsd.toFixed(2)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {s.status === 'closed' ? `$${s.countedUsd.toFixed(2)}` : '—'}
                  </td>
                  <td
                    className={`py-2 text-right font-semibold tabular-nums ${
                      Math.abs(s.varianceUsd) > 1 ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {s.status === 'closed'
                      ? `${s.varianceUsd >= 0 ? '+' : ''}$${s.varianceUsd.toFixed(2)}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
