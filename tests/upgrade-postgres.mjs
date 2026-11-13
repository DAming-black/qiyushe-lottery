import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_TEST_MODULE).href);
const db=new PGlite();
const actor='00000000-0000-4000-8000-000000000001';
const call=async(operation,payload,who=actor)=>(await db.query('select public.lottery_api($1,$2::jsonb,$3::uuid) as response',[operation,JSON.stringify(payload),who])).rows[0].response;
try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 await db.exec(readFileSync('supabase/migrations/202611120001_lottery.sql','utf8'));
 const old=(await call('create',{title:'升级前的活动',quota:1,names:['老成员甲','老成员乙']})).data;
 const oldEvent=(await call('event',{id:old.id})).data;
 const oldResult=(await call('member-draw',{id:old.id,member:oldEvent.members[0].id})).data;
 const snapshot=(await db.query('select id,activity_id,name,winner,drawn_at,code_hash from lottery_private.tickets order by id')).rows;
 await db.exec(readFileSync('supabase/migrations/202611120002_participation_play.sql','utf8'));
 assert.deepEqual((await db.query('select id,activity_id,name,winner,drawn_at,code_hash from lottery_private.tickets order by id')).rows,snapshot);
 assert.equal((await call('admin',old)).status,200);
 const preserved=(await call('draw',{code:old.tickets.find(t=>t.name===oldResult.name).code})).data;
 assert.equal(preserved.winner,oldResult.winner);assert.equal(preserved.drawn_at,oldResult.drawn_at);assert.equal(preserved.playMode,'capsule');
 console.log('PASS 升级前后签位、中奖结果、时间、旧邀请码与管理凭证保持不变');
 for(const playMode of ['wheel','scratch','game','choice','capsule']){
  const made=await call('create',{title:'指定名单',quota:1,names:['虚拟甲','虚拟乙'],playMode});assert.equal(made.status,201);
  const event=(await call('event',{id:made.data.id})).data;assert.equal(event.playMode,playMode);assert.equal(event.participation,'roster');
 }
 assert.equal((await call('create',{title:'非法玩法',quota:1,names:['甲'],playMode:'unknown'})).status,400);
 console.log('PASS 发起人固定玩法、参与人自选玩法及旧名单模式兼容');
 const created=await call('create',{title:'自行填名活动',quota:2,capacity:4,participation:'self',playMode:'choice'});assert.equal(created.status,201);
 const a=created.data;assert.deepEqual(a.tickets,[]);
 let event=(await call('event',{id:a.id})).data;assert.equal(event.members.length,0);assert.equal(event.registered,0);assert.equal(event.capacity,4);
 assert.equal((await call('register',{id:old.id,name:'外人',joinToken:'a'.repeat(64)})).status,400);
 assert.equal((await call('create',{title:'无效人数',quota:3,capacity:2,participation:'self'})).status,400);
 const registrations=[];
 for(let i=0;i<4;i++){
  const input={id:a.id,name:'虚拟报名'+i,joinToken:String(i).repeat(64)};
  const joined=await call('register',input);assert.equal(joined.status,201);
  const retry=await call('register',input);assert.equal(retry.data.member,joined.data.member);
  registrations.push({...input,member:joined.data.member});
 }
 assert.equal((await call('register',{id:a.id,name:'虚拟报名0',joinToken:'a'.repeat(64)})).status,409);
 assert.equal((await call('register',{id:a.id,name:'第五人',joinToken:'b'.repeat(64)})).status,409);
 assert.equal((await call('member-draw',{...registrations[0],joinToken:'wrong'})).status,403);
 assert.equal((await call('admin',a)).data.rows.length,4);
 assert.ok((await call('admin',a)).data.rows.every(r=>r.winner===null));
 event=(await call('event',{id:a.id})).data;assert.equal(event.registered,4);assert.deepEqual(event.members,[]);assert.ok(!JSON.stringify(event).includes('token'));
 console.log('PASS 自行填名、超额/重名拒绝、超时重试复用签位与报名凭证隔离');
 const results=await Promise.all(registrations.map(r=>call('member-draw',r)));
 assert.equal(results.filter(r=>r.data.winner===1).length,2);
 const retries=await Promise.all(Array.from({length:20},()=>call('member-draw',registrations[0])));
 assert.ok(retries.every(r=>r.data.drawn_at===results[0].data.drawn_at&&r.data.winner===results[0].data.winner));
 console.log('PASS 自行填名满员后恰好中签 2 人，重复抽签保持原结果与时间');
 await db.exec('set role anon');
 await assert.rejects(db.query('select * from lottery_private.claims'),/permission denied/i);
 await assert.rejects(db.query("select public.lottery_api_v1('health','{}',null)"),/permission denied/i);
 await db.exec('reset role;set role service_role');
 await assert.rejects(db.query("select public.lottery_api_v1('health','{}',null)"),/permission denied/i);
 assert.equal((await call('health',{},null)).status,200);
 console.log('PASS 私密报名凭证表及兼容函数不可被公开角色或 service_role 绕过调用');
}finally{await db.close()}
