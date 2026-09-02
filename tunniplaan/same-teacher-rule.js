// Kõva reegel: sama klassi sama ainet annab kogu nädala jooksul sama õpetaja.
const baseHardRule = hard;
hard = function(l){
  const issues = baseHardRule(l);
  if(l.teacher){
    const teachersForRequirement = [...new Set(lessons.filter(x=>x.reqId===l.reqId && x.teacher).map(x=>x.teacher))];
    if(teachersForRequirement.length > 1) issues.push('sama klassi sama ainet peavad andma sama õpetaja');
  }
  return [...new Set(issues)];
};

function groupTeacherAssignment(){
  const groups = [...new Set(lessons.map(l=>l.reqId))].map(reqId=>({reqId, lessons:lessons.filter(l=>l.reqId===reqId)}));
  const counts = Object.fromEntries(Object.keys(teachers).map(t=>[t,0]));

  // Kõigepealt lukustatud gruppide õpetajad. Kui samas grupis on mitu lukustatud õpetajat,
  // jätame konflikti nähtavaks ega kirjuta lukustatud andmeid üle.
  const fixed = new Map();
  groups.forEach(g=>{
    const lockedTeachers=[...new Set(g.lessons.filter(l=>l.locked&&l.teacher).map(l=>l.teacher))];
    if(lockedTeachers.length===1) fixed.set(g.reqId,lockedTeachers[0]);
    if(lockedTeachers.length>1) fixed.set(g.reqId,null);
  });

  groups.forEach(g=>{
    if(!fixed.has(g.reqId)) return;
    const teacher=fixed.get(g.reqId);
    if(!teacher) return;
    g.lessons.forEach(l=>{ if(!l.locked) l.teacher=teacher; });
    counts[teacher]+=g.lessons.length;
  });

  // Piiratumad grupid enne: valime õpetaja tervele aine–klassi grupile korraga.
  const movableGroups=groups.filter(g=>!fixed.has(g.reqId)).sort((a,b)=>{
    const qa=Object.keys(teachers).filter(t=>canTeach(t,a.lessons[0].subject,a.lessons[0].className)).length;
    const qb=Object.keys(teachers).filter(t=>canTeach(t,b.lessons[0].subject,b.lessons[0].className)).length;
    return qa-qb;
  });

  movableGroups.forEach(g=>{
    const sample=g.lessons[0], need=g.lessons.length;
    const current=[...new Set(g.lessons.filter(l=>l.teacher).map(l=>l.teacher))];
    const candidates=Object.keys(teachers)
      .filter(t=>canTeach(t,sample.subject,sample.className))
      .sort((a,b)=>counts[a]-counts[b]);
    let chosen=null;
    if(current.length===1 && candidates.includes(current[0]) && counts[current[0]]+need<=teachers[current[0]].contactHours) chosen=current[0];
    if(!chosen) chosen=candidates.find(t=>counts[t]+need<=teachers[t].contactHours)||candidates[0]||null;
    g.lessons.forEach(l=>{ if(!l.locked) l.teacher=chosen; });
    if(chosen) counts[chosen]+=need;
  });
}

function optimizeSameTeacher(){
  groupTeacherAssignment();
  const placed=lessons.filter(l=>l.locked&&l.day);
  lessons.filter(l=>!l.locked).forEach(l=>{
    if(!l.teacher){ l.day=l.period=l.room=null; return; }
    let best=null,bestScore=-1e9;
    for(const d of days) for(const p of periods) for(const r of roomList(l.roomType)){
      const test={...l,day:d,period:p,room:r};
      const h=hardCandidate(test,placed);
      const preference=teachers[l.teacher].availability[key(d,p)]==='preferred'?8:0;
      const value=-h*100+preference+Math.random();
      if(value>bestScore){bestScore=value;best=[d,p,r];}
    }
    if(best&&bestScore>-100){[l.day,l.period,l.room]=best;placed.push(l);}
    else l.day=l.period=l.room=null;
  });
  note('Uus variant arvutatud. Sama klassi sama aine õpetaja hoitakse ühtsena.','ok');
  render();
}

optimize = optimizeSameTeacher;
document.getElementById('optimizeBtn').onclick=optimizeSameTeacher;

// Näita reeglit ka kasutajaliideses.
const generalRulesCard=document.querySelector('.sidebar .card');
if(generalRulesCard){
  const rule=document.createElement('div');
  rule.className='mini';
  rule.style.marginTop='8px';
  rule.innerHTML='<b>Kõva reegel:</b> sama klassi sama ainet annab kogu nädala jooksul sama õpetaja.';
  generalRulesCard.appendChild(rule);
}
render();