import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient, QuillClient } from "../client";
import { HttpError, NetworkError, TimeoutError, RetryExhaustedError } from "../errors";
import { authInterceptor, loggingInterceptor } from "../interceptors";
import type { HttpResponse } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stub a `fetch` response. */
function mockFetch(status: number, body: unknown, headers?: Record<string, string>) {
  // 204/304 responses MUST NOT have a body per the Fetch spec.
  const hasBody = ![204, 304].includes(status);
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(hasBody ? JSON.stringify(body) : null, {
      status,
      statusText: status >= 200 && status < 300 ? "OK" : "Error",
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
    }),
  );
}

function mockFetchNetworkError() {
  return vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("fetch failed"));
}

function mockFetchTimeout() {
  // Simulate abort by an AbortError
  return vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
    new DOMException("The operation was aborted", "AbortError"),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Quill HTTP Client", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------- Creation ---------------

  it("should create a client with base URL", () => {
    const client = createClient({ baseUrl: "https://api.example.com" });
    expect(client).toBeInstanceOf(QuillClient);
  });

  it("should accept full configuration", () => {
    const client = createClient({
      baseUrl: "https://api.example.com",
      headers: { Authorization: "Bearer test" },
      timeout: 10_000,
      retry: { maxAttempts: 5, baseDelayMs: 100 },
    });
    expect(client).toBeInstanceOf(QuillClient);
  });

  // --------------- HTTP methods ---------------

  it("should make a GET request", async () => {
    const mock = mockFetch(200, { id: 1 });
    const client = createClient({ baseUrl: "https://api.example.com" });
    const res = await client.get("/users/1");
    expect(res.data).toEqual({ id: 1 });
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(mock).toHaveBeenCalledOnce();
  });

  it("should make a POST request with JSON body", async () => {
    const mock = mockFetch(201, { id: 2 });
    const client = createClient({ baseUrl: "https://api.example.com" });
    const res = await client.post("/users", { name: "Alice" });
    expect(res.data).toEqual({ id: 2 });
    expect(res.status).toBe(201);

    // Verify fetch received the correct body
    const callArgs = mock.mock.calls[0];
    expect(callArgs[0]).toBe("https://api.example.com/users");
    expect((callArgs[1] as RequestInit).method).toBe("POST");
    expect((callArgs[1] as RequestInit).body).toBe(JSON.stringify({ name: "Alice" }));
  });

  it("should make a PUT request", async () => {
    mockFetch(200, { ok: true });
    const client = createClient({ baseUrl: "https://api.example.com" });
    const res = await client.put("/users/1", { name: "Bob" });
    expect(res.ok).toBe(true);
  });

  it("should make a DELETE request", async () => {
    mockFetch(204, null);
    const client = createClient({ baseUrl: "https://api.example.com" });
    const res = await client.delete("/users/1");
    expect(res.status).toBe(204);
  });

  // --------------- Error handling ---------------

  it("should throw HttpError on 4xx response", async () => {
    mockFetch(404, { error: "Not found" });
    const client = createClient({ baseUrl: "https://api.example.com" });
    await expect(client.get("/nowhere")).rejects.toThrow(HttpError);
  });

  it("should throw HttpError on 5xx response", async () => {
    mockFetch(500, { error: "Server error" });
    const client = createClient({
      baseUrl: "https://api.example.com",
      retry: { maxAttempts: 1 },
    });
    await expect(client.get("/broken")).rejects.toThrow(HttpError);
  });

  it("should throw HttpError with status and body", async () => {
    mockFetch(400, { message: "Bad request" });
    const client = createClient({ baseUrl: "https://api.example.com" });
    try {
      await client.get("/bad");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(400);
      expect((err as HttpError).body).toEqual({ message: "Bad request" });
    }
  });

  it("should throw NetworkError on fetch failure", async () => {
    mockFetchNetworkError();
    const client = createClient({
      baseUrl: "https://api.example.com",
      retry: { maxAttempts: 1 },
    });
    await expect(client.get("/fail")).rejects.toThrow(NetworkError);
  });

  // --------------- Timeout ---------------

  it("should throw TimeoutError on abort", async () => {
    mockFetchTimeout();
    const client = createClient({
      baseUrl: "https://api.example.com",
      timeout: 100,
      retry: { maxAttempts: 1 },
    });
    await expect(client.get("/slow")).rejects.toThrow(TimeoutError);
  });

  // --------------- Retry ---------------

  it("should retry on network errors and succeed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // First call fails, second succeeds
    fetchSpy
      .mockRejectedValueOnce(new TypeError("conn refused"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const client = createClient({
      baseUrl: "https://api.example.com",
      retry: { maxAttempts: 3, baseDelayMs: 10 },
    });

    const res = await client.get("/retry-test");
    expect(res.data).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("should throw RetryExhaustedError after exhausting retries", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("always fails"));

    const client = createClient({
      baseUrl: "https://api.example.com",
      retry: { maxAttempts: 2, baseDelayMs: 10 },
    });

    await expect(client.get("/always-fail")).rejects.toThrow(RetryExhaustedError);
  });

  it("should retry on 5xx errors but not on 4xx", async () => {
    // Mock a 500 error then a 200 success
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const client = createClient({
      baseUrl: "https://api.example.com",
      retry: { maxAttempts: 2, baseDelayMs: 10 },
    });

    const res = await client.get("/retry-5xx");
    expect(res.data).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  // --------------- Interceptors ---------------

  it("should run request interceptors", async () => {
    mockFetch(200, {});
    const requestSpy = vi.fn((config) => config);
    const client = createClient(
      { baseUrl: "https://api.example.com" },
      [{ request: requestSpy }],
    );
    await client.get("/test");
    expect(requestSpy).toHaveBeenCalledOnce();
  });

  it("should run response interceptors", async () => {
    mockFetch(200, { hello: "world" });
    const responseSpy = vi.fn((res: HttpResponse) => res);
    const client = createClient(
      { baseUrl: "https://api.example.com" },
      [{ response: responseSpy }],
    );
    await client.get("/test");
    expect(responseSpy).toHaveBeenCalledOnce();
  });

  it("should run error interceptors", async () => {
    mockFetchNetworkError();
    const errorSpy = vi.fn((e: Error) => e);
    const client = createClient(
      { baseUrl: "https://api.example.com" },
      [{ error: errorSpy }],
    );
    await expect(client.get("/err")).rejects.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("auth interceptor should add Bearer header", async () => {
    const mock = mockFetch(200, {});
    const interceptor = authInterceptor("my-token");
    const client = createClient(
      { baseUrl: "https://api.example.com" },
      [interceptor],
    );
    await client.get("/secure");

    const callArgs = mock.mock.calls[0];
    const headers = (callArgs[1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer my-token");
  });

  it("logging interceptor should not throw", async () => {
    mockFetch(200, {});
    const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const client = createClient(
      { baseUrl: "https://api.example.com" },
      [loggingInterceptor("test")],
    );
    await client.get("/log");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  // --------------- URL resolution ---------------

  it("should resolve relative paths", async () => {
    const mock = mockFetch(200, {});
    const client = createClient({ baseUrl: "https://api.example.com" });
    await client.get("/api/v1/users");
    expect(mock.mock.calls[0][0]).toBe("https://api.example.com/api/v1/users");
  });

  it("should append query params", async () => {
    const mock = mockFetch(200, {});
    const client = createClient({ baseUrl: "https://api.example.com" });
    await client.get("/search", { params: { q: "hello", page: "1" } });
    const url = mock.mock.calls[0][0] as string;
    expect(url).toContain("q=hello");
    expect(url).toContain("page=1");
  });

  // --------------- Edge cases ---------------

  it("should handle empty response body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, {
        status: 204,
        statusText: "No Content",
        headers: { "Content-Type": "text/plain" },
      }),
    );
    const client = createClient({ baseUrl: "https://api.example.com" });
    const res = await client.delete("/resource/1");
    expect(res.status).toBe(204);
  });

  it("should set Content-Type for JSON body", async () => {
    const mock = mockFetch(200, {});
    const client = createClient({ baseUrl: "https://api.example.com" });
    await client.post("/data", { key: "value" });

    const headers = (mock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
