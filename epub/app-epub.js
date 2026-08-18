function renderTextXhtml(text){
  const t=String(text||"").replace(/\r\n?/g,"\n");
  if(!t.trim())return "";
  return t.split(/\n\s*\n/).map((p,i)=>`<p${i===0?' class="first"':""}>${xmlEsc(p.trim()).replace(/\n/g,"<br/>")}</p>`).join("\n");
}
function renderChapterBody(ch,imagePathById,forPreview=false){
  const re=/\[\[PILT:([^\]]+)\]\]/g;let out="",last=0,m;
  while((m=re.exec(ch.body))!==null){
    out+=forPreview?renderTextPreview(ch.body.slice(last,m.index)):renderTextXhtml(ch.body.slice(last,m.index));
    const img=ch.images.find(x=>x.id===m[1]);
    if(img){const src=forPreview?img.url:imagePathById.get(img.id);if(src){const cap=img.caption?`<figcaption>${esc(img.caption)}</figcaption>`:"";const size=["small","large"].includes(img.size)?img.size:"auto";out+=`<figure class="img-${size}"><img src="${forPreview?src:"../images/"+src}" alt="${esc(img.caption||img.name||"Pilt")}"/>${cap}</figure>`}}
    last=re.lastIndex;
  }
  out+=forPreview?renderTextPreview(ch.body.slice(last)):renderTextXhtml(ch.body.slice(last));return out;
}
function renderTextPreview(text){const t=String(text||"").replace(/\r\n?/g,"\n");if(!t.trim())return "";return t.split(/\n\s*\n/).map(p=>`<p>${esc(p.trim()).replace(/\n/g,"<br>")}</p>`).join("")}
function uuid(){if(crypto.randomUUID)return crypto.randomUUID();return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==="x"?r:(r&3|8);return v.toString(16)})}
async function blobBytes(blob){return new Uint8Array(await blob.arrayBuffer())}

async function buildEpub(){
  const title=$("#bookTitle").value.trim();if(!title)throw new Error("Lisa enne raamatu pealkiri.");if(!state.chapters.length)throw new Error("Lisa vähemalt üks peatükk.");
  const author=$("#author").value.trim(),lang=$("#language").value||"et",zip=new SimpleZipWriter();
  const includeVisibleToc=$("#includeVisibleToc")?.checked!==false;
  zip.add("mimetype","application/epub+zip");
  zip.add("META-INF/container.xml",`<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  const imagePathById=new Map(),imageManifest=[];let imageNo=1,coverInfo=null;
  if(state.cover){const ext=extForImage(state.cover),path=`cover.${ext}`;zip.add("OEBPS/images/"+path,await blobBytes(state.cover.blob));coverInfo={path,mime:state.cover.type||mimeFromName(path)}}
  for(let ci=0;ci<state.chapters.length;ci++){
    const ch=state.chapters[ci];
    for(let ii=0;ii<ch.images.length;ii++){
      const img=ch.images[ii],ext=extForImage(img),path=`c${String(ci+1).padStart(3,"0")}-img-${String(ii+1).padStart(2,"0")}.${ext}`;
      imagePathById.set(img.id,path);zip.add("OEBPS/images/"+path,await blobBytes(img.blob));imageManifest.push({id:"img"+(imageNo++),path,mime:img.type||mimeFromName(path)});
    }
  }
  const css=`@namespace epub "http://www.idpf.org/2007/ops";html,body{margin:0;padding:0}body{font-family:Georgia,"Times New Roman",serif;line-height:1.58;margin:5%;hyphens:auto}h1{text-align:center;font-size:2em;margin-top:16%}h2{font-size:1.55em;margin:1.7em 0 1em}.author{text-align:center;font-style:italic}.cover{text-align:center;margin:2em auto}.cover img{max-width:100%;max-height:90vh}p{margin:0 0 .85em;text-indent:1.2em}p.first{text-indent:0}figure{margin:1.4em auto;text-align:center;page-break-inside:avoid}figure img{max-width:100%;height:auto}figure.img-small img{width:42%;max-width:360px}figure.img-large img{width:100%;max-width:100%}figcaption{font-size:.85em;font-style:italic;margin-top:.4em;color:#555}.visible-toc{page-break-before:always;break-before:page;margin-top:8%}.visible-toc h2{text-align:center}.visible-toc-list{padding-left:1.5em}.visible-toc-list li{margin:.65em 0}.visible-toc-list a{text-decoration:none;color:inherit}.visible-toc-empty{text-indent:0;text-align:center;font-style:italic}`;
  zip.add("OEBPS/styles/book.css",css);
  const visibleTocItems=state.chapters.map((ch,i)=>({file:`chapter-${String(i+1).padStart(3,"0")}.xhtml`,title:ch.title.trim()||`Peatükk ${i+1}`,include:ch.tocInclude!==false})).filter(x=>x.include);
  const visibleToc=includeVisibleToc?`<section class="visible-toc"><h2>Sisukord</h2>${visibleTocItems.length?`<ol class="visible-toc-list">${visibleTocItems.map(c=>`<li><a href="${c.file}">${xmlEsc(c.title)}</a></li>`).join("")}</ol>`:`<p class="visible-toc-empty">Sisukorda ei ole valitud ühtegi peatükki.</p>`}</section>`:"";
  zip.add("OEBPS/text/title.xhtml",`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${xmlEsc(lang)}" lang="${xmlEsc(lang)}"><head><title>${xmlEsc(title)}</title><link rel="stylesheet" type="text/css" href="../styles/book.css"/></head><body><h1>${xmlEsc(title)}</h1>${author?`<div class="author">${xmlEsc(author)}</div>`:""}${coverInfo?`<div class="cover"><img src="../images/${coverInfo.path}" alt="Kaanepilt"/></div>`:""}${visibleToc}</body></html>`);
  const chapterItems=[];
  for(let i=0;i<state.chapters.length;i++){
    const ch=state.chapters[i],file=`chapter-${String(i+1).padStart(3,"0")}.xhtml`,chTitle=ch.title.trim()||`Peatükk ${i+1}`;
    zip.add("OEBPS/text/"+file,`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${xmlEsc(lang)}" lang="${xmlEsc(lang)}"><head><title>${xmlEsc(chTitle)}</title><link rel="stylesheet" type="text/css" href="../styles/book.css"/></head><body><h2>${xmlEsc(chTitle)}</h2>${renderChapterBody(ch,imagePathById,false)}</body></html>`);
    chapterItems.push({id:"ch"+(i+1),file,title:chTitle});
  }
  zip.add("OEBPS/nav.xhtml",`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xmlEsc(lang)}" lang="${xmlEsc(lang)}"><head><title>Sisukord</title><link rel="stylesheet" type="text/css" href="styles/book.css"/></head><body><nav epub:type="toc" id="toc"><h2>Sisukord</h2><ol>${chapterItems.map(c=>`<li><a href="text/${c.file}">${xmlEsc(c.title)}</a></li>`).join("")}</ol></nav></body></html>`);
  const bookId="urn:uuid:"+uuid();
  zip.add("OEBPS/toc.ncx",`<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${xmlEsc(bookId)}"/></head><docTitle><text>${xmlEsc(title)}</text></docTitle><navMap>${chapterItems.map((c,i)=>`<navPoint id="navPoint-${i+1}" playOrder="${i+1}"><navLabel><text>${xmlEsc(c.title)}</text></navLabel><content src="text/${c.file}"/></navPoint>`).join("")}</navMap></ncx>`);
  const modified=new Date().toISOString().replace(/\.\d{3}Z$/,"Z");
  const manifest=[`<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,`<item id="css" href="styles/book.css" media-type="text/css"/>`,`<item id="titlepage" href="text/title.xhtml" media-type="application/xhtml+xml"/>`,...(coverInfo?[`<item id="cover-image" href="images/${coverInfo.path}" media-type="${xmlEsc(coverInfo.mime)}" properties="cover-image"/>`]:[]),...chapterItems.map(c=>`<item id="${c.id}" href="text/${c.file}" media-type="application/xhtml+xml"/>`),...imageManifest.map(x=>`<item id="${x.id}" href="images/${x.path}" media-type="${xmlEsc(x.mime)}"/>`)].join("");
  const spine=[`<itemref idref="titlepage"/>`,...chapterItems.map(c=>`<itemref idref="${c.id}"/>`)].join("");
  zip.add("OEBPS/content.opf",`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${xmlEsc(lang)}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${xmlEsc(bookId)}</dc:identifier><dc:title>${xmlEsc(title)}</dc:title><dc:language>${xmlEsc(lang)}</dc:language>${author?`<dc:creator>${xmlEsc(author)}</dc:creator>`:""}<meta property="dcterms:modified">${modified}</meta><meta property="rendition:layout">reflowable</meta></metadata><manifest>${manifest}</manifest><spine toc="ncx">${spine}</spine></package>`);
  return zip.build();
}
