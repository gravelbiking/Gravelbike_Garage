// Shared by the garage and the live bicycle report. Only authenticated file URLs are previewed.
(() => {
 const assetRoot=new URL('pdfjs/',document.currentScript.src);
 let active;

 document.addEventListener('click',event=>{
  const link=event.target.closest('a[data-document-preview]');
  if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const url=new URL(link.href);
  if(url.origin!==location.origin)return;
  event.preventDefault();
  openPreview(url,link);
 });
 window.addEventListener('hashchange',()=>active?.close());

 async function openPreview(url,trigger){
  active?.close();
  const dialog=document.createElement('dialog');
  dialog.className='document-preview';
  dialog.setAttribute('aria-label','Dokumentvorschau');
  dialog.innerHTML=`<div class="preview-shell">
   <header class="preview-toolbar"><strong class="preview-name"></strong>
   <a class="preview-download" download>Herunterladen</a>
   <form method="dialog"><button class="preview-close" autofocus>Schließen <span aria-hidden="true">×</span></button></form></header>
   <div class="preview-pages" hidden><button type="button" class="preview-prev">‹ Zurück</button>
   <span class="preview-page" aria-live="polite"></span><button type="button" class="preview-next">Weiter ›</button></div>
   <div class="preview-content"><p class="preview-status" role="status">Dokument wird geladen …</p></div>
  </div>`;
  const get=selector=>dialog.querySelector(selector);
  const name=trigger.dataset.documentPreview||trigger.textContent.trim()||'Dokument';
  get('.preview-name').textContent=name;
  get('.preview-download').href=url.href;
  const content=get('.preview-content'),status=get('.preview-status');
  const controller=new AbortController();
  let objectUrl,loadingTask,renderTask;
  dialog.addEventListener('close',()=>{
   controller.abort();
   renderTask?.cancel();
   loadingTask?.destroy().catch(error=>garageRuntime.log(error,'pdf-close'));
   if(objectUrl)URL.revokeObjectURL(objectUrl);
   dialog.remove();
   if(active===dialog){
    active=null;
    if(trigger.isConnected)trigger.focus({preventScroll:true});
   }
  },{once:true});
  document.body.append(dialog);
  dialog.showModal();
  active=dialog;

  try{
   const {response,payload}=await garageRuntime.request(async signal=>{const response=await fetch(url,{signal,credentials:'same-origin'});if(!response.ok)throw Error('Datei nicht verfügbar.');return {response,payload:await response.blob()};},{signal:controller.signal,timeout:60000,context:'document'});
   if(!response.ok)throw Error('Datei nicht verfügbar.');
   const mime=response.headers.get('Content-Type')?.split(';')[0].trim();
   if(mime?.startsWith('image/')){
    const blob=payload;
    if(controller.signal.aborted||!dialog.open)return;
    objectUrl=URL.createObjectURL(blob);
    const img=new Image();
    img.alt=name;
    img.width=640;
    img.height=400;
    img.src=objectUrl;
    const imageTimer=setTimeout(()=>{if(dialog.open){img.remove();garageRuntime.failure(new DOMException('Bild konnte nicht dekodiert werden.','TimeoutError'),()=>openPreview(url,trigger),status);}},30000);
    dialog.addEventListener('close',()=>clearTimeout(imageTimer),{once:true});
    img.addEventListener('load',()=>{clearTimeout(imageTimer);img.width=img.naturalWidth;img.height=img.naturalHeight;status.hidden=true;},{once:true});
    img.addEventListener('error',()=>{clearTimeout(imageTimer);img.remove();garageRuntime.failure(Error('Bild nicht lesbar.'),()=>openPreview(url,trigger),status);},{once:true});
    content.append(img);
    return;
   }
   if(mime!=='application/pdf')throw Error('Vorschau nicht verfügbar.');
   if(!payload.size)throw Error('Das Dokument ist leer.');
   const bytes=await payload.arrayBuffer();
   const pdf=await garageRuntime.request(()=>import(new URL('pdf.min.mjs',assetRoot).href),{signal:controller.signal,timeout:30000,context:'pdf-module'});
   if(controller.signal.aborted||!dialog.open)return;
   pdf.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.min.mjs',assetRoot).href;
   loadingTask=pdf.getDocument({
    data:new Uint8Array(bytes),
    cMapUrl:new URL('cmaps/',assetRoot).href,cMapPacked:true,
    standardFontDataUrl:new URL('standard_fonts/',assetRoot).href,
    wasmUrl:new URL('wasm/',assetRoot).href,iccUrl:new URL('iccs/',assetRoot).href,
    isEvalSupported:false,enableXfa:false,maxImageSize:20000000
   });
   const documentPdf=await garageRuntime.request(()=>loadingTask.promise,{signal:controller.signal,timeout:30000,context:'pdf'});
   if(!dialog.open)return;
   const canvas=document.createElement('canvas'),prev=get('.preview-prev'),next=get('.preview-next');
   const pageLabel=get('.preview-page');
   let pageNumber=1;
   canvas.setAttribute('role','img');
   content.append(canvas);
   const displayPage=async number=>{
    prev.disabled=next.disabled=true;
    try{
     const page=await garageRuntime.request(()=>documentPdf.getPage(number),{signal:controller.signal,timeout:30000,context:'pdf-page'});
     if(!dialog.open)return;
     const unit=page.getViewport({scale:1});
     const width=Math.min(Math.max(content.clientWidth-24,180),1100);
     const scale=Math.min(width/unit.width,2400/unit.height);
     const viewport=page.getViewport({scale});
     const ratio=Math.min(window.devicePixelRatio||1,2);
     canvas.width=Math.ceil(viewport.width*ratio);
     canvas.height=Math.ceil(viewport.height*ratio);
     canvas.style.width=viewport.width+'px';
     renderTask=page.render({canvas,viewport,transform:[ratio,0,0,ratio,0,0]});
     await garageRuntime.request(()=>renderTask.promise,{signal:controller.signal,timeout:30000,context:'pdf-render'});
     if(!dialog.open)return;
     pageNumber=number;
     pageLabel.textContent=`Seite ${number} von ${documentPdf.numPages}`;
     canvas.setAttribute('aria-label',name+' · '+pageLabel.textContent);
     status.hidden=true;
     canvas.hidden=false;
     content.scrollTop=0;
    }catch(error){
     if(!dialog.open)return;renderTask?.cancel();garageRuntime.log(error,'pdf-page');
     canvas.hidden=true;
     status.hidden=false;
     garageRuntime.panel(status,'Diese PDF-Seite lässt sich hier nicht anzeigen.',()=>displayPage(number));
     pageNumber=number;
    }finally{
     prev.disabled=pageNumber<=1;
     next.disabled=pageNumber>=documentPdf.numPages;
    }
   };
   prev.addEventListener('click',()=>displayPage(pageNumber-1));
   next.addEventListener('click',()=>displayPage(pageNumber+1));
   get('.preview-pages').hidden=documentPdf.numPages<2;
   await displayPage(1);
  }catch(error){
   if(dialog.open)garageRuntime.failure(error,()=>openPreview(url,trigger),status);
  }
 }
})();
