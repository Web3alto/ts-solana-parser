import type { ComputeBudgetInstruction } from '../instruction-types.ts'

// Compute Budget program uses a single byte discriminator
enum ComputeBudgetIx {
  RequestHeapFrame = 0x01,
  SetComputeUnitLimit = 0x02,
  SetComputeUnitPrice = 0x03,
}

export function decodeComputeBudgetInstruction(data: Uint8Array, _accounts: string[]): ComputeBudgetInstruction | null {
  if (data.length < 1) return null

  const discriminator = data[0]!

  switch (discriminator) {
    case ComputeBudgetIx.RequestHeapFrame: {
      // [1..5] u32 LE bytes
      if (data.length < 5) return null
      const bytes = (data[1]! | (data[2]! << 8) | (data[3]! << 16) | (data[4]! << 24)) >>> 0
      return { program: 'compute-budget', type: 'requestHeapFrame', bytes }
    }

    case ComputeBudgetIx.SetComputeUnitLimit: {
      // [1..5] u32 LE units
      if (data.length < 5) return null
      const units = (data[1]! | (data[2]! << 8) | (data[3]! << 16) | (data[4]! << 24)) >>> 0
      return { program: 'compute-budget', type: 'setComputeUnitLimit', units }
    }

    case ComputeBudgetIx.SetComputeUnitPrice: {
      // [1..9] u64 LE microLamports
      if (data.length < 9) return null
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
      const microLamports = view.getBigUint64(1, true)
      return { program: 'compute-budget', type: 'setComputeUnitPrice', microLamports }
    }

    default:
      return null
  }
}
