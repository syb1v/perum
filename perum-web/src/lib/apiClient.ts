import { ApiClientError, createApiClient } from '@perum/api-client';

const tokenProvider = {
    getAccessToken(): string | null {
        if (typeof window === 'undefined') return null;
        const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
        return token && token !== 'null' ? token : null;
    },
    clear(): void {
        if (typeof window === 'undefined') return;
        localStorage.removeItem('auth_token');
        sessionStorage.removeItem('auth_token');
    },
};

const client = createApiClient({
    baseUrl: '/api',
    tokenProvider,
    credentials: 'include',
    getAdditionalHeaders(): Record<string, string> {
        if (typeof document === 'undefined') return {};
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        return csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
    },
    async onUnauthorized(error, response) {
        if (typeof window === 'undefined') return;
        if (response.url.includes('/user/me') || response.url.includes('/login')) return;
        await tokenProvider.clear();
        window.dispatchEvent(new CustomEvent('auth_error', { detail: { message: error.message } }));
    },
});

export const api = {
    get<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
        return client.get<T>(endpoint, { signal });
    },
    post<T>(endpoint: string, data?: unknown): Promise<T> {
        return client.post<T>(endpoint, data);
    },
    postFormData<T>(endpoint: string, formData: FormData): Promise<T> {
        return client.postFormData<T>(endpoint, formData);
    },
    put<T>(endpoint: string, data?: unknown): Promise<T> {
        return client.put<T>(endpoint, data);
    },
    patch<T>(endpoint: string, data?: unknown): Promise<T> {
        return client.patch<T>(endpoint, data);
    },
    del<T>(endpoint: string): Promise<T> {
        return client.del<T>(endpoint);
    },
};

export { ApiClientError };
export default api;
