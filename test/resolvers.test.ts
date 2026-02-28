import { describe, expect, test } from 'bun:test'
import { createRpcBackedParserOptions } from '../src/resolvers.ts'

function buildLookupData(addressBytes: Uint8Array[]): string {
  const header = new Uint8Array(56)
  const body = new Uint8Array(addressBytes.length * 32)
  for (let i = 0; i < addressBytes.length; i++) {
    body.set(addressBytes[i]!, i * 32)
  }
  const data = new Uint8Array(header.length + body.length)
  data.set(header)
  data.set(body, header.length)
  return Buffer.from(data).toString('base64')
}

function addressByte(seed: number): Uint8Array {
  const out = new Uint8Array(32)
  out.fill(seed)
  return out
}

describe('createRpcBackedParserOptions', () => {
  test('warms and resolves lookup table addresses from RPC', async () => {
    const altAccount = 'Lookup1111111111111111111111111111111111111'
    const encodedData = buildLookupData([addressByte(7), addressByte(9), addressByte(11)])

    const fetcher = async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          value: {
            owner: 'AddressLookupTab1e1111111111111111111111111',
            data: [encodedData, 'base64'],
          },
        },
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    const parserOptions = createRpcBackedParserOptions({
      rpcUrl: 'https://example-rpc.local',
      fetcher,
    })

    expect(
      parserOptions.resolveAddressTableLookups?.([
        {
          accountKey: altAccount,
          writableIndexes: [0, 2],
          readonlyIndexes: [1],
        },
      ]),
    ).toBeNull()

    await parserOptions.warmAddressLookupTables([altAccount])

    const resolved = parserOptions.resolveAddressTableLookups?.([
      {
        accountKey: altAccount,
        writableIndexes: [0, 2],
        readonlyIndexes: [1],
      },
    ])

    expect(resolved).not.toBeNull()
    expect(resolved?.writable.length).toBe(2)
    expect(resolved?.readonly.length).toBe(1)
  })

  test('rejects ALT owner mismatch and reports error', async () => {
    const altAccount = 'Lookup1111111111111111111111111111111111111'
    const encodedData = buildLookupData([addressByte(7)])
    let sawError = false

    const fetcher = async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          value: {
            owner: '11111111111111111111111111111111',
            data: [encodedData, 'base64'],
          },
        },
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    const parserOptions = createRpcBackedParserOptions({
      rpcUrl: 'https://example-rpc.local',
      fetcher,
      onError: () => {
        sawError = true
      },
      retries: 0,
    })

    await expect(parserOptions.warmAddressLookupTables([altAccount])).rejects.toThrow()
    expect(sawError).toBe(true)
  })
})
