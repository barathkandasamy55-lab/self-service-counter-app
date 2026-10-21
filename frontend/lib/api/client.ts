import axios, { AxiosError } from 'axios';
import { ApiError } from './api-error';

/** Shared axios instance for the NestJS backend. In the browser, /api is proxied by Next. */
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
});

// Turn every failure into an ApiError, so callers handle one error type.
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ code?: string; message?: string | string[] }>) => {
    const body = error.response?.data;
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message ?? error.message;
    return Promise.reject(new ApiError(error.response?.status ?? 0, body?.code, message, body ?? {}));
  },
);
