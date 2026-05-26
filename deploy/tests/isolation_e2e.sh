set -e
A=http://admin.perum.local
RES="--resolve demo1.perum.local:80:127.0.0.1 --resolve acme.perum.local:80:127.0.0.1"

# токены школьных стеков
ZAV=$(curl -s -X POST http://acme.perum.local/api/login -H 'Content-Type: application/json' -d '{"login":"zavuch1","password":"test1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "acme school_admin token len: ${#ZAV}"

echo "=== cross-school: токен acme(zavuch1) → школа demo1 (ожидаем 401) ==="
curl -s $RES -o /dev/null -w "HTTP %{http_code}\n" http://demo1.perum.local/api/admin/subjects -H "Authorization: Bearer $ZAV"

echo "=== same-school: токен acme → acme (ожидаем 200) ==="
curl -s $RES -o /dev/null -w "HTTP %{http_code}\n" http://acme.perum.local/api/admin/subjects -H "Authorization: Bearer $ZAV"

echo "=== cross-level: platform-токен → школьный стек acme (ожидаем 401) ==="
PTOK=$(curl -s -X POST $A/api/auth/login -H 'Content-Type: application/json' -d '{"login":"admin","password":"admin"}' | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
curl -s $RES -o /dev/null -w "HTTP %{http_code}\n" http://acme.perum.local/api/admin/subjects -H "Authorization: Bearer $PTOK"

echo "=== cross-level: школьный токен → ядро /api/schools (ожидаем 401) ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" $A/api/schools -H "Authorization: Bearer $ZAV"

echo "=== БД-изоляция: у каждой школы своя БД (нет shared) ==="
echo "acme users:  $(docker exec org_acme_db psql -U perum -d perum -t -A -c 'SELECT count(*) FROM users;' 2>/dev/null)"
echo "demo1 users: $(docker exec school_demo1_db psql -U perum -d perum -t -A -c 'SELECT count(*) FROM users;' 2>/dev/null)"
