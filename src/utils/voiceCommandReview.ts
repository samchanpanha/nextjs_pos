import { roundCurrency } from './posMath';
import type { VoiceMatchedOrderItem } from './voiceOrderParser';

export interface VoiceReviewDraftItem extends VoiceMatchedOrderItem {
  draftId: string;
}

export interface VoiceReviewSummary {
  distinctItems: number;
  totalUnits: number;
  estimatedTotalUsd: number;
  requiresConfirmation: boolean;
}

/**
 * Converts parsed voice matches into editable staged review items so staff can
 * inspect, adjust quantities, or remove accidental matches before confirming.
 */
export function buildVoiceReviewDrafts(
  matched: VoiceMatchedOrderItem[],
  qtyOverrides?: Record<string, number>,
  removedKeys?: Set<string>
): VoiceReviewDraftItem[] {
  const drafts: VoiceReviewDraftItem[] = [];
  matched.forEach((entry, idx) => {
    const key = `${entry.item.id}::${entry.optionLabel || ''}::${entry.note || ''}::${idx}`;
    if (removedKeys?.has(key)) return;
    const overrideQty = qtyOverrides?.[key];
    const finalQty =
      typeof overrideQty === 'number' && Number.isFinite(overrideQty)
        ? Math.max(0, Math.round(overrideQty))
        : entry.qty;
    if (finalQty <= 0) return;
    drafts.push({
      ...entry,
      qty: finalQty,
      draftId: key,
    });
  });
  return drafts;
}

export function summarizeVoiceReviewDrafts(drafts: VoiceReviewDraftItem[]): VoiceReviewSummary {
  const totalUnits = drafts.reduce((sum, d) => sum + d.qty, 0);
  const estimatedTotalUsd = roundCurrency(
    drafts.reduce((sum, d) => sum + (d.item.priceUsd + d.deltaUsd) * d.qty, 0)
  );
  return {
    distinctItems: drafts.length,
    totalUnits,
    estimatedTotalUsd,
    requiresConfirmation: drafts.length > 0 && totalUnits > 0,
  };
}
