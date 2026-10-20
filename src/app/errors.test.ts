import { describe, expect, it } from 'vitest'
import { AppError, cognitoCode, errorTypeFromBody, toErrorCode } from './errors'

describe('error codes', () => {
  it('reads the error type out of a Cognito body', () => {
    expect(errorTypeFromBody({ __type: 'UsernameExistsException' })).toBe('usernameexistsexception')
    expect(errorTypeFromBody({ __type: 'com.amazon.cognito#CodeMismatchException' })).toBe('codemismatchexception')
    expect(errorTypeFromBody({ message: 'nope' })).toBeNull()
    expect(errorTypeFromBody('nope')).toBeNull()
  })

  it('maps the Cognito error types Cognito actually returns', () => {
    expect(cognitoCode('UsernameExistsException')).toBe('error.emailTaken')
    expect(cognitoCode('UserNotFoundException')).toBe('error.noAccount')
    expect(cognitoCode('InvalidPasswordException')).toBe('error.weakPassword')
    expect(cognitoCode('CodeMismatchException')).toBe('error.invalidCode')
    expect(cognitoCode('ExpiredCodeException')).toBe('error.expiredCode')
    expect(cognitoCode('UserNotConfirmedException')).toBe('error.notConfirmed')
    expect(cognitoCode('LimitExceededException')).toBe('error.tooManyAttempts')
    expect(cognitoCode('SomethingElseException')).toBeUndefined()
  })

  it('maps Cognito failures to readable codes', () => {
    expect(toErrorCode(new AppError('error.emailTaken'))).toBe('error.emailTaken')
    expect(toErrorCode(new Error('cognito-SignUp-400'))).toBe('error.unknown')
  })

  it('maps internal error strings', () => {
    expect(toErrorCode(new Error('sync-device-not-enrolled'))).toBe('error.deviceNotEnrolled')
    expect(toErrorCode(new Error('account-not-signed-in'))).toBe('error.notSignedIn')
    expect(toErrorCode('invalid-recovery-key')).toBe('error.invalidRecoveryKey')
  })

  it('maps HTTP statuses', () => {
    expect(toErrorCode(new Error('sync-http-401'))).toBe('error.notSignedIn')
    expect(toErrorCode(new Error('sync-http-429'))).toBe('error.tooManyAttempts')
    expect(toErrorCode(new Error('sync-http-503'))).toBe('error.authUnavailable')
    expect(toErrorCode(new Error('sync-http-404'))).toBe('error.unknown')
  })

  it('never leaks a raw message', () => {
    expect(toErrorCode(new Error('boom at 0x1f2'))).toBe('error.unknown')
    expect(toErrorCode(new TypeError('Failed to fetch'))).toBe('error.network')
    expect(toErrorCode(undefined)).toBe('error.unknown')
    expect(toErrorCode({ nope: true })).toBe('error.unknown')
  })
})
