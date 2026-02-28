// Core parsing (no validation -- use when you trust the input)

// Constants
export { Protocol, SOL_DECIMALS, SOL_MINT, WSOL_MINT } from './constants.ts'
// Errors
export { DecodeError, ParserError, UnsupportedEncodingError, ValidationError } from './errors.ts'
export type { SwapInput } from './parse-swap.ts'
// Validated convenience API (Zod validation at boundary)
export { parseSwap, parseSwapDetailed } from './parse-swap.ts'
export { parseTransaction, parseTransactionDetailed } from './parser.ts'
// RPC resolver factory
export { createRpcBackedParserOptions } from './resolvers.ts'
// Zod schemas (for consumers who want to validate their own data)
export { EncodedTransactionTupleSchema, SwapInputSchema, TokenBalanceSchema, TransactionMetaSchema } from './schemas.ts'
// Types
export type {
  AddressLookupResolution,
  AddressTableLookup,
  CompiledInstruction,
  EncodedTransactionTuple,
  Instruction,
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
