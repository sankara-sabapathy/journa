import { useCallback } from 'react'
import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n/en'

/**
 * Every user-visible failure is one of these codes. Each maps to an
 * `error.*` message in the catalogues, so no raw backend text ever reaches
 * the screen.
 */
export type ErrorCode = Extract<MessageKey, `error.${string}`>

export class AppError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode, options?: { cause?: unknown }) {
    super(code, options)
    this.name = 'AppError'
    this.code = code
  }
}

/** Cognito error type (without the `com.amazon.cognito...#` prefix) to code. */
export const COGNITO_CODES: Record<string, ErrorCode> = {
  usernameexistsexception: 'error.emailTaken',
  useralreadyexistsexception: 'error.emailTaken',
  aliasexistsexception: 'error.emailTaken',
  usernotfoundexception: 'error.noAccount',
  notauthorizedexception: 'error.wrongCredentials',
  passwordresetrequiredexception: 'error.wrongCredentials',
  codemismatchexception: 'error.invalidCode',
  expiredcodeexception: 'error.expiredCode',
  invalidpasswordexception: 'error.weakPassword',
  usernotconfirmedexception: 'error.notConfirmed',
  limitexceededexception: 'error.tooManyAttempts',
  toomanyrequestsexception: 'error.tooManyAttempts',
  invalidsessionexception: 'error.expiredCode',
  invalidparameterexception: 'error.unknown',
  unexpectedchallenge: 'error.authUnavailable',
}

/** Looks a Cognito error type up, tolerating a missing `Exception` suffix. */
export function cognitoCode(type: string): ErrorCode | undefined {
  const key = type.toLowerCase()
  return COGNITO_CODES[key] ?? COGNITO_CODES[`${key}exception`]
}

/** Internal error strings thrown by the sync layer. */
const INTERNAL_CODES: Record<string, ErrorCode> = {
  'sync-device-not-enrolled': 'error.deviceNotEnrolled',
  'sync-backend-not-configured': 'error.syncNotConfigured',
  'account-not-signed-in': 'error.notSignedIn',
  'account-deleted': 'error.accountDeleted',
  'unknown-device': 'error.unknownDevice',
  'invalid-recovery-key': 'error.invalidRecoveryKey',
  'passkeys-unsupported': 'error.passkeyUnsupported',
  'vite-cognito-client-id-required': 'error.authUnavailable',
  'not-awaiting-code': 'error.unknown',
  'missing-authentication-result': 'error.authUnavailable',
  'missing-access-token': 'error.authUnavailable',
  'unexpected-cognito-challenge': 'error.authUnavailable',
}

function fromStatus(status: number): ErrorCode {
  if (status === 401 || status === 403) return 'error.notSignedIn'
  if (status === 429) return 'error.tooManyAttempts'
  if (status >= 500) return 'error.authUnavailable'
  return 'error.unknown'
}

/** Pulls the error type out of a Cognito or API JSON body. */
export function errorTypeFromBody(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const raw = (body as { __type?: unknown }).__type
  if (typeof raw !== 'string') return null
  const hash = raw.lastIndexOf('#')
  return (hash === -1 ? raw : raw.slice(hash + 1)).toLowerCase()
}

/**
 * Turns anything thrown — a Cognito error, a failed fetch, a plain string —
 * into a code the UI can show. Never returns a raw backend message.
 */
export function toErrorCode(err: unknown): ErrorCode {
  if (err instanceof AppError) return err.code
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) return 'error.network'
  if (err instanceof Error) {
    const direct = INTERNAL_CODES[err.message]
    if (direct) return direct
    const status = /^sync-http-(\d{3})$/.exec(err.message)
    if (status) return fromStatus(Number(status[1]))
    const cognito = /^cognito-\w+-(\d{3})$/.exec(err.message)
    if (cognito) return fromStatus(Number(cognito[1]))
    return 'error.unknown'
  }
  if (typeof err === 'string') {
    const direct = INTERNAL_CODES[err]
    if (direct) return direct
  }
  return 'error.unknown'
}

/** The message key for a thrown value. */
export function errorMessageKey(err: unknown): ErrorCode {
  return toErrorCode(err)
}

/** Turns a thrown value into a sentence the user can read. */
export function useErrorMessage(): (err: unknown) => string {
  const { t } = useI18n()
  return useCallback((err: unknown) => t(errorMessageKey(err)), [t])
}
