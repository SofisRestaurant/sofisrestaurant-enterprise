// src/contracts/api/api-response.ts
export type ApiResponse<T> = {
  success: boolean
  data: T | null
  error: string | null
}