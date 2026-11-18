import { useEffect, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Clock,
  Send,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import type { BranchConfig } from '../types/pos';

interface TelegramBotSettingsPanelProps {
  branch: BranchConfig;
  shopName: string;
  applyBranchPartial: (partial: Partial<BranchConfig>) => void;
}

export function TelegramBotSettingsPanel({
  branch,
  shopName,
  applyBranchPartial,
}: TelegramBotSettingsPanelProps) {
  const [testing, setTesting] = useState(false);
  const [sendResult, setSendResult] = useState<{
    ok: boolean;
    deliveredViaTelegramApi?: boolean;
    message: string;
  } | null>(null);

  const alerts = branch.telegramAlerts ?? {
    dailyClose: true,
    lowStock: true,
    highVoidDiscount: true,
  };

  const botHandle = branch.telegramBotHandle || '@StorePosBot';
  const scheduleTime = branch.telegramScheduleTime || '22:30';

  const handleSendTest = async () => {
    const channel = (branch.telegramChannel || '').trim();
    if (!channel) {
      setSendResult({
        ok: false,
        message: 'Enter a target Telegram channel or chat ID (e.g. @lotuscafebkk1) first.',
      });
      return;
    }
    setTesting(true);
    setSendResult(null);
    try {
      const sampleMessage = `[${branch.name}] Test Telegram Alert\nStore: ${shopName}\nBot: ${botHandle}\nScheduled Z-Report: ${scheduleTime}`;
      const res = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          botHandle,
          branchName: branch.name,
          message: sampleMessage,
          isTest: true,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        deliveredViaTelegramApi?: boolean;
        notice?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setSendResult({
          ok: false,
          message: data.error || 'Failed to dispatch test Telegram message.',
        });
        return;
      }
      applyBranchPartial({ telegramBotConnected: true });
      setSendResult({
        ok: true,
        deliveredViaTelegramApi: data.deliveredViaTelegramApi,
        message: data.notice || `Test report validated for ${channel}.`,
      });
    } catch {
      setSendResult({
        ok: false,
        message: 'Unable to reach /api/telegram/send on the server.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      data-testid="settings-telegram-panel"
      className="rounded-xl border border-slate-200 bg-white p-5 space-y-5 text-xs"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Bot className="h-4 w-4 text-emerald-800" />
            Telegram Bot Integration — {branch.name}
          </h2>
          <p className="text-slate-500 mt-0.5">
            Connect your store&apos;s Telegram bot handle and channel ID to automate daily Z-reports and staff alerts.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-800 cursor-pointer">
          <input
            type="checkbox"
            data-testid="settings-telegram-enabled"
            checked={branch.telegramBotConnected}
            onChange={(e) => applyBranchPartial({ telegramBotConnected: e.target.checked })}
            className="h-4 w-4 accent-emerald-800"
          />
          <span>{branch.telegramBotConnected ? 'Bot Active' : 'Bot Paused'}</span>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="tg-bot-handle" className="block font-semibold text-slate-700 mb-1">
            Bot Display Handle
          </label>
          <input
            id="tg-bot-handle"
            data-testid="settings-telegram-bot-handle"
            value={branch.telegramBotHandle ?? ''}
            onChange={(e) => applyBranchPartial({ telegramBotHandle: e.target.value })}
            placeholder="@LotusCafePosBot"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Username of the bot added as admin to your group or channel.
          </p>
        </div>

        <div>
          <label htmlFor="tg-channel-id" className="block font-semibold text-slate-700 mb-1">
            Target Channel / Group Chat ID
          </label>
          <input
            id="tg-channel-id"
            data-testid="settings-telegram-channel"
            value={branch.telegramChannel}
            onChange={(e) => applyBranchPartial({ telegramChannel: e.target.value })}
            placeholder="@lotuscafebkk1 or -1001234567890"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Destination channel username or numeric chat ID.
          </p>
        </div>

        <div>
          <label htmlFor="tg-schedule-time" className="block font-semibold text-slate-700 mb-1">
            Daily Close Report Time
          </label>
          <input
            id="tg-schedule-time"
            type="time"
            value={scheduleTime}
            onChange={(e) => applyBranchPartial({ telegramScheduleTime: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono tabular-nums"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Local branch time for nightly sales &amp; drawer Z-report.
          </p>
        </div>
      </div>

      {/* Alert Triggers */}
      <div className="space-y-2">
        <div className="font-semibold text-slate-800">Automated Telegram Alert Triggers</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            [
              ['dailyClose', 'Daily Close Z-Report', 'Paid bills, net USD/KHR, variance & top sellers'],
              ['lowStock', 'Critical Low-Stock Alerts', 'Notify buyers when ingredients hit min level'],
              ['highVoidDiscount', 'Voids & Large Discounts', 'Immediate audit ping on voided tickets'],
            ] as const
          ).map(([key, title, hint]) => (
            <label
              key={key}
              className="rounded-lg border border-slate-200 p-3 flex items-start gap-2.5 cursor-pointer hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={Boolean(alerts[key])}
                onChange={(e) =>
                  applyBranchPartial({
                    telegramAlerts: {
                      ...alerts,
                      [key]: e.target.checked,
                    },
                  })
                }
                className="mt-0.5 h-4 w-4 accent-emerald-800"
              />
              <div>
                <div className="font-semibold text-slate-900">{title}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Live Preview & Test Dispatch */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="font-semibold text-slate-900">
            Server-side Bot Delivery Ready
          </div>
          <div className="text-[11px] text-slate-600">
            Dispatches securely through <span className="font-mono">/api/telegram/send</span> using your server <span className="font-mono">TELEGRAM_BOT_TOKEN</span> secret when configured.
          </div>
        </div>
        <button
          type="button"
          data-testid="settings-telegram-test-btn"
          disabled={testing}
          onClick={() => void handleSendTest()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white hover:bg-emerald-900 disabled:opacity-60 whitespace-nowrap"
        >
          <Send className="h-3.5 w-3.5" />
          {testing ? 'Sending Test...' : 'Send Test Message'}
        </button>
      </div>

      {sendResult && (
        <div
          role="status"
          data-testid="settings-telegram-status"
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
            sendResult.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          {sendResult.ok ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
          )}
          <span>{sendResult.message}</span>
        </div>
      )}
    </div>
  );
}

interface AiCapabilitiesSettingsPanelProps {
  branch: BranchConfig;
  applyBranchPartial: (partial: Partial<BranchConfig>) => void;
}

export function AiCapabilitiesSettingsPanel({
  branch,
  applyBranchPartial,
}: AiCapabilitiesSettingsPanelProps) {
  const [healthStatus, setHealthStatus] = useState<{
    checked: boolean;
    geminiConfigured: boolean;
    telegramConfigured: boolean;
  }>({ checked: false, geminiConfigured: false, telegramConfigured: false });

  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((r) => r.json())
      .then((d: { geminiConfigured?: boolean; telegramConfigured?: boolean }) => {
        if (active) {
          setHealthStatus({
            checked: true,
            geminiConfigured: Boolean(d.geminiConfigured),
            telegramConfigured: Boolean(d.telegramConfigured),
          });
        }
      })
      .catch(() => {
        if (active) setHealthStatus((prev) => ({ ...prev, checked: true }));
      });
    return () => {
      active = false;
    };
  }, []);

  const aiFeatures = branch.aiFeatures ?? {
    shiftOptimization: true,
    stockMonitor: true,
    revenueForecast: true,
    menuPairings: true,
  };

  return (
    <div
      data-testid="settings-ai-panel"
      className="rounded-xl border border-slate-200 bg-white p-5 space-y-5 text-xs"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-800" />
            AI Operations &amp; Automation — {branch.name}
          </h2>
          <p className="text-slate-500 mt-0.5">
            Enable or pause Gemini-powered assistant modules for this branch. Server credentials are managed externally in Settings &gt; Secrets.
          </p>
        </div>

        <div className="text-right">
          <div className="text-[11px] text-slate-500">Server AI Engine</div>
          <div
            data-testid="settings-ai-server-status"
            className={`font-semibold ${
              !healthStatus.checked
                ? 'text-slate-500'
                : healthStatus.geminiConfigured
                  ? 'text-emerald-800'
                  : 'text-amber-800'
            }`}
          >
            {!healthStatus.checked
              ? 'Checking server status...'
              : healthStatus.geminiConfigured
                ? 'Connected via Server Secret'
                : 'Managed in Settings > Secrets'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(
          [
            [
              'shiftOptimization',
              'AI Shift Staffing Optimization',
              'Forecasts rush hours & suggests headcount per role in Shift & Drawer',
            ],
            [
              'stockMonitor',
              'AI Stock Depletion Monitor',
              'Predicts ingredient runout dates and recommends purchase orders',
            ],
            [
              'revenueForecast',
              'AI 7-Day Revenue Forecast & Q&A',
              'Owner natural-language Q&A and holiday sales projections in Reports',
            ],
            [
              'menuPairings',
              'AI Suggested Pairings in Sell',
              'Real-time add-on and drink upsell prompts for cashiers',
            ],
          ] as const
        ).map(([key, title, desc]) => (
          <label
            key={key}
            className="rounded-lg border border-slate-200 p-3.5 flex items-start justify-between gap-3 cursor-pointer hover:bg-slate-50"
          >
            <div>
              <div className="font-semibold text-slate-900">{title}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
            </div>
            <input
              type="checkbox"
              checked={Boolean(aiFeatures[key])}
              onChange={(e) =>
                applyBranchPartial({
                  aiFeatures: {
                    ...aiFeatures,
                    [key]: e.target.checked,
                  },
                })
              }
              className="mt-0.5 h-4 w-4 accent-emerald-800 shrink-0"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
