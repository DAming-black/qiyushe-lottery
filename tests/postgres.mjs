import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
// Pass the absolute entrypoint to a separately installed test-only PGlite.
// Nothing is installed by this test or required by the deployed website.
const runtime=process.env.PGLITE_TEST_MODULE;
if(!runtime)throw Error('请设置 PGLITE_TEST_MODULE 为测试用 PGlite 模块的绝对入口路径。');
const {PGlite}=await import(pathToFileURL(runtime).href);
const db=new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role;');
await db.exec(readFileSync('supabase/migrations/202611120001_lottery.sql','utf8'));
const actor='00000000-0000-4000-8000-000000000001';
const call=async(operation,payload,who=actor)=>(await db.query('select public.lottery_api($1,$2::jsonb,$3::uuid) as response',[operation,JSON.stringify(payload),who])).rows[0].response;
try {
 assert.equal((await call('create',{title:'未登录',quota:1,names:['甲']},null)).status,401);
 assert.equal((await call('create',{title:'无效名额',quota:3,names:['甲','乙']})).status,400);
 assert.equal((await call('create',{title:'重名',quota:1,names:['甲','甲']})).status,400);
 console.log('PASS PostgreSQL 创建权限、名额与重名校验');
 const created=await call('create',{title:'真实 SQL 验证',detail:'虚拟数据',quota:3,names:Array.from({length:12},(_,i)=>'虚拟成员'+i)});assert.equal(created.status,201);const a=created.data;
 const event=(await call('event',{id:a.id})).data;assert.equal(event.members.length,12);assert.ok(!JSON.stringify(event).includes('winner'));assert.ok(!JSON.stringify(event).includes(a.admin));
 const before=(await call('admin',a)).data;assert.ok(before.rows.every(r=>r.winner===null));console.log('PASS PostgreSQL 未抽签位保密，共用链接只展示指定名单');
 const draws=await Promise.all(event.members.map(m=>call('member-draw',{id:a.id,member:m.id})));assert.equal(draws.filter(r=>r.data.winner===1).length,3);
 const m=event.members[0];const repeated=await Promise.all(Array.from({length:20},()=>call('member-draw',{id:a.id,member:m.id})));assert.ok(repeated.every(r=>r.data.winner===draws[0].data.winner&&r.data.drawn_at===draws[0].data.drawn_at));console.log('PASS PostgreSQL 12 人揭晓恰好 3 人中签，20 次重复提交保持同一结果与时间');
 assert.equal((await call('admin',{id:a.id,admin:'wrong'})).status,403);
 const other=(await call('create',{title:'另一个活动',quota:1,names:['其他人']})).data;
 assert.equal((await call('member-draw',{id:other.id,member:m.id})).status,404);
 assert.equal((await call('ticket',{code:a.tickets.find(t=>t.name===draws[0].data.name).code})).data.winner,draws[0].data.winner);console.log('PASS PostgreSQL 管理凭证、跨活动隔离及旧邀请码兼容');
 await db.exec('set role anon');
 await assert.rejects(db.query('select public.lottery_api($1,$2::jsonb,null)',['health','{}']),/permission denied/i);
 await assert.rejects(db.query('select * from lottery_private.tickets'),/permission denied/i);
 await db.exec('reset role; set role service_role');
 assert.equal((await call('health',{},null)).status,200);await db.exec('reset role');console.log('PASS 公开角色不能直接调用 RPC 或读取签位表；service_role 可调用');
 console.log('PostgreSQL 5 项真实 SQL 验证全部通过（WASM 单进程；不代替云端多连接压力测试）。');
}finally{await db.close()}
