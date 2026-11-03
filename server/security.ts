import { createHmac, timingSafeEqual, createHash, randomUUID } from "node:crypto";
export type Settings = { SESSION_SECRET?: string; ADMIN_PASSWORD?: string };
export function configured(env:Settings) {
  if(!env.SESSION_SECRET || env.SESSION_SECRET.length<32)throw Error("SESSION_SECRET must contain at least 32 characters");
}
export function digest(value:string){return createHash("sha256").update(value).digest("hex");}
export function equal(a:string,b:string){return timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)));}
export function token(subject:string,secret:string,ttl:number){
  const value=Buffer.from(JSON.stringify({subject,expires:Date.now()+ttl,nonce:randomUUID()})).toString("base64url");
  return `${value}.${createHmac("sha256",secret).update(value).digest("hex")}`;
}
export function readToken(request:Request,name:string,secret:string){
  const value=request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="))?.slice(name.length+1);
  if(!value||value.length>2048)return null;
  const parts=value.split(".");if(parts.length!==2)return null;
  if(!equal(parts[1],createHmac("sha256",secret).update(parts[0]).digest("hex")))return null;
  try{const data=JSON.parse(Buffer.from(parts[0],"base64url").toString());return typeof data.subject==="string"&&Number.isFinite(data.expires)&&data.expires>Date.now()?data.subject:null;}catch{return null;}
}
export function cookie(request:Request,name:string,value:string,maxAge:number){
  return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${new URL(request.url).protocol==="https:"?"; Secure":""}`;
}
export function json(data:unknown,status=200,headers:Record<string,string>={}){
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",...headers}});
}
export async function readBody(request:Request){
  if(!request.headers.get("content-type")?.startsWith("application/json"))throw {status:415,message:"提交格式不正确。"};
  const reader=request.body?.getReader();if(!reader)throw {status:400,message:"内容不能为空。"};
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>10000){await reader.cancel();throw {status:413,message:"内容太长了。"};}chunks.push(r.value);}
  const merged=new Uint8Array(size);let i=0;for(const chunk of chunks){merged.set(chunk,i);i+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(merged));}catch{throw {status:400,message:"提交格式不正确。"};}
}
