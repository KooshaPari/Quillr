/**
 * FR-QLL-001: Client Creation
 * Verifies: createClient returns a QuillClient instance with proper configuration
 * FR-QLL-006: Error Types
 * Verifies: HttpError, NetworkError, TimeoutError are properly thrown
 */

import { describe, it, expect } from "vitest";
import { createClient, QuillClient } from "../client";
import { HttpError, NetworkError, QuillError, RetryExhaustedError, TimeoutError } from "../errors";

describe("FR-QLL-001: Client Creation", () => {
  it("should create a client with base URL", () => {
    const client = createClient({ baseUrl: "https://api.example.com" });
    expect(client).toBeInstanceOf(QuillClient);
  });

  it("should create a client with custom headers", () => {
    const client = createClient({
      baseUrl: "https://api.example.com",
      headers: { Authorization: "Bearer token123" },
    });
    expect(client).toBeInstanceOf(QuillClient);
  });

  it("should accept timeout and retry configuration", () => {
    const client = createClient({
      baseUrl: "https://api.example.com",
      timeout: 5000,
      retry: { maxAttempts: 5 },
    });
    expect(client).toBeInstanceOf(QuillClient);
  });
});

describe("FR-QLL-006: Error Types", () => {
  it("HttpError should carry status and body", () => {
    const err = new HttpError(404, "Not Found", { message: "missing" });
    expect(err.status).toBe(404);
    expect(err.body).toEqual({ message: "missing" });
    expect(err.message).toContain("404");
  });

  it("NetworkError should wrap cause", () => {
    const cause = new Error("ECONNREFUSED");
    const err = new NetworkError("Connection refused", cause);
    expect(err.cause).toBe(cause);
    expect(err.message).toContain("Connection refused");
  });

  it("TimeoutError should report timeout duration", () => {
    const err = new TimeoutError(5000);
    expect(err.timeoutMs).toBe(5000);
    expect(err.message).toContain("5000");
  });

  it("RetryExhaustedError should report attempts and last error", () => {
    const last = new Error("server unavailable");
    const err = new RetryExhaustedError(3, last);
    expect(err.attempts).toBe(3);
    expect(err.lastError).toBe(last);
    expect(err.message).toContain("3");
  });

  it("QuillError should be the base class", () => {
    const httpErr = new HttpError(500, "Error", null);
    expect(httpErr).toBeInstanceOf(QuillError);

    const netErr = new NetworkError("fail");
    expect(netErr).toBeInstanceOf(QuillError);

    const timeoutErr = new TimeoutError(1000);
    expect(timeoutErr).toBeInstanceOf(QuillError);

    const retryErr = new RetryExhaustedError(3, new Error("fail"));
    expect(retryErr).toBeInstanceOf(QuillError);
  });
});
