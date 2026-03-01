import type { Protocol } from './constants.ts'

// ── Transaction notification types ──

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

export interface TransactionMeta {
  err: Readonly<Record<string, unknown>> | null
  fee: number
  /**
   * Native SOL lamport balances per account index.
   * Solana RPC returns these as JSON numbers; values above 2^53 (~90M SOL)
   * would lose precision. Arithmetic in this codebase converts to BigInt first.
   */
  preBalances: number[]
  postBalances: number[]
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

export interface AccountKeyObject {
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

// ── Parser output ──

export interface TokenChange {
  readonly mint: string
  readonly rawDelta: bigint
  readonly decimals: number
}

export interface ParsedSwap {
  readonly signature: string
  readonly slot: number
  readonly blockTime?: number | undefined
  readonly user: string
  readonly feePayer: string
  readonly protocols: readonly Protocol[]
  readonly hopCount?: number | undefined
  readonly routeType?: 'single-hop' | 'multi-hop' | undefined
  readonly inputMint: string
  readonly inputRaw: string
  readonly inputDecimals: number
  readonly inputAmountDecimal: string
  readonly inputAmountNumber?: number | undefined
  readonly inputTokenProgram?: TokenProgramKind | undefined
  readonly inputToken2022TransferFeeBps?: number | null | undefined
  readonly outputMint: string
  readonly outputRaw: string
  readonly outputDecimals: number
  readonly outputAmountDecimal: string
  readonly outputAmountNumber?: number | undefined
  readonly outputTokenProgram?: TokenProgramKind | undefined
  readonly outputToken2022TransferFeeBps?: number | null | undefined
  /**
   * Deprecated: use inputToken2022TransferFeeBps/outputToken2022TransferFeeBps.
   */
  readonly token2022TransferFeeBps?: number | null | undefined
  readonly pool?: string | undefined
  readonly swapType?: SwapType | undefined
  readonly confidence: 'high' | 'medium' | 'low'
  readonly warnings: readonly WarningCode[]
  readonly fee: number
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

export type WarningCode =
  | 'malformed-balance-entries-skipped'
  | 'multi-hop-route'
  | 'low-confidence-idl-attribution'
  | 'idl-score-too-low-fallback-to-heuristic-user'
  | 'alt-resolution-incomplete'
  | 'idl-mints-not-found-in-primary-deltas'
  | 'idl-mint-mismatch-with-balance-delta'
  | 'idl-balance-amount-mismatch'
  | 'possible-token2022-transfer-fee'

export interface ParseOutcome {
  readonly kind: ParseKind
  readonly code?: ParseCode | undefined
  readonly swap?: ParsedSwap | undefined
  readonly warnings: readonly WarningCode[]
  readonly errorMessage?: string | undefined
}

export interface ParserOptions {
  resolveAddressTableLookups?: ((lookups: AddressTableLookup[]) => AddressLookupResolution | null) | undefined
  warmAddressLookupTables?: ((tableAccounts: string[]) => Promise<void>) | undefined
  resolveMintTokenProgram?: ((mint: string) => TokenProgramKind) | undefined
  resolveToken2022TransferFeeBps?: ((mint: string) => number | null) | undefined
  onInternalError?: ((error: unknown) => void) | undefined
  onResolverError?: ((ctx: { tableAccount?: string | undefined; error: unknown }) => void) | undefined
}
