import { ZodError } from 'zod'
import { ValidationError } from './errors.ts'
import { parseTransaction, parseTransactionDetailed } from './parser.ts'
import { SwapInputSchema } from './schemas.ts'
import type {
  EncodedTransactionTuple,
  ParsedSwap,
  ParseOutcome,
  ParserOptions,
  TransactionData,
  TransactionMeta,
  TransactionNotification,
} from './types.ts'

export interface SwapInput {
  readonly transaction: TransactionData | EncodedTransactionTuple
  readonly meta: TransactionMeta
  readonly signature?: string | undefined
  readonly slot?: number | undefined
  readonly blockTime?: number | null | undefined
}

function validateAndBuild(input: SwapInput): TransactionNotification {
  try {
    SwapInputSchema.parse(input)
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ValidationError(err.issues)
    }
    throw err
  }

  return {
    signature: input.signature ?? '',
    slot: input.slot ?? 0,
    blockTime: input.blockTime,
    transaction: {
      meta: input.meta,
      transaction: input.transaction,
    },
  }
}

export function parseSwap(input: SwapInput, options?: ParserOptions): ParsedSwap | null {
  const notification = validateAndBuild(input)
  return parseTransaction(notification, options)
}

export function parseSwapDetailed(input: SwapInput, options?: ParserOptions): ParseOutcome {
  const notification = validateAndBuild(input)
  return parseTransactionDetailed(notification, options)
}
