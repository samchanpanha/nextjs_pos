import { useEffect, useRef, useState } from 'react';
import {
  X,
  Delete,
  QrCode,
  Banknote,
  Building2,
  CreditCard,
  Star,
  Tag,
  Ticket,
  RefreshCw,
  CheckCircle2,
  Gift,
  UserPlus,
  Search,
  ScanLine,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import type { PosOrder } from '../types/pos';
import {
  calculateDualCurrencyChange,
  calculateOrderTotals,
  evaluateBestPromotion,
  usdToKhr,
} from '../utils/posMath';
import {
  calculatePointsDiscountUsd,
  calculatePointsEarned,
  findMemberByPhone,
  getMaxRedeemableDiscountPoints,
  getOrderLoyaltyItemPointsUsed,
  normalizeCustomerPhone,
  searchMembers,
} from '../utils/loyaltyEngine';
import { findMemberByLoyaltyQr } from '../utils/loyaltyQr';
import { LoyaltyQrScanner } from './LoyaltyQrScanner';
import {
  generateBakongKhqrPayload,
  isMerchantKhqrConfigured,
  type KhqrCurrency,
} from '../utils/bakongKhqr';
import { QrCodeBox } from './QrCodeBox';

interface PayModalProps {
  order: PosOrder;
  onClose: () => void;
}

export function PayModal({ order, onClose }: PayModalProps) {
  const {
    state,
    activeBranch,
    applyOrderDiscount,
    setOrderPromoCode,
    attachMemberToOrder,
    redeemLoyaltyItem,
    removeRedeemedLoyaltyItem,
    addLoyaltyMember,
    applyPrepaidPack,
    settleOrderPayment,
    setDisplayOrder,
    setNavSection,
    notify,
  } = usePos();

  const [payMethod, setPayMethod] = useState<'Cash' | 'KHQR' | 'Bank transfer' | 'Card'>('Cash');
  const [guestCurrency, setGuestCurrency] = useState<'USD' | 'KHR' | 'BOTH'>('USD');
  const [usdInput, setUsdInput] = useState('');
  const [khrInput, setKhrInput] = useState('');
  const [activeField, setActiveField] = useState<'USD' | 'KHR'>('USD');
  const [txRef, setTxRef] = useState('');
  const [discountPercent, setDiscountPercent] = useState(order.manualDiscountPercent || 0);
  const [managerPin, setManagerPin] = useState('');
  const [showDiscountBox, setShowDiscountBox] = useState(false);
  const [memberPhone, setMemberPhone] = useState(order.memberPhone || '');
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showQuickEnroll, setShowQuickEnroll] = useState(false);
  const [quickEnrollName, setQuickEnrollName] = useState('');
  const [showLoyaltyScanner, setShowLoyaltyScanner] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState(order.pointsRedeemed || 0);
  const [promoCodeInput, setPromoCodeInput] = useState(order.promoCode || '');
  const [pinError, setPinError] = useState('');
  const [khqrCurrency, setKhqrCurrency] = useState<KhqrCurrency>(
    activeBranch.khqrDefaultCurrency || 'USD'
  );
  const [checkingKhqr, setCheckingKhqr] = useState(false);
  const [khqrStatusMsg, setKhqrStatusMsg] = useState('');
  const [khqrError, setKhqrError] = useState('');

  // Auto promotion evaluation (disabled in offline mode per guide p.28)
  const autoPromo = state.offlineMode
    ? { promotion: null, discountUsd: 0 }
    : evaluateBestPromotion(
        order.items,
        state.promotions,
        new Date().getHours(),
        promoCodeInput || order.promoCode
      );

  const effectivePromoDiscount = Math.max(order.promoDiscountUsd, autoPromo.discountUsd);

  const totals = calculateOrderTotals({
    items: order.items,
    exchangeRate: activeBranch.exchangeRate,
    rielRounding: activeBranch.rielRounding,
    vatPercent: activeBranch.vatPercent,
    serviceChargePercent: activeBranch.serviceChargePercent,
    manualDiscountPercent: order.manualDiscountPercent,
    manualDiscountUsd: order.manualDiscountUsd,
    promoDiscountUsd: effectivePromoDiscount,
    pointsRedeemed: order.pointsRedeemed,
    pointsValuePer100: activeBranch.pointsValuePer100,
    depositAppliedUsd: order.depositAppliedUsd,
  });

  const paidUsdNum = parseFloat(usdInput) || 0;
  const paidKhrNum = parseFloat(khrInput) || 0;

  const cashCalc = calculateDualCurrencyChange({
    dueUsd: totals.totalUsd,
    paidUsd: paidUsdNum,
    paidKhr: paidKhrNum,
    exchangeRate: activeBranch.exchangeRate,
    rielRounding: activeBranch.rielRounding,
  });

  const matchedMember = findMemberByPhone(state.members, order.memberPhone || memberPhone);
  const memberSearchResults = searchMembers(state.members, memberPhone).slice(0, 6);
  const itemPointsUsed = getOrderLoyaltyItemPointsUsed(order.items);
  const discountPointsUsed = order.pointsRedeemed || 0;
  const availablePointsForDiscount = matchedMember
    ? Math.max(0, matchedMember.points - itemPointsUsed)
    : 0;
  const remainingPointsBalance = matchedMember
    ? Math.max(0, availablePointsForDiscount - discountPointsUsed)
    : 0;
  const maxDiscountPoints =
    matchedMember && activeBranch.pointsEnabled
      ? getMaxRedeemableDiscountPoints({
          memberPoints: matchedMember.points,
          alreadyUsedForItems: itemPointsUsed,
          remainingSubtotalUsd: totals.subtotalUsd,
          pointsValuePer100: activeBranch.pointsValuePer100,
          step: 50,
        })
      : 0;
  const pointsDiscountUsd = calculatePointsDiscountUsd(
    discountPointsUsed,
    activeBranch.pointsValuePer100
  );
  const estimatedEarnPoints = matchedMember
    ? calculatePointsEarned({
        totalUsd: totals.totalUsd,
        pointsPerDollar: activeBranch.pointsPerDollar,
        pointsEnabled: activeBranch.pointsEnabled,
        tier: matchedMember.tier,
      })
    : 0;
  const activeBranchRewards = (state.loyaltyRewards || []).filter(
    (r) => r.branchId === activeBranch.id && r.active
  );

  const matchingPack = state.customerPacks.find(
    (p) =>
      p.active &&
      p.usesLeft > 0 &&
      normalizeCustomerPhone(p.phone) === normalizeCustomerPhone(matchedMember?.phone || memberPhone)
  );

  const handleLoyaltyQrDetected = (payload: string) => {
    const member = findMemberByLoyaltyQr(state.members, payload);
    if (!member) {
      notify('No enrolled loyalty member matches that QR code.', 'warning');
      setShowLoyaltyScanner(false);
      return;
    }
    setMemberPhone(member.phone);
    setShowMemberPicker(false);
    setShowQuickEnroll(false);
    setShowLoyaltyScanner(false);
    attachMemberToOrder(order.id, member.phone, redeemPoints);
    const earn = calculatePointsEarned({
      totalUsd: totals.totalUsd,
      pointsPerDollar: activeBranch.pointsPerDollar,
      pointsEnabled: activeBranch.pointsEnabled,
      tier: member.tier,
    });
    notify(
      !activeBranch.pointsEnabled
        ? `${member.name} attached to this bill (points program paused).`
        : state.offlineMode
          ? `${member.name} attached — ${earn} pts credited (offline, will sync).`
          : `${member.name} attached — ${earn} pts will be added on payment.`,
      'success'
    );
  };

  const setDisplayOrderRef = useRef(setDisplayOrder);
  setDisplayOrderRef.current = setDisplayOrder;

  useEffect(() => {
    setDisplayOrderRef.current(order.id, payMethod === 'KHQR');
  }, [order.id, payMethod]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleKeypad = (key: string) => {
    const setter = activeField === 'USD' ? setUsdInput : setKhrInput;
    const current = activeField === 'USD' ? usdInput : khrInput;
    if (key === 'BACK') {
      setter(current.slice(0, -1));
    } else if (key === '.') {
      if (!current.includes('.') && activeField === 'USD') {
        setter(current ? `${current}.` : '0.');
      }
    } else {
      setter(`${current}${key}`);
    }
  };

  const handleApplyDiscount = () => {
    const ok = applyOrderDiscount(order.id, discountPercent, 0, managerPin);
    if (!ok) {
      setPinError('Manager PIN required for discounts > 10% (try 2222 or 1111)');
    } else {
      setPinError('');
      setShowDiscountBox(false);
    }
  };

  const hasMerchantKhqr = isMerchantKhqrConfigured(activeBranch.khqrBakongId);
  const totalKhrDue = usdToKhr(
    totals.totalUsd,
    activeBranch.exchangeRate,
    activeBranch.rielRounding
  );
  const khqrAmount = khqrCurrency === 'KHR' ? totalKhrDue : totals.totalUsd;
  const khqrResult = hasMerchantKhqr
    ? generateBakongKhqrPayload({
        accountType: activeBranch.khqrAccountType || 'individual',
        bakongAccountId: activeBranch.khqrBakongId.trim(),
        merchantId: activeBranch.khqrMerchantId,
        acquiringBank: activeBranch.khqrAcquiringBank,
        merchantName: activeBranch.khqrAccountName || activeBranch.name,
        merchantCity: activeBranch.khqrCity || 'Phnom Penh',
        currency: khqrCurrency,
        amount: khqrAmount,
        billNumber: `ORD-${order.orderNumber}`,
        storeLabel: activeBranch.code,
        terminalLabel: 'POS1',
        mcc: activeBranch.khqrMcc || '5812',
      })
    : null;

  const handleCheckKhqrStatus = async (simulatePaid = false) => {
    if (!khqrResult) return;
    setCheckingKhqr(true);
    setKhqrError('');
    setKhqrStatusMsg('');
    try {
      const res = await fetch('/api/bakong/check-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ md5: khqrResult.md5, simulatePaid }),
      });
      const data = (await res.json()) as {
        paid?: boolean;
        transactionRef?: string | null;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setKhqrError(data.error || 'Could not reach Bakong verification endpoint.');
      } else if (data.paid) {
        const ref = data.transactionRef || `KHQR-${khqrResult.md5.slice(0, 8).toUpperCase()}`;
        setTxRef(ref);
        settleOrderPayment(order.id, {
          method: 'KHQR',
          paidUsd: khqrCurrency === 'USD' ? totals.totalUsd : 0,
          paidKhr: khqrCurrency === 'KHR' ? totalKhrDue : 0,
          changeUsd: 0,
          changeKhr: 0,
          paymentRef: ref,
          promoDiscountUsd: effectivePromoDiscount,
          appliedPromoName: autoPromo.promotion?.nameEn || order.appliedPromoName,
          totalUsd: totals.totalUsd,
          totalKhr: totalKhrDue,
        });
        onClose();
      } else {
        setKhqrStatusMsg(data.message || 'Transaction pending in Bakong.');
      }
    } catch {
      setKhqrError('Network error while checking Bakong status.');
    } finally {
      setCheckingKhqr(false);
    }
  };

  const activeKhqrMd5 = payMethod === 'KHQR' ? khqrResult?.md5 ?? null : null;
  const settleOrderPaymentRef = useRef(settleOrderPayment);
  settleOrderPaymentRef.current = settleOrderPayment;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (payMethod !== 'KHQR' || !activeKhqrMd5 || state.offlineMode) return;
    let cancelled = false;
    let inFlight = false;
    const controller = new AbortController();

    const pollModalKhqr = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch('/api/bakong/check-transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ md5: activeKhqrMd5 }),
          signal: controller.signal,
        });
        const data = (await res.json()) as {
          paid?: boolean;
          transactionRef?: string | null;
        };
        if (cancelled) return;
        if (res.ok && data.paid) {
          const ref =
            data.transactionRef || `KHQR-${activeKhqrMd5.slice(0, 8).toUpperCase()}`;
          setTxRef(ref);
          settleOrderPaymentRef.current(order.id, {
            method: 'KHQR',
            paidUsd: khqrCurrency === 'USD' ? totals.totalUsd : 0,
            paidKhr: khqrCurrency === 'KHR' ? totalKhrDue : 0,
            changeUsd: 0,
            changeKhr: 0,
            paymentRef: ref,
            promoDiscountUsd: effectivePromoDiscount,
            appliedPromoName: autoPromo.promotion?.nameEn || order.appliedPromoName,
            totalUsd: totals.totalUsd,
            totalKhr: totalKhrDue,
          });
          onCloseRef.current();
        }
      } catch {
        // Ignore transient or aborted polls
      } finally {
        inFlight = false;
      }
    };

    const timer = window.setInterval(() => {
      void pollModalKhqr();
    }, 3000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [
    payMethod,
    activeKhqrMd5,
    state.offlineMode,
    order.id,
    order.appliedPromoName,
    khqrCurrency,
    totals.totalUsd,
    totalKhrDue,
    effectivePromoDiscount,
    autoPromo.promotion?.nameEn,
  ]);

  const handleConfirmPayment = () => {
    const settlementTotals = {
      promoDiscountUsd: effectivePromoDiscount,
      appliedPromoName: autoPromo.promotion?.nameEn || order.appliedPromoName,
      totalUsd: totals.totalUsd,
      totalKhr: totalKhrDue,
    };
    if (payMethod === 'Cash') {
      if (!cashCalc.isSettled) return;
      settleOrderPayment(order.id, {
        method: 'Cash',
        paidUsd: paidUsdNum,
        paidKhr: paidKhrNum,
        changeUsd: cashCalc.changeWholeUsd,
        changeKhr: cashCalc.changeKhr,
        ...settlementTotals,
      });
    } else if (payMethod === 'KHQR') {
      if (!khqrResult) return;
      settleOrderPayment(order.id, {
        method: 'KHQR',
        paidUsd: khqrCurrency === 'USD' ? totals.totalUsd : 0,
        paidKhr: khqrCurrency === 'KHR' ? totalKhrDue : 0,
        changeUsd: 0,
        changeKhr: 0,
        paymentRef: txRef || `KHQR-${khqrResult.md5.slice(0, 8).toUpperCase()}`,
        ...settlementTotals,
      });
    } else {
      settleOrderPayment(order.id, {
        method: payMethod,
        paidUsd: totals.totalUsd,
        paidKhr: 0,
        changeUsd: 0,
        changeKhr: 0,
        paymentRef: txRef || `${payMethod.toUpperCase()}-${Date.now().toString().slice(-6)}`,
        ...settlementTotals,
      });
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Pay order ${order.tableName}`}
    >
      <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Pay · {order.tableName}
            </h2>
            <p className="text-xs text-slate-500 font-mono">
              Order #{order.orderNumber} · locked rate 1 USD = {activeBranch.exchangeRate.toLocaleString()} ៛ ·{' '}
              {order.guests} guests
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close payment modal"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
          {/* Left Bill Summary */}
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/70 p-5 flex flex-col justify-between gap-4">
            <div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1 text-xs">
                {order.items
                  .filter((i) => !i.voided)
                  .map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2">
                      <span className="text-slate-800 min-w-0 truncate">
                        <strong className="tabular-nums">{item.qty}×</strong> {item.nameEn}
                        {item.optionLabel ? ` (${item.optionLabel})` : ''}
                        {item.redeemedByLoyalty && (
                          <span className="ml-1.5 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                            Free · -{item.loyaltyPointsCost || 0} pts
                          </span>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-slate-900 shrink-0">
                        {item.coveredByPack
                          ? '$0.00 (Pack)'
                          : item.redeemedByLoyalty
                            ? '$0.00 (Loyalty)'
                            : `$${(item.unitPriceUsd * item.qty).toFixed(2)}`}
                        {item.redeemedByLoyalty && (
                          <button
                            type="button"
                            onClick={() => removeRedeemedLoyaltyItem(order.id, item.id)}
                            aria-label={`Remove redeemed ${item.nameEn}`}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 space-y-1.5 text-xs tabular-nums">
                <div className="flex justify-between text-slate-600">
                  <span>Items subtotal</span>
                  <span>${totals.subtotalUsd.toFixed(2)}</span>
                </div>

                {/* Discount control */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowDiscountBox((v) => !v)}
                    className="text-emerald-800 font-semibold hover:underline"
                  >
                    + Discount {order.manualDiscountPercent > 0 ? `(${order.manualDiscountPercent}%)` : ''}
                  </button>
                  <span className="text-emerald-700">
                    {totals.discountTotalUsd > 0 ? `-$${totals.discountTotalUsd.toFixed(2)}` : '—'}
                  </span>
                </div>

                {showDiscountBox && (
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(Number(e.target.value))}
                        placeholder="%"
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <input
                        type="password"
                        value={managerPin}
                        onChange={(e) => setManagerPin(e.target.value)}
                        placeholder="Manager PIN (>10%)"
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleApplyDiscount}
                        className="rounded bg-emerald-800 px-2.5 py-1 text-xs font-semibold text-white"
                      >
                        Apply
                      </button>
                    </div>
                    {pinError && <p className="text-[11px] text-red-600">{pinError}</p>}
                  </div>
                )}

                {autoPromo.promotion && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Auto promo: {autoPromo.promotion.nameEn}</span>
                    <span>-${autoPromo.discountUsd.toFixed(2)}</span>
                  </div>
                )}

                {pointsDiscountUsd > 0 && (
                  <div className="flex justify-between text-amber-800 font-medium">
                    <span>Points discount ({discountPointsUsed} pts)</span>
                    <span>-${pointsDiscountUsd.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-600">
                  <span>VAT {activeBranch.vatPercent}%</span>
                  <span>${totals.vatUsd.toFixed(2)}</span>
                </div>

                {totals.depositAppliedUsd > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Booking deposit credited</span>
                    <span>-${totals.depositAppliedUsd.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Customer Loyalty Search, Accrual Preview & Redemption */}
              <div className="mt-4 space-y-2">
                <div className="relative">
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                    <Search className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <input
                      type="text"
                      value={memberPhone}
                      onFocus={() => setShowMemberPicker(true)}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMemberPhone(val);
                        setShowMemberPicker(true);
                        if (!val.trim()) {
                          setRedeemPoints(0);
                          attachMemberToOrder(order.id, '', 0);
                        } else {
                          const direct = findMemberByPhone(state.members, val);
                          if (direct) {
                            attachMemberToOrder(order.id, direct.phone, redeemPoints);
                          }
                        }
                      }}
                      placeholder="Customer phone or name (e.g. Dara)"
                      className="flex-1 text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoyaltyScanner(true)}
                      aria-label="Scan customer loyalty QR code"
                      title="Scan loyalty QR"
                      className="rounded p-1 text-amber-600 hover:bg-amber-50"
                    >
                      <ScanLine className="h-4 w-4" />
                    </button>
                    {(memberPhone || matchedMember) && (
                      <button
                        type="button"
                        aria-label="Clear loyalty customer"
                        onClick={() => {
                          setMemberPhone('');
                          setRedeemPoints(0);
                          setShowMemberPicker(false);
                          setShowQuickEnroll(false);
                          attachMemberToOrder(order.id, '', 0);
                        }}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {showMemberPicker && !matchedMember && memberSearchResults.length > 0 && (
                    <div className="mt-1 rounded-lg border border-slate-200 bg-white shadow-sm divide-y divide-slate-100 max-h-36 overflow-y-auto">
                      {memberSearchResults.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setMemberPhone(m.phone);
                            setShowMemberPicker(false);
                            setShowQuickEnroll(false);
                            attachMemberToOrder(order.id, m.phone, redeemPoints);
                          }}
                          className="w-full px-2.5 py-1.5 text-left text-[11px] flex items-center justify-between hover:bg-amber-50/70"
                        >
                          <span>
                            <strong className="text-slate-900">{m.name}</strong>{' '}
                            <span className="font-mono text-slate-500">{m.phone}</span>
                          </span>
                          <span className="font-semibold text-amber-800 tabular-nums">
                            {m.tier} · {m.points} pts
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {!matchedMember &&
                  /^\+?[\d\s()-]{6,}$/.test(memberPhone.trim()) &&
                  memberSearchResults.length === 0 && (
                  <div className="rounded-lg border border-slate-200 bg-white p-2 text-[11px] space-y-1.5">
                    {!showQuickEnroll ? (
                      <button
                        type="button"
                        onClick={() => setShowQuickEnroll(true)}
                        className="w-full flex items-center justify-center gap-1.5 font-semibold text-emerald-800 hover:underline"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Quick enroll "{memberPhone.trim()}" into loyalty
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={quickEnrollName}
                          onChange={(e) => setQuickEnrollName(e.target.value)}
                          placeholder="Customer full name"
                          className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const digits = normalizeCustomerPhone(memberPhone);
                            const nameToUse = quickEnrollName.trim() || 'Guest Member';
                            const phoneToUse = digits.length >= 6 ? digits : '';
                            if (!phoneToUse) return;
                            const created = addLoyaltyMember({
                              name: nameToUse,
                              phone: phoneToUse,
                              initialPoints: 20,
                            });
                            if (created) {
                              setMemberPhone(created.phone);
                              setQuickEnrollName('');
                              setShowQuickEnroll(false);
                              setShowMemberPicker(false);
                              attachMemberToOrder(order.id, created.phone, 0);
                            }
                          }}
                          className="rounded bg-emerald-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-900"
                        >
                          Enroll
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {matchedMember && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-2.5 text-[11px] space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />
                          <span>{matchedMember.name}</span>
                          <span className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                            {matchedMember.tier}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-600 tabular-nums mt-0.5">
                          Balance: <strong>{remainingPointsBalance} pts</strong> left
                          {(itemPointsUsed > 0 || discountPointsUsed > 0) && (
                            <span> ({matchedMember.points} total)</span>
                          )}
                        </div>
                      </div>
                      <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900 tabular-nums shrink-0">
                        {!activeBranch.pointsEnabled
                          ? 'Points paused'
                          : state.offlineMode
                            ? `+${estimatedEarnPoints} pts (offline)`
                            : `+${estimatedEarnPoints} pts earn`}
                      </span>
                    </div>

                    {activeBranch.pointsEnabled && availablePointsForDiscount >= 50 && (
                      <div className="space-y-1 pt-1 border-t border-amber-200/70">
                        <div className="flex items-center justify-between text-[10px] font-semibold text-amber-950">
                          <span>
                            Redeem discount (100 pts = ${activeBranch.pointsValuePer100.toFixed(2)})
                          </span>
                          {discountPointsUsed > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setRedeemPoints(0);
                                attachMemberToOrder(order.id, matchedMember.phone, 0);
                              }}
                              className="text-red-700 hover:underline"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {[50, 100, 200].map((pts) => {
                            const disabled =
                              pts > availablePointsForDiscount || pts > maxDiscountPoints;
                            const active = discountPointsUsed === pts;
                            const offUsd = calculatePointsDiscountUsd(
                              pts,
                              activeBranch.pointsValuePer100
                            );
                            return (
                              <button
                                key={pts}
                                type="button"
                                disabled={disabled}
                                onClick={() => {
                                  const next = active ? 0 : pts;
                                  setRedeemPoints(next);
                                  attachMemberToOrder(order.id, matchedMember.phone, next);
                                }}
                                className={`rounded border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                                  active
                                    ? 'border-amber-800 bg-amber-800 text-white'
                                    : 'border-amber-300 bg-white text-amber-950 hover:bg-amber-100 disabled:opacity-40'
                                }`}
                              >
                                {pts} pts (-${offUsd.toFixed(2)})
                              </button>
                            );
                          })}
                          {maxDiscountPoints > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setRedeemPoints(maxDiscountPoints);
                                attachMemberToOrder(order.id, matchedMember.phone, maxDiscountPoints);
                              }}
                              className={`rounded border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                                discountPointsUsed === maxDiscountPoints
                                  ? 'border-amber-800 bg-amber-800 text-white'
                                  : 'border-amber-300 bg-white text-amber-950 hover:bg-amber-100'
                              }`}
                            >
                              Max ({maxDiscountPoints})
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {activeBranch.pointsEnabled && activeBranchRewards.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-amber-200/70">
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-950">
                          <Gift className="h-3 w-3" />
                          <span>Redeem free item</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          {activeBranchRewards.slice(0, 4).map((rw) => {
                            const canAfford = remainingPointsBalance >= rw.pointsCost;
                            const inCart = order.items.some(
                              (it) =>
                                !it.voided &&
                                !it.coveredByPack &&
                                !it.redeemedByLoyalty &&
                                it.menuItemId === rw.menuItemId
                            );
                            return (
                              <button
                                key={rw.id}
                                type="button"
                                disabled={!canAfford}
                                onClick={() => redeemLoyaltyItem(order.id, rw.id)}
                                className="flex items-center justify-between gap-1 rounded border border-amber-300 bg-white px-2 py-1 text-left text-[10px] hover:bg-amber-100 disabled:opacity-40"
                              >
                                <span className="truncate font-semibold text-slate-800">
                                  {rw.name}
                                  {inCart ? ' (cover)' : ''}
                                </span>
                                <span className="font-bold text-amber-900 tabular-nums shrink-0">
                                  {rw.pointsCost}p
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {matchingPack && (
                  <button
                    type="button"
                    onClick={() => applyPrepaidPack(order.id, matchingPack.id)}
                    className="w-full flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Ticket className="h-3.5 w-3.5" />
                      Use prepaid pack: {matchingPack.packName} ({matchingPack.usesLeft} left)
                    </span>
                    <span>Apply</span>
                  </button>
                )}

                <div className="flex items-center gap-1.5">
                  <div className="flex-1 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                    <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      value={promoCodeInput}
                      onChange={(e) => setPromoCodeInput(e.target.value)}
                      placeholder="Promo code (e.g. SANG35)"
                      className="flex-1 text-xs focus:outline-none uppercase"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setOrderPromoCode(order.id, promoCodeInput)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>

            {/* Dark Total Banner */}
            <div className="rounded-xl bg-[#0F241E] p-4 text-white tabular-nums">
              <div className="text-xs text-emerald-200">Amount due</div>
              <div className="mt-0.5 text-3xl font-bold">${totals.totalUsd.toFixed(2)}</div>
              <div className="text-sm font-semibold text-amber-300">
                {totals.totalKhr.toLocaleString()} ៛
              </div>
              <div className="mt-1 text-[11px] text-emerald-200/80">
                Rate {activeBranch.exchangeRate.toLocaleString()} · rounded to {activeBranch.rielRounding} ៛
              </div>
            </div>
          </div>

          {/* Right Payment Method & Keypad */}
          <div className="lg:col-span-7 p-5 flex flex-col justify-between gap-4">
            <div>
              {/* Top Amount Due + Guest pays in */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <div className="text-xs text-slate-500">Amount due</div>
                  <div className="text-xl font-bold text-slate-900 tabular-nums">
                    ${totals.totalUsd.toFixed(2)}{' '}
                    <span className="text-amber-700">= {totals.totalKhr.toLocaleString()} ៛</span>
                  </div>
                </div>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
                  {(['USD', 'KHR', 'BOTH'] as const).map((gc) => (
                    <button
                      key={gc}
                      type="button"
                      onClick={() => {
                        setGuestCurrency(gc);
                        setActiveField(gc === 'KHR' ? 'KHR' : 'USD');
                      }}
                      className={`px-2.5 py-1 rounded-md ${
                        guestCurrency === gc ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      {gc === 'USD' ? '$ USD' : gc === 'KHR' ? '៛ Riel' : 'USD + Riel'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Method Tabs */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {(
                  [
                    { id: 'Cash', label: 'Cash', sub: 'USD + ៛', icon: Banknote },
                    { id: 'KHQR', label: 'KHQR', sub: 'Bakong · ABA', icon: QrCode },
                    { id: 'Bank transfer', label: 'Bank transfer', sub: 'Reference', icon: Building2 },
                    { id: 'Card', label: 'Card', sub: 'POS terminal', icon: CreditCard },
                  ] as const
                ).map((m) => {
                  const Icon = m.icon;
                  const active = payMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPayMethod(m.id)}
                      className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-colors ${
                        active
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="h-4 w-4 mb-1" />
                      <span className="text-xs font-semibold">{m.label}</span>
                      <span className={`text-[10px] ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                        {m.sub}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Cash UI */}
              {payMethod === 'Cash' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveField('USD')}
                      className={`rounded-xl border p-3 text-left ${
                        activeField === 'USD' ? 'border-emerald-700 bg-emerald-50/40' : 'border-slate-200'
                      }`}
                    >
                      <div className="text-[11px] font-medium text-slate-500">USD received</div>
                      <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                        ${usdInput || '0'}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveField('KHR')}
                      className={`rounded-xl border p-3 text-left ${
                        activeField === 'KHR' ? 'border-emerald-700 bg-emerald-50/40' : 'border-slate-200'
                      }`}
                    >
                      <div className="text-[11px] font-medium text-slate-500">Riel received</div>
                      <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                        {(parseFloat(khrInput) || 0).toLocaleString()} ៛
                      </div>
                    </button>
                  </div>

                  {/* Quick Cash Buttons (USD + Cambodian Riel) */}
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-5 gap-2 text-xs font-semibold tabular-nums">
                      <button
                        type="button"
                        onClick={() => {
                          setUsdInput(totals.totalUsd.toFixed(2));
                          setKhrInput('');
                          setActiveField('USD');
                        }}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 py-2 text-emerald-900 hover:bg-emerald-100"
                      >
                        Exact ${totals.totalUsd.toFixed(2)}
                      </button>
                      {[10, 20, 50, 100].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => {
                            setUsdInput(String(amt));
                            setActiveField('USD');
                          }}
                          className="rounded-lg border border-slate-200 bg-slate-50 py-2 text-slate-800 hover:bg-slate-100"
                        >
                          ${amt}.00
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-[11px] font-semibold tabular-nums">
                      <button
                        type="button"
                        onClick={() => {
                          setUsdInput('');
                          setKhrInput(String(totals.totalKhr));
                          setActiveField('KHR');
                        }}
                        className="rounded-lg border border-amber-300 bg-amber-50 py-1.5 text-amber-950 hover:bg-amber-100"
                      >
                        Exact {totals.totalKhr.toLocaleString()}៛
                      </button>
                      {[10000, 20000, 50000, 100000].map((riel) => (
                        <button
                          key={riel}
                          type="button"
                          onClick={() => {
                            setKhrInput(String(riel));
                            setActiveField('KHR');
                          }}
                          className="rounded-lg border border-slate-200 bg-white py-1.5 text-slate-700 hover:bg-slate-50"
                        >
                          {(riel / 1000).toFixed(0)}k ៛
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Keypad + Change Summary */}
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-7 grid grid-cols-3 gap-2">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'BACK'].map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => handleKeypad(k)}
                          className="h-11 rounded-lg border border-slate-200 bg-white font-mono text-base font-semibold text-slate-800 hover:bg-slate-50 flex items-center justify-center"
                        >
                          {k === 'BACK' ? <Delete className="h-4 w-4" /> : k}
                        </button>
                      ))}
                    </div>

                    <div className="col-span-5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex flex-col justify-between tabular-nums">
                      <div>
                        <div className="text-[11px] text-slate-500">Applied to bill</div>
                        <div className="text-base font-bold text-slate-900">
                          ${cashCalc.appliedUsd.toFixed(2)}
                        </div>
                      </div>

                      {!cashCalc.isSettled ? (
                        <div>
                          <div className="text-[11px] text-red-600 font-semibold">Still short</div>
                          <div className="text-sm font-bold text-red-700">
                            ${cashCalc.shortUsd.toFixed(2)} · {cashCalc.shortKhr.toLocaleString()} ៛
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-[11px] text-emerald-700 font-semibold">
                            Change (whole $ + Riel)
                          </div>
                          <div className="text-lg font-bold text-emerald-900">
                            ${cashCalc.changeWholeUsd} + {cashCalc.changeKhr.toLocaleString()} ៛
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setUsdInput('');
                          setKhrInput('');
                        }}
                        className="text-left text-xs text-slate-500 underline"
                      >
                        Clear amounts
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* KHQR UI with NBC EMVCo TLV + Bakong Open API check */}
              {payMethod === 'KHQR' && !khqrResult && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-3">
                  <div className="flex items-start gap-3">
                    <QrCode className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs">
                      <h3 className="font-bold text-slate-900">
                        Bakong KHQR Merchant Configuration Not Set (Optional)
                      </h3>
                      <p className="text-slate-600 leading-relaxed">
                        This store has not added a Bakong receiving Account ID yet. You can accept Cash, Bank transfer, or Card right away, or set up your optional Bakong Account ID in Settings.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setNavSection('settings');
                        onClose();
                      }}
                      className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Configure Bakong KHQR in Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayMethod('Cash')}
                      className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Use Cash Instead
                    </button>
                  </div>
                </div>
              )}

              {payMethod === 'KHQR' && khqrResult && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                  <div className="mx-auto w-full max-w-[240px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="bg-[#C81E1E] py-2 px-3 flex items-center justify-between text-white">
                      <span className="text-sm font-bold tracking-wider">KHQR</span>
                      <span className="text-[10px] font-mono opacity-90">
                        {khqrCurrency === 'KHR' ? 'KHR 116' : 'USD 840'}
                      </span>
                    </div>
                    <div className="p-3.5 text-center">
                      <div className="text-[11px] font-semibold text-slate-700 truncate">
                        {activeBranch.khqrAccountName}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mb-2 truncate">
                        {activeBranch.khqrBakongId}
                      </div>
                      <QrCodeBox value={khqrResult.qrString} size={145} label="Bakong KHQR Payment Code" />
                      <div className="mt-2 text-lg font-bold tabular-nums text-slate-900">
                        {khqrCurrency === 'KHR'
                          ? `${totalKhrDue.toLocaleString()} ៛`
                          : `$${totals.totalUsd.toFixed(2)}`}
                      </div>
                      <div className="text-xs font-medium tabular-nums text-slate-500">
                        {khqrCurrency === 'KHR'
                          ? `≈ $${totals.totalUsd.toFixed(2)}`
                          : `= ${totalKhrDue.toLocaleString()} ៛`}
                      </div>
                      <p className="mt-1.5 text-[10px] text-slate-500 font-mono">
                        CRC {khqrResult.crc} · {khqrResult.accountType}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="text-[11px] font-semibold text-slate-600 mb-1">
                        KHQR Settlement Currency
                      </div>
                      <div className="inline-flex w-full rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => {
                            setKhqrCurrency('USD');
                            setKhqrStatusMsg('');
                            setKhqrError('');
                          }}
                          className={`flex-1 py-1.5 rounded-md transition-colors ${
                            khqrCurrency === 'USD'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600'
                          }`}
                        >
                          USD (840)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setKhqrCurrency('KHR');
                            setKhqrStatusMsg('');
                            setKhqrError('');
                          }}
                          className={`flex-1 py-1.5 rounded-md transition-colors ${
                            khqrCurrency === 'KHR'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600'
                          }`}
                        >
                          KHR (116)
                        </button>
                      </div>
                    </div>

                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950 space-y-1">
                      <div className="font-semibold flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                        Auto-listening Bakong KHQR ({activeBranch.khqrAccountType || 'individual'})
                      </div>
                      <p className="text-[11px] text-emerald-800">
                        Polling every 3s for Bakong callback. Order #ORD-{order.orderNumber} marks Paid automatically once scanned &amp; confirmed.
                      </p>
                      <div className="text-[10px] font-mono text-emerald-800 pt-0.5">
                        MD5 ref: {khqrResult.md5.slice(0, 16)}…
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={checkingKhqr}
                        onClick={() => void handleCheckKhqrStatus(false)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${checkingKhqr ? 'animate-spin' : ''}`} />
                        Check Bakong Status
                      </button>
                      <button
                        type="button"
                        disabled={checkingKhqr}
                        onClick={() => void handleCheckKhqrStatus(true)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Confirm Paid (Sandbox)
                      </button>
                    </div>

                    {khqrStatusMsg && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                        {khqrStatusMsg}
                      </div>
                    )}
                    {khqrError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                        {khqrError}
                      </div>
                    )}

                    <div>
                      <label htmlFor="khqr-tx-ref" className="block text-xs font-semibold text-slate-700 mb-1">
                        Transaction ID (optional)
                      </label>
                      <input
                        id="khqr-tx-ref"
                        type="text"
                        value={txRef}
                        onChange={(e) => setTxRef(e.target.value)}
                        placeholder="e.g. ABA 100FT3329018"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Bank transfer / Card */}
              {(payMethod === 'Bank transfer' || payMethod === 'Card') && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-600">
                    Collecting full amount <strong>${totals.totalUsd.toFixed(2)}</strong> via{' '}
                    <strong>{payMethod}</strong>.
                  </p>
                  <div>
                    <label htmlFor="card-tx-ref" className="block text-xs font-semibold text-slate-700 mb-1">
                      Terminal / Transfer Reference
                    </label>
                    <input
                      id="card-tx-ref"
                      type="text"
                      value={txRef}
                      onChange={(e) => setTxRef(e.target.value)}
                      placeholder="Approval code or bank reference"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="text-[11px] text-slate-500">
                Esc: close · USD pays first, Riel covers the rest
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    (payMethod === 'Cash' && !cashCalc.isSettled) ||
                    (payMethod === 'KHQR' && !khqrResult)
                  }
                  onClick={handleConfirmPayment}
                  className="rounded-lg bg-[#0B5D47] px-5 py-2 text-xs font-semibold text-white hover:bg-[#094A38] disabled:opacity-45"
                >
                  {payMethod === 'Cash' && !cashCalc.isSettled
                    ? 'Enter amount received'
                    : payMethod === 'KHQR' && !khqrResult
                      ? 'Configure KHQR in Settings'
                      : `Received $${totals.totalUsd.toFixed(2)} · confirm`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showLoyaltyScanner && (
        <LoyaltyQrScanner
          onDetected={handleLoyaltyQrDetected}
          onClose={() => setShowLoyaltyScanner(false)}
        />
      )}
    </div>
  );
}
