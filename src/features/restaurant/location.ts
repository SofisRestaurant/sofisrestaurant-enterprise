// src/features/restaurant/location.ts
export interface Location {
  name: string
  address: string
  city: string
  state: string
  zip: string
  country: string
  phone: string
  email: string
  coordinates?: {
    lat: number
    lng: number
  }
}

export const restaurantLocation: Location = {
  name: "Sofi's Restaurant",
  address: '123 Main Street',
  city: 'Phoenix',
  state: 'Arizona',
  zip: '85001',
  country: 'United States',
  phone: '(555) 123-4567',
  email: 'info@sofisrestaurant.com',
  coordinates: {
    lat: 33.4484,
    lng: -112.0740,
  },
}

export function getGoogleMapsUrl(): string {
  const { address, city, state, zip } = restaurantLocation
  const query = encodeURIComponent(`${address}, ${city}, ${state} ${zip}`)
  return `https://www.google.com/maps/search/?api=1&query=${query}`
}

export function getFullAddress(): string {
  const { address, city, state, zip } = restaurantLocation
  return `${address}, ${city}, ${state} ${zip}`
}