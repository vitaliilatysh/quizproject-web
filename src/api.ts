// Public API entry point: shared transport and resource-specific clients.
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
