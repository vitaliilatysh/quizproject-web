/** Generated from contract/openapi.json. Do not edit; run npm run api:generate. */
export interface paths {
  "/api/v1/admin/levels": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["levels"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/admin/questions/{questionId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations["updateQuestion"];
    post?: never;
    delete: operations["deleteQuestion"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/admin/quizzes": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["quizzes"];
    put?: never;
    post: operations["createQuiz"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/admin/quizzes/{quizId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations["updateQuiz"];
    post?: never;
    delete: operations["deleteQuiz"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/admin/quizzes/{quizId}/questions": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["questions"];
    put?: never;
    post: operations["createQuestion"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/admin/results": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["results"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/admin/status": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Verify administrator access */
    get: operations["status"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/admin/subjects": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["subjects"];
    put?: never;
    post: operations["createSubject"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/admin/subjects/{subjectId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations["updateSubject"];
    post?: never;
    delete: operations["deleteSubject"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/admin/users": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["users"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/admin/users/{userId}/status": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations["updateUserStatus"];
    trace?: never;
  };
  "/api/v1/attempts/{attemptId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Read an owned quiz attempt without exposing correct answers */
    get: operations["get"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/attempts/{attemptId}/complete": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Submit selected answers and complete an owned attempt once */
    post: operations["complete"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/auth/login": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Exchange database credentials for an access and refresh token pair */
    post: operations["login"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/auth/logout": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Revoke the current authenticated session */
    post: operations["logout"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/auth/refresh": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Rotate a refresh token and issue a new token pair */
    post: operations["refresh"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/auth/register": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Create an active student account and return an access and refresh token pair */
    post: operations["register"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/quizzes": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List quizzes
     * @description Optional `search` matches a substring of the quiz name or its subject, case-insensitively. Optional `complexity` narrows by level label as stored (`low`, `medium`, `high`, `advanced`) and may be repeated to accept several. Both are applied by the database, so they narrow the whole collection rather than the page being returned.
     */
    get: operations["getQuizzes"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/quizzes/{quizId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get a quiz */
    get: operations["getQuiz"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/quizzes/{quizId}/attempts": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Start a quiz attempt for the current user */
    post: operations["start"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/quizzes/summary": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Catalogue totals
     * @description Total quizzes and the number of subjects that carry at least one, for callers that show a summary without fetching the whole catalogue.
     */
    get: operations["getSummary"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/results/me": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List the current user's completed quiz results */
    get: operations["getMyResults"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/results/me/summary": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Summarize all the current user's completed results, independently of pagination */
    get: operations["getMySummary"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/users/me": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Read the current user's profile */
    get: operations["profile"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/v1/users/me/password": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Change the current user's password */
    put: operations["changePassword"];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/error": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["handleError"];
    put: operations["handleError_2"];
    post: operations["handleError_1"];
    delete: operations["handleError_3"];
    options: operations["handleError_6"];
    head: operations["handleError_5"];
    patch: operations["handleError_4"];
    trace: operations["handleError_7"];
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    AdminAnswer: {
      correct: boolean;
      /** Format: int32 */
      id: number;
      text: string;
    };
    AdminLevel: {
      /** Format: int32 */
      id: number;
      name: string;
    };
    AdminQuestion: {
      answers: components["schemas"]["AdminAnswer"][];
      /** Format: int32 */
      id: number;
      /** Format: int32 */
      quizId: number;
      text: string;
    };
    AdminQuiz: {
      complexity: string;
      /** Format: int32 */
      id: number;
      /** Format: int32 */
      levelId: number;
      name: string;
      subject: string;
      /** Format: int32 */
      subjectId: number;
      /** Format: int32 */
      timeToPassMinutes: number;
      /** Format: int32 */
      totalQuestions: number;
    };
    AdminResult: {
      /** Format: int64 */
      attemptId: number;
      /** Format: date-time */
      completedAt: string;
      /** Format: int32 */
      quizId: number;
      quizName: string;
      /** Format: int32 */
      score: number;
      username: string;
    };
    AdminStatusResponse: {
      access: string;
      service: string;
    };
    AdminSubject: {
      /** Format: int32 */
      id: number;
      name: string;
    };
    AdminUser: {
      /** Format: int32 */
      id: number;
      role: string;
      status: string;
      username: string;
    };
    AnswerOptionResponse: {
      /** Format: int32 */
      id: number;
      text: string;
    };
    AnswerRequest: {
      correct: boolean;
      /** Format: int32 */
      id?: number;
      text: string;
    };
    ApiError: {
      error: string;
      message: string;
      path: string;
      /** Format: int32 */
      status: number;
      /** Format: date-time */
      timestamp: string;
    };
    AttemptCompletionResponse: {
      /** Format: int32 */
      attemptId: number;
      /** Format: date-time */
      completedAt: string;
      /** Format: int32 */
      quizId: number;
      /** Format: int32 */
      score: number;
    };
    AttemptQuestionResponse: {
      answers: components["schemas"]["AnswerOptionResponse"][];
      /** Format: int32 */
      id: number;
      text: string;
    };
    AttemptResponse: {
      /** Format: int32 */
      attemptId: number;
      completed: boolean;
      /** Format: date-time */
      completedAt: string | null;
      /** Format: date-time */
      expiresAt: string;
      questions: components["schemas"]["AttemptQuestionResponse"][];
      /** Format: int32 */
      quizId: number;
      /** Format: int32 */
      score: number | null;
      /** Format: date-time */
      startedAt: string;
    };
    ChangePasswordRequest: {
      currentPassword: string;
      newPassword: string;
    };
    CompleteAttemptRequest: {
      answerIds: number[];
    };
    LoginRequest: {
      password: string;
      username: string;
    };
    ProfileResponse: {
      firstName: string;
      /** Format: date-time */
      lastLoginAt: string | null;
      lastName: string;
      /** Format: date-time */
      registeredAt: string;
      role: string;
      status: string;
      username: string;
    };
    QuestionRequest: {
      answers: components["schemas"]["AnswerRequest"][];
      text: string;
    };
    QuizCatalogueSummary: {
      /** Format: int64 */
      totalQuizzes: number;
      /** Format: int64 */
      totalSubjects: number;
    };
    QuizRequest: {
      /** Format: int32 */
      levelId: number;
      name: string;
      /** Format: int32 */
      subjectId: number;
      /** Format: int32 */
      timeToPassMinutes: number;
    };
    QuizResponse: {
      complexity: string;
      /** Format: int32 */
      id: number;
      name: string;
      subject: string;
      /** Format: int32 */
      timeToPassMinutes: number;
      /** Format: int32 */
      totalQuestions: number;
    };
    RefreshTokenRequest: {
      refreshToken: string;
    };
    RegisterRequest: {
      firstName: string;
      lastName: string;
      password: string;
      username: string;
    };
    ResultResponse: {
      /** Format: int32 */
      attemptId: number;
      /** Format: date-time */
      completedAt: string;
      /** Format: int32 */
      quizId: number;
      quizName: string;
      /** Format: int32 */
      score: number;
    };
    ResultSummary: {
      /** Format: double */
      averageScore: number;
      /** Format: int32 */
      bestScore: number;
      /** Format: int64 */
      totalAttempts: number;
    };
    SubjectRequest: {
      name: string;
    };
    TokenResponse: {
      accessToken: string;
      /** Format: int64 */
      expiresIn: number;
      /** Format: int64 */
      refreshExpiresIn: number;
      refreshToken: string;
      tokenType: string;
    };
    UserStatusRequest: {
      status: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  levels: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AdminLevel"][];
        };
      };
    };
  };
  updateQuestion: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        questionId: number;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["QuestionRequest"];
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AdminQuestion"];
        };
      };
    };
  };
  deleteQuestion: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        questionId: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description No Content */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  quizzes: {
    parameters: {
      query?: {
        page?: number;
        size?: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AdminQuiz"][];
        };
      };
    };
  };
  createQuiz: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["QuizRequest"];
      };
    };
    responses: {
      /** @description Created */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AdminQuiz"];
        };
      };
    };
  };
  updateQuiz: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        quizId: number;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["QuizRequest"];
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AdminQuiz"];
        };
      };
    };
  };
  deleteQuiz: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        quizId: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description No Content */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  questions: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        quizId: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AdminQuestion"][];
        };
      };
    };
  };
  createQuestion: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        quizId: number;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["QuestionRequest"];
      };
    };
    responses: {
      /** @description Created */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AdminQuestion"];
        };
      };
    };
  };
  results: {
    parameters: {
      query?: {
        from?: string;
        page?: number;
        size?: number;
        to?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AdminResult"][];
        };
      };
    };
  };
  status: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AdminStatusResponse"];
        };
      };
    };
  };
  subjects: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AdminSubject"][];
        };
      };
    };
  };
  createSubject: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["SubjectRequest"];
      };
    };
    responses: {
      /** @description Created */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AdminSubject"];
        };
      };
    };
  };
  updateSubject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        subjectId: number;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["SubjectRequest"];
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AdminSubject"];
        };
      };
    };
  };
  deleteSubject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        subjectId: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description No Content */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  users: {
    parameters: {
      query?: {
        page?: number;
        size?: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AdminUser"][];
        };
      };
    };
  };
  updateUserStatus: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        userId: number;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["UserStatusRequest"];
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AdminUser"];
        };
      };
    };
  };
  get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        attemptId: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AttemptResponse"];
        };
      };
    };
  };
  complete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        attemptId: number;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["CompleteAttemptRequest"];
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AttemptCompletionResponse"];
        };
      };
    };
  };
  login: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["LoginRequest"];
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["TokenResponse"];
        };
      };
    };
  };
  logout: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description No Content */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  refresh: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["RefreshTokenRequest"];
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["TokenResponse"];
        };
      };
    };
  };
  register: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["RegisterRequest"];
      };
    };
    responses: {
      /** @description Created */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["TokenResponse"];
        };
      };
    };
  };
  getQuizzes: {
    parameters: {
      query?: {
        complexity?: string[];
        page?: number;
        search?: string;
        size?: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["QuizResponse"][];
        };
      };
    };
  };
  getQuiz: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        quizId: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Quiz not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["QuizResponse"];
        };
      };
    };
  };
  start: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        quizId: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Created */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["AttemptResponse"];
        };
      };
    };
  };
  getSummary: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["QuizCatalogueSummary"];
        };
      };
    };
  };
  getMyResults: {
    parameters: {
      query?: {
        page?: number;
        size?: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["ResultResponse"][];
        };
      };
    };
  };
  getMySummary: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["ResultSummary"];
        };
      };
    };
  };
  profile: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "*/*": components["schemas"]["ProfileResponse"];
        };
      };
    };
  };
  changePassword: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["ChangePasswordRequest"];
      };
    };
    responses: {
      /** @description No Content */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  handleError: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ApiError"];
        };
      };
    };
  };
  handleError_2: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ApiError"];
        };
      };
    };
  };
  handleError_1: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ApiError"];
        };
      };
    };
  };
  handleError_3: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ApiError"];
        };
      };
    };
  };
  handleError_6: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ApiError"];
        };
      };
    };
  };
  handleError_5: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ApiError"];
        };
      };
    };
  };
  handleError_4: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ApiError"];
        };
      };
    };
  };
  handleError_7: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ApiError"];
        };
      };
    };
  };
}
