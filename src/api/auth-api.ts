import type { ApiCore } from "./core.js";
import type { Profile, RegisterRequest, TokenResponse } from "../types.js";

/** Registration, sign-in and the signed-in user's own account resources. */
export class AuthApi {
  constructor(private readonly core: ApiCore) {}

  login(username: string, password: string): Promise<TokenResponse> {
    return this.core.request<TokenResponse>("/api/v1/auth/login", {
      method: "POST",
      body: { username, password }
    });
  }

  refresh(refreshToken: string): Promise<TokenResponse> {
    return this.core.request<TokenResponse>("/api/v1/auth/refresh", {
      method: "POST",
      body: { refreshToken }
    });
  }

  logout(): Promise<void> {
    return this.core.request<void>("/api/v1/auth/logout", {
      method: "POST",
      authenticated: true
    });
  }

  register(account: RegisterRequest): Promise<TokenResponse> {
    return this.core.request<TokenResponse>("/api/v1/auth/register", {
      method: "POST",
      body: account
    });
  }

  profile(): Promise<Profile> {
    return this.core.request<Profile>("/api/v1/users/me", { authenticated: true });
  }

  // Returns 200 with no body, so the payload is the empty string `response.text()`
  // produced — typed as void because there is nothing in it to read.
  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return this.core.request<void>("/api/v1/users/me/password", {
      method: "PUT",
      authenticated: true,
      body: { currentPassword, newPassword }
    });
  }
}
