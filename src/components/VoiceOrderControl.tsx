import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Mic,
  MicOff,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type { LanguageCode, MenuItem } from '../types/pos';
import {
  parseVoiceOrderTranscript,
  type VoiceMatchedOrderItem,
} from '../utils/voiceOrderParser';
import {
  buildVoiceReviewDrafts,
  summarizeVoiceReviewDrafts,
} from '../utils/voiceCommandReview';

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: BrowserSpeechRecognitionAlternative;
}

interface BrowserSpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: BrowserSpeechRecognitionResult;
  };
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((this: BrowserSpeechRecognition, ev: Event) => unknown) | null;
  onresult: ((this: BrowserSpeechRecognition, ev: BrowserSpeechRecognitionEvent) => unknown) | null;
  onerror: ((this: BrowserSpeechRecognition, ev: BrowserSpeechRecognitionErrorEvent) => unknown) | null;
  onend: ((this: BrowserSpeechRecognition, ev: Event) => unknown) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

const VOICE_EXAMPLES = [
  '2 iced coffee less ice and 1 beef lok lak',
  '1 large matcha latte no sugar, 2 spring rolls',
  '2 banh mi and 1 kuy teav special',
];

interface VoiceOrderControlProps {
  menuItems: MenuItem[];
  language: LanguageCode;
  activeOrderLabel?: string;
  onApplyMatchedItems: (items: VoiceMatchedOrderItem[]) => void;
}

export function VoiceOrderControl({
  menuItems,
  language,
  activeOrderLabel,
  onApplyMatchedItems,
}: VoiceOrderControlProps) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [micStatusNote, setMicStatusNote] = useState<string | null>(null);
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(() => new Set());

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const committedTranscriptRef = useRef<string>('');

  const speechSupported = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);

  const speechLang =
    language === 'kh' ? 'km-KH' : language === 'vi' ? 'vi-VN' : 'en-US';

  const combinedTranscript = useMemo(() => {
    if (!interimText.trim()) return transcript;
    return [transcript.trim(), interimText.trim()].filter(Boolean).join(' ');
  }, [transcript, interimText]);

  const parsed = useMemo(
    () => parseVoiceOrderTranscript(combinedTranscript, menuItems),
    [combinedTranscript, menuItems]
  );

  const stagedDrafts = useMemo(
    () => buildVoiceReviewDrafts(parsed.matched, qtyOverrides, removedKeys),
    [parsed.matched, qtyOverrides, removedKeys]
  );

  const reviewSummary = useMemo(
    () => summarizeVoiceReviewDrafts(stagedDrafts),
    [stagedDrafts]
  );

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore stop errors when already stopped
      }
      recognitionRef.current = null;
    }
    setListening(false);
    setInterimText('');
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore cleanup abort errors
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopListening();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open]);

  const resetTranscriptEdits = () => {
    setQtyOverrides({});
    setRemovedKeys(new Set());
  };

  const startListening = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setMicStatusNote(
        'Browser microphone speech recognition is unavailable here — type or dictate spoken items below.'
      );
      return;
    }

    stopListening();
    setMicStatusNote(null);
    committedTranscriptRef.current = transcript.trim();

    try {
      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = speechLang;

      recognition.onstart = () => {
        setListening(true);
        setMicStatusNote(null);
      };

      recognition.onresult = (event) => {
        let finalChunk = '';
        let interimChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result[0]?.transcript || '';
          if (result.isFinal) {
            finalChunk += `${text} `;
          } else {
            interimChunk += `${text} `;
          }
        }
        if (finalChunk.trim()) {
          const next = [committedTranscriptRef.current, finalChunk.trim()]
            .filter(Boolean)
            .join(' ');
          committedTranscriptRef.current = next;
          setTranscript(next);
          resetTranscriptEdits();
        }
        setInterimText(interimChunk.trim());
      };

      recognition.onerror = (event) => {
        setListening(false);
        setInterimText('');
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setMicStatusNote(
            'Microphone access blocked. Allow mic permission or enter spoken text below.'
          );
        } else if (event.error === 'audio-capture') {
          setMicStatusNote(
            'No microphone detected on this device. Enter or paste spoken phrases below.'
          );
        } else if (event.error === 'network') {
          setMicStatusNote(
            'Browser speech engine requires internet. Offline? Type quick item names below.'
          );
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          setMicStatusNote(`Speech capture paused (${event.error}). Edit transcript below.`);
        }
      };

      recognition.onend = () => {
        setListening(false);
        setInterimText('');
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setListening(false);
      setMicStatusNote(
        'Unable to start microphone capture. Type or paste spoken menu items below.'
      );
    }
  };

  const handleConfirmAdd = () => {
    if (stagedDrafts.length === 0) return;
    stopListening();
    onApplyMatchedItems(stagedDrafts);
    setTranscript('');
    setInterimText('');
    committedTranscriptRef.current = '';
    setMicStatusNote(null);
    resetTranscriptEdits();
    setOpen(false);
  };

  const handleCloseOverlay = () => {
    stopListening();
    setOpen(false);
  };

  const getLocalizedName = (item: MenuItem) => {
    if (language === 'kh' && item.nameKh) return item.nameKh;
    if (language === 'vi' && item.nameVi) return item.nameVi;
    return item.nameEn;
  };

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="sell-voice-order-btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? handleCloseOverlay() : setOpen(true))}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
          listening
            ? 'border-rose-400 bg-rose-50 text-rose-800'
            : open
              ? 'border-emerald-700 bg-emerald-50 text-emerald-950'
              : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-700 hover:bg-emerald-50/60'
        }`}
      >
        <Mic className={`h-3.5 w-3.5 ${listening ? 'text-rose-600 animate-pulse' : 'text-emerald-700'}`} />
        <span>{listening ? 'Listening...' : 'Voice Command'}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-4 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) handleCloseOverlay();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Voice Command Feedback Overlay"
            data-testid="sell-voice-overlay"
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Dark Emerald Visual Feedback Header */}
            <div className="bg-[#0A3D31] text-white px-4 py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${
                    listening ? 'bg-rose-500 animate-pulse' : 'bg-white/15'
                  }`}
                >
                  <Volume2 className="h-4.5 w-4.5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold truncate">Voice Command</h3>
                    <span
                      data-testid="sell-voice-status-pill"
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        listening
                          ? 'bg-rose-500 text-white'
                          : reviewSummary.requiresConfirmation
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-white/15 text-emerald-100'
                      }`}
                    >
                      {listening
                        ? 'Live Listening'
                        : reviewSummary.requiresConfirmation
                          ? 'Confirm Required'
                          : 'Standby'}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-100/90 truncate">
                    Target order: {activeOrderLabel || 'New Take-away Order'} · {speechLang}
                  </p>
                </div>
              </div>

              <button
                type="button"
                aria-label="Close voice command overlay"
                onClick={handleCloseOverlay}
                className="rounded-lg p-1.5 text-emerald-100 hover:bg-white/15 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 overflow-y-auto">
              {/* Live Microphone Waveform & Capture Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    data-testid="sell-voice-mic-toggle-btn"
                    onClick={() => (listening ? stopListening() : startListening())}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
                      listening
                        ? 'bg-rose-600 text-white hover:bg-rose-700'
                        : 'bg-[#0A3D31] text-white hover:bg-[#083026]'
                    }`}
                  >
                    {listening ? (
                      <>
                        <MicOff className="h-3.5 w-3.5" />
                        <span>Stop Mic</span>
                      </>
                    ) : (
                      <>
                        <Mic className="h-3.5 w-3.5" />
                        <span>{speechSupported ? 'Start Speaking' : 'Try Microphone'}</span>
                      </>
                    )}
                  </button>

                  {/* Visual Audio Activity Indicator */}
                  <div className="flex items-end gap-0.5 h-5" aria-hidden="true">
                    {[10, 16, 12, 18, 9].map((barH, idx) => (
                      <span
                        key={idx}
                        className={`w-1 rounded-full transition-all ${
                          listening
                            ? 'bg-rose-500 animate-pulse'
                            : combinedTranscript.trim()
                              ? 'bg-emerald-600'
                              : 'bg-slate-300'
                        }`}
                        style={{
                          height: listening
                            ? `${barH}px`
                            : combinedTranscript.trim()
                              ? `${Math.max(5, Math.round(barH * 0.55))}px`
                              : '4px',
                        }}
                      />
                    ))}
                  </div>
                </div>

                {combinedTranscript.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setTranscript('');
                      setInterimText('');
                      committedTranscriptRef.current = '';
                      resetTranscriptEdits();
                    }}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline"
                  >
                    Clear transcript
                  </button>
                )}
              </div>

              {micStatusNote && (
                <p
                  data-testid="sell-voice-mic-note"
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900"
                >
                  {micStatusNote}
                </p>
              )}

              {/* Live Transcript Display & Editable Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="voice-order-transcript" className="font-bold text-slate-800">
                    Live Spoken Transcript
                  </label>
                  {interimText && (
                    <span className="text-[11px] font-semibold text-rose-600 animate-pulse">
                      Hearing: &ldquo;{interimText}&rdquo;
                    </span>
                  )}
                </div>
                <textarea
                  id="voice-order-transcript"
                  data-testid="sell-voice-transcript-input"
                  rows={2}
                  value={combinedTranscript}
                  onChange={(e) => {
                    setInterimText('');
                    committedTranscriptRef.current = e.target.value;
                    setTranscript(e.target.value);
                    resetTranscriptEdits();
                  }}
                  placeholder='Speak or type e.g. "2 iced coffee less ice and 1 beef lok lak"'
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none"
                />

                {/* Quick Example Phrases */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {VOICE_EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => {
                        setInterimText('');
                        committedTranscriptRef.current = example;
                        setTranscript(example);
                        resetTranscriptEdits();
                      }}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/70 text-left"
                    >
                      <Sparkles className="inline h-2.5 w-2.5 text-emerald-700 mr-1" />
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recognized Menu Items Staged for Explicit Confirmation */}
              <div
                data-testid="sell-voice-recognized-items"
                className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    Recognized Menu Items ({reviewSummary.totalUnits})
                  </span>
                  {reviewSummary.requiresConfirmation && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                      <ShieldCheck className="h-3.5 w-3.5 text-amber-700" />
                      Review &amp; Confirm before adding
                    </span>
                  )}
                </div>

                {stagedDrafts.length > 0 ? (
                  <ul className="space-y-1.5 max-h-44 overflow-y-auto">
                    {stagedDrafts.map((entry) => {
                      const lineTotal = (entry.item.priceUsd + entry.deltaUsd) * entry.qty;
                      return (
                        <li
                          key={entry.draftId}
                          data-testid="sell-voice-staged-item"
                          className="flex items-center justify-between gap-2 rounded-lg bg-white border border-emerald-200 px-2.5 py-2 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              <Check className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                              <span className="truncate">{getLocalizedName(entry.item)}</span>
                            </div>
                            {(entry.optionLabel || entry.note) && (
                              <div className="text-[11px] text-slate-500 pl-5">
                                {[entry.optionLabel, entry.note].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50">
                              <button
                                type="button"
                                aria-label={`Decrease quantity for ${entry.item.nameEn}`}
                                onClick={() => {
                                  const nextQty = entry.qty - 1;
                                  if (nextQty <= 0) {
                                    setRemovedKeys((prev) => new Set(prev).add(entry.draftId));
                                  } else {
                                    setQtyOverrides((prev) => ({
                                      ...prev,
                                      [entry.draftId]: nextQty,
                                    }));
                                  }
                                }}
                                className="p-1 text-slate-600 hover:bg-slate-200/70 rounded-l-md"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="px-2 font-bold tabular-nums text-slate-900">
                                {entry.qty}
                              </span>
                              <button
                                type="button"
                                aria-label={`Increase quantity for ${entry.item.nameEn}`}
                                onClick={() =>
                                  setQtyOverrides((prev) => ({
                                    ...prev,
                                    [entry.draftId]: entry.qty + 1,
                                  }))
                                }
                                className="p-1 text-slate-600 hover:bg-slate-200/70 rounded-r-md"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>

                            <span className="w-14 text-right font-bold text-slate-900 tabular-nums">
                              ${lineTotal.toFixed(2)}
                            </span>

                            <button
                              type="button"
                              aria-label={`Remove ${entry.item.nameEn}`}
                              onClick={() =>
                                setRemovedKeys((prev) => new Set(prev).add(entry.draftId))
                              }
                              className="p-1 text-slate-400 hover:text-red-600 rounded"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-500">
                    {combinedTranscript.trim().length > 0
                      ? 'No active menu items matched this transcript yet.'
                      : 'Speak a menu item name above (or tap a sample phrase) to preview recognized items here.'}
                  </div>
                )}

                {parsed.unmatched.length > 0 && (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                    Unrecognized speech: {parsed.unmatched.join(', ')}
                  </p>
                )}
              </div>
            </div>

            {/* Safety Gate Footer requiring explicit Confirm press */}
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500">
                Items are staged only — press Confirm to add to order.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="sell-voice-cancel-btn"
                  onClick={handleCloseOverlay}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="sell-voice-confirm-btn"
                  disabled={!reviewSummary.requiresConfirmation}
                  onClick={handleConfirmAdd}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B5D47] px-4 py-2 text-xs font-bold text-white hover:bg-[#094A38] disabled:opacity-45 disabled:pointer-events-none"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>
                    {reviewSummary.requiresConfirmation
                      ? `Confirm & Add ${reviewSummary.totalUnits} ($${reviewSummary.estimatedTotalUsd.toFixed(2)})`
                      : 'Confirm'}
                  </span>
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
