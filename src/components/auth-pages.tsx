import type { SubmitEvent } from "react";
import { ErrorAlert, Field, PasswordField } from "./form-controls.js";

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
        <ErrorAlert message={error} />
        <form className="form-stack" onSubmit={onSubmit}>
          <Field
            label="Логін"
            name="username"
            autoComplete="username"
            maxLength={15}
            required
            placeholder="Ваш логін"
          />
          <PasswordField label="Пароль" current name="password" placeholder="Ваш пароль" />
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
        <ErrorAlert message={error} />
        <form className="form-stack" onSubmit={onSubmit}>
          <div className="form-grid">
            <Field
              label="Ім’я"
              name="firstName"
              autoComplete="given-name"
              minLength={1}
              maxLength={20}
              required
              placeholder="Ваше ім’я"
            />
            <Field
              label="Прізвище"
              name="lastName"
              autoComplete="family-name"
              minLength={1}
              maxLength={20}
              required
              placeholder="Ваше прізвище"
            />
          </div>
          <Field
            label="Логін"
            name="username"
            autoComplete="username"
            minLength={5}
            maxLength={15}
            required
            placeholder="5–15 літер або цифр"
          />
          <PasswordField label="Пароль" name="password" placeholder="Щонайменше 8 символів без пробілів" />
          <PasswordField label="Повторіть пароль" name="confirmPassword" placeholder="Повторіть пароль" />
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
