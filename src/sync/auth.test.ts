import { describe, expect, it } from 'vitest'
import { codeFieldFor } from './auth'

describe('codeFieldFor', () => {
  it('names the field Cognito expects for each one-time code challenge', () => {
    // Verified against the RespondToAuthChallenge docs and the EMAIL_OTP sample
    // request: sending ANSWER here is rejected as an invalid parameter.
    expect(codeFieldFor('EMAIL_OTP')).toBe('EMAIL_OTP_CODE')
    expect(codeFieldFor('SMS_OTP')).toBe('SMS_OTP_CODE')
    expect(codeFieldFor('SMS_MFA')).toBe('SMS_MFA_CODE')
  })

  it('returns nothing for challenges that are not a typed code', () => {
    expect(codeFieldFor('PASSWORD')).toBeNull()
    expect(codeFieldFor('WEB_AUTHN')).toBeNull()
    expect(codeFieldFor('SELECT_CHALLENGE')).toBeNull()
  })
})
