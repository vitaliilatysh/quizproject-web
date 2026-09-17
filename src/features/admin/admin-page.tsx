import { useEffect, useState, type SubmitEvent, type ReactNode } from "react";
import type { QuizApi } from "../../api.js";
import { Pager } from "../../components/pager.js";
import type { AdminQuestion, AdminQuiz, AdminUser, QuestionRequest, QuizRequest, Subject } from "../../types.js";
import { difficultyLabel, formatDate } from "../../utils.js";
import type { AdminData, ExecuteAdmin, ResultRange } from "./contracts.js";

interface AnswerDraft { key: string; text: string; correct: boolean; }
interface QuizDraft {
  id: number | null;
  name: string;
  subjectId: string;
  levelId: string;
  timeToPassMinutes: number | string;
}
interface QuestionDraft { id: number | null; text: string; answers: AnswerDraft[]; }
let nextAnswerKey = 0;
const blankAnswers = (): AnswerDraft[] => Array.from({ length: 4 }, () => ({
  key: `draft-${++nextAnswerKey}`, text: "", correct: false
}));

interface AdminSectionProps {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

function AdminSection({ eyebrow, title, action, children }: Readonly<AdminSectionProps>) {
  return (
    <section className="admin-card">
      <div className="admin-card__head"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{action}</div>
      {children}
    </section>
  );
}

export interface AdminPageProps {
  data: AdminData | null;
  loading: boolean;
  error: string;
  busy: string;
  api: QuizApi;
  resultRange: ResultRange;
  onResultRangeChange: (patch: Partial<ResultRange>) => void;
  onUsersPageChange: (page: number) => void;
  onResultsPageChange: (page: number) => void;
  onRetry: () => void;
  onExecute: ExecuteAdmin;
}

export function AdminPage({ data, loading, error, busy, api, resultRange, onResultRangeChange,
  onUsersPageChange, onResultsPageChange, onRetry, onExecute }: Readonly<AdminPageProps>) {
  const [subjectName, setSubjectName] = useState("");
  const [quizDraft, setQuizDraft] = useState<QuizDraft>({ id: null, name: "", subjectId: "", levelId: "", timeToPassMinutes: 10 });
  const [selectedQuizId, setSelectedQuizId] = useState("");
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionError, setQuestionError] = useState("");
  const [questionDraft, setQuestionDraft] = useState<QuestionDraft>(() => ({ id: null, text: "", answers: blankAnswers() }));
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

  const loadQuestions = async (quizId: string): Promise<void> => {
    if (!quizId) {
      setQuestions([]);
      return;
    }
    setQuestionLoading(true);
    setQuestionError("");
    try {
      setQuestions(await api.adminQuestions(quizId));
    } catch (loadError) {
      setQuestionError(loadError instanceof Error ? loadError.message : String(loadError));
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

  const createSubject = async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const result = await onExecute("subject-create", () => api.createSubject(subjectName), "Предмет додано.");
    if (result) setSubjectName("");
  };
  const renameSubject = async (subject: Subject): Promise<void> => {
    const name = window.prompt("Нова назва предмета", subject.name);
    if (!name?.trim() || name.trim() === subject.name) return;
    await onExecute("subject-update", () => api.updateSubject(subject.id, name.trim()), "Назву предмета оновлено.");
  };
  const deleteSubject = async (subject: Subject): Promise<void> => {
    if (!window.confirm(`Видалити предмет «${subject.name}»?`)) return;
    await onExecute("subject-delete", () => api.deleteSubject(subject.id), "Предмет видалено.");
  };
  const submitQuiz = async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const payload: QuizRequest = {
      name: quizDraft.name.trim(),
      subjectId: Number(quizDraft.subjectId),
      levelId: Number(quizDraft.levelId),
      timeToPassMinutes: Number(quizDraft.timeToPassMinutes)
    };
    const draftId = quizDraft.id;
    const operation = draftId !== null ? () => api.updateQuiz(draftId, payload) : () => api.createQuiz(payload);
    const result = await onExecute("quiz-save", operation, draftId !== null ? "Тест оновлено." : "Тест створено.");
    if (result) setQuizDraft({ id: null, name: "", subjectId: String(data.subjects[0]?.id || ""), levelId: String(data.levels[0]?.id || ""), timeToPassMinutes: 10 });
  };
  const editQuiz = (quiz: AdminQuiz): void => setQuizDraft({
    id: quiz.id,
    name: quiz.name,
    subjectId: String(quiz.subjectId),
    levelId: String(quiz.levelId),
    timeToPassMinutes: quiz.timeToPassMinutes
  });
  const deleteQuiz = async (quiz: AdminQuiz): Promise<void> => {
    if (!window.confirm(`Видалити тест «${quiz.name}» разом із запитаннями та спробами?`)) return;
    const result = await onExecute("quiz-delete", () => api.deleteQuiz(quiz.id), "Тест видалено.");
    if (result !== null && String(quiz.id) === selectedQuizId) {
      setSelectedQuizId("");
      setQuestions([]);
    }
  };
  const changeAnswer = <K extends "text" | "correct">(key: string, field: K, value: AnswerDraft[K]): void =>
    setQuestionDraft(current => ({
      ...current,
      answers: current.answers.map(answer => answer.key === key ? { ...answer, [field]: value } : answer)
    }));
  const submitQuestion = async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const payload: QuestionRequest = {
      text: questionDraft.text.trim(),
      answers: questionDraft.answers.map(answer => ({ text: answer.text.trim(), correct: answer.correct }))
    };
    const draftId = questionDraft.id;
    const operation = draftId !== null
      ? () => api.updateQuestion(draftId, payload)
      : () => api.createQuestion(selectedQuizId, payload);
    const result = await onExecute("question-save", operation, draftId !== null ? "Запитання оновлено." : "Запитання додано.");
    if (result) {
      setQuestionDraft({ id: null, text: "", answers: blankAnswers() });
      await loadQuestions(selectedQuizId);
    }
  };
  const editQuestion = (question: AdminQuestion): void => setQuestionDraft({
    id: question.id,
    text: question.text,
    answers: question.answers.map(answer => ({ key: `answer-${answer.id}`, text: answer.text, correct: answer.correct }))
  });
  const deleteQuestion = async (question: AdminQuestion): Promise<void> => {
    if (!window.confirm(`Видалити запитання «${question.text}»?`)) return;
    const result = await onExecute("question-delete", () => api.deleteQuestion(question.id), "Запитання видалено.");
    if (result !== null) await loadQuestions(selectedQuizId);
  };
  const changeUserStatus = async (user: AdminUser): Promise<void> => {
    const nextStatus = user.status.toLowerCase() === "active" ? "blocked" : "active";
    if (nextStatus === "blocked" && !window.confirm(`Заблокувати користувача ${user.username}?`)) return;
    await onExecute("user-status", () => api.updateUserStatus(user.id, nextStatus),
      nextStatus === "active" ? "Користувача активовано." : "Користувача заблоковано.");
  };

  return (
    <>
      <section className="page-hero section-pad admin-hero"><p className="eyebrow">P9 · React administration</p><h1>Керуйте платформою<br /><em>без legacy UI.</em></h1><p>Предмети, тести, запитання, користувачі та результати тепер працюють через захищений Spring Boot REST API.</p></section>
      <section className="section-pad admin-dashboard">
        <div className="admin-stats">
          <div><span>Предмети</span><strong>{data.subjects.length}</strong></div><div><span>Тести</span><strong>{data.quizzes.length}</strong></div><div><span>Користувачі</span><strong>{data.usersPage?.totalCount ?? data.users.length}</strong></div><div><span>Результати</span><strong>{data.resultsPage?.totalCount ?? data.results.length}</strong></div>
        </div>

        <AdminSection eyebrow="Каталог" title="Предмети">
          <form className="admin-inline-form" onSubmit={createSubject}><label><span className="sr-only">Назва нового предмета</span><input required maxLength={25} value={subjectName} onChange={event => setSubjectName(event.target.value)} placeholder="Новий предмет" /></label><button className="button button--dark" type="submit" disabled={working}>Додати</button></form>
          <div className="admin-list">{data.subjects.map(subject => <div className="admin-list__row" key={subject.id}><div><span className="admin-id">#{subject.id}</span><strong>{subject.name}</strong></div><div className="button-row"><button className="button button--ghost button--small" type="button" disabled={working} onClick={() => void renameSubject(subject)}>Перейменувати</button><button className="button button--danger button--small" type="button" disabled={working} onClick={() => void deleteSubject(subject)}>Видалити</button></div></div>)}</div>
        </AdminSection>

        <AdminSection eyebrow="Контент" title="Тести">
          <form className="admin-grid-form" onSubmit={submitQuiz}>
            <label><span>Назва</span><input required maxLength={50} value={quizDraft.name} onChange={event => setQuizDraft({ ...quizDraft, name: event.target.value })} /></label>
            <label><span>Предмет</span><select required value={quizDraft.subjectId} onChange={event => setQuizDraft({ ...quizDraft, subjectId: event.target.value })}>{data.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <label><span>Складність</span><select required value={quizDraft.levelId} onChange={event => setQuizDraft({ ...quizDraft, levelId: event.target.value })}>{data.levels.map(level => <option key={level.id} value={level.id}>{difficultyLabel(level.name)}</option>)}</select></label>
            <label><span>Хвилин</span><input required min="1" max="1440" type="number" value={quizDraft.timeToPassMinutes} onChange={event => setQuizDraft({ ...quizDraft, timeToPassMinutes: event.target.value })} /></label>
            <div className="button-row"><button className="button button--dark" type="submit" disabled={working}>{quizDraft.id ? "Зберегти" : "Створити тест"}</button>{quizDraft.id && <button className="button button--ghost" type="button" onClick={() => setQuizDraft({ id: null, name: "", subjectId: String(data.subjects[0]?.id || ""), levelId: String(data.levels[0]?.id || ""), timeToPassMinutes: 10 })}>Скасувати</button>}</div>
          </form>
          <div className="admin-table"><div className="admin-table__head"><span>Тест</span><span>Параметри</span><span>Дії</span></div>{data.quizzes.map(quiz => <div className="admin-table__row" key={quiz.id}><div><strong>{quiz.name}</strong><small>{quiz.subject}</small></div><span>{difficultyLabel(quiz.complexity)} · {quiz.timeToPassMinutes} хв · {quiz.totalQuestions} зап.</span><div className="button-row"><button className="button button--ghost button--small" type="button" disabled={working} onClick={() => editQuiz(quiz)}>Редагувати</button><button className="button button--danger button--small" type="button" disabled={working} onClick={() => void deleteQuiz(quiz)}>Видалити</button></div></div>)}</div>
        </AdminSection>

        <AdminSection eyebrow="Редактор" title="Запитання" action={<select className="admin-quiz-select" value={selectedQuizId} onChange={event => { setSelectedQuizId(event.target.value); setQuestionDraft({ id: null, text: "", answers: blankAnswers() }); }}>{data.quizzes.map(quiz => <option key={quiz.id} value={quiz.id}>{quiz.name}</option>)}</select>}>
          {!selectedQuizId ? <div className="empty-state"><p>Спочатку створіть тест.</p></div> : <>
            <form className="admin-question-form" onSubmit={submitQuestion}><label><span>Текст запитання</span><textarea required maxLength={250} value={questionDraft.text} onChange={event => setQuestionDraft({ ...questionDraft, text: event.target.value })} /></label><div className="admin-answer-grid">{questionDraft.answers.map((answer, index) => <label key={answer.key}><span>Варіант {index + 1}</span><input required maxLength={50} value={answer.text} onChange={event => changeAnswer(answer.key, "text", event.target.value)} /><span className="admin-check"><input type="checkbox" checked={answer.correct} onChange={event => changeAnswer(answer.key, "correct", event.target.checked)} /> Правильна відповідь</span></label>)}</div><div className="button-row"><button className="button button--dark" type="submit" disabled={working}>{questionDraft.id ? "Зберегти запитання" : "Додати запитання"}</button>{questionDraft.id && <button className="button button--ghost" type="button" onClick={() => setQuestionDraft({ id: null, text: "", answers: blankAnswers() })}>Скасувати</button>}</div></form>
            {questionError && <div className="alert alert--error">{questionError}</div>}{questionLoading ? <p>Завантаження запитань…</p> : <div className="admin-question-list">{questions.map((question, index) => <article key={question.id}><div><span>{String(index + 1).padStart(2, "0")}</span><strong>{question.text}</strong></div><ol>{question.answers.map(answer => <li className={answer.correct ? "is-correct" : ""} key={answer.id}>{answer.text}{answer.correct && " ✓"}</li>)}</ol><div className="button-row"><button className="button button--ghost button--small" type="button" onClick={() => editQuestion(question)}>Редагувати</button><button className="button button--danger button--small" type="button" onClick={() => void deleteQuestion(question)}>Видалити</button></div></article>)}</div>}
          </>}
        </AdminSection>

        <AdminSection eyebrow="Доступ" title="Користувачі"><div className="admin-table"><div className="admin-table__head"><span>Користувач</span><span>Роль і статус</span><span>Дія</span></div>{data.users.map(user => <div className="admin-table__row" key={user.id}><div><strong>{user.username}</strong><small>#{user.id}</small></div><span>{user.role} · <b className={`status-dot status-dot--${user.status.toLowerCase()}`}>{user.status}</b></span><button className="button button--ghost button--small" type="button" disabled={working} onClick={() => void changeUserStatus(user)}>{user.status.toLowerCase() === "active" ? "Заблокувати" : "Активувати"}</button></div>)}</div><Pager meta={data.usersPage} onChange={onUsersPageChange} busy={working || loading} label="Користувачі" /></AdminSection>

        <AdminSection eyebrow="Аналітика" title="Усі результати" action={<div className="admin-date-filter"><label>Від<input type="datetime-local" value={resultRange.from} onChange={event => onResultRangeChange({ from: event.target.value })} /></label><label>До<input type="datetime-local" value={resultRange.to} onChange={event => onResultRangeChange({ to: event.target.value })} /></label></div>}><div className="admin-table"><div className="admin-table__head"><span>Користувач і тест</span><span>Дата</span><span>Результат</span></div>{data.results.map(result => <div className="admin-table__row" key={result.attemptId}><div><strong>{result.username}</strong><small>{result.quizName} · спроба #{result.attemptId}</small></div><span>{formatDate(result.completedAt)}</span><strong>{result.score}%</strong></div>)}</div><Pager meta={data.resultsPage} onChange={onResultsPageChange} busy={working || loading} label="Результати" />{!data.results.length && <p className="admin-empty">У вибраному діапазоні результатів немає.</p>}</AdminSection>
      </section>
    </>
  );
}
