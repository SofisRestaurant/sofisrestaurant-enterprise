import { createClient } from "@supabase/supabase-js";

export async function verifyAdmin(authHeader: string) {
  const token = authHeader.replace("Bearer ", "");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) throw new Error("Unauthorized");

  const { data: isAdmin } = await supabase.rpc("is_admin", {
    uid: user.id,
  });

  if (!isAdmin) throw new Error("Forbidden");

  return { user };
}