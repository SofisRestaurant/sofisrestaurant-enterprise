// src/lib/api/fetcher.ts

export async function fetcher<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new APIError(response.status, `HTTP error! status: ${response.status}`);
  }

  // response.json() is typed as Promise<any> in TypeScript's DOM lib because
  // the runtime has no way to verify the response shape matches T. The cast to
  // Promise<T> is correct here — the generic parameter is the caller's contract,
  // and this is the standard pattern for typed fetch wrappers.
  return response.json() as Promise<T>;
}

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'APIError';
  }
}