import type { FullTransactionResult } from './instruction-types.ts'
import { parseFullTransaction } from './parse-transaction-full.ts'
import { parseTransactionDetailed } from './parser.ts'
import { SwapInputSchema, validateWithZod } from './schemas.ts'
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
  validateWithZod(SwapInputSchema, input)

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
    if (err instanceof Error) return err.message
    return 'Unknown validation error'
  }
}

export function parseSwap(input: SwapInput, options?: ParserOptions): ParsedSwap | null {
  const notification = validateAndBuild(input)
  const outcome = parseTransactionDetailed(notification, options, undefined, true)
  return outcome.swap ?? null
}

export function parseSwapDetailed(input: SwapInput, options?: ParserOptions): ParseOutcome {
  const notification = validateAndBuild(input)
  return parseTransactionDetailed(notification, options, undefined, true)
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

  // 4. Parse each item (skip validation since we already validated above)
  return validated.map((v) => {
    if (typeof v === 'string') {
      return { kind: 'error' as const, code: 'INTERNAL_ERROR' as const, warnings: [], errorMessage: v }
    }
    return parseTransactionDetailed(v, options, undefined, true)
  })
}

export function parseFullSwapTransaction(input: SwapInput, options?: ParserOptions): FullTransactionResult | null {
  const notification = validateAndBuild(input)
  return parseFullTransaction(notification, options, true)
}
