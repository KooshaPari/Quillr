/**
 * Quillts — Type-safe HTTP client with interceptors, retries, and error handling.
 *
 * @module
 * @example
 * ```ts
 * import { createClient } from "@kooshapari/quillts";
 *
 * const client = createClient({ baseUrl: "https://api.example.com" });
 * const { data } = await client.get<{ id: number }>("/users/1");
 * ```
 */

export { QuillClient, createClient } from "./client";
export { HttpError, NetworkError, QuillError, RetryExhaustedError, TimeoutError } from "./errors";
export { authInterceptor, composeInterceptors, loggingInterceptor } from "./interceptors";
export type {
  ClientConfig,
  HttpMethod,
  HttpResponse,
  Interceptor,
  RequestConfig,
  RetryConfig,
} from "./types";
