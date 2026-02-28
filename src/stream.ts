import { ALL_PROGRAM_IDS } from "./constants.ts";
import type { TransactionNotification, WsNotification } from "./types.ts";

export function getWsUrl(): string {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    throw new Error("RPC_URL env variable is required (e.g. https://mainnet.helius-rpc.com/?api-key=XXX)");
  }

  const url = new URL(rpcUrl);
  const apiKey = url.searchParams.get("api-key");
  if (!apiKey) {
    throw new Error("RPC_URL must contain an api-key query parameter");
  }

  return `wss://atlas-mainnet.helius-rpc.com?api-key=${apiKey}`;
}

export function startStream(
  onSwap: (notification: TransactionNotification) => void,
): void {
  const wsUrl = getWsUrl();
  let pingInterval: ReturnType<typeof setInterval> | null = null;

  function connect() {
    console.log("[stream] connecting...");
    const ws = new WebSocket(wsUrl);

    ws.addEventListener("open", () => {
      console.log("[stream] connected");

      // Send subscription request
      const encoding = process.env.STREAM_ENCODING ?? "jsonParsed";
      const request = {
        jsonrpc: "2.0",
        id: 1,
        method: "transactionSubscribe",
        params: [
          {
            accountInclude: ALL_PROGRAM_IDS,
            failed: false,
          },
          {
            commitment: "confirmed",
            encoding,
            transactionDetails: "full",
            maxSupportedTransactionVersion: 0,
          },
        ],
      };
      ws.send(JSON.stringify(request));

      // Keepalive ping every 30s
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping" }));
        }
      }, 30_000);
    });

    ws.addEventListener("message", (event) => {
      let data: WsNotification;
      try {
        data = JSON.parse(String(event.data)) as WsNotification;
      } catch {
        console.error("[stream] failed to parse message");
        return;
      }

      // Subscription confirmation
      if (data.result !== undefined && data.id !== undefined) {
        console.log(`[stream] subscribed (id=${data.result})`);
        return;
      }

      // Transaction notification
      if (data.method === "transactionNotification" && data.params?.result) {
        onSwap(data.params.result);
      }
    });

    ws.addEventListener("close", (event) => {
      console.log(`[stream] disconnected (code=${event.code}), reconnecting in 3s...`);
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      setTimeout(connect, 3_000);
    });

    ws.addEventListener("error", (event) => {
      console.error("[stream] ws error:", event);
      // close event follows automatically
    });
  }

  connect();
}
