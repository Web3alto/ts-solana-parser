import { POOL_ACCOUNT_INDEX, PROGRAM_ID_TO_PROTOCOL } from '../constants.ts'
import { decodeBase58 } from '../idl/codec.ts'
import { tryParseInstruction } from '../idl/registry.ts'
import type { ParseContext } from '../idl/types.ts'
import type { DecodedInstruction, DexSwapInstruction, UnknownInstruction } from '../instruction-types.ts'
import { decodeComputeBudgetInstruction } from './compute-budget.ts'
import { decodeATAInstruction, decodeMemoInstruction } from './misc.ts'
import { decodeSystemInstruction } from './system.ts'
import { decodeTokenInstruction } from './token.ts'

// Well-known program IDs
const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111'
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111'
const ATA_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
const MEMO_V1_PROGRAM_ID = 'Memo1UhkJBfCR6MNB0D9eyMvfKV3coWR6gsp6U3aBKa'
const MEMO_V2_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'

type NativeDecoder = (programId: string, data: Uint8Array, accounts: string[]) => DecodedInstruction | null

const NATIVE_DECODERS = new Map<string, NativeDecoder>([
  [SYSTEM_PROGRAM_ID, (_pid, data, accounts) => decodeSystemInstruction(data, accounts)],
  [TOKEN_PROGRAM_ID, (pid, data, accounts) => decodeTokenInstruction(pid, data, accounts)],
  [TOKEN_2022_PROGRAM_ID, (pid, data, accounts) => decodeTokenInstruction(pid, data, accounts)],
  [COMPUTE_BUDGET_PROGRAM_ID, (_pid, data, accounts) => decodeComputeBudgetInstruction(data, accounts)],
  [ATA_PROGRAM_ID, (_pid, data, accounts) => decodeATAInstruction(data, accounts)],
  [MEMO_V1_PROGRAM_ID, (_pid, data, accounts) => decodeMemoInstruction(data, accounts)],
  [MEMO_V2_PROGRAM_ID, (_pid, data, accounts) => decodeMemoInstruction(data, accounts)],
])

export function decodeInstruction(
  programId: string,
  dataBase58: string,
  accounts: string[],
  ctx?: ParseContext,
): DecodedInstruction {
  // 1. Check native decoder map
  const nativeDecoder = NATIVE_DECODERS.get(programId)
  if (nativeDecoder) {
    let data: Uint8Array
    try {
      data = decodeBase58(dataBase58)
    } catch {
      return makeUnknown(programId, accounts, dataBase58)
    }
    const result = nativeDecoder(programId, data, accounts)
    if (result) return result
    return makeUnknown(programId, accounts, dataBase58)
  }

  // 2. Check DEX IDL registry
  const protocol = PROGRAM_ID_TO_PROTOCOL[programId as keyof typeof PROGRAM_ID_TO_PROTOCOL]
  if (protocol) {
    const rawSwap = tryParseInstruction(programId, accounts, dataBase58, ctx)
    if (rawSwap) {
      const poolIndex = POOL_ACCOUNT_INDEX[protocol]
      const pool = poolIndex !== undefined ? accounts[poolIndex] : undefined
      const dex: DexSwapInstruction = {
        program: 'dex',
        type: rawSwap.type,
        tokenFrom: rawSwap.tokenFrom,
        amountFrom: rawSwap.amountFrom,
        tokenTo: rawSwap.tokenTo,
        amountTo: rawSwap.amountTo,
        signer: rawSwap.signer,
        pool,
        protocol,
      }
      return dex
    }
  }

  // 3. Fallback to unknown
  return makeUnknown(programId, accounts, dataBase58)
}

function makeUnknown(programId: string, accounts: string[], data: string): UnknownInstruction {
  return { program: 'unknown', programId, accounts, data }
}
