const MAT={'Стомана (S235)':7850,'Неръждавейка 304':8000,'Алуминий':2700,'Месинг':8500,'Мед':8960,'Бронз':8800,'Чугун':7200};
const sq=x=>x*x, pos=x=>Math.max(0,x);
const stadium=(W,H)=>pos(W-H)*H+Math.PI*sq(H/2);

const IPE={80:6.0,100:8.1,120:10.4,140:12.9,160:15.8,180:18.8,200:22.4,220:26.2,240:30.7,270:36.1,300:42.2,330:49.1,360:57.1,400:66.3,450:77.6,500:90.7,550:106,600:122};
const IPN={80:5.94,100:8.34,120:11.1,140:14.3,160:17.9,180:21.9,200:26.2,220:31.1,240:36.2,260:41.9,280:47.9,300:54.2,320:61.0,340:68.0,360:76.1,380:84.0,400:92.4};
const HEA={100:16.7,120:19.9,140:24.7,160:30.4,180:35.5,200:42.3,220:50.5,240:60.3,260:68.2,280:76.4,300:88.3,320:97.6,340:105,360:112,400:125,450:140,500:155,550:166,600:178};
const HEB={100:20.4,120:26.7,140:33.7,160:42.6,180:51.2,200:61.3,220:71.5,240:83.2,260:93.0,280:103,300:117,320:127,340:134,360:142,400:155,450:171,500:187,550:199,600:212};
const UPN={50:5.59,65:7.09,80:8.64,100:10.6,120:13.4,140:16.0,160:18.8,180:22.0,200:25.3,220:29.4,240:33.2,260:37.9,280:41.8,300:46.2,320:59.5,350:60.6,380:63.1,400:71.8};
const REBAR={};[6,8,10,12,14,16,18,20,22,25,28,32,40].forEach(d=>REBAR[d]=+(Math.PI/4*d*d*1e-6*7850).toFixed(3));

const P={
 round:{g:'Плътни профили', label:'Кръгла плътна стомана', mode:'linear', draw:'round',
   dims:[['d','Диаметър Ø',20]], area:f=>Math.PI/4*sq(f.d), formula:'π/4 · Ø² · ρ'},
 square:{g:'Плътни профили', label:'Плътен квадрат', mode:'linear', draw:'square',
   dims:[['a','Страна a',20]], area:f=>sq(f.a), formula:'a² · ρ'},
 hex:{g:'Плътни профили', label:'Шестостен (по ключ)', mode:'linear', draw:'hex',
   dims:[['s','Ключ S',20]], area:f=>Math.sqrt(3)/2*sq(f.s), formula:'(√3/2) · S² · ρ'},
 flat:{g:'Плътни профили', label:'Шина / плосък', mode:'linear', draw:'flat',
   dims:[['a','Широчина a',40],['b','Дебелина b',5]], area:f=>f.a*f.b, formula:'a · b · ρ'},

 tube_s:{g:'Тръби', label:'Безшевна тръба (кръгла)', mode:'linear', draw:'rtube',
   dims:[['D','Външен Ø',33.7],['t','Стена t',3.2]], area:f=>Math.PI/4*(sq(f.D)-sq(pos(f.D-2*f.t))), formula:'π/4 · (Ø² − (Ø−2t)²) · ρ', check:f=>f.t<=f.D/2},
 tube_w:{g:'Тръби', label:'Шевна тръба (кръгла)', mode:'linear', draw:'rtube',
   dims:[['D','Външен Ø',48.3],['t','Стена t',2.5]], area:f=>Math.PI/4*(sq(f.D)-sq(pos(f.D-2*f.t))), formula:'π/4 · (Ø² − (Ø−2t)²) · ρ', check:f=>f.t<=f.D/2},
 oval:{g:'Тръби', label:'Плоско-овална тръба', mode:'linear', draw:'oval',
   dims:[['W','Голяма ос W',40],['H','Малка ос H',20],['t','Стена t',2]], area:f=>stadium(f.W,f.H)-stadium(pos(f.W-2*f.t),pos(f.H-2*f.t)), formula:'стадион(W,H) − стадион(W−2t,H−2t) · ρ', check:f=>f.t<=f.H/2&&f.H<=f.W},

 shs:{g:'Кухи профили', label:'Кух квадрат (SHS)', mode:'linear', draw:'shs',
   dims:[['a','Страна a',20],['t','Стена t',2]], area:f=>sq(f.a)-sq(pos(f.a-2*f.t)), formula:'(a² − (a−2t)²) · ρ', check:f=>f.t<=f.a/2},
 rhs:{g:'Кухи профили', label:'Кух правоъгълник (RHS)', mode:'linear', draw:'rhs',
   dims:[['a','Страна A',40],['b','Страна B',20],['t','Стена t',2]], area:f=>f.a*f.b-pos(f.a-2*f.t)*pos(f.b-2*f.t), formula:'(A·B − (A−2t)(B−2t)) · ρ', check:f=>f.t<=Math.min(f.a,f.b)/2},

 angle_eq:{g:'Винкели и СОП', label:'Винкел равностранен', mode:'linear', draw:'angle',
   dims:[['a','Рамо a',40],['t','Дебелина t',4]], area:f=>f.t*(2*f.a-f.t), formula:'t · (2a − t) · ρ', check:f=>f.t<=f.a},
 angle_uneq:{g:'Винкели и СОП', label:'Винкел разностранен', mode:'linear', draw:'angle',
   dims:[['a','Рамо a',40],['b','Рамо b',20],['t','Дебелина t',4]], area:f=>f.t*(f.a+f.b-f.t), formula:'t · (a + b − t) · ρ', check:f=>f.t<=Math.min(f.a,f.b)},
 sop_l:{g:'Винкели и СОП', label:'СОП L-образен (студено огънат)', mode:'linear', draw:'angle',
   dims:[['a','Рамо a',40],['b','Рамо b',40],['t','Дебелина t',2]], area:f=>f.t*(f.a+f.b-f.t), formula:'t · (a + b − t) · ρ', check:f=>f.t<=Math.min(f.a,f.b)},
 sop_u:{g:'Винкели и СОП', label:'СОП U-образен (студено огънат)', mode:'linear', draw:'channel',
   dims:[['a','Гръб a',40],['b','Рамо b',20],['t','Дебелина t',2]], area:f=>f.t*(f.a+2*f.b-2*f.t), formula:'t · (a + 2b − 2t) · ρ', check:f=>f.t<=Math.min(f.a,f.b)/2},

 ipe:{g:'Европрофили (греди)', label:'Европрофил IPE', mode:'table', draw:'ibeam', table:IPE, std:'EN 10365 / DIN 1025'},
 ipn:{g:'Европрофили (греди)', label:'Европрофил IPN', mode:'table', draw:'ibeam', table:IPN, std:'DIN 1025-1'},
 hea:{g:'Европрофили (греди)', label:'Европрофил HEA (IPBL)', mode:'table', draw:'ibeam', table:HEA, std:'DIN 1025-3'},
 heb:{g:'Европрофили (греди)', label:'Европрофил HEB (IPB)', mode:'table', draw:'ibeam', table:HEB, std:'DIN 1025-2'},
 upn:{g:'Европрофили (греди)', label:'Европрофил UPN', mode:'table', draw:'channel', table:UPN, std:'DIN 1026-1'},

 rebar:{g:'Армировка', label:'Арматурна стомана', mode:'table', draw:'round', table:REBAR, std:'нормален Ø', unitDesig:'Ø'},

 plate:{g:'Листови', label:'Листова стомана', mode:'plate', draw:'plate', factor:1},
 lt:{g:'Листови', label:'Покривна LT ламарина', mode:'plate', draw:'lt', factor:1.12, hasFactor:true},
};

const $=id=>document.getElementById(id);
let curKey='round', vals={}, desig=null;

function buildProfileSelect(){
  const groups={};
  Object.entries(P).forEach(([k,p])=>{ (groups[p.g]=groups[p.g]||[]).push([k,p.label]); });
  $('profile').innerHTML=Object.entries(groups).map(([g,arr])=>
    '<optgroup label="'+g+'">'+arr.map(([k,l])=>'<option value="'+k+'">'+l+'</option>').join('')+'</optgroup>').join('');
}
function buildMaterialSelect(){ $('material').innerHTML=Object.keys(MAT).map(m=>'<option>'+m+'</option>').join(''); }

function buildDims(){
  const p=P[curKey]; vals={}; desig=null;
  if(p.mode==='table'){
    const keys=Object.keys(p.table); desig=keys[Math.floor(keys.length/3)]||keys[0];
    const u=p.unitDesig||'';
    $('dims').innerHTML='<div class="row"><label>Типоразмер</label><select class="sel" id="desig" style="width:auto;min-width:120px">'+
      keys.map(k=>'<option value="'+k+'"'+(k==desig?' selected':'')+'>'+u+k+'</option>').join('')+'</select></div>';
  } else if(p.mode==='plate'){
    vals={t: curKey==='lt'?0.5:2, w:1000, l:2000, factor:p.factor};
    let h='<div class="row"><label>Дебелина t</label><div class="field"><input class="dim" data-k="t" type="number" value="'+vals.t+'"><span class="u">мм</span></div></div>'+
          '<div class="row"><label>Широчина</label><div class="field"><input class="dim" data-k="w" type="number" value="'+vals.w+'"><span class="u">мм</span></div></div>'+
          '<div class="row"><label>Дължина</label><div class="field"><input class="dim" data-k="l" type="number" value="'+vals.l+'"><span class="u">мм</span></div></div>';
    if(p.hasFactor) h+='<div class="row"><label>Коеф. развитие</label><div class="field"><input class="dim" data-k="factor" type="number" value="'+p.factor+'"><span class="u">×</span></div></div>';
    $('dims').innerHTML=h;
  } else {
    $('dims').innerHTML=p.dims.map(function(d){ vals[d[0]]=d[2];
      return '<div class="row"><label>'+d[1]+'</label><div class="field"><input class="dim" data-k="'+d[0]+'" type="number" value="'+d[2]+'"><span class="u">мм</span></div></div>';
    }).join('');
  }
}

function drawSection(){
  const p=P[curKey], f=vals, cx=80, cy=80, B=140;
  const ink='#1F3864', metal='#8893A4', fillc='#8893A433', white='#F8FAFC';
  const lab=(x,y,t)=>'<text x="'+x+'" y="'+y+'" fill="'+ink+'" font-size="10" font-family="IBM Plex Mono,monospace" text-anchor="middle">'+t+'</text>';
  const sc=mx=>B/Math.max(mx,1);
  let g='';
  if(p.draw==='round'){ const s=sc(f.d||20),R=(f.d||20)/2*s;
    g='<circle cx="'+cx+'" cy="'+cy+'" r="'+R+'" fill="'+fillc+'" stroke="'+metal+'" stroke-width="2"/>'+lab(cx,cy+3,'Ø'+(f.d||desig||'')); }
  else if(p.draw==='square'){ const s=sc(f.a),a=f.a*s;
    g='<rect x="'+(cx-a/2)+'" y="'+(cy-a/2)+'" width="'+a+'" height="'+a+'" fill="'+fillc+'" stroke="'+metal+'" stroke-width="2"/>'+lab(cx,cy+3,f.a); }
  else if(p.draw==='hex'){ const s=sc(f.s),R=f.s/Math.sqrt(3)*s,pts=[];
    for(let i=0;i<6;i++){const an=Math.PI/6+i*Math.PI/3;pts.push((cx+R*Math.cos(an)).toFixed(1)+','+(cy+R*Math.sin(an)).toFixed(1));}
    g='<polygon points="'+pts.join(' ')+'" fill="'+fillc+'" stroke="'+metal+'" stroke-width="2"/>'+lab(cx,cy+3,'S'+f.s); }
  else if(p.draw==='flat'){ const s=sc(Math.max(f.a,f.b)),a=f.a*s,b=Math.max(f.b*s,6);
    g='<rect x="'+(cx-a/2)+'" y="'+(cy-b/2)+'" width="'+a+'" height="'+b+'" fill="'+fillc+'" stroke="'+metal+'" stroke-width="2"/>'+lab(cx,cy-b/2-6,f.a)+lab(cx+a/2+13,cy+3,f.b); }
  else if(p.draw==='rtube'){ const s=sc(f.D),R=f.D/2*s,ri=pos(f.D-2*f.t)/2*s;
    g='<circle cx="'+cx+'" cy="'+cy+'" r="'+R+'" fill="'+fillc+'" stroke="'+metal+'" stroke-width="2"/><circle cx="'+cx+'" cy="'+cy+'" r="'+ri+'" fill="'+white+'" stroke="'+metal+'" stroke-width="1.4"/>'+lab(cx,cy-R-6,'Ø'+f.D); }
  else if(p.draw==='oval'){ const s=sc(f.W),W=f.W*s,H=f.H*s,r=H/2,Wi=pos(f.W-2*f.t)*s,Hi=pos(f.H-2*f.t)*s,ri=Hi/2;
    const ob=(w,h,rr)=>'M '+(cx-w/2+rr)+' '+(cy-h/2)+' L '+(cx+w/2-rr)+' '+(cy-h/2)+' A '+rr+' '+rr+' 0 0 1 '+(cx+w/2-rr)+' '+(cy+h/2)+' L '+(cx-w/2+rr)+' '+(cy+h/2)+' A '+rr+' '+rr+' 0 0 1 '+(cx-w/2+rr)+' '+(cy-h/2)+' Z';
    g='<path d="'+ob(W,H,r)+'" fill="'+fillc+'" stroke="'+metal+'" stroke-width="2"/><path d="'+ob(Wi,Hi,ri)+'" fill="'+white+'" stroke="'+metal+'" stroke-width="1.4"/>'+lab(cx,cy-H/2-6,f.W); }
  else if(p.draw==='shs'){ const s=sc(f.a),a=f.a*s,ai=pos(f.a-2*f.t)*s;
    g='<rect x="'+(cx-a/2)+'" y="'+(cy-a/2)+'" width="'+a+'" height="'+a+'" fill="'+fillc+'" stroke="'+metal+'" stroke-width="2"/><rect x="'+(cx-ai/2)+'" y="'+(cy-ai/2)+'" width="'+ai+'" height="'+ai+'" fill="'+white+'" stroke="'+metal+'" stroke-width="1.4"/>'+lab(cx,cy-a/2-6,f.a); }
  else if(p.draw==='rhs'){ const s=sc(Math.max(f.a,f.b)),a=f.a*s,b=f.b*s,ai=pos(f.a-2*f.t)*s,bi=pos(f.b-2*f.t)*s;
    g='<rect x="'+(cx-a/2)+'" y="'+(cy-b/2)+'" width="'+a+'" height="'+b+'" fill="'+fillc+'" stroke="'+metal+'" stroke-width="2"/><rect x="'+(cx-ai/2)+'" y="'+(cy-bi/2)+'" width="'+ai+'" height="'+bi+'" fill="'+white+'" stroke="'+metal+'" stroke-width="1.4"/>'+lab(cx,cy-b/2-6,f.a)+lab(cx+a/2+13,cy+3,f.b); }
  else if(p.draw==='angle'){ const A=f.a,Bv=(f.b||f.a),t=f.t,s=sc(Math.max(A,Bv));
    const x0=cx-A*s/2,y0=cy+Bv*s/2,pts=[[x0,y0],[x0+A*s,y0],[x0+A*s,y0-t*s],[x0+t*s,y0-t*s],[x0+t*s,y0-Bv*s],[x0,y0-Bv*s]];
    g='<polygon points="'+pts.map(q=>q[0].toFixed(1)+','+q[1].toFixed(1)).join(' ')+'" fill="'+fillc+'" stroke="'+metal+'" stroke-width="2"/>'+lab(x0+A*s/2,y0+13,A)+lab(x0-11,y0-Bv*s/2,Bv); }
  else if(p.draw==='channel'){ const A=f.a||40,Bv=f.b||20,t=(f.t||3),s=sc(Math.max(A,Bv*2));
    const w=Bv*s,h=A*s,x0=cx-w/2,y0=cy-h/2,tt=Math.max(t*s,3);
    const pts=[[x0,y0],[x0+w,y0],[x0+w,y0+tt],[x0+tt,y0+tt],[x0+tt,y0+h-tt],[x0+w,y0+h-tt],[x0+w,y0+h],[x0,y0+h]];
    g='<polygon points="'+pts.map(q=>q[0].toFixed(1)+','+q[1].toFixed(1)).join(' ')+'" fill="'+fillc+'" stroke="'+metal+'" stroke-width="2"/>'; }
  else if(p.draw==='ibeam'){ const W=86,H=104,x0=cx-W/2,y0=cy-H/2,fl=12;
    g='<rect x="'+x0+'" y="'+y0+'" width="'+W+'" height="'+fl+'" fill="'+fillc+'" stroke="'+metal+'" stroke-width="2"/>'+
      '<rect x="'+(cx-9)+'" y="'+(y0+fl)+'" width="18" height="'+(H-2*fl)+'" fill="'+fillc+'" stroke="'+metal+'" stroke-width="2"/>'+
      '<rect x="'+x0+'" y="'+(y0+H-fl)+'" width="'+W+'" height="'+fl+'" fill="'+fillc+'" stroke="'+metal+'" stroke-width="2"/>'; }
  else if(p.draw==='plate'){ const w=120,h=20;
    g='<rect x="'+(cx-w/2)+'" y="'+(cy-h/2)+'" width="'+w+'" height="'+h+'" fill="'+fillc+'" stroke="'+metal+'" stroke-width="2"/>'+lab(cx,cy+4,(vals.t||'')+' мм'); }
  else if(p.draw==='lt'){ let d='M 20 100';for(let i=0;i<3;i++){const x=20+i*40;d+=' L '+(x+8)+' 70 L '+(x+20)+' 70 L '+(x+28)+' 100 L '+(x+40)+' 100';}
    g='<path d="'+d+'" fill="none" stroke="'+metal+'" stroke-width="2.5"/>'+lab(cx,130,(vals.t||'')+' мм'); }
  $('svghost').innerHTML='<svg viewBox="0 0 160 160">'+g+'</svg>';
}

function setLabels(mode){
  const plate=mode==='plate';
  $('lengthRow').style.display=plate?'none':'flex';
  $('qtyLabel').textContent=plate?'Брой листа':'Брой пръти';
  $('dimsLegend').textContent=mode==='table'?'Типоразмер':'Размери';
  $('r_kgm_k').textContent=plate?'Тегло за м²':'Тегло за метър';
  $('r_kgm_u').textContent=plate?'кг/м²':'кг/м';
  $('r_kgpc_k').textContent=plate?'Тегло за лист':'Тегло за прът';
  $('formulaK').textContent=mode==='table'?'Стандарт':'Сечение и формула';
}

function compute(){
  const p=P[curKey], f=vals, rho=parseFloat($('density').value)||0, price=parseFloat($('price').value)||0;
  const qty=Math.max(0,Math.round(parseFloat($('qty').value)||0));
  const bg=n=>n.toLocaleString('bg',{minimumFractionDigits:n<10?3:2,maximumFractionDigits:3});
  let kgm=0, ok=true, perPiece=0, pieceSub='';
  $('warn').style.display='none';

  if(p.mode==='table'){
    kgm=(p.table[desig]||0)*(rho/7850);
    const L=parseFloat($('length').value)||0; perPiece=kgm*L; pieceSub='при '+L+' м';
    $('formula').textContent=(p.unitDesig||'')+desig+' · '+p.std;
    $('areaval').textContent='Стандартно тегло: '+bg(kgm)+' кг/м';
  } else if(p.mode==='plate'){
    const t=f.t||0, w=(f.w||0)/1000, l=(f.l||0)/1000, factor=f.factor||1;
    kgm=(t/1000)*rho*factor;
    perPiece=kgm*w*l; pieceSub=(f.w||0)+'×'+(f.l||0)+' мм';
    $('formula').textContent='кг/м² = коеф · (t/1000) · ρ';
    $('areaval').textContent='Тегло: '+bg(kgm)+' кг/м² · лист '+(w*l).toFixed(2)+' м²';
  } else {
    ok=!p.check||p.check(f);
    $('warn').style.display=ok?'none':'block';
    const a=Math.max(0,p.area(f)); kgm=a*1e-6*rho;
    const L=parseFloat($('length').value)||0; perPiece=kgm*L; pieceSub='при '+L+' м';
    $('formula').textContent=p.formula;
    $('areaval').textContent='Сечение: '+a.toFixed(1)+' мм²  ('+(a/100).toFixed(2)+' см²)';
  }
  const total=perPiece*qty, cost=total*price;
  $('r_kgm').textContent=ok?bg(kgm):'–';
  $('r_kgpc').textContent=ok?bg(perPiece):'–'; $('r_kgpc_sub').textContent=pieceSub;
  $('r_kgtot').textContent=ok?bg(total):'–'; $('r_kgtot_sub').textContent=qty+(p.mode==='plate'?' листа':' пръта');
  $('r_cost').textContent=(ok&&price>0)?cost.toFixed(2).replace('.',',')+' €':'–';
  $('r_cost_sub').textContent=price>0?price+' €/кг':'въведи €/кг';
  drawSection();
}

const NOTES={
 table:'Европрофилите и арматурата се смятат по стандартни каталожни тегла (кг/м) за стомана; при друг материал стойността се мащабира по плътността.',
 plate:'Листът се смята по площ: тегло = площ × дебелина × плътност. За LT ламарина коефициентът на развитие отчита допълнителния материал от профилирането (типично 1,07–1,15).',
 linear:'Теглото е площ на сечението × дължина × плътност. Кухите профили са с остри ъгли (без радиус), затова са леко завишени спрямо каталога.'
};
function selectProfile(k){ curKey=k; const m=P[k].mode; setLabels(m); buildDims();
  $('note').innerHTML='<b>Формулите са стандартни:</b> '+NOTES[m]+' Готовото тегло × €/кг дава цената на материала за офертата.'; compute(); }

$('profile').addEventListener('change',e=>selectProfile(e.target.value));
$('material').addEventListener('change',e=>{ $('density').value=MAT[e.target.value]; compute(); });
document.addEventListener('input',e=>{ if(e.target.classList.contains('dim')){ vals[e.target.dataset.k]=parseFloat(e.target.value)||0; compute(); } });
document.addEventListener('change',e=>{ if(e.target.id==='desig'){ desig=e.target.value; compute(); } });
['density','length','qty','price'].forEach(id=>$(id).addEventListener('input',compute));

buildProfileSelect(); buildMaterialSelect(); selectProfile('round');