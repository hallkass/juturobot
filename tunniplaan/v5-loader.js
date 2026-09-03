Promise.all([
  fetch('v5.js').then(r=>{if(!r.ok)throw new Error('v5.js laadimine ebaõnnestus');return r.text()}),
  fetch('calendar-guide-patch.js').then(r=>{if(!r.ok)throw new Error('kalendrilisa laadimine ebaõnnestus');return r.text()}),
  fetch('portable-save-patch.js').then(r=>{if(!r.ok)throw new Error('andmefaili lisa laadimine ebaõnnestus');return r.text()})
])
  .then(([baseSrc,calendarSrc,portableSrc])=>{
    baseSrc=baseSrc.replace(
      "d.className='lesson'+(l.locked?' locked':'')+(hard.length?' hard':(!hard.length&&soft.length?' soft':'')+(part?' part':'');",
      "d.className='lesson'+(l.locked?' locked':'')+(hard.length?' hard':(!hard.length&&soft.length?' soft':''))+(part?' part':'');"
    );
    // Kõik lisad käivitatakse ühe eval'i sees, et v5.js leksikaalsed muutujad
    // (`state`, `renderAll`, `STORAGE` jne) oleksid lisadele samas skoobis nähtavad.
    (0,eval)(baseSrc+'\n\n'+calendarSrc+'\n\n'+portableSrc);
  })
  .catch(err=>{
    console.error(err);
    const box=document.createElement('div');
    box.style.cssText='position:fixed;inset:auto 20px 20px 20px;padding:14px;background:#fee4e2;color:#7a271a;border:1px solid #fda29b;border-radius:10px;z-index:9999;font:13px system-ui';
    box.textContent='Tunniplaani prototüübi käivitamisel tekkis viga: '+err.message;
    document.body.appendChild(box);
  });