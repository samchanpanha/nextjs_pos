import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Package, ArrowRight, X } from 'lucide-react';
import type { MenuLowStockSummary } from '../utils/sellLowStock';

interface LowStockBadgeProps {
  summary: MenuLowStockSummary;
  onOpenInventory: () => void;
}

export function LowStockBadge({ summary, onOpenInventory }: LowStockBadgeProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const menuAlertCount = summary.totalAlertCount;
  const unlinkedCount = summary.unlinkedLowIngredients.length;
  const totalBadgeCount = menuAlertCount > 0 ? menuAlertCount : unlinkedCount;
  const hasOut = summary.outCount > 0 || summary.unlinkedLowIngredients.some((u) => u.severity === 'out');
  const hasAlerts = totalBadgeCount > 0;

  const badgeTone = !hasAlerts
    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-50'
    : hasOut
      ? 'border-red-300 bg-red-50 text-red-900 hover:bg-red-100/80'
      : 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100/80';

  const countChipTone = !hasAlerts
    ? 'bg-emerald-700 text-white'
    : hasOut
      ? 'bg-red-600 text-white'
      : 'bg-amber-600 text-white';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-testid="sell-low-stock-badge"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          hasAlerts
            ? `Low stock notification: ${menuAlertCount} menu item${menuAlertCount === 1 ? '' : 's'} at critical stock`
            : 'Menu stock healthy'
        }
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${badgeTone}`}
      >
        {hasAlerts ? (
          <AlertTriangle
            className={`h-3.5 w-3.5 shrink-0 ${hasOut ? 'text-red-600' : 'text-amber-600'}`}
          />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
        )}
        <span>{hasAlerts ? 'Low Stock' : 'Stock OK'}</span>
        <span
          data-testid="sell-low-stock-count"
          className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums ${countChipTone}`}
        >
          {totalBadgeCount}
        </span>
        <ChevronDown className={`h-3 w-3 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Low stock notification details"
          data-testid="sell-low-stock-panel"
          className="fixed inset-x-3 top-28 sm:inset-auto sm:absolute sm:left-0 sm:top-full sm:mt-2 z-50 sm:w-[22rem] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                <span>Low Stock Notification</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {menuAlertCount > 0
                  ? `${summary.outCount} out of stock · ${summary.criticalCount} critical menu item${
                      summary.criticalCount === 1 ? '' : 's'
                    }`
                  : unlinkedCount > 0
                    ? `${unlinkedCount} inventory ingredient${unlinkedCount === 1 ? '' : 's'} below minimum`
                    : 'All linked menu items have sufficient inventory'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close low stock panel"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {summary.alerts.length === 0 && summary.unlinkedLowIngredients.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500">
                No menu items have reached critical inventory thresholds.
              </div>
            ) : (
              <>
                {summary.alerts.map((item) => (
                  <div
                    key={item.menuItemId}
                    data-testid="sell-low-stock-item"
                    className="px-3.5 py-2.5 flex items-start justify-between gap-2.5 hover:bg-slate-50/80"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {item.nameEn}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {item.limitingIngredient.ingredientName}:{' '}
                        <span className="font-semibold tabular-nums text-slate-700">
                          {item.limitingIngredient.onHand.toLocaleString()}/
                          {item.limitingIngredient.minLevel.toLocaleString()}{' '}
                          {item.limitingIngredient.unit}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide tabular-nums ${
                        item.severity === 'out'
                          ? 'bg-red-100 text-red-800 border border-red-200'
                          : 'bg-amber-100 text-amber-900 border border-amber-200'
                      }`}
                    >
                      {item.severity === 'out'
                        ? 'Out of Stock'
                        : `${item.maxServingsLeft} left`}
                    </span>
                  </div>
                ))}

                {summary.unlinkedLowIngredients.length > 0 && (
                  <div className="px-3.5 py-2.5 bg-slate-50/60 space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Other low inventory ingredients
                    </div>
                    {summary.unlinkedLowIngredients.map((ing) => (
                      <div
                        key={ing.ingredientId}
                        className="flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="text-slate-700 font-medium truncate">{ing.nameEn}</span>
                        <span className="tabular-nums font-semibold text-amber-800 shrink-0">
                          {ing.onHand.toLocaleString()} / {ing.minLevel.toLocaleString()} {ing.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-t border-slate-100 bg-slate-50/70 px-3.5 py-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">Synced with Inventory state</span>
            <button
              type="button"
              data-testid="sell-low-stock-manage-btn"
              onClick={() => {
                setOpen(false);
                onOpenInventory();
              }}
              className="inline-flex items-center gap-1 rounded-md bg-[#0A3D31] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#083026]"
            >
              <span>Manage Stock</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
