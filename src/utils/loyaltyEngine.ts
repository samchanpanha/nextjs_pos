import type {
  BranchConfig,
  LoyaltyReward,
  LoyaltyTransaction,
  MemberCustomer,
  MenuItem,
  PosOrder,
} from '../types/pos';
import { roundCurrency, type OrderLineItem } from './posMath';

export function normalizeCustomerPhone(phone?: string | null): string {
  if (!phone) return '';
  return phone.replace(/[\s()-]+/g, '').trim();
}

export function findMemberByPhone(
  members: MemberCustomer[],
  phone?: string | null
): MemberCustomer | undefined {
  const target = normalizeCustomerPhone(phone);
  if (!target) return undefined;
  return members.find((m) => normalizeCustomerPhone(m.phone) === target);
}

export function searchMembers(members: MemberCustomer[], query: string): MemberCustomer[] {
  const q = query.trim().toLowerCase();
  const qPhone = normalizeCustomerPhone(query);
  if (!q) return members;
  return members.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      (qPhone.length > 0 && normalizeCustomerPhone(m.phone).includes(qPhone))
  );
}

export type MemberTier = 'Member' | 'Silver' | 'Gold';

/** Points multiplier earned per tier — makes Silver/Gold tangible. */
export const TIER_EARN_MULTIPLIERS: Record<MemberTier, number> = {
  Member: 1,
  Silver: 1.25,
  Gold: 1.5,
};

/** One-time bonus credited when a member moves up a tier. */
export const TIER_UP_BONUS_POINTS: Record<MemberTier, number> = {
  Member: 0,
  Silver: 100,
  Gold: 250,
};

const TIER_RANK: Record<MemberTier, number> = {
  Member: 0,
  Silver: 1,
  Gold: 2,
};

export function getTierEarnMultiplier(tier: MemberTier): number {
  return TIER_EARN_MULTIPLIERS[tier] ?? 1;
}

export function computeMemberTier(totalSpentUsd: number): MemberTier {
  if (totalSpentUsd >= 500) return 'Gold';
  if (totalSpentUsd >= 100) return 'Silver';
  return 'Member';
}

export function getNextTierProgress(totalSpentUsd: number): {
  currentTier: 'Member' | 'Silver' | 'Gold';
  nextTier: 'Silver' | 'Gold' | null;
  remainingUsd: number;
  progressPercent: number;
} {
  const spent = Math.max(0, totalSpentUsd);
  const currentTier = computeMemberTier(spent);
  if (currentTier === 'Gold') {
    return { currentTier, nextTier: null, remainingUsd: 0, progressPercent: 100 };
  }
  if (currentTier === 'Silver') {
    const remainingUsd = roundCurrency(Math.max(0, 500 - spent));
    const progressPercent = Math.min(100, Math.round(((spent - 100) / 400) * 100));
    return { currentTier, nextTier: 'Gold', remainingUsd, progressPercent };
  }
  const remainingUsd = roundCurrency(Math.max(0, 100 - spent));
  const progressPercent = Math.min(100, Math.round((spent / 100) * 100));
  return { currentTier, nextTier: 'Silver', remainingUsd, progressPercent };
}

export function calculatePointsEarned(params: {
  totalUsd: number;
  pointsPerDollar: number;
  pointsEnabled: boolean;
  /** Member tier at the time of the bill; defaults to the base rate. */
  tier?: MemberTier;
  /** Explicit override of the tier multiplier (e.g. promotions). */
  tierMultiplier?: number;
}): number {
  if (!params.pointsEnabled) return 0;
  if (params.totalUsd <= 0 || params.pointsPerDollar <= 0) return 0;
  const multiplier = Math.max(
    0,
    params.tierMultiplier ?? (params.tier ? getTierEarnMultiplier(params.tier) : 1)
  );
  return Math.max(0, Math.floor(params.totalUsd * params.pointsPerDollar * multiplier));
}

export function calculatePointsDiscountUsd(
  pointsRedeemed: number,
  pointsValuePer100 = 1
): number {
  if (pointsRedeemed <= 0 || pointsValuePer100 <= 0) return 0;
  return roundCurrency((pointsRedeemed / 100) * pointsValuePer100);
}

export function getOrderLoyaltyItemPointsUsed(items: OrderLineItem[]): number {
  return items
    .filter((i) => !i.voided && i.redeemedByLoyalty && (i.loyaltyPointsCost ?? 0) > 0)
    .reduce((sum, i) => sum + (i.loyaltyPointsCost ?? 0), 0);
}

export function getMaxRedeemableDiscountPoints(params: {
  memberPoints: number;
  alreadyUsedForItems?: number;
  remainingSubtotalUsd: number;
  pointsValuePer100: number;
  step?: number;
}): number {
  const step = params.step && params.step > 0 ? params.step : 50;
  const available = Math.max(0, params.memberPoints - (params.alreadyUsedForItems ?? 0));
  if (available < step || params.remainingSubtotalUsd <= 0 || params.pointsValuePer100 <= 0) {
    return 0;
  }
  const maxPointsForBill = Math.ceil((params.remainingSubtotalUsd / params.pointsValuePer100) * 100);
  const capped = Math.min(available, maxPointsForBill);
  return Math.floor(capped / step) * step;
}

export function createDefaultLoyaltyRewards(
  branchId: string,
  menuItems: MenuItem[]
): LoyaltyReward[] {
  const branchItems = menuItems.filter((m) => m.branchId === branchId && m.active);
  if (branchItems.length === 0) return [];

  const findByIdOrKeyword = (id: string, keywords: string[]) =>
    branchItems.find((m) => m.id === id) ||
    branchItems.find((m) =>
      keywords.some((kw) => m.nameEn.toLowerCase().includes(kw.toLowerCase()))
    );

  const presets: { item: MenuItem | undefined; name: string; pointsCost: number; idSuffix: string }[] = [
    {
      item: findByIdOrKeyword('m_coffee', ['iced coffee', 'coffee', 'latte']),
      name: 'Free Iced Coffee',
      pointsCost: 150,
      idSuffix: 'coffee',
    },
    {
      item: findByIdOrKeyword('m_spring_rolls', ['spring roll', 'mango salad']),
      name: 'Free Starter Plate',
      pointsCost: 180,
      idSuffix: 'starter',
    },
    {
      item: findByIdOrKeyword('m_mango_rice', ['mango sticky', 'matcha']),
      name: 'Free Dessert / Latte',
      pointsCost: 200,
      idSuffix: 'dessert',
    },
    {
      item: findByIdOrKeyword('m_loklak', ['lok lak', 'amok', 'fried rice']),
      name: 'Free Signature Dish',
      pointsCost: 400,
      idSuffix: 'main',
    },
  ];

  const seenMenuIds = new Set<string>();
  const rewards: LoyaltyReward[] = [];
  for (const preset of presets) {
    if (!preset.item || seenMenuIds.has(preset.item.id)) continue;
    seenMenuIds.add(preset.item.id);
    rewards.push({
      id: `loy_rew_${branchId}_${preset.idSuffix}`,
      branchId,
      name: `Free ${preset.item.nameEn}`,
      menuItemId: preset.item.id,
      menuItemName: preset.item.nameEn,
      pointsCost: preset.pointsCost,
      active: true,
    });
  }

  if (rewards.length === 0 && branchItems[0]) {
    rewards.push({
      id: `loy_rew_${branchId}_1`,
      branchId,
      name: `Free ${branchItems[0].nameEn}`,
      menuItemId: branchItems[0].id,
      menuItemName: branchItems[0].nameEn,
      pointsCost: Math.max(100, Math.round(branchItems[0].priceUsd * 40)),
      active: true,
    });
  }

  return rewards;
}

export function applyLoyaltyRewardToOrderItems(params: {
  items: OrderLineItem[];
  reward: LoyaltyReward;
  menuItem?: MenuItem;
  currentRound: number;
}): OrderLineItem[] {
  const { items, reward, menuItem, currentRound } = params;
  const idx = items.findIndex(
    (i) =>
      !i.voided &&
      !i.coveredByPack &&
      !i.redeemedByLoyalty &&
      i.menuItemId === reward.menuItemId &&
      i.qty >= 1
  );

  if (idx >= 0) {
    const target = items[idx];
    if (target.qty === 1) {
      return items.map((item, i) =>
        i === idx
          ? {
              ...item,
              redeemedByLoyalty: true,
              loyaltyRewardId: reward.id,
              loyaltyRewardName: reward.name,
              loyaltyPointsCost: reward.pointsCost,
            }
          : item
      );
    }

    const nextItems: OrderLineItem[] = [];
    items.forEach((item, i) => {
      if (i !== idx) {
        nextItems.push(item);
        return;
      }
      nextItems.push({ ...item, qty: item.qty - 1 });
      nextItems.push({
        ...item,
        id: `oi_loy_split_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        qty: 1,
        redeemedByLoyalty: true,
        loyaltyRewardId: reward.id,
        loyaltyRewardName: reward.name,
        loyaltyPointsCost: reward.pointsCost,
      });
    });
    return nextItems;
  }

  if (!menuItem) return items;

  const addedLine: OrderLineItem = {
    id: `oi_loy_add_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    menuItemId: menuItem.id,
    nameEn: menuItem.nameEn,
    nameKh: menuItem.nameKh,
    nameVi: menuItem.nameVi,
    unitPriceUsd: menuItem.priceUsd,
    qty: 1,
    station: menuItem.station,
    category: menuItem.category,
    round: currentRound,
    sentToKitchen: true,
    kdsStatus: 'new',
    redeemedByLoyalty: true,
    loyaltyRewardId: reward.id,
    loyaltyRewardName: reward.name,
    loyaltyPointsCost: reward.pointsCost,
  };

  return [...items, addedLine];
}

export function removeLoyaltyRewardLine(
  items: OrderLineItem[],
  lineId: string
): OrderLineItem[] {
  const target = items.find((i) => i.id === lineId && i.redeemedByLoyalty);
  if (!target) return items;

  // Auto-added complimentary line: remove completely from cart
  if (target.id.startsWith('oi_loy_add_')) {
    return items.filter((i) => i.id !== lineId);
  }

  // Split from an existing ordered line: merge back if matching paid line exists, else unmark
  const mergeIdx = items.findIndex(
    (i) =>
      i.id !== lineId &&
      !i.voided &&
      !i.coveredByPack &&
      !i.redeemedByLoyalty &&
      i.menuItemId === target.menuItemId &&
      (i.optionLabel || '') === (target.optionLabel || '')
  );

  if (mergeIdx >= 0) {
    return items
      .filter((i) => i.id !== lineId)
      .map((i, idx) => (idx === mergeIdx ? { ...i, qty: i.qty + target.qty } : i));
  }

  return items.map((i) =>
    i.id === lineId
      ? {
          ...i,
          redeemedByLoyalty: false,
          loyaltyRewardId: undefined,
          loyaltyRewardName: undefined,
          loyaltyPointsCost: undefined,
        }
      : i
  );
}

export function settleMemberLoyalty(params: {
  member: MemberCustomer;
  order: PosOrder;
  totalPaidUsd: number;
  branch: Pick<BranchConfig, 'pointsEnabled' | 'pointsPerDollar' | 'pointsValuePer100'>;
  offlineMode: boolean;
  nowIso: string;
}): {
  updatedMember: MemberCustomer;
  earnedPoints: number;
  bonusPoints: number;
  tierUpgradedTo: MemberTier | null;
  discountPointsUsed: number;
  itemPointsUsed: number;
  balanceAfter: number;
} {
  const { member, order, totalPaidUsd, branch, offlineMode, nowIso } = params;

  const rawDiscountPts = Math.max(0, Math.round(order.pointsRedeemed || 0));
  const rawItemPts = getOrderLoyaltyItemPointsUsed(order.items);

  // Respect available point balance safely: item rewards + discount points.
  // Redemptions stay online-only (the cloud balance is the source of truth);
  // earning is credited immediately, including offline, and syncs with the state.
  const itemPointsUsed = offlineMode ? 0 : Math.min(member.points, rawItemPts);
  const remainingAfterItems = Math.max(0, member.points - itemPointsUsed);
  const discountPointsUsed = offlineMode ? 0 : Math.min(remainingAfterItems, rawDiscountPts);

  const earnedPoints = calculatePointsEarned({
    totalUsd: totalPaidUsd,
    pointsPerDollar: branch.pointsPerDollar,
    pointsEnabled: branch.pointsEnabled,
    tier: member.tier,
  });

  const balanceAfterRedeem = Math.max(0, member.points - itemPointsUsed - discountPointsUsed);
  const nextSpent = roundCurrency(member.totalSpentUsd + Math.max(0, totalPaidUsd));
  const nextTier = computeMemberTier(nextSpent);
  const tierUpgradedTo =
    TIER_RANK[nextTier] > TIER_RANK[member.tier] ? nextTier : null;
  const bonusPoints = tierUpgradedTo ? TIER_UP_BONUS_POINTS[tierUpgradedTo] : 0;
  const balanceAfter = balanceAfterRedeem + earnedPoints + bonusPoints;

  const newEntries: LoyaltyTransaction[] = [];
  let running = member.points;

  if (itemPointsUsed > 0) {
    const freeNames = order.items
      .filter((i) => !i.voided && i.redeemedByLoyalty)
      .map((i) => i.loyaltyRewardName || i.nameEn)
      .join(', ');
    running = Math.max(0, running - itemPointsUsed);
    newEntries.push({
      id: `ltx_item_${order.id}_${Date.now()}`,
      memberId: member.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      type: 'redeem_item',
      pointsDelta: -itemPointsUsed,
      balanceAfter: running,
      description: `Redeemed ${freeNames || 'free item'} on #${order.orderNumber}`,
      createdAt: nowIso,
    });
  }

  if (discountPointsUsed > 0) {
    const discountUsd = calculatePointsDiscountUsd(discountPointsUsed, branch.pointsValuePer100);
    running = Math.max(0, running - discountPointsUsed);
    newEntries.push({
      id: `ltx_disc_${order.id}_${Date.now()}`,
      memberId: member.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      type: 'redeem_discount',
      pointsDelta: -discountPointsUsed,
      balanceAfter: running,
      amountUsd: discountUsd,
      description: `Redeemed $${discountUsd.toFixed(2)} discount on #${order.orderNumber}`,
      createdAt: nowIso,
    });
  }

  if (earnedPoints > 0) {
    running += earnedPoints;
    newEntries.push({
      id: `ltx_earn_${order.id}_${Date.now()}`,
      memberId: member.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      type: 'earn',
      pointsDelta: earnedPoints,
      balanceAfter: running,
      amountUsd: totalPaidUsd,
      description: `Earned${offlineMode ? ' (offline)' : ''} from Bill #${order.orderNumber} ($${totalPaidUsd.toFixed(2)})`,
      createdAt: nowIso,
    });
  }

  if (bonusPoints > 0 && tierUpgradedTo) {
    running += bonusPoints;
    newEntries.push({
      id: `ltx_tier_${order.id}_${Date.now()}`,
      memberId: member.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      type: 'bonus',
      pointsDelta: bonusPoints,
      balanceAfter: running,
      amountUsd: totalPaidUsd,
      description: `Tier upgrade bonus — welcomed to ${tierUpgradedTo}!`,
      createdAt: nowIso,
    });
  }

  const existingHistory = member.loyaltyHistory || [];

  return {
    updatedMember: {
      ...member,
      points: balanceAfter,
      totalSpentUsd: nextSpent,
      tier: nextTier,
      lastVisit: nowIso.slice(0, 10),
      loyaltyHistory: [...newEntries.reverse(), ...existingHistory].slice(0, 100),
    },
    earnedPoints,
    bonusPoints,
    tierUpgradedTo,
    discountPointsUsed,
    itemPointsUsed,
    balanceAfter,
  };
}
