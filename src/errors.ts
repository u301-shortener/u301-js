import * as v from 'valibot'

export const ApiErrorSchema = v.object({
  message: v.string(),
  code: v.optional(v.string()),
  requestId: v.optional(v.string()),
  errors: v.optional(
    v.array(
      v.object({
        field: v.string(),
        message: v.string(),
      })
    )
  ),
})
export type ApiError = v.InferOutput<typeof ApiErrorSchema>

export type U301ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'VALIDATION_FAILED'
  | 'PARSE_FAILED'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'UNKNOWN'

type U301ErrorInit = {
  status?: number
  requestId?: string
  details?: unknown
  cause?: unknown
  code: U301ErrorCode
}

export class U301Error extends Error {
  readonly code: U301ErrorCode
  readonly status?: number
  readonly requestId?: string
  readonly details?: unknown
  constructor(message: string, init: U301ErrorInit) {
    super(message, { cause: init.cause })
    this.name = 'U301Error'
    this.code = init.code
    this.status = init.status
    this.requestId = init.requestId
    this.details = init.details
  }
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      status: this.status,
      requestId: this.requestId,
      details: this.details,
    }
  }
}

export class BadRequestError extends U301Error {
  constructor(message: string, init: Omit<U301ErrorInit, 'code'>) {
    super(message, { ...init, code: 'BAD_REQUEST' })
    this.name = 'BadRequestError'
  }
}
export class UnauthorizedError extends U301Error {
  constructor(message: string, init: Omit<U301ErrorInit, 'code'>) {
    super(message, { ...init, code: 'UNAUTHORIZED' })
    this.name = 'UnauthorizedError'
  }
}
export class ForbiddenError extends U301Error {
  constructor(message: string, init: Omit<U301ErrorInit, 'code'>) {
    super(message, { ...init, code: 'FORBIDDEN' })
    this.name = 'ForbiddenError'
  }
}
export class NotFoundError extends U301Error {
  constructor(message: string, init: Omit<U301ErrorInit, 'code'>) {
    super(message, { ...init, code: 'NOT_FOUND' })
    this.name = 'NotFoundError'
  }
}
export class RateLimitError extends U301Error {
  constructor(message: string, init: Omit<U301ErrorInit, 'code'>) {
    super(message, { ...init, code: 'RATE_LIMITED' })
    this.name = 'RateLimitError'
  }
}
export class ValidationError extends U301Error {
  constructor(message: string, init: Omit<U301ErrorInit, 'code'>) {
    super(message, { ...init, code: 'VALIDATION_FAILED' })
    this.name = 'ValidationError'
  }
}
export class ParseError extends U301Error {
  constructor(message: string, init: Omit<U301ErrorInit, 'code'>) {
    super(message, { ...init, code: 'PARSE_FAILED' })
    this.name = 'ParseError'
  }
}
export class NetworkError extends U301Error {
  constructor(message: string, init: Omit<U301ErrorInit, 'code'>) {
    super(message, { ...init, code: 'NETWORK_ERROR' })
    this.name = 'NetworkError'
  }
}
export class ServerError extends U301Error {
  constructor(message: string, init: Omit<U301ErrorInit, 'code'>) {
    super(message, { ...init, code: 'SERVER_ERROR' })
    this.name = 'ServerError'
  }
}

export type ErrorByCode<C extends U301ErrorCode> =
  C extends 'BAD_REQUEST' ? BadRequestError :
  C extends 'UNAUTHORIZED' ? UnauthorizedError :
  C extends 'FORBIDDEN' ? ForbiddenError :
  C extends 'NOT_FOUND' ? NotFoundError :
  C extends 'RATE_LIMITED' ? RateLimitError :
  C extends 'VALIDATION_FAILED' ? ValidationError :
  C extends 'PARSE_FAILED' ? ParseError :
  C extends 'NETWORK_ERROR' ? NetworkError :
  C extends 'SERVER_ERROR' ? ServerError :
  U301Error

/**
 * Check if the input is a U301Error
 * @param input The input to check
 * @returns Whether the input is a U301Error
 */
export function isU301Error(input: unknown): input is U301Error
/**
 * Check if the input is a U301Error
 * @param input The input to check
 * @param code Optional, the code to check against
 * @returns Whether the input is a U301Error
 */
export function isU301Error<C extends U301ErrorCode>(input: unknown, code: C): input is ErrorByCode<C>
export function isU301Error(input: unknown, code?: U301ErrorCode) {
  if (!(input instanceof U301Error)) return false
  if (!code) return true
  return input.code === code
}

type OfetchResponseLike = { status?: number; _data?: unknown }

export function toU301Error(response?: OfetchResponseLike, cause?: unknown) {
  const status = response?.status ?? 0
  const parsed = response?._data ? v.safeParse(ApiErrorSchema, response._data) : null
  const api = parsed && parsed.success ? parsed.output : null
  const message = api?.message ?? (cause instanceof Error ? cause.message : 'Request error')
  const requestId = api?.requestId
  const codeFromApi = api?.code
  if (status === 0) return new NetworkError(message, { status, requestId, details: api ?? response?._data, cause })
  if (status === 400) return new BadRequestError(message, { status, requestId, details: api, cause })
  if (status === 401) return new UnauthorizedError(message, { status, requestId, details: api, cause })
  if (status === 403) return new ForbiddenError(message, { status, requestId, details: api, cause })
  if (status === 404) return new NotFoundError(message, { status, requestId, details: api, cause })
  if (status === 429) return new RateLimitError(message, { status, requestId, details: api, cause })
  if (status >= 500) return new ServerError(message, { status, requestId, details: api, cause })
  return new U301Error(message, { status, requestId, details: api ?? response?._data, cause, code: (codeFromApi as U301ErrorCode) ?? 'UNKNOWN' })
}