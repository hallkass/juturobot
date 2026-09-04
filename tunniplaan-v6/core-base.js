'use strict';
const DAYS=['Esmaspäev','Teisipäev','Kolmapäev','Neljapäev','Reede'];
const STORE='tunniplaan-v6-state';
const EXPORT_FORMAT='tunniplaani-koostaja-v6';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const uid=p=>p+'-'+Math.random().toString(36).slice(2,9);
const deep=x=>structuredClone(x);
const slotKey=(d,p)=>`${d}|${p}`;
const roomBlockKey=(cycle,d,p)=>`${cycle}|${d}|${p}`;
const intersect=(a,b)=>a.some(x=>b.includes(x));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

function defaults(){
  const cycles=[1,2,3,4,5].map((n,i)=>({id:'c'+n,name:'Tsükkel '+n,weeks:7,semester:n<=2?'semester1':'semester2',start:'',end:''}));
  const periods=[
    {id:'p1',n:1,start:'08:15',end:'09:30',breakAfter:15},
    {id:'p2',n:2,start:'09:45',end:'11:00',breakAfter:30},
    {id:'p3',n:3,start:'11:30',end:'12:45',breakAfter:15},
    {id:'p4',n:4,start:'13:00',end:'14:15',breakAfter:0}
  ];
  const classes=[
    {id:'cl7a',name:'7A',students:25,dailyMin:2,dailyTarget:4,dailyMax:4},
    {id:'cl7b',name:'7B',students:24,dailyMin:2,dailyTarget:4,dailyMax:4},
    {id:'cl8a',name:'8A',students:24,dailyMin:2,dailyTarget:4,dailyMax:4},
    {id:'cl8b',name:'8B',students:24,dailyMin:2,dailyTarget:4,dailyMax:4},
    {id:'cl8c',name:'8C',students:23,dailyMin:2,dailyTarget:4,dailyMax:4}
  ];
  const subjects=[
    {id:'mat',name:'Matemaatika',core:true},{id:'est',name:'Eesti keel',core:true},{id:'his',name:'Ajalugu',core:false},
    {id:'phy',name:'Füüsika',core:true},{id:'it',name:'Informaatika',core:false},{id:'eng',name:'Inglise keel',core:true},
    {id:'tech',name:'Käsitöö/tehnoloogia',core:false},{id:'pe',name:'Kehaline kasvatus',core:false}
  ];
  const groups=[];
  const addGroup=(id,name,subjectId,classIds,students,syncKey='',roomType='tavaklass')=>groups.push({id,name,subjectId,classIds,students,maxStudents:30,syncKey,roomType});
  ['7A','7B'].forEach((name,ix)=>{const c=classes.find(x=>x.name===name).id;addGroup(`g${name}mat`,`${name} MAT`,'mat',[c],classes.find(x=>x.id===c).students);addGroup(`g${name}est`,`${name} EST`,'est',[c],24);addGroup(`g${name}his`,`${name} AJ`,'his',[c],24);addGroup(`g${name}phy`,`${name} FÜ`,'phy',[c],24,'','labor');addGroup(`g${name}it`,`${name} IT`,'it',[c],20,'','arvutiklass')});
  ['8A','8B','8C'].forEach(name=>{const c=classes.find(x=>x.name===name).id;addGroup(`g${name}est`,`${name} EST`,'est',[c],23);addGroup(`g${name}his`,`${name} AJ`,'his',[c],23);addGroup(`g${name}phy`,`${name} FÜ`,'phy',[c],23,'','labor');addGroup(`g${name}it`,`${name} IT`,'it',[c],20,'','arvutiklass')});
  const c8=classes.filter(c=>c.name.startsWith('8')).map(c=>c.id);
  addGroup('gmat81','MAT8-1','mat',c8,24,'MAT8');addGroup('gmat82','MAT8-2','mat',c8,24,'MAT8');addGroup('gmat83','MAT8-3','mat',c8,23,'MAT8');
  addGroup('g7atech','7A TEH','tech',['cl7a'],14,'','töökoda');

  const buildings=[{id:'main',name:'Peamaja'},{id:'sport',name:'Spordihoone'}];
  const rooms=[
    ['r204','204','tavaklass',30,'main'],['r205','205','tavaklass',30,'main'],['r206','206','tavaklass',30,'main'],['r207','207','tavaklass',30,'main'],
    ['r208','208','tavaklass',26,'main'],['rlab','Füüsikalabor','labor',26,'main'],['rit','Arvutiklass','arvutiklass',26,'main'],['rwork','Töökoda','töökoda',18,'main'],['rgym','Spordisaal','spordisaal',60,'sport']
  ].map(([id,name,type,capacity,buildingId])=>({id,name,type,capacity,buildingId,blocked:{}}));
  const travel={'main|sport':12,'sport|main':12};

  const teachers=[
    {id:'tmari',name:'Mari',subjects:['mat'],defaultTarget:14,homeBuildingId:'main'},
    {id:'tpeeter',name:'Peeter',subjects:['mat'],defaultTarget:14,homeBuildingId:'main'},
    {id:'tliis',name:'Liis',subjects:['mat'],defaultTarget:14,homeBuildingId:'main'},
    {id:'tkatrin',name:'Katrin',subjects:['est','eng'],defaultTarget:16,homeBuildingId:'main'},
    {id:'tjuri',name:'Jüri',subjects:['his'],defaultTarget:12,homeBuildingId:'main'},
    {id:'tandres',name:'Andres',subjects:['phy','it','tech'],defaultTarget:16,homeBuildingId:'main'}
  ].map(t=>({id:t.id,name:t.name,defaultTarget:t.defaultTarget,homeBuildingId:t.homeBuildingId,loads:{},skills:groups.filter(g=>t.subjects.includes(g.subjectId)).map(g=>({subjectId:g.subjectId,groupId:g.id}))}));

  const requirements=[];
  const weeklyBySubject={mat:3,est:3,his:2,phy:2,it:1,tech:2};
  groups.forEach(g=>{
    const h=weeklyBySubject[g.subjectId]||2,cycleHours={};cycles.forEach(c=>cycleHours[c.id]=h);
    const weekMasks={};cycles.forEach(c=>weekMasks[c.id]=Array.from({length:c.weeks},(_,i)=>i+1));
    requirements.push({id:'req-'+g.id,groupId:g.id,subjectId:g.subjectId,annualHours:h*35,cycleHours,blockMode:g.id==='g7atech'?'doubles':'auto',pattern:'',weekMasks,preferredRoomIds:[],alternativeRoomIds:[],afterRequirementId:''});
  });

  const timeRequests=[];
  const setTR=(entityType,entityId,scope,map,cycleId='')=>timeRequests.push({id:uid('tr'),entityType,entityId,scope,cycleId,map});
  const mari1={};DAYS.forEach(d=>periods.forEach(p=>{if(!['Esmaspäev','Reede'].includes(d))mari1[slotKey(d,p.n)]='blocked'}));mari1[slotKey('Teisipäev',3)]='preferred';mari1[slotKey('Teisipäev',4)]='preferred';
  setTR('teacher','tmari','semester1',mari1);
  setTR('teacher','tmari','semester2',{[slotKey('Kolmapäev',1)]:'blocked',[slotKey('Kolmapäev',2)]:'blocked',[slotKey('Kolmapäev',3)]:'blocked',[slotKey('Kolmapäev',4)]:'blocked'});

  const rules={
    timeBlocked:{label:'Keelatud ajad',desc:'Õpetaja, klassi, rühma, aine, ruumi või tunni keelatud slotid.',weight:5,hard:true},
    teacherPreferred:{label:'Eelistatud ajad',desc:'Eelistatud ajaslotid annavad parema skoori.',weight:4,hard:false},
    classNoGaps:{label:'Klassil ei ole auke',desc:'Esimese ja viimase tunni vahele ei jää tühja perioodi.',weight:5,hard:true},
    classDailyMax:{label:'Klassi päevane maksimum',desc:'Klassi päevane koormus ei ületa määratud maksimumi.',weight:5,hard:true},
    teacherDailyMax:{label:'Õpetaja päevane maksimum',desc:'Õpetaja päevane tundide arv ei lähe üle tsükli maksimumi.',weight:5,hard:true},
    teacherGaps:{label:'Õpetaja augud',desc:'Vähenda õpetaja tööpäeva tühje vahepealseid perioode.',weight:4,hard:false},
    spreadSubject:{label:'Sama aine hajutamine',desc:'Sama rühma sama aine plokid võimalusel eri päevadele.',weight:4,hard:false},
    previousCycle:{label:'Sarnasus eelmise tsükliga',desc:'Säilita võimalusel eelmise tsükli päev ja periood.',weight:2,hard:false},
    roomPreference:{label:'Eelistatud ruum',desc:'Kasuta nõude juures eelistatud ruumi enne alternatiive.',weight:3,hard:false},
    buildingTravel:{label:'Hoonetevaheline liikumine',desc:'Jäta piisavalt aega eri hoonete vahel liikumiseks.',weight:5,hard:true},
    coreEarly:{label:'Põhiained varem',desc:'Põhiained võiksid toimuda pigem päeva esimeses pooles.',weight:2,hard:false},
    classDailyBalance:{label:'Klassi päevade tasakaal',desc:'Päevad võiksid olla võimalikult sarnase pikkusega.',weight:2,hard:false},
    sameTeacher:{label:'Sama rühm + aine = sama õpetaja',desc:'Ühe nõude kõik nädalaplokid jäävad sama õpetaja kätte.',weight:5,hard:true},
    ordering:{label:'Tundide järjekord',desc:'Kui nõudel on eelnev tund, peab järjekord säilima.',weight:4,hard:false}
  };

  return {meta:{version:6},year:{name:'2026/27',start:'2026-09-01',end:'2027-06-15'},periods,cycles,closures:[],classes,subjects,groups,buildings,rooms,travel,teachers,requirements,timeRequests,rules,schedules:{}};
}

let state=load();
let activePage='dashboard',activeCycle=state.cycles[0]?.id||'',selectedTeacher=state.teachers[0]?.id||'',selectedRoom=state.rooms[0]?.id||'';
let undoStack=[],redoStack=[],dragLessonId=null,timeDraft={};

function load(){try{const x=JSON.parse(localStorage.getItem(STORE));if(x?.meta?.version===6)return x}catch(e){}return defaults()}
function save(){localStorage.setItem(STORE,JSON.stringify(state))}
function toast(msg){const e=$('#toast');e.textContent=msg;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2200)}
function snapshot(label){undoStack.push({label,state:JSON.stringify(state)});if(undoStack.length>60)undoStack.shift();redoStack=[];updateUndoButtons()}
function commit(label,fn){snapshot(label);fn();save();renderAll();toast(label)}
function undo(){if(!undoStack.length)return;redoStack.push({label:'redo',state:JSON.stringify(state)});const x=undoStack.pop();state=JSON.parse(x.state);normalizeSelections();save();renderAll();updateUndoButtons();toast('Tagasi: '+x.label)}
function redo(){if(!redoStack.length)return;undoStack.push({label:'undo',state:JSON.stringify(state)});const x=redoStack.pop();state=JSON.parse(x.state);normalizeSelections();save();renderAll();updateUndoButtons();toast('Muudatus taastatud')}
function updateUndoButtons(){if($('#undoBtn'))$('#undoBtn').disabled=!undoStack.length;if($('#redoBtn'))$('#redoBtn').disabled=!redoStack.length}
function normalizeSelections(){if(!state.cycles.some(c=>c.id===activeCycle))activeCycle=state.cycles[0]?.id||'';if(!state.teachers.some(t=>t.id===selectedTeacher))selectedTeacher=state.teachers[0]?.id||'';if(!state.rooms.some(r=>r.id===selectedRoom))selectedRoom=state.rooms[0]?.id||''}
