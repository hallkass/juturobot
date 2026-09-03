fetch('v5.js')
  .then(r=>{if(!r.ok)throw new Error('v5.js laadimine ebaõnnestus');return r.text()})
  .then(src=>{
    src=src.replace(
      "d.className='lesson'+(l.locked?' locked':'')+(hard.length?' hard':(!hard.length&&soft.length?' soft':'')+(part?' part':'');",
      "d.className='lesson'+(l.locked?' locked':'')+(hard.length?' hard':(!hard.length&&soft.length?' soft':''))+(part?' part':'');"
    );
    (0,eval)(src);
  })
  .catch(err=>{
    console.error(err);
    const box=document.createElement('div');
    box.style.cssText='position:fixed;inset:auto 20px 20px 20px;padding:14px;background:#fee4e2;color:#7a271a;border:1px solid #fda29b;border-radius:10px;z-index:9999;font:13px system-ui';
    box.textContent='Tunniplaani prototüübi käivitamisel tekkis viga: '+err.message;
    document.body.appendChild(box);
  });