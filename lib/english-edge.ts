import { VOICE_BY_ID } from "./english-voices";

// The Edge Read Aloud protocol is unofficial and may change without notice.
// This implementation uses Cloudflare's outbound WebSocket upgrade support.
const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const VERSION = "143.0.3650.75";
const ENDPOINT = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";

type WebSocketResponse = Response & { webSocket?: WebSocket };

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function edgeToken() {
  const seconds = Math.floor(Date.now() / 1000) + 11644473600;
  const rounded = seconds - (seconds % 300);
  const ticks = (rounded * 10000000).toFixed(0);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ticks + TOKEN));
  return hex(new Uint8Array(digest));
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character] || character);
}

function stamp() {
  return new Date().toISOString().replace(/[-:.]/g, "").slice(0, -1);
}

function randomHex() {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

function speechMessages(text: string, requestId: string, voiceId: string) {
  if (!Object.hasOwn(VOICE_BY_ID, voiceId)) throw new Error("Unsupported English voice");
  const voice = VOICE_BY_ID[voiceId];
  const config = `X-Timestamp:${stamp()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
    JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "true" }, outputFormat: "audio-24khz-48kbitrate-mono-mp3" } } } }) + "\r\n";
  const cleanText = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, " ");
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${voice.locale}'><voice name='${voice.edgeName}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapeXml(cleanText)}</prosody></voice></speak>`;
  const request = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${stamp()}Z\r\nPath:ssml\r\n\r\n${ssml}`;
  return { config, request };
}

export async function synthesizeEnglishSpeech(text: string, voiceId: string, signal?: AbortSignal): Promise<Blob> {
  const { config, request } = speechMessages(text, crypto.randomUUID().replace(/-/g, ""), voiceId);
  // One deadline covers token generation, the upgrade handshake, and every audio frame.
  return new Promise<Blob>((resolve, reject) => {
    const controller = new AbortController();
    const parts: Uint8Array[] = [];
    let socket: WebSocket | undefined;
    let settled = false;
    const timer = setTimeout(() => done(new Error("English speech connection timed out")), 20000);

    function abortError() {
      return signal?.reason instanceof Error ? signal.reason : new DOMException("English speech request aborted", "AbortError");
    }

    function onAbort() { done(abortError()); }
    function onClose() { done(new Error("English speech closed before turn.end")); }
    function onError() { done(new Error("English speech connection error")); }

    function done(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      socket?.removeEventListener("message", onMessage);
      socket?.removeEventListener("close", onClose);
      socket?.removeEventListener("error", onError);
      if (error || !parts.length) {
        const failure = error || new Error("English speech returned no audio");
        controller.abort(failure);
        reject(failure);
      } else {
        const audio = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
        let offset = 0;
        for (const part of parts) {
          audio.set(part, offset);
          offset += part.length;
        }
        resolve(new Blob([audio.buffer], { type: "audio/mpeg" }));
      }
      try { socket?.close(); } catch { /* Socket may already be closed. */ }
    }

    function onMessage(event: MessageEvent) {
      if (typeof event.data === "string") {
        if (/^Path:turn\.end\r?$/m.test(event.data)) done();
        return;
      }
      if (!(event.data instanceof ArrayBuffer)) return;
      const frame = new Uint8Array(event.data);
      if (frame.length < 2) return;
      const headerLength = frame[0] * 256 + frame[1];
      if (frame.length < headerLength + 2) return;
      const header = new TextDecoder().decode(frame.subarray(2, headerLength + 2));
      if (/^Path:audio\r?$/m.test(header) && /Content-Type:audio\/mpeg/.test(header)) {
        const payload = frame.subarray(headerLength + 2);
        if (payload.length) parts.push(payload);
      }
    }

    async function connect() {
      try {
        const url = new URL(ENDPOINT);
        url.searchParams.set("TrustedClientToken", TOKEN);
        url.searchParams.set("Sec-MS-GEC", await edgeToken());
        if (settled) return;
        url.searchParams.set("Sec-MS-GEC-Version", `1-${VERSION}`);
        url.searchParams.set("ConnectionId", crypto.randomUUID().replace(/-/g, ""));
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            Upgrade: "websocket",
            "Sec-WebSocket-Version": "13",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
            "Accept-Language": "en-US,en;q=0.9",
            Cookie: `muid=${randomHex()};`,
          },
        }) as WebSocketResponse;
        socket = response.webSocket;
        // A cancelled handshake may still finish upstream; discard and close its socket.
        if (settled) {
          try { socket?.close(); } catch { /* Socket may already be closed. */ }
          return;
        }
        if (response.status !== 101 || !socket) {
          done(new Error(`English speech connection failed: ${response.status}`));
          return;
        }
        socket.binaryType = "arraybuffer";
        socket.addEventListener("message", onMessage);
        socket.addEventListener("close", onClose);
        socket.addEventListener("error", onError);
        socket.accept();
        socket.send(config);
        socket.send(request);
      } catch (error) {
        done(error instanceof Error ? error : new Error(String(error)));
      }
    }

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    else void connect();
  });
}
