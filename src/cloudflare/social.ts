type Sql = { query(query: string, params?: unknown[]): Promise<unknown[]> };
type User = { id: string; handle: string; role: string };
type Row = Record<string, unknown>;
function json(body: unknown, status=200) { return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}}); }
function fail(message:string,status:number,code:string){return json({error:message,code},status);}
const pair=(a:string,b:string):[string,string]=>a<b?[a,b]:[b,a];

export async function handleSocialRoute(request:Request,sql:Sql,user:User|null):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname;
 if(path.startsWith('/api/profiles/')&&request.method==='GET'){
  const handle=decodeURIComponent(path.slice('/api/profiles/'.length)).toLowerCase();
  const rows=await sql.query('SELECT a.id,a.handle,a.display_name,p.bio,p.avatar_json,p.updated_at,a.created_at FROM ll_accounts a JOIN ll_profiles p ON p.user_id=a.id WHERE a.handle=$1 LIMIT 1',[handle]) as Row[];
  if(!rows[0])return fail('No player with that handle.',404,'not_found');
  let avatar=null;try{avatar=JSON.parse(String(rows[0].avatar_json));}catch{}
  return json({userId:rows[0].id,handle:rows[0].handle,displayName:rows[0].display_name,bio:rows[0].bio,avatar,createdAt:Number(rows[0].created_at),updatedAt:Number(rows[0].updated_at)});
 }
 if(!path.startsWith('/api/friends')&&!path.startsWith('/api/blocks')&&!path.startsWith('/api/players')&&!path.startsWith('/api/chat/history')&&!path.startsWith('/api/reports'))return null;
 if(!user)return fail('Sign in to continue.',401,'unauthorized');
 if(path==='/api/players'&&request.method==='GET'){
  const q=(url.searchParams.get('q')??'').trim().toLowerCase().slice(0,32);
  if(!q)return json([]);
  const rows=await sql.query("SELECT a.id,a.handle,COALESCE(p.display_name,a.handle) AS display_name FROM ll_accounts a LEFT JOIN ll_profiles p ON p.user_id=a.id WHERE (a.handle ILIKE $1 OR p.display_name ILIKE $1) AND a.id<>$2 AND NOT EXISTS(SELECT 1 FROM ll_blocks b WHERE b.user_id=$2 AND b.blocked_id=a.id) AND NOT EXISTS(SELECT 1 FROM ll_blocks b WHERE b.user_id=a.id AND b.blocked_id=$2) LIMIT 20",[`%${q}%`,user.id]) as Row[];
  return json(rows.map(r=>({userId:r.id,handle:r.handle,displayName:r.display_name})));
 }
 if(path==='/api/friends'&&request.method==='GET'){
  const rows=await sql.query('SELECT f.a,f.b,f.status,f.requested_by,a2.id,a2.handle,COALESCE(p.display_name,a2.handle) AS display_name FROM ll_friendships f JOIN ll_accounts a2 ON a2.id=CASE WHEN f.a=$1 THEN f.b ELSE f.a END LEFT JOIN ll_profiles p ON p.user_id=a2.id WHERE f.a=$1 OR f.b=$1',[user.id]) as Row[];
  return json(rows.map(r=>({userId:r.a===user.id?r.b:r.a,handle:r.handle,displayName:r.display_name,status:r.status,direction:r.requested_by===user.id?'outgoing':'incoming'})));
 }
 if(path==='/api/friends/request'&&request.method==='POST'){
  const body=await request.json().catch(()=>({})) as Row;
  const targets=await sql.query('SELECT id FROM ll_accounts WHERE handle=$1 LIMIT 1',[String(body.handle??'').toLowerCase()]) as Array<{id:string}>;
  if(!targets[0])return fail('No player with that handle.',404,'not_found');
  const other=targets[0].id;if(other===user.id)return fail('You cannot add yourself.',400,'bad_request');
  const blocked=await sql.query('SELECT 1 FROM ll_blocks WHERE user_id=$1 AND blocked_id=$2 LIMIT 1',[other,user.id]);
  if(blocked.length)return fail('This player is not accepting requests.',403,'forbidden');
  const [a,b]=pair(user.id,other);
  const existing=await sql.query('SELECT status,requested_by FROM ll_friendships WHERE a=$1 AND b=$2 LIMIT 1',[a,b]) as Array<{status:string;requested_by:string}>;
  if(existing[0]){
   if(existing[0].status==='accepted')return fail('You are already friends.',409,'conflict');
   if(existing[0].requested_by===user.id)return fail('Request already sent.',409,'conflict');
   await sql.query("UPDATE ll_friendships SET status='accepted' WHERE a=$1 AND b=$2",[a,b]);
   return json({status:'accepted'});
  }
  await sql.query("INSERT INTO ll_friendships(a,b,status,requested_by,created_at) VALUES($1,$2,'pending',$3,$4)",[a,b,user.id,Date.now()]);
  return json({status:'pending'});
 }
 if(path==='/api/friends/accept'&&request.method==='POST'){
  const body=await request.json().catch(()=>({})) as Row,other=String(body.userId??'');
  const [a,b]=pair(user.id,other);
  const rows=await sql.query('SELECT status,requested_by FROM ll_friendships WHERE a=$1 AND b=$2 LIMIT 1',[a,b]) as Array<{status:string;requested_by:string}>;
  if(!rows[0])return fail('No friend request.',404,'not_found');
  if(rows[0].status==='accepted')return json({status:'accepted'});
  if(rows[0].requested_by===user.id)return fail('This request is yours to be accepted by them.',403,'forbidden');
  await sql.query("UPDATE ll_friendships SET status='accepted' WHERE a=$1 AND b=$2",[a,b]);
  return json({status:'accepted'});
 }
 const friendDelete=path.match(/^\/api\/friends\/([^/]+)$/);
 if(friendDelete&&request.method==='DELETE'){
  const [a,b]=pair(user.id,decodeURIComponent(friendDelete[1]));
  await sql.query('DELETE FROM ll_friendships WHERE a=$1 AND b=$2',[a,b]);
  return json({removed:true});
 }
 if(path==='/api/blocks'&&request.method==='GET'){
  const rows=await sql.query('SELECT b.blocked_id,a.handle FROM ll_blocks b JOIN ll_accounts a ON a.id=b.blocked_id WHERE b.user_id=$1',[user.id]) as Row[];
  return json(rows.map(r=>({userId:r.blocked_id,handle:r.handle})));
 }
 if(path==='/api/blocks'&&request.method==='POST'){
  const body=await request.json().catch(()=>({})) as Row;
  const targets=await sql.query('SELECT id FROM ll_accounts WHERE handle=$1 LIMIT 1',[String(body.handle??'').toLowerCase()]) as Array<{id:string}>;
  if(!targets[0])return fail('No player with that handle.',404,'not_found');
  if(targets[0].id===user.id)return fail('You cannot block yourself.',400,'bad_request');
  await sql.query('INSERT INTO ll_blocks(user_id,blocked_id,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[user.id,targets[0].id,Date.now()]);
  const [a,b]=pair(user.id,targets[0].id);
  await sql.query('DELETE FROM ll_friendships WHERE a=$1 AND b=$2',[a,b]);
  return json({blocked:targets[0].id});
 }
 const blockDelete=path.match(/^\/api\/blocks\/([^/]+)$/);
 if(blockDelete&&request.method==='DELETE'){
  const handle=decodeURIComponent(blockDelete[1]).toLowerCase();
  const targets=await sql.query('SELECT id FROM ll_accounts WHERE handle=$1 LIMIT 1',[handle]) as Array<{id:string}>;
  if(!targets[0])return fail('No player with that handle.',404,'not_found');
  await sql.query('DELETE FROM ll_blocks WHERE user_id=$1 AND blocked_id=$2',[user.id,targets[0].id]);
  return json({unblocked:targets[0].id});
 }
 if(path==='/api/chat/history'&&request.method==='GET'){
  const scope=String(url.searchParams.get('scope')??'city');
  let scopeId=url.searchParams.get('scopeId')??'';
  if(scope==='party')return fail('Party history is not migrated yet.',501,'not_implemented');
  if(scope==='dm'){
   const handle=(url.searchParams.get('with')??'').toLowerCase();
   const targets=await sql.query('SELECT id FROM ll_accounts WHERE handle=$1 LIMIT 1',[handle]) as Array<{id:string}>;
   if(!targets[0])return fail('No player with that handle.',404,'not_found');
   const [a,b]=pair(user.id,targets[0].id);scopeId=`${a}|${b}`;
   const blocked=await sql.query('SELECT 1 FROM ll_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1) LIMIT 1',[a,b]);
   if(blocked.length)return fail('This conversation is unavailable.',403,'forbidden');
  } else if(!['city','world'].includes(scope))return fail('Unknown chat scope.',400,'bad_request');
  if(scope==='world'){
   const worlds=await sql.query('SELECT * FROM ll_worlds WHERE id=$1 LIMIT 1',[scopeId]) as Row[];
   if(!worlds[0])return fail('World not found.',404,'not_found');
   const access=worlds[0].owner_id===user.id||Boolean(worlds[0].published&&worlds[0].access==='public');
   if(!access)return fail('You do not have access to this world.',403,'forbidden');
  }
  const limit=Math.max(1,Math.min(100,Number(url.searchParams.get('limit'))||50));
  const rows=await sql.query('SELECT m.id,m.body,m.created_at,m.user_id,a.handle,COALESCE(p.display_name,a.handle) AS display_name FROM ll_chat_messages m JOIN ll_accounts a ON a.id=m.user_id LEFT JOIN ll_profiles p ON p.user_id=a.id WHERE m.scope=$1 AND m.scope_id=$2 ORDER BY m.created_at DESC LIMIT $3',[scope,scopeId,limit]) as Row[];
  return json(rows.reverse().map(r=>({id:r.id,body:r.body,createdAt:Number(r.created_at),from:{userId:r.user_id,handle:r.handle,displayName:r.display_name}})));
 }
 if(path==='/api/reports'&&request.method==='POST'){
  const body=await request.json().catch(()=>({})) as Row;
  const targets=await sql.query('SELECT id FROM ll_accounts WHERE handle=$1 LIMIT 1',[String(body.handle??'').toLowerCase()]) as Array<{id:string}>;
  if(!targets[0])return fail('No player with that handle.',404,'not_found');
  if(targets[0].id===user.id)return fail('You cannot report yourself.',400,'bad_request');
  const reasons=['harassment','spam','inappropriate','impersonation','other'];
  const reason=String(body.reason??'');
  if(!reasons.includes(reason))return fail('Invalid report reason.',400,'invalid_input');
  const id=`rep_${crypto.randomUUID()}`;
  await sql.query("INSERT INTO ll_reports(id,reporter_id,target_user_id,reason,details,status,created_at) VALUES($1,$2,$3,$4,$5,'open',$6)",[id,user.id,targets[0].id,reason,String(body.details??'').slice(0,1000),Date.now()]);
  return json({id,status:'open'},201);
 }
 return null;
}
