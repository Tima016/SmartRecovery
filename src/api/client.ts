import axios from 'axios';

const TOKEN_KEY = 'idfr_access_token';

/**
 * Axios instance pre-configured for the IDFR backend.
 *
 * - Base URL strictly mapped to '/api/v1' for Nginx production routing.
 * - Request interceptor attaches the JWT from localStorage.
 * - Response interceptor handles 401 globally (clears token, redirects to /login).
 */
export const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api/v1',
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30_000,
});

// ─── Request interceptor: attach Bearer token ──────────────────────
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error),
);

import toast from 'react-hot-toast';

// ─── Response interceptor: handle 401 globally and toast errors ───
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;

            if (status === 401) {
                localStorage.removeItem(TOKEN_KEY);
                localStorage.removeItem('idfr_refresh_token');
                localStorage.removeItem('idfr_user');

                // Redirect to login, but avoid redirect loops
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
            } else if (status >= 500) {
                // Internal Server Errors
                toast.error(data?.message || 'A server error occurred. Please try again later.');
            } else if (status >= 400 && status < 500) {
                // Client Errors (ignore 404 to avoid noisy toasts on missing items)
                if (status !== 404) {
                    toast.error(
                        typeof data?.message === 'string'
                            ? data.message
                            : Array.isArray(data?.message)
                                ? data.message[0]
                                : data?.error || 'A request error occurred.'
                    );
                }
            }
        } else if (error.request) {
            // Network failures
            toast.error('Network error. Please check your connection.');
        }

        return Promise.reject(error);
    },
);

export { TOKEN_KEY };
