import type { Protocol } from './constants.ts'
import type { MevTip, ParsedSwap, SwapType } from './types.ts'

// ── System program ──

export type SystemInstruction =
  | { program: 'system'; type: 'transferSol'; source: string; destination: string; lamports: bigint }
  | {
      program: 'system'
      type: 'createAccount'
      payer: string
      newAccount: string
      lamports: bigint
      space: bigint
      programAddress: string
    }
  | { program: 'system'; type: 'assign'; account: string; programAddress: string }
  | { program: 'system'; type: 'allocate'; account: string; space: bigint }
  | {
      program: 'system'
      type: 'createAccountWithSeed'
      payer: string
      newAccount: string
      base: string
      seed: string
      lamports: bigint
      space: bigint
      programAddress: string
    }
  | { program: 'system'; type: 'advanceNonceAccount'; nonceAccount: string; nonceAuthority: string }
  | {
      program: 'system'
      type: 'withdrawNonceAccount'
      nonceAccount: string
      destination: string
      nonceAuthority: string
      lamports: bigint
    }
  | { program: 'system'; type: 'initializeNonceAccount'; nonceAccount: string; nonceAuthority: string }
  | {
      program: 'system'
      type: 'authorizeNonceAccount'
      nonceAccount: string
      nonceAuthority: string
      newAuthority: string
    }
  | {
      program: 'system'
      type: 'transferSolWithSeed'
      source: string
      sourceBase: string
      destination: string
      lamports: bigint
      sourceSeed: string
      sourceProgramAddress: string
    }
  | { program: 'system'; type: 'upgradeNonceAccount'; nonceAccount: string }
  | {
      program: 'system'
      type: 'assignWithSeed'
      account: string
      base: string
      seed: string
      programAddress: string
    }
  | {
      program: 'system'
      type: 'allocateWithSeed'
      account: string
      base: string
      seed: string
      space: bigint
      programAddress: string
    }

// ── Token program (covers SPL Token + Token-2022) ──

export type TokenInstruction =
  | {
      program: 'spl-token' | 'token-2022'
      type: 'transfer'
      source: string
      destination: string
      authority: string
      amount: bigint
    }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'transferChecked'
      source: string
      destination: string
      mint: string
      authority: string
      amount: bigint
      decimals: number
    }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'approve'
      source: string
      delegate: string
      authority: string
      amount: bigint
    }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'revoke'
      source: string
      authority: string
    }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'burn'
      account: string
      mint: string
      authority: string
      amount: bigint
    }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'mintTo'
      mint: string
      account: string
      authority: string
      amount: bigint
    }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'closeAccount'
      account: string
      destination: string
      authority: string
    }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'initializeAccount'
      account: string
      mint: string
      owner: string
    }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'initializeAccount2'
      account: string
      mint: string
      owner: string
    }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'initializeAccount3'
      account: string
      mint: string
      owner: string
    }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'setAuthority'
      account: string
      authority: string
      authorityType: string
      newAuthority: string | null
    }
  | { program: 'spl-token' | 'token-2022'; type: 'syncNative'; account: string }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'initializeMint'
      mint: string
      decimals: number
      mintAuthority: string
      freezeAuthority: string | null
    }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'initializeMint2'
      mint: string
      decimals: number
      mintAuthority: string
      freezeAuthority: string | null
    }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'freezeAccount'
      account: string
      mint: string
      authority: string
    }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'thawAccount'
      account: string
      mint: string
      authority: string
    }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'approveChecked'
      source: string
      mint: string
      delegate: string
      authority: string
      amount: bigint
      decimals: number
    }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'burnChecked'
      account: string
      mint: string
      authority: string
      amount: bigint
      decimals: number
    }
  | {
      program: 'spl-token' | 'token-2022'
      type: 'mintToChecked'
      mint: string
      account: string
      authority: string
      amount: bigint
      decimals: number
    }

// ── Compute Budget ──

export type ComputeBudgetInstruction =
  | { program: 'compute-budget'; type: 'setComputeUnitLimit'; units: number }
  | { program: 'compute-budget'; type: 'setComputeUnitPrice'; microLamports: bigint }
  | { program: 'compute-budget'; type: 'requestHeapFrame'; bytes: number }

// ── Associated Token Account ──

export type ATAInstruction =
  | {
      program: 'associated-token-account'
      type: 'create'
      payer: string
      account: string
      owner: string
      mint: string
      tokenProgram: string
    }
  | {
      program: 'associated-token-account'
      type: 'createIdempotent'
      payer: string
      account: string
      owner: string
      mint: string
      tokenProgram: string
    }
  | {
      program: 'associated-token-account'
      type: 'recoverNested'
      nestedAccount: string
      nestedMint: string
      destinationAccount: string
      ownerMint: string
      ownerAccount: string
      owner: string
      tokenProgram: string
    }

// ── Memo ──

export type MemoInstruction = {
  program: 'memo'
  type: 'memo'
  message: string
  signers: string[]
}

// ── DEX swap (from existing IDL parsers) ──

export type DexSwapInstruction = {
  program: 'dex'
  type: SwapType
  tokenFrom: string
  amountFrom: bigint
  tokenTo: string
  amountTo: bigint
  signer: string
  pool?: string | undefined
  protocol: Protocol
}

// ── Unknown ──

export type UnknownInstruction = {
  program: 'unknown'
  programId: string
  accounts: string[]
  data: string
}

// ── Union ──

export type DecodedInstruction =
  | SystemInstruction
  | TokenInstruction
  | ComputeBudgetInstruction
  | ATAInstruction
  | MemoInstruction
  | DexSwapInstruction
  | UnknownInstruction

// ── Full transaction result ──

export interface DecodedInstructionEntry {
  readonly index: number
  readonly instruction: DecodedInstruction
  readonly innerInstructions: DecodedInstruction[]
}

export interface FullTransactionResult {
  readonly signature: string
  readonly slot: number
  readonly blockTime?: number | undefined
  readonly version: 'legacy' | 0
  readonly fee: number
  readonly feePayer: string
  readonly err: Readonly<Record<string, unknown>> | null
  readonly computeUnitsConsumed?: number | undefined
  readonly logMessages?: readonly string[] | undefined
  readonly instructions: readonly DecodedInstructionEntry[]
  readonly tips?: readonly MevTip[] | undefined
  readonly swap?: ParsedSwap | undefined
}
