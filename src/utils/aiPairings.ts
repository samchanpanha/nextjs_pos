import type { BranchConfig, MenuItem, PosOrder } from '../types/pos';
import { roundCurrency, usdToKhr } from './posMath';

export interface PairingCartItemSignal {
  menuItemId: string;
  nameEn: string;
  category: string;
  station: 'kitchen' | 'bar';
  qty: number;
  unitPriceUsd: number;
}

export interface PairingCandidateSignal {
  menuItemId: string;
  nameEn: string;
  nameKh: string;
  nameVi: string;
  category: string;
  station: 'kitchen' | 'bar';
  itemType: 'product' | 'service';
  priceUsd: number;
  priceKhr: number;
  isBestSeller: boolean;
  isCatalogPairing: boolean;
  coOrderCount: number;
  coOrderConfidencePct: number;
  totalHistoricalOrders: number;
  totalHistoricalUnits: number;
}

export interface AiPairingsRequestPayload {
  branchId: string;
  branchName: string;
  exchangeRate: number;
  rielRounding: number;
  historicalOrdersAnalyzed: number;
  cartItems: PairingCartItemSignal[];
  candidates: PairingCandidateSignal[];
}

export interface RawGeminiPairingItem {
  menuItemId?: string;
  tag?: string;
  reason?: string;
  confidencePct?: number;
}

export interface RawGeminiPairingsPayload {
  summary?: string;
  pairings?: RawGeminiPairingItem[];
}

export interface SuggestedPairingItem {
  menuItemId: string;
  nameEn: string;
  nameKh: string;
  nameVi: string;
  category: string;
  station: 'kitchen' | 'bar';
  priceUsd: number;
  priceKhr: number;
  tag: string;
  reason: string;
  confidencePct: number;
  coOrderCount: number;
  totalHistoricalOrders: number;
  isCatalogPairing: boolean;
}

export interface AiPairingsReport {
  model: string;
  generatedAt: string;
  historicalOrdersAnalyzed: number;
  summary: string;
  pairings: SuggestedPairingItem[];
}

export function buildAiPairingsPayload(input: {
  branch: Pick<BranchConfig, 'id' | 'name' | 'exchangeRate' | 'rielRounding'>;
  menuItems: MenuItem[];
  orders: PosOrder[];
  activeOrder: Pick<PosOrder, 'id' | 'items'>;
  maxCandidates?: number;
}): AiPairingsRequestPayload {
  const maxCandidates = Math.max(3, Math.min(20, input.maxCandidates ?? 14));
  const branchMenu = input.menuItems.filter((m) => m.branchId === input.branch.id && m.active);
  const menuById = new Map(branchMenu.map((m) => [m.id, m]));

  // Aggregate active non-voided lines in the current cart
  const cartGrouped = new Map<string, PairingCartItemSignal>();
  for (const line of input.activeOrder.items) {
    if (line.voided || line.qty <= 0) continue;
    const menuItem = menuById.get(line.menuItemId);
    const existing = cartGrouped.get(line.menuItemId);
    if (existing) {
      existing.qty += line.qty;
    } else {
      cartGrouped.set(line.menuItemId, {
        menuItemId: line.menuItemId,
        nameEn: menuItem?.nameEn || line.nameEn,
        category: menuItem?.category || line.category,
        station: menuItem?.station || line.station,
        qty: line.qty,
        unitPriceUsd: roundCurrency(menuItem?.priceUsd ?? line.unitPriceUsd),
      });
    }
  }

  const cartItems = Array.from(cartGrouped.values());
  const cartIdSet = new Set(cartItems.map((c) => c.menuItemId));

  // Collect catalog "oftenOrderedWith" links from cart items
  const catalogPairSet = new Set<string>();
  for (const c of cartItems) {
    const m = menuById.get(c.menuItemId);
    m?.oftenOrderedWith?.forEach((id) => {
      if (!cartIdSet.has(id)) catalogPairSet.add(id);
    });
  }

  // Analyze historical branch orders (excluding voided orders and the active cart order itself)
  const historicalOrders = input.orders.filter(
    (o) =>
      o.branchId === input.branch.id &&
      o.status !== 'voided' &&
      o.id !== input.activeOrder.id &&
      o.items.some((i) => !i.voided && i.qty > 0)
  );

  const itemOrderCounts = new Map<string, number>();
  const itemUnitsSold = new Map<string, number>();
  const coOccurrenceCounts = new Map<string, number>();
  let ordersContainingCartItem = 0;

  for (const order of historicalOrders) {
    const uniqueIdsInOrder = new Set<string>();
    for (const line of order.items) {
      if (line.voided || line.qty <= 0) continue;
      uniqueIdsInOrder.add(line.menuItemId);
      itemUnitsSold.set(line.menuItemId, (itemUnitsSold.get(line.menuItemId) || 0) + line.qty);
    }

    for (const id of uniqueIdsInOrder) {
      itemOrderCounts.set(id, (itemOrderCounts.get(id) || 0) + 1);
    }

    let matchesAnyCartItem = false;
    for (const cartId of cartIdSet) {
      if (uniqueIdsInOrder.has(cartId)) {
        matchesAnyCartItem = true;
        break;
      }
    }

    if (matchesAnyCartItem) {
      ordersContainingCartItem += 1;
      for (const candidateId of uniqueIdsInOrder) {
        if (!cartIdSet.has(candidateId)) {
          coOccurrenceCounts.set(candidateId, (coOccurrenceCounts.get(candidateId) || 0) + 1);
        }
      }
    }
  }

  const cartStations = new Set(cartItems.map((c) => c.station));
  const cartCategories = new Set(cartItems.map((c) => c.category));

  const rankedCandidates: (PairingCandidateSignal & { _score: number })[] = branchMenu
    .filter((m) => !cartIdSet.has(m.id))
    .map((m) => {
      const coOrderCount = coOccurrenceCounts.get(m.id) || 0;
      const totalHistoricalOrders = itemOrderCounts.get(m.id) || 0;
      const totalHistoricalUnits = itemUnitsSold.get(m.id) || 0;
      const isCatalogPairing = catalogPairSet.has(m.id);
      const coOrderConfidencePct =
        ordersContainingCartItem > 0 && coOrderCount > 0
          ? Math.min(99, Math.round((coOrderCount / ordersContainingCartItem) * 100))
          : 0;

      // Cross-station complementarity bonus (e.g. bar drink for kitchen food cart, or dessert/starter)
      const complementaryStationBonus = !cartStations.has(m.station) ? 3 : 0;
      const complementaryCategoryBonus =
        !cartCategories.has(m.category) &&
        (m.category === 'Starters' || m.category === 'Coffee & tea' || m.category === 'Desserts')
          ? 2
          : 0;

      const score =
        coOrderCount * 12 +
        (isCatalogPairing ? 8 : 0) +
        totalHistoricalOrders * 2 +
        (m.isBestSeller ? 3 : 0) +
        complementaryStationBonus +
        complementaryCategoryBonus;

      return {
        menuItemId: m.id,
        nameEn: m.nameEn,
        nameKh: m.nameKh,
        nameVi: m.nameVi,
        category: m.category,
        station: m.station,
        itemType: m.itemType === 'service' ? 'service' : 'product',
        priceUsd: roundCurrency(m.priceUsd),
        priceKhr: usdToKhr(m.priceUsd, input.branch.exchangeRate, input.branch.rielRounding),
        isBestSeller: Boolean(m.isBestSeller),
        isCatalogPairing,
        coOrderCount,
        coOrderConfidencePct,
        totalHistoricalOrders,
        totalHistoricalUnits,
        _score: score,
      };
    });

  rankedCandidates.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return a.priceUsd - b.priceUsd;
  });

  const candidates: PairingCandidateSignal[] = rankedCandidates
    .slice(0, maxCandidates)
    .map(({ _score: _unused, ...rest }) => rest);

  return {
    branchId: input.branch.id,
    branchName: input.branch.name,
    exchangeRate: input.branch.exchangeRate,
    rielRounding: input.branch.rielRounding,
    historicalOrdersAnalyzed: historicalOrders.length,
    cartItems,
    candidates,
  };
}

export function buildAiPairingsFingerprint(
  tenantId: string,
  payload: Pick<AiPairingsRequestPayload, 'branchId' | 'historicalOrdersAnalyzed' | 'cartItems'>
): string {
  const cartKey = payload.cartItems
    .map((c) => c.menuItemId)
    .sort()
    .join(',');
  return [
    tenantId || 'default',
    payload.branchId,
    String(payload.historicalOrdersAnalyzed),
    cartKey,
  ].join('::');
}

export function normalizeAiPairingsReport(
  raw: RawGeminiPairingsPayload,
  meta: {
    model: string;
    generatedAt: string;
    payload: AiPairingsRequestPayload;
  }
): AiPairingsReport {
  const candidateMap = new Map(meta.payload.candidates.map((c) => [c.menuItemId, c]));
  const cartIdSet = new Set(meta.payload.cartItems.map((c) => c.menuItemId));
  const seen = new Set<string>();
  const pairings: SuggestedPairingItem[] = [];

  const rawList = Array.isArray(raw.pairings) ? raw.pairings : [];

  for (const item of rawList) {
    if (pairings.length >= 3) break;
    const id = typeof item.menuItemId === 'string' ? item.menuItemId.trim() : '';
    if (!id || seen.has(id) || cartIdSet.has(id)) continue;

    const candidate = candidateMap.get(id);
    if (!candidate) continue;

    seen.add(id);

    const rawConfidence = Number(item.confidencePct);
    const fallbackConfidence =
      candidate.coOrderConfidencePct > 0
        ? Math.max(55, candidate.coOrderConfidencePct)
        : candidate.isCatalogPairing
          ? 78
          : candidate.isBestSeller
            ? 72
            : 64;
    const confidencePct = Number.isFinite(rawConfidence)
      ? Math.min(99, Math.max(45, Math.round(rawConfidence)))
      : fallbackConfidence;

    const tag =
      typeof item.tag === 'string' && item.tag.trim()
        ? item.tag.trim().slice(0, 28)
        : candidate.coOrderCount > 0
          ? 'Frequent pairing'
          : candidate.station === 'bar'
            ? 'Drink pairing'
            : 'Popular add-on';

    const fallbackReason =
      candidate.coOrderCount > 0
        ? `Ordered together with cart items in ${candidate.coOrderCount} historical order${candidate.coOrderCount === 1 ? '' : 's'}.`
        : candidate.totalHistoricalOrders > 0
          ? `Ordered in ${candidate.totalHistoricalOrders} past branch ticket${candidate.totalHistoricalOrders === 1 ? '' : 's'} — complements this cart.`
          : 'Popular menu add-on that pairs well with the current selection.';

    const reason =
      typeof item.reason === 'string' && item.reason.trim()
        ? item.reason.trim().slice(0, 140)
        : fallbackReason;

    pairings.push({
      menuItemId: candidate.menuItemId,
      nameEn: candidate.nameEn,
      nameKh: candidate.nameKh,
      nameVi: candidate.nameVi,
      category: candidate.category,
      station: candidate.station,
      priceUsd: candidate.priceUsd,
      priceKhr: candidate.priceKhr,
      tag,
      reason,
      confidencePct,
      coOrderCount: candidate.coOrderCount,
      totalHistoricalOrders: candidate.totalHistoricalOrders,
      isCatalogPairing: candidate.isCatalogPairing,
    });
  }

  const summary =
    typeof raw.summary === 'string' && raw.summary.trim()
      ? raw.summary.trim()
      : pairings.length > 0
        ? `Top ${pairings.length} AI add-on${pairings.length === 1 ? '' : 's'} ranked from ${meta.payload.historicalOrdersAnalyzed} branch orders.`
        : 'No additional pairings needed for the current cart.';

  return {
    model: meta.model,
    generatedAt: meta.generatedAt,
    historicalOrdersAnalyzed: meta.payload.historicalOrdersAnalyzed,
    summary,
    pairings,
  };
}
