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

## Unsigned IPA через GitHub Actions

Откройте GitHub Actions → `iOS unsigned IPA` → `Run workflow` и выберите `preview`
или `production`. Workflow запускается на macOS runner, генерирует iOS-проект,
выполняет native Release archive без code signing и загружает `PERUM-unsigned.ipa`
как artifact.

В variables GitHub environment должны быть настроены `EXPO_PUBLIC_CORE_API_URL`,
`EXPO_PUBLIC_LINK_HOST` и `EXPO_PROJECT_ID`.

Этот IPA не устанавливается на физический iPhone без последующей Apple-подписи и не
заменяет signed EAS preview или production build.

## Временный Mobile Release

Для публикации APK и unsigned IPA вместе откройте GitHub Actions → `Mobile release
(temporary APK + unsigned IPA)` → `Run workflow`. Укажите tag вида `mobile-v1.0.0`
и выберите `preview` или `production`. Workflow создаст GitHub Release с файлами
`PERUM-android-preview.apk` и `PERUM-ios-unsigned.ipa`.

## Диагностика

```bash
./mobile.sh status
./mobile.sh preflight
```

Expo project: `@sybiv/perum`.
