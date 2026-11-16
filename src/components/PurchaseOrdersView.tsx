import React, { useMemo, useState } from 'react';
import {
  Truck,
  Plus,
  Sparkles,
  PackageCheck,
  DollarSign,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Download,
  Printer,
  Trash2,
  Pencil,
  Send,
  Ban,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import type {
  PaymentMethod,
  PurchaseOrder,
  Supplier,
  SupplierPaymentTerms,
} from '../types/pos';
import {
  computeCambodiaTaxAndAgingReport,
  createDefaultChartOfAccounts,
} from '../utils/accountingEngine';
import { roundCurrency, usdToKhr } from '../utils/posMath';

type PoTab = 'orders' | 'create' | 'suppliers' | 'aging';

const PAYMENT_TERMS_LABELS: Record<SupplierPaymentTerms, string> = {
  cod: 'COD / Cash on Delivery',
  net_7: 'Net 7 Days',
  net_15: 'Net 15 Days',
  net_30: 'Net 30 Days',
};

export function PurchaseOrdersView() {
  const {
    state,
    activeBranch,
    saveSupplier,
    deleteSupplier,
    createPurchaseOrder,
    autoDraftLowStockPurchaseOrders,
    updatePurchaseOrderStatus,
    receivePurchaseOrder,
    payPurchaseOrder,
  } = usePos();

  const [tab, setTab] = useState<PoTab>('orders');
  const [statusFilter, setStatusFilter] = useState<'all' | PurchaseOrder['status']>('all');
  const [search, setSearch] = useState('');

  // Active modals for GRN Receipt & Vendor Payment & Print Preview
  const [grnTargetPo, setGrnTargetPo] = useState<PurchaseOrder | null>(null);
  const [grnInvoiceRef, setGrnInvoiceRef] = useState('');
  const [grnNote, setGrnNote] = useState('');
  const [grnQtys, setGrnQtys] = useState<Record<string, string>>({});
  const [grnCosts, setGrnCosts] = useState<Record<string, string>>({});

  const [payTargetPo, setPayTargetPo] = useState<PurchaseOrder | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('Bank transfer');
  const [payAmount, setPayAmount] = useState('');
  const [payWhtPct, setPayWhtPct] = useState('0');
  const [payRef, setPayRef] = useState('');

  const [inspectPo, setInspectPo] = useState<PurchaseOrder | null>(null);

  const suppliers = useMemo(
    () =>
      (state.suppliers || []).filter(
        (s) => s.branchId === 'all' || s.branchId === activeBranch.id
      ),
    [state.suppliers, activeBranch.id]
  );

  const branchIngredients = useMemo(
    () => state.ingredients.filter((i) => i.branchId === activeBranch.id),
    [state.ingredients, activeBranch.id]
  );

  const lowStockCount = useMemo(
    () => branchIngredients.filter((i) => i.onHand <= i.minLevel).length,
    [branchIngredients]
  );

  const branchPos = useMemo(
    () => (state.purchaseOrders || []).filter((po) => po.branchId === activeBranch.id),
    [state.purchaseOrders, activeBranch.id]
  );

  const filteredPos = useMemo(() => {
    const q = search.trim().toLowerCase();
    return branchPos.filter((po) => {
      if (statusFilter !== 'all' && po.status !== statusFilter) return false;
      if (!q) return true;
      return (
        po.poNumber.toLowerCase().includes(q) ||
        po.supplierName.toLowerCase().includes(q) ||
        po.lines.some((l) => l.itemName.toLowerCase().includes(q))
      );
    });
  }, [branchPos, statusFilter, search]);

  const accounts = useMemo(
    () =>
      state.accounts && state.accounts.length > 0
        ? state.accounts
        : createDefaultChartOfAccounts(),
    [state.accounts]
  );

  const agingSummary = useMemo(
    () =>
      computeCambodiaTaxAndAgingReport({
        accounts,
        entries: state.journalEntries || [],
        purchaseOrders: branchPos,
        invoices: state.invoices,
        exchangeRate: activeBranch.exchangeRate,
        filter: { branchId: activeBranch.id },
      }),
    [accounts, state.journalEntries, branchPos, state.invoices, activeBranch]
  );

  const kpis = useMemo(() => {
    const openPos = branchPos.filter(
      (p) => p.status === 'draft' || p.status === 'sent' || p.status === 'partial'
    ).length;
    const totalApUsd = roundCurrency(
      branchPos.reduce((s, p) => s + (p.status !== 'cancelled' ? p.balanceDueUsd : 0), 0)
    );
    const inputVatClaimedUsd = roundCurrency(
      branchPos.reduce((s, p) => s + (p.status !== 'cancelled' ? p.receivedVatUsd : 0), 0)
    );
    return {
      openPos,
      totalApUsd,
      totalApKhr: usdToKhr(totalApUsd, activeBranch.exchangeRate, activeBranch.rielRounding),
      overdueUsd: agingSummary.overdueApUsd,
      inputVatClaimedUsd,
    };
  }, [branchPos, activeBranch, agingSummary.overdueApUsd]);

  // Create PO form state
  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrowStr = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const [poSupplierId, setPoSupplierId] = useState<string>(suppliers[0]?.id || '');
  const [poOrderDate, setPoOrderDate] = useState(todayStr);
  const [poExpectedDate, setPoExpectedDate] = useState(tomorrowStr);
  const [poTerms, setPoTerms] = useState<SupplierPaymentTerms>(
    suppliers[0]?.paymentTerms || 'net_15'
  );
  const [poApplyVat, setPoApplyVat] = useState(true);
  const [poNote, setPoNote] = useState('');
  const [poDraftLines, setPoDraftLines] = useState<
    {
      key: string;
      ingredientId: string;
      itemName: string;
      purchaseUnit: string;
      baseUnit: string;
      conversionFactor: number;
      orderedQty: string;
      unitCostUsd: string;
    }[]
  >(() => {
    const firstIng = branchIngredients[0];
    if (!firstIng) {
      return [
        {
          key: 'line_init',
          ingredientId: '',
          itemName: 'Specialty Coffee Beans (1kg)',
          purchaseUnit: 'kg',
          baseUnit: 'g',
          conversionFactor: 1000,
          orderedQty: '5',
          unitCostUsd: '14.00',
        },
      ];
    }
    const conv = Math.max(1, firstIng.purchaseUnitSize || 1);
    return [
      {
        key: 'line_init',
        ingredientId: firstIng.id,
        itemName: firstIng.nameEn,
        purchaseUnit: firstIng.purchaseUnit || 'unit',
        baseUnit: firstIng.unit,
        conversionFactor: conv,
        orderedQty: '5',
        unitCostUsd: roundCurrency(Math.max(0.5, firstIng.avgCostUsd * conv)).toFixed(2),
      },
    ];
  });

  // Supplier form state
  const [editingSupId, setEditingSupId] = useState<string | null>(null);
  const [supName, setSupName] = useState('');
  const [supNameKh, setSupNameKh] = useState('');
  const [supCategory, setSupCategory] = useState('Coffee & Tea');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supTelegram, setSupTelegram] = useState('');
  const [supVattin, setSupVattin] = useState('');
  const [supTerms, setSupTerms] = useState<SupplierPaymentTerms>('net_15');

  const openGrnModal = (po: PurchaseOrder) => {
    const qMap: Record<string, string> = {};
    const cMap: Record<string, string> = {};
    for (const l of po.lines) {
      const rem = Math.max(0, roundCurrency(l.orderedQty - l.receivedQty));
      qMap[l.id] = rem > 0 ? String(rem) : '0';
      cMap[l.id] = l.unitCostUsd.toFixed(2);
    }
    setGrnQtys(qMap);
    setGrnCosts(cMap);
    setGrnInvoiceRef('');
    setGrnNote('');
    setGrnTargetPo(po);
  };

  const openPayModal = (po: PurchaseOrder) => {
    setPayTargetPo(po);
    setPayAmount(po.balanceDueUsd.toFixed(2));
    setPayWhtPct(String(po.whtPercent || 0));
    setPayMethod('Bank transfer');
    setPayRef('');
  };

  const handleCreatePoSubmit = (submitStatus: 'draft' | 'sent') => {
    const cleanSupId = poSupplierId || suppliers[0]?.id;
    if (!cleanSupId) return;
    const validLines = poDraftLines
      .filter((l) => l.itemName.trim() && Number(l.orderedQty) > 0)
      .map((l) => ({
        ingredientId: l.ingredientId || undefined,
        itemName: l.itemName.trim(),
        purchaseUnit: l.purchaseUnit || 'unit',
        baseUnit: l.baseUnit || 'unit',
        conversionFactor: Math.max(1, Number(l.conversionFactor) || 1),
        orderedQty: Math.max(0.01, Number(l.orderedQty) || 1),
        unitCostUsd: Math.max(0, Number(l.unitCostUsd) || 0),
      }));
    if (validLines.length === 0) return;

    const created = createPurchaseOrder({
      supplierId: cleanSupId,
      orderDate: poOrderDate,
      expectedDate: poExpectedDate,
      paymentTerms: poTerms,
      applyInputVat: poApplyVat,
      status: submitStatus,
      note: poNote,
      lines: validLines,
    });
    if (created) {
      setPoNote('');
      setTab('orders');
    }
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName.trim() || !supPhone.trim()) return;
    saveSupplier({
      id: editingSupId || undefined,
      branchId: 'all',
      name: supName.trim(),
      nameKh: supNameKh.trim() || undefined,
      category: supCategory,
      contactName: supContact.trim() || 'Sales Desk',
      phone: supPhone.trim(),
      telegram: supTelegram.trim() || undefined,
      vattin: supVattin.trim() || undefined,
      paymentTerms: supTerms,
      active: true,
    });
    setEditingSupId(null);
    setSupName('');
    setSupNameKh('');
    setSupContact('');
    setSupPhone('');
    setSupTelegram('');
    setSupVattin('');
  };

  const handleExportPosCsv = () => {
    const header =
      'PO_Number,Branch,Supplier,VATTIN,OrderDate,DueDate,Status,PaymentStatus,Subtotal_USD,InputVAT_USD,Total_USD,Received_USD,Paid_USD,BalanceDue_USD\n';
    const rows = branchPos
      .map((p) =>
        [
          p.poNumber,
          activeBranch.code,
          `"${p.supplierName.replace(/"/g, '""')}"`,
          p.supplierVattin || '',
          p.orderDate,
          p.dueDate,
          p.status,
          p.paymentStatus,
          p.subtotalUsd.toFixed(2),
          p.inputVatUsd.toFixed(2),
          p.totalUsd.toFixed(2),
          p.receivedTotalUsd.toFixed(2),
          p.paidUsd.toFixed(2),
          p.balanceDueUsd.toFixed(2),
        ].join(',')
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeBranch.code}-purchase-orders.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const draftSubtotal = roundCurrency(
    poDraftLines.reduce(
      (s, l) => s + (Number(l.orderedQty) || 0) * (Number(l.unitCostUsd) || 0),
      0
    )
  );
  const draftVat = poApplyVat ? roundCurrency(draftSubtotal * 0.1) : 0;
  const draftTotal = roundCurrency(draftSubtotal + draftVat);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Truck className="h-5 w-5 text-emerald-800" />
            Procurement &amp; Purchase Orders (PO)
          </h1>
          <p className="text-xs text-slate-500">
            Supplier POs, 1-click low-stock auto-drafts, 3-way match GRN stock receipts, moving-average cost &amp; Accounts Payable
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const count = autoDraftLowStockPurchaseOrders();
              if (count > 0) setTab('orders');
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            Auto-Draft Low Stock ({lowStockCount})
          </button>
          <button
            type="button"
            onClick={handleExportPosCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => setTab('create')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900"
          >
            <Plus className="h-3.5 w-3.5" /> New Purchase Order
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Active / Open POs
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{kpis.openPos}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {lowStockCount} ingredient(s) at/below min stock
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Unpaid Supplier AP (2010)
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            ${kpis.totalApUsd.toFixed(2)}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold text-amber-700">
            {kpis.totalApKhr.toLocaleString()} ៛
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Overdue AP Bills
          </div>
          <div
            className={`mt-1 text-2xl font-bold ${
              kpis.overdueUsd > 0 ? 'text-red-700' : 'text-emerald-800'
            }`}
          >
            ${kpis.overdueUsd.toFixed(2)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {kpis.overdueUsd > 0 ? 'Past payment terms due date' : 'All vendors current'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Input VAT Credit (1300)
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-800">
            ${kpis.inputVatClaimedUsd.toFixed(2)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            10% claimable against GDT Output VAT
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['orders', `Purchase Orders (${branchPos.length})`],
              ['create', '+ Create PO'],
              ['suppliers', `Suppliers (${suppliers.length})`],
              ['aging', 'Vendor AP Aging'],
            ] as [PoTab, string][]
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

        {tab === 'orders' && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PO #, supplier, item..."
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
            />
            <select
              aria-label="Filter PO status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | PurchaseOrder['status'])}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent / Ordered</option>
              <option value="partial">Partial GRN</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: Purchase Orders List */}
      {tab === 'orders' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {filteredPos.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-700">No purchase orders match this view.</p>
              <p className="text-xs text-slate-500">
                Click <strong>+ New Purchase Order</strong> or <strong>Auto-Draft Low Stock</strong> to generate restock orders.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-slate-500">
                    <th className="py-2.5 px-4 font-semibold">PO #</th>
                    <th className="py-2.5 pr-3 font-semibold">Supplier</th>
                    <th className="py-2.5 pr-3 font-semibold">Order / Due</th>
                    <th className="py-2.5 pr-3 font-semibold">Delivery Status</th>
                    <th className="py-2.5 pr-3 font-semibold text-right">PO Total</th>
                    <th className="py-2.5 pr-3 font-semibold text-right">Received (GRN)</th>
                    <th className="py-2.5 pr-3 font-semibold text-right">AP Balance Due</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {filteredPos.map((po) => {
                    const canReceive =
                      po.status === 'sent' || po.status === 'partial' || po.status === 'draft';
                    const canPay = po.balanceDueUsd > 0.009 && po.status !== 'cancelled';
                    return (
                      <tr key={po.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => setInspectPo(po)}
                            className="font-mono font-bold text-emerald-900 hover:underline"
                          >
                            {po.poNumber}
                          </button>
                          <div className="text-[11px] text-slate-400">
                            {po.lines.length} item(s) · {po.applyInputVat ? '10% VAT' : 'No VAT'}
                          </div>
                        </td>
                        <td className="py-3 pr-3">
                          <div className="font-semibold text-slate-900">{po.supplierName}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {po.supplierVattin || 'Unregistered vendor'}
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-slate-600">
                          <div>Ord: {po.orderDate}</div>
                          <div className="text-[11px] text-slate-400">Due: {po.dueDate}</div>
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold uppercase ${
                              po.status === 'received'
                                ? 'bg-emerald-100 text-emerald-900'
                                : po.status === 'partial'
                                  ? 'bg-amber-100 text-amber-900'
                                  : po.status === 'sent'
                                    ? 'bg-sky-100 text-sky-900'
                                    : po.status === 'cancelled'
                                      ? 'bg-slate-200 text-slate-500'
                                      : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {po.status}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-right font-semibold text-slate-900">
                          ${po.totalUsd.toFixed(2)}
                          <div className="text-[10px] text-slate-400">
                            {po.totalKhr.toLocaleString()} ៛
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-right text-slate-700">
                          ${po.receivedTotalUsd.toFixed(2)}
                          {po.grnHistory.length > 0 && (
                            <div className="text-[10px] text-emerald-700 font-semibold">
                              {po.grnHistory.length} GRN(s)
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-right">
                          <span
                            className={`font-bold ${
                              po.balanceDueUsd > 0.009 ? 'text-amber-800' : 'text-emerald-800'
                            }`}
                          >
                            ${po.balanceDueUsd.toFixed(2)}
                          </span>
                          <div className="text-[10px] uppercase text-slate-400">
                            {po.paymentStatus}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                          {po.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() => updatePurchaseOrderStatus(po.id, 'sent')}
                              className="inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100"
                            >
                              <Send className="h-3 w-3" /> Send PO
                            </button>
                          )}
                          {canReceive && po.status !== 'received' && (
                            <button
                              type="button"
                              onClick={() => openGrnModal(po)}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-900"
                            >
                              <PackageCheck className="h-3 w-3" /> Receive GRN
                            </button>
                          )}
                          {canPay && (
                            <button
                              type="button"
                              onClick={() => openPayModal(po)}
                              className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-amber-400"
                            >
                              <DollarSign className="h-3 w-3" /> Pay AP
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setInspectPo(po)}
                            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            View
                          </button>
                          {(po.status === 'draft' || po.status === 'sent') &&
                            po.receivedTotalUsd === 0 && (
                              <button
                                type="button"
                                onClick={() => updatePurchaseOrderStatus(po.id, 'cancelled')}
                                className="rounded-md border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                                title="Cancel PO"
                              >
                                <Ban className="h-3 w-3 inline" />
                              </button>
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Create Purchase Order */}
      {tab === 'create' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Create Supplier Purchase Order</h2>
              <p className="text-xs text-slate-500">
                Link lines to branch ingredients so Goods Receipt (GRN) updates kitchen stock &amp; weighted-average cost automatically.
              </p>
            </div>
          </div>

          {suppliers.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950 flex items-center justify-between">
              <span>Add at least one supplier before creating a Purchase Order.</span>
              <button
                type="button"
                onClick={() => setTab('suppliers')}
                className="rounded-lg bg-amber-500 px-3 py-1.5 font-bold text-slate-950"
              >
                Go to Suppliers →
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                <div className="lg:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Supplier</label>
                  <select
                    value={poSupplierId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setPoSupplierId(nextId);
                      const matched = suppliers.find((s) => s.id === nextId);
                      if (matched) {
                        setPoTerms(matched.paymentTerms);
                        setPoApplyVat(Boolean(matched.vattin));
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.vattin ? `(${s.vattin})` : '(Non-VAT)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Order Date</label>
                  <input
                    type="date"
                    value={poOrderDate}
                    onChange={(e) => setPoOrderDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Expected Delivery</label>
                  <input
                    type="date"
                    value={poExpectedDate}
                    onChange={(e) => setPoExpectedDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Terms</label>
                  <select
                    value={poTerms}
                    onChange={(e) => setPoTerms(e.target.value as SupplierPaymentTerms)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    {Object.entries(PAYMENT_TERMS_LABELS).map(([k, lbl]) => (
                      <option key={k} value={k}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Order Line Items</span>
                  <button
                    type="button"
                    onClick={() =>
                      setPoDraftLines((prev) => [
                        ...prev,
                        {
                          key: `line_${Date.now()}_${prev.length}`,
                          ingredientId: '',
                          itemName: '',
                          purchaseUnit: 'kg',
                          baseUnit: 'g',
                          conversionFactor: 1000,
                          orderedQty: '1',
                          unitCostUsd: '5.00',
                        },
                      ])
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Line
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-500">
                        <th className="py-2 px-3 font-semibold">Link Ingredient (Optional)</th>
                        <th className="py-2 pr-2 font-semibold">Item Description</th>
                        <th className="py-2 pr-2 font-semibold">Purchase Unit</th>
                        <th className="py-2 pr-2 font-semibold text-right">Base Units/Pack</th>
                        <th className="py-2 pr-2 font-semibold text-right">Qty</th>
                        <th className="py-2 pr-2 font-semibold text-right">Unit Cost ($)</th>
                        <th className="py-2 pr-3 font-semibold text-right">Subtotal</th>
                        <th className="py-2 pr-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {poDraftLines.map((line, idx) => {
                        const sub = roundCurrency(
                          (Number(line.orderedQty) || 0) * (Number(line.unitCostUsd) || 0)
                        );
                        return (
                          <tr key={line.key}>
                            <td className="py-2 px-3">
                              <select
                                value={line.ingredientId}
                                onChange={(e) => {
                                  const ingId = e.target.value;
                                  const ing = branchIngredients.find((i) => i.id === ingId);
                                  setPoDraftLines((prev) =>
                                    prev.map((row, i) => {
                                      if (i !== idx) return row;
                                      if (!ing) return { ...row, ingredientId: '' };
                                      const conv = Math.max(1, ing.purchaseUnitSize || 1);
                                      return {
                                        ...row,
                                        ingredientId: ing.id,
                                        itemName: ing.nameEn,
                                        purchaseUnit: ing.purchaseUnit || 'unit',
                                        baseUnit: ing.unit,
                                        conversionFactor: conv,
                                        unitCostUsd: roundCurrency(
                                          Math.max(0.25, ing.avgCostUsd * conv)
                                        ).toFixed(2),
                                      };
                                    })
                                  );
                                }}
                                className="w-44 rounded border border-slate-300 px-2 py-1"
                              >
                                <option value="">— Custom / Non-stock —</option>
                                {branchIngredients.map((ing) => (
                                  <option key={ing.id} value={ing.id}>
                                    {ing.nameEn} ({ing.onHand}
                                    {ing.unit})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                value={line.itemName}
                                onChange={(e) =>
                                  setPoDraftLines((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, itemName: e.target.value } : r
                                    )
                                  )
                                }
                                placeholder="Item name"
                                className="w-44 rounded border border-slate-300 px-2 py-1"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                value={line.purchaseUnit}
                                onChange={(e) =>
                                  setPoDraftLines((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, purchaseUnit: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-24 rounded border border-slate-300 px-2 py-1"
                              />
                            </td>
                            <td className="py-2 pr-2 text-right">
                              <input
                                type="number"
                                min={1}
                                value={line.conversionFactor}
                                onChange={(e) =>
                                  setPoDraftLines((prev) =>
                                    prev.map((r, i) =>
                                      i === idx
                                        ? { ...r, conversionFactor: Number(e.target.value) || 1 }
                                        : r
                                    )
                                  )
                                }
                                className="w-20 rounded border border-slate-300 px-2 py-1 text-right"
                              />
                            </td>
                            <td className="py-2 pr-2 text-right">
                              <input
                                type="number"
                                min={0.1}
                                step="any"
                                value={line.orderedQty}
                                onChange={(e) =>
                                  setPoDraftLines((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, orderedQty: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-20 rounded border border-slate-300 px-2 py-1 text-right font-semibold"
                              />
                            </td>
                            <td className="py-2 pr-2 text-right">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={line.unitCostUsd}
                                onChange={(e) =>
                                  setPoDraftLines((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, unitCostUsd: e.target.value } : r
                                    )
                                  )
                                }
                                className="w-24 rounded border border-slate-300 px-2 py-1 text-right"
                              />
                            </td>
                            <td className="py-2 pr-3 text-right font-bold text-slate-900">
                              ${sub.toFixed(2)}
                            </td>
                            <td className="py-2 pr-2 text-right">
                              {poDraftLines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPoDraftLines((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  className="text-red-600 hover:text-red-800 p-1"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-4 pt-2 border-t border-slate-100">
                <div className="space-y-2 flex-1 min-w-[240px]">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={poApplyVat}
                      onChange={(e) => setPoApplyVat(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-800"
                    />
                    <span>Apply 10% Cambodia Input VAT Credit (Tax-Registered Supplier)</span>
                  </label>
                  <input
                    value={poNote}
                    onChange={(e) => setPoNote(e.target.value)}
                    placeholder="Delivery instructions or Telegram note (optional)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 min-w-[260px] space-y-1 text-xs tabular-nums">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span>${draftSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Input VAT (10%)</span>
                    <span>${draftVat.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-200">
                    <span>PO Total</span>
                    <span>
                      ${draftTotal.toFixed(2)} (
                      {usdToKhr(
                        draftTotal,
                        activeBranch.exchangeRate,
                        activeBranch.rielRounding
                      ).toLocaleString()}{' '}
                      ៛)
                    </span>
                  </div>
                  <div className="pt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleCreatePoSubmit('draft')}
                      className="flex-1 rounded-lg border border-slate-300 bg-white py-2 font-semibold text-slate-800 hover:bg-slate-100"
                    >
                      Save Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCreatePoSubmit('sent')}
                      className="flex-1 rounded-lg bg-emerald-800 py-2 font-semibold text-white hover:bg-emerald-900"
                    >
                      Approve &amp; Send
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: Suppliers Directory */}
      {tab === 'suppliers' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-emerald-800" />
              Approved Vendors &amp; Suppliers ({suppliers.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Supplier</th>
                    <th className="py-2 pr-3 font-semibold">Category</th>
                    <th className="py-2 pr-3 font-semibold">Contact / Telegram</th>
                    <th className="py-2 pr-3 font-semibold">Terms</th>
                    <th className="py-2 pr-3 font-semibold text-right">Open AP</th>
                    <th className="py-2 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {suppliers.map((sup) => {
                    const supOpenAp = roundCurrency(
                      branchPos
                        .filter((p) => p.supplierId === sup.id && p.status !== 'cancelled')
                        .reduce((s, p) => s + p.balanceDueUsd, 0)
                    );
                    return (
                      <tr key={sup.id}>
                        <td className="py-2.5 pr-3">
                          <div className="font-semibold text-slate-900">{sup.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {sup.vattin || 'No VATTIN'}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-slate-700">{sup.category}</td>
                        <td className="py-2.5 pr-3">
                          <div>{sup.contactName} · {sup.phone}</div>
                          {sup.telegram && (
                            <div className="text-[11px] text-emerald-800 font-mono">
                              {sup.telegram}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 uppercase font-semibold text-slate-600">
                          {sup.paymentTerms.replace('_', ' ')}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-bold text-slate-900">
                          ${supOpenAp.toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSupId(sup.id);
                              setSupName(sup.name);
                              setSupNameKh(sup.nameKh || '');
                              setSupCategory(sup.category);
                              setSupContact(sup.contactName);
                              setSupPhone(sup.phone);
                              setSupTelegram(sup.telegram || '');
                              setSupVattin(sup.vattin || '');
                              setSupTerms(sup.paymentTerms);
                            }}
                            className="text-emerald-800 font-semibold hover:underline inline-flex items-center gap-0.5"
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSupplier(sup.id)}
                            className="text-red-600 hover:underline inline-flex items-center gap-0.5"
                          >
                            <Trash2 className="h-3 w-3" /> Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <form
            onSubmit={handleSaveSupplier}
            className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5 text-xs"
          >
            <h2 className="text-sm font-bold text-slate-900">
              {editingSupId ? 'Edit Supplier' : 'Add New Supplier'}
            </h2>
            <input
              required
              placeholder="Supplier company name *"
              value={supName}
              onChange={(e) => setSupName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <input
              placeholder="Khmer name (optional)"
              value={supNameKh}
              onChange={(e) => setSupNameKh(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <select
              value={supCategory}
              onChange={(e) => setSupCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="Coffee & Tea">Coffee &amp; Tea</option>
              <option value="Fresh Produce & Meat">Fresh Produce &amp; Meat</option>
              <option value="Dairy & Beverage">Dairy &amp; Beverage</option>
              <option value="Packaging & Supplies">Packaging &amp; Supplies</option>
              <option value="Equipment & Maintenance">Equipment &amp; Maintenance</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Contact person"
                value={supContact}
                onChange={(e) => setSupContact(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
              <input
                required
                placeholder="Phone *"
                value={supPhone}
                onChange={(e) => setSupPhone(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="VATTIN (e.g. L001-...)"
                value={supVattin}
                onChange={(e) => setSupVattin(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 font-mono"
              />
              <input
                placeholder="Telegram (@vendor)"
                value={supTelegram}
                onChange={(e) => setSupTelegram(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 font-mono"
              />
            </div>
            <select
              value={supTerms}
              onChange={(e) => setSupTerms(e.target.value as SupplierPaymentTerms)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {Object.entries(PAYMENT_TERMS_LABELS).map(([k, lbl]) => (
                <option key={k} value={k}>
                  {lbl}
                </option>
              ))}
            </select>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-emerald-800 py-2 font-semibold text-white hover:bg-emerald-900"
              >
                {editingSupId ? 'Update Supplier' : 'Save Supplier'}
              </button>
              {editingSupId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSupId(null);
                    setSupName('');
                    setSupPhone('');
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-600"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* TAB 4: Vendor AP Aging */}
      {tab === 'aging' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-800" />
                Accounts Payable (AP) Vendor Aging Schedule
              </h2>
              <p className="text-xs text-slate-500">
                Reconciled directly with General Ledger account 2010 (Accounts Payable — Suppliers)
              </p>
            </div>
          </div>

          {agingSummary.apAgingRows.length === 0 ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-6 text-center text-xs text-emerald-900 font-semibold">
              <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-emerald-700" />
              Zero unpaid supplier bills! All received Purchase Orders are fully settled.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Vendor</th>
                    <th className="py-2 pr-3 font-semibold text-right">Current (Not Due)</th>
                    <th className="py-2 pr-3 font-semibold text-right">1–15 Days Past Due</th>
                    <th className="py-2 pr-3 font-semibold text-right">16–30 Days Past Due</th>
                    <th className="py-2 pr-3 font-semibold text-right">31+ Days Past Due</th>
                    <th className="py-2 font-semibold text-right">Total Open AP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agingSummary.apAgingRows.map((r) => (
                    <tr key={r.supplierId}>
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-slate-900">{r.supplierName}</div>
                        <div className="text-[11px] font-mono text-slate-400">{r.vattin || '—'}</div>
                      </td>
                      <td className="py-2.5 pr-3 text-right">${r.currentUsd.toFixed(2)}</td>
                      <td className="py-2.5 pr-3 text-right text-amber-700 font-semibold">
                        ${r.days1To15Usd.toFixed(2)}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-orange-700 font-semibold">
                        ${r.days16To30Usd.toFixed(2)}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-red-700 font-bold">
                        ${r.days31PlusUsd.toFixed(2)}
                      </td>
                      <td className="py-2.5 text-right font-bold text-slate-900">
                        ${r.totalBalanceUsd.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: 3-Way Match Goods Receipt (GRN) */}
      {grnTargetPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Receive Goods (GRN) · {grnTargetPo.poNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  Supplier: {grnTargetPo.supplierName} · Updates stock, weighted-avg cost &amp; posts AP journal
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGrnTargetPo(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Supplier Tax Invoice / Delivery Note #
                  </label>
                  <input
                    value={grnInvoiceRef}
                    onChange={(e) => setGrnInvoiceRef(e.target.value)}
                    placeholder="e.g. SUP-INV-2026-089"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Receiving Note</label>
                  <input
                    value={grnNote}
                    onChange={(e) => setGrnNote(e.target.value)}
                    placeholder="Checked temperature & seal OK"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs tabular-nums">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-500">
                      <th className="py-2 px-3 font-semibold">Item</th>
                      <th className="py-2 pr-2 font-semibold text-right">Ordered</th>
                      <th className="py-2 pr-2 font-semibold text-right">Already Recv</th>
                      <th className="py-2 pr-2 font-semibold text-right">Receive Now</th>
                      <th className="py-2 px-3 font-semibold text-right">Invoice Unit Cost ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {grnTargetPo.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2 px-3">
                          <div className="font-semibold text-slate-900">{l.itemName}</div>
                          <div className="text-[10px] text-slate-400">
                            1 {l.purchaseUnit} = {l.conversionFactor} {l.baseUnit}
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-right">
                          {l.orderedQty} {l.purchaseUnit}
                        </td>
                        <td className="py-2 pr-2 text-right text-slate-500">
                          {l.receivedQty} {l.purchaseUnit}
                        </td>
                        <td className="py-2 pr-2 text-right">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={grnQtys[l.id] ?? '0'}
                            onChange={(e) =>
                              setGrnQtys((prev) => ({ ...prev, [l.id]: e.target.value }))
                            }
                            className="w-20 rounded border border-slate-300 px-2 py-1 text-right font-bold"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={grnCosts[l.id] ?? l.unitCostUsd.toFixed(2)}
                            onChange={(e) =>
                              setGrnCosts((prev) => ({ ...prev, [l.id]: e.target.value }))
                            }
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-right"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setGrnTargetPo(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const ok = receivePurchaseOrder({
                      poId: grnTargetPo.id,
                      supplierInvoiceRef: grnInvoiceRef,
                      note: grnNote,
                      lines: grnTargetPo.lines.map((l) => ({
                        lineId: l.id,
                        qtyReceivedNow: Math.max(0, Number(grnQtys[l.id]) || 0),
                        unitCostUsd: Math.max(0, Number(grnCosts[l.id]) || l.unitCostUsd),
                      })),
                    });
                    if (ok) setGrnTargetPo(null);
                  }}
                  className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white hover:bg-emerald-900"
                >
                  Confirm GRN &amp; Post to Stock + AP
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Vendor AP Bill Payment */}
      {payTargetPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Pay Supplier Bill · {payTargetPo.poNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  {payTargetPo.supplierName} · Open AP: ${payTargetPo.balanceDueUsd.toFixed(2)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayTargetPo(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  AP Amount to Settle (USD)
                </label>
                <input
                  type="number"
                  min={0.01}
                  max={payTargetPo.balanceDueUsd}
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold tabular-nums"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="Bank transfer">ABA / Bank Transfer (1020)</option>
                    <option value="KHQR">Bakong KHQR (1020)</option>
                    <option value="Cash">Store Cash (1010)</option>
                    <option value="Card">Corporate Card (1020)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Cambodia WHT %
                  </label>
                  <select
                    value={payWhtPct}
                    onChange={(e) => setPayWhtPct(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="0">0% (Physical goods)</option>
                    <option value="10">10% (Rent / Lease WHT)</option>
                    <option value="14">14% (Non-resident WHT)</option>
                    <option value="15">15% (Resident Services WHT)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Bank / KHQR / Voucher Reference
                </label>
                <input
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="e.g. ABA-TX-994021"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                />
              </div>

              {(() => {
                const gross = Math.min(payTargetPo.balanceDueUsd, Math.max(0, Number(payAmount) || 0));
                const wht = roundCurrency((gross * (Number(payWhtPct) || 0)) / 100);
                const netCash = roundCurrency(gross - wht);
                return (
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1 tabular-nums">
                    <div className="flex justify-between">
                      <span>Debit 2010 Accounts Payable</span>
                      <span className="font-semibold">${gross.toFixed(2)}</span>
                    </div>
                    {wht > 0 && (
                      <div className="flex justify-between text-amber-800">
                        <span>Credit 2150 WHT Payable ({payWhtPct}%)</span>
                        <span>${wht.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-emerald-900 pt-1 border-t border-slate-200">
                      <span>Net Disbursement ({payMethod})</span>
                      <span>${netCash.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPayTargetPo(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const ok = payPurchaseOrder({
                      poId: payTargetPo.id,
                      method: payMethod,
                      grossSettledUsd: Number(payAmount) || 0,
                      whtPercent: Number(payWhtPct) || 0,
                      paymentRef: payRef,
                    });
                    if (ok) setPayTargetPo(null);
                  }}
                  className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white hover:bg-emerald-900"
                >
                  Post Payment &amp; Journal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Printable PO & GRN Voucher Detail */}
      {inspectPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="no-print flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <span className="text-sm font-bold text-slate-900">
                Purchase Order Voucher · {inspectPo.poNumber}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" /> Print PO
                </button>
                <button
                  type="button"
                  onClick={() => setInspectPo(null)}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                <div>
                  <div className="text-base font-bold text-slate-900">{activeBranch.name}</div>
                  <div className="text-slate-500">{activeBranch.address}</div>
                  <div className="font-mono text-[11px] text-slate-500">
                    VATTIN: {activeBranch.vattin}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold font-mono text-emerald-900">
                    {inspectPo.poNumber}
                  </div>
                  <div className="text-slate-600">Order Date: {inspectPo.orderDate}</div>
                  <div className="text-slate-600">Due Date: {inspectPo.dueDate}</div>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 flex justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Vendor</div>
                  <div className="font-bold text-slate-900">{inspectPo.supplierName}</div>
                  <div className="font-mono text-[11px] text-slate-500">
                    {inspectPo.supplierVattin || 'Non-VAT Supplier'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Status</div>
                  <div className="font-bold uppercase text-slate-900">
                    {inspectPo.status} · {inspectPo.paymentStatus}
                  </div>
                </div>
              </div>

              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 font-semibold">Item</th>
                    <th className="py-2 text-right font-semibold">Ordered</th>
                    <th className="py-2 text-right font-semibold">Received</th>
                    <th className="py-2 text-right font-semibold">Unit Cost</th>
                    <th className="py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inspectPo.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 font-medium text-slate-900">{l.itemName}</td>
                      <td className="py-2 text-right">
                        {l.orderedQty} {l.purchaseUnit}
                      </td>
                      <td className="py-2 text-right">
                        {l.receivedQty} {l.purchaseUnit}
                      </td>
                      <td className="py-2 text-right">${l.unitCostUsd.toFixed(2)}</td>
                      <td className="py-2 text-right font-semibold">
                        ${l.lineTotalUsd.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end pt-2 border-t border-slate-200">
                <div className="w-64 space-y-1 tabular-nums">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>${inspectPo.subtotalUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>10% Input VAT</span>
                    <span>${inspectPo.inputVatUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t border-slate-200">
                    <span>PO Total</span>
                    <span>${inspectPo.totalUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-800">
                    <span>Paid / Settled</span>
                    <span>${(inspectPo.paidUsd + inspectPo.whtWithheldUsd).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-amber-800">
                    <span>AP Balance Due</span>
                    <span>${inspectPo.balanceDueUsd.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {inspectPo.grnHistory.length > 0 && (
                <div className="pt-3 border-t border-slate-200 space-y-1.5">
                  <div className="font-bold text-slate-800">Goods Receipt History (GRNs)</div>
                  {inspectPo.grnHistory.map((g) => (
                    <div
                      key={g.id}
                      className="rounded-lg border border-slate-200 px-3 py-2 flex justify-between"
                    >
                      <span>
                        <strong>{g.grnNumber}</strong> · {g.receivedAt.slice(0, 10)} by{' '}
                        {g.receivedBy}
                        {g.supplierInvoiceRef ? ` (Inv: ${g.supplierInvoiceRef})` : ''}
                      </span>
                      <span className="font-bold tabular-nums">${g.totalUsd.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
