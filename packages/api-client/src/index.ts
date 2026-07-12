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

export interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface ApiClient {
  get<T>(endpoint: string, options?: RequestOptions): Promise<T>;
  post<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T>;
  del<T>(endpoint: string, options?: RequestOptions): Promise<T>;
  postFormData<T>(endpoint: string, data: FormData, options?: RequestOptions): Promise<T>;
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

  async function request<T>(
    endpoint: string,
    method: string,
    body?: BodyInit,
    requestOptions: RequestOptions = {},
    contentType = true,
  ): Promise<T> {
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
    try {
      return await parseResponse<T>(response);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        await options.onUnauthorized?.(error, response);
      }
      throw error;
    }
  }

  return {
    get: (endpoint, requestOptions) => request(endpoint, 'GET', undefined, requestOptions),
    post: (endpoint, data, requestOptions) => request(endpoint, 'POST', data === undefined ? undefined : JSON.stringify(data), requestOptions),
    put: (endpoint, data, requestOptions) => request(endpoint, 'PUT', data === undefined ? undefined : JSON.stringify(data), requestOptions),
    patch: (endpoint, data, requestOptions) => request(endpoint, 'PATCH', data === undefined ? undefined : JSON.stringify(data), requestOptions),
    del: (endpoint, requestOptions) => request(endpoint, 'DELETE', undefined, requestOptions),
    postFormData: (endpoint, data, requestOptions) => request(endpoint, 'POST', data, requestOptions, false),
  };
}
