// src/components/ui/LuxuryButton.tsx
// ─── Premium CTA button with gold shimmer and spring hover ───────────────────

import React from 'react';
import { m } from 'framer-motion';
import {EASE_SPRING } from '@/lib/motion';
import { Link } from 'react-router-dom';

type ButtonVariant = 'gold' | 'outline-gold' | 'outline-white' | 'ember' | 'white';

export interface LuxuryButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  href?: string;
  onClick?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  'aria-label'?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  gold: 'bg-[#D4AF37] text-[#1C1C1C] hover:bg-[#E8C46A] shadow-[0_4px_20px_rgba(212,175,55,0.25)]',
  'outline-gold': 'border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/8 hover:border-[#D4AF37]',
  'outline-white': 'border border-white/30 text-white/85 hover:border-[#D4AF37] hover:text-[#E8C46A]',
  ember: 'bg-[#A84520] text-white hover:bg-[#C25520] shadow-[0_4px_20px_rgba(168,69,32,0.25)]',
  white: 'bg-white text-[#A84520] hover:bg-white/90 shadow-[0_4px_20px_rgba(255,255,255,0.15)]',
};

const SIZE_STYLES = {
  sm: 'px-5 py-2.5 text-[0.7rem] tracking-[0.14em]',
  md: 'px-7 py-3.5 text-[0.78rem] tracking-[0.12em]',
  lg: 'px-9 py-4 text-[0.82rem] tracking-[0.12em]',
};

const HOVER_SHADOW: Record<ButtonVariant, string> = {
  gold: '0 8px 30px rgba(212,175,55,0.35)',
  'outline-gold': '0 4px 18px rgba(212,175,55,0.15)',
  'outline-white': '0 4px 18px rgba(255,255,255,0.08)',
  ember: '0 8px 30px rgba(168,69,32,0.35)',
  white: '0 8px 30px rgba(255,255,255,0.22)',
};

export function LuxuryButton({
  children,
  variant = 'gold',
  href,
  onClick,
  className = '',
  size = 'md',
  'aria-label': ariaLabel,
  icon,
  iconPosition = 'right',
}: LuxuryButtonProps) {
  const base = [
    'inline-flex items-center justify-center gap-2.5',
    'rounded-full font-body font-medium uppercase',
    'transition-colors duration-300',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2',
    VARIANT_STYLES[variant],
    SIZE_STYLES[size],
    className,
  ].join(' ');

  const motionProps = {
    whileHover: { scale: 1.03, boxShadow: HOVER_SHADOW[variant] },
    whileTap: { scale: 0.97 },
    transition: { duration: 0.2, ease: EASE_SPRING },
  };

  const content = (
    <>
      {icon && iconPosition === 'left' && icon}
      {children}
      {icon && iconPosition === 'right' && icon}
    </>
  );

  if (href) {
    const MotionLink = m(Link);
    return (
      <MotionLink
        to={href}
        aria-label={ariaLabel}
        className={base}
        {...motionProps}
      >
        {content}
      </MotionLink>
    );
  }

  return (
    <m.button
      onClick={onClick}
      aria-label={ariaLabel}
      className={base}
      {...motionProps}
    >
      {content}
    </m.button>
  );
}

export default LuxuryButton;