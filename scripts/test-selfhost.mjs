import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { request as httpRequest } from 'node:http';
import { createDinnerServer } from '../dist-selfhost/server.mjs';
const directory = await mkdtemp(join(tmpdir(),'food-selfhost-'));
const database = join(directory,'answers.sqlite');
const env = { SESSION_SECRET:randomBytes(32).toString('hex'), ADMIN_PASSWORD:randomBytes(32).toString('hex'), PUBLIC_ORIGIN:'https://dinner.example', DATABASE_PATH:database };
const options = { env, staticDir:resolve('dist-selfhost/public') };
let running, base, checks=0;
function eq(a,b){assert.deepEqual(a,b);checks++;}
async function start(){running=createDinnerServer(options);await new Promise(resolve=>running.server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${running.server.address().port}`;}
async function stop(){await new Promise((resolve,reject)=>running.server.close(error=>error?reject(error):resolve()));}
async function call(path,body,headers={}){return fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:base,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});}
function rawStatus(url,options={}){return new Promise((resolve,reject)=>{const r=httpRequest(url,options,response=>{response.resume();resolve(response.statusCode);});r.on('error',reject);r.end(options.body);});}
const choice=(kind='restaurants',message='本地服务器验收：餐厅和留言一起保存。')=>({id:randomUUID(),kind,selected:['mujinyu','tegu'],message});
await start();
try{
  eq((await fetch(base+'/')).status,200);
  eq((await fetch(base+'/adam')).status,200);
  eq((await fetch(base+'/images/restaurant-1.webp')).status,200);
  eq((await fetch(base+'/.env')).status,404);
  eq((await fetch(base+'/server.mjs')).status,404);
  eq((await fetch(base+'/api/health')).status,200);
  eq((await fetch(base+'/api/admin/answers')).status,401);
  const session=await call('/api/session');const {csrf}=await session.json();
  const form={Cookie:session.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':csrf};
  const first=choice();const second=choice('idea','从留言页发送也要保留餐厅。');
  eq((await call('/api/answers',first,form)).status,201);
  eq((await call('/api/answers',{...first,kind:'idea'},form)).status,200);
  eq((await call('/api/answers',second,form)).status,201);
  eq((await call('/api/answers',choice(),{...form,Origin:'https://bad.example'})).status,403);
  eq((await call('/api/answers',choice(),{...form,'X-CSRF-Token':'bad'})).status,403);
  eq((await call('/api/answers',{...choice(),selected:[],message:'  '},form)).status,400);
  const save=running.store.saveAnswer.bind(running.store);
  running.store.saveAnswer=async()=>{throw Error('simulated storage failure');};
  eq((await call('/api/answers',choice(),form)).status,503);
  running.store.saveAnswer=save;
  const repeated=choice();
  const repeatedResults=await Promise.all(Array.from({length:8},()=>call('/api/answers',repeated,form)));
  eq(repeatedResults.filter(r=>r.status===201).length,1);
  eq(repeatedResults.filter(r=>r.status===200).length,7);
  const many=await Promise.all(Array.from({length:12},()=>call('/api/answers',choice(),form)));
  eq(many.filter(r=>r.status===201).length,7);
  eq(many.filter(r=>r.status===429).length,5);
  eq(running.store.db.prepare('SELECT COUNT(*) AS n FROM answers').get().n,10);
  eq((await call('/api/admin/login',{password:'wrong'})).status,401);
  const login=await call('/api/admin/login',{password:env.ADMIN_PASSWORD});eq(login.status,200);
  const admin={Cookie:login.headers.get('set-cookie').split(';')[0]};
  const rows=await (await call('/api/admin/answers',undefined,admin)).json();
  for(const submitted of [first,second]){
    const row=rows.answers.find(r=>r.id===submitted.id);
    eq(row.message,submitted.message);eq(row.kind,'both');eq(row.restaurants.map(r=>r.id),submitted.selected);eq('sessionId' in row,false);
  }
  const savedTime=rows.answers.find(r=>r.id===repeated.id).createdAt;
  await call('/api/answers',repeated,form);
  eq((await (await call('/api/admin/answers',undefined,admin)).json()).answers.find(r=>r.id===repeated.id).createdAt,savedTime);
  const backupPath=join(directory,'backup.sqlite');await running.store.backup(backupPath);
  const backupDb=new DatabaseSync(backupPath,{readOnly:true});eq(backupDb.prepare('SELECT COUNT(*) AS n FROM answers').get().n,10);backupDb.close();
  await stop();await start();
  const after=await (await call('/api/admin/answers',undefined,admin)).json();eq(after.answers.length,10);eq(after.answers.find(r=>r.id===first.id).message,first.message);
  eq(await rawStatus(base+'/api/admin/answers',{headers:{Host:'dinner.example','X-Forwarded-For':'192.0.2.1'}}),401);
  eq(await rawStatus(base+'/api/health',{headers:{Host:'bad.example'}}),421);
  const insecure=createDinnerServer({...options,env:{...env,PUBLIC_ORIGIN:'http://dinner.example'},store:undefined});await new Promise(resolve=>insecure.server.listen(0,'127.0.0.1',resolve));
  const blocked=await rawStatus(`http://127.0.0.1:${insecure.server.address().port}/api/admin/login`,{method:'POST',headers:{Host:'dinner.example',Origin:'http://dinner.example','X-Forwarded-For':'192.0.2.1','Content-Type':'application/json'},body:JSON.stringify({password:env.ADMIN_PASSWORD})});eq(blocked,403);await new Promise(resolve=>insecure.server.close(resolve));
  console.log(`${checks} self-host checks passed: real SQLite, restart, backup, both send paths, atomic retries and quota, private admin, static assets.`);
}finally{await stop();}
