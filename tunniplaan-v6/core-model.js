
function cycle(id=activeCycle){return state.cycles.find(c=>c.id===id)}
function cls(id){return state.classes.find(x=>x.id===id)}
function subject(id){return state.subjects.find(x=>x.id===id)}
function group(id){return state.groups.find(x=>x.id===id)}
function teacher(id){return state.teachers.find(x=>x.id===id)}
function room(id){return state.rooms.find(x=>x.id===id)}
function requirement(id){return state.requirements.find(x=>x.id===id)}
function building(id){return state.buildings.find(x=>x.id===id)}
function schedule(cycleId=activeCycle){state.schedules[cycleId]??=[];return state.schedules[cycleId]}
function periodNums(){return state.periods.map(p=>p.n).sort((a,b)=>a-b)}
function maxPeriod(){return Math.max(0,...periodNums())}
function groupClasses(g){return g.classIds.map(cls).filter(Boolean)}
function groupClassNames(g){return groupClasses(g).map(x=>x.name).join(', ')}
function rule(k){return state.rules[k]||{weight:0,hard:false}}
function reqHours(r,cid){return Number(r.cycleHours?.[cid])||0}
function reqWeeks(r,cid){const c=cycle(cid),all=Array.from({length:Number(c?.weeks)||0},(_,i)=>i+1);const x=r.weekMasks?.[cid];return Array.isArray(x)&&x.length?x:all}
function lessonWeeks(l,cid){return reqWeeks(requirement(l.reqId)||{},cid)}
function lessonsOverlapWeeks(a,b,cid){return intersect(lessonWeeks(a,cid),lessonWeeks(b,cid))}
function occupied(l){return Array.from({length:l.duration||1},(_,i)=>(l.period||0)+i)}
function overlapTime(a,b){return a.day&&a.day===b.day&&occupied(a).some(p=>occupied(b).includes(p))}
function sameSync(g1,g2){return !!g1?.syncKey&&g1.syncKey===g2?.syncKey}
function overlapsClasses(g1,g2){return g1?.classIds.some(id=>g2?.classIds.includes(id))}
function teacherLoadSpec(t,cid){const d=Number(t.defaultTarget)||0;return t.loads?.[cid]||{min:Math.max(0,d-2),target:d,max:d+2,dailyMax:4}}
function teacherAssigned(tid,cid=activeCycle){return schedule(cid).filter(l=>l.teacherId===tid).reduce((a,l)=>a+(l.duration||1),0)}
function canTeach(t,g,sid){return !!t&&t.skills.some(x=>x.subjectId===sid&&(x.groupId===g.id||x.groupId==='*'))}
function availableTeachers(g,sid){return state.teachers.filter(t=>canTeach(t,g,sid))}
function eligibleRooms(g,rq){let rs=state.rooms.filter(r=>r.type===g.roomType&&r.capacity>=g.students);const preferred=rq?.preferredRoomIds||[],alternative=rq?.alternativeRoomIds||[];if(preferred.length||alternative.length){const allowed=new Set([...preferred,...alternative]);const narrowed=rs.filter(r=>allowed.has(r.id));if(narrowed.length)rs=narrowed}return rs}

function findTimeRequest(type,id,scope,cid){return state.timeRequests.find(x=>x.entityType===type&&x.entityId===id&&x.scope===scope&&(scope!=='cycle'||x.cycleId===cid))}
function timeMap(type,id,scope,cid,create=false){let x=findTimeRequest(type,id,scope,cid);if(!x&&create){x={id:uid('tr'),entityType:type,entityId:id,scope,cycleId:scope==='cycle'?cid:'',map:{}};state.timeRequests.push(x)}return x?.map||{}}
function effectiveEntityTime(type,id,cid,d,p){const k=slotKey(d,p),c=cycle(cid);const cm=findTimeRequest(type,id,'cycle',cid)?.map||{};if(cm[k]!==undefined)return cm[k];const sm=findTimeRequest(type,id,c?.semester,cid)?.map||{};if(sm[k]!==undefined)return sm[k];const ym=findTimeRequest(type,id,'year',cid)?.map||{};return ym[k]??'free'}
function timeStatusesFor(l,cid,d,p,roomId=l.roomId,teacherId=l.teacherId){const g=group(l.groupId),rq=requirement(l.reqId),sid=l.subjectId;const entities=[['teacher',teacherId],['group',g?.id],['subject',sid],['room',roomId],['requirement',rq?.id]];g?.classIds.forEach(id=>entities.push(['class',id]));return entities.filter(x=>x[1]).map(([type,id])=>({type,id,status:effectiveEntityTime(type,id,cid,d,p)}))}
function isBlockedByTime(l,cid,d,p,roomId=l.roomId,teacherId=l.teacherId){return timeStatusesFor(l,cid,d,p,roomId,teacherId).some(x=>x.status==='blocked')}
function preferredCount(l,cid,d,p,roomId=l.roomId,teacherId=l.teacherId){return timeStatusesFor(l,cid,d,p,roomId,teacherId).filter(x=>x.status==='preferred').length}

function cycleDates(c){let start=c?.start?new Date(c.start+'T00:00:00Z'):null,end=c?.end?new Date(c.end+'T00:00:00Z'):null;if(!start)return[];const base=new Date(start);if(!end){end=new Date(start);end.setUTCDate(end.getUTCDate()+Math.max(1,Number(c.weeks)||1)*7-1)}const out=[];for(let d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1)){const dow=d.getUTCDay();if(dow>=1&&dow<=5){const iso=d.toISOString().slice(0,10),week=Math.floor((d-base)/604800000)+1;out.push({date:iso,dow,week,closed:state.closures.some(x=>iso>=x.start&&iso<=(x.end||x.start))})}}return out}
function calendarStats(c){const dates=cycleDates(c),counts=[0,0,0,0,0];dates.filter(x=>!x.closed).forEach(x=>counts[x.dow-1]++);return {weekdays:dates.length,closed:dates.filter(x=>x.closed).length,teaching:dates.filter(x=>!x.closed).length,counts}}
function actualAnnualHours(r){let known=false,total=0;state.cycles.forEach(c=>{const dates=cycleDates(c);if(!dates.length)return;known=true;const weeks=reqWeeks(r,c.id);schedule(c.id).filter(l=>l.reqId===r.id&&l.day).forEach(l=>{const dow=DAYS.indexOf(l.day)+1,count=dates.filter(x=>!x.closed&&x.dow===dow&&weeks.includes(x.week)).length;total+=count*(l.duration||1)})});return known?total:null}

function breakAfter(period){return Number(state.periods.find(x=>x.n===period)?.breakAfter)||0}
function travelMinutes(from,to){if(!from||!to||from===to)return 0;return Number(state.travel[`${from}|${to}`])||0}
function adjacentTravelIssue(a,b,cid){if(!a.roomId||!b.roomId||!a.day||a.day!==b.day||!lessonsOverlapWeeks(a,b,cid))return false;const ra=room(a.roomId),rb=room(b.roomId);if(!ra||!rb||ra.buildingId===rb.buildingId)return false;const aEnd=Math.max(...occupied(a)),bStart=Math.min(...occupied(b)),bEnd=Math.max(...occupied(b)),aStart=Math.min(...occupied(a));if(aEnd+1===bStart)return travelMinutes(ra.buildingId,rb.buildingId)>breakAfter(aEnd);if(bEnd+1===aStart)return travelMinutes(rb.buildingId,ra.buildingId)>breakAfter(bEnd);return false}

function splitDurations(r,cid){const h=reqHours(r,cid);if(h<=0)return[];const mode=r.blockMode||'auto';if(mode==='pattern'&&r.pattern){const arr=r.pattern.split('+').map(Number).filter(n=>n>0);if(arr.reduce((a,b)=>a+b,0)===h)return arr}if(mode==='singles')return Array(h).fill(1);if(mode==='doubles'){const a=[];let left=h;while(left>0){a.push(Math.min(2,left));left-=2}return a}if(mode==='oneDouble'&&h>=2)return [2,...Array(h-2).fill(1)];if(mode==='auto'){if(h>=4)return [2,...Array(h-2).fill(1)];if(h===3)return [2,1];return Array(h).fill(1)}return Array(h).fill(1)}
function blockSpecs(r,cid){return splitDurations(r,cid).map((duration,blockIndex)=>({reqId:r.id,groupId:r.groupId,subjectId:r.subjectId,blockIndex,duration,weeks:reqWeeks(r,cid)}))}
function demandUnits(cid){const blocks=state.requirements.flatMap(r=>blockSpecs(r,cid)),used=new Set(),units=[];blocks.forEach(b=>{const key=b.reqId+'|'+b.blockIndex;if(used.has(key))return;const g=group(b.groupId);if(g?.syncKey){const same=blocks.filter(x=>x.blockIndex===b.blockIndex&&group(x.groupId)?.syncKey===g.syncKey);same.forEach(x=>used.add(x.reqId+'|'+x.blockIndex));units.push({id:g.syncKey+'|'+b.blockIndex,syncKey:g.syncKey,blocks:same})}else{used.add(key);units.push({id:key,syncKey:'',blocks:[b]})}});return units}

