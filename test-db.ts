import 'dotenv/config'
import postgres from 'postgres'

console.log('DATABASE_URL:', process.env.DATABASE_URL ? '로드됨' : '없음!')

const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })

try {
  const result = await sql`SELECT 1 as ok`
  console.log('DB 연결 성공:', result)
} catch (err) {
  console.error('DB 연결 실패:', err)
} finally {
  await sql.end()
}
