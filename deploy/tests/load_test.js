// k6 нагрузочный тест (Фаза 10). Бьёт по дешёвым публичным эндпоинтам ядра и
// логину платформы — без мутаций (стеки не провижинятся под нагрузкой).
//
// Запуск (нужен установленный k6):
//   BASE=http://admin.perum.local k6 run deploy/tests/load_test.js
//
// Профиль: разгон до 50 VU за 30с, держим 1м, спуск. Пороги: p95 < 800ms, <1% ошибок.

import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE || "http://admin.perum.local";

export const options = {
  stages: [
    { duration: "30s", target: 50 },
    { duration: "1m", target: 50 },
    { duration: "15s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<800"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const health = http.get(`${BASE}/health`);
  check(health, { "health 200": (r) => r.status === 200 });

  // Неаутентифицированный запрос к защищённому ресурсу — должен быстро отбиваться 401.
  // 401 здесь ожидаем, поэтому помечаем как валидный статус (не «провал» запроса).
  const guarded = http.get(`${BASE}/api/organizations`, {
    responseCallback: http.expectedStatuses(200, 401),
  });
  check(guarded, { "guarded 401": (r) => r.status === 401 });

  sleep(1);
}

// Примечание: /metrics наружу через Caddy НЕ публикуется (Prometheus скребёт
// perum_core:3000/metrics напрямую по внутренней сети) — поэтому здесь не проверяется.
