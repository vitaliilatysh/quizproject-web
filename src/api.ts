// Public entry point for the API client. The implementation lives in src/api/:
// request mechanics in core.ts, one client per resource group, and the QuizApi
// facade that keeps the flat method surface existing call sites rely on.
export {
  ApiError,
  type ApiErrorOptions,
  type FetchLike,
  normalizeBaseUrl,
  type PagingOptions,
  readPageMeta,
  type RequestOptions,
  toInstant,
  type QuizApiOptions
} from "./api/core.js";
export { AdminApi } from "./api/admin-api.js";
export { AuthApi } from "./api/auth-api.js";
export { CatalogueApi } from "./api/catalogue-api.js";
export { QuizApi } from "./api/quiz-api.js";
