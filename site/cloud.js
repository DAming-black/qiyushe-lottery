(function(){
 'use strict';
 const config=window.LOTTERY_CONFIG||{};
 const sessionKey='qiyushe-supabase-session-v1';
 const get=id=>document.getElementById(id);
 let session=null,email='';
 try{session=JSON.parse(localStorage.getItem(sessionKey)||'null')}catch{}
 function saveSession(value){session=value;try{value?localStorage.setItem(sessionKey,JSON.stringify(value)):localStorage.removeItem(sessionKey)}catch{}renderAuth()}
 function settings(){
  if(location.protocol==='file:')throw Error('请通过网站地址或本地 HTTP 服务打开，不要双击 HTML 文件。');
  if(!/^https:\/\/[a-z0-9.-]+$/i.test(config.supabaseUrl||'')||!config.publishableKey)throw Error('尚未配置 Supabase。请先填写 site/config.js 中的公开项目地址及 publishable key。');
  if(config.publishableKey.startsWith('sb_secret_'))throw Error('禁止在前端使用后台密钥，请改用 publishable key。');
  if(config.publishableKey.split('.').length===3){try{const payload=JSON.parse(atob(config.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role==='service_role')throw Error('service_role')}catch(e){if(e.message==='service_role')throw Error('禁止在前端配置 service_role。')}}
  if(!/^[a-z0-9_-]+$/i.test(config.functionName||''))throw Error('云函数名称配置无效');
  return config;
 }
 async function http(url,body,extra={}){
  const c=settings();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
  try{
   let response;try{response=await fetch(url,{method:'POST',headers:{apikey:c.publishableKey,'Content-Type':'application/json',...extra},body:JSON.stringify(body),signal:controller.signal})}catch(e){throw Error(e.name==='AbortError'?'Supabase 请求超时，请检查该网络能否访问项目地址。':'无法连接 Supabase：'+e.message+'。请检查后台地址、跨域配置及实际网络可达性。')}
   let data;try{data=await response.json()}catch{throw Error('后台返回了非 JSON 内容（HTTP '+response.status+'）')}
   if(!response.ok){const err=Error(data.error_description||data.msg||data.message||data.error||'请求失败（HTTP '+response.status+'）');err.status=response.status;throw err}
   return data;
  }finally{clearTimeout(timer)}
 }
 async function accessToken(){
  if(!session?.access_token)return null;
  if(session.expires_at>Date.now()/1000+60)return session.access_token;
  if(!session.refresh_token){saveSession(null);return null}
  try{const data=await http(settings().supabaseUrl+'/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token});saveSession({...data,expires_at:Date.now()/1000+data.expires_in});return data.access_token}catch(e){if(e.status===400||e.status===401)saveSession(null);throw e}
 }
 async function request(operation,payload){
  const c=settings();let token=null;
  if(operation==='create'){token=await accessToken();if(!token){get('authPanel').scrollIntoView({behavior:'smooth'});get('authEmail').focus();throw Error('发起活动前，请在“发起人登录”处完成邮箱验证码登录。')}}
  return http(c.supabaseUrl+'/functions/v1/'+c.functionName,{operation,payload},token?{Authorization:'Bearer '+token}:{});
 }
 function status(text){get('authStatus').textContent=text}
 function renderAuth(){if(!get('authStatus'))return;status(session?.user?.email?'已登录：'+session.user.email:'发起人需要邮箱验证登录；群成员抽签无需登录。');get('authLogout').classList.toggle('hidden',!session);get('authFields').classList.toggle('hidden',!!session)}
 async function action(button,fn){button.disabled=true;try{await fn()}catch(e){status(e.message)}finally{button.disabled=false}}
 get('authSend').onclick=()=>action(get('authSend'),async()=>{
  email=get('authEmail').value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('请输入有效邮箱');
  await http(settings().supabaseUrl+'/auth/v1/otp',{email,create_user:true});
  status('验证码已请求发送，请检查邮箱（含垃圾箱）。若邮件只有链接，请按部署说明设置验证码邮件模板。');
 });
 get('authVerify').onclick=()=>action(get('authVerify'),async()=>{
  email=get('authEmail').value.trim();const token=get('authCode').value.trim();if(!email||!/^\d{6,10}$/.test(token))throw Error('请输入邮箱及邮件内的数字验证码');
  const data=await http(settings().supabaseUrl+'/auth/v1/verify',{email,token,type:'email'});saveSession({...data,expires_at:Date.now()/1000+data.expires_in});get('authCode').value='';
 });
 get('authLogout').onclick=()=>action(get('authLogout'),async()=>{try{const token=await accessToken();if(token)await http(settings().supabaseUrl+'/auth/v1/logout',{}, {Authorization:'Bearer '+token})}finally{saveSession(null)}});
 get('cloudCheck').onclick=()=>action(get('cloudCheck'),async()=>{const result=await request('health',{});status('服务连接正常：'+result.service+' / '+result.database)});
 renderAuth();
 window.LotteryCloud={request};
})();
