/**
 * ПЭРУМ API Client
 * Typed fetch wrapper with auth, error handling, and CSRF support
 */



class ApiClientError extends Error {
    status: number;
    originalErrorData?: unknown;

    constructor(message: string, status: number, originalErrorData?: unknown) {
        super(message);
        this.name = 'ApiClientError';
        this.status = status;
        this.originalErrorData = originalErrorData;
    }
}

async function handleResponse<T>(response: Response): Promise<T> {
    let data: unknown;
    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (response.status === 401) {
        // Only clear auth token if it's not the initial auth check
        // (otherwise we'd wipe tokens during login credential failures)
        const errorData = data as Record<string, unknown>;
        const errorMessage = (errorData?.detail as string) || 'Сессия истекла';
        if (typeof window !== 'undefined' && !response.url.includes('/user/me') && !response.url.includes('/login')) {
            localStorage.removeItem('auth_token');
            sessionStorage.removeItem('auth_token');
            window.dispatchEvent(new CustomEvent('auth_error', { detail: { message: errorMessage } }));
        }
        throw new ApiClientError(errorMessage, 401, data);
    }

    if (response.status === 429) {
        const errorData = data as Record<string, unknown>;
        throw new ApiClientError((errorData?.detail as string) || 'Слишком много запросов. Подождите немного.', 429, data);
    }

    if (response.status === 403) {
        const errorData = data as Record<string, unknown>;
        throw new ApiClientError((errorData?.detail as string) || 'Доступ запрещён', 403, data);
    }

    if (!response.ok) {
        const errorData = data as Record<string, unknown>;
        let message = `Ошибка ${response.status}`;

        if (errorData?.detail) {
            if (typeof errorData.detail === 'string') {
                message = errorData.detail;
            } else if (Array.isArray(errorData.detail)) {
                // Pydantic validation errors: [{loc: [...], msg: "...", type: "..."}]
                message = (errorData.detail as Array<{ loc?: string[]; msg?: string }>)
                    .map(e => {
                        const field = e.loc ? e.loc[e.loc.length - 1] : '';
                        return field ? `${field}: ${e.msg}` : (e.msg || '');
                    })
                    .filter(Boolean)
                    .join('; ') || message;
            }
        }

        throw new ApiClientError(message, response.status, data);
    }

    return data as T;
}

function getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
        if (token && token !== 'null') {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const csrfMeta = document.querySelector('meta[name="csrf-token"]');
        if (csrfMeta) {
            headers['X-CSRF-Token'] = csrfMeta.getAttribute('content') || '';
        }

        // Выбранная школа (для org_admin, который охватывает несколько школ).
        const schoolId = localStorage.getItem('current_school_id');
        if (schoolId && schoolId !== 'null') {
            headers['X-School-Id'] = schoolId;
        }
    }

    return headers;
}

export const api = {
    async get<T>(endpoint: string): Promise<T> {
        const res = await fetch(`/api${endpoint}`, {
            method: 'GET',
            headers: getHeaders(),
            credentials: 'include',
        });
        return handleResponse<T>(res);
    },

    async post<T>(endpoint: string, data?: unknown): Promise<T> {
        const res = await fetch(`/api${endpoint}`, {
            method: 'POST',
            headers: getHeaders(),
            credentials: 'include',
            body: data ? JSON.stringify(data) : undefined,
        });
        return handleResponse<T>(res);
    },

    async postFormData<T>(endpoint: string, formData: FormData): Promise<T> {
        const headers = getHeaders();
        delete headers['Content-Type']; // Let browser set multipart with boundary
        const res = await fetch(`/api${endpoint}`, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: formData,
        });
        return handleResponse<T>(res);
    },

    async put<T>(endpoint: string, data?: unknown): Promise<T> {
        const res = await fetch(`/api${endpoint}`, {
            method: 'PUT',
            headers: getHeaders(),
            credentials: 'include',
            body: data ? JSON.stringify(data) : undefined,
        });
        return handleResponse<T>(res);
    },

    async patch<T>(endpoint: string, data?: unknown): Promise<T> {
        const res = await fetch(`/api${endpoint}`, {
            method: 'PATCH',
            headers: getHeaders(),
            credentials: 'include',
            body: data ? JSON.stringify(data) : undefined,
        });
        return handleResponse<T>(res);
    },

    async del<T>(endpoint: string): Promise<T> {
        const res = await fetch(`/api${endpoint}`, {
            method: 'DELETE',
            headers: getHeaders(),
            credentials: 'include',
        });
        return handleResponse<T>(res);
    },
};

export { ApiClientError };
export default api;
