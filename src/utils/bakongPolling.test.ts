import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrderKhqrCandidates,
  matchPaidBakongResult,
  normalizeMd5List,
  parseBakongCallbackBody,
  shouldPollOrderKhqr,
} from './bakongPolling';
import type { BranchConfig, PosOrder } from '../types/pos';

const sampleBranch: BranchConfig = {
  id: 'br_bkk1',
  name: 'Lotus Café BKK1',
  code: 'BKK1',
  address: 'St. 302, Phnom Penh',
  phone: '+855 23 900 100',
  vattin: 'K001-901234567',
  exchangeRate: 4100,
  rielRounding: 100,
  vatPercent: 10,
  serviceChargePercent: 0,
  simpleMode: false,
  reservationsEnabled: true,
  defaultDepositUsd: 10,
  holdMinutes: 15,
  allowOnlineBooking: true,
  qrMode: 'review',
  groupOrderEnabled: true,
  kdsWarnMinutes: 6,
  kdsLateMinutes: 12,
  blindClose: false,
  varianceLimitUsd: 5,
  khqrAccountName: 'Lotus Cafe BKK1',
  khqrBakongId: 'lotuscafe@abaa',
  khqrAccountType: 'individual',
  khqrCity: 'Phnom Penh',
  khqrDefaultCurrency: 'USD',
  khqrMcc: '5812',
  bakongConnected: true,
  pointsEnabled: true,
  pointsPerDollar: 1,
  pointsValuePer100: 1,
  telegramBotConnected: false,
  telegramChannel: '',
  displayPairingCode: '482910',
  displayFeaturedMode: 'auto',
  displayShowNewPage: true,
  printerAutoBrowser: false,
};

const sampleOrder: PosOrder = {
  id: 'ord_101',
  branchId: 'br_bkk1',
  orderNumber: 101,
  tableId: 't1',
  tableName: 'T01',
  channel: 'dine_in',
  status: 'sent',
  guests: 2,
  items: [
    {
      id: 'line_1',
      menuItemId: 'm1',
      nameEn: 'Iced Latte',
      nameKh: 'កាហ្វេទឹកកក',
      nameVi: 'Cà phê sữa đá',
      unitPriceUsd: 3.5,
      qty: 2,
      station: 'bar',
      category: 'Coffee',
      round: 1,
      sentToKitchen: true,
      kdsStatus: 'new',
    },
  ],
  currentRound: 1,
  manualDiscountPercent: 0,
  manualDiscountUsd: 0,
  promoDiscountUsd: 0,
  pointsRedeemed: 0,
  depositAppliedUsd: 0,
  totalUsd: 7.7,
  totalKhr: 31600,
  paidUsd: 0,
  paidKhr: 0,
  changeUsd: 0,
  changeKhr: 0,
  cashierName: 'Cashier',
  createdAt: '2026-11-17T03:00:00.000Z',
  updatedAt: '2026-11-17T03:00:00.000Z',
};

describe('Bakong KHQR SellView Polling & Callback Parser', () => {
  it('determines polling eligibility based on order status, KHQR config, and online mode', () => {
    assert.equal(
      shouldPollOrderKhqr({
        order: sampleOrder,
        branch: sampleBranch,
        offlineMode: false,
        totalUsd: 7.7,
      }),
      true
    );

    assert.equal(
      shouldPollOrderKhqr({
        order: { ...sampleOrder, status: 'paid' },
        branch: sampleBranch,
        offlineMode: false,
        totalUsd: 7.7,
      }),
      false
    );

    assert.equal(
      shouldPollOrderKhqr({
        order: sampleOrder,
        branch: { ...sampleBranch, khqrBakongId: '' },
        offlineMode: false,
        totalUsd: 7.7,
      }),
      false
    );

    assert.equal(
      shouldPollOrderKhqr({
        order: sampleOrder,
        branch: sampleBranch,
        offlineMode: true,
        totalUsd: 7.7,
      }),
      false
    );
  });

  it('builds deterministic USD, KHR, and DISP1 KHQR candidates for an open order', () => {
    const candidates = buildOrderKhqrCandidates({
      order: sampleOrder,
      branch: sampleBranch,
      totalUsd: 7.7,
      totalKhr: 31600,
    });

    assert.equal(candidates.length, 3);
    assert.equal(candidates[0].currency, 'USD');
    assert.equal(candidates[0].terminalLabel, 'POS1');
    assert.equal(candidates[1].currency, 'KHR');
    assert.equal(candidates[1].terminalLabel, 'POS1');
    assert.equal(candidates[2].currency, 'USD');
    assert.equal(candidates[2].terminalLabel, 'DISP1');
    assert.match(candidates[0].md5, /^[a-f0-9]{32}$/);
    assert.notEqual(candidates[0].md5, candidates[1].md5);
    assert.notEqual(candidates[0].md5, candidates[2].md5);
  });

  it('parses flat and NBC-enveloped Bakong callback payloads and matches paid candidate', () => {
    const candidates = buildOrderKhqrCandidates({
      order: sampleOrder,
      branch: sampleBranch,
      totalUsd: 7.7,
      totalKhr: 31600,
    });
    const khrCandidate = candidates[1];

    const parsed = parseBakongCallbackBody({
      responseCode: 0,
      data: {
        md5: khrCandidate.md5.toUpperCase(),
        hash: 'BAKONG-HASH-9988',
        currency: 'KHR',
        amount: 31600,
      },
    });
    assert.ok(parsed);
    assert.equal(parsed.paid, true);
    assert.equal(parsed.md5, khrCandidate.md5);
    assert.equal(parsed.transactionRef, 'BAKONG-HASH-9988');

    const failedParsed = parseBakongCallbackBody({
      md5: khrCandidate.md5,
      status: 'failed',
    });
    assert.ok(failedParsed);
    assert.equal(failedParsed.paid, false);

    const matched = matchPaidBakongResult(
      candidates,
      {
        paid: true,
        matchedMd5: khrCandidate.md5,
        transactionRef: parsed.transactionRef,
      },
      { totalUsd: 7.7, totalKhr: 31600 }
    );
    assert.ok(matched);
    assert.equal(matched.matched.currency, 'KHR');
    assert.equal(matched.paidUsd, 0);
    assert.equal(matched.paidKhr, 31600);
    assert.equal(matched.paymentRef, 'BAKONG-HASH-9988');
  });

  it('normalizes and deduplicates MD5 lists', () => {
    const a = 'a'.repeat(32);
    const b = 'B'.repeat(32);
    assert.deepEqual(normalizeMd5List(a, [a.toUpperCase(), b, 'invalid']), [a, 'b'.repeat(32)]);
  });
});
