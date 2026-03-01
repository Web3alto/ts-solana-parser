import { describe, expect, test } from 'bun:test'
import { SOL_DECIMALS, SOL_MINT, WSOL_MINT } from '../src/constants.ts'
import type { NormalizedTransactionMeta } from '../src/parser/accounts.ts'
import {
  buildOwnerTokenState,
  computeSolChange,
  computeTokenChanges,
  mergeChanges,
  normalizeMint,
  selectInputOutputChanges,
} from '../src/parser/balance.ts'
import type { TokenChange } from '../src/types.ts'
import { tb } from './helpers.ts'

function makeMinimalMeta(overrides: Partial<NormalizedTransactionMeta> = {}): NormalizedTransactionMeta {
  return {
    err: null,
    fee: 5000,
    preBalances: [],
    postBalances: [],
    preTokenBalances: [],
    postTokenBalances: [],
    innerInstructions: [],
    loadedAddresses: { writable: [], readonly: [] },
    ...overrides,
  }
}

// ── buildOwnerTokenState ──

describe('buildOwnerTokenState', () => {
  test('calculates pre/post token balance deltas correctly', () => {
    const meta = makeMinimalMeta({
      preTokenBalances: [tb(1, 'MintA', '100', 6, 'OwnerA')],
      postTokenBalances: [tb(1, 'MintA', '300', 6, 'OwnerA')],
    })

    const state = buildOwnerTokenState(meta)
    const ownerDeltas = state.deltasByOwner.get('OwnerA')
    expect(ownerDeltas).toBeDefined()
    expect(ownerDeltas!.get('MintA')).toBe(200n) // 300 - 100
    expect(state.malformedBalanceEntries).toBe(0)
  })

  test('handles multiple mints for same owner', () => {
    const meta = makeMinimalMeta({
      preTokenBalances: [tb(1, 'MintA', '100', 6, 'OwnerA'), tb(2, 'MintB', '500', 9, 'OwnerA')],
      postTokenBalances: [tb(1, 'MintA', '200', 6, 'OwnerA'), tb(2, 'MintB', '700', 9, 'OwnerA')],
    })

    const state = buildOwnerTokenState(meta)
    const ownerDeltas = state.deltasByOwner.get('OwnerA')
    expect(ownerDeltas).toBeDefined()
    expect(ownerDeltas!.get('MintA')).toBe(100n)
    expect(ownerDeltas!.get('MintB')).toBe(200n)
  })

  test('counts malformed entries (null owner, non-numeric amount)', () => {
    const meta = makeMinimalMeta({
      preTokenBalances: [
        tb(1, 'MintA', '100', 6, 'OwnerA'),
        { accountIndex: 2, mint: 'MintB', owner: null, uiTokenAmount: { amount: '50', decimals: 6, uiAmount: null } },
        tb(3, 'MintC', 'abc', 6, 'OwnerC'),
      ],
      postTokenBalances: [tb(1, 'MintA', '200', 6, 'OwnerA')],
    })

    const state = buildOwnerTokenState(meta)
    expect(state.malformedBalanceEntries).toBe(2) // null owner + non-numeric "abc"
    expect(state.deltasByOwner.get('OwnerA')!.get('MintA')).toBe(100n)
  })

  test('handles empty token balances', () => {
    const meta = makeMinimalMeta({
      preTokenBalances: [],
      postTokenBalances: [],
    })

    const state = buildOwnerTokenState(meta)
    expect(state.deltasByOwner.size).toBe(0)
    expect(state.decimalsByOwner.size).toBe(0)
    expect(state.malformedBalanceEntries).toBe(0)
  })
})

// ── computeTokenChanges ──

describe('computeTokenChanges', () => {
  test('returns changes for user with non-zero deltas', () => {
    const meta = makeMinimalMeta({
      preTokenBalances: [tb(1, 'MintA', '100', 6, 'User1')],
      postTokenBalances: [tb(1, 'MintA', '300', 6, 'User1')],
    })
    const state = buildOwnerTokenState(meta)
    const changes = computeTokenChanges(state, 'User1')

    expect(changes).toHaveLength(1)
    expect(changes[0]!.mint).toBe('MintA')
    expect(changes[0]!.rawDelta).toBe(200n)
    expect(changes[0]!.decimals).toBe(6)
  })

  test('filters out zero deltas', () => {
    const meta = makeMinimalMeta({
      preTokenBalances: [tb(1, 'MintA', '100', 6, 'User1')],
      postTokenBalances: [tb(1, 'MintA', '100', 6, 'User1')],
    })
    const state = buildOwnerTokenState(meta)
    const changes = computeTokenChanges(state, 'User1')

    expect(changes).toHaveLength(0)
  })

  test('returns empty array for unknown user', () => {
    const meta = makeMinimalMeta({
      preTokenBalances: [tb(1, 'MintA', '100', 6, 'User1')],
      postTokenBalances: [tb(1, 'MintA', '300', 6, 'User1')],
    })
    const state = buildOwnerTokenState(meta)
    const changes = computeTokenChanges(state, 'UnknownUser')

    expect(changes).toHaveLength(0)
  })
})

// ── computeSolChange ──

describe('computeSolChange', () => {
  test('returns SOL change with fee adjustment for fee payer (index 0)', () => {
    const meta = makeMinimalMeta({
      fee: 5000,
      preBalances: [1_000_000_000, 500_000],
      postBalances: [900_000_000, 500_000],
    })

    const accountIndexMap = new Map<string, number>([
      ['FeePayer', 0],
      ['Other', 1],
    ])

    const result = computeSolChange(meta, accountIndexMap, 'FeePayer')
    expect(result).not.toBeNull()
    expect(result!.mint).toBe(SOL_MINT)
    expect(result!.decimals).toBe(SOL_DECIMALS)
    // trueDelta = (900_000_000 - 1_000_000_000) + 5000 = -99_995_000
    expect(result!.rawDelta).toBe(-99_995_000n)
  })

  test('returns null for zero delta (post-pre+feeAdjust = 0)', () => {
    const meta = makeMinimalMeta({
      fee: 5000,
      preBalances: [1_000_000, 500_000],
      postBalances: [995_000, 500_000],
    })

    const accountIndexMap = new Map<string, number>([
      ['FeePayer', 0],
      ['Other', 1],
    ])

    // trueDelta = (995_000 - 1_000_000) + 5000 = 0
    const result = computeSolChange(meta, accountIndexMap, 'FeePayer')
    expect(result).toBeNull()
  })

  test('returns null for unknown user', () => {
    const meta = makeMinimalMeta({
      preBalances: [1_000_000],
      postBalances: [900_000],
    })

    const accountIndexMap = new Map<string, number>([['FeePayer', 0]])
    const result = computeSolChange(meta, accountIndexMap, 'UnknownUser')
    expect(result).toBeNull()
  })
})

// ── mergeChanges ──

describe('mergeChanges', () => {
  test('normalizes WSOL to SOL', () => {
    const tokenChanges: TokenChange[] = [{ mint: WSOL_MINT, rawDelta: -500n, decimals: SOL_DECIMALS }]

    const merged = mergeChanges(tokenChanges, null)
    expect(merged).toHaveLength(1)
    expect(merged[0]!.mint).toBe(SOL_MINT)
    expect(merged[0]!.rawDelta).toBe(-500n)
  })

  test('combines same-mint deltas', () => {
    const tokenChanges: TokenChange[] = [
      { mint: 'MintA', rawDelta: 100n, decimals: 6 },
      { mint: 'MintA', rawDelta: 200n, decimals: 6 },
    ]

    const merged = mergeChanges(tokenChanges, null)
    expect(merged).toHaveLength(1)
    expect(merged[0]!.rawDelta).toBe(300n)
  })

  test('filters out zero-sum entries', () => {
    const tokenChanges: TokenChange[] = [
      { mint: 'MintA', rawDelta: 100n, decimals: 6 },
      { mint: 'MintA', rawDelta: -100n, decimals: 6 },
    ]

    const merged = mergeChanges(tokenChanges, null)
    expect(merged).toHaveLength(0)
  })

  test('merges SOL change with existing WSOL token change', () => {
    const tokenChanges: TokenChange[] = [{ mint: WSOL_MINT, rawDelta: -300n, decimals: SOL_DECIMALS }]
    const solChange: TokenChange = { mint: SOL_MINT, rawDelta: 100n, decimals: SOL_DECIMALS }

    const merged = mergeChanges(tokenChanges, solChange)
    expect(merged).toHaveLength(1)
    expect(merged[0]!.mint).toBe(SOL_MINT)
    // WSOL normalized to SOL_MINT: -300, then SOL added: -300 + 100 = -200
    expect(merged[0]!.rawDelta).toBe(-200n)
  })
})

// ── selectInputOutputChanges ──

describe('selectInputOutputChanges', () => {
  test('picks largest negative as input, largest positive as output (heuristic)', () => {
    const merged: TokenChange[] = [
      { mint: 'MintA', rawDelta: -500n, decimals: 6 },
      { mint: 'MintB', rawDelta: -100n, decimals: 6 },
      { mint: 'MintC', rawDelta: 1000n, decimals: 9 },
      { mint: 'MintD', rawDelta: 200n, decimals: 9 },
    ]

    const result = selectInputOutputChanges(merged, null)
    expect(result).not.toBeNull()
    expect(result!.input.mint).toBe('MintA') // most negative
    expect(result!.output.mint).toBe('MintC') // most positive
    expect(result!.warnings).toEqual([])
  })

  test('with IDL selection, anchors to IDL mints', () => {
    const merged: TokenChange[] = [
      { mint: 'MintA', rawDelta: -500n, decimals: 6 },
      { mint: 'MintB', rawDelta: -100n, decimals: 6 },
      { mint: 'MintC', rawDelta: 1000n, decimals: 9 },
      { mint: 'MintD', rawDelta: 200n, decimals: 9 },
    ]

    const selectedIdl = {
      candidate: {
        programId: 'Program1',
        swap: {
          signer: 'User1',
          tokenFrom: 'MintB',
          tokenTo: 'MintD',
          amountFrom: 100n,
          amountTo: 200n,
          type: 'pumpfun-buy' as const,
        },
      },
      confidence: 'high' as const,
      score: 12,
    }

    const result = selectInputOutputChanges(merged, selectedIdl)
    expect(result).not.toBeNull()
    expect(result!.input.mint).toBe('MintB') // anchored to IDL tokenFrom
    expect(result!.output.mint).toBe('MintD') // anchored to IDL tokenTo
    expect(result!.warnings).toEqual([])
  })

  test('with IDL selection but mints not found in deltas, returns warning', () => {
    const merged: TokenChange[] = [
      { mint: 'MintA', rawDelta: -500n, decimals: 6 },
      { mint: 'MintC', rawDelta: 1000n, decimals: 9 },
    ]

    const selectedIdl = {
      candidate: {
        programId: 'Program1',
        swap: {
          signer: 'User1',
          tokenFrom: 'MintX',
          tokenTo: 'MintY',
          amountFrom: 100n,
          amountTo: 200n,
          type: 'pumpfun-buy' as const,
        },
      },
      confidence: 'high' as const,
      score: 12,
    }

    const result = selectInputOutputChanges(merged, selectedIdl)
    expect(result).not.toBeNull()
    expect(result!.warnings).toContain('IDL_MINTS_NOT_FOUND_IN_PRIMARY_DELTAS')
    // Falls back to heuristic: largest negative / positive
    expect(result!.input.mint).toBe('MintA')
    expect(result!.output.mint).toBe('MintC')
  })

  test('returns null if no inputs or no outputs', () => {
    // All positive
    const allPositive: TokenChange[] = [
      { mint: 'MintA', rawDelta: 100n, decimals: 6 },
      { mint: 'MintB', rawDelta: 200n, decimals: 9 },
    ]
    expect(selectInputOutputChanges(allPositive, null)).toBeNull()

    // All negative
    const allNegative: TokenChange[] = [
      { mint: 'MintA', rawDelta: -100n, decimals: 6 },
      { mint: 'MintB', rawDelta: -200n, decimals: 9 },
    ]
    expect(selectInputOutputChanges(allNegative, null)).toBeNull()

    // Empty
    expect(selectInputOutputChanges([], null)).toBeNull()
  })
})

// ── normalizeMint ──

describe('normalizeMint', () => {
  test('WSOL maps to SOL_MINT', () => {
    expect(normalizeMint(WSOL_MINT)).toBe(SOL_MINT)
  })

  test('other mints unchanged', () => {
    const randomMint = 'RandomMint111111111111111111111111111111111'
    expect(normalizeMint(randomMint)).toBe(randomMint)
    expect(normalizeMint(SOL_MINT)).toBe(SOL_MINT)
  })
})
