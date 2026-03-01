# Changelog

All notable changes to this project are documented in this file.

## [1.0.0] - 2026-03-01

### Breaking Changes

- **Removed** deprecated `token2022TransferFeeBps` field from `ParsedSwap`
- **Removed** `inputToken2022TransferFeeBps` / `outputToken2022TransferFeeBps` placeholder fields from `ParsedSwap`
- **Removed** `resolveToken2022TransferFeeBps` callback from `ParserOptions`
- **Renamed** all `WarningCode` values from kebab-case to SCREAMING_SNAKE_CASE (e.g., `multi-hop-route` → `MULTI_HOP_ROUTE`)

### Added

- `AccountKey` and `InnerInstructionSet` type exports from public API
- JSDoc documentation on all public functions and key types
- `onInternalError` callback invoked on `parseFullTransaction` failure paths (previously returned `null` silently)
- Unit tests for balance module (`buildOwnerTokenState`, `computeTokenChanges`, `computeSolChange`, `mergeChanges`, `selectInputOutputChanges`)
- Unit tests for IDL scoring module (`selectBestIdlCandidate`, `countRouteHops`, `approximatelyEqualBigInt`, `resolveTokenPrograms`)
- Tests for `parseFullSwapTransaction`
- MIT `LICENSE` file
- `package.json` metadata: `license`, `repository`, `homepage`, `bugs`, `keywords`, `author`, `engines`

### Fixed

- Misleading comments in `lib.ts` barrel exports (correctly documents which functions validate with Zod)

## [0.9.4] - 2026-03-01

### Changed

- Removed all unused code, dead re-exports, and debug artifacts

## [0.9.3] - 2026-03-01

### Changed

- Hardened Zod validation schemas for release readiness
- General code quality cleanup

## [0.9.2] - 2026-03-01

### Added

- MEV tip detection with 12 providers and 108 known tip addresses (Jito, Temporal, NextBlock, BloxRoute, ZeroSlot, BlockRazor, Helius, Astralane, Stellium, Flashblock, Node1, Falcon)
- Tip detection integrated into both `ParsedSwap` and `FullTransactionResult`
- Tip detection test suite

### Changed

- Hot path optimizations: hoisted regex, eliminated closure allocations, used subarray

## [0.9.1] - 2026-03-01

### Added

- Zod validation added to `parseTransaction` and `parseFullTransaction`
- Benchmark script for all parser functions

### Changed

- Extracted shared utilities, eliminated code duplication

## [0.9.0] - 2026-03-01

### Added

- Full transaction instruction decoding (System, Token, Compute Budget, ATA, Memo programs)
- `parseFullTransaction` and `parseFullSwapTransaction` APIs
- Replaced hand-rolled transaction deserialization with `@solana/kit` codecs

## [0.8.0] - 2026-03-01

### Added

- Raydium AMM v4 protocol support (9th protocol)
- Meteora DAMM v1 protocol support (10th protocol)

## [0.7.0] - 2026-03-01

### Added

- Meteora DLMM protocol support (8th protocol)

## [0.6.2] - 2026-03-01

### Changed

- Removed streaming subsystem — library is now parsing-only

## [0.6.1] - 2026-03-01

### Added

- Raydium CLMM test coverage

## [0.6.0] - 2026-03-01

### Added

- Raydium CLMM protocol support with `swap` and `swap_v2` instructions (7th protocol)

## [0.5.0] - 2026-03-01

### Added

- Batch transaction parsing API: `parseSwaps` and `parseSwapsDetailed`
- Address lookup table pre-warming for batch operations

## [0.4.5] - 2026-03-01

### Changed

- Code cleanup: improved reuse, naming, and module boundaries

## [0.4.4] - 2026-03-01

### Changed

- Performance optimization: skip non-swap instructions early, avoid spread and string concatenation in hot paths

## [0.4.3] - 2026-03-01

### Changed

- Documentation updates for library-first usage

## [0.4.2] - 2026-03-01

### Added

- Test suite covering parser, IDL decoding, integration, and validation

## [0.4.1] - 2026-03-01

### Added

- Biome linting and Prettier formatting
- Package configuration for npm publishing

## [0.4.0] - 2026-03-01

### Added

- Zod-validated public API (`parseSwap`, `parseSwapDetailed`)
- Barrel export via `src/lib.ts`
- `SwapInput` convenience type
- `ValidationError` with structured Zod issues

## [0.3.1] - 2026-03-01

### Changed

- Restructured project: moved CLI and dev scripts out of root

## [0.3.0] - 2026-03-01

### Changed

- Refactored parser into submodules (balance, detection, user, IDL scoring, accounts)
- Strengthened TypeScript strictness

## [0.2.2] - 2026-02-28

### Added

- Project documentation

## [0.2.1] - 2026-02-28

### Added

- Benchmark for parser across 3 encoding formats (jsonParsed, base64, base58)

## [0.2.0] - 2026-02-28

### Added

- Helius WebSocket stream and CLI entry point (later removed in 0.6.2)

## [0.1.0] - 2026-02-28

### Added

- Main swap parser with protocol detection and user identification
- Balance diff computation with WSOL normalization
- IDL-anchored input/output selection with heuristic fallback

## [0.0.6] - 2026-02-28

### Added

- Transaction deserialization and normalization (base58, base64, base64+zstd)

## [0.0.5] - 2026-02-28

### Added

- IDL program parsers for 6 Solana DEX protocols (PumpFun, PumpSwap, Raydium CPMM, Raydium LaunchLab, Meteora DBC, Meteora DAMMv2)

## [0.0.3] - 2026-02-28

### Added

- IDL codec (base58/base64 encoding) and type definitions

## [0.0.2] - 2026-02-28

### Added

- Core types and protocol constants

## [0.0.1] - 2026-02-28

### Added

- Initial project setup with Bun
