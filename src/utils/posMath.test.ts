import test from 'node:test';
import assert from 'node:assert/strict';
import {
  roundRiel,
  usdToKhr,
  calculateOrderTotals,
  calculateDualCurrencyChange,
  evaluateBestPromotion,
  calculateDrawerReconciliation,
  generateUbl21Xml,
  type OrderLineItem,
  type PromotionRule,
} from './posMath';

test('roundRiel rounds to nearest 100 KHR', () => {
  assert.equal(roundRiel(110480, 100), 110500);
  assert.equal(roundRiel(26695, 100), 26700);
  assert.equal(usdToKhr(26.95, 4100, 100), 110500);
});

test('calculateOrderTotals computes VAT, service charge, discounts, and deposit deduction', () => {
  const items: OrderLineItem[] = [
    {
      id: '1',
      menuItemId: 'm1',
      nameEn: 'Beef lok lak',
      nameKh: 'ឡុកឡាក់សាច់គោ',
      nameVi: 'Bò lúc lắc',
      unitPriceUsd: 6.5,
      qty: 2,
      station: 'kitchen',
      category: 'Main dishes',
      round: 1,
      sentToKitchen: true,
      kdsStatus: 'new',
    },
    {
      id: '2',
      menuItemId: 'm2',
      nameEn: 'Iced coffee',
      nameKh: 'កាហ្វេទឹកកក',
      nameVi: 'Cà phê sữa đá',
      unitPriceUsd: 2.5,
      qty: 1,
      station: 'bar',
      category: 'Coffee & tea',
      round: 1,
      sentToKitchen: true,
      kdsStatus: 'new',
    },
  ];

  const res = calculateOrderTotals({
    items,
    exchangeRate: 4100,
    rielRounding: 100,
    vatPercent: 10,
    serviceChargePercent: 0,
    depositAppliedUsd: 5.0,
  });

  assert.equal(res.subtotalUsd, 15.5);
  assert.equal(res.vatUsd, 1.55);
  assert.equal(res.depositAppliedUsd, 5.0);
  assert.equal(res.totalUsd, 12.05);
  assert.equal(res.totalKhr, 49400);
});

test('calculateDualCurrencyChange computes whole dollars + Riel change and shortfall', () => {
  const shortRes = calculateDualCurrencyChange({
    dueUsd: 26.95,
    paidUsd: 20,
    paidKhr: 0,
    exchangeRate: 4100,
    rielRounding: 100,
  });
  assert.equal(shortRes.isSettled, false);
  assert.equal(shortRes.shortUsd, 6.95);
  assert.equal(shortRes.shortKhr, 28500);

  const overpayRes = calculateDualCurrencyChange({
    dueUsd: 15.5,
    paidUsd: 20,
    paidKhr: 0,
    exchangeRate: 4100,
    rielRounding: 100,
  });
  assert.equal(overpayRes.isSettled, true);
  assert.equal(overpayRes.changeWholeUsd, 4);
  assert.equal(overpayRes.changeKhr, 2100);

  const mixedRes = calculateDualCurrencyChange({
    dueUsd: 10.0,
    paidUsd: 5,
    paidKhr: 25000,
    exchangeRate: 4100,
    rielRounding: 100,
  });
  assert.equal(mixedRes.isSettled, true);
  assert.equal(mixedRes.changeWholeUsd, 1);
  assert.equal(mixedRes.changeKhr, 400);
});

test('evaluateBestPromotion picks highest discount automatically', () => {
  const items: OrderLineItem[] = [
    {
      id: '1',
      menuItemId: 'm1',
      nameEn: 'Iced coffee',
      nameKh: 'កាហ្វេ',
      nameVi: 'Cà phê',
      unitPriceUsd: 3.0,
      qty: 3,
      station: 'bar',
      category: 'Coffee & tea',
      round: 1,
      sentToKitchen: false,
      kdsStatus: 'draft',
    },
  ];
  const promos: PromotionRule[] = [
    {
      id: 'p1',
      nameEn: 'Happy hour 20%',
      nameKh: 'ម៉ោងរីករាយ ២០%',
      type: 'happy_hour',
      discountPercent: 20,
      targetCategory: 'Coffee & tea',
      startHour: 14,
      endHour: 17,
      active: true,
    },
    {
      id: 'p2',
      nameEn: 'Buy 2 get 1',
      nameKh: 'ទិញ ២ ថែម ១',
      type: 'buy_x_get_y',
      targetCategory: 'Coffee & tea',
      minQty: 3,
      freeQty: 1,
      active: true,
    },
  ];

  const result = evaluateBestPromotion(items, promos, 15);
  assert.equal(result.promotion?.id, 'p2');
  assert.equal(result.discountUsd, 3.0);
});

test('calculateDrawerReconciliation computes expected and variance for USD and KHR', () => {
  const res = calculateDrawerReconciliation({
    openingUsd: 50,
    openingKhr: 200000,
    cashPaidUsd: 120,
    cashPaidKhr: 82000,
    cashChangeUsd: 21.25,
    cashChangeKhr: 15500,
    pettyCashInUsd: 0,
    pettyCashOutUsd: 0,
    pettyCashInKhr: 0,
    pettyCashOutKhr: 0,
    countedUsd: 148.75,
    countedKhr: 266500,
  });

  assert.equal(res.expectedUsd, 148.75);
  assert.equal(res.expectedKhr, 266500);
  assert.equal(res.varianceUsd, 0);
  assert.equal(res.varianceKhr, 0);
});

test('generateUbl21Xml produces valid CamInvoice UBL 2.1 markup', () => {
  const xml = generateUbl21Xml({
    invoiceNo: 'BKK1XX-2026-000008',
    issueDate: '2026-11-06',
    invoiceType: 'tax',
    sellerName: 'Lotus Café BKK1',
    sellerVattin: 'K001-902100088',
    buyerName: 'ABC Trading Co., Ltd.',
    buyerVattin: 'K001-100000001',
    exclVatUsd: 9.0,
    vatUsd: 0.9,
    totalUsd: 9.9,
    totalKhr: 40590,
    exchangeRate: 4100,
  });
  assert.ok(xml.includes('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>'));
  assert.ok(xml.includes('BKK1XX-2026-000008'));
  assert.ok(xml.includes('K001-100000001'));
});
