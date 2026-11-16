import React, { useMemo, useState } from 'react';
import {
  Landmark,
  Plus,
  Download,
  Printer,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  FileSpreadsheet,
  Receipt,
  X,
  Trash2,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import type {
  AccountSubType,
  AccountType,
  JournalSourceType,
  PaymentMethod,
} from '../types/pos';
import {
  computeBalanceSheet,
  computeCambodiaTaxAndAgingReport,
  computeCashFlowStatement,
  computeGeneralLedgerAccount,
  computeProfitAndLoss,
  computeTrialBalance,
  createDefaultChartOfAccounts,
  filterJournalEntries,
} from '../utils/accountingEngine';
import { roundCurrency, usdToKhr } from '../utils/posMath';

type AccountingTab =
  | 'pnl'
  | 'balance_sheet'
  | 'cash_flow'
  | 'trial_balance'
  | 'general_ledger'
  | 'gdt_tax'
  | 'coa';

export function AccountingView() {
  const {
    state,
    activeBranch,
    saveLedgerAccount,
    recordOperatingExpense,
    postManualJournalEntry,
    reverseJournalEntry,
  } = usePos();

  const [tab, setTab] = useState<AccountingTab>('pnl');
  const [branchScope, setBranchScope] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState('2026-11-01');
  const [toDate, setToDate] = useState('2026-12-31');

  // General Ledger sub-controls
  const [selectedGlCode, setSelectedGlCode] = useState('1020');
  const [journalSourceFilter, setJournalSourceFilter] = useState<'all' | JournalSourceType>('all');

  // Modals: Record Operating Expense & Manual Double-Entry Journal
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expAccCode, setExpAccCode] = useState('6200');
  const [expVendor, setExpVendor] = useState('');
  const [expVattin, setExpVattin] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expSubtotal, setExpSubtotal] = useState('');
  const [expApplyVat, setExpApplyVat] = useState(false);
  const [expWhtPct, setExpWhtPct] = useState('0');
  const [expPayStatus, setExpPayStatus] = useState<'paid' | 'payable'>('paid');
  const [expPayMethod, setExpPayMethod] = useState<PaymentMethod>('Bank transfer');
  const [expPayRef, setExpPayRef] = useState('');

  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manDate, setManDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manRef, setManRef] = useState('');
  const [manDesc, setManDesc] = useState('');
  const [manLines, setManLines] = useState<
    { key: string; accountCode: string; debitUsd: string; creditUsd: string; memo: string }[]
  >([
    { key: 'ml_1', accountCode: '1010', debitUsd: '100.00', creditUsd: '0', memo: '' },
    { key: 'ml_2', accountCode: '3000', debitUsd: '0', creditUsd: '100.00', memo: '' },
  ]);

  // COA Add Custom Account form
  const [newCoaCode, setNewCoaCode] = useState('');
  const [newCoaNameEn, setNewCoaNameEn] = useState('');
  const [newCoaNameKh, setNewCoaNameKh] = useState('');
  const [newCoaType, setNewCoaType] = useState<AccountType>('expense');

  const accounts = useMemo(
    () =>
      state.accounts && state.accounts.length > 0
        ? state.accounts
        : createDefaultChartOfAccounts(),
    [state.accounts]
  );

  const entries = useMemo(() => state.journalEntries || [], [state.journalEntries]);

  const reportFilter = useMemo(
    () => ({
      branchId: branchScope,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    }),
    [branchScope, fromDate, toDate]
  );

  const pnl = useMemo(
    () => computeProfitAndLoss(accounts, entries, reportFilter),
    [accounts, entries, reportFilter]
  );

  const bs = useMemo(
    () =>
      computeBalanceSheet(accounts, entries, {
        branchId: branchScope,
        asOfDate: toDate || undefined,
      }),
    [accounts, entries, branchScope, toDate]
  );

  const cashFlow = useMemo(
    () => computeCashFlowStatement(accounts, entries, reportFilter),
    [accounts, entries, reportFilter]
  );

  const trialBalance = useMemo(
    () => computeTrialBalance(accounts, entries, reportFilter),
    [accounts, entries, reportFilter]
  );

  const glReport = useMemo(
    () => computeGeneralLedgerAccount(selectedGlCode, accounts, entries, reportFilter),
    [selectedGlCode, accounts, entries, reportFilter]
  );

  const taxAndAging = useMemo(
    () =>
      computeCambodiaTaxAndAgingReport({
        accounts,
        entries,
        purchaseOrders: state.purchaseOrders || [],
        invoices: state.invoices,
        exchangeRate: activeBranch.exchangeRate,
        filter: reportFilter,
      }),
    [accounts, entries, state.purchaseOrders, state.invoices, activeBranch.exchangeRate, reportFilter]
  );

  const filteredJournalRegister = useMemo(() => {
    const base = filterJournalEntries(entries, reportFilter);
    return base
      .filter((e) => journalSourceFilter === 'all' || e.sourceType === journalSourceFilter)
      .sort((a, b) =>
        a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)
      );
  }, [entries, reportFilter, journalSourceFilter]);

  const rate = activeBranch.exchangeRate;
  const rielRound = activeBranch.rielRounding;
  const toRiel = (usd: number) => usdToKhr(Math.abs(usd), rate, rielRound);

  const handleExportCurrentReportCsv = () => {
    let csv = '';
    let filename = `${activeBranch.code}-${tab}.csv`;

    if (tab === 'pnl') {
      csv = 'Section,AccountCode,AccountName,Amount_USD,PctOfRevenue\n';
      pnl.revenueLines.forEach((l) => {
        csv += `Revenue,${l.accountCode},"${l.accountName}",${l.amountUsd.toFixed(2)},${l.pctOfRevenue}%\n`;
      });
      pnl.cogsLines.forEach((l) => {
        csv += `COGS,${l.accountCode},"${l.accountName}",${l.amountUsd.toFixed(2)},${l.pctOfRevenue}%\n`;
      });
      csv += `Summary,,Gross Profit,${pnl.grossProfitUsd.toFixed(2)},${pnl.grossMarginPct}%\n`;
      pnl.expenseLines.forEach((l) => {
        csv += `OperatingExpense,${l.accountCode},"${l.accountName}",${l.amountUsd.toFixed(2)},${l.pctOfRevenue}%\n`;
      });
      csv += `Summary,,Prime Cost (COGS + Payroll),${pnl.primeCostUsd.toFixed(2)},${pnl.primeCostPct}%\n`;
      csv += `Summary,,Net Profit,${pnl.netProfitUsd.toFixed(2)},${pnl.netMarginPct}%\n`;
    } else if (tab === 'balance_sheet') {
      csv = 'Category,AccountCode,AccountName,Balance_USD\n';
      bs.assets.forEach((a) => {
        csv += `Asset,${a.accountCode},"${a.accountName}",${a.balanceUsd.toFixed(2)}\n`;
      });
      csv += `Total,,Total Assets,${bs.totalAssetsUsd.toFixed(2)}\n`;
      bs.liabilities.forEach((l) => {
        csv += `Liability,${l.accountCode},"${l.accountName}",${l.balanceUsd.toFixed(2)}\n`;
      });
      bs.equity.forEach((e) => {
        csv += `Equity,${e.accountCode},"${e.accountName}",${e.balanceUsd.toFixed(2)}\n`;
      });
      csv += `Equity,3999,"Current Period Earnings",${bs.currentPeriodEarningsUsd.toFixed(2)}\n`;
      csv += `Total,,Total Liabilities & Equity,${bs.totalLiabilitiesAndEquityUsd.toFixed(2)}\n`;
    } else if (tab === 'trial_balance') {
      csv = 'Code,AccountName,Type,PeriodDebit_USD,PeriodCredit_USD,NetDebit_USD,NetCredit_USD\n';
      trialBalance.rows.forEach((r) => {
        csv += `${r.accountCode},"${r.accountName}",${r.type},${r.periodDebitUsd.toFixed(2)},${r.periodCreditUsd.toFixed(2)},${r.netDebitUsd.toFixed(2)},${r.netCreditUsd.toFixed(2)}\n`;
      });
      csv += `TOTAL,,All Accounts,${trialBalance.totalPeriodDebitUsd.toFixed(2)},${trialBalance.totalPeriodCreditUsd.toFixed(2)},${trialBalance.totalNetDebitUsd.toFixed(2)},${trialBalance.totalNetCreditUsd.toFixed(2)}\n`;
    } else if (tab === 'cash_flow') {
      csv = 'Activity,LineItem,Amount_USD\n';
      csv += `Opening,"Opening Cash & Bank",${cashFlow.openingCashUsd.toFixed(2)}\n`;
      cashFlow.operatingLines.forEach((l) => {
        csv += `Operating,"${l.label}",${l.amountUsd.toFixed(2)}\n`;
      });
      cashFlow.investingLines.forEach((l) => {
        csv += `Investing,"${l.label}",${l.amountUsd.toFixed(2)}\n`;
      });
      cashFlow.financingLines.forEach((l) => {
        csv += `Financing,"${l.label}",${l.amountUsd.toFixed(2)}\n`;
      });
      csv += `Closing,"Closing Cash & Bank",${cashFlow.closingCashUsd.toFixed(2)}\n`;
    } else {
      csv = 'EntryNo,Date,Source,Ref,Description,Debit_USD,Credit_USD,PostedBy\n';
      filteredJournalRegister.forEach((je) => {
        csv += `${je.entryNo},${je.date},${je.sourceType},"${je.sourceRef || ''}","${je.description.replace(/"/g, '""')}",${je.totalDebitUsd.toFixed(2)},${je.totalCreditUsd.toFixed(2)},"${je.postedBy}"\n`;
      });
      filename = `${activeBranch.code}-journal-register.csv`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const expenseAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'expense' || a.type === 'cogs'),
    [accounts]
  );

  const manTotalDebit = roundCurrency(
    manLines.reduce((s, l) => s + (Number(l.debitUsd) || 0), 0)
  );
  const manTotalCredit = roundCurrency(
    manLines.reduce((s, l) => s + (Number(l.creditUsd) || 0), 0)
  );
  const manIsBalanced =
    manTotalDebit > 0 && Math.abs(manTotalDebit - manTotalCredit) < 0.009;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header & Global Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Landmark className="h-5 w-5 text-emerald-800" />
            Accounting &amp; Financial Statements
          </h1>
          <p className="text-xs text-slate-500">
            Real-time double-entry General Ledger (USD + KHR), POS &amp; PO auto-posting, Prime Cost &amp; Cambodia GDT VAT/WHT suite
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setExpenseModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900"
          >
            <Plus className="h-3.5 w-3.5" /> Record Expense
          </button>
          <button
            type="button"
            onClick={() => setManualModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            <BookOpen className="h-3.5 w-3.5" /> Manual Journal
          </button>
          <button
            type="button"
            onClick={handleExportCurrentReportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
        </div>
      </div>

      {/* Period & Branch Filter Bar */}
      <div className="no-print rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-600">Scope:</span>
          <select
            aria-label="Branch scope"
            value={branchScope}
            onChange={(e) => setBranchScope(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-900"
          >
            <option value="ALL">All Branches Consolidated ({state.branches.length})</option>
            {state.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>

          <span className="font-semibold text-slate-600 ml-2">Period:</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-2.5 py-1"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              setFromDate(today);
              setToDate(today);
            }}
            className="rounded-md border border-slate-200 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => {
              setFromDate('2026-11-01');
              setToDate('2026-11-30');
            }}
            className="rounded-md border border-slate-200 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50"
          >
            Nov 2026
          </button>
          <button
            type="button"
            onClick={() => {
              setFromDate('');
              setToDate('');
            }}
            className="rounded-md border border-slate-200 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50"
          >
            All Dates
          </button>
        </div>
      </div>

      {/* Executive KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 tabular-nums">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-semibold uppercase text-slate-500">Net Revenue</div>
          <div className="mt-1 text-xl font-bold text-slate-900">
            ${pnl.totalRevenueUsd.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500">
            Gross Margin: <strong className="text-emerald-800">{pnl.grossMarginPct}%</strong>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-semibold uppercase text-slate-500">
            Prime Cost (COGS + Labor)
          </div>
          <div className="mt-1 text-xl font-bold text-slate-900">
            ${pnl.primeCostUsd.toFixed(2)}{' '}
            <span
              className={`text-xs font-bold ${
                pnl.primeCostPct <= 60 ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              ({pnl.primeCostPct}%)
            </span>
          </div>
          <div className="text-[11px] text-slate-500">
            Target &le; 60% of F&amp;B sales
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-semibold uppercase text-slate-500">
            Net Profit / (Loss)
          </div>
          <div
            className={`mt-1 text-xl font-bold ${
              pnl.netProfitUsd >= 0 ? 'text-emerald-800' : 'text-red-700'
            }`}
          >
            {pnl.netProfitUsd < 0 ? '-' : ''}${Math.abs(pnl.netProfitUsd).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500">
            Net Margin: <strong>{pnl.netMarginPct}%</strong>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-semibold uppercase text-slate-500">
            Cash + ABA/KHQR (1010/1020)
          </div>
          <div className="mt-1 text-xl font-bold text-slate-900">
            ${bs.cashAndBankUsd.toFixed(2)}
          </div>
          <div className="text-[11px] font-semibold text-amber-700">
            {toRiel(bs.cashAndBankUsd).toLocaleString()} ៛
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 col-span-2 lg:col-span-1">
          <div className="text-[11px] font-semibold uppercase text-slate-500">
            GDT Net VAT Payable
          </div>
          <div
            className={`mt-1 text-xl font-bold ${
              taxAndAging.netVatPayableUsd > 0 ? 'text-amber-800' : 'text-emerald-800'
            }`}
          >
            {taxAndAging.netVatPayableUsd < 0 ? 'Credit ' : ''}$
            {Math.abs(taxAndAging.netVatPayableUsd).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500">
            WHT Payable: ${taxAndAging.whtPayableUsd.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Report Navigation Tabs */}
      <div className="no-print flex flex-wrap gap-1.5 border-b border-slate-200 pb-2.5">
        {(
          [
            ['pnl', '1. Profit & Loss (P&L)'],
            ['balance_sheet', '2. Balance Sheet'],
            ['cash_flow', '3. Cash Flow'],
            ['trial_balance', '4. Trial Balance'],
            ['general_ledger', '5. General Ledger & Journals'],
            ['gdt_tax', '6. Cambodia GDT Tax & AP'],
            ['coa', 'Chart of Accounts'],
          ] as [AccountingTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === id
                ? 'bg-[#0A3D31] text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* REPORT 1: PROFIT & LOSS (INCOME STATEMENT) */}
      {tab === 'pnl' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex flex-wrap justify-between items-start border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Profit &amp; Loss Statement (Income Statement)
              </h2>
              <p className="text-xs text-slate-500">
                {state.shopName} · {fromDate || 'Inception'} to {toDate || 'Present'} · Exchange rate 1 USD = {rate.toLocaleString()} ៛
              </p>
            </div>
            <span className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-900">
              Accrual Double-Entry Basis
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 font-semibold">Account</th>
                  <th className="py-2 text-right font-semibold">Amount (USD)</th>
                  <th className="py-2 text-right font-semibold">Equivalent (KHR)</th>
                  <th className="py-2 text-right font-semibold">% of Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* REVENUE */}
                <tr className="bg-slate-50/80">
                  <td colSpan={4} className="py-2 px-2 font-bold uppercase tracking-wide text-slate-700">
                    Operating Revenue
                  </td>
                </tr>
                {pnl.revenueLines.map((r) => (
                  <tr key={r.accountCode}>
                    <td className="py-2 pl-4">
                      <span className="font-mono text-slate-400 mr-2">{r.accountCode}</span>
                      {r.accountName}
                    </td>
                    <td className="py-2 text-right font-semibold">${r.amountUsd.toFixed(2)}</td>
                    <td className="py-2 text-right text-slate-500">
                      {toRiel(r.amountUsd).toLocaleString()} ៛
                    </td>
                    <td className="py-2 text-right">{r.pctOfRevenue.toFixed(1)}%</td>
                  </tr>
                ))}
                <tr className="font-bold text-slate-900 bg-emerald-50/40">
                  <td className="py-2.5 px-2">Total Net Revenue</td>
                  <td className="py-2.5 text-right">${pnl.totalRevenueUsd.toFixed(2)}</td>
                  <td className="py-2.5 text-right">
                    {toRiel(pnl.totalRevenueUsd).toLocaleString()} ៛
                  </td>
                  <td className="py-2.5 text-right">100.0%</td>
                </tr>

                {/* COGS */}
                <tr className="bg-slate-50/80">
                  <td colSpan={4} className="py-2 px-2 font-bold uppercase tracking-wide text-slate-700">
                    Cost of Goods Sold (Food, Coffee &amp; Spoilage)
                  </td>
                </tr>
                {pnl.cogsLines.map((c) => (
                  <tr key={c.accountCode}>
                    <td className="py-2 pl-4">
                      <span className="font-mono text-slate-400 mr-2">{c.accountCode}</span>
                      {c.accountName}
                    </td>
                    <td className="py-2 text-right text-slate-800">${c.amountUsd.toFixed(2)}</td>
                    <td className="py-2 text-right text-slate-500">
                      {toRiel(c.amountUsd).toLocaleString()} ៛
                    </td>
                    <td className="py-2 text-right">{c.pctOfRevenue.toFixed(1)}%</td>
                  </tr>
                ))}
                <tr className="font-bold text-emerald-950 bg-emerald-50">
                  <td className="py-2.5 px-2">Gross Profit</td>
                  <td className="py-2.5 text-right">${pnl.grossProfitUsd.toFixed(2)}</td>
                  <td className="py-2.5 text-right">
                    {toRiel(pnl.grossProfitUsd).toLocaleString()} ៛
                  </td>
                  <td className="py-2.5 text-right">{pnl.grossMarginPct.toFixed(1)}%</td>
                </tr>

                {/* OPERATING EXPENSES */}
                <tr className="bg-slate-50/80">
                  <td colSpan={4} className="py-2 px-2 font-bold uppercase tracking-wide text-slate-700">
                    Operating Expenses (Payroll, Occupancy &amp; Admin)
                  </td>
                </tr>
                {pnl.expenseLines.map((e) => (
                  <tr key={e.accountCode}>
                    <td className="py-2 pl-4">
                      <span className="font-mono text-slate-400 mr-2">{e.accountCode}</span>
                      {e.accountName}
                    </td>
                    <td className="py-2 text-right text-slate-800">${e.amountUsd.toFixed(2)}</td>
                    <td className="py-2 text-right text-slate-500">
                      {toRiel(e.amountUsd).toLocaleString()} ៛
                    </td>
                    <td className="py-2 text-right">{e.pctOfRevenue.toFixed(1)}%</td>
                  </tr>
                ))}
                <tr className="font-semibold text-slate-800">
                  <td className="py-2 px-2">Total Operating Expenses</td>
                  <td className="py-2 text-right">${pnl.totalOperatingExpenseUsd.toFixed(2)}</td>
                  <td className="py-2 text-right">
                    {toRiel(pnl.totalOperatingExpenseUsd).toLocaleString()} ៛
                  </td>
                  <td className="py-2 text-right">
                    {pnl.totalRevenueUsd > 0
                      ? ((pnl.totalOperatingExpenseUsd / pnl.totalRevenueUsd) * 100).toFixed(1)
                      : '0.0'}
                    %
                  </td>
                </tr>

                {/* NET INCOME */}
                <tr className="bg-[#0F241E] text-white font-bold text-sm">
                  <td className="py-3 px-3 rounded-l-lg">Net Operating Profit / (Loss)</td>
                  <td className="py-3 text-right">
                    {pnl.netProfitUsd < 0 ? '-' : ''}${Math.abs(pnl.netProfitUsd).toFixed(2)}
                  </td>
                  <td className="py-3 text-right text-amber-300">
                    {pnl.netProfitUsd < 0 ? '-' : ''}
                    {toRiel(pnl.netProfitUsd).toLocaleString()} ៛
                  </td>
                  <td className="py-3 pr-3 text-right rounded-r-lg">
                    {pnl.netMarginPct.toFixed(1)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORT 2: BALANCE SHEET */}
      {tab === 'balance_sheet' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Balance Sheet (Statement of Financial Position)
              </h2>
              <p className="text-xs text-slate-500">
                As of {toDate || 'Today'} · Assets = Liabilities + Owner&apos;s Equity
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${
                bs.isBalanced
                  ? 'bg-emerald-100 text-emerald-900'
                  : 'bg-red-100 text-red-900'
              }`}
            >
              {bs.isBalanced ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-700" />
              )}
              {bs.isBalanced
                ? `Balanced ($${bs.totalAssetsUsd.toFixed(2)} = $${bs.totalLiabilitiesAndEquityUsd.toFixed(2)})`
                : 'Out of balance'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 tabular-nums text-xs">
            {/* Left: Assets */}
            <div className="rounded-xl border border-slate-200 p-4 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wide text-emerald-900 border-b border-slate-200 pb-2">
                  Assets (1000–1999)
                </div>
                {bs.assets.map((a) => (
                  <div key={a.accountCode} className="flex justify-between py-1">
                    <span>
                      <span className="font-mono text-slate-400 mr-2">{a.accountCode}</span>
                      {a.accountName}
                    </span>
                    <span className="font-semibold">${a.balanceUsd.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t-2 border-slate-900 flex justify-between text-sm font-bold text-slate-900">
                <span>Total Assets</span>
                <span>
                  ${bs.totalAssetsUsd.toFixed(2)} ({toRiel(bs.totalAssetsUsd).toLocaleString()} ៛)
                </span>
              </div>
            </div>

            {/* Right: Liabilities + Equity */}
            <div className="rounded-xl border border-slate-200 p-4 flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wide text-amber-900 border-b border-slate-200 pb-2">
                    Liabilities (2000–2999)
                  </div>
                  {bs.liabilities.length === 0 ? (
                    <div className="text-slate-400 py-1">No open liabilities</div>
                  ) : (
                    bs.liabilities.map((l) => (
                      <div key={l.accountCode} className="flex justify-between py-1">
                        <span>
                          <span className="font-mono text-slate-400 mr-2">{l.accountCode}</span>
                          {l.accountName}
                        </span>
                        <span className="font-semibold">${l.balanceUsd.toFixed(2)}</span>
                      </div>
                    ))
                  )}
                  <div className="flex justify-between pt-1 border-t border-slate-100 font-bold text-slate-800">
                    <span>Total Liabilities</span>
                    <span>${bs.totalLiabilitiesUsd.toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-700 border-b border-slate-200 pb-2">
                    Owner&apos;s Equity (3000–3999)
                  </div>
                  {bs.equity.map((e) => (
                    <div key={e.accountCode} className="flex justify-between py-1">
                      <span>
                        <span className="font-mono text-slate-400 mr-2">{e.accountCode}</span>
                        {e.accountName}
                      </span>
                      <span className="font-semibold">${e.balanceUsd.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-1 text-emerald-900 font-medium">
                    <span>Current Period Net Earnings</span>
                    <span className="font-semibold">
                      {bs.currentPeriodEarningsUsd < 0 ? '-' : ''}$
                      {Math.abs(bs.currentPeriodEarningsUsd).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-100 font-bold text-slate-800">
                    <span>Total Equity</span>
                    <span>${bs.totalEquityUsd.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t-2 border-slate-900 flex justify-between text-sm font-bold text-slate-900">
                <span>Total Liabilities &amp; Equity</span>
                <span>
                  ${bs.totalLiabilitiesAndEquityUsd.toFixed(2)} (
                  {toRiel(bs.totalLiabilitiesAndEquityUsd).toLocaleString()} ៛)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REPORT 3: CASH FLOW STATEMENT */}
      {tab === 'cash_flow' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 tabular-nums text-xs">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-base font-bold text-slate-900">Statement of Cash Flows</h2>
            <p className="text-xs text-slate-500">
              Direct cash inflows &amp; outflows across Drawer Cash (1010) and Bakong KHQR / ABA Bank (1020)
            </p>
          </div>

          <div className="flex justify-between rounded-xl bg-slate-50 px-4 py-3 font-bold text-slate-800">
            <span>Opening Cash &amp; Bank Balance</span>
            <span>${cashFlow.openingCashUsd.toFixed(2)}</span>
          </div>

          <div className="space-y-1.5">
            <div className="font-bold uppercase text-slate-600 pt-2">
              Cash Flows from Operating Activities
            </div>
            {cashFlow.operatingLines.map((l, i) => (
              <div key={i} className="flex justify-between py-1.5 border-b border-slate-100 pl-3">
                <span>{l.label}</span>
                <span className={l.amountUsd < 0 ? 'text-red-700 font-semibold' : 'font-semibold'}>
                  {l.amountUsd < 0 ? '-' : ''}${Math.abs(l.amountUsd).toFixed(2)}
                </span>
              </div>
            ))}
            <div className="flex justify-between py-2 font-bold text-slate-900 bg-emerald-50/50 px-3 rounded-lg">
              <span>Net Cash Provided by Operating Activities</span>
              <span>
                {cashFlow.netOperatingCashUsd < 0 ? '-' : ''}$
                {Math.abs(cashFlow.netOperatingCashUsd).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="font-bold uppercase text-slate-600 pt-2">
              Cash Flows from Investing Activities
            </div>
            {cashFlow.investingLines.map((l, i) => (
              <div key={i} className="flex justify-between py-1.5 border-b border-slate-100 pl-3">
                <span>{l.label}</span>
                <span className="font-semibold">
                  {l.amountUsd < 0 ? '-' : ''}${Math.abs(l.amountUsd).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="font-bold uppercase text-slate-600 pt-2">
              Cash Flows from Financing Activities
            </div>
            {cashFlow.financingLines.map((l, i) => (
              <div key={i} className="flex justify-between py-1.5 border-b border-slate-100 pl-3">
                <span>{l.label}</span>
                <span className="font-semibold">
                  {l.amountUsd < 0 ? '-' : ''}${Math.abs(l.amountUsd).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-[#0F241E] text-white p-4 flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
            <span>Closing Cash &amp; Bank Balance</span>
            <div className="text-right">
              <div>${cashFlow.closingCashUsd.toFixed(2)}</div>
              <div className="text-xs text-amber-300">
                {toRiel(cashFlow.closingCashUsd).toLocaleString()} ៛
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REPORT 4: TRIAL BALANCE */}
      {tab === 'trial_balance' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Trial Balance</h2>
              <p className="text-xs text-slate-500">
                Verifies mathematical equality of total General Ledger Debits and Credits
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              {trialBalance.isBalanced ? 'Debits = Credits Verified' : 'Check Variance'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Code</th>
                  <th className="py-2 pr-3 font-semibold">Account Title</th>
                  <th className="py-2 pr-3 font-semibold">Type</th>
                  <th className="py-2 pr-3 font-semibold text-right">Period Debit</th>
                  <th className="py-2 pr-3 font-semibold text-right">Period Credit</th>
                  <th className="py-2 pr-3 font-semibold text-right">Ending Debit</th>
                  <th className="py-2 font-semibold text-right">Ending Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trialBalance.rows.map((r) => (
                  <tr
                    key={r.accountCode}
                    onClick={() => {
                      setSelectedGlCode(r.accountCode);
                      setTab('general_ledger');
                    }}
                    className="hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="py-2 pr-3 font-mono font-bold text-emerald-900">
                      {r.accountCode}
                    </td>
                    <td className="py-2 pr-3 font-medium text-slate-900">{r.accountName}</td>
                    <td className="py-2 pr-3 capitalize text-slate-500">{r.type}</td>
                    <td className="py-2 pr-3 text-right">
                      {r.periodDebitUsd > 0 ? `$${r.periodDebitUsd.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {r.periodCreditUsd > 0 ? `$${r.periodCreditUsd.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold text-slate-900">
                      {r.netDebitUsd > 0 ? `$${r.netDebitUsd.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2 text-right font-semibold text-slate-900">
                      {r.netCreditUsd > 0 ? `$${r.netCreditUsd.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-900 text-white font-bold">
                  <td colSpan={3} className="py-2.5 px-3 rounded-l-lg">
                    TOTAL TRIAL BALANCE
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    ${trialBalance.totalPeriodDebitUsd.toFixed(2)}
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    ${trialBalance.totalPeriodCreditUsd.toFixed(2)}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-emerald-300">
                    ${trialBalance.totalNetDebitUsd.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-emerald-300 rounded-r-lg">
                    ${trialBalance.totalNetCreditUsd.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORT 5: GENERAL LEDGER & DOUBLE-ENTRY JOURNAL REGISTER */}
      {tab === 'general_ledger' && (
        <div className="space-y-5">
          {/* Account Running-Balance Ledger */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  General Ledger Account Drill-Down
                </h2>
                <p className="text-xs text-slate-500">
                  Select any Chart of Accounts code to inspect chronological postings and running balance
                </p>
              </div>
              <select
                aria-label="Select General Ledger Account"
                value={selectedGlCode}
                onChange={(e) => setSelectedGlCode(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-900"
              >
                {accounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.nameEn} ({a.type.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {glReport && (
              <div className="overflow-x-auto">
                <div className="flex flex-wrap justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold mb-2 tabular-nums">
                  <span>
                    Normal Balance: <strong className="uppercase">{glReport.account.normalBalance}</strong> · Opening: ${glReport.openingBalanceUsd.toFixed(2)}
                  </span>
                  <span>
                    Closing Balance:{' '}
                    <strong className="text-emerald-900 text-sm">
                      ${glReport.closingBalanceUsd.toFixed(2)}
                    </strong>
                  </span>
                </div>

                <table className="w-full text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Date</th>
                      <th className="py-2 pr-3 font-semibold">Journal #</th>
                      <th className="py-2 pr-3 font-semibold">Source / Ref</th>
                      <th className="py-2 pr-3 font-semibold">Description</th>
                      <th className="py-2 pr-3 font-semibold text-right">Debit</th>
                      <th className="py-2 pr-3 font-semibold text-right">Credit</th>
                      <th className="py-2 font-semibold text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {glReport.rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400">
                          No postings for this account in selected period.
                        </td>
                      </tr>
                    ) : (
                      glReport.rows.map((r, idx) => (
                        <tr key={`${r.entryId}_${idx}`}>
                          <td className="py-2 pr-3 text-slate-600">{r.date}</td>
                          <td className="py-2 pr-3 font-mono font-semibold">{r.entryNo}</td>
                          <td className="py-2 pr-3 font-mono text-[11px] text-slate-500">
                            {r.sourceRef || r.sourceType}
                          </td>
                          <td className="py-2 pr-3">{r.description}</td>
                          <td className="py-2 pr-3 text-right">
                            {r.debitUsd > 0 ? `$${r.debitUsd.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {r.creditUsd > 0 ? `$${r.creditUsd.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2 text-right font-bold text-slate-900">
                            ${r.runningBalanceUsd.toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Double-Entry Journal Register */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Double-Entry Journal Register ({filteredJournalRegister.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Immutable audit log of automated POS, PO, Shift, Stock &amp; Manual entries (use Reverse to correct)
                </p>
              </div>
              <select
                aria-label="Filter journal source"
                value={journalSourceFilter}
                onChange={(e) =>
                  setJournalSourceFilter(e.target.value as 'all' | JournalSourceType)
                }
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
              >
                <option value="all">All Sources</option>
                <option value="pos_sale">POS Sales</option>
                <option value="po_grn">PO Goods Receipts (GRN)</option>
                <option value="po_payment">PO Vendor Payments</option>
                <option value="expense_voucher">Expense Vouchers</option>
                <option value="shift_cash">Shift Cash &amp; Variance</option>
                <option value="inventory_waste">Inventory Waste</option>
                <option value="manual">Manual Journals</option>
                <option value="reversal">Reversals</option>
              </select>
            </div>

            <div className="space-y-3">
              {filteredJournalRegister.map((je) => (
                <div
                  key={je.id}
                  className="rounded-xl border border-slate-200 p-3.5 text-xs space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-emerald-900">{je.entryNo}</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                        {je.sourceType.replace('_', ' ')}
                      </span>
                      <span className="text-slate-500">{je.date}</span>
                      {je.reversed && (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                          REVERSED
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400">Posted by {je.postedBy}</span>
                      {!je.reversed && je.sourceType !== 'reversal' && (
                        <button
                          type="button"
                          onClick={() => reverseJournalEntry(je.id, 'Accountant reversal')}
                          className="no-print inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <RotateCcw className="h-3 w-3" /> Reverse
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="font-semibold text-slate-800">{je.description}</div>
                  <div className="grid grid-cols-12 text-[11px] text-slate-600 tabular-nums gap-y-1">
                    {je.lines.map((l) => (
                      <React.Fragment key={l.id}>
                        <div className="col-span-8">
                          <span className="font-mono text-slate-400 mr-1.5">{l.accountCode}</span>
                          {l.accountName}
                          {l.memo ? <span className="text-slate-400"> — {l.memo}</span> : null}
                        </div>
                        <div className="col-span-2 text-right font-medium">
                          {l.debitUsd > 0 ? `Dr $${l.debitUsd.toFixed(2)}` : ''}
                        </div>
                        <div className="col-span-2 text-right font-medium">
                          {l.creditUsd > 0 ? `Cr $${l.creditUsd.toFixed(2)}` : ''}
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* REPORT 6: CAMBODIA GDT VAT & WHT TAX RETURN + AP SUMMARY */}
      {tab === 'gdt_tax' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 tabular-nums text-xs">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="h-4 w-4 text-emerald-800" />
                Cambodia GDT Monthly VAT Return Worksheet (10%)
              </h2>
              <p className="text-xs text-slate-500">
                Output VAT (2100) minus Eligible Tax-Invoice Input VAT Credit (1300)
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>Taxable POS Sales (Excl. VAT)</span>
                <span className="font-semibold">
                  ${taxAndAging.taxableSalesExclVatUsd.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span>10% Output VAT Collected (Account 2100)</span>
                <span className="font-bold text-slate-900">
                  ${taxAndAging.outputVatCollectedUsd.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 text-emerald-800">
                <span>Less: 10% Input VAT Credit on POs &amp; Bills (Account 1300)</span>
                <span className="font-bold">
                  -${taxAndAging.eligibleInputVatCreditUsd.toFixed(2)}
                </span>
              </div>
              <div className="rounded-xl bg-[#0F241E] text-white p-4 flex justify-between items-center">
                <div>
                  <div className="font-bold text-sm">
                    {taxAndAging.netVatPayableUsd >= 0
                      ? 'Net VAT Payable to GDT'
                      : 'Input VAT Credit Carryforward'}
                  </div>
                  <div className="text-[11px] text-emerald-200">
                    Monthly e-Filing due by 20th of following month
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">
                    ${Math.abs(taxAndAging.netVatPayableUsd).toFixed(2)}
                  </div>
                  <div className="text-amber-300 font-semibold">
                    {toRiel(taxAndAging.netVatPayableUsd).toLocaleString()} ៛
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-800" />
                Withholding Tax (WHT) &amp; Vendor Payables Summary
              </h2>
              <p className="text-xs text-slate-500">
                Cambodia WHT retained on Lease/Rent (10%) &amp; Services (15%) + Open AP
              </p>
            </div>

            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex justify-between items-center">
              <div>
                <div className="font-bold text-amber-950">
                  Withholding Tax Payable (Account 2150)
                </div>
                <div className="text-[11px] text-amber-800">
                  Retained from landlord &amp; service vendor payments
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-amber-950">
                  ${taxAndAging.whtPayableUsd.toFixed(2)}
                </div>
                <div className="text-[11px] font-semibold text-amber-800">
                  {taxAndAging.whtPayableKhr.toLocaleString()} ៛
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-slate-800">
                Open Supplier Accounts Payable (${taxAndAging.totalApOpenUsd.toFixed(2)})
              </div>
              {taxAndAging.apAgingRows.length === 0 ? (
                <div className="text-slate-500 py-2">No unpaid vendor bills.</div>
              ) : (
                taxAndAging.apAgingRows.map((row) => (
                  <div
                    key={row.supplierId}
                    className="flex justify-between rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{row.supplierName}</div>
                      <div className="text-[11px] text-slate-500">
                        Current: ${row.currentUsd.toFixed(2)} · Overdue: $
                        {(
                          row.days1To15Usd +
                          row.days16To30Usd +
                          row.days31PlusUsd
                        ).toFixed(2)}
                      </div>
                    </div>
                    <div className="font-bold text-slate-900">
                      ${row.totalBalanceUsd.toFixed(2)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: CHART OF ACCOUNTS (COA) */}
      {tab === 'coa' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3">
              Chart of Accounts ({accounts.length} Accounts)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Code</th>
                    <th className="py-2 pr-3 font-semibold">Account Name (EN / ខ្មែរ)</th>
                    <th className="py-2 pr-3 font-semibold">Type</th>
                    <th className="py-2 font-semibold">Normal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accounts.map((a) => (
                    <tr key={a.code}>
                      <td className="py-2 pr-3 font-mono font-bold text-emerald-900">{a.code}</td>
                      <td className="py-2 pr-3">
                        <div className="font-semibold text-slate-900">{a.nameEn}</div>
                        <div className="text-[11px] text-slate-500">{a.nameKh}</div>
                      </td>
                      <td className="py-2 pr-3 capitalize">{a.type}</td>
                      <td className="py-2 uppercase text-[11px] font-semibold text-slate-500">
                        {a.normalBalance}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newCoaCode.trim() || !newCoaNameEn.trim()) return;
              const normalBalance: 'debit' | 'credit' =
                newCoaType === 'asset' || newCoaType === 'cogs' || newCoaType === 'expense'
                  ? 'debit'
                  : 'credit';
              const subTypeMap: Record<AccountType, AccountSubType> = {
                asset: 'cash_bank',
                liability: 'payable',
                equity: 'owner_equity',
                revenue: 'operating_revenue',
                cogs: 'direct_cogs',
                expense: 'operating_expense',
              };
              saveLedgerAccount({
                code: newCoaCode.trim(),
                nameEn: newCoaNameEn.trim(),
                nameKh: newCoaNameKh.trim() || newCoaNameEn.trim(),
                type: newCoaType,
                subType: subTypeMap[newCoaType],
                normalBalance,
                active: true,
              });
              setNewCoaCode('');
              setNewCoaNameEn('');
              setNewCoaNameKh('');
            }}
            className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 text-xs h-fit"
          >
            <h2 className="text-sm font-bold text-slate-900">Add Custom Account</h2>
            <input
              required
              placeholder="Account code (e.g. 6700)"
              value={newCoaCode}
              onChange={(e) => setNewCoaCode(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
            />
            <input
              required
              placeholder="Account title (English)"
              value={newCoaNameEn}
              onChange={(e) => setNewCoaNameEn(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <input
              placeholder="Account title (Khmer)"
              value={newCoaNameKh}
              onChange={(e) => setNewCoaNameKh(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <select
              value={newCoaType}
              onChange={(e) => setNewCoaType(e.target.value as AccountType)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="expense">Operating Expense (6xxx)</option>
              <option value="cogs">Cost of Goods Sold (5xxx)</option>
              <option value="revenue">Revenue (4xxx)</option>
              <option value="asset">Asset (1xxx)</option>
              <option value="liability">Liability (2xxx)</option>
              <option value="equity">Equity (3xxx)</option>
            </select>
            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-800 py-2 font-semibold text-white hover:bg-emerald-900"
            >
              Save Ledger Account
            </button>
          </form>
        </div>
      )}

      {/* MODAL 1: Record Operating Expense Voucher */}
      {expenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const res = recordOperatingExpense({
                date: expDate,
                expenseAccountCode: expAccCode,
                vendorName: expVendor,
                vendorVattin: expVattin,
                description: expDesc,
                subtotalUsd: Number(expSubtotal) || 0,
                applyInputVat: expApplyVat,
                whtPercent: Number(expWhtPct) || 0,
                paymentStatus: expPayStatus,
                paymentMethod: expPayMethod,
                paymentRef: expPayRef,
              });
              if (res) {
                setExpVendor('');
                setExpDesc('');
                setExpSubtotal('');
                setExpenseModalOpen(false);
              }
            }}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Record Operating Expense Voucher</h3>
                <p className="text-[11px] text-slate-500">
                  Posts balanced Expense + Input VAT / WHT / Cash or AP journal automatically
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpenseModalOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Expense Account</label>
                  <select
                    value={expAccCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      setExpAccCode(code);
                      if (code === '6200') setExpWhtPct('10');
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold"
                  >
                    {expenseAccounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} — {a.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  required
                  placeholder="Payee / Vendor name *"
                  value={expVendor}
                  onChange={(e) => setExpVendor(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                />
                <input
                  placeholder="Vendor VATTIN (optional)"
                  value={expVattin}
                  onChange={(e) => setExpVattin(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 font-mono"
                />
              </div>

              <input
                required
                placeholder="Description (e.g. Monthly shop rent / EDC power bill) *"
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Amount Excl. VAT ($)
                  </label>
                  <input
                    type="number"
                    required
                    min={0.01}
                    step="0.01"
                    value={expSubtotal}
                    onChange={(e) => setExpSubtotal(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cambodia WHT</label>
                  <select
                    value={expWhtPct}
                    onChange={(e) => setExpWhtPct(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="0">0% None</option>
                    <option value="10">10% Rent WHT</option>
                    <option value="15">15% Service WHT</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Settlement</label>
                  <select
                    value={expPayStatus}
                    onChange={(e) => setExpPayStatus(e.target.value as 'paid' | 'payable')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="paid">Paid Now</option>
                    <option value="payable">On Credit (AP 2010)</option>
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={expApplyVat}
                  onChange={(e) => setExpApplyVat(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-800"
                />
                <span>Claim 10% Input VAT Credit (Tax Invoice received)</span>
              </label>

              {expPayStatus === 'paid' && (
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={expPayMethod}
                    onChange={(e) => setExpPayMethod(e.target.value as PaymentMethod)}
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="Bank transfer">ABA / Bank Transfer (1020)</option>
                    <option value="KHQR">Bakong KHQR (1020)</option>
                    <option value="Cash">Drawer Cash (1010)</option>
                  </select>
                  <input
                    placeholder="Payment ref (optional)"
                    value={expPayRef}
                    onChange={(e) => setExpPayRef(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setExpenseModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white hover:bg-emerald-900"
                >
                  Post Expense Voucher
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: Manual Double-Entry Journal Entry */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const ok = postManualJournalEntry({
                date: manDate,
                sourceRef: manRef,
                description: manDesc,
                lines: manLines.map((l) => ({
                  accountCode: l.accountCode,
                  debitUsd: Number(l.debitUsd) || 0,
                  creditUsd: Number(l.creditUsd) || 0,
                  memo: l.memo,
                })),
              });
              if (ok) {
                setManDesc('');
                setManRef('');
                setManualModalOpen(false);
              }
            }}
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Post Manual Double-Entry Journal
                </h3>
                <p className="text-[11px] text-slate-500">
                  For capital injections, depreciation, owner drawings, or period-end accruals
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManualModalOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="date"
                  required
                  value={manDate}
                  onChange={(e) => setManDate(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                />
                <input
                  placeholder="Reference (e.g. ADJ-11)"
                  value={manRef}
                  onChange={(e) => setManRef(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 font-mono"
                />
                <input
                  required
                  placeholder="Journal memo / description *"
                  value={manDesc}
                  onChange={(e) => setManDesc(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs tabular-nums">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-500">
                      <th className="py-2 px-3 font-semibold">Account</th>
                      <th className="py-2 pr-2 font-semibold">Line Memo</th>
                      <th className="py-2 pr-2 font-semibold text-right">Debit ($)</th>
                      <th className="py-2 pr-2 font-semibold text-right">Credit ($)</th>
                      <th className="py-2 pr-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {manLines.map((l, idx) => (
                      <tr key={l.key}>
                        <td className="py-2 px-3">
                          <select
                            value={l.accountCode}
                            onChange={(e) =>
                              setManLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, accountCode: e.target.value } : r
                                )
                              )
                            }
                            className="w-52 rounded border border-slate-300 px-2 py-1"
                          >
                            {accounts.map((a) => (
                              <option key={a.code} value={a.code}>
                                {a.code} — {a.nameEn}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            value={l.memo}
                            onChange={(e) =>
                              setManLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, memo: e.target.value } : r
                                )
                              )
                            }
                            placeholder="Optional"
                            className="w-32 rounded border border-slate-300 px-2 py-1"
                          />
                        </td>
                        <td className="py-2 pr-2 text-right">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={l.debitUsd}
                            onChange={(e) =>
                              setManLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? { ...r, debitUsd: e.target.value, creditUsd: '0' }
                                    : r
                                )
                              )
                            }
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-right"
                          />
                        </td>
                        <td className="py-2 pr-2 text-right">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={l.creditUsd}
                            onChange={(e) =>
                              setManLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? { ...r, creditUsd: e.target.value, debitUsd: '0' }
                                    : r
                                )
                              )
                            }
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-right"
                          />
                        </td>
                        <td className="py-2 pr-2 text-right">
                          {manLines.length > 2 && (
                            <button
                              type="button"
                              onClick={() =>
                                setManLines((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="text-red-600 p-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() =>
                    setManLines((prev) => [
                      ...prev,
                      {
                        key: `ml_${Date.now()}`,
                        accountCode: '1010',
                        debitUsd: '0',
                        creditUsd: '0',
                        memo: '',
                      },
                    ])
                  }
                  className="rounded-lg border border-slate-300 px-3 py-1 font-semibold text-slate-700"
                >
                  + Add Line
                </button>
                <div
                  className={`font-bold tabular-nums ${
                    manIsBalanced ? 'text-emerald-800' : 'text-red-700'
                  }`}
                >
                  Total Dr: ${manTotalDebit.toFixed(2)} · Total Cr: ${manTotalCredit.toFixed(2)}{' '}
                  {manIsBalanced ? '✓ Balanced' : '(Must match)'}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!manIsBalanced}
                  className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
                >
                  Post Balanced Journal
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
