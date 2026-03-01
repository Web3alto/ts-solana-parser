import { describe, expect, test } from 'bun:test'
import type { RawSwap } from '../src/idl/types.ts'
import type { OwnerTokenState } from '../src/parser/balance.ts'
import {
  approximatelyEqualBigInt,
  countRouteHops,
  resolveTokenPrograms,
  selectBestIdlCandidate,
} from '../src/parser/idl-scoring.ts'
import type { ParserOptions, SwapType } from '../src/types.ts'

interface IdlCandidate {
  programId: string
  swap: RawSwap
}

function makeCandidate(
  programId: string,
  signer: string,
  tokenFrom: string,
  tokenTo: string,
  amountFrom = 100n,
  amountTo = 200n,
  type: SwapType = 'pumpfun-buy',
): IdlCandidate {
  return {
    programId,
    swap: { signer, tokenFrom, tokenTo, amountFrom, amountTo, type },
  }
}

function makeOwnerTokenState(
  deltas: Record<string, Record<string, bigint>>,
  decimals: Record<string, Record<string, number>> = {},
): OwnerTokenState {
  const deltasByOwner = new Map<string, Map<string, bigint>>()
  for (const [owner, mints] of Object.entries(deltas)) {
    deltasByOwner.set(owner, new Map(Object.entries(mints)))
  }
  const decimalsByOwner = new Map<string, Map<string, number>>()
  for (const [owner, mints] of Object.entries(decimals)) {
    decimalsByOwner.set(owner, new Map(Object.entries(mints)))
  }
  return { deltasByOwner, decimalsByOwner, malformedBalanceEntries: 0 }
}

// ── selectBestIdlCandidate ──

describe('selectBestIdlCandidate', () => {
  test('returns null for empty candidates array', () => {
    const state = makeOwnerTokenState({})
    const result = selectBestIdlCandidate([], state, 'FeePayer')
    expect(result).toBeNull()
  })

  test('picks candidate with highest score', () => {
    // Good candidate: signer has negative fromDelta and positive toDelta
    const good = makeCandidate('ProgA', 'SignerA', 'MintFrom', 'MintTo')
    // Bad candidate: signer has no deltas at all
    const bad = makeCandidate('ProgB', 'SignerB', 'MintX', 'MintY')

    const state = makeOwnerTokenState({
      SignerA: { MintFrom: -1000n, MintTo: 500n },
      // SignerB not present => score = -3
    })

    const result = selectBestIdlCandidate([good, bad], state, 'SignerA')
    expect(result).not.toBeNull()
    expect(result!.candidate).toBe(good)
    // score: fromDelta<0 => +5, toDelta>0 => +5, fromDelta!=0 => +1, toDelta!=0 => +1, feePayer bonus => +1 = 13
    expect(result!.score).toBe(13)
    expect(result!.confidence).toBe('high')
  })

  test('returns low confidence for low scores', () => {
    const candidate = makeCandidate('ProgA', 'Signer', 'MintFrom', 'MintTo')

    // Signer has no deltas => score = -3
    const state = makeOwnerTokenState({})

    const result = selectBestIdlCandidate([candidate], state, 'FeePayer')
    expect(result).not.toBeNull()
    expect(result!.score).toBe(-3)
    expect(result!.confidence).toBe('low')
  })
})

// ── countRouteHops ──

describe('countRouteHops', () => {
  test('returns 1 for empty candidates', () => {
    expect(countRouteHops([])).toBe(1)
  })

  test('returns 1 for single candidate', () => {
    const candidates = [makeCandidate('ProgA', 'Signer', 'MintA', 'MintB')]
    expect(countRouteHops(candidates)).toBe(1)
  })

  test('returns count of unique program+signer+mints combinations', () => {
    const candidates = [
      makeCandidate('ProgA', 'Signer', 'MintA', 'MintB'),
      makeCandidate('ProgB', 'Signer', 'MintB', 'MintC'),
      makeCandidate('ProgC', 'Signer', 'MintC', 'MintD'),
    ]
    expect(countRouteHops(candidates)).toBe(3)
  })

  test('deduplicates identical candidates', () => {
    const candidates = [
      makeCandidate('ProgA', 'Signer', 'MintA', 'MintB'),
      makeCandidate('ProgA', 'Signer', 'MintA', 'MintB'),
      makeCandidate('ProgA', 'Signer', 'MintA', 'MintB'),
    ]
    expect(countRouteHops(candidates)).toBe(1)
  })
})

// ── approximatelyEqualBigInt ──

describe('approximatelyEqualBigInt', () => {
  test('exact match returns true', () => {
    expect(approximatelyEqualBigInt(10000n, 10000n)).toBe(true)
  })

  test('within tolerance returns true', () => {
    // 1000 bps = 10% tolerance
    // diff=500, largest=10500, 500*10000 = 5000000 <= 10500*1000 = 10500000 => true
    expect(approximatelyEqualBigInt(10000n, 10500n, 1000)).toBe(true)
  })

  test('outside tolerance returns false', () => {
    // 100 bps = 1% tolerance
    // diff=500, largest=10500, 500*10000 = 5000000 > 10500*100 = 1050000 => false
    expect(approximatelyEqualBigInt(10000n, 10500n, 100)).toBe(false)
  })

  test('zero handling', () => {
    expect(approximatelyEqualBigInt(0n, 0n)).toBe(true)
    expect(approximatelyEqualBigInt(0n, 1n)).toBe(false)
  })
})

// ── resolveTokenPrograms ──

describe('resolveTokenPrograms', () => {
  test('returns empty object when no resolveMintTokenProgram option', () => {
    const result = resolveTokenPrograms(undefined, 'MintA', 'MintB')
    expect(result).toEqual({})

    const result2 = resolveTokenPrograms({}, 'MintA', 'MintB')
    expect(result2).toEqual({})
  })

  test('returns token programs when resolver provided', () => {
    const options: ParserOptions = {
      resolveMintTokenProgram: (mint: string) => {
        if (mint === 'MintA') return 'spl-token'
        return 'unknown'
      },
    }

    const result = resolveTokenPrograms(options, 'MintA', 'MintB')
    expect(result.inputTokenProgram).toBe('spl-token')
    expect(result.outputTokenProgram).toBe('unknown')
  })

  test('works with token-2022 detection', () => {
    const options: ParserOptions = {
      resolveMintTokenProgram: (mint: string) => {
        if (mint === 'Token2022Mint') return 'token-2022'
        return 'spl-token'
      },
    }

    const result = resolveTokenPrograms(options, 'Token2022Mint', 'NormalMint')
    expect(result.inputTokenProgram).toBe('token-2022')
    expect(result.outputTokenProgram).toBe('spl-token')
  })
})
