import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const SUPABASE_URL = "https://veqcsijavjrygvogsqos.supabase.co";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/create-checkout`;

const ORIGIN = "https://sofisrestaurant-enterprise.vercel.app";
const AUTH_TOKEN = __ENV.AUTH_TOKEN;

// Real active menu item:
// Burger, $7.95
const MENU_ITEM_ID = __ENV.MENU_ITEM_ID || "7892cdca-56b0-4f8a-983b-f0835628b1a4";

// Must be above your $15 minimum order.
// 2 burgers = $15.90 before tax.
const ITEM_QUANTITY = Number(__ENV.ITEM_QUANTITY || 2);

// Optional safety mode.
// If DRY_RUN=true, the script still calls create-checkout, but your note makes it clear not to prepare.
// This does NOT stop Stripe sessions from being created.
const TEST_NOTE = "k6 load test, do not prepare";

const checkoutSuccessRate = new Rate("checkout_success_rate");
const authFailureRate = new Rate("auth_failure_rate");
const forbiddenRate = new Rate("forbidden_rate");
const rateLimitedRate = new Rate("rate_limited_rate");
const validationFailureRate = new Rate("validation_failure_rate");
const serverFailureRate = new Rate("server_failure_rate");

if (!AUTH_TOKEN) {
  throw new Error(
    "Missing AUTH_TOKEN. Run with: AUTH_TOKEN='paste_valid_access_token_here' k6 run load-tests/create-checkout-smoke.js"
  );
}

export const options = {
  stages: [
    { duration: "20s", target: 5 },
    { duration: "40s", target: 10 },
    { duration: "20s", target: 0 },
  ],

  thresholds: {
    // Performance
    http_req_duration: ["p(95)<3000", "p(99)<5000"],

    // Network/protocol failures only.
    // A 400/422 from your app is counted as failed by k6 unless handled carefully,
    // but we still track app-level success separately below.
    http_req_failed: ["rate<0.10"],

    // App-level health
    checkout_success_rate: ["rate>0.80"],
    auth_failure_rate: ["rate<0.01"],
    forbidden_rate: ["rate<0.01"],
    server_failure_rate: ["rate<0.05"],
  },
};

function buildPayload() {
  return JSON.stringify({
    items: [
      {
        id: MENU_ITEM_ID,
        quantity: ITEM_QUANTITY,
        modifiers: [],
      },
    ],
    order_type: "pickup",
    notes: TEST_NOTE,
  });
}

function buildHeaders() {
  return {
    "Content-Type": "application/json",
    "Origin": ORIGIN,
    "Authorization": `Bearer ${AUTH_TOKEN}`,
    "x-request-id": `k6_${Date.now()}_${Math.random().toString(16).slice(2)}`,
  };
}

function safeJson(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}

function getErrorCode(body) {
  return body?.error?.code || body?.code || null;
}

function getErrorMessage(body) {
  return body?.error?.message || body?.message || "";
}

export default function () {
  const res = http.post(FUNCTION_URL, buildPayload(), {
    headers: buildHeaders(),
    timeout: "10s",
  });

  const body = safeJson(res);
  const errorCode = getErrorCode(body);
  const errorMessage = getErrorMessage(body);

  const isSuccess = res.status === 200 && body?.ok === true && typeof body?.url === "string";

  const isAuthFailure = res.status === 401;
  const isForbidden = res.status === 403;
  const isRateLimited = res.status === 429;
  const isValidationFailure =
    res.status === 400 ||
    res.status === 422 ||
    errorCode === "validation_failed" ||
    errorCode === "pricing_failed";

  const isServerFailure = res.status >= 500 || res.status === 502;

  checkoutSuccessRate.add(isSuccess);
  authFailureRate.add(isAuthFailure);
  forbiddenRate.add(isForbidden);
  rateLimitedRate.add(isRateLimited);
  validationFailureRate.add(isValidationFailure);
  serverFailureRate.add(isServerFailure);

  if (!isSuccess) {
    console.log(
      JSON.stringify({
        status: res.status,
        errorCode,
        errorMessage,
        requestId: body?.error?.requestId || body?.requestId || null,
        durationMs: Math.round(res.timings.duration),
      })
    );
  }

  check(res, {
    "checkout created successfully": () => isSuccess,
    "not unauthorized": () => !isAuthFailure,
    "not forbidden": () => !isForbidden,
    "not server error": () => !isServerFailure,
    "response under 3s": (r) => r.timings.duration < 3000,
    "response has request id": () =>
      Boolean(body?.requestId || body?.error?.requestId),
  });

  sleep(1);
}