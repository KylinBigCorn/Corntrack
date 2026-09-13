async function renderGoals(){
  const[goals,krs,habits,records]=await Promise.all([getAll('goals'),getAll('krs'),getAll('habits'),getAll('records')]);
  let html='<div class="row-actions"><button class="secondary-btn" type="button" id="addGoal">＋ Objective</button><button class="secondary-btn" type="button" id="addKr">＋ Key Result</button></div>';
  for(const g of goals){
    const ks=krs.filter(k=>k.goalId===g.id);const gs=goalStats(g,krs,habits,records);
    html+=`<section class="card goal-card"><div class="goal-top"><div><h3>${esc(g.emoji||'🎯')} ${esc(g.name)}</h3><p class="muted small">${esc(g.description||'')}</p></div><button class="mini-icon" type="button" data-edit-goal="${g.id}">•••</button></div><div class="objective-score"><span>Objective 完成度</span><strong>${Math.round(gs.total*100)}%</strong></div><div class="progress"><i style="width:${gs.total*100}%"></i></div><div class="row-actions compact-row"><button class="link-add" type="button" data-goal-weights="${g.id}">⚖️ KR 权重</button><button class="link-add" type="button" data-add-kr-for="${g.id}">＋ 新建 KR</button></div>`;
    for(let i=0;i<ks.length;i++){
      const k=ks[i],st=krStats(k,habits,records),links=(k.habitLinks||[]).filter(l=>habits.some(h=>h.id===l.habitId)),lw=normalizedPercent(links),ow=gs.weights[i]??0;
      html+=`<div class="kr"><div class="kr-line"><div><div class="kr-name">${esc(k.name)}</div><div class="muted small">${periodLabel(k.period)} · ${metricTypeLabel(k.metricType)} · KR权重 ${Math.round(ow)}%</div></div><div class="kr-actions"><strong>${Math.round(st.total*100)}%</strong><button class="mini-icon" type="button" data-edit-kr="${k.id}">•••</button></div></div><div class="metric-grid"><div><span>指标</span><b>${Number(st.current.toFixed?st.current.toFixed(1):st.current)} / ${esc(k.targetValue)} ${esc(k.unit||'')}</b><small>${Math.round(st.metricProgress*100)}%</small></div><div><span>行动</span><b>${links.length} 个任务</b><small>${Math.round(st.actionProgress*100)}%</small></div></div><div class="progress"><i style="width:${st.total*100}%"></i></div><div class="kr-linked"><div class="kr-linked-label">关联任务与执行权重</div>`;
      if(links.length){html+='<div class="link-list">';links.forEach((l,idx)=>{const h=habits.find(x=>x.id===l.habitId);const direct=compatibleWithKR(k,h);html+=`<div class="link-row"><span>${esc(h.emoji||'✅')} ${esc(h.name)}</span><span><em class="${direct?'direct-tag':'aux-tag'}">${direct?'计入指标':'仅行动'}</em> ${Math.round(lw[idx])}%</span></div>`});html+='</div>'}else html+='<div class="muted small">尚未关联打卡任务</div>';
      html+=`<button class="link-add" type="button" data-kr-links="${k.id}">管理任务与权重</button></div></div>`;
    }
    html+='</section>';
  }
  if(!goals.length)html+='<div class="empty-state">还没有 Objective。</div>';
  $('#view').innerHTML=html;$('#addGoal').onclick=()=>openGoal();$('#addKr').onclick=()=>openKR();$$('[data-edit-goal]').forEach(b=>b.onclick=()=>openGoal(b.dataset.editGoal));$$('[data-edit-kr]').forEach(b=>b.onclick=()=>openKR(b.dataset.editKr));$$('[data-add-kr-for]').forEach(b=>b.onclick=()=>openKR(null,b.dataset.addKrFor));$$('[data-goal-weights]').forEach(b=>b.onclick=()=>openGoalWeights(b.dataset.goalWeights));$$('[data-kr-links]').forEach(b=>b.onclick=()=>openKrLinks(b.dataset.krLinks));
}
