import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate as nextTurn } from "node:timers/promises";
import test from "node:test";
import ts from "typescript";

const source = (await readFile(new URL("../hooks/use-dialogue-progress.ts", import.meta.url), "utf8"))
  .replace('import { useCallback, useEffect, useRef, useState } from "react";',
    ["useCallback", "useEffect", "useRef", "useState"].map((name) =>
      `const ${name} = (...args) => globalThis.__progressHookHarness.${name}(...args);`).join("\n"));
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { useDialogueProgress: invokeProgressHook } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

// Run the production hook with persistent React slots and controlled HTTP promises.
// State writes after cleanup fail the test instead of disappearing into a mock.
function setup(context, fetchImpl) {
  const slots = [];
  const effects = [];
  const requests = [];
  let cursor = 0;
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
  globalThis.__progressHookHarness = runtime;
  context.mock.method(globalThis, "fetch", (url, options) => {
    const request = { url, options, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : undefined };
    requests.push(request);
    return fetchImpl(request, requests.length);
  });
  const render = () => {
    cursor = 0;
    const progress = invokeProgressHook();
    while (effects.length) effects.shift()();
    return progress;
  };
  const unmount = () => {
    if (disposed) return;
    disposed = true;
    for (const slot of slots) slot.cleanup?.();
  };
  context.after(unmount);
  render();
  return { render, unmount, requests };
}

function response(body) { return { ok: true, status: 200, json: async () => body }; }
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const first = { dialogueId: "w01d1-s1", status: "listened", updatedAt: "2026-10-07T01:00:00.000Z" };
const understood = { ...first, status: "understood", updatedAt: "2026-10-07T01:01:00.000Z" };
const second = { dialogueId: "w01d1-s2", status: "revisit", updatedAt: "2026-10-07T01:02:00.000Z" };

test("an older GET cannot overwrite a completed PUT", async (context) => {
  const staleRead = deferred();
  const save = deferred();
  const harness = setup(context, (_, count) => count === 1 ? response({ progress: [first] }) : count === 2 ? staleRead.promise : save.promise);
  await nextTurn();
  assert.equal(harness.render().ready, true);
  const reload = harness.render().reload();
  const write = harness.render().mark(first.dialogueId, "understood");
  save.resolve(response({ saved: true, progress: understood }));
  assert.equal(await write, true);
  assert.deepEqual(harness.render().progress[first.dialogueId], understood);
  staleRead.resolve(response({ progress: [first] }));
  await reload;
  assert.deepEqual(harness.render().progress[first.dialogueId], understood);
  assert.equal(harness.render().error, "");
});

test("reload sends no GET during PUT and resumes after saving", async (context) => {
  const save = deferred();
  const harness = setup(context, (request, count) => {
    if (request.method === "PUT") return save.promise;
    return response({ progress: [count === 1 ? first : understood] });
  });
  await nextTurn();
  const write = harness.render().mark(first.dialogueId, "understood");
  assert.equal(harness.render().pending, first.dialogueId);
  await harness.render().reload();
  assert.equal(harness.requests.length, 2, "only initial GET and the pending PUT should exist");
  save.resolve(response({ saved: true, progress: understood }));
  assert.equal(await write, true);
  await harness.render().reload();
  assert.equal(harness.requests.length, 3);
  assert.equal(harness.requests[2].method, "GET");
  assert.deepEqual(harness.render().progress[first.dialogueId], understood);
});

test("concurrent marks allow only one PUT and release the guard after completion", async (context) => {
  const save = deferred();
  const harness = setup(context, (request) => request.method === "GET" ? response({ progress: [first] })
    : request.body.dialogueId === first.dialogueId ? save.promise : response({ saved: true, progress: second }));
  await nextTurn();
  const write = harness.render().mark(first.dialogueId, "understood");
  assert.equal(await harness.render().mark(second.dialogueId, "revisit"), false);
  assert.equal(harness.requests.filter((request) => request.method === "PUT").length, 1);
  save.resolve(response({ saved: true, progress: understood }));
  assert.equal(await write, true);
  assert.equal(harness.render().pending, null);
  assert.equal(await harness.render().mark(second.dialogueId, "revisit"), true);
  assert.equal(harness.requests.filter((request) => request.method === "PUT").length, 2);
  assert.deepEqual(harness.render().progress, { [first.dialogueId]: understood, [second.dialogueId]: second });
});

test("unmount aborts the initial GET and suppresses late state writes", async (context) => {
  const read = deferred();
  const harness = setup(context, () => read.promise);
  await nextTurn();
  assert.equal(harness.requests.length, 1);
  harness.unmount();
  assert.equal(harness.requests[0].options.signal.aborted, true);
  read.resolve(response({ progress: [first] }));
  await nextTurn();
  assert.deepEqual(harness.render().progress, {});
  assert.equal(harness.render().ready, false);
});

test("unmount aborts both an in-flight reload and save without replacing valid records", async (context) => {
  const read = deferred();
  const save = deferred();
  const harness = setup(context, (_, count) => count === 1 ? response({ progress: [first] }) : count === 2 ? read.promise : save.promise);
  await nextTurn();
  const reload = harness.render().reload();
  const write = harness.render().mark(first.dialogueId, "understood");
  harness.unmount();
  assert.equal(harness.requests[1].options.signal.aborted, true);
  assert.equal(harness.requests[2].options.signal.aborted, true);
  read.resolve(response({ progress: [second] }));
  save.resolve(response({ saved: true, progress: understood }));
  await Promise.all([reload, write]);
  assert.deepEqual(harness.render().progress, { [first.dialogueId]: first });
});

test("null or invalid read results preserve previously loaded valid records", async (context) => {
  const invalid = [null, { progress: null }, { progress: [null] },
    { progress: [{ ...first, status: "mastered" }] }, { progress: [{ ...first, updatedAt: 123 }] }];
  const harness = setup(context, (_, count) => response(count === 1 ? { progress: [first] } : invalid[count - 2]));
  await nextTurn();
  for (let index = 0; index < invalid.length; index += 1) {
    await harness.render().reload();
    assert.deepEqual(harness.render().progress, { [first.dialogueId]: first });
    assert.equal(harness.render().ready, true);
    assert.ok(harness.render().error);
  }
});

test("null or mismatched save results preserve old progress and permit a later valid retry", async (context) => {
  const invalid = [null, { saved: true, progress: null },
    { saved: true, progress: { ...understood, dialogueId: second.dialogueId } },
    { saved: true, progress: { ...understood, status: "revisit" } },
    { saved: true, progress: { ...understood, updatedAt: null } }];
  let writes = 0;
  const harness = setup(context, (request) => {
    if (request.method === "GET") return response({ progress: [first] });
    const body = writes < invalid.length ? invalid[writes] : { saved: true, progress: understood };
    writes += 1;
    return response(body);
  });
  await nextTurn();
  for (let index = 0; index < invalid.length; index += 1) {
    assert.equal(await harness.render().mark(first.dialogueId, "understood"), false);
    assert.deepEqual(harness.render().progress, { [first.dialogueId]: first });
    assert.equal(harness.render().pending, null);
    assert.ok(harness.render().error);
  }
  assert.equal(await harness.render().mark(first.dialogueId, "understood"), true);
  assert.deepEqual(harness.render().progress[first.dialogueId], understood);
  assert.equal(harness.render().error, "");
});
