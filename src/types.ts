import type { Aggregator } from './aggregators/constants.ts'
import type { Protocol, TipProvider } from './constants.ts'

// ── Transaction notification types ──

/** Solana RPC transaction notification shape, as received from `transactionSubscribe` or `getTransaction`. */
export interface TransactionNotification {
  signature: string
  slot: number
  blockTime?: number | null | undefined
  transaction: TransactionResult
}

export type EncodedTransactionTuple = [string, 'base58' | 'base64' | 'base64+zstd']

export interface TransactionResult {
  meta: TransactionMeta
  transaction: TransactionData | EncodedTransactionTuple
}

export type LamportsInput = number | string | bigint

export interface TransactionMeta {
  err: Readonly<Record<string, unknown>> | null
  fee: LamportsInput
  /**
   * Native SOL lamport balances per account index.
   * Pass strings or bigints for values above `Number.MAX_SAFE_INTEGER`; unsafe
   * JS numbers are rejected because their exact lamport value is already lost.
   */
  preBalances: LamportsInput[]
  postBalances: LamportsInput[]
  preTokenBalances?: TokenBalance[] | null | undefined
  postTokenBalances?: TokenBalance[] | null | undefined
  innerInstructions?: InnerInstructionSet[] | null | undefined
  loadedAddresses?:
    | {
        writable?: string[] | null | undefined
        readonly?: string[] | null | undefined
      }
    | null
    | undefined
  logMessages?: string[] | null | undefined
  computeUnitsConsumed?: number | null | undefined
}

export interface InnerInstructionSet {
  index: number
  instructions: Instruction[]
}

export interface TokenBalance {
  readonly accountIndex: number
  readonly mint: string
  readonly owner?: string | null | undefined
  readonly uiTokenAmount: {
    readonly amount: string
    readonly decimals: number
    readonly uiAmount: number | null
  }
}

// ── Instruction types (dual format from jsonParsed encoding) ──

export interface ParsedInstruction {
  programId: string
  program?: string | undefined
  parsed?: unknown
}

export interface CompiledInstruction {
  programIdIndex: number
  accounts: number[]
  data: string
}

export interface UnparsedInstruction {
  programId: string
  accounts: string[]
  data: string
}

export type Instruction = ParsedInstruction | CompiledInstruction | UnparsedInstruction

// ── Account key types ──

interface AccountKeyObject {
  pubkey: string
  signer: boolean
  writable: boolean
  source: string
}

export type AccountKey = string | AccountKeyObject

export interface TransactionData {
  message: TransactionMessage
  signatures: string[]
}

export interface TransactionMessage {
  accountKeys: AccountKey[]
  instructions: Instruction[]
  recentBlockhash: string
  addressTableLookups?: AddressTableLookup[] | undefined
  header?:
    | {
        numRequiredSignatures: number
        numReadonlySignedAccounts: number
        numReadonlyUnsignedAccounts: number
      }
    | undefined
}

export interface AddressTableLookup {
  accountKey: string
  readonlyIndexes: number[]
  writableIndexes: number[]
}

// ── MEV tip ──

export interface MevTip {
  readonly provider: TipProvider
  readonly lamports: bigint
  readonly recipient: string
}

// ── Swap type (IDL-derived buy/sell classification) ──

export type SwapType =
  | 'pumpfun-buy'
  | 'pumpfun-sell'
  | 'pumpswap-buy'
  | 'pumpswap-sell'
  | 'raydium-launchlab-buy'
  | 'raydium-launchlab-sell'
  | 'raydium-cpmm-buy'
  | 'raydium-cpmm-sell'
  | 'raydium-clmm-buy'
  | 'raydium-clmm-sell'
  | 'meteora-dbc-buy'
  | 'meteora-dbc-sell'
  | 'meteora-dammv2-buy'
  | 'meteora-dammv2-sell'
  | 'meteora-dlmm-buy'
  | 'meteora-dlmm-sell'
  | 'raydium-amm-buy'
  | 'raydium-amm-sell'
  | 'meteora-damm-buy'
  | 'meteora-damm-sell'
  | 'orca-whirlpool-buy'
  | 'orca-whirlpool-sell'

// ── Parser output ──

export interface TokenChange {
  readonly mint: string
  readonly rawDelta: bigint
  readonly decimals: number
}

/** A fully parsed DEX swap with input/output amounts, protocols, and confidence scoring. */
export interface ParsedSwap {
  readonly signature: string
  readonly slot: number
  readonly blockTime?: number | undefined
  readonly user: string
  readonly feePayer: string
  readonly protocols: readonly Protocol[]
  readonly hopCount?: number | undefined
  readonly routeType?: 'single-hop' | 'multi-hop' | undefined
  readonly routedVia?: Aggregator | undefined
  readonly inputMint: string
  readonly inputRaw: string
  readonly inputDecimals: number
  readonly inputAmountDecimal: string
  readonly inputAmountNumber?: number | undefined
  readonly inputTokenProgram?: TokenProgramKind | undefined
  readonly outputMint: string
  readonly outputRaw: string
  readonly outputDecimals: number
  readonly outputAmountDecimal: string
  readonly outputAmountNumber?: number | undefined
  readonly outputTokenProgram?: TokenProgramKind | undefined
  readonly tips?: readonly MevTip[] | undefined
  readonly pool?: string | undefined
  readonly swapType?: SwapType | undefined
  readonly confidence: 'high' | 'medium' | 'low'
  readonly warnings: readonly WarningCode[]
  /** Exact transaction fee in lamports. */
  readonly fee: string
}

export type TokenProgramKind = 'spl-token' | 'token-2022' | 'unknown'

export interface AddressLookupResolution {
  writable: string[]
  readonly: string[]
}

export type ParseCode =
  | 'META_ERR'
  | 'NO_PROTOCOL'
  | 'NO_SWAP_SIGNAL'
  | 'NO_USER_CANDIDATE'
  | 'NO_BALANCE_DELTA'
  | 'NO_INPUT_OUTPUT_PAIR'
  | 'UNSUPPORTED_ENCODING'
  | 'UNSUPPORTED_TX_VERSION'
  | 'DECODE_ERROR'
  | 'MISSING_LOADED_ADDRESSES'
  | 'ALT_RESOLUTION_FAILED'
  | 'MALFORMED_BALANCE_DATA'
  | 'INTERNAL_ERROR'

export type ParseKind = 'swap' | 'not_swap' | 'unsupported' | 'error'

/** Diagnostic warning codes emitted during parsing. SCREAMING_SNAKE_CASE constants. */
export type WarningCode =
  | 'MALFORMED_BALANCE_ENTRIES_SKIPPED'
  | 'MULTI_HOP_ROUTE'
  | 'LOW_CONFIDENCE_IDL_ATTRIBUTION'
  | 'IDL_SCORE_TOO_LOW_FALLBACK_TO_HEURISTIC_USER'
  | 'ALT_RESOLUTION_INCOMPLETE'
  | 'IDL_MINTS_NOT_FOUND_IN_PRIMARY_DELTAS'
  | 'IDL_MINT_MISMATCH_WITH_BALANCE_DELTA'
  | 'IDL_BALANCE_AMOUNT_MISMATCH'
  | 'IDL_INPUT_AMOUNT_EXCEEDS_MAX'
  | 'IDL_OUTPUT_AMOUNT_BELOW_MIN'
  | 'POSSIBLE_TOKEN2022_TRANSFER_FEE'

/** Result of detailed swap parsing: kind (swap/not_swap/unsupported/error), optional swap, warnings, and error info. */
export interface ParseOutcome {
  readonly kind: ParseKind
  readonly code?: ParseCode | undefined
  readonly swap?: ParsedSwap | undefined
  readonly warnings: readonly WarningCode[]
  readonly errorMessage?: string | undefined
}

/** Configuration callbacks for address lookup resolution and token program detection. */
export interface ParserOptions {
  resolveAddressTableLookups?: ((lookups: AddressTableLookup[]) => AddressLookupResolution | null) | undefined
  warmAddressLookupTables?: ((tableAccounts: string[]) => Promise<void>) | undefined
  resolveMintTokenProgram?: ((mint: string) => TokenProgramKind) | undefined
  onInternalError?: ((error: unknown) => void) | undefined
  onResolverError?: ((ctx: { tableAccount?: string | undefined; error: unknown }) => void) | undefined
}
