/**
 * Error handling utilities for ADA Auth Server
 * Provides typed error classes and response generation
 */

/**
 * Base application error class
 * All errors in the auth server should extend this
 */
export class AppError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "AppError";
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Convert error to HTTP Response with JSON body
   */
  toResponse(): Response {
    return new Response(
      JSON.stringify({
        error: this.message,
        code: this.code,
      }),
      {
        status: this.status,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}

/**
 * Authentication error (401)
 * Thrown when session is invalid, expired, or missing
 */
export class AuthError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "AUTH_ERROR");
    this.name = "AuthError";
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

/**
 * Validation error (400)
 * Thrown when request data is invalid
 */
export class ValidationError extends AppError {
  constructor(message = "Invalid request") {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Rate limit error (429)
 * Thrown when rate limit is exceeded
 */
export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super(message, 429, "RATE_LIMIT_ERROR");
    this.name = "RateLimitError";
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Apple authentication error (401)
 * Thrown when Apple OAuth flow fails
 */
export class AppleAuthError extends AppError {
  constructor(message = "Apple authentication failed") {
    super(message, 401, "APPLE_AUTH_ERROR");
    this.name = "AppleAuthError";
    Object.setPrototypeOf(this, AppleAuthError.prototype);
  }
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
