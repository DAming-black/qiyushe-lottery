export function createHandler({projectUrl,serviceKey,origins,creatorEmails=[],fetchImpl=fetch}) {
 const allowed=new Set(origins);
 const operations=new Set(['create','register','event','admin','member','member-draw','ticket','draw','health']);
 return async function(request) {
  const origin=request.headers.get('origin');
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Max-Age':'600'};
  const send=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(origin&&!allowed.has(origin))return send({error:'当前网站域名未获后台授权，请配置 FRONTEND_ORIGINS'},403);
  if(origin)headers['Access-Control-Allow-Origin']=origin;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!projectUrl||!serviceKey||allowed.size===0)return send({error:'后台配置未完成'},503);
  if(request.method!=='POST')return send({error:'请使用 POST 请求'},405);
  if(!request.headers.get('content-type')?.includes('application/json'))return send({error:'请求格式无效'},415);
  try {
   if(Number(request.headers.get('content-length')||0)>60000)return send({error:'内容过长'},413);
   const text=await request.text();if(text.length>60000)return send({error:'内容过长'},413);
   let b;try{b=JSON.parse(text)}catch{return send({error:'JSON 格式错误'},400)}
   if(!b||!operations.has(b.operation)||!b.payload||Array.isArray(b.payload)||typeof b.payload!=='object')return send({error:'请求内容无效'},400);
   let actor=null;
   if(b.operation==='create') {
    const authorization=request.headers.get('authorization')||'';
    if(!authorization.startsWith('Bearer '))return send({error:'发起活动前请先完成邮箱登录'},401);
    const auth=await fetchImpl(projectUrl+'/auth/v1/user',{headers:{apikey:serviceKey,authorization},signal:AbortSignal.timeout(12000)});
    if(!auth.ok)return send({error:'登录已失效，请重新发送邮箱登录链接'},401);
    const user=await auth.json();
    if(!user.id||!user.email_confirmed_at)return send({error:'请完成邮箱验证后再发起活动'},401);
    if(creatorEmails.length&&!creatorEmails.includes(String(user.email||'').toLowerCase()))return send({error:'当前邮箱未获发起活动权限'},403);
    actor=user.id;
   }
   const response=await fetchImpl(projectUrl+'/rest/v1/rpc/lottery_api',{method:'POST',headers:{apikey:serviceKey,authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},body:JSON.stringify({operation:b.operation,payload:b.payload,actor_id:actor}),signal:AbortSignal.timeout(20000)});
   if(!response.ok)return send({error:'数据库服务暂时不可用，请检查后台迁移与日志'},503);
   const result=await response.json();
   if(!Number.isInteger(result.status)||!result.data)return send({error:'数据库响应格式无效'},503);
   return send(result.data,result.status);
  } catch(e) {console.error('lottery request failed',e?.name||'error');return send({error:'后台请求失败或超时，请稍后重试'},503);}
 };
}
