import type { FormEvent } from "react";

export interface AuthPageProps {
  error: string;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function LoginPage({ error, busy, onSubmit }: AuthPageProps) {
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
          <label><span>Логін</span><input name="username" autoComplete="username" maxLength={15} required placeholder="Ваш логін" /></label>
          <label><span>Пароль</span><input name="password" type="password" autoComplete="current-password" maxLength={128} required placeholder="Ваш пароль" /></label>
          <button className="button button--coral button--large button--full" disabled={busy}>{busy ? "Входимо…" : "Увійти"} <span aria-hidden="true">→</span></button>
        </form>
        <p className="form-footnote">Ще немає облікового запису? <a className="text-link" href="#/signup">Зареєструватися</a></p>
      </div>
    </section>
  );
}

export function SignupPage({ error, busy, onSubmit }: AuthPageProps) {
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
            <label><span>Ім’я</span><input name="firstName" autoComplete="given-name" minLength={1} maxLength={20} required placeholder="Ваше ім’я" /></label>
            <label><span>Прізвище</span><input name="lastName" autoComplete="family-name" minLength={1} maxLength={20} required placeholder="Ваше прізвище" /></label>
          </div>
          <label><span>Логін</span><input name="username" autoComplete="username" minLength={5} maxLength={15} required placeholder="5–15 літер або цифр" /></label>
          <label><span>Пароль</span><input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required placeholder="Щонайменше 8 символів без пробілів" /></label>
          <label><span>Повторіть пароль</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required placeholder="Повторіть пароль" /></label>
          <button className="button button--coral button--large button--full" disabled={busy}>{busy ? "Створюємо…" : "Створити обліковий запис"} <span aria-hidden="true">→</span></button>
        </form>
        <p className="form-footnote">Уже зареєстровані? <a className="text-link" href="#/login">Увійти</a></p>
      </div>
    </section>
  );
}
