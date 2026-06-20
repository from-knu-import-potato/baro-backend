import { Hono } from 'hono'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://baro-web.vercel.app',
  'https://qa-baro-web.vercel.app',
]

const auth = new Hono()

auth.get('/kakao', (c) => {
  const returnUrl = c.req.query('returnUrl') ?? process.env.FRONTEND_URL ?? 'http://localhost:5173'

  const isAllowed = ALLOWED_ORIGINS.some((origin) => returnUrl.startsWith(origin))
  if (!isAllowed) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: '허용되지 않은 returnUrl입니다.' } }, 400)
  }

  const state = Buffer.from(returnUrl).toString('base64')

  const url = new URL('https://kauth.kakao.com/oauth/authorize')
  url.searchParams.set('client_id', process.env.KAKAO_CLIENT_ID!)
  url.searchParams.set('redirect_uri', process.env.KAKAO_REDIRECT_URI!)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'profile_nickname')
  url.searchParams.set('state', state)
  return c.redirect(url.toString())
})

auth.get('/kakao/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  if (!code) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: '인증 코드가 없습니다.' } }, 400)
  }

  const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.KAKAO_CLIENT_ID!,
      client_secret: process.env.KAKAO_CLIENT_SECRET!,
      redirect_uri: process.env.KAKAO_REDIRECT_URI!,
      code,
    }),
  })

  const tokenData = await tokenRes.json() as { access_token?: string; error?: string }
  if (!tokenData.access_token) {
    return c.json({ success: false, error: { code: 'KAKAO_AUTH_FAILED', message: '카카오 인증에 실패했습니다.' } }, 400)
  }

  const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })

  const kakaoUser = await userRes.json() as {
    id: number
    properties?: { nickname?: string; profile_image?: string }
    kakao_account?: { email?: string; profile?: { nickname?: string; profile_image_url?: string } }
  }

  const kakaoId = String(kakaoUser.id)
  const name = kakaoUser.kakao_account?.profile?.nickname ?? kakaoUser.properties?.nickname ?? '사용자'
  const email = kakaoUser.kakao_account?.email ?? null
  const profileImage = kakaoUser.kakao_account?.profile?.profile_image_url ?? kakaoUser.properties?.profile_image ?? null

  let user = await db.query.users.findFirst({ where: eq(users.kakaoId, kakaoId) })
  const isNewUser = !user

  if (!user) {
    const [created] = await db.insert(users).values({ kakaoId, name, email, profileImage }).returning()
    user = created
  }

  const accessToken = await signAccessToken(user.id)
  const refreshToken = await signRefreshToken(user.id)

  const frontendUrl = state
    ? Buffer.from(state, 'base64').toString('utf-8')
    : process.env.FRONTEND_URL ?? 'http://localhost:5173'
  const redirectUrl = new URL('/auth/callback', frontendUrl)
  redirectUrl.searchParams.set('accessToken', accessToken)
  redirectUrl.searchParams.set('refreshToken', refreshToken)
  redirectUrl.searchParams.set('registered', String(isNewUser))
  return c.redirect(redirectUrl.toString())
})

const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, '아이디는 영문, 숫자, 언더스코어만 사용 가능합니다.'),
  password: z.string().min(6),
  name: z.string().min(1),
  inviteCode: z.string(),
})

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
})

auth.post('/register', async (c) => {
  const body = await c.req.json()
  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: parsed.error.issues[0].message } }, 400)
  }

  const { username, password, name, inviteCode } = parsed.data

  if (inviteCode !== process.env.REGISTER_CODE) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: '유효하지 않은 초대 코드입니다.' } }, 403)
  }

  const existing = await db.query.users.findFirst({ where: eq(users.username, username) })
  if (existing) {
    return c.json({ success: false, error: { code: 'CONFLICT', message: '이미 사용 중인 아이디입니다.' } }, 409)
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const [user] = await db.insert(users).values({ username, passwordHash, name }).returning()

  const accessToken = await signAccessToken(user.id)
  const refreshToken = await signRefreshToken(user.id)

  return c.json({ success: true, data: { accessToken, refreshToken, isNewUser: true } }, 201)
})

auth.post('/login', async (c) => {
  const body = await c.req.json()
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: '아이디와 비밀번호를 입력해주세요.' } }, 400)
  }

  const { username, password } = parsed.data

  const user = await db.query.users.findFirst({ where: eq(users.username, username) })
  if (!user || !user.passwordHash) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: '아이디 또는 비밀번호가 올바르지 않습니다.' } }, 401)
  }

  const isValid = await bcrypt.compare(password, user.passwordHash)
  if (!isValid) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: '아이디 또는 비밀번호가 올바르지 않습니다.' } }, 401)
  }

  const accessToken = await signAccessToken(user.id)
  const refreshToken = await signRefreshToken(user.id)

  return c.json({ success: true, data: { accessToken, refreshToken, isNewUser: false } })
})

auth.post('/logout', (c) => {
  return c.json({ success: true, data: null })
})

auth.post('/refresh', async (c) => {
  const { refreshToken } = await c.req.json<{ refreshToken: string }>()
  if (!refreshToken) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'refresh token이 없습니다.' } }, 400)
  }

  try {
    const payload = await verifyRefreshToken(refreshToken)
    const accessToken = await signAccessToken(payload.userId)
    return c.json({ success: true, data: { accessToken } })
  } catch {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: '유효하지 않은 refresh token입니다.' } }, 401)
  }
})

export default auth
