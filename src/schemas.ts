import { ZodError, z } from 'zod'
import { ValidationError } from './errors.ts'

export const TokenBalanceSchema = z.object({
  accountIndex: z.number().int().nonnegative(),
  mint: z.string().min(1),
  owner: z.string().nullish(),
  uiTokenAmount: z.object({
    amount: z.string(),
    decimals: z.number().int().nonnegative(),
    uiAmount: z.number().nullable(),
  }),
})

const InnerInstructionSetSchema = z.object({
  index: z.number(),
  instructions: z.array(z.unknown()),
})

export const TransactionMetaSchema = z.object({
  err: z.record(z.string(), z.unknown()).nullable(),
  fee: z.number().nonnegative(),
  preBalances: z.array(z.number()),
  postBalances: z.array(z.number()),
  preTokenBalances: z.array(TokenBalanceSchema).nullish(),
  postTokenBalances: z.array(TokenBalanceSchema).nullish(),
  innerInstructions: z.array(InnerInstructionSetSchema).nullish(),
  loadedAddresses: z
    .object({
      writable: z.array(z.string()).nullish(),
      readonly: z.array(z.string()).nullish(),
    })
    .nullish(),
  logMessages: z.array(z.string()).nullish(),
  computeUnitsConsumed: z.number().nonnegative().nullish(),
})

export const EncodedTransactionTupleSchema = z.tuple([z.string(), z.enum(['base58', 'base64', 'base64+zstd'])])

const TransactionDataSchema = z.object({
  message: z.object({}).passthrough(),
  signatures: z.array(z.string()),
})

/** Lenient tuple schema: accepts any string encoding (parser handles unknown encodings gracefully) */
const EncodedTransactionTupleLenientSchema = z.tuple([z.string(), z.string()])

export const TransactionResultSchema = z.object({
  meta: TransactionMetaSchema,
  transaction: z.union([EncodedTransactionTupleLenientSchema, TransactionDataSchema]),
})

export const TransactionNotificationSchema = z.object({
  signature: z.string(),
  slot: z.number().int().nonnegative(),
  blockTime: z.number().nullish(),
  transaction: TransactionResultSchema,
})

export const SwapInputSchema = z.object({
  transaction: z.union([EncodedTransactionTupleSchema, TransactionDataSchema]),
  meta: TransactionMetaSchema,
  signature: z.string().optional(),
  slot: z.number().int().nonnegative().optional(),
  blockTime: z.number().nullish(),
})

export const SwapInputArraySchema = z.array(SwapInputSchema)

/**
 * Validate data against a Zod schema.
 * @throws {ValidationError} (not raw ZodError) on failure.
 */
export function validateWithZod(schema: z.ZodType, data: unknown): void {
  try {
    schema.parse(data)
  } catch (err) {
    if (err instanceof ZodError) throw new ValidationError(err.issues)
    throw err
  }
}
