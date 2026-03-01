import { describe, expect, it } from 'bun:test'
import { SYSTEM_PROGRAM_ID, TIP_ADDRESS_TO_PROVIDER, TipProvider } from '../src/constants.ts'
import { encodeBase58 } from '../src/idl/codec.ts'
import type { DecodedInstruction, DecodedInstructionEntry } from '../src/instruction-types.ts'
import { detectTips, detectTipsFromRawInstructions } from '../src/tips.ts'
import type { Instruction } from '../src/types.ts'

// ── Helpers ──

function makeTransferSolData(lamports: bigint): string {
  // System program transferSol: u32 LE instruction index (2) + u64 LE lamports
  const buf = new Uint8Array(12)
  const view = new DataView(buf.buffer)
  view.setUint32(0, 2, true) // TransferSol discriminator
  view.setBigUint64(4, lamports, true)
  return encodeBase58(buf)
}

function makeDecodedEntry(instruction: DecodedInstruction, innerInstructions: DecodedInstruction[] = []): DecodedInstructionEntry {
  return { index: 0, instruction, innerInstructions }
}

// Pick one address per provider for testing
const JITO_ADDR = '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT'
const TEMPORAL_ADDR = 'TEMPaMeCRFAS9EKF53Jd6KpHxgL47uWLcpFArU1Fanq'
const NEXTBLOCK_ADDR = 'NextbLoCkVtMGcV47JzewQdvBpLqT9TxQFozQkN98pE'
const BLOXROUTE_ADDR = 'HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY'
const ZEROSLOT_ADDR = '6fQaVhYZA4w3MBSXjJ81Vf6W1EDYeUPXpgVQ6UQyU1Av'
const BLOCKRAZOR_ADDR = 'FjmZZrFvhnqqb9ThCuMVnENaM3JGVuGWNyCAxRJcFpg9'
const HELIUS_ADDR = '4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE'
const ASTRALANE_ADDR = 'astrazznxsGUhWShqgNtAdfrzP2G83DzcWVJDxwV9bF'
const STELLIUM_ADDR = 'ste11JV3MLMM7x7EJUM2sXcJC1H7F4jBLnP9a9PG8PH'
const FLASHBLOCK_ADDR = 'FLaShB3iXXTWE1vu9wQsChUKq3HFtpMAhb8kAh1pf1wi'
const NODE1_ADDR = 'node1PqAa3BWWzUnTHVbw8NJHC874zn9ngAkXjgWEej'
const FALCON_ADDR = 'Fa1con11xLjPddfzRwRUB16sbFZggp2JeJkCeWREyR8X'
const NON_TIP_ADDR = 'SomeRandomAddress1111111111111111111111111'

// ── detectTips (decoded instruction entries) ──

describe('detectTips', () => {
  it('detects a Jito tip from a top-level transferSol', () => {
    const entries: DecodedInstructionEntry[] = [
      makeDecodedEntry({
        program: 'system',
        type: 'transferSol',
        source: 'sender111',
        destination: JITO_ADDR,
        lamports: 100_000n,
      }),
    ]
    const tips = detectTips(entries)
    expect(tips).toEqual([
      { provider: TipProvider.Jito, lamports: 100_000n, recipient: JITO_ADDR },
    ])
  })

  it('detects tips from inner instructions', () => {
    const entries: DecodedInstructionEntry[] = [
      makeDecodedEntry(
        { program: 'compute-budget', type: 'setComputeUnitLimit', units: 200_000 },
        [
          {
            program: 'system',
            type: 'transferSol',
            source: 'sender111',
            destination: TEMPORAL_ADDR,
            lamports: 50_000n,
          },
        ],
      ),
    ]
    const tips = detectTips(entries)
    expect(tips).toEqual([
      { provider: TipProvider.Temporal, lamports: 50_000n, recipient: TEMPORAL_ADDR },
    ])
  })

  it('returns undefined when no tips found', () => {
    const entries: DecodedInstructionEntry[] = [
      makeDecodedEntry({
        program: 'system',
        type: 'transferSol',
        source: 'sender111',
        destination: NON_TIP_ADDR,
        lamports: 1_000_000n,
      }),
    ]
    expect(detectTips(entries)).toBeUndefined()
  })

  it('returns undefined for non-transfer system instructions', () => {
    const entries: DecodedInstructionEntry[] = [
      makeDecodedEntry({
        program: 'system',
        type: 'createAccount',
        payer: 'sender111',
        newAccount: JITO_ADDR,
        lamports: 1_000_000n,
        space: 165n,
        programAddress: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      }),
    ]
    expect(detectTips(entries)).toBeUndefined()
  })

  it('detects multiple tips from different providers', () => {
    const entries: DecodedInstructionEntry[] = [
      makeDecodedEntry({
        program: 'system',
        type: 'transferSol',
        source: 'sender111',
        destination: JITO_ADDR,
        lamports: 100_000n,
      }),
      makeDecodedEntry({
        program: 'system',
        type: 'transferSol',
        source: 'sender111',
        destination: NEXTBLOCK_ADDR,
        lamports: 200_000n,
      }),
    ]
    const tips = detectTips(entries)
    expect(tips).toHaveLength(2)
    expect(tips![0]!.provider).toBe(TipProvider.Jito)
    expect(tips![1]!.provider).toBe(TipProvider.NextBlock)
  })

  it('detects each provider type', () => {
    const addrs: [string, TipProvider][] = [
      [JITO_ADDR, TipProvider.Jito],
      [TEMPORAL_ADDR, TipProvider.Temporal],
      [NEXTBLOCK_ADDR, TipProvider.NextBlock],
      [BLOXROUTE_ADDR, TipProvider.BloxRoute],
      [ZEROSLOT_ADDR, TipProvider.ZeroSlot],
      [BLOCKRAZOR_ADDR, TipProvider.BlockRazor],
      [HELIUS_ADDR, TipProvider.Helius],
      [ASTRALANE_ADDR, TipProvider.Astralane],
      [STELLIUM_ADDR, TipProvider.Stellium],
      [FLASHBLOCK_ADDR, TipProvider.Flashblock],
      [NODE1_ADDR, TipProvider.Node1],
      [FALCON_ADDR, TipProvider.Falcon],
    ]
    for (const [addr, expected] of addrs) {
      const entries: DecodedInstructionEntry[] = [
        makeDecodedEntry({
          program: 'system',
          type: 'transferSol',
          source: 'sender111',
          destination: addr,
          lamports: 10_000n,
        }),
      ]
      const tips = detectTips(entries)
      expect(tips).toHaveLength(1)
      expect(tips![0]!.provider).toBe(expected)
    }
  })
})

// ── detectTipsFromRawInstructions (raw instructions + fullKeys) ──

describe('detectTipsFromRawInstructions', () => {
  it('detects a tip from an unparsed system instruction', () => {
    const lamports = 500_000n
    const instr: Instruction = {
      programId: SYSTEM_PROGRAM_ID,
      accounts: ['sender111', JITO_ADDR],
      data: makeTransferSolData(lamports),
    }
    const tips = detectTipsFromRawInstructions([instr], [])
    expect(tips).toEqual([
      { provider: TipProvider.Jito, lamports, recipient: JITO_ADDR },
    ])
  })

  it('detects a tip from a compiled system instruction', () => {
    const lamports = 300_000n
    const fullKeys = ['sender111', ZEROSLOT_ADDR, SYSTEM_PROGRAM_ID]
    const instr: Instruction = {
      programIdIndex: 2,
      accounts: [0, 1],
      data: makeTransferSolData(lamports),
    }
    const tips = detectTipsFromRawInstructions([instr], fullKeys)
    expect(tips).toEqual([
      { provider: TipProvider.ZeroSlot, lamports, recipient: ZEROSLOT_ADDR },
    ])
  })

  it('returns undefined for non-tip transfer', () => {
    const instr: Instruction = {
      programId: SYSTEM_PROGRAM_ID,
      accounts: ['sender111', NON_TIP_ADDR],
      data: makeTransferSolData(100_000n),
    }
    expect(detectTipsFromRawInstructions([instr], [])).toBeUndefined()
  })

  it('skips non-system program instructions', () => {
    const instr: Instruction = {
      programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      accounts: ['sender111', JITO_ADDR],
      data: makeTransferSolData(100_000n),
    }
    expect(detectTipsFromRawInstructions([instr], [])).toBeUndefined()
  })

  it('detects multiple tips', () => {
    const instrs: Instruction[] = [
      {
        programId: SYSTEM_PROGRAM_ID,
        accounts: ['sender111', BLOXROUTE_ADDR],
        data: makeTransferSolData(100_000n),
      },
      {
        programId: SYSTEM_PROGRAM_ID,
        accounts: ['sender111', BLOCKRAZOR_ADDR],
        data: makeTransferSolData(200_000n),
      },
    ]
    const tips = detectTipsFromRawInstructions(instrs, [])
    expect(tips).toHaveLength(2)
    expect(tips![0]!.provider).toBe(TipProvider.BloxRoute)
    expect(tips![1]!.provider).toBe(TipProvider.BlockRazor)
  })
})

// ── Address map completeness ──

describe('TIP_ADDRESS_TO_PROVIDER', () => {
  it('maps all known providers', () => {
    const providers = new Set(Object.values(TIP_ADDRESS_TO_PROVIDER))
    for (const p of Object.values(TipProvider)) {
      expect(providers.has(p)).toBe(true)
    }
  })
})
