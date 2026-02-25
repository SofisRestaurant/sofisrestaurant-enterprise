// src/lib/api/api.types.ts
export type ApiResponse<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string }

export const apiOk = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
  error: null,
})

export const apiFail = <T = never>(message: string): ApiResponse<T> => ({
  success: false,
  data: null,
  error: message,
})