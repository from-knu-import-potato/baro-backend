import { z } from 'zod'

export const ErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
})

export function successResponse<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({ success: z.literal(true), data: dataSchema })
}

export const SuccessNullSchema = z.object({ success: z.literal(true), data: z.null() })

export const bearerSecurity = [{ bearerAuth: [] }]

export const storeIdParam = {
  name: 'storeId',
  in: 'path' as const,
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description: '가게 ID',
}
