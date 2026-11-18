import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PosTable } from '../types/pos';
import {
  buildDefaultTableQrSlug,
  buildFloorPlanGridSlots,
  buildTableQrUrl,
  findTableMatchingQrParam,
  normalizeQrSlug,
} from './floorPlanQr';

const SAMPLE_TABLES: PosTable[] = [
  { id: 't1', branchId: 'b1', name: 'T01', area: 'Indoor', seats: 4, status: 'free', gridCol: 1, gridRow: 1, qrCodeSlug: 'BKK1-T01', qrEnabled: true },
  { id: 't2', branchId: 'b1', name: 'T02', area: 'Indoor', seats: 4, status: 'occupied', gridCol: 3, gridRow: 2 },
  { id: 't3', branchId: 'b1', name: 'G01', area: 'Garden', seats: 6, status: 'free' },
];

describe('floorPlanQr utilities', () => {
  it('places tables onto non-overlapping floor plan grid slots and preserves explicit coordinates', () => {
    const grid = buildFloorPlanGridSlots(SAMPLE_TABLES, 6, 4);
    assert.equal(grid.cols, 6);
    assert.equal(grid.rows, 4);
    assert.equal(grid.cells[0][0]?.id, 't1');
    assert.equal(grid.cells[1][2]?.id, 't2');
    // t3 had no coordinates so should take next available slot (row 1, col 2)
    assert.equal(grid.cells[0][1]?.id, 't3');
    assert.deepEqual(grid.placements.get('t2'), { col: 3, row: 2 });
  });

  it('normalizes QR slugs, builds guest self-order URLs, and matches QR URL params', () => {
    assert.equal(normalizeQrSlug(' Patio VIP #2 '), 'Patio-VIP-2');
    assert.equal(buildDefaultTableQrSlug('bkk1', 'T05'), 'BKK1-T05');
    assert.equal(
      buildTableQrUrl('https://pos.example.com/', SAMPLE_TABLES[0]),
      'https://pos.example.com/?mode=qr&table=BKK1-T01'
    );
    assert.equal(
      buildTableQrUrl('https://pos.example.com', SAMPLE_TABLES[1]),
      'https://pos.example.com/?mode=qr&table=T02'
    );
    assert.equal(findTableMatchingQrParam(SAMPLE_TABLES, 'bkk1-t01')?.id, 't1');
    assert.equal(findTableMatchingQrParam(SAMPLE_TABLES, 'T02')?.id, 't2');
    assert.equal(findTableMatchingQrParam(SAMPLE_TABLES, 'Counter'), undefined);
  });
});
