import { useEffect, useMemo, useState } from 'react';
import { Volume2, VolumeX, ArrowLeft, ChefHat, Timer, Gauge, CheckCircle2, Clock } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { calculateKdsPrepMetrics } from '../utils/kdsMetrics';

interface KdsViewProps {
  standalone?: boolean;
}

export function KdsView({ standalone = false }: KdsViewProps) {
  const { state, activeBranch, advanceKdsOrder, setExternalMode } = usePos();
  const [stationFilter, setStationFilter] = useState<'all' | 'kitchen' | 'bar'>('all');
  const [chimeOn, setChimeOn] = useState(true);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const branchOrders = useMemo(
    () => state.orders.filter((o) => o.branchId === activeBranch.id),
    [state.orders, activeBranch.id]
  );

  const prepMetrics = useMemo(
    () =>
      calculateKdsPrepMetrics({
        orders: branchOrders,
        branchId: activeBranch.id,
        stationFilter,
        warnMinutes: activeBranch.kdsWarnMinutes,
        lateMinutes: activeBranch.kdsLateMinutes,
        nowMs,
      }),
    [branchOrders, activeBranch.id, stationFilter, activeBranch.kdsWarnMinutes, activeBranch.kdsLateMinutes, nowMs]
  );

  const activeKdsOrders = branchOrders.filter((o) => {
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

  const slaBadgeStyle =
    prepMetrics.slaHealth === 'fast'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : prepMetrics.slaHealth === 'warning'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : prepMetrics.slaHealth === 'slow'
          ? 'bg-red-500/15 text-red-300 border-red-500/30'
          : 'bg-slate-800 text-slate-400 border-slate-700';

  const slaBadgeLabel =
    prepMetrics.slaHealth === 'fast'
      ? 'Optimal speed'
      : prepMetrics.slaHealth === 'warning'
        ? 'Watch pace'
        : prepMetrics.slaHealth === 'slow'
          ? 'Slow queue'
          : 'No data yet';

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
            const submittedMs = Date.parse(ord.kdsSubmittedAt || ord.createdAt);
            const elapsedMin = Math.max(
              1,
              Math.round((nowMs - (Number.isFinite(submittedMs) ? submittedMs : nowMs)) / 60000)
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
                    onClick={() => {
                      advanceKdsOrder(ord.id, nextStatus);
                      setNowMs(Date.now());
                    }}
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
        <div className="flex flex-wrap items-center gap-3">
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

      {/* Average Preparation Time & Kitchen Throughput Strip */}
      <div
        data-testid="kds-avg-prep-metric"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <div className="rounded-xl border border-slate-800 bg-[#11191E] px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5 text-emerald-400" />
              Average Preparation Time
            </div>
            <div
              data-testid="kds-avg-prep-value"
              className="mt-1 text-xl font-bold text-white tabular-nums"
            >
              {prepMetrics.formattedAvgPrepTime}
            </div>
            <div className="text-[11px] text-slate-400">
              {prepMetrics.completedCount > 0
                ? `${prepMetrics.avgPrepMinutes?.toFixed(1)} min avg · Target ≤ ${activeBranch.kdsLateMinutes}m`
                : 'Complete a ticket to measure'}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${slaBadgeStyle}`}
          >
            {slaBadgeLabel}
          </span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#11191E] px-4 py-3">
          <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            Completed Tickets
          </div>
          <div
            data-testid="kds-completed-count"
            className="mt-1 text-xl font-bold text-white tabular-nums"
          >
            {prepMetrics.completedCount}
          </div>
          <div className="text-[11px] text-slate-400">
            {prepMetrics.withinTargetPct !== null
              ? `${prepMetrics.withinTargetPct}% within ${activeBranch.kdsLateMinutes}m target`
              : 'Submission to ready'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#11191E] px-4 py-3">
          <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5 text-sky-400" />
            Fastest / Slowest Prep
          </div>
          <div className="mt-1 text-xl font-bold text-white tabular-nums">
            {prepMetrics.fastestMinutes !== null && prepMetrics.slowestMinutes !== null
              ? `${prepMetrics.fastestMinutes.toFixed(1)}m / ${prepMetrics.slowestMinutes.toFixed(1)}m`
              : '—'}
          </div>
          <div className="text-[11px] text-slate-400">
            {stationFilter === 'all' ? 'All stations' : `${stationFilter} station only`}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#11191E] px-4 py-3">
          <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            Active Queue Avg Wait
          </div>
          <div className="mt-1 text-xl font-bold text-white tabular-nums">
            {prepMetrics.activeAvgWaitMinutes !== null
              ? `${prepMetrics.activeAvgWaitMinutes.toFixed(1)} min`
              : '0.0 min'}
          </div>
          <div className="text-[11px] text-slate-400">
            {prepMetrics.activeCount} {prepMetrics.activeCount === 1 ? 'ticket' : 'tickets'} in progress
          </div>
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
