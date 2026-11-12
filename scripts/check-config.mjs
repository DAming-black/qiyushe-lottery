import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({window:{}});vm.runInContext(readFileSync('site/config.js','utf8'),ctx,{timeout:1000});
const c=ctx.window.LOTTERY_CONFIG;
if(!c||!/^https:\/\/[a-z0-9.-]+$/i.test(c.supabaseUrl||'')||!c.publishableKey)throw Error('请先配置 site/config.js：Supabase 项目 URL 与公开 publishable key。');
if(c.publishableKey.startsWith('sb_secret_'))throw Error('前端配置禁止包含 secret key');
if(c.publishableKey.split('.').length===3){let data;try{data=JSON.parse(Buffer.from(c.publishableKey.split('.')[1],'base64url').toString())}catch{throw Error('公开密钥格式无效')}if(data.role!=='anon')throw Error('前端 JWT 只允许旧版 anon key，不允许 service_role');}
else if(!c.publishableKey.startsWith('sb_publishable_'))throw Error('请使用项目的公开 publishable key');
if(!/^[a-z0-9_-]+$/i.test(c.functionName||''))throw Error('云函数名称格式无效');
console.log('PASS 前端公开配置检查（不输出密钥内容）');
