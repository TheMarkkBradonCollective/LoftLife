import { CLOTHING_CATALOG } from '../../shared/character.mjs';

type Sql = { query(query: string, params?: unknown[]): Promise<unknown[]> };
type User = { id: string };
type Row = Record<string, unknown>;
const FURNITURE: Record<string, number> = {
 plush_sofa:120,sectional_sofa:210,lounge_chair:85,bar_stool:45,cozy_bed:260,dining_set:240,
 espresso_bar:320,dual_desk:190,coffee_table:95,side_desk:70,record_console:150,media_tv:300,
 fireplace:340,bookshelf:130,arc_lamp:60,table_lamp:35,monstera_plant:40,olive_tree:75,
 woven_rug:55,wall_art:65,wall_shelf:50,floor_mirror:110,neon_sign:90,
};
const CLOTHING = Object.fromEntries(
 Object.entries(CLOTHING_CATALOG).map(([id, item]) => [id, { price: item.price, currency: item.currency }])
) as Record<string,{price:number;currency:'yuanzi'|'tongbao'}>;
const COOLDOWN=20*60*60*1000;
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});}
function fail(message:string,status:number,code:string,detail?:unknown){return json({error:message,code,...(detail?{detail}:{})},status);}
async function wallet(sql:Sql,userId:string){
 const rows=await sql.query('SELECT yuanzi,tongbao FROM ll_wallets WHERE user_id=$1 LIMIT 1',[userId]) as Row[];
 return rows[0]??{yuanzi:0,tongbao:0};
}
async function inventory(sql:Sql,userId:string){
 const rows=await sql.query('SELECT kind,catalog_id,qty,acquired_at FROM ll_inventory WHERE user_id=$1 ORDER BY acquired_at DESC',[userId]) as Row[];
 return rows.map(r=>({kind:r.kind,catalogId:r.catalog_id,qty:Number(r.qty),acquiredAt:Number(r.acquired_at)}));
}
export async function handleEconomyRoute(request:Request,sql:Sql,user:User|null):Promise<Response|null>{
 const path=new URL(request.url).pathname;
 if(path!=='/api/economy/purchase'&&path!=='/api/economy/daily')return null;
 if(!user)return fail('Sign in to continue.',401,'unauthorized');
 if(path==='/api/economy/purchase'&&request.method==='POST'){
  const body=await request.json().catch(()=>({})) as Row;
  const catalogId=String(body.catalogId??'');
  const idempotencyKey=String(body.idempotencyKey??'');
  if(idempotencyKey.length<8||idempotencyKey.length>160)return fail('A valid idempotency key is required.',400,'invalid_input');
  const furniture=Object.hasOwn(FURNITURE,catalogId);
  const clothing=CLOTHING[catalogId];
  if(!furniture&&!clothing)return fail('Unknown shop item.',404,'not_found');
  const kind=furniture?'furniture':'clothing';
  const price=furniture?FURNITURE[catalogId]:clothing!.price;
  const currency=furniture?'yuanzi':clothing!.currency;
  if(kind==='clothing'){
   const owned=await sql.query('SELECT 1 FROM ll_inventory WHERE user_id=$1 AND kind=$2 AND catalog_id=$3 AND qty>0 LIMIT 1',[user.id,kind,catalogId]);
   if(owned.length)return fail('You already own that item.',409,'conflict');
  }
  const at=Date.now(),ledgerId=crypto.randomUUID(),inventoryId=crypto.randomUUID();
  const result=await sql.query(
   `WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtextextended($1,0))),
    prior AS MATERIALIZED (SELECT id,user_id FROM ll_ledger WHERE idempotency_key=$1 AND EXISTS(SELECT 1 FROM lock)),
    debit AS (
      UPDATE ll_wallets
      SET yuanzi=CASE WHEN $3='yuanzi' THEN yuanzi-$4 ELSE yuanzi END,
          tongbao=CASE WHEN $3='tongbao' THEN tongbao-$4 ELSE tongbao END
      WHERE user_id=$2 AND NOT EXISTS(SELECT 1 FROM prior)
        AND (($3='yuanzi' AND yuanzi >= $4) OR ($3='tongbao' AND tongbao >= $4))
      RETURNING yuanzi,tongbao
    ),
    ledger AS (
      INSERT INTO ll_ledger(id,user_id,currency,delta,balance_after,reason,ref,idempotency_key,created_at)
      SELECT $5,$2,$3,-$4,CASE WHEN $3='yuanzi' THEN debit.yuanzi ELSE debit.tongbao END,'purchase:'||$6,$6,$1,$7
      FROM debit RETURNING id
    ),
    owned AS (
      INSERT INTO ll_inventory(id,user_id,kind,catalog_id,qty,acquired_at)
      SELECT $8,$2,$9,$6,1,$7 FROM ledger
      ON CONFLICT(user_id,kind,catalog_id) DO UPDATE SET qty=ll_inventory.qty+1
      RETURNING id
    )
    SELECT (SELECT id FROM prior) AS prior_id,(SELECT user_id FROM prior) AS prior_user_id,(SELECT id FROM ledger) AS ledger_id`,
   [idempotencyKey,user.id,currency,price,ledgerId,catalogId,at,inventoryId,kind]
  ) as Row[];
  const outcome=result[0]??{};
  if(outcome.prior_id&&outcome.prior_user_id!==user.id)return fail('That idempotency key has already been used.',409,'conflict');
  if(!outcome.prior_id&&!outcome.ledger_id){
   const current=await wallet(sql,user.id);
   return fail(`Not enough ${currency}.`,402,'insufficient_funds',{currency,required:price,available:Number(current[currency]??0)});
  }
  return json({
   item:{id:catalogId,kind,price,currency},duplicate:Boolean(outcome.prior_id),
   wallet:await wallet(sql,user.id),inventory:await inventory(sql,user.id),
   ledgerId:String(outcome.prior_id??outcome.ledger_id),
  });
 }
 if(path==='/api/economy/daily'&&request.method==='POST'){
  const at=Date.now(),period=Math.floor(at/COOLDOWN);
  const yId=crypto.randomUUID(),tId=crypto.randomUUID();
  const rows=await sql.query(
   `WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtextextended($1,0))),
    last_claim AS MATERIALIZED (
      SELECT MAX(created_at) AS at FROM ll_ledger
      WHERE user_id=$2 AND reason='daily_reward' AND EXISTS(SELECT 1 FROM lock)
    ),
    credited AS (
      UPDATE ll_wallets SET yuanzi=yuanzi+50,tongbao=tongbao+5
      WHERE user_id=$2 AND COALESCE((SELECT at FROM last_claim),0) <= $3-$4
      RETURNING yuanzi,tongbao
    ),
    ledger AS (
      INSERT INTO ll_ledger(id,user_id,currency,delta,balance_after,reason,ref,idempotency_key,created_at)
      SELECT $5,$2,'yuanzi',50,credited.yuanzi,'daily_reward',NULL,$6,$3 FROM credited
      UNION ALL
      SELECT $7,$2,'tongbao',5,credited.tongbao,'daily_reward',NULL,$8,$3 FROM credited
      RETURNING id
    )
    SELECT (SELECT at FROM last_claim) AS last_at,(SELECT yuanzi FROM credited) AS yuanzi,(SELECT tongbao FROM credited) AS tongbao,(SELECT COUNT(*) FROM ledger) AS entries`,
   [`daily:${user.id}`,user.id,at,COOLDOWN,yId,`daily:yuanzi:${user.id}:${period}`,tId,`daily:tongbao:${user.id}:${period}`]
  ) as Row[];
  const row=rows[0]??{};
  if(Number(row.entries??0)===0){
   const availableAt=Number(row.last_at??at)+COOLDOWN;
   return fail('Daily reward already claimed.',409,'already_claimed',{availableAt});
  }
  return json({wallet:{yuanzi:Number(row.yuanzi),tongbao:Number(row.tongbao)},nextClaimAt:at+COOLDOWN});
 }
 return null;
}
