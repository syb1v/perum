# PERUM Mobile

## Быстрый запуск в Expo Go

```bash
./mobile.sh go
```

Скрипт запустит Expo через tunnel и покажет QR-код. Установите Expo Go на телефон,
войдите в ту же сеть или используйте tunnel и отсканируйте QR-код.

## Публикация preview-сборки

```bash
./mobile.sh preview android
./mobile.sh preview ios
./mobile.sh preview all
```

Preview является внутренней installable EAS-сборкой. После завершения EAS выдаст
ссылку или QR-код для установки. Перед первым build настройте environment `preview`
в Expo/EAS: `EXPO_PUBLIC_CORE_API_URL`, `EXPO_PUBLIC_LINK_HOST` и
`EXPO_PUBLIC_PROJECT_ID`. Credentials и `EXPO_TOKEN` не храните в репозитории.

## Production build

```bash
./mobile.sh production android --confirm
```

Production требует явного подтверждения. Эта команда создаёт build, но не отправляет
его автоматически в App Store или Google Play. Для этого профиля также настройте
environment `production` с теми же public-переменными и production-значениями.

## Диагностика

```bash
./mobile.sh status
./mobile.sh preflight
```

Expo project: `@sybiv/perum`.
