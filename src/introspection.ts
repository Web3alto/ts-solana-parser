import { Protocol, TIP_ADDRESS_TO_PROVIDER, type TipProvider } from './constants.ts'

const _protocols: readonly Protocol[] = Object.freeze(Object.values(Protocol))
const _tipProviders: readonly TipProvider[] = Object.freeze([...new Set(Object.values(TIP_ADDRESS_TO_PROVIDER))])

/** Returns all DEX protocols the parser can detect. */
export function getSupportedProtocols(): readonly Protocol[] {
  return _protocols
}

/** Returns all tip providers the parser can identify. */
export function getSupportedTipProviders(): readonly TipProvider[] {
  return _tipProviders
}
