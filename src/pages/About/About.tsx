
// src/pages/About/About.tsx
export default function About() {
  return (
    <section className="bg-linear-to-b from-primary-light/10 to-white py-20">
      <div className="container mx-auto max-w-6xl px-6">
        {/* Main heading */}
        <h1 className="text-5xl md:text-6xl font-serif font-bold text-primary text-center mb-12">
          About Sofi's Restaurant
        </h1>

        {/* Intro paragraph */}
        <p className="text-lg md:text-xl text-gray-700 text-center max-w-3xl mx-auto mb-16">
          Welcome to Sofi's Restaurant — where passion meets flavor. Since 2020, we've been serving our community with authentic, mouthwatering cuisine crafted from the freshest ingredients.
        </p>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
          <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow-xl p-8 flex flex-col justify-between hover:scale-105 transition-transform duration-300">
            <div className="text-6xl mb-4 text-primary text-center">🍴</div>
            <h3 className="text-2xl font-semibold mb-2 text-center">Fresh Ingredients</h3>
            <p className="text-gray-700 text-center">
              Every dish is crafted using locally sourced, high-quality ingredients for maximum flavor.
            </p>
          </div>

          <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow-xl p-8 flex flex-col justify-between hover:scale-105 transition-transform duration-300">
            <div className="text-6xl mb-4 text-success text-center">🌿</div>
            <h3 className="text-2xl font-semibold mb-2 text-center">Sustainable Practices</h3>
            <p className="text-gray-700 text-center">
              We care for the planet while delivering an unforgettable dining experience.
            </p>
          </div>

          <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow-xl p-8 flex flex-col justify-between hover:scale-105 transition-transform duration-300">
            <div className="text-6xl mb-4 text-error text-center">❤️</div>
            <h3 className="text-2xl font-semibold mb-2 text-center">Community Focused</h3>
            <p className="text-gray-700 text-center">
              Sofi's is more than a restaurant — it's a gathering place for memories and connections.
            </p>
          </div>
        </div>

        {/* Closing paragraph */}
        <p className="mt-16 text-lg md:text-xl text-gray-700 text-center max-w-3xl mx-auto">
          From the first bite to the last, we aim to delight every sense and leave you craving your next visit. Sofi's Restaurant isn’t just about food — it’s about experiences.
        </p>
      </div>
    </section>
  )
}