import { SignJWT, jwtVerify } from 'jose'

const accessSecret = new TextEncoder().encode(process.env.JWT_SECRET!)
const refreshSecret = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!)

export async function signAccessToken(userId: string) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('15m')
    .sign(accessSecret)
}

export async function signRefreshToken(userId: string) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(refreshSecret)
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, accessSecret)
  return payload as { userId: string }
}

export async function verifyRefreshToken(token: string) {
  const { payload } = await jwtVerify(token, refreshSecret)
  return payload as { userId: string }
}
