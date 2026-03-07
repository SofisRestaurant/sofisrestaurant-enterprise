// PATH: supabase/functions/admin-gateway/routes.ts

import { service } from "./lib/service.ts";

import {
  listCampaigns,
  toggleCampaign,
  runCampaignRotation,
} from "./actions/campaigns.ts";

import {
  listPromos,
  togglePromo,
} from "./actions/promos.ts";

/*
|--------------------------------------------------------------------------
| Action Types
|--------------------------------------------------------------------------
*/

export type AdminAction =
  | "metrics"
  | "orders:list"
  | "campaigns:list"
  | "campaigns:toggle"
  | "campaigns:run-rotation"
  | "promos:list"
  | "promos:toggle";

/*
|--------------------------------------------------------------------------
| Payload Types
|--------------------------------------------------------------------------
*/

export interface OrdersListPayload {
  page?: number;
}

export interface ToggleCampaignPayload {
  id: string;
  active: boolean;
}

export interface TogglePromoPayload {
  id: string;
  active: boolean;
}

export type ActionPayloadMap = {
  "metrics": undefined;
  "orders:list": OrdersListPayload;

  "campaigns:list": undefined;
  "campaigns:toggle": ToggleCampaignPayload;
  "campaigns:run-rotation": undefined;

  "promos:list": undefined;
  "promos:toggle": TogglePromoPayload;
};

/*
|--------------------------------------------------------------------------
| Result Types
|--------------------------------------------------------------------------
*/

export type ActionResultMap = {
  "metrics": unknown;
  "orders:list": unknown[];

  "campaigns:list": Awaited<ReturnType<typeof listCampaigns>>;
  "campaigns:toggle": Awaited<ReturnType<typeof toggleCampaign>>;
  "campaigns:run-rotation": Awaited<ReturnType<typeof runCampaignRotation>>;

  "promos:list": Awaited<ReturnType<typeof listPromos>>;
  "promos:toggle": Awaited<ReturnType<typeof togglePromo>>;
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
      return await listOrders(payload as OrdersListPayload) as ActionResultMap[T];

    /*
    |--------------------------------------------------------------------------
    | Campaigns
    |--------------------------------------------------------------------------
    */

    case "campaigns:list":
      return await listCampaigns() as ActionResultMap[T];

    case "campaigns:toggle":
      return await toggleCampaign(payload as ToggleCampaignPayload) as ActionResultMap[T];

    case "campaigns:run-rotation":
      return await runCampaignRotation() as ActionResultMap[T];

    /*
    |--------------------------------------------------------------------------
    | Promos
    |--------------------------------------------------------------------------
    */

    case "promos:list":
      return await listPromos() as ActionResultMap[T];

    case "promos:toggle":
      return await togglePromo(payload as TogglePromoPayload) as ActionResultMap[T];

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

  if (error) {
    throw Object.assign(new Error(error.message), { code: "DB_METRICS" });
  }

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

  if (error) {
    throw Object.assign(new Error(error.message), { code: "DB_ORDERS" });
  }

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