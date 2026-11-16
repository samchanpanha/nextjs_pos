import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, RefreshCw, ShieldCheck } from 'lucide-react';
import { QrCodeBox } from './QrCodeBox';
import {
  buildPlatformSubscriptionKhqr,
  clampPlanPeriods,
  getPlanDefinition,
  PLATFORM_BAKONG_CONFIG,
  type SubscriptionPlan,
} from '../utils/subscription';
import type { KhqrCurrency } from '../utils/bakongKhqr';

interface SubscriptionKhqrCardProps {
  plan: SubscriptionPlan;
  periods: number;
  onPeriodsChange?: (next: number) => void;
  businessCode: string;
  businessName: string;
  exchangeRate?: number;
  initialCurrency?: KhqrCurrency;
  invoiceTag?: string;
  confirmLabel?: string;
  onPaymentConfirmed: (result: {
    plan: SubscriptionPlan;
    days: number;
    amountUsd: number;
    paymentRef: string;
  }) => Promise<void> | void;
}

export function SubscriptionKhqrCard({
  plan,
  periods,
  onPeriodsChange,
  businessCode,
  businessName,
  exchangeRate = 4100,
  initialCurrency = 'USD',
  invoiceTag = 'SUB01',
  confirmLabel = 'Confirm Paid (Sandbox) & Activate',
  onPaymentConfirmed,
}: SubscriptionKhqrCardProps) {
  const [currency, setCurrency] = useState<KhqrCurrency>(initialCurrency);
  const [checking, setChecking] = useState(false);
  const [activating, setActivating] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    paid: boolean;
    message: string;
    ref?: string;
  } | null>(null);

  const planDef = getPlanDefinition(plan);
  const safePeriods = clampPlanPeriods(plan, periods);

  const invoice = useMemo(
    () =>
      buildPlatformSubscriptionKhqr({
        plan,
        periods: safePeriods,
        currency,
        exchangeRate,
        businessCode,
        invoiceTag,
      }),
    [plan, safePeriods, currency, exchangeRate, businessCode, invoiceTag]
  );

  const handleCheckTransaction = async (simulatePaid: boolean) => {
    if (simulatePaid) {
      setActivating(true);
    } else {
      setChecking(true);
    }
    setStatusFeedback(null);

    try {
      const res = await fetch('/api/bakong/check-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          md5: invoice.khqr.md5,
          simulatePaid,
        }),
      });
      const data = (await res.json()) as {
        paid?: boolean;
        transactionRef?: string | null;
        message?: string;
        error?: string;
      };

      const paid = Boolean(data.paid);
      const ref =
        data.transactionRef ||
        `KHQR-${invoice.khqr.md5.slice(0, 8).toUpperCase()}`;

      setStatusFeedback({
        paid,
        message:
          data.message ||
          data.error ||
          (paid ? 'Bakong KHQR payment verified.' : 'Transaction pending in Bakong.'),
        ref: paid ? ref : undefined,
      });

      if (paid) {
        await onPaymentConfirmed({
          plan,
          days: invoice.daysGranted,
          amountUsd: invoice.amountUsd,
          paymentRef: ref,
        });
      }
    } catch {
      setStatusFeedback({
        paid: false,
        message: 'Unable to reach Bakong verification endpoint.',
      });
    } finally {
      setChecking(false);
      setActivating(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* KHQR Header Banner */}
      <div className="bg-[#C81E1E] px-4 py-2.5 text-white flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-extrabold tracking-wider text-xs">BAKONG KHQR</span>
          <span className="text-[11px] text-red-100">Subscription Checkout</span>
        </div>
        <span className="text-[11px] font-mono text-red-100">
          {currency === 'USD' ? 'USD (840)' : 'KHR (116)'}
        </span>
      </div>

      <div className="p-4 flex flex-col sm:flex-row gap-4 items-center sm:items-start">
        {/* Scannable QR Card */}
        <div className="shrink-0 flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-bold text-slate-800 mb-1">
            {PLATFORM_BAKONG_CONFIG.merchantName}
          </div>
          <QrCodeBox
            value={invoice.khqr.qrString}
            size={148}
            label={`Bakong KHQR subscription ${planDef.name}`}
          />
          <div className="mt-2 text-center tabular-nums">
            <div className="text-sm font-extrabold text-slate-900">
              {currency === 'USD'
                ? `$${invoice.amountUsd.toFixed(2)} USD`
                : `${invoice.amountKhr.toLocaleString()} ៛`}
            </div>
            <div className="text-[11px] text-slate-500">
              {currency === 'USD'
                ? `${invoice.amountKhr.toLocaleString()} ៛`
                : `$${invoice.amountUsd.toFixed(2)} USD`}
            </div>
          </div>
        </div>

        {/* Invoice Details & Controls */}
        <div className="flex-1 min-w-0 w-full space-y-3 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-slate-900">
                {planDef.name} · {planDef.billingLabel}
              </div>
              <div className="text-[11px] text-slate-500">
                Tenant: <strong className="text-slate-700">{businessName || 'New Workspace'}</strong> (
                <span className="font-mono">{businessCode || 'TENANT'}</span>)
              </div>
            </div>

            {/* Currency Switch */}
            <div
              className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-semibold"
              role="group"
              aria-label="Subscription KHQR currency"
            >
              {(['USD', 'KHR'] as KhqrCurrency[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCurrency(c);
                    setStatusFeedback(null);
                  }}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    currency === c
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Duration / Days selector for Daily Pass (or Periods for Monthly) */}
          {onPeriodsChange && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-700">
                {plan === 'daily' ? 'Pass duration (Days):' : 'Billing periods (Months):'}
              </span>
              <div className="flex items-center gap-1.5">
                {(plan === 'daily' ? [1, 3, 7, 14, 30] : [1, 3, 6, 12]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      onPeriodsChange(preset);
                      setStatusFeedback(null);
                    }}
                    className={`rounded-md border px-2 py-1 text-[11px] font-semibold tabular-nums ${
                      safePeriods === preset
                        ? 'border-emerald-700 bg-emerald-700 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {preset}
                    {plan === 'daily' ? 'd' : 'm'}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={plan === 'daily' ? 365 : 24}
                  aria-label={plan === 'daily' ? 'Custom subscription days' : 'Custom subscription months'}
                  value={safePeriods}
                  onChange={(e) => {
                    onPeriodsChange(Math.max(1, Number(e.target.value) || 1));
                    setStatusFeedback(null);
                  }}
                  className="w-14 rounded-md border border-slate-300 bg-white px-2 py-1 text-center font-mono tabular-nums"
                />
              </div>
            </div>
          )}

          {/* Summary Row */}
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 text-[11px] tabular-nums">
            <div>
              <span className="text-slate-500">Bakong Receiver:</span>{' '}
              <span className="font-mono font-semibold text-slate-800">
                {PLATFORM_BAKONG_CONFIG.bakongAccountId}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Access Granted:</span>{' '}
              <strong className="text-emerald-800">{invoice.daysGranted} day(s)</strong>
            </div>
            <div className="col-span-2 truncate">
              <span className="text-slate-500">MD5 Ref:</span>{' '}
              <span className="font-mono text-slate-700">{invoice.khqr.md5}</span>
            </div>
          </div>

          {statusFeedback && (
            <div
              role="status"
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] ${
                statusFeedback.paid
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              {statusFeedback.paid ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
              ) : (
                <Clock className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-semibold">{statusFeedback.message}</div>
                {statusFeedback.ref && (
                  <div className="font-mono text-[10px] mt-0.5">Ref: {statusFeedback.ref}</div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={checking || activating}
              onClick={() => void handleCheckTransaction(false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking Bakong...' : 'Check Bakong Status'}
            </button>

            <button
              type="button"
              disabled={checking || activating}
              onClick={() => void handleCheckTransaction(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B5D47] px-4 py-2 font-semibold text-white hover:bg-[#094A38] disabled:opacity-60"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {activating ? 'Activating...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
