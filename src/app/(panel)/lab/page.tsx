"use client";

import { useEffect, useState, useMemo } from "react";

type LabTrip = {
  id: string; order: number; description: string;
  sentAt: string; expectedAt?: string; receivedAt?: string;
  sentNote?: string; receivedNote?: string;
};

type LabOrder = {
  id: string; labName: string; labType: string; teeth?: string; notes?: string;
  status: string; price?: number; invoiceNo?: string; createdAt: string;
  patient: { id: string; fullName: string; phone?: string };
  doctor:  { id: string; fullName: string };
  trips:   LabTrip[];
};

type Patient = { id: string; fullName: string };
type Doctor  = { id: string; fullName: string; role: string };

const LAB_TYPES = ["Kronkopru","Zirkon","Veneer","Protez","Braket","İmplant Üstü","Beyazlatma","Diğer"];
const CUR = new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",minimumFractionDigits:0});

function fmt(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("tr-TR",{day:"2-digit",month:"short",year:"numeric"});
}
function daysLeft(iso: string): number {
  return Math.ceil((new Date(iso).getTime()-Date.now())/86400000);
}
function today() { return new Date().toISOString().slice(0,10); }

type FlatTrip = LabTrip & { labOrder: LabOrder };

function pendingTrips(orders: LabOrder[]): FlatTrip[] {
  const out: FlatTrip[]=[];
  for (const o of orders) {
    if (o.status==="HASTAYA_TAKILDI"||o.status==="IPTAL") continue;
    for (const t of o.trips) if (!t.receivedAt) out.push({...t,labOrder:o});
  }
  return out;
}
function receivedRecent(orders: LabOrder[]): FlatTrip[] {
  const cutoff=Date.now()-14*86400000; const out: FlatTrip[]=[];
  for (const o of orders) {
    if (o.status==="HASTAYA_TAKILDI"||o.status==="IPTAL") continue;
    for (const t of o.trips) {
      if (t.receivedAt && new Date(t.receivedAt).getTime()>cutoff) {
        if (!o.trips.some(x=>x.order>t.order&&!x.receivedAt)) out.push({...t,labOrder:o});
      }
    }
  }
  return out;
}

const emptyOrder = {patientId:"",doctorId:"",labName:"",labType:"",teeth:"",notes:"",price:"",invoiceNo:"",tripDesc:"",tripSentAt:today(),tripExpectedAt:"",tripNote:""};
const emptyTrip  = {description:"",sentAt:today(),expectedAt:"",sentNote:""};
const emptyRcv   = {receivedAt:today(),receivedNote:""};

export default function LabPage() {
  const [orders, setOrders]   = useState<LabOrder[]>([]);
  const [loading,setLoading]  = useState(true);
  const [expanded,setExpanded]= useState<Set<string>>(new Set());
  const [search,  setSearch]  = useState("");
  const [tab,     setTab]     = useState<""|"active"|"done"|"iptal">("");

  const [patients,setPatients]= useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  const [showNew,   setShowNew]   = useState(false);
  const [addFor,    setAddFor]    = useState<LabOrder|null>(null);
  const [rcvTrip,   setRcvTrip]   = useState<FlatTrip|null>(null);
  const [invFor,    setInvFor]    = useState<LabOrder|null>(null);
  const [saving,    setSaving]    = useState(false);

  const [oForm,setOForm] = useState(emptyOrder);
  const [tForm,setTForm] = useState(emptyTrip);
  const [rForm,setRForm] = useState(emptyRcv);
  const [iForm,setIForm] = useState({price:"",invoiceNo:""});

  useEffect(()=>{
    load();
    fetch("/api/patients?limit=200").then(r=>r.json()).then(d=>setPatients(Array.isArray(d)?d:(d.patients||[]))).catch(()=>{});
    fetch("/api/staff").then(r=>r.json()).then(d=>setDoctors((Array.isArray(d)?d:[]).filter((u:Doctor)=>u.role==="DOKTOR"))).catch(()=>{});
  },[]);

  function load(){
    setLoading(true);
    fetch("/api/lab-orders").then(r=>r.json()).then(d=>setOrders(Array.isArray(d)?d:[])).catch(()=>{}).finally(()=>setLoading(false));
  }

  const pending  = useMemo(()=>pendingTrips(orders),[orders]);
  const received = useMemo(()=>receivedRecent(orders),[orders]);

  const visible = useMemo(()=>orders.filter(o=>{
    if(search){const s=search.toLowerCase();if(!o.patient.fullName.toLowerCase().includes(s)&&!o.labName.toLowerCase().includes(s))return false;}
    if(tab==="active") return o.status!=="HASTAYA_TAKILDI"&&o.status!=="IPTAL";
    if(tab==="done")   return o.status==="HASTAYA_TAKILDI";
    if(tab==="iptal")  return o.status==="IPTAL";
    return true;
  }),[orders,search,tab]);

  function toggle(id:string){setExpanded(p=>{const s=new Set(p);s.has(id)?s.delete(id):s.add(id);return s;});}

  async function submitOrder(){
    if(!oForm.patientId||!oForm.doctorId||!oForm.labName||!oForm.labType)return;
    setSaving(true);
    const res=await fetch("/api/lab-orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      patientId:oForm.patientId,doctorId:oForm.doctorId,labName:oForm.labName,labType:oForm.labType,
      teeth:oForm.teeth,notes:oForm.notes,price:oForm.price?Number(oForm.price):null,invoiceNo:oForm.invoiceNo||null,
      firstTrip:oForm.tripDesc?{description:oForm.tripDesc,sentAt:oForm.tripSentAt,expectedAt:oForm.tripExpectedAt||null,sentNote:oForm.tripNote}:null,
    })});
    setSaving(false);
    if(res.ok){const d=await res.json();setExpanded(p=>new Set([...p,d.id]));setShowNew(false);setOForm(emptyOrder);load();}
  }
  async function submitTrip(){
    if(!addFor||!tForm.description)return;
    setSaving(true);
    await fetch(`/api/lab-orders/${addFor.id}/trips`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(tForm)});
    setSaving(false);setAddFor(null);setTForm(emptyTrip);load();
  }
  async function submitRcv(){
    if(!rcvTrip)return;
    setSaving(true);
    await fetch(`/api/lab-orders/${rcvTrip.labOrder.id}/trips/${rcvTrip.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(rForm)});
    setSaving(false);setRcvTrip(null);setRForm(emptyRcv);load();
  }
  async function submitInvoice(){
    if(!invFor)return;
    setSaving(true);
    await fetch(`/api/lab-orders/${invFor.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({price:iForm.price?Number(iForm.price):null,invoiceNo:iForm.invoiceNo})});
    setSaving(false);setInvFor(null);load();
  }
  async function setStatus(id:string,status:string){
    await fetch(`/api/lab-orders/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});
    load();
  }

  const inp="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs focus:border-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500/20";
  const activeCount=orders.filter(o=>o.status!=="HASTAYA_TAKILDI"&&o.status!=="IPTAL").length;
  const doneCount  =orders.filter(o=>o.status==="HASTAYA_TAKILDI").length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Laboratuvar Takibi</h1>
          <p className="text-xs text-slate-500">Gidiş · Bekleme · Geliş — her aşamanın eksiksiz kaydı</p>
        </div>
        <button onClick={()=>{setShowNew(true);setOForm(emptyOrder);}} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 transition">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Yeni Sipariş
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          {c:"blue",   l:"Aktif Sipariş",  v:activeCount},
          {c:"amber",  l:"Labda Bekleyen", v:pending.length},
          {c:"emerald",l:"Gelen (14 gün)", v:received.length},
          {c:"violet", l:"Tamamlanan",     v:doneCount},
        ].map(({c,l,v})=>{
          const cls:Record<string,string>={blue:"border-blue-100 bg-blue-50 text-blue-700",amber:"border-amber-100 bg-amber-50 text-amber-700",emerald:"border-emerald-100 bg-emerald-50 text-emerald-700",violet:"border-violet-100 bg-violet-50 text-violet-700"};
          return <div key={l} className={`rounded-xl border px-3 py-3 ${cls[c]}`}><p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{l}</p><p className="mt-0.5 text-2xl font-black">{v}</p></div>;
        })}
      </div>

      {/* Labda Bekleyenler */}
      {pending.length>0&&(
        <section className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-100/60 px-4 py-2">
            <svg className="h-3.5 w-3.5 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Labda Bekleyen İşler ({pending.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-amber-200 bg-amber-100/40">
                {["Hasta / Diş","Lab","Gönderilen İş","Gönderildi","Beklenen",""].map(h=><th key={h} className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-amber-600 whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-amber-100">
                {pending.map(t=>{
                  const d=t.expectedAt?daysLeft(t.expectedAt):null;
                  const late=d!==null&&d<0; const soon=d!==null&&d>=0&&d<=2;
                  return(
                    <tr key={t.id} className="hover:bg-amber-100/40 transition">
                      <td className="px-3 py-2"><p className="text-xs font-semibold text-slate-800">{t.labOrder.patient.fullName}</p>{t.labOrder.teeth&&<p className="text-[10px] text-slate-400">Diş: {t.labOrder.teeth}</p>}</td>
                      <td className="px-3 py-2"><p className="text-xs text-slate-700">{t.labOrder.labName}</p><p className="text-[10px] text-slate-400">{t.labOrder.labType}</p></td>
                      <td className="px-3 py-2"><p className="text-xs font-medium text-slate-800">{t.description}</p>{t.sentNote&&<p className="text-[10px] text-slate-400">{t.sentNote}</p>}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmt(t.sentAt)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {t.expectedAt?(
                          <span className={`text-xs font-semibold ${late?"text-red-600":soon?"text-amber-600":"text-slate-600"}`}>
                            {fmt(t.expectedAt)}<span className={`ml-1 text-[10px] font-normal ${late?"text-red-500":soon?"text-amber-500":"text-slate-400"}`}>{d===0?"(bugün)":d!<0?`(${-d!}g gecikti)`:`(${d}g kaldı)`}</span>
                          </span>
                        ):<span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-2"><button onClick={()=>{setRcvTrip(t);setRForm(emptyRcv);}} className="rounded-md bg-emerald-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-600 transition whitespace-nowrap">Geldi ✓</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Gelen İşler */}
      {received.length>0&&(
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-100/60 px-4 py-2">
            <svg className="h-3.5 w-3.5 shrink-0 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Gelen İşler — Randevu Gerekli ({received.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-emerald-200 bg-emerald-100/40">
                {["Hasta","Lab / Tür","Gelen İş","Geliş Tarihi","Doktor","Not"].map(h=><th key={h} className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-emerald-600">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-emerald-100">
                {received.map(t=>(
                  <tr key={t.id} className="hover:bg-emerald-100/40 transition">
                    <td className="px-3 py-2"><p className="text-xs font-semibold text-slate-800">{t.labOrder.patient.fullName}</p>{t.labOrder.patient.phone&&<p className="text-[10px] text-slate-400">{t.labOrder.patient.phone}</p>}</td>
                    <td className="px-3 py-2"><p className="text-xs text-slate-700">{t.labOrder.labName}</p><p className="text-[10px] text-slate-400">{t.labOrder.labType}</p></td>
                    <td className="px-3 py-2 text-xs font-medium text-slate-800">{t.description}</td>
                    <td className="px-3 py-2 text-xs text-emerald-700 whitespace-nowrap">{fmt(t.receivedAt)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{t.labOrder.doctor.fullName}</td>
                    <td className="px-3 py-2 text-[10px] text-slate-400">{t.receivedNote||"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm">
        <div className="relative flex-1 min-w-36">
          <svg className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Hasta veya lab ara…" className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-7 pr-2 text-xs placeholder-slate-400 focus:border-primary focus:bg-white focus:outline-none"/>
        </div>
        {([["","Tümü"],["active","Aktif"],["done","Tamamlanan"],["iptal","İptal"]] as const).map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v as typeof tab)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${tab===v?"bg-primary text-white":"border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
        ))}
      </div>

      {loading&&<div className="flex justify-center py-10 text-xs text-slate-400">Yükleniyor…</div>}

      {/* Orders list */}
      {!loading&&(
        <div className="space-y-2">
          {visible.length===0&&(
            <div className="flex flex-col items-center py-10 text-slate-300">
              <svg className="mb-2 h-9 w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
              <p className="text-xs text-slate-400">Sipariş bulunamadı</p>
            </div>
          )}
          {visible.map(order=>{
            const open=expanded.has(order.id);
            const atLab=order.trips.filter(t=>!t.receivedAt).length;
            const done=order.status==="HASTAYA_TAKILDI";
            const cancelled=order.status==="IPTAL";
            const completedTrips=order.trips.filter(t=>t.receivedAt).length;
            return(
              <div key={order.id} className={`rounded-xl border bg-white shadow-sm overflow-hidden transition-all ${done?"border-emerald-200":cancelled?"border-slate-200 opacity-60":atLab>0?"border-amber-200":"border-blue-100"}`}>
                {/* header row */}
                <div className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-slate-50/80 transition select-none" onClick={()=>toggle(order.id)}>
                  <svg className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${open?"rotate-90":""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  <div className="flex-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 min-w-0">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900">{order.patient.fullName}</p>
                      <p className="text-[10px] text-slate-400">{order.doctor.fullName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-700">{order.labName} <span className="font-semibold">· {order.labType}</span></p>
                      {order.teeth&&<p className="text-[10px] text-slate-400">Diş: {order.teeth}</p>}
                    </div>
                    {order.trips.length>0&&<p className="text-[10px] text-slate-400">{completedTrips}/{order.trips.length} aşama</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 justify-end shrink-0">
                    {order.price&&<span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{CUR.format(order.price)}</span>}
                    {order.invoiceNo&&<span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">F:{order.invoiceNo}</span>}
                    {!order.invoiceNo&&!done&&!cancelled&&<span className="rounded-md border border-dashed border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-400">Fatura yok</span>}
                    {atLab>0&&<span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{atLab} labda</span>}
                    {done&&<span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">Takıldı ✓</span>}
                    {cancelled&&<span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">İptal</span>}
                  </div>
                </div>

                {/* expanded */}
                {open&&(
                  <div className="border-t border-slate-100 px-4 py-3 space-y-3">
                    {order.trips.length===0?(
                      <p className="text-xs text-slate-400 italic">Henüz gidiş–geliş kaydı eklenmemiş.</p>
                    ):(
                      <div className="relative space-y-0">
                        {order.trips.length>1&&<div className="absolute left-[11px] top-6 bottom-4 w-px bg-slate-100 z-0"/>}
                        {order.trips.map((t,idx)=>{
                          const atLab=!t.receivedAt;
                          const late=t.expectedAt&&atLab&&new Date(t.expectedAt)<new Date();
                          return(
                            <div key={t.id} className="relative flex gap-2.5 z-10">
                              <div className={`mt-0.5 h-[22px] w-[22px] shrink-0 rounded-full border-2 flex items-center justify-center text-[9px] font-black bg-white ${atLab?"border-amber-400 text-amber-600":"border-emerald-400 text-emerald-600"}`}>{t.order}</div>
                              <div className="flex-1 pb-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-semibold text-slate-800">{t.description}</p>
                                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-slate-500">
                                      <span>↗ Gönderildi: <strong>{fmt(t.sentAt)}</strong></span>
                                      {t.sentNote&&<span>· {t.sentNote}</span>}
                                      {t.expectedAt&&<span className={late?"font-semibold text-red-500":""}>· Beklenen: {fmt(t.expectedAt)}{late?" ⚠":""}</span>}
                                    </div>
                                    {t.receivedAt&&<div className="mt-0.5 text-[10px] text-emerald-600">↙ Geldi: <strong>{fmt(t.receivedAt)}</strong>{t.receivedNote?` · ${t.receivedNote}`:""}</div>}
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${atLab?"bg-amber-100 text-amber-700":"bg-emerald-100 text-emerald-700"}`}>{atLab?"LABDA":"GELDİ ✓"}</span>
                                    {atLab&&<button onClick={()=>{setRcvTrip({...t,labOrder:order});setRForm(emptyRcv);}} className="rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-600 transition">Geldi</button>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* actions */}
                    {!cancelled&&(
                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100">
                        {!done&&<>
                          <button onClick={()=>{setAddFor(order);setTForm(emptyTrip);}} className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition">+ Gidiş Ekle</button>
                          <button onClick={()=>setStatus(order.id,"HASTAYA_TAKILDI")} className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition">Hastaya Takıldı ✓</button>
                        </>}
                        <button onClick={()=>{setInvFor(order);setIForm({price:order.price?.toString()||"",invoiceNo:order.invoiceNo||""});}} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition">{order.invoiceNo?"Fatura Güncelle":"Fatura Ekle"}</button>
                        {!done&&<button onClick={()=>setStatus(order.id,"IPTAL")} className="ml-auto rounded-md border border-red-100 px-2.5 py-1.5 text-[11px] font-semibold text-red-400 hover:bg-red-50 transition">İptal</button>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODALS ── */}

      {/* New Order */}
      {showNew&&(
        <Modal title="Yeni Lab Siparişi" onClose={()=>setShowNew(false)}>
          <Sec label="Sipariş Bilgileri">
            <G2>
              <F label="Hasta *"><select value={oForm.patientId} onChange={e=>setOForm(f=>({...f,patientId:e.target.value}))} className={inp}><option value="">Seçiniz…</option>{patients.map(p=><option key={p.id} value={p.id}>{p.fullName}</option>)}</select></F>
              <F label="Doktor *"><select value={oForm.doctorId} onChange={e=>setOForm(f=>({...f,doctorId:e.target.value}))} className={inp}><option value="">Seçiniz…</option>{doctors.map(d=><option key={d.id} value={d.id}>{d.fullName}</option>)}</select></F>
              <F label="Laboratuvar Adı *"><input value={oForm.labName} onChange={e=>setOForm(f=>({...f,labName:e.target.value}))} className={inp} placeholder="ABC Diş Lab"/></F>
              <F label="İş Türü *"><select value={oForm.labType} onChange={e=>setOForm(f=>({...f,labType:e.target.value}))} className={inp}><option value="">Seçiniz…</option>{LAB_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></F>
              <F label="Diş No(ları)"><input value={oForm.teeth} onChange={e=>setOForm(f=>({...f,teeth:e.target.value}))} className={inp} placeholder="11, 12, 13"/></F>
              <F label="Notlar"><input value={oForm.notes} onChange={e=>setOForm(f=>({...f,notes:e.target.value}))} className={inp} placeholder="Renk A2, özel talep…"/></F>
            </G2>
          </Sec>
          <Sec label="Fatura — her sipariş için LAB yalnızca 1 fatura keser">
            <G2>
              <F label="Tutar (₺)"><input type="number" value={oForm.price} onChange={e=>setOForm(f=>({...f,price:e.target.value}))} className={inp} placeholder="0"/></F>
              <F label="Fatura No"><input value={oForm.invoiceNo} onChange={e=>setOForm(f=>({...f,invoiceNo:e.target.value}))} className={inp} placeholder="FAT-001"/></F>
            </G2>
          </Sec>
          <Sec label="İlk Gidiş (opsiyonel — sonradan da eklenebilir)">
            <G2>
              <F label="İş Açıklaması" wide><input value={oForm.tripDesc} onChange={e=>setOForm(f=>({...f,tripDesc:e.target.value}))} className={inp} placeholder="Ölçü, metal alt yapı, mum ısırtma…"/></F>
              <F label="Gönderilme Tarihi"><input type="date" value={oForm.tripSentAt} onChange={e=>setOForm(f=>({...f,tripSentAt:e.target.value}))} className={inp}/></F>
              <F label="Beklenen Geliş"><input type="date" value={oForm.tripExpectedAt} onChange={e=>setOForm(f=>({...f,tripExpectedAt:e.target.value}))} className={inp}/></F>
              <F label="Not" wide><input value={oForm.tripNote} onChange={e=>setOForm(f=>({...f,tripNote:e.target.value}))} className={inp} placeholder="Renk kodu, talimat…"/></F>
            </G2>
          </Sec>
          <Btns onCancel={()=>setShowNew(false)} onSave={submitOrder} saving={saving} saveLabel="Oluştur"/>
        </Modal>
      )}

      {/* Add Trip */}
      {addFor&&(
        <Modal title="Gidiş Ekle" subtitle={`${addFor.patient.fullName} · ${addFor.labName}`} onClose={()=>setAddFor(null)}>
          <G2>
            <F label="Laba Ne Gönderiliyor? *" wide><input value={tForm.description} onChange={e=>setTForm(f=>({...f,description:e.target.value}))} className={inp} placeholder="Metal alt yapı prova, mum ısırtma, dentin, glazeli bitim…" autoFocus/></F>
            <F label="Gönderilme Tarihi"><input type="date" value={tForm.sentAt} onChange={e=>setTForm(f=>({...f,sentAt:e.target.value}))} className={inp}/></F>
            <F label="Beklenen Geliş"><input type="date" value={tForm.expectedAt} onChange={e=>setTForm(f=>({...f,expectedAt:e.target.value}))} className={inp}/></F>
            <F label="Not" wide><input value={tForm.sentNote} onChange={e=>setTForm(f=>({...f,sentNote:e.target.value}))} className={inp} placeholder="Renk, talimat…"/></F>
          </G2>
          <Btns onCancel={()=>setAddFor(null)} onSave={submitTrip} saving={saving} saveLabel="Gönderildi Olarak Kaydet" disabled={!tForm.description}/>
        </Modal>
      )}

      {/* Receive */}
      {rcvTrip&&(
        <Modal title="Labdan Geldi" subtitle={`${rcvTrip.labOrder.patient.fullName} · ${rcvTrip.description}`} onClose={()=>setRcvTrip(null)}>
          <G2>
            <F label="Geliş Tarihi"><input type="date" value={rForm.receivedAt} onChange={e=>setRForm(f=>({...f,receivedAt:e.target.value}))} className={inp}/></F>
            <F label="Not (opsiyonel)"><input value={rForm.receivedNote} onChange={e=>setRForm(f=>({...f,receivedNote:e.target.value}))} className={inp} placeholder="Onaylandı, iade, renk hatası…"/></F>
          </G2>
          <Btns onCancel={()=>setRcvTrip(null)} onSave={submitRcv} saving={saving} saveLabel="Geldi Olarak İşaretle" saveCls="bg-emerald-500 hover:bg-emerald-600"/>
        </Modal>
      )}

      {/* Invoice */}
      {invFor&&(
        <Modal title="Fatura Bilgileri" subtitle={`${invFor.patient.fullName} · ${invFor.labName}`} onClose={()=>setInvFor(null)}>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">⚠ Her sipariş için laboratuvar <strong>yalnızca 1 fatura</strong> keser.</div>
          <G2>
            <F label="Fatura Tutarı (₺)"><input type="number" value={iForm.price} onChange={e=>setIForm(f=>({...f,price:e.target.value}))} className={inp} placeholder="0"/></F>
            <F label="Fatura Numarası"><input value={iForm.invoiceNo} onChange={e=>setIForm(f=>({...f,invoiceNo:e.target.value}))} className={inp} placeholder="FAT-2024-001"/></F>
          </G2>
          <Btns onCancel={()=>setInvFor(null)} onSave={submitInvoice} saving={saving} saveLabel="Kaydet"/>
        </Modal>
      )}
    </div>
  );
}

/* ── Micro components ── */
function Modal({title,subtitle,onClose,children}:{title:string;subtitle?:string;onClose:()=>void;children:React.ReactNode}){
  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div><h2 className="text-sm font-bold text-slate-900">{title}</h2>{subtitle&&<p className="text-[11px] text-slate-500">{subtitle}</p>}</div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 transition"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div className="p-5 space-y-3">{children}</div>
      </div>
    </div>
  );
}
function Sec({label,children}:{label:string;children:React.ReactNode}){return<div className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>{children}</div>;}
function G2({children}:{children:React.ReactNode}){return<div className="grid grid-cols-2 gap-2.5">{children}</div>;}
function F({label,wide,children}:{label:string;wide?:boolean;children:React.ReactNode}){return<div className={wide?"col-span-2":""}><label className="mb-1 block text-[11px] font-semibold text-slate-600">{label}</label>{children}</div>;}
function Btns({onCancel,onSave,saving,saveLabel,disabled,saveCls}:{onCancel:()=>void;onSave:()=>void;saving:boolean;saveLabel:string;disabled?:boolean;saveCls?:string}){
  return<div className="flex gap-2 pt-2"><button onClick={onCancel} className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">İptal</button><button onClick={onSave} disabled={saving||disabled} className={`flex-1 rounded-lg py-2 text-xs font-bold text-white transition disabled:opacity-50 ${saveCls??"bg-primary hover:bg-blue-700"}`}>{saving?"Kaydediliyor…":saveLabel}</button></div>;
}
