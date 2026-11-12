import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {prepareNetlify} from '../scripts/prepare-netlify.mjs';
const output=mkdtempSync(join(tmpdir(),'qiyushe-netlify-test-'));
prepareNetlify(output);
const built=vm.createContext({window:{}});vm.runInContext(readFileSync(join(output,'config.js'),'utf8'),built);
assert.equal(built.window.LOTTERY_CONFIG.proxyBasePath,'/supabase');
assert.equal(readFileSync(join(output,'index.html'),'utf8'),readFileSync('site/index.html','utf8'));
console.log('PASS Netlify 构建：原 UI 保留，只有目标构建启用同站后台入口');
const toml=readFileSync('netlify.toml','utf8');
const rules=toml.split('[[redirects]]').slice(1).map(block=>({from:block.match(/from = "([^"]+)"/)[1],to:block.match(/to = "([^"]+)"/)[1]}));
assert.equal(rules.length,2);assert.ok(rules.every(r=>r.to.startsWith('https://talzluzsziyjxtykjgxl.supabase.co/')));assert.ok(!/headers\s*=\s*\{Origin/.test(toml));
console.log('PASS 转发配置只指向现有 Supabase 项目，不包含后台密钥或任意目标转发');
const observed=[];
const upstream=http.createServer(async(req,res)=>{
 const chunks=[];for await(const c of req)chunks.push(c);
 const text=Buffer.concat(chunks).toString();const body=text?JSON.parse(text):{};
 observed.push({path:req.url,method:req.method,origin:req.headers.origin,authorization:req.headers.authorization,body});
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 if(req.url==='/auth/v1/token?grant_type=password')res.end(JSON.stringify({access_token:'test-proxy-token',refresh_token:'test-refresh',expires_in:3600,user:{id:'test-user',email:'owner@example.test'}}));
 else if(req.url==='/functions/v1/quick-function')res.end(JSON.stringify(body.operation==='event'?{members:[{id:'test-member',name:'虚拟成员'}]}:{service:'ready',database:'ready'}));
 else {res.statusCode=404;res.end('{}')}
});
await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
// Local simulation of the documented Netlify rewrite semantics. This does not
// assert that a real Netlify deployment or any particular mobile network works.
const relay=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const rule=rules.find(r=>r.from.endsWith('*')?url.pathname.startsWith(r.from.slice(0,-1)):url.pathname===r.from);
 if(!rule){res.writeHead(404);res.end();return}
 const suffix=rule.from.endsWith('*')?url.pathname.slice(rule.from.length-1):'';
 const target=new URL(rule.to.replace(':splat',suffix));
 const chunks=[];for await(const c of req)chunks.push(c);
 const response=await fetch(`http://127.0.0.1:${upstream.address().port}${target.pathname}${url.search}`,{method:req.method,headers:{...req.headers,host:'127.0.0.1'},...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise(r=>relay.listen(0,'127.0.0.1',r));
try{
 const origin=`http://127.0.0.1:${relay.address().port}`;
 const nodes=new Map();function element(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',classList:{toggle(){},add(){},remove(){}},scrollIntoView(){},focus(){}});return nodes.get(id)}
 const storage=new Map();const urls=[];
 const context=vm.createContext({window:{LOTTERY_CONFIG:built.window.LOTTERY_CONFIG},document:{getElementById:element},location:{origin,pathname:'/',search:'',hash:'',protocol:'http:'},history:{replaceState(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},URLSearchParams,AbortController,atob,setTimeout,clearTimeout,fetch:async(url,options)=>{urls.push(url);assert.equal(new URL(url).origin,origin);return fetch(url,{...options,headers:{...options.headers,Origin:origin}})}});
 vm.runInContext(readFileSync('site/cloud.js','utf8'),context);
 const event=await context.window.LotteryCloud.request('event',{id:'test-activity'});assert.equal(event.members.length,1);
 element('authEmail').value='owner@example.test';element('authPassword').value='test-only-password';await element('authForm').onsubmit({preventDefault(){}});assert.match(element('authStatus').textContent,/已登录/);
 await context.window.LotteryCloud.request('create',{title:'test'});
 assert.ok(urls.every(url=>url.startsWith(origin+'/supabase/')));
 assert.ok(observed.every(r=>r.origin===origin));
 assert.equal(observed.find(r=>r.path.includes('grant_type=password')).body.password,'test-only-password');
 assert.equal(observed.at(-1).authorization,'Bearer test-proxy-token');
 assert.equal(element('authPassword').value,'');assert.ok(![...storage.values()].some(v=>v.includes('test-only-password')));
 console.log('PASS 本地 HTTP 转发：密码登录、会话与活动请求全程只连接同站地址');
 assert.equal((await fetch(origin+'/supabase/not-allowed')).status,404);
 console.log('PASS 转发路径限制；本地模拟通过，不代表真实 Netlify 或微信网络验收');
}finally{await new Promise(r=>relay.close(r));await new Promise(r=>upstream.close(r))}
