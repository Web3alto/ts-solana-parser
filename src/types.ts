import type { Protocol } from "./constants.ts";

// ── Helius WebSocket response types ──

export interface WsNotification {
  jsonrpc: "2.0";
  method?: string;
  params?: {
    subscription: number;
    result: TransactionNotification;
  };
  result?: number; // subscription confirmation
  id?: number;
}

export interface TransactionNotification {
  signature: string;
  slot: number;
  transaction: TransactionResult;
}

export type EncodedTransactionTuple = [string, 'base58' | 'base64'];

export interface TransactionResult {
  meta: TransactionMeta;
  transaction: TransactionData | EncodedTransactionTuple;
}

export interface TransactionMeta {
  err: unknown | null;
  fee: number;
  preBalances: number[];
  postBalances: number[];
  preTokenBalances: TokenBalance[];
  postTokenBalances: TokenBalance[];
  innerInstructions: InnerInstructionSet[];
  loadedAddresses?: {
    writable: string[];
    readonly: string[];
  };
}

export interface InnerInstructionSet {
  index: number;
  instructions: Instruction[];
}

export interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner: string;
  uiTokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
  };
}

// ── Instruction types (dual format from jsonParsed encoding) ──

export interface ParsedInstruction {
  programId: string;
  program?: string;
  parsed?: unknown;
}

export interface CompiledInstruction {
  programIdIndex: number;
  accounts: number[];
  data: string;
}

export interface UnparsedInstruction {
  programId: string;
  accounts: string[];
  data: string;
}

export type Instruction = ParsedInstruction | CompiledInstruction | UnparsedInstruction;

// ── Account key types ──

export interface AccountKeyObject {
  pubkey: string;
  signer: boolean;
  writable: boolean;
  source: string;
}

export type AccountKey = string | AccountKeyObject;

export interface TransactionData {
  message: TransactionMessage;
  signatures: string[];
}

export interface TransactionMessage {
  accountKeys: AccountKey[];
  instructions: Instruction[];
  recentBlockhash: string;
  addressTableLookups?: AddressTableLookup[];
}

export interface AddressTableLookup {
  accountKey: string;
  readonlyIndexes: number[];
  writableIndexes: number[];
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
  | 'meteora-dbc-buy'
  | 'meteora-dbc-sell'
  | 'meteora-dammv2-buy'
  | 'meteora-dammv2-sell';

// ── Parser output ──

export interface TokenChange {
  mint: string;
  rawDelta: bigint;
  decimals: number;
}

export interface ParsedSwap {
  signature: string;
  slot: number;
  user: string;
  protocols: Protocol[];
  inputMint: string;
  inputAmount: number;
  outputMint: string;
  outputAmount: number;
  pool?: string;
  swapType?: SwapType;
  fee: number;
  timestamp: number;
}
