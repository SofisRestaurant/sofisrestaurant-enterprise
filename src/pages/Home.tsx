import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import FeaturedMenu from '@/components/home/FeaturedMenu';
import Hours from '@/components/home/Hours';
import HouseRules from '@/components/home/HouseRules';

const HOME_FEATURES = [
  {
    id: 'fast-delivery',
    title: 'Fast Delivery',
    desc: 'Hot and fresh meals delivered in 30–45 minutes.',
  },
  {
    id: 'premium-ingredients',
    title: 'Premium Ingredients',
    desc: 'Locally sourced and carefully selected ingredients.',
  },
  {
    id: 'satisfaction-guaranteed',
    title: 'Satisfaction Guaranteed',
    desc: 'If you don’t love it, we’ll make it right.',
  },
] as const;

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]">
      {/* HERO */}
      <section className="relative overflow-hidden bg-[rgb(var(--surface-inverse))] py-28 text-[rgb(var(--text-inverse))]">
        <div className="absolute inset-0 bg-linear-to-br from-[rgb(var(--brand-primary))]/90 to-[rgb(var(--brand-accent))]/80 opacity-90" />

        <div className="relative container-custom text-center">
          <h1 className="mb-6 text-5xl font-bold leading-tight md:text-6xl">Sofi’s Restaurant</h1>

          <p className="mx-auto mb-10 max-w-2xl text-xl text-white/90 md:text-2xl">
            Authentic flavors. Fresh ingredients. A dining experience made with heart.
          </p>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link to="/menu">
              <Button size="lg" className="w-full sm:w-auto">
                View Menu
              </Button>
            </Link>

            <Link to="/reservations">
              <Button
                variant="secondary"
                size="lg"
                className="w-full bg-white text-[rgb(var(--brand-primary))] hover:bg-gray-100 sm:w-auto"
              >
                Make Reservation
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="bg-[rgb(var(--surface-2))] py-24">
        <div className="container-custom">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
            {HOME_FEATURES.map((item) => (
              <div key={item.id} className="card card-hover bg-[rgb(var(--surface-1))] text-center">
                <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[rgb(var(--brand-primary))] text-white shadow-md">
                  ★
                </div>

                <h3 className="mb-3 text-xl font-semibold">{item.title}</h3>

                <p className="text-[rgb(var(--text-secondary))]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED MENU */}
      <section className="bg-[rgb(var(--surface-1))] py-24">
        <div className="container-custom">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold">Featured Dishes</h2>
            <p className="text-lg text-[rgb(var(--text-secondary))]">
              Hand-selected favorites from our kitchen
            </p>
          </div>

          <FeaturedMenu />

          <div className="mt-12 text-center">
            <Link to="/menu">
              <Button size="lg">See Full Menu</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* HOURS */}
      <section className="bg-[rgb(var(--surface-2))] py-24">
        <div className="container-custom max-w-2xl">
          <h2 className="mb-12 text-center text-4xl font-bold">Hours of Operation</h2>
          <Hours />
        </div>
      </section>

      {/* HOUSE RULES */}
      <section className="bg-[rgb(var(--surface-1))] py-24">
        <div className="container-custom max-w-3xl">
          <h2 className="mb-12 text-center text-4xl font-bold">House Rules</h2>
          <HouseRules />
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-[rgb(var(--brand-primary))] py-28 text-center text-black">
        <div className="container-custom max-w-2xl">
          <h2 className="mb-6 text-4xl font-bold">Ready to Order?</h2>

          <p className="mb-10 text-lg text-white/90">
            Browse our menu and enjoy Sofi’s delivered to your table.
          </p>

          <Link to="/menu">
            <Button
              size="lg"
              variant="secondary"
              className="bg-white text-[rgb(var(--brand-primary))] hover:bg-gray-100"
            >
              Order Now
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
