/**
 * Quillts — interceptor pipeline.
 */

import type { Interceptor, RequestConfig, HttpResponse } from "./types";

/** Compose multiple interceptors into a single pipeline. */
export function composeInterceptors(
  interceptors: Interceptor[],
): Pick<Required<Interceptor>, "request" | "response" | "error"> {
  const requestChain = interceptors
    .filter((i): i is Required<Pick<Interceptor, "request">> & Interceptor =>
      typeof i.request === "function",
    )
    .map((i) => i.request!);

  const responseChain = interceptors
    .filter((i): i is Required<Pick<Interceptor, "response">> & Interceptor =>
      typeof i.response === "function",
    )
    .map((i) => i.response!);

  const errorChain = interceptors
    .filter((i): i is Required<Pick<Interceptor, "error">> & Interceptor =>
      typeof i.error === "function",
    )
    .map((i) => i.error!);

  return {
    request: async (config: RequestConfig): Promise<RequestConfig> => {
      let c = config;
      for (const fn of requestChain) {
        c = await fn(c);
      }
      return c;
    },
    response: async (response: HttpResponse): Promise<HttpResponse> => {
      let r = response;
      for (const fn of responseChain) {
        r = await fn(r);
      }
      return r;
    },
    error: async (error: Error): Promise<Error> => {
      let e = error;
      for (const fn of errorChain) {
        e = await fn(e);
      }
      return e;
    },
  };
}

/** Logging interceptor that traces requests/responses. */
export function loggingInterceptor(label = "quill"): Interceptor {
  return {
    request: (config) => {
      console.debug(`[${label}] → ${config.method} ${config.url}`);
      return config;
    },
    response: (response) => {
      console.debug(`[${label}] ← ${response.status} ${response.statusText}`);
      return response;
    },
    error: (error) => {
      console.warn(`[${label}] ✗ ${error.message}`);
      return error;
    },
  };
}

/** Auth interceptor that attaches a Bearer token. */
export function authInterceptor(token: string): Interceptor {
  return {
    request: (config) => ({
      ...config,
      headers: {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      },
    }),
  };
}
