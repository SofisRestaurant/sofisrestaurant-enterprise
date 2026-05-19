import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { fadeUp } from './animations';

type CheckoutFooterProps = {
  isAuthenticated: boolean;
};

export function CheckoutFooter({ isAuthenticated }: CheckoutFooterProps) {
  return (
    <motion.div
      custom={7}
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="lg:col-span-2"
    >
      <div className="px-1 py-4 text-center">
        <p className="text-xs text-ink-400">
          Need help?{' '}
          <a
            href="mailto:sofisrestaurante@gmail.com"
            className="font-semibold underline decoration-cream-300 underline-offset-4 transition hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-600/40"
          >
            Email us
          </a>
          {' · '}
          <Link
            to="/contact"
            className="font-semibold underline decoration-cream-300 underline-offset-4 transition hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-600/40"
          >
            Contact form
          </Link>
          {isAuthenticated ? (
            <>
              {' · '}
              <Link
                to="/account/orders"
                className="font-semibold underline decoration-cream-300 underline-offset-4 transition hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-600/40"
              >
                Order history
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </motion.div>
  );
}
