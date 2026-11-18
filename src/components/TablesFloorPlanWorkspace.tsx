import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Grid2x2,
  Move,
  Pencil,
  Plus,
  Printer,
  QrCode,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import type { PosTable } from '../types/pos';
import { QrCodeBox } from './QrCodeBox';
import {
  FLOOR_GRID_COLS,
  FLOOR_GRID_ROWS,
  buildDefaultTableQrSlug,
  buildFloorPlanGridSlots,
  buildTableQrUrl,
  getTableQrCodeSlug,
  normalizeQrSlug,
} from '../utils/floorPlanQr';

type AreaFilter = 'All' | PosTable['area'];
type StudioMode = 'floor_plan' | 'print_grid';

export function TablesFloorPlanWorkspace() {
  const { state, activeBranch, saveTable, deleteTable, setExternalMode, notify } = usePos();

  const branchTables = useMemo(
    () => state.tables.filter((t) => t.branchId === activeBranch.id),
    [state.tables, activeBranch.id]
  );

  const [areaFilter, setAreaFilter] = useState<AreaFilter>('All');
  const [studioMode, setStudioMode] = useState<StudioMode>('floor_plan');
  const [selectedTableId, setSelectedTableId] = useState<string>(() => branchTables[0]?.id || '');
  const [movingMode, setMovingMode] = useState(false);

  // Add / Edit Table form state
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [area, setArea] = useState<PosTable['area']>('Indoor');
  const [seats, setSeats] = useState('4');
  const [pendingSlot, setPendingSlot] = useState<{ col: number; row: number } | null>(null);

  // QR assignment draft state for selected table
  const [qrSlugDraft, setQrSlugDraft] = useState('');
  const [qrEnabledDraft, setQrEnabledDraft] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [qrSavedFeedback, setQrSavedFeedback] = useState('');

  const filteredTables = useMemo(
    () =>
      areaFilter === 'All'
        ? branchTables
        : branchTables.filter((t) => t.area === areaFilter),
    [branchTables, areaFilter]
  );

  const selectedTable = useMemo(
    () => branchTables.find((t) => t.id === selectedTableId) || branchTables[0] || null,
    [branchTables, selectedTableId]
  );

  useEffect(() => {
    if (!selectedTable) return;
    setSelectedTableId(selectedTable.id);
    setQrSlugDraft(getTableQrCodeSlug(selectedTable));
    setQrEnabledDraft(selectedTable.qrEnabled !== false);
    setQrSavedFeedback('');
  }, [selectedTable?.id, selectedTable?.qrCodeSlug, selectedTable?.qrEnabled, selectedTable?.name]);

  const floorGrid = useMemo(
    () => buildFloorPlanGridSlots(filteredTables, FLOOR_GRID_COLS, FLOOR_GRID_ROWS),
    [filteredTables]
  );

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const effectivePreviewSlug = normalizeQrSlug(qrSlugDraft) || (selectedTable ? getTableQrCodeSlug(selectedTable) : 'Counter');
  const selectedQrUrl = selectedTable
    ? buildTableQrUrl(origin, { name: selectedTable.name, qrCodeSlug: effectivePreviewSlug })
    : `${origin}/?mode=qr&table=Counter`;

  const handleSaveTableForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const cleanName = name.trim();
    const defaultSlug = buildDefaultTableQrSlug(activeBranch.code, cleanName);
    const existing = editingTableId ? branchTables.find((t) => t.id === editingTableId) : undefined;
    saveTable({
      id: editingTableId || undefined,
      name: cleanName,
      area,
      seats: Math.max(1, Number(seats) || 4),
      gridCol: existing?.gridCol ?? pendingSlot?.col,
      gridRow: existing?.gridRow ?? pendingSlot?.row,
      qrCodeSlug: existing?.qrCodeSlug || defaultSlug,
      qrEnabled: existing?.qrEnabled ?? true,
    });
    notify(
      editingTableId ? `Updated table ${cleanName}` : `Added table ${cleanName} to floor plan`,
      'success'
    );
    setEditingTableId(null);
    setPendingSlot(null);
    setName('');
    setSeats('4');
  };

  const handlePlaceTableAtSlot = (col: number, row: number) => {
    if (movingMode && selectedTable) {
      saveTable({
        id: selectedTable.id,
        name: selectedTable.name,
        area: selectedTable.area,
        seats: selectedTable.seats,
        gridCol: col,
        gridRow: row,
        qrCodeSlug: selectedTable.qrCodeSlug,
        qrEnabled: selectedTable.qrEnabled,
      });
      setMovingMode(false);
      notify(`Moved ${selectedTable.name} to Row ${row}, Col ${col}`, 'success');
      return;
    }

    // Pre-fill Add Table form for this empty floor slot
    setEditingTableId(null);
    setPendingSlot({ col, row });
    if (areaFilter !== 'All') {
      setArea(areaFilter);
    }
    if (!name.trim()) {
      const nextNum = branchTables.length + 1;
      setName(`T${String(nextNum).padStart(2, '0')}`);
    }
  };

  const handleSaveQrAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTable) return;
    const cleanSlug = normalizeQrSlug(qrSlugDraft) || getTableQrCodeSlug(selectedTable);
    setQrSlugDraft(cleanSlug);
    saveTable({
      id: selectedTable.id,
      name: selectedTable.name,
      area: selectedTable.area,
      seats: selectedTable.seats,
      gridCol: selectedTable.gridCol,
      gridRow: selectedTable.gridRow,
      qrCodeSlug: cleanSlug,
      qrEnabled: qrEnabledDraft,
      qrAssignedAt: new Date().toISOString(),
    });
    setQrSavedFeedback(`Assigned QR code "${cleanSlug}" to ${selectedTable.name}`);
    notify(`Saved QR code "${cleanSlug}" for ${selectedTable.name}`, 'success');
  };

  const handleCopyQrUrl = async () => {
    try {
      await navigator.clipboard.writeText(selectedQrUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      notify('Copy unavailable in this browser context.', 'info');
    }
  };

  const handlePreviewSelectedGuestQr = () => {
    if (typeof window !== 'undefined') {
      const nextUrl = `/?mode=qr&table=${encodeURIComponent(effectivePreviewSlug)}`;
      window.history.replaceState({}, '', nextUrl);
    }
    setExternalMode('qr');
  };

  const qrActiveCount = branchTables.filter((t) => t.qrEnabled !== false).length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Floor plan, tables &amp; QR self-ordering
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {activeBranch.name} · {branchTables.length} tables · {qrActiveCount} QR codes active
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setStudioMode('floor_plan')}
              className={`rounded-md px-3 py-1.5 font-semibold whitespace-nowrap transition-colors ${
                studioMode === 'floor_plan'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Floor Plan &amp; QR Studio
            </button>
            <button
              type="button"
              onClick={() => setStudioMode('print_grid')}
              className={`rounded-md px-3 py-1.5 font-semibold whitespace-nowrap transition-colors ${
                studioMode === 'print_grid'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Print QR Tents ({branchTables.length + 1})
            </button>
          </div>

          <button
            type="button"
            onClick={() => setExternalMode('qr')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            Preview Guest QR (/qr)
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-900 whitespace-nowrap"
          >
            <Printer className="h-3.5 w-3.5" /> Print All Table QRs
          </button>
        </div>
      </div>

      {/* Add / Edit Table Bar */}
      <form
        onSubmit={handleSaveTableForm}
        className="no-print rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-end gap-3 text-xs"
      >
        <div>
          <label htmlFor="floor-table-name" className="block font-semibold text-slate-700 mb-1">
            Table Name
          </label>
          <input
            id="floor-table-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. T11"
            className="w-36 rounded-lg border border-slate-300 px-3 py-1.5"
          />
        </div>
        <div>
          <label htmlFor="floor-table-area" className="block font-semibold text-slate-700 mb-1">
            Area
          </label>
          <select
            id="floor-table-area"
            aria-label="Table area"
            value={area}
            onChange={(e) => setArea(e.target.value as PosTable['area'])}
            className="rounded-lg border border-slate-300 px-3 py-1.5"
          >
            <option value="Indoor">Indoor</option>
            <option value="Garden">Garden</option>
            <option value="Bar counter">Bar counter</option>
            <option value="Take-away">Take-away</option>
          </select>
        </div>
        <div>
          <label htmlFor="floor-table-seats" className="block font-semibold text-slate-700 mb-1">
            Seats
          </label>
          <input
            id="floor-table-seats"
            type="number"
            min={1}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 tabular-nums"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-800 px-4 py-1.5 font-semibold text-white hover:bg-emerald-900 whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />{' '}
          {editingTableId
            ? 'Save Changes'
            : pendingSlot
              ? `Place at R${pendingSlot.row}·C${pendingSlot.col}`
              : 'Add Table'}
        </button>
        {(editingTableId || pendingSlot) && (
          <button
            type="button"
            onClick={() => {
              setEditingTableId(null);
              setPendingSlot(null);
              setName('');
              setSeats('4');
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
      </form>

      {studioMode === 'floor_plan' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: Interactive Spatial Floor Plan Grid */}
          <div className="lg:col-span-7 xl:col-span-8 rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 text-xs">
                {(['All', 'Indoor', 'Garden', 'Bar counter', 'Take-away'] as AreaFilter[]).map(
                  (a) => {
                    const count =
                      a === 'All'
                        ? branchTables.length
                        : branchTables.filter((t) => t.area === a).length;
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAreaFilter(a)}
                        className={`rounded-md px-2.5 py-1 font-semibold whitespace-nowrap transition-colors ${
                          areaFilter === a
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {a} ({count})
                      </button>
                    );
                  }
                )}
              </div>

              {selectedTable && (
                <button
                  type="button"
                  data-testid="floor-plan-move-toggle"
                  onClick={() => setMovingMode((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                    movingMode
                      ? 'border-amber-500 bg-amber-50 text-amber-950'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Move className="h-3.5 w-3.5" />
                  {movingMode
                    ? `Tap empty slot to move ${selectedTable.name}`
                    : `Reposition ${selectedTable.name}`}
                </button>
              )}
            </div>

            {movingMode && selectedTable && (
              <div
                role="status"
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 flex items-center justify-between gap-2"
              >
                <span>
                  Select any empty floor slot below to move <strong>{selectedTable.name}</strong>.
                </span>
                <button
                  type="button"
                  onClick={() => setMovingMode(false)}
                  className="font-semibold underline"
                >
                  Done
                </button>
              </div>
            )}

            <div className="overflow-x-auto pb-1">
              <div
                data-testid="tables-floor-plan-grid"
                className="min-w-[560px] rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2"
              >
                {/* Column coordinate headers */}
                <div className="grid grid-cols-6 gap-2 text-center text-[11px] font-mono font-semibold text-slate-400">
                  {Array.from({ length: floorGrid.cols }, (_, cIdx) => (
                    <div key={cIdx}>Col {cIdx + 1}</div>
                  ))}
                </div>

                {/* Grid Rows */}
                <div className="space-y-2">
                  {floorGrid.cells.map((rowCells, rIdx) => (
                    <div key={rIdx} className="grid grid-cols-6 gap-2">
                      {rowCells.map((table, cIdx) => {
                        const col = cIdx + 1;
                        const row = rIdx + 1;
                        if (!table) {
                          const isPendingTarget =
                            pendingSlot?.col === col && pendingSlot?.row === row;
                          return (
                            <button
                              key={`slot-${row}-${col}`}
                              type="button"
                              data-testid="floor-plan-empty-slot"
                              aria-label={`Empty floor slot Row ${row} Column ${col}`}
                              onClick={() => handlePlaceTableAtSlot(col, row)}
                              className={`h-24 rounded-lg border border-dashed flex flex-col items-center justify-center gap-1 text-[11px] transition-colors ${
                                movingMode
                                  ? 'border-amber-400 bg-amber-50/60 text-amber-900 hover:bg-amber-100/70'
                                  : isPendingTarget
                                    ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                                    : 'border-slate-300 bg-white/50 text-slate-400 hover:border-slate-400 hover:text-slate-600'
                              }`}
                            >
                              <span className="font-mono text-[10px]">
                                R{row}·C{col}
                              </span>
                              <span className="font-medium">
                                {movingMode ? 'Move Here' : isPendingTarget ? 'Selected' : '+ Slot'}
                              </span>
                            </button>
                          );
                        }

                        const isSelected = selectedTable?.id === table.id;
                        const qrSlug = getTableQrCodeSlug(table);
                        const qrActive = table.qrEnabled !== false;
                        const statusClass =
                          table.status === 'ready'
                            ? 'border-emerald-400 bg-emerald-50/70'
                            : table.status === 'occupied'
                              ? 'border-amber-300 bg-amber-50/60'
                              : 'border-slate-200 bg-white';

                        return (
                          <button
                            key={table.id}
                            type="button"
                            data-testid="floor-plan-table-tile"
                            data-table-id={table.id}
                            aria-pressed={isSelected}
                            onClick={() => {
                              setSelectedTableId(table.id);
                              setMovingMode(false);
                            }}
                            className={`h-24 rounded-lg border p-2 text-left flex flex-col justify-between transition-all ${statusClass} ${
                              isSelected
                                ? 'ring-2 ring-emerald-800 border-emerald-800'
                                : 'hover:border-slate-400'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="font-bold text-sm text-slate-900 truncate">
                                {table.name}
                              </span>
                              <span
                                title={qrActive ? `QR: ${qrSlug}` : 'QR disabled'}
                                className={`inline-flex items-center gap-0.5 text-[10px] font-mono ${
                                  qrActive ? 'text-emerald-800' : 'text-slate-400'
                                }`}
                              >
                                <QrCode className="h-3 w-3" />
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-600 truncate">
                              {table.area}
                            </div>

                            <div className="flex items-center justify-between text-[11px] tabular-nums">
                              <span className="inline-flex items-center gap-1 text-slate-600">
                                <Users className="h-3 w-3" />
                                {table.seats}
                              </span>
                              <span
                                className={`capitalize font-semibold ${
                                  table.status === 'ready'
                                    ? 'text-emerald-800'
                                    : table.status === 'occupied'
                                      ? 'text-amber-800'
                                      : 'text-slate-500'
                                }`}
                              >
                                {table.status}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1">
              <span>
                Click any table tile to assign or preview its QR code · Click an empty slot to add or reposition a table
              </span>
              <span className="font-mono tabular-nums">
                {floorGrid.cols}×{floorGrid.rows} grid
              </span>
            </div>
          </div>

          {/* Right: QR Assignment & Live Guest Self-Order Preview */}
          <div
            data-testid="tables-qr-inspector"
            className="lg:col-span-5 xl:col-span-4 rounded-xl border border-slate-200 bg-white p-4 space-y-4 text-xs"
          >
            {selectedTable ? (
              <>
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <div className="text-[11px] text-slate-500">
                      Selected Table · {selectedTable.area} · {selectedTable.seats} seats
                    </div>
                    <h2 className="text-base font-bold text-slate-900 mt-0.5">
                      {selectedTable.name} — QR Assignment
                    </h2>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTableId(selectedTable.id);
                        setName(selectedTable.name);
                        setArea(selectedTable.area);
                        setSeats(String(selectedTable.seats));
                      }}
                      className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTable(selectedTable.id)}
                      className="rounded-md border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 inline-flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>

                {/* Live QR Code Preview */}
                <div
                  data-testid="table-qr-preview"
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col items-center text-center space-y-2.5"
                >
                  <div className="text-xs font-semibold text-slate-800">
                    {activeBranch.name} · Table {selectedTable.name}
                  </div>
                  <div className={qrEnabledDraft ? '' : 'opacity-40 grayscale'}>
                    <QrCodeBox
                      value={selectedQrUrl}
                      size={152}
                      label={`QR self-order code for ${selectedTable.name}`}
                    />
                  </div>
                  <div className="text-[11px] font-mono text-slate-600 break-all max-w-full">
                    {selectedQrUrl}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {qrEnabledDraft
                      ? 'Scan to open guest menu & self-order directly for this table'
                      : 'Guest QR self-ordering is paused for this table'}
                  </div>
                </div>

                {/* QR Code Assignment Form */}
                <form onSubmit={handleSaveQrAssignment} className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="table-qr-slug" className="font-semibold text-slate-700">
                        Assigned QR Code ID / Slug
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setQrSlugDraft(buildDefaultTableQrSlug(activeBranch.code, selectedTable.name))
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:underline"
                      >
                        <Sparkles className="h-3 w-3" /> Auto-code
                      </button>
                    </div>
                    <input
                      id="table-qr-slug"
                      data-testid="table-qr-slug-input"
                      value={qrSlugDraft}
                      onChange={(e) => setQrSlugDraft(e.target.value)}
                      placeholder="e.g. BKK1-T01 or PATIO-VIP"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                    />
                  </div>

                  <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 cursor-pointer">
                    <span className="font-semibold text-slate-700">
                      Enable guest self-ordering via QR
                    </span>
                    <input
                      type="checkbox"
                      checked={qrEnabledDraft}
                      onChange={(e) => setQrEnabledDraft(e.target.checked)}
                      className="h-4 w-4 accent-emerald-800"
                    />
                  </label>

                  {qrSavedFeedback && (
                    <div
                      role="status"
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900 font-medium"
                    >
                      {qrSavedFeedback}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <button
                      type="submit"
                      data-testid="save-table-qr-btn"
                      className="rounded-lg bg-emerald-800 px-3 py-2 font-semibold text-white hover:bg-emerald-900 whitespace-nowrap"
                    >
                      Save QR Assignment
                    </button>
                    <button
                      type="button"
                      data-testid="preview-table-qr-btn"
                      onClick={handlePreviewSelectedGuestQr}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Preview as Guest
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleCopyQrUrl()}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-700" /> Copied Guest Order Link
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy Self-Order URL
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div className="py-10 text-center space-y-2">
                <p className="font-semibold text-slate-800">No tables configured yet</p>
                <p className="text-slate-500">Add a table above or click any slot on the floor plan.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Print Cards Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 flex flex-col items-center text-center">
            <div className="text-xs font-bold text-emerald-950 mb-2">Counter Self-Order QR</div>
            <QrCodeBox value={`${origin}/?mode=qr&table=Counter`} size={112} />
            <div className="mt-2 text-[11px] text-emerald-800">Scan at counter to skip the line</div>
          </div>

          {filteredTables.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col items-center text-center"
            >
              <div className="w-full flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-900">
                  <Grid2x2 className="h-3.5 w-3.5 text-emerald-800" />
                  {t.name}
                </span>
                <span className="text-[11px] text-slate-500">
                  {t.area} · {t.seats} seats
                </span>
              </div>
              <QrCodeBox value={buildTableQrUrl(origin, t)} size={112} />
              <div className="mt-1.5 font-mono text-[10px] text-slate-500">
                QR: {getTableQrCodeSlug(t)}
              </div>
              <div className="no-print mt-2 w-full flex items-center justify-between text-[11px]">
                <span className="capitalize text-slate-500">{t.status}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTableId(t.id);
                    setStudioMode('floor_plan');
                  }}
                  className="text-emerald-800 font-semibold hover:underline"
                >
                  Inspect QR
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
