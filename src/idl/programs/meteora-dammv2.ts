import { createMeteoraParser } from './meteora-common.ts'

export const meteoraDammv2Parser = createMeteoraParser({
  programId: 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG',
  layout: {
    inputTokenAccountIndex: 2,
    mintAIndex: 6,
    mintBIndex: 7,
    payerIndex: 8,
  },
  buyType: 'meteora-dammv2-buy',
  sellType: 'meteora-dammv2-sell',
})
