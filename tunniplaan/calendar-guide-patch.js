(() => {
  const CAL_TYPES = {
    schoolbreak: 'Koolivaheaeg',
    publicholiday: 'Riigipüha',
    other: 'Muu töövaba päev'
  };

  function ensureCalendarState(){
    state.calendarClosures ??= [];
    return state.calendarClosures;
  }
  function isoDate(s){
    if(!s) return null;
    const d=new Date(s+'T00:00:00Z');
    return Number.isNaN(d.getTime())?null:d;
  }
  function iso(d){return d.toISOString().slice(0,10)}
  function dateInRange(date,start,end){
    const x=isoDate(date),a=isoDate(start),b=isoDate(end||start);
    return !!(x&&a&&b&&x>=a&&x<=b);
  }
  function isClosedDate(date){
    ensureCalendarState();
    return state.calendarClosures.some(x=>dateInRange(date,x.start,x.end));
  }
  function cycleCalendarDates(cycle){
    let start=isoDate(cycle?.start),end=isoDate(cycle?.end);
    if(!start) return [];
    if(!end){end=new Date(start);end.setUTCDate(end.getUTCDate()+Math.max(1,Number(cycle.weeks)||1)*7-1)}
    const out=[];
    for(let d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1)){
      const dow=d.getUTCDay();
      if(dow>=1&&dow<=5) out.push({date:iso(d),dow,closed:isClosedDate(iso(d))});
    }
    return out;
  }
  function cycleCalendarStats(cycle){
    const dates=cycleCalendarDates(cycle),weekdayCounts=[0,0,0,0,0],teachingCounts=[0,0,0,0,0];
    dates.forEach(x=>{weekdayCounts[x.dow-1]++;if(!x.closed)teachingCounts[x.dow-1]++});
    return {weekdays:dates.length,closed:dates.filter(x=>x.closed).length,teaching:dates.filter(x=>!x.closed).length,weekdayCounts,teachingCounts};
  }
  function actualRequirementHours(req){
    let total=0,known=false;
    state.cycles.forEach(c=>{
      const dates=cycleCalendarDates(c); if(!dates.length) return; known=true;
      const byDow=Object.fromEntries(DAYS.map((d,i)=>[d,dates.filter(x=>!x.closed&&x.dow===i+1).length]));
      schedule(c.id).filter(l=>l.reqId===req.id&&l.day).forEach(l=>{total+=(byDow[l.day]||0)*(l.duration||1)});
    });
    return known?total:null;
  }

  function installGuideTab(){
    document.querySelector('#page-dashboard .guide')?.remove();
    if(!document.querySelector('[data-page="guide"]')){
      const b=document.createElement('button');b.className='nav-item';b.dataset.page='guide';b.textContent='Õpetus';
      document.querySelector('.nav-foot')?.before(b);
      b.onclick=()=>showPage('guide');
    }
    if(!document.querySelector('#page-guide')){
      const page=document.createElement('section');page.className='page';page.id='page-guide';
      page.innerHTML=`
        <div class="page-head"><div><h2>Õpetus</h2><p>Soovitatud tööjärjekord tunniplaani koostamiseks.</p></div></div>
        <div class="guide-grid">
          <section class="panel card-section"><h3>1. Õppeaasta, tsüklid ja kalender</h3><p>Määra õppeaasta, tsüklite arv, kuupäevad ja pikkused. Lisa koolivaheajad, riigipühad ning muud töövabad päevad. Nendel kuupäevadel tunni tegelikku toimumist ei arvestata.</p></section>
          <section class="panel card-section"><h3>2. Klassid ja õpperühmad</h3><p>Loo klassid ja vajadusel rühmad. Mitme klassi tasemerühmadele anna ühine paralleelsusgrupi nimi, et need toimuksid samal ajal.</p></section>
          <section class="panel card-section"><h3>3. Õppekava</h3><p>Sisesta aine aastamaht ning tsüklite nädalatundide arv. Aastamahtu saab jaotada tsüklitele ning kalendri mõju võrrelda tegelike toimumistega.</p></section>
          <section class="panel card-section"><h3>4. Õpetajad</h3><p>Määra pädevused, koormuse min/soov/max ning saadavus tasemetel õppeaasta → poolaasta → tsükkel. Sama rühma sama aine tunnid hoitakse ühe õpetaja käes, kuni õpetaja käsitsi asendatakse.</p></section>
          <section class="panel card-section"><h3>5. Ruumid</h3><p>Määra ruumi tüüp ja mahutavus. Ruumide päevavaates saab ruume perioodiks blokeerida ning tunde sobivate ruumide vahel lohistada.</p></section>
          <section class="panel card-section"><h3>6. Koosta ja paranda</h3><p>Vali tsükkel ja vajuta „Koosta tunniplaan“. Lukusta head plokid, lohista ülejäänuid ning kontrolli konflikte. Paralleelrühmi liigutatakse paketina.</p></section>
          <section class="panel card-section"><h3>7. Mitmeperioodilised tunnid</h3><p>Kui rühm vajab 2–4 järjestikust perioodi, paigutatakse plokk järjest ning sama ruumi nõude korral jääb kogu plokk samasse ruumi.</p></section>
          <section class="panel card-section"><h3>8. Kalendri põhimõte</h3><p>Tsükli tunniplaan on nädalapõhine mall. Kui konkreetne esmaspäev on näiteks riigipüha või vaheaeg, jäetakse selle kuupäeva tunni toimumine vahele; teisi sama tsükli esmaspäevi see ei blokeeri.</p></section>`;
      document.querySelector('.workspace')?.appendChild(page);
    }
  }

  function installCalendarUI(){
    const page=document.querySelector('#page-year'); if(!page) return;
    if(!document.querySelector('#calendarClosuresCard')){
      const card=document.createElement('section');card.className='panel form-card';card.id='calendarClosuresCard';
      card.innerHTML=`
        <div class="section-title"><div><h3>Koolivaheajad ja töövabad päevad</h3><div class="hint">Nendele kuupäevadele tunni tegelikku toimumist ei planeerita. Vahemik võib olla üks päev või mitu päeva.</div></div><button class="soft" id="newClosureBtn">+ Lisa</button></div>
        <div class="form-grid four calendar-editor">
          <label>Tüüp<select id="closureType"><option value="schoolbreak">Koolivaheaeg</option><option value="publicholiday">Riigipüha</option><option value="other">Muu töövaba päev</option></select></label>
          <label>Nimetus<input id="closureName" placeholder="nt sügisvaheaeg"></label>
          <label>Algus<input id="closureStart" type="date"></label>
          <label>Lõpp<input id="closureEnd" type="date"></label>
        </div>
        <button class="primary" id="saveClosureBtn">Lisa kalendrisse</button>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Tüüp</th><th>Nimetus</th><th>Algus</th><th>Lõpp</th><th></th></tr></thead><tbody id="calendarClosuresBody"></tbody></table></div>
        <h3>Tsüklite tegelikud õppepäevad</h3>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Tsükkel</th><th>Argipäevi</th><th>Töövabu</th><th>Õppepäevi</th><th>E</th><th>T</th><th>K</th><th>N</th><th>R</th></tr></thead><tbody id="cycleCalendarStats"></tbody></table></div>`;
      const cycles=document.querySelector('#cyclesList');cycles?.before(card);
      document.querySelector('#saveClosureBtn').onclick=()=>{
        const start=document.querySelector('#closureStart').value,end=document.querySelector('#closureEnd').value||start;
        if(!start) return toast('Vali alguskuupäev');
        if(end<start) return toast('Lõpp ei saa olla enne algust');
        ensureCalendarState().push({id:uid('cal'),type:document.querySelector('#closureType').value,name:document.querySelector('#closureName').value||CAL_TYPES[document.querySelector('#closureType').value],start,end});
        saveState();clearCalendarEditor();renderAll();toast('Töövaba aeg lisatud');
      };
      document.querySelector('#newClosureBtn').onclick=clearCalendarEditor;
    }
  }
  function clearCalendarEditor(){
    ['#closureName','#closureStart','#closureEnd'].forEach(s=>{const e=document.querySelector(s);if(e)e.value=''});
    const t=document.querySelector('#closureType');if(t)t.value='schoolbreak';
  }
  function renderCalendarUI(){
    ensureCalendarState();installCalendarUI();
    const body=document.querySelector('#calendarClosuresBody');
    if(body){
      body.innerHTML=state.calendarClosures.slice().sort((a,b)=>a.start.localeCompare(b.start)).map(x=>`<tr><td>${CAL_TYPES[x.type]||x.type}</td><td>${x.name||''}</td><td>${x.start}</td><td>${x.end||x.start}</td><td><button class="danger" data-del-closure="${x.id}">Eemalda</button></td></tr>`).join('')||'<tr><td colspan="5" class="muted">Töövabu perioode pole veel lisatud.</td></tr>';
      document.querySelectorAll('[data-del-closure]').forEach(b=>b.onclick=()=>{state.calendarClosures=state.calendarClosures.filter(x=>x.id!==b.dataset.delClosure);saveState();renderAll();toast('Kalendrikirje eemaldatud')});
    }
    const stats=document.querySelector('#cycleCalendarStats');
    if(stats) stats.innerHTML=state.cycles.map(c=>{const s=cycleCalendarStats(c);return `<tr><td>${c.name}</td><td>${s.weekdays||'—'}</td><td class="${s.closed?'status-warn':''}">${s.closed||0}</td><td><b>${s.teaching||'—'}</b></td>${s.teachingCounts.map(n=>`<td>${n||'—'}</td>`).join('')}</tr>`}).join('');
  }

  function installDashboardCalendar(){
    const dash=document.querySelector('#page-dashboard');if(!dash)return;
    if(!document.querySelector('#calendarImpactDashboard')){
      const box=document.createElement('section');box.className='panel card-section';box.id='calendarImpactDashboard';
      const kpis=document.querySelector('#dashboardKpis');kpis?.after(box);
    }
  }
  function renderDashboardCalendar(){
    installDashboardCalendar();const box=document.querySelector('#calendarImpactDashboard');if(!box)return;
    const c=currentCycle(),s=cycleCalendarStats(c),reqRows=state.requirements.map(r=>({r,actual:actualRequirementHours(r)})).filter(x=>x.actual!==null&&x.actual!==Number(x.r.annualHours));
    box.innerHTML=`<div class="section-title"><h3>Kalender ja tegelik kontakttundide maht</h3><span class="muted">vaheajad ja töövabad päevad arvestatud</span></div>${c?.start?`<div class="calendar-kpis"><span><b>${s.teaching}</b> õppepäeva tsüklis</span><span><b>${s.closed}</b> töövaba argipäeva</span></div>`:'<div class="hint">Määra tsüklile algus- ja lõpukuupäev, et kalendri mõju saaks täpselt arvutada.</div>'}${reqRows.length?`<div class="hint">${reqRows.length} õppekava nõudel erineb kalendri järgi planeeritud tegelik kontakttundide arv sisestatud aastamahust. Seda saab tasakaalustada tsüklite nädalakoormust muutes.</div>`:'<div class="hint">Kalendri järgi arvutatavad aastamahud on hetkel kooskõlas või tsüklite kuupäevad pole veel täielikult määratud.</div>'}`;
  }

  const oldRenderAll=renderAll;
  renderAll=function(){ensureCalendarState();oldRenderAll();installGuideTab();renderCalendarUI();renderDashboardCalendar()};

  installGuideTab();
  ensureCalendarState();
  installCalendarUI();
  renderCalendarUI();
  renderDashboardCalendar();
  saveState();
})();