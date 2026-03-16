// src/components/ui/SectionLabel.tsx
// ─── Eyebrow / overline label above section headings ─────────────────────────

import React, { type ReactNode } from 'react';
import { m } from 'framer-motion';
import { EASE_LUXURY } from '@/lib/motion';

export interface SectionLabelProps {
  children: ReactNode;
  centered?: boolean;
  theme?: 'light' | 'dark';
  className?: string;
  animate?: boolean;
}

export function SectionLabel({
  children,
  centered = false,
  theme = 'light',
  className = '',
  animate = false,
}: SectionLabelProps) {
  const base = [
    'inline-flex items-center gap-2.5 text-[0.6rem] font-body font-medium',
    'tracking-[0.22em] uppercase',
    theme === 'dark' ? 'text-[#E8C46A]' : 'text-[#D4AF37]',
    centered ? 'justify-center' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const inner = (
    <>
      <span
        aria-hidden="true"
        className={`block h-px w-5 ${theme === 'dark' ? 'bg-[#E8C46A]' : 'bg-[#D4AF37]'}`}
      />
      {children}
      {centered && (
        <span
          aria-hidden="true"
          className={`block h-px w-5 ${theme === 'dark' ? 'bg-[#E8C46A]' : 'bg-[#D4AF37]'}`}
        />
      )}
    </>
  );

  if (animate) {
    return (
      <m.p
        className={base}
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.55, ease: EASE_LUXURY }}
      >
        {inner}
      </m.p>
    );
  }

  return <p className={base}>{inner}</p>;
}

export default SectionLabel;