const fs=require("fs"), path=require("path");
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,"..","config","provider-pool.json"),"utf8"));
const statePath=path.join(__dirname,"router-state.json");
function load(){try{return JSON.parse(fs.readFileSync(statePath,"utf8"))}catch{return {providers:{},day:new Date().toISOString().slice(0,10),paidSpentToday:0}}}
function save(s){fs.writeFileSync(statePath,JSON.stringify(s,null,2))}
function enabled(id){
 if(id==="openrouter-free") return !!process.env.OPENROUTER_API_KEY;
 if(id==="gemini-free") return !!process.env.GEMINI_API_KEY;
 if(id==="ollama-local") return true;
 if(id==="paid-escalation") return process.env.AI_ALLOW_PAID==="1";
 return false;
}
function pick(){
 const s=load(), now=Date.now();
 for(const p of [...cfg.tiers].sort((a,b)=>a.priority-b.priority)){
  if(!enabled(p.id)) continue;
  const ps=s.providers[p.id]||{};
  if(ps.cooldownUntil>now) continue;
  if(p.id==="paid-escalation"){
   const cap=Number(process.env.AI_MAX_PAID_USD_PER_DAY||cfg.policy.maxPaidUsdPerDay||0);
   if((s.paidSpentToday||0)>=cap) continue;
  }
  return p;
 }
 return null;
}
function quota(id,reason="quota/rate-limit"){
 const s=load(); s.providers[id]=s.providers[id]||{};
 s.providers[id].lastFailure=new Date().toISOString(); s.providers[id].reason=reason;
 s.providers[id].cooldownUntil=Date.now()+cfg.policy.cooldownSecondsOnQuota*1000; save(s);
}
function healthy(id){const s=load();s.providers[id]={lastSuccess:new Date().toISOString(),cooldownUntil:0};save(s)}
if(require.main===module) console.log(JSON.stringify(pick(),null,2));
module.exports={pick,quota,healthy};
