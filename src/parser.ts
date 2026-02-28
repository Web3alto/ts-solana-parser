import {
  Protocol,
  PROGRAM_ID_TO_PROTOCOL,
  SOL_MINT,
  WSOL_MINT,
  SOL_DECIMALS,
  POOL_ACCOUNT_INDEX,
} from "./constants.ts";
import type {
  AccountKey,
  AccountKeyObject,
  CompiledInstruction,
  Instruction,
  ParsedSwap,
  SwapType,
  TokenBalance,
  TokenChange,
  TransactionMeta,
  TransactionMessage,
  TransactionNotification,
  UnparsedInstruction,
} from "./types.ts";
import { tryParseInstruction } from "./idl/registry.ts";
import { NATIVE_SOL_MINT, type ParseContext, type RawSwap } from "./idl/types.ts";
import { normalizeTransactionData } from "./normalize.ts";

// ── Helpers ──

export function resolveAccountKey(key: AccountKey): string {
  return typeof key === "string" ? key : key.pubkey;
}

export function buildFullAccountKeys(
  message: TransactionMessage,
  meta: TransactionMeta,
): string[] {
  const base = message.accountKeys.map(resolveAccountKey);
  const loaded = meta.loadedAddresses;
  if (loaded) {
    base.push(...loaded.writable, ...loaded.readonly);
  }
  return base;
}

export function isCompiledInstruction(
  instr: Instruction,
): instr is CompiledInstruction {
  return "programIdIndex" in instr;
}

export function isUnparsedInstruction(
  instr: Instruction,
): instr is UnparsedInstruction {
  return (
    "programId" in instr &&
    "accounts" in instr &&
    "data" in instr &&
    Array.isArray(instr.accounts) &&
    typeof (instr.accounts as unknown[])[0] === "string"
  );
}

export function getInstructionProgramId(
  instr: Instruction,
  fullKeys: string[],
): string | undefined {
  if (isCompiledInstruction(instr)) {
    return fullKeys[instr.programIdIndex];
  }
  return instr.programId;
}

// ── Protocol detection ──

export function detectProtocols(
  message: TransactionMessage,
  meta: TransactionMeta,
  fullKeys: string[],
): Protocol[] {
  const found = new Set<Protocol>();

  for (const instr of message.instructions) {
    const pid = getInstructionProgramId(instr, fullKeys);
    if (pid && pid in PROGRAM_ID_TO_PROTOCOL) {
      found.add(PROGRAM_ID_TO_PROTOCOL[pid]!);
    }
  }

  for (const inner of meta.innerInstructions) {
    for (const instr of inner.instructions) {
      const pid = getInstructionProgramId(instr, fullKeys);
      if (pid && pid in PROGRAM_ID_TO_PROTOCOL) {
        found.add(PROGRAM_ID_TO_PROTOCOL[pid]!);
      }
    }
  }

  return [...found];
}

// ── User detection ──

/**
 * Find the actual swap user. In many cases the fee payer (fullKeys[0]) is a
 * relay/bot and the real swapper is a different account. We identify the user
 * by finding which non-pool owner has token balance changes that look like a
 * swap (at least one positive and one negative delta, or a single-sided token
 * change paired with a SOL change).
 *
 * Falls back to fee payer if no better candidate is found.
 */
function ownerTokenDeltas(
  meta: TransactionMeta,
  owner: string,
): Map<string, bigint> {
  const deltas = new Map<string, bigint>();
  for (const tb of meta.preTokenBalances) {
    if (tb.owner !== owner) continue;
    deltas.set(tb.mint, (deltas.get(tb.mint) ?? 0n) - BigInt(tb.uiTokenAmount.amount));
  }
  for (const tb of meta.postTokenBalances) {
    if (tb.owner !== owner) continue;
    deltas.set(tb.mint, (deltas.get(tb.mint) ?? 0n) + BigInt(tb.uiTokenAmount.amount));
  }
  return deltas;
}

export function findSwapUser(
  meta: TransactionMeta,
  fullKeys: string[],
): string {
  const feePayer = fullKeys[0]!;

  // Collect all unique owners from token balances
  const owners = new Set<string>();
  for (const tb of meta.preTokenBalances) owners.add(tb.owner);
  for (const tb of meta.postTokenBalances) owners.add(tb.owner);

  // Compute deltas once per owner, check both heuristics in a single pass
  for (const owner of owners) {
    const deltas = ownerTokenDeltas(meta, owner);

    let hasPositive = false;
    let hasNegative = false;
    for (const d of deltas.values()) {
      if (d > 0n) hasPositive = true;
      if (d < 0n) hasNegative = true;
    }

    // Strong signal: both inflow and outflow tokens
    if (hasPositive && hasNegative) return owner;
  }

  // Fallback: single-token-change + SOL change pattern (buy/sell with SOL)
  for (const owner of owners) {
    const deltas = ownerTokenDeltas(meta, owner);

    const hasTokenChange = [...deltas.values()].some((d) => d !== 0n);
    if (!hasTokenChange) continue;

    const ownerIdx = fullKeys.indexOf(owner);
    if (ownerIdx >= 0) {
      const preSol = meta.preBalances[ownerIdx];
      const postSol = meta.postBalances[ownerIdx];
      if (preSol !== undefined && postSol !== undefined && preSol !== postSol) {
        return owner;
      }
    }
  }

  return feePayer;
}

// ── Token balance diffs ──

export function computeTokenChanges(
  meta: TransactionMeta,
  user: string,
): TokenChange[] {
  const preMap = new Map<string, TokenBalance>();
  for (const tb of meta.preTokenBalances) {
    if (tb.owner === user) {
      preMap.set(`${tb.accountIndex}:${tb.mint}`, tb);
    }
  }

  const postMap = new Map<string, TokenBalance>();
  for (const tb of meta.postTokenBalances) {
    if (tb.owner === user) {
      postMap.set(`${tb.accountIndex}:${tb.mint}`, tb);
    }
  }

  const allKeys = new Set([...preMap.keys(), ...postMap.keys()]);
  const changes: TokenChange[] = [];

  for (const key of allKeys) {
    const pre = preMap.get(key);
    const post = postMap.get(key);

    const preAmount = BigInt(pre?.uiTokenAmount.amount ?? "0");
    const postAmount = BigInt(post?.uiTokenAmount.amount ?? "0");
    const delta = postAmount - preAmount;

    if (delta !== 0n) {
      const decimals = post?.uiTokenAmount.decimals ?? pre!.uiTokenAmount.decimals;
      const mint = post?.mint ?? pre!.mint;
      changes.push({ mint, rawDelta: delta, decimals });
    }
  }

  // Consolidate multiple accounts for the same mint
  const byMint = new Map<string, TokenChange>();
  for (const c of changes) {
    const existing = byMint.get(c.mint);
    if (existing) {
      existing.rawDelta += c.rawDelta;
    } else {
      byMint.set(c.mint, { ...c });
    }
  }

  return [...byMint.values()].filter((c) => c.rawDelta !== 0n);
}

export function computeSolChange(
  meta: TransactionMeta,
  fullKeys: string[],
  user: string,
): TokenChange | null {
  const userIdx = fullKeys.indexOf(user);
  if (userIdx < 0) return null;

  const pre = meta.preBalances[userIdx];
  const post = meta.postBalances[userIdx];
  if (pre === undefined || post === undefined) return null;

  // Add fee back if this user is the fee payer (index 0) to isolate swap movement
  const feeAdjust = userIdx === 0 ? BigInt(meta.fee) : 0n;
  const trueDelta = BigInt(post) - BigInt(pre) + feeAdjust;
  if (trueDelta === 0n) return null;

  return { mint: SOL_MINT, rawDelta: trueDelta, decimals: SOL_DECIMALS };
}

export function mergeChanges(
  tokenChanges: TokenChange[],
  solChange: TokenChange | null,
): TokenChange[] {
  const hasWsol = tokenChanges.some((c) => c.mint === WSOL_MINT);

  const result: TokenChange[] = [];

  for (const c of tokenChanges) {
    if (c.mint === WSOL_MINT) {
      // Rename WSOL to SOL_MINT for unified output
      result.push({ ...c, mint: SOL_MINT });
    } else {
      result.push(c);
    }
  }

  // Only include native SOL change if no WSOL was present (avoids double-count)
  if (!hasWsol && solChange) {
    result.push(solChange);
  }

  return result.filter((c) => c.rawDelta !== 0n);
}

// ── Pool extraction ──

export function extractPoolAddress(
  message: TransactionMessage,
  meta: TransactionMeta,
  fullKeys: string[],
  protocols: Protocol[],
): string | undefined {
  // Find the first protocol with a known pool account index
  for (const protocol of protocols) {
    const idx = POOL_ACCOUNT_INDEX[protocol];
    if (idx === undefined) continue;

    // Search top-level instructions
    for (const instr of message.instructions) {
      // Unparsed instructions (jsonParsed custom programs): accounts are already strings
      if (isUnparsedInstruction(instr)) {
        if (PROGRAM_ID_TO_PROTOCOL[instr.programId] === protocol) {
          const pool = instr.accounts[idx];
          if (pool) return pool;
        }
        continue;
      }

      if (!isCompiledInstruction(instr)) continue;
      const pid = fullKeys[instr.programIdIndex];
      if (pid && PROGRAM_ID_TO_PROTOCOL[pid] === protocol) {
        const accountIdx = instr.accounts[idx];
        if (accountIdx !== undefined) {
          return fullKeys[accountIdx];
        }
      }
    }

    // Then inner instructions
    for (const inner of meta.innerInstructions) {
      for (const instr of inner.instructions) {
        if (isUnparsedInstruction(instr)) {
          if (PROGRAM_ID_TO_PROTOCOL[instr.programId] === protocol) {
            const pool = instr.accounts[idx];
            if (pool) return pool;
          }
          continue;
        }

        if (!isCompiledInstruction(instr)) continue;
        const pid = fullKeys[instr.programIdIndex];
        if (pid && PROGRAM_ID_TO_PROTOCOL[pid] === protocol) {
          const accountIdx = instr.accounts[idx];
          if (accountIdx !== undefined) {
            return fullKeys[accountIdx];
          }
        }
      }
    }
  }

  return undefined;
}

// ── IDL enrichment ──

function tryIdlParse(
  message: TransactionMessage,
  meta: TransactionMeta,
  fullKeys: string[],
): RawSwap | null {
  const ctx: ParseContext = {
    preTokenBalances: meta.preTokenBalances,
    postTokenBalances: meta.postTokenBalances,
    allKeys: fullKeys,
  };

  function resolveAndParse(instr: Instruction): RawSwap | null {
    if (isUnparsedInstruction(instr)) {
      return tryParseInstruction(instr.programId, instr.accounts, instr.data, ctx);
    }
    if (isCompiledInstruction(instr)) {
      const programId = fullKeys[instr.programIdIndex];
      if (programId) {
        const resolvedAccounts = instr.accounts.map(i => fullKeys[i]!);
        return tryParseInstruction(programId, resolvedAccounts, instr.data, ctx);
      }
    }
    return null;
  }

  for (const instr of message.instructions) {
    const result = resolveAndParse(instr);
    if (result) return result;
  }

  for (const inner of meta.innerInstructions) {
    for (const instr of inner.instructions) {
      const result = resolveAndParse(instr);
      if (result) return result;
    }
  }

  return null;
}

function normalizeMint(mint: string): string {
  return mint === NATIVE_SOL_MINT ? SOL_MINT : mint;
}

// ── Main parser ──

export function parseTransaction(
  notification: TransactionNotification,
): ParsedSwap | null {
  const { signature, slot } = notification;
  const { meta, transaction: rawTransaction } = notification.transaction;
  const { message } = normalizeTransactionData(rawTransaction);

  // Skip failed txs
  if (meta.err !== null) return null;

  const fullKeys = buildFullAccountKeys(message, meta);
  if (fullKeys.length === 0) return null;

  const protocols = detectProtocols(message, meta, fullKeys);
  if (protocols.length === 0) return null;

  // Try IDL parse first — its signer is the most reliable user indicator
  const idlResult = tryIdlParse(message, meta, fullKeys);

  // Use IDL signer when available, fall back to balance-diff heuristic
  const user = idlResult?.signer ?? findSwapUser(meta, fullKeys);

  const tokenChanges = computeTokenChanges(meta, user);
  const solChange = computeSolChange(meta, fullKeys, user);
  const merged = mergeChanges(tokenChanges, solChange);

  // Find input (negative delta) and output (positive delta)
  const inputs = merged.filter((c) => c.rawDelta < 0n);
  const outputs = merged.filter((c) => c.rawDelta > 0n);

  // Not a swap if we don't have both sides (could be LP add/remove)
  if (inputs.length === 0 || outputs.length === 0) return null;

  // Use the largest magnitude change on each side
  const input = inputs.reduce((a, b) =>
    a.rawDelta < b.rawDelta ? a : b,
  );
  const output = outputs.reduce((a, b) =>
    a.rawDelta > b.rawDelta ? a : b,
  );

  const pool = extractPoolAddress(message, meta, fullKeys, protocols);

  const inputAmount =
    Number(-input.rawDelta) / 10 ** input.decimals;
  const outputAmount =
    Number(output.rawDelta) / 10 ** output.decimals;

  // IDL enrichment: cross-validate mints match balance diffs
  let swapType: SwapType | undefined;
  if (idlResult) {
    const idlFrom = normalizeMint(idlResult.tokenFrom);
    const idlTo = normalizeMint(idlResult.tokenTo);
    if (
      (idlFrom === input.mint && idlTo === output.mint) ||
      (idlFrom === output.mint && idlTo === input.mint)
    ) {
      swapType = idlResult.type;
    }
  }

  return {
    signature,
    slot,
    user,
    protocols,
    inputMint: input.mint,
    inputAmount,
    outputMint: output.mint,
    outputAmount,
    pool,
    swapType,
    fee: meta.fee,
    timestamp: Date.now(),
  };
}
