import { zValidator } from '@hono/zod-validator'
import type { ZodSchema } from 'zod'
import type { ValidationTargets } from 'hono'

export const validate = <S extends ZodSchema, T extends keyof ValidationTargets>(
  target: T,
  schema: S,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: '입력값이 올바르지 않습니다.' },
        },
        400,
      )
    }
  })
