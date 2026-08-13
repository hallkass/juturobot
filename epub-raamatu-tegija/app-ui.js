/* =========================================================
   Peatükkide UI
   ========================================================= */

function chapterDisplayTitle(ch,index){
  return (ch.title||"").trim()||`Peatükk ${index+1}`;
}

function renderChapterNavigator(){
  const nav=document.querySelector("#chapterNav"),select=document.querySelector("#chapterJump");
  if(!nav||!select)return;
  const previous=select.value;
  select.innerHTML='<option value="">Liigu peatükki…</option>';
  state.chapters.forEach((ch,index)=>{
    const option=document.createElement("option");
    option.value=ch.id;
    option.textContent=`${index+1}. ${chapterDisplayTitle(ch,index)}`;
    select.appendChild(option);
  });
  if(state.chapters.some(ch=>ch.id===previous))select.value=previous;
  nav.hidden=!state.chapters.length;
}

function jumpToChapter(id){
  if(!id)return;
  const card=document.querySelector(`.chapter[data-id="${id}"]`);
  if(!card)return;
  card.scrollIntoView({behavior:"smooth",block:"start"});
  const title=card.querySelector(".ch-title");
  if(title)setTimeout(()=>{try{title.focus({preventScroll:true})}catch(e){title.focus()}},300);
}

function setupChapterNavigator(){
  const select=document.querySelector("#chapterJump");
  if(!select||select.dataset.ready==="1")return;
  select.dataset.ready="1";
  select.addEventListener("change",()=>jumpToChapter(select.value));
  const move=delta=>{
    if(!state.chapters.length)return;
    let i=state.chapters.findIndex(ch=>ch.id===select.value);
    if(i<0)i=delta>0?-1:state.chapters.length;
    i=Math.max(0,Math.min(state.chapters.length-1,i+delta));
    select.value=state.chapters[i].id;
    jumpToChapter(select.value);
  };
  document.querySelector("#chapterPrev")?.addEventListener("click",()=>move(-1));
  document.querySelector("#chapterNext")?.addEventListener("click",()=>move(1));
}

function renderChapters(){
  chaptersEl.innerHTML="";
  state.chapters.forEach((ch,index)=>{
    if(typeof ch.tocInclude!=="boolean")ch.tocInclude=true;
    ch.images.forEach(img=>{if(!["auto","small","large"].includes(img.size))img.size="auto"});

    const card=document.createElement("div");
    card.className="card chapter";
    card.dataset.id=ch.id;
    card.innerHTML=`
      <div class="chapter-head">
        <div class="chapter-number">${index+1}</div>
        <div class="chapter-title">Peatükk ${index+1}</div>
        <label class="toc-chapter-toggle" title="Kas selle peatüki pealkiri kuvatakse raamatu alguse sisukorras?">
          <input type="checkbox" class="ch-toc" ${ch.tocInclude!==false?"checked":""}> <span>Sisukorras</span>
        </label>
        <div class="chapter-tools">
          <button class="btn small" type="button" data-act="up" title="Liiguta üles">↑</button>
          <button class="btn small" type="button" data-act="down" title="Liiguta alla">↓</button>
          <button class="btn small danger" type="button" data-act="delete">Kustuta</button>
        </div>
      </div>
      <label>Peatüki / loo pealkiri</label>
      <input type="text" class="ch-title" value="${esc(ch.title)}" placeholder="Peatüki pealkiri">
      <div style="height:9px"></div>
      <label>Tekst</label>
      <textarea class="ch-body" placeholder="Kirjuta peatüki tekst siia...">${esc(ch.body)}</textarea>
      <div class="row" style="margin-top:9px">
        <button class="btn small" type="button" data-act="add-image">+ Lisa pilt kursori juurde</button>
        <span class="hint">${ch.images.length?ch.images.length+" pilti":"Pilte pole"}</span>
      </div>
      <div class="image-tray"></div>
    `;
    const titleInput=card.querySelector(".ch-title");
    const bodyInput=card.querySelector(".ch-body");
    titleInput.addEventListener("input",()=>{ch.title=titleInput.value;renderChapterNavigator()});
    bodyInput.addEventListener("input",()=>ch.body=bodyInput.value);
    card.querySelector(".ch-toc").addEventListener("change",e=>ch.tocInclude=e.target.checked);

    card.addEventListener("click",async ev=>{
      const btn=ev.target.closest("[data-act]"); if(!btn)return;
      const act=btn.dataset.act;
      if(act==="delete"){
        if(confirm("Kas kustutan selle peatüki?")){
          ch.images.forEach(revokeAsset);
          state.chapters=state.chapters.filter(x=>x.id!==ch.id);
          renderChapters();
        }
      }else if(act==="up"&&index>0){
        [state.chapters[index-1],state.chapters[index]]=[state.chapters[index],state.chapters[index-1]];renderChapters();
      }else if(act==="down"&&index<state.chapters.length-1){
        [state.chapters[index+1],state.chapters[index]]=[state.chapters[index],state.chapters[index+1]];renderChapters();
      }else if(act==="add-image"){
        const posStart=bodyInput.selectionStart??ch.body.length, posEnd=bodyInput.selectionEnd??posStart;
        const inp=document.createElement("input"); inp.type="file"; inp.accept="image/*"; inp.multiple=true;
        inp.onchange=()=>{ if(inp.files?.length) addImagesAt(ch,[...inp.files],posStart,posEnd,bodyInput); };
        inp.click();
      }
    });

    const tray=card.querySelector(".image-tray");
    ch.images.forEach(img=>{
      const item=document.createElement("div"); item.className="thumb";
      item.innerHTML=`
        <img src="${img.url}" alt="">
        <div class="name" title="${esc(img.name)}">${esc(img.name)}</div>
        <label style="margin-top:6px">Pildiallkiri</label>
        <textarea class="img-caption" rows="3" placeholder="Pildiallkiri">${esc(img.caption||"")}</textarea>
        <div class="image-size-row">
          <label>Pildi suurus</label>
          <select class="img-size-select">
            <option value="auto" ${img.size==="auto"?"selected":""}>Automaatne</option>
            <option value="small" ${img.size==="small"?"selected":""}>Väike</option>
            <option value="large" ${img.size==="large"?"selected":""}>Suur</option>
          </select>
        </div>
        <div class="row" style="margin-top:7px">
          <button class="btn small" type="button" data-insert="${img.id}">Sisesta</button>
          <button class="btn small danger" type="button" data-remove="${img.id}">Eemalda</button>
        </div>
      `;
      item.querySelector(".img-caption").addEventListener("input",e=>img.caption=e.target.value);
      item.querySelector(".img-size-select").addEventListener("change",e=>img.size=e.target.value);
      item.querySelector("[data-insert]").addEventListener("click",()=>{
        const token=`[[PILT:${img.id}]]\n\n`;
        const s=bodyInput.selectionStart??ch.body.length,e=bodyInput.selectionEnd??s;
        ch.body=ch.body.slice(0,s)+token+ch.body.slice(e);
        const caret=s+token.length;
        if(typeof restoreEditorAfterRender==="function")restoreEditorAfterRender(ch,bodyInput,caret);
        else{
          renderChapters();
          setTimeout(()=>{
            const fresh=document.querySelector(`.chapter[data-id="${ch.id}"] .ch-body`);
            if(fresh){fresh.focus();fresh.selectionStart=fresh.selectionEnd=caret}
          },0);
        }
      });
      item.querySelector("[data-remove]").addEventListener("click",()=>{
        const token=`[[PILT:${img.id}]]`;
        ch.body=ch.body.split(token).join("");
        ch.images=ch.images.filter(x=>x.id!==img.id); revokeAsset(img); renderChapters();
      });
      tray.appendChild(item);
    });
    chaptersEl.appendChild(card);
  });
  setupChapterNavigator();
  renderChapterNavigator();
}

function addImagesAt(ch,files,start,end,oldTextarea=null){
  let insert="";
  for(const f of files){
    const a=makeAsset(f,f.name,""); a.size="auto"; ch.images.push(a);
    insert += (insert?"\n\n":"")+`[[PILT:${a.id}]]`;
  }
  insert+="\n\n";
  ch.body=ch.body.slice(0,start)+insert+ch.body.slice(end);
  const caret=start+insert.length;
  if(oldTextarea&&typeof restoreEditorAfterRender==="function")restoreEditorAfterRender(ch,oldTextarea,caret);
  else renderChapters();
}

/* =========================================================
   Märgistatud TXT parser
   ========================================================= */

function parseMarker(line){
  const m=String(line).trim().match(/^#(pealkiri|autor|keel|peatükk|peatukk|lugu|pilt|kaanepilt)\s*:?\s*(.*)$/i);
  if(!m)return null;
  let key=m[1].toLowerCase();
  if(key==="peatukk")key="peatükk";
  return {key,value:m[2].trim()};
}
function splitImageMarker(v){
  const [name,...rest]=v.split("|");
  return {name:(name||"").trim(),caption:rest.join("|").trim()};
}
function fileMap(files){
  const m=new Map();
  for(const f of files)m.set(f.name.toLowerCase(),f);
  return m;
}

async function importTxt(source,extras){
  const text=await source.text();
  const extrasMap=fileMap(extras);
  const lines=text.replace(/\r\n?/g,"\n").split("\n");
  let chapters=[], current=null, cover=null, bookTitle="", author="", language="";
  const missing=[];
  const ensure=()=>{if(!current){current=newChapter("Sissejuhatus","");chapters.push(current)}return current};
  for(const line of lines){
    const mk=parseMarker(line);
    if(mk){
      if(mk.key==="pealkiri"){bookTitle=mk.value;continue}
      if(mk.key==="autor"){author=mk.value;continue}
      if(mk.key==="keel"){language=mk.value;continue}
      if(mk.key==="peatükk"||mk.key==="lugu"){current=newChapter(mk.value||("Peatükk "+(chapters.length+1)),"");chapters.push(current);continue}
      if(mk.key==="kaanepilt"){
        const info=splitImageMarker(mk.value), f=extrasMap.get(info.name.toLowerCase());
        if(f) cover=makeAsset(f,f.name,""); else if(info.name) missing.push(info.name);
        continue;
      }
      if(mk.key==="pilt"){
        const info=splitImageMarker(mk.value), f=extrasMap.get(info.name.toLowerCase()), ch=ensure();
        if(f){
          const a=makeAsset(f,f.name,info.caption);a.size="auto";ch.images.push(a);
          ch.body+=(ch.body?"\n\n":"")+`[[PILT:${a.id}]]`;
        }else{
          ch.body+=(ch.body?"\n\n":"")+`[PUUDUV PILT: ${info.name}${info.caption?" — "+info.caption:""}]`;
          if(info.name)missing.push(info.name);
        }
        continue;
      }
    }
    if(!current && !line.trim()) continue;
    const ch=ensure();
    ch.body+=(ch.body?"\n":"")+line;
  }
  return {bookTitle,author,language,cover,chapters,missing};
}
