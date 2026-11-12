import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/lottery/handler.mjs';
let bodies=[],authCount=0;
const service='test-service-only';
const handler=createHandler({projectUrl:'https://project.example',serviceKey:service,origins:['https://site.example'],creatorEmails:['owner@example.test'],fetchImpl:async(url,options)=>{
 if(url.endsWith('/user')){authCount++;return Response.json({id:'00000000-0000-4000-8000-000000000001',email:'owner@example.test',email_confirmed_at:'2026-11-12T00:00:00Z'})}
 bodies.push(JSON.parse(options.body));return Response.json({status:200,data:{service:'ready'}});
}});
const req=(operation,headers={})=>new Request('https://project.example/functions/v1/lottery',{method:'POST',headers:{origin:'https://site.example','Content-Type':'application/json',...headers},body:JSON.stringify({operation,payload:{actor_id:'spoofed'}})});
assert.equal((await handler(new Request('https://project.example',{method:'OPTIONS',headers:{origin:'https://site.example'}}))).status,204);
assert.equal((await handler(req('health',{origin:'https://other.example'}))).status,403);console.log('PASS Edge CORS 预检放行白名单，其他域名拒绝');
assert.equal((await handler(req('create'))).status,401);assert.equal(bodies.length,0);
assert.equal((await handler(req('create',{authorization:'Bearer user-token'}))).status,200);assert.equal(authCount,1);assert.equal(bodies[0].actor_id,'00000000-0000-4000-8000-000000000001');console.log('PASS Edge 创建必须验证用户，不能使用前端伪造的用户 ID');
const member=await handler(req('member-draw'));assert.equal(member.status,200);assert.equal(bodies[1].actor_id,null);assert.ok(!(await member.text()).includes(service));console.log('PASS Edge 群成员无需登录，响应不泄漏服务端密钥');
const denied=createHandler({projectUrl:'https://project.example',serviceKey:service,origins:['https://site.example'],fetchImpl:async()=>new Response('',{status:401})});assert.equal((await denied(req('create',{authorization:'Bearer wrong-token'}))).status,401);
console.log('PASS Edge 无效会话被拒绝；4 项边缘处理测试通过');
