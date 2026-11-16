import { useState } from 'react';
import { ArrowLeft, Plus, Share2, CheckCircle2, Users } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { usdToKhr } from '../utils/posMath';

export function GroupOrderView() {
  const {
    state,
    activeBranch,
    createGroupSession,
    addGroupSessionItem,
    submitGroupSessionToPos,
    setExternalMode,
  } = usePos();

  const [activeSessionId, setActiveSessionId] = useState(state.groupSessions[0]?.id || '');
  const [tab, setTab] = useState<'pick' | 'whole'>('pick');
  const [participantName, setParticipantName] = useState('Dara');
  const [itemNote, setItemNote] = useState('');
  const [newGroupMode, setNewGroupMode] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [organiserName, setOrganiserName] = useState('');
  const [pickupTime, setPickupTime] = useState('12:30');
  const [copiedNotice, setCopiedNotice] = useState(false);

  const session = state.groupSessions.find((g) => g.id === activeSessionId) || state.groupSessions[0];
  const menu = state.menuItems.filter((m) => m.branchId === activeBranch.id && m.active);

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || !organiserName.trim()) return;
    const id = createGroupSession(groupName.trim(), organiserName.trim(), pickupTime);
    setActiveSessionId(id);
    setParticipantName(organiserName.trim());
    setNewGroupMode(false);
  };

  const groupTotal = session ? session.items.reduce((s, i) => s + i.unitPriceUsd * i.qty, 0) : 0;
  const participants = session
    ? Array.from(new Set(session.items.map((i) => i.participantName)))
    : [];

  return (
    <div className="min-h-screen bg-[#E9ECEA] py-4 px-3 flex justify-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden flex flex-col">
        <header className="bg-[#0A3D31] text-white px-4 py-3 flex items-center justify-between">
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
              <div className="text-[11px] text-emerald-200">
                {session ? `${session.groupName} · pick-up ${session.pickupTime}` : 'Group order'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setNewGroupMode((v) => !v)}
            className="rounded-lg bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-slate-900"
          >
            {newGroupMode ? 'Cancel' : '+ New group'}
          </button>
        </header>

        {newGroupMode ? (
          <form onSubmit={handleCreateGroup} className="p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900">Create a group order link</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Group name</label>
              <input
                type="text"
                required
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. BKK1 Marketing Lunch"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Your name (organiser)</label>
              <input
                type="text"
                required
                value={organiserName}
                onChange={(e) => setOrganiserName(e.target.value)}
                placeholder="e.g. Dara"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Pick-up time</label>
              <input
                type="time"
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-[#0B5D47] py-2.5 text-sm font-bold text-white"
            >
              Create group link
            </button>
          </form>
        ) : session ? (
          <div className="flex-1 flex flex-col">
            {/* Share link card */}
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
              <div className="text-xs">
                <div className="font-bold text-slate-900">Send this link to the whole group</div>
                <div className="text-slate-500">
                  Everyone picks their own dishes; {session.organiserName} sends one order.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(`${window.location.origin}/?mode=group&id=${session.id}`);
                  setCopiedNotice(true);
                  setTimeout(() => setCopiedNotice(false), 2000);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-[#0B5D47] px-3 py-1.5 text-xs font-semibold text-white shrink-0"
              >
                <Share2 className="h-3.5 w-3.5" />
                {copiedNotice ? 'Copied' : 'Share link'}
              </button>
            </div>

            {session.submitted ? (
              <div className="m-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950 flex items-start gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" />
                <div>
                  <div className="font-bold text-sm">
                    Sent to {activeBranch.name} · Order #{session.orderNumber}
                  </div>
                  <p className="mt-1">
                    One take-away order created with each person&apos;s name. Pay once at pick-up.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-3 border-b border-slate-100 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTab('pick')}
                    className={`rounded-lg py-2 text-xs font-bold ${
                      tab === 'pick' ? 'bg-[#0A3D31] text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Choose items
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('whole')}
                    className={`rounded-lg py-2 text-xs font-bold tabular-nums ${
                      tab === 'whole' ? 'bg-[#0A3D31] text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Whole group · {participants.length} · ${groupTotal.toFixed(2)}
                  </button>
                </div>

                {tab === 'pick' ? (
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[430px]">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={participantName}
                        onChange={(e) => setParticipantName(e.target.value)}
                        placeholder="Your name"
                        aria-label="Participant name"
                        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold"
                      />
                      <input
                        type="text"
                        value={itemNote}
                        onChange={(e) => setItemNote(e.target.value)}
                        placeholder="Note (e.g. less ice)"
                        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                      />
                    </div>

                    {menu.map((dish) => (
                      <div
                        key={dish.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-2.5"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">{dish.nameEn}</div>
                          <div className="text-[11px] text-emerald-800 font-semibold tabular-nums">
                            ${dish.priceUsd.toFixed(2)} ·{' '}
                            {usdToKhr(
                              dish.priceUsd,
                              activeBranch.exchangeRate,
                              activeBranch.rielRounding
                            ).toLocaleString()}{' '}
                            ៛
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            addGroupSessionItem(session.id, participantName || 'Guest', dish, itemNote)
                          }
                          className="h-8 w-8 rounded-full bg-[#0A3D31] text-white flex items-center justify-center shrink-0"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[430px]">
                    {participants.map((person) => {
                      const personItems = session.items.filter((i) => i.participantName === person);
                      const personTotal = personItems.reduce((s, i) => s + i.unitPriceUsd * i.qty, 0);
                      return (
                        <div key={person} className="rounded-xl border border-slate-200 p-3 text-xs">
                          <div className="flex items-center justify-between font-bold text-slate-900">
                            <span className="inline-flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5 text-emerald-700" />
                              {person}
                            </span>
                            <span className="tabular-nums">${personTotal.toFixed(2)}</span>
                          </div>
                          <ul className="mt-1.5 space-y-1 text-slate-600">
                            {personItems.map((pi) => (
                              <li key={pi.id}>
                                • {pi.qty}× {pi.nameEn}
                                {pi.note ? ` (${pi.note})` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="border-t border-slate-200 p-4">
                  <button
                    type="button"
                    disabled={session.items.length === 0}
                    onClick={() => submitGroupSessionToPos(session.id)}
                    className="w-full rounded-xl bg-[#0B5D47] py-3 text-xs font-bold text-white hover:bg-[#094A38] disabled:opacity-45 tabular-nums"
                  >
                    Send the order to the shop · {participants.length} people · ${groupTotal.toFixed(2)}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
