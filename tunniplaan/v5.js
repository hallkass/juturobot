const DAYS=['Esmaspäev','Teisipäev','Kolmapäev','Neljapäev','Reede'];
const SUBJECTS=['Matemaatika','Eesti keel','Ajalugu','Füüsika','Informaatika','Inglise keel','Kehaline kasvatus','Käsitöö/tehnoloogia'];
const STORAGE='tunniplaan-v5-state';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const uid=p=>p+'-'+Math.random().toString(36).slice(2,9);
const slotKey=(d,p)=>d+'|'+p;
const blockKey=(cycle,d,p)=>cycle+'|'+d+'|'+p;

function makeDefaults(){
  const cycles=[1,2,3,4,5].map((n,i)=>({id:'c'+n,name:'Tsükkel '+n,weeks:7,semester:n<=2?'semester1':'semester2',start:'',end:''}));
  const classes=['7A','7B','8A','8B','8C'].map((name,i)=>({id:'cl'+(i+1),name,students:name.startsWith('7')?25:24,dailyMin:2,dailyMax:4}));
  const groups=[];
  const addGroup=(name,subject,classNames,students,parallel='',roomType='tavaklass',consecutive=1)=>{
    const classIds=classNames.map(n=>classes.find(c=>c.name===n).id);
    groups.push({id:uid('g'),name,subject,classIds,students,maxStudents:30,parallel,roomType,consecutive,sameRoom:true});
  };
  ['7A','7B'].forEach(c=>{
    addGroup(c+' MAT','Matemaatika',[c],25);addGroup(c+' EST','Eesti keel',[c],25);addGroup(c+' AJ','Ajalugu',[c],25);addGroup(c+' FÜ','Füüsika',[c],25,'','labor');addGroup(c+' IT','Informaatika',[c],25,'','arvutiklass');
  });
  ['8A','8B','8C'].forEach(c=>{
    addGroup(c+' EST','Eesti keel',[c],24);addGroup(c+' AJ','Ajalugu',[c],24);addGroup(c+' FÜ','Füüsika',[c],24,'','labor');addGroup(c+' IT','Informaatika',[c],24,'','arvutiklass');
  });
  addGroup('MAT8-1','Matemaatika',['8A','8B','8C'],24,'MAT8');
  addGroup('MAT8-2','Matemaatika',['8A','8B','8C'],24,'MAT8');
  addGroup('MAT8-3','Matemaatika',['8A','8B','8C'],24,'MAT8');
  addGroup('7A TEH','Käsitöö/tehnoloogia',['7A'],14,'','töökoda',2);

  const defaultWeekly={'Matemaatika':3,'Eesti keel':3,'Ajalugu':2,'Füüsika':2,'Informaatika':1,'Käsitöö/tehnoloogia':2};
  const requirements=groups.map(g=>{
    const weekly=defaultWeekly[g.subject]||2, cycleHours={};cycles.forEach(c=>cycleHours[c.id]=weekly);
    return {id:uid('req'),groupId:g.id,subject:g.subject,annualHours:cycles.reduce((a,c)=>a+weekly*c.weeks,0),cycleHours};
  });

  const rooms=[
    ['r204','204','tavaklass',30],['r205','205','tavaklass',30],['r206','206','tavaklass',30],['r207','207','tavaklass',30],['r208','208','tavaklass',26],
    ['rlab','Füüsikalabor','labor',26],['rit','Arvutiklass','arvutiklass',26],['rwork','Töökoda','töökoda',18],['rgym','Spordisaal','spordisaal',60]
  ].map(([id,name,type,capacity])=>({id,name,type,capacity,blocked:{}}));

  const teachers=[
    {id:'t-mari',name:'Mari',subjects:['Matemaatika'],defaultTarget:14},
    {id:'t-peeter',name:'Peeter',subjects:['Matemaatika'],defaultTarget:14},
    {id:'t-liis',name:'Liis',subjects:['Matemaatika'],defaultTarget:14},
    {id:'t-katrin',name:'Katrin',subjects:['Eesti keel'],defaultTarget:16},
    {id:'t-juri',name:'Jüri',subjects:['Ajalugu'],defaultTarget:12},
    {id:'t-andres',name:'Andres',subjects:['Füüsika','Informaatika','Käsitöö/tehnoloogia'],defaultTarget:16}
  ].map(t=>({id:t.id,name:t.name,defaultTarget:t.defaultTarget,loads:{},skills:groups.filter(g=>t.subjects.includes(g.subject)).map(g=>({subject:g.subject,groupId:g.id})),availability:{year:{},semester1:{},semester2:{},cycles:{}}}));
  const mari=teachers.find(t=>t.id==='t-mari');
  DAYS.forEach(d=>[1,2,3,4].forEach(p=>{if(!['Esmaspäev','Reede'].includes(d))mari.availability.semester1[slotKey(d,p)]='blocked'}));
  mari.availability.semester1[slotKey('Teisipäev',3)]='preferred';mari.availability.semester1[slotKey('Teisipäev',4)]='preferred';delete mari.availability.semester1[slotKey('Teisipäev',3)];delete mari.availability.semester1[slotKey('Teisipäev',4)];
  mari.availability.semester2={};

  return {settings:{periods:4},year:{name:'2026/27',start:'2026-09-01',end:'2027-06-15'},cycles,classes,groups,requirements,teachers,rooms,schedules:{}};
}

let state=loadState();
let activePage='dashboard';
let activeCycle=state.cycles[0]?.id||'';
let selectedTeacher=state.teachers[0]?.id||'';
let selectedRoom=state.rooms[0]?.id||'';
let teacherDraftAvailability={};

function loadState(){try{const x=JSON.parse(localStorage.getItem(STORAGE));if(x&&x.cycles&&x.groups)return x}catch(e){}return makeDefaults()}
function saveState(){localStorage.setItem(STORAGE,JSON.stringify(state))}
function toast(msg){const e=$('#toast');e.textContent=msg;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),1800)}
function currentCycle(){return state.cycles.find(c=>c.id===activeCycle)||state.cycles[0]}
function cycleById(id){return state.cycles.find(c=>c.id===id)}
function groupById(id){return state.groups.find(g=>g.id===id)}
function classById(id){return state.classes.find(c=>c.id===id)}
function teacherById(id){return state.teachers.find(t=>t.id===id)}
function roomById(id){return state.rooms.find(r=>r.id===id)}
function reqById(id){return state.requirements.find(r=>r.id===id)}
function schedule(cycleId=activeCycle){state.schedules[cycleId]??=[];return state.schedules[cycleId]}
function periods(){return Array.from({length:state.settings.periods||4},(_,i)=>i+1)}
function plannedAnnual(r){return state.cycles.reduce((sum,c)=>sum+(Number(r.cycleHours?.[c.id])||0)*(Number(c.weeks)||0),0)}
function reqWeekly(r,cycleId){return Number(r.cycleHours?.[cycleId])||0}
function groupClasses(g){return g.classIds.map(classById).filter(Boolean)}
function groupClassNames(g){return groupClasses(g).map(c=>c.name).join(', ')}
function overlapsClasses(g1,g2){return g1.classIds.some(id=>g2.classIds.includes(id))}
function sameParallel(g1,g2){return !!g1.parallel&&g1.parallel===g2.parallel}

function teacherLoadSpec(t,cycleId){const d=Number(t.defaultTarget)||0;return t.loads?.[cycleId]||{min:Math.max(0,d-2),target:d,max:d+2}}
function teacherAssigned(tid,cycleId=activeCycle){return schedule(cycleId).filter(l=>l.teacherId===tid).reduce((a,l)=>a+(l.duration||1),0)}
function canTeach(t,g,subject){return !!t&&t.skills.some(s=>s.subject===subject&&(s.groupId===g.id||s.groupId==='*'))}
function availabilityMap(t,scope,cycleId){
  if(scope==='year')return t.availability.year;
  if(scope==='semester1'||scope==='semester2')return t.availability[scope];
  t.availability.cycles[cycleId]??={};return t.availability.cycles[cycleId];
}
function effectiveAvailability(t,cycleId,d,p){
  const k=slotKey(d,p),c=cycleById(cycleId),cm=t.availability.cycles?.[cycleId]||{};
  if(cm[k]!==undefined)return cm[k];
  const sm=t.availability[c?.semester]||{};if(sm[k]!==undefined)return sm[k];
  if(t.availability.year[k]!==undefined)return t.availability.year[k];
  return 'free';
}

function occupiedPeriods(l){return Array.from({length:l.duration||1},(_,i)=>(l.period||0)+i)}
function lessonTouches(l,d,p){return l.day===d&&occupiedPeriods(l).includes(p)}
function lessonHardIssues(l,cycleId=activeCycle,all=schedule(cycleId)){
  const issues=[],g=groupById(l.groupId),t=teacherById(l.teacherId),r=roomById(l.roomId);
  if(!g)return ['rühm puudub'];
  if(g.students>g.maxStudents)issues.push('rühma suuruse piir ületatud');
  if(!t)issues.push('õpetaja määramata');else if(!canTeach(t,g,l.subject))issues.push('õpetajal puudub selle rühma pädevus');
  if(!l.day||!l.period)issues.push('aeg määramata');
  if(l.period&&(l.period+(l.duration||1)-1)>state.settings.periods)issues.push('mitmeperioodiline tund ei mahu päeva');
  if(t&&l.day)occupiedPeriods(l).forEach(p=>{if(effectiveAvailability(t,cycleId,l.day,p)==='blocked')issues.push('õpetaja keelatud aeg')});
  if(!r)issues.push('ruum määramata');else{
    if(r.type!==g.roomType)issues.push('vale ruumitüüp');
    if(r.capacity<g.students)issues.push('ruum liiga väike');
    if(l.day)occupiedPeriods(l).forEach(p=>{if(r.blocked[blockKey(cycleId,l.day,p)])issues.push('ruum blokeeritud')});
  }
  if(l.day){
    all.filter(x=>x.id!==l.id&&x.day===l.day).forEach(x=>{
      if(!occupiedPeriods(l).some(p=>occupiedPeriods(x).includes(p)))return;
      const gx=groupById(x.groupId);
      if(l.teacherId&&x.teacherId===l.teacherId)issues.push('õpetaja topeltbroneering');
      if(l.roomId&&x.roomId===l.roomId)issues.push('ruumi topeltbroneering');
      if(gx&&overlapsClasses(g,gx)&&!sameParallel(g,gx))issues.push('õpilasgruppide kattuvus');
    });
  }
  if(t){const spec=teacherLoadSpec(t,cycleId);if(teacherAssigned(t.id,cycleId)>Number(spec.max))issues.push('õpetaja maksimaalne koormus ületatud')}
  const req=reqById(l.reqId);if(req){const same=all.filter(x=>x.reqId===req.id&&x.teacherId).map(x=>x.teacherId);if(new Set(same).size>1)issues.push('sama rühma sama ainet annavad eri õpetajad')}
  return [...new Set(issues)];
}
function lessonSoftIssues(l,cycleId=activeCycle){
  const issues=[],t=teacherById(l.teacherId);if(!t||!l.day)return issues;
  const vals=occupiedPeriods(l).map(p=>effectiveAvailability(t,cycleId,l.day,p));if(!vals.includes('preferred'))issues.push('õpetaja eelistatud aega ei kasutata');
  const prev=previousCycle(cycleId);if(prev){const old=(state.schedules[prev.id]||[]).find(x=>x.reqId===l.reqId&&x.blockIndex===l.blockIndex);if(old&&(old.day!==l.day||old.period!==l.period))issues.push('erineb eelmise tsükli ajast')}
  return issues;
}
function previousCycle(cycleId){const i=state.cycles.findIndex(c=>c.id===cycleId);return i>0?state.cycles[i-1]:null}

function classOccupiedSet(classId,cycleId,day){
  const set=new Set();schedule(cycleId).forEach(l=>{const g=groupById(l.groupId);if(g?.classIds.includes(classId)&&l.day===day)occupiedPeriods(l).forEach(p=>set.add(p))});return set
}
function classDayIssues(c,cycleId,day){
  const set=classOccupiedSet(c.id,cycleId,day),ps=[...set].sort((a,b)=>a-b),issues=[];
  if(ps.length>c.dailyMax)issues.push('liiga palju tunde');
  if(ps.length&&ps.length<c.dailyMin)issues.push('liiga vähe tunde');
  if(ps.length){for(let p=ps[0];p<=ps[ps.length-1];p++)if(!set.has(p))issues.push('auk tunniplaanis')}
  return [...new Set(issues)];
}
function parallelIssues(cycleId){
  const out=[];const groups={};state.groups.filter(g=>g.parallel).forEach(g=>(groups[g.parallel]??=[]).push(g));
  Object.entries(groups).forEach(([name,gs])=>{
    const reqs=gs.map(g=>state.requirements.find(r=>r.groupId===g.id)).filter(Boolean);const maxBlocks=Math.max(0,...reqs.map(r=>blockSpecs(r,cycleId).length));
    for(let bi=0;bi<maxBlocks;bi++){
      const ls=reqs.map(r=>schedule(cycleId).find(l=>l.reqId===r.id&&l.blockIndex===bi)).filter(Boolean);
      if(ls.length!==reqs.filter(r=>blockSpecs(r,cycleId)[bi]).length)continue;
      const pos=new Set(ls.map(l=>l.day+'|'+l.period));if(pos.size>1)out.push(`${name}: paralleelrühmade ${bi+1}. plokk ei toimu samal ajal`);
    }
  });return out;
}
function allIssues(cycleId=activeCycle){
  const hard=[];schedule(cycleId).forEach(l=>lessonHardIssues(l,cycleId).forEach(x=>hard.push(`${groupById(l.groupId)?.name||'?'}: ${x}`)));
  state.classes.forEach(c=>DAYS.forEach(d=>classDayIssues(c,cycleId,d).forEach(x=>hard.push(`${c.name}, ${d}: ${x}`))));hard.push(...parallelIssues(cycleId));
  const soft=[];schedule(cycleId).forEach(l=>lessonSoftIssues(l,cycleId).forEach(x=>soft.push(`${groupById(l.groupId)?.name||'?'}: ${x}`)));
  return {hard:[...new Set(hard)],soft:[...new Set(soft)]};
}

function blockSpecs(req,cycleId){
  const g=groupById(req.groupId),hours=reqWeekly(req,cycleId),d=Math.max(1,Number(g?.consecutive)||1),a=[];let left=hours,i=0;
  while(left>0){const duration=Math.min(d,left);a.push({reqId:req.id,groupId:req.groupId,subject:req.subject,blockIndex:i++,duration});left-=duration}return a;
}
function demandUnits(cycleId){
  const blocks=state.requirements.flatMap(r=>blockSpecs(r,cycleId)),units=[],used=new Set();
  blocks.forEach(b=>{const k=b.reqId+'|'+b.blockIndex;if(used.has(k))return;const g=groupById(b.groupId);if(g?.parallel){const same=blocks.filter(x=>x.blockIndex===b.blockIndex&&groupById(x.groupId)?.parallel===g.parallel);same.forEach(x=>used.add(x.reqId+'|'+x.blockIndex));units.push({id:g.parallel+'|'+b.blockIndex,parallel:g.parallel,blocks:same})}else{used.add(k);units.push({id:k,parallel:'',blocks:[b]})}});return units;
}
function assignTeachers(cycleId,units,existing){
  const counts=Object.fromEntries(state.teachers.map(t=>[t.id,0]));existing.filter(l=>l.locked&&l.teacherId).forEach(l=>counts[l.teacherId]+=(l.duration||1));
  const reqTeacher={};existing.filter(l=>l.teacherId).forEach(l=>{if(reqTeacher[l.reqId]===undefined)reqTeacher[l.reqId]=l.teacherId});
  const parallelUsed={};
  units.forEach(u=>u.blocks.forEach(b=>{
    if(reqTeacher[b.reqId]){if(u.parallel)(parallelUsed[u.parallel]??=new Set()).add(reqTeacher[b.reqId]);return}
    const g=groupById(b.groupId),avoid=u.parallel?(parallelUsed[u.parallel]??=new Set()):new Set();
    const candidates=state.teachers.filter(t=>canTeach(t,g,b.subject)&&!avoid.has(t.id)&&counts[t.id]+b.duration<=teacherLoadSpec(t,cycleId).max)
      .sort((a,b2)=>{const sa=teacherLoadSpec(a,cycleId),sb=teacherLoadSpec(b2,cycleId);return (counts[a.id]/Math.max(1,sa.target))-(counts[b2.id]/Math.max(1,sb.target))});
    const t=candidates[0];if(t){reqTeacher[b.reqId]=t.id;counts[t.id]+=b.duration;if(u.parallel)avoid.add(t.id)}
  }));return reqTeacher;
}
function candidateRooms(block,cycleId,day,period,placed,reservedRooms=new Set()){
  const g=groupById(block.groupId);return state.rooms.filter(r=>r.type===g.roomType&&r.capacity>=g.students&&!reservedRooms.has(r.id)).filter(r=>{
    for(let p=period;p<period+block.duration;p++)if(r.blocked[blockKey(cycleId,day,p)])return false;
    return !placed.some(l=>l.roomId===r.id&&l.day===day&&occupiedPeriods(l).some(p=>p>=period&&p<period+block.duration));
  });
}
function placementHardCount(temp,placed,cycleId){
  const all=[...placed,temp],g=groupById(temp.groupId),t=teacherById(temp.teacherId),r=roomById(temp.roomId);let n=0;
  if(!t||!canTeach(t,g,temp.subject))n+=20;if(!r||r.type!==g.roomType||r.capacity<g.students)n+=20;
  occupiedPeriods(temp).forEach(p=>{if(t&&effectiveAvailability(t,cycleId,temp.day,p)==='blocked')n+=10;if(r?.blocked[blockKey(cycleId,temp.day,p)])n+=10});
  placed.filter(x=>x.day===temp.day&&occupiedPeriods(x).some(p=>occupiedPeriods(temp).includes(p))).forEach(x=>{const gx=groupById(x.groupId);if(x.teacherId===temp.teacherId)n+=20;if(x.roomId===temp.roomId)n+=20;if(gx&&overlapsClasses(g,gx)&&!sameParallel(g,gx))n+=20});
  groupClasses(g).forEach(c=>{const set=classOccupiedSetWith(c.id,cycleId,temp.day,all);if(set.size>c.dailyMax)n+=20});return n;
}
function classOccupiedSetWith(classId,cycleId,day,arr){const set=new Set();arr.forEach(l=>{const g=groupById(l.groupId);if(g?.classIds.includes(classId)&&l.day===day)occupiedPeriods(l).forEach(p=>set.add(p))});return set}
function placementScore(temp,placed,cycleId){
  let score=-placementHardCount(temp,placed,cycleId)*100;const t=teacherById(temp.teacherId),g=groupById(temp.groupId);
  occupiedPeriods(temp).forEach(p=>{if(effectiveAvailability(t,cycleId,temp.day,p)==='preferred')score+=12});
  groupClasses(g).forEach(c=>{const before=classOccupiedSetWith(c.id,cycleId,temp.day,placed),after=classOccupiedSetWith(c.id,cycleId,temp.day,[...placed,temp]);if(after.size&&spread(after)===0)score+=6;if(after.size>before.size)score+=2});
  const prev=previousCycle(cycleId);if(prev){const old=(state.schedules[prev.id]||[]).find(x=>x.reqId===temp.reqId&&x.blockIndex===temp.blockIndex);if(old&&old.day===temp.day&&old.period===temp.period)score+=14}
  return score+Math.random();
}
function spread(set){const a=[...set].sort((x,y)=>x-y);if(a.length<2)return 0;return a[a.length-1]-a[0]+1-a.length}
function optimizeCycle(cycleId){
  const existing=structuredClone(schedule(cycleId)),units=demandUnits(cycleId),reqTeacher=assignTeachers(cycleId,units,existing),locked=existing.filter(l=>l.locked),placed=[...locked],next=[...locked];
  units.sort((a,b)=>b.blocks.length-a.blocks.length||Math.max(...b.blocks.map(x=>x.duration))-Math.max(...a.blocks.map(x=>x.duration)));
  units.forEach(u=>{
    const lockedBlocks=u.blocks.map(b=>locked.find(l=>l.reqId===b.reqId&&l.blockIndex===b.blockIndex)).filter(Boolean);
    if(lockedBlocks.length){u.blocks.forEach(b=>{if(!lockedBlocks.some(l=>l.reqId===b.reqId&&l.blockIndex===b.blockIndex)){const old=existing.find(l=>l.reqId===b.reqId&&l.blockIndex===b.blockIndex);if(old){old.locked=false;next.push(old);placed.push(old)}}});return}
    let best=null,bestScore=-Infinity;
    for(const day of DAYS)for(const period of periods()){
      if(u.blocks.some(b=>period+b.duration-1>state.settings.periods))continue;
      const temps=[],reserved=new Set();let invalid=false,total=0;
      for(const b of u.blocks){const tid=reqTeacher[b.reqId];if(!tid){invalid=true;break}const rooms=candidateRooms(b,cycleId,day,period,[...placed,...temps],reserved);if(!rooms.length){invalid=true;break}let chosen=null,cs=-Infinity;for(const r of rooms){const temp={id:uid('l'),cycleId,reqId:b.reqId,groupId:b.groupId,subject:b.subject,teacherId:tid,roomId:r.id,day,period,duration:b.duration,blockIndex:b.blockIndex,locked:false};const s=placementScore(temp,[...placed,...temps],cycleId);if(s>cs){cs=s;chosen=temp}}if(!chosen){invalid=true;break}reserved.add(chosen.roomId);temps.push(chosen);total+=cs}
      if(!invalid&&total>bestScore){bestScore=total;best=temps}
    }
    if(best&&bestScore>-100){best.forEach(l=>{next.push(l);placed.push(l)})}
  });
  state.schedules[cycleId]=next;saveState();renderAll();toast('Tunniplaani variant koostatud');
}

function coverage(req,cycleId){const need=blockSpecs(req,cycleId).reduce((a,b)=>a+b.duration,0),got=schedule(cycleId).filter(l=>l.reqId===req.id&&l.day&&l.teacherId&&l.roomId).reduce((a,l)=>a+(l.duration||1),0);return {need,got}}
function moveLessonTime(l,day,period,cycleId){
  const g=groupById(l.groupId),targets=g?.parallel?schedule(cycleId).filter(x=>groupById(x.groupId)?.parallel===g.parallel&&x.blockIndex===l.blockIndex):[l];
  if(targets.some(x=>x.locked)){toast('Paralleelpaketis on lukustatud tund');return}if(targets.some(x=>period+x.duration-1>state.settings.periods)){toast('Plokk ei mahu päeva');return}
  targets.forEach(x=>{x.day=day;x.period=period});saveState();renderAll();
}
function moveLessonRoom(l,roomId,cycleId){if(l.locked)return toast('Tund on lukus');const r=roomById(roomId),g=groupById(l.groupId);if(!r||r.type!==g.roomType||r.capacity<g.students)return toast('Ruum ei sobi rühmale');l.roomId=roomId;saveState();renderAll()}
function toggleLessonLock(l,cycleId){const g=groupById(l.groupId),targets=g?.parallel?schedule(cycleId).filter(x=>groupById(x.groupId)?.parallel===g.parallel&&x.blockIndex===l.blockIndex):[l],v=!targets.every(x=>x.locked);targets.forEach(x=>x.locked=v);saveState();renderAll()}
function replaceTeacher(l,cycleId){const g=groupById(l.groupId),c=state.teachers.filter(t=>canTeach(t,g,l.subject));if(!c.length)return;const names=c.map((t,i)=>`${i+1}: ${t.name}`).join('\n'),ans=prompt(`Vali asendusõpetaja. Tunni aeg ja ruum ei muutu.\n${names}`,String(c.findIndex(t=>t.id===l.teacherId)+1));const t=c[Number(ans)-1];if(t){l.teacherId=t.id;saveState();renderAll();toast('Õpetaja vahetatud; kontrolli konflikte')}}

function lessonCard(l,cycleId,part=false){const d=document.createElement('div'),hard=lessonHardIssues(l,cycleId),soft=lessonSoftIssues(l,cycleId);d.className='lesson'+(l.locked?' locked':'')+(hard.length?' hard':(!hard.length&&soft.length?' soft':'')+(part?' part':'');d.draggable=!l.locked;d.dataset.lesson=l.id;d.innerHTML=`<strong>${l.subject} · ${groupById(l.groupId)?.name||'?'}</strong><span>${teacherById(l.teacherId)?.name||'õpetaja?'} · ${roomById(l.roomId)?.name||'ruum?'}</span>${l.locked?'<span class="lock">🔒</span>':''}`;d.title=[...hard,...soft,'Topeltklõps: vaheta õpetaja'].join('\n');d.onclick=e=>{e.stopPropagation();toggleLessonLock(l,cycleId)};d.ondblclick=e=>{e.stopPropagation();replaceTeacher(l,cycleId)};d.ondragstart=e=>e.dataTransfer.setData('text/plain',l.id);return d}

function setOptions(el,items,valueFn=x=>x.id,labelFn=x=>x.name,empty){if(!el)return;const old=el.value;el.innerHTML=(empty!==undefined?`<option value="">${empty}</option>`:'')+items.map(x=>`<option value="${valueFn(x)}">${labelFn(x)}</option>`).join('');if([...el.options].some(o=>o.value===old))el.value=old}
function renderCycleSelectors(){['globalCycle','teacherCycleSelect','roomCycleSelect','builderCycleSelect'].forEach(id=>setOptions($('#'+id),state.cycles));['globalCycle','builderCycleSelect'].forEach(id=>{if($('#'+id))$('#'+id).value=activeCycle});if($('#teacherCycleSelect')&&!$('#teacherCycleSelect').value)$('#teacherCycleSelect').value=activeCycle;if($('#roomCycleSelect')&&!$('#roomCycleSelect').value)$('#roomCycleSelect').value=activeCycle;$('#dashCycleLabel').textContent=currentCycle()?.name||''}
function renderYear(){
  $('#yearName').value=state.year.name;$('#yearStart').value=state.year.start||'';$('#yearEnd').value=state.year.end||'';
  $('#cyclesList').innerHTML=state.cycles.map(c=>`<div class="item-card" data-cycle-card="${c.id}"><div class="section-title"><strong>${c.name}</strong><div class="item-actions"><button class="danger" data-del-cycle="${c.id}">Eemalda</button></div></div><div class="form-grid four"><label>Nimi<input data-c-name value="${c.name}"></label><label>Nädalaid<input data-c-weeks type="number" min="1" value="${c.weeks}"></label><label>Poolaasta<select data-c-sem><option value="semester1" ${c.semester==='semester1'?'selected':''}>I poolaasta</option><option value="semester2" ${c.semester==='semester2'?'selected':''}>II poolaasta</option></select></label><label>Algus<input data-c-start type="date" value="${c.start||''}"></label></div><button class="soft" data-save-cycle="${c.id}">Salvesta tsükkel</button></div>`).join('');
  $$('[data-save-cycle]').forEach(b=>b.onclick=()=>{const c=cycleById(b.dataset.saveCycle),card=b.closest('[data-cycle-card]');c.name=card.querySelector('[data-c-name]').value;c.weeks=+card.querySelector('[data-c-weeks]').value;c.semester=card.querySelector('[data-c-sem]').value;c.start=card.querySelector('[data-c-start]').value;saveState();renderAll();toast('Tsükkel salvestatud')});
  $$('[data-del-cycle]').forEach(b=>b.onclick=()=>{if(state.cycles.length<=1)return toast('Vähemalt üks tsükkel peab jääma');const id=b.dataset.delCycle;state.cycles=state.cycles.filter(c=>c.id!==id);state.requirements.forEach(r=>delete r.cycleHours[id]);delete state.schedules[id];state.teachers.forEach(t=>{delete t.loads[id];delete t.availability.cycles[id]});if(activeCycle===id)activeCycle=state.cycles[0].id;saveState();renderAll()});
}
function renderClassesGroups(){
  $('#classesList').innerHTML=state.classes.map(c=>`<div class="item-card"><div class="section-title"><strong>${c.name}</strong><button class="danger" data-class-del="${c.id}">×</button></div><div class="form-grid four"><label>Nimi<input data-class-name="${c.id}" value="${c.name}"></label><label>Õpilasi<input data-class-students="${c.id}" type="number" value="${c.students}"></label><label>Min/päev<input data-class-min="${c.id}" type="number" value="${c.dailyMin}"></label><label>Max/päev<input data-class-max="${c.id}" type="number" value="${c.dailyMax}"></label></div><button class="soft" data-class-save="${c.id}">Salvesta</button></div>`).join('');
  $$('[data-class-save]').forEach(b=>b.onclick=()=>{const c=classById(b.dataset.classSave);c.name=$(`[data-class-name="${c.id}"]`).value;c.students=+$(`[data-class-students="${c.id}"]`).value;c.dailyMin=+$(`[data-class-min="${c.id}"]`).value;c.dailyMax=+$(`[data-class-max="${c.id}"]`).value;saveState();renderAll()});
  $$('[data-class-del]').forEach(b=>b.onclick=()=>{if(state.groups.some(g=>g.classIds.includes(b.dataset.classDel)))return toast('Klass on rühmades kasutusel');state.classes=state.classes.filter(c=>c.id!==b.dataset.classDel);saveState();renderAll()});
  $('#groupsTable').innerHTML=state.groups.map(g=>`<tr><td><b>${g.name}</b></td><td>${g.subject}</td><td>${groupClassNames(g)}</td><td>${g.students}/${g.maxStudents}</td><td>${g.parallel||'—'}</td><td><button class="soft" data-edit-group="${g.id}">Muuda</button></td></tr>`).join('');
  $$('[data-edit-group]').forEach(b=>b.onclick=()=>loadGroupEditor(b.dataset.editGroup));setOptions($('#groupSubject'),SUBJECTS,x=>x,x=>x);setOptions($('#groupClasses'),state.classes);if(!$('#groupId').value&&state.groups[0])loadGroupEditor(state.groups[0].id)
}
function loadGroupEditor(id){const g=groupById(id);if(!g)return;$('#groupId').value=g.id;$('#groupName').value=g.name;$('#groupSubject').value=g.subject;$('#groupStudents').value=g.students;$('#groupMaxStudents').value=g.maxStudents;$('#groupParallel').value=g.parallel||'';$('#groupRoomType').value=g.roomType;$('#groupConsecutive').value=g.consecutive||1;$('#groupSameRoom').checked=g.sameRoom!==false;[...$('#groupClasses').options].forEach(o=>o.selected=g.classIds.includes(o.value))}
function saveGroup(){const id=$('#groupId').value,g=groupById(id)||{id:uid('g')};g.name=$('#groupName').value||'Uus rühm';g.subject=$('#groupSubject').value;g.students=+$('#groupStudents').value||1;g.maxStudents=+$('#groupMaxStudents').value||g.students;g.classIds=[...$('#groupClasses').selectedOptions].map(o=>o.value);g.parallel=$('#groupParallel').value.trim();g.roomType=$('#groupRoomType').value;g.consecutive=+$('#groupConsecutive').value||1;g.sameRoom=$('#groupSameRoom').checked;if(!id)state.groups.push(g);saveState();renderAll();loadGroupEditor(g.id);toast('Rühm salvestatud')}

function renderCurriculum(){
  const head=$('#curriculumTable thead'),body=$('#curriculumTable tbody');head.innerHTML='<tr><th>Rühm</th><th>Aine</th><th>Aastamaht</th>'+state.cycles.map(c=>`<th>${c.name}<br><span class="mini">t/n</span></th>`).join('')+'<th>Plaanitud aasta</th><th></th></tr>';
  body.innerHTML=state.requirements.map(r=>{const g=groupById(r.groupId),planned=plannedAnnual(r);return `<tr><td>${g?.name||'?'}</td><td>${r.subject}</td><td>${r.annualHours}</td>${state.cycles.map(c=>`<td>${r.cycleHours?.[c.id]||0}</td>`).join('')}<td class="${planned===Number(r.annualHours)?'status-ok':'status-warn'}">${planned}</td><td><button class="soft" data-edit-req="${r.id}">Muuda</button></td></tr>`}).join('');
  $$('[data-edit-req]').forEach(b=>b.onclick=()=>loadRequirementEditor(b.dataset.editReq));setOptions($('#reqGroup'),state.groups);setOptions($('#reqSubject'),SUBJECTS,x=>x,x=>x);if(!$('#reqId').value&&state.requirements[0])loadRequirementEditor(state.requirements[0].id)
}
function renderCycleHoursEditor(r){$('#cycleHoursEditor').innerHTML=state.cycles.map(c=>`<label class="cycle-hour"><b>${c.name} · ${c.weeks} nädalat</b><input type="number" min="0" max="10" data-cycle-hour="${c.id}" value="${r?.cycleHours?.[c.id]||0}"></label>`).join('')}
function loadRequirementEditor(id){const r=reqById(id);if(!r)return;$('#reqId').value=r.id;$('#reqGroup').value=r.groupId;$('#reqSubject').value=r.subject;$('#reqAnnualHours').value=r.annualHours;renderCycleHoursEditor(r)}
function distributeRequirement(){const annual=+$('#reqAnnualHours').value||0,totalWeeks=state.cycles.reduce((a,c)=>a+c.weeks,0),base=Math.max(0,Math.round(annual/Math.max(1,totalWeeks)));let best=null,bestErr=1e9;const vals=state.cycles.map(()=>base);function search(i){if(i===vals.length){const total=state.cycles.reduce((a,c,j)=>a+vals[j]*c.weeks,0),err=Math.abs(total-annual)+Math.max(...vals)-Math.min(...vals)*.1;if(err<bestErr){bestErr=err;best=[...vals]}return}for(let v=Math.max(0,base-2);v<=base+2;v++){vals[i]=v;search(i+1)}}search(0);state.cycles.forEach((c,i)=>{const e=$(`[data-cycle-hour="${c.id}"]`);if(e)e.value=best[i]});toast('Aastamaht jaotatud lähima võimaliku nädalakoormusena')}
function saveRequirement(){const id=$('#reqId').value,r=reqById(id)||{id:uid('req'),cycleHours:{}};r.groupId=$('#reqGroup').value;r.subject=$('#reqSubject').value;r.annualHours=+$('#reqAnnualHours').value||0;r.cycleHours={};state.cycles.forEach(c=>r.cycleHours[c.id]=+$(`[data-cycle-hour="${c.id}"]`).value||0);if(!id)state.requirements.push(r);saveState();renderAll();loadRequirementEditor(r.id);toast('Õppekava nõue salvestatud')}

function renderTeachers(){
  $('#teacherList').innerHTML=state.teachers.map(t=>`<div class="list-row ${t.id===selectedTeacher?'active':''}" data-teacher="${t.id}"><strong>${t.name}</strong><span class="mini">${t.skills.length} pädevust · soov ${teacherLoadSpec(t,activeCycle).target}</span></div>`).join('');$$('[data-teacher]').forEach(e=>e.onclick=()=>{selectedTeacher=e.dataset.teacher;loadTeacherEditor()});if(!teacherById(selectedTeacher)&&state.teachers[0])selectedTeacher=state.teachers[0].id;loadTeacherEditor(false)
}
function loadTeacherEditor(rerender=true){const t=teacherById(selectedTeacher);if(!t)return;$('#teacherId').value=t.id;$('#teacherName').value=t.name;$('#teacherDefaultTarget').value=t.defaultTarget;$('#teacherCycleSelect').value=$('#teacherCycleSelect').value||activeCycle;const c=$('#teacherCycleSelect').value||activeCycle,s=teacherLoadSpec(t,c);$('#teacherLoadMin').value=s.min;$('#teacherLoadTarget').value=s.target;$('#teacherLoadMax').value=s.max;$('#teacherSkills').innerHTML='';t.skills.forEach(s=>addSkillRow(s.subject,s.groupId));teacherDraftAvailability=structuredClone(availabilityMap(t,$('#availabilityScope').value,c));renderAvailabilityGrid();if(rerender){$$('[data-teacher]').forEach(e=>e.classList.toggle('active',e.dataset.teacher===selectedTeacher))}}
function addSkillRow(subject=SUBJECTS[0],groupId=state.groups[0]?.id||''){const row=document.createElement('div');row.className='skill-row';row.innerHTML=`<select class="skill-subject">${SUBJECTS.map(s=>`<option ${s===subject?'selected':''}>${s}</option>`).join('')}</select><select class="skill-group"><option value="*" ${groupId==='*'?'selected':''}>Kõik selle aine rühmad</option>${state.groups.map(g=>`<option value="${g.id}" ${g.id===groupId?'selected':''}>${g.name}</option>`).join('')}</select><button class="danger">×</button>`;row.querySelector('button').onclick=()=>row.remove();$('#teacherSkills').appendChild(row)}
function renderAvailabilityGrid(){const t=teacherById(selectedTeacher);if(!t)return;const scope=$('#availabilityScope').value,cycleId=$('#teacherCycleSelect').value||activeCycle;let html='<div class="head"></div>'+DAYS.map(d=>`<div class="head">${d.slice(0,3)}</div>`).join('');periods().forEach(p=>{html+=`<div class="period">${p}</div>`;DAYS.forEach(d=>{const k=slotKey(d,p),explicit=teacherDraftAvailability[k],effective=scope==='cycle'?effectiveAvailability(t,cycleId,d,p):(explicit??'free'),status=explicit===undefined&&scope==='cycle'?effective:explicit??'free',inherited=explicit===undefined&&scope==='cycle';let label=inherited?'pärib: '+effective:(status==='preferred'?'eelistatud':status==='blocked'?'keelatud':status==='free'?'vaba':'pärib');html+=`<button class="${status!=='free'?status:''} ${inherited?'inherited':''}" data-av="${k}">${label}</button>`})});$('#teacherAvailabilityGrid').innerHTML=html;$$('[data-av]').forEach(b=>b.onclick=()=>{const k=b.dataset.av,cur=teacherDraftAvailability[k],scope=$('#availabilityScope').value;let next;if(scope==='cycle'){if(cur===undefined)next='preferred';else if(cur==='preferred')next='blocked';else if(cur==='blocked')next='free';else next=undefined}else{if(cur===undefined||cur==='free')next='preferred';else if(cur==='preferred')next='blocked';else next='free'}if(next===undefined)delete teacherDraftAvailability[k];else teacherDraftAvailability[k]=next;renderAvailabilityGrid()})}
function saveTeacher(){let t=teacherById($('#teacherId').value);if(!t){t={id:uid('t'),availability:{year:{},semester1:{},semester2:{},cycles:{}},loads:{},skills:[]};state.teachers.push(t);selectedTeacher=t.id}t.name=$('#teacherName').value||'Õpetaja';t.defaultTarget=+$('#teacherDefaultTarget').value||0;const cycleId=$('#teacherCycleSelect').value||activeCycle;t.loads[cycleId]={min:+$('#teacherLoadMin').value||0,target:+$('#teacherLoadTarget').value||0,max:+$('#teacherLoadMax').value||0};t.skills=$$('.skill-row').map(r=>({subject:r.querySelector('.skill-subject').value,groupId:r.querySelector('.skill-group').value}));const scope=$('#availabilityScope').value;const target=availabilityMap(t,scope,cycleId);Object.keys(target).forEach(k=>delete target[k]);Object.assign(target,teacherDraftAvailability);saveState();renderAll();toast('Õpetaja salvestatud')}

function renderRooms(){
  $('#roomList').innerHTML=state.rooms.map(r=>`<div class="list-row ${r.id===selectedRoom?'active':''}" data-room="${r.id}"><strong>${r.name}</strong><span class="mini">${r.type} · max ${r.capacity}</span></div>`).join('');$$('[data-room]').forEach(e=>e.onclick=()=>{selectedRoom=e.dataset.room;loadRoomEditor()});if(!roomById(selectedRoom)&&state.rooms[0])selectedRoom=state.rooms[0].id;loadRoomEditor(false);renderRoomSchedule()
}
function loadRoomEditor(rerender=true){const r=roomById(selectedRoom);if(!r)return;$('#roomId').value=r.id;$('#roomName').value=r.name;$('#roomType').value=r.type;$('#roomCapacity').value=r.capacity;if(rerender)$$('[data-room]').forEach(e=>e.classList.toggle('active',e.dataset.room===selectedRoom))}
function saveRoom(){let r=roomById($('#roomId').value);if(!r){r={id:uid('r'),blocked:{}};state.rooms.push(r);selectedRoom=r.id}r.name=$('#roomName').value||'Ruum';r.type=$('#roomType').value;r.capacity=+$('#roomCapacity').value||1;saveState();renderAll();toast('Ruum salvestatud')}
function renderRoomSchedule(){const cycleId=$('#roomCycleSelect').value||activeCycle,day=$('#roomDaySelect').value||DAYS[0];$('#roomScheduleHead').innerHTML='<th>Ruum</th>'+periods().map(p=>`<th>${p}. periood</th>`).join('');$('#roomScheduleBody').innerHTML='';state.rooms.forEach(r=>{const tr=document.createElement('tr');const name=document.createElement('td');name.innerHTML=`<b>${r.name}</b><div class="mini">${r.type} · ${r.capacity}</div>`;tr.appendChild(name);periods().forEach(p=>{const td=document.createElement('td');td.className='room-slot'+(r.blocked[blockKey(cycleId,day,p)]?' blocked':'');const lock=document.createElement('button');lock.className='room-block-btn '+(r.blocked[blockKey(cycleId,day,p)]?'danger':'soft');lock.textContent=r.blocked[blockKey(cycleId,day,p)]?'🔒':'🔓';lock.onclick=()=>{const k=blockKey(cycleId,day,p);if(r.blocked[k])delete r.blocked[k];else r.blocked[k]=true;saveState();renderAll()};td.appendChild(lock);schedule(cycleId).filter(l=>l.roomId===r.id&&lessonTouches(l,day,p)).forEach(l=>td.appendChild(lessonCard(l,cycleId,p!==l.period)));td.ondragover=e=>{e.preventDefault();td.classList.add('dragover')};td.ondragleave=()=>td.classList.remove('dragover');td.ondrop=e=>{e.preventDefault();td.classList.remove('dragover');const l=schedule(cycleId).find(x=>x.id===e.dataTransfer.getData('text/plain'));if(l)moveLessonRoom(l,r.id,cycleId)};tr.appendChild(td)});$('#roomScheduleBody').appendChild(tr)})}

function renderBuilder(){const cycleId=$('#builderCycleSelect').value||activeCycle;setOptions($('#builderView'),[{id:'all',name:'Kõik'},...state.classes.map(c=>({id:'class:'+c.id,name:'Klass '+c.name})),...state.teachers.map(t=>({id:'teacher:'+t.id,name:'Õpetaja '+t.name}))]);const view=$('#builderView').value||'all';$('#scheduleHead').innerHTML='<th>Periood</th>'+DAYS.map(d=>`<th>${d}</th>`).join('');$('#scheduleBody').innerHTML='';periods().forEach(p=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${p}</td>`;DAYS.forEach(day=>{const td=document.createElement('td');td.className='slot';let arr=schedule(cycleId).filter(l=>lessonTouches(l,day,p));if(view.startsWith('class:'))arr=arr.filter(l=>groupById(l.groupId)?.classIds.includes(view.split(':')[1]));if(view.startsWith('teacher:'))arr=arr.filter(l=>l.teacherId===view.split(':')[1]);arr.forEach(l=>td.appendChild(lessonCard(l,cycleId,p!==l.period)));if(!arr.length)td.innerHTML='<div class="empty-slot">vaba</div>';td.ondragover=e=>{e.preventDefault();td.classList.add('dragover')};td.ondragleave=()=>td.classList.remove('dragover');td.ondrop=e=>{e.preventDefault();td.classList.remove('dragover');const l=schedule(cycleId).find(x=>x.id===e.dataTransfer.getData('text/plain'));if(l)moveLessonTime(l,day,p,cycleId)};tr.appendChild(td)});$('#scheduleBody').appendChild(tr)});
  const issues=allIssues(cycleId);$('#builderHardCount').textContent=issues.hard.length+' kõva';$('#builderIssues').innerHTML=[...issues.hard.map(x=>`<div class="issue hard">🟥 ${x}</div>`),...issues.soft.slice(0,20).map(x=>`<div class="issue soft">🟨 ${x}</div>`)].join('')||'<div class="issue">✅ Konflikte ei leitud</div>';
  const existing=new Set(schedule(cycleId).map(l=>l.reqId+'|'+l.blockIndex));const unplaced=demandUnits(cycleId).flatMap(u=>u.blocks.filter(b=>!existing.has(b.reqId+'|'+b.blockIndex)).map(b=>({b,u})));$('#unplacedBlocks').innerHTML=unplaced.length?unplaced.map(({b,u})=>`<span class="chip bad">${u.parallel?'['+u.parallel+'] ':''}${groupById(b.groupId)?.name} · ${b.duration} p</span>`).join(''):'<span class="chip">Kõik nõutud plokid on vähemalt korra paigutatud.</span>'
}

function renderDashboard(){const cycleId=activeCycle,issues=allIssues(cycleId),needed=state.requirements.reduce((a,r)=>a+reqWeekly(r,cycleId),0),scheduled=schedule(cycleId).reduce((a,l)=>a+(l.duration||1),0),uncovered=state.requirements.reduce((a,r)=>{const c=coverage(r,cycleId);return a+Math.max(0,c.need-c.got)},0),annualMismatch=state.requirements.filter(r=>plannedAnnual(r)!==Number(r.annualHours)).length,parallel=parallelIssues(cycleId).length;$('#dashboardKpis').innerHTML=`<div class="kpi"><b>${needed}</b><span>tsüklis tundi nädalas vaja</span></div><div class="kpi ${uncovered?'bad':'good'}"><b>${scheduled}</b><span>paigutatud perioodi</span></div><div class="kpi ${uncovered?'bad':'good'}"><b>${uncovered}</b><span>katmata perioodi</span></div><div class="kpi ${annualMismatch?'bad':'good'}"><b>${annualMismatch}</b><span>aastamahu jaotuse erinevust</span></div><div class="kpi ${issues.hard.length?'bad':'good'}"><b>${issues.hard.length}</b><span>kõva konflikti</span></div>`;
  $('#classDayDashboard').innerHTML=state.classes.map(c=>{const cells=DAYS.map(d=>{const n=classOccupiedSet(c.id,cycleId,d).size,iss=classDayIssues(c,cycleId,d);return `<td class="${iss.length?'status-bad':'status-ok'}">${n}${iss.length?' !':''}</td>`}).join(''),all=DAYS.flatMap(d=>classDayIssues(c,cycleId,d));return `<tr><td><b>${c.name}</b></td>${cells}<td class="${all.length?'status-bad':'status-ok'}">${all.length?all.length+' probleem(i)':'OK'}</td></tr>`}).join('');
  $('#teacherLoadDashboard').innerHTML=state.teachers.map(t=>{const n=teacherAssigned(t.id,cycleId),s=teacherLoadSpec(t,cycleId),bad=n>s.max,low=n<s.min;return `<tr><td>${t.name}</td><td>${n}</td><td>${s.min} / ${s.target} / ${s.max}</td><td class="${bad?'status-bad':low?'status-warn':'status-ok'}">${bad?'üle max':low?'alla min':'OK'}</td></tr>`}).join('');
  $('#coverageDashboard').innerHTML=state.requirements.filter(r=>reqWeekly(r,cycleId)>0).map(r=>{const g=groupById(r.groupId),c=coverage(r,cycleId);return `<tr><td>${g?.name||'?'}</td><td>${r.subject}</td><td>${c.need}</td><td>${c.got}</td><td class="${c.got===c.need?'status-ok':'status-bad'}">${c.got===c.need?'kaetud':c.need-c.got+' puudu'}</td></tr>`}).join('');$('#hardCount').textContent=issues.hard.length;$('#conflictDashboard').innerHTML=issues.hard.slice(0,30).map(x=>`<div class="issue hard">🟥 ${x}</div>`).join('')||'<div class="issue">✅ Kõvasid konflikte ei leitud</div>'
}

function renderAll(){renderCycleSelectors();renderYear();renderClassesGroups();renderCurriculum();renderTeachers();renderRooms();renderBuilder();renderDashboard();saveState()}
function showPage(name){activePage=name;$$('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+name));$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===name));if(name==='rooms')renderRoomSchedule();if(name==='builder')renderBuilder()}

function bindEvents(){
  $$('.nav-item').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
  $('#globalCycle').onchange=e=>{activeCycle=e.target.value;$('#builderCycleSelect').value=activeCycle;renderAll()};
  $('#checkAllBtn').onclick=()=>{renderAll();toast(allIssues(activeCycle).hard.length?'Leiti konflikte':'Kõvad konfliktid puuduvad')};
  $('#optimizeBtn').onclick=()=>optimizeCycle(activeCycle);$('#builderOptimizeBtn').onclick=()=>optimizeCycle($('#builderCycleSelect').value||activeCycle);$('#builderCheckBtn').onclick=()=>{renderBuilder();toast('Kontroll tehtud')};
  $('#builderCycleSelect').onchange=e=>{activeCycle=e.target.value;$('#globalCycle').value=activeCycle;renderAll()};$('#builderView').onchange=renderBuilder;
  $('#resetBtn').onclick=()=>{if(confirm('Taastada kõik v5 näidisandmed?')){localStorage.removeItem(STORAGE);state=makeDefaults();activeCycle=state.cycles[0].id;selectedTeacher=state.teachers[0].id;selectedRoom=state.rooms[0].id;saveState();renderAll();toast('Näidisandmed taastatud')}};
  $('#saveYearBtn').onclick=()=>{state.year.name=$('#yearName').value;state.year.start=$('#yearStart').value;state.year.end=$('#yearEnd').value;saveState();renderAll()};
  $('#addCycleBtn').onclick=()=>{const id=uid('c');state.cycles.push({id,name:'Tsükkel '+(state.cycles.length+1),weeks:7,semester:'semester2',start:'',end:''});state.requirements.forEach(r=>r.cycleHours[id]=0);saveState();renderAll()};
  $('#addClassBtn').onclick=()=>{const name=prompt('Klassi nimi','9A');if(name){state.classes.push({id:uid('cl'),name,students:24,dailyMin:2,dailyMax:4});saveState();renderAll()}};
  $('#addGroupBtn').onclick=()=>{$('#groupId').value='';$('#groupName').value='';$('#groupStudents').value=20;$('#groupMaxStudents').value=30;$('#groupParallel').value='';$('#groupConsecutive').value=1;[...$('#groupClasses').options].forEach(o=>o.selected=false)};$('#saveGroupBtn').onclick=saveGroup;
  $('#addRequirementBtn').onclick=()=>{$('#reqId').value='';$('#reqAnnualHours').value=0;renderCycleHoursEditor(null)};$('#saveRequirementBtn').onclick=saveRequirement;$('#distributeHoursBtn').onclick=distributeRequirement;
  $('#addTeacherBtn').onclick=()=>{selectedTeacher='';$('#teacherId').value='';$('#teacherName').value='';$('#teacherDefaultTarget').value=14;$('#teacherSkills').innerHTML='';teacherDraftAvailability={};renderAvailabilityGrid()};$('#addTeacherSkillBtn').onclick=()=>addSkillRow();$('#saveTeacherBtn').onclick=saveTeacher;
  $('#availabilityScope').onchange=()=>loadTeacherEditor(false);$('#teacherCycleSelect').onchange=()=>loadTeacherEditor(false);
  $('#addRoomBtn').onclick=()=>{selectedRoom='';$('#roomId').value='';$('#roomName').value='';$('#roomCapacity').value=25};$('#saveRoomBtn').onclick=saveRoom;$('#roomCycleSelect').onchange=renderRoomSchedule;$('#roomDaySelect').onchange=renderRoomSchedule;
}

function init(){setOptions($('#groupSubject'),SUBJECTS,x=>x,x=>x);setOptions($('#reqSubject'),SUBJECTS,x=>x,x=>x);setOptions($('#roomDaySelect'),DAYS,x=>x,x=>x);bindEvents();renderAll();showPage('dashboard')}
init();