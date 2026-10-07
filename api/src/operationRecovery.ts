import pool from './db';
type Cursor={createdAt:string;id:string};
export class RecoverySweep {
    private cursor:Cursor|null=null;
    private boundary=new Date().toISOString();
    constructor(private fetchBatch:(cursor:Cursor|null,boundary:string)=>Promise<Array<{id:string;created_at:string}>>,private reconcile:(id:string)=>Promise<unknown>,private warn:()=>void){}
    async pass():Promise<void>{
        const rows=await this.fetchBatch(this.cursor,this.boundary);
        for(const row of rows){try{await this.reconcile(row.id);}catch{this.warn();}this.cursor={createdAt:row.created_at,id:row.id};}
        if(rows.length<20){this.cursor=null;this.boundary=new Date().toISOString();}
    }
}
export function startOperationRecovery(table:'economy_intents'|'game_asset_operations',reconcile:(id:string)=>Promise<unknown>){
    const sweep=new RecoverySweep(async(cursor,boundary)=>(await pool.query(`SELECT id,created_at::text AS created_at FROM ${table}
        WHERE state IN ('prepared','signed') AND created_at<=$1::timestamptz
        AND ($2::timestamptz IS NULL OR (created_at,id)>($2::timestamptz,$3::uuid))
        ORDER BY created_at,id LIMIT 20`,[boundary,cursor?.createdAt??null,cursor?.id??null])).rows,reconcile,()=>console.warn(`[Recovery] ${table}: operation remains quarantined; reconciliation failed.`));
    let busy=false;const timer=setInterval(async()=>{if(busy)return;busy=true;try{await sweep.pass();}catch{console.warn(`[Recovery] ${table}: scan unavailable; retrying.`);}finally{busy=false;}},5000);timer.unref();
}
