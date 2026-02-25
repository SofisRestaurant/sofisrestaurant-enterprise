import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import FeaturedMenu from '@/components/home/FeaturedMenu'
import Hours from '@/components/home/Hours'
import HouseRules from '@/components/home/HouseRules'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[rgb(var(--surface-2))] text-[rgb(var(--text-primary))]">

      {/* HERO */}
      <section className="relative overflow-hidden py-28 bg-[rgb(var(--surface-inverse))] text-[rgb(var(--text-inverse))]">
        <div className="absolute inset-0 bg-linear-to-br from-[rgb(var(--brand-primary))]/90 to-[rgb(var(--brand-accent))]/80 opacity-90" />

        <div className="relative container-custom text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Sofi’s Restaurant
          </h1>

          <p className="text-xl md:text-2xl mb-10 text-white/90 max-w-2xl mx-auto">
            Authentic flavors. Fresh ingredients. A dining experience made with heart.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/menu">
              <Button size="lg" className="w-full sm:w-auto">
                View Menu
              </Button>
            </Link>

            <Link to="/reservations">
              <Button
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto bg-white text-[rgb(var(--brand-primary))] hover:bg-gray-100"
              >
                Make Reservation
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-24 bg-[rgb(var(--surface-2))]">
        <div className="container-custom">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">

            {[
              {
                title: 'Fast Delivery',
                desc: 'Hot and fresh meals delivered in 30–45 minutes.',
              },
              {
                title: 'Premium Ingredients',
                desc: 'Locally sourced and carefully selected ingredients.',
              },
              {
                title: 'Satisfaction Guaranteed',
                desc: 'If you don’t love it, we’ll make it right.',
              },
            ].map((item, i) => (
              <div
                key={i}
                className="card card-hover text-center bg-[rgb(var(--surface-1))]"
              >
                <div className="w-14 h-14 mx-auto mb-6 rounded-full flex items-center justify-center bg-[rgb(var(--brand-primary))] text-white shadow-md">
                  ★
                </div>

                <h3 className="text-xl font-semibold mb-3">
                  {item.title}
                </h3>

                <p className="text-[rgb(var(--text-secondary))]">
                  {item.desc}
                </p>
              </div>
            ))}

          </div>
        </div>
      </section>

      {/* FEATURED MENU */}
      <section className="py-24 bg-[rgb(var(--surface-1))]">
        <div className="container-custom">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">
              Featured Dishes
            </h2>
            <p className="text-[rgb(var(--text-secondary))] text-lg">
              Hand-selected favorites from our kitchen
            </p>
          </div>

          <FeaturedMenu />

          <div className="text-center mt-12">
            <Link to="/menu">
              <Button size="lg">
                See Full Menu
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* HOURS */}
      <section className="py-24 bg-[rgb(var(--surface-2))]">
        <div className="container-custom max-w-2xl">
          <h2 className="text-4xl font-bold text-center mb-12">
            Hours of Operation
          </h2>
          <Hours />
        </div>
      </section>

      {/* HOUSE RULES */}
      <section className="py-24 bg-[rgb(var(--surface-1))]">
        <div className="container-custom max-w-3xl">
          <h2 className="text-4xl font-bold text-center mb-12">
            House Rules
          </h2>
          <HouseRules />
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-28 bg-[rgb(var(--brand-primary))] text-black text-center">
        <div className="container-custom max-w-2xl">
          <h2 className="text-4xl font-bold mb-6">
            Ready to Order?
          </h2>

          <p className="text-lg mb-10 text-white/90">
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
  )
}