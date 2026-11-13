import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('site/index.html','utf8');
class Element{constructor(){this.value='';this.textContent='';this.children=[];this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x)}}append(...x){this.children.push(...x)}replaceChildren(...x){this.children=x}addEventListener(){}scrollIntoView(){this.scrolled=true}focus(){this.focused=true}remove(){}select(){}}
const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
const document={getElementById:id=>{assert.ok(elements.has(id),'missing '+id);return elements.get(id)},querySelectorAll:()=>[],createElement:()=>new Element(),createTextNode:s=>s};
const location={origin:'https://user.github.io',pathname:'/qiyushe-lottery/',search:'',_hash:'',protocol:'https:',get hash(){return this._hash},set hash(v){this._hash=v?(v.startsWith('#')?v:'#'+v):''}};
const store=new Map();let created=false,drawn=false,copied='';let passwordRequests=0;
const rows=['甲','乙','丙','丁'].map(name=>({name,drawn_at:null,winner:null}));
const ctx=vm.createContext({document,location,URL,URLSearchParams,AbortController,atob,console,setTimeout,clearTimeout,history:{replaceState(_,__,url){location.hash=new URL(url).hash;location.search=new URL(url).search}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},navigator:{clipboard:{async writeText(s){copied=s}}},window:{LOTTERY_CONFIG:{supabaseUrl:'https://project.example',publishableKey:'sb_publishable_test_only',functionName:'lottery'},addEventListener(){}},fetch:async(url,options)=>{
 const b=options.body?JSON.parse(options.body):{};
 if(url.endsWith('/token?grant_type=password')){passwordRequests++;assert.equal(b.email,'owner@example.test');if(b.password==='wrong-test')return Response.json({error_code:'invalid_credentials',msg:'Invalid login credentials'},{status:400});assert.equal(b.password,'correct-test-placeholder');return Response.json({access_token:'test-user-token',refresh_token:'test-refresh',expires_in:3600,user:{id:'test-user-id',email:'owner@example.test'}});}
 if(url.endsWith('/logout'))return Response.json({});
 assert.equal(url,'https://project.example/functions/v1/lottery');
 if(b.operation==='create'){assert.equal(options.headers.Authorization,'Bearer test-user-token');created=true;return Response.json({id:'test-activity',admin:'test-admin-capability',tickets:rows.map(r=>({name:r.name,code:'test-code'}))})}
 if(b.operation==='admin')return Response.json({title:'前端验证',detail:'',quota:2,rows});
 if(b.operation==='event')return Response.json({title:'前端验证',detail:'',quota:2,members:rows.map((r,i)=>({id:String(i),...r}))});
 if(b.operation==='member'||b.operation==='member-draw'){if(b.operation==='member-draw')drawn=true;return Response.json({title:'前端验证',detail:'',quota:2,total:4,name:'甲',winner:drawn?1:null,drawn_at:drawn?'2026-11-12T00:00:00Z':null})}
 if(b.operation==='health')return Response.json({service:'ready',database:'ready'});
 throw Error('unexpected operation '+b.operation);
}});
vm.runInContext(readFileSync('site/cloud.js','utf8'),ctx);
vm.runInContext(readFileSync('site/play.js','utf8'),ctx);
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
await assert.rejects(vm.runInContext("api('create',{})",ctx),/邮箱登录/);assert.ok(elements.get('authEmail').focused);console.log('PASS 未登录创建活动时定位邮箱登录，成员流程不要求登录');
elements.get('authEmail').value='owner@example.test';elements.get('authPassword').value='wrong-test';await elements.get('authForm').onsubmit({preventDefault(){}});assert.equal(elements.get('authPassword').value,'');assert.ok(!store.has('qiyushe-supabase-session-v1'));assert.match(elements.get('authStatus').textContent,/邮箱或密码不正确/);console.log('PASS 错误密码不建立会话，并清空密码框');
elements.get('authPassword').value='correct-test-placeholder';await elements.get('authForm').onsubmit({preventDefault(){}});assert.equal(passwordRequests,2);assert.match(elements.get('authStatus').textContent,/已登录/);assert.equal(elements.get('authPassword').value,'');assert.ok(!store.get('qiyushe-supabase-session-v1').includes('correct-test-placeholder'));assert.ok(!html.includes('id="authSend"'));console.log('PASS 邮箱密码登录：不调用发信接口，不保存密码，登录后清空密码框');
elements.get('createNav').onclick();assert.ok(elements.get('createForm').scrolled);
elements.get('title').value='前端验证';elements.get('names').value='甲、乙、丙、丁';elements.get('quota').value='2';vm.runInContext('renderRoster()',ctx);await elements.get('createForm').onsubmit({preventDefault(){}});assert.ok(created);await vm.runInContext('route()',ctx);
assert.equal(elements.get('groupLink').value,'https://user.github.io/qiyushe-lottery/?event=test-activity');await elements.get('copyGroup').onclick();assert.ok(copied.includes('?event=test-activity'));assert.ok(!copied.includes('test-admin-capability'));console.log('PASS 顿号名单创建与 Pages 子路径群链接，不泄露管理凭证');
location.search='?event=test-activity';location.hash='';await vm.runInContext('route()',ctx);assert.equal(elements.get('memberSelect').children.length,5);assert.ok(elements.get('authPanel').classes.has('hidden'));elements.get('memberSelect').value='0';await elements.get('selectMember').onclick();await elements.get('drawButton').onclick();assert.ok(drawn);assert.ok(elements.get('drawButton').classes.has('hidden'));console.log('PASS 共用链接选姓名、扭蛋揭晓与隐藏重复按钮，动漫 SVG 保留');
await elements.get('authLogout').onclick();assert.ok(!store.has('qiyushe-supabase-session-v1'));console.log('PASS 退出登录清除本机会话；前端密码登录与抽签处理测试通过（不是浏览器视觉测试）');
async function callbackTest(fragment,response){
 store.clear();location.search='';location.hash=fragment;
 let checked=0;
 const callbackCtx=vm.createContext({...ctx,window:{LOTTERY_CONFIG:ctx.window.LOTTERY_CONFIG,addEventListener(){}},fetch:async(url,options)=>{
  checked++;assert.equal(location.hash,'');assert.equal(options.method,'GET');assert.equal(url,'https://project.example/auth/v1/user');assert.equal(options.headers.Authorization,'Bearer test-callback-token');return response;
 }});
 vm.runInContext(readFileSync('site/cloud.js','utf8'),callbackCtx);await callbackCtx.window.LotteryCloud.ready;
 return checked;
}
const callbackHash='#access_token=test-callback-token&refresh_token=test-callback-refresh&expires_in=3600&type=magiclink';
assert.equal(await callbackTest(callbackHash,Response.json({id:'test-user-id',email:'owner@example.test'})),1);assert.ok(store.has('qiyushe-supabase-session-v1'));assert.match(elements.get('authStatus').textContent,/已登录/);assert.equal(location.hash,'');console.log('PASS 邮件链接回调：先清除地址栏令牌，再向 Supabase 验证并登录');
await callbackTest(callbackHash,Response.json({message:'Invalid token'},{status:401}));assert.ok(!store.has('qiyushe-supabase-session-v1'));assert.match(elements.get('authStatus').textContent,/登录失败/);console.log('PASS 伪造或失效的邮件回调不会建立会话');
assert.equal(await callbackTest('#error=access_denied&error_description=expired',Response.json({})),0);assert.ok(!store.has('qiyushe-supabase-session-v1'));assert.equal(location.hash,'');assert.match(elements.get('authStatus').textContent,/过期/);console.log('PASS 过期链接给出重发提示并清除地址栏错误参数');
const goodFetch=ctx.fetch;
ctx.fetch=async()=>Response.json({error:'test network unavailable'},{status:503});
await vm.runInContext("loadEvent('test-activity')",ctx);
assert.equal(elements.get('memberSelect').disabled,true);assert.equal(elements.get('selectMember').disabled,true);assert.ok(!elements.get('retryMembers').classes.has('hidden'));assert.match(elements.get('memberLoadStatus').textContent,/没有执行抽签/);console.log('PASS 名单读取失败：显示错误、禁用抽签按钮、提供重试入口');
ctx.fetch=goodFetch;await elements.get('retryMembers').onclick();
assert.equal(elements.get('memberSelect').disabled,false);assert.equal(elements.get('selectMember').disabled,false);assert.equal(elements.get('memberSelect').children.length,5);assert.ok(elements.get('retryMembers').classes.has('hidden'));assert.match(elements.get('memberLoadStatus').textContent,/已加载 4 位/);console.log('PASS 网络恢复后重试：重新读取名单并恢复姓名选择');
