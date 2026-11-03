import { env } from "cloudflare:workers";
import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from "@/app/chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Inbox({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getChatGPTUser();
  const owner = !!user?.email && !!env.OWNER_EMAIL && user.email.toLowerCase() === env.OWNER_EMAIL.toLowerCase();
  if (!owner) return <main className="admin-shell"><a href="/">← 返回问卷</a><h1>Adam 的小信箱</h1><p>{user ? "这个信箱仅供网站主人查看，请使用创建网站的 ChatGPT 账号登录。" : "用创建网站的 ChatGPT 账号登录，就能查看樱雪的选择和留言。"}</p><div className="admin-tools"><a className="button primary" href={user ? chatGPTSignOutPath("/adam") : chatGPTSignInPath("/adam")} target="_top">{user ? "退出当前账号" : "登录查看"}</a></div></main>;
  const params = await searchParams;
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.page) || 1)));
  try {
    if (!env.DB) throw new Error("Database missing");
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM answers").first<{ total: number }>();
    const { results } = await env.DB.prepare("SELECT id, kind, restaurants, message, created_at FROM answers ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET ?").bind((page - 1) * 20).all<{ id: string; kind: string; restaurants: string; message: string; created_at: string }>();
    return <main className="admin-shell"><div className="admin-heading"><div><a href="/">← 返回问卷</a><h1>Adam 的小信箱 ♡</h1></div><a href={chatGPTSignOutPath("/adam")} target="_top" className="admin-small">退出登录</a></div><p>共收到 {count?.total || 0} 份心意。只有你能看见这里。</p><div className="admin-tools"><a className="button primary" href={`/adam?page=${page}`}>刷新收件箱</a><a className="button secondary" href={`/api/export?page=${page}`}>导出本页 JSON</a></div>{results.length === 0 ? <div className="admin-empty">还没有收到新消息，期待第一份心意。</div> : results.map(row => <article className="admin-card" key={row.id}><h2>{row.kind === "both" ? "💌 樱雪的餐厅选择与留言" : row.kind === "idea" ? "💌 樱雪的小想法" : "♡ 樱雪心动的餐厅"}</h2><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（北京时间）</time>{row.message && <p className="admin-message">{row.message}</p>}{JSON.parse(row.restaurants).length > 0 && <ul className="admin-selected">{(JSON.parse(row.restaurants) as Array<{ id:string;name:string;price:string;priceNote:string;branch:string }>).map(r => <li key={r.id}><strong>{r.name}</strong><br/><span className="admin-small">{r.branch} · ¥{r.price} · {r.priceNote}</span></li>)}</ul>}</article>)}<nav className="admin-pager">{page > 1 ? <a className="button secondary" href={`/adam?page=${page-1}`}>上一页</a> : <span/>}<span className="admin-small">第 {page} 页</span>{page * 20 < (count?.total || 0) ? <a className="button secondary" href={`/adam?page=${page+1}`}>下一页</a> : <span/>}</nav></main>;
  } catch {
    return <main className="admin-shell"><h1>信箱暂时连接不上</h1><p>请稍后刷新页面。已保存的内容不会因此丢失。</p><a className="button primary" href="/adam">重新连接</a></main>;
  }
}
