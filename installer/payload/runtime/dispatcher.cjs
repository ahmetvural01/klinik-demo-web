const fs=require("fs"),path=require("path");
const reg=JSON.parse(fs.readFileSync(path.join(__dirname,"..","config","agent-registry.json"),"utf8"));
const {pick}=require("./quota-router.cjs");
const all=reg.departments.flatMap(x=>x.roles);
const maps={
 full:["architecture","backend","database","security","frontend","uiux","accessibility","qa","playwright","performance","clinic_domain","privacy","devops","code_quality","red_team"],
 security:["security","database","privacy","red_team"],
 ui:["frontend","uiux","accessibility","performance","qa","playwright"],
 backend:["backend","database","security","clinic_domain","qa","red_team"],
 release:["qa","playwright","performance","devops","code_quality","red_team"]
};
function plan(kind="full"){
 const deps=maps[kind]||maps.full, selected=[];
 for(const d of deps){const rs=all.filter(x=>x.department===d);selected.push(...rs.slice(0,3))}
 return {kind,provider:pick()?.id||null,concurrency:Number(process.env.AI_CONCURRENCY||6),selectedAgents:selected,
 note:"150 specialists are available; only relevant roles are activated to conserve quota and context."};
}
if(require.main===module)console.log(JSON.stringify(plan(process.argv[2]||"full"),null,2));
module.exports={plan};
