import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('site/index.html','utf8');
class Element{constructor(){this.value='';this.textContent='';this.children=[];this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x)}}append(...x){this.children.push(...x)}replaceChildren(...x){this.children=x}addEventListener(){}scrollIntoView(){this.scrolled=true}focus(){this.focused=true}remove(){}select(){}}
const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
const document={getElementById:id=>{assert.ok(elements.has(id),'missing '+id);return elements.get(id)},querySelectorAll:()=>[],createElement:()=>new Element(),createTextNode:s=>s};
const location={origin:'https://user.github.io',pathname:'/qiyushe-lottery/',search:'',_hash:'',protocol:'https:',get hash(){return this._hash},set hash(v){this._hash=v?(v.startsWith('#')?v:'#'+v):''}};
const store=new Map();let created=false,drawn=false,copied='';let sentOtp=false;
const rows=['甲','乙','丙','丁'].map(name=>({name,drawn_at:null,winner:null}));
const ctx=vm.createContext({document,location,URL,URLSearchParams,AbortController,atob,console,setTimeout,clearTimeout,history:{replaceState(_,__,url){location.hash=new URL(url).hash;location.search=new URL(url).search}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},navigator:{clipboard:{async writeText(s){copied=s}}},window:{LOTTERY_CONFIG:{supabaseUrl:'https://project.example',publishableKey:'sb_publishable_test_only',functionName:'lottery'},addEventListener(){}},fetch:async(url,options)=>{
 const b=JSON.parse(options.body);
 if(url.endsWith('/otp')){sentOtp=true;return Response.json({})}
 if(url.endsWith('/verify'))return Response.json({access_token:'test-user-token',refresh_token:'test-refresh',expires_in:3600,user:{email:'owner@example.test'}});
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
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
await assert.rejects(vm.runInContext("api('create',{})",ctx),/邮箱验证码登录/);assert.ok(elements.get('authEmail').focused);console.log('PASS 未登录创建活动时定位邮箱登录，成员流程不要求登录');
elements.get('authEmail').value='owner@example.test';await elements.get('authSend').onclick();assert.ok(sentOtp);elements.get('authCode').value='123456';await elements.get('authVerify').onclick();assert.match(elements.get('authStatus').textContent,/已登录/);console.log('PASS 邮箱验证码请求、验证登录和前端会话处理');
elements.get('createNav').onclick();assert.ok(elements.get('createForm').scrolled);
elements.get('title').value='前端验证';elements.get('names').value='甲、乙、丙、丁';elements.get('quota').value='2';vm.runInContext('renderRoster()',ctx);await elements.get('createForm').onsubmit({preventDefault(){}});assert.ok(created);await vm.runInContext('route()',ctx);
assert.equal(elements.get('groupLink').value,'https://user.github.io/qiyushe-lottery/?event=test-activity');await elements.get('copyGroup').onclick();assert.ok(copied.includes('?event=test-activity'));assert.ok(!copied.includes('test-admin-capability'));console.log('PASS 顿号名单创建与 Pages 子路径群链接，不泄露管理凭证');
location.search='?event=test-activity';location.hash='';await vm.runInContext('route()',ctx);assert.equal(elements.get('memberSelect').children.length,5);assert.ok(elements.get('authPanel').classes.has('hidden'));elements.get('memberSelect').value='0';await elements.get('selectMember').onclick();await elements.get('drawButton').onclick();assert.ok(drawn);assert.ok(elements.get('drawButton').classes.has('hidden'));console.log('PASS 共用链接选姓名、扭蛋揭晓与隐藏重复按钮，动漫 SVG 保留');
await elements.get('authLogout').onclick();assert.ok(!store.has('qiyushe-supabase-session-v1'));console.log('PASS 退出登录清除本机会话；5 项前端处理测试通过（不是浏览器视觉测试）');
