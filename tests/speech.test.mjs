import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate as nextTurn } from "node:timers/promises";
import test from "node:test";
import ts from "typescript";

function moduleUrl(source) {
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
}

const voicesUrl = moduleUrl(await readFile(new URL("../lib/english-voices.ts", import.meta.url), "utf8"));
const speechSource = (await readFile(new URL("../lib/english-edge.ts", import.meta.url), "utf8"))
  .replace('"./english-voices"', JSON.stringify(voicesUrl));
const { synthesizeEnglishSpeech } = await import(moduleUrl(speechSource));
const routeSource = (await readFile(new URL("../app/api/speech/route.ts", import.meta.url), "utf8"))
  .replace('import { synthesizeEnglishSpeech } from "@/lib/english-edge";',
    "const synthesizeEnglishSpeech = (...args) => globalThis.__speechRouteTestState.synthesize(...args);")
  .replace('"@/lib/english-voices"', JSON.stringify(voicesUrl));
const { POST } = await import(moduleUrl(routeSource));

class FakeSocket extends EventTarget {
  constructor(script = () => {}) {
    super();
    this.script = script;
    this.sent = [];
    this.closed = false;
    this.listeners = new Map();
  }
  addEventListener(type, listener, options) {
    super.addEventListener(type, listener, options);
    this.listeners.set(listener, type);
  }
  removeEventListener(type, listener, options) {
    super.removeEventListener(type, listener, options);
    this.listeners.delete(listener);
  }
  accept() {}
  send(data) {
    this.sent.push(data);
    if (this.sent.length === 2) queueMicrotask(() => this.script(this));
  }
  message(data) { this.dispatchEvent(new MessageEvent("message", { data })); }
  close() {
    this.closed = true;
    this.dispatchEvent(new Event("close"));
  }
}

function frame(bytes) {
  const header = new TextEncoder().encode("Path:audio\r\nContent-Type:audio/mpeg\r\n");
  const data = new Uint8Array(header.length + bytes.length + 2);
  data[0] = header.length >> 8;
  data[1] = header.length & 255;
  data.set(header, 2);
  data.set(bytes, header.length + 2);
  return data.buffer;
}

function mockSocket(context, socket) {
  context.mock.method(globalThis, "fetch", async () => ({ status: 101, webSocket: socket }));
}

function controlDeadline(context) {
  const realSetTimeout = globalThis.setTimeout;
  let deadline;
  context.mock.method(globalThis, "setTimeout", (callback, milliseconds, ...args) => {
    if (milliseconds === 20000) deadline = callback;
    return realSetTimeout(callback, milliseconds, ...args);
  });
  return () => {
    assert.ok(deadline, "the synthesis operation must register its deadline before connecting");
    deadline();
  };
}

test("speech succeeds only after turn.end and joins audio frames in order", async (context) => {
  const socket = new FakeSocket((connection) => {
    connection.message(frame([1, 2]));
    connection.message(frame([3, 4]));
    connection.message("X-RequestId:test\r\nPath:turn.end\r\n\r\n");
  });
  mockSocket(context, socket);
  const audio = await synthesizeEnglishSpeech("Hello & goodbye.", "en-US-JennyNeural");
  assert.equal(audio.type, "audio/mpeg");
  assert.deepEqual([...new Uint8Array(await audio.arrayBuffer())], [1, 2, 3, 4]);
  assert.match(socket.sent[1], /Hello &amp; goodbye\./);
  assert.equal(socket.closed, true);
  assert.equal(socket.listeners.size, 0);
});

test("early close discards partial audio instead of reporting success", async (context) => {
  const socket = new FakeSocket((connection) => {
    connection.message(frame([1, 2, 3]));
    connection.close();
  });
  mockSocket(context, socket);
  await assert.rejects(synthesizeEnglishSpeech("Hello.", "en-US-JennyNeural"), /before turn.end/);
  assert.equal(socket.listeners.size, 0);
});

test("turn.end without audio fails", async (context) => {
  const socket = new FakeSocket((connection) => connection.message("Path:turn.end\r\n"));
  mockSocket(context, socket);
  await assert.rejects(synthesizeEnglishSpeech("Hello.", "en-US-JennyNeural"), /no audio/);
});

test("the deadline aborts a stalled handshake and closes a socket returned after timeout", async (context) => {
  const expire = controlDeadline(context);
  let finishHandshake;
  let fetchSignal;
  let started;
  const handshakeStarted = new Promise((resolve) => { started = resolve; });
  context.mock.method(globalThis, "fetch", (_, options) => {
    fetchSignal = options.signal;
    started();
    return new Promise((resolve) => { finishHandshake = resolve; });
  });
  const synthesis = synthesizeEnglishSpeech("Hello.", "en-US-JennyNeural");
  await handshakeStarted;
  expire();
  await assert.rejects(synthesis, /timed out/);
  assert.ok(fetchSignal);
  assert.equal(fetchSignal.aborted, true);
  const socket = new FakeSocket();
  finishHandshake({ status: 101, webSocket: socket });
  await nextTurn();
  assert.equal(socket.closed, true);
  assert.equal(socket.sent.length, 0);
});

test("the deadline also aborts a stream that never sends turn.end", async (context) => {
  const expire = controlDeadline(context);
  let started;
  const streamStarted = new Promise((resolve) => { started = resolve; });
  const socket = new FakeSocket((connection) => {
    connection.message(frame([1, 2]));
    started();
  });
  mockSocket(context, socket);
  const synthesis = synthesizeEnglishSpeech("Hello.", "en-US-JennyNeural");
  await streamStarted;
  expire();
  await assert.rejects(synthesis, /timed out/);
  assert.equal(socket.closed, true);
  assert.equal(socket.listeners.size, 0);
});

test("request cancellation closes an active stream and removes its listeners", async (context) => {
  const controller = new AbortController();
  const socket = new FakeSocket(() => controller.abort());
  mockSocket(context, socket);
  await assert.rejects(synthesizeEnglishSpeech("Hello.", "en-US-JennyNeural", controller.signal), { name: "AbortError" });
  assert.equal(socket.closed, true);
  assert.equal(socket.listeners.size, 0);
});

test("a request cancelled before synthesis makes no network request", async (context) => {
  const fetch = context.mock.method(globalThis, "fetch", () => { throw new Error("must not fetch"); });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(synthesizeEnglishSpeech("Hello.", "en-US-JennyNeural", controller.signal), { name: "AbortError" });
  assert.equal(fetch.mock.callCount(), 0);
});

test("speech route permits years, passes cancellation, and rejects inherited voice properties", async () => {
  const calls = [];
  globalThis.__speechRouteTestState = { synthesize: async (...args) => {
    calls.push(args);
    return new Blob([new Uint8Array([1, 2])], { type: "audio/mpeg" });
  } };
  const request = new Request("https://learn.example/api/speech", { method: "POST", body: JSON.stringify({ text: "2010", voiceId: "en-US-JennyNeural" }) });
  assert.equal((await POST(request)).status, 200);
  assert.equal(calls[0][0], "2010");
  assert.equal(calls[0][2], request.signal);
  for (const voiceId of ["constructor", "__proto__", "toString"]) {
    const response = await POST(new Request("https://learn.example/api/speech", { method: "POST", body: JSON.stringify({ text: "Hello", voiceId }) }));
    assert.equal(response.status, 400, voiceId);
  }
  assert.equal(calls.length, 1);
});
