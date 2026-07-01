import { NextResponse } from 'next/server'

export type ApiErrorBody = {
  error: { code: string; message: string }
}

export const Err = {
  invalidBody:    (msg = 'Invalid request body.')                    => ({ code: 'INVALID_BODY',         message: msg }),
  unauthorized:   (msg = 'Missing or invalid Authorization header.') => ({ code: 'UNAUTHORIZED',         message: msg }),
  invalidKey:     (msg = 'Invalid API key.')                         => ({ code: 'INVALID_KEY',          message: msg }),
  validation:     (msg: string)                                      => ({ code: 'VALIDATION_ERROR',     message: msg }),
  rateLimited:    (msg = 'Rate limit exceeded. Max 100 requests per minute per API key.') => ({ code: 'RATE_LIMITED', message: msg }),
  notFound:       (msg = 'Request not found.')                       => ({ code: 'NOT_FOUND',            message: msg }),
  internal:       (msg = 'Unexpected server error.')                 => ({ code: 'INTERNAL_ERROR',       message: msg }),
  unavailable:    (msg = 'Service temporarily unavailable.')         => ({ code: 'SERVICE_UNAVAILABLE',  message: msg }),
  callbackUrl:    (msg: string)                                      => ({ code: 'INVALID_CALLBACK_URL', message: msg }),
}

export function apiError(
  body: { code: string; message: string },
  status: number,
  headers?: Record<string, string>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: body }, { status, headers })
}
