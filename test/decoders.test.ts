import { describe, expect, test } from 'bun:test'
import { decodeComputeBudgetInstruction } from '../src/decoders/compute-budget.ts'
import { decodeATAInstruction, decodeMemoInstruction } from '../src/decoders/misc.ts'
import { decodeInstruction } from '../src/decoders/registry.ts'
import { decodeSystemInstruction } from '../src/decoders/system.ts'
import { decodeTokenInstruction } from '../src/decoders/token.ts'
import { encodeBase58 } from '../src/idl/codec.ts'

// Helper to access decoded instruction fields without `as any`
const f = (v: unknown) => v as Record<string, unknown>

// ── Helpers ──

function writeU32LE(buf: Uint8Array, value: number, offset: number) {
  buf[offset] = value & 0xff
  buf[offset + 1] = (value >> 8) & 0xff
  buf[offset + 2] = (value >> 16) & 0xff
  buf[offset + 3] = (value >> 24) & 0xff
}

function writeU64LE(buf: Uint8Array, value: bigint, offset: number) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  view.setBigUint64(offset, value, true)
}

// Fake 32-byte pubkey (fills with a repeating byte pattern)
function fakePubkey(seed: number): Uint8Array {
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) bytes[i] = (seed + i) & 0xff
  return bytes
}

// ── System decoder ──

describe('System decoder', () => {
  test('transferSol: decodes source, destination, lamports', () => {
    const data = new Uint8Array(12)
    writeU32LE(data, 2, 0) // instruction index = TransferSol
    writeU64LE(data, 1_500_000_000n, 4) // 1.5 SOL

    const source = 'SourcePubkey111111111111111111111111111111111'
    const dest = 'DestPubkey11111111111111111111111111111111111'

    const result = decodeSystemInstruction(data, [source, dest])

    expect(result).not.toBeNull()
    expect(result!.program).toBe('system')
    expect(result!.type).toBe('transferSol')
    expect(f(result).source).toBe(source)
    expect(f(result).destination).toBe(dest)
    expect(f(result).lamports).toBe(1_500_000_000n)
  })

  test('createAccount: decodes payer, newAccount, lamports, space, programAddress', () => {
    const programAddr = fakePubkey(42)
    const data = new Uint8Array(52)
    writeU32LE(data, 0, 0) // instruction index = CreateAccount
    writeU64LE(data, 2_000_000n, 4) // lamports
    writeU64LE(data, 165n, 12) // space
    data.set(programAddr, 20) // programAddress

    const payer = 'PayerPubkey1111111111111111111111111111111111'
    const newAcct = 'NewAccount11111111111111111111111111111111111'

    const result = decodeSystemInstruction(data, [payer, newAcct])

    expect(result).not.toBeNull()
    expect(result!.program).toBe('system')
    expect(result!.type).toBe('createAccount')
    expect(f(result).payer).toBe(payer)
    expect(f(result).newAccount).toBe(newAcct)
    expect(f(result).lamports).toBe(2_000_000n)
    expect(f(result).space).toBe(165n)
    expect(f(result).programAddress).toBe(encodeBase58(programAddr))
  })

  test('returns null for empty data', () => {
    expect(decodeSystemInstruction(new Uint8Array(0), ['a', 'b'])).toBeNull()
  })

  test('returns null for data too short (< 4 bytes)', () => {
    expect(decodeSystemInstruction(new Uint8Array([2, 0, 0]), ['a', 'b'])).toBeNull()
  })

  test('returns null for transferSol with insufficient accounts', () => {
    const data = new Uint8Array(12)
    writeU32LE(data, 2, 0)
    writeU64LE(data, 100n, 4)
    expect(decodeSystemInstruction(data, ['onlyone'])).toBeNull()
  })

  test('returns null for unknown instruction index', () => {
    const data = new Uint8Array(12)
    writeU32LE(data, 999, 0)
    expect(decodeSystemInstruction(data, ['a', 'b'])).toBeNull()
  })

  test('assign: decodes account and programAddress', () => {
    const programAddr = fakePubkey(10)
    const data = new Uint8Array(36)
    writeU32LE(data, 1, 0) // Assign
    data.set(programAddr, 4)

    const account = 'AssignAcct11111111111111111111111111111111111'
    const result = decodeSystemInstruction(data, [account])

    expect(result).not.toBeNull()
    expect(result!.type).toBe('assign')
    expect(f(result).account).toBe(account)
    expect(f(result).programAddress).toBe(encodeBase58(programAddr))
  })

  test('allocate: decodes account and space', () => {
    const data = new Uint8Array(12)
    writeU32LE(data, 8, 0) // Allocate
    writeU64LE(data, 1024n, 4)

    const account = 'AllocAcct11111111111111111111111111111111111'
    const result = decodeSystemInstruction(data, [account])

    expect(result).not.toBeNull()
    expect(result!.type).toBe('allocate')
    expect(f(result).account).toBe(account)
    expect(f(result).space).toBe(1024n)
  })

  test('advanceNonceAccount: decodes nonceAccount and nonceAuthority', () => {
    const data = new Uint8Array(4)
    writeU32LE(data, 4, 0) // AdvanceNonceAccount

    const nonce = 'NonceAcct11111111111111111111111111111111111'
    const sysvar = 'Sysvar111111111111111111111111111111111111111'
    const auth = 'NonceAuth11111111111111111111111111111111111'
    const result = decodeSystemInstruction(data, [nonce, sysvar, auth])

    expect(result).not.toBeNull()
    expect(result!.type).toBe('advanceNonceAccount')
    expect(f(result).nonceAccount).toBe(nonce)
    expect(f(result).nonceAuthority).toBe(auth)
  })

  test('upgradeNonceAccount: decodes nonceAccount', () => {
    const data = new Uint8Array(4)
    writeU32LE(data, 12, 0) // UpgradeNonceAccount

    const nonce = 'NonceAcct22222222222222222222222222222222222'
    const result = decodeSystemInstruction(data, [nonce])

    expect(result).not.toBeNull()
    expect(result!.type).toBe('upgradeNonceAccount')
    expect(f(result).nonceAccount).toBe(nonce)
  })
})

// ── Token decoder ──

describe('Token decoder', () => {
  const SPL_TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
  const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'

  test('transfer: decodes source, dest, authority, amount with SPL Token', () => {
    const data = new Uint8Array(9)
    data[0] = 3 // Transfer instruction
    writeU64LE(data, 500_000_000n, 1) // amount

    const source = 'SrcToken111111111111111111111111111111111111'
    const dest = 'DstToken111111111111111111111111111111111111'
    const authority = 'AuthPubk111111111111111111111111111111111111'

    const result = decodeTokenInstruction(SPL_TOKEN, data, [source, dest, authority])

    expect(result).not.toBeNull()
    expect(result!.program).toBe('spl-token')
    expect(result!.type).toBe('transfer')
    expect(f(result).source).toBe(source)
    expect(f(result).destination).toBe(dest)
    expect(f(result).authority).toBe(authority)
    expect(f(result).amount).toBe(500_000_000n)
  })

  test('transfer: decodes with Token-2022 program ID', () => {
    const data = new Uint8Array(9)
    data[0] = 3
    writeU64LE(data, 1_000n, 1)

    const source = 'SrcToken222222222222222222222222222222222222'
    const dest = 'DstToken222222222222222222222222222222222222'
    const authority = 'AuthPubk222222222222222222222222222222222222'

    const result = decodeTokenInstruction(TOKEN_2022, data, [source, dest, authority])

    expect(result).not.toBeNull()
    expect(result!.program).toBe('token-2022')
    expect(result!.type).toBe('transfer')
    expect(f(result).amount).toBe(1_000n)
  })

  test('transferChecked: decodes source, mint, dest, authority, amount, decimals', () => {
    const data = new Uint8Array(10)
    data[0] = 12 // TransferChecked
    writeU64LE(data, 999_999n, 1)
    data[9] = 6 // decimals

    const source = 'SrcTokenCk1111111111111111111111111111111111'
    const mint = 'MintPubkey1111111111111111111111111111111111'
    const dest = 'DstTokenCk1111111111111111111111111111111111'
    const authority = 'AuthPubkCk1111111111111111111111111111111111'

    const result = decodeTokenInstruction(SPL_TOKEN, data, [source, mint, dest, authority])

    expect(result).not.toBeNull()
    expect(result!.type).toBe('transferChecked')
    expect(f(result).source).toBe(source)
    expect(f(result).mint).toBe(mint)
    expect(f(result).destination).toBe(dest)
    expect(f(result).authority).toBe(authority)
    expect(f(result).amount).toBe(999_999n)
    expect(f(result).decimals).toBe(6)
  })

  test('closeAccount: decodes account, destination, authority', () => {
    const data = new Uint8Array(1)
    data[0] = 9 // CloseAccount

    const account = 'AcctClose11111111111111111111111111111111111'
    const dest = 'ClsDestPk11111111111111111111111111111111111'
    const authority = 'ClsAuthPk11111111111111111111111111111111111'

    const result = decodeTokenInstruction(SPL_TOKEN, data, [account, dest, authority])

    expect(result).not.toBeNull()
    expect(result!.type).toBe('closeAccount')
    expect(f(result).account).toBe(account)
    expect(f(result).destination).toBe(dest)
    expect(f(result).authority).toBe(authority)
  })

  test('returns null for empty data', () => {
    expect(decodeTokenInstruction(SPL_TOKEN, new Uint8Array(0), ['a', 'b', 'c'])).toBeNull()
  })

  test('returns null for unknown program ID', () => {
    const data = new Uint8Array(9)
    data[0] = 3
    writeU64LE(data, 100n, 1)
    expect(decodeTokenInstruction('UnknownProg111111111111111111111111111111', data, ['a', 'b', 'c'])).toBeNull()
  })

  test('returns null for transfer with insufficient accounts', () => {
    const data = new Uint8Array(9)
    data[0] = 3
    writeU64LE(data, 100n, 1)
    expect(decodeTokenInstruction(SPL_TOKEN, data, ['a', 'b'])).toBeNull()
  })

  test('approve: decodes source, delegate, authority, amount', () => {
    const data = new Uint8Array(9)
    data[0] = 4 // Approve
    writeU64LE(data, 10_000n, 1)

    const source = 'ApproveSrc1111111111111111111111111111111111'
    const delegate = 'Delegate111111111111111111111111111111111111'
    const authority = 'ApproveAuth111111111111111111111111111111111'

    const result = decodeTokenInstruction(SPL_TOKEN, data, [source, delegate, authority])

    expect(result).not.toBeNull()
    expect(result!.type).toBe('approve')
    expect(f(result).source).toBe(source)
    expect(f(result).delegate).toBe(delegate)
    expect(f(result).authority).toBe(authority)
    expect(f(result).amount).toBe(10_000n)
  })

  test('burn: decodes account, mint, authority, amount', () => {
    const data = new Uint8Array(9)
    data[0] = 8 // Burn
    writeU64LE(data, 777n, 1)

    const account = 'BurnAcct111111111111111111111111111111111111'
    const mint = 'BurnMint111111111111111111111111111111111111'
    const authority = 'BurnAuth111111111111111111111111111111111111'

    const result = decodeTokenInstruction(SPL_TOKEN, data, [account, mint, authority])

    expect(result).not.toBeNull()
    expect(result!.type).toBe('burn')
    expect(f(result).account).toBe(account)
    expect(f(result).mint).toBe(mint)
    expect(f(result).authority).toBe(authority)
    expect(f(result).amount).toBe(777n)
  })

  test('mintTo: decodes mint, account, authority, amount', () => {
    const data = new Uint8Array(9)
    data[0] = 7 // MintTo
    writeU64LE(data, 1_000_000n, 1)

    const mint = 'MintToMint11111111111111111111111111111111111'
    const account = 'MintToAcct1111111111111111111111111111111111'
    const authority = 'MintToAuth1111111111111111111111111111111111'

    const result = decodeTokenInstruction(SPL_TOKEN, data, [mint, account, authority])

    expect(result).not.toBeNull()
    expect(result!.type).toBe('mintTo')
    expect(f(result).mint).toBe(mint)
    expect(f(result).account).toBe(account)
    expect(f(result).amount).toBe(1_000_000n)
  })

  test('syncNative: decodes account', () => {
    const data = new Uint8Array(1)
    data[0] = 17 // SyncNative

    const account = 'SyncAcct111111111111111111111111111111111111'
    const result = decodeTokenInstruction(SPL_TOKEN, data, [account])

    expect(result).not.toBeNull()
    expect(result!.type).toBe('syncNative')
    expect(f(result).account).toBe(account)
  })
})

// ── ComputeBudget decoder ──

describe('ComputeBudget decoder', () => {
  test('setComputeUnitLimit: decodes units', () => {
    const data = new Uint8Array(5)
    data[0] = 2 // SetComputeUnitLimit
    writeU32LE(data, 400_000, 1)

    const result = decodeComputeBudgetInstruction(data, [])

    expect(result).not.toBeNull()
    expect(result!.program).toBe('compute-budget')
    expect(result!.type).toBe('setComputeUnitLimit')
    expect(f(result).units).toBe(400_000)
  })

  test('setComputeUnitPrice: decodes microLamports', () => {
    const data = new Uint8Array(9)
    data[0] = 3 // SetComputeUnitPrice
    writeU64LE(data, 50_000n, 1)

    const result = decodeComputeBudgetInstruction(data, [])

    expect(result).not.toBeNull()
    expect(result!.program).toBe('compute-budget')
    expect(result!.type).toBe('setComputeUnitPrice')
    expect(f(result).microLamports).toBe(50_000n)
  })

  test('requestHeapFrame: decodes bytes', () => {
    const data = new Uint8Array(5)
    data[0] = 1 // RequestHeapFrame
    writeU32LE(data, 256 * 1024, 1) // 256 KiB

    const result = decodeComputeBudgetInstruction(data, [])

    expect(result).not.toBeNull()
    expect(result!.type).toBe('requestHeapFrame')
    expect(f(result).bytes).toBe(256 * 1024)
  })

  test('returns null for empty data', () => {
    expect(decodeComputeBudgetInstruction(new Uint8Array(0), [])).toBeNull()
  })

  test('returns null for unknown discriminator', () => {
    const data = new Uint8Array([0xff])
    expect(decodeComputeBudgetInstruction(data, [])).toBeNull()
  })

  test('returns null for setComputeUnitLimit with insufficient data', () => {
    const data = new Uint8Array([2, 0]) // only 2 bytes, need 5
    expect(decodeComputeBudgetInstruction(data, [])).toBeNull()
  })
})

// ── ATA decoder ──

describe('ATA decoder', () => {
  const DEFAULT_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

  test('create: empty data (discriminator 0) decodes payer, account, owner, mint', () => {
    const data = new Uint8Array(0) // empty = discriminator 0

    const payer = 'ATAPayer111111111111111111111111111111111111'
    const account = 'ATAAcct1111111111111111111111111111111111111'
    const owner = 'ATAOwner111111111111111111111111111111111111'
    const mint = 'ATAMint1111111111111111111111111111111111111'
    const systemProg = '11111111111111111111111111111111'
    const tokenProg = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

    const result = decodeATAInstruction(data, [payer, account, owner, mint, systemProg, tokenProg])

    expect(result).not.toBeNull()
    expect(result!.program).toBe('associated-token-account')
    expect(result!.type).toBe('create')
    expect(f(result).payer).toBe(payer)
    expect(f(result).account).toBe(account)
    expect(f(result).owner).toBe(owner)
    expect(f(result).mint).toBe(mint)
    expect(f(result).tokenProgram).toBe(tokenProg)
  })

  test('create: data[0]=0 also works', () => {
    const data = new Uint8Array([0])

    const accounts = [
      'ATAPayer222222222222222222222222222222222222',
      'ATAAcct2222222222222222222222222222222222222',
      'ATAOwner222222222222222222222222222222222222',
      'ATAMint2222222222222222222222222222222222222',
      '11111111111111111111111111111111',
      DEFAULT_TOKEN_PROGRAM,
    ]

    const result = decodeATAInstruction(data, accounts)

    expect(result).not.toBeNull()
    expect(result!.type).toBe('create')
  })

  test('createIdempotent: data[0]=1', () => {
    const data = new Uint8Array([1])

    const payer = 'IdempPayer1111111111111111111111111111111111'
    const account = 'IdempAcct11111111111111111111111111111111111'
    const owner = 'IdempOwner1111111111111111111111111111111111'
    const mint = 'IdempMint11111111111111111111111111111111111'
    const systemProg = '11111111111111111111111111111111'
    const tokenProg = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'

    const result = decodeATAInstruction(data, [payer, account, owner, mint, systemProg, tokenProg])

    expect(result).not.toBeNull()
    expect(result!.type).toBe('createIdempotent')
    expect(f(result).payer).toBe(payer)
    expect(f(result).account).toBe(account)
    expect(f(result).owner).toBe(owner)
    expect(f(result).mint).toBe(mint)
    expect(f(result).tokenProgram).toBe(tokenProg)
  })

  test('create defaults tokenProgram when accounts[5] is missing', () => {
    const data = new Uint8Array(0)
    const accounts = [
      'ATAPayer333333333333333333333333333333333333',
      'ATAAcct3333333333333333333333333333333333333',
      'ATAOwner333333333333333333333333333333333333',
      'ATAMint3333333333333333333333333333333333333',
      '11111111111111111111111111111111',
    ]

    const result = decodeATAInstruction(data, accounts)

    expect(result).not.toBeNull()
    expect(f(result).tokenProgram).toBe(DEFAULT_TOKEN_PROGRAM)
  })

  test('returns null for insufficient accounts', () => {
    const data = new Uint8Array(0)
    expect(decodeATAInstruction(data, ['a', 'b', 'c'])).toBeNull()
  })

  test('returns null for unknown discriminator', () => {
    const data = new Uint8Array([99])
    expect(decodeATAInstruction(data, ['a', 'b', 'c', 'd', 'e', 'f'])).toBeNull()
  })
})

// ── Memo decoder ──

describe('Memo decoder', () => {
  test('decodes UTF-8 message and returns signers', () => {
    const message = 'Hello, Solana!'
    const data = new TextEncoder().encode(message)
    const signers = ['Signer1111111111111111111111111111111111111', 'Signer2222222222222222222222222222222222222']

    const result = decodeMemoInstruction(data, signers)

    expect(result.program).toBe('memo')
    expect(result.type).toBe('memo')
    expect(result.message).toBe('Hello, Solana!')
    expect(result.signers).toEqual(signers)
  })

  test('handles empty memo', () => {
    const result = decodeMemoInstruction(new Uint8Array(0), [])

    expect(result.program).toBe('memo')
    expect(result.type).toBe('memo')
    expect(result.message).toBe('')
    expect(result.signers).toEqual([])
  })

  test('handles unicode message', () => {
    const message = 'Swap confirmed \u2713'
    const data = new TextEncoder().encode(message)

    const result = decodeMemoInstruction(data, ['signer1'])

    expect(result.message).toBe(message)
  })
})

// ── Registry ──

describe('Decoder registry', () => {
  const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111'
  const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
  const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
  const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111'
  const ATA_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
  const MEMO_V2_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'

  test('system program ID dispatches to SystemInstruction', () => {
    const data = new Uint8Array(12)
    writeU32LE(data, 2, 0) // TransferSol
    writeU64LE(data, 1000n, 4)
    const dataBase58 = encodeBase58(data)

    const source = 'RegSrcPubk1111111111111111111111111111111111'
    const dest = 'RegDstPubk1111111111111111111111111111111111'

    const result = decodeInstruction(SYSTEM_PROGRAM_ID, dataBase58, [source, dest])

    expect(result.program).toBe('system')
    expect(f(result).type).toBe('transferSol')
    expect(f(result).source).toBe(source)
    expect(f(result).lamports).toBe(1000n)
  })

  test('token program ID dispatches to TokenInstruction', () => {
    const data = new Uint8Array(9)
    data[0] = 3 // Transfer
    writeU64LE(data, 42n, 1)
    const dataBase58 = encodeBase58(data)

    const result = decodeInstruction(TOKEN_PROGRAM_ID, dataBase58, ['a', 'b', 'c'])

    expect(result.program).toBe('spl-token')
    expect(f(result).type).toBe('transfer')
    expect(f(result).amount).toBe(42n)
  })

  test('token-2022 program ID dispatches to TokenInstruction with token-2022 program', () => {
    const data = new Uint8Array(9)
    data[0] = 3 // Transfer
    writeU64LE(data, 100n, 1)
    const dataBase58 = encodeBase58(data)

    const result = decodeInstruction(TOKEN_2022_PROGRAM_ID, dataBase58, ['a', 'b', 'c'])

    expect(result.program).toBe('token-2022')
    expect(f(result).type).toBe('transfer')
  })

  test('compute budget program ID dispatches to ComputeBudgetInstruction', () => {
    const data = new Uint8Array(5)
    data[0] = 2 // SetComputeUnitLimit
    writeU32LE(data, 200_000, 1)
    const dataBase58 = encodeBase58(data)

    const result = decodeInstruction(COMPUTE_BUDGET_PROGRAM_ID, dataBase58, [])

    expect(result.program).toBe('compute-budget')
    expect(f(result).type).toBe('setComputeUnitLimit')
    expect(f(result).units).toBe(200_000)
  })

  test('ATA program ID dispatches to ATAInstruction', () => {
    const data = new Uint8Array([1]) // createIdempotent
    const dataBase58 = encodeBase58(data)

    const accounts = ['payer', 'acct', 'owner', 'mint', 'sys', 'tok']
    const result = decodeInstruction(ATA_PROGRAM_ID, dataBase58, accounts)

    expect(result.program).toBe('associated-token-account')
    expect(f(result).type).toBe('createIdempotent')
  })

  test('memo program ID dispatches to MemoInstruction', () => {
    const data = new TextEncoder().encode('test memo')
    const dataBase58 = encodeBase58(data)

    const result = decodeInstruction(MEMO_V2_PROGRAM_ID, dataBase58, ['signer1'])

    expect(result.program).toBe('memo')
    expect(f(result).type).toBe('memo')
    expect(f(result).message).toBe('test memo')
  })

  test('unknown program ID returns UnknownInstruction', () => {
    const dataBase58 = encodeBase58(new Uint8Array([1, 2, 3]))

    const result = decodeInstruction('SomeUnknownProg111111111111111111111111111', dataBase58, ['acc1', 'acc2'])

    expect(result.program).toBe('unknown')
    expect(f(result).programId).toBe('SomeUnknownProg111111111111111111111111111')
    expect(f(result).accounts).toEqual(['acc1', 'acc2'])
    expect(f(result).data).toBe(dataBase58)
  })

  test('system program with undecodable instruction returns UnknownInstruction', () => {
    // data with unknown instruction index but valid system program ID
    const data = new Uint8Array(4)
    writeU32LE(data, 999, 0) // unknown system instruction
    const dataBase58 = encodeBase58(data)

    const result = decodeInstruction(SYSTEM_PROGRAM_ID, dataBase58, ['a'])

    expect(result.program).toBe('unknown')
    expect(f(result).programId).toBe(SYSTEM_PROGRAM_ID)
  })
})
