import type { PosTable } from '../types/pos';

export const FLOOR_GRID_COLS = 6;
export const FLOOR_GRID_ROWS = 4;

export function normalizeQrSlug(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 32);
}

export function getTableQrCodeSlug(table: Pick<PosTable, 'name' | 'qrCodeSlug'>): string {
  const custom = normalizeQrSlug(table.qrCodeSlug || '');
  if (custom) return custom;
  return normalizeQrSlug(table.name) || table.name.trim();
}

export function buildTableQrUrl(
  origin: string,
  table: Pick<PosTable, 'name' | 'qrCodeSlug'>
): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const slug = getTableQrCodeSlug(table);
  return `${cleanOrigin}/?mode=qr&table=${encodeURIComponent(slug)}`;
}

export function buildDefaultTableQrSlug(branchCode: string, tableName: string): string {
  const cleanBranch = normalizeQrSlug(branchCode).toUpperCase();
  const cleanTable = normalizeQrSlug(tableName).toUpperCase();
  return cleanBranch ? `${cleanBranch}-${cleanTable}` : cleanTable;
}

export function findTableMatchingQrParam(
  tables: PosTable[],
  tableParam: string | null
): PosTable | undefined {
  if (!tableParam) return undefined;
  const clean = tableParam.trim().toLowerCase();
  if (!clean || clean === 'counter') return undefined;
  return tables.find((tb) => {
    const slug = (tb.qrCodeSlug || '').trim().toLowerCase();
    return (
      (slug && slug === clean) ||
      tb.name.trim().toLowerCase() === clean ||
      tb.id.toLowerCase() === clean
    );
  });
}

export interface FloorPlanGridResult {
  cols: number;
  rows: number;
  cells: (PosTable | null)[][];
  placements: Map<string, { col: number; row: number }>;
}

export function buildFloorPlanGridSlots(
  tables: PosTable[],
  cols = FLOOR_GRID_COLS,
  minRows = FLOOR_GRID_ROWS
): FloorPlanGridResult {
  const neededRows = Math.max(
    minRows,
    Math.ceil(tables.length / Math.max(1, cols)),
    ...tables.map((t) => (t.gridRow && t.gridRow > 0 ? t.gridRow : 1))
  );

  const cells: (PosTable | null)[][] = Array.from({ length: neededRows }, () =>
    Array.from({ length: cols }, () => null)
  );
  const placements = new Map<string, { col: number; row: number }>();
  const unplaced: PosTable[] = [];

  for (const table of tables) {
    const r = typeof table.gridRow === 'number' ? table.gridRow - 1 : -1;
    const c = typeof table.gridCol === 'number' ? table.gridCol - 1 : -1;
    if (r >= 0 && r < neededRows && c >= 0 && c < cols && cells[r][c] === null) {
      cells[r][c] = table;
      placements.set(table.id, { col: c + 1, row: r + 1 });
    } else {
      unplaced.push(table);
    }
  }

  for (const table of unplaced) {
    let placed = false;
    for (let r = 0; r < cells.length && !placed; r += 1) {
      for (let c = 0; c < cols && !placed; c += 1) {
        if (cells[r][c] === null) {
          cells[r][c] = table;
          placements.set(table.id, { col: c + 1, row: r + 1 });
          placed = true;
        }
      }
    }
    if (!placed) {
      const newRow = Array.from({ length: cols }, () => null as PosTable | null);
      newRow[0] = table;
      cells.push(newRow);
      placements.set(table.id, { col: 1, row: cells.length });
    }
  }

  return {
    cols,
    rows: cells.length,
    cells,
    placements,
  };
}
