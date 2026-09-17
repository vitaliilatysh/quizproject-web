// Compatibility barrel: callers keep one stable import while implementations
// live next to the feature whose language and state they present.
export { ProfilePage, ResultsPage, SettingsPage } from "./components/account-pages.js";
export type { ProfilePageProps, ResultsPageProps, SettingsPageProps } from "./components/account-pages.js";
export { AttemptPage } from "./components/attempt-page.js";
export type { AttemptPageProps } from "./components/attempt-page.js";
export { LoginPage, SignupPage } from "./components/auth-pages.js";
export type { AuthPageProps } from "./components/auth-pages.js";
export { HomePage, QuizCollection, QuizzesPage } from "./components/catalogue-pages.js";
export type { HomePageProps, QuizCollectionProps, QuizzesPageProps } from "./components/catalogue-pages.js";
export { Layout } from "./components/layout.js";
export type { LayoutProps, Toast } from "./components/layout.js";
export { NotFoundPage } from "./components/not-found-page.js";
export { Pager } from "./components/pager.js";
export type { PagerProps } from "./components/pager.js";
export { AdminPage } from "./features/admin/admin-page.js";
export type { AdminPageProps } from "./features/admin/admin-page.js";
export type { AdminData, ExecuteAdmin, ResultRange } from "./features/admin/contracts.js";
