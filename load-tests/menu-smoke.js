import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = "https://sofisrestaurant-enterprise.vercel.app";
const SUPABASE_URL = "https://veqcsijavjrygvogsqos.supabase.co";

const menu_page_failure_rate = new Rate("menu_page_failure_rate");
const featured_menu_failure_rate = new Rate("featured_menu_failure_rate");
const server_failure_rate = new Rate("server_failure_rate");

export const options = {
  stages: [
    { duration: "20s", target: 10 },
    { duration: "40s", target: 25 },
    { duration: "20s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000", "p(99)<5000"],

    menu_page_failure_rate: ["rate<0.05"],
    featured_menu_failure_rate: ["rate<0.05"],
    server_failure_rate: ["rate<0.02"],
  },
};

function safeJson(res) {
  try {
    return JSON.parse(res.body || "{}");
  } catch {
    return {};
  }
}

export default function () {
  const menuPage = http.get(`${BASE_URL}/menu`, {
    headers: {
      "User-Agent": "k6-menu-smoke-test",
    },
  });

  const menuPageOk = check(menuPage, {
    "menu page loaded": (r) => r.status === 200,
    "menu page under 3s": (r) => r.timings.duration < 3000,
    "menu page is html": (r) =>
      String(r.headers["Content-Type"] || "").includes("text/html"),
  });

  menu_page_failure_rate.add(!menuPageOk);
  server_failure_rate.add(menuPage.status >= 500);

  const featuredMenu = http.post(
    `${SUPABASE_URL}/functions/v1/get-featured-menu`,
    JSON.stringify({}),
    {
      headers: {
        "Content-Type": "application/json",
        Origin: BASE_URL,
        "x-request-id": `k6_menu_${Date.now()}_${Math.random()}`,
      },
    }
  );

  const body = safeJson(featuredMenu);

  const featuredMenuOk = check(featuredMenu, {
    "featured menu status ok": (r) => [200, 204, 304].includes(r.status),
    "featured menu not forbidden": (r) => r.status !== 403,
    "featured menu not unauthorized": (r) => r.status !== 401,
    "featured menu under 3s": (r) => r.timings.duration < 3000,
    "featured menu has response": () =>
      featuredMenu.status === 204 || featuredMenu.status === 304 || typeof body === "object",
  });

  featured_menu_failure_rate.add(!featuredMenuOk);
  server_failure_rate.add(featuredMenu.status >= 500);

  if (!menuPageOk || !featuredMenuOk || menuPage.status >= 500 || featuredMenu.status >= 500) {
    console.log(
      JSON.stringify({
        menuPageStatus: menuPage.status,
        menuPageDurationMs: Math.round(menuPage.timings.duration),
        featuredMenuStatus: featuredMenu.status,
        featuredMenuDurationMs: Math.round(featuredMenu.timings.duration),
        featuredMenuBody: String(featuredMenu.body || "").slice(0, 300),
      })
    );
  }

  sleep(1);
}