// Core parsing (no validation -- use when you trust the input)

// Constants
export { Protocol, SOL_DECIMALS, SOL_MINT, TipProvider, WSOL_MINT } from './constants.ts'
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
export type { SwapInput } from './parse-swap.ts'
// Validated convenience API (Zod validation at boundary)
export { parseFullSwapTransaction, parseSwap, parseSwapDetailed, parseSwaps, parseSwapsDetailed } from './parse-swap.ts'
// Full transaction parsing (no validation -- use when you trust the input)
export { parseFullTransaction } from './parse-transaction-full.ts'
export { parseTransaction, parseTransactionDetailed } from './parser.ts'
// RPC resolver factory
export { createRpcBackedParserOptions } from './resolvers.ts'
// Zod schemas (for consumers who want to validate their own data)
export {
  EncodedTransactionTupleSchema,
  SwapInputArraySchema,
  SwapInputSchema,
  TokenBalanceSchema,
  TransactionMetaSchema,
} from './schemas.ts'
// Types
export type {
  AddressLookupResolution,
  AddressTableLookup,
  CompiledInstruction,
  EncodedTransactionTuple,
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
