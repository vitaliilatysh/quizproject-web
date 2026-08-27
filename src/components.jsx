import { useEffect, useMemo, useState } from "react";
import {
  difficultyLabel,
  difficultyTone,
  formatCountdown,
  formatDate,
  quizCountLabel
} from "./utils.js";

function activeRoute(name, route) {
  if (name === "quizzes" && ["quizzes", "attempt"].includes(route.name)) return "is-active";
  return route.name === name ? "is-active" : "";
}

export function Layout({ route, session, onLogout, toasts, children }) {
  return (
    <>
      <header className="site-header">
        <a className="brand" href="#/" aria-label="Quiz Project — головна">
          <span className="brand-mark" aria-hidden="true"><span>Q</span></span>
          <span>Quiz Project</span>
        </a>
        <nav className="main-nav" aria-label="Основна навігація">
          <a className={activeRoute("home", route)} href="#/">Огляд</a>
          <a className={activeRoute("quizzes", route)} href="#/quizzes">Тести</a>
          <a className={activeRoute("results", route)} href="#/results">Мої результати</a>
          {session?.roles?.includes("ROLE_ADMIN") && <a className={activeRoute("admin", route)} href="#/admin">Адміністрування</a>}
        </nav>
        <div className="header-actions">
          <a className={`icon-button ${activeRoute("settings", route)}`} href="#/settings" aria-label="Налаштування API">⚙</a>
          {session ? (
            <>
              <a className={`account-chip ${activeRoute("profile", route)}`} href="#/profile" title="Відкрити профіль">
                <span className="avatar">{session.username.slice(0, 1).toUpperCase()}</span>
                <span className="account-name">{session.username}</span>
              </a>
              <button className="button button--ghost button--small" type="button" onClick={onLogout}>Вийти</button>
            </>
          ) : (
            <>
              <a className="button button--ghost button--small signup-link" href="#/signup">Реєстрація</a>
              <a className="button button--dark button--small" href="#/login">Увійти</a>
            </>
          )}
        </div>
      </header>

      <main id="main" tabIndex="-1">{children}</main>

      <footer className="site-footer">
        <div>
          <span className="brand brand--footer"><span className="brand-mark" aria-hidden="true"><span>Q</span></span><span>Quiz Project</span></span>
          <p>Окремий React frontend для REST API — без JSP, JSTL і Bootstrap.</p>
        </div>
        <div className="footer-links">
          <a href="#/quizzes">Каталог тестів</a>
          <a href="#/settings">Підключення API</a>
          <a href="https://github.com/vitaliilatysh/quizproject" target="_blank" rel="noreferrer">Backend ↗</a>
        </div>
      </footer>

      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toasts.map(toast => <div key={toast.id} className={`toast toast--${toast.tone}`}>{toast.message}</div>)}
      </div>
    </>
  );
}

function matchesComplexity(complexity, filter) {
  const normalized = String(complexity).toLowerCase();
  if (filter === "all") return true;
  if (filter === "easy") return ["easy", "low"].includes(normalized);
  if (filter === "medium") return ["medium", "normal"].includes(normalized);
  return ["hard", "high"].includes(normalized);
}

export function filterQuizzes(quizzes, search, filter) {
  const query = search.trim().toLowerCase();
  return (quizzes || []).filter(quiz => {
    const text = `${quiz.name} ${quiz.subject}`.toLowerCase();
    return (!query || text.includes(query)) && matchesComplexity(quiz.complexity, filter);
  });
}

function QuizCard({ quiz, compact, busy, onStart }) {
  const tone = difficultyTone(quiz.complexity);
  return (
    <article className={`quiz-card ${compact ? "quiz-card--compact" : ""}`}>
      <div className="quiz-card__top">
        <span className={`pill pill--${tone}`}>{difficultyLabel(quiz.complexity)}</span>
        <span className="quiz-id">#{quiz.id}</span>
      </div>
      <div>
        <p className="quiz-card__subject">{quiz.subject}</p>
        <h3>{quiz.name}</h3>
      </div>
      <div className="quiz-card__meta">
        <span><strong>{quiz.totalQuestions}</strong> запитань</span>
        <span><strong>{quiz.timeToPassMinutes}</strong> хв</span>
      </div>
      <button className="button button--arrow" type="button" onClick={() => onStart(quiz.id)} disabled={busy}>
        <span>{busy ? "Створюємо спробу…" : "Розпочати тест"}</span><span aria-hidden="true">→</span>
      </button>
    </article>
  );
}

export function QuizCollection({ quizzes, loading, error, limit, busy, onRetry, onStart, search = "", filter = "all" }) {
  if (loading && !quizzes) {
    return (
      <div className="quiz-grid" aria-label="Завантаження тестів">
        {Array.from({ length: limit || 6 }, (_, index) => (
          <div key={index} className="quiz-card skeleton-card" aria-hidden="true" style={{ "--delay": `${index * 70}ms` }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <section className="empty-state">
        <span className="empty-state__icon" aria-hidden="true">↯</span>
        <h3>Каталог поки недоступний</h3>
        <p>{error}</p>
        <div className="button-row">
          <button className="button button--dark" type="button" onClick={onRetry}>Спробувати ще раз</button>
          <a className="button button--ghost" href="#/settings">Налаштувати API</a>
        </div>
      </section>
    );
  }

  const filtered = filterQuizzes(quizzes, search, filter);
  const visible = limit ? filtered.slice(0, limit) : filtered;
  if (!visible.length) {
    return <section className="empty-state"><h3>Нічого не знайдено</h3><p>Спробуйте змінити пошук або фільтр складності.</p></section>;
  }

  return (
    <div className="quiz-grid">
      {visible.map(quiz => (
        <QuizCard key={quiz.id} quiz={quiz} compact={Boolean(limit)} busy={busy === `start-${quiz.id}`} onStart={onStart} />
      ))}
    </div>
  );
}

export function HomePage({ session, quizzes, loading, error, busy, onRetry, onStart }) {
  const total = quizzes?.length ?? "—";
  const subjects = quizzes ? new Set(quizzes.map(quiz => quiz.subject)).size : "—";
  return (
    <>
      <section className="hero section-pad">
        <div className="hero__copy">
          <p className="eyebrow"><span /> Нова навчальна платформа</p>
          <h1>Навчайся.<br /><em>Перевіряй</em> знання.<br />Зростай.</h1>
          <p className="hero__lead">Обирай тему, проходь тест у своєму темпі та одразу бач результат. Усе необхідне — в одному спокійному просторі.</p>
          <div className="hero__actions">
            <a className="button button--coral button--large" href="#/quizzes">Переглянути тести <span aria-hidden="true">→</span></a>
            <a className="text-link" href={session ? "#/results" : "#/login"}>{session ? "Мої результати" : "Увійти до кабінету"} <span aria-hidden="true">↗</span></a>
          </div>
          <div className="hero__stats" aria-label="Статистика каталогу">
            <div><strong>{total}</strong><span>доступних тестів</span></div>
            <div><strong>{subjects}</strong><span>навчальних напрямів</span></div>
            <div><strong>100%</strong><span>уваги до прогресу</span></div>
          </div>
        </div>
        <div className="hero__visual" aria-label="Як працює Quiz Project">
          <div className="orbit orbit--one" /><div className="orbit orbit--two" />
          <div className="journey-card journey-card--top"><span>01</span><div><strong>Обери тест</strong><small>За темою і складністю</small></div></div>
          <div className="journey-card journey-card--middle"><span>02</span><div><strong>Дай відповіді</strong><small>У зручному темпі</small></div></div>
          <div className="score-card"><small>Останній результат</small><strong>92<span>%</span></strong><div className="score-line"><i style={{ width: "92%" }} /></div><span>Відмінний темп!</span></div>
          <div className="journey-card journey-card--bottom"><span>03</span><div><strong>Побач прогрес</strong><small>Одразу після завершення</small></div></div>
        </div>
      </section>
      <section className="feature-band">
        <div><span className="feature-number">01</span><div><strong>Чіткий фокус</strong><p>Одне запитання — один наступний крок.</p></div></div>
        <div><span className="feature-number">02</span><div><strong>Чесний таймер</strong><p>Завжди видно, скільки часу залишилось.</p></div></div>
        <div><span className="feature-number">03</span><div><strong>Історія результатів</strong><p>Усі завершені спроби в особистому кабінеті.</p></div></div>
      </section>
      <section className="section-pad section-block">
        <div className="section-heading"><div><p className="eyebrow">Актуальний каталог</p><h2>Знайди свій наступний тест</h2></div><a className="text-link" href="#/quizzes">Усі тести <span aria-hidden="true">→</span></a></div>
        <QuizCollection quizzes={quizzes} loading={loading} error={error} limit={3} busy={busy} onRetry={onRetry} onStart={onStart} />
      </section>
    </>
  );
}

export function QuizzesPage({ quizzes, loading, error, busy, search, filter, onSearch, onFilter, onRetry, onStart }) {
  const count = filterQuizzes(quizzes, search, filter).length;
  return (
    <>
      <section className="page-hero section-pad page-hero--catalog">
        <p className="eyebrow">Каталог знань</p>
        <h1>Обери тему.<br /><em>Перевір себе.</em></h1>
        <p>Каталог синхронізується безпосередньо зі Spring Boot API.</p>
      </section>
      <section className="section-pad catalog-section">
        <div className="catalog-toolbar">
          <label className="search-field"><span aria-hidden="true">⌕</span><input type="search" placeholder="Пошук за назвою або предметом" value={search} onChange={event => onSearch(event.target.value)} /><span className="sr-only">Пошук тестів</span></label>
          <div className="filter-group" aria-label="Фільтр складності">
            {[["all", "Усі"], ["easy", "Початкові"], ["medium", "Середні"], ["hard", "Просунуті"]].map(([value, label]) => (
              <button key={value} className={`filter-button ${filter === value ? "is-active" : ""}`} type="button" onClick={() => onFilter(value)}>{label}</button>
            ))}
          </div>
        </div>
        <p className="catalog-count">{count} {quizCountLabel(count)}</p>
        <QuizCollection quizzes={quizzes} loading={loading} error={error} busy={busy} search={search} filter={filter} onRetry={onRetry} onStart={onStart} />
      </section>
    </>
  );
}

export function LoginPage({ error, busy, onSubmit }) {
  return (
    <section className="auth-layout section-pad">
      <div className="auth-story">
        <p className="eyebrow">Особистий простір</p>
        <h1>Раді бачити<br /><em>знову.</em></h1>
        <p>Увійдіть обліковими даними Quiz Project, щоб проходити тести та переглядати власну історію результатів.</p>
        <div className="auth-note"><span aria-hidden="true">✓</span><div><strong>Пароль не зберігається у браузері</strong><small>Frontend обмінює його на короткоживучий JWT.</small></div></div>
      </div>
      <div className="auth-panel">
        <div><p className="eyebrow">Вхід</p><h2>Продовжити навчання</h2></div>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <form className="form-stack" onSubmit={onSubmit}>
          <label><span>Логін</span><input name="username" autoComplete="username" maxLength="15" required placeholder="Ваш логін" /></label>
          <label><span>Пароль</span><input name="password" type="password" autoComplete="current-password" maxLength="128" required placeholder="Ваш пароль" /></label>
          <button className="button button--coral button--large button--full" disabled={busy}>{busy ? "Входимо…" : "Увійти"} <span aria-hidden="true">→</span></button>
        </form>
        <p className="form-footnote">Ще немає облікового запису? <a className="text-link" href="#/signup">Зареєструватися</a></p>
      </div>
    </section>
  );
}

export function SignupPage({ error, busy, onSubmit }) {
  return (
    <section className="auth-layout section-pad">
      <div className="auth-story">
        <p className="eyebrow">Новий обліковий запис</p>
        <h1>Почни свій<br /><em>прогрес.</em></h1>
        <p>Створіть профіль студента, щоб проходити тести, зберігати результати та повертатися до історії навчання.</p>
        <div className="auth-note"><span aria-hidden="true">✓</span><div><strong>Безпечне зберігання пароля</strong><small>Пароль хешується на backend і ніколи не повертається до браузера.</small></div></div>
      </div>
      <div className="auth-panel auth-panel--wide">
        <div><p className="eyebrow">Реєстрація</p><h2>Створити профіль</h2></div>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <form className="form-stack" onSubmit={onSubmit}>
          <div className="form-grid">
            <label><span>Ім’я</span><input name="firstName" autoComplete="given-name" minLength="1" maxLength="20" required placeholder="Ваше ім’я" /></label>
            <label><span>Прізвище</span><input name="lastName" autoComplete="family-name" minLength="1" maxLength="20" required placeholder="Ваше прізвище" /></label>
          </div>
          <label><span>Логін</span><input name="username" autoComplete="username" minLength="5" maxLength="15" required placeholder="5–15 літер або цифр" /></label>
          <label><span>Пароль</span><input name="password" type="password" autoComplete="new-password" minLength="8" maxLength="128" required placeholder="Щонайменше 8 символів без пробілів" /></label>
          <label><span>Повторіть пароль</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength="8" maxLength="128" required placeholder="Повторіть пароль" /></label>
          <button className="button button--coral button--large button--full" disabled={busy}>{busy ? "Створюємо…" : "Створити обліковий запис"} <span aria-hidden="true">→</span></button>
        </form>
        <p className="form-footnote">Уже зареєстровані? <a className="text-link" href="#/login">Увійти</a></p>
      </div>
    </section>
  );
}

export function ProfilePage({ profile, loading, error, passwordError, busy, onRetry, onPasswordChange }) {
  if (loading && !profile) {
    return <section className="section-pad content-page"><p className="eyebrow">Особистий кабінет</p><h1>Завантажуємо профіль…</h1><div className="result-skeleton" /></section>;
  }
  if (error) {
    return <section className="section-pad content-page"><p className="eyebrow">Особистий кабінет</p><h1>Мій профіль</h1><div className="empty-state"><h3>Не вдалося завантажити профіль</h3><p>{error}</p><button className="button button--dark" type="button" onClick={onRetry}>Повторити</button></div></section>;
  }
  const role = profile?.role === "admin" ? "Адміністратор" : "Студент";
  const status = profile?.status === "active" ? "Активний" : profile?.status || "—";
  return (
    <>
      <section className="page-hero section-pad page-hero--profile">
        <p className="eyebrow">Особистий кабінет</p>
        <h1>Ваш профіль.<br /><em>Ваш прогрес.</em></h1>
      </section>
      <section className="profile-layout section-pad">
        <article className="profile-card">
          <div className="profile-identity"><span>{profile?.username?.slice(0, 1).toUpperCase()}</span><div><p className="eyebrow">Обліковий запис</p><h2>{profile?.firstName} {profile?.lastName}</h2><small>@{profile?.username}</small></div></div>
          <dl className="profile-details">
            <div><dt>Роль</dt><dd>{role}</dd></div>
            <div><dt>Статус</dt><dd><span className="status-dot" />{status}</dd></div>
            <div><dt>Зареєстровано</dt><dd>{formatDate(profile?.registeredAt)}</dd></div>
            <div><dt>Останній вхід</dt><dd>{formatDate(profile?.lastLoginAt)}</dd></div>
          </dl>
        </article>
        <article className="profile-card profile-card--password">
          <div><p className="eyebrow">Безпека</p><h2>Змінити пароль</h2><p>Після зміни пароля поточна сесія завершиться. Увійдіть повторно з новим паролем.</p></div>
          {passwordError && <div className="alert alert--error" role="alert">{passwordError}</div>}
          <form className="form-stack" onSubmit={onPasswordChange}>
            <label><span>Поточний пароль</span><input name="currentPassword" type="password" autoComplete="current-password" maxLength="128" required /></label>
            <label><span>Новий пароль</span><input name="newPassword" type="password" autoComplete="new-password" minLength="8" maxLength="128" required /></label>
            <label><span>Повторіть новий пароль</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength="8" maxLength="128" required /></label>
            <button className="button button--dark button--large" disabled={busy}>{busy ? "Оновлюємо…" : "Оновити пароль"}</button>
          </form>
        </article>
      </section>
    </>
  );
}

export function SettingsPage({ apiUrl, connection, error, onSave, onTest }) {
  const [value, setValue] = useState(apiUrl);
  useEffect(() => setValue(apiUrl), [apiUrl]);
  const status = connection === "checking" ? "Перевіряємо…" : connection === "ok" ? "API доступний" : connection === "error" ? "Немає з’єднання" : "Не перевірено";
  return (
    <section className="settings-layout section-pad">
      <div><p className="eyebrow">Підключення</p><h1>Адреса<br /><em>REST API.</em></h1><p>Frontend працює окремо від Java-застосунку. Вкажіть адресу запущеного модуля <code>api</code>.</p></div>
      <div className="settings-card">
        <div className={`connection-state connection-state--${connection}`}><span />{status}</div>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <form className="form-stack" onSubmit={event => { event.preventDefault(); onSave(value); }}>
          <label><span>Базова адреса API</span><input name="apiUrl" type="url" required value={value} onChange={event => setValue(event.target.value)} placeholder="http://localhost:8081" /></label>
          <div className="button-row"><button className="button button--dark" type="submit">Зберегти й перевірити</button><button className="button button--ghost" type="button" onClick={() => onTest(value)}>Лише перевірити</button></div>
        </form>
        <div className="code-note"><strong>Не забудьте про CORS</strong><p>У backend додайте адресу цього frontend до <code>CORS_ALLOWED_ORIGINS</code>, наприклад <code>http://localhost:4173</code>.</p></div>
      </div>
    </section>
  );
}

export function ResultsPage({ results, loading, error, onRetry }) {
  if (loading && !results) return <section className="section-pad content-page"><p className="eyebrow">Особистий кабінет</p><h1>Завантажуємо результати…</h1><div className="result-skeleton" /></section>;
  if (error) return <section className="section-pad content-page"><p className="eyebrow">Особистий кабінет</p><h1>Мої результати</h1><div className="empty-state"><h3>Не вдалося завантажити історію</h3><p>{error}</p><button className="button button--dark" type="button" onClick={onRetry}>Повторити</button></div></section>;
  const items = results || [];
  const average = items.length ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length) : 0;
  const best = items.length ? Math.max(...items.map(item => item.score)) : 0;
  return (
    <>
      <section className="page-hero section-pad page-hero--results"><p className="eyebrow">Особистий кабінет</p><h1>Ваш прогрес<br /><em>у цифрах.</em></h1></section>
      <section className="section-pad results-section">
        <div className="result-summary"><div><span>Завершено</span><strong>{items.length}</strong><small>тестів</small></div><div><span>Середній результат</span><strong>{average}<i>%</i></strong><small>за всі спроби</small></div><div><span>Найкращий результат</span><strong>{best}<i>%</i></strong><small>особистий рекорд</small></div></div>
        {items.length ? (
          <div className="result-list">
            <div className="result-list__head"><span>Тест</span><span>Дата</span><span>Результат</span></div>
            {items.map(result => (
              <article className="result-row" key={result.attemptId}>
                <div><span className="result-index">{String(result.quizName || "Q").slice(0, 1).toUpperCase()}</span><div><strong>{result.quizName}</strong><small>Тест #{result.quizId} · Спроба #{result.attemptId}</small></div></div>
                <time>{formatDate(result.completedAt)}</time>
                <span className={`score-badge ${result.score >= 80 ? "score-badge--great" : result.score >= 60 ? "score-badge--good" : ""}`}>{result.score}%</span>
              </article>
            ))}
          </div>
        ) : <div className="empty-state"><h3>Історія ще порожня</h3><p>Пройдіть перший тест — результат одразу з’явиться тут.</p><a className="button button--coral" href="#/quizzes">Обрати тест</a></div>}
      </section>
    </>
  );
}

function Countdown({ expiresAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const urgent = new Date(expiresAt).getTime() - now < 5 * 60_000;
  return <strong className={urgent ? "is-urgent" : ""}>{formatCountdown(expiresAt, now)}</strong>;
}

export function AttemptPage({ attempt, loading, error, selected, completion, busy, onToggle, onComplete }) {
  if (loading && !attempt) return <section className="section-pad content-page"><p className="eyebrow">Тест</p><h1>Готуємо запитання…</h1><div className="result-skeleton" /></section>;
  if (error) return <section className="section-pad content-page"><p className="eyebrow">Тест</p><h1>Спроба недоступна</h1><div className="empty-state"><p>{error}</p><a className="button button--dark" href="#/quizzes">До каталогу</a></div></section>;
  if (!attempt) return <section className="section-pad content-page"><h1>Завантаження…</h1></section>;

  if (completion || attempt.completed) {
    const score = completion?.score ?? attempt.score ?? 0;
    return (
      <section className="completion section-pad">
        <div className="completion__mark">✓</div><p className="eyebrow">Тест завершено</p><h1>Ваш результат</h1>
        <div className="completion__score"><strong>{score}</strong><span>%</span></div>
        <p>{score >= 80 ? "Відмінна робота! Продовжуйте в тому ж темпі." : score >= 60 ? "Гарний результат. Ще трохи практики — і буде відмінно." : "Це хороший старт. Перегляньте тему й спробуйте ще раз."}</p>
        <div className="button-row"><a className="button button--dark" href="#/results">Історія результатів</a><a className="button button--ghost" href="#/quizzes">Інші тести</a></div>
      </section>
    );
  }

  return (
    <>
      <section className="attempt-header section-pad">
        <div><a className="back-link" href="#/quizzes">← Каталог тестів</a><p className="eyebrow">Спроба #{attempt.attemptId}</p><h1>Тест #{attempt.quizId}</h1></div>
        <div className="timer-card"><span>Залишилось часу</span><Countdown expiresAt={attempt.expiresAt} /><small>до автоматичного завершення</small></div>
      </section>
      <section className="attempt-layout section-pad">
        <form className="question-list" onSubmit={event => { event.preventDefault(); onComplete(attempt.attemptId); }}>
          {(attempt.questions || []).map((question, index) => (
            <fieldset className="question-card" id={`question-${question.id}`} key={question.id}>
              <legend><span>{String(index + 1).padStart(2, "0")}</span>{question.text}</legend>
              <div className="answer-list">
                {(question.answers || []).map(answer => (
                  <label className="answer-option" key={answer.id}>
                    <input type="checkbox" name="answer" value={answer.id} checked={selected.has(answer.id)} onChange={event => onToggle(attempt.attemptId, answer.id, event.target.checked)} />
                    <span className="answer-check" aria-hidden="true" /><span>{answer.text}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="attempt-submit"><div><strong>Готові завершити?</strong><span>Після надсилання змінити відповіді буде неможливо.</span></div><button className="button button--coral button--large" type="submit" disabled={busy}>{busy ? "Перевіряємо…" : "Завершити тест"} <span aria-hidden="true">→</span></button></div>
        </form>
        <aside className="attempt-aside"><p className="eyebrow">Навігація</p><div className="question-map">{(attempt.questions || []).map((question, index) => <button key={question.id} type="button" onClick={() => document.getElementById(`question-${question.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>{index + 1}</button>)}</div><p>Можна вибрати кілька варіантів, якщо запитання цього потребує.</p></aside>
      </section>
    </>
  );
}

const blankAnswers = () => Array.from({ length: 4 }, () => ({ text: "", correct: false }));

// Rendered only when the server actually paged the collection. `meta` is null
// for an unpaginated response, and a single page needs no controls at all.
function Pager({ meta, onChange, busy, label }) {
  if (!meta || meta.totalPages <= 1) return null;
  const first = meta.number * meta.size + 1;
  const last = Math.min(first + meta.size - 1, meta.totalCount);
  return (
    <div className="pager">
      <button
        className="button button--ghost button--small"
        type="button"
        disabled={busy || meta.number <= 0}
        onClick={() => onChange(meta.number - 1)}
      >Назад</button>
      <span className="pager__status">
        {label} {first}–{last} з {meta.totalCount}
      </span>
      <button
        className="button button--ghost button--small"
        type="button"
        disabled={busy || meta.number >= meta.totalPages - 1}
        onClick={() => onChange(meta.number + 1)}
      >Далі</button>
    </div>
  );
}

function AdminSection({ eyebrow, title, action, children }) {
  return (
    <section className="admin-card">
      <div className="admin-card__head"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{action}</div>
      {children}
    </section>
  );
}

export function AdminPage({ data, loading, error, busy, api, resultRange, onResultRangeChange,
  onUsersPageChange, onResultsPageChange, onRetry, onExecute }) {
  const [subjectName, setSubjectName] = useState("");
  const [quizDraft, setQuizDraft] = useState({ id: null, name: "", subjectId: "", levelId: "", timeToPassMinutes: 10 });
  const [selectedQuizId, setSelectedQuizId] = useState("");
  const [questions, setQuestions] = useState([]);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionError, setQuestionError] = useState("");
  const [questionDraft, setQuestionDraft] = useState({ id: null, text: "", answers: blankAnswers() });
  const working = busy.startsWith("admin-");

  useEffect(() => {
    if (!data) return;
    setQuizDraft(current => ({
      ...current,
      subjectId: current.subjectId || String(data.subjects[0]?.id || ""),
      levelId: current.levelId || String(data.levels[0]?.id || "")
    }));
    setSelectedQuizId(current => current || String(data.quizzes[0]?.id || ""));
  }, [data]);

  const loadQuestions = async quizId => {
    if (!quizId) {
      setQuestions([]);
      return;
    }
    setQuestionLoading(true);
    setQuestionError("");
    try {
      setQuestions(await api.adminQuestions(quizId));
    } catch (loadError) {
      setQuestionError(loadError.message);
    } finally {
      setQuestionLoading(false);
    }
  };

  useEffect(() => {
    void loadQuestions(selectedQuizId);
  }, [selectedQuizId]);

  if (loading && !data) {
    return <section className="section-pad content-page"><p className="eyebrow">Адміністрування</p><h1>Готуємо панель…</h1><div className="result-skeleton" /></section>;
  }
  if (error || !data) {
    return <section className="section-pad content-page"><p className="eyebrow">Адміністрування</p><h1>Панель недоступна</h1><div className="empty-state"><p>{error || "Не вдалося отримати дані."}</p><button className="button button--dark" type="button" onClick={onRetry}>Повторити</button></div></section>;
  }

  const createSubject = async event => {
    event.preventDefault();
    const result = await onExecute("subject-create", () => api.createSubject(subjectName), "Предмет додано.");
    if (result) setSubjectName("");
  };

  const renameSubject = async subject => {
    const name = window.prompt("Нова назва предмета", subject.name);
    if (!name?.trim() || name.trim() === subject.name) return;
    await onExecute("subject-update", () => api.updateSubject(subject.id, name.trim()), "Назву предмета оновлено.");
  };

  const deleteSubject = async subject => {
    if (!window.confirm(`Видалити предмет «${subject.name}»?`)) return;
    await onExecute("subject-delete", () => api.deleteSubject(subject.id), "Предмет видалено.");
  };

  const submitQuiz = async event => {
    event.preventDefault();
    const payload = {
      name: quizDraft.name.trim(),
      subjectId: Number(quizDraft.subjectId),
      levelId: Number(quizDraft.levelId),
      timeToPassMinutes: Number(quizDraft.timeToPassMinutes)
    };
    const operation = quizDraft.id
      ? () => api.updateQuiz(quizDraft.id, payload)
      : () => api.createQuiz(payload);
    const result = await onExecute("quiz-save", operation, quizDraft.id ? "Тест оновлено." : "Тест створено.");
    if (result) setQuizDraft({ id: null, name: "", subjectId: String(data.subjects[0]?.id || ""), levelId: String(data.levels[0]?.id || ""), timeToPassMinutes: 10 });
  };

  const editQuiz = quiz => setQuizDraft({
    id: quiz.id,
    name: quiz.name,
    subjectId: String(quiz.subjectId),
    levelId: String(quiz.levelId),
    timeToPassMinutes: quiz.timeToPassMinutes
  });

  const deleteQuiz = async quiz => {
    if (!window.confirm(`Видалити тест «${quiz.name}» разом із запитаннями та спробами?`)) return;
    const result = await onExecute("quiz-delete", () => api.deleteQuiz(quiz.id), "Тест видалено.");
    if (result !== null && String(quiz.id) === selectedQuizId) {
      setSelectedQuizId("");
      setQuestions([]);
    }
  };

  const changeAnswer = (index, field, value) => setQuestionDraft(current => ({
    ...current,
    answers: current.answers.map((answer, answerIndex) => answerIndex === index ? { ...answer, [field]: value } : answer)
  }));

  const submitQuestion = async event => {
    event.preventDefault();
    const payload = {
      text: questionDraft.text.trim(),
      answers: questionDraft.answers.map(answer => ({ text: answer.text.trim(), correct: answer.correct }))
    };
    const operation = questionDraft.id
      ? () => api.updateQuestion(questionDraft.id, payload)
      : () => api.createQuestion(selectedQuizId, payload);
    const result = await onExecute("question-save", operation, questionDraft.id ? "Запитання оновлено." : "Запитання додано.");
    if (result) {
      setQuestionDraft({ id: null, text: "", answers: blankAnswers() });
      await loadQuestions(selectedQuizId);
    }
  };

  const editQuestion = question => setQuestionDraft({
    id: question.id,
    text: question.text,
    answers: question.answers.map(answer => ({ text: answer.text, correct: answer.correct }))
  });

  const deleteQuestion = async question => {
    if (!window.confirm(`Видалити запитання «${question.text}»?`)) return;
    const result = await onExecute("question-delete", () => api.deleteQuestion(question.id), "Запитання видалено.");
    if (result !== null) await loadQuestions(selectedQuizId);
  };

  const changeUserStatus = async user => {
    const nextStatus = user.status.toLowerCase() === "active" ? "blocked" : "active";
    if (nextStatus === "blocked" && !window.confirm(`Заблокувати користувача ${user.username}?`)) return;
    await onExecute("user-status", () => api.updateUserStatus(user.id, nextStatus),
      nextStatus === "active" ? "Користувача активовано." : "Користувача заблоковано.");
  };

  // The date range is applied by the API now. Filtering here would only ever
  // see the page currently loaded and would quietly drop every match sitting on
  // another page.
  const visibleResults = data.results;

  return (
    <>
      <section className="page-hero section-pad admin-hero"><p className="eyebrow">P9 · React administration</p><h1>Керуйте платформою<br /><em>без legacy UI.</em></h1><p>Предмети, тести, запитання, користувачі та результати тепер працюють через захищений Spring Boot REST API.</p></section>
      <section className="section-pad admin-dashboard">
        <div className="admin-stats">
          <div><span>Предмети</span><strong>{data.subjects.length}</strong></div><div><span>Тести</span><strong>{data.quizzes.length}</strong></div><div><span>Користувачі</span><strong>{data.usersPage?.totalCount ?? data.users.length}</strong></div><div><span>Результати</span><strong>{data.resultsPage?.totalCount ?? data.results.length}</strong></div>
        </div>

        <AdminSection eyebrow="Каталог" title="Предмети">
          <form className="admin-inline-form" onSubmit={createSubject}><label><span className="sr-only">Назва нового предмета</span><input required maxLength="25" value={subjectName} onChange={event => setSubjectName(event.target.value)} placeholder="Новий предмет" /></label><button className="button button--dark" disabled={working}>Додати</button></form>
          <div className="admin-list">{data.subjects.map(subject => <div className="admin-list__row" key={subject.id}><div><span className="admin-id">#{subject.id}</span><strong>{subject.name}</strong></div><div className="button-row"><button className="button button--ghost button--small" type="button" disabled={working} onClick={() => renameSubject(subject)}>Перейменувати</button><button className="button button--danger button--small" type="button" disabled={working} onClick={() => deleteSubject(subject)}>Видалити</button></div></div>)}</div>
        </AdminSection>

        <AdminSection eyebrow="Контент" title="Тести">
          <form className="admin-grid-form" onSubmit={submitQuiz}>
            <label><span>Назва</span><input required maxLength="50" value={quizDraft.name} onChange={event => setQuizDraft({ ...quizDraft, name: event.target.value })} /></label>
            <label><span>Предмет</span><select required value={quizDraft.subjectId} onChange={event => setQuizDraft({ ...quizDraft, subjectId: event.target.value })}>{data.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <label><span>Складність</span><select required value={quizDraft.levelId} onChange={event => setQuizDraft({ ...quizDraft, levelId: event.target.value })}>{data.levels.map(level => <option key={level.id} value={level.id}>{difficultyLabel(level.name)}</option>)}</select></label>
            <label><span>Хвилин</span><input required min="1" max="1440" type="number" value={quizDraft.timeToPassMinutes} onChange={event => setQuizDraft({ ...quizDraft, timeToPassMinutes: event.target.value })} /></label>
            <div className="button-row"><button className="button button--dark" disabled={working}>{quizDraft.id ? "Зберегти" : "Створити тест"}</button>{quizDraft.id && <button className="button button--ghost" type="button" onClick={() => setQuizDraft({ id: null, name: "", subjectId: String(data.subjects[0]?.id || ""), levelId: String(data.levels[0]?.id || ""), timeToPassMinutes: 10 })}>Скасувати</button>}</div>
          </form>
          <div className="admin-table"><div className="admin-table__head"><span>Тест</span><span>Параметри</span><span>Дії</span></div>{data.quizzes.map(quiz => <div className="admin-table__row" key={quiz.id}><div><strong>{quiz.name}</strong><small>{quiz.subject}</small></div><span>{difficultyLabel(quiz.complexity)} · {quiz.timeToPassMinutes} хв · {quiz.totalQuestions} зап.</span><div className="button-row"><button className="button button--ghost button--small" type="button" disabled={working} onClick={() => editQuiz(quiz)}>Редагувати</button><button className="button button--danger button--small" type="button" disabled={working} onClick={() => deleteQuiz(quiz)}>Видалити</button></div></div>)}</div>
        </AdminSection>

        <AdminSection eyebrow="Редактор" title="Запитання" action={<select className="admin-quiz-select" value={selectedQuizId} onChange={event => { setSelectedQuizId(event.target.value); setQuestionDraft({ id: null, text: "", answers: blankAnswers() }); }}>{data.quizzes.map(quiz => <option key={quiz.id} value={quiz.id}>{quiz.name}</option>)}</select>}>
          {!selectedQuizId ? <div className="empty-state"><p>Спочатку створіть тест.</p></div> : <>
            <form className="admin-question-form" onSubmit={submitQuestion}><label><span>Текст запитання</span><textarea required maxLength="250" value={questionDraft.text} onChange={event => setQuestionDraft({ ...questionDraft, text: event.target.value })} /></label><div className="admin-answer-grid">{questionDraft.answers.map((answer, index) => <label key={index}><span>Варіант {index + 1}</span><input required maxLength="50" value={answer.text} onChange={event => changeAnswer(index, "text", event.target.value)} /><span className="admin-check"><input type="checkbox" checked={answer.correct} onChange={event => changeAnswer(index, "correct", event.target.checked)} /> Правильна відповідь</span></label>)}</div><div className="button-row"><button className="button button--dark" disabled={working}>{questionDraft.id ? "Зберегти запитання" : "Додати запитання"}</button>{questionDraft.id && <button className="button button--ghost" type="button" onClick={() => setQuestionDraft({ id: null, text: "", answers: blankAnswers() })}>Скасувати</button>}</div></form>
            {questionError && <div className="alert alert--error">{questionError}</div>}{questionLoading ? <p>Завантаження запитань…</p> : <div className="admin-question-list">{questions.map((question, index) => <article key={question.id}><div><span>{String(index + 1).padStart(2, "0")}</span><strong>{question.text}</strong></div><ol>{question.answers.map(answer => <li className={answer.correct ? "is-correct" : ""} key={answer.id}>{answer.text}{answer.correct && " ✓"}</li>)}</ol><div className="button-row"><button className="button button--ghost button--small" type="button" onClick={() => editQuestion(question)}>Редагувати</button><button className="button button--danger button--small" type="button" onClick={() => deleteQuestion(question)}>Видалити</button></div></article>)}</div>}
          </>}
        </AdminSection>

        <AdminSection eyebrow="Доступ" title="Користувачі"><div className="admin-table"><div className="admin-table__head"><span>Користувач</span><span>Роль і статус</span><span>Дія</span></div>{data.users.map(user => <div className="admin-table__row" key={user.id}><div><strong>{user.username}</strong><small>#{user.id}</small></div><span>{user.role} · <b className={`status-dot status-dot--${user.status.toLowerCase()}`}>{user.status}</b></span><button className="button button--ghost button--small" type="button" disabled={working} onClick={() => changeUserStatus(user)}>{user.status.toLowerCase() === "active" ? "Заблокувати" : "Активувати"}</button></div>)}</div><Pager meta={data.usersPage} onChange={onUsersPageChange} busy={working || loading} label="Користувачі" /></AdminSection>

        <AdminSection eyebrow="Аналітика" title="Усі результати" action={<div className="admin-date-filter"><label>Від<input type="datetime-local" value={resultRange.from} onChange={event => onResultRangeChange({ from: event.target.value })} /></label><label>До<input type="datetime-local" value={resultRange.to} onChange={event => onResultRangeChange({ to: event.target.value })} /></label></div>}><div className="admin-table"><div className="admin-table__head"><span>Користувач і тест</span><span>Дата</span><span>Результат</span></div>{visibleResults.map(result => <div className="admin-table__row" key={result.attemptId}><div><strong>{result.username}</strong><small>{result.quizName} · спроба #{result.attemptId}</small></div><span>{formatDate(result.completedAt)}</span><strong>{result.score}%</strong></div>)}</div><Pager meta={data.resultsPage} onChange={onResultsPageChange} busy={working || loading} label="Результати" />{!visibleResults.length && <p className="admin-empty">У вибраному діапазоні результатів немає.</p>}</AdminSection>
      </section>
    </>
  );
}

export function NotFoundPage() {
  return <section className="not-found section-pad"><span>404</span><h1>Цієї сторінки немає</h1><p>Схоже, посилання застаріло або містить помилку.</p><a className="button button--dark" href="#/">На головну</a></section>;
}
