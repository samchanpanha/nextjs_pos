import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  Coffee,
  UtensilsCrossed,
  ShoppingBag,
  Building2,
  Plus,
  Ban,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import type { DemoPresetType } from '../data/seedData';
import type { LanguageCode } from '../types/pos';
import { TenantRegistrationModal } from './TenantRegistrationModal';

export function WelcomeAuthScreen() {
  const {
    tenants,
    activeTenantId,
    switchTenant,
    language,
    setLanguage,
    platformSettings,
    startDemoPreset,
    staffSignIn,
    signInWithGoogle,
    firebaseUser,
    setExternalMode,
  } = usePos();

  const demoDisabled = platformSettings.demoUsersDisabled;
  const [registerModalOpen, setRegisterModalOpen] = useState(false);

  const [businessCode, setBusinessCode] = useState('');
  const [username, setUsername] = useState(() => (demoDisabled ? '' : 'guide_chu'));
  const [password, setPassword] = useState(() => (demoDisabled ? '' : '1111'));
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (demoDisabled && username.toLowerCase().startsWith('guide_')) {
      setUsername('');
      setPassword('');
    }
  }, [demoDisabled, username]);

  const handleStaffSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = staffSignIn(username, password, businessCode);
    if (!res.ok) {
      setError(res.error || 'Sign-in failed');
    } else {
      setError('');
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  const presets: { id: DemoPresetType; label: string; desc: string; icon: typeof UtensilsCrossed }[] = [
    { id: 'restaurant', label: 'Restaurant', desc: 'Floor plan, KDS, bookings & VAT', icon: UtensilsCrossed },
    { id: 'cafe', label: 'Café', desc: 'Sizes, iced drinks & prepaid packs', icon: Coffee },
    { id: 'takeaway', label: 'Takeaway counter', desc: 'Simple mode & order numbers', icon: ShoppingBag },
  ];

  return (
    <div className="min-h-screen bg-[#E9ECEA] flex flex-col justify-between p-4 sm:p-6">
      {/* Top Language Bar */}
      <div className="mx-auto w-full max-w-6xl flex items-center justify-between py-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0A3D31] text-white font-bold text-sm">
            X
          </div>
          <span className="font-semibold text-slate-900 tracking-tight">XAIWork POS</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs font-medium">
            {(['kh', 'en', 'vi'] as LanguageCode[]).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  language === lang
                    ? 'bg-[#0A3D31] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lang === 'kh' ? 'ខ្មែរ' : lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Split Card */}
      <main className="mx-auto my-auto w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm grid grid-cols-1 lg:grid-cols-12">
        {/* Left Emerald Hero */}
        <section className="lg:col-span-5 bg-[#0A3D31] text-white p-8 sm:p-10 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-8">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-white font-bold text-sm">
                X
              </div>
              <span className="text-base font-semibold tracking-tight">
                XAIWork <span className="text-amber-400">POS</span>
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-balance">
              Sell faster. Run smoother shifts.
            </h1>
            <p className="mt-3 text-sm text-emerald-100/85 leading-relaxed">
              Point of sale for cafés and restaurants in Cambodia. Dual USD &amp; Riel billing, KHQR,
              kitchen display, QR ordering, and CamInvoice VAT book.
            </p>

            <ul className="mt-6 space-y-2.5 text-sm text-emerald-50/90">
              <li className="flex items-center gap-2.5">
                <span className="text-amber-300 font-mono text-xs">$ / ៛</span>
                <span>USD and Riel on the same bill with whole-dollar + Riel change</span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="text-amber-300 font-mono text-xs">KDS</span>
                <span>Order, send to kitchen, and collect KHQR on one screen</span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="text-amber-300 font-mono text-xs">ខ្មែរ</span>
                <span>Tiếng Việt · English · ខ្មែរ per device</span>
              </li>
            </ul>
          </div>

          {/* Live Ticket Preview Card matching Page 6 */}
          <div className="mt-8 rounded-xl bg-white/10 border border-white/15 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">T05</span>
              <span className="text-emerald-200 font-medium">Serving</span>
            </div>
            <div className="mt-2.5 space-y-1 text-xs text-emerald-100 tabular-nums">
              <div className="flex justify-between">
                <span>2× Beef lok lak</span>
                <span>$13.00</span>
              </div>
              <div className="flex justify-between">
                <span>1× Iced coffee</span>
                <span>$1.75</span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-white/15 flex items-baseline justify-between tabular-nums">
              <span className="text-xs text-emerald-200">Total</span>
              <div className="text-right">
                <div className="text-base font-bold text-white">$14.75</div>
                <div className="text-[11px] text-emerald-200">60,500 ៛</div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Sign-in & Instant Demo Panel */}
        <section className="lg:col-span-7 p-8 sm:p-10 flex flex-col justify-center">
          <div className="max-w-md mx-auto w-full">
            <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
            <p className="mt-1 text-sm text-slate-600">
              {demoDisabled
                ? 'Sign in with your Google Cloud account, Tenant Code + staff credentials, or Super Admin.'
                : 'Sign in with Google for cloud Firestore persistence, or start an instant 24h demo shop.'}
            </p>

            {/* Tenant Workspace Entry & Registration CTA (Strictly isolated: only own/admin tenants visible when signed in) */}
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  {tenants.length > 0
                    ? `Your Workspaces (${tenants.length})`
                    : 'Tenant Workspaces (Isolated)'}
                </span>
                <button
                  type="button"
                  onClick={() => setRegisterModalOpen(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-700 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Register New Tenant
                </button>
              </div>

              {tenants.length > 0 ? (
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-0.5">
                  {tenants.map((tn) => {
                    const isActive = tn.id === activeTenantId;
                    return (
                      <button
                        key={tn.id}
                        type="button"
                        onClick={() => switchTenant(tn.id)}
                        className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                          isActive
                            ? 'border-emerald-700 bg-emerald-50/70'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900 font-bold text-xs">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 truncate">
                              {tn.name}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono truncate">
                              {tn.businessCode} · {tn.plan.toUpperCase()} ({tn.planDaysLeft}d) ·{' '}
                              {tn.khqrAccountId ? `KHQR ${tn.khqrAccountId}` : 'KHQR optional'}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-semibold shrink-0 ml-2 ${
                            tn.tenantStatus === 'suspended'
                              ? 'text-red-700'
                              : tn.subscriptionStatus === 'active'
                                ? 'text-emerald-800'
                                : 'text-amber-700'
                          }`}
                        >
                          {tn.tenantStatus === 'suspended'
                            ? 'Suspended'
                            : tn.subscriptionStatus !== 'active'
                              ? 'Pay to Activate'
                              : isActive
                                ? 'ACTIVE'
                                : 'Open'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                  Tenant data is strictly isolated. Sign in with your Tenant Code &amp; PIN below, or connect Google Cloud to view only your own shops.
                </div>
              )}
            </div>

            {/* Primary Cloud Auth CTA */}
            <div className="mt-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                {firebaseUser
                  ? `Signed in as ${firebaseUser.email} — Open Cloud POS`
                  : googleLoading
                    ? 'Connecting to Google...'
                    : 'Sign in with Google (Cloud Firestore Sync)'}
              </button>
            </div>

            <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
              <div className="h-px flex-1 bg-slate-200" />
              <span>or staff account sign-in</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <form onSubmit={handleStaffSubmit} className="space-y-3">
              <div>
                <label htmlFor="pos-tenant-code" className="block text-xs font-semibold text-slate-700 mb-1">
                  Tenant Code <span className="font-normal text-slate-400">(optional for Super Admin)</span>
                </label>
                <div className="relative">
                  <Building2 className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="pos-tenant-code"
                    type="text"
                    value={businessCode}
                    onChange={(e) => setBusinessCode(e.target.value.toUpperCase())}
                    placeholder="e.g. ANGKOR_KH"
                    className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm font-mono uppercase text-slate-900 focus:border-emerald-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="pos-username" className="block text-xs font-semibold text-slate-700 mb-1">
                  Username
                </label>
                <div className="relative">
                  <User className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="pos-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={
                      demoDisabled ? 'e.g. admin or owner' : 'e.g. admin, guide_chu, or owner'
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="pos-password" className="block text-xs font-semibold text-slate-700 mb-1">
                  PIN / Password
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="pos-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={demoDisabled ? 'Enter PIN (e.g. 0000)' : 'Enter PIN (e.g. 0000 or 1111)'}
                    className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-10 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p role="alert" className="text-xs font-medium text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B5D47] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#094A38] transition-colors"
              >
                <span>Sign in</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 text-[11px] text-slate-500">
                <span>Quick fill:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setBusinessCode('');
                      setUsername('admin');
                      setPassword('0000');
                      setError('');
                    }}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-slate-800 hover:bg-slate-100"
                  >
                    Admin (0000)
                  </button>
                  {!demoDisabled && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setBusinessCode('BKK1_GUIDE_KH');
                          setUsername('guide_chu');
                          setPassword('1111');
                          setError('');
                        }}
                        className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-slate-800 hover:bg-slate-100"
                      >
                        Demo Owner (1111)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBusinessCode('BKK1_GUIDE_KH');
                          setUsername('guide_thungan');
                          setPassword('3333');
                          setError('');
                        }}
                        className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-slate-800 hover:bg-slate-100"
                      >
                        Demo Cashier (3333)
                      </button>
                    </>
                  )}
                </div>
              </div>
            </form>

            {/* Try it now 24-hour sample shop (Hidden when disabled by Super Admin) */}
            <div className="mt-6 pt-5 border-t border-slate-200">
              {demoDisabled ? (
                <div
                  role="status"
                  className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"
                >
                  <Ban className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Demo Users &amp; Sample Shops Disabled</div>
                    <p className="text-[11px] text-amber-900/90 mt-0.5 leading-snug">
                      Super Admin has turned off demo mode. Sign in with your registered Tenant Code &amp; PIN, Google Cloud, or Super Admin.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-semibold text-slate-700">
                      Try it now · 24-hour sample shop (no card)
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {presets.map((p) => {
                      const Icon = p.icon;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => startDemoPreset(p.id)}
                          className="flex flex-col items-start rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-left hover:border-emerald-700 hover:bg-emerald-50/50 transition-colors"
                        >
                          <Icon className="h-4 w-4 text-emerald-800 mb-1" />
                          <span className="text-xs font-semibold text-slate-900">{p.label}</span>
                          <span className="text-[11px] text-slate-500 leading-tight mt-0.5">{p.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Direct standalone screen links */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>Standalone screens:</span>
              <div className="flex items-center gap-3 font-medium text-emerald-800">
                <button type="button" onClick={() => setExternalMode('kds')} className="hover:underline">
                  /kds
                </button>
                <button type="button" onClick={() => setExternalMode('display')} className="hover:underline">
                  /display
                </button>
                <button type="button" onClick={() => setExternalMode('qr')} className="hover:underline">
                  /qr
                </button>
                <button type="button" onClick={() => setExternalMode('group')} className="hover:underline">
                  /group
                </button>
                <button type="button" onClick={() => setExternalMode('book')} className="hover:underline">
                  /book
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-6xl py-2 flex items-center justify-between text-xs text-slate-500">
        <span>XAIWork · Phnom Penh, Cambodia</span>
        <span>Supports 80mm thermal printers, Bakong KHQR &amp; CamInvoice UBL 2.1</span>
      </footer>

      <TenantRegistrationModal
        open={registerModalOpen}
        onClose={() => setRegisterModalOpen(false)}
      />
    </div>
  );
}
