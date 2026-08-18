/* =========================================================
   DOCX parser (ZIP + document.xml + relationships)
   ========================================================= */

function normalizeZipPath(base,target){
  const stack=(base+"/"+target).split("/");
  const out=[];
  for(const s of stack){
    if(!s||s===".")continue;
    if(s==="..")out.pop();else out.push(s);
  }
  return out.join("/");
}
function nodeLocalName(n){return n.localName||String(n.nodeName||"").split(":").pop()}
function descendantText(node){let s="";for(const el of node.getElementsByTagName("*"))if(nodeLocalName(el)==="t")s+=el.textContent||"";return s}
function collectParagraphParts(p){
  const out=[];
  function walk(n){
    if(n.nodeType===3)return;
    const ln=nodeLocalName(n);
    if(ln==="t"){out.push({type:"text",text:n.textContent||""});return}
    if(ln==="tab"){out.push({type:"text",text:"\t"});return}
    if(ln==="br"||ln==="cr"){out.push({type:"text",text:"\n"});return}
    if(ln==="blip"){
      const rid=n.getAttribute("r:embed")||n.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","embed")||n.getAttribute("embed");
      if(rid)out.push({type:"image",rid});return;
    }
    for(const c of n.childNodes)walk(c);
  }
  walk(p);return out;
}
async function importDocx(source,extras){
  const zr=new SimpleZipReader(new Uint8Array(await source.arrayBuffer()));
  const docBytes=await zr.get("word/document.xml");
  if(!docBytes)throw new Error("DOCX-ist ei leitud word/document.xml faili.");
  let relMap=new Map();
  const relBytes=await zr.get("word/_rels/document.xml.rels");
  if(relBytes){
    const relXml=new DOMParser().parseFromString(TD.decode(relBytes),"application/xml");
    for(const r of relXml.getElementsByTagName("*")){
      if(nodeLocalName(r)==="Relationship"){
        const id=r.getAttribute("Id"),target=r.getAttribute("Target");
        if(id&&target)relMap.set(id,normalizeZipPath("word",target));
      }
    }
  }
  const xml=new DOMParser().parseFromString(TD.decode(docBytes),"application/xml");
  if(xml.querySelector("parsererror"))throw new Error("DOCX-i XML-i ei õnnestunud lugeda.");
  const body=[...xml.getElementsByTagName("*")].find(n=>nodeLocalName(n)==="body");
  if(!body)throw new Error("DOCX-i dokumendikeha ei leitud.");
  const extrasMap=fileMap(extras);
  let chapters=[],current=null,bookTitle="",author="",language="",cover=null;
  const missing=[];
  const ensure=()=>{if(!current){current=newChapter("Sissejuhatus","");chapters.push(current)}return current};
  async function addRidImage(rid,ch,caption=""){
    const path=relMap.get(rid);if(!path)return false;
    const bytes=await zr.get(path);if(!bytes)return false;
    const name=path.split("/").pop()||("pilt-"+imageSeq+".png");
    const blob=new Blob([bytes],{type:mimeFromName(name)});
    const a=makeAsset(blob,name,caption);ch.images.push(a);ch.body+=(ch.body?"\n\n":"")+`[[PILT:${a.id}]]`;return true;
  }
  for(const child of body.children){
    const ln=nodeLocalName(child);
    if(ln==="p"){
      const parts=collectParagraphParts(child),text=parts.filter(x=>x.type==="text").map(x=>x.text).join(""),mk=parseMarker(text),imageParts=parts.filter(x=>x.type==="image");
      if(mk){
        if(mk.key==="pealkiri"){bookTitle=mk.value;continue}
        if(mk.key==="autor"){author=mk.value;continue}
        if(mk.key==="keel"){language=mk.value;continue}
        if(mk.key==="peatükk"||mk.key==="lugu"){current=newChapter(mk.value||("Peatükk "+(chapters.length+1)),"");chapters.push(current);continue}
        if(mk.key==="kaanepilt"){
          if(imageParts.length){
            const path=relMap.get(imageParts[0].rid);
            if(path){const bytes=await zr.get(path);if(bytes){const name=path.split("/").pop();cover=makeAsset(new Blob([bytes],{type:mimeFromName(name)}),name,"")}}
          }else if(mk.value){
            const info=splitImageMarker(mk.value),f=extrasMap.get(info.name.toLowerCase());
            if(f)cover=makeAsset(f,f.name,"");else missing.push(info.name);
          }
          continue;
        }
        if(mk.key==="pilt"){
          const ch=ensure();
          if(imageParts.length){for(const im of imageParts)await addRidImage(im.rid,ch,mk.value||"")}
          else if(mk.value){
            const info=splitImageMarker(mk.value),f=extrasMap.get(info.name.toLowerCase());
            if(f){const a=makeAsset(f,f.name,info.caption);ch.images.push(a);ch.body+=(ch.body?"\n\n":"")+`[[PILT:${a.id}]]`}
            else{ch.body+=(ch.body?"\n\n":"")+`[PUUDUV PILT: ${info.name}]`;missing.push(info.name)}
          }
          continue;
        }
      }
      if(!current&&!text.trim()&&!imageParts.length)continue;
      const ch=ensure();let buffer="";
      for(const part of parts){
        if(part.type==="text")buffer+=part.text;
        else if(part.type==="image"){
          if(buffer.trim()){ch.body+=(ch.body?"\n\n":"")+buffer.trim();buffer=""}
          await addRidImage(part.rid,ch,"");
        }
      }
      if(buffer.trim()||(!imageParts.length&&text===""))ch.body+=(ch.body?"\n\n":"")+buffer.trim();
    }else if(ln==="tbl"){
      const ch=ensure(),rows=[];
      for(const tr of child.getElementsByTagName("*")){
        if(nodeLocalName(tr)!=="tr")continue;
        const cells=[];for(const tc of tr.children)if(nodeLocalName(tc)==="tc")cells.push(descendantText(tc).trim());
        if(cells.length)rows.push(cells.join("\t"));
      }
      if(rows.length)ch.body+=(ch.body?"\n\n":"")+rows.join("\n");
    }
  }
  return {bookTitle,author,language,cover,chapters,missing};
}
function applyImported(result){
  if(result.bookTitle)$("#bookTitle").value=result.bookTitle;
  if(result.author)$("#author").value=result.author;
  if(result.language&&[...$("#language").options].some(o=>o.value===result.language))$("#language").value=result.language;
  if(result.cover)setCover(result.cover);
  if(result.chapters?.length){state.chapters.forEach(ch=>ch.images.forEach(revokeAsset));state.chapters=result.chapters;renderChapters()}
  autoFileName();
}
