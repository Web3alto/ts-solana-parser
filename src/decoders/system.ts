import { encodeBase58, readU64LE } from '../idl/codec.ts'
import type { SystemInstruction } from '../instruction-types.ts'
import { textDecoder } from './misc.ts'

// System program uses u32 LE instruction index as discriminator (first 4 bytes)
enum SystemIx {
  CreateAccount = 0,
  Assign = 1,
  TransferSol = 2,
  CreateAccountWithSeed = 3,
  AdvanceNonceAccount = 4,
  WithdrawNonceAccount = 5,
  InitializeNonceAccount = 6,
  AuthorizeNonceAccount = 7,
  Allocate = 8,
  AllocateWithSeed = 9,
  AssignWithSeed = 10,
  TransferSolWithSeed = 11,
  UpgradeNonceAccount = 12,
}

function readU32LE(data: Uint8Array, offset: number): number {
  return (data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)) >>> 0
}

function readAddress(data: Uint8Array, offset: number): string {
  return encodeBase58(data.subarray(offset, offset + 32))
}

function readString(data: Uint8Array, offset: number): { value: string; bytesRead: number } {
  const len = readU32LE(data, offset) // u32 LE length prefix
  // Explicitly cast to number since u32 length fits safely
  const end = offset + 4 + len
  const value = textDecoder.decode(data.subarray(offset + 4, end))
  return { value, bytesRead: 4 + len }
}

export function decodeSystemInstruction(data: Uint8Array, accounts: string[]): SystemInstruction | null {
  if (data.length < 4) return null

  const ix = readU32LE(data, 0)

  switch (ix) {
    case SystemIx.TransferSol: {
      // data: [4..12] u64 lamports
      if (data.length < 12 || accounts.length < 2) return null
      return {
        program: 'system',
        type: 'transferSol',
        source: accounts[0]!,
        destination: accounts[1]!,
        lamports: readU64LE(data, 4),
      }
    }

    case SystemIx.CreateAccount: {
      // data: [4..12] u64 lamports, [12..20] u64 space, [20..52] pubkey programAddress
      if (data.length < 52 || accounts.length < 2) return null
      return {
        program: 'system',
        type: 'createAccount',
        payer: accounts[0]!,
        newAccount: accounts[1]!,
        lamports: readU64LE(data, 4),
        space: readU64LE(data, 12),
        programAddress: readAddress(data, 20),
      }
    }

    case SystemIx.Assign: {
      // data: [4..36] pubkey programAddress
      if (data.length < 36 || accounts.length < 1) return null
      return {
        program: 'system',
        type: 'assign',
        account: accounts[0]!,
        programAddress: readAddress(data, 4),
      }
    }

    case SystemIx.Allocate: {
      // data: [4..12] u64 space
      if (data.length < 12 || accounts.length < 1) return null
      return {
        program: 'system',
        type: 'allocate',
        account: accounts[0]!,
        space: readU64LE(data, 4),
      }
    }

    case SystemIx.CreateAccountWithSeed: {
      // data: [4..36] pubkey base, [36..] string seed (u32 len + bytes),
      //       then u64 lamports, u64 space, pubkey programAddress
      if (data.length < 40 || accounts.length < 2) return null
      const base = readAddress(data, 4)
      const seed = readString(data, 36)
      const offset = 36 + seed.bytesRead
      if (data.length < offset + 48) return null // 8 + 8 + 32
      return {
        program: 'system',
        type: 'createAccountWithSeed',
        payer: accounts[0]!,
        newAccount: accounts[1]!,
        base,
        seed: seed.value,
        lamports: readU64LE(data, offset),
        space: readU64LE(data, offset + 8),
        programAddress: readAddress(data, offset + 16),
      }
    }

    case SystemIx.AdvanceNonceAccount: {
      // No extra data. accounts: [0] nonceAccount, [1] recentBlockhashes sysvar, [2] nonceAuthority
      if (accounts.length < 3) return null
      return {
        program: 'system',
        type: 'advanceNonceAccount',
        nonceAccount: accounts[0]!,
        nonceAuthority: accounts[2]!,
      }
    }

    case SystemIx.WithdrawNonceAccount: {
      // data: [4..12] u64 lamports
      // accounts: [0] nonceAccount, [1] destination, [2] recentBlockhashes, [3] rent, [4] nonceAuthority
      if (data.length < 12 || accounts.length < 5) return null
      return {
        program: 'system',
        type: 'withdrawNonceAccount',
        nonceAccount: accounts[0]!,
        destination: accounts[1]!,
        nonceAuthority: accounts[4]!,
        lamports: readU64LE(data, 4),
      }
    }

    case SystemIx.InitializeNonceAccount: {
      // data: [4..36] pubkey nonceAuthority
      // accounts: [0] nonceAccount, [1] recentBlockhashes, [2] rent
      if (data.length < 36 || accounts.length < 1) return null
      return {
        program: 'system',
        type: 'initializeNonceAccount',
        nonceAccount: accounts[0]!,
        nonceAuthority: readAddress(data, 4),
      }
    }

    case SystemIx.AuthorizeNonceAccount: {
      // data: [4..36] pubkey newAuthority
      // accounts: [0] nonceAccount, [1] nonceAuthority
      if (data.length < 36 || accounts.length < 2) return null
      return {
        program: 'system',
        type: 'authorizeNonceAccount',
        nonceAccount: accounts[0]!,
        nonceAuthority: accounts[1]!,
        newAuthority: readAddress(data, 4),
      }
    }

    case SystemIx.TransferSolWithSeed: {
      // data: [4..12] u64 lamports, [12..] string sourceSeed (u32 len + bytes), then pubkey sourceProgramAddress
      // accounts: [0] source, [1] sourceBase, [2] destination
      if (data.length < 12 || accounts.length < 3) return null
      const seed = readString(data, 12)
      const offset = 12 + seed.bytesRead
      if (data.length < offset + 32) return null
      return {
        program: 'system',
        type: 'transferSolWithSeed',
        source: accounts[0]!,
        sourceBase: accounts[1]!,
        destination: accounts[2]!,
        lamports: readU64LE(data, 4),
        sourceSeed: seed.value,
        sourceProgramAddress: readAddress(data, offset),
      }
    }

    case SystemIx.UpgradeNonceAccount: {
      // No extra data. accounts: [0] nonceAccount
      if (accounts.length < 1) return null
      return {
        program: 'system',
        type: 'upgradeNonceAccount',
        nonceAccount: accounts[0]!,
      }
    }

    case SystemIx.AssignWithSeed: {
      // data: [4..36] pubkey base, [36..] string seed (u32 len + bytes), then pubkey programAddress
      // accounts: [0] account, [1] baseAccount
      if (data.length < 36 || accounts.length < 2) return null
      const base = readAddress(data, 4)
      const seed = readString(data, 36)
      const offset = 36 + seed.bytesRead
      if (data.length < offset + 32) return null
      return {
        program: 'system',
        type: 'assignWithSeed',
        account: accounts[0]!,
        base,
        seed: seed.value,
        programAddress: readAddress(data, offset),
      }
    }

    case SystemIx.AllocateWithSeed: {
      // data: [4..36] pubkey base, [36..] string seed (u32 len + bytes), then u64 space, pubkey programAddress
      // accounts: [0] account, [1] baseAccount
      if (data.length < 36 || accounts.length < 2) return null
      const base = readAddress(data, 4)
      const seed = readString(data, 36)
      const offset = 36 + seed.bytesRead
      if (data.length < offset + 40) return null // 8 + 32
      return {
        program: 'system',
        type: 'allocateWithSeed',
        account: accounts[0]!,
        base,
        seed: seed.value,
        space: readU64LE(data, offset),
        programAddress: readAddress(data, offset + 8),
      }
    }

    default:
      return null
  }
}
