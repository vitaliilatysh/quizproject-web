import { useEffect, useState, type SubmitEvent } from "react";
import type { Profile, Result } from "../types.js";
import { formatDate } from "../utils.js";

export interface ProfilePageProps {
  profile: Profile | null;
  loading: boolean;
  error: string;
  passwordError: string;
  busy: boolean;
  onRetry: () => void;
  onPasswordChange: (event: SubmitEvent<HTMLFormElement>) => void;
}

export function ProfilePage({
  profile,
  loading,
  error,
  passwordError,
  busy,
  onRetry,
  onPasswordChange
}: Readonly<ProfilePageProps>) {
  if (loading && !profile) {
    return (
      <section className="section-pad content-page">
        <p className="eyebrow">Особистий кабінет</p>
        <h1>Завантажуємо профіль…</h1>
        <div className="result-skeleton" />
      </section>
    );
  }
  if (error) {
    return (
      <section className="section-pad content-page">
        <p className="eyebrow">Особистий кабінет</p>
        <h1>Мій профіль</h1>
        <div className="empty-state">
          <h3>Не вдалося завантажити профіль</h3>
          <p>{error}</p>
          <button className="button button--dark" type="button" onClick={onRetry}>
            Повторити
          </button>
        </div>
      </section>
    );
  }
  const role = profile?.role === "admin" ? "Адміністратор" : "Студент";
  const status = profile?.status === "active" ? "Активний" : profile?.status || "—";
  return (
    <>
      <section className="page-hero section-pad page-hero--profile">
        <p className="eyebrow">Особистий кабінет</p>
        <h1>
          Ваш профіль.
          <br />
          <em>Ваш прогрес.</em>
        </h1>
      </section>
      <section className="profile-layout section-pad">
        <article className="profile-card">
          <div className="profile-identity">
            <span>{profile?.username?.slice(0, 1).toUpperCase()}</span>
            <div>
              <p className="eyebrow">Обліковий запис</p>
              <h2>
                {profile?.firstName} {profile?.lastName}
              </h2>
              <small>@{profile?.username}</small>
            </div>
          </div>
          <dl className="profile-details">
            <div>
              <dt>Роль</dt>
              <dd>{role}</dd>
            </div>
            <div>
              <dt>Статус</dt>
              <dd>
                <span className="status-dot" />
                {status}
              </dd>
            </div>
            <div>
              <dt>Зареєстровано</dt>
              <dd>{formatDate(profile?.registeredAt)}</dd>
            </div>
            <div>
              <dt>Останній вхід</dt>
              <dd>{formatDate(profile?.lastLoginAt)}</dd>
            </div>
          </dl>
        </article>
        <article className="profile-card profile-card--password">
          <div>
            <p className="eyebrow">Безпека</p>
            <h2>Змінити пароль</h2>
            <p>Після зміни пароля поточна сесія завершиться. Увійдіть повторно з новим паролем.</p>
          </div>
          {passwordError && (
            <div className="alert alert--error" role="alert">
              {passwordError}
            </div>
          )}
          <form className="form-stack" onSubmit={onPasswordChange}>
            <label>
              <span>Поточний пароль</span>
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                required
              />
            </label>
            <label>
              <span>Новий пароль</span>
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
            </label>
            <label>
              <span>Повторіть новий пароль</span>
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
            </label>
            <button className="button button--dark button--large" type="submit" disabled={busy}>
              {busy ? "Оновлюємо…" : "Оновити пароль"}
            </button>
          </form>
        </article>
      </section>
    </>
  );
}

export interface SettingsPageProps {
  apiUrl: string;
  connection: string;
  error: string;
  onSave: (value: string) => void;
  onTest: (value: string) => void;
}

const CONNECTION_LABELS: Readonly<Record<string, string>> = {
  checking: "Перевіряємо…",
  ok: "API доступний",
  error: "Немає з’єднання"
};

export function SettingsPage({ apiUrl, connection, error, onSave, onTest }: Readonly<SettingsPageProps>) {
  const [value, setValue] = useState(apiUrl);
  useEffect(() => setValue(apiUrl), [apiUrl]);
  const status = CONNECTION_LABELS[connection] ?? "Не перевірено";
  return (
    <section className="settings-layout section-pad">
      <div>
        <p className="eyebrow">Підключення</p>
        <h1>
          Адреса
          <br />
          <em>REST API.</em>
        </h1>
        <p>
          Frontend працює окремо від Java-застосунку. Вкажіть адресу запущеного модуля <code>api</code>.
        </p>
      </div>
      <div className="settings-card">
        <div className={`connection-state connection-state--${connection}`}>
          <span />
          {status}
        </div>
        {error && (
          <div className="alert alert--error" role="alert">
            {error}
          </div>
        )}
        <form
          className="form-stack"
          onSubmit={event => {
            event.preventDefault();
            onSave(value);
          }}
        >
          <label>
            <span>Базова адреса API</span>
            <input
              name="apiUrl"
              type="url"
              required
              value={value}
              onChange={event => setValue(event.target.value)}
              placeholder="http://localhost:8081"
            />
          </label>
          <div className="button-row">
            <button className="button button--dark" type="submit">
              Зберегти й перевірити
            </button>
            <button className="button button--ghost" type="button" onClick={() => onTest(value)}>
              Лише перевірити
            </button>
          </div>
        </form>
        <div className="code-note">
          <strong>Не забудьте про CORS</strong>
          <p>
            У backend додайте адресу цього frontend до <code>CORS_ALLOWED_ORIGINS</code>, наприклад{" "}
            <code>http://localhost:4173</code>.
          </p>
        </div>
      </div>
    </section>
  );
}

export interface ResultsPageProps {
  results: Result[] | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
}

function scoreBadgeClass(score: number): string {
  if (score >= 80) return "score-badge--great";
  if (score >= 60) return "score-badge--good";
  return "";
}

export function ResultsPage({ results, loading, error, onRetry }: Readonly<ResultsPageProps>) {
  if (loading && !results)
    return (
      <section className="section-pad content-page">
        <p className="eyebrow">Особистий кабінет</p>
        <h1>Завантажуємо результати…</h1>
        <div className="result-skeleton" />
      </section>
    );
  if (error)
    return (
      <section className="section-pad content-page">
        <p className="eyebrow">Особистий кабінет</p>
        <h1>Мої результати</h1>
        <div className="empty-state">
          <h3>Не вдалося завантажити історію</h3>
          <p>{error}</p>
          <button className="button button--dark" type="button" onClick={onRetry}>
            Повторити
          </button>
        </div>
      </section>
    );
  const items = results || [];
  const average = items.length
    ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length)
    : 0;
  const best = items.length ? Math.max(...items.map(item => item.score)) : 0;
  return (
    <>
      <section className="page-hero section-pad page-hero--results">
        <p className="eyebrow">Особистий кабінет</p>
        <h1>
          Ваш прогрес
          <br />
          <em>у цифрах.</em>
        </h1>
      </section>
      <section className="section-pad results-section">
        <div className="result-summary">
          <div>
            <span>Завершено</span>
            <strong>{items.length}</strong>
            <small>тестів</small>
          </div>
          <div>
            <span>Середній результат</span>
            <strong>
              {average}
              <i>%</i>
            </strong>
            <small>за всі спроби</small>
          </div>
          <div>
            <span>Найкращий результат</span>
            <strong>
              {best}
              <i>%</i>
            </strong>
            <small>особистий рекорд</small>
          </div>
        </div>
        {items.length ? (
          <div className="result-list">
            <div className="result-list__head">
              <span>Тест</span>
              <span>Дата</span>
              <span>Результат</span>
            </div>
            {items.map(result => (
              <article className="result-row" key={result.attemptId}>
                <div>
                  <span className="result-index">
                    {String(result.quizName || "Q")
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <div>
                    <strong>{result.quizName}</strong>
                    <small>
                      Тест #{result.quizId} · Спроба #{result.attemptId}
                    </small>
                  </div>
                </div>
                <time>{formatDate(result.completedAt)}</time>
                <span className={`score-badge ${scoreBadgeClass(result.score)}`}>{result.score}%</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>Історія ще порожня</h3>
            <p>Пройдіть перший тест — результат одразу з’явиться тут.</p>
            <a className="button button--coral" href="#/quizzes">
              Обрати тест
            </a>
          </div>
        )}
      </section>
    </>
  );
}
