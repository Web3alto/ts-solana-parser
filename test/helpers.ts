import { encodeBase58 } from '../src/idl/codec.ts'
import type { ParseContext } from '../src/idl/types.ts'
import type { SwapInput } from '../src/parse-swap.ts'
import type { TokenBalance, TransactionNotification } from '../src/types.ts'

export function notificationToSwapInput(n: TransactionNotification): SwapInput {
  return {
    transaction: n.transaction.transaction,
    meta: n.transaction.meta,
    signature: n.signature,
    slot: n.slot,
    blockTime: n.blockTime,
  }
}

export function buildMinimalTxBytes(): Uint8Array {
  const bytes: number[] = []

  // signatures length = 1
  bytes.push(1)
  for (let i = 0; i < 64; i++) bytes.push(1)

  // header
  bytes.push(1, 0, 0)

  // account keys length = 1
  bytes.push(1)
  for (let i = 0; i < 32; i++) bytes.push(2)

  // recent blockhash
  for (let i = 0; i < 32; i++) bytes.push(3)

  // instruction length = 0
  bytes.push(0)

  return new Uint8Array(bytes)
}

export function u64le(value: bigint): number[] {
  const out = new Array<number>(8).fill(0)
  let x = value
  for (let i = 0; i < 8; i++) {
    out[i] = Number(x & 0xffn)
    x >>= 8n
  }
  return out
}

export function encodeIxData(discriminator: readonly number[], amount0: bigint, amount1: bigint): string {
  return encodeBase58(Uint8Array.from([...discriminator, ...u64le(amount0), ...u64le(amount1)]))
}

export function tokenBalance(accountIndex: number, mint: string, owner?: string): TokenBalance {
  return {
    accountIndex,
    mint,
    owner: owner ?? 'owner',
    uiTokenAmount: {
      amount: '1',
      decimals: 9,
      uiAmount: 0.000000001,
    },
  }
}

export function buildTestContext(
  allKeys: string[],
  preTokenBalances: TokenBalance[],
  postTokenBalances: TokenBalance[] = [],
): ParseContext {
  const keyIndexMap = new Map<string, number>()
  for (let i = 0; i < allKeys.length; i++) keyIndexMap.set(allKeys[i]!, i)

  const accountMintMap = new Map<number, string>()
  for (const b of preTokenBalances) accountMintMap.set(b.accountIndex, b.mint)
  for (const b of postTokenBalances) {
    if (!accountMintMap.has(b.accountIndex)) accountMintMap.set(b.accountIndex, b.mint)
  }

  return { allKeys, preTokenBalances, postTokenBalances, keyIndexMap, accountMintMap }
}
