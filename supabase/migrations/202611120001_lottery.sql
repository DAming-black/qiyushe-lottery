-- Apply once in a new Supabase project. Not a destructive reset script.
create schema if not exists lottery_private;
revoke all on schema lottery_private from public, anon, authenticated;

create table lottery_private.activities (
 id text primary key,
 title text not null,
 detail text not null,
 quota integer not null check(quota between 1 and 200),
 owner_id uuid not null,
 admin_hash text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index lottery_owner on lottery_private.activities(owner_id,created_at);
create table lottery_private.tickets (
 id text primary key,
 activity_id text not null references lottery_private.activities(id),
 name text not null,
 position integer not null,
 code_hash text not null unique,
 winner integer not null check(winner in (0,1)),
 drawn_at timestamptz,
 unique(activity_id,name)
);
create index lottery_activity on lottery_private.tickets(activity_id,position);
alter table lottery_private.activities enable row level security;
alter table lottery_private.tickets enable row level security;
revoke all on all tables in schema lottery_private from public,anon,authenticated;

-- Only the Edge Function service role may invoke this RPC. The browser cannot
-- call it directly with its public publishable key or read the private tables.
create function public.lottery_api(operation text,payload jsonb,actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 a lottery_private.activities%rowtype;
 t lottery_private.tickets%rowtype;
 names text[];
 n integer; q integer; i integer; r record;
 activity text; admin text; code text;
 ticket_list jsonb := '[]'::jsonb;
 result jsonb;
begin
 if payload is null or jsonb_typeof(payload)<>'object' then
  return jsonb_build_object('status',400,'data',jsonb_build_object('error','请求内容无效'));
 end if;
 if operation='health' then
  return jsonb_build_object('status',200,'data',jsonb_build_object('service','ready','database','ready','version','supabase-1'));
 elsif operation='create' then
  if actor_id is null then
   return jsonb_build_object('status',401,'data',jsonb_build_object('error','发起活动前请先完成邮箱登录'));
  end if;
  if jsonb_typeof(payload->'names') is distinct from 'array' or jsonb_typeof(payload->'quota') is distinct from 'number' then
   return jsonb_build_object('status',400,'data',jsonb_build_object('error','请检查名单及名额'));
  end if;
  if exists(select 1 from jsonb_array_elements(payload->'names') v where jsonb_typeof(v) is distinct from 'string') then
   return jsonb_build_object('status',400,'data',jsonb_build_object('error','名单中的每一项必须是姓名文字'));
  end if;
  names:=array(select btrim(value) from jsonb_array_elements_text(payload->'names'));
  n:=coalesce(array_length(names,1),0);
  if n<1 or n>200 or length(btrim(coalesce(payload->>'title','')))=0 or length(payload->>'title')>60
    or length(coalesce(payload->>'detail',''))>1000
    or exists(select 1 from unnest(names) x where x is null or length(x)=0 or length(x)>40)
    or (select count(distinct x) from unnest(names) x)<>n
    or (payload->>'quota')::numeric<>trunc((payload->>'quota')::numeric)
    or (payload->>'quota')::numeric<1 or (payload->>'quota')::numeric>n then
   return jsonb_build_object('status',400,'data',jsonb_build_object('error','请填写有效活动名称、1～200 位不重名的成员及有效名额'));
  end if;
  q:=(payload->>'quota')::integer;
  -- Owner lock also makes the daily create cap safe under simultaneous requests.
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text,0));
  if (select count(*) from lottery_private.activities where owner_id=actor_id and created_at>clock_timestamp()-interval '1 day')>=50 then
   return jsonb_build_object('status',429,'data',jsonb_build_object('error','今日创建活动次数已达上限'));
  end if;
  activity:=replace(gen_random_uuid()::text,'-','');
  admin:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into lottery_private.activities(id,title,detail,quota,owner_id,admin_hash)
   values(activity,btrim(payload->>'title'),coalesce(payload->>'detail',''),q,actor_id,encode(sha256(convert_to(admin,'UTF8')),'hex'));
  -- Independent cryptographic UUIDs define a uniformly random permutation;
  -- outcomes are allocated on the server and never chosen by the frontend.
  for r in select x as name,ord::integer as pos,row_number() over(order by gen_random_uuid()) as rank
   from unnest(names) with ordinality as list(x,ord) loop
   code:=replace(gen_random_uuid()::text,'-','');
   insert into lottery_private.tickets(id,activity_id,name,position,code_hash,winner)
    values(replace(gen_random_uuid()::text,'-',''),activity,r.name,r.pos,encode(sha256(convert_to(code,'UTF8')),'hex'),case when r.rank<=q then 1 else 0 end);
   ticket_list:=ticket_list||jsonb_build_array(jsonb_build_object('name',r.name,'code',code));
  end loop;
  return jsonb_build_object('status',201,'data',jsonb_build_object('id',activity,'admin',admin,'tickets',ticket_list));
 elsif operation='event' then
  select * into a from lottery_private.activities where id=payload->>'id';
  if not found then return jsonb_build_object('status',404,'data',jsonb_build_object('error','活动不存在')); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'drawn_at',drawn_at) order by position),'[]'::jsonb)
   into result from lottery_private.tickets where activity_id=a.id;
  return jsonb_build_object('status',200,'data',jsonb_build_object('id',a.id,'title',a.title,'detail',a.detail,'quota',a.quota,'members',result));
 elsif operation='admin' then
  select * into a from lottery_private.activities where id=payload->>'id'
   and admin_hash=encode(sha256(convert_to(coalesce(payload->>'admin',''),'UTF8')),'hex');
  if not found then return jsonb_build_object('status',403,'data',jsonb_build_object('error','管理凭证无效')); end if;
  select coalesce(jsonb_agg(jsonb_build_object('name',name,'drawn_at',drawn_at,'winner',case when drawn_at is not null then winner else null end) order by position),'[]'::jsonb)
   into result from lottery_private.tickets where activity_id=a.id;
  return jsonb_build_object('status',200,'data',jsonb_build_object('title',a.title,'detail',a.detail,'quota',a.quota,'created_at',a.created_at,'rows',result));
 elsif operation in ('member','member-draw','ticket','draw') then
  if operation in ('member','member-draw') then
   select * into t from lottery_private.tickets where activity_id=payload->>'id' and id=payload->>'member' for update;
  else
   select * into t from lottery_private.tickets where code_hash=encode(sha256(convert_to(coalesce(payload->>'code',''),'UTF8')),'hex') for update;
  end if;
  if not found then return jsonb_build_object('status',404,'data',jsonb_build_object('error','成员或邀请码不在活动名单中')); end if;
  if operation in ('member-draw','draw') and t.drawn_at is null then
   update lottery_private.tickets set drawn_at=clock_timestamp() where id=t.id returning * into t;
  end if;
  select * into a from lottery_private.activities where id=t.activity_id;
  select count(*) into n from lottery_private.tickets where activity_id=a.id;
  return jsonb_build_object('status',200,'data',jsonb_build_object('name',t.name,'title',a.title,'detail',a.detail,'quota',a.quota,'total',n,'drawn_at',t.drawn_at,'winner',case when t.drawn_at is not null then t.winner else null end));
 else
  return jsonb_build_object('status',404,'data',jsonb_build_object('error','接口不存在'));
 end if;
end;
$$;
revoke all on function public.lottery_api(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.lottery_api(text,jsonb,uuid) to service_role;
