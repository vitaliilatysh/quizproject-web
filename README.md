# Quiz Project Web

Окремий React frontend для [Quiz Project](https://github.com/vitaliilatysh/quizproject). Він замінює серверний інтерфейс на JSP, JSTL і Bootstrap та працює безпосередньо зі Spring Boot REST API.

## Можливості

- адаптивний каталог тестів із пошуком і фільтром складності;
- вхід через `POST /api/v1/auth/login` і короткоживучий JWT;
- створення та відновлення власної спроби проходження тесту;
- таймер і збереження вибраних відповідей у межах вкладки;
- завершення спроби, екран результату та історія тестів;
- захищена адміністративна панель для предметів, тестів, запитань, користувачів і результатів;
- зміна адреси API без повторної збірки;
- доступна клавіатурна навігація, видимий фокус і режим зменшеної анімації.

## Технології

- React 19 із функціональними компонентами та hooks;
- Vite 8 для локальної розробки й production-збірки;
- власна адаптивна CSS-система без Bootstrap;
- браузерні ES-модулі для API-клієнта, сесії та форматування;
- Node.js test runner для unit-тестів.

## Локальний запуск

Потрібен Node.js 22.13 або новіший.

```bash
npm ci
npm run dev
```

Frontend відкриється на `http://localhost:4173`. Spring Boot API типово працює на `http://localhost:8081`.

## Підключення backend

Адресу API можна змінити на сторінці **Налаштування**. Для фіксованого production-оточення відредагуйте `public/runtime-config.js`:

```js
globalThis.QUIZ_PROJECT_API_URL = "https://api.example.com";
```

Backend має дозволити origin frontend-застосунку:

```bash
CORS_ALLOWED_ORIGINS=http://localhost:4173
```

## Безпека сесії

- пароль передається лише endpoint-у автентифікації та не зберігається;
- JWT зберігається в `sessionStorage` і видаляється після закриття вкладки;
- після завершення терміну дії токена користувач повертається на сторінку входу;
- реєстрація створює активний студентський профіль і одразу відкриває JWT-сесію;
- сторінка профілю показує роль, статус і дати активності та дозволяє безпечно змінити пароль;
- після зміни пароля frontend завершує поточну сесію та вимагає повторного входу;
- React екранує текстові значення з API під час рендерингу;
- авторизація та перевірка прав залишаються відповідальністю backend.

## Перевірка

```bash
npm test
npm run build
```

Команда `npm run check` послідовно запускає тести й production-збірку. Готові frontend-артефакти створюються в `dist/client`, а Sites/Cloudflare entrypoint — у `dist/server/index.js`.

## Docker і Kubernetes

P12 додає production-контейнер і повний Kubernetes delivery для React frontend. Образ збирається
у Node.js 24, а статичні файли віддає unprivileged NGINX на порту `8080`. Контейнер працює без
root-прав, із read-only root filesystem, health endpoint `GET /healthz` і security headers.

Локальна перевірка контейнера:

```bash
docker build -t quizproject-web:local .
docker run --rm --read-only --tmpfs /tmp -p 8080:8080 quizproject-web:local
```

Kubernetes manifests побудовані через Kustomize:

```text
deploy/kubernetes/
  base/                 # Deployment, Service, Ingress, PDB і runtime ConfigMap
  overlays/local/       # quiz.local та локальний image
  overlays/production/  # TLS, quiz.example.com і GHCR image
```

Локальний overlay очікує, що backend `quiz-api` вже розгорнутий у namespace `quizproject`, а в
кластері встановлений NGINX Ingress Controller:

```bash
kubectl apply -k deploy/kubernetes/overlays/local
```

Ingress використовує один origin: `/` спрямовується до React, `/api` — до Spring Boot, а
`/actuator/health` — до health endpoint backend. Kubernetes ConfigMap замінює
`runtime-config.js` без повторної збірки frontend і встановлює API URL у поточний public origin.

Production overlay містить приклад домену `quiz.example.com`. Перед ручним застосуванням змініть
домен і створіть TLS secret:

```bash
kubectl -n quizproject create secret tls quizproject-tls --cert=tls.crt --key=tls.key
kubectl apply -k deploy/kubernetes/overlays/production
```

Workflow **Container delivery** перевіряє контейнер і обидва overlays у кожному PR. Після push у
`main` він публікує multi-platform образи `ghcr.io/vitaliilatysh/quizproject-web:main` і
`ghcr.io/vitaliilatysh/quizproject-web:sha-<commit>`, додає SBOM/provenance та зберігає готовий
production manifest, зафіксований на immutable SHA, як GitHub Actions artifact. Для приватного
GHCR package додайте `imagePullSecret` до service account `quiz-web`; для публічного package це не
потрібно.

### Наскрізні E2E-тести

P11 додає Playwright-перевірки реальних сценаріїв React ↔ Spring Boot ↔ MySQL:

- реєстрація, профіль, зміна пароля та повторний вхід;
- проходження тесту й перевірка збереженого результату;
- створення, редагування та видалення предмета, тесту і запитання адміністратором.

GitHub Actions автоматично піднімає чисту MySQL 8, застосовує Flyway-міграції backend,
запускає Spring Boot API та Chromium. У разі помилки workflow зберігає Playwright trace,
відео, знімок екрана й журнал API.

Для локального запуску спочатку запустіть backend і MySQL, створіть окремого адміністратора,
передайте його дані через `E2E_ADMIN_USERNAME` і `E2E_ADMIN_PASSWORD`, а потім виконайте:

```bash
npx playwright install chromium
npm run test:e2e
```

## Структура

```text
src/
  App.jsx             # стан застосунку, маршрути та API-сценарії
  components.jsx      # React-компоненти сторінок і повторно використовувані блоки
  api.js               # клієнт Spring Boot REST API
  session.js           # JWT-сесія та локальні налаштування
  utils.js             # чисті функції форматування й маршрутизації
public/
  runtime-config.js    # адреса API для конкретного оточення
  styles.css           # дизайн-система та адаптивні стилі
  og.png               # social preview
tests/                 # unit-тести API-клієнта й утиліт
```

## Заміна старого інтерфейсу

| Старий стек | React-реалізація |
| --- | --- |
| JSP-сторінки | React-компоненти та клієнтські маршрути |
| JSTL і server-side model | JSON зі Spring Boot REST API |
| HttpSession | короткоживучий Bearer JWT |
| Bootstrap | власна адаптивна CSS-система |
| WAR як UI runtime | незалежна Vite-збірка frontend |

P9 додає адміністративні REST endpoint-и та React-панель керування каталогом. P10 переносить
реєстрацію, профіль і зміну пароля до Spring Boot API та React. Старий JSP-інтерфейс можна прибрати
після приймальної перевірки production-даних і наскрізних сценаріїв.
