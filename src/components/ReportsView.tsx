import React, { useMemo, useState } from 'react';
import { Sparkles, Calendar, Send, Clock, Receipt } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { roundCurrency, usdToKhr } from '../utils/posMath';
import { summarizeLoyaltyProgram } from '../utils/loyaltyQr';
import { summarizeLoyaltyExpiry, EXPIRY_WARNING_WINDOW_DAYS } from '../utils/loyaltyExpiry';
import { AiForecastWidget } from './AiForecastWidget';
import { ReportsSalesTrendChart } from './ReportsSalesTrendChart';

type ReportTab =
  | 'overview'
  | 'details'
  | 'ai'
  | 'forecast'
  | 'shifts'
  | 'telegram'
  | 'loyalty';

export function ReportsView() {
  const { state, activeBranch, language, setReceiptOrder } = usePos();
  const [tab, setTab] = useState<ReportTab>('overview');

  // AI owner assistant
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    {
      role: 'assistant',
      text: `Ask anything about ${activeBranch.name}'s revenue, top dishes, KHQR vs Cash mix, or weekly pace.`,
    },
  ]);
  const [aiLoading, setAiLoading] = useState(false);

  // Telegram test send
  const [telegramSending, setTelegramSending] = useState(false);
  const [telegramResult, setTelegramResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const paidOrders = useMemo(
    () => state.orders.filter((o) => o.branchId === activeBranch.id && o.status === 'paid'),
    [state.orders, activeBranch.id]
  );

  const todayTotalUsd = roundCurrency(paidOrders.reduce((s, o) => s + o.totalUsd, 0));
  const avgBillUsd = paidOrders.length > 0 ? roundCurrency(todayTotalUsd / paidOrders.length) : 0;

  const paymentBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    paidOrders.forEach((o) => {
      const m = o.paymentMethod || 'Cash';
      map[m] = roundCurrency((map[m] || 0) + o.totalUsd);
    });
    return map;
  }, [paidOrders]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    paidOrders.forEach((o) => {
      o.items
        .filter((i) => !i.voided)
        .forEach((i) => {
          map.set(i.category, roundCurrency((map.get(i.category) || 0) + i.unitPriceUsd * i.qty));
        });
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [paidOrders]);

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenueUsd: number }>();
    paidOrders.forEach((o) => {
      o.items
        .filter((i) => !i.voided)
        .forEach((i) => {
          const prev = map.get(i.menuItemId) || { name: i.nameEn, qty: 0, revenueUsd: 0 };
          map.set(i.menuItemId, {
            name: i.nameEn,
            qty: prev.qty + i.qty,
            revenueUsd: roundCurrency(prev.revenueUsd + i.unitPriceUsd * i.qty),
          });
        });
    });
    return Array.from(map.values()).sort((a, b) => b.revenueUsd - a.revenueUsd);
  }, [paidOrders]);

  const branchIngredients = useMemo(
    () => state.ingredients.filter((i) => i.branchId === activeBranch.id),
    [state.ingredients, activeBranch.id]
  );

  const loyaltyReport = useMemo(
    () =>
      summarizeLoyaltyProgram({
        members: state.members,
        pointsValuePer100: activeBranch.pointsValuePer100,
      }),
    [state.members, activeBranch.pointsValuePer100]
  );

  const loyaltyExpiry = useMemo(
    () =>
      summarizeLoyaltyExpiry(state.members, {
        referenceDate: new Date().toISOString().slice(0, 10),
        windowDays: EXPIRY_WARNING_WINDOW_DAYS,
      }),
    [state.members]
  );

  const topMembers = useMemo(
    () => [...state.members].sort((a, b) => b.points - a.points).slice(0, 8),
    [state.members]
  );

  const procurementSummary = useMemo(() => {
    const pos = (state.purchaseOrders || []).filter((p) => p.branchId === activeBranch.id);
    const openPos = pos.filter(
      (p) => p.status === 'draft' || p.status === 'sent' || p.status === 'partial'
    );
    const openApUsd = roundCurrency(openPos.reduce((s, p) => s + (p.balanceDueUsd || 0), 0));
    const lowStock = branchIngredients.filter((i) => i.onHand <= i.minLevel).length;
    const cutoffMs = Date.now() - 7 * 86_400_000;
    const waste7dUsd = roundCurrency(
      state.stockHistory
        .filter((h) => h.type === 'waste' && Date.parse(h.createdAt) >= cutoffMs)
        .reduce((s, h) => {
          const ing = branchIngredients.find((i) => i.id === h.ingredientId);
          return s + Math.abs(h.qtyDelta) * (ing?.avgCostUsd || 0);
        }, 0)
    );
    return { openPoCount: openPos.length, openApUsd, lowStock, waste7dUsd };
  }, [state.purchaseOrders, state.stockHistory, branchIngredients, activeBranch.id]);

  const recent7Days = useMemo(
    () => state.dailyRevenueHistory.slice(-7),
    [state.dailyRevenueHistory]
  );

  const forecastRows = useMemo(() => {
    const avgBase =
      state.dailyRevenueHistory.reduce((s, d) => s + d.netSalesUsd, 0) /
      Math.max(1, state.dailyRevenueHistory.length);
    const holidays: Record<number, { label: string; factor: number }> = {
      2: { label: 'Weekend brunch surge', factor: 1.22 },
      5: { label: 'Water Festival (Bon Om Touk)', factor: 1.38 },
      6: { label: 'Water Festival Day 2', factor: 1.42 },
      11: { label: 'Independence Day holiday', factor: 1.28 },
    };
    return Array.from({ length: 14 }, (_, idx) => {
      const d = new Date(Date.now() + (idx + 1) * 86400000);
      const h = holidays[idx];
      const factor = h ? h.factor : idx % 7 === 5 || idx % 7 === 6 ? 1.15 : 0.96;
      const projectedUsd = roundCurrency(avgBase * factor);
      return {
        date: d.toISOString().slice(0, 10),
        projectedUsd,
        projectedKhr: usdToKhr(projectedUsd, activeBranch.exchangeRate, activeBranch.rielRounding),
        event: h?.label || 'Normal trading day',
      };
    });
  }, [state.dailyRevenueHistory, activeBranch.exchangeRate, activeBranch.rielRounding]);

  const askOwnerAssistant = async (promptText?: string) => {
    const q = (promptText ?? question).trim();
    if (!q || aiLoading) return;
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    if (!promptText) setQuestion('');
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          language,
          branchSummary: {
            branchName: activeBranch.name,
            todayNetSalesUsd: todayTotalUsd,
            todayBillsCount: paidOrders.length,
            avgBillUsd,
            paymentBreakdown,
            topItems: topItems.slice(0, 5),
            weeklyDailyHistory: state.dailyRevenueHistory,
          },
        }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: data.answer || data.error || 'No response available.' },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Unable to reach analytics service right now.' },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Reports &amp; owner analytics</h1>
          <p className="text-xs text-slate-500">
            Daily revenue, category mix, 14-day Khmer holiday forecast, and AI assistant
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['overview', 'Overview'],
              ['details', 'Sales details'],
              ['ai', 'AI assistant'],
              ['forecast', '14-day forecast'],
              ['shifts', 'Shift history'],
              ['telegram', 'Telegram report'],
              ['loyalty', 'Loyalty & Restock'],
            ] as [ReportTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                tab === id
                  ? 'bg-emerald-800 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Today&apos;s collected revenue</div>
              <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                ${todayTotalUsd.toFixed(2)}
              </div>
              <div className="text-xs text-slate-500 tabular-nums">
                {usdToKhr(
                  todayTotalUsd,
                  activeBranch.exchangeRate,
                  activeBranch.rielRounding
                ).toLocaleString()}{' '}
                ៛
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">7-day cumulative sales</div>
              <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                $
                {roundCurrency(
                  recent7Days.reduce((s, d) => s + d.netSalesUsd, 0)
                ).toFixed(2)}
              </div>
              <div className="text-xs text-slate-500 tabular-nums">
                {recent7Days.reduce((s, d) => s + d.bills, 0)} total bills
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Paid bills today</div>
              <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                {paidOrders.length}
              </div>
              <div className="text-xs text-slate-500 tabular-nums">Avg ${avgBillUsd.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Top category</div>
              <div className="mt-1 text-lg font-bold text-emerald-800 truncate">
                {categoryBreakdown[0]?.[0] || 'Main dishes'}
              </div>
              <div className="text-xs text-slate-500 tabular-nums">
                ${(categoryBreakdown[0]?.[1] ?? 0).toFixed(2)} today
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            {/* Recharts 30-Day Line Chart + Peak Business Hours */}
            <div className="lg:col-span-2">
              <ReportsSalesTrendChart />
            </div>

            {/* Category & Best Sellers */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
              <h2 className="text-sm font-bold text-slate-900">By category today</h2>
              <div className="space-y-2.5">
                {categoryBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-500">No paid dishes yet today.</p>
                ) : (
                  categoryBreakdown.map(([cat, rev]) => {
                    const pct = todayTotalUsd > 0 ? Math.round((rev / todayTotalUsd) * 100) : 0;
                    return (
                      <div key={cat} className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="font-medium text-slate-800">{cat}</span>
                          <span className="font-semibold tabular-nums">${rev.toFixed(2)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-emerald-700 rounded-full"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <AiForecastWidget />
        </div>
      )}

      {tab === 'details' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Receipt className="h-4 w-4 text-emerald-800" />
            Paid sales ledger ({paidOrders.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Order</th>
                  <th className="py-2 pr-3 font-semibold">Table / Channel</th>
                  <th className="py-2 pr-3 font-semibold">Cashier</th>
                  <th className="py-2 pr-3 font-semibold">Method</th>
                  <th className="py-2 pr-3 font-semibold text-right">Total USD</th>
                  <th className="py-2 font-semibold text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paidOrders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2 pr-3 font-mono font-semibold">#{o.orderNumber}</td>
                    <td className="py-2 pr-3">{o.tableName}</td>
                    <td className="py-2 pr-3">{o.cashierName}</td>
                    <td className="py-2 pr-3">{o.paymentMethod || 'Cash'}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                      ${o.totalUsd.toFixed(2)}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setReceiptOrder(o)}
                        className="text-emerald-800 font-semibold hover:underline"
                      >
                        Print / View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'ai' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 max-w-3xl space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Sparkles className="h-4 w-4 text-emerald-700" />
            <span>AI for Owners — Instant Branch Q&amp;A</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              'What sold best today?',
              'How much cash vs KHQR did we collect?',
              'How does today compare to our 7-day average?',
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void askOwnerAssistant(q)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:border-emerald-200"
              >
                {q}
              </button>
            ))}
          </div>

          <div className="space-y-2.5 max-h-80 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-3">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`rounded-lg p-3 text-xs ${
                  m.role === 'user'
                    ? 'ml-10 bg-emerald-800 text-white'
                    : 'mr-10 bg-white border border-slate-200 text-slate-800'
                }`}
              >
                {m.text}
              </div>
            ))}
            {aiLoading && <div className="text-xs text-slate-500">Analyzing branch totals...</div>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void askOwnerAssistant();
            }}
            className="flex gap-2"
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask in English, Khmer, or Vietnamese..."
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={aiLoading}
              className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
            >
              Ask
            </button>
          </form>
        </div>
      )}

      {tab === 'forecast' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-emerald-800" />
            14-day revenue forecast (with Cambodian holidays)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Date</th>
                  <th className="py-2 pr-3 font-semibold">Calendar note</th>
                  <th className="py-2 pr-3 font-semibold text-right">Projected USD</th>
                  <th className="py-2 font-semibold text-right">Projected KHR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {forecastRows.map((row) => (
                  <tr key={row.date}>
                    <td className="py-2 pr-3 font-mono">{row.date}</td>
                    <td className="py-2 pr-3 font-medium text-slate-800">{row.event}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums text-emerald-800">
                      ${row.projectedUsd.toFixed(2)}
                    </td>
                    <td className="py-2 text-right text-slate-500 tabular-nums">
                      {row.projectedKhr.toLocaleString()} ៛
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'shifts' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-emerald-800" />
            Shift &amp; drawer history
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Cashier</th>
                  <th className="py-2 pr-3 font-semibold">Opened</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold text-right">Expected USD</th>
                  <th className="py-2 font-semibold text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.shifts
                  .filter((s) => s.branchId === activeBranch.id)
                  .map((s) => (
                    <tr key={s.id}>
                      <td className="py-2 pr-3 font-semibold">{s.cashierName}</td>
                      <td className="py-2 pr-3 text-slate-500">
                        {new Date(s.openedAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 capitalize">{s.status}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        ${s.expectedUsd.toFixed(2)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {s.status === 'closed' ? `$${s.varianceUsd.toFixed(2)}` : 'Open'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'telegram' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 max-w-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">End-of-day Telegram summary</h2>
            <span className="text-xs text-slate-500 font-mono">
              {activeBranch.telegramBotHandle || '@StorePosBot'} · {activeBranch.telegramScheduleTime || '22:30'}
            </span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs whitespace-pre-line text-slate-800">
            {`[${activeBranch.name}] Daily Close Summary\nPaid Bills: ${paidOrders.length}\nRevenue: $${todayTotalUsd.toFixed(2)} (${usdToKhr(todayTotalUsd, activeBranch.exchangeRate, activeBranch.rielRounding).toLocaleString()} ៛)\nTop Seller: ${topItems[0]?.name || 'N/A'}\nChannel: ${activeBranch.telegramChannel || 'Not configured'}`}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {telegramResult ? (
              <span
                className={`text-xs font-semibold ${
                  telegramResult.ok ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {telegramResult.msg}
              </span>
            ) : (
              <span className="text-xs text-slate-500">
                Scheduled nightly at {activeBranch.telegramScheduleTime || '22:30'}
              </span>
            )}
            <button
              type="button"
              disabled={telegramSending}
              onClick={async () => {
                setTelegramSending(true);
                setTelegramResult(null);
                const msgText = `[${activeBranch.name}] Daily Close Summary\nPaid Bills: ${paidOrders.length}\nRevenue: $${todayTotalUsd.toFixed(2)} (${usdToKhr(todayTotalUsd, activeBranch.exchangeRate, activeBranch.rielRounding).toLocaleString()} ៛)\nTop Seller: ${topItems[0]?.name || 'N/A'}`;
                try {
                  const res = await fetch('/api/telegram/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      channel: activeBranch.telegramChannel,
                      botHandle: activeBranch.telegramBotHandle,
                      branchName: activeBranch.name,
                      message: msgText,
                    }),
                  });
                  const data = (await res.json()) as { ok?: boolean; notice?: string; error?: string };
                  setTelegramResult({
                    ok: Boolean(res.ok && data.ok),
                    msg: data.notice || data.error || 'Dispatch complete.',
                  });
                } catch {
                  setTelegramResult({ ok: false, msg: 'Unable to reach /api/telegram/send.' });
                } finally {
                  setTelegramSending(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" /> {telegramSending ? 'Sending...' : 'Send Telegram Report Now'}
            </button>
          </div>
        </div>
      )}

      {tab === 'loyalty' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">Loyalty ROI — {activeBranch.name}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">Enrolled members</div>
                <div className="text-xl font-extrabold text-slate-900">{loyaltyReport.activeMembers}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {loyaltyReport.goldMembers} Gold · {loyaltyReport.silverMembers} Silver
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">Points outstanding</div>
                <div className="text-xl font-extrabold text-slate-900">
                  {loyaltyReport.totalPointsOutstanding.toLocaleString()}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  ≈ ${loyaltyReport.pointsOutstandingValueUsd.toFixed(2)} liability
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">Lifetime spend (members)</div>
                <div className="text-xl font-extrabold text-slate-900">
                  ${loyaltyReport.totalLifetimeSpendUsd.toFixed(2)}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {loyaltyReport.earningVisits} earning visits
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="text-[11px] text-amber-800">Expiring within {EXPIRY_WARNING_WINDOW_DAYS}d</div>
                <div className="text-xl font-extrabold text-amber-900">
                  {loyaltyExpiry.expiringPoints.toLocaleString()} pts
                </div>
                <div className="mt-0.5 text-[11px] text-amber-700">
                  {loyaltyExpiry.affectedMembers} member(s)
                  {loyaltyExpiry.nextExpiryDate ? ` · next ${loyaltyExpiry.nextExpiryDate}` : ''}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Member</th>
                    <th className="py-2 px-3 font-semibold text-right">Tier</th>
                    <th className="py-2 px-3 font-semibold text-right">Points</th>
                    <th className="py-2 px-3 font-semibold text-right">Lifetime spend</th>
                    <th className="py-2 px-3 font-semibold text-right">Expiring ≤{EXPIRY_WARNING_WINDOW_DAYS}d</th>
                  </tr>
                </thead>
                <tbody>
                  {topMembers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-3 px-3 text-slate-500">
                        No enrolled members yet.
                      </td>
                    </tr>
                  ) : (
                    topMembers.map((m) => {
                      const exp = loyaltyExpiry.rows.find((r) => r.memberId === m.id);
                      return (
                        <tr key={m.id} className="border-t border-slate-100">
                          <td className="py-2 px-3 font-medium text-slate-800">
                            {m.name}
                            <div className="text-[11px] text-slate-500 font-mono">{m.phone}</div>
                          </td>
                          <td className="py-2 px-3 text-right">{m.tier}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold">
                            {m.points.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            ${m.totalSpentUsd.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {exp?.expiringPoints ? `${exp.expiringPoints.toLocaleString()} pts` : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">Restock economics</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">Low-stock items</div>
                <div className="text-xl font-extrabold text-amber-900">{procurementSummary.lowStock}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">at / below min level</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">Open purchase orders</div>
                <div className="text-xl font-extrabold text-slate-900">{procurementSummary.openPoCount}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  ${procurementSummary.openApUsd.toFixed(2)} payable
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">Stock waste (7d)</div>
                <div className="text-xl font-extrabold text-red-800">
                  ${procurementSummary.waste7dUsd.toFixed(2)}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">cost value of discards</div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-[11px] text-emerald-800">Waste vs payables</div>
                <div className="text-xl font-extrabold text-emerald-900">
                  {procurementSummary.openApUsd > 0
                    ? `${Math.round((procurementSummary.waste7dUsd / procurementSummary.openApUsd) * 100)}%`
                    : '—'}
                </div>
                <div className="mt-0.5 text-[11px] text-emerald-700">
                  lower = leaner purchasing
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Open drafts are excluded from Auto-Restock so the same PO is never sent twice —
              use the Auto-Restock tab in Inventory to generate fresh drafts for items below
              minimum level, and mark received POs in Purchase Orders to clear the payable.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
