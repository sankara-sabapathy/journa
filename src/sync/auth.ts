const DEFAULT_REGION = 'ap-south-1'

export interface CloudCredentials {
  accessToken: string
  idToken: string
  refreshToken: string
  expiresAt: number
}

function cognitoEndpoint(): string {
  const region = import.meta.env.VITE_COGNITO_REGION ?? DEFAULT_REGION
  return `https://cognito-idp.${region}.amazonaws.com/`
}

function clientId(): string {
  return import.meta.env.VITE_COGNITO_CLIENT_ID ?? ''
}

async function invokeCognito(action: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = clientId()
  if (!id) throw new Error('vite-cognito-client-id-required')

  const response = await fetch(cognitoEndpoint(), {
    method: 'POST',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': `AWSCognitoIdentityProviderService.${action}`,
    },
    body: JSON.stringify({ ClientId: id, ...body }),
  })

  if (!response.ok) {
    throw new Error(`cognito-${action}-${response.status}`)
  }
  return (await response.json()) as Record<string, unknown>
}

export async function beginEmailSignIn(email: string): Promise<string> {
  const result = await invokeCognito('InitiateAuth', {
    AuthFlow: 'USER_AUTH',
    AuthParameters: { USERNAME: email },
  })
  if (result.ChallengeName !== 'EMAIL_OTP') {
    throw new Error('unexpected-cognito-challenge')
  }
  return String(result.Session ?? '')
}

export async function verifyEmailSignIn(email: string, session: string, code: string): Promise<CloudCredentials> {
  const result = await invokeCognito('RespondToAuthChallenge', {
    ChallengeName: 'EMAIL_OTP',
    Session: session,
    ChallengeResponses: {
      USERNAME: email,
      ANSWER: code,
    },
  })
  return tokensFromResponse(result)
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
  if (result.ChallengeName !== 'WEB_AUTHN') {
    throw new Error('unexpected-passkey-challenge')
  }
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
  if (!auth) throw new Error('missing-authentication-result')

  const accessToken = String(auth.AccessToken ?? '')
  const idToken = String(auth.IdToken ?? '')
  const refreshToken = String(auth.RefreshToken ?? '')
  const expiresIn = Number(auth.ExpiresIn ?? 3600)

  if (!accessToken) throw new Error('missing-access-token')
  return {
    accessToken,
    idToken,
    refreshToken,
    expiresAt: Date.now() + Math.max(60_000, expiresIn * 1000),
  }
}