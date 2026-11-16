import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  crc16CcittFalse,
  generateBakongKhqrPayload,
  isMerchantKhqrConfigured,
  isValidBakongAccountId,
  md5Hex,
  normalizeOptionalKhqrAccountId,
  parseBakongKhqr,
} from './bakongKhqr.ts';

describe('Bakong KHQR Generator & Parser', () => {
  it('computes EMVCo standard CRC-16/CCITT-FALSE check vector', () => {
    assert.equal(crc16CcittFalse('123456789'), '29B1');
  });

  it('computes pure JS MD5 matching Node crypto createHash', () => {
    const sample = '00020101021229180014lotuscafe@abaa520458125303840540512.505802KH5915Lotus Cafe BKK16010Phnom Penh6304ABCD';
    const expected = crypto.createHash('md5').update(sample, 'utf8').digest('hex');
    assert.equal(md5Hex(sample), expected);
  });

  it('validates Bakong account ID format and optional merchant config', () => {
    assert.equal(isValidBakongAccountId('lotuscafe@abaa'), true);
    assert.equal(isValidBakongAccountId('sokha_coffee.kh@aclb'), true);
    assert.equal(isValidBakongAccountId('invalid-no-at'), false);
    assert.equal(isValidBakongAccountId('a@b@c'), false);

    assert.equal(normalizeOptionalKhqrAccountId(undefined), '');
    assert.equal(normalizeOptionalKhqrAccountId('  '), '');
    assert.equal(normalizeOptionalKhqrAccountId(' myshop@abaa '), 'myshop@abaa');
    assert.equal(isMerchantKhqrConfigured(undefined), false);
    assert.equal(isMerchantKhqrConfigured(''), false);
    assert.equal(isMerchantKhqrConfigured('bad-id'), false);
    assert.equal(isMerchantKhqrConfigured('myshop@abaa'), true);
  });

  it('generates and parses dynamic USD individual KHQR with valid CRC', () => {
    const res = generateBakongKhqrPayload({
      accountType: 'individual',
      bakongAccountId: 'lotuscafe@abaa',
      merchantName: 'Lotus Café BKK1',
      merchantCity: 'Phnom Penh',
      currency: 'USD',
      amount: 26.95,
      billNumber: 'INV-101',
      storeLabel: 'BKK1',
      terminalLabel: 'POS1',
    });

    assert.equal(res.currencyCode, '840');
    assert.equal(res.formattedAmount, '26.95');
    assert.equal(res.qrString.endsWith(res.crc), true);

    const parsed = parseBakongKhqr(res.qrString);
    assert.equal(parsed.validFormat, true);
    assert.equal(parsed.crcValid, true);
    assert.equal(parsed.initiationMethod, 'dynamic');
    assert.equal(parsed.accountType, 'individual');
    assert.equal(parsed.bakongAccountId, 'lotuscafe@abaa');
    assert.equal(parsed.currency, 'USD');
    assert.equal(parsed.amount, '26.95');
    assert.equal(parsed.countryCode, 'KH');
    assert.equal(parsed.billNumber, 'INV-101');
    assert.equal(parsed.storeLabel, 'BKK1');
    assert.equal(parsed.terminalLabel, 'POS1');
  });

  it('generates and parses dynamic KHR merchant KHQR (Tag 30 & Currency 116)', () => {
    const res = generateBakongKhqrPayload({
      accountType: 'merchant',
      bakongAccountId: 'lotus_merchant@abaa',
      merchantId: 'M009911',
      acquiringBank: 'ABA Bank',
      merchantName: 'Lotus Main Store',
      merchantCity: 'Phnom Penh',
      currency: 'KHR',
      amount: 110500,
      mcc: '5999',
    });

    assert.equal(res.currencyCode, '116');
    assert.equal(res.formattedAmount, '110500');

    const parsed = parseBakongKhqr(res.qrString);
    assert.equal(parsed.validFormat, true);
    assert.equal(parsed.crcValid, true);
    assert.equal(parsed.accountType, 'merchant');
    assert.equal(parsed.bakongAccountId, 'lotus_merchant@abaa');
    assert.equal(parsed.merchantId, 'M009911');
    assert.equal(parsed.acquiringBank, 'ABA Bank');
    assert.equal(parsed.currency, 'KHR');
    assert.equal(parsed.amount, '110500');
    assert.equal(parsed.mcc, '5999');
  });

  it('generates static KHQR when isStatic is true and omits Tag 54', () => {
    const res = generateBakongKhqrPayload({
      bakongAccountId: 'lotuscafe@abaa',
      merchantName: 'Lotus Cafe',
      currency: 'USD',
      amount: 10,
      isStatic: true,
    });
    const parsed = parseBakongKhqr(res.qrString);
    assert.equal(parsed.crcValid, true);
    assert.equal(parsed.initiationMethod, 'static');
    assert.equal(parsed.amount, undefined);
  });
});
