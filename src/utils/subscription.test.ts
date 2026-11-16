import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBakongKhqr } from './bakongKhqr';
import {
  buildPlatformSubscriptionKhqr,
  calculateExtendedDays,
  computeSubscriptionAmountUsd,
  computeSubscriptionDays,
  isSubscriptionActive,
  SUBSCRIPTION_PLANS,
} from './subscription';

describe('Bakong subscription plans & activation gate', () => {
  it('defines Daily ($1/day), Standard ($27/mo), and Premium ($39/mo) plans', () => {
    assert.equal(SUBSCRIPTION_PLANS.daily.priceUsd, 1);
    assert.equal(SUBSCRIPTION_PLANS.daily.durationDays, 1);
    assert.equal(SUBSCRIPTION_PLANS.standard.priceUsd, 27);
    assert.equal(SUBSCRIPTION_PLANS.standard.durationDays, 30);
    assert.equal(SUBSCRIPTION_PLANS.premium.priceUsd, 39);
    assert.equal(SUBSCRIPTION_PLANS.premium.durationDays, 30);
  });

  it('computes multi-day Daily pass pricing at $1/day', () => {
    assert.equal(computeSubscriptionAmountUsd('daily', 1), 1);
    assert.equal(computeSubscriptionDays('daily', 1), 1);
    assert.equal(computeSubscriptionAmountUsd('daily', 7), 7);
    assert.equal(computeSubscriptionDays('daily', 7), 7);
    assert.equal(computeSubscriptionAmountUsd('standard', 2), 54);
    assert.equal(computeSubscriptionDays('standard', 2), 60);
  });

  it('requires active subscription status and remaining days before first use', () => {
    assert.equal(isSubscriptionActive('pending', 0), false);
    assert.equal(isSubscriptionActive('pending', 1), false);
    assert.equal(isSubscriptionActive('expired', 5), false);
    assert.equal(isSubscriptionActive('active', 0), false);
    assert.equal(isSubscriptionActive('active', 1), true);
    assert.equal(isSubscriptionActive(undefined, 10), true);
  });

  it('calculates extended days from pending vs active subscription', () => {
    assert.equal(calculateExtendedDays(0, 'pending', 1), 1);
    assert.equal(calculateExtendedDays(30, 'pending', 1), 1);
    assert.equal(calculateExtendedDays(5, 'active', 3), 8);
  });

  it('generates valid CRC-verified Bakong KHQR payload for $1 Daily subscription', () => {
    const invUsd = buildPlatformSubscriptionKhqr({
      plan: 'daily',
      periods: 1,
      currency: 'USD',
      exchangeRate: 4100,
      businessCode: 'MEKONG_KH',
      invoiceTag: 'ABC123',
    });
    assert.equal(invUsd.amountUsd, 1);
    assert.equal(invUsd.amountKhr, 4100);
    assert.equal(invUsd.daysGranted, 1);
    assert.match(invUsd.khqr.md5, /^[a-f0-9]{32}$/);

    const parsedUsd = parseBakongKhqr(invUsd.khqr.qrString);
    assert.equal(parsedUsd.validFormat, true);
    assert.equal(parsedUsd.crcValid, true);
    assert.equal(parsedUsd.currency, 'USD');
    assert.equal(parsedUsd.amount, '1.00');
    assert.equal(parsedUsd.bakongAccountId, 'xaiwork@abaa');

    const invKhr = buildPlatformSubscriptionKhqr({
      plan: 'daily',
      periods: 3,
      currency: 'KHR',
      exchangeRate: 4100,
      businessCode: 'MEKONG_KH',
      invoiceTag: 'ABC123',
    });
    assert.equal(invKhr.amountUsd, 3);
    assert.equal(invKhr.amountKhr, 12300);
    const parsedKhr = parseBakongKhqr(invKhr.khqr.qrString);
    assert.equal(parsedKhr.crcValid, true);
    assert.equal(parsedKhr.currency, 'KHR');
    assert.equal(parsedKhr.amount, '12300');
  });
});
