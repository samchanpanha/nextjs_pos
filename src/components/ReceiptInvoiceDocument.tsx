import type { BranchConfig, PosOrder } from '../types/pos';
import { calculateOrderTotals, usdToKhr } from '../utils/posMath';
import {
  formatInvoiceNumber,
  INVOICE_ACCENT_STYLES,
  normalizeInvoiceTemplate,
} from '../utils/invoiceTemplate';
import { generateBakongKhqrPayload, isMerchantKhqrConfigured } from '../utils/bakongKhqr';
import { CompanyLogoBadge } from './CompanyLogoBadge';
import { QrCodeBox } from './QrCodeBox';

interface ReceiptInvoiceDocumentProps {
  order: PosOrder;
  branch: BranchConfig;
  invoiceNoOverride?: string;
  buyerName?: string;
  buyerVattin?: string;
  compactPreview?: boolean;
}

export function ReceiptInvoiceDocument({
  order,
  branch,
  invoiceNoOverride,
  buyerName,
  buyerVattin,
  compactPreview = false,
}: ReceiptInvoiceDocumentProps) {
  const tpl = normalizeInvoiceTemplate(branch.invoiceTemplate, {
    shopName: branch.name,
    branchCode: branch.code,
  });
  const accent = INVOICE_ACCENT_STYLES[tpl.accentColor] || INVOICE_ACCENT_STYLES.emerald;

  const totals = calculateOrderTotals({
    items: order.items,
    exchangeRate: branch.exchangeRate,
    rielRounding: branch.rielRounding,
    vatPercent: branch.vatPercent,
    serviceChargePercent: branch.serviceChargePercent,
    manualDiscountPercent: order.manualDiscountPercent,
    manualDiscountUsd: order.manualDiscountUsd,
    promoDiscountUsd: order.promoDiscountUsd,
    pointsRedeemed: order.pointsRedeemed,
    pointsValuePer100: branch.pointsValuePer100,
    depositAppliedUsd: order.depositAppliedUsd,
  });

  const displayInvoiceNo =
    invoiceNoOverride || formatInvoiceNumber(tpl.invoicePrefix, order.orderNumber);
  const activeItems = order.items.filter((i) => !i.voided);
  const khrTotal = usdToKhr(order.totalUsd, branch.exchangeRate, branch.rielRounding);

  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://xaiwork.pos';
  const loyaltyUrl = `${origin}/?mode=qr&bill=${order.orderNumber}`;

  const khqrPayload =
    tpl.qrFooterMode === 'bakong_khqr' && isMerchantKhqrConfigured(branch.khqrBakongId)
      ? generateBakongKhqrPayload({
          accountType: branch.khqrAccountType || 'individual',
          bakongAccountId: branch.khqrBakongId,
          merchantId: branch.khqrMerchantId,
          acquiringBank: branch.khqrAcquiringBank,
          merchantName: branch.khqrAccountName || branch.name,
          merchantCity: branch.khqrCity || 'Phnom Penh',
          currency: branch.khqrDefaultCurrency || 'USD',
          amount:
            (branch.khqrDefaultCurrency || 'USD') === 'KHR'
              ? khrTotal
              : order.totalUsd,
          billNumber: displayInvoiceNo,
          storeLabel: branch.code,
          mcc: branch.khqrMcc || '5812',
        }).qrString
      : null;

  const qrValue = khqrPayload || loyaltyUrl;
  const qrCaption = khqrPayload
    ? `Scan Bakong KHQR (${branch.khqrBakongId})`
    : tpl.qrFooterMode === 'bakong_khqr'
      ? 'Loyalty / E-bill QR (Merchant KHQR optional)'
      : 'Scan for e-bill & loyalty points';

  const dateText = new Date(order.closedAt || order.updatedAt).toLocaleString();

  // Style 1: Formal A4 Tax / Commercial Invoice Layout
  if (tpl.style === 'a4_tax_invoice') {
    return (
      <div
        className={`bg-white text-slate-900 ${
          compactPreview ? 'p-4 text-[11px]' : 'p-6 text-xs'
        } font-sans space-y-4 border border-slate-200 rounded-lg`}
      >
        {/* Top Accent Banner + Seller Identity */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-200 pb-4">
          <div className="flex items-start gap-3">
            {tpl.showLogoBadge && (
              <CompanyLogoBadge
                logoImageUrl={tpl.logoImageUrl}
                logoIcon={tpl.logoIcon}
                logoText={tpl.logoText}
                alt={`${branch.name} logo`}
                className="h-12 w-12 rounded-lg text-sm"
                iconClassName="h-5 w-5"
                bgClassName={accent.headerBg}
                textClassName={accent.headerText}
              />
            )}
            <div className="space-y-0.5">
              <div className="text-base font-bold text-slate-900">{branch.name}</div>
              {tpl.showAddress && <div className="text-slate-600">{branch.address}</div>}
              <div className="flex flex-wrap gap-x-3 text-slate-600">
                {tpl.showPhone && <span>Tel: {branch.phone}</span>}
                {tpl.showVattin && <span>VATTIN: {branch.vattin}</span>}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div
              className={`inline-block rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${accent.badgeBg}`}
            >
              {tpl.headerTitle}
            </div>
            <div className="mt-1.5 font-mono font-bold text-slate-900 text-sm">
              No: {displayInvoiceNo}
            </div>
            <div className="text-[11px] text-slate-500">Date: {dateText}</div>
          </div>
        </div>

        {/* Customer / Order Metadata Box */}
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-[11px]">
          <div>
            <div className="text-slate-400 uppercase font-semibold text-[10px]">Customer / Table</div>
            <div className="font-semibold text-slate-900">
              {buyerName || order.tableName || 'Walk-in Guest'}
            </div>
            {buyerVattin && (
              <div className="font-mono text-slate-600">Buyer VATTIN: {buyerVattin}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-slate-400 uppercase font-semibold text-[10px]">Order Details</div>
            <div className="font-semibold text-slate-900">
              Bill #{order.orderNumber} · {order.paymentMethod || 'Cash'}
            </div>
            {tpl.showCashier && <div className="text-slate-600">Cashier: {order.cashierName}</div>}
          </div>
        </div>

        {/* Itemized Table */}
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className={`${accent.headerBg} ${accent.headerText} text-left`}>
              <th className="py-2 px-2.5 rounded-tl-md font-semibold">No</th>
              <th className="py-2 px-2.5 font-semibold">Description</th>
              <th className="py-2 px-2.5 text-center font-semibold">Qty</th>
              <th className="py-2 px-2.5 text-right font-semibold">Unit Price</th>
              <th className="py-2 px-2.5 text-right rounded-tr-md font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 border-b border-slate-300">
            {activeItems.map((item, idx) => (
              <tr key={item.id}>
                <td className="py-2 px-2.5 text-slate-500 tabular-nums">{idx + 1}</td>
                <td className="py-2 px-2.5">
                  <div className="font-semibold text-slate-900">{item.nameEn}</div>
                  {tpl.showKhmerItemNames && item.nameKh && (
                    <div className="text-[10px] text-slate-500">{item.nameKh}</div>
                  )}
                  {tpl.showItemNotes && item.note && (
                    <div className="text-[10px] text-slate-500 italic">Note: {item.note}</div>
                  )}
                </td>
                <td className="py-2 px-2.5 text-center tabular-nums">{item.qty}</td>
                <td className="py-2 px-2.5 text-right tabular-nums">
                  ${item.unitPriceUsd.toFixed(2)}
                </td>
                <td className="py-2 px-2.5 text-right font-semibold tabular-nums">
                  {item.coveredByPack ? 'Pack ($0.00)' : `$${(item.unitPriceUsd * item.qty).toFixed(2)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary + Optional QR */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[140px]">
            {tpl.qrFooterMode !== 'none' && (
              <div className="inline-flex flex-col items-center rounded-lg border border-slate-200 p-2 text-center">
                <QrCodeBox value={qrValue} size={78} />
                <span className="mt-1 text-[10px] text-slate-600 max-w-[120px] leading-tight">
                  {qrCaption}
                </span>
              </div>
            )}
          </div>

          <div className="w-full sm:w-64 space-y-1 tabular-nums text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal</span>
              <span>${totals.subtotalUsd.toFixed(2)}</span>
            </div>
            {totals.discountTotalUsd > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount</span>
                <span>-${totals.discountTotalUsd.toFixed(2)}</span>
              </div>
            )}
            {totals.serviceChargeUsd > 0 && (
              <div className="flex justify-between">
                <span>Service ({branch.serviceChargePercent}%)</span>
                <span>${totals.serviceChargeUsd.toFixed(2)}</span>
              </div>
            )}
            {tpl.showVatBreakdown && (
              <div className="flex justify-between">
                <span>VAT ({branch.vatPercent}%)</span>
                <span>${totals.vatUsd.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-300 pt-1.5 text-sm font-bold">
              <span>TOTAL USD</span>
              <span>${order.totalUsd.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-700">
              <span>TOTAL KHR</span>
              <span>{khrTotal.toLocaleString()} ៛</span>
            </div>
          </div>
        </div>

        {/* Signatures & Footer */}
        <div className="grid grid-cols-2 gap-6 pt-6 text-center text-[11px]">
          <div>
            <div className="border-t border-slate-300 pt-1.5 font-semibold text-slate-700">
              {tpl.buyerSignatureLabel}
            </div>
          </div>
          <div>
            <div className="border-t border-slate-300 pt-1.5 font-semibold text-slate-700">
              {tpl.sellerSignatureLabel}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-2 text-center text-[10px] text-slate-500 space-y-0.5">
          {tpl.showExchangeRate && (
            <div>Exchange Rate: $1 = {branch.exchangeRate.toLocaleString()} ៛</div>
          )}
          {tpl.footerNote && <div>{tpl.footerNote}</div>}
        </div>
      </div>
    );
  }

  // Style 2: Modern Bilingual Layout
  if (tpl.style === 'modern_bilingual') {
    return (
      <div
        className={`bg-white text-slate-900 rounded-xl border ${accent.border} overflow-hidden font-sans text-xs mx-auto ${
          compactPreview ? 'max-w-sm' : 'max-w-md'
        }`}
      >
        <div className={`${accent.headerBg} ${accent.headerText} px-4 py-3 flex items-center justify-between gap-2`}>
          <div className="flex items-center gap-2.5 min-w-0">
            {tpl.showLogoBadge && (
              <CompanyLogoBadge
                logoImageUrl={tpl.logoImageUrl}
                logoIcon={tpl.logoIcon}
                logoText={tpl.logoText}
                alt={`${branch.name} logo`}
                className="h-9 w-9 rounded-lg text-xs"
                iconClassName="h-4 w-4"
                bgClassName="bg-white/15"
                textClassName="text-white"
              />
            )}
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">{branch.name}</div>
              <div className="text-[10px] opacity-85 truncate">{tpl.headerTitle}</div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono font-bold text-xs">{displayInvoiceNo}</div>
            <div className="text-[10px] opacity-80">{branch.code}</div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-[11px] text-slate-600 border-b border-slate-200 pb-2.5 space-y-0.5">
            {tpl.showAddress && <div>{branch.address}</div>}
            <div className="flex flex-wrap justify-between gap-2">
              {tpl.showPhone && <span>Tel: {branch.phone}</span>}
              {tpl.showVattin && <span>VATTIN: {branch.vattin}</span>}
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-slate-500 pt-0.5">
              <span>{buyerName || order.tableName}</span>
              <span>
                {dateText}
                {tpl.showCashier ? ` · ${order.cashierName}` : ''}
              </span>
            </div>
            {buyerVattin && <div className="font-mono text-slate-700">Buyer VATTIN: {buyerVattin}</div>}
          </div>

          <div className="space-y-1.5 border-b border-slate-200 pb-2.5">
            {activeItems.map((item) => (
              <div key={item.id} className="flex justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">
                    {item.qty}× {item.nameEn}
                  </div>
                  {tpl.showKhmerItemNames && item.nameKh && (
                    <div className="text-[11px] text-slate-500">{item.nameKh}</div>
                  )}
                  {tpl.showItemNotes && item.note && (
                    <div className="text-[10px] text-slate-500 italic">Note: {item.note}</div>
                  )}
                </div>
                <div className="text-right font-semibold tabular-nums shrink-0">
                  {item.coveredByPack ? 'Pack ($0.00)' : `$${(item.unitPriceUsd * item.qty).toFixed(2)}`}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1 tabular-nums text-[11px] border-b border-slate-200 pb-2.5">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>${totals.subtotalUsd.toFixed(2)}</span>
            </div>
            {totals.discountTotalUsd > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount</span>
                <span>-${totals.discountTotalUsd.toFixed(2)}</span>
              </div>
            )}
            {totals.serviceChargeUsd > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Service ({branch.serviceChargePercent}%)</span>
                <span>${totals.serviceChargeUsd.toFixed(2)}</span>
              </div>
            )}
            {tpl.showVatBreakdown && (
              <div className="flex justify-between text-slate-600">
                <span>VAT ({branch.vatPercent}%)</span>
                <span>${totals.vatUsd.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 text-sm font-bold text-slate-900">
              <span>TOTAL USD</span>
              <span>${order.totalUsd.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-700">
              <span>TOTAL KHR</span>
              <span>{khrTotal.toLocaleString()} ៛</span>
            </div>
            <div className="flex justify-between text-slate-500 pt-1">
              <span>Paid ({order.paymentMethod || 'Cash'})</span>
              <span>
                ${order.paidUsd.toFixed(2)}
                {order.paidKhr > 0 ? ` + ${order.paidKhr.toLocaleString()} ៛` : ''}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center text-center pt-1 space-y-1.5">
            {tpl.qrFooterMode !== 'none' && (
              <>
                <QrCodeBox value={qrValue} size={86} />
                <p className="text-[10px] text-slate-600">{qrCaption}</p>
              </>
            )}
            {tpl.showExchangeRate && (
              <p className="text-[10px] text-slate-500">
                Rate: 1 USD = {branch.exchangeRate.toLocaleString()} ៛
              </p>
            )}
            {tpl.footerNote && <p className="text-[10px] text-slate-600">{tpl.footerNote}</p>}
          </div>
        </div>
      </div>
    );
  }

  // Style 3 & 4: Thermal 80mm / Compact 58mm Roll Layouts
  const isCompact58 = tpl.style === 'compact_58mm';

  return (
    <div
      className={`bg-white font-mono text-slate-900 mx-auto border border-slate-200 rounded-lg ${
        isCompact58 ? 'max-w-[270px] p-3.5 text-[11px]' : 'max-w-[360px] p-5 text-xs'
      }`}
    >
      <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3 space-y-0.5">
        {tpl.showLogoBadge && (
          <CompanyLogoBadge
            logoImageUrl={tpl.logoImageUrl}
            logoIcon={tpl.logoIcon}
            logoText={tpl.logoText}
            alt={`${branch.name} logo`}
            className="mx-auto mb-1.5 h-10 w-10 rounded-md font-sans text-xs"
            iconClassName="h-4 w-4"
            bgClassName="bg-slate-900"
            textClassName="text-white"
          />
        )}
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {tpl.headerTitle}
        </p>
        <p className={`${isCompact58 ? 'text-sm' : 'text-base'} font-bold font-sans`}>
          {branch.name}
        </p>
        {tpl.showAddress && <p className="text-slate-600">{branch.address}</p>}
        {(tpl.showPhone || tpl.showVattin) && (
          <p className="text-slate-600">
            {tpl.showPhone ? `Tel: ${branch.phone}` : ''}
            {tpl.showPhone && tpl.showVattin ? ' · ' : ''}
            {tpl.showVattin ? `VATTIN: ${branch.vattin}` : ''}
          </p>
        )}
        <p className="mt-1 font-semibold">
          {displayInvoiceNo} · {buyerName || order.tableName}
        </p>
        {buyerVattin && <p className="text-slate-600">Buyer VATTIN: {buyerVattin}</p>}
        <p className="text-slate-500">
          {dateText}
          {tpl.showCashier ? ` · ${order.cashierName}` : ''}
        </p>
      </div>

      <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-3 mb-3">
        {activeItems.map((item) => (
          <div key={item.id} className="flex justify-between gap-2">
            <div className="min-w-0">
              <span className="font-semibold">
                {item.qty}× {item.nameEn}
              </span>
              {tpl.showKhmerItemNames && item.nameKh && !isCompact58 ? (
                <div className="text-[11px] text-slate-500 font-sans">{item.nameKh}</div>
              ) : null}
              {tpl.showItemNotes && item.note ? (
                <div className="text-[10px] text-slate-500">Note: {item.note}</div>
              ) : null}
            </div>
            <div className="text-right tabular-nums shrink-0">
              {item.coveredByPack ? (
                <span>Pack ($0.00)</span>
              ) : (
                <span>${(item.unitPriceUsd * item.qty).toFixed(2)}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1 tabular-nums border-b border-dashed border-slate-300 pb-3 mb-3">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>${totals.subtotalUsd.toFixed(2)}</span>
        </div>
        {totals.discountTotalUsd > 0 && (
          <div className="flex justify-between text-emerald-700">
            <span>Discount</span>
            <span>-${totals.discountTotalUsd.toFixed(2)}</span>
          </div>
        )}
        {totals.serviceChargeUsd > 0 && (
          <div className="flex justify-between">
            <span>Service ({branch.serviceChargePercent}%)</span>
            <span>${totals.serviceChargeUsd.toFixed(2)}</span>
          </div>
        )}
        {tpl.showVatBreakdown && (
          <div className="flex justify-between">
            <span>VAT ({branch.vatPercent}%)</span>
            <span>${totals.vatUsd.toFixed(2)}</span>
          </div>
        )}
        {totals.depositAppliedUsd > 0 && (
          <div className="flex justify-between text-emerald-700">
            <span>Deposit credited</span>
            <span>-${totals.depositAppliedUsd.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between pt-1 text-sm font-bold border-t border-slate-200">
          <span>TOTAL USD</span>
          <span>${order.totalUsd.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm font-bold">
          <span>TOTAL KHR</span>
          <span>{khrTotal.toLocaleString()} ៛</span>
        </div>
        <div className="flex justify-between text-slate-600 pt-1">
          <span>Paid ({order.paymentMethod || 'Cash'})</span>
          <span>
            ${order.paidUsd.toFixed(2)}
            {order.paidKhr > 0 ? ` + ${order.paidKhr.toLocaleString()} ៛` : ''}
          </span>
        </div>
        {(order.changeUsd > 0 || order.changeKhr > 0) && (
          <div className="flex justify-between font-semibold">
            <span>Change (whole $ + ៛)</span>
            <span>
              ${order.changeUsd} + {order.changeKhr.toLocaleString()} ៛
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center text-center pt-1 space-y-1">
        {tpl.qrFooterMode !== 'none' && (
          <>
            <QrCodeBox value={qrValue} size={isCompact58 ? 78 : 92} />
            <p className="mt-1 text-[10px] text-slate-600">{qrCaption}</p>
          </>
        )}
        {tpl.showExchangeRate && (
          <p className="text-[10px] text-slate-500">
            Rate: 1 USD = {branch.exchangeRate.toLocaleString()} ៛
          </p>
        )}
        {tpl.footerNote && <p className="text-[10px] text-slate-600">{tpl.footerNote}</p>}
      </div>
    </div>
  );
}
