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
        </nav>
        <div className="header-actions">
          <a className={`icon-button ${activeRoute("settings", route)}`} href="#/settings" aria-label="Налаштування API">⚙</a>
          {session ? (
            <>
              <div className="account-chip" title="Активна сесія">
                <span className="avatar">{session.username.slice(0, 1).toUpperCase()}</span>
                <span className="account-name">{session.username}</span>
              </div>
              <button className="button button--ghost button--small" type="button" onClick={onLogout}>Вийти</button>
            </>
          ) : (
            <a className="button button--dark button--small" href="#/login">Увійти</a>
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
        <p className="form-footnote">Обліковий запис створюється в основному Quiz Project. За потреби зверніться до адміністратора.</p>
      </div>
    </section>
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

export function NotFoundPage() {
  return <section className="not-found section-pad"><span>404</span><h1>Цієї сторінки немає</h1><p>Схоже, посилання застаріло або містить помилку.</p><a className="button button--dark" href="#/">На головну</a></section>;
}
