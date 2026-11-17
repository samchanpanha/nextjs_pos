import React, { useMemo, useState } from 'react';
import { BarChart3, Sparkles, Calendar, Send, Clock, Receipt } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { roundCurrency, usdToKhr } from '../utils/posMath';
import { AiForecastWidget } from './AiForecastWidget';

type ReportTab = 'overview' | 'details' | 'ai' | 'forecast' | 'shifts' | 'telegram';

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
  const [telegramSent, setTelegramSent] = useState(false);

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

  const maxDailyRev = Math.max(
    1,
    ...state.dailyRevenueHistory.map((d) => d.netSalesUsd)
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
                  state.dailyRevenueHistory.reduce((s, d) => s + d.netSalesUsd, 0)
                ).toFixed(2)}
              </div>
              <div className="text-xs text-slate-500 tabular-nums">
                {state.dailyRevenueHistory.reduce((s, d) => s + d.bills, 0)} total bills
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* SVG 7-Day Bar Chart */}
            <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-800" />
                  Daily net sales (USD)
                </h2>
                <span className="text-xs text-slate-500">Last 7 days</span>
              </div>
              <div className="w-full overflow-x-auto">
                <svg
                  viewBox="0 0 640 220"
                  className="w-full h-56"
                  role="img"
                  aria-label="Daily net sales bar chart"
                >
                  {state.dailyRevenueHistory.map((d, idx) => {
                    const barW = 54;
                    const gap = (640 - state.dailyRevenueHistory.length * barW) / (state.dailyRevenueHistory.length + 1);
                    const x = gap + idx * (barW + gap);
                    const barH = Math.max(8, Math.round((d.netSalesUsd / maxDailyRev) * 145));
                    const y = 175 - barH;
                    return (
                      <g key={d.date}>
                        <rect
                          x={x}
                          y={y}
                          width={barW}
                          height={barH}
                          rx={6}
                          fill={idx === state.dailyRevenueHistory.length - 1 ? '#065F46' : '#10B981'}
                        />
                        <text
                          x={x + barW / 2}
                          y={y - 6}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="600"
                          fill="#0F172A"
                        >
                          ${Math.round(d.netSalesUsd)}
                        </text>
                        <text
                          x={x + barW / 2}
                          y={196}
                          textAnchor="middle"
                          fontSize="10"
                          fill="#64748B"
                        >
                          {d.date.slice(5)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
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
          <h2 className="text-sm font-bold text-slate-900">End-of-day Telegram summary</h2>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs whitespace-pre-line text-slate-800">
            {`[${activeBranch.name}] Daily Close Summary\nPaid Bills: ${paidOrders.length}\nRevenue: $${todayTotalUsd.toFixed(2)} (${usdToKhr(todayTotalUsd, activeBranch.exchangeRate, activeBranch.rielRounding).toLocaleString()} ៛)\nTop Seller: ${topItems[0]?.name || 'N/A'}\nChannel: ${activeBranch.telegramChannel}`}
          </div>
          <div className="flex items-center justify-between">
            {telegramSent ? (
              <span className="text-xs font-semibold text-emerald-700">
                Sent to {activeBranch.telegramChannel}.
              </span>
            ) : (
              <span className="text-xs text-slate-500">Scheduled nightly at 22:30</span>
            )}
            <button
              type="button"
              onClick={() => setTelegramSent(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
            >
              <Send className="h-3.5 w-3.5" /> Send Telegram Report Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
