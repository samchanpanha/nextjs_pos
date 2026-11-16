import { useState } from 'react';
import { Volume2, VolumeX, ArrowLeft, ChefHat } from 'lucide-react';
import { usePos } from '../context/PosContext';

interface KdsViewProps {
  standalone?: boolean;
}

export function KdsView({ standalone = false }: KdsViewProps) {
  const { state, activeBranch, advanceKdsOrder, setExternalMode } = usePos();
  const [stationFilter, setStationFilter] = useState<'all' | 'kitchen' | 'bar'>('all');
  const [chimeOn, setChimeOn] = useState(true);

  const activeKdsOrders = state.orders.filter((o) => {
    if (o.branchId !== activeBranch.id) return false;
    if (o.status === 'paid' || o.status === 'voided' || o.status === 'served') return false;
    const sent = o.items.filter((i) => i.sentToKitchen && !i.voided);
    if (sent.length === 0) return false;
    if (stationFilter === 'all') return true;
    return sent.some((i) => i.station === stationFilter);
  });

  const getTicketColumn = (items: typeof activeKdsOrders[number]['items']): 'new' | 'cooking' | 'ready' | 'served' => {
    const relevant = items.filter(
      (i) => i.sentToKitchen && !i.voided && (stationFilter === 'all' || i.station === stationFilter)
    );
    if (relevant.every((i) => i.kdsStatus === 'served')) return 'served';
    if (relevant.every((i) => i.kdsStatus === 'ready' || i.kdsStatus === 'served')) return 'ready';
    if (relevant.some((i) => i.kdsStatus === 'cooking')) return 'cooking';
    return 'new';
  };

  const newOrders = activeKdsOrders.filter((o) => getTicketColumn(o.items) === 'new');
  const cookingOrders = activeKdsOrders.filter((o) => getTicketColumn(o.items) === 'cooking');
  const readyOrders = activeKdsOrders.filter((o) => getTicketColumn(o.items) === 'ready');

  const kitchenCount = activeKdsOrders.filter((o) =>
    o.items.some((i) => i.sentToKitchen && !i.voided && i.station === 'kitchen')
  ).length;
  const barCount = activeKdsOrders.filter((o) =>
    o.items.some((i) => i.sentToKitchen && !i.voided && i.station === 'bar')
  ).length;

  const renderColumn = (
    title: string,
    list: typeof activeKdsOrders,
    actionLabel: string,
    nextStatus: 'cooking' | 'ready' | 'served',
    btnStyle: string
  ) => (
    <div className="flex flex-col rounded-xl bg-[#11191E] border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 text-xs font-bold tracking-wide text-slate-300">
        <span>{title}</span>
        <span className="tabular-nums text-slate-400">{list.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {list.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">No tickets</div>
        ) : (
          list.map((ord) => {
            const elapsedMin = Math.max(
              1,
              Math.round((Date.now() - new Date(ord.createdAt).getTime()) / 60000)
            );
            const isLate = elapsedMin >= activeBranch.kdsLateMinutes;
            const isWarn = !isLate && elapsedMin >= activeBranch.kdsWarnMinutes;
            const headerColor = isLate
              ? 'bg-[#C93B2B]'
              : isWarn
                ? 'bg-[#B45309]'
                : 'bg-[#0F6E53]';
            const visibleLines = ord.items.filter(
              (i) =>
                i.sentToKitchen &&
                !i.voided &&
                (stationFilter === 'all' || i.station === stationFilter)
            );

            return (
              <div
                key={ord.id}
                className="rounded-xl border border-slate-700/80 bg-[#1B252C] overflow-hidden"
              >
                <div className={`${headerColor} px-3.5 py-2 flex items-center justify-between text-white`}>
                  <div>
                    <div className="text-sm font-bold">
                      #{ord.orderNumber} · {ord.tableName}
                    </div>
                    <div className="text-[11px] text-white/80">
                      Round {ord.currentRound > 1 ? ord.currentRound - 1 : 1} · {ord.channel.replace('_', ' ')}
                    </div>
                  </div>
                  <div className="text-base font-bold tabular-nums">{elapsedMin}&apos;</div>
                </div>

                <div className="p-3 space-y-2 text-xs text-slate-100">
                  {visibleLines.map((line) => (
                    <div key={line.id} className="flex items-start gap-2.5">
                      <span className="w-4 font-bold tabular-nums text-emerald-300 shrink-0">
                        {line.qty}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium">
                          {line.nameEn}
                          {line.optionLabel ? ` (${line.optionLabel})` : ''}
                        </div>
                        {line.note && (
                          <div className="text-[11px] text-amber-300">{line.note}</div>
                        )}
                        {line.orderedBy && (
                          <div className="text-[11px] text-sky-300">For: {line.orderedBy}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="px-3 pb-3">
                  <button
                    type="button"
                    onClick={() => advanceKdsOrder(ord.id, nextStatus)}
                    className={`w-full rounded-lg py-2 text-xs font-bold transition-colors ${btnStyle}`}
                  >
                    {actionLabel}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-full bg-[#0A1116] text-white p-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {standalone && (
            <button
              type="button"
              onClick={() => setExternalMode('pos')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to POS
            </button>
          )}
          <div className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-emerald-400" />
            <h1 className="text-base font-bold">{activeBranch.name} · Kitchen &amp; Bar</h1>
          </div>

          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStationFilter('all')}
              className={`px-3 py-1 rounded-md ${
                stationFilter === 'all' ? 'bg-white text-slate-900' : 'text-slate-300'
              }`}
            >
              All ({activeKdsOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setStationFilter('kitchen')}
              className={`px-3 py-1 rounded-md ${
                stationFilter === 'kitchen' ? 'bg-white text-slate-900' : 'text-slate-300'
              }`}
            >
              Kitchen · {kitchenCount}
            </button>
            <button
              type="button"
              onClick={() => setStationFilter('bar')}
              className={`px-3 py-1 rounded-md ${
                stationFilter === 'bar' ? 'bg-white text-slate-900' : 'text-slate-300'
              }`}
            >
              Bar · {barCount}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>
            Warn after {activeBranch.kdsWarnMinutes}&apos; · late after {activeBranch.kdsLateMinutes}&apos;
          </span>
          <button
            type="button"
            onClick={() => setChimeOn((c) => !c)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200"
          >
            {chimeOn ? <Volume2 className="h-3.5 w-3.5 text-emerald-400" /> : <VolumeX className="h-3.5 w-3.5" />}
            {chimeOn ? 'Chime on' : 'Muted'}
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[520px]">
        {renderColumn('NEW', newOrders, 'Start', 'cooking', 'bg-slate-900 hover:bg-slate-800 text-white border border-slate-700')}
        {renderColumn('COOKING', cookingOrders, 'Done', 'ready', 'bg-[#0F765B] hover:bg-[#0D624C] text-white')}
        {renderColumn('READY TO SERVE', readyOrders, 'Served', 'served', 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-600')}
      </div>
    </div>
  );
}
