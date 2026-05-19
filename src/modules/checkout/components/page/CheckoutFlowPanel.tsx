import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { fadeUp } from './animations';
import { checkoutPanel } from './checkoutStyles';
import { cx } from './cx';

export function CheckoutFlowPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      custom={0}
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className={cx(checkoutPanel, className)}
    >
      {children}
    </motion.section>
  );
}
