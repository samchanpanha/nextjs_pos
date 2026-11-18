import test from 'node:test';
import assert from 'node:assert/strict';
import type { MenuItem } from '../types/pos';
import {
  parseVoiceOrderTranscript,
  splitVoiceTranscriptClauses,
} from './voiceOrderParser';

const SAMPLE_MENU: MenuItem[] = [
  {
    id: 'm_loklak',
    branchId: 'b1',
    nameEn: 'Beef lok lak',
    nameKh: 'ឡុកឡាក់សាច់គោ',
    nameVi: 'Bò lúc lắc',
    category: 'Main dishes',
    priceUsd: 6.5,
    station: 'kitchen',
    initials: 'BL',
    active: true,
  },
  {
    id: 'm_iced_coffee',
    branchId: 'b1',
    nameEn: 'Iced coffee with condensed milk',
    nameKh: 'កាហ្វេទឹកដោះគោទឹកកក',
    nameVi: 'Cà phê sữa đá',
    category: 'Coffee & tea',
    priceUsd: 2.5,
    station: 'bar',
    initials: 'IC',
    active: true,
    options: [
      {
        name: 'Size',
        choices: [
          { label: 'Size M', deltaUsd: 0 },
          { label: 'Size L', deltaUsd: 0.75 },
        ],
      },
    ],
  },
  {
    id: 'm_matcha',
    branchId: 'b1',
    nameEn: 'Matcha latte',
    nameKh: 'តែបៃតងម៉ាត់ឆា',
    nameVi: 'Matcha latte đá',
    category: 'Coffee & tea',
    priceUsd: 3.0,
    station: 'bar',
    initials: 'ML',
    active: true,
    options: [
      {
        name: 'Size',
        choices: [
          { label: 'Size M', deltaUsd: 0 },
          { label: 'Size L', deltaUsd: 0.75 },
        ],
      },
    ],
  },
  {
    id: 'm_kuy_teav',
    branchId: 'b1',
    nameEn: 'Kuy teav noodle soup',
    nameKh: 'គុយទាវសាច់គោ',
    nameVi: 'Hủ tiếu Nam Vang',
    category: 'Noodles & soups',
    priceUsd: 4.0,
    station: 'kitchen',
    initials: 'KT',
    active: true,
    options: [
      {
        name: 'Size',
        choices: [
          { label: 'Regular', deltaUsd: 0 },
          { label: 'Special (Large)', deltaUsd: 1.5 },
        ],
      },
    ],
  },
  {
    id: 'm_spring_rolls',
    branchId: 'b1',
    nameEn: 'Fried spring rolls',
    nameKh: 'ណែមចៀន',
    nameVi: 'Chả giò giòn',
    category: 'Starters',
    priceUsd: 3.25,
    station: 'kitchen',
    initials: 'SR',
    active: true,
  },
  {
    id: 'm_banh_mi',
    branchId: 'b1',
    nameEn: 'Banh mi (pork)',
    nameKh: 'នំប៉័ងសាច់ជ្រូក',
    nameVi: 'Bánh mì thịt',
    category: 'Starters',
    priceUsd: 2.25,
    station: 'kitchen',
    initials: 'BM',
    active: true,
  },
  {
    id: 'm_inactive',
    branchId: 'b1',
    nameEn: 'Seasonal secret soup',
    nameKh: 'ស៊ុបពិសេស',
    nameVi: 'Súp đặc biệt',
    category: 'Starters',
    priceUsd: 9.0,
    station: 'kitchen',
    initials: 'SS',
    active: false,
  },
];

test('splitVoiceTranscriptClauses splits on connectors without breaking "with" menu names', () => {
  const clauses = splitVoiceTranscriptClauses(
    '2 iced coffee with condensed milk, and one beef lok lak plus fried spring rolls'
  );
  assert.deepEqual(clauses, [
    '2 iced coffee with condensed milk',
    'one beef lok lak',
    'fried spring rolls',
  ]);
});

test('parseVoiceOrderTranscript matches quantities, defaults options, and extracts modifiers', () => {
  const res = parseVoiceOrderTranscript('2 iced coffee less ice and one beef lok lak', SAMPLE_MENU);
  assert.equal(res.unmatched.length, 0);
  assert.equal(res.matched.length, 2);

  assert.equal(res.matched[0].item.id, 'm_iced_coffee');
  assert.equal(res.matched[0].qty, 2);
  assert.equal(res.matched[0].optionLabel, 'Size M');
  assert.equal(res.matched[0].deltaUsd, 0);
  assert.equal(res.matched[0].note, 'Less ice');

  assert.equal(res.matched[1].item.id, 'm_loklak');
  assert.equal(res.matched[1].qty, 1);
});

test('parseVoiceOrderTranscript recognizes spoken size choices and phonetic aliases', () => {
  const res = parseVoiceOrderTranscript(
    'three large matcha latte no sugar and 2x lock lack, plus special kuy teav',
    SAMPLE_MENU
  );
  assert.equal(res.unmatched.length, 0);
  assert.equal(res.matched.length, 3);

  assert.equal(res.matched[0].item.id, 'm_matcha');
  assert.equal(res.matched[0].qty, 3);
  assert.equal(res.matched[0].optionLabel, 'Size L');
  assert.equal(res.matched[0].deltaUsd, 0.75);
  assert.equal(res.matched[0].note, 'No sugar');

  assert.equal(res.matched[1].item.id, 'm_loklak');
  assert.equal(res.matched[1].qty, 2);

  assert.equal(res.matched[2].item.id, 'm_kuy_teav');
  assert.equal(res.matched[2].optionLabel, 'Special (Large)');
  assert.equal(res.matched[2].deltaUsd, 1.5);
});

test('parseVoiceOrderTranscript supports Vietnamese menu names and flags unknown speech segments', () => {
  const res = parseVoiceOrderTranscript(
    'add 2 ca phe sua da and one unicorn rainbow waffle',
    SAMPLE_MENU
  );
  assert.equal(res.matched.length, 1);
  assert.equal(res.matched[0].item.id, 'm_iced_coffee');
  assert.equal(res.matched[0].qty, 2);

  assert.deepEqual(res.unmatched, ['one unicorn rainbow waffle']);
});

test('parseVoiceOrderTranscript ignores inactive menu items', () => {
  const res = parseVoiceOrderTranscript('seasonal secret soup', SAMPLE_MENU);
  assert.equal(res.matched.length, 0);
  assert.equal(res.unmatched.length, 1);
});
