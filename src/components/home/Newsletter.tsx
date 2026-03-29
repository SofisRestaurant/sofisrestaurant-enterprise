// src/components/home/Newsletter.tsx
// ─── Email capture strip ──────────────────────────────────────────────────────
//
// This component imports useNewsletter from @/hooks/useNewsletter.
// The hook is called ONCE at the top of Newsletter().
// useNewsletter is never defined or redefined here.
//
// States:
//   idle               → form visible
//   loading            → spinner in button, inputs disabled
//   success            → 🎉 personalised greeting + confetti + CTAs
//   already-subscribed → ✅ "You're already on the list." + browse CTA
//   error              → ⚠️ shake, red border, inline message, optional retry button
//
// Animations (Framer Motion — import from 'framer-motion', never 'framer-motion'):
//   • Staggered section entrance via whileInView
//   • Animated radial-gradient glow background (continuous pulse)
//   • AnimatePresence form ↔ success/already-subscribed swap
//   • ConfettiBurst on new subscription
//   • useAnimate horizontal shake on error
//   • Button: whileHover scale + glow, whileTap press, loading spinner
//   • Progressive first-name field: slides in after valid email blur
//   • Animated gradient "Loop" (globals.css .newsletter-gradient-text)
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion as m, AnimatePresence, useAnimate }  from 'framer-motion';
import { SectionLabel }                              from '@/components/ui/SectionLabel';
import { SECTION_VIEWPORT }                          from '@/lib/animations/reveal';
import { useNewsletter }                             from '@/hooks/useNewsletter';

// ── Constants ─────────────────────────────────────────────────────────────────

const EL: [number, number, number, number] = [0.16, 1, 0.3, 1];
const CONFETTI_COUNT    = 18;
const INPUT_DEBOUNCE_MS = 100;
const LS_EMAIL_KEY      = 'nl_prefill_email';
const LS_NAME_KEY       = 'nl_prefill_name';

const GOLD = {
  400:  '#d4af37',
  300:  '#e8c46a',
  pale: 'rgba(212,175,55,0.08)',
  ring: 'rgba(212,175,55,0.25)',
  glow: 'rgba(212,175,55,0.14)',
} as const;

// ── Confetti ──────────────────────────────────────────────────────────────────

interface ConfettiParticle {
  id: number; x: number; delay: number;
  color: string; size: number; angle: number;
}

function makeConfetti(): ConfettiParticle[] {
  const colors = [GOLD[400], GOLD[300], '#a96840', '#f5e6a3', '#c8b8a8'];
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    id:    i,
    x:     (Math.random() - 0.5) * 120,
    delay: Math.random() * 0.25,
    color: colors[i % colors.length],
    size:  4 + Math.random() * 6,
    angle: Math.random() * 360,
  }));
}

function ConfettiBurst() {
  const [particles] = useState(makeConfetti);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible">
      {particles.map((p) => (
        <m.span
          key={p.id}
          className="absolute rounded-sm"
          style={{ width: p.size, height: p.size * 0.5, background: p.color, rotate: p.angle, left: '50%', top: '50%' }}
          initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          animate={{
            opacity: [1, 1, 0],
            x:       p.x,
            y:       [0, -(40 + Math.random() * 60), 80],
            scale:   [1, 1, 0.4],
            rotate:  p.angle + 180,
          }}
          transition={{ duration: 1.1 + Math.random() * 0.4, delay: p.delay, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </div>
  );
}

// ── What-to-expect bullets ────────────────────────────────────────────────────

const EXPECT_ITEMS = [
  { icon: '🍷', text: 'Seasonal menus before they go live' },
  { icon: '🎟️', text: 'Early access to events & tastings' },
  { icon: '🎁', text: 'A welcome gift on your next visit'  },
] as const;

function ExpectList() {
  return (
    <m.ul
      className="mt-3 w-full space-y-1.5 text-left"
      aria-label="What to expect from the newsletter"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.09, delayChildren: 0.35 } } }}
    >
      {EXPECT_ITEMS.map((item) => (
        <m.li
          key={item.icon}
          className="flex items-center gap-2 font-body text-[0.78rem] font-light"
          style={{ color: 'var(--color-ink-500, #8a7a6a)' }}
          variants={{
            hidden:  { opacity: 0, x: -10 },
            visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
          }}
        >
          <span aria-hidden="true" className="shrink-0 text-base">{item.icon}</span>
          {item.text}
        </m.li>
      ))}
    </m.ul>
  );
}

// ── Success card ──────────────────────────────────────────────────────────────

function SuccessCard({ firstName }: { firstName: string }) {
  const greeting = firstName.trim()
    ? `Welcome, ${firstName.trim().split(' ')[0]}! 🎉`
    : "You're on the list!";

  return (
    <m.div
      key="success"
      className="relative flex flex-col items-center gap-2 overflow-visible rounded-2xl px-6 py-6"
      style={{ background: GOLD.pale, border: `1px solid ${GOLD.ring}` }}
      initial={{ opacity: 0, scale: 0.88, y: 12 }}
      animate={{ opacity: 1, scale: 1,    y: 0  }}
      exit={{    opacity: 0, scale: 0.92, y: -6 }}
      transition={{ type: 'spring', stiffness: 380, damping: 24 }}
      role="status"
      aria-live="polite"
    >
      <ConfettiBurst />

      <m.span
        className="text-3xl"
        aria-hidden="true"
        initial={{ rotate: -12, scale: 0.6 }}
        animate={{ rotate: 0,   scale: 1   }}
        transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.05 }}
      >
        🎉
      </m.span>

      <p className="font-display text-[1.1rem] font-semibold" style={{ color: 'var(--color-ink-900, #1c1c1c)' }}>
        {greeting}
      </p>
      <p className="font-body text-[0.8rem] font-light" style={{ color: 'var(--color-ink-500, #8a7a6a)' }}>
        Your first note is on its way.
      </p>

      <ExpectList />

      <m.div
        className="mt-4 flex w-full gap-2"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.4, ease: EL }}
      >
        <a
          href="/menu"
          className="flex-1 rounded-xl py-2 text-center font-body text-[0.75rem] font-medium uppercase tracking-widest transition-colors duration-150"
          style={{ background: GOLD.pale, border: `1px solid ${GOLD.ring}`, color: 'var(--color-ink-700, #5a4a3a)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = GOLD.glow; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = GOLD.pale; }}
        >
          View Menu
        </a>
        <a
          href="https://instagram.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Follow us on Instagram"
          className="flex items-center justify-center rounded-xl px-3 py-2 transition-colors duration-150"
          style={{ background: GOLD.pale, border: `1px solid ${GOLD.ring}`, color: 'var(--color-ink-700, #5a4a3a)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = GOLD.glow; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = GOLD.pale; }}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
            <circle cx="12" cy="12" r="4"/>
            <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
          </svg>
        </a>
      </m.div>
    </m.div>
  );
}

// ── Already-subscribed card ───────────────────────────────────────────────────

function AlreadySubscribedCard() {
  return (
    <m.div
      key="already"
      className="flex flex-col items-center gap-2 rounded-2xl px-6 py-5"
      style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.15)' }}
      initial={{ opacity: 0, y: 8  }}
      animate={{ opacity: 1, y: 0  }}
      exit={{    opacity: 0, y: -4 }}
      transition={{ duration: 0.45, ease: EL }}
      role="status"
      aria-live="polite"
    >
      <m.span
        className="text-2xl"
        aria-hidden="true"
        initial={{ scale: 0.7 }}
        animate={{ scale: 1   }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      >
        ✅
      </m.span>
      <p className="font-display text-[1rem] font-semibold" style={{ color: 'var(--color-ink-900, #1c1c1c)' }}>
        You're already on the list.
      </p>
      <p className="font-body text-[0.8rem] font-light" style={{ color: 'var(--color-ink-500, #8a7a6a)' }}>
        We'll keep the good stuff coming your way.
      </p>
      <a
        href="/menu"
        className="mt-2 font-body text-[0.75rem] font-medium underline underline-offset-2"
        style={{ color: 'var(--color-ember-500, #a96840)' }}
      >
        Browse today's menu →
      </a>
    </m.div>
  );
}

// ── Newsletter ─────────────────────────────────────────────────────────────────

export function Newsletter() {
  // ── Refs & local state ────────────────────────────────────────────────────
  const emailRef     = useRef<HTMLInputElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rowScope, animateRow] = useAnimate();

  const [showName,   setShowName]   = useState(false);
  const [firstName,  setFirstName]  = useState('');
  const [optimistic, setOptimistic] = useState(false);

  // ── Hook call — the ONLY call to useNewsletter in this file ───────────────
const {
  status,
  loading,
  done,
  subscribed,
  alreadySubscribed,
  error,
  attempt,
  canRetry,
  addSubscriber,
  retry,
  reset,
  trackFormViewed,
  trackEmailTyped,
  trackNameRevealed,
} = useNewsletter({
    source:       'homepage-newsletter',
    onOptimistic: (email) => { void email; setOptimistic(true); },
    onSuccess:    ()      => setOptimistic(false),
    onError:      ()      => setOptimistic(false),
  });

  // ── Prefill from localStorage (returning users) ───────────────────────────
  useEffect(() => {
    try {
      const savedEmail: string | null = localStorage.getItem(LS_EMAIL_KEY);
      const savedName:  string | null = localStorage.getItem(LS_NAME_KEY);
      if (savedEmail && emailRef.current)     emailRef.current.value = savedEmail;
      if (savedName  && firstNameRef.current) firstNameRef.current.value = savedName;
      if (savedEmail) setShowName(true);
      if (savedName)  setFirstName(savedName);
    } catch { /* localStorage may be unavailable */ }
  }, []);

  const persistPrefill = useCallback(() => {
    try {
      const e = emailRef.current?.value.trim() ?? '';
      const n = firstNameRef.current?.value.trim() ?? '';
      if (e) localStorage.setItem(LS_EMAIL_KEY, e);
      if (n) localStorage.setItem(LS_NAME_KEY,  n);
    } catch { /* ignore */ }
  }, []);

  // ── Funnel: mark form as viewed on mount ─────────────────────────────────
  useEffect(() => {
    trackFormViewed();
  }, [trackFormViewed]);

  // ── Auto-focus on error ───────────────────────────────────────────────────
  useEffect(() => {
    if (status === 'error' && !canRetry) emailRef.current?.focus();
  }, [status, canRetry]);

  // ── Clear input on success ────────────────────────────────────────────────
  useEffect(() => {
    if (subscribed && emailRef.current) {
      emailRef.current.value = '';
      try { localStorage.removeItem(LS_EMAIL_KEY); } catch { /* ignore */ }
    }
  }, [subscribed]);

  // ── Shake on error ────────────────────────────────────────────────────────
  useEffect(() => {
    if (status === 'error' && !canRetry) {
      void animateRow(rowScope.current, { x: [0, -8, 8, -6, 6, -3, 3, 0] }, { duration: 0.4, ease: 'easeInOut' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // ── Cleanup debounce ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // ── Input change — debounced error reset ──────────────────────────────────
  const handleInputChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (status === 'error') reset();
    }, INPUT_DEBOUNCE_MS);
    trackEmailTyped();
  }, [status, reset, trackEmailTyped]);

  // ── Email blur — reveal name field if email looks valid ───────────────────
  const handleEmailBlur = useCallback(() => {
    const val = emailRef.current?.value.trim() ?? '';
    if (val && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val)) {
      setShowName(true);
      trackNameRevealed();
    }
    persistPrefill();
  }, [persistPrefill, trackNameRevealed]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const email = emailRef.current?.value.trim() ?? '';
      const name  = firstNameRef.current?.value.trim() ?? '';

      if (!email) {
        void animateRow(rowScope.current, { x: [0, -8, 8, -6, 6, -3, 3, 0] }, { duration: 0.4, ease: 'easeInOut' });
        emailRef.current?.focus();
        return;
      }

      setFirstName(name);
      persistPrefill();
      await addSubscriber(email, name ? { first_name: name } : undefined);
    },
    [addSubscriber, animateRow, persistPrefill, rowScope],
  );

  // ── Retry ─────────────────────────────────────────────────────────────────
  const handleRetry = useCallback(async () => {
    await retry();
  }, [retry]);

  // ── Derived display ───────────────────────────────────────────────────────
  const showSuccess = subscribed || optimistic;
  const showAlready = alreadySubscribed;
  const showForm    = !done && !optimistic;
  const buttonLabel = status === 'loading' && attempt > 1
    ? `Retrying (${attempt}/3)…`
    : loading ? 'Subscribing…' : 'Subscribe';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section
      aria-labelledby="newsletter-heading"
      className="section-wrap relative overflow-[clip] px-5 py-16 sm:py-24 sm:px-8 md:px-12"
      style={{ background: 'var(--color-cream-300, #ede0ce)' }}
    >

      {/* Animated radial glow */}
      <m.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        animate={{ opacity: [0.7, 1, 0.7], scale: [1, 1.06, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ background: 'radial-gradient(ellipse 60% 80% at 80% 50%, rgba(212,175,55,0.09) 0%, transparent 60%)' }}
      />

      <div className="relative mx-auto flex max-w-xl flex-col items-center gap-4 text-center">

        {/* Section label */}
        <m.div
          initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={SECTION_VIEWPORT} transition={{ duration: 0.6, ease: EL }}
        >
          <SectionLabel centered>Stay Close</SectionLabel>
        </m.div>

        {/* Heading */}
        <m.h2
          id="newsletter-heading"
          initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }}
          whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          viewport={SECTION_VIEWPORT}
          transition={{ duration: 0.8, ease: EL, delay: 0.1 }}
          className="font-display leading-[1.05] tracking-[-0.02em]"
          style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: 'var(--color-ink-900, #1c1c1c)' }}
        >
          Stay in the{' '}
          <em className="newsletter-gradient-text font-display italic" style={{ fontStyle: 'italic' }}>
            Loop
          </em>
        </m.h2>

        {/* Sub-copy */}
        <m.p
          initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={SECTION_VIEWPORT} transition={{ duration: 0.65, ease: EL, delay: 0.18 }}
          className="font-body text-[0.92rem] font-light leading-relaxed"
          style={{ color: 'var(--color-ink-500, #8a7a6a)' }}
        >
          Seasonal menus, special events, and wine notes — no noise, just the good stuff.
        </m.p>

        {/* Social proof */}
        {!done && !optimistic && (
          <m.p
            initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={SECTION_VIEWPORT} transition={{ duration: 0.5, ease: EL, delay: 0.22 }}
            className="font-body text-[0.78rem] font-light"
            style={{ color: 'var(--color-ink-400, #b0a090)' }}
          >
            Join 1,200+ guests already in the loop
          </m.p>
        )}

        {/* Form / success swap */}
        <m.div
          initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={SECTION_VIEWPORT} transition={{ duration: 0.65, ease: EL, delay: 0.28 }}
          className="mt-2 w-full max-w-md"
        >
          <AnimatePresence mode="wait">

            {showSuccess ? <SuccessCard key="success" firstName={firstName} /> : null}
            {showAlready ? <AlreadySubscribedCard key="already" /> : null}

            {showForm ? (
              <m.div key="form" exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>

                <label htmlFor="newsletter-email" className="sr-only">Email address</label>

                <div ref={rowScope}>
                  <form
                    onSubmit={handleSubmit}
                    className="flex w-full"
                    aria-label="Newsletter subscription"
                    noValidate
                  >
                    <input
                      id="newsletter-email"
                      ref={emailRef}
                      type="email"
                      name="email"
                      placeholder="your@email.com"
                      autoComplete="email"
                      aria-describedby={error ? 'newsletter-error' : undefined}
                      aria-invalid={!!error}
                      required
                      disabled={loading}
                      onChange={handleInputChange}
                      onFocus={(e) => {
                        e.target.style.borderColor = error ? 'rgba(220,38,38,0.6)' : GOLD[400];
                        e.target.style.boxShadow   = error ? '0 0 0 2px rgba(220,38,38,0.12)' : `0 0 0 2px ${GOLD.glow}`;
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = error ? 'rgba(220,38,38,0.5)' : GOLD.ring;
                        e.target.style.boxShadow   = 'none';
                        handleEmailBlur();
                      }}
                      className="flex-1 rounded-l-full bg-white py-3 px-5 font-body text-[0.85rem]
                                 outline-none transition-[border-color,box-shadow] duration-200 disabled:opacity-60"
                      style={{
                        border:      `1px solid ${error ? 'rgba(220,38,38,0.5)' : GOLD.ring}`,
                        borderRight: 'none',
                        color:       'var(--color-ink-900, #1c1c1c)',
                      }}
                    />

                    <m.button
                      type="submit"
                      disabled={loading}
                      whileHover={loading ? {} : { scale: 1.03, boxShadow: `0 0 18px 4px ${GOLD.glow}` }}
                      whileTap={loading   ? {} : { scale: 0.96 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                      className="rounded-r-full px-6 py-3 font-body text-[0.75rem] font-medium uppercase
                                 tracking-[0.12em] focus-visible:outline-none focus-visible:ring-2
                                 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                      style={{
                        background:        GOLD[400],
                        color:             'var(--color-stone-900, #1c1915)',
                        '--tw-ring-color': GOLD[400],
                      } as React.CSSProperties}
                      onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = GOLD[300]; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = GOLD[400]; }}
                    >
                      {loading ? (
                        <>
                          <m.span
                            className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent"
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}
                            aria-hidden="true"
                          />
                          <span>{buttonLabel}</span>
                        </>
                      ) : (
                        'Subscribe'
                      )}
                    </m.button>
                  </form>

                  {/* Progressive first-name field */}
                  <AnimatePresence>
                    {showName && !loading && (
                      <m.div
                        initial={{ opacity: 0, height: 0, y: -4 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{    opacity: 0, height: 0 }}
                        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 flex items-center gap-2">
                          <label htmlFor="newsletter-name" className="sr-only">First name (optional)</label>
                          <input
                            id="newsletter-name"
                            ref={firstNameRef}
                            type="text"
                            name="first_name"
                            placeholder="First name (optional)"
                            autoComplete="given-name"
                            disabled={loading}
                            className="flex-1 rounded-full bg-white/70 py-2.5 px-4 font-body text-[0.82rem]
                                       outline-none transition-[border-color,box-shadow] duration-200 disabled:opacity-60"
                            style={{ border: `1px solid ${GOLD.ring}`, color: 'var(--color-ink-900, #1c1c1c)' }}
                            onFocus={(e) => { e.target.style.borderColor = GOLD[400]; e.target.style.boxShadow = `0 0 0 2px ${GOLD.glow}`; }}
                            onBlur={(e)  => { e.target.style.borderColor = GOLD.ring;  e.target.style.boxShadow = 'none'; persistPrefill(); }}
                            onChange={() => { setFirstName(firstNameRef.current?.value ?? ''); }}
                          />
                          <m.span
                            className="shrink-0 font-body text-[0.7rem]"
                            style={{ color: 'var(--color-ink-300, #c8b8a8)' }}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                          >
                            optional
                          </m.span>
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Inline error + retry */}
                <AnimatePresence>
                  {error && (
                    <m.div
                      id="newsletter-error"
                      role="alert"
                      aria-live="assertive"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0  }}
                      exit={{    opacity: 0         }}
                      transition={{ duration: 0.2 }}
                      className="mt-2 flex items-center justify-center gap-2"
                    >
                      <p className="font-body text-[0.75rem]" style={{ color: 'rgb(220 38 38)' }}>
                        {error}
                      </p>
                      {canRetry && (
                        <m.button
                          type="button"
                          onClick={handleRetry}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.96 }}
                          className="font-body text-[0.72rem] font-medium underline underline-offset-2"
                          style={{ color: 'var(--color-ember-500, #a96840)' }}
                        >
                          Try again
                        </m.button>
                      )}
                    </m.div>
                  )}
                </AnimatePresence>

              </m.div>
            ) : null}

          </AnimatePresence>
        </m.div>

        {/* Fine print */}
        {!done && !optimistic && (
          <m.p
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
            viewport={SECTION_VIEWPORT} transition={{ duration: 0.5, ease: EL, delay: 0.4 }}
            className="font-body text-[0.7rem] font-light"
            style={{ color: 'var(--color-ink-300, #c8b8a8)' }}
          >
            Unsubscribe anytime · No spam, ever.
          </m.p>
        )}

      </div>
    </section>
  );
}

export default Newsletter;