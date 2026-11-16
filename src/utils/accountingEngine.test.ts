import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOperatingExpenseJournal,
  buildPoGrnJournal,
  buildPoPaymentJournal,
  buildPosOrderSaleJournal,
  buildReversalJournal,
  computeBalanceSheet,
  computeCambodiaTaxAndAgingReport,
  computeCashFlowStatement,
  computeGeneralLedgerAccount,
  computeLowStockAutoDraftPos,
  computeProfitAndLoss,
  computeTrialBalance,
  createDefaultChartOfAccounts,
  finalizeBalancedJournal,
} from './accountingEngine';
import type {
  Ingredient,
  JournalEntry,
  OperatingExpense,
  PosOrder,
  PurchaseOrder,
  Recipe,
  Supplier,
} from '../types/pos';

test('Double-Entry Accounting Engine: POS sales, PO GRNs, Vendor WHT Payments & Expenses stay 100% balanced across all 6 reports', () => {
  const accounts = createDefaultChartOfAccounts();
  const entries: JournalEntry[] = [];

  // 1. Opening Equity + Cash + Bank + Initial Inventory
  const opening = finalizeBalancedJournal({
    entryNo: 'JE-0001',
    branchId: 'b1',
    date: '2026-11-01',
    sourceType: 'opening',
    description: 'Opening capital & initial inventory',
    rawLines: [
      { id: 'l1', accountCode: '1010', accountName: 'Cash', debitUsd: 500, creditUsd: 0 },
      { id: 'l2', accountCode: '1020', accountName: 'ABA Bank', debitUsd: 1500, creditUsd: 0 },
      { id: 'l3', accountCode: '1200', accountName: 'Inventory', debitUsd: 300, creditUsd: 0 },
      { id: 'l4', accountCode: '3000', accountName: 'Owner Capital', debitUsd: 0, creditUsd: 2300 },
    ],
    exchangeRate: 4100,
    postedBy: 'Owner',
  });
  assert.ok(opening);
  entries.push(opening);

  // 2. POS Sale ($22.00 total incl. $2.00 Output VAT, KHQR payment, $4.50 Recipe COGS)
  const ingredients: Ingredient[] = [
    {
      id: 'ing_coffee',
      branchId: 'b1',
      nameEn: 'Arabica Coffee Beans',
      nameKh: 'គ្រាប់កាហ្វេ',
      unit: 'g',
      purchaseUnit: 'kg',
      purchaseUnitSize: 1000,
      onHand: 800, // below minLevel 1500 -> triggers Auto-Draft PO!
      minLevel: 1500,
      used7d: 500,
      avgCostUsd: 0.015,
    },
  ];
  const recipes: Recipe[] = [
    {
      menuItemId: 'm_latte',
      lines: [{ ingredientId: 'ing_coffee', qtyPerPortion: 100 }], // $1.50 per cup
    },
  ];
  const order: PosOrder = {
    id: 'ord_1',
    orderNumber: 101,
    branchId: 'b1',
    tableName: 'T01',
    channel: 'dine_in',
    guests: 2,
    status: 'paid',
    items: [
      {
        id: 'oi_1',
        menuItemId: 'm_latte',
        nameEn: 'Iced Latte',
        nameKh: 'ឡាតេទឹកកក',
        nameVi: 'Latte đá',
        unitPriceUsd: 6.67,
        qty: 3,
        round: 1,
        station: 'bar',
        category: 'Coffee',
        sentToKitchen: true,
        kdsStatus: 'served',
      },
    ],
    currentRound: 1,
    manualDiscountPercent: 0,
    manualDiscountUsd: 0,
    promoDiscountUsd: 0,
    pointsRedeemed: 0,
    depositAppliedUsd: 0,
    vatUsd: 2,
    serviceChargeUsd: 0,
    totalUsd: 22,
    totalKhr: 90200,
    paidUsd: 22,
    paidKhr: 0,
    changeUsd: 0,
    changeKhr: 0,
    paymentMethod: 'KHQR',
    createdAt: '2026-11-10T10:00:00Z',
    updatedAt: '2026-11-10T10:00:00Z',
    cashierName: 'Sokha',
  };

  const saleJe = buildPosOrderSaleJournal({
    entryNo: 'JE-0002',
    order,
    accounts,
    recipes,
    ingredients,
    exchangeRate: 4100,
    postedBy: 'Sokha',
    date: '2026-11-10',
  });
  assert.ok(saleJe);
  assert.equal(saleJe.totalDebitUsd, 26.5); // $22 KHQR + $4.50 COGS
  assert.equal(saleJe.totalCreditUsd, 26.5); // $20 Sales + $2 VAT + $4.50 Inventory
  entries.push(saleJe);

  // 3. PO Goods Receipt ($100 inventory + $10 Input VAT = $110 AP)
  const grnJe = buildPoGrnJournal({
    entryNo: 'JE-0003',
    branchId: 'b1',
    poNumber: 'PO-2026-0001',
    grnNumber: 'GRN-0001',
    supplierName: 'Mekong Coffee Roasters',
    subtotalUsd: 100,
    inputVatUsd: 10,
    totalUsd: 110,
    accounts,
    exchangeRate: 4100,
    postedBy: 'Owner',
    date: '2026-11-12',
  });
  assert.ok(grnJe);
  entries.push(grnJe);

  // 4. Partial PO Payment ($60 AP settled via ABA Bank)
  const poPayJe = buildPoPaymentJournal({
    entryNo: 'JE-0004',
    branchId: 'b1',
    poNumber: 'PO-2026-0001',
    supplierName: 'Mekong Coffee Roasters',
    grossSettledUsd: 60,
    whtDeductedUsd: 0,
    cashPaidUsd: 60,
    method: 'Bank transfer',
    paymentRef: 'ABA-991122',
    accounts,
    exchangeRate: 4100,
    postedBy: 'Owner',
    date: '2026-11-13',
  });
  assert.ok(poPayJe);
  entries.push(poPayJe);

  // 5. Operating Expense: Shop Rent $400 with 10% Cambodia WHT ($40 withheld, $360 paid via Cash) + Staff Payroll $5
  const rentExpense: OperatingExpense = {
    id: 'exp_1',
    voucherNo: 'EXP-0001',
    branchId: 'b1',
    date: '2026-11-14',
    expenseAccountCode: '6200',
    expenseAccountName: 'Shop Rent & Premises Lease',
    vendorName: 'BKK1 Landlord',
    description: 'November shop rent',
    subtotalUsd: 400,
    applyInputVat: false,
    inputVatUsd: 0,
    whtPercent: 10,
    whtAmountUsd: 40,
    totalUsd: 400,
    cashPaidUsd: 360,
    paymentStatus: 'paid',
    paymentMethod: 'Cash',
    createdBy: 'Owner',
    createdAt: '2026-11-14T12:00:00Z',
  };
  const rentJe = buildOperatingExpenseJournal({
    entryNo: 'JE-0005',
    expense: rentExpense,
    accounts,
    exchangeRate: 4100,
    postedBy: 'Owner',
  });
  assert.ok(rentJe);
  entries.push(rentJe);

  const payrollExpense: OperatingExpense = {
    id: 'exp_2',
    voucherNo: 'EXP-0002',
    branchId: 'b1',
    date: '2026-11-15',
    expenseAccountCode: '6100',
    expenseAccountName: 'Staff Salaries, Wages & NSSF',
    vendorName: 'Store Barista Payroll',
    description: 'Part-time barista shift wages',
    subtotalUsd: 5,
    applyInputVat: false,
    inputVatUsd: 0,
    whtPercent: 0,
    whtAmountUsd: 0,
    totalUsd: 5,
    cashPaidUsd: 5,
    paymentStatus: 'paid',
    paymentMethod: 'Cash',
    createdBy: 'Owner',
    createdAt: '2026-11-15T18:00:00Z',
  };
  const payrollJe = buildOperatingExpenseJournal({
    entryNo: 'JE-0006',
    expense: payrollExpense,
    accounts,
    exchangeRate: 4100,
    postedBy: 'Owner',
  });
  assert.ok(payrollJe);
  entries.push(payrollJe);

  // Verify Trial Balance
  const tb = computeTrialBalance(accounts, entries, { branchId: 'b1' });
  assert.equal(tb.isBalanced, true);
  assert.equal(tb.totalNetDebitUsd, tb.totalNetCreditUsd);

  // Verify Profit & Loss + Prime Cost KPI
  const pnl = computeProfitAndLoss(accounts, entries, { branchId: 'b1' });
  assert.equal(pnl.totalRevenueUsd, 20);
  assert.equal(pnl.totalCogsUsd, 4.5);
  assert.equal(pnl.grossProfitUsd, 15.5);
  assert.equal(pnl.payrollExpenseUsd, 5);
  assert.equal(pnl.primeCostUsd, 9.5); // $4.50 COGS + $5.00 Payroll
  assert.equal(pnl.totalOperatingExpenseUsd, 405);
  assert.equal(pnl.netProfitUsd, -389.5);

  // Verify Balance Sheet (Assets === Liabilities + Equity)
  const bs = computeBalanceSheet(accounts, entries, { branchId: 'b1' });
  assert.equal(bs.isBalanced, true);
  assert.equal(bs.totalAssetsUsd, bs.totalLiabilitiesAndEquityUsd);
  assert.equal(bs.accountsPayableUsd, 50); // $110 GRN - $60 Paid

  // Verify Cash Flow Statement reconciles to Balance Sheet Cash & Bank
  const cf = computeCashFlowStatement(accounts, entries, { branchId: 'b1' });
  assert.equal(cf.closingCashUsd, bs.cashAndBankUsd);

  // Verify General Ledger account running balance
  const glBank = computeGeneralLedgerAccount('1020', accounts, entries, { branchId: 'b1' });
  assert.ok(glBank);
  assert.equal(glBank.closingBalanceUsd, 1462); // 1500 + 22 - 60

  // Verify Cambodia GDT Tax & AP Aging
  const openPos: PurchaseOrder[] = [
    {
      id: 'po_1',
      poNumber: 'PO-2026-0001',
      branchId: 'b1',
      supplierId: 'sup_1',
      supplierName: 'Mekong Coffee Roasters',
      supplierVattin: 'L001-900112233',
      status: 'received',
      paymentStatus: 'partial',
      orderDate: '2026-11-01',
      expectedDate: '2026-11-05',
      dueDate: '2026-11-08', // 8 days overdue as of 2026-11-16
      paymentTerms: 'net_7',
      applyInputVat: true,
      whtPercent: 0,
      lines: [],
      subtotalUsd: 100,
      inputVatUsd: 10,
      totalUsd: 110,
      totalKhr: 451000,
      receivedSubtotalUsd: 100,
      receivedVatUsd: 10,
      receivedTotalUsd: 110,
      paidUsd: 60,
      whtWithheldUsd: 0,
      balanceDueUsd: 50,
      grnHistory: [],
      payments: [],
      createdBy: 'Owner',
      createdAt: '2026-11-01T09:00:00Z',
      updatedAt: '2026-11-13T09:00:00Z',
    },
  ];
  const taxReport = computeCambodiaTaxAndAgingReport({
    accounts,
    entries,
    purchaseOrders: openPos,
    invoices: [],
    exchangeRate: 4100,
    referenceDate: '2026-11-16',
    filter: { branchId: 'b1' },
  });
  assert.equal(taxReport.outputVatCollectedUsd, 2);
  assert.equal(taxReport.eligibleInputVatCreditUsd, 10);
  assert.equal(taxReport.netVatPayableUsd, -8); // $8 Input VAT credit carryforward
  assert.equal(taxReport.whtPayableUsd, 40); // $40 rental WHT payable
  assert.equal(taxReport.totalApOpenUsd, 50);
  assert.equal(taxReport.overdueApUsd, 50);
  assert.equal(taxReport.apAgingRows[0].days1To15Usd, 50);

  // Verify Reversal Entry restores balance cleanly
  const rev = buildReversalJournal({
    entryNo: 'JE-0007',
    original: payrollJe,
    accounts,
    postedBy: 'Owner',
    reason: 'Payroll correction',
    date: '2026-11-16',
  });
  assert.ok(rev);
  entries.push(rev);
  const pnlAfterRev = computeProfitAndLoss(accounts, entries, { branchId: 'b1' });
  assert.equal(pnlAfterRev.payrollExpenseUsd, 0);

  // Verify Smart Low-Stock Auto-PO Builder
  const suppliers: Supplier[] = [
    {
      id: 'sup_1',
      branchId: 'b1',
      name: 'Mekong Coffee Roasters',
      category: 'Coffee & Tea',
      contactName: 'Sokchea',
      phone: '012 333 444',
      paymentTerms: 'net_15',
      active: true,
      createdAt: '2026-11-01T00:00:00Z',
    },
  ];
  const drafts = computeLowStockAutoDraftPos({
    branchId: 'b1',
    ingredients,
    suppliers,
    existingPos: [],
  });
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].supplierId, 'sup_1');
  assert.equal(drafts[0].lines[0].ingredientId, 'ing_coffee');
  assert.ok(drafts[0].lines[0].orderedQty >= 3); // 1500 * 2.5 = 3750 - 800 = 2950g -> 3 kg
});
