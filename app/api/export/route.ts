import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!env.OWNER_EMAIL || !user?.email || user.email.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()) return Response.json({error:"仅网站主人可查看。"},{status:403,headers:{"Cache-Control":"no-store"}});
  if (!env.DB) return Response.json({error:"数据库暂不可用。"},{status:503});
  const page = Math.max(1, Math.min(100000, Math.floor(Number(new URL(request.url).searchParams.get("page")) || 1)));
  const { results } = await env.DB.prepare("SELECT id, kind, restaurants, message, created_at FROM answers ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET ?").bind((page-1)*20).all();
  return new Response(JSON.stringify(results.map(r=>({...r,restaurants:JSON.parse(r.restaurants as string)})),null,2),{headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":`attachment; filename="dinner-answers-page-${page}.json"`,"Cache-Control":"private, no-store"}});
}
