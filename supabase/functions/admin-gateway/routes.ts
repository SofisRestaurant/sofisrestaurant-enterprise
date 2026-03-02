// supabase/functions/admin-gateway/routes.ts
import { service } from "./lib/service.ts";

/*
|--------------------------------------------------------------------------
| Action Types
|--------------------------------------------------------------------------
*/

export type AdminAction =
  | "metrics"
  | "orders:list";

export interface OrdersListPayload {
  page?: number;
}

export type ActionPayloadMap = {
  "metrics": undefined;
  "orders:list": OrdersListPayload;
};

export type ActionResultMap = {
  "metrics": unknown;       // replace with your ExecutiveSnapshot type if you have it
  "orders:list": unknown[]; // replace with your Order row type if you have it
};

/*
|--------------------------------------------------------------------------
| Router
|--------------------------------------------------------------------------
| Strongly typed: action determines payload + return type
|--------------------------------------------------------------------------
*/

export async function route<T extends AdminAction>(
  action: T,
  payload: ActionPayloadMap[T],
): Promise<ActionResultMap[T]> {
  switch (action) {
    case "metrics":
      return await getMetrics() as ActionResultMap[T];

    case "orders:list":
      // payload is OrdersListPayload for this branch
      return await listOrders(payload as OrdersListPayload) as ActionResultMap[T];

    default:
      return assertNever(action);
  }
}

/*
|--------------------------------------------------------------------------
| Handlers
|--------------------------------------------------------------------------
*/

async function getMetrics(): Promise<unknown> {
  const { data, error } = await service
    .from("admin_executive_snapshot")
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Failed to load metrics: ${error.message}`);
  return data;
}

async function listOrders(payload: OrdersListPayload): Promise<unknown[]> {
  const page = clampInt(payload?.page ?? 0, 0, 10_000);
  const from = page * 25;
  const to = from + 24;

  const { data, error } = await service
    .from("orders")
    .select("*")
    .range(from, to)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list orders: ${error.message}`);
  return (data ?? []) as unknown[];
}

/*
|--------------------------------------------------------------------------
| Utils
|--------------------------------------------------------------------------
*/

function clampInt(v: unknown, min: number, max: number): number {
  const x = Number(v);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function assertNever(x: never): never {
  throw new Error(`Invalid action: ${String(x)}`);
}