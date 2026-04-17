// src/components/home/MenuSection.tsx
// ─── Filterable full menu section ────────────────────────────────────────────
//
// Animation fix 2026:
//   • Header m.div: already had initial={{ opacity: 0, y: 20 }} — confirmed correct.
//   • Search m.div: already had initial={{ opacity: 0, y: 14 }} — confirmed correct.
//   • Tabs m.div: already had initial={{ opacity: 0, y: 14 }} — confirmed correct.
//   • MenuRow: uses AnimatePresence with initial/animate/exit — correct.
//   • No whileInView without initial found — file was already correct.
//   • Upgraded: all hardcoded hex → CSS token var() references.
//   • borderOpacity removed — alpha encoded into rgba() borderColor.

import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion as m } from 'framer-motion';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SECTION_VIEWPORT } from '@/lib/animations/reveal';

const EL: [number, number, number, number] = [0.16, 1, 0.3, 1];

// ── Types & data ──────────────────────────────────────────────────────────────

export interface MenuEntry {
  id: string;
  name: string;
  description: string;
  price: string;
  category: string;
  tags?: string[];
}

const ENTRIES: MenuEntry[] = [
  {
    id: 's1',
    name: 'Truffle Ricotta Crostini',
    description: 'House-made ricotta, black truffle, micro arugula.',
    price: '$16',
    category: 'Starters',
    tags: ['V'],
  },
  {
    id: 's2',
    name: 'Burrata & Heirloom Tomatoes',
    description: 'Calabrian chili oil, aged balsamic, Sicilian sea salt.',
    price: '$18',
    category: 'Starters',
    tags: ['V', 'GF'],
  },
  {
    id: 's3',
    name: 'Crispy Calamari',
    description: 'Lemon-herb aioli, pickled pepperoncini, fresh herbs.',
    price: '$17',
    category: 'Starters',
  },
  {
    id: 's4',
    name: 'French Onion Soup',
    description: 'Caramelised onion, Gruyère croûte, sherry.',
    price: '$14',
    category: 'Starters',
    tags: ['V'],
  },
  {
    id: 'm1',
    name: 'Braised Short Rib',
    description: '72-hour red wine braise, celery root purée, crispy shallots.',
    price: '$42',
    category: 'Mains',
    tags: ['GF'],
  },
  {
    id: 'm2',
    name: 'Miso Glazed Salmon',
    description: 'Wild king salmon, sesame bok choy, dashi broth.',
    price: '$36',
    category: 'Mains',
    tags: ['GF'],
  },
  {
    id: 'm3',
    name: 'Seasonal Risotto',
    description: 'Carnaroli, roasted butternut, sage brown butter, Parmigiano.',
    price: '$28',
    category: 'Mains',
    tags: ['V', 'GF'],
  },
  {
    id: 'm4',
    name: 'Duck Confit',
    description: 'Preserved lemon, flageolet beans, pickled mustard seed jus.',
    price: '$44',
    category: 'Mains',
    tags: ['GF'],
  },
  {
    id: 'd1',
    name: 'Dark Chocolate Soufflé',
    description: 'Valrhona 72%, Grand Marnier crème anglaise (allow 18 min).',
    price: '$14',
    category: 'Desserts',
    tags: ['V'],
  },
  {
    id: 'd2',
    name: 'Affogato',
    description: 'House-churned vanilla gelato, double espresso, amaretti.',
    price: '$10',
    category: 'Desserts',
    tags: ['V', 'GF'],
  },
  {
    id: 'd3',
    name: 'Tarte Tatin',
    description: 'Caramelised apple, puff pastry, vanilla Chantilly.',
    price: '$12',
    category: 'Desserts',
    tags: ['V'],
  },
  {
    id: 'dr1',
    name: 'Natural Wines',
    description: 'Curated biodynamic & natural producers. Ask your server.',
    price: 'from $14',
    category: 'Drinks',
  },
  {
    id: 'dr2',
    name: 'Classic Negroni',
    description: 'Campari, Tanqueray, Martini Rosso, orange peel.',
    price: '$16',
    category: 'Drinks',
  },
  {
    id: 'dr3',
    name: 'House Spritz',
    description: 'Aperol, prosecco, blood orange, fresh herbs.',
    price: '$13',
    category: 'Drinks',
  },
];

const CATEGORIES = ['All', 'Starters', 'Mains', 'Desserts', 'Drinks'] as const;
type Category = (typeof CATEGORIES)[number];

const TAG_STYLES: Record<string, React.CSSProperties> = {
  V: { color: 'var(--color-ember-500, #a96840)', borderColor: 'rgba(169,104,64,0.28)' },
  GF: { color: 'var(--color-gold-600, #9a7a0e)', borderColor: 'rgba(184,150,31,0.28)' },
};

// ── Menu row ──────────────────────────────────────────────────────────────────

function MenuRow({ entry, delay }: { entry: MenuEntry; delay: number }) {
  return (
    // AnimatePresence child — initial/animate/exit handle entrance+exit
    <m.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8, transition: { duration: 0.2 } }}
      transition={{ duration: 0.38, ease: EL, delay }}
      className="flex items-start justify-between gap-4 py-4 last:border-b-0"
      style={{ borderBottom: '1px solid rgba(212,175,55,0.10)' }}
      role="listitem"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex flex-wrap items-center gap-2">
          <span
            className="font-display leading-snug"
            style={{ fontSize: '1.05rem', color: 'var(--color-ink-900, #1c1c1c)' }}
          >
            {entry.name}
          </span>
          {entry.tags?.map((t) => (
            <span
              key={t}
              className="rounded-full border px-1.5 py-0.5 font-body
                         text-[0.55rem] font-medium uppercase tracking-widest"
              style={
                TAG_STYLES[t] ?? {
                  color: 'var(--color-ink-400, #a89888)',
                  borderColor: 'rgba(168,152,136,0.28)',
                }
              }
            >
              {t}
            </span>
          ))}
        </div>
        <p className="font-body text-[0.8rem] font-light leading-relaxed text-ink-400">
          {entry.description}
        </p>
      </div>

      <span
        className="mt-0.5 shrink-0 font-serif font-light"
        style={{ fontSize: '1.18rem', color: 'var(--color-ember-500, #a96840)' }}
      >
        {entry.price}
      </span>
    </m.div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <m.p
      key="empty"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="py-14 text-center font-serif italic"
      style={{ fontSize: '1.1rem', color: 'var(--color-ink-400, #a89888)' }}
    >
      No dishes match your search.
    </m.p>
  );
}

// ── Category tab ──────────────────────────────────────────────────────────────

function Tab({ cat, active, onClick }: { cat: Category; active: boolean; onClick: () => void }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        'relative shrink-0 rounded-full font-body text-[0.70rem] font-medium',
        'uppercase tracking-widest px-4 py-1.5 transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        active ? 'text-white shadow-sm' : 'border',
      ].join(' ')}
      style={
        active
          ? { background: 'var(--color-ember-500, #a96840)', borderColor: 'transparent' }
          : { borderColor: 'rgba(138,122,106,0.22)', color: 'var(--color-ink-400, #a89888)' }
      }
    >
      {cat}
      {active && (
        <m.span
          layoutId="tab-indicator"
          className="absolute inset-0 -z-10 rounded-full"
          style={{ background: 'var(--color-ember-500, #a96840)' }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        />
      )}
    </button>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export interface MenuSectionProps {
  entries?: MenuEntry[];
}

export function MenuSection({ entries = ENTRIES }: MenuSectionProps) {
  const [activeCategory, setActiveCategory] = useState<Category>('All');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list =
      activeCategory === 'All' ? entries : entries.filter((e) => e.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [entries, activeCategory, search]);

  return (
    <section
      id="full-menu"
      aria-labelledby="menu-section-heading"
      className="section-wrap px-5 py-16 sm:py-24 sm:px-8 md:px-12"
      style={{ background: 'var(--color-cream-300, #ede0ce)' }}
    >
      <div className="mx-auto max-w-3xl">
        {/* Header — initial required */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={SECTION_VIEWPORT}
          transition={{ duration: 0.65, ease: EL }}
          className="mb-8 flex flex-col gap-2.5"
        >
          <SectionLabel>Full Menu</SectionLabel>
          <h2
            id="menu-section-heading"
            className="font-display leading-[1.05] tracking-[-0.02em]"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', color: 'var(--color-ink-900, #1c1c1c)' }}
          >
            What We{' '}
            <em
              className="font-display italic"
              style={{ fontStyle: 'italic', color: 'var(--color-ember-500, #a96840)' }}
            >
              Serve
            </em>
          </h2>
        </m.div>

        {/* Search — initial required */}
        <m.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={SECTION_VIEWPORT}
          transition={{ duration: 0.55, ease: EL, delay: 0.1 }}
          className="relative mb-5"
        >
          <span
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm"
            style={{ color: 'var(--color-ink-300, #c8b8a8)' }}
            aria-hidden="true"
          >
            🔍
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dishes, ingredients…"
            aria-label="Search the menu"
            className="w-full rounded-full border bg-white py-2.5 pl-10 pr-4
                       font-body text-[0.875rem] outline-none
                       placeholder:text-ink-300 transition-[border-color,box-shadow] duration-200
                       sm:max-w-xs"
            style={{
              borderColor: 'rgba(138,122,106,0.22)',
              color: 'var(--color-ink-900, #1c1c1c)',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'var(--color-gold-400, #d4af37)';
              e.target.style.boxShadow = '0 0 0 3px rgba(212,175,55,0.14)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(138,122,106,0.22)';
              e.target.style.boxShadow = 'none';
            }}
          />
        </m.div>

        {/* Tabs — initial required */}
        <m.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={SECTION_VIEWPORT}
          transition={{ duration: 0.55, ease: EL, delay: 0.18 }}
          role="tablist"
          aria-label="Menu categories"
          className="mb-6 flex gap-2 overflow-x-auto pb-1 scrollbar-none"
        >
          {CATEGORIES.map((cat) => (
            <Tab
              key={cat}
              cat={cat}
              active={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
            />
          ))}
        </m.div>

        {/* Menu list */}
        <div
          role="list"
          aria-label={`${activeCategory} menu items`}
          aria-live="polite"
          aria-atomic="false"
        >
          <AnimatePresence mode="popLayout">
            {filtered.length > 0 ? (
              filtered.map((entry, i) => <MenuRow key={entry.id} entry={entry} delay={i * 0.035} />)
            ) : (
              <EmptyState key="empty" />
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

export default MenuSection;