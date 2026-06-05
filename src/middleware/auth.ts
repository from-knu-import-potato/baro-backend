import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types/index.js'
import { verifyAccessToken } from '../lib/jwt.js'

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authorization = c.req.header('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } }, 401)
  }

  const token = authorization.slice(7)
  try {
    const payload = await verifyAccessToken(token)
    c.set('userId', payload.userId)
    await next()
  } catch {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: '유효하지 않은 토큰입니다.' } }, 401)
  }
}
