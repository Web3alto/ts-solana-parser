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

/** Non-throwing validation: returns notification on success, error message on failure. */
function tryValidateAndBuild(input: SwapInput): TransactionNotification | string {
  try {
    return validateAndBuild(input)
  } catch (err) {
    if (err instanceof ValidationError) return err.message
    if (err instanceof Error) return err.message
    return 'Unknown validation error'
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

export async function parseSwaps(
  inputs: readonly SwapInput[],
  options?: ParserOptions,
): Promise<(ParsedSwap | null)[]> {
  const outcomes = await parseSwapsDetailed(inputs, options)
  return outcomes.map((o) => o.swap ?? null)
}

export async function parseSwapsDetailed(
  inputs: readonly SwapInput[],
  options?: ParserOptions,
): Promise<ParseOutcome[]> {
  if (inputs.length === 0) return []

  // 1. Validate each input individually
  const validated: (TransactionNotification | string)[] = inputs.map(tryValidateAndBuild)

  // 2. Collect ALT table accounts from all valid JSON-parsed transactions
  if (options?.warmAddressLookupTables) {
    const altAccounts = new Set<string>()
    for (const v of validated) {
      if (typeof v === 'string') continue
      const tx = v.transaction.transaction
      // Only inspect TransactionData (not encoded tuples)
      if (!Array.isArray(tx) && tx.message.addressTableLookups) {
        for (const lookup of tx.message.addressTableLookups) {
          altAccounts.add(lookup.accountKey)
        }
      }
    }

    // 3. Pre-warm ALTs
    if (altAccounts.size > 0) {
      try {
        await options.warmAddressLookupTables([...altAccounts])
      } catch (err) {
        options.onResolverError?.({ error: err })
      }
    }
  }

  // 4. Parse each item
  return validated.map((v) => {
    if (typeof v === 'string') {
      return { kind: 'error' as const, code: 'INTERNAL_ERROR' as const, warnings: [], errorMessage: v }
    }
    return parseTransactionDetailed(v, options)
  })
}
