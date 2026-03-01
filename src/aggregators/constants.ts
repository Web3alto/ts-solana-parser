export const AGGREGATOR_PROGRAM_IDS = {
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'jupiter',
} as const satisfies Record<string, string>

export type Aggregator = (typeof AGGREGATOR_PROGRAM_IDS)[keyof typeof AGGREGATOR_PROGRAM_IDS]
