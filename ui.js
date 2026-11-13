'use strict';
/* MAUN — الواجهة، الإعدادات، الملفات، الحساب، الصوت، مساعد السائق */
const MC=window.MAUN_CONFIG||{};
const el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=()=>crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c=='x'?r:r&3|8).toString(16)});
const blobToDataURL=b=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(b)});
const fileToDataURL=(f,max=640)=>new Promise((ok,no)=>{const im=new Image(),u=URL.createObjectURL(f);
  im.onload=()=>{const r=Math.min(1,max/Math.max(im.width,im.height)),c=el('canvas');c.width=Math.round(im.width*r);c.height=Math.round(im.height*r);
    c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);ok(c.toDataURL('image/jpeg',.78))};
  im.onerror=()=>no(new Error('صورة غير صالحة'));im.src=u});

// ============ الإعدادات (كل خيار يوقف المعالجة فعلياً) ============
const DEF={lanes:1,showLanes:1,curves:1,cars:1,approach:1,cutin:1,leadmove:1,showSpeed:1,speedSign:1,signs:1,showSigns:1,overspeed:1,
  radar:0,radarDist:500,sound:1,visual:1,vol:.7,sens:'mid',tInfo:'chime',tWarn:'soft',tDanger:'low',gaugeStyle:'ring',gaugeSize:'m',
  camId:'',camH:720,camFps:30,procFps:30,showFps:0,showConf:1,fov:65};
const ST=Object.assign({},DEF);
Object.defineProperty(ST,'detect',{get(){return !!(this.cars||this.signs)}});
window.SENSF=()=>({low:1.25,mid:1,high:.8}[ST.sens]||1);
const loadST=id=>{let o={};try{o=JSON.parse(localStorage.getItem('maun_set_'+(id||'default'))||'{}')}catch(e){}Object.assign(ST,DEF,o)};
const saveST=()=>{try{localStorage.setItem('maun_set_'+Cars.activeId(),JSON.stringify(ST))}catch(e){}};

// ============ الصوت: هادئ، قابل للتخصيص، بدون تكرار مزعج ============
const COOL={info:15000,warn:6000,danger:2500};
const TONES={ // [تردد, بداية, مدة, نوع, شدة]
  soft:{info:[[392,0,.5,'sine',.5]],warn:[[392,0,.4,'sine',.55],[494,.22,.5,'sine',.55]],danger:[[392,0,.35,'sine',.7],[494,.2,.35,'sine',.7],[587,.4,.6,'sine',.7]]},
  electronic:{info:[[880,0,.1,'triangle',.3]],warn:[[880,0,.1,'triangle',.35],[1175,.14,.12,'triangle',.35]],danger:[[880,0,.1,'triangle',.45],[1175,.14,.1,'triangle',.45],[880,.28,.14,'triangle',.45]]},
  chime:{info:[[988,0,.9,'sine',.3]],warn:[[988,0,.8,'sine',.35],[1318,.18,.9,'sine',.35]],danger:[[988,0,.7,'sine',.45],[1318,.16,.7,'sine',.45],[1568,.32,1,'sine',.45]]},
  low:{info:[[220,0,.4,'sine',.6]],warn:[[220,0,.3,'sine',.7],[196,.3,.45,'sine',.7]],danger:[[220,0,.3,'sine',.85],[220,.4,.3,'sine',.85],[165,.8,.55,'sine',.85]]}};
const Snd={ctx:null,last:{},
  unlock(){try{this.ctx=this.ctx||new(window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')this.ctx.resume()}catch(e){}},
  say(t){if(!window.speechSynthesis)return;try{const u=new SpeechSynthesisUtterance(t);u.lang='ar-SA';u.rate=1.05;u.volume=ST.vol;speechSynthesis.speak(u)}catch(e){}},
  play(level,key,text,force){if(!ST.sound&&!force)return false;const now=performance.now(),tone=ST[{info:'tInfo',warn:'tWarn',danger:'tDanger'}[level]]||'soft';
    const cd=Math.max(COOL[level],tone==='human'?7000:0);if(!force&&now-(this.last[key]||-1e9)<cd)return false;this.last[key]=now;
    if(tone==='human'){this.say(text||'انتبه');return true}
    this.unlock();if(!this.ctx)return false;const c=this.ctx;
    for(const[f,t0,d,ty,v]of(TONES[tone]||TONES.soft)[level]){const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+t0;
      o.type=ty;o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v*ST.vol*.6,t+.025);g.gain.exponentialRampToValueAtTime(.0008,t+d);
      o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+d+.05)}
    return true}};
window.beep=s=>Snd.play(s?'danger':'warn','lane'+(s?'D':'W'),'انتبه، انحراف عن المسار');   // تنبيهات المسار القديمة تمر من النظام الجديد
window.speak=t=>{if(ST.tDanger==='human')Snd.say(t)};
document.addEventListener('pointerdown',()=>Snd.unlock());

// ============ التنبيهات المرئية ============
let toastT=0;
function toast(text,level,side){if(!ST.visual||!text)return;const t=$('toast');t.textContent=text;t.className='toast on '+(level||'info');
  clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),level==='danger'?3200:2400);
  if(side){const e=$(side==='L'?'edgeL':'edgeR');e.classList.add('on');setTimeout(()=>e.classList.remove('on'),1600)}}
const Alert={last:{},log:[],fire(key,level,text,o={}){const now=performance.now(),cd=o.cd||COOL[level];
  if(now-(this.last[key]||-1e9)<cd)return false;this.last[key]=now;this.log.push({key,level,text,t:Date.now()});if(this.log.length>50)this.log.shift();
  toast(text,level,o.side);Snd.play(level,key,text,true);return true}};

// ============ الرادارات (قائمة يوفرها المستخدم — لا توجد قاعدة بيانات مدمجة) ============
const hav=(a,b,c,d)=>{const R=6371e3,r=Math.PI/180,x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 2*R*Math.asin(Math.sqrt(x))};
const bearing=(a,b,c,d)=>{const r=Math.PI/180,y=Math.sin((d-b)*r)*Math.cos(c*r),x=Math.cos(a*r)*Math.sin(c*r)-Math.sin(a*r)*Math.cos(c*r)*Math.cos((d-b)*r);return(Math.atan2(y,x)/r+360)%360};
const Radar={list:[],near:null,
  load(){try{this.list=JSON.parse(localStorage.getItem('maun_radars')||'[]')}catch(e){this.list=[]}},
  parse(t){t=(t||'').trim();let a=[];if(!t)return[];
    if(t[0]==='['){try{a=JSON.parse(t).map(r=>({lat:+r.lat,lon:+r.lon,name:r.name||'',limit:r.limit?+r.limit:null}))}catch(e){return null}}
    else a=t.split(/\n+/).map(l=>l.split(/[,;\t]/).map(s=>s.trim())).filter(p=>p.length>=2&&p[0]!==''&&!isNaN(+p[0])&&!isNaN(+p[1])).map(p=>({lat:+p[0],lon:+p[1],name:p[2]||'',limit:p[3]?+p[3]:null}));
    return a.filter(r=>Math.abs(r.lat)<=90&&Math.abs(r.lon)<=180)},
  pos(c){if(!ST.radar||!this.list.length){this.near=null;return}let near=null;
    this.list.forEach((r,i)=>{const d=hav(c.latitude,c.longitude,r.lat,r.lon);if(d<5000&&(!near||d<near.d))near={r,d};if(d>ST.radarDist)return;
      if(c.heading!=null&&!isNaN(c.heading)&&(c.speed||0)>2){const diff=Math.abs(((bearing(c.latitude,c.longitude,r.lat,r.lon)-c.heading+540)%360)-180);if(diff>60)return}  // خلفي أو جانبي
      Alert.fire('radar'+i,'warn',`رادار ثابت على بعد ${Math.round(d/50)*50} م`+(r.limit?` · الحد ${r.limit}`:''),{cd:90000})});
    this.near=near}};

// ============ مساعد السائق: تتبع السيارات، المسافة، الاقتراب، تغيير المسار، تحرك الأمامية ============
const VEHW={car:1.8,truck:2.5,bus:2.5,motorcycle:.8};
const slope=(H,f)=>{const n=H.length,t0=H[0].t;let sx=0,sy=0,sxx=0,sxy=0;for(const p of H){const x=(p.t-t0)/1000,y=f(p);sx+=x;sy+=y;sxx+=x*x;sxy+=x*y}const den=n*sxx-sx*sx;return den>1e-6?(n*sxy-sx*sy)/den:0};
const rr=(c,x,y,w,h,r)=>{c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()};
const Assist={tr:[],nid:1,lead:null,leadM:null,dark:false,stopSince:0,armed:false,df:0,
  onDet(r){if(!ST.cars)return;const now=performance.now();this.tr.forEach(t=>t.hit=false);
    for(const v of r){if(!VEH.has(v.class))continue;const[x,y,w,h]=v.bbox,cx=x+w/2;let best=null,bs=0;
      for(const t of this.tr){if(t.hit)continue;const l=t.h[t.h.length-1],i=iou([x,y,w,h],[l.x,l.y,l.w,l.h]),dc=Math.hypot(cx-(l.x+l.w/2),y+h-(l.y+l.h));
        if((i>.2||dc<w*.4)&&i+(dc<w*.5?.1:0)>bs){bs=i+(dc<w*.5?.1:0);best=t}}
      if(!best){best={id:this.nid++,cls:v.class,h:[],miss:0,score:v.score};this.tr.push(best)}
      best.hit=true;best.miss=0;best.score=.7*best.score+.3*v.score;best.h.push({t:now,x,y,w,h});if(best.h.length>26)best.h.shift()}
    this.tr.forEach(t=>{if(!t.hit)t.miss++});this.tr=this.tr.filter(t=>t.miss<=4&&now-t.h[t.h.length-1].t<1500)},
  vpY(){if(!pts||pts.length<4)return null;const[l0,r0,r1,l1]=pts,a1=(l1[0]-l0[0])/(l1[1]-l0[1]),b1=l0[0]-a1*l0[1],a2=(r1[0]-r0[0])/(r1[1]-r0[1]),b2=r0[0]-a2*r0[1];
    if(!isFinite(a1)||!isFinite(a2)||Math.abs(a1-a2)<1e-6)return null;const y=(b2-b1)/(a1-a2);return y>0&&y<PH?y:null},
  metrics(t,now){const H=t.h.filter(p=>now-p.t<1400);if(H.length<4)return null;const L=H[H.length-1];if((L.t-H[0].t)<700)return null;
    const g=slope(H,p=>Math.log(p.w)),f=(PW/2)/Math.tan(ST.fov*Math.PI/360),dW=f*(VEHW[t.cls]||1.8)/L.w,by=L.y+L.h,vp=this.vpY(),dH=vp!=null&&by>vp+5?f*1.3/(by-vp):null;
    const agree=dH?Math.min(dW,dH)/Math.max(dW,dH):.5,d=Math.max(3,Math.min(150,dH?(dW+dH)/2:dW));
    const conf=(t.h.length>=6&&L.w>PW*.05&&t.score>.6)?(agree>.75?'جيدة':agree>.5?'متوسطة':'منخفضة'):'منخفضة';
    return{d,conf,g,ttc:g>.03?1/g:null,L,by,cx:L.x+L.w/2}},
  rel(m){if(!Hi||wasLost||!(S[0].c||S[1].c))return null;const[bx,by]=apply(Hf,m.cx,m.by);if(by<-30||by>BH+60)return null;
    const yy=Math.max(0,Math.min(BH,by)),A=S[0],B=S[1],lx=A.c?xat(A.c,yy):xat(B.c,yy)-laneW,rx=B.c?xat(B.c,yy):lx+laneW;return rx-lx<5?null:(bx-lx)/(rx-lx)},
  checkDark(){const c=this.dc||(this.dc=el('canvas'));c.width=16;c.height=9;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(pc,0,0,16,9);
    const d=x.getImageData(0,0,16,9).data;let s=0;for(let i=0;i<d.length;i+=4)s+=d[i]*.3+d[i+1]*.59+d[i+2]*.11;this.dark=s/144<14},
  update(){const now=performance.now();if(++this.df%30==0)this.checkDark();
    if(!ST.cars||!this.tr.length){this.lead=this.leadM=null;if(ST.leadmove)this.checkLead(null,null,now);return}
    const lowConf=!(Hi&&!wasLost&&(S[0].c||S[1].c));let lead=null,lm=null;
    for(const t of this.tr){const m=this.metrics(t,now);t.m=m;if(!m)continue;t.rel=this.rel(m);
      if(t.rel!=null)t.relH=(t.relH||[]).concat([{t:now,r:t.rel}]).filter(p=>now-p.t<1400);
      t.inLane=t.rel!=null?(t.rel>.12&&t.rel<.88):(Math.abs(m.cx-PW/2)<PW*.16&&m.by>PH*.55);
      if(t.inLane&&(!lead||m.d<lm.d)){lead=t;lm=m}}
    this.lead=lead;this.leadM=lm;if(this.dark)return;   // رؤية ضعيفة: لا نصدر تحذيرات
    if(lead&&ST.approach)this.approach(lead,lm,lowConf);
    if(ST.cutin&&!lowConf)for(const t of this.tr)this.cut(t);
    if(ST.leadmove)this.checkLead(lead,lm,now)},
  approach(t,m,lowConf){if(t.h.length<5||t.score<.55)return;
    const danger=!lowConf&&t.h.length>=6&&t.score>.6&&m.ttc!=null&&m.g>.07&&m.ttc<2.2&&m.d<70;
    const headway=spdOK()&&spd>20&&m.d/(spd/3.6)<.9&&m.conf!=='منخفضة';
    const warn=(m.ttc!=null&&m.g>.05&&m.ttc<3.8&&m.d<80)||headway;
    if(danger)Alert.fire('appr','danger','انتبه، سيارة قريبة');else if(warn)Alert.fire('appr','warn','السيارة الأمامية تقترب')},
  cut(t){if(!t.m||t.rel==null||t.inLane||!t.relH||t.relH.length<5)return;const H=t.relH,n=H.length;if((H[n-1].t-H[0].t)<700)return;
    const left=t.rel<=.12,v=slope(H,p=>p.r);if(left?v<=.10:v>=-.10)return;
    const mid=H[n>>1],v1=(mid.r-H[0].r)/(((mid.t-H[0].t)/1000)||1),v2=(H[n-1].r-mid.r)/(((H[n-1].t-mid.t)/1000)||1);   // اتجاه ثابت = تغيير مسار حقيقي وليس تمايل
    if(Math.sign(v1)!==Math.sign(v2)||Math.abs(v1)<.05||Math.abs(v2)<.05)return;
    const tEdge=((left?.12:.88)-t.rel)/v;if(tEdge<0||tEdge>2.6||(t.m.d>45&&t.m.by<PH*.6))return;
    const side=left?'L':'R';Alert.fire('cut'+side,tEdge<1.2&&t.m.d<28?'danger':'warn','مركبة تقترب من مسارك',{side});t.cutSide=side;t.cutT=performance.now()},
  checkLead(lead,m,now){if(spdOK()&&spd<=2){this.stopSince=this.stopSince||now}else{this.stopSince=0;this.armed=false;return}
    if(now-this.stopSince<2500||!lead||!m||m.d>30)return;const h=lead.h,old=h.filter(p=>now-p.t>900&&now-p.t<3200),rec=h.filter(p=>now-p.t<=900);
    if(old.length<3||rec.length<2)return;const mean=a=>a.reduce((s,x)=>s+x,0)/a.length,ow=mean(old.map(p=>p.w)),ob=mean(old.map(p=>p.y+p.h));
    if(!this.armed){const rw=Math.max(...old.map(p=>p.w))-Math.min(...old.map(p=>p.w)),rb=Math.max(...old.map(p=>p.y+p.h))-Math.min(...old.map(p=>p.y+p.h));
      if(rw/ow<.05&&rb<PH*.012)this.armed=true;return}
    if(mean(rec.map(p=>p.w))/ow<.93&&mean(rec.map(p=>p.y+p.h))-ob<-PH*.012){this.armed=false;Alert.fire('lead','info','السيارة الأمامية تحركت',{cd:12000})}},
  avail(){if(!ST.cars)return'';if(this.dark)return'الرؤية ضعيفة — تحليل السيارات متوقف';if(!model)return'كاشف السيارات غير جاهز';return''},
  draw(c,k){const now=performance.now();
    if(ST.showSigns)for(const v of dets){if(v.class!=='stop sign'&&v.class!=='traffic light')continue;const[x,y,w,h]=v.bbox;c.strokeStyle='rgba(245,184,75,.9)';c.lineWidth=2;rr(c,x*k,y*k,w*k,h*k,6);c.stroke();
      c.fillStyle='rgba(245,184,75,.95)';c.font='600 15px system-ui';c.fillText(v.class==='stop sign'?'وقوف':'إشارة',x*k,y*k-6)}
    if(!ST.cars)return;
    for(const t of this.tr){const m=t.m,L=t.h[t.h.length-1];if(!m||now-L.t>700)continue;const lead=t===this.lead,cut=t.cutT&&now-t.cutT<1500;
      c.lineWidth=lead||cut?2.5:1.2;c.strokeStyle=cut?'rgba(245,184,75,.95)':lead?'rgba(62,207,142,.95)':'rgba(255,255,255,.35)';rr(c,L.x*k,L.y*k,L.w*k,L.h*k,10);c.stroke();
      if(lead){const lab=`≈ ${Math.round(m.d)} م · ${m.conf}`+(m.ttc&&m.ttc<6?` · ${m.ttc.toFixed(1)} ث`:'');c.font='600 16px system-ui';const w=c.measureText(lab).width+18;
        c.fillStyle='rgba(8,9,10,.7)';rr(c,L.x*k,L.y*k-28,w,24,12);c.fill();c.fillStyle='#e9ebee';c.fillText(lab,L.x*k+9,L.y*k-11)}}}};
window.Assist=Assist;window.Radar=Radar;

// وضع بدون تحليل المسارات: يبقى عداد السرعة واللوحات والسيارات
function stepLite(){fn++;if(ST.detect)runDet();
  if(ST.speedSign&&fn%6==0&&!ocrBusy){const b=findSign(pctx.getImageData(0,0,PW,PH).data);if(b)ocr(b)}
  const t=performance.now();if(limit&&t-limitT>120000)limit=null;
  const over=ST.overspeed&&limit&&spdOK()&&spd>limit+5;if(over)Alert.fire('speed','warn','السرعة أعلى من الحد المحدد');
  UI.speed(spdOK()?spd:null,limit,!!over);setStatus('تحليل المسارات متوقف',false);
  octx.clearRect(0,0,OW,OH);Assist.update();Assist.draw(octx,K)}

// ============ الواجهة ============
let lc=0;
const UI={_k:'',
  speed(v,lim,over){const k=v+'|'+lim+'|'+over;if(k===this._k)return;this._k=k;$('spd').textContent=v==null?'--':v;
    $('ring-fg').style.strokeDashoffset=339.3*(1-(v==null?0:Math.min(1,v/180)));$('limv').textContent=lim||'؟';$('limit').classList.toggle('unk',!lim);
    $('limcap').textContent=lim?'الحد':'الحد غير معروف';$('gaugeBox').classList.toggle('over',!!over)},
  tick(){lc=lc*.7+.3*(((S[0].seen?1:0)+(S[1].seen?1:0))/2);const L=[];
    if(ST.showFps)L.push(`${fpsV} إطار/ث`+(ml.on&&ml.sess?` · ذكاء ${ml.ms}م.ث`:''));
    if(ST.showConf){if(ST.lanes)L.push(`ثقة المسار ${Math.round(lc*100)}%`);if(Assist.leadM)L.push('ثقة المسافة: '+Assist.leadM.conf)}
    const av=Assist.avail();if(av)L.push(av);if(ST.radar&&Radar.near)L.push(`أقرب رادار: ${Radar.near.d<1000?Math.round(Radar.near.d)+' م':(Radar.near.d/1000).toFixed(1)+' كم'}`);
    $('hudinfo').innerHTML=L.map(esc).join('<br>');const c=$('calstat');if(c)c.textContent=Hi?`معايرة سارية — ثقة المسار ${Math.round(lc*100)}%`:'غير معايَر'}};
window.UI=UI;

function applyST(){const s=$('stage');s.dataset.gauge=ST.gaugeStyle;s.dataset.size=ST.gaugeSize;$('gaugeBox').style.display=ST.showSpeed?'':'none';
  $('hudinfo').style.display=(ST.showFps||ST.showConf||ST.cars||ST.radar)?'':'none';
  if(!ST.detect){dets=[];Assist.tr=[];Assist.lead=Assist.leadM=null}else if(running)initModel();
  if(!ST.cars){Assist.tr=[];Assist.lead=Assist.leadM=null}
  if(!ST.lanes)S.forEach(x=>{x.c=null;x.seen=false});
  if(!ST.speedSign){limit=null;UI._k=''}
  if(!ST.radar)Radar.near=null}
function changed(k){saveST();applyST();
  if(['camId','camH','camFps'].includes(k)&&running&&src==='cam')$('cam').click();
  if(['tInfo','tWarn','tDanger','vol'].includes(k)){const lv={tInfo:'info',tWarn:'warn',tDanger:'danger',vol:'warn'}[k];Snd.play(lv,'prev',lv==='info'?'السيارة الأمامية تحركت':'انتبه، يوجد خطر محتمل',true)}}

const T3=[['chime','نغمة راقية'],['soft','هادئ وناعم'],['electronic','إلكتروني خفيف'],['low','منخفض'],['human','صوت بشري']];
const SCHEMA=[
 {t:'مساعد السائق',open:1,items:[['cars','toggle','اكتشاف السيارات الأمامية'],['approach','toggle','تنبيه الاقتراب من السيارات'],['cutin','toggle','تنبيه تغيير المسار'],['leadmove','toggle','تنبيه تحرك السيارة الأمامية'],
   ['showSpeed','toggle','عرض السرعة الحالية'],['speedSign','toggle','قراءة حدود السرعة'],['overspeed','toggle','تنبيه تجاوز السرعة']],
   extra:()=>el('div','note','تقدير المسافة من كاميرا واحدة تقريبي وتظهر معه درجة الثقة. تنبيه تحرك الأمامية يحتاج GPS (السرعة صفر). هذه مساعدة للسائق وليست نظام سلامة.')},
 {t:'الطريق',items:[['lanes','toggle','تحليل المسارات'],['showLanes','toggle','إظهار المسارات'],['curves','toggle','اكتشاف المنعطفات']]},
 {t:'اللوحات والإشارات',items:[['signs','toggle','إشارة الوقوف وإشارات المرور'],['showSigns','toggle','عرض اللوحات المكتشفة']]},
 {t:'الرادار',items:[['radar','toggle','تنبيه الرادارات من قائمتي'],['radarDist','select','مسافة التنبيه',[[300,'300 م'],[500,'500 م'],[1000,'1 كم']]]],
   extra:()=>{const w=el('div','srow');w.style.flexDirection='column';w.style.alignItems='stretch';const ta=el('textarea');ta.placeholder='lat,lon,الاسم,الحد\n24.7136,46.6753,رادار الدائري,100';
     ta.value=Radar.list.map(r=>[r.lat,r.lon,r.name,r.limit||''].join(',')).join('\n');const b=el('button','','حفظ القائمة'),n=el('div','note',`${Radar.list.length} رادار محفوظ. لا توجد قاعدة رادارات مدمجة؛ أضف مواقعك بنفسك.`);
     b.onclick=()=>{const a=Radar.parse(ta.value);if(a==null){n.textContent='صيغة غير صالحة';return}Radar.list=a;localStorage.setItem('maun_radars',JSON.stringify(a));n.textContent=`${a.length} رادار محفوظ.`};w.append(ta,b,n);return w}},
 {t:'الصوت والتنبيهات',items:[['sound','toggle','التنبيهات الصوتية'],['visual','toggle','التنبيهات المرئية'],['vol','range','مستوى الصوت',[.1,1,.05]],
   ['sens','select','حساسية التنبيهات',[['low','منخفضة'],['mid','متوسطة'],['high','عالية']]],['tInfo','select','صوت المعلومات',T3],['tWarn','select','صوت التحذير',T3],['tDanger','select','صوت الخطر',T3]]},
 {t:'العداد',items:[['gaugeStyle','select','شكل العداد',[['ring','حلقة'],['minimal','أرقام فقط']]],['gaugeSize','select','حجم العداد',[['s','صغير'],['m','وسط'],['l','كبير']]]]},
 {t:'الكاميرا',items:[['camH','select','جودة الفيديو',[[480,'480p'],[720,'720p'],[1080,'1080p']]],['camFps','select','معدل إطارات الكاميرا',[[15,'15'],[24,'24'],[30,'30']]],['procFps','select','معدل التحليل',[[10,'10'],[15,'15'],[20,'20'],[30,'30']]],['fov','select','زاوية عدسة الجوال',[[55,'55°'],[65,'65°'],[75,'75°'],[85,'85°']]]],
   extra:()=>{const w=el('div'),r=el('div','srow'),sel=el('select');sel.id='camsel';sel.add(new Option('الخلفية (افتراضي)',''));
     r.append(el('span','','الكاميرا'),sel);sel.onchange=()=>{ST.camId=sel.value;changed('camId')};
     navigator.mediaDevices&&navigator.mediaDevices.enumerateDevices().then(a=>{a.filter(d=>d.kind==='videoinput').forEach((d,i)=>sel.add(new Option(d.label||'كاميرا '+(i+1),d.deviceId)));sel.value=ST.camId}).catch(()=>{});
     const s=el('div','note');s.id='calstat';s.textContent=Hi?'معايرة سارية':'غير معايَر';const bw=el('div','tools-grid'),ba=el('button','','معايرة تلقائية'),bm=el('button','','معايرة يدوية');
     ba.onclick=()=>{$('cal').click();openSheet(false)};bm.onclick=()=>{$('man').click();openSheet(false)};bw.append(ba,bm);w.append(r,s,bw);return w}},
 {t:'الذكاء والأداء',items:[['showFps','toggle','عرض FPS'],['showConf','toggle','عرض الدقة والثقة']]}];
const TOOLS=$('tools');
function renderSettings(){const b=$('sheetbody');document.body.append(TOOLS);b.innerHTML='';
  for(const sec of SCHEMA){const d=el('details','sec');if(sec.open)d.open=true;d.append(el('summary','',sec.t));
    for(const[k,type,label,opts]of sec.items){const row=el('div','srow');row.append(el('span','',label));
      if(type==='toggle'){const sw=el('button','sw'+(ST[k]?' on':''));sw.setAttribute('role','switch');sw.onclick=()=>{ST[k]=ST[k]?0:1;sw.classList.toggle('on',!!ST[k]);changed(k)};row.append(sw)}
      else if(type==='select'){const s=el('select');for(const[v,t]of opts)s.add(new Option(t,v));s.value=String(ST[k]);s.onchange=()=>{ST[k]=isNaN(+s.value)||s.value===''?s.value:+s.value;changed(k)};row.append(s)}
      else{const r=el('input');r.type='range';[r.min,r.max,r.step]=opts;r.value=ST[k];r.onchange=()=>{ST[k]=+r.value;changed(k)};row.append(r)}
      d.append(row)}
    if(sec.extra)d.append(sec.extra());b.append(d)}
  b.append(TOOLS);TOOLS.hidden=false}
const openSheet=o=>{$('sheet').classList.toggle('on',o);$('scrim').classList.toggle('on',o)};

// ============ ملفات السيارات ============
const COLORS=[['أسود','#111'],['أبيض','#f4f4f4'],['فضي','#b9bec4'],['رمادي','#6b7077'],['أحمر','#c0392b'],['أزرق','#2f5fb3'],['أخضر','#2e7d5b'],['ذهبي','#b8964b'],['بني','#6b4a32'],['برتقالي','#d9782d']];
const MAKES=['Toyota','Hyundai','Kia','Nissan','Ford','Chevrolet','Honda','Mazda','Lexus','GMC','BMW','Mercedes-Benz','Audi','Tesla','Genesis','Mitsubishi','Suzuki','Land Rover','Jeep','Dodge'];
const Cars={list:[],act:'',
  load(){try{this.list=JSON.parse(localStorage.getItem('maun_cars')||'[]')}catch(e){this.list=[]}this.act=localStorage.getItem('maun_active')||(this.list[0]&&this.list[0].id)||'';if(!this.list.some(c=>c.id===this.act))this.act=(this.list[0]&&this.list[0].id)||''},
  save(){try{localStorage.setItem('maun_cars',JSON.stringify(this.list));localStorage.setItem('maun_active',this.act)}catch(e){$('msg').textContent='المساحة ممتلئة: استخدم صورة أصغر أو احذف ملفاً'}},
  activeId(){return this.act||'default'},active(){return this.list.find(c=>c.id===this.act)||null},
  setActive(id){if(this.act!==id){this.act=id;this.save();loadST(id);applyST();renderSettings();if(running&&src==='cam'){calKey='pts-cam-'+id;loadCal()}}renderChip();renderIntro();this.render()},
  upsert(c){const i=this.list.findIndex(x=>x.id===c.id);c.updated=new Date().toISOString();c.synced=false;if(i<0)this.list.push(c);else this.list[i]=c;if(!this.act)this.act=c.id;this.save();
    if(Cloud.authed())Cloud.syncCars().catch(e=>$('msg').textContent='تعذرت المزامنة: '+e.message)},
  remove(id){this.list=this.list.filter(c=>c.id!==id);if(this.act===id)this.act=(this.list[0]&&this.list[0].id)||'';this.save();localStorage.removeItem('maun_set_'+id);localStorage.removeItem('pts-cam-'+id);
    if(Cloud.authed()){Cloud.rest('cars?id=eq.'+id,{method:'DELETE'}).catch(()=>{});Cloud.removeImg(id)}else{const q=JSON.parse(localStorage.getItem('maun_del')||'[]');q.push(id);localStorage.setItem('maun_del',JSON.stringify(q))}
    loadST(this.act);applyST();renderSettings();renderChip();renderIntro();this.render()},
  render(){const g=$('carsgrid');g.innerHTML='';
    for(const c of this.list){const d=el('div','card'+(c.id===this.act?' act':''));const col=(COLORS.find(x=>x[0]===c.color)||[])[1];
      d.innerHTML=`<div class="im" style="${c.img?`background-image:url(${c.img})`:''}">${c.img?'':'🚗'}</div><div class="tx"><b>${esc(c.name)}</b><small>${col?`<i class="dot" style="background:${col}"></i>`:''}${esc([c.make,c.model].filter(Boolean).join(' · ')||'—')}</small></div>${c.id===this.act?'<span class="badge">نشطة</span>':''}<button class="ed" aria-label="تعديل">✎</button>`;
      d.onclick=()=>{this.setActive(c.id);closeCars()};d.querySelector('.ed').onclick=e=>{e.stopPropagation();openForm(c)};g.append(d)}
    const a=el('div','card add','<div><span>＋</span>سيارة جديدة</div>');a.onclick=()=>openForm();g.append(a)}};
function renderChip(){const c=Cars.active(),b=$('carchip');
  b.innerHTML=c?`<span class="th" style="${c.img?`background-image:url(${c.img})`:''}">${c.img?'':'🚗'}</span><span class="nm"><b>${esc(c.name)}</b><small>${esc([c.make,c.model].filter(Boolean).join(' '))}</small></span>`:'<span class="th">＋</span><span class="nm"><b>ملف سيارة</b></span>'}
function renderIntro(){const c=Cars.active(),has=Cars.list.length,box=$('introcar');
  document.querySelector('#intro .row').style.display=has?'':'none';
  if(!has){box.innerHTML='<p style="color:var(--mu);margin:0 0 14px;font-size:14px">أهلاً بك. ابدأ بإنشاء ملف لسيارتك.</p><button class="primary" id="mk1">إنشاء ملف السيارة الأول</button>'+(Cloud.ready()?'<div style="margin-top:12px"><button class="btn" id="haveacct">لدي حساب في MAUN</button></div>':'');$('mk1').onclick=()=>openForm();if($('haveacct'))$('haveacct').onclick=openCars}
  else{box.innerHTML=`<div class="icar"><span class="th" style="${c.img?`background-image:url(${c.img})`:''}"></span><span><b>${esc(c.name)}</b><small>${esc([c.make,c.model].filter(Boolean).join(' · '))}</small></span></div>`;box.firstChild.onclick=openCars}}
function openCars(){$('cars').hidden=false;Cars.render();renderAcct()}
function closeCars(){$('cars').hidden=true}
function openForm(c){const x=c||{id:uuid(),name:'',make:'',model:'',color:'',img:''},isNew=!c;let img=x.img||'';const f=$('carform');
  f.innerHTML=`<h3>${isNew?'سيارة جديدة':'تعديل الملف'}</h3>
  <label class="fld">اسم الملف<input name="name" maxlength="40" placeholder="سيارتي اليومية" value="${esc(x.name)}"></label>
  <label class="fld">الشركة المصنعة<input name="make" list="makes" maxlength="30" placeholder="Hyundai" value="${esc(x.make)}"></label><datalist id="makes">${MAKES.map(m=>`<option value="${m}">`).join('')}</datalist>
  <label class="fld">الموديل<input name="model" maxlength="40" placeholder="Sonata 2026" value="${esc(x.model)}"></label>
  <label class="fld">اللون<select name="color"><option value="">—</option>${COLORS.map(([n])=>`<option ${n===x.color?'selected':''}>${n}</option>`).join('')}</select></label>
  <div class="fld">صورة السيارة<div class="photo"><div class="pv" id="pv" style="${img?`background-image:url(${img})`:''}"></div><label class="btn">${img?'تغيير الصورة':'رفع صورة'}<input id="pf" type="file" accept="image/*" hidden></label></div></div>
  <div class="acts"><button class="primary" type="submit">حفظ</button><button type="button" id="cx">إلغاء</button>${isNew?'':'<button type="button" id="del" class="danger">حذف</button>'}</div>`;
  $('modal').hidden=false;
  $('pf').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{img=await fileToDataURL(file);$('pv').style.backgroundImage=`url(${img})`}catch(er){$('msg').textContent=er.message}};
  $('cx').onclick=()=>{$('modal').hidden=true};
  if(!isNew)$('del').onclick=()=>{if(confirm(`حذف الملف «${x.name}»؟ لا يمكن التراجع.`)){$('modal').hidden=true;Cars.remove(x.id)}};
  f.onsubmit=e=>{e.preventDefault();const d=new FormData(f);const o={id:x.id,name:(d.get('name')||'').trim()||'سيارتي',make:(d.get('make')||'').trim(),model:(d.get('model')||'').trim(),color:d.get('color')||'',img};
    $('modal').hidden=true;Cars.upsert(o);Cars.setActive(isNew?o.id:Cars.act||o.id);if(!$('cars').hidden)Cars.render()}}

// ============ الحساب والمزامنة (Supabase Auth + RLS + Storage) ============
const Cloud={url:(MC.SUPABASE_URL||'').replace(/\/$/,''),key:MC.SUPABASE_ANON_KEY||'',sess:null,
  init(){try{this.sess=JSON.parse(localStorage.getItem('maun_sess')||'null')}catch(e){}},
  ready(){return !!(this.url&&this.key)},authed(){return !!(this.sess&&this.sess.access_token)},uid(){return this.sess&&this.sess.user&&this.sess.user.id},
  hdr(j){const h={apikey:this.key,Authorization:'Bearer '+(this.authed()?this.sess.access_token:this.key)};if(j)h['Content-Type']='application/json';return h},
  setSess(r){this.sess={access_token:r.access_token,refresh_token:r.refresh_token,expires_at:Date.now()+(r.expires_in||3600)*1000-60000,user:r.user};localStorage.setItem('maun_sess',JSON.stringify(this.sess))},
  async auth(path,body){const r=await fetch(`${this.url}/auth/v1/${path}`,{method:'POST',headers:{apikey:this.key,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.msg||j.error_description||j.message||('خطأ '+r.status));return j},
  async signIn(e,p){this.setSess(await this.auth('token?grant_type=password',{email:e,password:p}))},
  async signUp(e,p){const j=await this.auth('signup',{email:e,password:p});if(j.access_token)this.setSess(j);else throw new Error('تم إنشاء الحساب. أكّد بريدك ثم سجّل الدخول.')},
  signOut(){this.sess=null;localStorage.removeItem('maun_sess')},
  async fresh(){if(!this.authed())throw new Error('سجّل الدخول أولاً');if(Date.now()>this.sess.expires_at)this.setSess(await this.auth('token?grant_type=refresh_token',{refresh_token:this.sess.refresh_token}))},
  async rest(path,opt={}){await this.fresh();const r=await fetch(`${this.url}/rest/v1/${path}`,{...opt,headers:{...this.hdr(true),...(opt.headers||{})}});if(!r.ok)throw new Error('الخادم '+r.status);return r.status===204?null:r.json().catch(()=>null)},
  async put(bucket,path,blob){await this.fresh();const r=await fetch(`${this.url}/storage/v1/object/${bucket}/${path}`,{method:'POST',headers:{...this.hdr(),'Content-Type':blob.type||'image/jpeg','x-upsert':'true'},body:blob});if(!r.ok)throw new Error('رفع الصورة '+r.status)},
  async removeImg(id){try{await this.fresh();await fetch(`${this.url}/storage/v1/object/cars/${this.uid()}/${id}.jpg`,{method:'DELETE',headers:this.hdr()})}catch(e){}},
  async signed(bucket,path){await this.fresh();const r=await fetch(`${this.url}/storage/v1/object/sign/${bucket}/${path}`,{method:'POST',headers:this.hdr(true),body:JSON.stringify({expiresIn:3600})});if(!r.ok)return null;const j=await r.json();return this.url+'/storage/v1'+j.signedURL},
  async syncCars(){if(!this.authed())return;
    const del=JSON.parse(localStorage.getItem('maun_del')||'[]');for(const id of del){try{await this.rest('cars?id=eq.'+id,{method:'DELETE'});await this.removeImg(id)}catch(e){}}localStorage.setItem('maun_del','[]');
    const rows=(await this.rest('cars?select=*&order=updated_at.desc'))||[];
    for(const r of rows){if(del.includes(r.id))continue;const c=Cars.list.find(x=>x.id===r.id);
      if(!c||(c.synced&&new Date(r.updated_at)>new Date(c.updated||0))){const n={id:r.id,name:r.name,make:r.make||'',model:r.model||'',color:r.color||'',img:c?c.img:'',updated:r.updated_at,synced:true};
        if(r.image_path&&!n.img){const u=await this.signed('cars',r.image_path);if(u)try{const bl=await(await fetch(u)).blob();if(bl.type.startsWith('image/'))n.img=await blobToDataURL(bl)}catch(e){}}
        if(c)Object.assign(c,n);else Cars.list.push(n)}}
    for(const c of Cars.list.filter(x=>!x.synced)){let path=null;if(c.img){path=`${this.uid()}/${c.id}.jpg`;await this.put('cars',path,await(await fetch(c.img)).blob())}
      await this.rest('cars',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:c.id,name:c.name,make:c.make,model:c.model,color:c.color,image_path:path,updated_at:c.updated})});c.synced=true}
    if(!Cars.act&&Cars.list[0])Cars.act=Cars.list[0].id;Cars.save();renderChip();renderIntro();if(!$('cars').hidden)Cars.render()},
  async syncEvents(){if(!this.authed()){$('msg').textContent='سجّل الدخول من «ملفاتي» أولاً';return}let n=0;
    try{for(const e of(await evdb.all()).filter(x=>!x.sent&&(x.label||x.kind!='alert'))){const paths=[];
        for(let i=0;i<e.imgs.length;i++){const p=`${this.uid()}/${e.t}_${i}.jpg`;await this.put('snapshots',p,await(await fetch(e.imgs[i])).blob());paths.push(p)}
        await this.rest('events',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({car_id:Cars.act||null,t:new Date(e.t).toISOString(),kind:e.kind,label:e.label,dev:e.dev==null?null:e.dev,off:e.off==null?null:e.off,params:{...e.params,ml:e.ml,src:e.src,spd:e.spd,limit:e.limit},paths})});
        e.sent=true;await evdb.put(e);n++}$('msg').textContent=`تم رفع ${n} حدث.`}catch(x){$('msg').textContent='فشل الرفع: '+x.message}}};
function renderAcct(){const a=$('acct');a.innerHTML='';
  if(!Cloud.ready()){a.innerHTML='الملفات محفوظة على هذا الجهاز فقط. لتفعيل الحساب والمزامنة أضف مفاتيح Supabase في config.js.';return}
  if(Cloud.authed()){const s=el('span','','الحساب: '+esc(Cloud.sess.user&&Cloud.sess.user.email||'')),b=el('button','','مزامنة'),o=el('button','','خروج');
    b.onclick=()=>Cloud.syncCars().then(()=>$('msg').textContent='تمت المزامنة').catch(e=>$('msg').textContent='تعذرت المزامنة: '+e.message);o.onclick=()=>{Cloud.signOut();renderAcct()};a.append(s,b,o);return}
  const em=el('input'),pw=el('input'),i=el('button','','دخول'),u=el('button','','إنشاء حساب'),m=el('span');em.type='email';em.placeholder='البريد';pw.type='password';pw.placeholder='كلمة المرور';
  const go=fn=>async()=>{try{m.textContent='...';await fn(em.value.trim(),pw.value);await Cloud.syncCars();renderAcct()}catch(e){m.textContent=e.message}};
  i.onclick=go((e,p)=>Cloud.signIn(e,p));u.onclick=go((e,p)=>Cloud.signUp(e,p));a.append(em,pw,i,u,m)}

// ============ تشغيل ============
$('gear').onclick=()=>openSheet(true);$('sheetx').onclick=()=>openSheet(false);$('scrim').onclick=()=>openSheet(false);
$('carchip').onclick=openCars;$('carsx').onclick=closeCars;$('sync').onclick=()=>Cloud.syncEvents();
$('dbg').addEventListener('click',()=>{});
Cars.load();Cloud.init();Radar.load();loadST(Cars.act);applyST();renderChip();renderIntro();renderSettings();
if(Cloud.authed())Cloud.syncCars().catch(()=>{});
setInterval(()=>{if(!running&&UI.tick)UI.tick()},2000);
if(!Cars.list.length)setTimeout(()=>{},0);
