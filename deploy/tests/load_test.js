import http from "k6/http";
import { check, sleep } from "k6";

function boundedInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, maximum);
}

const vus = boundedInteger(__ENV.VUS, 2, 25);
const durationSeconds = boundedInteger(__ENV.DURATION_SECONDS, 30, 300);
const schoolBases = (__ENV.SCHOOL_BASES || __ENV.BASE || "http://admin.perum.local")
  .split(",")
  .map((base) => base.trim().replace(/\/+$/, ""))
  .filter(Boolean);

if (schoolBases.length === 0 || schoolBases.length > 25) {
  throw new Error("SCHOOL_BASES must contain between 1 and 25 comma-separated URLs");
}

export const options = {
  vus,
  duration: `${durationSeconds}s`,
  thresholds: {
    http_req_duration: ["p(95)<800"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  for (const base of schoolBases) {
    const response = http.get(`${base}/health`, {
      redirects: 0,
      timeout: "10s",
      tags: { endpoint: "health" },
    });
    check(response, { "health is 200": (result) => result.status === 200 });
  }
  sleep(1);
}
