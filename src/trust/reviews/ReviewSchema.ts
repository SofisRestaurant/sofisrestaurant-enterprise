// src/trust/reviews/ReviewSchema.ts
export interface Review {
  id: string
  userId: string
  userName: string
  rating: number
  title: string
  content: string
  createdAt: string
  verified: boolean
}