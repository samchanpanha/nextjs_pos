import type {
  AiStockMonitorReport,
  StockUrgencyTier,
} from './aiStockMonitor';
import { addDaysIso } from './aiStockMonitor';
import type {
  BranchConfig,
  Ingredient,
  PurchaseOrder,
  Supplier,
  SupplierPaymentTerms,
} from '../types/pos';
import { computeDueDateFromTerms, matchIngredientSupplier } from './accountingEngine';
import { roundCurrency, usdToKhr } from './posMath';

export type RestockBranchInfo = Pick<
  BranchConfig,
  'id' | 'name' | 'code' | 'address' | 'phone' | 'vattin' | 'exchangeRate' | 'rielRounding'
>;

export const RESTOCK_PAYMENT_TERMS_LABELS: Record<SupplierPaymentTerms, string> = {
  cod: 'COD / Cash on Delivery',
  net_7: 'Net 7 Days',
  net_15: 'Net 15 Days',
  net_30: 'Net 30 Days',
};

export const RESTOCK_URGENCY_LABELS: Record<StockUrgencyTier, string> = {
  out: 'Out of stock',
  critical: 'Critical',
  warning: 'Low soon',
  healthy: 'Healthy',
};

export const RESTOCK_URGENCY_RANK: Record<StockUrgencyTier, number> = {
  out: 0,
  critical: 1,
  warning: 2,
  healthy: 3,
};

export interface AutoRestockLineDraft {
  ingredientId: string;
  ingredientName: string;
  nameKh: string;
  unit: string;
  purchaseUnit: string;
  purchaseUnitSize: number;
  onHand: number;
  minLevel: number;
  urgency: StockUrgencyTier;
  dailyBurnRate: number;
  estimatedDaysRemaining: number | null;
  predictedRunOutDate: string;
  /** AI / rule-based suggested reorder quantity in base units. */
  suggestedReorderQty: number;
  /** Number of purchase units (packs) to order. */
  orderPacks: number;
  /** Base units contained in one purchase unit. */
  conversionFactor: number;
  /** Total base units covered by this order line. */
  totalBaseUnits: number;
  /** Cost per purchase unit. */
  unitCostUsd: number;
  lineTotalUsd: number;
  supplierId: string;
}

export interface RestockEmail {
  to: string;
  subject: string;
  body: string;
}

export interface AutoRestockSupplierDraft {
  supplierId: string;
  supplierName: string;
  supplierEmail: string;
  supplierContactName: string;
  supplierPhone: string;
  supplierVattin?: string;
  paymentTerms: SupplierPaymentTerms;
  poNumber: string;
  orderDate: string;
  expectedDate: string;
  dueDate: string;
  applyInputVat: boolean;
  lines: AutoRestockLineDraft[];
  subtotalUsd: number;
  inputVatUsd: number;
  totalUsd: number;
  totalKhr: number;
  email: RestockEmail;
}

export interface AutoRestockDraftResult {
  generatedAt: string;
  referenceDate: string;
  branchId: string;
  branchName: string;
  includeWarnings: boolean;
  bufferDays: number;
  reportModel: string;
  items: AutoRestockLineDraft[];
  supplierDrafts: AutoRestockSupplierDraft[];
  totalEstimatedCostUsd: number;
  skippedWithoutSupplier: string[];
  /** Critical ingredients already covered by an open purchase order. */
  skippedOnOpenPo: string[];
}

export interface AutoRestockDraftOptions {
  /** Also include 'warning' (low-soon) ingredients, not just critical/out. */
  includeWarnings?: boolean;
  /** Days of forward cover to buy for. Defaults to 7. */
  bufferDays?: number;
  /** ingredientId -> purchase packs override. A value of 0 removes the line. */
  qtyOverrides?: Record<string, number>;
  /** ingredientId -> supplierId override. */
  supplierOverrides?: Record<string, string>;
  /** Next PO sequence number used for draft PO numbering. */
  nextPoSeq?: number;
  referenceDate?: string;
  generatedAt?: string;
  vatPercent?: number;
}

function clampBufferDays(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 7;
  return Math.min(30, Math.max(1, Math.round(value)));
}

/**
 * Compute how many purchase-unit packs to order so stock covers the buffer
 * window plus the minimum safety level, always rounded up to whole packs.
 */
export function computeRestockOrderPacks(input: {
  onHand: number;
  minLevel: number;
  purchaseUnitSize: number;
  dailyBurnRate: number;
  bufferDays: number;
}): number {
  const conversion = Math.max(1, Math.round(input.purchaseUnitSize || 1));
  const safeOnHand = Math.max(0, input.onHand);
  const targetBaseUnits = Math.max(
    input.minLevel * 1.5,
    Math.max(0, input.dailyBurnRate) * input.bufferDays
  );
  const deficit = Math.max(conversion, targetBaseUnits - safeOnHand);
  return Math.max(1, Math.ceil(deficit / conversion));
}

export function formatRestockPacks(line: Pick<AutoRestockLineDraft, 'orderPacks' | 'purchaseUnit'>): string {
  return `${line.orderPacks} × ${line.purchaseUnit}`;
}

function formatBaseUnits(value: number): string {
  return value.toLocaleString('en-US');
}

export function buildRestockEmail(params: {
  branch: RestockBranchInfo;
  supplier: Supplier;
  poNumber: string;
  orderDate: string;
  expectedDate: string;
  dueDate: string;
  paymentTerms: SupplierPaymentTerms;
  applyInputVat: boolean;
  lines: AutoRestockLineDraft[];
  subtotalUsd: number;
  inputVatUsd: number;
  totalUsd: number;
  totalKhr: number;
  generatedAt: string;
  bufferDays: number;
  reportModel: string;
}): RestockEmail {
  const {
    branch,
    supplier,
    poNumber,
    orderDate,
    expectedDate,
    dueDate,
    paymentTerms,
    applyInputVat,
    lines,
    subtotalUsd,
    inputVatUsd,
    totalUsd,
    totalKhr,
    generatedAt,
    bufferDays,
    reportModel,
  } = params;

  const greeting = supplier.contactName.trim()
    ? `Dear ${supplier.contactName.trim()} team,`
    : `Dear ${supplier.name} team,`;

  const itemLines = lines.map((line, idx) => {
    const runOut =
      line.estimatedDaysRemaining !== null
        ? `${line.estimatedDaysRemaining.toFixed(1)}d left`
        : line.predictedRunOutDate;
    return [
      `${idx + 1}. ${line.ingredientName}${line.nameKh ? ` (${line.nameKh})` : ''}`,
      `   Order: ${formatRestockPacks(line)} (${formatBaseUnits(line.totalBaseUnits)} ${line.unit}) @ $${line.unitCostUsd.toFixed(2)} = $${line.lineTotalUsd.toFixed(2)}`,
      `   On hand ${formatBaseUnits(line.onHand)} ${line.unit} · Min ${formatBaseUnits(line.minLevel)} ${line.unit} · Est. run-out ${runOut}`,
    ].join('\n');
  });

  const vatLine = applyInputVat
    ? `10% Input VAT: $${inputVatUsd.toFixed(2)}`
    : 'Input VAT: not applicable (non-VAT supplier)';

  const bodyLines: string[] = [
    greeting,
    '',
    `Please prepare the following restock purchase order for ${branch.name}.`,
    '',
    `Purchase Order: ${poNumber}`,
    `Order Date: ${orderDate}`,
    `Expected Delivery: ${expectedDate}`,
    `Payment Terms: ${RESTOCK_PAYMENT_TERMS_LABELS[paymentTerms]}`,
    '',
    'ITEMS',
    itemLines.join('\n'),
    '',
    `Subtotal: $${subtotalUsd.toFixed(2)}`,
    vatLine,
    `Total: $${totalUsd.toFixed(2)} (≈ ៛${formatBaseUnits(totalKhr)})`,
    '',
    `This draft was auto-generated from the AI Stock Monitor (${reportModel}) on ${generatedAt} using a ${bufferDays}-day safety buffer. Please confirm stock availability and the expected delivery date.`,
    '',
    'Best regards,',
    branch.name,
    branch.address,
  ];
  if (branch.phone) bodyLines.push(`Phone: ${branch.phone}`);
  if (branch.vattin) bodyLines.push(`VATTIN: ${branch.vattin}`);

  const body = bodyLines.join('\n');

  return {
    to: supplier.email?.trim() || '',
    subject: `Purchase Order ${poNumber} — ${branch.name} restock (${lines.length} item${lines.length === 1 ? '' : 's'})`,
    body,
  };
}

export function buildMailtoUrl(email: RestockEmail): string {
  const to = email.to.trim();
  const query = `subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
  return `mailto:${to}?${query}`;
}

/**
 * Turn an AI Stock Monitor report into ready-to-send supplier purchase order
 * drafts. Only critical/out items are included by default; `includeWarnings`
 * adds low-soon items. Quantities are rounded up to whole purchase packs and
 * costs use the ingredient's weighted-average cost.
 */
export function buildAutoRestockDraft(input: {
  branch: RestockBranchInfo;
  ingredients: Ingredient[];
  suppliers: Supplier[];
  report: AiStockMonitorReport;
  /** Open purchase orders used to avoid drafting duplicate restock lines. */
  existingPurchaseOrders?: PurchaseOrder[];
  options?: AutoRestockDraftOptions;
}): AutoRestockDraftResult {
  const { branch, ingredients, suppliers, report } = input;
  const options = input.options || {};
  const includeWarnings = options.includeWarnings ?? false;
  const bufferDays = clampBufferDays(options.bufferDays);
  const vatPercent = Math.min(
    1,
    Math.max(0, typeof options.vatPercent === 'number' ? options.vatPercent : 0.1)
  );
  const referenceDate = (
    options.referenceDate ||
    report.referenceDate ||
    new Date().toISOString().slice(0, 10)
  ).slice(0, 10);
  const generatedAt = options.generatedAt || new Date().toISOString();

  const activeSuppliers = suppliers.filter(
    (s) => s.active && (s.branchId === branch.id || s.branchId === 'all')
  );

  // Ingredients already covered by an open PO should not be drafted again.
  const pendingIngIds = new Set<string>();
  for (const po of input.existingPurchaseOrders || []) {
    if (po.branchId !== branch.id) continue;
    if (po.status === 'draft' || po.status === 'sent' || po.status === 'partial') {
      for (const line of po.lines) {
        if (line.ingredientId && line.receivedQty < line.orderedQty) {
          pendingIngIds.add(line.ingredientId);
        }
      }
    }
  }

  const eligible = report.items
    .filter(
      (item) =>
        item.urgency === 'out' ||
        item.urgency === 'critical' ||
        (includeWarnings && item.urgency === 'warning')
    )
    .sort((a, b) => {
      const rankDiff = RESTOCK_URGENCY_RANK[a.urgency] - RESTOCK_URGENCY_RANK[b.urgency];
      if (rankDiff !== 0) return rankDiff;
      return (
        (a.estimatedDaysRemaining ?? 9999) - (b.estimatedDaysRemaining ?? 9999)
      );
    });

  const lines: AutoRestockLineDraft[] = [];
  const skippedWithoutSupplier: string[] = [];
  const skippedOnOpenPo: string[] = [];

  for (const item of eligible) {
    const ingredient = ingredients.find((i) => i.id === item.ingredientId);
    if (!ingredient) continue;

    if (pendingIngIds.has(item.ingredientId)) {
      skippedOnOpenPo.push(item.ingredientName);
      continue;
    }

    const overrideSupplierId = options.supplierOverrides?.[item.ingredientId];
    const supplier = overrideSupplierId
      ? activeSuppliers.find((s) => s.id === overrideSupplierId) ||
        matchIngredientSupplier(ingredient, activeSuppliers)
      : matchIngredientSupplier(ingredient, activeSuppliers);

    if (!supplier) {
      skippedWithoutSupplier.push(item.ingredientName);
      continue;
    }

    const overridePacks = options.qtyOverrides?.[item.ingredientId];
    if (overridePacks !== undefined && overridePacks <= 0) continue;

    const conversion = Math.max(1, Math.round(ingredient.purchaseUnitSize || 1));
    const orderPacks =
      overridePacks !== undefined
        ? Math.max(1, Math.round(overridePacks))
        : computeRestockOrderPacks({
            onHand: ingredient.onHand,
            minLevel: ingredient.minLevel,
            purchaseUnitSize: ingredient.purchaseUnitSize,
            dailyBurnRate: item.dailyBurnRate,
            bufferDays,
          });
    const unitCostUsd = roundCurrency(
      Math.max(0.01, ingredient.avgCostUsd * conversion)
    );

    lines.push({
      ingredientId: ingredient.id,
      ingredientName: ingredient.nameEn,
      nameKh: ingredient.nameKh,
      unit: ingredient.unit,
      purchaseUnit: ingredient.purchaseUnit || 'unit',
      purchaseUnitSize: conversion,
      onHand: ingredient.onHand,
      minLevel: ingredient.minLevel,
      urgency: item.urgency,
      dailyBurnRate: item.dailyBurnRate,
      estimatedDaysRemaining: item.estimatedDaysRemaining,
      predictedRunOutDate: item.predictedRunOutDate,
      suggestedReorderQty: item.suggestedReorderQty,
      orderPacks,
      conversionFactor: conversion,
      totalBaseUnits: orderPacks * conversion,
      unitCostUsd,
      lineTotalUsd: roundCurrency(orderPacks * unitCostUsd),
      supplierId: supplier.id,
    });
  }

  const grouped = new Map<string, AutoRestockLineDraft[]>();
  for (const line of lines) {
    const bucket = grouped.get(line.supplierId) || [];
    bucket.push(line);
    grouped.set(line.supplierId, bucket);
  }

  let seq = Math.max(1, Math.round(options.nextPoSeq ?? 1));
  const supplierDrafts: AutoRestockSupplierDraft[] = Array.from(grouped.entries()).map(
    ([supplierId, supplierLines]) => {
      const supplier = activeSuppliers.find((s) => s.id === supplierId)!;
      const poNumber = `PO-2026-${String(seq++).padStart(4, '0')}`;
      const orderDate = referenceDate;
      const expectedDate = addDaysIso(referenceDate, 2);
      const dueDate = computeDueDateFromTerms(orderDate, supplier.paymentTerms);
      const subtotalUsd = roundCurrency(
        supplierLines.reduce((sum, line) => sum + line.lineTotalUsd, 0)
      );
      const applyInputVat = Boolean(supplier.vattin);
      const inputVatUsd = applyInputVat ? roundCurrency(subtotalUsd * vatPercent) : 0;
      const totalUsd = roundCurrency(subtotalUsd + inputVatUsd);
      const totalKhr = usdToKhr(
        totalUsd,
        branch.exchangeRate || 4100,
        branch.rielRounding || 100
      );

      const draft: AutoRestockSupplierDraft = {
        supplierId,
        supplierName: supplier.name,
        supplierEmail: supplier.email?.trim() || '',
        supplierContactName: supplier.contactName,
        supplierPhone: supplier.phone,
        supplierVattin: supplier.vattin,
        paymentTerms: supplier.paymentTerms,
        poNumber,
        orderDate,
        expectedDate,
        dueDate,
        applyInputVat,
        lines: supplierLines,
        subtotalUsd,
        inputVatUsd,
        totalUsd,
        totalKhr,
        email: {
          to: '',
          subject: '',
          body: '',
        },
      };

      draft.email = buildRestockEmail({
        branch,
        supplier,
        poNumber,
        orderDate,
        expectedDate,
        dueDate,
        paymentTerms: supplier.paymentTerms,
        applyInputVat,
        lines: supplierLines,
        subtotalUsd,
        inputVatUsd,
        totalUsd,
        totalKhr,
        generatedAt,
        bufferDays,
        reportModel: report.model,
      });

      return draft;
    }
  );

  return {
    generatedAt,
    referenceDate,
    branchId: branch.id,
    branchName: branch.name,
    includeWarnings,
    bufferDays,
    reportModel: report.model,
    items: lines,
    supplierDrafts,
    totalEstimatedCostUsd: roundCurrency(
      supplierDrafts.reduce((sum, draft) => sum + draft.totalUsd, 0)
    ),
    skippedWithoutSupplier,
    skippedOnOpenPo,
  };
}
