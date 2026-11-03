import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SqliteStore } from './sqlite-store.mjs';
const [mode,filename]=process.argv.slice(2);
if (!['backup','import'].includes(mode) || !filename || !process.env.DATABASE_PATH) throw Error('Usage: DATABASE_PATH=... node maintenance.mjs backup|import filename');
const store=new SqliteStore(process.env.DATABASE_PATH);
try {
  if(mode==='backup') { await store.backup(filename); console.log('Database backup completed.'); }
  else {
    const rows=JSON.parse(await readFile(filename,'utf8'));
    if(!Array.isArray(rows))throw Error('Expected an exported answer array.');
    let imported=0;
    store.db.exec('BEGIN IMMEDIATE');
    try {
      for(const row of rows){
        if(typeof row.id!=='string'||typeof row.message!=='string'||typeof row.created_at!=='string')throw Error('Invalid exported answer');
        const restaurants=typeof row.restaurants==='string'?JSON.parse(row.restaurants):row.restaurants;
        if(!Array.isArray(restaurants))throw Error('Invalid restaurant snapshot');
        const key='answers/imported-sites/'+createHash('sha256').update(row.id).digest('hex')+'.json';
        if(store.getSync(key))continue;
        await store.set(key,{id:row.id,kind:row.kind,restaurants,message:row.message,sessionId:row.session_id||'imported-sites',createdAt:row.created_at});
        imported++;
      }
      store.db.exec('COMMIT');
    }catch(error){store.db.exec('ROLLBACK');throw error;}
    console.log(`Imported ${imported} historical answers; existing records preserved.`);
  }
} finally { store.close(); }
