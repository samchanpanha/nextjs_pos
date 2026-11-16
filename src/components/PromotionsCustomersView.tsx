import React, { useState } from 'react';
import { Tag, Gift, Users, Send, Sparkles, Plus, Ban } from 'lucide-react';
import { usePos } from '../context/PosContext';
import type { PromotionRule } from '../utils/posMath';

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
  } = usePos();

  const [subTab, setSubTab] = useState<PromoSubTab>('promotions');

  // New promotion
  const [promoName, setPromoName] = useState('');
  const [promoType, setPromoType] = useState<PromotionRule['type']>('bill_discount');
  const [promoPct, setPromoPct] = useState('15');
  const [promoCode, setPromoCode] = useState('');

  // New prepaid template & sell form
  const [packName, setPackName] = useState('');
  const [packUses, setPackUses] = useState('5');
  const [packPrice, setPackPrice] = useState('9.50');
  const [sellTplId, setSellTplId] = useState(state.prepaidTemplates[0]?.id || '');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');

  // AI Telegram campaign writer
  const [campPromo, setCampPromo] = useState('Happy Hour 14:00–17:00');
  const [campAudience, setCampAudience] = useState('Gold & Silver Members');
  const [campOffer, setCampOffer] = useState('20% off all iced coffee & drinks');
  const [campMessage, setCampMessage] = useState('');
  const [campTime, setCampTime] = useState('');
  const [campLoading, setCampLoading] = useState(false);
  const [campSent, setCampSent] = useState(false);

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
      categories: ['Coffee & Drinks'],
      active: true,
    });
    setPackName('');
  };

  const handleSellPack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellTplId || !buyerName.trim() || !buyerPhone.trim()) return;
    sellPrepaidPack(sellTplId, buyerName.trim(), buyerPhone.trim());
    setBuyerName('');
    setBuyerPhone('');
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
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
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

      {subTab === 'members' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-800" />
              Loyalty members &amp; Telegram points ({state.members.length})
            </h2>
            <div className="text-xs text-slate-600 tabular-nums">
              Earn {activeBranch.pointsPerDollar} pt/$1 · Redeem 100 pts = $
              {activeBranch.pointsValuePer100.toFixed(2)} · Bot{' '}
              <span className="font-mono font-semibold">{activeBranch.telegramChannel}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Member</th>
                  <th className="py-2 pr-3 font-semibold">Phone</th>
                  <th className="py-2 pr-3 font-semibold">Tier</th>
                  <th className="py-2 pr-3 font-semibold text-right">Points</th>
                  <th className="py-2 pr-3 font-semibold text-right">Total Spent</th>
                  <th className="py-2 font-semibold text-right">Last Visit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.members.map((m) => (
                  <tr key={m.id}>
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
                    <td className="py-2.5 text-right text-slate-500">{m.lastVisit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
  );
}
