(() => {
  const FILE_FORMAT='tunniplaan-v5';
  const FILE_VERSION=1;

  function safeFilePart(value){
    return String(value||'oppeaasta')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-zA-Z0-9._-]+/g,'-')
      .replace(/^-+|-+$/g,'')||'oppeaasta';
  }

  function exportAllData(){
    saveState();
    const payload={
      format:FILE_FORMAT,
      version:FILE_VERSION,
      exportedAt:new Date().toISOString(),
      schoolYear:state.year?.name||'',
      state:structuredClone(state)
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const day=new Date().toISOString().slice(0,10);
    a.href=url;
    a.download=`tunniplaan-${safeFilePart(state.year?.name)}-${day}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Kõik andmed laaditi failina alla');
  }

  function validateImportedState(x){
    const requiredArrays=['cycles','classes','groups','requirements','teachers','rooms'];
    if(!x||typeof x!=='object')return 'Fail ei sisalda andmeobjekti.';
    for(const k of requiredArrays)if(!Array.isArray(x[k]))return `Puuduv või vigane väli: ${k}.`;
    if(!x.year||typeof x.year!=='object')return 'Puudub õppeaasta info.';
    if(!x.schedules||typeof x.schedules!=='object')x.schedules={};
    if(!x.settings||typeof x.settings!=='object')x.settings={periods:4};
    x.calendarClosures??=[];
    return null;
  }

  function normalizeImportedPayload(parsed){
    if(parsed?.format===FILE_FORMAT){
      if(Number(parsed.version)>FILE_VERSION)throw new Error(`Fail on uuema versiooni (${parsed.version}) jaoks.`);
      return parsed.state;
    }
    // Lubame ka varasema käsitsi eksporditud puhta state JSON-i.
    return parsed;
  }

  async function importAllData(file){
    if(!file)return;
    try{
      const text=await file.text();
      const parsed=JSON.parse(text);
      const imported=normalizeImportedPayload(parsed);
      const err=validateImportedState(imported);
      if(err)throw new Error(err);
      const label=imported.year?.name?` (${imported.year.name})`:'';
      if(!confirm(`Laadida failist tunniplaani andmed${label}?\n\nPraegused brauseris olevad andmed asendatakse.`))return;

      // Hoia enne importi üks kohalik avariikoopia.
      try{localStorage.setItem(STORAGE+'-backup-before-import',JSON.stringify(state))}catch(e){}

      state=imported;
      activeCycle=state.cycles[0]?.id||'';
      selectedTeacher=state.teachers[0]?.id||'';
      selectedRoom=state.rooms[0]?.id||'';
      teacherDraftAvailability={};
      saveState();
      renderAll();
      showPage('dashboard');
      toast('Andmed laaditi failist');
    }catch(err){
      console.error(err);
      alert('Faili ei saanud laadida: '+err.message);
    }
  }

  function installPortableSaveUI(){
    const navFoot=document.querySelector('.nav-foot');
    if(!navFoot||document.querySelector('#exportDataBtn'))return;

    const title=document.createElement('div');
    title.className='portable-title';
    title.innerHTML='<b>Andmefail</b><small>Vii töö teise arvutisse või tee varukoopia.</small>';

    const exportBtn=document.createElement('button');
    exportBtn.id='exportDataBtn';exportBtn.className='soft full';exportBtn.textContent='⬇ Laadi andmed alla';
    exportBtn.onclick=exportAllData;

    const importBtn=document.createElement('button');
    importBtn.id='importDataBtn';importBtn.className='soft full';importBtn.textContent='⬆ Laadi andmed failist';

    const input=document.createElement('input');
    input.id='importDataInput';input.type='file';input.accept='.json,application/json';input.hidden=true;
    input.onchange=async()=>{const file=input.files?.[0];await importAllData(file);input.value=''};
    importBtn.onclick=()=>input.click();

    navFoot.prepend(input);
    navFoot.prepend(importBtn);
    navFoot.prepend(exportBtn);
    navFoot.prepend(title);
  }

  function installSaveGuideNote(){
    const guide=document.querySelector('#page-guide');
    if(!guide||document.querySelector('#portableSaveGuide'))return;
    const box=document.createElement('section');box.className='panel card-section';box.id='portableSaveGuide';
    box.innerHTML=`<h3>9. Salvestamine ja töö jätkamine teises arvutis</h3>
      <p>Äpp salvestab muudatused automaatselt selle brauseri kohalikku salvestusse. See ei sünkroniseeru kasutajate ega seadmete vahel. Varukoopiaks või teise arvutisse liikumiseks kasuta vasakmenüü all nuppe <b>„Laadi andmed alla“</b> ja <b>„Laadi andmed failist“</b>. JSON-fail sisaldab kogu õppeaastat, tsükleid, rühmi, õpetajaid, ruume, kalendrit, piiranguid ja koostatud tunniplaane.</p>`;
    const grid=guide.querySelector('.guide-grid');(grid||guide).appendChild(box);
  }

  const oldRenderAllPortable=renderAll;
  renderAll=function(){oldRenderAllPortable();installPortableSaveUI();installSaveGuideNote()};
  installPortableSaveUI();
  installSaveGuideNote();
})();