const DB_NAME='lifetrack-db';
const DB_VERSION=1;
const STORES=['folders','goals','krs','habits','records','meta'];
let db;
let state={tab:'today',calendarDate:new Date(),weightContext:null};

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const pad=n=>String(n).padStart(2,'0');
const localISO=(d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayISO=()=>localISO(new Date());
const nowTime=()=>new Date().toTimeString().slice(0,5);
const fmtDate=d=>new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'short'}).format(d);
const clamp=(n,a,b)=>Math.min(Math.max(n,a),b);
const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const d=req.result;STORES.forEach(s=>{if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'id'})})};req.onsuccess=()=>{db=req.result;resolve(db)};req.onerror=()=>reject(req.error)})}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function getAll(store){return new Promise((resolve,reject)=>{const r=tx(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function getOne(store,id){return new Promise((resolve,reject)=>{const r=tx(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function put(store,val){return new Promise((resolve,reject)=>{const r=tx(store,'readwrite').put(val);r.onsuccess=()=>resolve(val);r.onerror=()=>reject(r.error)})}
function del(store,id){return new Promise((resolve,reject)=>{const r=tx(store,'readwrite').delete(id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
function clearStore(store){return new Promise((resolve,reject)=>{const r=tx(store,'readwrite').clear();r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}

async function seed(){
  if((await getAll('folders')).length)return;
  const f1={id:uid(),name:'健身减脂',emoji:'💪',parentId:null};
  const f2={id:uid(),name:'语言学习',emoji:'🌍',parentId:null};
  const f3={id:uid(),name:'英语学习',emoji:'🇬🇧',parentId:f2.id};
  const f4={id:uid(),name:'粤语学习',emoji:'🇭🇰',parentId:f2.id};
  const g1={id:uid(),name:'健身减脂',emoji:'🎯',description:'降低体重、建立稳定运动习惯'};
  const g2={id:uid(),name:'语言学习',emoji:'🗣️',description:'持续提高英语和粤语能力'};
  await Promise.all([put('folders',f1),put('folders',f2),put('folders',f3),put('folders',f4),put('goals',g1),put('goals',g2)]);
  const hWeight={id:uid(),name:'记录体重',emoji:'⚖️',folderId:f1.id,type:'measurement',target:null,unit:'kg',scheduleType:'recommended',startTime:'08:00',endTime:'',paused:false};
  const hStrength={id:uid(),name:'力量训练',emoji:'🏋️',folderId:f1.id,type:'duration',target:45,unit:'min',scheduleType:'anytime',startTime:'',endTime:'',paused:false};
  const hCardio={id:uid(),name:'有氧训练',emoji:'🏃',folderId:f1.id,type:'duration',target:30,unit:'min',scheduleType:'anytime',startTime:'',endTime:'',paused:false};
  const hEnglish={id:uid(),name:'英语综合学习',emoji:'🇬🇧',folderId:f3.id,type:'duration',target:60,unit:'min',scheduleType:'anytime',startTime:'',endTime:'',paused:false};
  const hCantonese={id:uid(),name:'粤语综合学习',emoji:'🇭🇰',folderId:f4.id,type:'duration',target:60,unit:'min',scheduleType:'anytime',startTime:'',endTime:'',paused:false};
  for(const h of [hWeight,hStrength,hCardio,hEnglish,hCantonese])await put('habits',h);
  await put('krs',{id:uid(),goalId:g1.id,name:'体重降到 68 kg',metricType:'measurement',period:'cumulative',startValue:75,targetValue:68,currentValue:75,unit:'kg',objectiveWeight:null,metricWeight:100,habitLinks:[{habitId:hWeight.id,weight:null}]});
  await put('krs',{id:uid(),goalId:g1.id,name:'每周运动至少 4 次',metricType:'count',period:'week',startValue:0,targetValue:4,currentValue:0,unit:'次',objectiveWeight:null,metricWeight:80,habitLinks:[{habitId:hStrength.id,weight:null},{habitId:hCardio.id,weight:null}]});
  await put('krs',{id:uid(),goalId:g2.id,name:'每周语言学习 7 小时',metricType:'duration',period:'week',startValue:0,targetValue:420,currentValue:0,unit:'min',objectiveWeight:null,metricWeight:80,habitLinks:[{habitId:hEnglish.id,weight:null},{habitId:hCantonese.id,weight:null}]});
  await put('meta',{id:'createdAt',value:new Date().toISOString()});
  await put('meta',{id:'schemaVersion',value:4});
}

function inferMetricType(k){
  const s=`${k.name||''} ${k.unit||''}`.toLowerCase();
  if(/kg|体重|体脂|数值|率/.test(s))return'measurement';
  if(/min|分钟|小时|hour|h\b/.test(s))return'duration';
  if(/次|次数|回/.test(s))return'count';
  if(/km|公里|页|个|ml|毫升/.test(s))return'quantity';
  return'manual';
}
function inferPeriod(k){const s=`${k.name||''} ${k.unit||''}`;if(/每天|每日/.test(s))return'day';if(/每周|周/.test(s))return'week';if(/每月|月/.test(s))return'month';if(/每年|年度|年/.test(s))return'year';return'cumulative'}
async function migrateV4(){
  let folders=await getAll('folders');
  for(const f of folders){if(f.parentId===undefined)await put('folders',{...f,parentId:null})}
  folders=await getAll('folders');
  const langRoot=folders.find(f=>f.name==='语言学习'&&!f.parentId);
  if(langRoot){
    let english=folders.find(f=>f.name==='英语学习'&&f.parentId===langRoot.id);
    let cantonese=folders.find(f=>f.name==='粤语学习'&&f.parentId===langRoot.id);
    if(!english){english={id:uid(),name:'英语学习',emoji:'🇬🇧',parentId:langRoot.id};await put('folders',english)}
    if(!cantonese){cantonese={id:uid(),name:'粤语学习',emoji:'🇭🇰',parentId:langRoot.id};await put('folders',cantonese)}
    for(const h of await getAll('habits')){
      let patch={...h};
      if(h.folderId===langRoot.id&&h.name==='英语学习')Object.assign(patch,{folderId:english.id,name:'英语综合学习'});
      if(h.folderId===langRoot.id&&h.name==='粤语学习')Object.assign(patch,{folderId:cantonese.id,name:'粤语综合学习'});
      if(patch.folderId!==h.folderId||patch.name!==h.name)await put('habits',patch);
    }
  }
  const habits=await getAll('habits');
  const habitById=new Map(habits.map(h=>[h.id,h]));
  const krs=await getAll('krs');
  for(const k of krs){
    const links=Array.isArray(k.habitLinks)?k.habitLinks.map(x=>({habitId:x.habitId,weight:x.weight??null})):[];
    for(const h of habits.filter(h=>h.krId===k.id)){if(habitById.has(h.id)&&!links.some(x=>x.habitId===h.id))links.push({habitId:h.id,weight:null})}
    await put('krs',{...k,metricType:k.metricType||inferMetricType(k),period:k.period||inferPeriod(k),objectiveWeight:k.objectiveWeight??null,metricWeight:Number.isFinite(Number(k.metricWeight))?Number(k.metricWeight):80,habitLinks:links,startValue:Number(k.startValue??0),targetValue:Number(k.targetValue??0),currentValue:Number(k.currentValue??0),unit:k.unit||''});
  }
  await put('meta',{id:'schemaVersion',value:4});
}
