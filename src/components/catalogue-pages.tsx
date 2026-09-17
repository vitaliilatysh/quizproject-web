import type { CSSProperties } from "react";
import type { Session } from "../session.js";
import type { CatalogueSummary, PageMeta, Quiz } from "../types.js";
import { difficultyLabel, difficultyTone, HOME_TEASER_SIZE, quizCountLabel } from "../utils.js";
import { Pager } from "./pager.js";

interface QuizCardProps {
  quiz: Quiz;
  compact: boolean;
  busy: boolean;
  onStart: (quizId: number) => void;
}

function QuizCard({ quiz, compact, busy, onStart }: Readonly<QuizCardProps>) {
  const tone = difficultyTone(quiz.complexity);
  return (
    <article className={`quiz-card ${compact ? "quiz-card--compact" : ""}`}>
      <div className="quiz-card__top">
        <span className={`pill pill--${tone}`}>{difficultyLabel(quiz.complexity)}</span>
        <span className="quiz-id">#{quiz.id}</span>
      </div>
      <div><p className="quiz-card__subject">{quiz.subject}</p><h3>{quiz.name}</h3></div>
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

export interface QuizCollectionProps {
  quizzes: Quiz[] | null;
  loading: boolean;
  error: string;
  limit?: number | undefined;
  busy: string;
  onRetry: () => void;
  onStart: (quizId: number) => void;
}

export function QuizCollection({ quizzes, loading, error, limit, busy, onRetry, onStart }: Readonly<QuizCollectionProps>) {
  if (loading && !quizzes) {
    return (
      <div className="quiz-grid" aria-label="Завантаження тестів">
        {Array.from({ length: limit || 6 }, (_, index) => (
          <div key={index} className="quiz-card skeleton-card" aria-hidden="true" style={{ "--delay": `${index * 70}ms` } as CSSProperties} />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <section className="empty-state">
        <span className="empty-state__icon" aria-hidden="true">↯</span>
        <h3>Каталог поки недоступний</h3><p>{error}</p>
        <div className="button-row">
          <button className="button button--dark" type="button" onClick={onRetry}>Спробувати ще раз</button>
          <a className="button button--ghost" href="#/settings">Налаштувати API</a>
        </div>
      </section>
    );
  }
  const items = quizzes || [];
  const visible = limit ? items.slice(0, limit) : items;
  if (!visible.length) {
    return <section className="empty-state"><h3>Нічого не знайдено</h3><p>Спробуйте змінити пошук або фільтр складності.</p></section>;
  }
  return (
    <div className="quiz-grid">
      {visible.map(quiz => <QuizCard key={quiz.id} quiz={quiz} compact={Boolean(limit)} busy={busy === `start-${quiz.id}`} onStart={onStart} />)}
    </div>
  );
}

export interface HomePageProps {
  session: Session | null;
  quizzes: Quiz[] | null;
  summary: CatalogueSummary | null;
  loading: boolean;
  error: string;
  busy: string;
  onRetry: () => void;
  onStart: (quizId: number) => void;
}

export function HomePage({ session, quizzes, summary, loading, error, busy, onRetry, onStart }: Readonly<HomePageProps>) {
  const total = summary?.totalQuizzes ?? "—";
  const subjects = summary?.totalSubjects ?? "—";
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
        <QuizCollection quizzes={quizzes} loading={loading} error={error} limit={HOME_TEASER_SIZE} busy={busy} onRetry={onRetry} onStart={onStart} />
      </section>
    </>
  );
}

export interface QuizzesPageProps {
  quizzes: Quiz[] | null;
  pageMeta: PageMeta | null;
  loading: boolean;
  error: string;
  busy: string;
  search: string;
  filter: string;
  onSearch: (value: string) => void;
  onFilter: (value: string) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onStart: (quizId: number) => void;
}

export function QuizzesPage({ quizzes, pageMeta, loading, error, busy, search, filter,
  onSearch, onFilter, onPageChange, onRetry, onStart }: Readonly<QuizzesPageProps>) {
  const count = pageMeta?.totalCount ?? (quizzes || []).length;
  return (
    <>
      <section className="page-hero section-pad page-hero--catalog">
        <p className="eyebrow">Каталог знань</p><h1>Обери тему.<br /><em>Перевір себе.</em></h1>
        <p>Каталог синхронізується безпосередньо зі Spring Boot API.</p>
      </section>
      <section className="section-pad catalog-section">
        <div className="catalog-toolbar">
          <label className="search-field"><span aria-hidden="true">⌕</span><input type="search" placeholder="Пошук за назвою або предметом" value={search} onChange={event => onSearch(event.target.value)} /><span className="sr-only">Пошук тестів</span></label>
          <div className="filter-group" aria-label="Фільтр складності">
            {[["all", "Усі"], ["easy", "Початкові"], ["medium", "Середні"], ["hard", "Просунуті"]].map(([value, label]) => (
              <button key={value} className={`filter-button ${filter === value ? "is-active" : ""}`} type="button" onClick={() => onFilter(value as string)}>{label}</button>
            ))}
          </div>
        </div>
        <p className="catalog-count">{count} {quizCountLabel(count)}</p>
        <QuizCollection quizzes={quizzes} loading={loading} error={error} busy={busy} onRetry={onRetry} onStart={onStart} />
        <Pager meta={pageMeta} onChange={onPageChange} busy={loading} label="Тести" />
      </section>
    </>
  );
}
