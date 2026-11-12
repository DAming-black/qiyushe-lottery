import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export function prepareNetlify(output='netlify-dist'){
 const context=vm.createContext({window:{}});
 vm.runInContext(readFileSync('site/config.js','utf8'),context,{timeout:1000});
 const config=context.window.LOTTERY_CONFIG;
 if(!config?.supabaseUrl||!config.publishableKey||config.functionName!=='quick-function')throw Error('请先核对当前项目的公开配置及转发目标');
 if(config.supabaseUrl!=='https://talzluzsziyjxtykjgxl.supabase.co')throw Error('项目地址与 netlify.toml 固定目标不一致，请人工核对');
 if(!config.publishableKey.startsWith('sb_publishable_'))throw Error('本部署只接受 publishable key，不使用后台密钥');
 mkdirSync(output,{recursive:true});
 for(const entry of readdirSync('site',{withFileTypes:true})){
  if(!entry.isFile())throw Error('发现新资产目录，请先补充构建复制规则');
  copyFileSync(join('site',entry.name),join(output,entry.name));
 }
 const publicConfig={...config,proxyBasePath:'/supabase'};
 writeFileSync(join(output,'config.js'),'// Public configuration. Requests go through this website.\nwindow.LOTTERY_CONFIG = '+JSON.stringify(publicConfig,null,2)+';\n');
 return resolve(output);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log('Netlify build ready: '+prepareNetlify());
