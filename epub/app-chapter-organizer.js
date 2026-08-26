"use strict";

let chapterOrganizerDraft=[];
let chapterOrganizerOriginal=[];
let chapterOrganizerDraggedId=null;

function organizerChapterById(id){return state.chapters.find(ch=>ch.id===id)||null}
function organizerTitle(ch,index){return (ch?.title||"").trim()||`Peatükk ${index+1}`}
function organizerLevel(ch){
  if(typeof normalizedHeadingLevel==="function")return normalizedHeadingLevel(ch);
  const n=parseInt(ch?.headingLevel,10);return n>=1&&n<=6?n:1;
}
function organizerDialog(){return document.querySelector("#chapterOrganizerDialog")}
function organizerList(){return document.querySelector("#chapterOrganizerList")}

function installChapterOrganizer(){
  const addBtn=document.querySelector("#addChapter");
  if(addBtn&&!document.querySelector("#organizeChapters")){
    const btn=document.createElement("button");
    btn.id="organizeChapters";
    btn.type="button";
    btn.className="btn organize-trigger";
    btn.textContent="Korrasta peatükke";
    btn.title="Vaata kõiki peatükke korraga ja muuda nende järjekorda";
    addBtn.insertAdjacentElement("afterend",btn);
    btn.addEventListener("click",openChapterOrganizer);
  }
  if(document.querySelector("#chapterOrganizerDialog"))return;
  const dialog=document.createElement("dialog");
  dialog.id="chapterOrganizerDialog";
  dialog.className="chapter-organizer-dialog";
  dialog.innerHTML=`
    <div class="chapter-organizer-shell">
      <div class="chapter-organizer-head">
        <div><h2>Korrasta peatükke</h2><p>Lohista ridu ☰ sangast või kasuta ↑ ja ↓ nuppe. H-tasemed on näidatud taandega; iga rida liigub eraldi.</p></div>
        <button class="btn small" id="chapterOrganizerClose" type="button" aria-label="Sulge">✕</button>
      </div>
      <div class="chapter-organizer-list" id="chapterOrganizerList" role="list" aria-label="Peatükkide järjestus"></div>
      <div class="chapter-organizer-foot">
        <button class="btn" id="chapterOrganizerReset" type="button">Taasta avamisel olnud järjestus</button>
        <span class="chapter-organizer-count" id="chapterOrganizerCount"></span>
        <button class="btn" id="chapterOrganizerCancel" type="button">Loobu</button>
        <button class="btn primary" id="chapterOrganizerApply" type="button">Rakenda uus järjestus</button>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  document.querySelector("#chapterOrganizerClose")?.addEventListener("click",closeChapterOrganizer);
  document.querySelector("#chapterOrganizerCancel")?.addEventListener("click",closeChapterOrganizer);
  document.querySelector("#chapterOrganizerReset")?.addEventListener("click",()=>{
    chapterOrganizerDraft=[...chapterOrganizerOriginal];
    renderChapterOrganizer();
  });
  document.querySelector("#chapterOrganizerApply")?.addEventListener("click",applyChapterOrganizer);
  dialog.addEventListener("click",e=>{if(e.target===dialog)closeChapterOrganizer()});
  dialog.addEventListener("cancel",e=>{e.preventDefault();closeChapterOrganizer()});
  const list=document.querySelector("#chapterOrganizerList");
  list?.addEventListener("dragover",handleOrganizerDragOver);
  list?.addEventListener("drop",e=>e.preventDefault());
}

function openChapterOrganizer(){
  const dialog=organizerDialog();if(!dialog)return;
  chapterOrganizerOriginal=state.chapters.map(ch=>ch.id);
  chapterOrganizerDraft=[...chapterOrganizerOriginal];
  renderChapterOrganizer();
  if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");
}
function closeChapterOrganizer(){
  const dialog=organizerDialog();if(!dialog)return;
  if(dialog.open&&typeof dialog.close==="function")dialog.close();else dialog.removeAttribute("open");
  chapterOrganizerDraggedId=null;
}

function renderChapterOrganizer(){
  const list=organizerList();if(!list)return;
  const oldScroll=list.scrollTop;
  list.innerHTML="";
  chapterOrganizerDraft.forEach((id,index)=>{
    const ch=organizerChapterById(id);if(!ch)return;
    const level=organizerLevel(ch);
    const row=document.createElement("div");
    row.className="chapter-organizer-row";
    row.dataset.id=id;
    row.setAttribute("role","listitem");
    row.style.setProperty("--heading-indent",String(Math.max(0,level-1)));
    row.innerHTML=`
      <span class="chapter-organizer-number">${index+1}</span>
      <span class="chapter-organizer-drag" draggable="true" title="Lohista peatükki" aria-label="Lohista peatükki">☰</span>
      <span class="chapter-organizer-heading">H${level}</span>
      <span class="chapter-organizer-title">${esc(organizerTitle(ch,index))}</span>
      <span class="chapter-organizer-arrows">
        <button class="btn small" type="button" data-organizer-move="-1" ${index===0?"disabled":""} title="Liiguta üles">↑</button>
        <button class="btn small" type="button" data-organizer-move="1" ${index===chapterOrganizerDraft.length-1?"disabled":""} title="Liiguta alla">↓</button>
      </span>`;
    const drag=row.querySelector(".chapter-organizer-drag");
    drag.addEventListener("dragstart",e=>{
      chapterOrganizerDraggedId=id;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed="move";
      try{e.dataTransfer.setData("text/plain",id)}catch(err){}
    });
    drag.addEventListener("dragend",()=>{
      row.classList.remove("dragging");
      syncOrganizerDraftFromDom();
      chapterOrganizerDraggedId=null;
      clearOrganizerDropMarks();
      updateOrganizerNumbersAndButtons();
    });
    row.querySelectorAll("[data-organizer-move]").forEach(btn=>btn.addEventListener("click",()=>{
      const delta=parseInt(btn.dataset.organizerMove,10)||0;
      moveOrganizerItem(id,delta);
    }));
    list.appendChild(row);
  });
  document.querySelector("#chapterOrganizerCount").textContent=`${chapterOrganizerDraft.length} osa`;
  list.scrollTop=oldScroll;
}

function moveOrganizerItem(id,delta){
  const index=chapterOrganizerDraft.indexOf(id);if(index<0)return;
  const target=index+delta;if(target<0||target>=chapterOrganizerDraft.length)return;
  [chapterOrganizerDraft[index],chapterOrganizerDraft[target]]=[chapterOrganizerDraft[target],chapterOrganizerDraft[index]];
  renderChapterOrganizer();
  const list=organizerList(),row=list?.querySelector(`[data-id="${CSS.escape(id)}"]`);
  row?.scrollIntoView({block:"nearest"});
}

function handleOrganizerDragOver(e){
  e.preventDefault();
  if(!chapterOrganizerDraggedId)return;
  const list=organizerList();if(!list)return;
  e.dataTransfer.dropEffect="move";
  const dragging=list.querySelector(`.chapter-organizer-row[data-id="${CSS.escape(chapterOrganizerDraggedId)}"]`);if(!dragging)return;
  const rows=[...list.querySelectorAll(".chapter-organizer-row:not(.dragging)")];
  let before=null;
  for(const row of rows){
    const rect=row.getBoundingClientRect();
    if(e.clientY<rect.top+rect.height/2){before=row;break}
  }
  clearOrganizerDropMarks();
  if(before){list.insertBefore(dragging,before);before.classList.add("drop-before")}
  else{list.appendChild(dragging);const last=rows[rows.length-1];last?.classList.add("drop-after")}
  const rect=list.getBoundingClientRect(),edge=Math.min(70,rect.height*.18);
  if(e.clientY<rect.top+edge)list.scrollTop-=Math.max(12,Math.round((rect.top+edge-e.clientY)/3));
  else if(e.clientY>rect.bottom-edge)list.scrollTop+=Math.max(12,Math.round((e.clientY-(rect.bottom-edge))/3));
}
function clearOrganizerDropMarks(){organizerList()?.querySelectorAll(".drop-before,.drop-after").forEach(el=>el.classList.remove("drop-before","drop-after"))}
function syncOrganizerDraftFromDom(){
  const ids=[...organizerList()?.querySelectorAll(".chapter-organizer-row")||[]].map(row=>row.dataset.id).filter(Boolean);
  if(ids.length===chapterOrganizerDraft.length)chapterOrganizerDraft=ids;
}
function updateOrganizerNumbersAndButtons(){
  const rows=[...organizerList()?.querySelectorAll(".chapter-organizer-row")||[]];
  rows.forEach((row,index)=>{
    const num=row.querySelector(".chapter-organizer-number");if(num)num.textContent=String(index+1);
    const up=row.querySelector('[data-organizer-move="-1"]'),down=row.querySelector('[data-organizer-move="1"]');
    if(up)up.disabled=index===0;if(down)down.disabled=index===rows.length-1;
  });
}
function applyChapterOrganizer(){
  syncOrganizerDraftFromDom();
  const byId=new Map(state.chapters.map(ch=>[ch.id,ch]));
  const reordered=chapterOrganizerDraft.map(id=>byId.get(id)).filter(Boolean);
  if(reordered.length!==state.chapters.length){alert("Peatükkide järjestust ei saanud rakendada. Palun ava korrastamise aken uuesti.");return}
  state.chapters=reordered;
  closeChapterOrganizer();
  renderChapters();
  const firstId=state.chapters[0]?.id;
  if(firstId)document.querySelector(`.chapter[data-id="${CSS.escape(firstId)}"]`)?.scrollIntoView({block:"start"});
}

installChapterOrganizer();
