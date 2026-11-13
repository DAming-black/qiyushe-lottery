import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const html=fs.readFileSync('site/index.html','utf8');
class Element{
 constructor(tag='div'){this.tag=tag;this.value='';this.children=[];this.textContent='';this.style={};this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),toggle:(x,b)=>b?this.classes.add(x):this.classes.delete(x)}}
 append(...children){this.children.push(...children)} replaceChildren(...children){this.children=children}
 setAttribute(){} addEventListener(){} scrollIntoView(){} focus(){} getContext(){return null}
}
const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
const doc={getElementById:id=>{assert.ok(elements.has(id),id);return elements.get(id)},createElement:tag=>new Element(tag),querySelectorAll:()=>[],createTextNode:s=>s};
const store=new Map();let draws=0,registers=0,memberCalls=0;
const ticket={name:'虚拟自填成员',title:'测试活动',detail:'',total:5,quota:2,participation:'self',playMode:'choice',registered:1,capacity:5,drawn_at:null,winner:null};
const ctx=vm.createContext({document:doc,console,crypto:webcrypto,URL,URLSearchParams,setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,5)),clearTimeout,location:{origin:'https://example.test',pathname:'/',hash:'',search:'',protocol:'https:'},history:{replaceState(){}},navigator:{},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},window:{addEventListener(){},LotteryCloud:{async request(op,payload){
 if(op==='event')return {title:ticket.title,detail:'',participation:'self',registered:1,capacity:5,members:[]};
 if(op==='register'){registers++;assert.match(payload.joinToken,/^[a-f0-9]{64}$/);return {member:'test-member'}}
 if(op==='member'){memberCalls++;assert.equal(payload.member,'test-member');assert.match(payload.joinToken,/^[a-f0-9]{64}$/);return {...ticket}}
 if(op==='member-draw'){draws++;assert.match(payload.joinToken,/^[a-f0-9]{64}$/);return {...ticket,winner:1,drawn_at:'2026-11-12T00:00:00Z'}}
 throw Error('unexpected '+op);
 }}}});
vm.runInContext(fs.readFileSync('site/play.js','utf8'),ctx);
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
const get=id=>elements.get(id);
get('participation').value='self';get('participation').onchange();assert.ok(get('rosterField').classes.has('hidden'));assert.ok(!get('capacityField').classes.has('hidden'));
await vm.runInContext("loadEvent('self-test')",ctx);
assert.ok(!get('selfJoin').classes.has('hidden'));assert.equal(get('selectMember').disabled,false);
get('selfName').value='虚拟自填成员';await get('selectMember').onclick();assert.equal(registers,1);assert.equal(memberCalls,1);
const saved=JSON.parse(store.get('lucky-join-self-test'));assert.equal(saved.member,'test-member');
get('participantPlay').value='game';
const playing=get('drawButton').onclick();assert.equal(draws,0);
const stage=get('playStage');const stars=stage.children.find(e=>e.className==='star-grid');
stars.children[0].onclick();stars.children[1].onclick();assert.equal(draws,0);stars.children[2].onclick();await playing;assert.equal(draws,1);assert.ok(get('drawButton').classes.has('hidden'));
console.log('PASS 自行填名空名单可报名，凭证本地保存，小游戏集齐三颗星才请求抽签');
await vm.runInContext("loadEvent('self-test')",ctx);assert.equal(registers,1);assert.equal(memberCalls,2);
assert.equal(get('selfName').value,'虚拟自填成员');
console.log('PASS 再次打开活动复用原报名凭证，不占用新签位');
for(const mode of ['wheel','capsule']){get('participantPlay').value=mode;const before=draws;await get('drawButton').onclick();assert.equal(draws,before+1)}
get('participantPlay').value='scratch';let before=draws;let pending=get('drawButton').onclick();assert.equal(draws,before);stage.children.find(e=>e.textContent==='不便刮动？点击揭晓').onclick();await pending;assert.equal(draws,before+1);
get('participantPlay').value='game';before=draws;pending=get('drawButton').onclick();stage.children.find(e=>e.textContent==='稍后再玩').onclick();await pending;assert.equal(draws,before);assert.equal(get('drawButton').disabled,false);
console.log('PASS 转盘、经典扭蛋、刮刮乐无障碍揭晓可完成；取消小游戏不执行抽签');
