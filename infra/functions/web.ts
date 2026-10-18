import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { handler } from './sync'

const REGION = process.env.JOURNA_AWS_REGION ?? 'ap-south-1'
const POOL_ID = process.env.USER_POOL_ID ?? ''
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}`
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`))

const app = new Hono<{ Variables: { claims: Record<string, unknown> } }>()

app.use(
  cors({
    origin: 'https://d22yyqrvp3iqn6.cloudfront.net',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['authorization', 'content-type'],
  }),
)

app.use(async (c, next) => {
  if (c.req.method === 'OPTIONS') return c.body(null, 204)
  const header = c.req.header('authorization')
  if (!header?.startsWith('Bearer ')) return c.json({ error: 'unauthorized' }, 401)
  try {
    const { payload } = await jwtVerify(header.slice('Bearer '.length), JWKS, { issuer: ISSUER })
    if (payload.token_use !== 'access' || typeof payload.sub !== 'string') {
      return c.json({ error: 'unauthorized' }, 401)
    }
    c.set('claims', payload as Record<string, unknown>)
  } catch {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await next()
})

app.all('*', async (c) => {
  const url = new URL(c.req.url)
  const claims = c.get('claims') as Record<string, unknown>
  const out = await handler({
    rawPath: url.pathname,
    requestContext: {
      http: { method: c.req.method },
      authorizer: { jwt: { claims } },
    },
    body: c.req.method === 'GET' || c.req.method === 'DELETE' ? null : await c.req.text(),
  })
  return new Response(out.body, { status: out.statusCode, headers: { 'content-type': 'application/json' } })
})

const listenOn = process.env.AWS_LAMBDA_HTTP_ENDPOINT ?? '0.0.0.0:3000'
const [host, port] = listenOn.split(':')
serve({ hostname: host, port: Number(port), fetch: app.fetch }, (info) => {
  console.log(`journa api listening on ${info.address}:${info.port}`)
})
