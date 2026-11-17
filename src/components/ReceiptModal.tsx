import { Printer, X, CheckCircle2 } from 'lucide-react';
import type { BranchConfig, PosOrder } from '../types/pos';
import { formatInvoiceNumber, normalizeInvoiceTemplate } from '../utils/invoiceTemplate';
import { ReceiptInvoiceDocument } from './ReceiptInvoiceDocument';

interface ReceiptModalProps {
  order: PosOrder;
  branch: BranchConfig;
  invoiceNoOverride?: string;
  buyerName?: string;
  buyerVattin?: string;
  onClose: () => void;
}

export function ReceiptModal({
  order,
  branch,
  invoiceNoOverride,
  buyerName,
  buyerVattin,
  onClose,
}: ReceiptModalProps) {
  const tpl = normalizeInvoiceTemplate(branch.invoiceTemplate, {
    shopName: branch.name,
    branchCode: branch.code,
  });
  const docNo =
    invoiceNoOverride || formatInvoiceNumber(tpl.invoicePrefix, order.orderNumber);
  const printLabel =
    tpl.style === 'a4_tax_invoice'
      ? 'Print A4 Invoice'
      : tpl.style === 'compact_58mm'
        ? 'Print 58mm Receipt'
        : tpl.style === 'modern_bilingual'
          ? 'Print Bilingual Invoice'
          : 'Print 80mm Receipt';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 print:static print:inset-auto print:block print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-label="Receipt preview"
    >
      <div
        className={`w-full ${
          tpl.style === 'a4_tax_invoice' ? 'max-w-2xl' : 'max-w-md'
        } rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden print:max-w-none print:rounded-none print:border-0 print:shadow-none print:overflow-visible`}
      >
        <div className="no-print flex items-center justify-between border-b border-slate-200 bg-emerald-950 px-4 py-3 text-white">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            <span>
              {docNo} · {branch.name}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt"
            className="rounded-md p-1 text-emerald-100 hover:bg-emerald-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto bg-slate-100/70 p-4 sm:p-5 print:max-h-none print:overflow-visible print:bg-white print:p-0">
          <ReceiptInvoiceDocument
            order={order}
            branch={branch}
            invoiceNoOverride={invoiceNoOverride}
            buyerName={buyerName}
            buyerVattin={buyerVattin}
          />
        </div>

        <div className="no-print flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Printer className="h-3.5 w-3.5" />
            {printLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
