export interface OrderLineItem {
  id: string;
  menuItemId: string;
  nameEn: string;
  nameKh: string;
  nameVi: string;
  unitPriceUsd: number;
  qty: number;
  station: 'kitchen' | 'bar';
  category: string;
  note?: string;
  optionLabel?: string;
  round: number;
  sentToKitchen: boolean;
  kdsStatus: 'draft' | 'new' | 'cooking' | 'ready' | 'served';
  voided?: boolean;
  coveredByPack?: boolean;
  redeemedByLoyalty?: boolean;
  loyaltyRewardId?: string;
  loyaltyRewardName?: string;
  loyaltyPointsCost?: number;
  orderedBy?: string;
}

export interface PromotionRule {
  id: string;
  nameEn: string;
  nameKh: string;
  type: 'happy_hour' | 'buy_x_get_y' | 'combo' | 'bill_discount' | 'promo_code' | 'gift';
  discountPercent?: number;
  discountUsd?: number;
  code?: string;
  targetCategory?: string;
  minQty?: number;
  freeQty?: number;
  startHour?: number;
  endHour?: number;
  active: boolean;
}

export interface OrderTotalsInput {
  items: OrderLineItem[];
  exchangeRate: number;
  rielRounding: number;
  vatPercent: number;
  serviceChargePercent: number;
  manualDiscountPercent?: number;
  manualDiscountUsd?: number;
  promoDiscountUsd?: number;
  pointsRedeemed?: number;
  pointsValuePer100?: number;
  depositAppliedUsd?: number;
}

export interface OrderTotalsResult {
  subtotalUsd: number;
  discountTotalUsd: number;
  afterDiscountUsd: number;
  serviceChargeUsd: number;
  vatUsd: number;
  depositAppliedUsd: number;
  totalUsd: number;
  totalKhr: number;
}

export interface DualCurrencyPaymentInput {
  dueUsd: number;
  paidUsd: number;
  paidKhr: number;
  exchangeRate: number;
  rielRounding: number;
}

export interface DualCurrencyPaymentResult {
  appliedUsd: number;
  isSettled: boolean;
  shortUsd: number;
  shortKhr: number;
  changeWholeUsd: number;
  changeKhr: number;
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundRiel(amountKhr: number, step = 100): number {
  const safeStep = step > 0 ? step : 100;
  return Math.round(amountKhr / safeStep) * safeStep;
}

export function usdToKhr(usd: number, exchangeRate = 4100, rielRounding = 100): number {
  if (usd <= 0) return 0;
  return roundRiel(usd * exchangeRate, rielRounding);
}

export function calculateOrderTotals(input: OrderTotalsInput): OrderTotalsResult {
  const activeItems = input.items.filter((i) => !i.voided);
  const subtotalUsd = roundCurrency(
    activeItems.reduce((sum, item) => {
      if (item.coveredByPack || item.redeemedByLoyalty) return sum;
      return sum + item.unitPriceUsd * item.qty;
    }, 0)
  );

  const manualPctDiscount =
    input.manualDiscountPercent && input.manualDiscountPercent > 0
      ? roundCurrency((subtotalUsd * input.manualDiscountPercent) / 100)
      : 0;
  const manualFlatDiscount = input.manualDiscountUsd ? Math.max(0, input.manualDiscountUsd) : 0;
  const promoDiscount = input.promoDiscountUsd ? Math.max(0, input.promoDiscountUsd) : 0;
  const pointsUsd =
    input.pointsRedeemed && input.pointsRedeemed > 0
      ? roundCurrency((input.pointsRedeemed / 100) * (input.pointsValuePer100 ?? 1))
      : 0;

  const rawDiscount = manualPctDiscount + manualFlatDiscount + promoDiscount + pointsUsd;
  const discountTotalUsd = roundCurrency(Math.min(subtotalUsd, rawDiscount));
  const afterDiscountUsd = roundCurrency(Math.max(0, subtotalUsd - discountTotalUsd));

  const serviceChargeUsd = roundCurrency((afterDiscountUsd * (input.serviceChargePercent || 0)) / 100);
  const taxableUsd = roundCurrency(afterDiscountUsd + serviceChargeUsd);
  const vatUsd = roundCurrency((taxableUsd * (input.vatPercent || 0)) / 100);
  const beforeDepositUsd = roundCurrency(taxableUsd + vatUsd);

  const depositAppliedUsd = roundCurrency(
    Math.min(beforeDepositUsd, Math.max(0, input.depositAppliedUsd ?? 0))
  );
  const totalUsd = roundCurrency(Math.max(0, beforeDepositUsd - depositAppliedUsd));
  const totalKhr = usdToKhr(totalUsd, input.exchangeRate, input.rielRounding);

  return {
    subtotalUsd,
    discountTotalUsd,
    afterDiscountUsd,
    serviceChargeUsd,
    vatUsd,
    depositAppliedUsd,
    totalUsd,
    totalKhr,
  };
}

/**
 * Computes dual-currency cash settlement and change formatted as "whole dollars + Riel".
 */
export function calculateDualCurrencyChange(
  input: DualCurrencyPaymentInput
): DualCurrencyPaymentResult {
  const rate = input.exchangeRate > 0 ? input.exchangeRate : 4100;
  const step = input.rielRounding > 0 ? input.rielRounding : 100;
  const paidTotalUsd = input.paidUsd + input.paidKhr / rate;
  const appliedUsd = roundCurrency(Math.min(input.dueUsd, paidTotalUsd));
  const diffUsd = paidTotalUsd - input.dueUsd;

  if (diffUsd < -0.004) {
    const shortUsd = roundCurrency(Math.abs(diffUsd));
    const shortKhr = roundRiel(shortUsd * rate, step);
    return {
      appliedUsd,
      isSettled: false,
      shortUsd,
      shortKhr,
      changeWholeUsd: 0,
      changeKhr: 0,
    };
  }

  const positiveChangeUsd = Math.max(0, diffUsd);
  let changeWholeUsd = Math.floor(positiveChangeUsd + 1e-6);
  const remainderUsd = Math.max(0, positiveChangeUsd - changeWholeUsd);
  let changeKhr = roundRiel(remainderUsd * rate, step);

  if (changeKhr >= rate) {
    changeWholeUsd += Math.floor(changeKhr / rate);
    changeKhr = changeKhr % rate;
  }

  return {
    appliedUsd: roundCurrency(input.dueUsd),
    isSettled: true,
    shortUsd: 0,
    shortKhr: 0,
    changeWholeUsd,
    changeKhr,
  };
}

export function evaluateBestPromotion(
  items: OrderLineItem[],
  promotions: PromotionRule[],
  currentHour: number,
  enteredCode?: string
): { promotion: PromotionRule | null; discountUsd: number } {
  const activeItems = items.filter((i) => !i.voided && !i.coveredByPack && !i.redeemedByLoyalty);
  const subtotal = activeItems.reduce((s, i) => s + i.unitPriceUsd * i.qty, 0);
  if (subtotal <= 0) return { promotion: null, discountUsd: 0 };

  let bestPromo: PromotionRule | null = null;
  let bestDiscount = 0;

  for (const promo of promotions) {
    if (!promo.active) continue;
    let discount = 0;

    if (promo.type === 'happy_hour') {
      const start = promo.startHour ?? 0;
      const end = promo.endHour ?? 23;
      if (currentHour >= start && currentHour <= end) {
        const eligible = promo.targetCategory
          ? activeItems
              .filter((i) => i.category === promo.targetCategory)
              .reduce((s, i) => s + i.unitPriceUsd * i.qty, 0)
          : subtotal;
        discount = roundCurrency((eligible * (promo.discountPercent ?? 0)) / 100);
      }
    } else if (promo.type === 'buy_x_get_y') {
      const matching = activeItems.filter((i) =>
        promo.targetCategory ? i.category === promo.targetCategory : true
      );
      const totalQty = matching.reduce((s, i) => s + i.qty, 0);
      const minQty = promo.minQty ?? 3;
      if (totalQty >= minQty && matching.length > 0) {
        const cheapest = Math.min(...matching.map((m) => m.unitPriceUsd));
        const freeBundles = Math.floor(totalQty / minQty) * (promo.freeQty ?? 1);
        discount = roundCurrency(cheapest * freeBundles);
      }
    } else if (promo.type === 'bill_discount') {
      discount = promo.discountPercent
        ? roundCurrency((subtotal * promo.discountPercent) / 100)
        : roundCurrency(promo.discountUsd ?? 0);
    } else if (promo.type === 'promo_code' && enteredCode) {
      if (promo.code && promo.code.trim().toUpperCase() === enteredCode.trim().toUpperCase()) {
        discount = promo.discountPercent
          ? roundCurrency((subtotal * promo.discountPercent) / 100)
          : roundCurrency(promo.discountUsd ?? 0);
      }
    } else if (promo.type === 'combo') {
      if (activeItems.length >= 2) {
        discount = roundCurrency(promo.discountUsd ?? 0);
      }
    }

    if (discount > bestDiscount) {
      bestDiscount = discount;
      bestPromo = promo;
    }
  }

  return { promotion: bestPromo, discountUsd: Math.min(subtotal, bestDiscount) };
}

export interface DrawerReconciliationInput {
  openingUsd: number;
  openingKhr: number;
  cashPaidUsd: number;
  cashPaidKhr: number;
  cashChangeUsd: number;
  cashChangeKhr: number;
  pettyCashInUsd: number;
  pettyCashOutUsd: number;
  pettyCashInKhr: number;
  pettyCashOutKhr: number;
  countedUsd: number;
  countedKhr: number;
}

export function calculateDrawerReconciliation(input: DrawerReconciliationInput) {
  const netCashUsd = roundCurrency(input.cashPaidUsd - input.cashChangeUsd);
  const netCashKhr = Math.round(input.cashPaidKhr - input.cashChangeKhr);
  const expectedUsd = roundCurrency(
    input.openingUsd + netCashUsd + input.pettyCashInUsd - input.pettyCashOutUsd
  );
  const expectedKhr = Math.round(
    input.openingKhr + netCashKhr + input.pettyCashInKhr - input.pettyCashOutKhr
  );
  const varianceUsd = roundCurrency(input.countedUsd - expectedUsd);
  const varianceKhr = Math.round(input.countedKhr - expectedKhr);

  return {
    netCashUsd,
    netCashKhr,
    expectedUsd,
    expectedKhr,
    varianceUsd,
    varianceKhr,
  };
}

export function generateUbl21Xml(params: {
  invoiceNo: string;
  issueDate: string;
  invoiceType: 'commercial' | 'tax' | 'credit_note';
  sellerName: string;
  sellerVattin: string;
  buyerName: string;
  buyerVattin?: string;
  exclVatUsd: number;
  vatUsd: number;
  totalUsd: number;
  totalKhr: number;
  exchangeRate: number;
}): string {
  const typeCode = params.invoiceType === 'credit_note' ? '381' : '388';
  const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>urn:caminvoice:gdt:kh:ubl:2.1</cbc:CustomizationID>
  <cbc:ID>${escapeXml(params.invoiceNo)}</cbc:ID>
  <cbc:IssueDate>${escapeXml(params.issueDate)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>${typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>KHR</cbc:TaxCurrencyCode>
  <cac:TaxExchangeRate>
    <cbc:SourceCurrencyCode>USD</cbc:SourceCurrencyCode>
    <cbc:TargetCurrencyCode>KHR</cbc:TargetCurrencyCode>
    <cbc:CalculationRate>${params.exchangeRate}</cbc:CalculationRate>
  </cac:TaxExchangeRate>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(params.sellerName)}</cbc:RegistrationName>
        <cbc:CompanyID>${escapeXml(params.sellerVattin)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(params.buyerName || 'Walk-in Guest')}</cbc:RegistrationName>
        ${params.buyerVattin ? `<cbc:CompanyID>${escapeXml(params.buyerVattin)}</cbc:CompanyID>` : ''}
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="USD">${params.vatUsd.toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="USD">${params.exclVatUsd.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="USD">${params.totalUsd.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="USD">${params.totalUsd.toFixed(2)}</cbc:PayableAmount>
    <cbc:PayableRoundingAmount currencyID="KHR">${params.totalKhr}</cbc:PayableRoundingAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
}
