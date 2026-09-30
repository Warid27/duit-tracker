// Central error type. The global onError maps AppError -> JSON response (spec 4.5).
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'REGISTRATION_CLOSED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'IN_USE'
  | 'DUPLICATE'
  | 'RATE_LIMITED'
  | 'INTERNAL'

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError('VALIDATION_ERROR', 400, message, details)
  }
  static unauthenticated(message = 'Silakan login dulu.'): AppError {
    return new AppError('UNAUTHENTICATED', 401, message)
  }
  static forbidden(message = 'Akses ditolak.'): AppError {
    return new AppError('FORBIDDEN', 403, message)
  }
  static notFound(message = 'Data tidak ditemukan.'): AppError {
    return new AppError('NOT_FOUND', 404, message)
  }
  static conflict(message = 'Konflik data.', details?: unknown): AppError {
    return new AppError('CONFLICT', 409, message, details)
  }
  static inUse(message = 'Masih dipakai transaksi.'): AppError {
    return new AppError('IN_USE', 409, message)
  }
  static duplicate(message: string): AppError {
    return new AppError('DUPLICATE', 409, message)
  }
  static rateLimited(message: string, retryAfterSeconds: number): AppError {
    return new AppError('RATE_LIMITED', 429, message, { retryAfter: retryAfterSeconds })
  }
}
