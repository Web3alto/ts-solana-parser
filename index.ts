import { parseTransaction } from "./src/parser.ts";
import { startStream } from "./src/stream.ts";
import { SOL_MINT } from "./src/constants.ts";

function formatMint(mint: string): string {
  if (mint === SOL_MINT) return "SOL";
  return mint.slice(0, 8) + "...";
}

function formatAmount(amount: number): string {
  if (amount >= 1) return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return amount.toPrecision(4);
}

console.log("Starting Solana swap parser...\n");

startStream((notification) => {
  const swap = parseTransaction(notification);
  if (!swap) return;

  const input = `${formatAmount(swap.inputAmount)} ${formatMint(swap.inputMint)}`;
  const output = `${formatAmount(swap.outputAmount)} ${formatMint(swap.outputMint)}`;
  const protocols = swap.protocols.join(", ");
  const pool = swap.pool ? swap.pool.slice(0, 8) + "..." : "unknown";
  const fee = (swap.fee / 1e9).toFixed(6);

  const swapType = swap.swapType ?? "unknown";

  console.log(
    `[${protocols}] ${swap.user.slice(0, 8)}... ${swapType} ${input} → ${output} | pool: ${pool} | fee: ${fee} SOL | ${swap.signature}`,
  );
});
