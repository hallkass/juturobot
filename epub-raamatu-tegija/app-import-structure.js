function epubTypeValue(node){return String(node?.getAttribute?.("epub:type")||node?.getAttributeNS?.("http://www.idpf.org/2007/ops","type")||"").trim()}
function epubRoleValue(node){return String(node?.getAttribute?.("role")||"").trim()}
function epubPlainFootnoteText(node){
  const clone=node.cloneNode(true);
  for(const a of [...clone.getElementsByTagName("a")]){const href=a.getAttribute("href")||"",type=epubTypeValue(a);if(a.classList?.contains("fn-back")||/backlink/.test(type)||/#fnref-/i.test(href))a.remove()}
  for(const br of [...clone.getElementsByTagName("br")])br.replaceWith("\n");
  for(const tag of ["p","div","li","blockquote"]){for(const el of [...clone.getElementsByTagName(tag)])el.append("\n\n")}
  return String(clone.textContent||"").replace(/[ \t]+\n/g,"\n").replace(/\n[ \t]+/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
}

importEpub=async function(source){
  const zr=new SimpleZipReader(new Uint8Array(await source.arrayBuffer())),containerBytes=await zr.get("META-INF/container.xml");
  if(!containerBytes)throw new Error("EPUB-ist ei leitud META-INF/container.xml faili.");
  const container=epubParseXml(containerBytes);if(!container)throw new Error("EPUB-i container.xml on vigane.");
  const rootfile=epubFirst(container,"rootfile"),opfPath=rootfile?.getAttribute("full-path")||"";if(!opfPath)throw new Error("EPUB-i sisukirjelduse (OPF) asukohta ei leitud.");
  const opfBytes=await zr.get(opfPath);if(!opfBytes)throw new Error("EPUB-i OPF-faili ei õnnestunud avada.");
  const opf=epubParseXml(opfBytes);if(!opf)throw new Error("EPUB-i OPF-fail on vigane.");
  const base=epubDir(opfPath),bookTitle=epubText(opf,"title")||source.name.replace(/\.epub$/i,""),author=epubText(opf,"creator"),language=epubText(opf,"language")||"et";
  const manifest=new Map(),manifestByPath=new Map();
  for(const item of epubElements(opf,"item")){const id=item.getAttribute("id")||"",href=item.getAttribute("href")||"",mediaType=item.getAttribute("media-type")||"",properties=item.getAttribute("properties")||"";if(!id||!href)continue;const path=epubResolve(base,href),rec={id,href,path,mediaType,properties};manifest.set(id,rec);manifestByPath.set(path,rec)}
  let coverRec=[...manifest.values()].find(x=>/(^|\s)cover-image(\s|$)/.test(x.properties));
  if(!coverRec){const meta=epubElements(opf,"meta").find(x=>(x.getAttribute("name")||"").toLowerCase()==="cover");if(meta)coverRec=manifest.get(meta.getAttribute("content")||"")}
  if(!coverRec)coverRec=[...manifest.values()].find(x=>x.mediaType.startsWith("image/")&&/cover/i.test(x.id+" "+x.href));
  let cover=null;if(coverRec){try{const bytes=await zr.get(coverRec.path);if(bytes){const name=coverRec.path.split("/").pop()||"cover.jpg";cover=makeAsset(new Blob([bytes],{type:coverRec.mediaType||mimeFromName(name)}),name,"")}}catch(e){console.warn("Kaanepilti ei õnnestunud importida",e)}}
  const spine=[],spineEl=epubFirst(opf,"spine");
  if(spineEl)for(const ref of [...spineEl.children].filter(x=>epubLocalName(x)==="itemref")){const rec=manifest.get(ref.getAttribute("idref")||"");if(rec)spine.push(rec)}
  if(!spine.length)for(const rec of manifest.values())if(/application\/(xhtml\+xml|html)|text\/html/i.test(rec.mediaType)&&!/(^|\s)nav(\s|$)/.test(rec.properties))spine.push(rec);
  const chapters=[],missing=[],pendingImagePages=[];

  async function loadChapterImage(src,xhtmlPath,caption,cache){
    src=String(src||"").trim();if(!src)return null;if(cache.has(src))return cache.get(src);let asset=null;
    try{
      if(/^data:image\//i.test(src)){const blob=epubDecodeDataImage(src);if(blob)asset=makeAsset(blob,`pilt-${Date.now()}.${extForImage({name:"",type:blob.type})}`,caption||"")}
      else if(/^https?:/i.test(src)){if(typeof fetchWebImage==="function"){asset=await fetchWebImage(src);asset.caption=caption||asset.caption||""}}
      else{let path=epubResolve(epubDir(xhtmlPath),src),bytes=await zr.get(path);if(!bytes){try{const decoded=decodeURIComponent(path);if(decoded!==path){path=decoded;bytes=await zr.get(path)}}catch(e){}}if(bytes){const rec=manifestByPath.get(path),name=path.split("/").pop()||"pilt.jpg",type=rec?.mediaType||mimeFromName(name);asset=makeAsset(new Blob([bytes],{type}),name,caption||"");asset.size="auto"}else missing.push(src)}
    }catch(e){console.warn("EPUB pildi import ebaõnnestus",src,e);missing.push(src)}if(asset)cache.set(src,asset);return asset;
  }

  async function xhtmlToChapter(rec,index){
    const bytes=await zr.get(rec.path);if(!bytes)return null;let doc=epubParseXml(bytes,"application/xhtml+xml");if(!doc)doc=new DOMParser().parseFromString(TD.decode(bytes),"text/html");
    const body=epubFirst(doc,"body")||doc.body;if(!body)return null;
    const headings=[...body.getElementsByTagName("*")].filter(x=>/^h[1-6]$/.test(epubLocalName(x))),heading=headings[0]||null,documentTitle=(doc.querySelector?.("title")?.textContent||"").trim();
    const title=(heading?.textContent||documentTitle||"").trim()||`Peatükk ${index+1}`,ch=newChapter(title,"");ch.headingLevel=heading?parseInt(epubLocalName(heading).slice(1),10)||1:1;ch.tocInclude=true;ch.footnotes=[];
    const imageCache=new Map(),footnoteDefs=new Map();
    for(const el of [...body.getElementsByTagName("*")]){const type=epubTypeValue(el).split(/\s+/),role=epubRoleValue(el);if((type.includes("footnote")||role==="doc-footnote")&&!type.includes("footnotes")){const oldId=el.getAttribute("id")||"";if(oldId)footnoteDefs.set(oldId,{id:uid("fn"),text:epubPlainFootnoteText(el)})}}
    function figureCaption(node){let p=node.parentElement;while(p&&p!==body){if(epubLocalName(p)==="figure"){const cap=[...p.getElementsByTagName("*")].find(x=>epubLocalName(x)==="figcaption");return (cap?.textContent||"").trim()}p=p.parentElement}return ""}
    async function walk(node){
      if(node===heading)return "";if(node.nodeType===Node.TEXT_NODE)return (node.nodeValue||"").replace(/\s+/g," ");if(node.nodeType!==Node.ELEMENT_NODE)return "";
      const tag=epubLocalName(node),types=epubTypeValue(node).split(/\s+/),role=epubRoleValue(node);
      if(["script","style","nav","head"].includes(tag)||types.includes("footnotes")||types.includes("footnote")||role==="doc-endnotes"||role==="doc-footnote")return "";
      if(tag==="br")return "\n";if(tag==="figcaption")return "";
      if(tag==="a"&&(types.includes("noteref")||role==="doc-noteref")){const href=node.getAttribute("href")||"",fragment=href.includes("#")?decodeURIComponent(href.split("#").pop()):"",fn=footnoteDefs.get(fragment);if(fn){if(!ch.footnotes.some(x=>x.id===fn.id))ch.footnotes.push(fn);return `[[FN:${fn.id}]]`}}
      if(tag==="img"||tag==="image"){const src=node.getAttribute("src")||node.getAttribute("href")||node.getAttribute("xlink:href")||"",caption=figureCaption(node)||node.getAttribute("alt")||"",asset=await loadChapterImage(src,rec.path,caption,imageCache);if(!asset)return "";if(!ch.images.includes(asset))ch.images.push(asset);return `\n\n[[PILT:${asset.id}]]\n\n`}
      let inner="";for(const child of node.childNodes)inner+=await walk(child);const block=["p","div","section","article","aside","header","footer","li","blockquote","pre","table","tr","h1","h2","h3","h4","h5","h6"].includes(tag);return block?`\n\n${inner.trim()}\n\n`:inner;
    }
    let editable=await walk(body);editable=editable.replace(/[ \t]+\n/g,"\n").replace(/\n[ \t]+/g,"\n").replace(/[ \t]{2,}/g," ").replace(/\n{3,}/g,"\n\n").trim();ch.body=editable;
    const textWithoutImages=editable.replace(/\[\[PILT:[^\]]+\]\]/g,"").replace(/\[\[FN:[^\]]+\]\]/g,"").replace(/\s+/g," ").trim(),hasImages=ch.images.length>0&&/\[\[PILT:[^\]]+\]\]/.test(editable),visibleHeading=!!heading&&String(heading.textContent||"").trim().length>0,imageOnly=hasImages&&!textWithoutImages&&(!visibleHeading||epubLooksLikeImagePageTitle(title,rec));
    return {ch,imageOnly};
  }

  for(let i=0;i<spine.length;i++){
    const rec=spine[i];if(!/application\/(xhtml\+xml|html)|text\/html/i.test(rec.mediaType||"application/xhtml+xml"))continue;if(i===0&&spine.length>1&&/title|cover/i.test(rec.id+" "+rec.href))continue;
    const parsed=await xhtmlToChapter(rec,i);if(!parsed)continue;const ch=parsed.ch;
    if(parsed.imageOnly){if(chapters.length)mergeImportedImagePage(chapters[chapters.length-1],ch,false);else pendingImagePages.push(ch);continue}
    if(ch&&(ch.body.trim()||ch.title.trim())){if(pendingImagePages.length){for(let p=pendingImagePages.length-1;p>=0;p--)mergeImportedImagePage(ch,pendingImagePages[p],true);pendingImagePages.length=0}chapters.push(ch)}
  }
  if(!chapters.length&&pendingImagePages.length){const ch=newChapter("Esimene peatükk","");ch.headingLevel=1;ch.footnotes=[];for(const page of pendingImagePages)mergeImportedImagePage(ch,page,false);chapters.push(ch)}
  if(!chapters.length){const ch=newChapter("Esimene peatükk","");ch.headingLevel=1;ch.footnotes=[];chapters.push(ch)}
  return {bookTitle,author,language,cover,chapters,missing,importedFromEpub:true};
};
