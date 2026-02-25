// src/features/restaurant/deliveryPartners.ts
export interface DeliveryPartner {
  id: string
  name: string
  url: string
  logo?: string
  estimatedTime: string
  deliveryFee: number
}

export const deliveryPartners: DeliveryPartner[] = [
  {
    id: 'uber-eats',
    name: 'Uber Eats',
    url: 'https://www.ubereats.com',
    estimatedTime: '25-35 min',
    deliveryFee: 3.99,
  },
  {
    id: 'doordash',
    name: 'DoorDash',
    url: 'https://www.doordash.com',
    estimatedTime: '30-40 min',
    deliveryFee: 4.99,
  },
  {
    id: 'grubhub',
    name: 'Grubhub',
    url: 'https://www.grubhub.com',
    estimatedTime: '35-45 min',
    deliveryFee: 2.99,
  },
]

export function getDeliveryPartner(id: string): DeliveryPartner | undefined {
  return deliveryPartners.find((partner) => partner.id === id)
}