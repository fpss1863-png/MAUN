
const C={PW:480,PH:270,BW:180,BH:150,P:91,MINL:110,SM:.25,MISS:12,HOLD:12,CAR:350,EARLY:.15,WARN:.22,WARNF:6,CALF:45,NEAR:.8};
const cfg0=JSON.parse(localStorage.getItem('lanecfg')||'{}');   // ما تعلّمه الموقع من تصحيحاتك
for(const k of['WARN','EARLY','P'])if(typeof cfg0[k]=='number')C[k]=cfg0[k];
let bias=cfg0.bias||0;const saveCfg=()=>localStorage.setItem('lanecfg',JSON.stringify({WARN:C.WARN,EARLY:C.EARLY,P:C.P,bias}));
const {PW,PH,BW,BH}=C, OW=960, OH=540, K=OW/PW, VEH=new Set(['car','truck','bus','motorcycle']);
const $=id=>document.getElementById(id);
const video=$('video'),ov=$('ov'),octx=ov.getContext('2d');
const pc=document.createElement('canvas');pc.width=PW;pc.height=PH;
const pctx=pc.getContext('2d',{willReadFrequently:true});
const bevC=$('bev'),bctx=bevC.getContext('2d');
const loadScript=u=>new Promise((ok,no)=>{const s=document.createElement('script');s.src=u;s.onload=ok;s.onerror=no;document.head.appendChild(s)});

// ---------- رياضيات ----------
function solve(A){const n=A.length;
  for(let i=0;i<n;i++){let m=i;for(let r=i+1;r<n;r++)if(Math.abs(A[r][i])>Math.abs(A[m][i]))m=r;
    [A[i],A[m]]=[A[m],A[i]];
    for(let r=i+1;r<n;r++){const f=A[r][i]/A[i][i];for(let c=i;c<=n;c++)A[r][c]-=f*A[i][c]}}
  const x=new Array(n);
  for(let i=n-1;i>=0;i--){let s=A[i][n];for(let j=i+1;j<n;j++)s-=A[i][j]*x[j];x[i]=s/A[i][i]}
  return x}
function homography(s,d){const A=[];
  for(let i=0;i<4;i++){const[x,y]=s[i],[u,v]=d[i];
    A.push([x,y,1,0,0,0,-u*x,-u*y,u]);A.push([0,0,0,x,y,1,-v*x,-v*y,v])}
  return [...solve(A),1]}
function apply(H,x,y){const w=H[6]*x+H[7]*y+H[8];return[(H[0]*x+H[1]*y+H[2])/w,(H[3]*x+H[4]*y+H[5])/w]}
function polyfit(ys,xs,deg){const n=deg+1,A=Array.from({length:n},()=>new Array(n+1).fill(0));
  for(let k=0;k<ys.length;k++){const p=[];for(let i=0;i<n;i++)p.push(ys[k]**(deg-i));
    for(let i=0;i<n;i++){for(let j=0;j<n;j++)A[i][j]+=p[i]*p[j];A[i][n]+=p[i]*xs[k]}}
  const s=solve(A);return deg==2?s:[0,...s]}
const xat=(c,y)=>c[0]*y*y+c[1]*y+c[2];
const blend=(o,n)=>o?o.map((v,i)=>v*(1-C.SM)+n[i]*C.SM):n;

// ---------- حالة ----------
let src='cam',calKey='pts-cam',pts=[],Hi=null,Hf=null,yF=0,yN=0,running=false,showBev=false;
const gray=new Uint8Array(PW*PH),mask=new Uint8Array(PW*PH);
const bev=new Uint8Array(BW*BH),acc=new Float32Array(BW*BH),bin=new Uint8Array(BW*BH);
const S=[0,1].map(()=>({c:null,miss:0,rej:0,y:0,cov:1,car:0,seen:false}));
let laneW=BW/3,calib=[],base=null,bad=0,lastOff=null,lastBoth=-999,flash=0,fn=0,lastBeep=0,actx=null,wasLost=false;
let model=null,modelP=null,dets=[],detBusy=false,limit=null,limitT=0,ocrBusy=false,tess=null,reads=[],spd=null,gpsId=null;

let auto=true,earlyN=0,devPrev=0,alertOn=false,okRun=0,lastSpeak=0;
let lastProc=0,fpsN=0,fpsT=0,fpsV=0,gpsT=0,gpsAcc=99;
function spdOK(){return spd!=null&&performance.now()-gpsT<3000&&gpsAcc<=30}
let clarity=0,crossN=[0,0],_chipsH='',bevMap=new Int32Array(BW*BH);
function buildBevMap(){for(let by=0;by<BH;by++)for(let bx=0;bx<BW;bx++){const[x,y]=apply(Hi,bx,by),xi=x|0,yi=y|0;bevMap[by*BW+bx]=(xi>=0&&xi<PW&&yi>=yF&&yi<yN)?yi*PW+xi:-1}}
function resetState(){S.forEach(s=>Object.assign(s,{c:null,miss:0,rej:0,y:0,cov:1,car:0,seen:false}));
  acc.fill(0);calib=[];base=null;bad=0;lastOff=null;wasLost=false;laneW=BW/3;alertOn=false;earlyN=0;devPrev=0;okRun=0;crossN=[0,0]}
function setCalib(p){pts=p;yF=Math.min(p[0][1],p[1][1])|0;yN=Math.max(p[2][1],p[3][1])|0;
  const d=[[BW/3,0],[BW*2/3,0],[BW*2/3,BH],[BW/3,BH]];Hi=homography(d,p);Hf=homography(p,d);buildBevMap();resetState()}
function resetCalib(){pts=[];Hi=null;localStorage.removeItem(calKey);resetState();ah.fill(0);macc.fill(0);aN=0;aFr=0;
  if(auto){$('msg').textContent='معايرة تلقائية: سر على الطريق وخلّ الخطوط ظاهرة…';return}
  $('msg').textContent='اضغط 4 نقاط على خطي مسارك: 1 بعيد-يسار، 2 بعيد-يمين، 3 قريب-يمين، 4 قريب-يسار (فوق الكبوت).'}
ov.addEventListener('pointerdown',e=>{if(Hi||!running||auto)return;
  const r=ov.getBoundingClientRect();pts.push([(e.clientX-r.left)/r.width*PW,(e.clientY-r.top)/r.height*PH]);
  if(pts.length==4){if(pts[0][1]<pts[3][1]&&pts[1][1]<pts[2][1]){
      localStorage.setItem(calKey,JSON.stringify(pts));setCalib(pts);$('msg').textContent='تمت المعايرة.';if(src=='file')video.play()}
    else{pts=[];$('msg').textContent='الترتيب غلط: النقاط البعيدة لازم تكون أعلى. أعد المحاولة.'}}});

// ---------- كاشف السيارات (COCO-SSD) ----------
function initModel(){initML();window.Yolo&&Yolo.init();if(modelP||!ST.detect||(window.Yolo&&Yolo.sess))return;modelP=(async()=>{try{
  await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
  await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
  model=await cocoSsd.load({base:'lite_mobilenet_v2'})}catch(e){$('msg').textContent='تعذر تحميل كاشف السيارات (يحتاج نت أول مرة).'}})()}
const iou=(a,b)=>{const x=Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0])),y=Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1])),i=x*y;return i/(a[2]*a[3]+b[2]*b[3]-i)};
function runDet(){if(window.Yolo&&Yolo.active()){Yolo.run();return}if(!model||detBusy||!ST.detect)return;detBusy=true;
  model.detect(pc,12,.45).then(r=>{r=r.filter(x=>x.score>=.5);r.forEach(x=>x.t=fn);window.Assist&&Assist.onDet(r);   // نحتفظ بالمربعات القديمة 10 فريمات عشان السيارة السريعة
    dets=r.concat(dets.filter(o=>fn-o.t<10&&!r.some(n=>n.class==o.class&&iou(n.bbox,o.bbox)>.2)))}).catch(()=>{}).finally(()=>detBusy=false)}

// ---------- موديل مسارات (UFLD v1 عبر ONNX Runtime Web) ----------
const ml={sess:null,on:false,busy:false,lanes:null,pick:null,t:0,ms:0,si:0,fails:0,err:''},ML_SIZES=[[288,800],[200,800],[320,800],[320,1600]];
const mc=document.createElement('canvas'),mctx=mc.getContext('2d',{willReadFrequently:true});
const idb=()=>new Promise((ok,no)=>{const r=indexedDB.open('lane',2);r.onupgradeneeded=()=>{const d=r.result;
  if(!d.objectStoreNames.contains('m'))d.createObjectStore('m');if(!d.objectStoreNames.contains('e'))d.createObjectStore('e',{keyPath:'id',autoIncrement:true})};
  r.onsuccess=()=>ok(r.result);r.onerror=no});
const idbGet=async k=>{const d=await idb();return new Promise(ok=>{const q=d.transaction('m').objectStore('m').get(k);q.onsuccess=()=>ok(q.result)})};
const idbSet=async(k,v)=>{const d=await idb();return new Promise(ok=>{const t=d.transaction('m','readwrite');t.objectStore('m').put(v,k);t.oncomplete=ok})};
let mlInit=false,mlLastT=-1;const mlAcc=[];
function initML(){if(mlInit)return;mlInit=true;idbGet('ufld').then(b=>b&&loadML(b)).catch(()=>{})}
async function loadML(buf){try{
  if(typeof ort==='undefined')await loadScript('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort.min.js');
  ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';ort.env.wasm.numThreads=1;
  ml.sess=await ort.InferenceSession.create(buf,{executionProviders:['wasm']});ml.on=true;ml.fails=0;ml.pick=null;
  $('msg').textContent='موديل الذكاء جاهز.'}catch(e){ml.sess=null;$('msg').textContent='تعذر تحميل الموديل: '+String(e.message||e).slice(0,80)}}
function decodeUFLD(d,dims){const n=dims.length,G1=dims[n-3],R=dims[n-2],L=dims[n-1],G=G1-1,cw=799/(G-1),lanes=[];
  const anc=R==56?[...Array(56)].map((_,k)=>64+4*k):R==18?[121,131,141,151,161,171,181,191,201,211,221,231,241,251,261,271,281,287]
    :[...Array(R)].map((_,r)=>Math.round(288*(.4+.6*r/(R-1))));
  for(let l=0;l<L;l++){const pts=[];
    for(let r=0;r<R;r++){let mx=-1e9,am=0;for(let g=0;g<G1;g++){const v=d[(g*R+r)*L+l];if(v>mx){mx=v;am=g}}
      if(am==G)continue;let sm=0,e=0;for(let g=0;g<G;g++){const p=Math.exp(d[(g*R+r)*L+l]-mx);sm+=p;e+=p*(g+1)}
      pts.push([e/sm*cw*PW/800-1,PH*anc[r]/288-1])}
    lanes.push(pts.length>2?pts:null)}
  return lanes}
function mlPick(lanes){let Lp=null,Rp=null,lx=-1e9,rx=1e9;      // أقرب خطين لمركز الصورة = مسارك
  for(const p of lanes){if(!p)continue;const[,a,b]=polyfit(p.map(q=>q[1]),p.map(q=>q[0]),1),x=a*PH*C.NEAR+b;
    if(x<PW/2-8&&x>lx){lx=x;Lp=p}if(x>PW/2+8&&x<rx){rx=x;Rp=p}}
  return{L:Lp,R:Rp}}
async function runML(){if(!ml.sess||!ml.on||ml.busy)return;ml.busy=true;const t0=performance.now();
  try{const[H,W]=ML_SIZES[ml.si];mc.width=W;mc.height=H;mctx.drawImage(video,0,0,W,H);
    const px=mctx.getImageData(0,0,W,H).data,n=W*H,f=new Float32Array(3*n);
    for(let i=0;i<n;i++){f[i]=(px[i*4]/255-.485)/.229;f[n+i]=(px[i*4+1]/255-.456)/.224;f[2*n+i]=(px[i*4+2]/255-.406)/.225}
    const out=await ml.sess.run({[ml.sess.inputNames[0]]:new ort.Tensor('float32',f,[1,3,H,W])}),t=out[ml.sess.outputNames[0]];
    ml.lanes=decodeUFLD(t.data,t.dims);ml.pick=mlPick(ml.lanes);ml.t=performance.now();ml.ms=Math.round(ml.t-t0);ml.fails=0}
  catch(e){ml.err=String(e.message||e).slice(0,80);ml.si=(ml.si+1)%ML_SIZES.length;
    if(++ml.fails>=8){ml.on=false;$('msg').textContent='الموديل ما اشتغل ('+ml.err+'). رجعت للكشف التقليدي.'}}
  ml.busy=false}
const mlFresh=()=>ml.sess&&ml.on&&ml.pick&&performance.now()-ml.t<1500;
function mlLine(i){const p=ml.pick&&(i?ml.pick.R:ml.pick.L);if(!p)return null;const bx=[],by=[];
  for(const[x,y]of p){if(y<yF||y>yN)continue;const[u,v]=apply(Hf,x,y);if(v>=0&&v<=BH&&u>-BW&&u<2*BW){bx.push(u);by.push(v)}}
  if(bx.length<5)return null;const c=polyfit(by,bx,bx.length>=7?2:1);
  if(Math.abs(c[0])>3e-3||Math.abs(c[1])>.9||Math.abs(2*c[0]*BH+c[1])>.9)return null;
  return{c,cov:.5,y:0,ml:true}}
function mlCalStep(){if(!ml.pick||ml.t===mlLastT)return;mlLastT=ml.t;
  const fit=p=>{const[,a,b]=polyfit(p.map(q=>q[1]),p.map(q=>q[0]),1);return[a,b]};
  if(ml.pick.L&&ml.pick.R)mlAcc.push([...fit(ml.pick.L),...fit(ml.pick.R),Math.max(...ml.pick.L.map(q=>q[1]),...ml.pick.R.map(q=>q[1]))]);
  if(mlAcc.length<6)return;
  const med=k=>mlAcc.map(r=>r[k]).sort((p,q)=>p-q)[mlAcc.length>>1];
  const[aL,bL,aR,bR,low]=[0,1,2,3,4].map(med);mlAcc.length=0;
  const vpy=(bR-bL)/(aL-aR),yn=Math.min(low,PH*C.NEAR),yf=vpy+.5*(yn-vpy),lx=y=>aL*y+bL,rx=y=>aR*y+bR;
  const p=[[lx(yf),yf],[rx(yf),yf],[rx(yn),yn],[lx(yn),yn]];
  if(!(aR>aL)||vpy<PH*.15||vpy>yn-30||rx(yn)-lx(yn)<PW*.22||rx(yn)-lx(yn)>PW*.9||p.some(([x,y])=>x<0||x>PW||y<0||y>PH))return;
  localStorage.setItem(calKey,JSON.stringify(p));setCalib(p);$('msg').textContent='تمت المعايرة بالذكاء الاصطناعي.'}

// ---------- لوحات السرعة ----------
const cropC=document.createElement('canvas');cropC.width=cropC.height=96;
const cx=cropC.getContext('2d',{willReadFrequently:true});
function findSign(d){ // دائرة حمراء بوسط فاتح في الجزء العلوي-الأيمن
  const cs=8,gw=Math.ceil(PW/cs),gh=Math.floor(PH*.62/cs),g=new Uint8Array(gw*gh),isR=(i)=>d[i]>120&&d[i]>d[i+1]*2.2&&d[i]>d[i+2]*2.2;
  for(let y=0;y<gh*cs;y+=2)for(let x=PW*.3|0;x<PW;x+=2)if(isR((y*PW+x)*4))g[(y/cs|0)*gw+(x/cs|0)]++;
  const seen=new Uint8Array(g.length);
  for(let s0=0;s0<g.length;s0++){if(seen[s0]||g[s0]<3)continue;
    const q=[s0];seen[s0]=1;let x0=1e9,y0=1e9,x1=-1,y1=-1;
    while(q.length){const c=q.pop(),cxx=c%gw,cyy=(c/gw)|0;x0=Math.min(x0,cxx);x1=Math.max(x1,cxx);y0=Math.min(y0,cyy);y1=Math.max(y1,cyy);
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=cxx+dx,ny=cyy+dy;
        if(nx>=0&&ny>=0&&nx<gw&&ny<gh&&!seen[ny*gw+nx]&&g[ny*gw+nx]>=3){seen[ny*gw+nx]=1;q.push(ny*gw+nx)}}}
    const bx=x0*cs,by=y0*cs,bw=(x1-x0+1)*cs,bh=(y1-y0+1)*cs;
    if(bw<14||bw>120||bw/bh<.8||bw/bh>1.25)continue;
    let red=0,wh=0,n=0;for(let y=by+bh*.3|0;y<by+bh*.7;y+=2)for(let x=bx+bw*.3|0;x<bx+bw*.7;x+=2){const i=(y*PW+x)*4;n++;
      if(isR(i))red++;else if(d[i]>150&&d[i+1]>150&&d[i+2]>150)wh++}
    if(n&&red/n<.2&&wh/n>.35)return{x:bx,y:by,w:bw,h:bh}}
  return null}
async function ocr(b){if(ocrBusy||video.videoWidth==0)return;ocrBusy=true;
  try{if(!window.Tesseract)await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
    if(!tess){tess=await Tesseract.createWorker('eng');await tess.setParameters({tessedit_char_whitelist:'0123456789',tessedit_pageseg_mode:'7'})}
    const sx=video.videoWidth/PW,sy=video.videoHeight/PH;
    cx.drawImage(video,(b.x+b.w*.18)*sx,(b.y+b.h*.18)*sy,b.w*.64*sx,b.h*.64*sy,0,0,96,96);
    const im=cx.getImageData(0,0,96,96);for(let i=0;i<im.data.length;i+=4){const v=(im.data[i]+im.data[i+1]+im.data[i+2])/3<105?0:255;im.data[i]=im.data[i+1]=im.data[i+2]=v}
    cx.putImageData(im,0,0);
    const{data}=await tess.recognize(cropC),v=parseInt(data.text.replace(/\D/g,''));
    const t=performance.now();
    if(v>=20&&v<=140&&v%10==0){reads.push([v,t]);reads=reads.filter(r=>t-r[1]<4000);
      if(reads.filter(r=>r[0]==v).length>=2){limit=v;limitT=t}}
  }catch(e){}ocrBusy=false}

// ---------- المعالجة ----------
function makeMask(d,relax){
  mask.fill(0);const hist=new Uint32Array(256);let cnt=0;
  for(let y=yF;y<yN;y++)for(let x=0;x<PW;x++){const i=(y*PW+x)*4,g=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8;
    gray[y*PW+x]=g;if(!(x&1)){hist[g]++;cnt++}}
  const tgt=cnt*(C.P-3*relax)/100;let a=0,thr=0;for(;thr<255&&a<tgt;thr++)a+=hist[thr];
  thr=Math.max(C.MINL-15*relax,thr);const dd=22-4*relax;
  for(let y=yF;y<yN;y++){const k=2+Math.round(5*(y-yF)/Math.max(1,yN-yF));
    for(let x=k;x<PW-k;x++){const o=y*PW+x,v=gray[o],i=o*4;
      if(v>(gray[o-k]+gray[o+k])/2+dd){const yel=d[i]>140&&d[i+1]>110&&d[i+2]<(d[i]+d[i+1])*.28;
        if(v>=thr||yel)mask[o]=yel?2:1}}}
  for(const b of dets){if(!VEH.has(b.class))continue;const[x,y,w,h]=b.bbox;   // السيارات ما تدخل في الكشف
    for(let yy=Math.max(yF,(y-h*.1)|0);yy<Math.min(yN,(y+h*1.1)|0);yy++)for(let xx=Math.max(0,(x-w*.15)|0);xx<Math.min(PW,(x+w*1.15)|0);xx++)mask[yy*PW+xx]=0}}
function makeBev(){let cL=0,cR=0;
  for(let by=0;by<BH;by++){for(let bx=0;bx<BW;bx++){const o=bevMap[by*BW+bx];bev[by*BW+bx]=o<0?0:mask[o]}
    const o=by*BW;let bx=0;
    while(bx<BW){if(!bev[o+bx]){bx++;continue}const s=bx;while(bx<BW&&bev[o+bx])bx++;
      if(bx-s>BW*.12){for(let k=s;k<bx;k++)bev[o+k]=0;((s+bx)/2<BW/2)?cL+=bx-s:cR+=bx-s}}}
  for(let i=0;i<bev.length;i++){acc[i]=.65*acc[i]+.35*(bev[i]?255:0);bin[i]=acc[i]>100?1:0}
  return[cL,cR]}
function findLine(xs0,xe,prevX,relax){
  if(prevX!=null){xs0=Math.max(0,Math.round(prevX)-14);xe=Math.min(BW,Math.round(prevX)+15)}  // ما نقفز بعيد عن الخط
  if(xe-xs0<6)return null;
  const hist=new Float32Array(xe-xs0);let tot=0;
  for(let y=0;y<BH;y++)for(let x=xs0;x<xe;x++)if(bin[y*BW+x]){hist[x-xs0]++;tot++}
  if(tot<10)return null;
  let cur=xs0,best=-1;
  for(let i=0;i<hist.length;i++){let h=0;for(let j=-2;j<=2;j++)h+=hist[i+j]||0;if(h>best){best=h;cur=xs0+i}}
  const nw=10,wh=BH/nw,nmin=relax?2:4,px=[],py=[];let hits=0,yc=0,tc=0,sl=0;
  for(let i=0;i<nw;i++){const yh=BH-i*wh,yl=yh-wh;let sx=0,n=0;const tx=[],ty=[];
    const lo=Math.max(0,Math.round(cur-10)),hi=Math.min(BW,Math.round(cur+11));
    for(let y=Math.floor(yl);y<yh;y++)for(let x=lo;x<hi;x++)
      if(bin[y*BW+x]){tx.push(x);ty.push(y);sx+=x;n++;const v=bev[y*BW+x];if(v){tc++;if(v==2)yc++}}
    if(n>=nmin){const nc=Math.round(sx/n);sl=.5*sl+.5*(nc-cur);cur=nc;px.push(...tx);py.push(...ty);hits++}
    else cur=Math.round(cur+sl)}                      // النافذة تتبع ميل الخط (للمنعطفات)
  if(hits<(relax?3:4)||px.length<20)return null;
  const deg=ST.curves&&hits>=5?2:1;let c=polyfit(py,px,deg);
  for(let t=0;t<2;t++){const ky=[],kx=[];
    for(let i=0;i<px.length;i++)if(Math.abs(xat(c,py[i])-px[i])<3.5){ky.push(py[i]);kx.push(px[i])}
    if(kx.length<12)break;c=polyfit(ky,kx,deg)}
  if(Math.abs(c[0])>3e-3||Math.abs(c[1])>.9||Math.abs(2*c[0]*BH+c[1])>.9)return null;
  return{c,cov:hits/nw,y:tc>5?yc/tc:0}}
function accept(prev,nw,rej){   // القريب ثابت، والبعيد يسمح له يتغير (انحناء)
  if(!nw||!prev||rej>=8)return nw;
  const dn=Math.abs(xat(nw,BH)-xat(prev,BH)),dm=Math.abs(xat(nw,BH*.5)-xat(prev,BH*.5));
  return(dn<.06*BW&&dm<.12*BW)?nw:null}
function beep(strong,gap){const t=performance.now();gap=gap||2000;if(!actx||t-lastBeep<gap)return;lastBeep=t;
  [[strong?1500:1000,0],[strong?1000:0,.16]].forEach(([f,d])=>{if(!f)return;const o=actx.createOscillator(),g=actx.createGain();
    o.type='square';o.frequency.value=f;g.gain.value=strong?.9:.35;o.connect(g);g.connect(actx.destination);
    o.start(actx.currentTime+d);o.stop(actx.currentTime+d+.14)});
  if(strong&&navigator.vibrate)navigator.vibrate([200,80,200])}
function speak(t){const n=performance.now();if(!window.speechSynthesis||n-lastSpeak<4000)return;lastSpeak=n;
  try{const u=new SpeechSynthesisUtterance(t);u.lang='ar-SA';u.rate=1.1;speechSynthesis.speak(u)}catch(e){}}
function logEvt(type){const a=JSON.parse(localStorage.getItem('lanelog')||'[]');
  a.unshift({t:new Date().toLocaleString('ar-SA'),type});localStorage.setItem('lanelog',JSON.stringify(a.slice(0,200)))}
const req=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
const store=async m=>(await idb()).transaction('e',m).objectStore('e');
const evdb={async add(e){return req((await store('readwrite')).add(e))},async all(){return req((await store('readonly')).getAll())},
  async put(e){return req((await store('readwrite')).put(e))},
  async trim(){const s=await store('readwrite'),k=await req(s.getAllKeys());for(const x of k.slice(0,Math.max(0,k.length-300)))s.delete(x)}};
const sc=document.createElement('canvas');sc.width=320;sc.height=180;const sctx=sc.getContext('2d');let ring=[],rc=0;
const KIND={alert:'تنبيه انحراف',missed:'فاتني تنبيه',badlines:'الخطوط غلط'};
async function saveEv(kind,x){try{await evdb.add(Object.assign({t:Date.now(),kind,label:null,src,spd,limit,ml:!!mlFresh(),
  params:{WARN:C.WARN,EARLY:C.EARLY,P:C.P,bias},imgs:ring.slice(-4),sent:false},x||{}));evdb.trim()}catch(e){}}
async function showLog(){const b=$('log');let a=[];try{a=(await evdb.all()).reverse().slice(0,30)}catch(e){}
  b.innerHTML=a.length?a.map(e=>`<div class="ev">${e.imgs[e.imgs.length-1]?`<img src="${e.imgs[e.imgs.length-1]}" width="96">`:''}<span>${new Date(e.t).toLocaleString('ar-SA')} — ${KIND[e.kind]||e.kind}${e.label?(e.label=='ok'?' ✓':' ✗'):''}</span>${e.kind=='alert'?`<button data-i="${e.id}" data-l="ok">✓ صح</button><button data-i="${e.id}" data-l="bad">✗ خطأ</button>`:''}</div>`).join(''):'لا توجد أحداث بعد. التنبيهات تنحفظ هنا تلقائياً.'}
async function learn(id,label){const e=(await evdb.all()).find(x=>x.id==id);if(!e)return;e.label=label;await evdb.put(e);
  if(e.kind=='alert'&&label=='bad'){C.WARN=Math.min(.45,C.WARN*1.12);C.EARLY=Math.min(C.WARN-.05,C.EARLY*1.1);   // تنبيه خاطئ: نخفف الحساسية ونصحّح مركز المسار
    bias=Math.max(-.3,Math.min(.3,bias+.4*((e.dev||0)-bias)))}
  if(e.kind=='alert'&&label=='ok')C.WARN=Math.max(.14,C.WARN*.985);
  saveCfg();showLog();$('msg').textContent=`تعلّمت. حد الانحراف الآن ${C.WARN.toFixed(2)}`}
async function sync(){let sb=JSON.parse(localStorage.getItem('sb')||'null');
  if(!sb){const url=prompt('رابط مشروع Supabase (https://xxxx.supabase.co)'),key=url&&prompt('المفتاح anon');if(!key)return;sb={url:url.replace(/\/$/,''),key};localStorage.setItem('sb',JSON.stringify(sb))}
  let dv=localStorage.getItem('devid');if(!dv){dv=Math.random().toString(36).slice(2,10);localStorage.setItem('devid',dv)}
  const H={apikey:sb.key,Authorization:'Bearer '+sb.key};let n=0;
  try{for(const e of(await evdb.all()).filter(x=>!x.sent&&(x.label||x.kind!='alert'))){const paths=[];
      for(let i=0;i<e.imgs.length;i++){const p=`${dv}/${e.t}_${i}.jpg`,r=await fetch(`${sb.url}/storage/v1/object/snapshots/${p}`,{method:'POST',headers:{...H,'Content-Type':'image/jpeg'},body:await(await fetch(e.imgs[i])).blob()});
        if(!r.ok)throw new Error('الصور '+r.status);paths.push(p)}
      const r=await fetch(`${sb.url}/rest/v1/events`,{method:'POST',headers:{...H,'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify({device:dv,t:new Date(e.t).toISOString(),kind:e.kind,label:e.label,dev:e.dev??null,off:e.off??null,params:{...e.params,ml:e.ml,src:e.src,spd:e.spd,limit:e.limit},paths})});
      if(!r.ok)throw new Error('الجدول '+r.status);e.sent=true;await evdb.put(e);n++}
    $('msg').textContent=`تم رفع ${n} حدث. (الأحداث غير المصنّفة تنتظر تقييمك ✓/✗)`}catch(x){$('msg').textContent='فشل الرفع: '+x.message+' — راجع supabase.sql'}}
// ضبط ذاتي: نجرّب حساسية الأبيض ونبقي اللي يعطي خطوط أثبت (بدون تدخل منك)
let qN=0,qS=0,qD=0;const tune={best:null,bestP:null,dir:-2};
function tuneStep(){if(++qN<450)return;const got=qS/qN,sc2=got-.7*qD/qN;qN=qS=qD=0;if(got<.15||got>.97||wasLost)return;   // ما نلعب بالحساسية إذا الوضع ممتاز أو ما فيه خطوط
  if(tune.best==null||sc2>tune.best){tune.best=sc2;tune.bestP=C.P}else{C.P=tune.bestP;tune.dir=-tune.dir}
  C.P=Math.max(84,Math.min(96,tune.bestP+tune.dir));saveCfg()}
function setStatus(t,a){$('status').textContent=t;$('pill').className='pill '+(a?'alert':/اقتربت|سيارة|تغيير|تجاوز/.test(t)?'warn':/فقدت|عايِر|يتعلم|معايرة/.test(t)?'idle':'ok')}

let emerg=false,vw='',info='';
function step(){
  if(!ST.lanes)return stepLite();
  fn++;const d=pctx.getImageData(0,0,PW,PH).data;runDet();
  const relax=wasLost?1:0;
  makeMask(d,relax);const[cLp,cRp]=makeBev();
  const cars=[cLp>C.CAR,cRp>C.CAR],mid=BW/2;
  for(const i of[0,1]){const s=S[i];s.car=cars[i]?s.car+1:0;const frz=s.car>0&&s.car<=40;
    const r=frz?null:(mlFresh()?mlLine(i):findLine(i?mid:0,i?BW:mid,s.c?xat(s.c,BH):null,relax));
    const n=accept(s.c,r&&r.c,s.rej);s.rej=(r&&!n)?s.rej+1:0;if(r&&!n)qD++;
    if(n){s.c=blend(s.c,n);s.miss=0;s.cov=.8*s.cov+.2*r.cov;s.y=.8*s.y+.2*r.y;s.seen=true;s.ml=!!r.ml}
    else{s.seen=false;if(!frz&&++s.miss>C.MISS)s.c=null}s.frz=frz}
  const A=S[0],B=S[1];if(A.seen&&B.seen)qS++;tuneStep();clarity=clarity*.93+.07*((A.seen?.5:0)+(B.seen?.5:0));
  if(A.c&&B.c){const w0=xat(B.c,0)-xat(A.c,0),w1=xat(B.c,BH)-xat(A.c,BH),r0=BW/3;   // الخطين لازم يكوّنون مسار منطقي
    if(w1<.55*r0||w1>1.7*r0||w0<.4*r0||w0>2*r0){const dr=A.cov<B.cov?A:B;dr.c=null;dr.seen=false;dr.miss=99;qD++}}
  // تغيير مسار: إذا عبرنا خطاً (صار مركز السيارة بعده) ننقل الأدوار بدل التمسك بالمسار القديم
  const xb=B.c?xat(B.c,BH):null,xa=A.c?xat(A.c,BH):null;
  crossN[1]=(xb!=null&&xb<BW/2-4)?crossN[1]+1:0;crossN[0]=(xa!=null&&xa>BW/2+4)?crossN[0]+1:0;
  if(crossN[1]>=3||crossN[0]>=3){const toR=crossN[1]>=3,src=toR?B:A,keep={c:src.c,y:src.y,cov:src.cov,miss:src.miss,ml:src.ml,seen:src.seen};
    if(toR){Object.assign(A,keep,{rej:0});Object.assign(B,{c:null,miss:99,rej:0,seen:false})}else{Object.assign(B,keep,{rej:0});Object.assign(A,{c:null,miss:99,rej:0,seen:false})}
    crossN=[0,0];flash=60;bad=0;alertOn=false;okRun=0;lastOff=null;acc.fill(0);logEvt('تغيير مسار')}
  // فقدان كلي: نوقف ونبدأ من جديد
  const lost=!(A.c||B.c)||Math.min(A.miss,B.miss)>C.HOLD;
  if(lost){if(!wasLost){acc.fill(0);base=null;calib=[];bad=0;lastOff=null}S.forEach(s=>{s.c=null;s.rej=0});wasLost=true}
  else wasLost=false;
  if(A.seen&&B.seen){const w=B.c?xat(B.c,BH)-xat(A.c,BH):0;if(w>BW*.2&&w<BW*.5)laneW=.95*laneW+.05*w}
  let xl=A.c?xat(A.c,BH):null,xr=B.c?xat(B.c,BH):null;
  if(xl!=null&&xr==null)xr=xl+laneW;if(xr!=null&&xl==null)xl=xr-laneW;
  let text=lost?'فقدت الخطوط — أعيد البحث':'',alert=false,off=null;
  if(!lost&&xl!=null){off=((xl+xr)/2-BW/2)/(xr-xl);const both=A.seen&&B.seen;
    if(both){if(lastOff!=null&&fn-lastBoth<=10&&Math.abs(off-lastOff)>.5){flash=45;bad=0;logEvt('تغيير مسار')}
      lastOff=off;lastBoth=fn}
    text=both?'تمام':(A.seen||B.seen)?'خط واحد':'من الذاكرة'}
  if(off!=null){
    if(base==null){calib.push(off);text=`يتعلم وضعك ${calib.length}/${C.CALF}`;
      if(calib.length>=C.CALF)base=calib.slice().sort((a,b)=>a-b)[calib.length>>1]}
    else{const dev=off-base-bias,vel=dev-devPrev,a=Math.abs(dev),dir=dev<0?'اليمين':'اليسار';devPrev=dev;
      $('gmark').style.left=(50-Math.max(-1,Math.min(1,dev/.5))*45)+'%';
      if(a>C.WARN*SENSF()&&flash<=0){bad++;okRun=0}else{bad=0;okRun++}
      if(!alertOn&&bad>=C.WARNF&&clarity>=.4){alertOn=true;logEvt('انحراف نحو '+dir);saveEv('alert',{dev:off-base,off});speak('انتبه، انحراف نحو '+dir)}
      if(alertOn&&okRun>=8)alertOn=false;
      if(alertOn){alert=true;text='⚠ انحراف نحو '+dir+'!';beep(1,650)}
      else if(a>C.EARLY*SENSF()&&vel*dev>0){if(++earlyN>=4){text='اقتربت من خط '+dir;beep(0,1500)}}else earlyN=0}}
  else{bad=0;alertOn=false}
  if(flash>0&&!alert){flash--;if(off!=null)text='تغيير مسار'}
  // سيارة داخل مساري؟
  vw='';dets.forEach(v=>v.inLane=false);
  if(!lost&&xl!=null)for(const v of dets){if(!VEH.has(v.class))continue;
    const[x,y,w,h]=v.bbox,[bx,by]=apply(Hf,x+w/2,y+h);if(by<-20||by>BH+80)continue;
    const yy=Math.min(Math.max(by,0),BH),lx=A.c?xat(A.c,yy):xat(B.c,yy)-laneW,rx=B.c?xat(B.c,yy):lx+laneW;
    if(bx>lx+laneW*.1&&bx<rx-laneW*.1)v.inLane=true}
  // لوحات + سرعة
  const t=performance.now();if(limit&&t-limitT>120000)limit=null;
  if(ST.speedSign&&fn%6==0&&!ocrBusy){const b=findSign(d);if(b)ocr(b)}
  const over=ST.overspeed&&limit&&spdOK()&&spd>limit+5;if(over){window.Alert&&Alert.fire('speed','warn','السرعة أعلى من الحد المحدد');if(!S.over){logEvt('تجاوز السرعة '+spd+'/'+limit)}}S.over=over;
  // معلومات الخطوط
  const nm=s=>!s.c?'—':(s.y>.5?'أصفر':'أبيض')+(s.cov>.8?' متصل':' متقطع');
  emerg=!!(B.c&&B.cov>.85&&B.y<=.5&&!B.ml&&!lost);
  const sg=ST.signs&&dets.find(v=>v.class=='stop sign'),tl=ST.signs&&dets.find(v=>v.class=='traffic light');
  const chips=mlFresh()?['🧠 ذكاء '+ml.ms+'ms']:[`يسار: ${nm(A)}`,`يمين: ${nm(B)}`];if(emerg)chips.push('🟠 خط طوارئ');if(sg)chips.push('🛑 وقوف');if(tl)chips.push('🚦 إشارة');if(over)chips.push('⚠ تجاوز السرعة');
  {const h=chips.map(c=>`<span>${c}</span>`).join('');if(h!==_chipsH){_chipsH=h;$('chips').innerHTML=h}}
  window.UI&&UI.speed(spdOK()?spd:null,limit,!!over);
  setStatus(text+(vw?'  '+vw:''),alert||vw.includes('جداً'));
  window.Assist&&Assist.update();draw(alert,!!vw);
}
function draw(alert,warn){
  octx.clearRect(0,0,OW,OH);const A=S[0],B=S[1];
  if((A.c||B.c)&&ST.showLanes){const ys=[...Array(24)].map((_,i)=>i*BH/23);
    const lxf=y=>A.c?xat(A.c,y):xat(B.c,y)-laneW,rxf=y=>B.c?xat(B.c,y):xat(A.c,y)+laneW;
    const P=(x,y)=>{const[a,b]=apply(Hi,x,y);return[a*K,b*K]};
    const rgb=alert?'239,91,91':warn?'245,184,75':'62,207,142';
    const g=octx.createLinearGradient(0,OH,0,OH*.4);g.addColorStop(0,`rgba(${rgb},.45)`);g.addColorStop(1,`rgba(${rgb},0)`);
    octx.beginPath();ys.forEach((y,i)=>{const[a,b]=P(lxf(y),y);i?octx.lineTo(a,b):octx.moveTo(a,b)});
    for(let i=ys.length-1;i>=0;i--){const[a,b]=P(rxf(ys[i]),ys[i]);octx.lineTo(a,b)}
    octx.closePath();octx.fillStyle=g;octx.fill();
    for(const t of[.2,.4,.6,.8]){const y=BH*t,m=(lxf(y)+rxf(y))/2,h=laneW*.16;   // أسهم على المسار
      octx.beginPath();[[m-h,y+8],[m,y],[m+h,y+8]].forEach(([x,yy],i)=>{const[a,b]=P(x,yy);i?octx.lineTo(a,b):octx.moveTo(a,b)});
      octx.strokeStyle=`rgba(255,255,255,${.25+.5*t})`;octx.lineWidth=2+5*t;octx.lineCap='round';octx.lineJoin='round';octx.stroke()}
    [[A,lxf],[B,rxf]].forEach(([s,f],i)=>{if(!s.c)return;   // ما نرسم خط وهمي
      octx.beginPath();ys.forEach((y,j)=>{const[a,b]=P(f(y),y);j?octx.lineTo(a,b):octx.moveTo(a,b)});
      const col=(emerg&&i==1)?'#fb923c':s.y>.5?'#facc15':'#f8fafc';
      octx.save();octx.setLineDash(s.c&&(s.cov>.8||s.ml)?[]:[26,16]);octx.globalAlpha=s.c?(s.miss?.6:1):.4;
      octx.shadowColor=col;octx.shadowBlur=14;octx.strokeStyle=col;octx.lineWidth=6;octx.stroke();octx.restore()})}
  window.Assist&&Assist.draw(octx,K);
  if(alert){octx.strokeStyle='rgba(239,91,91,.5)';octx.lineWidth=6;octx.strokeRect(3,3,OW-6,OH-6)}
  if(showBev){const im=bctx.createImageData(BW,BH);
    for(let i=0;i<bin.length;i++){const v=bin[i]?255:0;im.data.set([v,v,v,255],i*4)}bctx.putImageData(im,0,0)}
}
function idle(){octx.clearRect(0,0,OW,OH);octx.fillStyle='#fde047';octx.strokeStyle='#22c55e';octx.lineWidth=3;
  octx.beginPath();pts.forEach(([x,y],i)=>{i?octx.lineTo(x*K,y*K):octx.moveTo(x*K,y*K)});octx.stroke();
  pts.forEach(([x,y])=>{octx.beginPath();octx.arc(x*K,y*K,8,0,7);octx.fill()})}
function loop(){requestAnimationFrame(loop);
  if(!running||video.readyState<2)return;
  const _n=performance.now();if(_n-lastProc<1000/ST.procFps-3)return;lastProc=_n;fpsN++;if(_n-fpsT>1000){fpsV=fpsN;fpsN=0;fpsT=_n;window.UI&&UI.tick()}
  pctx.drawImage(video,0,0,PW,PH);runML();
  if(++rc%15==0){sctx.drawImage(video,0,0,320,180);ring.push(sc.toDataURL('image/jpeg',.6));if(ring.length>8)ring.shift()}
  if(Hi)step();
  else if(auto){octx.clearRect(0,0,OW,OH);setStatus('معايرة تلقائية '+Math.min(99,Math.round(aN/14*100))+'%',false);(ml.sess&&ml.on)?mlCalStep():autoStep()}
  else{idle();setStatus('عايِر المسار (4 نقاط)',false)}}

// ---------- معايرة تلقائية: نجمع تصويت خطوط (Hough) ونأخذ أقرب خطين لمركز الصورة ----------
const AY0=Math.round(PH*.52),AY1=Math.round(PH*.88),AB0=Math.round(PW*.2),AB1=Math.round(PW*.8),AS=6,AX0=-Math.round(PW*.3),
  ANB=Math.ceil((AB1-AB0)/AS)+1,ANN=Math.ceil(PW*1.6/AS)+1,ah=new Int32Array(ANB*ANN),macc=new Uint8Array(PW*PH);
let aN=0,aFr=0;
function autoStep(){aFr++;if(aFr%3)return;const d=pctx.getImageData(0,0,PW,PH).data;
  yF=AY0;yN=AY1;makeMask(d,1);aN++;
  for(let y=AY0+6;y<AY1;y+=2)for(let x=0;x<PW;x+=2){const o=y*PW+x;if(!mask[o])continue;if(macc[o]<250)macc[o]++;
    for(let bi=0;bi<ANB;bi++){const b=AB0+bi*AS,ni=Math.round((b+(x-b)*(AY1-AY0)/(y-AY0)-AX0)/AS);if(ni>=0&&ni<ANN)ah[bi*ANN+ni]++}}
  if(aN>=14)finishAuto()}
function finishAuto(){let mL=0,mR=0,bl=null,br=null;
  const cell=(bi,ni)=>[AB0+bi*AS,AX0+ni*AS,ah[bi*ANN+ni]];
  for(let bi=0;bi<ANB;bi++)for(let ni=0;ni<ANN;ni++){const[b,xn,v]=cell(bi,ni);
    if(xn<b-10&&xn<PW*.5)mL=Math.max(mL,v);else if(xn>b+10&&xn>PW*.5)mR=Math.max(mR,v)}
  for(let bi=0;bi<ANB;bi++)for(let ni=0;ni<ANN;ni++){const[b,xn,v]=cell(bi,ni);
    if(mL>25&&xn<b-10&&xn<PW*.5&&v>=.5*mL&&(!bl||xn>bl.xn))bl={b,xn};
    if(mR>25&&xn>b+10&&xn>PW*.5&&v>=.5*mR&&(!br||xn<br.xn))br={b,xn}}
  const fail=()=>{if(aN>=40){auto=false;resetCalib();$('msg').textContent='ما قدرت أعاير تلقائياً. عايِر يدوياً (4 نقاط).'}};
  if(!bl||!br)return fail();
  const den=(br.xn-br.b)-(bl.xn-bl.b),w0=br.b-bl.b,vpy=AY0+(-w0/den)*(AY1-AY0);
  if(den<=0||vpy<PH*.15||vpy>AY0-4||br.xn-bl.xn<PW*.22||br.xn-bl.xn>PW*.9)return fail();
  const lx=y=>bl.b+(bl.xn-bl.b)*(y-AY0)/(AY1-AY0),rx=y=>br.b+(br.xn-br.b)*(y-AY0)/(AY1-AY0);
  const sup=new Float32Array(PH);   // أين تنتهي الخطوط من تحت؟ (الكبوت)
  for(let y=AY0;y<AY1;y++){let c=0;for(const x0 of[lx(y),rx(y)])for(let x=Math.round(x0)-3;x<=Math.round(x0)+3;x++)if(x>=0&&x<PW&&macc[y*PW+x]>2)c++;sup[y]=c}
  let yn=AY0+10;for(let y=AY1-1;y>AY0+10;y--){let t=0;for(let k=0;k<6;k++)t+=sup[y-k];if(t>=4){yn=y-4;break}}
  const yf=Math.round(vpy+.5*(yn-vpy));if(yn-yf<25)return fail();
  const p=[[lx(yf),yf],[rx(yf),yf],[rx(yn),yn],[lx(yn),yn]];
  if(p.some(([x,y])=>x<0||x>PW||y<0||y>PH))return fail();
  localStorage.setItem(calKey,JSON.stringify(p));setCalib(p);$('msg').textContent='تمت المعايرة تلقائياً.'}

// ---------- مصادر الفيديو ----------
function stopSrc(){video.pause();const s=video.srcObject;if(s)s.getTracks().forEach(t=>t.stop());
  video.srcObject=null;video.removeAttribute('src');dets=[];limit=null;
  if(gpsId!=null){navigator.geolocation.clearWatch(gpsId);gpsId=null;spd=null}}
function loadCal(){const saved=localStorage.getItem(calKey);
  if(saved){setCalib(JSON.parse(saved));$('msg').textContent='المعايرة محفوظة.';return true}resetCalib();return false}
$('start').onclick=async()=>{
  try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();stopSrc();src='cam';calKey='pts-cam-'+Cars.activeId();
    const s=await navigator.mediaDevices.getUserMedia({video:Object.assign({width:{ideal:ST.camH*16/9|0},height:{ideal:ST.camH},frameRate:{ideal:ST.camFps}},ST.camId?{deviceId:{exact:ST.camId}}:{facingMode:{ideal:'environment'}}),audio:false});
    video.loop=false;video.srcObject=s;await video.play();running=true;$('pp').style.display='none';UI.hideIntro();
    setAR(16/9);initModel();
    try{await navigator.wakeLock.request('screen')}catch(e){}
    try{gpsId=navigator.geolocation.watchPosition(p=>{gpsT=performance.now();gpsAcc=p.coords.accuracy;spd=p.coords.speed!=null?Math.round(p.coords.speed*3.6):null;window.Radar&&Radar.pos(p.coords)},()=>{},{enableHighAccuracy:true})}catch(e){}
    loadCal();
  }catch(e){$('msg').textContent='ما اشتغلت الكاميرا: '+e.message+' (لازم https وإذن الكاميرا)'}};
$('file').onchange=e=>{const f=e.target.files[0];if(!f)return;
  actx=actx||new (window.AudioContext||window.webkitAudioContext)();stopSrc();src='file';calKey='pts-file-'+f.name;
  video.muted=true;video.loop=true;video.src=URL.createObjectURL(f);running=true;$('pp').style.display='';UI.hideIntro();
  video.onloadedmetadata=()=>{setAR(video.videoWidth/video.videoHeight);video.currentTime=.5;
    if(loadCal()||auto)video.play();else video.pause()};initModel()};
$('pp').onclick=()=>video.paused?video.play():video.pause();
$('cal').onclick=()=>{if(running){auto=true;resetCalib()}};
$('man').onclick=()=>{if(running){auto=false;resetCalib();if(src=='file')video.pause()}};
$('cam').onclick=$('start').onclick;
document.addEventListener('click',e=>{const b=e.target.closest('#log button[data-i]');if(b)learn(+b.dataset.i,b.dataset.l)});
$('fn').onclick=()=>{C.WARN=Math.max(.12,C.WARN*.9);C.EARLY=Math.min(C.WARN-.04,Math.max(.08,C.EARLY*.92));saveCfg();saveEv('missed');
  $('msg').textContent=`سجّلت إنه فاتك تنبيه. زدت الحساسية (${C.WARN.toFixed(2)}).`};
$('bl').onclick=()=>{saveEv('badlines');if(running){auto=true;resetCalib();$('msg').textContent='سجّلت إن الخطوط غلط، وأعدت المعايرة.'}};
$('sync').onclick=sync;
$('mlf').onclick=()=>$('mlfile').click();
$('mlfile').onchange=async e=>{const f=e.target.files[0];if(!f)return;$('msg').textContent='جاري قراءة الموديل…';
  const b=await f.arrayBuffer();try{await idbSet('ufld',b)}catch(x){}loadML(b)};
$('mlu').onclick=async()=>{const u=prompt('رابط ملف ONNX (UFLD v1)');if(!u)return;
  try{$('msg').textContent='جاري تنزيل الموديل…';const b=await(await fetch(u)).arrayBuffer();try{await idbSet('ufld',b)}catch(x){}loadML(b)}
  catch(x){$('msg').textContent='فشل التنزيل: '+x.message}};
$('mlt').onclick=()=>{ml.on=!ml.on&&!!ml.sess;$('msg').textContent=ml.on?'الذكاء مفعّل.':'الذكاء متوقف، الكشف التقليدي شغال.'};
$('logb').onclick=()=>{const b=$('log');b.style.display=b.style.display=='block'?'none':'block';showLog()};
$('dbg').onclick=()=>{showBev=!showBev;bevC.style.display=showBev?'block':'none'};
bevC.style.display='none';
loop();
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
