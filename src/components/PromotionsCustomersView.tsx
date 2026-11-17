import React, { useEffect, useState } from 'react';
import {
  Tag,
  Gift,
  Users,
  Send,
  Sparkles,
  Plus,
  Ban,
  Search,
  Award,
  History,
  X,
  Settings2,
  QrCode,
  Printer,
  TrendingUp,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import type { PromotionRule } from '../utils/posMath';
import type { MemberCustomer } from '../types/pos';
import { getNextTierProgress, searchMembers } from '../utils/loyaltyEngine';
import { buildLoyaltyQrPayload, summarizeLoyaltyProgram } from '../utils/loyaltyQr';
import { QrCodeBox } from './QrCodeBox';

type PromoSubTab = 'promotions' | 'prepaid' | 'members' | 'campaign';

export function PromotionsCustomersView() {
  const {
    state,
    activeBranch,
    togglePromotion,
    addPromotion,
    addPrepaidTemplate,
    sellPrepaidPack,
    voidCustomerPack,
    addLoyaltyMember,
    adjustMemberPoints,
    saveLoyaltyReward,
    toggleLoyaltyReward,
    updateLoyaltyRules,
  } = usePos();

  const [subTab, setSubTab] = useState<PromoSubTab>('promotions');

  const catalogCategories = Array.from(
    new Set(
      state.menuItems
        .filter((m) => m.branchId === activeBranch.id)
        .map((m) => m.category)
    )
  );

  // New promotion
  const [promoName, setPromoName] = useState('');
  const [promoType, setPromoType] = useState<PromotionRule['type']>('bill_discount');
  const [promoPct, setPromoPct] = useState('15');
  const [promoCode, setPromoCode] = useState('');

  // New prepaid template & sell form
  const [packName, setPackName] = useState('');
  const [packUses, setPackUses] = useState('5');
  const [packPrice, setPackPrice] = useState('9.50');
  const [packCategories, setPackCategories] = useState<string[]>([]);
  const [sellTplId, setSellTplId] = useState(state.prepaidTemplates[0]?.id || '');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');

  // New Loyalty Member enrollment & management
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberBonusPts, setMemberBonusPts] = useState('20');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('50');
  const [adjustReason, setAdjustReason] = useState('VIP appreciation bonus');

  // Loyalty earn/redeem rules & free-item rewards
  const [pointsEnabledDraft, setPointsEnabledDraft] = useState(activeBranch.pointsEnabled);
  const [pointsPerDollarDraft, setPointsPerDollarDraft] = useState(
    String(activeBranch.pointsPerDollar)
  );
  const [pointsValueDraft, setPointsValueDraft] = useState(
    String(activeBranch.pointsValuePer100)
  );
  const branchMenuItems = state.menuItems.filter(
    (m) => m.branchId === activeBranch.id && m.active
  );
  const [rewardMenuItemId, setRewardMenuItemId] = useState(branchMenuItems[0]?.id || '');
  const [rewardTitle, setRewardTitle] = useState('');
  const [rewardCost, setRewardCost] = useState('150');

  // AI Telegram campaign writer
  const [campPromo, setCampPromo] = useState('Happy Hour 14:00–17:00');
  const [campAudience, setCampAudience] = useState('Gold & Silver Members');
  const [campOffer, setCampOffer] = useState('20% off all iced coffee & drinks');
  const [campMessage, setCampMessage] = useState('');
  const [campTime, setCampTime] = useState('');
  const [campLoading, setCampLoading] = useState(false);
  const [campSent, setCampSent] = useState(false);

  // Printable loyalty card sheet (hidden on screen, visible when printing)
  const [printCardMember, setPrintCardMember] = useState<MemberCustomer | null>(null);

  useEffect(() => {
    const clearPrintCard = () => setPrintCardMember(null);
    window.addEventListener('afterprint', clearPrintCard);
    return () => window.removeEventListener('afterprint', clearPrintCard);
  }, []);

  const handleAddPromo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoName.trim()) return;
    addPromotion({
      nameEn: promoName.trim(),
      nameKh: promoName.trim(),
      type: promoType,
      discountPercent: Number(promoPct) || 10,
      code: promoCode.trim() ? promoCode.trim().toUpperCase() : undefined,
      active: true,
    });
    setPromoName('');
    setPromoCode('');
  };

  const handleAddPackTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!packName.trim()) return;
    addPrepaidTemplate({
      name: packName.trim(),
      totalUses: Math.max(1, Number(packUses) || 5),
      priceUsd: Math.max(1, Number(packPrice) || 10),
      validDays: 60,
      categories:
        packCategories.length > 0
          ? packCategories
          : catalogCategories.length > 0
            ? [catalogCategories[0]]
            : ['Coffee & tea'],
      active: true,
    });
    setPackName('');
    setPackCategories([]);
  };

  const handleSellPack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellTplId || !buyerName.trim() || !buyerPhone.trim()) return;
    sellPrepaidPack(sellTplId, buyerName.trim(), buyerPhone.trim());
    setBuyerName('');
    setBuyerPhone('');
  };

  const handlePrintLoyaltyCard = (member: MemberCustomer) => {
    setPrintCardMember(member);
    // Give the print-only sheet a tick to mount before opening the dialog.
    window.setTimeout(() => window.print(), 80);
  };

  const handleDraftCampaign = async () => {
    setCampLoading(true);
    setCampSent(false);
    try {
      const res = await fetch('/api/ai/promo-writer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promoName: campPromo,
          targetAudience: campAudience,
          discountDetail: campOffer,
        }),
      });
      const data = (await res.json()) as { message?: string; suggestedSendTime?: string };
      setCampMessage(data.message || '');
      setCampTime(data.suggestedSendTime || '11:15 AM');
    } catch {
      setCampMessage(
        `${activeBranch.name}: ${campPromo} — ${campOffer}! Show this message on your next visit.`
      );
      setCampTime('11:15 AM');
    } finally {
      setCampLoading(false);
    }
  };

  return (
    <>
    <div
      className={`p-4 sm:p-6 max-w-7xl mx-auto space-y-5 ${
        printCardMember ? 'no-print' : ''
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Promotions, packs &amp; loyalty</h1>
          <p className="text-xs text-slate-500">
            Auto-applied promos, prepaid coffee/meal bundles, member tiers, and Telegram campaigns
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['promotions', 'Promotions'],
              ['prepaid', 'Prepaid packages'],
              ['members', 'Members & points'],
              ['campaign', 'Message guests'],
            ] as [PromoSubTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                subTab === id
                  ? 'bg-emerald-800 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'promotions' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Tag className="h-4 w-4 text-emerald-800" />
              Active &amp; paused rules
            </h2>
            <div className="space-y-2.5">
              {state.promotions.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">{p.nameEn}</div>
                    <div className="text-slate-500 mt-0.5">
                      Type: {p.type.replace('_', ' ')}
                      {p.discountPercent ? ` · ${p.discountPercent}% off` : ''}
                      {p.discountUsd ? ` · $${p.discountUsd.toFixed(2)} off` : ''}
                      {p.code ? ` · Code: ${p.code}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePromotion(p.id)}
                    className={`rounded-lg px-3 py-1.5 font-semibold ${
                      p.active
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {p.active ? 'Active' : 'Paused'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleAddPromo}
            className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-900">Create promotion</h2>
            <input
              required
              placeholder="Promotion name"
              value={promoName}
              onChange={(e) => setPromoName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <select
              aria-label="Promotion type"
              value={promoType}
              onChange={(e) => setPromoType(e.target.value as PromotionRule['type'])}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            >
              <option value="bill_discount">Bill discount (%)</option>
              <option value="happy_hour">Happy hour (%)</option>
              <option value="promo_code">Promo code</option>
              <option value="buy_x_get_y">Buy X get Y</option>
            </select>
            <input
              type="number"
              placeholder="Discount %"
              value={promoPct}
              onChange={(e) => setPromoPct(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs tabular-nums"
            />
            {promoType === 'promo_code' && (
              <input
                placeholder="Code (e.g. LOTUS15)"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs uppercase font-mono"
              />
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-800 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
            >
              Save Promotion
            </button>
          </form>
        </div>
      )}

      {subTab === 'prepaid' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-4">
            <form
              onSubmit={handleSellPack}
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
            >
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Gift className="h-4 w-4 text-emerald-800" />
                Sell prepaid pack
              </h2>
              <select
                aria-label="Pack template"
                value={sellTplId}
                onChange={(e) => setSellTplId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              >
                {state.prepaidTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (${t.priceUsd.toFixed(2)} · {t.totalUses} uses)
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="Customer name"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                required
                placeholder="Phone (e.g. 012 345 678)"
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-800 py-2 text-xs font-semibold text-white"
              >
                Issue Prepaid Pack
              </button>
            </form>

            <form
              onSubmit={handleAddPackTemplate}
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5"
            >
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> New pack template
              </h3>
              <input
                required
                placeholder="e.g. 10 Iced Coffees"
                value={packName}
                onChange={(e) => setPackName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Uses"
                  value={packUses}
                  onChange={(e) => setPackUses(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs tabular-nums"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Price $"
                  value={packPrice}
                  onChange={(e) => setPackPrice(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs tabular-nums"
                />
              </div>
              {catalogCategories.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-slate-600">Eligible categories:</div>
                  <div className="flex flex-wrap gap-1">
                    {catalogCategories.map((cat) => {
                      const selected = packCategories.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() =>
                            setPackCategories((prev) =>
                              prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                            )
                          }
                          className={`rounded-md px-2 py-0.5 text-[11px] border ${
                            selected
                              ? 'border-emerald-700 bg-emerald-50 text-emerald-900 font-semibold'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <button
                type="submit"
                className="w-full rounded-lg border border-slate-300 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Add Template
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900 mb-3">Customer pack balances</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Code</th>
                    <th className="py-2 pr-3 font-semibold">Customer</th>
                    <th className="py-2 pr-3 font-semibold">Pack</th>
                    <th className="py-2 pr-3 font-semibold text-right">Uses left</th>
                    <th className="py-2 pr-3 font-semibold">Valid until</th>
                    <th className="py-2 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.customerPacks.map((cp) => (
                    <tr key={cp.id}>
                      <td className="py-2 pr-3 font-mono font-semibold">{cp.code}</td>
                      <td className="py-2 pr-3">
                        <div className="font-semibold">{cp.customerName}</div>
                        <div className="text-[11px] text-slate-500">{cp.phone}</div>
                      </td>
                      <td className="py-2 pr-3">{cp.packName}</td>
                      <td className="py-2 pr-3 text-right font-bold tabular-nums">
                        {cp.usesLeft} / {cp.totalUses}
                      </td>
                      <td className="py-2 pr-3 text-slate-500">{cp.validUntil}</td>
                      <td className="py-2 text-right">
                        {cp.active ? (
                          <button
                            type="button"
                            onClick={() => voidCustomerPack(cp.id)}
                            className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                          >
                            <Ban className="h-3 w-3" /> Void
                          </button>
                        ) : (
                          <span className="text-slate-400">Voided</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'members' && (() => {
        const filteredMembers = searchMembers(state.members, memberSearch);
        const branchRewards = (state.loyaltyRewards || []).filter(
          (r) => r.branchId === activeBranch.id
        );
        const inspectedMember = selectedMemberId
          ? state.members.find((m) => m.id === selectedMemberId) || null
          : null;
        const loyaltySummary = summarizeLoyaltyProgram({
          members: state.members,
          pointsValuePer100: activeBranch.pointsValuePer100,
        });

        return (
          <div className="space-y-4">
            {/* Loyalty Points Tracking Overview */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-800" />
                  Loyalty points tracking
                </h2>
                <span className="text-[11px] text-slate-500">
                  Members earn {activeBranch.pointsPerDollar} pt per $1 automatically when their
                  QR is scanned at checkout
                </span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="text-[11px] text-slate-500">Active members</div>
                  <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                    {loyaltySummary.activeMembers}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {loyaltySummary.goldMembers} Gold · {loyaltySummary.silverMembers} Silver
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <div className="text-[11px] text-emerald-800 font-semibold">
                    Points outstanding
                  </div>
                  <div className="mt-1 text-xl font-bold text-emerald-950 tabular-nums">
                    {loyaltySummary.totalPointsOutstanding.toLocaleString()} pts
                  </div>
                  <div className="text-[11px] text-emerald-700">
                    ≈ ${loyaltySummary.pointsOutstandingValueUsd.toFixed(2)} liability
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="text-[11px] text-slate-500">Points issued</div>
                  <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                    {loyaltySummary.pointsIssued.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {loyaltySummary.earningVisits} earning visits
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="text-[11px] text-slate-500">Points redeemed</div>
                  <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                    {loyaltySummary.pointsRedeemed.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-500">Free items &amp; discounts</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="text-[11px] text-slate-500">Lifetime member spend</div>
                  <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                    ${loyaltySummary.totalLifetimeSpendUsd.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-slate-500">Tracked visits</div>
                </div>
              </div>
            </div>

            {/* Loyalty Program Rules + Free-Item Rewards Catalog */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-emerald-800" />
                    Loyalty earn &amp; redeem rules
                  </h2>
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pointsEnabledDraft}
                      onChange={(e) => setPointsEnabledDraft(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-800 focus:ring-emerald-700"
                    />
                    Active
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">
                      Earn (pts per $1)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={pointsPerDollarDraft}
                      onChange={(e) => setPointsPerDollarDraft(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">
                      100 pts value ($)
                    </label>
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={pointsValueDraft}
                      onChange={(e) => setPointsValueDraft(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-500">
                    Silver ≥ $100 spent (1.25× earn) · Gold ≥ $500 spent (1.5× earn + 250 pt
                    bonus)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateLoyaltyRules({
                        pointsEnabled: pointsEnabledDraft,
                        pointsPerDollar: Math.max(1, Number(pointsPerDollarDraft) || 10),
                        pointsValuePer100: Math.max(0.1, Number(pointsValueDraft) || 1),
                      })
                    }
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Save Rules
                  </button>
                </div>
              </div>

              <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Gift className="h-4 w-4 text-amber-600" />
                    Free-item rewards catalog ({branchRewards.filter((r) => r.active).length} active)
                  </h2>
                  <span className="text-[11px] text-slate-500">Redeemable at checkout</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {branchRewards.map((rw) => (
                    <button
                      key={rw.id}
                      type="button"
                      onClick={() => toggleLoyaltyReward(rw.id)}
                      className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        rw.active
                          ? 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100'
                          : 'border-slate-200 bg-slate-50 text-slate-400 line-through'
                      }`}
                    >
                      <span>{rw.name}</span>
                      <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-amber-900 tabular-nums border border-amber-200">
                        {rw.pointsCost} pts
                      </span>
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const picked = branchMenuItems.find((m) => m.id === rewardMenuItemId) || branchMenuItems[0];
                    if (!picked) return;
                    saveLoyaltyReward({
                      name: rewardTitle.trim() || `Free ${picked.nameEn}`,
                      menuItemId: picked.id,
                      menuItemName: picked.nameEn,
                      pointsCost: Number(rewardCost) || 150,
                      active: true,
                    });
                    setRewardTitle('');
                  }}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2 border-t border-slate-100 text-xs"
                >
                  <select
                    value={rewardMenuItemId}
                    onChange={(e) => setRewardMenuItemId(e.target.value)}
                    className="sm:col-span-5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                  >
                    {branchMenuItems.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nameEn} (${m.priceUsd.toFixed(2)})
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Reward label (e.g. Free Iced Coffee)"
                    value={rewardTitle}
                    onChange={(e) => setRewardTitle(e.target.value)}
                    className="sm:col-span-3 rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                  <input
                    type="number"
                    min={10}
                    step={10}
                    value={rewardCost}
                    onChange={(e) => setRewardCost(e.target.value)}
                    placeholder="Pts"
                    className="sm:col-span-2 rounded-lg border border-slate-300 px-2.5 py-1.5 tabular-nums"
                  />
                  <button
                    type="submit"
                    className="sm:col-span-2 rounded-lg bg-emerald-800 px-2.5 py-1.5 font-semibold text-white hover:bg-emerald-900"
                  >
                    + Reward
                  </button>
                </form>
              </div>
            </div>

            {/* Members Directory */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-800" />
                  Loyalty members &amp; customer profiles ({state.members.length})
                </h2>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs">
                    <Search className="h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search name or phone..."
                      className="w-44 focus:outline-none"
                    />
                  </div>
                  <span className="hidden md:inline text-xs text-slate-600 tabular-nums">
                    Earn {activeBranch.pointsPerDollar} pt/$1 · 100 pts = $
                    {activeBranch.pointsValuePer100.toFixed(2)}
                  </span>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!memberName.trim() || !memberPhone.trim()) return;
                  addLoyaltyMember({
                    name: memberName,
                    phone: memberPhone,
                    initialPoints: Number(memberBonusPts) || 0,
                  });
                  setMemberName('');
                  setMemberPhone('');
                }}
                className="grid grid-cols-1 sm:grid-cols-4 gap-2 rounded-xl bg-slate-50 border border-slate-200 p-3"
              >
                <input
                  required
                  placeholder="Customer full name"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                />
                <input
                  required
                  placeholder="Phone (e.g. 012 888 999)"
                  value={memberPhone}
                  onChange={(e) => setMemberPhone(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Welcome bonus pts"
                  value={memberBonusPts}
                  onChange={(e) => setMemberBonusPts(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs tabular-nums"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900"
                >
                  <Plus className="h-3.5 w-3.5" /> Enroll Member
                </button>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Member</th>
                      <th className="py-2 pr-3 font-semibold">Phone</th>
                      <th className="py-2 pr-3 font-semibold">Tier</th>
                      <th className="py-2 pr-3 font-semibold text-right">Points</th>
                      <th className="py-2 pr-3 font-semibold text-right">Total Spent</th>
                      <th className="py-2 pr-3 font-semibold text-right">Last Visit</th>
                      <th className="py-2 font-semibold text-right">Card &amp; Profile</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMembers.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 pr-3 font-semibold text-slate-900">{m.name}</td>
                        <td className="py-2.5 pr-3 font-mono">{m.phone}</td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                              m.tier === 'Gold'
                                ? 'bg-amber-100 text-amber-900'
                                : m.tier === 'Silver'
                                  ? 'bg-slate-200 text-slate-800'
                                  : 'bg-emerald-50 text-emerald-800'
                            }`}
                          >
                            {m.tier}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-emerald-800">
                          {m.points.toLocaleString()} pts
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          ${m.totalSpentUsd.toFixed(2)}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-slate-500">{m.lastVisit}</td>
                        <td className="py-2.5 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedMemberId(m.id)}
                              aria-label={`Loyalty QR card for ${m.name}`}
                              title="Loyalty QR card"
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                            >
                              <QrCode className="h-3 w-3" />
                              Card
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedMemberId(m.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              <History className="h-3 w-3" />
                              Profile ({m.loyaltyHistory?.length || 0})
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Customer Loyalty Profile & Points Activity Modal */}
            {inspectedMember && (() => {
              const tierInfo = getNextTierProgress(inspectedMember.totalSpentUsd);
              const history = inspectedMember.loyaltyHistory || [];
              return (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-label={`Customer profile ${inspectedMember.name}`}
                >
                  <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
                    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center">
                          <Award className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-900">
                            {inspectedMember.name}{' '}
                            <span className="ml-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                              {inspectedMember.tier}
                            </span>
                          </h3>
                          <p className="text-xs font-mono text-slate-500">
                            {inspectedMember.phone} · Last visit {inspectedMember.lastVisit}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMemberId(null);
                          setPrintCardMember(null);
                        }}
                        aria-label="Close customer profile"
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                      {/* Loyalty QR Card */}
                      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                        <QrCodeBox
                          value={buildLoyaltyQrPayload(inspectedMember)}
                          size={124}
                          label={`Loyalty QR for ${inspectedMember.name}`}
                        />
                        <div className="min-w-[220px] flex-1">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                            Loyalty QR card
                          </div>
                          <div className="mt-1 text-sm font-bold text-slate-900">
                            {inspectedMember.name}
                            <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                              {inspectedMember.tier}
                            </span>
                          </div>
                          <div className="font-mono text-xs text-slate-500">
                            {inspectedMember.phone}
                          </div>
                          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
                            The customer shows this QR at checkout. Scanning it attaches the
                            member and points are added automatically from the bill total (
                            {activeBranch.pointsPerDollar} pt per $1).
                          </p>
                          <button
                            type="button"
                            onClick={() => handlePrintLoyaltyCard(inspectedMember)}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Print loyalty card
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                          <div className="text-[11px] text-emerald-800 font-semibold">
                            Available Points
                          </div>
                          <div className="text-2xl font-bold text-emerald-950 tabular-nums mt-0.5">
                            {inspectedMember.points.toLocaleString()} pts
                          </div>
                          <div className="text-[11px] text-emerald-700 mt-0.5">
                            Value: $
                            {(
                              (inspectedMember.points / 100) *
                              activeBranch.pointsValuePer100
                            ).toFixed(2)}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="text-[11px] text-slate-500 font-semibold">
                            Lifetime Spend
                          </div>
                          <div className="text-2xl font-bold text-slate-900 tabular-nums mt-0.5">
                            ${inspectedMember.totalSpentUsd.toFixed(2)}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {history.filter((h) => h.type === 'earn').length} earning visits logged
                          </div>
                        </div>

                        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                          <div className="text-[11px] text-amber-900 font-semibold">
                            Tier Progress
                          </div>
                          <div className="text-sm font-bold text-amber-950 mt-1">
                            {tierInfo.nextTier
                              ? `$${tierInfo.remainingUsd.toFixed(2)} to ${tierInfo.nextTier}`
                              : 'Top Gold Tier!'}
                          </div>
                          <div className="mt-2 h-2 w-full rounded-full bg-amber-200 overflow-hidden">
                            <div
                              className="h-full bg-amber-600 rounded-full"
                              style={{ width: `${tierInfo.progressPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Manual Bonus / Point Adjustment */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const delta = Number(adjustDelta);
                          if (!delta) return;
                          adjustMemberPoints(inspectedMember.id, delta, adjustReason);
                        }}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-wrap items-center gap-2 text-xs"
                      >
                        <span className="font-semibold text-slate-700">Adjust points:</span>
                        <input
                          type="number"
                          value={adjustDelta}
                          onChange={(e) => setAdjustDelta(e.target.value)}
                          className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 tabular-nums"
                          placeholder="+50 or -50"
                        />
                        <input
                          type="text"
                          value={adjustReason}
                          onChange={(e) => setAdjustReason(e.target.value)}
                          className="flex-1 min-w-[160px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                          placeholder="Reason (e.g. Birthday bonus)"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800"
                        >
                          Apply Adjustment
                        </button>
                      </form>

                      {/* Points Ledger History */}
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                          Points Activity History
                        </h4>
                        {history.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                            No points transactions recorded yet. Scan this member's loyalty QR at
                            checkout to start earning points automatically.
                          </div>
                        ) : (
                          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-60 overflow-y-auto">
                            {history.map((tx) => (
                              <div
                                key={tx.id}
                                className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-900 truncate">
                                    {tx.description}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {new Date(tx.createdAt).toLocaleString()} ·{' '}
                                    <span className="uppercase font-mono">{tx.type.replace('_', ' ')}</span>
                                  </div>
                                </div>
                                <div className="text-right tabular-nums shrink-0">
                                  <div
                                    className={`font-bold ${
                                      tx.pointsDelta >= 0 ? 'text-emerald-700' : 'text-amber-800'
                                    }`}
                                  >
                                    {tx.pointsDelta >= 0 ? `+${tx.pointsDelta}` : tx.pointsDelta} pts
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    Bal: {tx.balanceAfter} pts
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {subTab === 'campaign' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 max-w-2xl space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Sparkles className="h-4 w-4 text-emerald-700" />
            <span>Draft bilingual Telegram guest message</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Promotion title</label>
              <input
                value={campPromo}
                onChange={(e) => setCampPromo(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Target segment</label>
              <input
                value={campAudience}
                onChange={(e) => setCampAudience(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
          </div>
          <div className="text-xs">
            <label className="block font-semibold text-slate-700 mb-1">Offer details</label>
            <input
              value={campOffer}
              onChange={(e) => setCampOffer(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <button
            type="button"
            disabled={campLoading}
            onClick={() => void handleDraftCampaign()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {campLoading ? 'Drafting...' : 'Generate EN + KH Draft'}
          </button>

          {campMessage && (
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <div className="text-xs text-slate-500">
                Recommended send window: <strong>{campTime}</strong>
              </div>
              <textarea
                rows={4}
                value={campMessage}
                onChange={(e) => setCampMessage(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-3 text-xs"
              />
              <div className="flex items-center justify-between">
                {campSent ? (
                  <span className="text-xs font-semibold text-emerald-700">
                    Queued for {state.members.length} Telegram-linked members.
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">
                    Sends via {activeBranch.telegramChannel}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setCampSent(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                >
                  <Send className="h-3.5 w-3.5" /> Send Campaign
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>

    {/* Print-only loyalty card sheet */}
    {printCardMember && (
      <div className="hidden print:block">
        <div
          style={{
            width: 360,
            border: '2px solid #065f46',
            borderRadius: 14,
            padding: 18,
            fontFamily: 'system-ui, sans-serif',
            color: '#0f172a',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 15 }}>{activeBranch.name}</strong>
            <span style={{ fontSize: 11, color: '#065f46', fontWeight: 700 }}>
              LOYALTY CARD
            </span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
            <QrCodeBox
              value={buildLoyaltyQrPayload(printCardMember)}
              size={190}
              label={`Loyalty QR for ${printCardMember.name}`}
            />
          </div>
          <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700 }}>
            {printCardMember.name}
          </div>
          <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#475569' }}>
            {printCardMember.phone}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: '#334155' }}>
            {printCardMember.tier} · {printCardMember.points.toLocaleString()} pts
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: '#64748b' }}>
            Show this QR at checkout to earn {activeBranch.pointsPerDollar} point
            {activeBranch.pointsPerDollar === 1 ? '' : 's'} per $1 spent. Points are added
            automatically to your balance.
          </div>
        </div>
      </div>
    )}
    </>
  );
}
