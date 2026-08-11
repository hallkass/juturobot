/* =========================================================
   Olemasoleva EPUB-i import ja edasi toimetamine
   ========================================================= */

function epubLocalName(node){return (node?.localName||String(node?.nodeName||"").split(":").pop()).toLowerCase()}
function epubElements(root,name){return [...root.getElementsByTagName("*")].filter(n=>epubLocalName(n)===name.toLowerCase())}
function epubFirst(root,name){return epubElements(root,name)[0]||null}
function epubDir(path){const p=String(path||"").split("/");p.pop();return p.join("/")}
function epubResolve(baseDir,target){
  target=String(target||"").split("#")[0].split("?")[0];
  if(!target)return "";
  const parts=(baseDir+"/"+target).split("/"),out=[];
  for(let part of parts){
    if(!part||part===".")continue;
    if(part==="..")out.pop();else out.push(part);
  }
  return out.join("/");
}
function epubText(root,name){const n=epubFirst(root,name);return n?(n.textContent||"").trim():""}
function epubParseXml(bytes,type="application/xml"){
  const doc=new DOMParser().parseFromString(TD.decode(bytes),type);
  if(doc.querySelector("parsererror"))return null;
  return doc;
}
function epubDecodeDataImage(src){
  const m=String(src||"").match(/^data:(image\/[^;,]+)(;base64)?,(.*)$/i);
  if(!m)return null;
  const type=m[1].toLowerCase();
  let bytes;
  if(m[2]){
    const bin=atob(m[3]);bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  }else bytes=TE.encode(decodeURIComponent(m[3]));
  return new Blob([bytes],{type});
}

async function importEpub(source){
  const zr=new SimpleZipReader(new Uint8Array(await source.arrayBuffer()));
  const containerBytes=await zr.get("META-INF/container.xml");
  if(!containerBytes)throw new Error("EPUB-ist ei leitud META-INF/container.xml faili.");
  const container=epubParseXml(containerBytes);
  if(!container)throw new Error("EPUB-i container.xml on vigane.");
  const rootfile=epubFirst(container,"rootfile");
  const opfPath=rootfile?.getAttribute("full-path")||"";
  if(!opfPath)throw new Error("EPUB-i sisukirjelduse (OPF) asukohta ei leitud.");
  const opfBytes=await zr.get(opfPath);
  if(!opfBytes)throw new Error("EPUB-i OPF-faili ei õnnestunud avada.");
  const opf=epubParseXml(opfBytes);
  if(!opf)throw new Error("EPUB-i OPF-fail on vigane.");
  const base=epubDir(opfPath);

  const bookTitle=epubText(opf,"title")||source.name.replace(/\.epub$/i,"");
  const author=epubText(opf,"creator");
  const language=epubText(opf,"language")||"et";

  const manifest=new Map(), manifestByPath=new Map();
  for(const item of epubElements(opf,"item")){
    const id=item.getAttribute("id")||"",href=item.getAttribute("href")||"",mediaType=item.getAttribute("media-type")||"",properties=item.getAttribute("properties")||"";
    if(!id||!href)continue;
    const path=epubResolve(base,href);
    const rec={id,href,path,mediaType,properties};manifest.set(id,rec);manifestByPath.set(path,rec);
  }

  let coverRec=[...manifest.values()].find(x=>/(^|\s)cover-image(\s|$)/.test(x.properties));
  if(!coverRec){
    const meta=epubElements(opf,"meta").find(x=>(x.getAttribute("name")||"").toLowerCase()==="cover");
    if(meta)coverRec=manifest.get(meta.getAttribute("content")||"");
  }
  if(!coverRec){
    coverRec=[...manifest.values()].find(x=>x.mediaType.startsWith("image/")&&/cover/i.test(x.id+" "+x.href));
  }
  let cover=null;
  if(coverRec){
    try{
      const bytes=await zr.get(coverRec.path);
      if(bytes){
        const name=coverRec.path.split("/").pop()||"cover.jpg";
        cover=makeAsset(new Blob([bytes],{type:coverRec.mediaType||mimeFromName(name)}),name,"");
      }
    }catch(e){console.warn("Kaanepilti ei õnnestunud importida",e)}
  }

  const spine=[];
  const spineEl=epubFirst(opf,"spine");
  if(spineEl){
    for(const ref of [...spineEl.children].filter(x=>epubLocalName(x)==="itemref")){
      const rec=manifest.get(ref.getAttribute("idref")||"");
      if(rec)spine.push(rec);
    }
  }
  if(!spine.length){
    for(const rec of manifest.values())if(/application\/(xhtml\+xml|html)|text\/html/i.test(rec.mediaType)&&!/(^|\s)nav(\s|$)/.test(rec.properties))spine.push(rec);
  }

  const chapters=[];
  const missing=[];

  async function loadChapterImage(src,xhtmlPath,caption,cache){
    src=String(src||"").trim();if(!src)return null;
    if(cache.has(src))return cache.get(src);
    let asset=null;
    try{
      if(/^data:image\//i.test(src)){
        const blob=epubDecodeDataImage(src);
        if(blob)asset=makeAsset(blob,`pilt-${Date.now()}.${extForImage({name:"",type:blob.type})}`,caption||"");
      }else if(/^https?:/i.test(src)){
        if(typeof fetchWebImage==="function"){
          asset=await fetchWebImage(src);asset.caption=caption||asset.caption||"";
        }
      }else{
        let path=epubResolve(epubDir(xhtmlPath),src);
        let bytes=await zr.get(path);
        if(!bytes){
          try{const decoded=decodeURIComponent(path);if(decoded!==path){path=decoded;bytes=await zr.get(path)}}catch(e){}
        }
        if(bytes){
          const rec=manifestByPath.get(path),name=path.split("/").pop()||"pilt.jpg",type=rec?.mediaType||mimeFromName(name);
          asset=makeAsset(new Blob([bytes],{type}),name,caption||"");
        }else missing.push(src);
      }
    }catch(e){console.warn("EPUB pildi import ebaõnnestus",src,e);missing.push(src)}
    if(asset)cache.set(src,asset);
    return asset;
  }

  async function xhtmlToChapter(rec,index){
    const bytes=await zr.get(rec.path);if(!bytes)return null;
    let doc=epubParseXml(bytes,"application/xhtml+xml");
    if(!doc)doc=new DOMParser().parseFromString(TD.decode(bytes),"text/html");
    const body=epubFirst(doc,"body")||doc.body;if(!body)return null;
    const headings=[...body.getElementsByTagName("*")].filter(x=>/^h[1-3]$/.test(epubLocalName(x)));
    const heading=headings[0]||null;
    const title=(heading?.textContent||doc.querySelector?.("title")?.textContent||"").trim()||`Peatükk ${index+1}`;
    const ch=newChapter(title,"");
    const imageCache=new Map();

    function figureCaption(node){
      let p=node.parentElement;
      while(p&&p!==body){
        if(epubLocalName(p)==="figure"){
          const cap=[...p.getElementsByTagName("*")].find(x=>epubLocalName(x)==="figcaption");
          return (cap?.textContent||"").trim();
        }
        p=p.parentElement;
      }
      return "";
    }

    async function walk(node){
      if(node===heading)return "";
      if(node.nodeType===Node.TEXT_NODE)return (node.nodeValue||"").replace(/\s+/g," ");
      if(node.nodeType!==Node.ELEMENT_NODE)return "";
      const tag=epubLocalName(node);
      if(["script","style","nav","head"].includes(tag))return "";
      if(tag==="br")return "\n";
      if(tag==="figcaption")return "";
      if(tag==="img"||tag==="image"){
        const src=node.getAttribute("src")||node.getAttribute("href")||node.getAttribute("xlink:href")||"";
        const caption=figureCaption(node)||node.getAttribute("alt")||"";
        const asset=await loadChapterImage(src,rec.path,caption,imageCache);
        if(!asset)return "";
        if(!ch.images.includes(asset))ch.images.push(asset);
        return `\n\n[[PILT:${asset.id}]]\n\n`;
      }
      let inner="";
      for(const child of node.childNodes)inner+=await walk(child);
      const block=["p","div","section","article","aside","header","footer","li","blockquote","pre","table","tr","h1","h2","h3","h4","h5","h6"].includes(tag);
      return block?`\n\n${inner.trim()}\n\n`:inner;
    }

    let editable=await walk(body);
    editable=editable.replace(/[ \t]+\n/g,"\n").replace(/\n[ \t]+/g,"\n").replace(/[ \t]{2,}/g," ").replace(/\n{3,}/g,"\n\n").trim();
    ch.body=editable;
    return ch;
  }

  for(let i=0;i<spine.length;i++){
    const rec=spine[i];
    if(!/application\/(xhtml\+xml|html)|text\/html/i.test(rec.mediaType||"application/xhtml+xml"))continue;
    // Meie enda genereeritud EPUB-is on esimene spine'i kirje tiitelleht.
    if(i===0&&spine.length>1&&/title|cover/i.test(rec.id+" "+rec.href))continue;
    const ch=await xhtmlToChapter(rec,i);
    if(ch&&(ch.body.trim()||ch.title.trim()))chapters.push(ch);
  }

  if(!chapters.length)chapters.push(newChapter("Esimene peatükk",""));
  return {bookTitle,author,language,cover,chapters,missing,importedFromEpub:true};
}
