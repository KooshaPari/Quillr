/**
 * Quillts — typed HTTP error hierarchy.
 */

/** Base class for all Quill client errors. */
export class QuillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuillError";
  }
}

/** A network-level failure (DNS, connection refused, timeout). */
export class NetworkError extends QuillError {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "NetworkError";
  }
}

/** Request exceeded the configured timeout. */
export class TimeoutError extends NetworkError {
  constructor(public readonly timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/** The server returned a non-2xx status. */
export class HttpError extends QuillError {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
  ) {
    super(`HTTP ${status} ${statusText}`);
    this.name = "HttpError";
  }
}

/** Retry budget was exhausted. */
export class RetryExhaustedError extends QuillError {
  constructor(
    public readonly attempts: number,
    public readonly lastError: Error,
  ) {
    super(`Retry exhausted after ${attempts} attempts: ${lastError.message}`);
    this.name = "RetryExhaustedError";
  }
}
