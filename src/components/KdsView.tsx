import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Volume2,
  VolumeX,
  ArrowLeft,
  ChefHat,
  Timer,
  Gauge,
  CheckCircle2,
  Clock,
  Zap,
  QrCode,
  Flame,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import { calculateKdsPrepMetrics } from '../utils/kdsMetrics';
import {
  classifyKdsTicketPriority,
  countNewPriorityOrders,
  isQrOriginatedOrder,
  sortKdsNewOrders,
  type KdsTicketColumn,
} from '../utils/kdsPriority';

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

  const getTicketColumn = (items: typeof activeKdsOrders[number]['items']): KdsTicketColumn => {
    const relevant = items.filter(
      (i) => i.sentToKitchen && !i.voided && (stationFilter === 'all' || i.station === stationFilter)
    );
    if (relevant.every((i) => i.kdsStatus === 'served')) return 'served';
    if (relevant.every((i) => i.kdsStatus === 'ready' || i.kdsStatus === 'served')) return 'ready';
    if (relevant.some((i) => i.kdsStatus === 'new')) return 'new';
    if (relevant.some((i) => i.kdsStatus === 'cooking')) return 'cooking';
    return 'new';
  };

  const rawNewOrders = activeKdsOrders.filter((o) => getTicketColumn(o.items) === 'new');
  const priorityOpts = useMemo(
    () => ({
      warnMinutes: activeBranch.kdsWarnMinutes,
      lateMinutes: activeBranch.kdsLateMinutes,
      nowMs,
    }),
    [activeBranch.kdsWarnMinutes, activeBranch.kdsLateMinutes, nowMs]
  );
  const newOrders = useMemo(
    () => sortKdsNewOrders(rawNewOrders, priorityOpts),
    [rawNewOrders, priorityOpts]
  );
  const newPrioritySummary = useMemo(
    () => countNewPriorityOrders(newOrders, priorityOpts),
    [newOrders, priorityOpts]
  );
  const cookingOrders = activeKdsOrders.filter((o) => getTicketColumn(o.items) === 'cooking');
  const readyOrders = activeKdsOrders.filter((o) => getTicketColumn(o.items) === 'ready');

  const knownNewIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const currentIds = new Set(newOrders.map((o) => o.id));
    if (knownNewIdsRef.current === null) {
      knownNewIdsRef.current = currentIds;
      return;
    }
    let hasBrandNew = false;
    for (const id of currentIds) {
      if (!knownNewIdsRef.current.has(id)) {
        hasBrandNew = true;
        break;
      }
    }
    knownNewIdsRef.current = currentIds;
    if (hasBrandNew && chimeOn) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(1174, ctx.currentTime + 0.12);
          gain.gain.setValueAtTime(0.06, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.26);
        }
      } catch {
        // Ignore audio blocked errors in automated/muted environments
      }
    }
  }, [newOrders, chimeOn]);

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
    columnKey: KdsTicketColumn,
    title: string,
    list: typeof activeKdsOrders,
    actionLabel: string,
    nextStatus: 'cooking' | 'ready' | 'served',
    btnStyle: string
  ) => (
    <div className="flex flex-col rounded-xl bg-[#11191E] border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 text-xs font-bold tracking-wide text-slate-300">
        <div className="flex items-center gap-2">
          <span>{title}</span>
          {columnKey === 'new' && newPrioritySummary.highPriorityCount > 0 && (
            <span
              data-testid="kds-new-priority-count"
              className="inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 tabular-nums"
            >
              <Zap className="h-2.5 w-2.5" />
              {newPrioritySummary.highPriorityCount} Priority
            </span>
          )}
        </div>
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
            const priority = classifyKdsTicketPriority(ord, {
              ...priorityOpts,
              column: columnKey,
            });
            const isQrOrigin = isQrOriginatedOrder(ord);

            const cardBorderClass = priority.isPriorityNew
              ? priority.tier === 'overdue'
                ? 'border-red-500/80 ring-1 ring-red-500/40'
                : priority.tier === 'qr_rush' || priority.tier === 'qr'
                  ? 'border-amber-400/85 ring-2 ring-amber-400/35'
                  : priority.tier === 'just_in'
                    ? 'border-emerald-400/80 ring-2 ring-emerald-400/30'
                    : 'border-slate-700/80'
              : 'border-slate-700/80';

            const priorityPillClass =
              priority.tier === 'overdue'
                ? 'bg-red-500/15 text-red-200 border-red-500/40'
                : priority.tier === 'qr_rush' || priority.tier === 'qr'
                  ? 'bg-amber-400/15 text-amber-200 border-amber-400/45'
                  : priority.tier === 'just_in'
                    ? 'bg-emerald-400/15 text-emerald-200 border-emerald-400/40'
                    : priority.tier === 'warn'
                      ? 'bg-amber-500/15 text-amber-200 border-amber-500/35'
                      : 'bg-slate-800/90 text-slate-200 border-slate-600/70';

            return (
              <div
                key={ord.id}
                data-testid={`kds-ticket-${ord.orderNumber}`}
                className={`rounded-xl border bg-[#1B252C] overflow-hidden transition-all ${cardBorderClass}`}
              >
                <div className={`${headerColor} px-3.5 py-2 flex items-center justify-between text-white`}>
                  <div className="min-w-0">
                    <div className="text-sm font-bold flex items-center gap-1.5 flex-wrap">
                      <span>
                        #{ord.orderNumber} · {ord.tableName}
                      </span>
                      {isQrOrigin && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                          <QrCode className="h-2.5 w-2.5" />
                          QR
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-white/80">
                      Round {ord.currentRound > 1 ? ord.currentRound - 1 : 1} · {ord.channel.replace('_', ' ')}
                    </div>
                  </div>
                  <div className="text-base font-bold tabular-nums shrink-0">{elapsedMin}&apos;</div>
                </div>

                {priority.isPriorityNew && (
                  <div
                    data-testid="kds-priority-badge"
                    className={`mx-3 mt-2.5 flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${priorityPillClass}`}
                  >
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      {(priority.tier === 'qr_rush' || priority.tier === 'just_in' || priority.tier === 'overdue') && (
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span
                            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                              priority.tier === 'overdue'
                                ? 'bg-red-400'
                                : priority.tier === 'qr_rush'
                                  ? 'bg-amber-300'
                                  : 'bg-emerald-300'
                            }`}
                          />
                          <span
                            className={`relative inline-flex rounded-full h-2 w-2 ${
                              priority.tier === 'overdue'
                                ? 'bg-red-400'
                                : priority.tier === 'qr_rush'
                                  ? 'bg-amber-300'
                                  : 'bg-emerald-400'
                            }`}
                          />
                        </span>
                      )}
                      {priority.tier === 'overdue' ? (
                        <Flame className="h-3.5 w-3.5 shrink-0" />
                      ) : priority.isQrOrigin ? (
                        <Zap className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Zap className="h-3 w-3 shrink-0" />
                      )}
                      <span className="truncate tracking-wide">{priority.label}</span>
                    </span>
                    <span className="text-[10px] font-semibold opacity-85 shrink-0">
                      {priority.sublabel}
                    </span>
                  </div>
                )}

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
        <div className="rounded-xl border border-slate-800 bg-[#11191E] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">Average Preparation Time</span>
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
            className={`self-start sm:self-center shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${slaBadgeStyle}`}
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
        {renderColumn('new', 'NEW', newOrders, 'Start', 'cooking', 'bg-slate-900 hover:bg-slate-800 text-white border border-slate-700')}
        {renderColumn('cooking', 'COOKING', cookingOrders, 'Done', 'ready', 'bg-[#0F765B] hover:bg-[#0D624C] text-white')}
        {renderColumn('ready', 'READY TO SERVE', readyOrders, 'Served', 'served', 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-600')}
      </div>
    </div>
  );
}
