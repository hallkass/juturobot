"use strict";

const TE = new TextEncoder();
const TD = new TextDecoder("utf-8");

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n=0; n<256; n++) {
    let c=n;
    for (let k=0;k<8;k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n]=c>>>0;
  }
  return t;
})();
function crc32(bytes){let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++) c=CRC_TABLE[(c^bytes[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
function u16(n){return [n&255,(n>>>8)&255]}
function u32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]}
function readU16(d,o){return d[o]|(d[o+1]<<8)}
function readU32(d,o){return (d[o]|(d[o+1]<<8)|(d[o+2]<<16)|(d[o+3]<<24))>>>0}
function concatBytes(parts){let len=0;for(const p of parts)len+=p.length;const out=new Uint8Array(len);let off=0;for(const p of parts){out.set(p,off);off+=p.length}return out}
function dosDateTime(date=new Date()){
  let year=Math.max(1980,date.getFullYear());
  const time=((date.getHours()&31)<<11)|((date.getMinutes()&63)<<5)|((Math.floor(date.getSeconds()/2))&31);
  const d=(((year-1980)&127)<<9)|(((date.getMonth()+1)&15)<<5)|(date.getDate()&31);
  return {time,date:d};
}
class SimpleZipWriter{
  constructor(){this.entries=[]}
  add(name,data){const bytes=typeof data==="string"?TE.encode(data):(data instanceof Uint8Array?data:new Uint8Array(data));this.entries.push({name,data:bytes})}
  build(){
    const localParts=[],centralParts=[];let offset=0;const dt=dosDateTime();
    for(const e of this.entries){
      const name=TE.encode(e.name),data=e.data,crc=crc32(data),flags=0x0800,method=0;
      const local=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(flags),...u16(method),...u16(dt.time),...u16(dt.date),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...name]);
      localParts.push(local,data);
      const central=new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(flags),...u16(method),...u16(dt.time),...u16(dt.date),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name]);
      centralParts.push(central);offset+=local.length+data.length;
    }
    const centralStart=offset;let centralSize=0;for(const p of centralParts)centralSize+=p.length;
    const end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(this.entries.length),...u16(this.entries.length),...u32(centralSize),...u32(centralStart),...u16(0)]);
    return concatBytes([...localParts,...centralParts,end]);
  }
}
class SimpleZipReader{
  constructor(bytes){this.bytes=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);this.entries=new Map();this.parse()}
  parse(){
    const d=this.bytes;let eocd=-1;const min=Math.max(0,d.length-65557);
    for(let i=d.length-22;i>=min;i--){if(readU32(d,i)===0x06054b50){eocd=i;break}}
    if(eocd<0)throw new Error("ZIP-faili lõppu ei leitud.");
    const count=readU16(d,eocd+10),centralOffset=readU32(d,eocd+16);let p=centralOffset;
    for(let n=0;n<count;n++){
      if(readU32(d,p)!==0x02014b50)throw new Error("ZIP keskregister on vigane.");
      const flags=readU16(d,p+8),method=readU16(d,p+10),compSize=readU32(d,p+20),size=readU32(d,p+24),nameLen=readU16(d,p+28),extraLen=readU16(d,p+30),commentLen=readU16(d,p+32),localOffset=readU32(d,p+42);
      const name=TD.decode(d.slice(p+46,p+46+nameLen));this.entries.set(name,{name,flags,method,compSize,size,localOffset});p+=46+nameLen+extraLen+commentLen;
    }
  }
  async get(name){
    const e=this.entries.get(name);if(!e)return null;const d=this.bytes,p=e.localOffset;
    if(readU32(d,p)!==0x04034b50)throw new Error("ZIP kohaliku kirje päis on vigane.");
    const nameLen=readU16(d,p+26),extraLen=readU16(d,p+28),start=p+30+nameLen+extraLen,comp=d.slice(start,start+e.compSize);
    if(e.method===0)return comp;
    if(e.method===8){
      if(!("DecompressionStream" in window))throw new Error("See brauser ei toeta DOCX-i lahtipakkimist.");
      const ds=new DecompressionStream("deflate-raw");
      return new Uint8Array(await new Response(new Blob([comp]).stream().pipeThrough(ds)).arrayBuffer());
    }
    throw new Error("DOCX ZIP-kompressiooni meetod pole toetatud: "+e.method);
  }
}

const state={cover:null,chapters:[]};
let chapterSeq=1,imageSeq=1;
const $=s=>document.querySelector(s);
const chaptersEl=$("#chapters"),statusImport=$("#importStatus"),statusExport=$("#exportStatus");
function uid(prefix){return prefix+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function xmlEsc(s){return esc(s)}
function safeFileBase(s){const x=String(s||"raamat").trim().replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g," ").replace(/\.+$/,'');return x||"raamat"}
function extFromName(name){const m=String(name||"").toLowerCase().match(/\.([a-z0-9]+)$/);return m?m[1]:""}
function mimeFromName(name){const e=extFromName(name);return ({jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",gif:"image/gif",webp:"image/webp",svg:"image/svg+xml",bmp:"image/bmp"}[e]||"application/octet-stream")}
function extForImage(asset){const byName=extFromName(asset.name);if(byName)return byName==="jpeg"?"jpg":byName;return ({"image/jpeg":"jpg","image/png":"png","image/gif":"gif","image/webp":"webp","image/svg+xml":"svg","image/bmp":"bmp"}[asset.type]||"bin")}
function showStatus(el,msg,type=""){el.textContent=msg;el.className="status show "+type}
function clearStatus(el){el.textContent="";el.className="status"}
function makeAsset(blob,name,caption=""){const type=blob.type||mimeFromName(name),fixedBlob=blob.type?blob:new Blob([blob],{type});return {id:uid("img"),name:name||("pilt-"+(imageSeq++)),type,url:URL.createObjectURL(fixedBlob),blob:fixedBlob,caption}}
function revokeAsset(a){try{if(a&&a.url)URL.revokeObjectURL(a.url)}catch(e){}}
function newChapter(title="",body=""){return {id:uid("ch"),title:title||("Peatükk "+chapterSeq++),body,images:[]}}
function ensureChapter(){if(!state.chapters.length)state.chapters.push(newChapter("Peatükk 1",""));return state.chapters[state.chapters.length-1]}
function setCover(asset){if(state.cover)revokeAsset(state.cover);state.cover=asset;renderCover()}
function renderCover(){const box=$("#coverPreview");box.innerHTML="";if(state.cover){const img=document.createElement("img");img.src=state.cover.url;img.alt="Kaanepildi eelvaade";box.appendChild(img)}else box.textContent="Kaanepilt puudub"}
function autoFileName(){const field=$("#fileName");if(!field.dataset.manual){const t=$("#bookTitle").value.trim();field.value=safeFileBase(t||"raamat")+".epub"}}
