import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, Download, FileCode2, ArrowUpRight, RotateCcw, Printer } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { generateUbl21Xml, roundCurrency } from '../utils/posMath';
import type { PosOrder, VatInvoice } from '../types/pos';
import { ReceiptModal } from './ReceiptModal';

export function SalesBookView() {
  const { state, activeBranch, issueTaxInvoice, createCreditNote } = usePos();
  const [filterType, setFilterType] = useState<'all' | VatInvoice['invoiceType']>('all');
  const [upgradeTarget, setUpgradeTarget] = useState<VatInvoice | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<VatInvoice | null>(null);
  const [buyerName, setBuyerName] = useState('');
  const [buyerVattin, setBuyerVattin] = useState('');

  const branchInvoices = useMemo(
    () =>
      state.invoices.filter(
        (i) => i.branchId === activeBranch.id && (filterType === 'all' || i.invoiceType === filterType)
      ),
    [state.invoices, activeBranch.id, filterType]
  );

  const summary = useMemo(() => {
    const active = branchInvoices.filter((i) => i.status === 'issued');
    const sign = (t: VatInvoice['invoiceType']) => (t === 'credit_note' ? -1 : 1);
    const taxableUsd = roundCurrency(
      active.reduce((s, i) => s + i.exclVatUsd * sign(i.invoiceType), 0)
    );
    const outputVatUsd = roundCurrency(
      active.reduce((s, i) => s + i.vatUsd * sign(i.invoiceType), 0)
    );
    const totalUsd = roundCurrency(
      active.reduce((s, i) => s + i.totalUsd * sign(i.invoiceType), 0)
    );
    return { taxableUsd, outputVatUsd, totalUsd, count: branchInvoices.length };
  }, [branchInvoices]);

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const header = 'Date,InvoiceNo,Type,Buyer,VATTIN,ExclVAT_USD,VAT_USD,Total_USD,Total_KHR,Status\n';
    const rows = branchInvoices
      .map((i) =>
        [
          i.date,
          i.invoiceNo,
          i.invoiceType,
          `"${i.buyerName.replace(/"/g, '""')}"`,
          i.buyerVattin || '',
          i.exclVatUsd.toFixed(2),
          i.vatUsd.toFixed(2),
          i.totalUsd.toFixed(2),
          i.totalKhr,
          i.status,
        ].join(',')
      )
      .join('\n');
    downloadFile(`${activeBranch.code}-vat-sales-book.csv`, header + rows, 'text/csv;charset=utf-8');
  };

  const handleDownloadUbl = (inv: VatInvoice) => {
    const xml = generateUbl21Xml({
      invoiceNo: inv.invoiceNo,
      issueDate: inv.date,
      invoiceType: inv.invoiceType,
      sellerName: activeBranch.name,
      sellerVattin: activeBranch.vattin,
      buyerName: inv.buyerName,
      buyerVattin: inv.buyerVattin,
      exclVatUsd: inv.exclVatUsd,
      vatUsd: inv.vatUsd,
      totalUsd: inv.totalUsd,
      totalKhr: inv.totalKhr,
      exchangeRate: activeBranch.exchangeRate,
    });
    downloadFile(`${inv.invoiceNo}-ubl21.xml`, xml, 'application/xml;charset=utf-8');
  };

  const handleUpgradeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!upgradeTarget || !buyerName.trim() || !buyerVattin.trim()) return;
    issueTaxInvoice(upgradeTarget.id, buyerName.trim(), buyerVattin.trim());
    setUpgradeTarget(null);
    setBuyerName('');
    setBuyerVattin('');
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">VAT Sales book &amp; CamInvoice</h1>
          <p className="text-xs text-slate-500">
            Cambodia GDT Commercial &amp; Tax Invoices · Seller VATTIN:{' '}
            <span className="font-mono font-semibold">{activeBranch.vattin}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
          >
            <Download className="h-3.5 w-3.5" /> Export Sales Book CSV
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Taxable sales (excl. VAT)</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
            ${summary.taxableUsd.toFixed(2)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Output VAT ({activeBranch.vatPercent}%)</div>
          <div className="mt-1 text-2xl font-bold text-emerald-800 tabular-nums">
            ${summary.outputVatUsd.toFixed(2)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Total incl. VAT</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
            ${summary.totalUsd.toFixed(2)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Documents</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
            {summary.count}
          </div>
        </div>
      </div>

      {/* Filter & Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            {(
              [
                ['all', 'All documents'],
                ['commercial', 'Commercial'],
                ['tax', 'Tax Invoices'],
                ['credit_note', 'Credit Notes'],
              ] as ['all' | VatInvoice['invoiceType'], string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilterType(k)}
                className={`rounded-lg px-3 py-1.5 font-semibold ${
                  filterType === k
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <FileSpreadsheet className="h-4 w-4" />
            <span>CamInvoice UBL 2.1 ready</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-3 font-semibold">Date</th>
                <th className="py-2 pr-3 font-semibold">Invoice No</th>
                <th className="py-2 pr-3 font-semibold">Type</th>
                <th className="py-2 pr-3 font-semibold">Buyer / VATTIN</th>
                <th className="py-2 pr-3 font-semibold text-right">Excl. VAT</th>
                <th className="py-2 pr-3 font-semibold text-right">VAT</th>
                <th className="py-2 pr-3 font-semibold text-right">Total USD</th>
                <th className="py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branchInvoices.map((inv) => (
                <tr key={inv.id} className={inv.status === 'replaced' ? 'opacity-50' : ''}>
                  <td className="py-2.5 pr-3 font-mono">{inv.date}</td>
                  <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900">
                    {inv.invoiceNo}
                    {inv.replacesInvoiceNo && (
                      <div className="text-[10px] text-slate-500">
                        Ref: {inv.replacesInvoiceNo}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 capitalize">{inv.invoiceType.replace('_', ' ')}</td>
                  <td className="py-2.5 pr-3">
                    <div>{inv.buyerName}</div>
                    {inv.buyerVattin && (
                      <div className="font-mono text-[10px] text-slate-500">
                        {inv.buyerVattin}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    ${inv.exclVatUsd.toFixed(2)}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">${inv.vatUsd.toFixed(2)}</td>
                  <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">
                    ${inv.totalUsd.toFixed(2)}
                  </td>
                  <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setPreviewInvoice(inv)}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Printer className="h-3 w-3" /> Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadUbl(inv)}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <FileCode2 className="h-3 w-3" /> UBL XML
                    </button>
                    {inv.invoiceType === 'commercial' && inv.status === 'issued' && (
                      <button
                        type="button"
                        onClick={() => setUpgradeTarget(inv)}
                        className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800"
                      >
                        <ArrowUpRight className="h-3 w-3" /> Tax Invoice
                      </button>
                    )}
                    {inv.invoiceType !== 'credit_note' && inv.status === 'issued' && (
                      <button
                        type="button"
                        onClick={() => createCreditNote(inv.id)}
                        className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900"
                      >
                        <RotateCcw className="h-3 w-3" /> Credit Note
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upgrade to Tax Invoice Modal */}
      {upgradeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Issue GDT Tax Invoice"
        >
          <form
            onSubmit={handleUpgradeSubmit}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-3"
          >
            <h3 className="text-base font-bold text-slate-900">
              Upgrade {upgradeTarget.invoiceNo} to Tax Invoice
            </h3>
            <p className="text-xs text-slate-500">
              Replaces commercial receipt with a registered B2B VAT Tax Invoice.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Buyer Company / Entity Name
              </label>
              <input
                required
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="e.g. Mekong Tech Co., Ltd."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Buyer VATTIN
              </label>
              <input
                required
                value={buyerVattin}
                onChange={(e) => setBuyerVattin(e.target.value)}
                placeholder="e.g. K002-901234567"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUpgradeTarget(null)}
                className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white"
              >
                Issue Tax Invoice
              </button>
            </div>
          </form>
        </div>
      )}

      {previewInvoice && (
        <ReceiptModal
          branch={activeBranch}
          invoiceNoOverride={previewInvoice.invoiceNo}
          buyerName={previewInvoice.buyerName}
          buyerVattin={previewInvoice.buyerVattin}
          order={
            state.orders.find((o) => o.id === previewInvoice.orderId) || {
              id: `preview_${previewInvoice.id}`,
              branchId: activeBranch.id,
              orderNumber: state.nextOrderNumber,
              tableName: previewInvoice.buyerName || 'Walk-in Guest',
              channel: 'dine_in',
              status: 'paid',
              guests: 1,
              items: [
                {
                  id: 'line_summary',
                  menuItemId: 'summary',
                  nameEn: `${previewInvoice.invoiceType.replace('_', ' ').toUpperCase()} Total`,
                  nameKh: 'ទឹកប្រាក់សរុប',
                  nameVi: 'Tổng hóa đơn',
                  category: 'Invoice',
                  station: 'kitchen',
                  unitPriceUsd: previewInvoice.totalUsd,
                  qty: 1,
                  round: 1,
                  sentToKitchen: true,
                  kdsStatus: 'served',
                } satisfies PosOrder['items'][number],
              ],
              currentRound: 1,
              manualDiscountPercent: 0,
              manualDiscountUsd: 0,
              promoDiscountUsd: 0,
              pointsRedeemed: 0,
              depositAppliedUsd: 0,
              totalUsd: previewInvoice.totalUsd,
              totalKhr: previewInvoice.totalKhr,
              paidUsd: previewInvoice.totalUsd,
              paidKhr: 0,
              changeUsd: 0,
              changeKhr: 0,
              paymentMethod: 'KHQR',
              cashierName: 'Cashier',
              createdAt: `${previewInvoice.date}T10:00:00.000Z`,
              updatedAt: `${previewInvoice.date}T10:00:00.000Z`,
            }
          }
          onClose={() => setPreviewInvoice(null)}
        />
      )}
    </div>
  );
}
