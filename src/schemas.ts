import { z } from 'zod'

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

export const InnerInstructionSetSchema = z.object({
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
})

export const EncodedTransactionTupleSchema = z.tuple([z.string(), z.enum(['base58', 'base64', 'base64+zstd'])])

export const TransactionDataSchema = z.object({
  message: z.object({}).passthrough(),
  signatures: z.array(z.string()),
})

export const SwapInputSchema = z.object({
  transaction: z.union([EncodedTransactionTupleSchema, TransactionDataSchema]),
  meta: TransactionMetaSchema,
  signature: z.string().optional(),
  slot: z.number().int().nonnegative().optional(),
  blockTime: z.number().nullish(),
})

export const SwapInputArraySchema = z.array(SwapInputSchema)
