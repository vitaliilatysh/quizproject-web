import { AdminApi } from "./admin-api.js";
import { AuthApi } from "./auth-api.js";
import { CatalogueApi } from "./catalogue-api.js";
import { ApiCore, type QuizApiOptions, type RequestOptions } from "./core.js";

/** Resource clients share one transport, token source and server clock. */
export class QuizApi {
  readonly baseUrl: string;
  readonly auth: AuthApi;
  readonly catalogue: CatalogueApi;
  readonly admin: AdminApi;
  private readonly core: ApiCore;

  constructor(options: QuizApiOptions) {
    this.core = new ApiCore(options);
    this.baseUrl = this.core.baseUrl;
    this.auth = new AuthApi(this.core);
    this.catalogue = new CatalogueApi(this.core);
    this.admin = new AdminApi(this.core);
  }

  /** Escape hatch for a resource none of the domain clients cover yet. */
  request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.core.request<T>(path, options);
  }
}
