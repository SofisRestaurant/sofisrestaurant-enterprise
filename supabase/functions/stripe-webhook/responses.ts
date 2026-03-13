const JSON_HEADERS: HeadersInit = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function jsonResponse(
  body: unknown,
  status: number,
  requestId: string,
): Response {
  const headers = new Headers(JSON_HEADERS);
  headers.set("X-Request-Id", requestId);

  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}
