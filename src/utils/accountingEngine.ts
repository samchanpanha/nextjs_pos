import type {
  Ingredient,
  JournalEntry,
  JournalLine,
  JournalSourceType,
  LedgerAccount,
  OperatingExpense,
  PaymentMethod,
  PosOrder,
  PurchaseOrder,
  PurchaseOrderLine,
  Recipe,
  Supplier,
  SupplierPaymentTerms,
  VatInvoice,
} from '../types/pos';
import { roundCurrency, usdToKhr } from './posMath';

// ---------------------------------------------------------------------------
// 1. Cambodia F&B & Retail Default Chart of Accounts (COA)
// ---------------------------------------------------------------------------

export function createDefaultChartOfAccounts(): LedgerAccount[] {
  return [
    // ASSETS (1000-1999)
    {
      id: 'coa_1010',
      code: '1010',
      nameEn: 'Cash on Hand (USD & KHR Drawer)',
      nameKh: 'សាច់ប្រាក់ក្នុងថត (USD & ៛)',
      type: 'asset',
      subType: 'cash_bank',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'Physical USD & Cambodian Riel cash floats and register takings.',
    },
    {
      id: 'coa_1020',
      code: '1020',
      nameEn: 'Bakong KHQR & ABA Bank Account',
      nameKh: 'គណនីធនាគារ ABA និងបាគង KHQR',
      type: 'asset',
      subType: 'cash_bank',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'Digital settlements via NBC Bakong KHQR, ABA Pay, Card & Bank Transfers.',
    },
    {
      id: 'coa_1100',
      code: '1100',
      nameEn: 'Accounts Receivable (Corporate & Delivery)',
      nameKh: 'គណនីត្រូវទទួលប្រាក់',
      type: 'asset',
      subType: 'receivable',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'Unsettled corporate tabs and delivery platform payouts.',
    },
    {
      id: 'coa_1200',
      code: '1200',
      nameEn: 'Kitchen & Bar Inventory Asset',
      nameKh: 'ទ្រព្យសកម្មស្តុកគ្រឿងផ្សំ',
      type: 'asset',
      subType: 'inventory',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'Weighted moving-average value of food, coffee, and beverage stock on hand.',
    },
    {
      id: 'coa_1300',
      code: '1300',
      nameEn: 'Input VAT Credit (10% GDT)',
      nameKh: 'ឥណទានអាករលើតម្លៃបន្ថែមធាតុចូល (១០%)',
      type: 'asset',
      subType: 'tax_asset',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'Claimable 10% Input VAT paid on tax-invoiced supplier POs and expenses.',
    },
    {
      id: 'coa_1500',
      code: '1500',
      nameEn: 'Store Equipment & Leasehold Fit-Out',
      nameKh: 'ឧបករណ៍ហាង និងការតុបតែង',
      type: 'asset',
      subType: 'fixed_asset',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'Espresso machines, POS hardware, refrigeration, and furniture.',
    },

    // LIABILITIES (2000-2999)
    {
      id: 'coa_2010',
      code: '2010',
      nameEn: 'Accounts Payable — Suppliers',
      nameKh: 'គណនីត្រូវសងអ្នកផ្គត់ផ្គង់ (AP)',
      type: 'liability',
      subType: 'payable',
      normalBalance: 'credit',
      systemAccount: true,
      active: true,
      description: 'Unpaid supplier Purchase Orders (GRNs) and vendor expense bills.',
    },
    {
      id: 'coa_2100',
      code: '2100',
      nameEn: 'Output VAT Payable (10% GDT)',
      nameKh: 'អាករលើតម្លៃបន្ថែមត្រូវបង់ (១០%)',
      type: 'liability',
      subType: 'tax_liability',
      normalBalance: 'credit',
      systemAccount: true,
      active: true,
      description: '10% VAT collected on customer POS bills for monthly GDT filing.',
    },
    {
      id: 'coa_2150',
      code: '2150',
      nameEn: 'Withholding Tax (WHT) Payable (GDT)',
      nameKh: 'ពន្ធកាត់ទុកត្រូវបង់ (WHT)',
      type: 'liability',
      subType: 'tax_liability',
      normalBalance: 'credit',
      systemAccount: true,
      active: true,
      description: 'Cambodia WHT withheld on shop rent (10%) and resident services (15%).',
    },
    {
      id: 'coa_2200',
      code: '2200',
      nameEn: 'Unearned Prepaid Packs & Guest Deposits',
      nameKh: 'ប្រាក់កក់ភ្ញៀវ និងកញ្ចប់បង់មុន',
      type: 'liability',
      subType: 'unearned_revenue',
      normalBalance: 'credit',
      systemAccount: true,
      active: true,
      description: 'Deferred revenue from unredeemed prepaid drink packs and table deposits.',
    },

    // EQUITY (3000-3999)
    {
      id: 'coa_3000',
      code: '3000',
      nameEn: "Owner's Capital & Opening Equity",
      nameKh: 'ដើមទុនម្ចាស់ហាង',
      type: 'equity',
      subType: 'owner_equity',
      normalBalance: 'credit',
      systemAccount: true,
      active: true,
      description: 'Initial store capital, cash float funding, and owner contributions.',
    },
    {
      id: 'coa_3100',
      code: '3100',
      nameEn: 'Owner Drawings / Distributions',
      nameKh: 'ប្រាក់ដករបស់ម្ចាស់ហាង',
      type: 'equity',
      subType: 'owner_equity',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'Owner profit withdrawals from business cash or bank.',
    },
    {
      id: 'coa_3200',
      code: '3200',
      nameEn: 'Retained Earnings',
      nameKh: 'ប្រាក់ចំណេញរក្សាទុក',
      type: 'equity',
      subType: 'retained_earnings',
      normalBalance: 'credit',
      systemAccount: true,
      active: true,
      description: 'Accumulated prior-period earnings.',
    },

    // REVENUE (4000-4999)
    {
      id: 'coa_4000',
      code: '4000',
      nameEn: 'Food & Beverage Sales (Net)',
      nameKh: 'ចំណូលលក់អាហារ និងភេសជ្ជៈ',
      type: 'revenue',
      subType: 'operating_revenue',
      normalBalance: 'credit',
      systemAccount: true,
      active: true,
      description: 'Dine-in, takeaway, QR, and delivery sales net of promotional discounts.',
    },
    {
      id: 'coa_4050',
      code: '4050',
      nameEn: 'Prepaid Bundle & Membership Revenue',
      nameKh: 'ចំណូលពីកញ្ចប់បង់មុន',
      type: 'revenue',
      subType: 'operating_revenue',
      normalBalance: 'credit',
      systemAccount: true,
      active: true,
      description: 'Recognized revenue when customers redeem prepaid coffee/meal passes.',
    },
    {
      id: 'coa_4100',
      code: '4100',
      nameEn: 'Service Charge Income',
      nameKh: 'ចំណូលថ្លៃសេវាកម្ម',
      type: 'revenue',
      subType: 'other_revenue',
      normalBalance: 'credit',
      systemAccount: true,
      active: true,
      description: 'Service charge collected on dine-in bills.',
    },

    // COST OF GOODS SOLD (5000-5999)
    {
      id: 'coa_5000',
      code: '5000',
      nameEn: 'Cost of Goods Sold (Recipe Ingredients)',
      nameKh: 'ថ្លៃដើមទំនិញលក់ (COGS)',
      type: 'cogs',
      subType: 'direct_cogs',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'Direct BOM recipe ingredient cost deducted on POS order settlement.',
    },
    {
      id: 'coa_5100',
      code: '5100',
      nameEn: 'Kitchen Spoilage & Stock Variance',
      nameKh: 'ការខូចខាត និងបាត់បង់ស្តុក',
      type: 'cogs',
      subType: 'waste_cogs',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'Expired ingredients, bar spillage, and physical stock count write-offs.',
    },

    // OPERATING EXPENSES (6000-6999)
    {
      id: 'coa_6100',
      code: '6100',
      nameEn: 'Staff Salaries, Wages & NSSF',
      nameKh: 'ប្រាក់បៀវត្សរ៍បុគ្គលិក និង ប.ស.ស',
      type: 'expense',
      subType: 'payroll_expense',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'Kitchen, barista, server, and management payroll (included in Prime Cost).',
    },
    {
      id: 'coa_6200',
      code: '6200',
      nameEn: 'Shop Rent & Premises Lease',
      nameKh: 'ថ្លៃឈ្នួលទីតាំងហាង',
      type: 'expense',
      subType: 'occupancy_expense',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'Monthly shop rental (typically subject to 10% Cambodia WHT).',
    },
    {
      id: 'coa_6300',
      code: '6300',
      nameEn: 'EDC Electricity, Water & Internet',
      nameKh: 'ថ្លៃអគ្គិសនី ទឹកស្អាត និងអ៊ីនធឺណិត',
      type: 'expense',
      subType: 'occupancy_expense',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'EDC power, PPWSA water, gas cylinders, and fiber internet.',
    },
    {
      id: 'coa_6400',
      code: '6400',
      nameEn: 'Packaging, Cups & Cleaning Supplies',
      nameKh: 'សម្ភារៈវេចខ្ចប់ និងសម្អាត',
      type: 'expense',
      subType: 'operating_expense',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'Takeaway cups, straws, thermal receipt paper, and sanitizers.',
    },
    {
      id: 'coa_6500',
      code: '6500',
      nameEn: 'Marketing, Telegram & Delivery Promos',
      nameKh: 'ទីផ្សារ និងការផ្សព្វផ្សាយ',
      type: 'expense',
      subType: 'operating_expense',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'Social media ads, influencer tastings, and loyalty campaigns.',
    },
    {
      id: 'coa_6600',
      code: '6600',
      nameEn: 'Bank, Card Terminal & KHQR Fees',
      nameKh: 'កម្រៃសេវាធនាគារ និងម៉ាស៊ីនកាត',
      type: 'expense',
      subType: 'operating_expense',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'Merchant MDR fees on Visa/Mastercard and bank wire charges.',
    },
    {
      id: 'coa_6850',
      code: '6850',
      nameEn: 'Petty Cash & Miscellaneous Store Expense',
      nameKh: 'ចំណាយបន្ទាប់បន្សំក្នុងហាង',
      type: 'expense',
      subType: 'operating_expense',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'Ice runs, TukTuk delivery fees, and urgent petty cash disbursements.',
    },
    {
      id: 'coa_6890',
      code: '6890',
      nameEn: 'Cash Drawer Over & Short',
      nameKh: 'លម្អៀងសាច់ប្រាក់ពេលបិទវេន',
      type: 'expense',
      subType: 'operating_expense',
      normalBalance: 'debit',
      systemAccount: true,
      active: true,
      description: 'Shift closing reconciliation variances (shortage = debit, overage = credit).',
    },
  ];
}

export function resolveAccountName(accounts: LedgerAccount[], code: string): string {
  return accounts.find((a) => a.code === code)?.nameEn || `Account ${code}`;
}

export function resolvePaymentAssetAccountCode(method?: PaymentMethod): string {
  if (!method || method === 'Cash') return '1010';
  return '1020'; // KHQR, Bank transfer, Card settle into Bank / Digital Clearing
}

export function computeDueDateFromTerms(orderDate: string, terms: SupplierPaymentTerms): string {
  const base = new Date(`${orderDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return orderDate;
  const days =
    terms === 'net_30' ? 30 : terms === 'net_15' ? 15 : terms === 'net_7' ? 7 : 0;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 2. Balanced Double-Entry Journal Entry Builders
// ---------------------------------------------------------------------------

function makeLine(
  idx: number,
  accounts: LedgerAccount[],
  accountCode: string,
  debitUsd: number,
  creditUsd: number,
  memo?: string
): JournalLine | null {
  const d = roundCurrency(Math.max(0, debitUsd));
  const c = roundCurrency(Math.max(0, creditUsd));
  if (d <= 0 && c <= 0) return null;
  return {
    id: `jl_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
    accountCode,
    accountName: resolveAccountName(accounts, accountCode),
    debitUsd: d,
    creditUsd: c,
    memo,
  };
}

export function finalizeBalancedJournal(params: {
  id?: string;
  entryNo: string;
  branchId: string;
  date: string;
  createdAt?: string;
  sourceType: JournalSourceType;
  sourceRef?: string;
  description: string;
  rawLines: (JournalLine | null)[];
  exchangeRate: number;
  postedBy: string;
  reversesEntryId?: string;
}): JournalEntry | null {
  const lines = params.rawLines.filter((l): l is JournalLine => Boolean(l));
  if (lines.length < 2) return null;

  let totalDebit = roundCurrency(lines.reduce((s, l) => s + l.debitUsd, 0));
  let totalCredit = roundCurrency(lines.reduce((s, l) => s + l.creditUsd, 0));
  const diff = roundCurrency(totalDebit - totalCredit);

  // Absorb sub-cent rounding drift (<= $0.03) on primary revenue/expense/payable line
  if (Math.abs(diff) > 0 && Math.abs(diff) <= 0.03) {
    if (diff > 0) {
      const creditTarget = lines.find((l) => l.creditUsd > 0);
      if (creditTarget) {
        creditTarget.creditUsd = roundCurrency(creditTarget.creditUsd + diff);
      }
    } else {
      const debitTarget = lines.find((l) => l.debitUsd > 0);
      if (debitTarget) {
        debitTarget.debitUsd = roundCurrency(debitTarget.debitUsd + Math.abs(diff));
      }
    }
    totalDebit = roundCurrency(lines.reduce((s, l) => s + l.debitUsd, 0));
    totalCredit = roundCurrency(lines.reduce((s, l) => s + l.creditUsd, 0));
  }

  if (Math.abs(totalDebit - totalCredit) > 0.009) {
    throw new Error(
      `Unbalanced journal entry (${params.entryNo}): Debit $${totalDebit.toFixed(2)} !== Credit $${totalCredit.toFixed(2)}`
    );
  }

  return {
    id: params.id || `je_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    entryNo: params.entryNo,
    branchId: params.branchId,
    date: params.date,
    createdAt: params.createdAt || new Date().toISOString(),
    sourceType: params.sourceType,
    sourceRef: params.sourceRef,
    description: params.description,
    lines,
    totalDebitUsd: totalDebit,
    totalCreditUsd: totalCredit,
    exchangeRate: params.exchangeRate || 4100,
    postedBy: params.postedBy,
    reversesEntryId: params.reversesEntryId,
  };
}

export function computeOrderRecipeCogsUsd(
  order: Pick<PosOrder, 'items'>,
  recipes: Recipe[],
  ingredients: Ingredient[]
): number {
  let cogs = 0;
  for (const item of order.items) {
    if (item.voided) continue;
    const recipe = recipes.find((r) => r.menuItemId === item.menuItemId);
    if (!recipe) continue;
    for (const rl of recipe.lines) {
      const ing = ingredients.find((g) => g.id === rl.ingredientId);
      if (ing) {
        cogs += rl.qtyPerPortion * item.qty * ing.avgCostUsd;
      }
    }
  }
  return roundCurrency(cogs);
}

/**
 * Automatically builds a balanced double-entry journal for a settled POS order,
 * including payment receipt, deposit/pack recognition, net F&B revenue, service charge,
 * 10% Output VAT, and BOM Recipe Cost of Goods Sold (COGS).
 */
export function buildPosOrderSaleJournal(params: {
  entryNo: string;
  order: PosOrder;
  accounts: LedgerAccount[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  exchangeRate: number;
  postedBy: string;
  date?: string;
}): JournalEntry | null {
  const { order, accounts, recipes, ingredients } = params;
  const payAccount = resolvePaymentAssetAccountCode(order.paymentMethod);
  const packCoveredValue = roundCurrency(
    order.items
      .filter((i) => !i.voided && i.coveredByPack)
      .reduce((s, i) => s + i.unitPriceUsd * i.qty, 0)
  );
  const depositApplied = roundCurrency(order.depositAppliedUsd || 0);
  const vatUsd = roundCurrency(order.vatUsd || 0);
  const serviceUsd = roundCurrency(order.serviceChargeUsd || 0);
  const cashOrBankCollected = roundCurrency(order.totalUsd || 0);

  // Total credits before net F&B sales:
  // Debits = cashOrBankCollected + depositApplied + packCoveredValue
  // Credits = netSales + packRevenue + serviceUsd + vatUsd
  const netSalesUsd = roundCurrency(
    Math.max(0, cashOrBankCollected + depositApplied - serviceUsd - vatUsd)
  );
  const cogsUsd = computeOrderRecipeCogsUsd(order, recipes, ingredients);
  const txDate = params.date || new Date().toISOString().slice(0, 10);

  const rawLines: (JournalLine | null)[] = [
    makeLine(1, accounts, payAccount, cashOrBankCollected, 0, `${order.paymentMethod || 'Cash'} settlement`),
    makeLine(2, accounts, '2200', depositApplied + packCoveredValue, 0, 'Deposit / prepaid pack redeemed'),
    makeLine(3, accounts, '4000', 0, netSalesUsd, `Order #${order.orderNumber} net F&B sales`),
    makeLine(4, accounts, '4050', 0, packCoveredValue, 'Prepaid bundle redemption'),
    makeLine(5, accounts, '4100', 0, serviceUsd, 'Service charge'),
    makeLine(6, accounts, '2100', 0, vatUsd, '10% Output VAT'),
  ];

  if (cogsUsd > 0) {
    rawLines.push(
      makeLine(7, accounts, '5000', cogsUsd, 0, `BOM recipe COGS Order #${order.orderNumber}`),
      makeLine(8, accounts, '1200', 0, cogsUsd, 'Inventory recipe consumption')
    );
  }

  return finalizeBalancedJournal({
    entryNo: params.entryNo,
    branchId: order.branchId,
    date: txDate,
    sourceType: 'pos_sale',
    sourceRef: `ORD-${order.orderNumber}`,
    description: `POS Sale #${order.orderNumber} (${order.tableName}) via ${order.paymentMethod || 'Cash'}`,
    rawLines,
    exchangeRate: params.exchangeRate,
    postedBy: params.postedBy,
  });
}

export function buildPosRefundJournal(params: {
  entryNo: string;
  branchId: string;
  invoiceNo: string;
  exclVatUsd: number;
  vatUsd: number;
  totalUsd: number;
  paymentMethod?: PaymentMethod;
  accounts: LedgerAccount[];
  exchangeRate: number;
  postedBy: string;
  date?: string;
}): JournalEntry | null {
  const payAccount = resolvePaymentAssetAccountCode(params.paymentMethod);
  const txDate = params.date || new Date().toISOString().slice(0, 10);
  return finalizeBalancedJournal({
    entryNo: params.entryNo,
    branchId: params.branchId,
    date: txDate,
    sourceType: 'pos_refund',
    sourceRef: params.invoiceNo,
    description: `Credit Note / Sales Refund (${params.invoiceNo})`,
    rawLines: [
      makeLine(1, params.accounts, '4000', params.exclVatUsd, 0, 'Sales reversal'),
      makeLine(2, params.accounts, '2100', params.vatUsd, 0, 'Output VAT reversal'),
      makeLine(3, params.accounts, payAccount, 0, params.totalUsd, 'Customer refund'),
    ],
    exchangeRate: params.exchangeRate,
    postedBy: params.postedBy,
  });
}

export function buildPrepaidPackSaleJournal(params: {
  entryNo: string;
  branchId: string;
  packCode: string;
  customerName: string;
  priceUsd: number;
  accounts: LedgerAccount[];
  exchangeRate: number;
  postedBy: string;
  date?: string;
}): JournalEntry | null {
  const txDate = params.date || new Date().toISOString().slice(0, 10);
  return finalizeBalancedJournal({
    entryNo: params.entryNo,
    branchId: params.branchId,
    date: txDate,
    sourceType: 'prepaid_pack',
    sourceRef: params.packCode,
    description: `Sold Prepaid Pack ${params.packCode} to ${params.customerName}`,
    rawLines: [
      makeLine(1, params.accounts, '1010', params.priceUsd, 0, 'Cash received for prepaid pack'),
      makeLine(2, params.accounts, '2200', 0, params.priceUsd, 'Deferred prepaid bundle liability'),
    ],
    exchangeRate: params.exchangeRate,
    postedBy: params.postedBy,
  });
}

export function buildPoGrnJournal(params: {
  entryNo: string;
  branchId: string;
  poNumber: string;
  grnNumber: string;
  supplierName: string;
  subtotalUsd: number;
  inputVatUsd: number;
  totalUsd: number;
  accounts: LedgerAccount[];
  exchangeRate: number;
  postedBy: string;
  date?: string;
}): JournalEntry | null {
  const txDate = params.date || new Date().toISOString().slice(0, 10);
  return finalizeBalancedJournal({
    entryNo: params.entryNo,
    branchId: params.branchId,
    date: txDate,
    sourceType: 'po_grn',
    sourceRef: `${params.poNumber} / ${params.grnNumber}`,
    description: `Goods Receipt ${params.grnNumber} from ${params.supplierName} (${params.poNumber})`,
    rawLines: [
      makeLine(1, params.accounts, '1200', params.subtotalUsd, 0, 'Inventory received into stock'),
      makeLine(2, params.accounts, '1300', params.inputVatUsd, 0, '10% Input VAT credit on supplier invoice'),
      makeLine(3, params.accounts, '2010', 0, params.totalUsd, `AP payable to ${params.supplierName}`),
    ],
    exchangeRate: params.exchangeRate,
    postedBy: params.postedBy,
  });
}

export function buildPoPaymentJournal(params: {
  entryNo: string;
  branchId: string;
  poNumber: string;
  supplierName: string;
  grossSettledUsd: number;
  whtDeductedUsd: number;
  cashPaidUsd: number;
  method: PaymentMethod;
  paymentRef: string;
  accounts: LedgerAccount[];
  exchangeRate: number;
  postedBy: string;
  date?: string;
}): JournalEntry | null {
  const payAccount = resolvePaymentAssetAccountCode(params.method);
  const txDate = params.date || new Date().toISOString().slice(0, 10);
  return finalizeBalancedJournal({
    entryNo: params.entryNo,
    branchId: params.branchId,
    date: txDate,
    sourceType: 'po_payment',
    sourceRef: `${params.poNumber} / ${params.paymentRef}`,
    description: `Vendor Bill Payment to ${params.supplierName} (${params.poNumber}) via ${params.method}`,
    rawLines: [
      makeLine(1, params.accounts, '2010', params.grossSettledUsd, 0, `AP settled (${params.poNumber})`),
      makeLine(2, params.accounts, '2150', 0, params.whtDeductedUsd, 'Withholding Tax (WHT) retained for GDT'),
      makeLine(3, params.accounts, payAccount, 0, params.cashPaidUsd, `${params.method} disbursement (${params.paymentRef})`),
    ],
    exchangeRate: params.exchangeRate,
    postedBy: params.postedBy,
  });
}

export function buildOperatingExpenseJournal(params: {
  entryNo: string;
  expense: OperatingExpense;
  accounts: LedgerAccount[];
  exchangeRate: number;
  postedBy: string;
}): JournalEntry | null {
  const { expense, accounts } = params;
  const creditAccount =
    expense.paymentStatus === 'payable'
      ? '2010'
      : resolvePaymentAssetAccountCode(expense.paymentMethod);
  const netCreditUsd =
    expense.paymentStatus === 'payable'
      ? roundCurrency(expense.totalUsd - expense.whtAmountUsd)
      : expense.cashPaidUsd;

  return finalizeBalancedJournal({
    entryNo: params.entryNo,
    branchId: expense.branchId,
    date: expense.date,
    sourceType: 'expense_voucher',
    sourceRef: expense.voucherNo,
    description: `${expense.expenseAccountName} — ${expense.vendorName}: ${expense.description}`,
    rawLines: [
      makeLine(1, accounts, expense.expenseAccountCode, expense.subtotalUsd, 0, expense.description),
      makeLine(2, accounts, '1300', expense.inputVatUsd, 0, '10% Input VAT credit'),
      makeLine(3, accounts, '2150', 0, expense.whtAmountUsd, `Cambodia WHT (${expense.whtPercent}%)`),
      makeLine(
        4,
        accounts,
        creditAccount,
        0,
        netCreditUsd,
        expense.paymentStatus === 'payable' ? 'Vendor AP payable' : `Paid via ${expense.paymentMethod || 'Cash'}`
      ),
    ],
    exchangeRate: params.exchangeRate,
    postedBy: params.postedBy,
  });
}

export function buildInventoryDirectJournal(params: {
  entryNo: string;
  branchId: string;
  mode: 'purchase' | 'waste';
  ingredientName: string;
  amountUsd: number;
  reason?: string;
  accounts: LedgerAccount[];
  exchangeRate: number;
  postedBy: string;
  date?: string;
}): JournalEntry | null {
  const amt = roundCurrency(params.amountUsd);
  if (amt <= 0) return null;
  const txDate = params.date || new Date().toISOString().slice(0, 10);

  if (params.mode === 'purchase') {
    return finalizeBalancedJournal({
      entryNo: params.entryNo,
      branchId: params.branchId,
      date: txDate,
      sourceType: 'inventory_purchase',
      sourceRef: params.ingredientName,
      description: `Direct Cash Stock Purchase — ${params.ingredientName}`,
      rawLines: [
        makeLine(1, params.accounts, '1200', amt, 0, `Stock added: ${params.ingredientName}`),
        makeLine(2, params.accounts, '1010', 0, amt, 'Paid from store cash'),
      ],
      exchangeRate: params.exchangeRate,
      postedBy: params.postedBy,
    });
  }

  return finalizeBalancedJournal({
    entryNo: params.entryNo,
    branchId: params.branchId,
    date: txDate,
    sourceType: 'inventory_waste',
    sourceRef: params.ingredientName,
    description: `Stock Spoilage / Waste — ${params.ingredientName}${params.reason ? ` (${params.reason})` : ''}`,
    rawLines: [
      makeLine(1, params.accounts, '5100', amt, 0, params.reason || 'Kitchen waste'),
      makeLine(2, params.accounts, '1200', 0, amt, `Written off: ${params.ingredientName}`),
    ],
    exchangeRate: params.exchangeRate,
    postedBy: params.postedBy,
  });
}

export function buildShiftCashJournal(params: {
  entryNo: string;
  branchId: string;
  kind: 'cash_in' | 'cash_out' | 'variance';
  amountUsd: number; // for variance: negative = shortage, positive = overage
  reason: string;
  accounts: LedgerAccount[];
  exchangeRate: number;
  postedBy: string;
  date?: string;
}): JournalEntry | null {
  const txDate = params.date || new Date().toISOString().slice(0, 10);
  if (params.kind === 'cash_in') {
    const amt = roundCurrency(Math.abs(params.amountUsd));
    if (amt <= 0) return null;
    return finalizeBalancedJournal({
      entryNo: params.entryNo,
      branchId: params.branchId,
      date: txDate,
      sourceType: 'shift_cash',
      description: `Drawer Cash In — ${params.reason}`,
      rawLines: [
        makeLine(1, params.accounts, '1010', amt, 0, params.reason),
        makeLine(2, params.accounts, '3000', 0, amt, 'Owner float top-up'),
      ],
      exchangeRate: params.exchangeRate,
      postedBy: params.postedBy,
    });
  }

  if (params.kind === 'cash_out') {
    const amt = roundCurrency(Math.abs(params.amountUsd));
    if (amt <= 0) return null;
    return finalizeBalancedJournal({
      entryNo: params.entryNo,
      branchId: params.branchId,
      date: txDate,
      sourceType: 'shift_cash',
      description: `Drawer Petty Cash Out — ${params.reason}`,
      rawLines: [
        makeLine(1, params.accounts, '6850', amt, 0, params.reason),
        makeLine(2, params.accounts, '1010', 0, amt, 'Cash paid from drawer'),
      ],
      exchangeRate: params.exchangeRate,
      postedBy: params.postedBy,
    });
  }

  const variance = roundCurrency(params.amountUsd);
  if (Math.abs(variance) < 0.01) return null;
  if (variance < 0) {
    const shortAmt = Math.abs(variance);
    return finalizeBalancedJournal({
      entryNo: params.entryNo,
      branchId: params.branchId,
      date: txDate,
      sourceType: 'shift_cash',
      description: `Shift Close Cash Shortage ($${shortAmt.toFixed(2)}) — ${params.reason}`,
      rawLines: [
        makeLine(1, params.accounts, '6890', shortAmt, 0, 'Drawer cash shortage'),
        makeLine(2, params.accounts, '1010', 0, shortAmt, 'Cash reconciliation adjustment'),
      ],
      exchangeRate: params.exchangeRate,
      postedBy: params.postedBy,
    });
  }

  return finalizeBalancedJournal({
    entryNo: params.entryNo,
    branchId: params.branchId,
    date: txDate,
    sourceType: 'shift_cash',
    description: `Shift Close Cash Overage (+$${variance.toFixed(2)}) — ${params.reason}`,
    rawLines: [
      makeLine(1, params.accounts, '1010', variance, 0, 'Cash reconciliation adjustment'),
      makeLine(2, params.accounts, '6890', 0, variance, 'Drawer cash overage'),
    ],
    exchangeRate: params.exchangeRate,
    postedBy: params.postedBy,
  });
}

export function buildReversalJournal(params: {
  entryNo: string;
  original: JournalEntry;
  accounts: LedgerAccount[];
  postedBy: string;
  reason?: string;
  date?: string;
}): JournalEntry | null {
  const txDate = params.date || new Date().toISOString().slice(0, 10);
  const swappedLines = params.original.lines.map((line, idx) =>
    makeLine(
      idx + 1,
      params.accounts,
      line.accountCode,
      line.creditUsd,
      line.debitUsd,
      `Reversal of ${params.original.entryNo}`
    )
  );
  return finalizeBalancedJournal({
    entryNo: params.entryNo,
    branchId: params.original.branchId,
    date: txDate,
    sourceType: 'reversal',
    sourceRef: params.original.entryNo,
    description: `Reversal of ${params.original.entryNo}${params.reason ? ` — ${params.reason}` : ''}`,
    rawLines: swappedLines,
    exchangeRate: params.original.exchangeRate,
    postedBy: params.postedBy,
    reversesEntryId: params.original.id,
  });
}

// ---------------------------------------------------------------------------
// 3. Smart Procurement Auto-Draft PO Helper
// ---------------------------------------------------------------------------

export interface AutoDraftPoProposal {
  supplierId: string;
  supplierName: string;
  supplierVattin?: string;
  paymentTerms: SupplierPaymentTerms;
  lines: PurchaseOrderLine[];
  subtotalUsd: number;
}

/**
 * Match an ingredient to the most plausible supplier using category keyword
 * heuristics, falling back to the first active supplier. Returns null when no
 * eligible supplier exists.
 */
export function matchIngredientSupplier(
  ingredient: Ingredient,
  suppliers: Supplier[]
): Supplier | null {
  if (suppliers.length === 0) return null;

  // An explicitly preferred supplier always wins (when still eligible).
  if (ingredient.preferredSupplierId) {
    const preferred = suppliers.find((s) => s.id === ingredient.preferredSupplierId);
    if (preferred) return preferred;
  }

  const lower = ingredient.nameEn.toLowerCase();
  if (lower.includes('coffee') || lower.includes('bean') || lower.includes('tea')) {
    return (
      suppliers.find((s) => s.category.toLowerCase().includes('coffee')) || suppliers[0]
    );
  }
  if (lower.includes('milk') || lower.includes('cream') || lower.includes('syrup')) {
    return suppliers.find((s) => s.category.toLowerCase().includes('dairy')) || suppliers[0];
  }
  if (
    lower.includes('beef') ||
    lower.includes('prawn') ||
    lower.includes('egg') ||
    lower.includes('rice') ||
    lower.includes('lime') ||
    lower.includes('herb')
  ) {
    return (
      suppliers.find(
        (s) =>
          s.category.toLowerCase().includes('fresh') ||
          s.category.toLowerCase().includes('produce')
      ) || suppliers[0]
    );
  }
  return suppliers[0];
}

export function computeLowStockAutoDraftPos(params: {
  branchId: string;
  ingredients: Ingredient[];
  suppliers: Supplier[];
  existingPos: PurchaseOrder[];
}): AutoDraftPoProposal[] {
  const { branchId, ingredients, suppliers, existingPos } = params;
  const activeSuppliers = suppliers.filter(
    (s) => s.active && (s.branchId === branchId || s.branchId === 'all')
  );
  if (activeSuppliers.length === 0) return [];

  // Ingredients already on an open ('draft' | 'sent' | 'partial') PO for this branch
  const pendingIngIds = new Set<string>();
  for (const po of existingPos) {
    if (po.branchId !== branchId) continue;
    if (po.status === 'draft' || po.status === 'sent' || po.status === 'partial') {
      for (const l of po.lines) {
        if (l.ingredientId && l.receivedQty < l.orderedQty) {
          pendingIngIds.add(l.ingredientId);
        }
      }
    }
  }

  const lowIngs = ingredients.filter(
    (ing) => ing.branchId === branchId && ing.onHand <= ing.minLevel && !pendingIngIds.has(ing.id)
  );
  if (lowIngs.length === 0) return [];

  const grouped = new Map<string, { supplier: Supplier; lines: PurchaseOrderLine[] }>();

  for (const ing of lowIngs) {
    const sup = matchIngredientSupplier(ing, activeSuppliers) || activeSuppliers[0];
    const targetStock = Math.max(ing.minLevel * 2.5, ing.minLevel + ing.purchaseUnitSize);
    const deficitBaseUnits = Math.max(ing.purchaseUnitSize, targetStock - ing.onHand);
    const conversion = Math.max(1, ing.purchaseUnitSize || 1);
    const orderedQty = Math.max(1, Math.ceil(deficitBaseUnits / conversion));
    const unitCostUsd = roundCurrency(Math.max(0.25, ing.avgCostUsd * conversion));
    const lineTotalUsd = roundCurrency(orderedQty * unitCostUsd);

    const line: PurchaseOrderLine = {
      id: `pol_${Date.now()}_${ing.id}_${Math.random().toString(36).slice(2, 5)}`,
      ingredientId: ing.id,
      itemName: ing.nameEn,
      purchaseUnit: ing.purchaseUnit || 'unit',
      baseUnit: ing.unit,
      conversionFactor: conversion,
      orderedQty,
      receivedQty: 0,
      unitCostUsd,
      lineTotalUsd,
    };

    const bucket = grouped.get(sup.id) || { supplier: sup, lines: [] };
    bucket.lines.push(line);
    grouped.set(sup.id, bucket);
  }

  return Array.from(grouped.values()).map(({ supplier, lines }) => ({
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierVattin: supplier.vattin,
    paymentTerms: supplier.paymentTerms,
    lines,
    subtotalUsd: roundCurrency(lines.reduce((s, l) => s + l.lineTotalUsd, 0)),
  }));
}

// ---------------------------------------------------------------------------
// 4. Financial Reporting Suite (All 6 Core Reports)
// ---------------------------------------------------------------------------

export interface ReportFilter {
  branchId?: string | 'ALL';
  fromDate?: string;
  toDate?: string;
}

export function filterJournalEntries(
  entries: JournalEntry[],
  filter: ReportFilter
): JournalEntry[] {
  return entries.filter((e) => {
    if (filter.branchId && filter.branchId !== 'ALL' && e.branchId !== filter.branchId) {
      return false;
    }
    if (filter.fromDate && e.date < filter.fromDate) return false;
    if (filter.toDate && e.date > filter.toDate) return false;
    return true;
  });
}

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  nameKh: string;
  type: LedgerAccount['type'];
  subType: LedgerAccount['subType'];
  normalBalance: 'debit' | 'credit';
  periodDebitUsd: number;
  periodCreditUsd: number;
  netDebitUsd: number;
  netCreditUsd: number;
  signedBalanceUsd: number; // positive in account's normal direction
}

export interface TrialBalanceReport {
  rows: TrialBalanceRow[];
  totalPeriodDebitUsd: number;
  totalPeriodCreditUsd: number;
  totalNetDebitUsd: number;
  totalNetCreditUsd: number;
  isBalanced: boolean;
}

export function computeTrialBalance(
  accounts: LedgerAccount[],
  entries: JournalEntry[],
  filter: ReportFilter = {}
): TrialBalanceReport {
  const filtered = filterJournalEntries(entries, filter);
  const map = new Map<string, { debit: number; credit: number }>();

  for (const entry of filtered) {
    for (const line of entry.lines) {
      const cur = map.get(line.accountCode) || { debit: 0, credit: 0 };
      cur.debit = roundCurrency(cur.debit + line.debitUsd);
      cur.credit = roundCurrency(cur.credit + line.creditUsd);
      map.set(line.accountCode, cur);
    }
  }

  const sortedAccounts = [...accounts].sort((a, b) => a.code.localeCompare(b.code));
  const rows: TrialBalanceRow[] = [];

  for (const acc of sortedAccounts) {
    const sums = map.get(acc.code) || { debit: 0, credit: 0 };
    const rawDiff = roundCurrency(sums.debit - sums.credit);
    const netDebitUsd = rawDiff > 0 ? rawDiff : 0;
    const netCreditUsd = rawDiff < 0 ? Math.abs(rawDiff) : 0;
    const signedBalanceUsd =
      acc.normalBalance === 'debit'
        ? roundCurrency(sums.debit - sums.credit)
        : roundCurrency(sums.credit - sums.debit);

    if (sums.debit > 0 || sums.credit > 0 || acc.systemAccount) {
      rows.push({
        accountCode: acc.code,
        accountName: acc.nameEn,
        nameKh: acc.nameKh,
        type: acc.type,
        subType: acc.subType,
        normalBalance: acc.normalBalance,
        periodDebitUsd: sums.debit,
        periodCreditUsd: sums.credit,
        netDebitUsd,
        netCreditUsd,
        signedBalanceUsd,
      });
    }
  }

  const totalPeriodDebitUsd = roundCurrency(rows.reduce((s, r) => s + r.periodDebitUsd, 0));
  const totalPeriodCreditUsd = roundCurrency(rows.reduce((s, r) => s + r.periodCreditUsd, 0));
  const totalNetDebitUsd = roundCurrency(rows.reduce((s, r) => s + r.netDebitUsd, 0));
  const totalNetCreditUsd = roundCurrency(rows.reduce((s, r) => s + r.netCreditUsd, 0));

  return {
    rows,
    totalPeriodDebitUsd,
    totalPeriodCreditUsd,
    totalNetDebitUsd,
    totalNetCreditUsd,
    isBalanced: Math.abs(totalNetDebitUsd - totalNetCreditUsd) <= 0.02,
  };
}

export interface ProfitAndLossLine {
  accountCode: string;
  accountName: string;
  subType: LedgerAccount['subType'];
  amountUsd: number;
  pctOfRevenue: number;
}

export interface ProfitAndLossReport {
  revenueLines: ProfitAndLossLine[];
  totalRevenueUsd: number;
  cogsLines: ProfitAndLossLine[];
  totalCogsUsd: number;
  grossProfitUsd: number;
  grossMarginPct: number;
  payrollExpenseUsd: number;
  primeCostUsd: number;
  primeCostPct: number;
  expenseLines: ProfitAndLossLine[];
  totalOperatingExpenseUsd: number;
  netProfitUsd: number;
  netMarginPct: number;
}

export function computeProfitAndLoss(
  accounts: LedgerAccount[],
  entries: JournalEntry[],
  filter: ReportFilter = {}
): ProfitAndLossReport {
  const tb = computeTrialBalance(accounts, entries, filter);

  const rawRev = tb.rows.filter((r) => r.type === 'revenue' && Math.abs(r.signedBalanceUsd) > 0.004);
  const totalRevenueUsd = roundCurrency(rawRev.reduce((s, r) => s + r.signedBalanceUsd, 0));

  const pct = (val: number) =>
    totalRevenueUsd > 0 ? roundCurrency((val / totalRevenueUsd) * 100) : 0;

  const revenueLines: ProfitAndLossLine[] = rawRev.map((r) => ({
    accountCode: r.accountCode,
    accountName: r.accountName,
    subType: r.subType,
    amountUsd: r.signedBalanceUsd,
    pctOfRevenue: pct(r.signedBalanceUsd),
  }));

  const rawCogs = tb.rows.filter((r) => r.type === 'cogs' && Math.abs(r.signedBalanceUsd) > 0.004);
  const totalCogsUsd = roundCurrency(rawCogs.reduce((s, r) => s + r.signedBalanceUsd, 0));
  const cogsLines: ProfitAndLossLine[] = rawCogs.map((r) => ({
    accountCode: r.accountCode,
    accountName: r.accountName,
    subType: r.subType,
    amountUsd: r.signedBalanceUsd,
    pctOfRevenue: pct(r.signedBalanceUsd),
  }));

  const grossProfitUsd = roundCurrency(totalRevenueUsd - totalCogsUsd);
  const grossMarginPct = pct(grossProfitUsd);

  const rawExp = tb.rows.filter((r) => r.type === 'expense' && Math.abs(r.signedBalanceUsd) > 0.004);
  const totalOperatingExpenseUsd = roundCurrency(
    rawExp.reduce((s, r) => s + r.signedBalanceUsd, 0)
  );
  const payrollExpenseUsd = roundCurrency(
    rawExp
      .filter((r) => r.subType === 'payroll_expense')
      .reduce((s, r) => s + r.signedBalanceUsd, 0)
  );
  const primeCostUsd = roundCurrency(totalCogsUsd + payrollExpenseUsd);
  const primeCostPct = pct(primeCostUsd);

  const expenseLines: ProfitAndLossLine[] = rawExp.map((r) => ({
    accountCode: r.accountCode,
    accountName: r.accountName,
    subType: r.subType,
    amountUsd: r.signedBalanceUsd,
    pctOfRevenue: pct(r.signedBalanceUsd),
  }));

  const netProfitUsd = roundCurrency(grossProfitUsd - totalOperatingExpenseUsd);
  const netMarginPct = pct(netProfitUsd);

  return {
    revenueLines,
    totalRevenueUsd,
    cogsLines,
    totalCogsUsd,
    grossProfitUsd,
    grossMarginPct,
    payrollExpenseUsd,
    primeCostUsd,
    primeCostPct,
    expenseLines,
    totalOperatingExpenseUsd,
    netProfitUsd,
    netMarginPct,
  };
}

export interface BalanceSheetSectionLine {
  accountCode: string;
  accountName: string;
  subType: LedgerAccount['subType'];
  balanceUsd: number;
}

export interface BalanceSheetReport {
  assets: BalanceSheetSectionLine[];
  cashAndBankUsd: number;
  inventoryAssetUsd: number;
  totalAssetsUsd: number;
  liabilities: BalanceSheetSectionLine[];
  accountsPayableUsd: number;
  totalLiabilitiesUsd: number;
  equity: BalanceSheetSectionLine[];
  currentPeriodEarningsUsd: number;
  totalEquityUsd: number;
  totalLiabilitiesAndEquityUsd: number;
  isBalanced: boolean;
}

export function computeBalanceSheet(
  accounts: LedgerAccount[],
  entries: JournalEntry[],
  filter: { branchId?: string | 'ALL'; asOfDate?: string } = {}
): BalanceSheetReport {
  const cumulativeFilter: ReportFilter = {
    branchId: filter.branchId,
    toDate: filter.asOfDate,
  };
  const tb = computeTrialBalance(accounts, entries, cumulativeFilter);
  const pnl = computeProfitAndLoss(accounts, entries, cumulativeFilter);

  const assets: BalanceSheetSectionLine[] = tb.rows
    .filter((r) => r.type === 'asset' && Math.abs(r.signedBalanceUsd) > 0.004)
    .map((r) => ({
      accountCode: r.accountCode,
      accountName: r.accountName,
      subType: r.subType,
      balanceUsd: r.signedBalanceUsd,
    }));

  const cashAndBankUsd = roundCurrency(
    assets
      .filter((a) => a.subType === 'cash_bank')
      .reduce((s, a) => s + a.balanceUsd, 0)
  );
  const inventoryAssetUsd = roundCurrency(
    assets
      .filter((a) => a.subType === 'inventory')
      .reduce((s, a) => s + a.balanceUsd, 0)
  );
  const totalAssetsUsd = roundCurrency(assets.reduce((s, a) => s + a.balanceUsd, 0));

  const liabilities: BalanceSheetSectionLine[] = tb.rows
    .filter((r) => r.type === 'liability' && Math.abs(r.signedBalanceUsd) > 0.004)
    .map((r) => ({
      accountCode: r.accountCode,
      accountName: r.accountName,
      subType: r.subType,
      balanceUsd: r.signedBalanceUsd,
    }));

  const accountsPayableUsd = roundCurrency(
    liabilities
      .filter((l) => l.accountCode === '2010')
      .reduce((s, l) => s + l.balanceUsd, 0)
  );
  const totalLiabilitiesUsd = roundCurrency(liabilities.reduce((s, l) => s + l.balanceUsd, 0));

  // Equity: credit-normal accounts positive, debit-normal (Owner Drawings 3100) negative
  const equity: BalanceSheetSectionLine[] = tb.rows
    .filter((r) => r.type === 'equity' && Math.abs(r.signedBalanceUsd) > 0.004)
    .map((r) => ({
      accountCode: r.accountCode,
      accountName: r.accountName,
      subType: r.subType,
      balanceUsd:
        r.normalBalance === 'credit' ? r.signedBalanceUsd : -r.signedBalanceUsd,
    }));

  const currentPeriodEarningsUsd = pnl.netProfitUsd;
  const totalEquityUsd = roundCurrency(
    equity.reduce((s, e) => s + e.balanceUsd, 0) + currentPeriodEarningsUsd
  );
  const totalLiabilitiesAndEquityUsd = roundCurrency(totalLiabilitiesUsd + totalEquityUsd);

  return {
    assets,
    cashAndBankUsd,
    inventoryAssetUsd,
    totalAssetsUsd,
    liabilities,
    accountsPayableUsd,
    totalLiabilitiesUsd,
    equity,
    currentPeriodEarningsUsd,
    totalEquityUsd,
    totalLiabilitiesAndEquityUsd,
    isBalanced: Math.abs(totalAssetsUsd - totalLiabilitiesAndEquityUsd) <= 0.02,
  };
}

export interface CashFlowLine {
  label: string;
  amountUsd: number;
}

export interface CashFlowReport {
  openingCashUsd: number;
  operatingLines: CashFlowLine[];
  netOperatingCashUsd: number;
  investingLines: CashFlowLine[];
  netInvestingCashUsd: number;
  financingLines: CashFlowLine[];
  netFinancingCashUsd: number;
  netCashChangeUsd: number;
  closingCashUsd: number;
}

export function computeCashFlowStatement(
  accounts: LedgerAccount[],
  entries: JournalEntry[],
  filter: ReportFilter = {}
): CashFlowReport {
  const cashCodes = new Set(
    accounts.filter((a) => a.subType === 'cash_bank').map((a) => a.code)
  );
  const accByCode = new Map(accounts.map((a) => [a.code, a]));

  // Opening cash before filter.fromDate
  let openingCashUsd = 0;
  if (filter.fromDate) {
    for (const e of entries) {
      if (filter.branchId && filter.branchId !== 'ALL' && e.branchId !== filter.branchId) continue;
      if (e.date < filter.fromDate) {
        for (const l of e.lines) {
          if (cashCodes.has(l.accountCode)) {
            openingCashUsd = roundCurrency(openingCashUsd + l.debitUsd - l.creditUsd);
          }
        }
      }
    }
  }

  const periodEntries = filterJournalEntries(entries, filter);
  let customerReceiptsUsd = 0;
  let supplierAndInventoryPaymentsUsd = 0;
  let operatingExpensesPaidUsd = 0;
  let otherOperatingCashUsd = 0;
  let capexInvestingUsd = 0;
  let ownerFinancingUsd = 0;

  for (const entry of periodEntries) {
    const cashDelta = roundCurrency(
      entry.lines
        .filter((l) => cashCodes.has(l.accountCode))
        .reduce((s, l) => s + l.debitUsd - l.creditUsd, 0)
    );
    if (Math.abs(cashDelta) < 0.005) continue;

    const nonCashLines = entry.lines.filter((l) => !cashCodes.has(l.accountCode));
    const hasFixedAsset = nonCashLines.some(
      (l) => accByCode.get(l.accountCode)?.subType === 'fixed_asset'
    );
    const hasEquity = nonCashLines.some(
      (l) => accByCode.get(l.accountCode)?.type === 'equity'
    );

    if (hasFixedAsset) {
      capexInvestingUsd = roundCurrency(capexInvestingUsd + cashDelta);
    } else if (hasEquity || entry.sourceType === 'opening') {
      ownerFinancingUsd = roundCurrency(ownerFinancingUsd + cashDelta);
    } else if (
      entry.sourceType === 'pos_sale' ||
      entry.sourceType === 'pos_refund' ||
      entry.sourceType === 'prepaid_pack'
    ) {
      customerReceiptsUsd = roundCurrency(customerReceiptsUsd + cashDelta);
    } else if (
      entry.sourceType === 'po_payment' ||
      entry.sourceType === 'inventory_purchase'
    ) {
      supplierAndInventoryPaymentsUsd = roundCurrency(
        supplierAndInventoryPaymentsUsd + cashDelta
      );
    } else if (entry.sourceType === 'expense_voucher') {
      operatingExpensesPaidUsd = roundCurrency(operatingExpensesPaidUsd + cashDelta);
    } else {
      otherOperatingCashUsd = roundCurrency(otherOperatingCashUsd + cashDelta);
    }
  }

  const operatingLines: CashFlowLine[] = [
    { label: 'Cash collected from POS customers & prepaid passes', amountUsd: customerReceiptsUsd },
    { label: 'Cash paid to suppliers & direct stock purchases', amountUsd: supplierAndInventoryPaymentsUsd },
    { label: 'Cash paid for payroll, rent, utilities & operating expenses', amountUsd: operatingExpensesPaidUsd },
    { label: 'Petty cash & shift drawer adjustments', amountUsd: otherOperatingCashUsd },
  ];
  const netOperatingCashUsd = roundCurrency(
    operatingLines.reduce((s, l) => s + l.amountUsd, 0)
  );

  const investingLines: CashFlowLine[] = [
    { label: 'Equipment & store fit-out capital expenditure', amountUsd: capexInvestingUsd },
  ];
  const netInvestingCashUsd = capexInvestingUsd;

  const financingLines: CashFlowLine[] = [
    { label: 'Owner capital contributions, opening float & drawings', amountUsd: ownerFinancingUsd },
  ];
  const netFinancingCashUsd = ownerFinancingUsd;

  const netCashChangeUsd = roundCurrency(
    netOperatingCashUsd + netInvestingCashUsd + netFinancingCashUsd
  );
  const closingCashUsd = roundCurrency(openingCashUsd + netCashChangeUsd);

  return {
    openingCashUsd,
    operatingLines,
    netOperatingCashUsd,
    investingLines,
    netInvestingCashUsd,
    financingLines,
    netFinancingCashUsd,
    netCashChangeUsd,
    closingCashUsd,
  };
}

export interface GeneralLedgerEntryRow {
  entryId: string;
  entryNo: string;
  date: string;
  sourceType: JournalSourceType;
  sourceRef?: string;
  description: string;
  memo?: string;
  debitUsd: number;
  creditUsd: number;
  runningBalanceUsd: number;
}

export interface GeneralLedgerReport {
  account: LedgerAccount;
  openingBalanceUsd: number;
  rows: GeneralLedgerEntryRow[];
  totalDebitUsd: number;
  totalCreditUsd: number;
  closingBalanceUsd: number;
}

export function computeGeneralLedgerAccount(
  accountCode: string,
  accounts: LedgerAccount[],
  entries: JournalEntry[],
  filter: ReportFilter = {}
): GeneralLedgerReport | null {
  const account = accounts.find((a) => a.code === accountCode);
  if (!account) return null;

  const deltaFor = (debit: number, credit: number) =>
    account.normalBalance === 'debit'
      ? roundCurrency(debit - credit)
      : roundCurrency(credit - debit);

  let openingBalanceUsd = 0;
  if (filter.fromDate) {
    for (const e of entries) {
      if (filter.branchId && filter.branchId !== 'ALL' && e.branchId !== filter.branchId) continue;
      if (e.date < filter.fromDate) {
        for (const l of e.lines) {
          if (l.accountCode === accountCode) {
            openingBalanceUsd = roundCurrency(
              openingBalanceUsd + deltaFor(l.debitUsd, l.creditUsd)
            );
          }
        }
      }
    }
  }

  const periodEntries = filterJournalEntries(entries, filter).sort((a, b) =>
    a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)
  );

  let running = openingBalanceUsd;
  let totalDebitUsd = 0;
  let totalCreditUsd = 0;
  const rows: GeneralLedgerEntryRow[] = [];

  for (const e of periodEntries) {
    for (const l of e.lines) {
      if (l.accountCode !== accountCode) continue;
      totalDebitUsd = roundCurrency(totalDebitUsd + l.debitUsd);
      totalCreditUsd = roundCurrency(totalCreditUsd + l.creditUsd);
      running = roundCurrency(running + deltaFor(l.debitUsd, l.creditUsd));
      rows.push({
        entryId: e.id,
        entryNo: e.entryNo,
        date: e.date,
        sourceType: e.sourceType,
        sourceRef: e.sourceRef,
        description: e.description,
        memo: l.memo,
        debitUsd: l.debitUsd,
        creditUsd: l.creditUsd,
        runningBalanceUsd: running,
      });
    }
  }

  return {
    account,
    openingBalanceUsd,
    rows,
    totalDebitUsd,
    totalCreditUsd,
    closingBalanceUsd: running,
  };
}

export interface ApAgingVendorRow {
  supplierId: string;
  supplierName: string;
  vattin?: string;
  currentUsd: number;
  days1To15Usd: number;
  days16To30Usd: number;
  days31PlusUsd: number;
  totalBalanceUsd: number;
}

export interface CambodiaTaxAndAgingReport {
  taxableSalesExclVatUsd: number;
  outputVatCollectedUsd: number;
  eligibleInputVatCreditUsd: number;
  netVatPayableUsd: number; // positive = pay GDT, negative = input VAT carryforward credit
  netVatPayableKhr: number;
  whtPayableUsd: number;
  whtPayableKhr: number;
  apAgingRows: ApAgingVendorRow[];
  totalApOpenUsd: number;
  overdueApUsd: number;
}

export function computeCambodiaTaxAndAgingReport(params: {
  accounts: LedgerAccount[];
  entries: JournalEntry[];
  purchaseOrders: PurchaseOrder[];
  invoices: VatInvoice[];
  exchangeRate: number;
  referenceDate?: string;
  filter?: ReportFilter;
}): CambodiaTaxAndAgingReport {
  const { accounts, entries, purchaseOrders, invoices, exchangeRate } = params;
  const filter = params.filter || {};
  const tb = computeTrialBalance(accounts, entries, filter);

  const outputRow = tb.rows.find((r) => r.accountCode === '2100');
  const inputRow = tb.rows.find((r) => r.accountCode === '1300');
  const whtRow = tb.rows.find((r) => r.accountCode === '2150');

  const outputVatCollectedUsd = roundCurrency(Math.max(0, outputRow?.signedBalanceUsd || 0));
  const eligibleInputVatCreditUsd = roundCurrency(Math.max(0, inputRow?.signedBalanceUsd || 0));
  const netVatPayableUsd = roundCurrency(outputVatCollectedUsd - eligibleInputVatCreditUsd);
  const whtPayableUsd = roundCurrency(Math.max(0, whtRow?.signedBalanceUsd || 0));

  const filteredInvoices = invoices.filter((inv) => {
    if (inv.status !== 'issued') return false;
    if (filter.branchId && filter.branchId !== 'ALL' && inv.branchId !== filter.branchId) return false;
    if (filter.fromDate && inv.date < filter.fromDate) return false;
    if (filter.toDate && inv.date > filter.toDate) return false;
    return true;
  });
  const taxableSalesExclVatUsd = roundCurrency(
    filteredInvoices.reduce(
      (s, i) => s + i.exclVatUsd * (i.invoiceType === 'credit_note' ? -1 : 1),
      0
    )
  );

  const refDateMs = new Date(`${params.referenceDate || '2026-11-16'}T00:00:00Z`).getTime();
  const vendorMap = new Map<string, ApAgingVendorRow>();

  for (const po of purchaseOrders) {
    if (filter.branchId && filter.branchId !== 'ALL' && po.branchId !== filter.branchId) continue;
    if (po.status === 'cancelled' || po.balanceDueUsd <= 0.009) continue;

    const dueMs = new Date(`${po.dueDate || po.expectedDate || po.orderDate}T00:00:00Z`).getTime();
    const daysPastDue = Number.isNaN(dueMs)
      ? 0
      : Math.floor((refDateMs - dueMs) / 86_400_000);

    const row = vendorMap.get(po.supplierId) || {
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      vattin: po.supplierVattin,
      currentUsd: 0,
      days1To15Usd: 0,
      days16To30Usd: 0,
      days31PlusUsd: 0,
      totalBalanceUsd: 0,
    };

    if (daysPastDue <= 0) {
      row.currentUsd = roundCurrency(row.currentUsd + po.balanceDueUsd);
    } else if (daysPastDue <= 15) {
      row.days1To15Usd = roundCurrency(row.days1To15Usd + po.balanceDueUsd);
    } else if (daysPastDue <= 30) {
      row.days16To30Usd = roundCurrency(row.days16To30Usd + po.balanceDueUsd);
    } else {
      row.days31PlusUsd = roundCurrency(row.days31PlusUsd + po.balanceDueUsd);
    }
    row.totalBalanceUsd = roundCurrency(row.totalBalanceUsd + po.balanceDueUsd);
    vendorMap.set(po.supplierId, row);
  }

  const apAgingRows = Array.from(vendorMap.values()).sort(
    (a, b) => b.totalBalanceUsd - a.totalBalanceUsd
  );
  const totalApOpenUsd = roundCurrency(
    apAgingRows.reduce((s, r) => s + r.totalBalanceUsd, 0)
  );
  const overdueApUsd = roundCurrency(
    apAgingRows.reduce(
      (s, r) => s + r.days1To15Usd + r.days16To30Usd + r.days31PlusUsd,
      0
    )
  );

  return {
    taxableSalesExclVatUsd,
    outputVatCollectedUsd,
    eligibleInputVatCreditUsd,
    netVatPayableUsd,
    netVatPayableKhr: usdToKhr(Math.max(0, netVatPayableUsd), exchangeRate, 100),
    whtPayableUsd,
    whtPayableKhr: usdToKhr(whtPayableUsd, exchangeRate, 100),
    apAgingRows,
    totalApOpenUsd,
    overdueApUsd,
  };
}
