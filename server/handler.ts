import { randomUUID } from "node:crypto";
import { validateAnswer } from "../lib/answer-validation";
import { configured, cookie, digest, equal, json, readBody, readToken, token, type Settings } from "./security";

export type StoredAnswer = {
  id: string; kind: string; restaurants: ReturnType<typeof JSON.parse>;
  message: string; sessionId: string; createdAt: string;
};
export interface AnswerStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  list(prefix: string, cursor?: string): Promise<{ keys: string[]; cursor?: string }>;
}
const DAY = 86400000;
const FORM_COOKIE = "dinner_form";
const ADMIN_COOKIE = "dinner_adam";

// Separate immutable answer keys avoid overwriting another visitor's submission.
// Content hashes make retries stable without relying on unsupported Blob locks.
export async function handleRequest(request: Request, env: Settings, store: AnswerStore, clientIp = "unknown") {
  try {
    configured(env);
    const secret = env.SESSION_SECRET!;
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");
    const isPost = request.method === "POST";
    if (isPost && request.headers.get("origin") !== url.origin) return json({ error: "请在问卷页面内提交。" }, 403);

    if (path === "/api/session" && request.method === "GET") {
      const session = readToken(request, FORM_COOKIE, secret) || randomUUID();
      return json({ csrf: session }, 200, { "Set-Cookie": cookie(request, FORM_COOKIE, token(session, secret, 7 * DAY), 7 * 86400) });
    }

    if (path === "/api/answers" && isPost) {
      const sessionId = readToken(request, FORM_COOKIE, secret);
      if (!sessionId || request.headers.get("x-csrf-token") !== sessionId) return json({ error: "页面连接已过期，请再次点击发送。" }, 403);
      const body = await readBody(request);
      let answer;
      try { answer = validateAnswer(body); }
      catch (error) { return json({ error: (error as Error).message }, 400); }
      const prefix = `answers/${digest(sessionId).slice(0, 32)}/${answer.id}/`;
      const key = prefix + digest(JSON.stringify(answer)) + ".json";
      if (await store.get(key)) return json({ ok: true, id: answer.id });
      const day = new Date().toISOString().slice(0, 10);
      const limitKey = `limits/forms/${day}/${digest(sessionId)}.json`;
      const count = await store.get<number>(limitKey) || 0;
      if (count >= 10) return json({ error: "今天已经收到很多想法啦，明天再来吧。" }, 429);
      // This counter is best-effort, not a transactional quota. Answer persistence
      // uses a separate key for every submission and never a shared array/index.
      await store.set(limitKey, count + 1);
      const record: StoredAnswer = {
        ...answer, restaurants: JSON.parse(answer.restaurants), sessionId,
        createdAt: new Date().toISOString(),
      };
      await store.set(key, record);
      return json({ ok: true, id: answer.id }, 201);
    }

    if (path.startsWith("/api/admin/")) {
      if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 24 || env.ADMIN_PASSWORD.length > 256) {
        return json({ error: "管理员口令尚未配置，请检查部署环境。" }, 503);
      }
      const adminSecret = secret + digest(env.ADMIN_PASSWORD);
      if (path === "/api/admin/login" && isPost) {
        const body = await readBody(request);
        const hour = Math.floor(Date.now() / 3600000);
        // Only the platform-provided clientIp is trusted. Raw IPs aren't stored.
        const key = `limits/login/${hour}/${digest(secret + clientIp)}.json`;
        const count = await store.get<number>(key) || 0;
        if (count >= 10) return json({ error: "尝试次数过多，请一小时后再试。" }, 429);
        if (!body || typeof body.password !== "string" || body.password.length > 256 || !equal(body.password, env.ADMIN_PASSWORD)) {
          await store.set(key, count + 1);
          return json({ error: "口令不正确。" }, 401);
        }
        return json({ ok: true }, 200, { "Set-Cookie": cookie(request, ADMIN_COOKIE, token("adam", adminSecret, DAY / 3), 28800) });
      }
      if (path === "/api/admin/logout" && isPost) {
        return json({ ok: true }, 200, { "Set-Cookie": cookie(request, ADMIN_COOKIE, "", 0) });
      }
      if (readToken(request, ADMIN_COOKIE, adminSecret) !== "adam") return json({ error: "请先登录。" }, 401);
      if (path === "/api/admin/answers" && request.method === "GET") {
        const cursor = url.searchParams.get("cursor") || undefined;
        if (cursor && cursor.length > 4096) return json({ error: "分页参数不正确。" }, 400);
        const listing = await store.list("answers/", cursor);
        const records = await Promise.all(listing.keys.map(key => store.get<StoredAnswer>(key)));
        const answers = records.filter((row): row is StoredAnswer => !!row).map(({ sessionId: _private, ...row }) => row);
        answers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return json({ answers, cursor: listing.cursor });
      }
    }
    return json({ error: "没有找到这个接口。" }, 404);
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && "message" in error) {
      const status = Number(error.status);
      if ([400, 413, 415].includes(status)) return json({ error: error.message }, status);
    }
    // Do not log submitted text, cookies, passwords, or SDK credentials.
    console.error("Dinner API request failed");
    return json({ error: "暂时没有发送成功，你的内容还在，请稍后再试。" }, 503);
  }
}
