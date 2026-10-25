import { AppError, cognitoCode, errorTypeFromBody } from '../app/errors'

const DEFAULT_REGION = 'ap-south-1'

export interface CloudCredentials {
  accessToken: string
  idToken: string
  refreshToken: string
  expiresAt: number
}

export interface SignUpResult {
  /** Cognito confirmed the account straight away — no confirmation code needed. */
  confirmed: boolean
  /** Session for continuing the challenge chain. */
  session: string
}

/** The result of answering a challenge: either tokens, or the next challenge. */
export type AuthOutcome =
  | { kind: 'signed-in'; credentials: CloudCredentials }
  | { kind: 'challenge'; name: string; session: string }

function cognitoEndpoint(): string {
  const region = import.meta.env.VITE_COGNITO_REGION ?? DEFAULT_REGION
  return `https://cognito-idp.${region}.amazonaws.com/`
}

function clientId(): string {
  return import.meta.env.VITE_COGNITO_CLIENT_ID ?? ''
}

async function invokeCognito(action: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = clientId()
  if (!id) throw new AppError('error.authUnavailable')

  let response: Response
  try {
    response = await fetch(cognitoEndpoint(), {
      method: 'POST',
      headers: {
        'content-type': 'application/x-amz-json-1.1',
        'x-amz-target': `AWSCognitoIdentityProviderService.${action}`,
      },
      body: JSON.stringify({ ClientId: id, ...body }),
    })
  } catch (cause) {
    throw new AppError('error.network', { cause })
  }

  if (!response.ok) {
    const payload = await readJson(response)
    const type = errorTypeFromBody(payload)
    const code = (type ? cognitoCode(type) : undefined) ?? 'error.authUnavailable'
    throw new AppError(code, { cause: payload })
  }
  return (await readJson(response)) as Record<string, unknown>
}

/** Cognito sometimes answers with an empty body. */
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '')
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Creates the account. Cognito emails a confirmation code unless it confirms straight away. */
export async function signUp(email: string, password: string): Promise<SignUpResult> {
  const result = await invokeCognito('SignUp', {
    Username: email,
    Password: password,
    UserAttributes: [{ Name: "email", Value: email }],
  })
  return {
    confirmed: result.UserConfirmed === true,
    session: String(result.Session ?? ''),
  }
}

/** Confirms the account with the code Cognito emailed. */
export async function confirmSignUp(email: string, code: string): Promise<void> {
  try {
    await invokeCognito('ConfirmSignUp', { Username: email, ConfirmationCode: code })
  } catch (err) {
    // A rejected confirmation code is a bad code, not a bad account.
    if (err instanceof AppError && err.code === 'error.wrongCredentials') {
      throw new AppError('error.invalidCode', { cause: err })
    }
    throw err
  }
}

/** Asks Cognito to email a fresh confirmation code. */
export async function resendConfirmationCode(email: string): Promise<void> {
  await invokeCognito('ResendConfirmationCode', { Username: email })
}

/**
 * Starts the email-code sign-in. `PREFERRED_CHALLENGE` is required: without it
 * the choice-based flow answers with a list of options instead of a challenge.
 */
export async function beginEmailSignIn(email: string): Promise<string> {
  const result = await invokeCognito('InitiateAuth', {
    AuthFlow: 'USER_AUTH',
    AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: 'EMAIL_OTP' },
  })
  if (result.ChallengeName !== 'EMAIL_OTP') throw new AppError('error.authUnavailable')
  return String(result.Session ?? '')
}

/**
 * Signs in with the password the user just chose, so a new account needs only
 * the one confirmation code. Returns null when the pool does not offer the
 * password factor, and the caller falls back to an emailed code.
 */
export async function signInWithPassword(email: string, password: string): Promise<CloudCredentials | null> {
  try {
    const result = await invokeCognito('InitiateAuth', {
      AuthFlow: 'USER_AUTH',
      AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: 'PASSWORD' },
    })
    if (result.ChallengeName !== 'PASSWORD') return null
    const outcome = await respondToChallenge('PASSWORD', String(result.Session ?? ''), {
      USERNAME: email,
      PASSWORD: password,
    })
    return outcome.kind === 'signed-in' ? outcome.credentials : null
  } catch {
    return null
  }
}

/** Answers a challenge. Cognito may ask for another one before handing out tokens. */
export async function respondToChallenge(
  challengeName: string,
  session: string,
  responses: Record<string, string>,
): Promise<AuthOutcome> {
  const result = await invokeCognito('RespondToAuthChallenge', {
    ChallengeName: challengeName,
    Session: session,
    ChallengeResponses: responses,
  })
  if (result.AuthenticationResult || result.ChallengeResult) {
    return { kind: 'signed-in', credentials: tokensFromResponse(result) }
  }
  const name = String(result.ChallengeName ?? '')
  if (!name) throw new AppError('error.authUnavailable')
  return { kind: 'challenge', name, session: String(result.Session ?? session) }
}

/**
 * The ChallengeResponses field Cognito expects for a one-time code. Each
 * challenge names it differently, and sending the wrong key is rejected as an
 * invalid parameter, so the answer is built here rather than at the call site.
 */
export function codeFieldFor(challengeName: string): string | null {
  switch (challengeName) {
    case 'EMAIL_OTP':
      return 'EMAIL_OTP_CODE'
    case 'SMS_OTP':
      return 'SMS_OTP_CODE'
    case 'SMS_MFA':
      return 'SMS_MFA_CODE'
    default:
      return null
  }
}

/** Answers a challenge that asks the user for a one-time code. */
export async function answerWithCode(
  challengeName: string,
  session: string,
  email: string,
  code: string,
): Promise<AuthOutcome> {
  const field = codeFieldFor(challengeName)
  if (!field) throw new AppError('error.authUnavailable')
  return respondToChallenge(challengeName, session, { USERNAME: email, [field]: code })
}

export async function refreshCredentials(refreshToken: string): Promise<CloudCredentials> {
  const result = await invokeCognito('InitiateAuth', {
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  })
  const nextRefresh = result.AuthenticationResult !== null && typeof result.AuthenticationResult === 'object'
    ? String((result.AuthenticationResult as Record<string, unknown>).RefreshToken ?? refreshToken)
    : refreshToken
  const tokens = tokensFromResponse(result)
  return { ...tokens, refreshToken: nextRefresh }
}

export async function passkeyChallenge(email: string): Promise<string> {
  const result = await invokeCognito('InitiateAuth', {
    AuthFlow: 'USER_AUTH',
    AuthParameters: {
      USERNAME: email,
      PREFERRED_CHALLENGE: 'WEB_AUTHN',
    },
  })
  if (result.ChallengeName !== 'WEB_AUTHN') throw new AppError('error.passkeyFailed')
  return String(result.Session ?? '')
}

export function supportsPasskeys(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials?.get === 'function'
}

function tokensFromResponse(result: Record<string, unknown>): CloudCredentials {
  const auth = ((result.AuthenticationResult ?? result.ChallengeResult) as Record<string, unknown> | undefined)
  if (!auth) throw new AppError('error.authUnavailable')

  const accessToken = String(auth.AccessToken ?? '')
  const idToken = String(auth.IdToken ?? '')
  const refreshToken = String(auth.RefreshToken ?? '')
  const expiresIn = Number(auth.ExpiresIn ?? 3600)

  if (!accessToken) throw new AppError('error.authUnavailable')
  return {
    accessToken,
    idToken,
    refreshToken,
    expiresAt: Date.now() + Math.max(60_000, expiresIn * 1000),
  }
}
