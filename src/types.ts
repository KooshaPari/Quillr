/**
 * Quillts — Quill TypeScript HTTP client types.
 */

/** Supported HTTP methods. */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

/** Configuration passed to {@link createClient}. */
export interface ClientConfig {
  /** Base URL prepended to every request path. */
  baseUrl: string;
  /** Default headers sent with every request. */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds (default: 30_000). */
  timeout?: number;
  /** Retry configuration for transient failures. */
  retry?: RetryConfig;
}

/** Retry behaviour. */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3). */
  maxAttempts?: number;
  /** Base delay in milliseconds between retries (default: 200). */
  baseDelayMs?: number;
  /** Whether to use exponential backoff (default: true). */
  exponentialBackoff?: boolean;
}

/** A single HTTP request as processed by interceptors. */
export interface RequestConfig {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: BodyInit | null;
  /** Raw URL search params (merged after baseUrl path). */
  params?: Record<string, string>;
  /** Abort signal for cancellation. */
  signal?: AbortSignal | null;
}

/** Parsed HTTP response. */
export interface HttpResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
  ok: boolean;
}

/** Shape of an interceptor function. */
export interface Interceptor {
  /** Called before a request is dispatched. Return the (possibly modified) config. */
  request?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
  /** Called after a successful response is received. */
  response?: (response: HttpResponse) => HttpResponse | Promise<HttpResponse>;
  /** Called when a request or response throws. */
  error?: (error: Error) => Error | Promise<Error>;
}
