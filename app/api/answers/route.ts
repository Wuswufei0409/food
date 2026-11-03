import { env } from "cloudflare:workers";
import { readSession, sameOrigin } from "@/lib/form-session";
import { validateAnswer } from "@/lib/answer-validation";

export async function POST(request: Request) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!sameOrigin(request)) return json({ error: "请在问卷页面内提交。" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "提交格式不正确。" }, 415);
  try {
    const sessionId = await readSession(request);
    if (!sessionId || request.headers.get("x-csrf-token") !== sessionId) return json({ error: "页面连接已过期，请再次点击发送。" }, 403);
    // Bound streamed input too, even when Content-Length is absent.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "提交内容不能为空。" }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 10000) { await reader.cancel(); return json({ error: "留言内容太长了。" }, 413); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let answer;
    try { answer = validateAnswer(JSON.parse(new TextDecoder().decode(bytes))); }
    catch (error) { return json({ error: error instanceof SyntaxError ? "提交格式不正确。" : (error as Error).message }, 400); }
    if (!env.DB) throw new Error("Database missing");
    const existing = await env.DB.prepare("SELECT id, kind, restaurants, message, session_id FROM answers WHERE id = ?").bind(answer.id).first();
    if (existing) {
      if (existing.session_id !== sessionId || existing.kind !== answer.kind || existing.restaurants !== answer.restaurants || existing.message !== answer.message) return json({ error: "这次提交已经处理，请刷新后再试。" }, 409);
      return json({ ok: true, id: answer.id });
    }
    const since = new Date(Date.now() - 86400000).toISOString();
    const saved = await env.DB.prepare("INSERT INTO answers (id, kind, restaurants, message, session_id, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM answers WHERE session_id = ? AND created_at > ?) < 10 ON CONFLICT(id) DO NOTHING").bind(answer.id, answer.kind, answer.restaurants, answer.message, sessionId, new Date().toISOString(), sessionId, since).run();
    if (!saved.meta.changes) {
      const duplicate = await env.DB.prepare("SELECT id, kind, restaurants, message, session_id FROM answers WHERE id = ?").bind(answer.id).first();
      if (duplicate?.session_id === sessionId && duplicate.kind === answer.kind && duplicate.restaurants === answer.restaurants && duplicate.message === answer.message) return json({ ok: true, id: answer.id });
      return json({ error: "今天已经收到很多想法啦，明天再来吧。" }, 429);
    }
    return json({ ok: true, id: answer.id }, 201);
  } catch (error) {
    console.error("Answer persistence failed", error instanceof Error ? error.message : "Unknown failure");
    return json({ error: "暂时没有发送成功，你的内容还在，请稍后再试。" }, 503);
  }
}
