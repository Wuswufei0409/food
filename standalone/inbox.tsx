import { useEffect, useState } from "react";
type Answer = { id:string; restaurants:Array<{id:string;name:string;branch:string;price:string;priceNote:string}>;message:string;createdAt:string };
export default function Inbox() {
  const [items,setItems]=useState<Answer[]>([]), [authenticated,setAuthenticated]=useState(false);
  const [password,setPassword]=useState(""), [error,setError]=useState(""), [loading,setLoading]=useState(true);
  const [cursor,setCursor]=useState<string|undefined>();
  async function refresh(next?:string) {
    setLoading(true);setError("");
    try {
      const r=await fetch("/api/admin/answers"+(next?`?cursor=${encodeURIComponent(next)}`:""),{cache:"no-store"});
      if(r.status===401){setAuthenticated(false);setItems([]);return;}
      const data=await r.json() as {answers:Answer[];cursor?:string;error?:string};
      if(!r.ok)throw Error(data.error||"暂时无法读取信箱。");
      setAuthenticated(true);setItems(data.answers);setCursor(data.cursor);
    }catch(e){setError((e as Error).message);}finally{setLoading(false);}
  }
  useEffect(()=>{void refresh();},[]);
  async function login(e:React.FormEvent){
    e.preventDefault();setLoading(true);setError("");
    try{
      const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
      const data=await r.json() as {error?:string};if(!r.ok)throw Error(data.error||"登录失败。");
      setPassword("");await refresh();
    }catch(e){setError((e as Error).message);}finally{setLoading(false);}
  }
  async function logout(){
    setLoading(true);setError("");
    try{const r=await fetch("/api/admin/logout",{method:"POST"});if(!r.ok)throw Error("暂时无法退出，请重试。");setItems([]);setAuthenticated(false);setCursor(undefined);}catch(e){setError((e as Error).message);}finally{setLoading(false);}
  }
  return <main className="admin-shell"><div className="admin-heading"><div><a href="/">← 返回问卷</a><h1>Adam 的小信箱 ♡</h1></div>{authenticated&&<button className="button secondary" onClick={logout} disabled={loading}>退出登录</button>}</div>{error&&<p className="error" role="alert">{error}</p>}{!authenticated?<form className="admin-card admin-login" onSubmit={login}><p>输入管理员口令，查看收到的餐厅选择和留言。</p><label htmlFor="admin-password">管理员口令</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={256}/><button className="button primary" disabled={loading}>{loading?"正在连接…":"登录查看"}</button></form>:<><p>每份答卷中的餐厅和留言，都会一起显示在这里。</p><div className="admin-tools"><button className="button primary" onClick={()=>refresh()} disabled={loading}>{loading?"正在读取…":"刷新收件箱"}</button><button className="button secondary" onClick={()=>{const blob=new Blob([JSON.stringify(items,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="dinner-answers.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}} disabled={loading||!items.length}>导出本页 JSON</button></div>{!items.length&&!loading&&<p className="admin-empty">还没有收到新消息，期待第一份心意。</p>}{items.map(a=><article className="admin-card" key={a.id}><h2>💌 樱雪的心意</h2><time dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false})}（北京时间）</time>{a.restaurants.length>0&&<ul className="admin-selected">{a.restaurants.map(r=><li key={r.id}><strong>{r.name}</strong><br/><span className="admin-small">{r.branch} · ¥{r.price} · {r.priceNote}</span></li>)}</ul>}{a.message&&<p className="admin-message">{a.message}</p>}</article>)}{cursor&&<button className="button secondary" disabled={loading} onClick={()=>refresh(cursor)}>下一页答卷</button>}</>}</main>;
}
