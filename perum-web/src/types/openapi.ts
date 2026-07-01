import createClient from 'openapi-fetch';
import type { paths } from './api';

const client = createClient<paths>();

// Add interceptor to include auth tokens & CSRF
client.use({
    onRequest({ request }) {
        if (typeof window !== 'undefined') {
            const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
            if (token && token !== 'null') {
                request.headers.set('Authorization', `Bearer ${token}`);
            }

            const csrfMeta = document.querySelector('meta[name="csrf-token"]');
            if (csrfMeta) {
                const tokenContent = csrfMeta.getAttribute('content');
                if (tokenContent) {
                    request.headers.set('X-CSRF-Token', tokenContent);
                }
            }
        }
        return request;
    },
    // We can also handle global response errors here via onResponse 
    // but React Query covers a lot of that.
    onResponse({ response }) {
        if (response.status === 401 && typeof window !== 'undefined' && !response.url.includes('/user/me')) {
            localStorage.removeItem('auth_token');
            sessionStorage.removeItem('auth_token');
            window.dispatchEvent(new CustomEvent('auth_error', { detail: { message: 'Сессия истекла' } }));
        }
        return response;
    }
});

export default client;
