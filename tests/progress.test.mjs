import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Load the real route with only Cloudflare/auth imports replaced; no live service is used.
let source = await readFile(new URL("../app/api/progress/route.ts", import.meta.url), "utf8");
source = source.replace('import { getChatGPTUser } from "@/app/chatgpt-auth";',
  "const getChatGPTUser = async () => globalThis.__progressTestState.user;");
source = source.replace('import { getProgressDb } from "@/db";',
  "const getProgressDb = () => globalThis.__progressTestState.db;");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { GET, PUT } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

function setup() {
  const rows = new Map();
  const state = {
    user: { userId: "alice" },
    writes: [],
    db: {
      prepare(sql) {
        return {
          bind(...params) {
            return {
              async all() {
                assert.match(sql, /WHERE user_id = \?/);
                return { results: [...rows.values()].filter((row) => row.userId === params[0])
                  .map(({ dialogueId, status, updatedAt }) => ({ dialogueId, status, updatedAt })) };
              },
              async run() {
                assert.match(sql, /ON CONFLICT\(user_id, dialogue_id\)/);
                assert.match(sql, /VALUES \(\?, \?, \?, \?\)/);
                state.writes.push(params);
                rows.set(`${params[0]}:${params[1]}`, { userId: params[0], dialogueId: params[1], status: params[2], updatedAt: params[3] });
              },
            };
          },
        };
      },
    },
  };
  globalThis.__progressTestState = state;
  return state;
}

function request(body, origin = "https://learn.example") {
  return new Request("https://learn.example/api/progress", {
    method: "PUT", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body),
  });
}

test("dialogue progress accepts both curriculum boundaries and updates only the signed-in user's row", async () => {
  const state = setup();
  for (const dialogueId of ["w01d1-s1", "w26d5-s5"]) {
    const response = await PUT(request({ dialogueId, status: "listened" }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const payload = await response.json();
    assert.equal(payload.progress.dialogueId, dialogueId);
    assert.equal(payload.progress.status, "listened");
    assert.ok(Number.isFinite(Date.parse(payload.progress.updatedAt)));
  }
  await PUT(request({ dialogueId: "w01d1-s1", status: "understood" }));
  let payload = await (await GET()).json();
  assert.equal(payload.progress.length, 2);
  assert.equal(payload.progress[0].status, "understood");
  state.user = { userId: "bob" };
  payload = await (await GET()).json();
  assert.deepEqual(payload.progress, []);
  await PUT(request({ dialogueId: "w01d1-s1", status: "revisit" }));
  assert.equal(state.writes.at(-1)[0], "bob");
});

test("dialogue progress rejects IDs outside the actual 26-week, 5-day, 5-scene curriculum", async () => {
  const state = setup();
  for (const dialogueId of ["w00d1-s1", "w27d1-s1", "w01d0-s1", "w01d6-s1", "w01d1-s0", "w01d1-s6", "w1d1-s1", "w01d1-s1\n", "w01d1-s1;DROP TABLE dialogue_progress", 1]) {
    assert.equal((await PUT(request({ dialogueId, status: "listened" }))).status, 400, String(dialogueId));
  }
  assert.equal(state.writes.length, 0);
});

test("dialogue progress rejects unknown fields, missing fields, arrays, and unknown statuses", async () => {
  const state = setup();
  for (const body of [null, [], { dialogueId: "w01d1-s1" }, { status: "listened" },
    { dialogueId: "w01d1-s1", status: "mastered" },
    { dialogueId: "w01d1-s1", status: "listened", userId: "bob" },
    { dialogueId: "w01d1-s1", status: "listened", extra: false }]) {
    assert.equal((await PUT(request(body))).status, 400);
  }
  assert.equal(state.writes.length, 0);
});

test("dialogue progress requires authentication and rejects a foreign origin before writing", async () => {
  const state = setup();
  assert.equal((await PUT(request({ dialogueId: "w01d1-s1", status: "listened" }, "https://other.example"))).status, 403);
  state.user = null;
  assert.equal((await GET()).status, 401);
  assert.equal((await PUT(request({ dialogueId: "w01d1-s1", status: "listened" }))).status, 401);
  assert.equal(state.writes.length, 0);
});

test("missing migrations return 503 instead of creating a table during a request", async (context) => {
  const state = setup();
  context.mock.method(console, "error", () => {});
  state.db.prepare = (sql) => {
    assert.doesNotMatch(sql, /CREATE TABLE/);
    throw new Error("D1_ERROR: no such table: dialogue_progress: SQLITE_ERROR");
  };
  for (const response of [await GET(), await PUT(request({ dialogueId: "w01d1-s1", status: "listened" }))]) {
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /尚未初始化.*迁移/);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
});
