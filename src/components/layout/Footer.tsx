// src/components/layout/Footer.tsx
import { Link } from 'react-router-dom'

const PHONE_DISPLAY = '(623) 555-0000'
const PHONE_TEL = '+16235550000'
const SUPPORT_EMAIL = 'sofisrestaurante@gmail.com'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="relative mt-auto overflow-hidden border-t border-white/10 bg-linear-to-b from-gray-950 to-black text-white">
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.12),transparent_60%)]" />

      <div className="relative mx-auto w-full max-w-96 px-4 py-16 sm:px-6 lg:px-8">
        {/* ===================================================== */}
        {/* GRID */}
        {/* ===================================================== */}
        <div className="grid min-w-0 grid-cols-1 gap-14 xl:grid-cols-12">
          {/* ===================================================== */}
          {/* BRAND */}
          {/* ===================================================== */}
          <div className="min-w-0 space-y-6 xl:col-span-4">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-orange-600 text-lg font-bold shadow-lg">
                S
              </div>

              <div className="min-w-0">
                <h3 className="truncate text-lg font-bold">
                  Sofi&apos;s Restaurant
                </h3>
                <p className="text-xs text-gray-400">
                  Surprise, Arizona • Mexican &amp; American
                </p>
              </div>
            </div>

            <p className="max-w-md text-sm leading-relaxed text-gray-300">
              Fresh tortillas, real plates, and the kind of comfort food you’ll
              come back for. Dine-in, call-in, and to-go.
            </p>

            {/* CTA */}
            <Link
              to="/menu"
              className="inline-flex w-full items-center justify-center rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-500 sm:w-auto"
            >
              Order Online
            </Link>

            {/* Social */}
            <div className="flex flex-wrap gap-3">
              <a
                href="https://www.tiktok.com/@Sofisrestaurant"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10 hover:text-white"
              >
                🎵 TikTok
              </a>

              <a
                href="https://www.instagram.com/sofisrestaurante/"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10 hover:text-white"
              >
                📸 Instagram
              </a>
            </div>
          </div>

          {/* ===================================================== */}
          {/* QUICK LINKS */}
          {/* ===================================================== */}
          <nav className="min-w-0 xl:col-span-3" aria-label="Footer navigation">
            <h4 className="mb-5 text-sm font-semibold tracking-wide text-white">
              Quick Links
            </h4>

            <ul className="space-y-3 text-sm">
              {[
                ['/menu', 'Menu'],
                ['/about', 'About'],
                ['/contact', 'Contact'],
                ['/reservations', 'Reservations'],
                ['/reviews', 'Reviews'],
              ].map(([to, label]) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="block truncate text-gray-400 transition hover:translate-x-1 hover:text-white"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* ===================================================== */}
          {/* LEGAL */}
          {/* ===================================================== */}
          <nav className="min-w-0 xl:col-span-2" aria-label="Legal">
            <h4 className="mb-5 text-sm font-semibold tracking-wide text-white">
              Legal
            </h4>

            <ul className="space-y-3 text-sm">
              {[
                ['/privacy-policy', 'Privacy Policy'],
                ['/terms-of-service', 'Terms of Service'],
                ['/refund-policy', 'Refund Policy'],
              ].map(([to, label]) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="block truncate text-gray-400 transition hover:translate-x-1 hover:text-white"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* ===================================================== */}
          {/* CONTACT */}
          {/* ===================================================== */}
          <div className="min-w-0 space-y-4 xl:col-span-3">
            <h4 className="text-sm font-semibold tracking-wide text-white">
              Contact
            </h4>

            <div className="space-y-3 text-sm">
              <a
                href={`tel:${PHONE_TEL}`}
                className="flex items-center gap-3 rounded-xl bg-white/5 p-3 text-gray-300 transition hover:bg-white/10"
              >
                <span>📞</span>
                <span className="truncate">{PHONE_DISPLAY}</span>
              </a>

              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="flex items-center gap-3 rounded-xl bg-white/5 p-3 text-gray-300 transition hover:bg-white/10"
              >
                <span>✉️</span>
                <span className="break-all">{SUPPORT_EMAIL}</span>
              </a>

              <a
                href="https://maps.google.com/?q=12851+W+Bell+Rd+Surprise+AZ"
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-3 rounded-xl bg-white/5 p-3 text-gray-300 transition hover:bg-white/10"
              >
                <span>📍</span>
                <span className="wrap-break-words">
                  12851 W Bell Rd Unit #120
                  <br />
                  Surprise, AZ 85378
                </span>
              </a>

              <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3 text-gray-300">
                <span>🕒</span>
                <span>Open Daily • 7 AM – 8 PM</span>
              </div>
            </div>
          </div>
        </div>

        {/* ===================================================== */}
        {/* BOTTOM BAR */}
        {/* ===================================================== */}
        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-gray-400">
            © {currentYear} Sofi&apos;s Restaurant. All rights reserved.
          </p>

          <p className="text-xs text-gray-500">
            Built with precision using Supabase • Stripe • React
          </p>
        </div>
      </div>
    </footer>
  )
}