import type { ATAInstruction, MemoInstruction } from '../instruction-types.ts'

const DEFAULT_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

const textDecoder = new TextDecoder()

export function decodeATAInstruction(data: Uint8Array, accounts: string[]): ATAInstruction | null {
  const discriminator = data.length === 0 ? 0 : data[0]

  switch (discriminator) {
    // create
    case 0: {
      if (!accounts[0] || !accounts[1] || !accounts[2] || !accounts[3]) return null
      const tokenProgram = accounts[5] ?? DEFAULT_TOKEN_PROGRAM
      return {
        program: 'associated-token-account',
        type: 'create',
        payer: accounts[0],
        account: accounts[1],
        owner: accounts[2],
        mint: accounts[3],
        tokenProgram,
      }
    }

    // createIdempotent
    case 1: {
      if (!accounts[0] || !accounts[1] || !accounts[2] || !accounts[3]) return null
      const tokenProgram = accounts[5] ?? DEFAULT_TOKEN_PROGRAM
      return {
        program: 'associated-token-account',
        type: 'createIdempotent',
        payer: accounts[0],
        account: accounts[1],
        owner: accounts[2],
        mint: accounts[3],
        tokenProgram,
      }
    }

    // recoverNested
    case 2: {
      if (!accounts[0] || !accounts[1] || !accounts[2] || !accounts[3] || !accounts[4] || !accounts[5] || !accounts[6])
        return null
      return {
        program: 'associated-token-account',
        type: 'recoverNested',
        nestedAccount: accounts[0],
        nestedMint: accounts[1],
        destinationAccount: accounts[2],
        ownerMint: accounts[3],
        ownerAccount: accounts[4],
        owner: accounts[5],
        tokenProgram: accounts[6],
      }
    }

    default:
      return null
  }
}

export function decodeMemoInstruction(data: Uint8Array, accounts: string[]): MemoInstruction {
  return {
    program: 'memo',
    type: 'memo',
    message: textDecoder.decode(data),
    signers: accounts,
  }
}
