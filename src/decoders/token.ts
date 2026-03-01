import { encodeBase58, readU64LE } from '../idl/codec.ts'
import type { TokenInstruction } from '../instruction-types.ts'

const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'

const AUTHORITY_TYPES: Record<number, string> = {
  0: 'mintTokens',
  1: 'freezeAccount',
  2: 'accountOwner',
  3: 'closeAccount',
}

const utf8Decoder = new TextDecoder()

function readPubkey(data: Uint8Array, offset: number): string {
  return encodeBase58(data.subarray(offset, offset + 32))
}

export function decodeTokenInstruction(
  programId: string,
  data: Uint8Array,
  accounts: string[],
): TokenInstruction | null {
  if (data.length === 0) return null

  // Only handle known token programs
  if (programId !== SPL_TOKEN_PROGRAM && programId !== TOKEN_2022_PROGRAM) return null

  const program: 'spl-token' | 'token-2022' = programId === TOKEN_2022_PROGRAM ? 'token-2022' : 'spl-token'

  const instruction = data[0]

  switch (instruction) {
    // InitializeMint
    case 0: {
      if (data.length < 35 || !accounts[0]) return null
      const decimals = data[1]!
      const mintAuthority = readPubkey(data, 2)
      const hasFreeze = data[34]
      const freezeAuthority = hasFreeze === 1 && data.length >= 67 ? readPubkey(data, 35) : null
      return { program, type: 'initializeMint', mint: accounts[0], decimals, mintAuthority, freezeAuthority }
    }

    // InitializeAccount
    case 1: {
      if (!accounts[0] || !accounts[1] || !accounts[2]) return null
      return { program, type: 'initializeAccount', account: accounts[0], mint: accounts[1], owner: accounts[2] }
    }

    // Transfer
    case 3: {
      if (data.length < 9 || !accounts[0] || !accounts[1] || !accounts[2]) return null
      const amount = readU64LE(data, 1)
      return {
        program,
        type: 'transfer',
        source: accounts[0],
        destination: accounts[1],
        authority: accounts[2],
        amount,
      }
    }

    // Approve
    case 4: {
      if (data.length < 9 || !accounts[0] || !accounts[1] || !accounts[2]) return null
      const amount = readU64LE(data, 1)
      return { program, type: 'approve', source: accounts[0], delegate: accounts[1], authority: accounts[2], amount }
    }

    // Revoke
    case 5: {
      if (!accounts[0] || !accounts[1]) return null
      return { program, type: 'revoke', source: accounts[0], authority: accounts[1] }
    }

    // SetAuthority
    case 6: {
      if (data.length < 3 || !accounts[0] || !accounts[1]) return null
      const authorityType = AUTHORITY_TYPES[data[1]!] ?? `unknown(${data[1]})`
      const hasNewAuthority = data[2]
      const newAuthority = hasNewAuthority === 1 && data.length >= 35 ? readPubkey(data, 3) : null
      return {
        program,
        type: 'setAuthority',
        account: accounts[0],
        authority: accounts[1],
        authorityType,
        newAuthority,
      }
    }

    // MintTo
    case 7: {
      if (data.length < 9 || !accounts[0] || !accounts[1] || !accounts[2]) return null
      const amount = readU64LE(data, 1)
      return { program, type: 'mintTo', mint: accounts[0], account: accounts[1], authority: accounts[2], amount }
    }

    // Burn
    case 8: {
      if (data.length < 9 || !accounts[0] || !accounts[1] || !accounts[2]) return null
      const amount = readU64LE(data, 1)
      return { program, type: 'burn', account: accounts[0], mint: accounts[1], authority: accounts[2], amount }
    }

    // CloseAccount
    case 9: {
      if (!accounts[0] || !accounts[1] || !accounts[2]) return null
      return { program, type: 'closeAccount', account: accounts[0], destination: accounts[1], authority: accounts[2] }
    }

    // FreezeAccount
    case 10: {
      if (!accounts[0] || !accounts[1] || !accounts[2]) return null
      return { program, type: 'freezeAccount', account: accounts[0], mint: accounts[1], authority: accounts[2] }
    }

    // ThawAccount
    case 11: {
      if (!accounts[0] || !accounts[1] || !accounts[2]) return null
      return { program, type: 'thawAccount', account: accounts[0], mint: accounts[1], authority: accounts[2] }
    }

    // TransferChecked
    case 12: {
      if (data.length < 10 || !accounts[0] || !accounts[1] || !accounts[2] || !accounts[3]) return null
      const amount = readU64LE(data, 1)
      const decimals = data[9]!
      return {
        program,
        type: 'transferChecked',
        source: accounts[0],
        mint: accounts[1],
        destination: accounts[2],
        authority: accounts[3],
        amount,
        decimals,
      }
    }

    // ApproveChecked
    case 13: {
      if (data.length < 10 || !accounts[0] || !accounts[1] || !accounts[2] || !accounts[3]) return null
      const amount = readU64LE(data, 1)
      const decimals = data[9]!
      return {
        program,
        type: 'approveChecked',
        source: accounts[0],
        mint: accounts[1],
        delegate: accounts[2],
        authority: accounts[3],
        amount,
        decimals,
      }
    }

    // MintToChecked
    case 14: {
      if (data.length < 10 || !accounts[0] || !accounts[1] || !accounts[2]) return null
      const amount = readU64LE(data, 1)
      const decimals = data[9]!
      return {
        program,
        type: 'mintToChecked',
        mint: accounts[0],
        account: accounts[1],
        authority: accounts[2],
        amount,
        decimals,
      }
    }

    // BurnChecked
    case 15: {
      if (data.length < 10 || !accounts[0] || !accounts[1] || !accounts[2]) return null
      const amount = readU64LE(data, 1)
      const decimals = data[9]!
      return {
        program,
        type: 'burnChecked',
        account: accounts[0],
        mint: accounts[1],
        authority: accounts[2],
        amount,
        decimals,
      }
    }

    // SyncNative
    case 17: {
      if (!accounts[0]) return null
      return { program, type: 'syncNative', account: accounts[0] }
    }

    // InitializeAccount3
    case 18: {
      if (data.length < 33 || !accounts[0] || !accounts[1]) return null
      const owner = readPubkey(data, 1)
      return { program, type: 'initializeAccount3', account: accounts[0], mint: accounts[1], owner }
    }

    // InitializeAccount2
    case 20: {
      if (data.length < 33 || !accounts[0] || !accounts[1]) return null
      const owner = readPubkey(data, 1)
      return { program, type: 'initializeAccount2', account: accounts[0], mint: accounts[1], owner }
    }

    // InitializeMint2
    case 21: {
      if (data.length < 35 || !accounts[0]) return null
      const decimals = data[1]!
      const mintAuthority = readPubkey(data, 2)
      const hasFreeze = data[34]
      const freezeAuthority = hasFreeze === 1 && data.length >= 67 ? readPubkey(data, 35) : null
      return { program, type: 'initializeMint2', mint: accounts[0], decimals, mintAuthority, freezeAuthority }
    }

    // InitializeImmutableOwner
    case 22: {
      if (!accounts[0]) return null
      return { program: 'token-2022' as const, type: 'initializeImmutableOwner', account: accounts[0] }
    }

    // AmountToUiAmount
    case 23: {
      if (data.length < 9 || !accounts[0]) return null
      const amount = readU64LE(data, 1)
      return { program: 'token-2022' as const, type: 'amountToUiAmount', mint: accounts[0], amount }
    }

    // UiAmountToAmount
    case 24: {
      if (data.length < 2 || !accounts[0]) return null
      const uiAmount = utf8Decoder.decode(data.subarray(1))
      return { program: 'token-2022' as const, type: 'uiAmountToAmount', mint: accounts[0], uiAmount }
    }

    // InitializeMintCloseAuthority
    case 25: {
      if (data.length < 2 || !accounts[0]) return null
      const hasAuthority = data[1]
      const closeAuthority = hasAuthority === 1 && data.length >= 34 ? readPubkey(data, 2) : null
      return {
        program: 'token-2022' as const,
        type: 'initializeMintCloseAuthority',
        mint: accounts[0],
        closeAuthority,
      }
    }

    // TransferFeeExtension
    case 26: {
      if (data.length < 2) return null
      const subInstruction = data[1]
      switch (subInstruction) {
        // InitializeTransferFeeConfig
        case 0: {
          if (data.length < 44 || !accounts[0]) return null
          const hasConfigAuth = data[2]
          const transferFeeConfigAuthority = hasConfigAuth === 1 && data.length >= 35 ? readPubkey(data, 3) : null
          const configAuthOffset = 35
          const hasWithdrawAuth = data[configAuthOffset]
          const withdrawWithheldAuthority =
            hasWithdrawAuth === 1 && data.length >= configAuthOffset + 33
              ? readPubkey(data, configAuthOffset + 1)
              : null
          const feeDataOffset = configAuthOffset + 33
          const transferFeeBasisPoints = data[feeDataOffset]! | (data[feeDataOffset + 1]! << 8)
          const maximumFee = readU64LE(data, feeDataOffset + 2)
          return {
            program: 'token-2022' as const,
            type: 'initializeTransferFeeConfig',
            mint: accounts[0],
            transferFeeConfigAuthority,
            withdrawWithheldAuthority,
            transferFeeBasisPoints,
            maximumFee,
          }
        }
        // TransferCheckedWithFee
        case 1: {
          if (data.length < 28 || !accounts[0] || !accounts[1] || !accounts[2] || !accounts[3]) return null
          const amount = readU64LE(data, 2)
          const decimals = data[10]!
          const fee = readU64LE(data, 11)
          return {
            program: 'token-2022' as const,
            type: 'transferCheckedWithFee',
            source: accounts[0],
            mint: accounts[1],
            destination: accounts[2],
            authority: accounts[3],
            amount,
            decimals,
            fee,
          }
        }
        // WithdrawWithheldTokensFromMint
        case 2: {
          if (!accounts[0] || !accounts[1] || !accounts[2]) return null
          return {
            program: 'token-2022' as const,
            type: 'withdrawWithheldTokensFromMint',
            mint: accounts[0],
            destination: accounts[1],
            authority: accounts[2],
          }
        }
        // WithdrawWithheldTokensFromAccounts
        case 3: {
          if (!accounts[0] || !accounts[1] || !accounts[2]) return null
          const sources = accounts.slice(3)
          return {
            program: 'token-2022' as const,
            type: 'withdrawWithheldTokensFromAccounts',
            mint: accounts[0],
            destination: accounts[1],
            authority: accounts[2],
            sources,
          }
        }
        // HarvestWithheldTokensToMint
        case 4: {
          if (!accounts[0]) return null
          const sources = accounts.slice(1)
          return {
            program: 'token-2022' as const,
            type: 'harvestWithheldTokensToMint',
            mint: accounts[0],
            sources,
          }
        }
        default:
          return null
      }
    }

    // InitializeDefaultAccountState
    case 35: {
      if (data.length < 2 || !accounts[0]) return null
      const state = data[1]!
      return { program: 'token-2022' as const, type: 'initializeDefaultAccountState', mint: accounts[0], state }
    }

    // UpdateDefaultAccountState
    case 36: {
      if (data.length < 2 || !accounts[0] || !accounts[1]) return null
      const state = data[1]!
      return {
        program: 'token-2022' as const,
        type: 'updateDefaultAccountState',
        mint: accounts[0],
        authority: accounts[1],
        state,
      }
    }

    // Reallocate
    case 37: {
      if (data.length < 2 || !accounts[0] || !accounts[1] || !accounts[2]) return null
      const extensionTypes: number[] = []
      for (let i = 1; i < data.length; i += 2) {
        if (i + 1 < data.length) {
          extensionTypes.push(data[i]! | (data[i + 1]! << 8))
        }
      }
      return {
        program: 'token-2022' as const,
        type: 'reallocate',
        account: accounts[0],
        payer: accounts[1],
        authority: accounts[2],
        extensionTypes,
      }
    }

    // MemoTransfer
    case 38: {
      if (data.length < 2 || !accounts[0] || !accounts[1]) return null
      const subInstruction = data[1]
      if (subInstruction === 0) {
        return {
          program: 'token-2022' as const,
          type: 'enableMemoTransfer',
          account: accounts[0],
          authority: accounts[1],
        }
      }
      if (subInstruction === 1) {
        return {
          program: 'token-2022' as const,
          type: 'disableMemoTransfer',
          account: accounts[0],
          authority: accounts[1],
        }
      }
      return null
    }

    // CreateNativeMint
    case 39: {
      if (!accounts[0] || !accounts[1]) return null
      return { program: 'token-2022' as const, type: 'createNativeMint', payer: accounts[0], nativeMint: accounts[1] }
    }

    default:
      return null
  }
}
