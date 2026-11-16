import { generateBakongKhqrPayload, type BakongKhqrResult, type KhqrCurrency } from './bakongKhqr';
import { usdToKhr } from './posMath';

export type SubscriptionPlan = 'daily' | 'standard' | 'premium';
export type SubscriptionStatus = 'active' | 'pending' | 'expired';

export interface SubscriptionPlanDef {
  id: SubscriptionPlan;
  name: string;
  priceUsd: number;
  durationDays: number;
  unitLabel: string;
  billingLabel: string;
  tagline: string;
  features: string[];
}

export const PLATFORM_BAKONG_CONFIG = {
  bakongAccountId: 'xaiwork@abaa',
  merchantName: 'XAIWork Cambodia',
  merchantCity: 'Phnom Penh',
  mcc: '5734',
} as const;

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlan, SubscriptionPlanDef> = {
  daily: {
    id: 'daily',
    name: 'Daily Pass',
    priceUsd: 1,
    durationDays: 1,
    unitLabel: 'day',
    billingLabel: '$1 / day',
    tagline: 'Pay-as-you-go full POS access for pop-ups, events & daily shifts',
    features: [
      'Full POS, Dual USD/KHR & Bakong KHQR',
      'KDS Kitchen Display & Guest QR Menu',
      'Add extra days anytime ($1 per day)',
    ],
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    priceUsd: 27,
    durationDays: 30,
    unitLabel: 'month',
    billingLabel: '$27 / mo',
    tagline: '30-day complete shop plan for cafés & single-location restaurants',
    features: [
      'POS, Dual USD/KHR & KHQR',
      'Kitchen Display (KDS) & Guest QR',
      'Shift Drawer & VAT Sales Book',
    ],
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    priceUsd: 39,
    durationDays: 30,
    unitLabel: 'month',
    billingLabel: '$39 / mo',
    tagline: 'Multi-branch chain, recipes, loyalty packs & AI owner analytics',
    features: [
      'Everything in Standard + AI for Owners',
      'Multi-branch Chain & Inventory Recipes',
      'Prepaid Packs & Telegram Automation',
    ],
  },
};

export const SUBSCRIPTION_PLAN_LIST: SubscriptionPlanDef[] = [
  SUBSCRIPTION_PLANS.daily,
  SUBSCRIPTION_PLANS.standard,
  SUBSCRIPTION_PLANS.premium,
];

export function getPlanDefinition(plan: SubscriptionPlan): SubscriptionPlanDef {
  return SUBSCRIPTION_PLANS[plan] || SUBSCRIPTION_PLANS.daily;
}

export function clampPlanPeriods(plan: SubscriptionPlan, periods: number): number {
  const safe = Math.floor(Number.isFinite(periods) ? periods : 1);
  if (plan === 'daily') {
    return Math.max(1, Math.min(365, safe));
  }
  return Math.max(1, Math.min(24, safe));
}

export function computeSubscriptionAmountUsd(plan: SubscriptionPlan, periods = 1): number {
  const def = getPlanDefinition(plan);
  const count = clampPlanPeriods(plan, periods);
  return Number((def.priceUsd * count).toFixed(2));
}

export function computeSubscriptionDays(plan: SubscriptionPlan, periods = 1): number {
  const def = getPlanDefinition(plan);
  const count = clampPlanPeriods(plan, periods);
  return def.durationDays * count;
}

export function isSubscriptionActive(
  status: SubscriptionStatus | undefined,
  planDaysLeft: number
): boolean {
  if (status === 'pending' || status === 'expired') {
    return false;
  }
  return Number(planDaysLeft) > 0;
}

export function calculateExtendedDays(
  currentDaysLeft: number,
  currentStatus: SubscriptionStatus | undefined,
  addedDays: number
): number {
  const safeAdded = Math.max(1, Math.floor(addedDays));
  const baseDays =
    currentStatus === 'active' && currentDaysLeft > 0 ? Math.floor(currentDaysLeft) : 0;
  return baseDays + safeAdded;
}

export function buildPlatformSubscriptionKhqr(params: {
  plan: SubscriptionPlan;
  periods?: number;
  currency: KhqrCurrency;
  exchangeRate: number;
  businessCode: string;
  invoiceTag?: string;
}): {
  khqr: BakongKhqrResult;
  amountUsd: number;
  amountKhr: number;
  daysGranted: number;
  billNumber: string;
} {
  const periods = clampPlanPeriods(params.plan, params.periods ?? 1);
  const amountUsd = computeSubscriptionAmountUsd(params.plan, periods);
  const daysGranted = computeSubscriptionDays(params.plan, periods);
  const safeRate = Math.max(1000, params.exchangeRate || 4100);
  const amountKhr = usdToKhr(amountUsd, safeRate, 100);

  const cleanBiz = (params.businessCode || 'TENANT')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 10);
  const tag = (params.invoiceTag || Date.now().toString(36).toUpperCase()).slice(0, 6);
  const planCode = params.plan === 'daily' ? 'DAY' : params.plan === 'standard' ? 'STD' : 'PRO';
  const billNumber = `SUB-${planCode}-${cleanBiz}-${tag}`.slice(0, 25);

  const khqr = generateBakongKhqrPayload({
    accountType: 'individual',
    bakongAccountId: PLATFORM_BAKONG_CONFIG.bakongAccountId,
    merchantName: PLATFORM_BAKONG_CONFIG.merchantName,
    merchantCity: PLATFORM_BAKONG_CONFIG.merchantCity,
    mcc: PLATFORM_BAKONG_CONFIG.mcc,
    currency: params.currency,
    amount: params.currency === 'KHR' ? amountKhr : amountUsd,
    billNumber,
    storeLabel: cleanBiz || 'XAIWORK',
    terminalLabel: `SUB-${daysGranted}D`,
  });

  return {
    khqr,
    amountUsd,
    amountKhr,
    daysGranted,
    billNumber,
  };
}
