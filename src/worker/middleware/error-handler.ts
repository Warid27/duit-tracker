// Global error mapping (spec 4.5): AppError -> its code/status; ZodError -> 400; unknown -> 500 INTERNAL.
import type { Context, ErrorHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ZodError } from 'zod'
import { AppError, type ErrorCode } from '../lib/errors'

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown }
}

export const onError: ErrorHandler = (rawC, err) => {
  const c = rawC as unknown as Context
  if (err instanceof AppError) {
    const body: ErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    }
    if (err.code === 'RATE_LIMITED') {
      const retry = (err.details as { retryAfter?: number } | undefined)?.retryAfter
      if (retry) c.header('Retry-After', String(retry))
    }
    return c.json(body, err.status as ContentfulStatusCode)
  }
  if (err instanceof ZodError) {
    const first = err.issues[0]
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: first?.message ?? 'Input tidak valid.',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      } satisfies ErrorBody,
      400,
    )
  }
  console.error('Unhandled error:', err instanceof Error ? err.message : err)
  return c.json(
    { error: { code: 'INTERNAL', message: 'Terjadi kesalahan. Coba lagi ya.' } } satisfies ErrorBody,
    500,
  )
}
