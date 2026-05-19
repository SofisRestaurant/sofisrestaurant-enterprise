import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { fadeUp } from './animations';
import { checkoutPanel } from './checkoutStyles';
import { cx } from './cx';

type CheckoutEmptyStateProps = {
  onBrowseMenu: () => void;
};

export function CheckoutEmptyState({ onBrowseMenu }: CheckoutEmptyStateProps) {
  return (
    <motion.section
      custom={0}
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className={cx(checkoutPanel, 'px-8 py-14 text-center')}
    >
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-ember-600">
        Your bag is empty
      </p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-ink-900">
        Add something delicious
      </h2>
      <p className="mt-2 text-sm text-ink-500">
        Browse the menu and come back when you are ready to checkout.
      </p>

      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <button type="button" onClick={onBrowseMenu} className="btn btn-primary px-6 py-3 text-sm">
          Browse menu
        </button>
        <Link to="/" className="btn btn-ghost px-6 py-3 text-sm">
          Back home
        </Link>
      </div>
    </motion.section>
  );
}
