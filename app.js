const DB_NAME='lifetrack-db';
const DB_VERSION=1;
const STORES=['folders','goals','krs','habits','records','meta'];
let db;
let state={tab:'today',calendarDate:new Date()};

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const todayISO=()=>new Date().toISOString().slice(0,10);
const nowTime=()=>new Date().toTimeString().slice(0,5);
const fmtDate=d=>new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'short'}).format(d);
const clamp=(n,a,b)=>Math.min(Math.max(n,a),b);
const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const d=req.result;
      STORES.forEach(s=>{if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'id'})});
    };
    req.onsuccess=()=>{db=req.result;resolve(db)};
    req.onerror=()=>reject(req.error);
  });
}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function getAll(store){return new Promise((resolve,reject)=>{const r=tx(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function getOne(store,id){return new Promise((resolve,reject)=>{const r=tx(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function put(store,val){return new Promise((resolve,reject)=>{const r=tx(store,'readwrite').put(val);r.onsuccess=()=>resolve(val);r.onerror=()=>reject(r.error)})}
function del(store,id){return new Promise((resolve,reject)=>{const r=tx(store,'readwrite').delete(id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
function clearStore(store){return new Promise((resolve,reject)=>{const r=tx(store,'readwrite').clear();r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}

async function seed(){
  const folders=await getAll('folders');
  if(folders.length)return;
  const f1={id:uid(),name:'健身减脂',emoji:'💪',parentId:null};
  const f2={id:uid(),name:'语言学习',emoji:'🌍',parentId:null};
  const f3={id:uid(),name:'英语学习',emoji:'🇬🇧',parentId:f2.id};
  const f4={id:uid(),name:'粤语学习',emoji:'🇭🇰',parentId:f2.id};
  const g1={id:uid(),name:'健身减脂',emoji:'🎯',description:'降低体重、建立稳定运动习惯'};
  const g2={id:uid(),name:'语言学习',emoji:'🗣️',description:'持续提高英语和粤语能力'};
  await Promise.all([put('folders',f1),put('folders',f2),put('folders',f3),put('folders',f4),put('goals',g1),put('goals',g2)]);
  const krWeight={id:uid(),goalId:g1.id,name:'体重降到 68 kg',startValue:75,targetValue:68,currentValue:75,unit:'kg'};
  const krExercise={id:uid(),goalId:g1.id,name:'每周运动至少 4 次',startValue:0,targetValue:4,currentValue:0,unit:'次/周'};
  const krLang={id:uid(),goalId:g2.id,name:'每周语言学习 7 小时',startValue:0,targetValue:420,currentValue:0,unit:'min/周'};
  await Promise.all([put('krs',krWeight),put('krs',krExercise),put('krs',krLang)]);
  const habits=[
    {name:'记录体重',emoji:'⚖️',folderId:f1.id,goalId:g1.id,krId:krWeight.id,type:'measurement',target:null,unit:'kg',scheduleType:'recommended',startTime:'08:00',endTime:'',paused:false},
    {name:'力量训练',emoji:'🏋️',folderId:f1.id,goalId:g1.id,krId:krExercise.id,type:'duration',target:45,unit:'min',scheduleType:'anytime',startTime:'',endTime:'',paused:false},
    {name:'有氧训练',emoji:'🏃',folderId:f1.id,goalId:g1.id,krId:krExercise.id,type:'duration',target:30,unit:'min',scheduleType:'anytime',startTime:'',endTime:'',paused:false},
    {name:'英语综合学习',emoji:'🇬🇧',folderId:f3.id,goalId:g2.id,krId:krLang.id,type:'duration',target:60,unit:'min',scheduleType:'anytime',startTime:'',endTime:'',paused:false},
    {name:'粤语综合学习',emoji:'🇭🇰',folderId:f4.id,goalId:g2.id,krId:krLang.id,type:'duration',target:60,unit:'min',scheduleType:'anytime',startTime:'',endTime:'',paused:false},
  ];
  for(const h of habits)await put('habits',{id:uid(),...h});
  await put('meta',{id:'createdAt',value:new Date().toISOString()});
}

async function migrateV2(){
  let folders=await getAll('folders');
  for(const f of folders){if(f.parentId===undefined)await put('folders',{...f,parentId:null})}
  folders=await getAll('folders');
  const langRoot=folders.find(f=>f.name==='语言学习'&&!f.parentId);
  if(langRoot){
    let english=folders.find(f=>f.name==='英语学习'&&f.parentId===langRoot.id);
    let cantonese=folders.find(f=>f.name==='粤语学习'&&f.parentId===langRoot.id);
    if(!english){english={id:uid(),name:'英语学习',emoji:'🇬🇧',parentId:langRoot.id};await put('folders',english)}
    if(!cantonese){cantonese={id:uid(),name:'粤语学习',emoji:'🇭🇰',parentId:langRoot.id};await put('folders',cantonese)}
    const habits=await getAll('habits');
    for(const h of habits){
      const patch={...h,krId:h.krId||null};
      if(h.folderId===langRoot.id&&/^英语学习$/.test(h.name))Object.assign(patch,{folderId:english.id,name:'英语综合学习'});
      if(h.folderId===langRoot.id&&/^粤语学习$/.test(h.name))Object.assign(patch,{folderId:cantonese.id,name:'粤语综合学习'});
      if(patch.krId!==h.krId||patch.folderId!==h.folderId||patch.name!==h.name)await put('habits',patch);
    }
  }
  const habits=await getAll('habits');
  for(const h of habits){if(h.krId===undefined)await put('habits',{...h,krId:null})}
}

async function allData(){const out={};for(const s of STORES)out[s]=await getAll(s);return out}
function progressForKR(kr){const s=Number(kr.startValue),t=Number(kr.targetValue),c=Number(kr.currentValue);if(t===s)return c===t?1:0;return clamp((c-s)/(t-s),0,1)}
function habitDaySummary(h,records,date){
  const rs=records.filter(r=>r.habitId===h.id&&r.date===date).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  let value=0,done=false;
  if(h.type==='boolean')done=rs.length>0;
  else if(h.type==='measurement'){value=rs.length?Number(rs[rs.length-1].value||0):0;done=rs.length>0}
  else{value=rs.reduce((a,r)=>a+Number(r.value||0),0);done=h.target?value>=Number(h.target):rs.length>0}
  return{records:rs,value,done};
}
function dayCompletion(habits,records,date){const active=habits.filter(h=>!h.paused);if(!active.length)return 0;return active.filter(h=>habitDaySummary(h,records,date).done).length/active.length}
function scheduleLabel(h){if(h.scheduleType==='recommended'&&h.startTime)return`推荐 ${h.startTime}`;if(h.scheduleType==='window'&&h.startTime)return`${h.startTime}${h.endTime?'–'+h.endTime:''}`;return'全天'}
function habitSummaryText(h,sum){if(h.type==='boolean')return sum.done?'已完成':'未完成';if(h.type==='measurement')return sum.done?`${sum.value} ${h.unit||''}`:'未记录';return`${sum.value}${h.target?` / ${h.target}`:''} ${h.unit||''}`}
function descendants(folderId,folders){const ids=[folderId];for(const c of folders.filter(f=>f.parentId===folderId))ids.push(...descendants(c.id,folders));return ids}
function folderHabitList(folderId,folders,habits){const ids=new Set(descendants(folderId,folders));return habits.filter(h=>ids.has(h.folderId))}
function folderPath(folderId,folders){const names=[];let cur=folders.find(f=>f.id===folderId);const seen=new Set();while(cur&&!seen.has(cur.id)){seen.add(cur.id);names.unshift(`${cur.emoji||'📁'} ${cur.name}`);cur=folders.find(f=>f.id===cur.parentId)}return names.join(' / ')}
function folderOptions(folders,selected='',excludeId=null){
  let html='<option value="">未归档</option>';
  const walk=(parentId,depth)=>{
    folders.filter(f=>(f.parentId||null)===(parentId||null)&&f.id!==excludeId).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')).forEach(f=>{
      html+=`<option value="${f.id}" ${f.id===selected?'selected':''}>${'　'.repeat(depth)}${esc(f.emoji||'📁')} ${esc(f.name)}</option>`;
      walk(f.id,depth+1);
    });
  };
  walk(null,0);return html;
}

async function render(){
  const titles={today:['TODAY','今天'],calendar:['CALENDAR','日历'],goals:['GOALS','目标'],insights:['INSIGHTS','趋势'],data:['DATA','数据']};
  $('#eyebrow').textContent=titles[state.tab][0];$('#pageTitle').textContent=titles[state.tab][1];
  $$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
  $('#quickAddBtn').style.display=state.tab==='insights'||state.tab==='data'?'none':'grid';
  if(state.tab==='today')await renderToday();
  if(state.tab==='calendar')await renderCalendar();
  if(state.tab==='goals')await renderGoals();
  if(state.tab==='insights')await renderInsights();
  if(state.tab==='data')await renderData();
}

function habitRow(h,records,date){
  const s=habitDaySummary(h,records,date);
  return`<div class="habit" data-habit-row="${h.id}">
    <div class="habit-emoji">${esc(h.emoji||'✅')}</div>
    <div class="habit-main"><div class="habit-name">${esc(h.name)}${h.paused?' <span class="muted small">暂停</span>':''}</div><div class="habit-sub">${esc(habitSummaryText(h,s))} · ${esc(scheduleLabel(h))}</div></div>
    <div class="habit-actions"><button class="edit-btn" type="button" data-edit-habit="${h.id}" aria-label="编辑任务">•••</button><button class="check-btn ${s.done?'done':''}" type="button" data-record="${h.id}" ${h.paused?'disabled':''}>${s.done?'✓':'＋'}</button></div>
  </div>`;
}
function renderFolderContent(folder,depth,folders,habits,records,date){
  const direct=habits.filter(h=>h.folderId===folder.id);
  const children=folders.filter(f=>f.parentId===folder.id).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
  let html='';
  if(depth>0){
    const all=folderHabitList(folder.id,folders,habits);const done=all.filter(h=>habitDaySummary(h,records,date).done).length;
    html+=`<div class="subfolder depth-${Math.min(depth,3)}"><div class="subfolder-head"><span>${esc(folder.emoji||'📁')} ${esc(folder.name)} <span class="folder-count">${done}/${all.length}</span></span><span class="folder-tools"><button class="mini-icon" type="button" data-add-child="${folder.id}" aria-label="新建子文件夹">＋</button><button class="mini-icon" type="button" data-edit-folder="${folder.id}" aria-label="编辑文件夹">•••</button></span></div><div class="folder-indent">`;
  }
  direct.forEach(h=>html+=habitRow(h,records,date));
  children.forEach(c=>html+=renderFolderContent(c,depth+1,folders,habits,records,date));
  if(depth>0)html+='</div></div>';
  return html;
}
async function renderToday(){
  const [folders,habits,records]=await Promise.all([getAll('folders'),getAll('habits'),getAll('records')]);
  const date=todayISO();const active=habits.filter(h=>!h.paused);const completed=active.filter(h=>habitDaySummary(h,records,date).done).length;const pct=active.length?Math.round(completed/active.length*100):0;
  let html=`<section class="card hero"><div class="muted small">${fmtDate(new Date())}</div><div class="hero-row"><div><div class="hero-number">${completed}<span class="muted">/${active.length}</span></div><div class="muted">今日完成 · ${pct}%</div></div><div>${pct>=100?'✓':''}</div></div><div class="progress"><i style="width:${pct}%"></i></div></section>`;
  html+=`<div class="row-actions"><button class="secondary-btn" type="button" id="addHabitToday">＋ 打卡任务</button><button class="secondary-btn" type="button" id="addFolderToday">＋ 文件夹</button></div>`;
  const roots=folders.filter(f=>!f.parentId).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
  for(const f of roots){
    const all=folderHabitList(f.id,folders,habits);const done=all.filter(h=>habitDaySummary(h,records,date).done).length;
    html+=`<div class="section-title"><span>${esc(f.emoji||'📁')} ${esc(f.name)}</span><span class="section-actions"><span class="muted small">${done}/${all.length}</span><button class="mini-icon" type="button" data-add-child="${f.id}">＋</button><button class="mini-icon" type="button" data-edit-folder="${f.id}">•••</button></span></div><section class="card folder-card">`;
    html+=renderFolderContent(f,0,folders,habits,records,date);
    html+='</section>';
  }
  const unfiled=habits.filter(h=>!folders.some(f=>f.id===h.folderId));
  if(unfiled.length){html+='<div class="section-title"><span>📥 未归档</span></div><section class="card folder-card">';unfiled.forEach(h=>html+=habitRow(h,records,date));html+='</section>'}
  if(!habits.length)html+='<div class="empty-state">还没有打卡任务。先新建一个任务吧。</div>';
  $('#view').innerHTML=html;
  $('#addHabitToday').onclick=()=>openHabitEdit();$('#addFolderToday').onclick=()=>openFolder();
  $$('[data-record]').forEach(b=>b.onclick=e=>{e.stopPropagation();openRecord(b.dataset.record)});
  $$('[data-habit-row]').forEach(el=>el.onclick=()=>openRecord(el.dataset.habitRow));
  $$('[data-edit-habit]').forEach(b=>b.onclick=e=>{e.stopPropagation();openHabitEdit(b.dataset.editHabit)});
  $$('[data-edit-folder]').forEach(b=>b.onclick=e=>{e.stopPropagation();openFolder(b.dataset.editFolder)});
  $$('[data-add-child]').forEach(b=>b.onclick=e=>{e.stopPropagation();openFolder(null,b.dataset.addChild)});
}

async function renderCalendar(){
  const [habits,records]=await Promise.all([getAll('habits'),getAll('records')]);
  const d=state.calendarDate;const y=d.getFullYear(),m=d.getMonth();const first=new Date(y,m,1),days=new Date(y,m+1,0).getDate();const offset=(first.getDay()+6)%7;let cells='';
  ['一','二','三','四','五','六','日'].forEach(x=>cells+=`<div class="dow">${x}</div>`);for(let i=0;i<offset;i++)cells+='<button class="day empty" type="button"></button>';
  for(let day=1;day<=days;day++){const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;const p=dayCompletion(habits,records,ds);const lv=p===0?0:p<.4?1:p<.7?2:p<1?3:4;cells+=`<button class="day ${lv?'lv'+lv:''} ${ds===todayISO()?'today':''}" type="button" data-day="${ds}">${day}<small>${Math.round(p*100)}%</small></button>`}
  $('#view').innerHTML=`<section class="card"><div class="calendar-head"><button class="secondary-btn" type="button" id="prevMonth">‹</button><strong>${y}年 ${m+1}月</strong><button class="secondary-btn" type="button" id="nextMonth">›</button></div><div class="calendar-grid" style="margin-top:14px">${cells}</div></section><div class="install-tip">颜色越深，表示当天计划完成率越高。点击任意日期可查看、补录和修改历史记录。</div>`;
  $('#prevMonth').onclick=()=>{state.calendarDate=new Date(y,m-1,1);renderCalendar()};$('#nextMonth').onclick=()=>{state.calendarDate=new Date(y,m+1,1);renderCalendar()};$$('[data-day]').forEach(b=>b.onclick=()=>openDay(b.dataset.day));
}

async function renderGoals(){
  const [goals,krs,habits]=await Promise.all([getAll('goals'),getAll('krs'),getAll('habits')]);
  let html='<div class="row-actions"><button class="secondary-btn" type="button" id="addGoal">＋ Objective</button><button class="secondary-btn" type="button" id="addKr">＋ Key Result</button></div>';
  for(const g of goals){
    const ks=krs.filter(k=>k.goalId===g.id);const directGoalHabits=habits.filter(h=>h.goalId===g.id&&!h.krId);
    html+=`<section class="card goal-card"><div class="goal-top"><div><h3>${esc(g.emoji||'🎯')} ${esc(g.name)}</h3><p class="muted small">${esc(g.description||'')}</p></div><button class="mini-icon" type="button" data-edit-goal="${g.id}">•••</button></div>`;
    for(const k of ks){
      const p=progressForKR(k),linked=habits.filter(h=>h.krId===k.id);
      html+=`<div class="kr"><div class="kr-line"><div><div class="kr-name">${esc(k.name)}</div><div class="muted small">${esc(k.currentValue)} → ${esc(k.targetValue)} ${esc(k.unit||'')}</div></div><div class="kr-actions"><strong>${Math.round(p*100)}%</strong><button class="mini-icon" type="button" data-edit-kr="${k.id}">•••</button></div></div><div class="progress"><i style="width:${p*100}%"></i></div><div class="kr-linked"><div class="kr-linked-label">绑定的打卡任务</div><div class="goal-habits">${linked.map(h=>`<button class="chip" type="button" data-edit-habit="${h.id}">${esc(h.emoji||'✅')} ${esc(h.name)}</button>`).join('')}<button class="link-add" type="button" data-bind-kr="${k.id}" data-goal="${g.id}">＋ 绑定任务</button></div></div></div>`;
    }
    if(directGoalHabits.length)html+=`<div class="kr-linked"><div class="kr-linked-label">仅绑定 Objective</div><div class="goal-habits">${directGoalHabits.map(h=>`<button class="chip" type="button" data-edit-habit="${h.id}">${esc(h.emoji||'✅')} ${esc(h.name)}</button>`).join('')}</div></div>`;
    html+=`<div class="row-actions" style="margin-top:12px"><button class="link-add" type="button" data-add-kr-for="${g.id}">＋ 新建 KR</button><button class="link-add" type="button" data-bind-goal="${g.id}">＋ 绑定任务到目标</button></div></section>`;
  }
  if(!goals.length)html+='<div class="empty-state">还没有 Objective。点上方按钮创建。</div>';
  $('#view').innerHTML=html;
  $('#addGoal').onclick=()=>openGoal();$('#addKr').onclick=()=>openKR();
  $$('[data-edit-goal]').forEach(b=>b.onclick=()=>openGoal(b.dataset.editGoal));
  $$('[data-edit-kr]').forEach(b=>b.onclick=()=>openKR(b.dataset.editKr));
  $$('[data-edit-habit]').forEach(b=>b.onclick=()=>openHabitEdit(b.dataset.editHabit));
  $$('[data-add-kr-for]').forEach(b=>b.onclick=()=>openKR(null,b.dataset.addKrFor));
  $$('[data-bind-kr]').forEach(b=>b.onclick=()=>openHabitEdit(null,{goalId:b.dataset.goal,krId:b.dataset.bindKr}));
  $$('[data-bind-goal]').forEach(b=>b.onclick=()=>openHabitEdit(null,{goalId:b.dataset.bindGoal,krId:null}));
}

function dateRange(period){const now=new Date();let start=new Date(now);if(period==='week'){const day=(now.getDay()+6)%7;start.setDate(now.getDate()-day)}if(period==='month')start=new Date(now.getFullYear(),now.getMonth(),1);if(period==='year')start=new Date(now.getFullYear(),0,1);return[start.toISOString().slice(0,10),todayISO()]}
async function renderInsights(){
  const [habits,records]=await Promise.all([getAll('habits'),getAll('records')]);const[start,end]=dateRange('month');const rs=records.filter(r=>r.date>=start&&r.date<=end);const dates=[...new Set(rs.map(r=>r.date))];const avg=dates.length?Math.round(dates.reduce((a,d)=>a+dayCompletion(habits,records,d),0)/dates.length*100):0;const totalMin=rs.reduce((a,r)=>{const h=habits.find(x=>x.id===r.habitId);return a+(h?.type==='duration'?Number(r.value||0):0)},0);
  let bars='';for(const h of habits){if(h.type!=='duration')continue;const v=rs.filter(r=>r.habitId===h.id).reduce((a,r)=>a+Number(r.value||0),0);bars+=`<div class="bar-row"><span class="small">${esc(h.emoji||'✅')} ${esc(h.name)}</span><div class="mini-bar"><i style="width:${Math.min(100,v/600*100)}%"></i></div><strong class="small">${Math.round(v/60*10)/10}h</strong></div>`}
  let heat='';for(let i=41;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const ds=d.toISOString().slice(0,10);const p=dayCompletion(habits,records,ds);const lv=p===0?0:p<.4?1:p<.7?2:p<1?3:4;heat+=`<div class="heat ${lv?'lv'+lv:''}" title="${ds} ${Math.round(p*100)}%"></div>`}
  $('#view').innerHTML=`<div class="row-actions"><span class="chip">本月</span><span class="chip">自动汇总</span></div><div class="stat-grid"><div class="stat"><span class="muted small">平均完成率</span><b>${avg}%</b></div><div class="stat"><span class="muted small">学习/训练时长</span><b>${Math.round(totalMin/60*10)/10}h</b></div><div class="stat"><span class="muted small">记录数</span><b>${rs.length}</b></div><div class="stat"><span class="muted small">活跃天数</span><b>${dates.length}</b></div></div><section class="card"><div class="section-title">时长分布</div>${bars||'<div class="muted small">暂无时长型记录</div>'}</section><section class="card"><div class="section-title">最近 6 周</div><div class="heatmap">${heat}</div></section>`;
}

async function renderData(){
  const data=await allData();const rec=data.records;const dates=rec.map(r=>r.date).sort();const lastBackup=data.meta.find(m=>m.id==='lastBackup')?.value||'从未';const created=data.meta.find(m=>m.id==='createdAt')?.value?.slice(0,10)||'—';
  $('#view').innerHTML=`<section class="card"><div class="section-title">本地数据库</div><div class="data-row"><span>状态</span><strong>正常</strong></div><div class="data-row"><span>打卡记录</span><strong>${rec.length} 条</strong></div><div class="data-row"><span>数据范围</span><strong>${dates.length?`${dates[0]} → ${dates[dates.length-1]}`:'暂无'}</strong></div><div class="data-row"><span>建立时间</span><strong>${created}</strong></div><div class="data-row"><span>最近备份</span><strong>${esc(lastBackup)}</strong></div></section><section class="card"><div class="section-title">导出与备份</div><div class="row-actions"><button id="exportCsv" class="secondary-btn" type="button">导出 CSV</button><button id="exportXls" class="secondary-btn" type="button">导出 Excel</button><button id="exportJson" class="secondary-btn" type="button">完整 JSON 备份</button><button id="restoreJson" class="secondary-btn" type="button">恢复 JSON</button></div></section><div class="install-tip"><b>数据位置：</b>数据保存在当前 iPhone / Safari（或主屏幕 Web App）的 IndexedDB 本地数据库中，不会上传到 GitHub。JSON 是完整备份；CSV / Excel 用于查看与分析。建议定期把 JSON 保存到“文件”App。</div>`;
  $('#exportCsv').onclick=exportCSV;$('#exportXls').onclick=exportExcel;$('#exportJson').onclick=exportJSON;$('#restoreJson').onclick=()=>$('#restoreInput').click();
}

async function openHabitEdit(id=null,preset={}){
  const [folders,goals,krs]=await Promise.all([getAll('folders'),getAll('goals'),getAll('krs')]);const form=$('#habitForm');form.reset();form.habitId.value='';form.emoji.value='✅';form.scheduleType.value='anytime';form.paused.checked=false;
  let h=null;if(id)h=await getOne('habits',id);
  const selectedGoal=h?.goalId||preset.goalId||'';const selectedKr=h?.krId||preset.krId||'';
  $('#habitFolderSelect').innerHTML=folderOptions(folders,h?.folderId||'');
  $('#habitGoalSelect').innerHTML='<option value="">不关联目标</option>'+goals.map(g=>`<option value="${g.id}" ${g.id===selectedGoal?'selected':''}>${esc(g.emoji||'🎯')} ${esc(g.name)}</option>`).join('');
  const refreshKr=sel=>{$('#habitKrSelect').innerHTML='<option value="">不关联 KR</option>'+krs.filter(k=>k.goalId===$('#habitGoalSelect').value).map(k=>`<option value="${k.id}" ${k.id===sel?'selected':''}>${esc(k.name)}</option>`).join('')};refreshKr(selectedKr);
  if(h){
    form.habitId.value=h.id;form.name.value=h.name;form.emoji.value=h.emoji||'✅';form.folderId.value=h.folderId||'';form.goalId.value=h.goalId||'';refreshKr(h.krId||'');form.type.value=h.type||'boolean';form.target.value=h.target??'';form.unit.value=h.unit||'';form.scheduleType.value=h.scheduleType||'anytime';form.startTime.value=h.startTime||'';form.endTime.value=h.endTime||'';form.paused.checked=!!h.paused;
  }
  $('#habitDialogTitle').textContent=h?'编辑打卡任务':'新建打卡任务';$('#deleteHabitBtn').classList.toggle('hidden',!h);$('#habitGoalSelect').onchange=()=>refreshKr('');$('#habitDialog').showModal();
}
async function openRecord(habitId,recordId=null,forcedDate=null){
  const h=await getOne('habits',habitId);if(!h)return;const form=$('#recordForm');form.reset();form.habitId.value=habitId;form.recordId.value=recordId||'';form.date.value=forcedDate||todayISO();form.time.value=nowTime();$('#recordTitle').textContent=recordId?'编辑记录':'记录打卡';$('#recordHabitMeta').innerHTML=`<strong>${esc(h.emoji||'✅')} ${esc(h.name)}</strong><span class="muted small">${esc(scheduleLabel(h))}</span>`;
  let field='';if(h.type==='duration')field=`<label>本次时长 (${esc(h.unit||'min')})<input name="value" type="number" step="0.1" min="0" required placeholder="例如 30" /></label>`;if(h.type==='quantity')field=`<label>本次数量 (${esc(h.unit||'')})<input name="value" type="number" step="0.1" min="0" required /></label>`;if(h.type==='measurement')field=`<label>本次数值 (${esc(h.unit||'')})<input name="value" type="number" step="0.1" required /></label>`;$('#dynamicRecordFields').innerHTML=field;
  const r=recordId?await getOne('records',recordId):null;if(r){form.date.value=r.date;form.time.value=r.time||'';const valueInput=form.querySelector('[name="value"]');if(valueInput)valueInput.value=r.value??'';form.note.value=r.note||''}
  $('#deleteRecordBtn').classList.toggle('hidden',!r);$('#recordDialog').showModal();
}
async function openGoal(id=null){const form=$('#goalForm');form.reset();form.goalId.value='';form.emoji.value='🎯';const g=id?await getOne('goals',id):null;if(g){form.goalId.value=g.id;form.name.value=g.name;form.emoji.value=g.emoji||'🎯';form.description.value=g.description||''}$('#goalDialogTitle').textContent=g?'编辑 Objective':'新建 Objective';$('#deleteGoalBtn').classList.toggle('hidden',!g);$('#goalDialog').showModal()}
async function openKR(id=null,presetGoal=''){const goals=await getAll('goals');const form=$('#krForm');form.reset();form.krId.value='';$('#krGoalSelect').innerHTML=goals.map(g=>`<option value="${g.id}">${esc(g.emoji||'🎯')} ${esc(g.name)}</option>`).join('');const k=id?await getOne('krs',id):null;if(k){form.krId.value=k.id;form.goalId.value=k.goalId;form.name.value=k.name;form.startValue.value=k.startValue;form.targetValue.value=k.targetValue;form.currentValue.value=k.currentValue;form.unit.value=k.unit||''}else if(presetGoal)form.goalId.value=presetGoal;$('#krDialogTitle').textContent=k?'编辑 Key Result':'新建 Key Result';$('#deleteKrBtn').classList.toggle('hidden',!k);$('#krDialog').showModal()}
async function openFolder(id=null,parentId=null){const folders=await getAll('folders');const form=$('#folderForm');form.reset();form.folderId.value='';form.emoji.value='📁';const f=id?await getOne('folders',id):null;$('#folderParentSelect').innerHTML='<option value="">顶级文件夹</option>'+folderOptions(folders,f?.parentId||parentId||'',id).replace('<option value="">未归档</option>','');if(f){form.folderId.value=f.id;form.name.value=f.name;form.emoji.value=f.emoji||'📁';form.parentId.value=f.parentId||''}else if(parentId)form.parentId.value=parentId;$('#folderDialogTitle').textContent=f?'编辑文件夹':'新建文件夹';$('#deleteFolderBtn').classList.toggle('hidden',!f);$('#folderDialog').showModal()}

async function openDay(date){
  const [habits,records]=await Promise.all([getAll('habits'),getAll('records')]);$('#dayDialogTitle').textContent=date;let html='';
  for(const h of habits){const s=habitDaySummary(h,records,date);html+=`<div class="day-habit-block"><div class="day-record-top"><div><b>${esc(h.emoji||'✅')} ${esc(h.name)}</b><div class="muted small">${esc(habitSummaryText(h,s))}</div></div><button class="secondary-btn" type="button" data-add-day="${h.id}">＋ 补打卡</button></div>`;for(const r of s.records){html+=`<div class="day-record"><div class="day-record-top"><span class="small">${esc(r.time||'未记时间')} ${h.type==='boolean'?'完成':`${esc(r.value)} ${esc(h.unit||'')}`}</span><button class="text-btn" type="button" data-edit-record="${r.id}" data-habit="${h.id}">编辑</button></div>${r.note?`<div class="muted small">${esc(r.note)}</div>`:''}</div>`}html+='</div>'}
  $('#dayDialogBody').innerHTML=html||'<div class="empty-state">这一天没有任务。</div>';$$('[data-add-day]').forEach(b=>b.onclick=()=>{closeDialog('dayDialog');openRecord(b.dataset.addDay,null,date)});$$('[data-edit-record]').forEach(b=>b.onclick=()=>{closeDialog('dayDialog');openRecord(b.dataset.habit,b.dataset.editRecord,date)});$('#dayDialog').showModal();
}
function closeDialog(id){const d=$('#'+id);if(d?.open)d.close()}

async function saveHabit(e){e.preventDefault();const f=e.currentTarget;const id=f.habitId.value||uid();let goalId=f.goalId.value||null;let krId=f.krId.value||null;if(krId){const kr=await getOne('krs',krId);if(kr)goalId=kr.goalId}const old=f.habitId.value?await getOne('habits',id):null;await put('habits',{...(old||{}),id,name:f.name.value.trim(),emoji:f.emoji.value.trim()||'✅',folderId:f.folderId.value||null,goalId,krId,type:f.type.value,target:f.target.value===''?null:Number(f.target.value),unit:f.unit.value.trim(),scheduleType:f.scheduleType.value,startTime:f.startTime.value,endTime:f.endTime.value,paused:f.paused.checked});closeDialog('habitDialog');render()}
async function saveRecord(e){e.preventDefault();const f=e.currentTarget;const h=await getOne('habits',f.habitId.value);if(!h)return;const id=f.recordId.value||uid();let value=1;if(h.type!=='boolean')value=Number(f.querySelector('[name="value"]')?.value||0);const old=f.recordId.value?await getOne('records',id):null;await put('records',{...(old||{}),id,habitId:h.id,date:f.date.value,time:f.time.value,note:f.note.value.trim(),value,updatedAt:new Date().toISOString()});closeDialog('recordDialog');render()}
async function saveGoal(e){e.preventDefault();const f=e.currentTarget;const id=f.goalId.value||uid();const old=f.goalId.value?await getOne('goals',id):null;await put('goals',{...(old||{}),id,name:f.name.value.trim(),emoji:f.emoji.value.trim()||'🎯',description:f.description.value.trim()});closeDialog('goalDialog');render()}
async function saveKR(e){e.preventDefault();const f=e.currentTarget;const id=f.krId.value||uid();const old=f.krId.value?await getOne('krs',id):null;await put('krs',{...(old||{}),id,goalId:f.goalId.value,name:f.name.value.trim(),startValue:Number(f.startValue.value),targetValue:Number(f.targetValue.value),currentValue:Number(f.currentValue.value),unit:f.unit.value.trim()});if(old&&old.goalId!==f.goalId.value){const habits=await getAll('habits');for(const h of habits.filter(h=>h.krId===id))await put('habits',{...h,goalId:f.goalId.value})}closeDialog('krDialog');render()}
async function saveFolder(e){e.preventDefault();const f=e.currentTarget;const id=f.folderId.value||uid();const old=f.folderId.value?await getOne('folders',id):null;await put('folders',{...(old||{}),id,name:f.name.value.trim(),emoji:f.emoji.value.trim()||'📁',parentId:f.parentId.value||null});closeDialog('folderDialog');render()}

async function deleteHabit(){const id=$('#habitForm').habitId.value;if(!id)return;if(!confirm('删除这个打卡任务？历史记录也会一起删除。'))return;for(const r of (await getAll('records')).filter(r=>r.habitId===id))await del('records',r.id);await del('habits',id);closeDialog('habitDialog');render()}
async function deleteRecord(){const id=$('#recordForm').recordId.value;if(!id)return;if(!confirm('删除这条记录？'))return;await del('records',id);closeDialog('recordDialog');render()}
async function deleteGoal(){const id=$('#goalForm').goalId.value;if(!id)return;if(!confirm('删除这个 Objective？KR 会删除，已绑定的打卡任务会保留但解除目标绑定。'))return;const krs=await getAll('krs');const habits=await getAll('habits');const krIds=new Set(krs.filter(k=>k.goalId===id).map(k=>k.id));for(const k of krs.filter(k=>k.goalId===id))await del('krs',k.id);for(const h of habits.filter(h=>h.goalId===id||krIds.has(h.krId)))await put('habits',{...h,goalId:null,krId:null});await del('goals',id);closeDialog('goalDialog');render()}
async function deleteKR(){const id=$('#krForm').krId.value;if(!id)return;if(!confirm('删除这个 KR？绑定任务会保留，但解除 KR 绑定。'))return;for(const h of (await getAll('habits')).filter(h=>h.krId===id))await put('habits',{...h,krId:null});await del('krs',id);closeDialog('krDialog');render()}
async function deleteFolder(){const id=$('#folderForm').folderId.value;if(!id)return;const folders=await getAll('folders');const children=folders.filter(f=>f.parentId===id);if(children.length){alert('这个文件夹下面还有子文件夹，请先移动或删除子文件夹。');return}if(!confirm('删除这个文件夹？里面的任务会移到“未归档”。'))return;for(const h of (await getAll('habits')).filter(h=>h.folderId===id))await put('habits',{...h,folderId:null});await del('folders',id);closeDialog('folderDialog');render()}

function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
async function exportCSV(){const [records,habits,folders,goals,krs]=await Promise.all([getAll('records'),getAll('habits'),getAll('folders'),getAll('goals'),getAll('krs')]);const rows=[['日期','时间','文件夹','Objective','KR','任务','类型','数值','单位','备注']];for(const r of records.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))){const h=habits.find(x=>x.id===r.habitId);if(!h)continue;rows.push([r.date,r.time||'',folderPath(h.folderId,folders),goals.find(g=>g.id===h.goalId)?.name||'',krs.find(k=>k.id===h.krId)?.name||'',h.name,h.type,r.value,h.unit||'',r.note||''])}const csv='\ufeff'+rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),`Corntrack_${todayISO()}.csv`)}
async function exportExcel(){const [records,habits,folders,goals,krs]=await Promise.all([getAll('records'),getAll('habits'),getAll('folders'),getAll('goals'),getAll('krs')]);let body='<table><tr><th>日期</th><th>时间</th><th>文件夹</th><th>Objective</th><th>KR</th><th>任务</th><th>类型</th><th>数值</th><th>单位</th><th>备注</th></tr>';for(const r of records){const h=habits.find(x=>x.id===r.habitId);if(!h)continue;body+=`<tr><td>${esc(r.date)}</td><td>${esc(r.time||'')}</td><td>${esc(folderPath(h.folderId,folders))}</td><td>${esc(goals.find(g=>g.id===h.goalId)?.name||'')}</td><td>${esc(krs.find(k=>k.id===h.krId)?.name||'')}</td><td>${esc(h.name)}</td><td>${esc(h.type)}</td><td>${esc(r.value)}</td><td>${esc(h.unit||'')}</td><td>${esc(r.note||'')}</td></tr>`}body+='</table>';downloadBlob(new Blob(['\ufeff<html><meta charset="UTF-8"><body>'+body+'</body></html>'],{type:'application/vnd.ms-excel'}),`Corntrack_${todayISO()}.xls`)}
async function exportJSON(){const data=await allData();data.exportedAt=new Date().toISOString();await put('meta',{id:'lastBackup',value:new Date().toLocaleString('zh-CN')});downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`Corntrack_Backup_${todayISO()}.json`);if(state.tab==='data')renderData()}
async function restoreJSON(file){try{const data=JSON.parse(await file.text());if(!STORES.every(s=>Array.isArray(data[s])))throw new Error('备份结构不完整');if(!confirm('恢复备份会覆盖当前全部本地数据。继续吗？'))return;for(const s of STORES){await clearStore(s);for(const item of data[s])await put(s,item)}await migrateV2();alert('恢复完成');render()}catch(err){alert('恢复失败：'+err.message)}}

function wireEvents(){
  $$('.tab').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render()});
  $('#quickAddBtn').onclick=()=>{if(state.tab==='goals')openGoal();else openHabitEdit()};
  $$('[data-close]').forEach(b=>b.onclick=()=>closeDialog(b.dataset.close));
  $('#closeDayDialog').onclick=()=>closeDialog('dayDialog');$('#doneDayDialog').onclick=()=>closeDialog('dayDialog');
  $('#habitForm').addEventListener('submit',saveHabit);$('#recordForm').addEventListener('submit',saveRecord);$('#goalForm').addEventListener('submit',saveGoal);$('#krForm').addEventListener('submit',saveKR);$('#folderForm').addEventListener('submit',saveFolder);
  $('#deleteHabitBtn').onclick=deleteHabit;$('#deleteRecordBtn').onclick=deleteRecord;$('#deleteGoalBtn').onclick=deleteGoal;$('#deleteKrBtn').onclick=deleteKR;$('#deleteFolderBtn').onclick=deleteFolder;
  $('#restoreInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)restoreJSON(f);e.target.value='' });
  $$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}}));
}

(async()=>{
  try{
    await openDB();await seed();await migrateV2();wireEvents();await render();
    if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }catch(err){console.error(err);document.body.innerHTML=`<div style="padding:30px;font-family:-apple-system">启动失败：${esc(err.message)}</div>`}
})();
