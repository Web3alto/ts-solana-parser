import { createMeteoraParser } from './meteora-common.ts'

export const meteoraDbcParser = createMeteoraParser({
  programId: 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN',
  layout: {
    inputTokenAccountIndex: 3,
    mintAIndex: 7,
    mintBIndex: 8,
    payerIndex: 9,
  },
  buyType: 'meteora-dbc-buy',
  sellType: 'meteora-dbc-sell',
})
