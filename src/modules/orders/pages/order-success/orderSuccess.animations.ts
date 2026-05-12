// src/modules/orders/pages/order-success/orderSuccess.animations.ts
// Framer Motion variant objects for the OrderSuccess feature.
// Extracted to keep the main page file focused on orchestration.

export const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.1,
    },
  },
};

export const itemVariants = {
  hidden: {
    opacity: 0,
    y: 'var(--entry-y, 18px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 340,
      damping: 28,
    },
  },
};

export const checkIconVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: 'spring' as const, stiffness: 500, damping: 22, delay: 0.05 },
  },
};

export const btnVariants = {
  rest: { scale: 1 },
  hover: { scale: 1.025 },
  tap: { scale: 0.97 },
};