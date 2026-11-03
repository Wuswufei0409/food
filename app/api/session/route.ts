import { cookieName, readSession, signSession } from "@/lib/form-session";
export async function GET(request: Request) {
  try {
    const existing = await readSession(request);
    const id = existing || crypto.randomUUID();
    const value = `${id}.${Date.now() + 7 * 86400000}`;
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return Response.json({ csrf: id }, { headers: { "Cache-Control": "no-store", "Set-Cookie": `${cookieName}=${value}.${await signSession(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure}` } });
  } catch {
    return Response.json({ error: "暂时连接不上，请稍后重试。" }, { status: 503 });
  }
}
