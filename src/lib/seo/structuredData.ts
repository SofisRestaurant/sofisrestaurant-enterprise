// src/lib/seo/structuredData.ts
export function getRestaurantSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: "Sofi's Restaurant",
    image: 'https://sofisrestaurant.com/logo.jpg',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '123 Main Street',
      addressLocality: 'Phoenix',
      addressRegion: 'AZ',
      postalCode: '85001',
      addressCountry: 'US',
    },
    telephone: '(555) 123-4567',
    servesCuisine: 'Italian, Mediterranean',
    priceRange: '$$',
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
        opens: '11:00',
        closes: '22:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Friday', 'Saturday'],
        opens: '11:00',
        closes: '23:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Sunday',
        opens: '10:00',
        closes: '21:00',
      },
    ],
  }
}