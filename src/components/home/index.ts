// src/components/home/index.ts
// ─── Barrel export for all home section components ───────────────────────────
// Import from '@/components/home' instead of individual files.

export { HeroSection }           from './HeroSection';
export type { HeroSectionProps } from './HeroSection';

export { MarqueeStrip }   from './MarqueeStrip';
export { SlideDots }      from './SlideDots';
export { FeaturedMenu }   from './FeaturedMenu';
export type { MenuItem }  from './FeaturedMenu';

export { MenuSection }    from './MenuSection';
export type { MenuEntry, MenuSectionProps } from './MenuSection';

export { Hours }          from './Hours';
export type { HoursProps } from './Hours';

export { HouseRules }     from './HouseRules';
export type { HouseRulesProps, Rule } from './HouseRules';

export { Testimonials }   from './Testimonials';
export type { TestimonialsProps } from './Testimonials';
