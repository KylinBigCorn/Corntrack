const DB_NAME='lifetrack-db';
const DB_VERSION=1;
const STORES=['folders','goals','krs','habits','records','meta'];
let db;
let state={tab:'today',calendarDate:new Date()};

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const todayISO=()=>new Date().toISOString().slice(0,10);
const fmtDate=(d)=>new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'short'}).format(d);
const clamp=(n,a,b)=>Math.min(Math.max(n,a),b);
const uid=()=>crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const d=req.result;STORES.forEach(s=>{if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'id'})})};req.onsuccess=()=>{db=req.result;resolve(db)};req.onerror=()=>reject(req.error)})}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function getAll(store){return new Promise((resolve,reject)=>{const r=tx(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function put(store,val){return new Promise((resolve,reject)=>{const r=tx(store,'readwrite').put(val);r.onsuccess=()=>resolve(val);r.onerror=()=>reject(r.error)})}
function del(store,id){return new Promise((resolve,reject)=>{const r=tx(store,'readwrite').delete(id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
function clearStore(store){return new Promise((resolve,reject)=>{const r=tx(store,'readwrite').clear();r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}

async function seed(){
  if((await getAll('folders')).length) return;
  const f1={id:uid(),name:'健身减脂',emoji:'💪'}; const f2={id:uid(),name:'语言学习',emoji:'🌍'};
  const g1={id:uid(),name:'健身减脂',emoji:'🎯',description:'降低体重、建立稳定运动习惯'};
  const g2={id:uid(),name:'语言学习',emoji:'🗣️',description:'持续提高英语和粤语能力'};
  await Promise.all([put('folders',f1),put('folders',f2),put('goals',g1),put('goals',g2)]);
  await put('krs',{id:uid(),goalId:g1.id,name:'体重降到 68 kg',startValue:75,targetValue:68,currentValue:75,unit:'kg'});
  await put('krs',{id:uid(),goalId:g1.id,name:'每周运动至少 4 次',startValue:0,targetValue:4,currentValue:0,unit:'次/周'});
  await put('krs',{id:uid(),goalId:g2.id,name:'每周语言学习 7 小时',startValue:0,targetValue:420,currentValue:0,unit:'min/周'});
  const habits=[
    {name:'记录体重',emoji:'⚖️',folderId:f1.id,goalId:g1.id,type:'measurement',target:null,unit:'kg',scheduleType:'recommended',startTime:'08:00',endTime:'',paused:false},
    {name:'力量训练',emoji:'🏋️',folderId:f1.id,goalId:g1.id,type:'duration',target:45,unit:'min',scheduleType:'anytime',startTime:'',endTime:'',paused:false},
    {name:'有氧训练',emoji:'🏃',folderId:f1.id,goalId:g1.id,type:'duration',target:30,unit:'min',scheduleType:'anytime',startTime:'',endTime:'',paused:false},
    {name:'英语学习',emoji:'🇬🇧',folderId:f2.id,goalId:g2.id,type:'duration',target:60,unit:'min',scheduleType:'anytime',startTime:'',endTime:'',paused:false},
    {name:'粤语学习',emoji:'🇭🇰',folderId:f2.id,goalId:g2.id,type:'duration',target:60,unit:'min',scheduleType:'anytime',startTime:'',endTime:'',paused:false},
  ];
  for(const h of habits) await put('habits',{id:uid(),...h});
  await put('meta',{id:'createdAt',value:new Date().toISOString()});
}

async function allData(){const out={};for(const s of STORES)out[s]=await getAll(s);return out}

function progressForKR(kr){const s=Number(kr.startValue),t=Number(kr.targetValue),c=Number(kr.currentValue);if(t===s)return c===t?1:0;return clamp((c-s)/(t-s),0,1)}
function recordValue(r,h){if(h.type==='duration'||h.type==='quantity')return Number(r.value||0);if(h.type==='measurement')return Number(r.value||0);return 1}
function habitDaySummary(h,records,date){const rs=records.filter(r=>r.habitId===h.id&&r.date===date);let value=0,done=false;
  if(h.type==='boolean')done=rs.length>0;
  else if(h.type==='measurement'){value=rs.length?Number(rs.sort((a,b)=>(a.time||'').localeCompare(b.time||''))[rs.length-1].value):0;done=rs.length>0}
  else {value=rs.reduce((a,r)=>a+Number(r.value||0),0);done=h.target?value>=Number(h.target):rs.length>0}
  return {records:rs,value,done}
}
function dayCompletion(habits,records,date){const active=habits.filter(h=>!h.paused);if(!active.length)return 0;return active.filter(h=>habitDaySummary(h,records,date).done).length/active.length}
function scheduleLabel(h){if(h.scheduleType==='recommended'&&h.startTime)return `推荐 ${h.startTime}`;if(h.scheduleType==='window'&&h.startTime)return `${h.startTime}${h.endTime?'–'+h.endTime:''}`;return '全天'}
function habitSummaryText(h,sum){if(h.type==='boolean')return sum.done?'已完成':'未完成';if(h.type==='measurement')return sum.done?`${sum.value} ${h.unit||''}`:'未记录';return `${sum.value}${h.target?` / ${h.target}`:''} ${h.unit||''}`}

async function render(){
  const titles={today:['TODAY','今天'],calendar:['CALENDAR','日历'],goals:['GOALS','目标'],insights:['INSIGHTS','趋势'],data:['DATA','数据']};
  $('#eyebrow').textContent=titles[state.tab][0];$('#pageTitle').textContent=titles[state.tab][1];
  $$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
  $('#quickAddBtn').style.display=state.tab==='insights'||state.tab==='data'?'none':'grid';
  if(state.tab==='today')await renderToday(); if(state.tab==='calendar')await renderCalendar(); if(state.tab==='goals')await renderGoals(); if(state.tab==='insights')await renderInsights(); if(state.tab==='data')await renderData();
}

async function renderToday(){const [folders,habits,records]=await Promise.all([getAll('folders'),getAll('habits'),getAll('records')]);const date=todayISO();const active=habits.filter(h=>!h.paused);const completed=active.filter(h=>habitDaySummary(h,records,date).done).length;const pct=active.length?Math.round(completed/active.length*100):0;
  let html=`<section class="card hero"><div class="muted small">${fmtDate(new Date())}</div><div class="hero-row"><div><div class="hero-number">${completed}<span class="muted">/${active.length}</span></div><div class="muted">今日完成 · ${pct}%</div></div><div>${pct>=100?'✓':''}</div></div><div class="progress"><i style="width:${pct}%"></i></div></section>`;
  for(const f of folders){const hs=habits.filter(h=>h.folderId===f.id);if(!hs.length)continue;html+=`<div class="section-title"><span>${f.emoji} ${f.name}</span><span class="muted small">${hs.filter(h=>habitDaySummary(h,records,date).done).length}/${hs.length}</span></div><section class="card folder-card">`;
    for(const h of hs){const s=habitDaySummary(h,records,date);html+=`<div class="habit" data-habit="${h.id}"><div class="habit-emoji">${h.emoji}</div><div class="habit-main"><div class="habit-name">${h.name}${h.paused?' <span class="muted small">暂停</span>':''}</div><div class="habit-sub">${habitSummaryText(h,s)} · ${scheduleLabel(h)}</div></div><button class="check-btn ${s.done?'done':''}" data-record="${h.id}" ${h.paused?'disabled':''}>${s.done?'✓':'＋'}</button></div>`}
    html+='</section>'}
  if(!folders.length)html+='<div class="empty-state">还没有项目。点右上角 ＋ 开始创建。</div>';
  $('#view').innerHTML=html; $$('[data-record]').forEach(b=>b.onclick=e=>{e.stopPropagation();openRecord(b.dataset.record)}); $$('[data-habit]').forEach(el=>el.onclick=()=>openRecord(el.dataset.habit));
}

async function renderCalendar(){const [habits,records]=await Promise.all([getAll('habits'),getAll('records')]);const d=state.calendarDate;const y=d.getFullYear(),m=d.getMonth();const first=new Date(y,m,1),days=new Date(y,m+1,0).getDate();const offset=(first.getDay()+6)%7;let cells='';['一','二','三','四','五','六','日'].forEach(x=>cells+=`<div class="dow">${x}</div>`);for(let i=0;i<offset;i++)cells+='<button class="day empty"></button>';for(let day=1;day<=days;day++){const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;const p=dayCompletion(habits,records,ds);const lv=p===0?0:p<.4?1:p<.7?2:p<1?3:4;cells+=`<button class="day ${lv?'lv'+lv:''} ${ds===todayISO()?'today':''}" data-day="${ds}">${day}<small>${Math.round(p*100)}%</small></button>`}
  $('#view').innerHTML=`<section class="card"><div class="calendar-head"><button class="secondary-btn" id="prevMonth">‹</button><strong>${y}年 ${m+1}月</strong><button class="secondary-btn" id="nextMonth">›</button></div><div class="calendar-grid" style="margin-top:14px">${cells}</div></section><div class="install-tip">颜色越深，表示当天计划完成率越高。点击任意日期可查看、补录和修改历史记录。</div>`;
  $('#prevMonth').onclick=()=>{state.calendarDate=new Date(y,m-1,1);renderCalendar()};$('#nextMonth').onclick=()=>{state.calendarDate=new Date(y,m+1,1);renderCalendar()};$$('[data-day]').forEach(b=>b.onclick=()=>openDay(b.dataset.day));
}

async function renderGoals(){const [goals,krs,habits]=await Promise.all([getAll('goals'),getAll('krs'),getAll('habits')]);let html='<div class="row-actions"><button class="secondary-btn" id="addGoal">＋ Objective</button><button class="secondary-btn" id="addKr">＋ Key Result</button></div>';
  for(const g of goals){const ks=krs.filter(k=>k.goalId===g.id),hs=habits.filter(h=>h.goalId===g.id);html+=`<section class="card goal-card"><h3>${g.emoji} ${g.name}</h3><p class="muted small">${g.description||''}</p>`;for(const k of ks){const p=progressForKR(k);html+=`<div class="kr"><div class="kr-line"><div><div class="kr-name">${k.name}</div><div class="muted small">${k.currentValue} → ${k.targetValue} ${k.unit||''}</div></div><strong>${Math.round(p*100)}%</strong></div><div class="progress"><i style="width:${p*100}%"></i></div></div>`}if(hs.length)html+=`<div class="goal-habits">${hs.map(h=>`<span class="chip">${h.emoji} ${h.name}</span>`).join('')}</div>`;html+='</section>'}
  $('#view').innerHTML=html;$('#addGoal').onclick=()=>$('#goalDialog').showModal();$('#addKr').onclick=()=>openKR();
}

function dateRange(period){const now=new Date();let start=new Date(now);if(period==='week'){const day=(now.getDay()+6)%7;start.setDate(now.getDate()-day)}if(period==='month')start=new Date(now.getFullYear(),now.getMonth(),1);if(period==='year')start=new Date(now.getFullYear(),0,1);return [start.toISOString().slice(0,10),todayISO()]}
async function renderInsights(){const [habits,records]=await Promise.all([getAll('habits'),getAll('records')]);const [start,end]=dateRange('month');const rs=records.filter(r=>r.date>=start&&r.date<=end);const dates=[...new Set(rs.map(r=>r.date))];const avg=dates.length?Math.round(dates.reduce((a,d)=>a+dayCompletion(habits,records,d),0)/dates.length*100):0;const totalMin=rs.reduce((a,r)=>{const h=habits.find(x=>x.id===r.habitId);return a+(h?.type==='duration'?Number(r.value||0):0)},0);let bars='';for(const h of habits){if(h.type!=='duration')continue;const v=rs.filter(r=>r.habitId===h.id).reduce((a,r)=>a+Number(r.value||0),0);bars+=`<div class="bar-row"><span class="small">${h.emoji} ${h.name}</span><div class="mini-bar"><i style="width:${Math.min(100,v/600*100)}%"></i></div><strong class="small">${Math.round(v/60*10)/10}h</strong></div>`}let heat='';for(let i=41;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const ds=d.toISOString().slice(0,10);const p=dayCompletion(habits,records,ds);const lv=p===0?0:p<.4?1:p<.7?2:p<1?3:4;heat+=`<div class="heat ${lv?'lv'+lv:''}" title="${ds} ${Math.round(p*100)}%"></div>`}
  $('#view').innerHTML=`<div class="row-actions"><span class="chip">本月</span><span class="chip">自动汇总</span></div><div class="stat-grid"><div class="stat"><span class="muted small">平均完成率</span><b>${avg}%</b></div><div class="stat"><span class="muted small">学习/训练时长</span><b>${Math.round(totalMin/60*10)/10}h</b></div><div class="stat"><span class="muted small">记录数</span><b>${rs.length}</b></div><div class="stat"><span class="muted small">活跃天数</span><b>${dates.length}</b></div></div><section class="card"><div class="section-title">时长分布</div>${bars||'<div class="muted small">暂无时长型记录</div>'}</section><section class="card"><div class="section-title">最近 6 周</div><div class="heatmap">${heat}</div></section>`;
}

async function renderData(){const data=await allData();const rec=data.records;const dates=rec.map(r=>r.date).sort();const lastBackup=data.meta.find(m=>m.id==='lastBackup')?.value||'从未';const created=data.meta.find(m=>m.id==='createdAt')?.value?.slice(0,10)||'—';$('#view').innerHTML=`<section class="card"><div class="section-title">本地数据库</div><div class="data-row"><span>状态</span><strong>正常</strong></div><div class="data-row"><span>打卡记录</span><strong>${rec.length} 条</strong></div><div class="data-row"><span>数据范围</span><strong>${dates.length?dates[0]+' → '+dates.at(-1):'暂无记录'}</strong></div><div class="data-row"><span>创建日期</span><strong>${created}</strong></div><div class="data-row"><span>最近完整备份</span><strong>${lastBackup==='从未'?lastBackup:new Date(lastBackup).toLocaleDateString('zh-CN')}</strong></div></section><section class="card"><div class="section-title">导出与备份</div><div class="row-actions"><button class="secondary-btn" id="exportCSV">导出 CSV</button><button class="secondary-btn" id="exportExcel">导出 Excel</button><button class="secondary-btn" id="backupJSON">完整 JSON 备份</button><button class="secondary-btn" id="restoreJSON">恢复备份</button></div></section><div class="install-tip"><strong>数据位置：</strong>打卡数据保存在当前 iPhone 的 Safari / Web App 本地数据库（IndexedDB）中，不会自动上传。JSON 备份可另存到 iPhone「文件」App，便于换机或恢复。</div>`;$('#exportCSV').onclick=exportCSV;$('#exportExcel').onclick=exportExcel;$('#backupJSON').onclick=backupJSON;$('#restoreJSON').onclick=()=>$('#restoreInput').click();}

async function populateSelects(){const [folders,goals]=await Promise.all([getAll('folders'),getAll('goals')]);$('#habitFolderSelect').innerHTML=folders.map(f=>`<option value="${f.id}">${f.emoji} ${f.name}</option>`).join('')+`<option value="__new">＋ 新建文件夹</option>`;$('#habitGoalSelect').innerHTML='<option value="">不关联目标</option>'+goals.map(g=>`<option value="${g.id}">${g.emoji} ${g.name}</option>`).join('');$('#krGoalSelect').innerHTML=goals.map(g=>`<option value="${g.id}">${g.emoji} ${g.name}</option>`).join('')}
async function openRecord(habitId,date=todayISO(),record=null){const habits=await getAll('habits');const h=habits.find(x=>x.id===habitId);if(!h)return;const f=$('#recordForm');f.reset();f.habitId.value=h.id;f.recordId.value=record?.id||'';f.date.value=record?.date||date;f.time.value=record?.time||new Date().toTimeString().slice(0,5);f.note.value=record?.note||'';$('#recordTitle').textContent=record?'修改记录':'记录打卡';$('#recordHabitMeta').innerHTML=`<strong>${h.emoji} ${h.name}</strong><span class="muted small">${scheduleLabel(h)} · ${h.type}</span>`;let field='';if(h.type==='duration')field=`<label>本次时长（${h.unit||'min'}）<input name="value" type="number" step="1" value="${record?.value??h.target??30}" required /></label>`;if(h.type==='quantity')field=`<label>本次数量（${h.unit||''}）<input name="value" type="number" step="0.1" value="${record?.value??''}" required /></label>`;if(h.type==='measurement')field=`<label>本次数值（${h.unit||''}）<input name="value" type="number" step="0.1" value="${record?.value??''}" required /></label>`;$('#dynamicRecordFields').innerHTML=field;$('#deleteRecordBtn').classList.toggle('hidden',!record);$('#recordDialog').showModal()}
async function openDay(date){const [habits,records]=await Promise.all([getAll('habits'),getAll('records')]);$('#dayDialogTitle').textContent=new Date(date+'T12:00:00').toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'});let html='';for(const h of habits){const s=habitDaySummary(h,records,date);html+=`<div class="habit" data-dayhabit="${h.id}"><div class="habit-emoji">${h.emoji}</div><div class="habit-main"><div class="habit-name">${h.name}</div><div class="habit-sub">${habitSummaryText(h,s)}${s.records.length?` · ${s.records.length} 条记录`:''}</div></div><button class="check-btn" data-dayadd="${h.id}">＋</button></div>`;for(const r of s.records){html+=`<div class="data-row" style="padding-left:58px"><span class="small">${r.time||'—'} ${r.value??''} ${h.type==='boolean'?'':h.unit||''} ${r.note?'· '+r.note:''}</span><button class="text-btn" data-editrec="${r.id}">编辑</button></div>`}}$('#dayDialogBody').innerHTML=html;$('#dayDialog').showModal();$$('[data-dayadd]').forEach(b=>b.onclick=()=>openRecord(b.dataset.dayadd,date));$$('[data-editrec]').forEach(b=>b.onclick=async()=>{const r=records.find(x=>x.id===b.dataset.editrec);openRecord(r.habitId,r.date,r)})}
async function openKR(){await populateSelects();$('#krDialog').showModal()}

$('#habitForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);if(fd.get('folderId')==='__new'){e.currentTarget.closest('dialog').close();$('#folderDialog').showModal();return}await put('habits',{id:uid(),name:fd.get('name'),emoji:fd.get('emoji')||'✅',folderId:fd.get('folderId'),goalId:fd.get('goalId'),type:fd.get('type'),target:fd.get('target')?Number(fd.get('target')):null,unit:fd.get('unit'),scheduleType:fd.get('scheduleType'),startTime:fd.get('startTime'),endTime:fd.get('endTime'),paused:false});e.currentTarget.closest('dialog').close();render()});
$('#recordForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const id=fd.get('recordId')||uid();await put('records',{id,habitId:fd.get('habitId'),date:fd.get('date'),time:fd.get('time'),value:fd.get('value')!==null&&fd.get('value')!==''?Number(fd.get('value')):null,note:fd.get('note'),createdAt:new Date().toISOString()});e.currentTarget.closest('dialog').close();render()});
$('#deleteRecordBtn').onclick=async()=>{const id=$('#recordForm').recordId.value;if(id&&confirm('删除这条记录？')){await del('records',id);$('#recordDialog').close();render()}};
$('#goalForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);await put('goals',{id:uid(),name:fd.get('name'),emoji:fd.get('emoji')||'🎯',description:fd.get('description')});e.currentTarget.closest('dialog').close();render()});
$('#krForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);await put('krs',{id:uid(),goalId:fd.get('goalId'),name:fd.get('name'),startValue:Number(fd.get('startValue')),targetValue:Number(fd.get('targetValue')),currentValue:Number(fd.get('currentValue')),unit:fd.get('unit')});e.currentTarget.closest('dialog').close();render()});
$('#folderForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);await put('folders',{id:uid(),name:fd.get('name'),emoji:fd.get('emoji')||'📁'});e.currentTarget.closest('dialog').close();render()});
$('#closeDayDialog').onclick=()=>$('#dayDialog').close();

$('#quickAddBtn').onclick=async()=>{await populateSelects();if(state.tab==='goals'){$('#goalDialog').showModal()}else{$('#habitDialog').showModal()}};
$$('.tab').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render()});

function download(name,content,type='text/plain;charset=utf-8'){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function normalizedRows(){const [habits,goals,folders,records]=await Promise.all([getAll('habits'),getAll('goals'),getAll('folders'),getAll('records')]);return records.map(r=>{const h=habits.find(x=>x.id===r.habitId),g=goals.find(x=>x.id===h?.goalId),f=folders.find(x=>x.id===h?.folderId);return {日期:r.date,时间:r.time||'',目标:g?.name||'',文件夹:f?.name||'',项目:h?.name||'',类型:h?.type||'',数值:r.value??'',单位:h?.unit||'',备注:r.note||''}})}
async function exportCSV(){const rows=await normalizedRows();const headers=Object.keys(rows[0]||{日期:'',时间:'',目标:'',文件夹:'',项目:'',类型:'',数值:'',单位:'',备注:''});const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;download(`LifeTrack_${todayISO()}.csv`,'\ufeff'+[headers.map(esc).join(','),...rows.map(r=>headers.map(h=>esc(r[h])).join(','))].join('\n'),'text/csv;charset=utf-8')}
async function exportExcel(){const rows=await normalizedRows();const headers=Object.keys(rows[0]||{日期:'',时间:'',目标:'',文件夹:'',项目:'',类型:'',数值:'',单位:'',备注:''});const cell=v=>`<Cell><Data ss:Type="String">${String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;')}</Data></Cell>`;const xml=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="打卡明细"><Table><Row>${headers.map(cell).join('')}</Row>${rows.map(r=>`<Row>${headers.map(h=>cell(r[h])).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`;download(`LifeTrack_${todayISO()}.xls`,xml,'application/vnd.ms-excel')}
async function backupJSON(){const data=await allData();data.schemaVersion=1;data.exportedAt=new Date().toISOString();await put('meta',{id:'lastBackup',value:data.exportedAt});download(`LifeTrack_FullBackup_${todayISO()}.json`,JSON.stringify(data,null,2),'application/json');renderData()}
$('#restoreInput').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!confirm('恢复备份会覆盖当前本地数据，确定继续？'))return;for(const s of STORES){await clearStore(s);for(const item of (data[s]||[]))await put(s,item)}alert('恢复完成');render()}catch(err){alert('备份文件无法读取：'+err.message)}finally{e.target.value=''}});

(async function init(){await openDB();await seed();if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('./sw.js')}catch(e){console.warn('Service worker registration skipped',e)}}render()})();
