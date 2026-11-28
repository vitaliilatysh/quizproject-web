# Quiz Project Web

React-клієнт для [Quiz Project API](https://github.com/vitaliilatysh/quizproject):
каталог тестів, проходження, історія результатів і адміністративна панель.

Публічний застосунок: [http://164.92.163.71/](http://164.92.163.71/).

## Можливості

- Каталог із серверним пошуком, фільтром складності та пагінацією.
- Реєстрація, вхід, профіль, зміна пароля й тихе оновлення JWT.
- Початок і відновлення спроби, таймер за серверним часом, збереження відповідей у вкладці.
- Автоматичне завершення за дедлайном, повтор відправки після помилки й захист від подвійного submit.
- Історія результатів із пагінацією та підсумками за всі спроби.
- Адміністрування предметів, тестів, запитань, користувачів і результатів.
- Зміна адреси API без повторної збірки.
- Адаптивний мінімалістичний інтерфейс, клавіатурна навігація й режим зменшеної анімації.

## Технології

React 19, TypeScript 7, Vite 8 і власні CSS-стилі.
Unit-тести виконуються через Node.js test runner, esbuild і happy-dom;
наскрізні — через Playwright / Chromium. SonarCloud перевіряє quality gate.

Точні версії та команди: [package.json](package.json).
OpenAPI tooling має окремі [package.json](tools/openapi/package.json) і lockfile.

## Локальний запуск

Використовуйте Node.js 24 — ту саму версію, що в CI та Docker build.
API, MySQL і Redis запускаються за [інструкцією backend](https://github.com/vitaliilatysh/quizproject#локальний-запуск).

~~~bash
npm ci
npm run dev
~~~

Frontend: `http://127.0.0.1:4173`. Початковий `runtime-config.js` вказує на
`http://localhost:8081`. Щоб користуватися Vite proxy зі спільним origin,
на сторінці **Налаштування** задайте адресу API `http://127.0.0.1:4173`.
Vite проксує `/api` на `http://127.0.0.1:8081`; ціль проксі можна змінити:

~~~bash
QUIZ_API_PROXY_TARGET=http://127.0.0.1:9090 npm run dev
~~~

Для прямого звернення до окремого API задайте адресу на сторінці **Налаштування**
або в [public/runtime-config.js](public/runtime-config.js):

~~~js
globalThis.QUIZ_PROJECT_API_URL = "https://api.example.com";
~~~

Збережена в **Налаштуваннях** адреса має пріоритет перед `runtime-config.js`.
Для прямого підключення `CORS_ALLOWED_ORIGINS` backend має містити точний origin frontend,
наприклад `http://127.0.0.1:4173`. У production Compose runtime-конфігурація
використовує `location.origin`, а Caddy проксує `/api`.

## Структура

~~~text
src/
  app/                 # навігація, помилки, toast і фонове оновлення сесії
  api/                 # спільний transport і API-модулі за областями
  components/          # екрани й спільні presentation-компоненти
  features/
    account/           # профіль та історія результатів
    admin/             # екран, контракти, дані та мутації адміністрування
    attempts/          # спроби, дедлайни й збережені відповіді
    auth/              # сесія, вхід, реєстрація та зміна пароля
    catalogue/         # пошук, фільтри й пагінація
    settings/          # адреса API та перевірка з'єднання
  generated/api.d.ts   # типи, згенеровані з OpenAPI
  App.tsx              # композиція екранів і feature hooks
  api.ts               # публічний фасад API-клієнта
  types.ts             # aliases згенерованих DTO й frontend-композиції
  session.ts           # сесія, налаштування та локальні чернетки
  clock.ts             # поправка на серверний час
contract/              # OpenAPI snapshot і SHA його джерела
tools/openapi/         # ізольоване оточення генератора
tests/                 # unit-тести та DOM/JSX support
e2e/                   # Playwright-сценарії
scripts/               # покриття й підготовка production-збірки
deploy/                # nginx, DigitalOcean Compose і довідкові Kubernetes-маніфести
~~~

Стан сценаріїв належить feature hooks; `App.tsx` з'єднує їх з екранами.
Після адміністративних змін перезапитуються колекції, визначені `ADMIN_INVALIDATES`.
Пошук і фільтри каталогу застосовує backend; запізніла відповідь попереднього запиту
не замінює актуальний результат.

Vite виділяє React в окремий кешований чанк; екран адміністратора завантажується
динамічно. `npm run build` створює статику в `dist/client` і запускає
`scripts/prepare-hosting.mts` для перевірки збірки та підготовки Sites/Cloudflare entrypoint.

## Перевірки

Для повної локальної перевірки встановіть залежності обох оточень:

~~~bash
npm ci
npm run api:setup
npm run check
~~~

| Команда | Що перевіряє |
| --- | --- |
| `npm run api:check` | відповідність контракту й згенерованих типів |
| `npm run api:test` | тести генератора |
| `npm run typecheck` | TypeScript |
| `npm run format:check` / `npm run format` | перевірка / виправлення форматування TypeScript |
| `npm run lint` | oxlint |
| `npm test` | unit-тести API, компонентів, hooks і сценаріїв |
| `npm run coverage:check` | 100% зіставлених із джерелом рядків, 100% функцій, щонайменше 96% гілок |
| `npm run coverage:sonar` | ті самі пороги плюс `coverage/lcov.info` для SonarCloud |
| `npm run build` | production-збірка |

`npm run check` послідовно виконує перевірку контракту, тести генератора, типи,
форматування, lint, unit-тести з покриттям і build.
Покриття рядків рахує `scripts/coverage-lines.mts` за source maps;
`npm run coverage` дає діагностичний звіт без порогів.

### OpenAPI та TypeScript

`src/generated/api.d.ts` генерується з `contract/openapi.json`;
SHA backend записаний у `contract/source.json`. DTO вручну не дублюються.

`openapi-typescript@7` потребує TypeScript 5, тому `tools/openapi`
використовує **TypeScript 5.9.3**, а застосунок — **TypeScript 7**.
`npm run api:setup` встановлює це окреме dev-оточення; для `dev` і `build`
воно не потрібне. Dependabot ігнорує major-оновлення TypeScript лише в
`/tools/openapi`, щоб зберегти сумісність генератора.

Оновлення контракту з сусіднього checkout backend:

~~~bash
cd ../quizproject
./gradlew :api:test --tests '*OpenApiExportTest' --no-daemon
BACKEND_SHA=$(git rev-parse HEAD)
cd ../quizproject-web
npm run api:setup
npm run api:generate -- --schema ../quizproject/api/build/openapi/openapi.json --source "$BACKEND_SHA"
npm run api:check
npm run typecheck
~~~

Закомітьте `contract/openapi.json`, `contract/source.json` і
`src/generated/api.d.ts` разом. Без аргументів `api:generate` відновлює типи
зі snapshot; `api:check` нічого не перезаписує.

### Playwright

Наразі **24 сценарії в 11 spec-файлах** перевіряють React ↔ Spring Boot ↔ MySQL ↔ Redis:

- реєстрацію, профіль, зміну пароля, refresh і повернення до спроби після нового входу;
- завершення тесту, збережений результат та історію;
- збереження відповідей після reload, refresh і виходу/повторного входу;
- дедлайн, поправку на час сервера, відновлення після помилок і подвійний клік;
- ізоляцію даних між акаунтами та між адресами API;
- серверний пошук і фільтри, перегони запитів каталогу, підсумки головної сторінки;
- адміністративні CRUD, пагінацію й фільтр результатів за датою.

Для локального прогону потрібні окремі тестові MySQL/Redis, запущений API
та користувач із роллю `ADMIN`. База повинна містити початкові fixtures з
Flyway V1, зокрема `Test1` із його запитаннями й відповідями: частина сценаріїв
звертається до цих даних напряму. Тести реєструють користувачів і змінюють каталог.
Створення локального адміністратора описане в
[README backend](https://github.com/vitaliilatysh/quizproject#локальний-запуск).

API має використовувати `JWT_TTL=PT15S`,
`API_RATE_LIMIT_REQUESTS=1000` і `LOGIN_RATE_LIMIT_REQUESTS=100`, як у
[Full-stack E2E](.github/workflows/e2e.yml).
Передайте дані адміністратора через `E2E_ADMIN_USERNAME` і `E2E_ADMIN_PASSWORD`.
Перед запуском набір створює чотири власні тести із запитаннями та окремий предмет;
після запуску видаляє їх. Назви та ID початкових демотестів не використовуються.
Запускайте E2E на окремій тестовій базі: сценарії створюють користувачів і змінюють дані.
Без них адміністративні сценарії та сценарії з timed-quiz fixture пропускаються.
Приклад для Bash:

~~~bash
export E2E_ADMIN_USERNAME=localadmin
read -rsp 'Пароль localadmin: ' E2E_ADMIN_PASSWORD
printf '\n'
export E2E_ADMIN_PASSWORD
npx playwright install chromium
npm run test:e2e
~~~

Для Linux без браузерних бібліотек використайте `npx playwright install --with-deps chromium`.
Playwright сам запускає локальний Vite; поза CI може використати вже запущений сервер.
Тестові адреси задаються через `E2E_WEB_URL` і `E2E_API_URL`.
Перелік без виконання: `npm run test:e2e -- --list`.
У разі помилки CI зберігає звіт із trace/відео та журнал API на 30 днів.

## CI/CD

| Workflow | Запуск | Дія |
| --- | --- | --- |
| [CI](.github/workflows/ci.yml) | PR, push у `main`, вручну; щодня 06:31 UTC | повна перевірка frontend та контракту; щоденний запуск перевіряє лише контракт з backend `master` |
| [SonarQube analysis](.github/workflows/sonarqube.yml) | PR, push у `main`, вручну | LCOV, SonarCloud і блокувальний quality gate |
| [Full-stack E2E](.github/workflows/e2e.yml) | PR, push у `main`, вручну | Playwright проти backend із джерел, MySQL і Redis |
| [E2E against published API image](.github/workflows/e2e-published-image.yml) | щодня 03:00 UTC, вручну | той самий набір проти опублікованого backend image з перевіркою cosign |
| [Container delivery](.github/workflows/container.yml) | PR, push у `main`, вручну | Docker/Compose smoke-тести; публікація, SBOM/provenance і cosign |
| [Dependabot auto-merge](.github/workflows/dependabot-auto-merge.yml) | після перевірок, кожні 15 хвилин, вручну | squash перевірених Dependabot PR |
| [Deploy to DigitalOcean](.github/workflows/deploy-digitalocean.yml) | production вручну; staging за opt-in | release gates, перевірка підпису та rollout за digest |
| [Configure DigitalOcean HTTPS](.github/workflows/configure-https.yml) | вручну з `main` | перевірка Caddy або ввімкнення довіреного HTTPS для публічного IP з відновленням попередніх налаштувань |

SonarCloud потребує `SONAR_TOKEN`; job пропускається для запусків від `dependabot[bot]`.
Auto-merge вимагає успішних CI, container, E2E та Sonar (з дозволеним пропуском
Sonar для Dependabot), актуального SHA, відсутності конфліктів і `Changes requested`.
Після мержа він явно запускає перевірки й публікацію на `main`.

## DigitalOcean і Docker

Production працює через Docker Compose на спільному з backend Droplet `quiz-project-prod`:
Caddy приймає публічні запити, проксує `/api` до backend і віддає frontend через
непривілейований nginx. Публічний origin визначає `SITE_ADDRESS`.
HTTPS можна ввімкнути й без домену: Caddy 2.11+ отримує IP-сертифікат Let's Encrypt
профілю `shortlived` і автоматично поновлює його. Після звичайного frontend deploy
запустіть **Configure DigitalOcean HTTPS** спочатку з `mode=inspect`, потім із
`mode=enable`. Workflow узгоджує HTTPS origin і CORS backend; публічні порти 80/443
мають бути доступні. При переході на HTTPS потрібен повторний вхід.

Ручний production deploy:

1. Дочекайтеся успішних CI, SonarQube analysis, Container delivery і Full-stack E2E на `main`.
2. Відкрийте **Actions → Deploy to DigitalOcean → Run workflow**.
3. Оберіть `main`, `environment=production`; порожній `image_tag` означає
   опублікований `sha-<commit>` вибраної версії.
4. Якщо оновлюєте обидва компоненти, спочатку розгорніть backend, потім frontend.

У GitHub environment потрібні variable `DO_HOST` і secrets `DO_SSH_KEY`,
`DO_KNOWN_HOSTS`; необов'язкові `DO_SSH_USER` і `DO_SSH_PORT` типово дорівнюють
`deploy` і `22`. Staging автоматизується лише після
окремого налаштування та `DO_STAGING_ENABLED=true`. Push у `main` публікує образ;
production запускається вручну.

Delivery публікує `ghcr.io/vitaliilatysh/quizproject-web:main` і `sha-<commit>`
для `linux/amd64` та `linux/arm64`. Розгортання перевіряє cosign-підпис
і CI для image revision та deployment checkout. При невдалому rollout скрипт
намагається відновити попередній release і перевіряє результат відновлення.
Для першого deployment попереднього release немає.

Повні інструкції: [frontend deployment](deploy/digitalocean/README.md) і
[спільне налаштування сервера](https://github.com/vitaliilatysh/quizproject/blob/master/docs/digitalocean-deployment.md).

Локальна перевірка статичного контейнера:

~~~bash
docker build -t quizproject-web:local .
docker run --rm --read-only --tmpfs /tmp -p 127.0.0.1:8080:8080 quizproject-web:local
~~~

Статика та `/healthz` доступні на порту 8080. У Docker-образі CSP містить
`connect-src 'self'`, тому для API потрібен proxy зі спільним origin, як у
DigitalOcean Compose. Одна зміна адреси в runtime-конфігурації не дозволяє
запити до іншого origin: для такого розгортання потрібно узгодити
[CSP nginx](deploy/docker/nginx.conf) і CORS backend.
`deploy/kubernetes` містить довідкові маніфести для окремого ручного розгортання.

## Сесії та діагностика

Сесія прив'язана до нормалізованої адреси API. Зміна API або користувача скидає
попередні дані; запізнілі відповіді не відновлюють стару сесію.
Access/refresh token і чернетки зберігаються в `sessionStorage` у межах вкладки.
Старі записи без `apiUrl` потребують повторного входу.

Refresh ротує обидва токени; тимчасова мережева помилка спричиняє повтор, а явна
відмова backend повертає на вхід. Logout відкликає серверну сесію, зміна пароля
вимагає нового входу. Права перевіряє backend.

Повідомлення про помилку можуть містити код підтримки з `X-Correlation-ID`;
за ним відповідний запит знаходиться у структурованих логах API.
