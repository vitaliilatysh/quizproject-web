import type { SubmitEvent } from "react";

export interface AuthPageProps {
  error: string;
  busy: boolean;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}

export function LoginPage({ error, busy, onSubmit }: Readonly<AuthPageProps>) {
  return (
    <section className="auth-layout section-pad">
      <div className="auth-story">
        <p className="eyebrow">Особистий простір</p>
        <h1>З поверненням</h1>
        <p>Увійди, щоб продовжити навчання та переглянути свої результати.</p>
      </div>
      <div className="auth-panel">
        {error && (
          <div className="alert alert--error" role="alert">
            {error}
          </div>
        )}
        <form className="form-stack" onSubmit={onSubmit}>
          <label>
            <span>Логін</span>
            <input name="username" autoComplete="username" maxLength={15} required placeholder="Ваш логін" />
          </label>
          <label>
            <span>Пароль</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              required
              placeholder="Ваш пароль"
            />
          </label>
          <button className="button button--primary button--large button--full" type="submit" disabled={busy}>
            {busy ? "Входимо…" : "Увійти"} <span aria-hidden="true">→</span>
          </button>
        </form>
        <p className="form-footnote">
          Ще немає облікового запису?{" "}
          <a className="text-link" href="#/signup">
            Зареєструватися
          </a>
        </p>
      </div>
    </section>
  );
}

export function SignupPage({ error, busy, onSubmit }: Readonly<AuthPageProps>) {
  return (
    <section className="auth-layout section-pad">
      <div className="auth-story">
        <p className="eyebrow">Новий обліковий запис</p>
        <h1>Створити профіль</h1>
        <p>Зберігай результати тестів і повертайся до навчання у зручний час.</p>
      </div>
      <div className="auth-panel auth-panel--wide">
        {error && (
          <div className="alert alert--error" role="alert">
            {error}
          </div>
        )}
        <form className="form-stack" onSubmit={onSubmit}>
          <div className="form-grid">
            <label>
              <span>Ім’я</span>
              <input
                name="firstName"
                autoComplete="given-name"
                minLength={1}
                maxLength={20}
                required
                placeholder="Ваше ім’я"
              />
            </label>
            <label>
              <span>Прізвище</span>
              <input
                name="lastName"
                autoComplete="family-name"
                minLength={1}
                maxLength={20}
                required
                placeholder="Ваше прізвище"
              />
            </label>
          </div>
          <label>
            <span>Логін</span>
            <input
              name="username"
              autoComplete="username"
              minLength={5}
              maxLength={15}
              required
              placeholder="5–15 літер або цифр"
            />
          </label>
          <label>
            <span>Пароль</span>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              placeholder="Щонайменше 8 символів без пробілів"
            />
          </label>
          <label>
            <span>Повторіть пароль</span>
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              placeholder="Повторіть пароль"
            />
          </label>
          <button className="button button--primary button--large button--full" type="submit" disabled={busy}>
            {busy ? "Створюємо…" : "Створити обліковий запис"} <span aria-hidden="true">→</span>
          </button>
        </form>
        <p className="form-footnote">
          Уже зареєстровані?{" "}
          <a className="text-link" href="#/login">
            Увійти
          </a>
        </p>
      </div>
    </section>
  );
}
