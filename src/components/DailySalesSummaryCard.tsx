import { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Target, TrendingUp, Trophy, X } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { canEditSettings } from '../utils/permissions';
import { computeDailySalesSummary } from '../utils/dailySalesSummary';

export function DailySalesSummaryCard() {
  const { state, activeBranch, activeStaff, updateBranchSettings } = usePos();

  const summary = useMemo(
    () =>
      computeDailySalesSummary({
        branch: activeBranch,
        orders: state.orders,
        dailyRevenueHistory: state.dailyRevenueHistory,
      }),
    [activeBranch, state.orders, state.dailyRevenueHistory]
  );

  const canEdit = canEditSettings(activeStaff, state.ownerPermissions);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState(String(summary.targetUsd));

  useEffect(() => {
    setTargetInput(String(summary.targetUsd));
    setEditingTarget(false);
  }, [activeBranch.id, summary.targetUsd]);

  const handleSaveTarget = () => {
    const parsed = Number(targetInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    updateBranchSettings({ dailySalesTargetUsd: Math.round(parsed * 100) / 100 });
    setEditingTarget(false);
  };

  const isAchieved = summary.tier === 'achieved';
  const isClose = summary.tier === 'close';

  return (
    <section
      aria-label="Daily sales performance summary"
      data-testid="daily-sales-summary-card"
      className={`rounded-xl border px-3.5 py-2.5 transition-colors ${
        isAchieved
          ? 'border-emerald-300 bg-gradient-to-r from-emerald-50 via-white to-emerald-50/70'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Revenue vs Target */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
              isAchieved
                ? 'bg-emerald-700 text-white'
                : isClose
                  ? 'bg-amber-500 text-white'
                  : 'bg-[#0A3D31] text-emerald-100'
            }`}
          >
            {isAchieved ? <Trophy className="h-4 w-4" /> : <Target className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Today&apos;s Revenue
              </span>
              <span
                data-testid="daily-sales-tier-badge"
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  isAchieved
                    ? 'bg-emerald-100 text-emerald-900'
                    : isClose
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-slate-100 text-slate-700'
                }`}
              >
                {summary.tierLabel}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 tabular-nums mt-0.5 flex-wrap">
              <span
                data-testid="daily-sales-revenue-usd"
                className="text-lg font-extrabold text-slate-900 leading-none"
              >
                ${summary.revenueUsd.toFixed(2)}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                / ${summary.targetUsd.toFixed(2)} target
              </span>
              <span className="text-[11px] text-slate-400">
                ({summary.revenueKhr.toLocaleString()} ៛)
              </span>
            </div>
          </div>
        </div>

        {/* Center: Visual Progress Bar & Motivation Line */}
        <div className="flex-1 min-w-[200px] max-w-md space-y-1">
          <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
            <span className="text-slate-600 font-medium truncate">
              {summary.motivationalMessage}
            </span>
            <span
              data-testid="daily-sales-percent"
              className={`font-bold shrink-0 ${
                isAchieved ? 'text-emerald-800' : 'text-slate-900'
              }`}
            >
              {summary.percentAchieved.toFixed(summary.percentAchieved >= 100 ? 0 : 1)}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Daily revenue vs target progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={summary.progressBarPct}
            className="h-2 w-full rounded-full bg-slate-100 overflow-hidden"
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isAchieved
                  ? 'bg-emerald-600'
                  : isClose
                    ? 'bg-amber-500'
                    : 'bg-[#0B5D47]'
              }`}
              style={{ width: `${summary.progressBarPct}%` }}
            />
          </div>
        </div>

        {/* Right: Shift Metrics & Quick Target Edit */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="hidden sm:flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 text-[11px] tabular-nums">
            <div>
              <span className="text-slate-400 block text-[10px]">Paid</span>
              <span className="font-bold text-slate-800">{summary.paidBillsCount} bills</span>
            </div>
            <div className="h-5 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 block text-[10px]">Avg bill</span>
              <span className="font-bold text-slate-800">${summary.avgBillUsd.toFixed(2)}</span>
            </div>
            <div className="h-5 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 block text-[10px]">Open tabs</span>
              <span className="font-bold text-emerald-800 inline-flex items-center gap-0.5">
                <TrendingUp className="h-3 w-3" />
                ${summary.openPipelineUsd.toFixed(2)}
              </span>
            </div>
          </div>

          {canEdit &&
            (editingTarget ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveTarget();
                }}
                className="flex items-center gap-1"
              >
                <label htmlFor="sell-daily-target-input" className="sr-only">
                  Daily sales target USD
                </label>
                <input
                  id="sell-daily-target-input"
                  type="number"
                  min={1}
                  step="any"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  className="w-20 rounded-lg border border-emerald-700 bg-white px-2 py-1 text-xs font-bold text-slate-900 tabular-nums focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Save daily sales target"
                  className="rounded-lg bg-[#0B5D47] p-1.5 text-white hover:bg-[#094A38]"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Cancel editing target"
                  onClick={() => {
                    setTargetInput(String(summary.targetUsd));
                    setEditingTarget(false);
                  }}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                aria-label="Edit daily sales target"
                onClick={() => {
                  setTargetInput(String(summary.targetUsd));
                  setEditingTarget(true);
                }}
                title="Adjust today's revenue goal"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-emerald-700 hover:text-emerald-900"
              >
                <Pencil className="h-3 w-3" />
                <span>Goal</span>
              </button>
            ))}
        </div>
      </div>
    </section>
  );
}
