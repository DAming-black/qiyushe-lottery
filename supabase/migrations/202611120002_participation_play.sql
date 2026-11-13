-- Additive upgrade: preserve activity IDs, admin hashes, tickets and outcomes.
begin;
alter table lottery_private.activities add column participation text not null default 'roster'
 check(participation in ('roster','self'));
alter table lottery_private.activities add column play_mode text not null default 'capsule'
 check(play_mode in ('capsule','wheel','scratch','game','choice'));
create table lottery_private.claims (
 ticket_id text primary key references lottery_private.tickets(id),
 activity_id text not null references lottery_private.activities(id),
 token_hash text not null unique,
 created_at timestamptz not null default clock_timestamp()
);
alter table lottery_private.claims enable row level security;
revoke all on lottery_private.claims from public,anon,authenticated;

-- Freeze the existing implementation as an internal compatibility helper.
do $upgrade$
declare definition text;
begin
 definition:=pg_get_functiondef('public.lottery_api(text,jsonb,uuid)'::regprocedure);
 execute replace(definition,'FUNCTION public.lottery_api(','FUNCTION public.lottery_api_v1(');
end;
$upgrade$;
revoke all on function public.lottery_api_v1(text,jsonb,uuid) from public,anon,authenticated,service_role;

create or replace function public.lottery_api(operation text,payload jsonb,actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 a lottery_private.activities%rowtype;
 t lottery_private.tickets%rowtype;
 mode text; play text; capacity integer; nm text; secret text;
 res jsonb; rows_json jsonb; extra jsonb; mapped jsonb; taken integer;
begin
 if payload is null or jsonb_typeof(payload)<>'object' then
  return jsonb_build_object('status',400,'data',jsonb_build_object('error','请求内容无效'));
 end if;
 if operation='create' then
  mode:=coalesce(payload->>'participation','roster'); play:=coalesce(payload->>'playMode','capsule');
  if mode not in ('roster','self') or play not in ('capsule','wheel','scratch','game','choice') then
   return jsonb_build_object('status',400,'data',jsonb_build_object('error','参与方式或游乐方式无效'));
  end if;
  mapped:=payload;
  if mode='self' then
   if jsonb_typeof(payload->'capacity') is distinct from 'number'
    or (payload->>'capacity')::numeric<>trunc((payload->>'capacity')::numeric)
    or (payload->>'capacity')::numeric not between 1 and 200 then
    return jsonb_build_object('status',400,'data',jsonb_build_object('error','参与人数上限须为 1～200 的整数'));
   end if;
   capacity:=(payload->>'capacity')::integer;
   select jsonb_agg('__reserved_slot_'||i) into rows_json from generate_series(1,capacity) i;
   mapped:=payload||jsonb_build_object('names',rows_json);
  end if;
  res:=public.lottery_api_v1(operation,mapped,actor_id);
  if res->>'status'='201' then
   update lottery_private.activities set participation=mode,play_mode=play where id=res->'data'->>'id';
   if mode='self' then res:=jsonb_set(res,'{data,tickets}','[]'::jsonb); end if;
  end if;
  return res;
 end if;

 if operation in ('event','admin','register','member','member-draw') then
  select * into a from lottery_private.activities where id=payload->>'id';
 elsif operation in ('ticket','draw') then
  select act.* into a from lottery_private.activities act join lottery_private.tickets tick on act.id=tick.activity_id
   where tick.code_hash=encode(sha256(convert_to(coalesce(payload->>'code',''),'UTF8')),'hex');
 end if;
 if operation='register' then
  if a.id is null then return jsonb_build_object('status',404,'data',jsonb_build_object('error','活动不存在')); end if;
  if a.participation<>'self' then return jsonb_build_object('status',400,'data',jsonb_build_object('error','本活动仅允许指定名单参与')); end if;
  -- One activity lock serializes slot allocation and makes retry safe.
  perform 1 from lottery_private.activities where id=a.id for update;
  nm:=btrim(coalesce(payload->>'name','')); secret:=coalesce(payload->>'joinToken','');
  if length(nm) not between 1 and 40 or nm like '__reserved_slot_%' or secret !~ '^[a-f0-9]{64}$' then
   return jsonb_build_object('status',400,'data',jsonb_build_object('error','请输入 1～40 字姓名，勿使用保留名称'));
  end if;
  select tick.* into t from lottery_private.tickets tick join lottery_private.claims c on c.ticket_id=tick.id
   where c.activity_id=a.id and c.token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex');
  if found then
   if t.name<>nm then return jsonb_build_object('status',409,'data',jsonb_build_object('error','本设备已使用另一姓名参加该活动')); end if;
  else
   if exists(select 1 from lottery_private.tickets tick join lottery_private.claims c on c.ticket_id=tick.id where tick.activity_id=a.id and tick.name=nm) then
    return jsonb_build_object('status',409,'data',jsonb_build_object('error','该姓名已报名，请在原设备查看；同名人员请加部门或工号区分'));
   end if;
   select * into t from lottery_private.tickets tick where activity_id=a.id
    and not exists(select 1 from lottery_private.claims c where c.ticket_id=tick.id) order by position limit 1 for update;
   if not found then return jsonb_build_object('status',409,'data',jsonb_build_object('error','参与人数已满')); end if;
   update lottery_private.tickets set name=nm where id=t.id;
   insert into lottery_private.claims(ticket_id,activity_id,token_hash) values(t.id,a.id,encode(sha256(convert_to(secret,'UTF8')),'hex'));
  end if;
  return jsonb_build_object('status',201,'data',jsonb_build_object('member',t.id));
 end if;

 if a.id is not null then
  select count(*) into capacity from lottery_private.tickets where activity_id=a.id;
  select count(*) into taken from lottery_private.claims where activity_id=a.id;
  extra:=jsonb_build_object('participation',a.participation,'playMode',a.play_mode,'capacity',capacity,'registered',case when a.participation='self' then taken else capacity end);
  if a.participation='self' then
   if operation='event' then
    return jsonb_build_object('status',200,'data',extra||jsonb_build_object('id',a.id,'title',a.title,'detail',a.detail,'quota',a.quota,'members','[]'::jsonb));
   elsif operation in ('member','member-draw','ticket','draw') then
    if operation in ('ticket','draw') or not exists(select 1 from lottery_private.claims c where c.activity_id=a.id and c.ticket_id=payload->>'member' and c.token_hash=encode(sha256(convert_to(coalesce(payload->>'joinToken',''),'UTF8')),'hex')) then
     return jsonb_build_object('status',403,'data',jsonb_build_object('error','报名凭证无效，请使用原报名设备进入活动'));
    end if;
   end if;
  end if;
 end if;
 res:=public.lottery_api_v1(operation,payload,actor_id);
 if res->>'status'='200' and a.id is not null then
  if operation='admin' and a.participation='self' then
   select coalesce(jsonb_agg(jsonb_build_object('name',tick.name,'drawn_at',tick.drawn_at,'winner',case when tick.drawn_at is not null then tick.winner else null end) order by tick.position),'[]'::jsonb)
    into rows_json from lottery_private.tickets tick join lottery_private.claims c on c.ticket_id=tick.id where tick.activity_id=a.id;
   res:=jsonb_set(res,'{data,rows}',rows_json);
  end if;
  res:=jsonb_set(res,'{data}',(res->'data')||extra);
 end if;
 return res;
end;
$$;
revoke all on function public.lottery_api(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.lottery_api(text,jsonb,uuid) to service_role;
commit;
