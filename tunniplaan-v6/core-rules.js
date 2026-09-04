function lessonHardIssues(l,cid=activeCycle,all=schedule(cid)){
  const issues=[],g=group(l.groupId),t=teacher(l.teacherId),r=room(l.roomId),rq=requirement(l.reqId);
  if(!g)return['rühm puudub'];if(g.students>g.maxStudents)issues.push('rühma suuruse piir ületatud');
  if(!t)issues.push('õpetaja määramata');else if(!canTeach(t,g,l.subjectId))issues.push('õpetajal puudub pädevus');
  if(!l.day||!l.period)issues.push('aeg määramata');if(l.period&&Math.max(...occupied(l))>maxPeriod())issues.push('plokk ei mahu päeva');
  if(!r)issues.push('ruum määramata');else{if(r.type!==g.roomType)issues.push('vale ruumitüüp');if(r.capacity<g.students)issues.push('ruum liiga väike');occupied(l).forEach(p=>{if(r.blocked[roomBlockKey(cid,l.day,p)])issues.push('ruum blokeeritud')})}
  if(l.day&&rule('timeBlocked').hard)occupied(l).forEach(p=>{if(isBlockedByTime(l,cid,l.day,p))issues.push('keelatud aeg')});
  if(l.day){all.filter(x=>x.id!==l.id&&overlapTime(l,x)&&lessonsOverlapWeeks(l,x,cid)).forEach(x=>{const gx=group(x.groupId);if(l.teacherId&&x.teacherId===l.teacherId)issues.push('õpetaja topeltbroneering');if(l.roomId&&x.roomId===l.roomId)issues.push('ruumi topeltbroneering');if(overlapsClasses(g,gx)&&!sameSync(g,gx))issues.push('õpilasgruppide kattuvus')});}
  if(t){const spec=teacherLoadSpec(t,cid),assignedAll=all.filter(x=>x.teacherId===t.id).reduce((a,x)=>a+(x.duration||1),0);if(assignedAll>Number(spec.max))issues.push('õpetaja koormus üle maksimumi');if(l.day&&rule('teacherDailyMax').hard){for(const w of lessonWeeks(l,cid)){const n=all.filter(x=>x.teacherId===t.id&&x.day===l.day&&lessonWeeks(x,cid).includes(w)).reduce((a,x)=>a+(x.duration||1),0);if(n>Number(spec.dailyMax||4)){issues.push('õpetaja päevane maksimum ületatud');break}}}}
  if(rule('sameTeacher').hard&&rq){const ts=new Set(all.filter(x=>x.reqId===rq.id&&x.teacherId).map(x=>x.teacherId));if(ts.size>1)issues.push('sama rühma sama ainet annavad eri õpetajad')}
  if(rule('buildingTravel').hard&&l.day){all.filter(x=>x.id!==l.id&&x.day===l.day&&lessonsOverlapWeeks(l,x,cid)).forEach(x=>{const gx=group(x.groupId),samePerson=x.teacherId&&x.teacherId===l.teacherId,sameClass=overlapsClasses(g,gx)&&!sameSync(g,gx);if((samePerson||sameClass)&&adjacentTravelIssue(l,x,cid))issues.push('liikumisaega hoonete vahel pole piisavalt')})}
  return [...new Set(issues)];
}
function classWeekDaySet(classId,cid,day,week,arr=schedule(cid)){const set=new Set();arr.forEach(l=>{const g=group(l.groupId);if(g?.classIds.includes(classId)&&l.day===day&&lessonWeeks(l,cid).includes(week))occupied(l).forEach(p=>set.add(p))});return set}
function gapCount(set){const a=[...set].sort((x,y)=>x-y);if(a.length<2)return 0;return a[a.length-1]-a[0]+1-a.length}
function classIssues(c,cid,arr=schedule(cid)){const out=[];const weeks=Array.from({length:Number(cycle(cid)?.weeks)||1},(_,i)=>i+1);for(const w of weeks)for(const d of DAYS){const set=classWeekDaySet(c.id,cid,d,w,arr),n=set.size;if(rule('classDailyMax').hard&&n>c.dailyMax)out.push(`${c.name}, ${d}, n${w}: päevane maksimum`);if(rule('classNoGaps').hard&&gapCount(set)>0)out.push(`${c.name}, ${d}, n${w}: auk tunniplaanis`)}return out}
function syncIssues(cid,arr=schedule(cid)){const out=[];const by={};state.groups.filter(g=>g.syncKey).forEach(g=>(by[g.syncKey]??=[]).push(g));for(const [key,gs] of Object.entries(by)){const reqs=gs.map(g=>state.requirements.find(r=>r.groupId===g.id)).filter(Boolean),max=Math.max(0,...reqs.map(r=>blockSpecs(r,cid).length));for(let i=0;i<max;i++){const ls=reqs.map(r=>arr.find(l=>l.reqId===r.id&&l.blockIndex===i)).filter(Boolean);if(ls.length>1&&new Set(ls.map(l=>`${l.day}|${l.period}`)).size>1)out.push(`${key}: ${i+1}. paralleelplokk pole samal ajal`)}}return out}
function orderingIssues(cid,arr=schedule(cid)){const out=[];state.requirements.filter(r=>r.afterRequirementId).forEach(r=>{const prev=state.requirements.find(x=>x.id===r.afterRequirementId);if(!prev)return;const a=arr.find(l=>l.reqId===prev.id),b=arr.find(l=>l.reqId===r.id);if(a&&b){const di=DAYS.indexOf(a.day)-DAYS.indexOf(b.day);if(di>0||(di===0&&a.period>=b.period)){const txt=`${group(r.groupId)?.name}: peaks toimuma pärast ${group(prev.groupId)?.name}`;if(rule('ordering').hard)out.push(txt)}}});return out}
function allIssues(cid=activeCycle,arr=schedule(cid)){const hard=[];arr.forEach(l=>lessonHardIssues(l,cid,arr).forEach(x=>hard.push(`${group(l.groupId)?.name||'?'}: ${x}`)));hard.push(...state.classes.flatMap(c=>classIssues(c,cid,arr)),...syncIssues(cid,arr),...orderingIssues(cid,arr));return [...new Set(hard)]}

function classDailyPenalty(c,cid,arr){let p=0;const weeks=Array.from({length:Number(cycle(cid)?.weeks)||1},(_,i)=>i+1);for(const w of weeks)for(const d of DAYS){const set=classWeekDaySet(c.id,cid,d,w,arr);p+=gapCount(set)*rule('classNoGaps').weight;const n=set.size;if(n>c.dailyTarget)p+=(n-c.dailyTarget)*rule('classDailyBalance').weight*.5}return p}
function teacherGapPenalty(t,cid,arr){let p=0;const weeks=Array.from({length:Number(cycle(cid)?.weeks)||1},(_,i)=>i+1);for(const w of weeks)for(const d of DAYS){const set=new Set();arr.filter(l=>l.teacherId===t.id&&l.day===d&&lessonWeeks(l,cid).includes(w)).forEach(l=>occupied(l).forEach(x=>set.add(x)));p+=gapCount(set)*rule('teacherGaps').weight}return p}
function scoreSchedule(cid,arr=schedule(cid)){
  const hard=allIssues(cid,arr).length;
  let penalty=hard*10000;
  arr.forEach(l=>{
    const rq=requirement(l.reqId),sub=subject(l.subjectId);
    if(!l.day)return;
    occupied(l).forEach(p=>{
      const prefs=preferredCount(l,cid,l.day,p);
      penalty-=prefs*rule('teacherPreferred').weight;
    });
    if(sub?.core)penalty+=(l.period-1)*rule('coreEarly').weight*.35;
    const sameDay=arr.filter(x=>x.id!==l.id&&x.reqId===l.reqId&&x.day===l.day).length;
    penalty+=sameDay*rule('spreadSubject').weight;
    const prev=previousCycle(cid);
    if(prev){
      const old=(state.schedules[prev.id]||[]).find(x=>x.reqId===l.reqId&&x.blockIndex===l.blockIndex);
      if(old&&(old.day!==l.day||old.period!==l.period))penalty+=rule('previousCycle').weight;
    }
    if(rq?.preferredRoomIds?.length&&!rq.preferredRoomIds.includes(l.roomId))penalty+=rule('roomPreference').weight;
  });
  state.classes.forEach(c=>penalty+=classDailyPenalty(c,cid,arr));
  state.teachers.forEach(t=>penalty+=teacherGapPenalty(t,cid,arr));
  return {hard,penalty,score:Math.max(0,Math.round(1000-penalty))};
}
function previousCycle(cid){const i=state.cycles.findIndex(c=>c.id===cid);return i>0?state.cycles[i-1]:null}

