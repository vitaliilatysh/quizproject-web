import { ApiError, QuizApi, normalizeBaseUrl } from "./api.js";
import {
  clearAnswers,
  clearSession,
  consumePendingQuiz,
  consumeReturnTo,
  readAnswers,
  readApiUrl,
  readSession,
  rememberPendingQuiz,
  rememberReturnTo,
  writeAnswers,
  writeApiUrl,
  writeSession
} from "./session.js";
import {
  difficultyLabel,
  difficultyTone,
  escapeHtml,
  formatCountdown,
  formatDate,
  parseRoute,
  safeHash
} from "./utils.js";

const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");

let session = readSession();
let api = createApi();
let countdownTimer;

const state = {
  quizzes: null,
  quizzesLoading: false,
  quizError: "",
  results: null,
  resultsLoading: false,
  resultError: "",
  attempts: new Map(),
  attemptLoading: new Set(),
  attemptErrors: new Map(),
  selections: new Map(),
  completion: new Map(),
  actionBusy: "",
  loginError: "",
  settingsError: "",
  connection: "idle",
  search: "",
  filter: "all"
};

function createApi() {
  return new QuizApi({ baseUrl: readApiUrl(), getToken: () => session?.accessToken });
}

function navigate(hash) {
  const target = safeHash(hash);
  if (location.hash === target) onRouteChange();
  else location.hash = target;
}

function toast(message, tone = "success") {
  const element = document.createElement("div");
  element.className = `toast toast--${tone}`;
  element.textContent = message;
  toastRegion.append(element);
  setTimeout(() => element.remove(), 4200);
}

function activeRoute(name, route) {
  if (name === "quizzes" && ["quizzes", "attempt"].includes(route.name)) return "is-active";
  return route.name === name ? "is-active" : "";
}

function renderHeader(route) {
  return `
    <header class="site-header">
      <a class="brand" href="#/" aria-label="Quiz Project — головна">
        <span class="brand-mark" aria-hidden="true"><span>Q</span></span>
        <span>Quiz Project</span>
      </a>
      <nav class="main-nav" aria-label="Основна навігація">
        <a class="${activeRoute("home", route)}" href="#/">Огляд</a>
        <a class="${activeRoute("quizzes", route)}" href="#/quizzes">Тести</a>
        <a class="${activeRoute("results", route)}" href="#/results">Мої результати</a>
      </nav>
      <div class="header-actions">
        <a class="icon-button ${activeRoute("settings", route)}" href="#/settings" aria-label="Налаштування API">⚙</a>
        ${session ? `
          <div class="account-chip" title="Активна сесія">
            <span class="avatar">${escapeHtml(session.username.slice(0, 1).toUpperCase())}</span>
            <span class="account-name">${escapeHtml(session.username)}</span>
          </div>
          <button class="button button--ghost button--small" data-action="logout">Вийти</button>
        ` : `<a class="button button--dark button--small" href="#/login">Увійти</a>`}
      </div>
    </header>`;
}

function renderFooter() {
  return `
    <footer class="site-footer">
      <div>
        <span class="brand brand--footer"><span class="brand-mark" aria-hidden="true"><span>Q</span></span><span>Quiz Project</span></span>
        <p>Окремий frontend для REST API — без JSP, JSTL і Bootstrap.</p>
      </div>
      <div class="footer-links">
        <a href="#/quizzes">Каталог тестів</a>
        <a href="#/settings">Підключення API</a>
        <a href="https://github.com/vitaliilatysh/quizproject" target="_blank" rel="noreferrer">Backend ↗</a>
      </div>
    </footer>`;
}

function shell(route, content) {
  return `${renderHeader(route)}<main id="main" tabindex="-1">${content}</main>${renderFooter()}`;
}

function quizCard(quiz, compact = false) {
  const tone = difficultyTone(quiz.complexity);
  const busy = state.actionBusy === `start-${quiz.id}`;
  return `
    <article class="quiz-card ${compact ? "quiz-card--compact" : ""}"
      data-quiz-card data-complexity="${escapeHtml(String(quiz.complexity).toLowerCase())}"
      data-search="${escapeHtml(`${quiz.name} ${quiz.subject}`.toLowerCase())}">
      <div class="quiz-card__top">
        <span class="pill pill--${tone}">${escapeHtml(difficultyLabel(quiz.complexity))}</span>
        <span class="quiz-id">#${escapeHtml(quiz.id)}</span>
      </div>
      <div>
        <p class="quiz-card__subject">${escapeHtml(quiz.subject)}</p>
        <h3>${escapeHtml(quiz.name)}</h3>
      </div>
      <div class="quiz-card__meta">
        <span><strong>${escapeHtml(quiz.totalQuestions)}</strong> запитань</span>
        <span><strong>${escapeHtml(quiz.timeToPassMinutes)}</strong> хв</span>
      </div>
      <button class="button button--arrow" data-action="start-quiz" data-id="${escapeHtml(quiz.id)}" ${busy ? "disabled" : ""}>
        <span>${busy ? "Створюємо спробу…" : "Розпочати тест"}</span><span aria-hidden="true">→</span>
      </button>
    </article>`;
}

function renderQuizCollection({ limit } = {}) {
  if (state.quizzesLoading && !state.quizzes) {
    return `<div class="quiz-grid" aria-label="Завантаження тестів">
      ${Array.from({ length: limit || 6 }, (_, index) => `<div class="quiz-card skeleton-card" aria-hidden="true" style="--delay:${index * 70}ms"></div>`).join("")}
    </div>`;
  }
  if (state.quizError) {
    return `<section class="empty-state">
      <span class="empty-state__icon" aria-hidden="true">↯</span>
      <h3>Каталог поки недоступний</h3>
      <p>${escapeHtml(state.quizError)}</p>
      <div class="button-row"><button class="button button--dark" data-action="retry-quizzes">Спробувати ще раз</button><a class="button button--ghost" href="#/settings">Налаштувати API</a></div>
    </section>`;
  }
  const quizzes = (state.quizzes || []).slice(0, limit || undefined);
  if (!quizzes.length) {
    return `<section class="empty-state"><h3>Тестів ще немає</h3><p>Коли адміністратор додасть тести, вони з’являться тут автоматично.</p></section>`;
  }
  return `<div class="quiz-grid">${quizzes.map(quiz => quizCard(quiz, Boolean(limit))).join("")}</div>`;
}

function renderHome() {
  const total = state.quizzes?.length ?? "—";
  const subjects = state.quizzes ? new Set(state.quizzes.map(quiz => quiz.subject)).size : "—";
  return `
    <section class="hero section-pad">
      <div class="hero__copy">
        <p class="eyebrow"><span></span> Нова навчальна платформа</p>
        <h1>Навчайся.<br><em>Перевіряй</em> знання.<br>Зростай.</h1>
        <p class="hero__lead">Обирай тему, проходь тест у своєму темпі та одразу бач результат. Усе необхідне — в одному спокійному просторі.</p>
        <div class="hero__actions">
          <a class="button button--coral button--large" href="#/quizzes">Переглянути тести <span aria-hidden="true">→</span></a>
          ${session ? `<a class="text-link" href="#/results">Мої результати <span aria-hidden="true">↗</span></a>` : `<a class="text-link" href="#/login">Увійти до кабінету <span aria-hidden="true">↗</span></a>`}
        </div>
        <div class="hero__stats" aria-label="Статистика каталогу">
          <div><strong>${escapeHtml(total)}</strong><span>доступних тестів</span></div>
          <div><strong>${escapeHtml(subjects)}</strong><span>навчальних напрямів</span></div>
          <div><strong>100%</strong><span>уваги до прогресу</span></div>
        </div>
      </div>
      <div class="hero__visual" aria-label="Як працює Quiz Project">
        <div class="orbit orbit--one"></div><div class="orbit orbit--two"></div>
        <div class="journey-card journey-card--top"><span>01</span><div><strong>Обери тест</strong><small>За темою і складністю</small></div></div>
        <div class="journey-card journey-card--middle"><span>02</span><div><strong>Дай відповіді</strong><small>У зручному темпі</small></div></div>
        <div class="score-card"><small>Останній результат</small><strong>92<span>%</span></strong><div class="score-line"><i style="width:92%"></i></div><span>Відмінний темп!</span></div>
        <div class="journey-card journey-card--bottom"><span>03</span><div><strong>Побач прогрес</strong><small>Одразу після завершення</small></div></div>
      </div>
    </section>
    <section class="feature-band">
      <div><span class="feature-number">01</span><div><strong>Чіткий фокус</strong><p>Одне запитання — один наступний крок.</p></div></div>
      <div><span class="feature-number">02</span><div><strong>Чесний таймер</strong><p>Завжди видно, скільки часу залишилось.</p></div></div>
      <div><span class="feature-number">03</span><div><strong>Історія результатів</strong><p>Усі завершені спроби в особистому кабінеті.</p></div></div>
    </section>
    <section class="section-pad section-block">
      <div class="section-heading"><div><p class="eyebrow">Актуальний каталог</p><h2>Знайди свій наступний тест</h2></div><a class="text-link" href="#/quizzes">Усі тести <span aria-hidden="true">→</span></a></div>
      ${renderQuizCollection({ limit: 3 })}
    </section>`;
}

function renderQuizzes() {
  return `
    <section class="page-hero section-pad page-hero--catalog">
      <p class="eyebrow">Каталог знань</p>
      <h1>Обери тему.<br><em>Перевір себе.</em></h1>
      <p>Каталог синхронізується безпосередньо зі Spring Boot API.</p>
    </section>
    <section class="section-pad catalog-section">
      <div class="catalog-toolbar">
        <label class="search-field"><span aria-hidden="true">⌕</span><input id="quiz-search" type="search" placeholder="Пошук за назвою або предметом" value="${escapeHtml(state.search)}"><span class="sr-only">Пошук тестів</span></label>
        <div class="filter-group" aria-label="Фільтр складності">
          ${[["all", "Усі"], ["easy", "Початкові"], ["medium", "Середні"], ["hard", "Просунуті"]].map(([value, label]) => `<button class="filter-button ${state.filter === value ? "is-active" : ""}" data-action="set-filter" data-filter="${value}">${label}</button>`).join("")}
        </div>
      </div>
      <p class="catalog-count" data-catalog-count>${state.quizzes?.length ?? 0} тестів</p>
      ${renderQuizCollection()}
    </section>`;
}

function renderLogin() {
  return `
    <section class="auth-layout section-pad">
      <div class="auth-story">
        <p class="eyebrow">Особистий простір</p>
        <h1>Раді бачити<br><em>знову.</em></h1>
        <p>Увійдіть обліковими даними Quiz Project, щоб проходити тести та переглядати власну історію результатів.</p>
        <div class="auth-note"><span aria-hidden="true">✓</span><div><strong>Пароль не зберігається у браузері</strong><small>Frontend обмінює його на короткоживучий JWT.</small></div></div>
      </div>
      <div class="auth-panel">
        <div><p class="eyebrow">Вхід</p><h2>Продовжити навчання</h2></div>
        ${state.loginError ? `<div class="alert alert--error" role="alert">${escapeHtml(state.loginError)}</div>` : ""}
        <form id="login-form" class="form-stack">
          <label><span>Логін</span><input name="username" autocomplete="username" maxlength="15" required placeholder="Ваш логін"></label>
          <label><span>Пароль</span><input name="password" type="password" autocomplete="current-password" maxlength="128" required placeholder="Ваш пароль"></label>
          <button class="button button--coral button--large button--full" ${state.actionBusy === "login" ? "disabled" : ""}>${state.actionBusy === "login" ? "Входимо…" : "Увійти"} <span aria-hidden="true">→</span></button>
        </form>
        <p class="form-footnote">Обліковий запис створюється в основному Quiz Project. За потреби зверніться до адміністратора.</p>
      </div>
    </section>`;
}

function renderSettings() {
  const status = state.connection === "checking" ? "Перевіряємо…" : state.connection === "ok" ? "API доступний" : state.connection === "error" ? "Немає з’єднання" : "Не перевірено";
  return `
    <section class="settings-layout section-pad">
      <div>
        <p class="eyebrow">Підключення</p>
        <h1>Адреса<br><em>REST API.</em></h1>
        <p>Frontend працює окремо від Java-застосунку. Вкажіть адресу запущеного модуля <code>api</code>.</p>
      </div>
      <div class="settings-card">
        <div class="connection-state connection-state--${state.connection}"><span></span>${status}</div>
        ${state.settingsError ? `<div class="alert alert--error" role="alert">${escapeHtml(state.settingsError)}</div>` : ""}
        <form id="settings-form" class="form-stack">
          <label><span>Базова адреса API</span><input name="apiUrl" type="url" required value="${escapeHtml(readApiUrl())}" placeholder="http://localhost:8081"></label>
          <div class="button-row"><button class="button button--dark" type="submit">Зберегти й перевірити</button><button class="button button--ghost" type="button" data-action="test-api">Лише перевірити</button></div>
        </form>
        <div class="code-note"><strong>Не забудьте про CORS</strong><p>У backend додайте адресу цього frontend до <code>CORS_ALLOWED_ORIGINS</code>, наприклад <code>http://localhost:4173</code>.</p></div>
      </div>
    </section>`;
}

function renderResults() {
  if (state.resultsLoading && !state.results) return `<section class="section-pad content-page"><p class="eyebrow">Особистий кабінет</p><h1>Завантажуємо результати…</h1><div class="result-skeleton"></div></section>`;
  if (state.resultError) return `<section class="section-pad content-page"><p class="eyebrow">Особистий кабінет</p><h1>Мої результати</h1><div class="empty-state"><h3>Не вдалося завантажити історію</h3><p>${escapeHtml(state.resultError)}</p><button class="button button--dark" data-action="refresh-results">Повторити</button></div></section>`;
  const results = state.results || [];
  const average = results.length ? Math.round(results.reduce((sum, item) => sum + item.score, 0) / results.length) : 0;
  const best = results.length ? Math.max(...results.map(item => item.score)) : 0;
  return `
    <section class="page-hero section-pad page-hero--results"><p class="eyebrow">Особистий кабінет</p><h1>Ваш прогрес<br><em>у цифрах.</em></h1></section>
    <section class="section-pad results-section">
      <div class="result-summary"><div><span>Завершено</span><strong>${results.length}</strong><small>тестів</small></div><div><span>Середній результат</span><strong>${average}<i>%</i></strong><small>за всі спроби</small></div><div><span>Найкращий результат</span><strong>${best}<i>%</i></strong><small>особистий рекорд</small></div></div>
      ${results.length ? `<div class="result-list"><div class="result-list__head"><span>Тест</span><span>Дата</span><span>Результат</span></div>${results.map(result => `<article class="result-row"><div><span class="result-index">${String(result.quizName || "Q").slice(0, 1).toUpperCase()}</span><div><strong>${escapeHtml(result.quizName)}</strong><small>Тест #${escapeHtml(result.quizId)} · Спроба #${escapeHtml(result.attemptId)}</small></div></div><time>${escapeHtml(formatDate(result.completedAt))}</time><span class="score-badge ${result.score >= 80 ? "score-badge--great" : result.score >= 60 ? "score-badge--good" : ""}">${escapeHtml(result.score)}%</span></article>`).join("")}</div>` : `<div class="empty-state"><h3>Історія ще порожня</h3><p>Пройдіть перший тест — результат одразу з’явиться тут.</p><a class="button button--coral" href="#/quizzes">Обрати тест</a></div>`}
    </section>`;
}

function attemptBody(attempt) {
  const completion = state.completion.get(attempt.attemptId);
  if (completion || attempt.completed) {
    const score = completion?.score ?? attempt.score ?? 0;
    return `<section class="completion section-pad"><div class="completion__mark">✓</div><p class="eyebrow">Тест завершено</p><h1>Ваш результат</h1><div class="completion__score"><strong>${escapeHtml(score)}</strong><span>%</span></div><p>${score >= 80 ? "Відмінна робота! Продовжуйте в тому ж темпі." : score >= 60 ? "Гарний результат. Ще трохи практики — і буде відмінно." : "Це хороший старт. Перегляньте тему й спробуйте ще раз."}</p><div class="button-row"><a class="button button--dark" href="#/results">Історія результатів</a><a class="button button--ghost" href="#/quizzes">Інші тести</a></div></section>`;
  }
  const selected = state.selections.get(attempt.attemptId) || readAnswers(attempt.attemptId);
  state.selections.set(attempt.attemptId, selected);
  return `
    <section class="attempt-header section-pad">
      <div><a class="back-link" href="#/quizzes">← Каталог тестів</a><p class="eyebrow">Спроба #${escapeHtml(attempt.attemptId)}</p><h1>Тест #${escapeHtml(attempt.quizId)}</h1></div>
      <div class="timer-card"><span>Залишилось часу</span><strong data-countdown data-expires="${escapeHtml(attempt.expiresAt)}">${formatCountdown(attempt.expiresAt)}</strong><small>до автоматичного завершення</small></div>
    </section>
    <section class="attempt-layout section-pad">
      <form id="attempt-form" class="question-list">
        ${(attempt.questions || []).map((question, index) => `<fieldset class="question-card" id="question-${escapeHtml(question.id)}"><legend><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(question.text)}</legend><div class="answer-list">${(question.answers || []).map(answer => `<label class="answer-option"><input type="checkbox" name="answer" value="${escapeHtml(answer.id)}" data-attempt-id="${escapeHtml(attempt.attemptId)}" ${selected.has(answer.id) ? "checked" : ""}><span class="answer-check" aria-hidden="true"></span><span>${escapeHtml(answer.text)}</span></label>`).join("")}</div></fieldset>`).join("")}
        <div class="attempt-submit"><div><strong>Готові завершити?</strong><span>Після надсилання змінити відповіді буде неможливо.</span></div><button class="button button--coral button--large" type="submit" ${state.actionBusy === `complete-${attempt.attemptId}` ? "disabled" : ""}>${state.actionBusy === `complete-${attempt.attemptId}` ? "Перевіряємо…" : "Завершити тест"} <span aria-hidden="true">→</span></button></div>
      </form>
      <aside class="attempt-aside"><p class="eyebrow">Навігація</p><div class="question-map">${(attempt.questions || []).map((question, index) => `<button type="button" data-action="scroll-question" data-question-id="${escapeHtml(question.id)}">${index + 1}</button>`).join("")}</div><p>Можна вибрати кілька варіантів, якщо запитання цього потребує.</p></aside>
    </section>`;
}

function renderAttempt(id) {
  const attempt = state.attempts.get(Number(id));
  if (state.attemptLoading.has(Number(id)) && !attempt) return `<section class="section-pad content-page"><p class="eyebrow">Тест</p><h1>Готуємо запитання…</h1><div class="result-skeleton"></div></section>`;
  const error = state.attemptErrors.get(Number(id));
  if (error) return `<section class="section-pad content-page"><p class="eyebrow">Тест</p><h1>Спроба недоступна</h1><div class="empty-state"><p>${escapeHtml(error)}</p><a class="button button--dark" href="#/quizzes">До каталогу</a></div></section>`;
  return attempt ? attemptBody(attempt) : `<section class="section-pad content-page"><h1>Завантаження…</h1></section>`;
}

function renderNotFound() {
  return `<section class="not-found section-pad"><span>404</span><h1>Цієї сторінки немає</h1><p>Схоже, посилання застаріло або містить помилку.</p><a class="button button--dark" href="#/">На головну</a></section>`;
}

function render() {
  const route = parseRoute();
  const pages = {
    home: renderHome,
    quizzes: renderQuizzes,
    login: renderLogin,
    settings: renderSettings,
    results: renderResults
  };
  let content;
  if (route.name === "attempt") content = renderAttempt(route.params[0]);
  else content = (pages[route.name] || renderNotFound)();
  app.innerHTML = shell(route, content);
  document.title = `${route.name === "home" ? "Quiz Project" : pageTitle(route.name)} — Quiz Project`;
  filterQuizCards();
  updateCountdown();
}

function pageTitle(name) {
  return ({ quizzes: "Тести", login: "Вхід", settings: "Налаштування", results: "Результати", attempt: "Проходження тесту" })[name] || "Сторінка";
}

function requireSession(returnTo = location.hash || "#/quizzes") {
  session = readSession();
  if (session) return true;
  rememberReturnTo(returnTo);
  navigate("#/login");
  return false;
}

async function loadQuizzes(force = false) {
  if ((state.quizzes || state.quizzesLoading) && !force) return;
  state.quizzesLoading = true;
  state.quizError = "";
  render();
  try {
    state.quizzes = await api.quizzes();
  } catch (error) {
    state.quizError = friendlyError(error);
  } finally {
    state.quizzesLoading = false;
    render();
  }
}

async function loadResults(force = false) {
  if (!requireSession("#/results")) return;
  if ((state.results || state.resultsLoading) && !force) return;
  state.resultsLoading = true;
  state.resultError = "";
  render();
  try {
    state.results = await api.results();
  } catch (error) {
    if (handleAuthError(error, "#/results")) return;
    state.resultError = friendlyError(error);
  } finally {
    state.resultsLoading = false;
    render();
  }
}

async function loadAttempt(id) {
  const attemptId = Number(id);
  if (!Number.isInteger(attemptId) || attemptId <= 0) return;
  if (!requireSession(`#/attempt/${attemptId}`)) return;
  if (state.attempts.has(attemptId) || state.attemptLoading.has(attemptId)) return;
  state.attemptLoading.add(attemptId);
  render();
  try {
    state.attempts.set(attemptId, await api.attempt(attemptId));
  } catch (error) {
    if (handleAuthError(error, `#/attempt/${attemptId}`)) return;
    state.attemptErrors.set(attemptId, friendlyError(error));
  } finally {
    state.attemptLoading.delete(attemptId);
    render();
  }
}

async function startQuiz(quizId) {
  if (!requireSession("#/quizzes")) {
    rememberPendingQuiz(quizId);
    return;
  }
  state.actionBusy = `start-${quizId}`;
  render();
  try {
    const attempt = await api.startAttempt(quizId);
    state.attempts.set(attempt.attemptId, attempt);
    state.selections.set(attempt.attemptId, readAnswers(attempt.attemptId));
    navigate(`#/attempt/${attempt.attemptId}`);
  } catch (error) {
    if (!handleAuthError(error, "#/quizzes")) toast(friendlyError(error), "error");
  } finally {
    state.actionBusy = "";
    render();
  }
}

async function completeAttempt(attemptId) {
  const selected = state.selections.get(attemptId) || new Set();
  if (!confirm(`Надіслати ${selected.size} вибраних відповідей? Завершення не можна скасувати.`)) return;
  state.actionBusy = `complete-${attemptId}`;
  render();
  try {
    const result = await api.completeAttempt(attemptId, [...selected]);
    state.completion.set(attemptId, result);
    state.results = null;
    clearAnswers(attemptId);
    toast("Тест завершено. Результат збережено.");
  } catch (error) {
    if (!handleAuthError(error, `#/attempt/${attemptId}`)) toast(friendlyError(error), "error");
  } finally {
    state.actionBusy = "";
    render();
  }
}

function handleAuthError(error, returnTo) {
  if (!(error instanceof ApiError) || error.status !== 401) return false;
  clearSession();
  session = null;
  rememberReturnTo(returnTo);
  toast("Сесія завершилась. Увійдіть ще раз.", "error");
  navigate("#/login");
  return true;
}

function friendlyError(error) {
  if (error instanceof ApiError) return error.message;
  return "Сталася неочікувана помилка. Спробуйте ще раз.";
}

async function testConnection(url = readApiUrl()) {
  state.connection = "checking";
  state.settingsError = "";
  render();
  try {
    const probe = new QuizApi({ baseUrl: url });
    const health = await probe.health();
    state.connection = String(health?.status).toUpperCase() === "UP" ? "ok" : "error";
    if (state.connection === "error") state.settingsError = "API відповів, але його стан не UP.";
  } catch (error) {
    state.connection = "error";
    state.settingsError = friendlyError(error);
  }
  render();
}

function filterQuizCards() {
  const query = state.search.trim().toLowerCase();
  const cards = [...document.querySelectorAll("[data-quiz-card]")];
  let visible = 0;
  cards.forEach(card => {
    const matchesSearch = !query || card.dataset.search.includes(query);
    const complexity = card.dataset.complexity;
    const matchesFilter = state.filter === "all" || complexity === state.filter ||
      (state.filter === "easy" && complexity === "low") ||
      (state.filter === "medium" && complexity === "normal") ||
      (state.filter === "hard" && complexity === "high");
    card.hidden = !(matchesSearch && matchesFilter);
    if (!card.hidden) visible += 1;
  });
  const count = document.querySelector("[data-catalog-count]");
  if (count) count.textContent = `${visible} ${visible === 1 ? "тест" : visible < 5 ? "тести" : "тестів"}`;
}

function updateCountdown() {
  clearInterval(countdownTimer);
  const tick = () => document.querySelectorAll("[data-countdown]").forEach(element => {
    element.textContent = formatCountdown(element.dataset.expires);
    element.classList.toggle("is-urgent", new Date(element.dataset.expires).getTime() - Date.now() < 5 * 60_000);
  });
  tick();
  if (document.querySelector("[data-countdown]")) countdownTimer = setInterval(tick, 1000);
}

async function onRouteChange() {
  window.scrollTo({ top: 0, behavior: "auto" });
  const route = parseRoute();
  render();
  if (["home", "quizzes"].includes(route.name)) await loadQuizzes();
  if (route.name === "results") await loadResults();
  if (route.name === "attempt") await loadAttempt(route.params[0]);
}

app.addEventListener("click", async event => {
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) return;
  const action = actionElement.dataset.action;
  if (action === "logout") {
    clearSession();
    session = null;
    state.results = null;
    toast("Ви вийшли з облікового запису.");
    navigate("#/");
  }
  if (action === "retry-quizzes") await loadQuizzes(true);
  if (action === "start-quiz") await startQuiz(Number(actionElement.dataset.id));
  if (action === "refresh-results") await loadResults(true);
  if (action === "test-api") await testConnection();
  if (action === "scroll-question") document.querySelector(`#question-${CSS.escape(actionElement.dataset.questionId)}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (action === "set-filter") {
    state.filter = actionElement.dataset.filter;
    render();
  }
});

app.addEventListener("input", event => {
  if (event.target.id !== "quiz-search") return;
  state.search = event.target.value;
  filterQuizCards();
});

app.addEventListener("change", event => {
  if (!event.target.matches("input[name='answer']")) return;
  const attemptId = Number(event.target.dataset.attemptId);
  const answerId = Number(event.target.value);
  const selected = state.selections.get(attemptId) || readAnswers(attemptId);
  if (event.target.checked) selected.add(answerId);
  else selected.delete(answerId);
  state.selections.set(attemptId, selected);
  writeAnswers(attemptId, selected);
});

app.addEventListener("submit", async event => {
  event.preventDefault();
  if (event.target.id === "login-form") {
    const data = new FormData(event.target);
    state.actionBusy = "login";
    state.loginError = "";
    render();
    try {
      const username = String(data.get("username") || "").trim();
      const token = await api.login(username, String(data.get("password") || ""));
      session = writeSession(token, username);
      api = createApi();
      toast("Вхід успішний. Вітаємо!");
      const pendingQuiz = consumePendingQuiz();
      if (pendingQuiz) await startQuiz(pendingQuiz);
      else navigate(consumeReturnTo());
    } catch (error) {
      state.loginError = error instanceof ApiError && [401, 403].includes(error.status)
        ? "Невірний логін або пароль."
        : friendlyError(error);
    } finally {
      state.actionBusy = "";
      render();
    }
  }
  if (event.target.id === "settings-form") {
    const data = new FormData(event.target);
    try {
      const url = normalizeBaseUrl(data.get("apiUrl"));
      writeApiUrl(url);
      api = createApi();
      state.quizzes = null;
      state.results = null;
      await testConnection(url);
      if (state.connection === "ok") toast("Адресу API збережено.");
    } catch (error) {
      state.connection = "error";
      state.settingsError = error.message;
      render();
    }
  }
  if (event.target.id === "attempt-form") {
    const route = parseRoute();
    await completeAttempt(Number(route.params[0]));
  }
});

window.addEventListener("hashchange", onRouteChange);
window.addEventListener("storage", event => {
  if (event.key === "quizproject.apiUrl") {
    api = createApi();
    state.quizzes = null;
    onRouteChange();
  }
});

onRouteChange();
