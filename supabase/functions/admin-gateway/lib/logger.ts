import { service } from "./service.ts";

export async function logRequest(
  userId: string,
  action: string,
  req: Request
) {
  await service.from("internal.admin_access_logs").insert({
    user_id: userId,
    action,
    ip_address: req.headers.get("x-forwarded-for"),
    user_agent: req.headers.get("user-agent"),
  });
}