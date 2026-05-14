// src/modules/checkout/components/page/SectionCard.tsx

import { motion } from 'framer-motion';
import { cx } from './cx';
import { fadeUp } from './animations';

export function SectionCard({
  children,
  className = '',
  index = 0,
}: {
  children: React.ReactNode;
  className?: string;
  index?: number;
}) {
  return (
    <motion.section
      custom={index}
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className={cx(
        'overflow-hidden rounded-2xl border border-(--color-cream-300) bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]',
        className,
      )}
    >
      {children}
    </motion.section>
  );
}