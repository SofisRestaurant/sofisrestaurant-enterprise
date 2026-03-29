// src/components/ui/LuxuryButton.tsx
// ─── Premium CTA button with gold shimmer and spring hover ────────────────

import React from 'react';
import { motion, MotionConfig, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { EASE_SPRING } from '@/lib/motion';

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
  gold: 'bg-[#D4AF37] text-[#1C1C1C] hover:bg-[#E8C46A]',
  'outline-gold':
    'border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/8 hover:border-[#D4AF37]',
  'outline-white':
    'border border-white/30 text-white/85 hover:border-[#D4AF37] hover:text-[#E8C46A]',
  ember: 'bg-[#A84520] text-white hover:bg-[#C25520]',
  white: 'bg-white text-[#A84520] hover:bg-white/90',
};

const SIZE_STYLES = {
  sm: 'px-5 py-2.5 text-[0.7rem] tracking-[0.14em]',
  md: 'px-7 py-3.5 text-[0.78rem] tracking-[0.12em]',
  lg: 'px-9 py-4 text-[0.82rem] tracking-[0.12em]',
};

// Hover shadows in OKLCH color space for smooth perceptual shimmer
const HOVER_SHADOW: Record<ButtonVariant, string> = {
  gold: '0 8px 30px oklch(80% 0.15 45deg / 0.35)',
  'outline-gold': '0 4px 18px oklch(80% 0.05 45deg / 0.15)',
  'outline-white': '0 4px 18px oklch(100% 0 0 / 0.08)',
  ember: '0 8px 30px oklch(50% 0.15 25deg / 0.35)',
  white: '0 8px 30px oklch(100% 0 0 / 0.22)',
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
  const shouldReduceMotion = useReducedMotion() ?? false;

  const baseClasses = [
    'inline-flex items-center justify-center gap-2.5 rounded-full font-body font-medium uppercase',
    'transition-colors duration-300',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2',
    VARIANT_STYLES[variant],
    SIZE_STYLES[size],
    className,
  ].join(' ');

  const motionProps = shouldReduceMotion
    ? {} // Do not animate if reduced motion is enabled
    : {
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

  // motion.create() Link for router
  const MotionLink = motion.create(Link);

  if (href) {
    return (
      <MotionConfig reducedMotion="user">
        <MotionLink to={href} aria-label={ariaLabel} className={baseClasses} {...motionProps}>
          {content}
        </MotionLink>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <motion.button
        onClick={onClick}
        aria-label={ariaLabel}
        className={baseClasses}
        {...motionProps}
      >
        {content}
      </motion.button>
    </MotionConfig>
  );
}

export default LuxuryButton;