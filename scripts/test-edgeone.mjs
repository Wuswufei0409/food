import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir(".sites-runtime", { recursive: true });
await build({ entryPoints: ["server/handler.ts"], bundle: true, platform: "node", format: "esm", outfile: ".sites-runtime/test-handler.mjs" });
const { handleRequest } = await import("../.sites-runtime/test-handler.mjs");
const env = { SESSION_SECRET: "local-test-" + randomUUID(), ADMIN_PASSWORD: "local-test-" + randomUUID() };
const data = new Map();
const store = {
  async get(key) { return structuredClone(data.get(key) ?? null); },
  async set(key, value) { data.set(key, structuredClone(value)); },
  async list(prefix, cursor) {
    const all = [...data.keys()].filter(k => k.startsWith(prefix)).sort();
    const start = cursor ? all.indexOf(cursor) + 1 : 0;
    const keys = all.slice(start, start + 2);
    return { keys, cursor: start + 2 < all.length ? keys.at(-1) : undefined };
  },
};
const base = "https://dinner.example";
let checks = 0;
function eq(actual, expected) { assert.deepEqual(actual, expected); checks++; }
async function call(path, body, headers = {}, targetStore = store) {
  return handleRequest(new Request(base + path, { method: body === undefined ? "GET" : "POST", headers: { Origin: base, "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) }), env, targetStore, "127.0.0.1");
}
const session = await call("/api/session");
eq(session.status, 200);
eq(session.headers.get("set-cookie").includes("HttpOnly; SameSite=Strict"), true);
eq(session.headers.get("set-cookie").includes("Secure"), true);
const { csrf } = await session.json();
const form = { Cookie: session.headers.get("set-cookie").split(";")[0], "X-CSRF-Token": csrf };
const answer = (kind, message = "想一起吃火锅！\n<script>保留为文本</script>", selected = ["mujinyu", "tegu"]) => ({ id: randomUUID(), kind, selected, message });
const first = answer("restaurants");
eq((await call("/api/answers", first, form)).status, 201);
eq((await call("/api/answers", { ...first, kind: "idea" }, form)).status, 200);
const second = answer("idea");
eq((await call("/api/answers", second, form)).status, 201);
let rows = [...data.entries()].filter(([k]) => k.startsWith("answers/")).map(([, v]) => v);
eq(rows.length, 2);
for (const row of rows) {
  eq(row.kind, "both");
  eq(row.message, first.message);
  eq(row.restaurants.map(r => r.id), ["mujinyu", "tegu"]);
}
eq((await call("/api/answers", answer("idea", "", ["mujinyu"]), form)).status, 201);
eq((await call("/api/answers", answer("restaurants", "只写留言", []), form)).status, 201);
eq((await call("/api/answers", answer("idea", "  ", []), form)).status, 400);
eq((await call("/api/answers", answer("idea", "字".repeat(1001)), form)).status, 400);
eq((await call("/api/answers", answer("idea", "", ["unknown"]), form)).status, 400);
eq((await call("/api/answers", first, { ...form, Origin: "https://other.example" })).status, 403);
eq((await call("/api/answers", first, { ...form, "X-CSRF-Token": "wrong" })).status, 403);
eq((await call("/api/answers", first, { ...form, Cookie: "" })).status, 403);
eq((await call("/api/answers", "x".repeat(10001), form)).status, 413);
eq((await call("/api/answers", "{", form)).status, 400);
eq((await call("/api/answers", first, { ...form, "Content-Type": "text/plain" })).status, 415);
const failingStore = { ...store, async set(key, value) { if (key.startsWith("answers/")) throw Error("simulated failure"); await store.set(key, value); } };
const failure = await call("/api/answers", answer("idea"), form, failingStore);
eq(failure.status, 503);
eq((await failure.json()).ok, undefined);

const concurrent = answer("restaurants");
const countBefore = [...data.keys()].filter(k => k.startsWith("answers/")).length;
await Promise.all([call("/api/answers", concurrent, form), call("/api/answers", concurrent, form)]);
eq([...data.keys()].filter(k => k.startsWith("answers/")).length, countBefore + 1);

eq((await call("/api/admin/answers")).status, 401);
eq((await call("/api/admin/login", { password: "wrong" })).status, 401);
eq((await call("/api/admin/login", { password: env.ADMIN_PASSWORD }, { Origin: "https://other.example" })).status, 403);
const login = await call("/api/admin/login", { password: env.ADMIN_PASSWORD });
eq(login.status, 200);
const admin = { Cookie: login.headers.get("set-cookie").split(";")[0] };
const received = [];
let cursor;
do {
  const response = await call("/api/admin/answers" + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""), undefined, admin);
  eq(response.status, 200);
  const result = await response.json(); received.push(...result.answers); cursor = result.cursor;
} while (cursor);
eq(received.length, countBefore + 1);
eq(received.find(row => row.id === first.id).message, first.message);
eq(received.find(row => row.id === first.id).restaurants.length, 2);
eq(received.some(row => "sessionId" in row), false);
eq((await call("/api/admin/logout", {}, admin)).headers.get("set-cookie").includes("Max-Age=0"), true);
eq((await handleRequest(new Request(base + "/api/admin/answers", { headers: admin }), { ...env, ADMIN_PASSWORD: "rotated-" + randomUUID() }, store)).status, 401);
console.log(`${checks} EdgeOne handler checks passed (isolated storage adapter; live cloud credentials not required).`);
