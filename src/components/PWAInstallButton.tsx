import { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled || (!isInstallable && !isIOS)) {
    return null;
  }

  return (
    <>
      {isInstallable && (
        <button
          type="button"
          data-testid="pwa-install-btn"
          onClick={() => void promptInstall()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap transition-colors"
        >
          <Download className="h-3.5 w-3.5 text-emerald-700" />
          <span className="hidden sm:inline">Install App</span>
        </button>
      )}

      {isIOS && !isInstallable && (
        <button
          type="button"
          data-testid="pwa-ios-install-btn"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap transition-colors"
        >
          <Download className="h-3.5 w-3.5 text-emerald-700" />
          <span className="hidden sm:inline">Add App</span>
        </button>
      )}

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Install XAIWork POS on iOS"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Install XAIWork POS</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add this terminal to your iPad or iPhone home screen for offline use.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close install instructions"
                onClick={() => setShowIOSGuide(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="list-decimal list-inside space-y-2 text-xs text-slate-700">
              <li>
                Tap the <Share className="inline h-3.5 w-3.5 text-emerald-700" /> Share button in
                Safari.
              </li>
              <li>
                Scroll down and tap <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong>Add</strong> in the upper right corner.
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
