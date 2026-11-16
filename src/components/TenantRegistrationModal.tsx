import React, { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  QrCode,
  X,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Star,
  CalendarClock,
  ShieldCheck,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import type { TenantBusinessType } from '../types/pos';
import { isValidBakongAccountId } from '../utils/bakongKhqr';
import {
  computeSubscriptionAmountUsd,
  computeSubscriptionDays,
  SUBSCRIPTION_PLAN_LIST,
  type SubscriptionPlan,
} from '../utils/subscription';
import { SubscriptionKhqrCard } from './SubscriptionKhqrCard';

interface TenantRegistrationModalProps {
  open: boolean;
  onClose: () => void;
}

export function TenantRegistrationModal({ open, onClose }: TenantRegistrationModalProps) {
  const { registerTenant } = usePos();

  const [step, setStep] = useState<'details' | 'payment'>('details');

  const [businessName, setBusinessName] = useState('');
  const [businessCode, setBusinessCode] = useState('');
  const [businessType, setBusinessType] = useState<TenantBusinessType>('restaurant');
  const [branchCode, setBranchCode] = useState('MAIN');
  const [address, setAddress] = useState('Phnom Penh, Cambodia');
  const [ownerName, setOwnerName] = useState('Owner');
  const [ownerPin, setOwnerPin] = useState('1111');
  const [exchangeRate, setExchangeRate] = useState('4100');
  const [vatPercent, setVatPercent] = useState('10');

  const [configureMerchantKhqr, setConfigureMerchantKhqr] = useState(false);
  const [khqrAccountType, setKhqrAccountType] = useState<'individual' | 'merchant'>('individual');
  const [khqrAccountId, setKhqrAccountId] = useState('');
  const [khqrAccountName, setKhqrAccountName] = useState('');
  const [khqrMerchantId, setKhqrMerchantId] = useState('');
  const [khqrAcquiringBank, setKhqrAcquiringBank] = useState('ABA Bank');
  const [khqrCity, setKhqrCity] = useState('Phnom Penh');
  const [khqrDefaultCurrency, setKhqrDefaultCurrency] = useState<'USD' | 'KHR'>('USD');

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>('daily');
  const [planPeriods, setPlanPeriods] = useState<number>(1);
  const [invoiceTag] = useState(() =>
    Math.random().toString(36).substring(2, 7).toUpperCase()
  );

  const [verifying, setVerifying] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [codeEdited, setCodeEdited] = useState(false);
  const [khqrNameEdited, setKhqrNameEdited] = useState(false);

  if (!open) return null;

  const cleanName = businessName.trim();
  const cleanCode = (businessCode || cleanName.toUpperCase().replace(/[^A-Z0-9]+/g, '_'))
    .trim()
    .slice(0, 32);
  const cleanKhqr = configureMerchantKhqr ? khqrAccountId.trim() : '';
  const parsedRate = Math.max(1000, Number(exchangeRate) || 4100);
  const totalAmountUsd = computeSubscriptionAmountUsd(selectedPlan, planPeriods);
  const totalDays = computeSubscriptionDays(selectedPlan, planPeriods);

  const handleClose = () => {
    setStep('details');
    setError('');
    onClose();
  };

  const handleBusinessNameChange = (name: string) => {
    setBusinessName(name);
    const clean = name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 14);
    if (!codeEdited) {
      setBusinessCode(clean ? `${clean}_KH` : '');
    }
    if (!khqrNameEdited) {
      setKhqrAccountName(name.trim().slice(0, 25));
    }
  };

  const handleVerifyBakong = async () => {
    const clean = khqrAccountId.trim();
    if (!clean) {
      setVerifyFeedback({ ok: false, msg: 'Enter a Bakong Account ID first (e.g. myshop@abaa).' });
      return;
    }
    setVerifying(true);
    setVerifyFeedback(null);
    try {
      const res = await fetch('/api/bakong/verify-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: clean }),
      });
      const data = (await res.json()) as { valid?: boolean; message?: string; error?: string };
      setVerifyFeedback({
        ok: Boolean(data.valid),
        msg: data.message || data.error || 'Verification complete.',
      });
    } catch {
      setVerifyFeedback({
        ok: isValidBakongAccountId(clean),
        msg: isValidBakongAccountId(clean)
          ? 'Valid Bakong ID format.'
          : 'Expected format like account@abaa.',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleProceedToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (cleanName.length < 2) {
      setError('Please enter a business name (at least 2 characters).');
      return;
    }
    if (!/^[A-Za-z0-9_-]{2,32}$/.test(cleanCode)) {
      setError('Business code must be 2–32 characters using letters, numbers, _ or -.');
      return;
    }
    if (cleanKhqr && !isValidBakongAccountId(cleanKhqr)) {
      setError('Bakong KHQR ID must look like account@bank (e.g. lotus@abaa), or leave it blank to skip.');
      return;
    }

    setStep('payment');
  };

  const handleSubscriptionPaid = async (payment: {
    plan: SubscriptionPlan;
    days: number;
    amountUsd: number;
    paymentRef: string;
  }) => {
    setError('');
    setSubmitting(true);
    try {
      await registerTenant({
        businessName: cleanName,
        businessCode: cleanCode,
        businessType,
        branchCode: branchCode.trim() || 'MAIN',
        address: address.trim() || 'Phnom Penh, Cambodia',
        ownerName: ownerName.trim() || 'Owner',
        ownerPin: ownerPin.trim() || '1111',
        exchangeRate: parsedRate,
        vatPercent: Math.max(0, Math.min(50, Number(vatPercent) || 10)),
        khqrAccountId: cleanKhqr || undefined,
        khqrAccountName: cleanKhqr
          ? khqrAccountName.trim() || cleanName.slice(0, 25)
          : cleanName.slice(0, 25),
        khqrAccountType,
        khqrMerchantId: cleanKhqr ? khqrMerchantId.trim() || undefined : undefined,
        khqrAcquiringBank: cleanKhqr ? khqrAcquiringBank.trim() || undefined : undefined,
        khqrCity: khqrCity.trim() || 'Phnom Penh',
        khqrDefaultCurrency,
        plan: payment.plan,
        planDays: payment.days,
        subscriptionStatus: 'active',
        subscriptionRef: payment.paymentRef,
        subscriptionPaidUsd: payment.amountUsd,
      });
      setStep('details');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate tenant workspace.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Register new business tenant"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#0A3D31] px-5 py-3.5 text-white">
          <div className="flex items-center gap-2.5">
            <Building2 className="h-5 w-5 text-amber-300" />
            <div>
              <h2 className="text-base font-bold">Register New Tenant Workspace</h2>
              <p className="text-[11px] text-emerald-100/85">
                {step === 'details'
                  ? 'Step 1 of 2 · Store profile, optional Bakong KHQR & required subscription plan'
                  : 'Step 2 of 2 · Pay Bakong KHQR subscription to activate & launch'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close tenant registration"
            className="rounded-lg p-1 text-emerald-100 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === 'details' ? (
          <form onSubmit={handleProceedToPayment} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {/* 1. Business Details */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                1. Business Profile &amp; Store
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="tenant-biz-name" className="block font-semibold text-slate-700 mb-1">
                    Business / Tenant Name
                  </label>
                  <input
                    id="tenant-biz-name"
                    required
                    value={businessName}
                    onChange={(e) => handleBusinessNameChange(e.target.value)}
                    placeholder="e.g. Angkor Roastery & Spa"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="tenant-biz-code" className="block font-semibold text-slate-700 mb-1">
                    Tenant Code
                  </label>
                  <input
                    id="tenant-biz-code"
                    required
                    value={businessCode}
                    onChange={(e) => {
                      setCodeEdited(true);
                      setBusinessCode(e.target.value.toUpperCase());
                    }}
                    placeholder="e.g. ANGKOR_KH"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="tenant-biz-type" className="block font-semibold text-slate-700 mb-1">
                    Business Type
                  </label>
                  <select
                    id="tenant-biz-type"
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value as TenantBusinessType)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  >
                    <option value="restaurant">Restaurant / Dining</option>
                    <option value="cafe">Café / Bakery</option>
                    <option value="retail">Retail &amp; Products Shop</option>
                    <option value="services">Services / Salon / Catering</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="tenant-branch-code" className="block font-semibold text-slate-700 mb-1">
                      Branch Code
                    </label>
                    <input
                      id="tenant-branch-code"
                      value={branchCode}
                      onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                      placeholder="MAIN"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label htmlFor="tenant-address" className="block font-semibold text-slate-700 mb-1">
                      City / Address
                    </label>
                    <input
                      id="tenant-address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="tenant-owner" className="block font-semibold text-slate-700 mb-1">
                    Owner Name
                  </label>
                  <input
                    id="tenant-owner"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label htmlFor="tenant-pin" className="block font-semibold text-slate-700 mb-1">
                    Owner PIN
                  </label>
                  <input
                    id="tenant-pin"
                    maxLength={4}
                    value={ownerPin}
                    onChange={(e) => setOwnerPin(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="tenant-fx" className="block font-semibold text-slate-700 mb-1">
                    Rate (៛ / $1)
                  </label>
                  <input
                    id="tenant-fx"
                    type="number"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="tenant-vat" className="block font-semibold text-slate-700 mb-1">
                    VAT (%)
                  </label>
                  <input
                    id="tenant-vat"
                    type="number"
                    value={vatPercent}
                    onChange={(e) => setVatPercent(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* 2. Bakong KHQR Setup (Optional) */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <QrCode className="h-3.5 w-3.5 text-[#C81E1E]" />
                    2. Bakong KHQR Merchant Configuration
                  </h3>
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
                    Optional
                  </span>
                </div>
                <button
                  type="button"
                  aria-expanded={configureMerchantKhqr}
                  onClick={() => {
                    setConfigureMerchantKhqr((prev) => !prev);
                    setVerifyFeedback(null);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-100"
                >
                  {configureMerchantKhqr ? 'Skip for now' : 'Configure KHQR now'}
                </button>
              </div>

              {!configureMerchantKhqr ? (
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Optional — you can skip merchant KHQR setup during registration and accept Cash, Card, or Bank transfer right away. Add your Bakong Account ID anytime in <strong>Settings</strong>.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="tenant-khqr-id" className="block font-semibold text-slate-700 mb-1">
                        Bakong Account ID (optional)
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          id="tenant-khqr-id"
                          value={khqrAccountId}
                          onChange={(e) => setKhqrAccountId(e.target.value)}
                          placeholder="e.g. angkorbistro@abaa"
                          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-slate-900"
                        />
                        <button
                          type="button"
                          disabled={verifying}
                          onClick={() => void handleVerifyBakong()}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                        >
                          {verifying ? 'Checking...' : 'Verify'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="tenant-khqr-name" className="block font-semibold text-slate-700 mb-1">
                        KHQR Display Name
                      </label>
                      <input
                        id="tenant-khqr-name"
                        value={khqrAccountName}
                        onChange={(e) => {
                          setKhqrNameEdited(true);
                          setKhqrAccountName(e.target.value);
                        }}
                        placeholder="Shown on banking app"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                      />
                    </div>

                    <div>
                      <label htmlFor="tenant-khqr-type" className="block font-semibold text-slate-700 mb-1">
                        Account Type
                      </label>
                      <select
                        id="tenant-khqr-type"
                        value={khqrAccountType}
                        onChange={(e) => setKhqrAccountType(e.target.value as 'individual' | 'merchant')}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                      >
                        <option value="individual">Individual KHQR (Tag 29)</option>
                        <option value="merchant">Merchant KHQR (Tag 30)</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor="tenant-khqr-curr" className="block font-semibold text-slate-700 mb-1">
                          Default Currency
                        </label>
                        <select
                          id="tenant-khqr-curr"
                          value={khqrDefaultCurrency}
                          onChange={(e) => setKhqrDefaultCurrency(e.target.value as 'USD' | 'KHR')}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                        >
                          <option value="USD">USD (840)</option>
                          <option value="KHR">KHR (116)</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="tenant-khqr-city" className="block font-semibold text-slate-700 mb-1">
                          Merchant City
                        </label>
                        <input
                          id="tenant-khqr-city"
                          value={khqrCity}
                          onChange={(e) => setKhqrCity(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                        />
                      </div>
                    </div>
                  </div>

                  {khqrAccountType === 'merchant' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label htmlFor="tenant-merchant-id" className="block font-semibold text-slate-700 mb-1">
                          Merchant ID (Subtag 01)
                        </label>
                        <input
                          id="tenant-merchant-id"
                          value={khqrMerchantId}
                          onChange={(e) => setKhqrMerchantId(e.target.value)}
                          placeholder="e.g. M009911"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono"
                        />
                      </div>
                      <div>
                        <label htmlFor="tenant-acquirer" className="block font-semibold text-slate-700 mb-1">
                          Acquiring Bank (Subtag 02)
                        </label>
                        <input
                          id="tenant-acquirer"
                          value={khqrAcquiringBank}
                          onChange={(e) => setKhqrAcquiringBank(e.target.value)}
                          placeholder="e.g. ABA Bank"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                        />
                      </div>
                    </div>
                  )}

                  {verifyFeedback && (
                    <div
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] ${
                        verifyFeedback.ok
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-red-200 bg-red-50 text-red-800'
                      }`}
                    >
                      {verifyFeedback.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                      )}
                      <span>{verifyFeedback.msg}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 3. Required Bakong Subscription Plan */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5 text-emerald-700" />
                  3. Required Subscription Plan (Pay via Bakong KHQR)
                </h3>
                <span className="text-[11px] font-semibold text-emerald-800">
                  Required before first use
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" role="radiogroup" aria-label="Subscription plan">
                {SUBSCRIPTION_PLAN_LIST.map((plan) => {
                  const selected = selectedPlan === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setSelectedPlan(plan.id);
                        setPlanPeriods(1);
                      }}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        selected
                          ? 'border-emerald-700 bg-white ring-2 ring-emerald-700/20 shadow-xs'
                          : 'border-slate-200 bg-white/80 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-slate-900 flex items-center gap-1">
                          {plan.id === 'premium' && <Star className="h-3.5 w-3.5 text-amber-500" />}
                          {plan.name}
                        </span>
                        <span className="font-extrabold text-emerald-800 tabular-nums">
                          {plan.billingLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500 leading-snug">{plan.tagline}</p>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200/80 bg-white px-3 py-2 text-[11px]">
                <span className="font-semibold text-slate-700">
                  {selectedPlan === 'daily' ? 'Daily Pass Days ($1/day):' : 'Months:'}
                </span>
                <div className="flex items-center gap-1.5">
                  {(selectedPlan === 'daily' ? [1, 3, 7, 14] : [1, 3, 6]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPlanPeriods(p)}
                      className={`rounded-md border px-2 py-0.5 font-semibold tabular-nums ${
                        planPeriods === p
                          ? 'border-emerald-700 bg-emerald-700 text-white'
                          : 'border-slate-300 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {p}
                      {selectedPlan === 'daily' ? 'd' : 'm'}
                    </button>
                  ))}
                  <span className="ml-2 font-bold text-slate-900 tabular-nums">
                    Total: ${totalAmountUsd.toFixed(2)} ({totalDays} day{totalDays > 1 ? 's' : ''})
                  </span>
                </div>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 font-medium">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B5D47] px-5 py-2 font-semibold text-white hover:bg-[#094A38]"
              >
                <span>Continue to Bakong KHQR (${totalAmountUsd.toFixed(2)})</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-950">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0" />
                <span>
                  Complete your Bakong KHQR subscription payment to unlock &amp; launch{' '}
                  <strong>{cleanName}</strong> ({totalDays} day{totalDays > 1 ? 's' : ''}).
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStep('details')}
                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-900 hover:bg-amber-100"
              >
                <ArrowLeft className="h-3 w-3" />
                Edit Details
              </button>
            </div>

            <SubscriptionKhqrCard
              plan={selectedPlan}
              periods={planPeriods}
              onPeriodsChange={setPlanPeriods}
              businessCode={cleanCode}
              businessName={cleanName}
              exchangeRate={parsedRate}
              initialCurrency={khqrDefaultCurrency}
              invoiceTag={invoiceTag}
              confirmLabel={
                submitting
                  ? 'Activating Workspace...'
                  : 'Confirm Paid (Sandbox) & Launch Tenant POS'
              }
              onPaymentConfirmed={handleSubscriptionPaid}
            />

            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 font-medium">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
