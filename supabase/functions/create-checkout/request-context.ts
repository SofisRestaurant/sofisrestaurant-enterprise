export function getRequestIp(req: Request): string | null {
  const forwardedFor = req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for");

  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    return first || null;
  }

  const realIp = req.headers.get("x-real-ip");
  return realIp?.trim() || null;
}
