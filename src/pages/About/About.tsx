// src/pages/About/About.tsx

export default function About() {
  return (
    <section className="relative bg-linear-to-b from-primary-light/10 via-white to-white py-24 overflow-hidden">
      <div className="container mx-auto max-w-6xl px-6">
        {/* ─── HERO HEADER ───────────────────────────── */}
        <div className="text-center mb-20">
          <p className="text-sm uppercase tracking-widest text-primary/70 mb-3">Our Story</p>

          <h1 className="text-5xl md:text-6xl font-serif font-bold text-primary leading-tight mb-6">
            About Sofi's Restaurant
          </h1>

          <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Where passion meets flavor. Since 2020, we’ve been serving our community with authentic
            cuisine crafted from the freshest ingredients and a love for unforgettable dining
            experiences.
          </p>
        </div>

        {/* ─── FEATURE CARDS ─────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-10">
          {/* Card 1 */}
          <div className="group bg-white/60 backdrop-blur-xl border border-white/40 rounded-3xl shadow-lg p-8 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl">
            <div className="text-5xl mb-5 text-primary text-center transition-transform duration-300 group-hover:scale-110">
              🍴
            </div>
            <h3 className="text-2xl font-semibold mb-3 text-center text-gray-900">
              Fresh Ingredients
            </h3>
            <p className="text-gray-600 text-center leading-relaxed">
              Every dish is crafted using locally sourced, high-quality ingredients for maximum
              flavor and freshness.
            </p>
          </div>

          {/* Card 2 */}
          <div className="group bg-white/60 backdrop-blur-xl border border-white/40 rounded-3xl shadow-lg p-8 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl">
            <div className="text-5xl mb-5 text-success text-center transition-transform duration-300 group-hover:scale-110">
              🌿
            </div>
            <h3 className="text-2xl font-semibold mb-3 text-center text-gray-900">
              Sustainable Practices
            </h3>
            <p className="text-gray-600 text-center leading-relaxed">
              We care for the planet while delivering an exceptional dining experience with
              responsible sourcing.
            </p>
          </div>

          {/* Card 3 */}
          <div className="group bg-white/60 backdrop-blur-xl border border-white/40 rounded-3xl shadow-lg p-8 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl">
            <div className="text-5xl mb-5 text-error text-center transition-transform duration-300 group-hover:scale-110">
              ❤️
            </div>
            <h3 className="text-2xl font-semibold mb-3 text-center text-gray-900">
              Community Focused
            </h3>
            <p className="text-gray-600 text-center leading-relaxed">
              Sofi's is more than a restaurant — it’s a place where memories are made and
              connections are built.
            </p>
          </div>
        </div>

        {/* ─── DIVIDER ──────────────────────────────── */}
        <div className="my-20 flex items-center justify-center">
          <div className="w-24 h-2px bg-primary/30 rounded-full" />
        </div>

        {/* ─── CLOSING SECTION ─────────────────────── */}
        <div className="text-center max-w-3xl mx-auto">
          <p className="text-lg md:text-xl text-gray-600 leading-relaxed">
            From the first bite to the last, we aim to delight every sense and leave you craving
            your next visit.
          </p>

          <p className="mt-6 text-xl font-medium text-primary">
            Sofi's isn’t just about food — it’s about the experience.
          </p>
        </div>
      </div>
    </section>
  );
}