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
const source = (await readFile(new URL("../hooks/use-english-player.ts", import.meta.url), "utf8"))
  .replace('import { useCallback, useEffect, useRef, useState } from "react";',
    ["useCallback", "useEffect", "useRef", "useState"].map((name) =>
      `const ${name} = (...args) => globalThis.__playerTestHarness.${name}(...args);`).join("\n"))
  .replace('"@/lib/english-voices"', JSON.stringify(voicesUrl));
const { useEnglishPlayer: invokePlayerHook } = await import(moduleUrl(source));

// Preserve hook slots and dependency identity while rendering state on demand.
// Audio, timers and HTTP are controlled so no real browser or speech service is used.
function setup(context, fetchImpl = async () => audioResponse()) {
  const slots = [];
  const effects = [];
  const audios = [];
  const timers = new Map();
  const revoked = [];
  const created = [];
  const requests = [];
  let cursor = 0;
  let timerId = 0;
  let disposed = false;
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const runtime = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) {
        const slot = { value: typeof initial === "function" ? initial() : initial };
        slot.set = (value) => {
          assert.equal(disposed, false, "an unmounted hook must not receive state updates");
          slot.value = typeof value === "function" ? value(slot.value) : value;
        };
        slots[index] = slot;
      }
      return [slots[index].value, slots[index].set];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { callback, deps };
      return slots[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps };
        effects.push(() => {
          previous?.cleanup?.();
          slots[index].cleanup = effect();
        });
      }
    },
  };
  globalThis.__playerTestHarness = runtime;
  context.mock.method(globalThis, "setTimeout", (callback, duration) => {
    const id = ++timerId;
    timers.set(id, { callback, duration });
    return id;
  });
  context.mock.method(globalThis, "clearTimeout", (id) => { timers.delete(id); });
  context.mock.method(URL, "createObjectURL", () => {
    const url = `blob:mock-${created.length + 1}`;
    created.push(url);
    return url;
  });
  context.mock.method(URL, "revokeObjectURL", (url) => { revoked.push(url); });
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  class FakeAudio {
    constructor(url) {
      this.url = url;
      this.played = false;
      this.paused = false;
      audios.push(this);
    }
    play() { this.played = true; return Promise.resolve(); }
    pause() { this.paused = true; }
    finish() { this.onended?.(); }
    fail() { this.onerror?.(); }
  }
  Object.defineProperty(globalThis, "Audio", { configurable: true, writable: true, value: FakeAudio });
  context.after(() => {
    if (originalAudio) Object.defineProperty(globalThis, "Audio", originalAudio);
    else delete globalThis.Audio;
  });
  context.mock.method(globalThis, "fetch", (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return fetchImpl(url, options);
  });
  const render = () => {
    cursor = 0;
    const player = invokePlayerHook();
    while (effects.length) effects.shift()();
    return player;
  };
  const unmount = () => {
    if (disposed) return;
    disposed = true;
    for (const slot of slots) slot.cleanup?.();
  };
  context.after(unmount);
  const firePause = () => {
    const entry = [...timers.entries()].find(([, timer]) => timer.duration < 25000);
    assert.ok(entry, "a speaking pause must be scheduled");
    timers.delete(entry[0]);
    entry[1].callback();
  };
  render();
  return { render, unmount, audios, timers, requests, created, revoked, firePause };
}

function audioResponse() {
  return { ok: true, status: 200, blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }) };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const item = (id, speaker = "A") => ({ id, text: `Could you help with ${id}?`, voiceId: speaker === "A" ? "en-US-JennyNeural" : "en-US-GuyNeural", speaker });

test("a stopped delayed request cannot change or play over a newer run", async (context) => {
  const oldResponse = deferred();
  const harness = setup(context, (_, options) => JSON.parse(options.body).text.includes("old") ? oldResponse.promise : Promise.resolve(audioResponse()));
  const oldPlayback = harness.render().play([item("old")], 1, 1);
  assert.equal(harness.requests.length, 1);
  harness.render().stop();
  assert.equal(harness.requests[0].options.signal.aborted, true);
  const newPlayback = harness.render().play([item("new")], 1, 1);
  await nextTurn();
  assert.equal(harness.audios.length, 1);
  assert.equal(harness.render().activeId, "new");
  oldResponse.resolve(audioResponse());
  assert.equal(await oldPlayback, false);
  assert.equal(harness.audios.length, 1);
  assert.equal(harness.created.length, 1, "cancelled audio must not enter the cache");
  assert.equal(harness.render().activeId, "new");
  assert.equal(harness.render().playing, true);
  harness.audios[0].finish();
  assert.equal(await newPlayback, true);
});

test("a stopped Audio completion cannot complete or reset a newer run", async (context) => {
  const harness = setup(context);
  const oldPlayback = harness.render().play([item("old")], 1, 1);
  await nextTurn();
  const oldAudio = harness.audios[0];
  harness.render().stop();
  const newPlayback = harness.render().play([item("new")], 1, 1);
  await nextTurn();
  assert.equal(await oldPlayback, false);
  assert.equal(oldAudio.paused, true);
  oldAudio.finish();
  await nextTurn();
  assert.equal(harness.render().activeId, "new");
  assert.equal(harness.render().playing, true);
  harness.audios[1].finish();
  assert.equal(await newPlayback, true);
});

test("a stopped decoder error cannot revoke the audio reused by a newer run", async (context) => {
  const harness = setup(context);
  const oldPlayback = harness.render().play([item("same")], 1, 1);
  await nextTurn();
  const oldAudio = harness.audios[0];
  const queuedOldError = oldAudio.onerror;
  harness.render().stop();
  const newPlayback = harness.render().play([item("same")], 1, 1);
  await nextTurn();
  assert.equal(await oldPlayback, false);
  assert.equal(harness.requests.length, 1, "the second run should reuse cached audio");
  assert.equal(harness.audios[1].url, oldAudio.url);
  assert.equal(oldAudio.onerror, null, "stop must detach the old Audio error handler");
  oldAudio.fail();
  queuedOldError(); // An event already queued before stop must also be harmless.
  await nextTurn();
  const revokedDuringNewRun = [...harness.revoked];
  harness.audios[1].finish();
  assert.equal(await newPlayback, true);
  assert.deepEqual(revokedDuringNewRun, [], "an obsolete Audio error must not revoke the current run's cached URL");
});

test("role mode gives the selected role a speaking turn before any reference audio", async (context) => {
  const harness = setup(context);
  const seen = [];
  const playback = harness.render().play([item("my-turn", "A"), item("their-turn", "B")], 1, 1, "sequence", { mode: "role", role: "A", onItem: (entry) => seen.push(entry.id) });
  assert.equal(harness.render().waiting, true);
  assert.equal(harness.render().activeId, "my-turn");
  assert.match(harness.render().status, /先自己说/);
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.audios.length, 0);
  harness.render().continuePlayback();
  await nextTurn();
  assert.equal(harness.render().waiting, false);
  assert.match(harness.render().status, /参考表达/);
  assert.equal(harness.audios.length, 1);
  harness.audios[0].finish();
  await nextTurn();
  assert.equal(harness.audios.length, 2);
  assert.equal(harness.render().waiting, false, "the other role should play directly");
  harness.audios[1].finish();
  assert.equal(await playback, true);
  assert.deepEqual(seen, ["my-turn", "their-turn"]);
  assert.equal(harness.timers.size, 0);
});

test("shadow mode waits after each sentence and supports manual or timed continuation", async (context) => {
  const harness = setup(context);
  const playback = harness.render().play([item("first"), item("second", "B")], 0.85, 1, "sequence", { mode: "shadow" });
  await nextTurn();
  assert.equal(harness.render().waiting, false);
  assert.equal(harness.audios[0].playbackRate, 0.85);
  harness.audios[0].finish();
  await nextTurn();
  assert.equal(harness.render().waiting, true);
  assert.match(harness.render().status, /轮到你跟读/);
  assert.equal(harness.audios.length, 1);
  harness.render().continuePlayback();
  await nextTurn();
  assert.equal(harness.render().waiting, false);
  assert.equal(harness.audios.length, 2);
  harness.audios[1].finish();
  await nextTurn();
  assert.equal(harness.render().waiting, true);
  harness.firePause();
  assert.equal(await playback, true);
  assert.equal(harness.render().waiting, false);
  assert.equal(harness.render().playing, false);
  assert.equal(harness.timers.size, 0);
});

test("stopping in a speaking pause clears its timer and does not start the next sentence", async (context) => {
  const harness = setup(context);
  const playback = harness.render().play([item("first"), item("second")], 1, 1, "sequence", { mode: "shadow" });
  await nextTurn();
  harness.audios[0].finish();
  await nextTurn();
  assert.equal(harness.render().waiting, true);
  harness.render().stop();
  assert.equal(await playback, false);
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.render().waiting, false);
  assert.equal(harness.render().playing, false);
  const recovery = harness.render().play([item("recovery")], 1, 1);
  await nextTurn();
  harness.audios[1].finish();
  assert.equal(await recovery, true);
});

test("an upstream error leaves a useful message and the next play can recover", async (context) => {
  let failed = false;
  const harness = setup(context, async () => {
    if (!failed) {
      failed = true;
      return { ok: false, status: 502, json: async () => ({ error: "暂时无法生成语音" }) };
    }
    return audioResponse();
  });
  assert.equal(await harness.render().play([item("retry")], 1, 1), false);
  assert.match(harness.render().status, /暂时无法生成语音/);
  assert.equal(harness.render().playing, false);
  assert.equal(harness.render().waiting, false);
  const recovery = harness.render().play([item("retry")], 1, 1);
  await nextTurn();
  harness.audios[0].finish();
  assert.equal(await recovery, true);
  assert.equal(harness.requests.length, 2);
});

test("a decoder error invalidates its cached audio and permits a fresh request", async (context) => {
  const harness = setup(context);
  const failed = harness.render().play([item("retry")], 1, 1);
  await nextTurn();
  harness.audios[0].fail();
  assert.equal(await failed, false);
  assert.match(harness.render().status, /音频播放失败/);
  assert.deepEqual(harness.revoked, ["blob:mock-1"]);
  const recovery = harness.render().play([item("retry")], 1, 1);
  await nextTurn();
  assert.equal(harness.requests.length, 2);
  harness.audios[1].finish();
  assert.equal(await recovery, true);
});

test("unmount aborts a pending request and suppresses its late state changes", async (context) => {
  const response = deferred();
  const harness = setup(context, () => response.promise);
  const playback = harness.render().play([item("pending")], 1, 1);
  harness.unmount();
  assert.equal(harness.requests[0].options.signal.aborted, true);
  response.resolve(audioResponse());
  assert.equal(await playback, false);
  assert.equal(harness.audios.length, 0);
  assert.equal(harness.created.length, 0);
});
