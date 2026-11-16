import { useState } from 'react';
import { CalendarDays, Copy, Plus, Users, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { usePos } from '../context/PosContext';

export function ReservationsView() {
  const {
    state,
    activeBranch,
    createReservation,
    confirmReservation,
    payReservationDeposit,
    seatReservation,
    cancelReservation,
    setExternalMode,
  } = usePos();

  const [newOpen, setNewOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [dateTime, setDateTime] = useState('2026-11-16 19:30');
  const [guests, setGuests] = useState(4);
  const [tableId, setTableId] = useState('');
  const [depositUsd, setDepositUsd] = useState(activeBranch.defaultDepositUsd);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);

  const branchReservations = state.reservations.filter(
    (r) => r.branchId === activeBranch.id && r.status !== 'cancelled' && r.status !== 'no_show'
  );
  const branchTables = state.tables.filter((t) => t.branchId === activeBranch.id);

  // Detect clash if same table selected
  const clashingBooking = tableId
    ? branchReservations.find((r) => r.tableId === tableId && r.dateTime.slice(0, 13) === dateTime.slice(0, 13))
    : undefined;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim() || !phone.trim()) return;
    const tb = branchTables.find((t) => t.id === tableId);
    createReservation({
      branchId: activeBranch.id,
      guestName: guestName.trim(),
      phone: phone.trim(),
      dateTime,
      guests,
      tableId: tb?.id,
      tableName: tb?.name,
      depositUsd: Number(depositUsd) || 0,
      depositPaid: false,
      status: 'confirmed',
      note: note.trim() || undefined,
      source: 'staff',
    });
    setNewOpen(false);
    setGuestName('');
    setPhone('');
    setNote('');
  };

  const bookingLink = `${window.location.origin}/?mode=book`;
  const waitingCount = branchReservations.filter((r) => r.status === 'pending').length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Reservations</h1>
          <p className="text-xs text-slate-500">
            {branchReservations.length} bookings · {branchReservations.reduce((s, r) => s + r.guests, 0)} guests ·{' '}
            {waitingCount} waiting to confirm
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExternalMode('book')}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Preview online page
          </button>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B5D47] px-4 py-2 text-xs font-semibold text-white hover:bg-[#094A38]"
          >
            <Plus className="h-3.5 w-3.5" />
            New booking
          </button>
        </div>
      </div>

      {/* Online booking link strip */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="text-slate-600 truncate">
          Online booking link: <span className="font-mono text-slate-900">{bookingLink}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(bookingLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>

      {/* Reservations List */}
      <div className="space-y-3">
        {branchReservations.map((res) => (
          <div
            key={res.id}
            className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-4"
          >
            <div className="flex items-start gap-4">
              <div className="text-center shrink-0">
                <div className="text-sm font-bold text-slate-900 tabular-nums">
                  {res.dateTime.slice(11, 16) || '18:00'}
                </div>
                <div className="text-[11px] text-slate-400">{activeBranch.holdMinutes}&apos;</div>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">{res.guestName}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Users className="h-3 w-3" /> {res.guests}
                  </span>
                  {res.tableName && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {res.tableName}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {res.phone} · <span className="font-mono">{res.code}</span>
                  {res.source === 'online' ? ' · booked online' : ''}
                  {res.note ? ` · "${res.note}"` : ''}
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs font-medium">
                  <span
                    className={
                      res.status === 'pending'
                        ? 'text-amber-700'
                        : res.status === 'seated'
                          ? 'text-slate-500'
                          : 'text-emerald-700'
                    }
                  >
                    {res.status === 'pending'
                      ? 'Waiting to confirm'
                      : res.status === 'seated'
                        ? 'Seated'
                        : 'Confirmed'}
                  </span>
                  {res.depositUsd > 0 && (
                    <span className={res.depositPaid ? 'text-emerald-700' : 'text-amber-700'}>
                      Deposit ${res.depositUsd.toFixed(2)} · {res.depositPaid ? 'paid' : 'not paid'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              {res.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => confirmReservation(res.id)}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-white hover:bg-amber-600"
                >
                  Confirm
                </button>
              )}
              {res.depositUsd > 0 && !res.depositPaid && (
                <button
                  type="button"
                  onClick={() => payReservationDeposit(res.id)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                >
                  Take deposit
                </button>
              )}
              {res.status !== 'seated' && (
                <button
                  type="button"
                  onClick={() =>
                    seatReservation(res.id, res.tableId || branchTables.find((t) => t.status === 'free')?.id || branchTables[0]?.id)
                  }
                  className="rounded-lg bg-[#0B5D47] px-3 py-1.5 text-white hover:bg-[#094A38]"
                >
                  Guests arrived
                </button>
              )}
              <button
                type="button"
                onClick={() => cancelReservation(res.id, false)}
                className="rounded-lg px-2.5 py-1.5 text-slate-500 hover:text-red-600"
              >
                Cancel / no-show
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* New Booking Modal */}
      {newOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="New booking"
        >
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-3"
          >
            <h3 className="text-base font-bold text-slate-900">New table booking</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Guest name *</label>
                <input
                  type="text"
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone *</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date &amp; time</label>
                <input
                  type="text"
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Guests</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={guests}
                  onChange={(e) => setGuests(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Table (optional)</label>
                <select
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Assign on arrival</option>
                  {branchTables.map((tb) => (
                    <option key={tb.id} value={tb.id}>
                      {tb.name} ({tb.seats} seats)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deposit ($)</label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={depositUsd}
                  onChange={(e) => setDepositUsd(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {clashingBooking && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                Table clash: already held by <strong>{clashingBooking.guestName}</strong> at{' '}
                {clashingBooking.dateTime}.
              </div>
            )}

            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (e.g. window table, birthday)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0B5D47] px-4 py-2 text-xs font-semibold text-white"
              >
                Save booking
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function OnlineBookingView() {
  const { activeBranch, createReservation, setExternalMode } = usePos();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dateTime, setDateTime] = useState('2026-11-16 19:00');
  const [guests, setGuests] = useState(2);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    createReservation({
      branchId: activeBranch.id,
      guestName: name.trim(),
      phone: phone.trim(),
      dateTime,
      guests,
      depositUsd: activeBranch.defaultDepositUsd,
      depositPaid: false,
      status: 'pending',
      note: note.trim() || undefined,
      source: 'online',
    });
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#E9ECEA] py-6 px-4 flex justify-center items-center">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
        <header className="bg-[#0A3D31] text-white px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExternalMode('pos')}
              aria-label="Back to POS"
              className="rounded-md bg-white/10 p-1.5 hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="text-sm font-bold">{activeBranch.name}</div>
              <div className="text-[11px] text-emerald-200">{activeBranch.address}</div>
            </div>
          </div>
          <CalendarDays className="h-4 w-4 text-emerald-200" />
        </header>

        {submitted ? (
          <div className="p-6 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-emerald-700 mx-auto" />
            <h2 className="text-base font-bold text-slate-900">Booking request sent</h2>
            <p className="text-xs text-slate-600">
              Your table request for <strong>{guests} guests</strong> at <strong>{dateTime}</strong>{' '}
              is waiting for staff confirmation.
            </p>
            <button
              type="button"
              onClick={() => setExternalMode('pos')}
              className="w-full rounded-lg bg-[#0B5D47] py-2.5 text-xs font-bold text-white"
            >
              Return to POS Reservations
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900">Book a table online</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Your name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sophea Lim"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="012 345 678"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date &amp; time</label>
                <input
                  type="text"
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Guests</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={guests}
                  onChange={(e) => setGuests(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (e.g. birthday, window seat)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-[#0B5D47] py-2.5 text-sm font-bold text-white"
            >
              Send booking
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
