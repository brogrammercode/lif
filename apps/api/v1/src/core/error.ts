export class AppError extends Error {
  public readonly status_code: number;
  public readonly error_code: string;
  public readonly details: unknown;

  public constructor(status_code: number, error_code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status_code = status_code;
    this.error_code = error_code;
    this.details = details;
  }
}

export const is_app_error = (error: unknown): error is AppError => error instanceof AppError;
