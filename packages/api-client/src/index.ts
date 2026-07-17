export class ApiClientError extends Error {
  readonly status: number;
  readonly originalErrorData?: unknown;

  constructor(message: string, status: number, originalErrorData?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.originalErrorData = originalErrorData;
  }
}

export interface TokenProvider {
  getAccessToken(): string | null | Promise<string | null>;
  clear(): void | Promise<void>;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokenProvider?: TokenProvider;
  fetch?: typeof fetch;
  credentials?: RequestCredentials;
  getAdditionalHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  onUnauthorized?: (error: ApiClientError, response: Response) => void | Promise<void>;
}

export interface TenantSessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface TenantSessionProvider extends TokenProvider {
  getRefreshToken(): string | null | Promise<string | null>;
  setTokens(tokens: TenantSessionTokens): void | Promise<void>;
}

export interface TenantApiClientOptions extends Omit<ApiClientOptions, 'tokenProvider'> {
  sessionNamespace: string;
  sessionProvider: TenantSessionProvider;
  refreshEndpoint?: string;
}

export interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface ResponseRequestOptions extends RequestOptions {
  method?: string;
  body?: BodyInit;
}

export interface ApiClient {
  get<T>(endpoint: string, options?: RequestOptions): Promise<T>;
  post<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T>;
  del<T>(endpoint: string, options?: RequestOptions): Promise<T>;
  postFormData<T>(endpoint: string, data: FormData, options?: RequestOptions): Promise<T>;
  putFormData<T>(endpoint: string, data: FormData, options?: RequestOptions): Promise<T>;
  requestResponse(endpoint: string, options?: ResponseRequestOptions): Promise<Response>;
}

async function parseResponse<T>(response: Response): Promise<T> {
  let data: unknown = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (response.ok) return data as T;

  const errorData = data as { detail?: unknown };
  let message = `Ошибка ${response.status}`;
  if (typeof errorData.detail === 'string') message = errorData.detail;
  if (Array.isArray(errorData.detail)) {
    message = errorData.detail
      .map((item: { loc?: string[]; msg?: string }) => {
        const field = item.loc?.at(-1);
        return field ? `${field}: ${item.msg || ''}` : item.msg || '';
      })
      .filter(Boolean)
      .join('; ') || message;
  }
  if (response.status === 401 && !errorData.detail) message = 'Сессия истекла';
  if (response.status === 403 && !errorData.detail) message = 'Доступ запрещён';
  if (response.status === 429 && !errorData.detail) message = 'Слишком много запросов. Подождите немного.';
  throw new ApiClientError(message, response.status, data);
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl = options.fetch || globalThis.fetch;

  async function request(
    endpoint: string,
    method: string,
    body?: BodyInit,
    requestOptions: RequestOptions = {},
    contentType = true,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...(contentType ? { 'Content-Type': 'application/json' } : {}),
      ...(await options.getAdditionalHeaders?.()),
      ...requestOptions.headers,
    };
    const token = await options.tokenProvider?.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(`${options.baseUrl}${endpoint}`, {
      method,
      headers,
      body,
      signal: requestOptions.signal,
      credentials: options.credentials,
    });
    if (!response.ok) {
      let error: unknown;
      try {
        await parseResponse(response);
      } catch (caught) {
        error = caught;
      }
      if (error instanceof ApiClientError && error.status === 401) {
        await options.onUnauthorized?.(error, response);
      }
      throw error;
    }
    return response;
  }

  async function requestJson<T>(
    endpoint: string,
    method: string,
    body?: BodyInit,
    requestOptions?: RequestOptions,
    contentType = true,
  ): Promise<T> {
    return parseResponse<T>(await request(endpoint, method, body, requestOptions, contentType));
  }

  return {
    get: (endpoint, requestOptions) => requestJson(endpoint, 'GET', undefined, requestOptions),
    post: (endpoint, data, requestOptions) => requestJson(endpoint, 'POST', data === undefined ? undefined : JSON.stringify(data), requestOptions),
    put: (endpoint, data, requestOptions) => requestJson(endpoint, 'PUT', data === undefined ? undefined : JSON.stringify(data), requestOptions),
    patch: (endpoint, data, requestOptions) => requestJson(endpoint, 'PATCH', data === undefined ? undefined : JSON.stringify(data), requestOptions),
    del: (endpoint, requestOptions) => requestJson(endpoint, 'DELETE', undefined, requestOptions),
    postFormData: (endpoint, data, requestOptions) => requestJson(endpoint, 'POST', data, requestOptions, false),
    putFormData: (endpoint, data, requestOptions) => requestJson(endpoint, 'PUT', data, requestOptions, false),
    requestResponse: (endpoint, requestOptions = {}) => request(
      endpoint,
      requestOptions.method || 'GET',
      requestOptions.body,
      requestOptions,
      false,
    ),
  };
}

const refreshFlights = new Map<string, Promise<void>>();

class SessionCommitError extends Error {
  constructor(public readonly cause: unknown) {
    super('Failed to persist rotated session');
  }
}

export function createTenantApiClient(options: TenantApiClientOptions): ApiClient {
  const fetchImpl = options.fetch || globalThis.fetch;
  const refreshEndpoint = options.refreshEndpoint || '/auth/refresh';

  async function refreshSession(): Promise<void> {
    const activeFlight = refreshFlights.get(options.sessionNamespace);
    if (activeFlight) return activeFlight;

    const flight = (async () => {
      const refreshToken = await options.sessionProvider.getRefreshToken();
      if (!refreshToken) throw new ApiClientError('Сессия истекла', 401);

      const response = await fetchImpl(`${options.baseUrl}${refreshEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
        credentials: options.credentials,
      });
      const data = await parseResponse<{ access_token?: string; refresh_token?: string }>(response);
      if (!data.access_token || !data.refresh_token) {
        throw new ApiClientError('Сессия истекла', 401, data);
      }
      try {
        await options.sessionProvider.setTokens({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        });
      } catch (error) {
        throw new SessionCommitError(error);
      }
    })();

    refreshFlights.set(options.sessionNamespace, flight);
    try {
      await flight;
    } catch (error) {
      if (!(error instanceof SessionCommitError)) await options.sessionProvider.clear();
      throw error;
    } finally {
      if (refreshFlights.get(options.sessionNamespace) === flight) {
        refreshFlights.delete(options.sessionNamespace);
      }
    }
  }

  async function request(
    endpoint: string,
    method: string,
    body?: BodyInit,
    requestOptions: RequestOptions = {},
    contentType = true,
    retried = false,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...(contentType ? { 'Content-Type': 'application/json' } : {}),
      ...(await options.getAdditionalHeaders?.()),
      ...requestOptions.headers,
    };
    const token = await options.sessionProvider.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(`${options.baseUrl}${endpoint}`, {
      method,
      headers,
      body,
      signal: requestOptions.signal,
      credentials: options.credentials,
    });
    if (!response.ok) {
      let error: unknown;
      try {
        await parseResponse(response);
      } catch (caught) {
        error = caught;
      }
      if (!(error instanceof ApiClientError) || error.status !== 401 || retried || endpoint === refreshEndpoint) {
        if (error instanceof ApiClientError && error.status === 401) {
          await options.onUnauthorized?.(error, response);
        }
        throw error;
      }
      const currentToken = await options.sessionProvider.getAccessToken();
      if (token && currentToken && currentToken !== token) {
        return request(endpoint, method, body, requestOptions, contentType, true);
      }
      try {
        await refreshSession();
      } catch (refreshError) {
        const authError = refreshError instanceof ApiClientError
          ? refreshError
          : new ApiClientError('Сессия истекла', 401, refreshError);
        await options.onUnauthorized?.(authError, response);
        throw authError;
      }
      return request(endpoint, method, body, requestOptions, contentType, true);
    }
    return response;
  }

  async function requestJson<T>(
    endpoint: string,
    method: string,
    body?: BodyInit,
    requestOptions?: RequestOptions,
    contentType = true,
  ): Promise<T> {
    return parseResponse<T>(await request(endpoint, method, body, requestOptions, contentType));
  }

  return {
    get: (endpoint, requestOptions) => requestJson(endpoint, 'GET', undefined, requestOptions),
    post: (endpoint, data, requestOptions) => requestJson(endpoint, 'POST', data === undefined ? undefined : JSON.stringify(data), requestOptions),
    put: (endpoint, data, requestOptions) => requestJson(endpoint, 'PUT', data === undefined ? undefined : JSON.stringify(data), requestOptions),
    patch: (endpoint, data, requestOptions) => requestJson(endpoint, 'PATCH', data === undefined ? undefined : JSON.stringify(data), requestOptions),
    del: (endpoint, requestOptions) => requestJson(endpoint, 'DELETE', undefined, requestOptions),
    postFormData: (endpoint, data, requestOptions) => requestJson(endpoint, 'POST', data, requestOptions, false),
    putFormData: (endpoint, data, requestOptions) => requestJson(endpoint, 'PUT', data, requestOptions, false),
    requestResponse: (endpoint, requestOptions = {}) => request(
      endpoint,
      requestOptions.method || 'GET',
      requestOptions.body,
      requestOptions,
      false,
    ),
  };
}

export * from './media';
