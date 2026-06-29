/**
 * Quillts — type-safe HTTP client with interceptors and retry.
 */

import type {
  ClientConfig,
  HttpMethod,
  HttpResponse,
  Interceptor,
  RequestConfig,
} from "./types";
import { HttpError, NetworkError, RetryExhaustedError, TimeoutError } from "./errors";
import { composeInterceptors } from "./interceptors";

/** Default timeout in milliseconds. */
const DEFAULT_TIMEOUT = 30_000;

/** Default max retry attempts. */
const DEFAULT_MAX_RETRIES = 3;

/** Default base delay between retries (ms). */
const DEFAULT_BASE_DELAY = 200;

/**
 * Type-safe HTTP client.
 *
 * @example
 * ```ts
 * const client = createClient({ baseUrl: "https://api.example.com" });
 * const data = await client.get<{ id: number }>("/users/1");
 * ```
 */
export class QuillClient {
  private readonly config: ClientConfig;
  private readonly pipeline: ReturnType<typeof composeInterceptors>;

  constructor(config: ClientConfig, interceptors: Interceptor[] = []) {
    this.config = {
      timeout: DEFAULT_TIMEOUT,
      retry: {
        maxAttempts: DEFAULT_MAX_RETRIES,
        baseDelayMs: DEFAULT_BASE_DELAY,
        exponentialBackoff: true,
      },
      ...config,
    };
    this.pipeline = composeInterceptors(interceptors);
  }

  /** Perform a typed GET request. */
  async get<T = unknown>(
    path: string,
    options?: Partial<RequestConfig>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>("GET", path, undefined, options);
  }

  /** Perform a typed POST request. */
  async post<T = unknown>(
    path: string,
    body?: unknown,
    options?: Partial<RequestConfig>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>("POST", path, body, options);
  }

  /** Perform a typed PUT request. */
  async put<T = unknown>(
    path: string,
    body?: unknown,
    options?: Partial<RequestConfig>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>("PUT", path, body, options);
  }

  /** Perform a typed DELETE request. */
  async delete<T = unknown>(
    path: string,
    options?: Partial<RequestConfig>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>("DELETE", path, undefined, options);
  }

  /** Core request dispatcher with interceptor pipeline and retry. */
  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options?: Partial<RequestConfig>,
  ): Promise<HttpResponse<T>> {
    const url = this.resolveUrl(path, options?.params);
    const headers: Record<string, string> = {
      ...this.config.headers,
      ...options?.headers,
    };

    let initBody: BodyInit | null | undefined;
    if (body !== undefined && body !== null) {
      if (typeof body === "string" || body instanceof FormData || body instanceof URLSearchParams) {
        initBody = body;
      } else {
        initBody = JSON.stringify(body);
        if (!headers["Content-Type"] && !headers["content-type"]) {
          headers["Content-Type"] = "application/json";
        }
      }
    }

    let config: RequestConfig = {
      method,
      url,
      headers,
      body: initBody,
      params: options?.params,
      signal: options?.signal ?? null,
    };

    // Run request interceptors.
    config = await this.pipeline.request(config);

    const maxAttempts = this.config.retry?.maxAttempts ?? DEFAULT_MAX_RETRIES;
    let lastError: Error | undefined;
    let didRetry = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await this.executeSingleRequest<T>(config, attempt);
        return response;
      } catch (err) {
        let currentError = err instanceof Error ? err : new Error(String(err));
        currentError = await this.pipeline.error(currentError);
        lastError = currentError;

        if (this.shouldRetry(lastError) && attempt < maxAttempts - 1) {
          didRetry = true;
          await this.delay(attempt);
          // eslint-disable-next-line no-continue
          continue;
        }

        // If we exhausted retries, wrap in RetryExhaustedError.
        if (didRetry || (attempt > 0 && this.shouldRetry(lastError))) {
          throw new RetryExhaustedError(maxAttempts, lastError);
        }
        throw lastError;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _exhaustive: never = undefined as never;
    throw new RetryExhaustedError(maxAttempts, lastError ?? new Error("Unknown error"));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private resolveUrl(path: string, params?: Record<string, string>): string {
    const base = this.config.baseUrl.replace(/\/+$/, "");
    const p = path.startsWith("/") ? path : `/${path}`;
    let url = `${base}${p}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += `?${qs}`;
    }
    return url;
  }

  private async executeSingleRequest<T>(
    config: RequestConfig,
    attempt: number,
  ): Promise<HttpResponse<T>> {
    const timeout = this.config.timeout ?? DEFAULT_TIMEOUT;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Combine user signal with timeout signal.
    const signal = config.signal
      ? combineAbortSignals(config.signal, controller.signal)
      : controller.signal;

    try {
      const fetchInit: RequestInit = {
        method: config.method,
        headers: config.headers,
        body: config.body,
        signal,
      };

      let raw: Response;
      try {
        raw = await fetch(config.url, fetchInit);
      } catch (fetchErr) {
        if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
          throw new TimeoutError(timeout);
        }
        throw new NetworkError(
          `Network error: ${(fetchErr as Error).message}`,
          fetchErr as Error,
        );
      }

      const responseHeaders: Record<string, string> = {};
      raw.headers.forEach((v, k) => {
        responseHeaders[k] = v;
      });

      let data: T;
      const ct = raw.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        data = (await raw.json()) as T;
      } else {
        data = (await raw.text()) as unknown as T;
      }

      let response: HttpResponse<T> = {
        status: raw.status,
        statusText: raw.statusText,
        headers: responseHeaders,
        data,
        ok: raw.ok,
      };

      // Run response interceptors.
      response = (await this.pipeline.response(
        response as unknown as HttpResponse,
      )) as unknown as HttpResponse<T>;

      if (!raw.ok) {
        throw new HttpError(raw.status, raw.statusText, data);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private shouldRetry(err: Error): boolean {
    // Retry on network errors and 5xx server errors.
    if (err instanceof NetworkError) return true;
    if (err instanceof HttpError && err.status >= 500) return true;
    return false;
  }

  private async delay(attempt: number): Promise<void> {
    const base = this.config.retry?.baseDelayMs ?? DEFAULT_BASE_DELAY;
    const exponential = this.config.retry?.exponentialBackoff ?? true;
    const ms = exponential ? base * Math.pow(2, attempt) : base;
    // Add jitter: ±25%
    const jitter = ms * 0.25 * (Math.random() * 2 - 1);
    await new Promise((r) => setTimeout(r, ms + jitter));
  }
}

/**
 * Create a new {@link QuillClient}.
 *
 * @example
 * ```ts
 * const client = createClient({ baseUrl: "https://api.example.com" });
 * ```
 */
export function createClient(
  config: ClientConfig,
  interceptors: Interceptor[] = [],
): QuillClient {
  return new QuillClient(config, interceptors);
}

/**
 * Combine two AbortSignals into one (fires when either aborts).
 */
function combineAbortSignals(s1: AbortSignal, s2: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  s1.addEventListener("abort", onAbort);
  s2.addEventListener("abort", onAbort);
  // Cleanup listeners when the combined signal fires.
  controller.signal.addEventListener("abort", () => {
    s1.removeEventListener("abort", onAbort);
    s2.removeEventListener("abort", onAbort);
  });
  return controller.signal;
}
