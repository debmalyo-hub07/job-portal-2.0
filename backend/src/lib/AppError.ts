export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown[];

  constructor(statusCode: number, code: string, message: string, details: unknown[] = []) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(code: string, message: string, details: unknown[] = []): AppError {
    return new AppError(400, code, message, details);
  }
  static unauthorized(code: string, message: string): AppError {
    return new AppError(401, code, message);
  }
  static forbidden(code: string, message: string): AppError {
    return new AppError(403, code, message);
  }
  static notFound(code: string, message: string): AppError {
    return new AppError(404, code, message);
  }
  static conflict(code: string, message: string): AppError {
    return new AppError(409, code, message);
  }
  static tooManyRequests(code: string, message: string): AppError {
    return new AppError(429, code, message);
  }
  static serviceUnavailable(code: string, message: string): AppError {
    return new AppError(503, code, message);
  }
}
