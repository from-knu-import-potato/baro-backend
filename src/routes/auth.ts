import { Hono } from 'hono'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js'
import { eq } from 'drizzle-orm'

const auth = new Hono()

auth.get('/kakao', (c) => {
  const url = new URL('https://kauth.kakao.com/oauth/authorize')
  url.searchParams.set('client_id', process.env.KAKAO_CLIENT_ID!)
  url.searchParams.set('redirect_uri', process.env.KAKAO_REDIRECT_URI!)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'profile_nickname')
  return c.redirect(url.toString())
})

auth.get('/kakao/callback', async (c) => {
  const code = c.req.query('code')
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

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
  const redirectUrl = new URL('/auth/callback', frontendUrl)
  redirectUrl.searchParams.set('accessToken', accessToken)
  redirectUrl.searchParams.set('refreshToken', refreshToken)
  redirectUrl.searchParams.set('registered', String(isNewUser))
  return c.redirect(redirectUrl.toString())
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
