import {createHandler} from './handler.mjs';
const list=(name:string)=>(Deno.env.get(name)||'').split(',').map(s=>s.trim()).filter(Boolean);
Deno.serve(createHandler({
 projectUrl:Deno.env.get('SUPABASE_URL')||'',
 serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',
 origins:list('FRONTEND_ORIGINS'),
 creatorEmails:list('CREATOR_EMAILS').map(s=>s.toLowerCase())
}));
