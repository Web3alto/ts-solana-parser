// Public API — barrel exports

// Constants
export {
  lookupTipProvider,
  POOL_ACCOUNT_INDEX,
  PROGRAM_ID_TO_PROTOCOL,
  Protocol,
  SOL_DECIMALS,
  SOL_MINT,
  TIP_ADDRESS_TO_PROVIDER,
  TipProvider,
  WSOL_MINT,
} from './constants.ts'
// Errors
export { DecodeError, ParserError, UnsupportedEncodingError, ValidationError } from './errors.ts'
// Instruction types (full transaction parsing)
export type {
  ATAInstruction,
  ComputeBudgetInstruction,
  DecodedInstruction,
  DecodedInstructionEntry,
  DexSwapInstruction,
  FullTransactionResult,
  MemoInstruction,
  SystemInstruction,
  TokenInstruction,
  UnknownInstruction,
} from './instruction-types.ts'
// Runtime introspection
export { getSupportedProtocols, getSupportedTipProviders } from './introspection.ts'
// Normalization
export { normalizeTransactionData } from './normalize.ts'
export type { SwapInput } from './parse-swap.ts'
// Validated convenience API (Zod validation at boundary)
export { parseFullSwapTransaction, parseSwap, parseSwapDetailed, parseSwaps, parseSwapsDetailed } from './parse-swap.ts'
export type { ResolverConfig, RpcBackedParserOptions } from './resolvers.ts'
// RPC resolver factory
export { createRpcBackedParserOptions } from './resolvers.ts'
// Zod schemas (for consumers who want to validate their own data)
export {
  EncodedTransactionTupleSchema,
  SwapInputArraySchema,
  SwapInputSchema,
  TokenBalanceSchema,
  TransactionMetaSchema,
  TransactionNotificationSchema,
  TransactionResultSchema,
} from './schemas.ts'
// Tip detection
export { detectTipsFromRawInstructions } from './tips.ts'
// Types
export type {
  AccountKey,
  AddressLookupResolution,
  AddressTableLookup,
  CompiledInstruction,
  EncodedTransactionTuple,
  InnerInstructionSet,
  Instruction,
  MevTip,
  ParseCode,
  ParsedInstruction,
  ParsedSwap,
  ParseKind,
  ParseOutcome,
  ParserOptions,
  SwapType,
  TokenBalance,
  TokenChange,
  TokenProgramKind,
  TransactionData,
  TransactionMessage,
  TransactionMeta,
  TransactionNotification,
  TransactionResult,
  UnparsedInstruction,
  WarningCode,
} from './types.ts'
