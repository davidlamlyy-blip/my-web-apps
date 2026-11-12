/* IELTS Band 7：每日短 drill。冇框架；進度存 server 嘅 data/progress.json。 */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const main=$("#main"),day=(d=0)=>{const t=new Date(Date.now()+d*864e5+8*36e5);return t.toISOString().slice(0,10)};// HKT
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const QT={tfng:"True / False / Not Given",mcq:"Multiple choice",short:"Short answer",complete:"Sentence completion",heading:"Matching headings",match:"Matching information"};
const REASONS=[["para","睇唔出改寫"],["ngf","F／NG 撈亂"],["vocab","生字"],["locate","搵唔到位"],["time","時間唔夠"],["care","粗心"]];
const TAGS={articles:"Articles（a／the）",tense:"Tense",agreement:"主謂一致",plural:"單複數",["sentence-structure"]:"句子結構",["word-choice"]:"用字",collocation:"搭配",preposition:"介詞",punctuation:"標點",register:"語氣"};
const BOX=[0,1,2,4,7,14];
/* 熟悉度＝Leitner 級數 0–5。間隔：陌生 0 日（今日稍後再見）、1、2、4、7、14 日；常錯嘅字縮短（錯 ≥3 次最多 2 日、錯 1–2 次打七折）。
   連續答啱升級，答錯打返陌生，用提示答啱唔升級；去到「熟」之後每答啱一次，錯過紀錄減 1，所以舊錯唔會永遠拖低間隔。 */
const LVZH=["陌生","認得少少","學緊","熟","好熟","穩"];
const dots=b=>"●".repeat(b)+"○".repeat(5-b);
const gap=v=>{if(v.box===0)return 0;let d=BOX[v.box];if(v.lapses>=3)d=Math.min(d,2);else if(v.lapses>=1)d=Math.max(1,Math.round(d*.7));return d};
const weak=id=>{const v=S.vocab[id];return v?(5-v.box)*2+Math.min(v.lapses,4):-1};
const famHtml=c=>{const v=S.vocab[c.id];return v?`<span class="dots">${dots(v.box)}</span> ${LVZH[v.box]}${v.lapses?` · 錯過 ${v.lapses} 次`:""}`:`<span class="dots">${dots(0)}</span> 新字，第一次見`};
const inDays=d=>Math.round((new Date(d+"T00:00:00")-new Date(day()+"T00:00:00"))/864e5);
let S={},GEN=[],clock=null,saveT=null;
const DEF={_rev:0,trap:{},cfg:{exam:day(21),mins:45,L:6.5,Sp:6.5},start:day(),vocab:{},custom:[],reading:[],qstats:{},reasons:{},sprint:{},fix:{},gram:{items:{},units:{},diag:null},combine:{},myfix:[],tone:{},writing:[],days:{},deckOn:Object.keys(VOCAB)};
/* 只有成功 load 過先可以存。server 用 _rev 擋舊分頁；存唔到要講，唔好扮存咗。 */
let loaded=false,saving=false,dirty=false;
/* 手機／iPad（GitHub Pages）冇 server：進度存喺本機 localStorage，再靠 sync.js 同 GitHub 私人 repo 合併。 */
let STATIC=false;const LSKEY="ieltsProgress";
function banner(msg){let b=$("#savebar");if(!msg){b&&b.remove();return}if(!b){b=document.createElement("div");b.id="savebar";b.className="savebar";document.body.append(b)}b.textContent=msg}
async function pushSave(keep){if(!loaded)return;if(saving){dirty=true;return}saving=true;dirty=false;
 if(STATIC){try{localStorage.setItem(LSKEY,JSON.stringify(S));banner("")}catch(e){banner("⚠️ 呢部裝置存唔到紀錄（私隱模式？）")}saving=false;window.scheduleSync&&scheduleSync();return}
 try{const r=await fetch("/api/state",{method:"POST",keepalive:!!keep,headers:{"content-type":"application/json"},body:JSON.stringify(S)});
  if(r.status===409){const j=await(await fetch("/api/state")).json();S=hydrate(j.progress);render();banner("另一個分頁或裝置存咗新紀錄，已載入最新版本（呢頁啱啱嗰一步未計）");setTimeout(()=>banner(""),6000)}
  else if(!r.ok)throw Error("HTTP "+r.status);else{S._rev=(await r.json()).rev;banner("");window.scheduleSync&&scheduleSync()}}
 catch(e){banner("⚠️ 未存到紀錄（server 未開？）唔好閂呢頁，開返 server 就會再存");dirty=true;setTimeout(()=>pushSave(),5000)}
 saving=false;if(dirty)pushSave()}
const save=()=>{S._t=Date.now();clearTimeout(saveT);saveT=setTimeout(pushSave,250)};
addEventListener("pagehide",()=>{if(saveT){clearTimeout(saveT);pushSave(true)}});
const hydrate=p=>{const o={...structuredClone(DEF),...p};o.cfg={...DEF.cfg,...o.cfg};return o};
const mark=k=>{(S.days[day()]??={})[k]=true;save()};
const stopClock=()=>{clearInterval(clock);clock=null};
function timer(el,limit){const t0=Date.now();const tick=()=>{const s=(Date.now()-t0)/1e3|0,left=limit-s,a=Math.abs(left);el.textContent=(left<0?"+":"")+(a/60|0)+":"+String(a%60).padStart(2,"0");el.classList.toggle("over",left<0)};stopClock();tick();clock=setInterval(tick,1e3);return()=>(Date.now()-t0)/1e3|0}

/* ---------- 估分 ---------- */
const GT=[[40,9],[39,8.5],[37,8],[36,7.5],[34,7],[32,6.5],[30,6],[27,5.5],[23,5],[19,4.5],[15,4],[12,3.5],[8,3],[0,2.5]];
const rawBand=r=>GT.find(([m])=>r>=m)[1];
const roundBand=m=>Math.floor(m*2+.5)/2;
function estR(){const l=S.reading.slice(-5);if(!l.length)return null;const k=l.reduce((a,x)=>a+x.score,0)/l.reduce((a,x)=>a+x.total,0);return{raw:Math.round(k*40),band:rawBand(Math.round(k*40)),n:l.length}}
function estW(){const f=k=>[...S.writing].reverse().find(w=>w.kind===k&&w.result)?.result.overall;const a=f("task1"),b=f("task2");if(a==null&&b==null)return null;if(a==null||b==null)return{band:a??b,partial:1};return{band:roundBand((a+2*b)/3)}}
function needed(){const R=estR()?.band??null,W=estW()?.band??null,c=S.cfg;const v=[c.L,R??6,W??6,c.Sp].map(Number);return{R:R??6,W:W??6,mean:v.reduce((a,b)=>a+b)/4,overall:roundBand(v.reduce((a,b)=>a+b)/4),gap:6.75*4-v.reduce((a,b)=>a+b)}}

/* ---------- 今日 ---------- */
const left=()=>Math.ceil((new Date(S.cfg.exam+"T00:00:00+08:00")-new Date(day()+"T00:00:00+08:00"))/864e5);
const phase=()=>{const d=left();return d<=1?{n:"考前休息",k:3,d:"只溫生字，今晚早啲瞓。"}:d<=7?{n:"第 3 階段：實戰",k:2,d:"全部計時，唔再學新字。"}:d<=14?{n:"第 2 階段：加速",k:1,d:"開始計時，由段落寫到全篇。"}:{n:"第 1 階段：打底",k:0,d:"唔使快，先做啱：搞清 TFNG、學架構、清常犯錯。"}};
function weakQ(){let w="tfng",lo=2;for(const k in QT){const q=S.qstats[k]||{ok:0,n:0};const r=q.n<4?.5:q.ok/q.n;if(r<lo){lo=r;w=k}}return w}
const allSets=()=>[...READING,...GEN];
function nextSet(){const done=new Set(S.reading.map(r=>r.id)),qt=weakQ(),p=phase();const pref=p.k===0?[1,2,3]:[3,2,1];
 const cand=allSets().filter(s=>!done.has(s.id));cand.sort((a,b)=>b.qs.filter(q=>q.t===qt).length-a.qs.filter(q=>q.t===qt).length||pref.indexOf(a.sec)-pref.indexOf(b.sec));return cand[0]||null}
function writingToday(){const i=Object.keys(S.days).filter(d=>d<day()).length,p=phase(),k=p.k;
 const W=[["fixit","改句子＋語氣","清你最常犯嘅文法錯",10],["plan","Task 2 五分鐘大綱","練思路，AI 睇論點夠唔夠實",5],["task1","Task 1 寫信","AI 按四項評分",20],["para","Task 2 單段","一段 110–130 字，AI 改",15],["fixit","改句子（重溫你嘅錯）","上次 AI 捉到嘅錯會出返",10],["task2","Task 2 全篇","Writing 佔分最重，每星期起碼 1 篇",40]];
 if(k===3)return W[0];if(k===2)return i%2?W[5]:W[2];if(k===1&&i%3===2)return W[5];return W[i%W.length]}
/* 時間唔夠就輪：Reading／Writing 隔日做；Task 2 嗰日唔加其他大項。 */
function pickBlocks(a){const mins=S.cfg.mins,i=Object.keys(S.days).filter(d=>d<day()).length,base=[a.vocab,a.grammar];const used=x=>x.reduce((t,b)=>t+b[4],0);const both=[...base,a.reading,a.writing];
 let r;if(used(both)<=mins+5)r=both;else if(a.writing[4]>=20)r=[...base,a.writing];else r=[...base,i%2?a.writing:a.reading];
 if(used(r)+a.sprint[4]<=mins+5)r.splice(2,0,a.sprint);return r}
function vocabDue(){const t=day();return allCards().filter(c=>{const v=S.vocab[c.id];return v&&v.due<=t}).length}
function vocabNew(){return[15,10,0,0][phase().k]}
function vToday(){const seenToday=Object.values(S.vocab).filter(v=>v.first===day()).length;return Math.max(0,vocabNew()+(S[extraKey()]||0)-seenToday)}
const extraKey=()=>"extra_"+day();
function vTodayLeft(){return vocabDue()+Math.min(vToday(),allCards().filter(c=>!S.vocab[c.id]).length)}
function today(){const p=phase(),d=left(),done=S.days[day()]||{},n=needed(),rE=estR(),wE=estW(),w=writingToday(),qt=weakQ(),ns=nextSet();
 const gu=weakUnit(),all={vocab:["vocab",`Vocab：${vTodayLeft()} 張`,`到期 ${vocabDue()}＋新字 ${vToday()}，打字默寫`,()=>go("vocab"),10],
  grammar:["grammar",S.gram.diag?`Grammar：${gu.name}`:"Grammar：先做診斷",S.gram.diag?"你最弱嘅單元，10 題":"16 題搵出你最弱單元，約 5 分鐘",()=>S.gram.diag?go("grammar",gu.id):go("grammar","diag"),S.gram.diag?8:5],
  sprint:["sprint","TFNG 極速 10 題","每題 30 秒內判 T／F／NG",()=>go("reading","sprint"),4],
  reading:["reading",ns?`Reading：${ns.title}`:"Reading：出一份新題",`主攻 ${QT[qt]}。${[`唔計時，每題搵到原文先答`,"計時","嚴格計時"][Math.min(p.k,2)]}`,()=>ns?(view.set=ns.id,go("reading","run")):go("reading"),12],
  writing:["writing",w[1],w[2],()=>go("writing",w[0]),w[3]]};
 const B=pickBlocks(all),total=B.reduce((a,b)=>a+b[4],0);
 const pctTxt=rE?`近 ${rE.n} 份 ≈ ${rE.raw}/40`:"未有數據，暫用 6";
 main.innerHTML=`<h1>${d>0?`仲有 ${d} 日`:"考試日"} · ${esc(p.n)}</h1><p class="sub">${esc(p.d)} 全程冇全份 mock，今日做完就收工。</p>
 <div class="card"><div class="row between"><h2 style="margin:0">今日要做</h2><span class="mute small">大約 ${total} 分鐘</span></div>
 ${B.map((b,i)=>`<div class="block ${done[b[0]]?"done":""}"><div class="ic">${done[b[0]]?"✓":i+1}</div><div class="tx"><b>${esc(b[1])}</b><span class="mute small">${esc(b[2])} · ${b[4]} 分鐘</span></div><button class="btn ${done[b[0]]?"":"pri"}" data-i="${i}">${done[b[0]]?"再做":"開始"}</button></div>`).join("")}</div>
 <div class="grid"><div class="card"><h2>離 Band 7 仲差幾多</h2><div class="bandbox">
  <div class="band"><input id="bL" type="number" step=".5" min="4" max="9" value="${S.cfg.L}" aria-label="Listening"><span>Listening（自填）</span></div>
  <div class="band"><em>${n.R}</em><span>Reading</span></div><div class="band"><em>${n.W}</em><span>Writing</span></div>
  <div class="band"><input id="bS" type="number" step=".5" min="4" max="9" value="${S.cfg.Sp}" aria-label="Speaking"><span>Speaking（自填）</span></div></div>
  <p style="margin:12px 0 0"><b>預計 Overall ${n.overall}</b>（平均 ${n.mean.toFixed(2)}）。${n.gap>0?`仲差 ${n.gap.toFixed(1)} 個 band 分（四科總和要 27）。`:"四科總和夠 27，已達 Band 7 線，要守住。"}</p>
  <p class="mute small" style="margin:6px 0 0">Reading：${pctTxt}；Writing：${wE?`AI 估${wE.partial?"（得一個 Task）":""}`:"未有數據，暫用 6"}。呢度只係練習估算，唔係官方預測。</p></div>
 <div class="card"><h2>設定</h2><div class="row"><label>考試日 <input id="exam" type="date" value="${S.cfg.exam}"></label></div>
  <p class="mute small">預設係 3 星期後，請改返你真實考期。</p>
  <div class="row"><span>每日時間</span>${[30,45,60].map(m=>`<button class="btn sm ${S.cfg.mins==m?"sel":""}" data-m="${m}">${m}</button>`).join("")}</div></div></div>`;
 $$("[data-i]").forEach(b=>b.onclick=()=>B[+b.dataset.i][3]());
 $("#exam").onchange=e=>{S.cfg.exam=e.target.value;save();render()};
 $$("[data-m]").forEach(b=>b.onclick=()=>{S.cfg.mins=+b.dataset.m;save();render()});
 $("#bL").onchange=e=>{S.cfg.L=+e.target.value;save();render()};$("#bS").onchange=e=>{S.cfg.Sp=+e.target.value;save();render()}}

/* ---------- Vocab ---------- */
function allCards(){const o=[];for(const k of S.deckOn||[]){(VOCAB[k]||[]).forEach(c=>o.push({id:c[0],w:c[0],zh:c[1],para:c[2],cl:c[3],a:c[4]||c[0],deck:k}))}
 S.custom.forEach(c=>o.push({id:"my:"+c.w,w:c.w,zh:c.zh||"（你自己加嘅字）",para:c.para||"",cl:c.cl,a:c.w,deck:"我嘅生字"}));return o}
const nrm=s=>s.toLowerCase().replace(/[’]/g,"'").replace(/[.,!?;:]+$/,"").replace(/\s+/g," ").trim();
function lev(a,b){const d=Array.from({length:a.length+1},(_, i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length]}
function vocab(){const t=day(),cs=allCards();const due=shuffle(cs.filter(c=>S.vocab[c.id]&&S.vocab[c.id].due<=t)).sort((a,b)=>weak(b.id)-weak(a.id));const nw=cs.filter(c=>!S.vocab[c.id]).slice(0,vToday());
 const q=[...due,...shuffle(nw)];const boxes=[0,0,0,0,0,0];Object.values(S.vocab).forEach(v=>boxes[v.box]++);const learnt=boxes[4]+boxes[5],seen=Object.keys(S.vocab).length,tomorrow=Object.values(S.vocab).filter(v=>v.due<=day(1)).length,firstToday=Object.values(S.vocab).filter(v=>v.first===day()).length;
 main.innerHTML=`<h1>Vocab</h1><p class="sub">唔係背單字表：每張都喺句子入面默寫，同時記佢喺 Reading 會點改寫。</p>
 <div class="card"><div class="row between"><span>今日剩 <b>${q.length}</b> 張 · 學緊 <b>${seen-learnt}</b> · 已穩 <b>${learnt}</b> · 全部 ${cs.length}</span><button class="btn pri" id="go" ${q.length?"":"disabled"}>開始</button></div>
 ${q.length?"":`<div class="notice" style="margin:12px 0 0">今日已學 ${firstToday} 張新字，做晒。聽日有 ${tomorrow} 張到期要溫（要隔日再考先記得）。<button class="btn sm" id="more" style="margin-left:8px">再學 10 張</button></div>`}
 <h3>熟悉度</h3>${bars([...boxes.map((n,i)=>[`${dots(i)} ${LVZH[i]}`,n,String(n),n/Math.max(1,cs.length)*100]),["○○○○○ 未見",cs.length-seen,String(cs.length-seen),(cs.length-seen)/Math.max(1,cs.length)*100]])}
 <p class="mute small" style="margin:4px 0 0">出現次序：今日到期嘅字先，最弱（級數低、常錯）排最前，之後先到新字。答啱升一級、答錯打返陌生；用提示唔升級；常錯嘅字間隔縮短。</p>
 <details style="margin-top:8px"><summary class="small">睇每個字嘅熟悉度（最弱排先）</summary><table style="margin-top:6px"><thead><tr><th>字</th><th>熟悉度</th><th>錯過</th><th>下次</th></tr></thead><tbody>${cs.filter(c=>S.vocab[c.id]).sort((a,b)=>weak(b.id)-weak(a.id)).map(c=>{const v=S.vocab[c.id],d=inDays(v.due);return`<tr><td>${esc(c.w)}</td><td><span class="dots">${dots(v.box)}</span> <span class="small mute">${LVZH[v.box]}</span></td><td>${v.lapses||""}</td><td class="small">${d<=0?"今日":d+" 日後"}</td></tr>`}).join("")}</tbody></table></details>
 <h3>字庫</h3><div class="row">${Object.keys(VOCAB).map(k=>`<button class="btn sm ${S.deckOn.includes(k)?"sel":""}" data-d="${esc(k)}">${esc(k)}（${VOCAB[k].length}）</button>`).join("")}</div>
 <p class="mute small" style="margin-bottom:0">做 Reading 對完答案之後，喺文章 select 一個字就可以加入生字。而家有 ${S.custom.length} 個。</p></div>`;
 $$("[data-d]").forEach(b=>b.onclick=()=>{const k=b.dataset.d,i=S.deckOn.indexOf(k);i<0?S.deckOn.push(k):S.deckOn.splice(i,1);save();render()});
 $("#go").onclick=()=>vRun(q,0,q.length);$("#more")&&($("#more").onclick=()=>{S[extraKey()]=(S[extraKey()]||0)+10;save();render()})}
function vRun(q,ok,total){if(!q.length){mark("vocab");main.innerHTML=`<div class="flash card"><div class="big">完成</div><p>今輪 ${total} 張做晒。</p><button class="btn pri" onclick="go('today')">返今日</button></div>`;return}
 const c=q[0];let hint=0;
 main.innerHTML=`<div class="flash card"><div class="mute small">剩 ${q.length} 張 · ${esc(c.deck)}</div><div class="small" style="margin:3px 0 6px">${famHtml(c)}</div><div class="zh">${esc(c.zh)}</div>${c.para?`<div class="mute">≈ ${esc(c.para)}</div>`:""}
 <div class="cl">${esc(c.cl).replace("___","<b>______</b>")}</div><input id="a" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="答案"><div id="fb" style="min-height:64px;margin-top:10px"></div>
 <div class="row" style="justify-content:center"><button class="btn sm" id="h">提示</button><button class="btn sm pri" id="c">Check（Enter）</button></div></div>`;
 const inp=$("#a");inp.focus();
 $("#h").onclick=()=>{hint++;$("#fb").innerHTML=`<span class="mute">${esc(c.a.slice(0,hint+1))}…（${c.a.length} 個字元）</span>`};
 const check=()=>{const g=nrm(inp.value),ans=nrm(c.a),base=nrm(c.w);if(!g)return;const d=Math.min(lev(g,ans),lev(g,base));const good=g===ans||g===base;const close=!good&&d<=1&&ans.length>5;
  const v=S.vocab[c.id]||(S.vocab[c.id]={box:0,first:day(),lapses:0}),old=v.box;const pass=(good||close)&&!hint;
  if(pass){v.box=Math.min(5,v.box+1);if(v.box>=3&&v.lapses>0)v.lapses--}else{v.box=hint&&(good||close)?v.box:0;if(!good&&!close)v.lapses++}
  const gp=gap(v);v.due=day(gp);save();
  $("#fb").innerHTML=`<div class="r ${good?"ok":close?"":"bad"}" style="${close?"background:var(--warn)":""}"><b>${esc(c.a)}</b>${close?"：差少少，串法要留意":good?"":`（你答：${esc(inp.value)}）`}<div class="small" style="margin-top:6px">熟悉度 <span class="dots">${dots(old)}</span> → <b class="dots">${dots(v.box)}</b>　${hint&&(good||close)?"用咗提示，唔升級；":""}${gp===0?"今日稍後再見":gp+" 日後再見"}</div></div>`;
  inp.disabled=true;const nq=q.slice(1);if(!pass)nq.splice(Math.min(3,nq.length),0,c);
  const b=$("#c");b.textContent="下一張（Enter）";b.onclick=()=>vRun(nq,ok+(pass?1:0),total);$("#h").hidden=true;
  document.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();document.onkeydown=null;b.click()}}};
 $("#c").onclick=check;inp.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();e.stopPropagation();check()}}}

/* ---------- Reading ---------- */
function reading(sub){if(sub==="sprint")return sprint();if(sub==="run"&&view.set)return rRun(allSets().find(s=>s.id===view.set));
 const best=id=>{const r=S.reading.filter(x=>x.id===id);return r.length?`${r.at(-1).score}/${r.at(-1).total}`:""};
 const sec=["","Section 1 · 日常通告","Section 2 · 職場文件","Section 3 · 長文"];
 main.innerHTML=`<h1>Reading</h1><p class="sub">GT Band 7 約要 40 題中 34 題。由 6 分（約 30）到 7 分其實只係多 4 題，所以最值得練係唔再撞 F／NG 陷阱。</p>
 <details class="card"><summary><b>Band 7 Reading 八招</b> <span class="mute small">（撳開）</span></summary><ol class="tight" style="margin-top:10px">
<li><b>捉改寫：</b>題目幾乎唔會用原文個字。交卷後睇「原文證據」，對住題目逐個字配對，呢個係升分最大嘅一招。</li>
<li><b>先睇題，再搵錨：</b>人名、數字、日期、大楷字、少見嘅字最易喺文章搵到；搵到位先細讀前後兩三句。</li>
<li><b>TFNG 只問一句：</b>文章有冇講呢一點？冇講＝NG；有講但相反＝F。唔好用常識補。</li>
<li><b>盯住範圍字：</b>all／most／some、always／never／usually、may／will、only。範圍或者語氣唔同，通常就係 F。</li>
<li><b>Heading 睇段落大意：</b>讀每段第一同最後一句；heading 講成段，唔係其中一個細節。同段有一模一樣嘅字，通常係陷阱。</li>
<li><b>填充題先估詞性：</b>空格要名詞、動詞定數字？字數限制要守，串法照抄原文。</li>
<li><b>題目次序：</b>TFNG、填充、短答通常跟文章次序；配對段落（matching information）唔跟。</li>
<li><b>時間：</b>Section 1、2 盡快，Section 3 留 25 分鐘以上；一題卡超過 90 秒就估一個答案，之後再返嚟。40 題全部要填。</li></ol></details>
 <div class="grid" style="margin-top:14px"><div class="card"><h2>TFNG 極速</h2><p class="small mute">一句原文、一句陳述。專治 False 同 Not Given 撈亂。</p><button class="btn pri" id="sp">開始 10 題</button></div>
 <div class="card"><h2>出新題 🤖</h2><p class="small mute">AI 即場出一份原創題，約 2–3 分鐘，自動驗證答案。</p><div class="row"><select id="gs"><option value="1">Section 1</option><option value="2">Section 2</option><option value="3" selected>Section 3</option></select><select id="gq">${Object.keys(QT).map(k=>`<option value="${k}" ${k===weakQ()?"selected":""}>${QT[k]}</option>`).join("")}</select><button class="btn" id="gen">出題</button></div><div id="gm" class="small" style="margin-top:6px"></div></div></div>
 <div class="card" style="margin-top:14px"><h2>題庫（${allSets().length} 份）</h2><table><thead><tr><th>題目</th><th>類型</th><th>題數</th><th>上次</th><th></th></tr></thead><tbody>
 ${allSets().map(s=>`<tr><td>${esc(s.title)}${s.ai?' <span class="mute small">AI</span>':""}</td><td class="small">${sec[s.sec]}</td><td>${s.qs.length}</td><td>${best(s.id)}</td><td><button class="btn sm" data-s="${s.id}">${best(s.id)?"再做":"做"}</button>${S.reading.some(r=>r.id===s.id&&r.answers)?` <button class="btn sm" data-rv="${s.id}">檢討</button>`:""}</td></tr>`).join("")}</tbody></table></div>`;
 $("#sp").onclick=()=>sprint();$$("[data-s]").forEach(b=>b.onclick=()=>{view.set=b.dataset.s;go("reading","run")});$$("td [data-rv]").forEach(b=>b.onclick=()=>{view.set=b.dataset.rv;view.replay=true;go("reading","run")});
 $("#gen").onclick=async()=>{const m=$("#gm"),b=$("#gen");b.disabled=true;m.innerHTML='<span class="spin"></span> 出緊題…';try{const r=await fetch("/api/generate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sec:+$("#gs").value,qtype:$("#gq").value})});const j=await r.json();if(!r.ok)throw Error(j.error);GEN.push(j);view.set=j.id;go("reading","run")}catch(e){m.textContent="出唔到："+e.message+"（要開本機 server 同 claude CLI）";b.disabled=false}}}
function sprint(){const st=S.sprint,it=SPRINT.map((x,i)=>({...x,i}));const wr=i=>(st[i]?.bad||0)-(st[i]?.ok||0);const q=shuffle(it).sort((a,b)=>wr(b.i)-wr(a.i)).slice(0,10);let i=0,ok=0;
 const show=()=>{if(i>=q.length){mark("sprint");main.innerHTML=`<div class="flash card"><div class="big">${ok}/${q.length}</div><p>${ok>=8?"F／NG 開始穩。":"錯嗰幾題下次會優先再出。"}</p><div class="row" style="justify-content:center"><button class="btn" onclick="sprint()">再嚟</button><button class="btn pri" onclick="go('today')">返今日</button></div></div>`;return}
  const c=q[i];main.innerHTML=`<div class="flash card" style="text-align:left"><div class="row between"><span class="mute small">${i+1} / ${q.length}</span><span class="timer" id="tm"></span></div><h3>原文</h3><div style="font:18px/1.5 var(--serif)">${esc(c.s)}</div><h3>陳述</h3><div style="font:18px/1.5 var(--serif)">${esc(c.q)}</div>
  <div class="row" style="margin-top:14px"><button class="btn" data-a="T">True（1）</button><button class="btn" data-a="F">False（2）</button><button class="btn" data-a="NG">Not Given（3）</button></div><div id="fb"></div></div>`;
  timer($("#tm"),30);const pick=a=>{stopClock();document.onkeydown=null;const good=a===c.a;const s=st[c.i]||(st[c.i]={ok:0,bad:0});good?(s.ok++,ok++):s.bad++;const q2=S.qstats.tfng||(S.qstats.tfng={ok:0,n:0});q2.n++;if(good)q2.ok++;save();
   const nm=x=>x==="NG"?"Not Given":x==="T"?"True":"False";$("#fb").innerHTML=`<div class="r ${good?"ok":"bad"}">${good?`<b>✓ ${nm(c.a)}</b>`:`<b>✗ 你揀咗 ${nm(a)}</b>，正確答案係 <b>${nm(c.a)}</b>`}<div>${esc(c.why)}</div></div><button class="btn pri" id="nx" style="margin-top:9px">下一題（Enter）</button>`;$$("[data-a]").forEach(b=>b.disabled=true);
   const nx=()=>{document.onkeydown=null;i++;show()};$("#nx").onclick=nx;document.onkeydown=e=>{if(e.key==="Enter")nx()}};
  $$("[data-a]").forEach(b=>b.onclick=()=>pick(b.dataset.a));document.onkeydown=e=>{const m={1:"T",2:"F",3:"NG"}[e.key];if(m)pick(m)}};show()}
const L="ABCDEFGHIJ";
function rRun(s){if(!s)return go("reading");main.classList.add("wide");const lim=s.qs.length*90,strict=phase().k>0;const rep=view.replay?[...S.reading].reverse().find(r=>r.id===s.id&&r.answers):null;view.replay=false;
 main.innerHTML=`<div class="row between" style="margin-bottom:12px"><div><h1 style="font-size:21px">${esc(s.title)}</h1><span class="mute small">Section ${s.sec} · ${s.qs.length} 題 · 建議 ${lim/60|0} 分鐘${strict?"":"（打底期可以超時，準確先）"}</span></div><span class="timer" id="tm"></span></div>
 <div class="split"><div class="card passage" id="pass">${s.paras.map((p,i)=>`<p><span class="pl">${L[i]}</span><span class="tx" data-hl="p${i}">${esc(p)}</span></p>`).join("")}</div>
 <div class="card"><p class="small mute" style="margin:0 0 6px">🖍 喺文章或者題目拖選字句就會 highlight，撳返 highlight 就取消。</p><div id="qs">${s.qs.map((q,i)=>qHtml(q,i,s)).join("")}</div><button class="btn pri" id="sub" style="margin-top:12px">交卷對答案</button></div></div>`;
 hlInit(s);hlBind(null);if(rep){$("#tm").textContent="檢討";s.qs.forEach((q,i)=>{const a=rep.answers[i]||"",es=$$(`[name=q${i}]`);if(es[0]?.type==="radio")es.forEach(e=>{e.checked=e.value===a});else if(es[0])es[0].value=a});return rGrade(s,rep.secs,rep)}const el=timer($("#tm"),lim);$("#sub").onclick=()=>{if($$(".q").some((_,i)=>!val(s.qs[i],i))&&!confirm("仲有題未答，照交？"))return;const sec=el();stopClock();rGrade(s,sec)}}
function qHtml(q,i,s){const n=`<span class="n">${i+1}</span>`,qt=`<span class="tx" data-hl="q${i}">${esc(q.q)}</span>`;
 if(q.t==="tfng")return`<div class="q"><div class="qt">${n}${qt}</div><div class="row">${["T","F","NG"].map(a=>`<label class="opt"><input type="radio" name="q${i}" value="${a}">${a==="NG"?"Not Given":a==="T"?"True":"False"}</label>`).join("")}</div></div>`;
 if(q.t==="mcq")return`<div class="q"><div class="qt">${n}${qt}</div>${q.o.map(o=>`<label class="opt"><input type="radio" name="q${i}" value="${esc(o)}">${esc(o)}</label>`).join("")}</div>`;
 if(q.t==="heading")return`<div class="q"><div class="qt">${n}最啱 ${qt} 嘅 heading</div>${q.o.map(o=>`<label class="opt"><input type="radio" name="q${i}" value="${esc(o)}"><span data-hl="o${i}_${q.o.indexOf(o)}">${esc(o)}</span></label>`).join("")}</div>`;
 if(q.t==="match")return`<div class="q"><div class="qt">${n}${qt}</div><div class="row">${s.paras.map((_,j)=>`<label class="opt"><input type="radio" name="q${i}" value="${L[j]}">段 ${L[j]}</label>`).join("")}</div></div>`;
 return`<div class="q"><div class="qt">${n}${qt}</div><input type="text" name="q${i}" autocomplete="off" spellcheck="false" style="width:240px"></div>`}
const val=(q,i)=>{const e=$$(`[name=q${i}]`);if(e[0]?.type==="radio")return e.find(x=>x.checked)?.value||"";return(e[0]?.value||"").trim()};
const showA=q=>Array.isArray(q.a)?q.a[0]:q.a==="NG"?"Not Given":q.a==="T"?"True":q.a==="F"?"False":q.a;
function isRight(q,v){if(Array.isArray(q.a)){const c=x=>nrm(x).replace(/^(the|a|an) /,"");return q.a.some(a=>c(a)===c(v))}return v===q.a}
function rGrade(s,sec,rep){const an=rep?rep.answers:s.qs.map((q,i)=>val(q,i));let ok=0;s.qs.forEach((q,i)=>{const g=isRight(q,an[i]);if(g)ok++;if(rep)return;const st=S.qstats[q.t]||(S.qstats[q.t]={ok:0,n:0});st.n++;if(g)st.ok++;const tr=S.trap[q.trap||"detail"]??={ok:0,n:0};tr.n++;if(g)tr.ok++});
 const rec=rep||{id:s.id,date:day(),score:ok,total:s.qs.length,secs:sec,tags:{},answers:an};if(!rep){S.reading.push(rec);mark("reading");save()}
 $$(".q").forEach((d,i)=>{const q=s.qs[i],g=isRight(q,an[i]);d.querySelectorAll("input,select").forEach(x=>x.disabled=true);
  d.insertAdjacentHTML("beforeend",`<div class="r ${g?"ok":"bad"}"><b>${g?"✓":"✗"} ${esc(showA(q))}</b>${g?"":`　你答：${esc(an[i]||"（冇答）")}`}<div>${esc(q.why)}</div><div class="row" style="margin-top:6px"><button class="btn sm" data-ev="${i}">睇原文證據</button></div>${g?"":`<div class="tags" data-q="${i}">${REASONS.map(r=>`<span class="tag" data-r="${r[0]}">${r[1]}</span>`).join("")}</div>`}</div>`)});
 const pct=Math.round(ok/s.qs.length*40);$("#sub").outerHTML=`<div class="row" style="margin-top:12px"><button class="btn pri" onclick="go('today')">返今日</button><button class="btn" onclick="go('reading')">題庫</button></div>`;$("#qs").insertAdjacentHTML("beforebegin",`<div class="notice"><b>${ok}/${s.qs.length}</b>（${sec/60|0} 分 ${sec%60} 秒），折合約 ${pct}/40 ≈ Band ${rawBand(pct)}。${rep?`（${rep.date} 嗰次嘅檢討）`:""}下面有分頁：<b>答案、技巧、結構、生字</b>，逐個睇晒先算檢討完。</div><div class="rvtabs" id="rvtabs"></div>`);
 $("#main").scrollTop=0;window.scrollTo(0,0);
 $$("[data-ev]").forEach(b=>b.onclick=()=>hl(s,s.qs[+b.dataset.ev]));
 $$(".tag").forEach(t=>t.onclick=()=>{const w=t.parentNode.dataset.q,old=rec.tags[w];if(old)S.reasons[old]=Math.max(0,(S.reasons[old]||0)-1);$$(".tag",t.parentNode).forEach(x=>x.classList.remove("on"));if(old===t.dataset.r){delete rec.tags[w]}else{rec.tags[w]=t.dataset.r;S.reasons[t.dataset.r]=(S.reasons[t.dataset.r]||0)+1;t.classList.add("on")}save()});
 Object.entries(rec.tags||{}).forEach(([q,r])=>$(`.tags[data-q="${q}"] [data-r="${r}"]`)?.classList.add("on"));
 selWatch(s);reviewTabs(s,an,sec,s.qs.length*90)}
const SK={paraphrase:["捉改寫","題目幾乎唔會用原文個字。對住原文證據逐字配對：題目個字，喺原文變咗乜？"],"ng-vs-f":["F／NG 分辨","只問一句：文章有冇講呢一點？冇講＝NG；有講但相反＝F。唔好用常識補，留意 all／most／may 呢類範圍字。"],detail:["搵錨＋睇細節","先喺題目揀人名、數字、日期、大楷字做錨，喺原文搵到先細讀前後兩三句。"],inference:["推論／睇大意","問 mainly／best／suggests 嘅題，答案喺首句、尾句或者轉折詞（however、yet、argue）後面；中間嘅例子只係陷阱。"]};
const TRAPZH={paraphrase:"改寫","ng-vs-f":"F／NG 分辨",detail:"細節／數字",inference:"推論／大意"};
/* 交卷後分頁式檢討：技巧（唔使 AI）、結構（AI）、生字（AI）。4 個分頁都睇過先算檢討完。 */
function reviewTabs(s,an,sec,lim){const tabs=[["ans","答案"],["skill","技巧"],["struct","結構"],["vocab","生字"]],qs=$("#qs"),seen=new Set(["ans"]);
 const mk=id=>{const d=document.createElement("div");d.id="rv-"+id;d.style.display="none";return d},P={skill:mk("skill"),struct:mk("struct"),vocab:mk("vocab")};qs.after(P.skill,P.struct,P.vocab);
 skillPanel(s,an,sec,lim,P.skill);structPanel(s,an,P.struct);setVocab(s,an,P.vocab);
 const bar=$("#rvtabs"),draw=cur=>{bar.innerHTML=tabs.map(t=>`<button class="btn sm ${t[0]===cur?"sel":""}" data-rv="${t[0]}">${t[1]}${seen.has(t[0])?"":' <span class="dot"></span>'}</button>`).join("")+(seen.size<4?`<span class="small mute" style="margin-left:6px">未睇：${tabs.filter(t=>!seen.has(t[0])).map(t=>t[1]).join("、")}</span>`:`<span class="small" style="margin-left:6px;color:var(--ok)">✓ 4 項都睇過</span>`);
  qs.style.display=cur==="ans"?"":"none";for(const k in P)P[k].style.display=cur===k?"":"none";$$("[data-rv]",bar).forEach(b=>b.onclick=()=>{seen.add(b.dataset.rv);draw(b.dataset.rv)})};draw("ans")}
function skillPanel(s,an,sec,lim,box){const by={};s.qs.forEach((q,i)=>{const t=q.trap&&SK[q.trap]?q.trap:"detail",g=isRight(q,an[i]);const o=by[t]??={ok:0,n:0,bad:[]};o.n++;if(g)o.ok++;else o.bad.push(i)});
 const keys=Object.keys(by).sort((a,b)=>(by[b].n-by[b].ok)-(by[a].n-by[a].ok)),bad=keys.filter(k=>by[k].bad.length),over=sec-lim;
 box.innerHTML=`<h2>今次用到嘅技巧</h2><p class="small mute" style="margin-top:-4px">按你今次失分嘅題型，配返要練嘅招。</p>
 ${bad.length?`<div class="notice">今次最要補：<b>${esc(SK[bad[0]][0])}</b>（錯 ${by[bad[0]].bad.length} 題）。下次做呢類題之前，先讀一次下面嘅提示。</div>`:`<div class="notice" style="background:var(--okbg)">全部啱。下一步：計時做，或者轉做出新題。</div>`}
 ${keys.map(k=>`<div class="block" style="align-items:flex-start"><div class="ic">${by[k].bad.length?"✗":"✓"}</div><div class="tx"><b>${esc(SK[k][0])}　${by[k].ok}/${by[k].n}</b><div class="small">${esc(SK[k][1])}</div>${by[k].bad.map(i=>`<div class="small mute" style="margin-top:4px">第 ${i+1} 題：你答 ${esc(an[i]||"（冇答）")}，應該係 <b>${esc(showA(s.qs[i]))}</b>。${esc(s.qs[i].why)}</div>`).join("")}</div></div>`).join("")}
 <div class="block"><div class="ic">⏱</div><div class="tx"><b>時間</b><div class="small">${sec/60|0} 分 ${sec%60} 秒（建議 ${lim/60|0} 分鐘）。${over>60?`超咗 ${Math.round(over/60)} 分鐘：打底期可以，之後要計時；一題卡超過 90 秒就估一個先過。`:"時間冇問題。"}</div></div></div>
 <details style="margin-top:8px"><summary class="small">睇全部 4 類技巧</summary>${Object.keys(SK).map(k=>`<p class="small"><b>${esc(SK[k][0])}：</b>${esc(SK[k][1])}</p>`).join("")}</details>`}
/* 交卷後：逐段拆結構。「結構」係生字之外，最影響 Heading／mainly 題嘅技巧。 */
const ROLEZH={intro:"引入",argument:"論點",example:"例子",contrast:"對比",counterpoint:"反面意見",conclusion:"結論",data:"資料／數據"};
let STR={};
function structPanel(s,an,box){
 /* 邊啲題嘅證據喺邊段：錯咗嘅題標返出嚟 */
 const where={};s.qs.forEach((q,i)=>{if(!q.ev||isRight(q,an[i]))return;s.paras.forEach((p,j)=>{if(p.includes(q.ev))(where[j]??=[]).push(i+1)})});
 const draw=ps=>{box.innerHTML=`<h2>文章結構</h2><p class="small mute" style="margin-top:-4px">睇完答案，再睇作者點砌呢篇。<span class="st-key">綠底＝重點句</span>　<span class="st-ex">灰底＝例子／細節</span>　<span class="st-sig">底線＝轉折詞</span></p>
  <div class="row" style="margin-bottom:6px"><button class="btn sm pri" id="stall">喺文章標出全部結構</button><button class="btn sm" id="stclr">清除標記</button></div>
  ${ps.map((v,i)=>`<div class="block" style="align-items:flex-start;cursor:pointer" data-sp="${i}"><div class="ic">${L[i]}</div><div class="tx"><b>${esc(ROLEZH[v.role]||v.role)}：${esc(v.main)}</b>${where[i]?`<div class="small" style="color:var(--bad)">你錯嘅第 ${where[i].join("、")} 題，證據喺呢段</div>`:""}${v.tip?`<div class="small mute">${esc(v.tip)}</div>`:""}</div></div>`).join("")}`;
  const mark=(i,on)=>{const v=ps[i],t=s.paras[i],r=[];if(on){const add=(x,c)=>{const k=t.indexOf(x);if(k>=0)r.push([k,k+x.length,c])};v.ex.forEach(x=>add(x,"ex"));v.sig.forEach(x=>add(x,"sig"));add(v.key,"key")}HL.st["p"+i]=r};
  $("#stall").onclick=()=>{ps.forEach((_,i)=>mark(i,true));hlPaint();$("#pass .st-key")?.scrollIntoView({block:"center",behavior:"smooth"})};
  $("#stclr").onclick=()=>{ps.forEach((_,i)=>mark(i,false));hlPaint()};
  $$("[data-sp]").forEach(d=>d.onclick=()=>{const i=+d.dataset.sp;ps.forEach((_,j)=>mark(j,j===i));hlPaint();$$("#pass p")[i]?.scrollIntoView({block:"center",behavior:"smooth"})})};
 if(STR[s.id])return draw(STR[s.id]);
 box.innerHTML='<h2>文章結構</h2><p class="small"><span class="spin"></span> AI 拆緊每段結構，大約半分鐘至 1 分鐘…</p>';
 fetch("/api/structure",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:s.id,paras:s.paras})}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error);STR[s.id]=j.paras;if(box.isConnected)draw(j.paras)}).catch(e=>{box.innerHTML=`<h2>文章結構</h2><p class="small">整唔到：${esc(e.message)}。可以自己試：每段首句同尾句，加上 however、yet、argue 後面嘅句。</p>`})}
/* 交卷後先教字：做題時要估生字（考試都係咁），對完答案先學，記得牢啲。 */
let SETV={};
function setVocab(s,an,box){
 const draw=items=>{const have=new Set([...allCards().map(c=>nrm(c.w))]);const wrongQ=new Set(s.qs.map((q,i)=>isRight(q,an[i])?null:i+1).filter(Boolean));
  box.innerHTML=`<h2>呢篇要識嘅字</h2><p class="small mute" style="margin-top:-4px">做題時估，對完答案先學。紅色＝同你答錯嗰題有關。</p>${items.map((v,i)=>{const dup=have.has(nrm(v.w)),hot=v.q&&wrongQ.has(v.q);return`<label class="opt" style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" data-v="${i}" ${dup?"disabled":"checked"} style="margin-top:5px"><span><b>${esc(v.w)}</b>　${esc(v.zh)}${v.para?` <span class="mute">≈ ${esc(v.para)}</span>`:""}${v.q?` <span class="small" style="color:${hot?"var(--bad)":"var(--mute)"}">第 ${v.q} 題</span>`:""}${dup?' <span class="small mute">已喺 Vocab</span>':""}<br><span class="small mute">${esc(v.sent)}</span></span></label>`}).join("")}<button class="btn pri" id="svadd" style="margin-top:8px">加入 Vocab</button> <span id="svm" class="small mute"></span>`;
  $("#svadd").onclick=()=>{let n=0;$$("[data-v]:checked").forEach(c=>{const v=items[+c.dataset.v];if(S.custom.some(x=>nrm(x.w)===nrm(v.w)))return;const re=new RegExp(v.w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i");S.custom.push({w:v.w,zh:v.zh,para:v.para,cl:v.sent.replace(re,"___")});n++;c.checked=false;c.disabled=true});save();$("#svm").textContent=`加咗 ${n} 個，聽日開始喺 Vocab 溫。`}};
 if(SETV[s.id])return draw(SETV[s.id]);
 box.innerHTML='<h2>呢篇要識嘅字</h2><p class="small"><span class="spin"></span> AI 揀緊呢篇嘅關鍵字，大約半分鐘至 1 分鐘…</p>';
 fetch("/api/setvocab",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:s.id,title:s.title,paras:s.paras,qs:s.qs.map(q=>({q:q.q,a:q.a,ev:q.ev}))})}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error);SETV[s.id]=j.items;if(box.isConnected)draw(j.items)}).catch(e=>{box.innerHTML=`<h2>呢篇要識嘅字</h2><p class="small">整唔到：${esc(e.message)}。可以喺文章拖選個字，自己加入生字。</p>`})}
function hl(s,q){HL.ev={};s.paras.forEach((p,i)=>{const k=q.ev?p.indexOf(q.ev):-1;if(k>=0)HL.ev["p"+i]=[k,k+q.ev.length]});hlPaint();$("#pass mark.ev")?.scrollIntoView({block:"center",behavior:"smooth"})}
/* Highlight：每段／每題記低 [start,end] 字元位置，重畫時先包 <mark>。 */
let HL={src:{},r:{},ev:{},st:{}};
function hlInit(s){HL={src:{},r:{},ev:{},st:{}};s.paras.forEach((p,i)=>HL.src["p"+i]=p);s.qs.forEach((q,i)=>{HL.src["q"+i]=q.q;(q.o||[]).forEach((o,j)=>HL.src["o"+i+"_"+j]=o)})}
function hlHtml(k){const t=HL.src[k],rs=HL.r[k]||[],ev=HL.ev[k],st=HL.st[k]||[],cut=new Set([0,t.length]);rs.forEach(r=>{cut.add(r[0]);cut.add(r[1])});st.forEach(r=>{cut.add(r[0]);cut.add(r[1])});if(ev){cut.add(ev[0]);cut.add(ev[1])}
 const pts=[...cut].sort((a,b)=>a-b);let h="";for(let j=0;j<pts.length-1;j++){const a=pts[j],b=pts[j+1],seg=esc(t.slice(a,b)),ri=rs.findIndex(r=>r[0]<=a&&r[1]>=b),e=ev&&ev[0]<=a&&ev[1]>=b;
  let x=seg;const sc=["key","ex","sig"].filter(c=>st.some(r=>r[2]===c&&r[0]<=a&&r[1]>=b));if(sc.length)x=`<span class="${sc.map(c=>"st-"+c).join(" ")}">${x}</span>`;if(ri>=0)x=`<mark class="hl" data-k="${k}" data-i="${ri}" title="撳一下取消">${x}</mark>`;if(e)x=`<mark class="ev">${x}</mark>`;h+=x}return h}
function hlPaint(){$$("[data-hl]").forEach(el=>{if(HL.src[el.dataset.hl]!=null)el.innerHTML=hlHtml(el.dataset.hl)})}
function hlAdd(k,a,b){const t=HL.src[k],W=/[\w'’-]/;while(a<b&&/\s/.test(t[a]))a++;while(b>a&&/\s/.test(t[b-1]))b--;if(b-a<1)return;while(a>0&&W.test(t[a-1]))a--;while(b<t.length&&W.test(t[b]))b++;/* 揀半個字都自動包成成個字 */let rs=(HL.r[k]||[]).concat([[a,b]]).sort((x,y)=>x[0]-y[0]),m=[];for(const r of rs){const l=m[m.length-1];if(l&&r[0]<=l[1])l[1]=Math.max(l[1],r[1]);else m.push([...r])}HL.r[k]=m}
function hlFromSel(){const sel=getSelection();if(!sel.rangeCount||sel.isCollapsed)return false;const rg=sel.getRangeAt(0);let did=false;
 $$("[data-hl]").forEach(el=>{if(!rg.intersectsNode(el)||HL.src[el.dataset.hl]==null)return;const off=(node,o)=>{const r=document.createRange();r.setStart(el,0);r.setEnd(node,o);return r.toString().length};
  const a=el.contains(rg.startContainer)?off(rg.startContainer,rg.startOffset):0,b=el.contains(rg.endContainer)?off(rg.endContainer,rg.endOffset):HL.src[el.dataset.hl].length;if(b>a){hlAdd(el.dataset.hl,a,b);did=true}});
 if(did)hlPaint();return did}
function hlBind(after){main.onclick=e=>{const m=e.target.closest("mark.hl");if(!m||!getSelection().isCollapsed)return;HL.r[m.dataset.k].splice(+m.dataset.i,1);hlPaint()};
 document.onpointerup=()=>setTimeout(()=>{const t=getSelection(),w=t.toString().trim();const inPass=t.rangeCount&&$("#pass")?.contains(t.anchorNode);let rect=null;if(t.rangeCount&&!t.isCollapsed)rect=t.getRangeAt(0).getBoundingClientRect();
  if(!hlFromSel())return;t.removeAllRanges();if(after&&inPass&&w&&w.length<=40&&rect)after(w,rect)},0)}
function selWatch(s){const box=$("#addword");document.onpointerdown=e=>{if(e.target!==box)box.hidden=true};hlBind((w,r)=>{box.style.left=r.left+"px";box.style.top=r.bottom+6+"px";box.hidden=false;
  box.onclick=()=>{const para=s.paras.find(p=>p.includes(w))||"";const sent=(para.match(/[^.!?]*[.!?]/g)||[]).find(x=>x.includes(w))||para;const zh=prompt(`「${w}」嘅意思（用自己嘅話）`);if(zh===null)return;if(!S.custom.some(c=>c.w===w))S.custom.push({w,zh,cl:sent.trim().replace(w,"___")});save();box.hidden=true}})}

/* ---------- Grammar ---------- */
const uStat=u=>S.gram.units[u.id]||{ok:0,n:0};
const aiCount=u=>S.myfix.filter(f=>u.tags.includes(f.tag)).length;
/* 弱度＝練習錯誤率＋AI 喺你文章捉到嘅次數。未做過當 50%。 */
const weakness=u=>{const s=uStat(u),e=s.n?1-s.ok/s.n:.5;return e+aiCount(u)*.05};
const weakUnit=()=>[...GRAMMAR].sort((a,b)=>weakness(b)-weakness(a))[0];
const itemId=(u,i)=>u.id+":"+i;
function record(u,i,good){const s=S.gram.units[u.id]??={ok:0,n:0};s.n++;if(good)s.ok++;const id=itemId(u,i),st=S.gram.items[id]??={box:0};st.box=good?Math.min(5,st.box+1):0;st.due=day(BOX[st.box]||1)}
function grammar(sub){if(sub==="diag")return gDiag();if(sub==="combine")return gCombine();const u=GRAMMAR.find(x=>x.id===sub);if(u)return gUnit(u);
 const list=[...GRAMMAR].sort((a,b)=>weakness(b)-weakness(a)),w=list[0],d=S.gram.diag;
 main.innerHTML=`<h1>Grammar</h1><p class="sub">Grammar 佔 Writing 四分之一分，亦影響 Speaking。唔係全部學晒：搵出你最弱嘅兩三個單元，集中清。</p>
 ${d?"":`<div class="notice">未做診斷。16 題，約 5 分鐘，做完先知邊個單元最值得練。<button class="btn sm pri" id="dg" style="margin-left:8px">開始</button></div>`}
 <div class="card"><div class="row between"><h2 style="margin:0">建議先練：${esc(w.name)}</h2><button class="btn pri" data-u="${w.id}">練 10 題</button></div><p class="small mute" style="margin:6px 0 0">${esc(w.why)}</p></div>
 <div class="card"><h2>所有單元（最弱排先）</h2>${list.map(u=>{const s=uStat(u),p=s.n?Math.round(s.ok/s.n*100):0,a=aiCount(u);return`<div class="block"><div class="tx"><b>${esc(u.name)}</b><span class="mute small">${s.n?`準確率 ${p}%（${s.n} 題）`:"未練"}${a?` · AI 喺你文章捉到 ${a} 次`:""}</span></div><button class="btn sm" data-u="${u.id}">練習</button></div>`}).join("")}
 <div class="block"><div class="tx"><b>合句練習</b><span class="mute small">兩句併一句，AI 即時判你嗰句啱唔啱</span></div><button class="btn sm" id="cb">練習</button></div></div>`;
 $("#dg")&&($("#dg").onclick=()=>go("grammar","diag"));$("#cb").onclick=()=>go("grammar","combine");$$("[data-u]").forEach(b=>b.onclick=()=>go("grammar",b.dataset.u))}
function runMcq(q,title,done){let i=0,ok=0;const show=()=>{if(i>=q.length)return done(ok,q.length);const c=q[i],opts=shuffle(c.it[1].map((t,j)=>({t,g:j===c.it[2]})));
 main.innerHTML=`<div class="flash card" style="text-align:left"><div class="row between"><span class="mute small">${esc(title)}</span><span class="mute small">${i+1} / ${q.length}</span></div><div style="font:20px/1.5 var(--serif);margin:12px 0">${esc(c.it[0]).replace("___","<b>______</b>")}</div>${opts.map((o,j)=>`<button class="btn" style="display:block;width:100%;text-align:left;margin-bottom:6px;font-weight:500" data-o="${j}">${j+1}. ${esc(o.t)}</button>`).join("")}<div id="fb"></div></div>`;
 const pick=j=>{document.onkeydown=null;const g=opts[j].g;if(g)ok++;record(c.u,c.i,g);save();$$("[data-o]").forEach((b,k)=>{b.disabled=true;if(opts[k].g)b.classList.add("right");else if(k===j)b.classList.add("wrong")});
  $("#fb").innerHTML=`<div class="r ${g?"ok":"bad"}">${g?"<b>✓ 啱</b>":`<b>✗ 你揀咗 ${esc(opts[j].t)}</b>，正確答案係 <b>${esc(c.it[1][c.it[2]])}</b>`}<div>${esc(c.it[3])}</div></div><button class="btn pri" id="nx" style="margin-top:9px">下一題（Enter）</button>`;
  const nx=()=>{document.onkeydown=null;i++;show()};$("#nx").onclick=nx;document.onkeydown=e=>{if(e.key==="Enter")nx()}};
 $$("[data-o]").forEach(b=>b.onclick=()=>pick(+b.dataset.o));document.onkeydown=e=>{const n=+e.key-1;if(opts[n])pick(n)}};show()}
function gDiag(){const q=GRAMMAR.flatMap(u=>shuffle(u.items.map((it,i)=>({u,i,it}))).slice(0,2));S.gram.units={};
 runMcq(shuffle(q),"Grammar 診斷",(ok,n)=>{S.gram.diag={date:day(),ok,n};mark("grammar");save();const w=weakUnit();main.innerHTML=`<div class="flash card"><div class="big">${ok}/${n}</div><p>最弱單元：<b>${esc(w.name)}</b>。每單元得 2 題，只係粗略定方向，之後練習會自動修正。</p><button class="btn pri" onclick="go('grammar','${w.id}')">開始練</button></div>`})}
function gUnit(u){const t=day(),its=u.items.map((it,i)=>({u,i,it,st:S.gram.items[itemId(u,i)]}));const due=shuffle(its.filter(x=>x.st&&x.st.due<=t)),nw=shuffle(its.filter(x=>!x.st)),rest=shuffle(its.filter(x=>x.st&&x.st.due>t));const q=[...due,...nw,...rest].slice(0,10);
 main.innerHTML=`<h1>${esc(u.name)}</h1><p class="sub">${esc(u.why)}</p><div class="card"><h2>規則</h2><ul class="tight">${u.rule.map(r=>`<li>${esc(r)}</li>`).join("")}</ul><button class="btn pri" id="go" style="margin-top:8px">開始 ${q.length} 題</button></div>`;
 $("#go").onclick=()=>runMcq(q,u.name,(ok,n)=>{mark("grammar");save();main.innerHTML=`<div class="flash card"><div class="big">${ok}/${n}</div><p>${ok>=9?"呢個單元開始穩，下次會排後。":"錯嘅題聽日再出。"}</p><div class="row" style="justify-content:center"><button class="btn" onclick="go('grammar')">睇單元</button><button class="btn pri" onclick="go('today')">返今日</button></div></div>`})}
function gCombine(){const seen=i=>S.combine[i]?.box||0,q=COMBINE.map((c,i)=>({...c,i})).sort((a,b)=>seen(a.i)-seen(b.i)||Math.random()-.5).slice(0,5);let i=0,ok=0;
 const show=()=>{if(i>=q.length){mark("grammar");save();main.innerHTML=`<div class="flash card"><div class="big">${ok}/${q.length}</div><p>做得啱嘅結構，下次寫文就用返出嚟。</p><button class="btn pri" onclick="go('grammar')">返 Grammar</button></div>`;return}
 const c=q[i];main.innerHTML=`<div class="flash card" style="text-align:left"><div class="row between"><span class="mute small">合句 ${i+1} / ${q.length}</span><span class="small">用：<b>${esc(c.use)}</b></span></div><div style="font:19px/1.5 var(--serif);margin:12px 0">${esc(c.s)}</div><textarea id="t" rows="2" spellcheck="false" style="font:17px/1.5 var(--serif)"></textarea><div id="fb"></div><div class="row" style="margin-top:9px"><button class="btn pri" id="c">Check</button></div></div>`;
 const ta=$("#t"),b=$("#c");ta.focus();const next=g=>{const st=S.combine[c.i]??={box:0};st.box=g?st.box+1:0;if(g)ok++;save();i++;show()};
 b.onclick=async()=>{const v=ta.value.trim();if(!v)return;b.disabled=true;$("#fb").innerHTML='<div class="r"><span class="spin"></span> AI 判緊…</div>';
  const r=await aiCheck(`Combine into one sentence using: ${c.use}. Original: ${c.s}`,c.a,v);ta.disabled=true;b.disabled=false;b.textContent="下一題";
  if(!r){$("#fb").innerHTML=`<div class="r">AI 用唔到。參考：<b>${esc(c.a)}</b><div class="row" style="margin-top:6px"><button class="btn sm" id="y">我同參考一樣</button><button class="btn sm" id="n">唔同</button></div></div>`;b.hidden=true;$("#y").onclick=()=>next(true);$("#n").onclick=()=>next(false);return}
  $("#fb").innerHTML=`<div class="r ${r.ok?"ok":"bad"}">${r.ok?"<b>✓ 啱</b>":`<b>✗ 未啱</b>，可以改成：<b>${esc(r.fixed)}</b>`}<div>${esc(r.why)}</div><div class="small mute" style="margin-top:4px">參考：${esc(c.a)}</div></div>`;b.onclick=()=>next(r.ok)}};show()}
async function aiCheck(task,ref,text){try{const f=await fetch("/api/check",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({task,ref,text})});const j=await f.json();return f.ok?j:null}catch(e){return null}}

/* ---------- Writing ---------- */
function writing(sub){sub=sub||"fixit";stopClock();const tabs=[["fixit","改句子"],["tone","語氣"],["plan","五分鐘大綱"],["para","單段"],["task1","Task 1 寫信"],["task2","Task 2"],["play","套路"],["hist","紀錄"]];
 main.innerHTML=`<h1>Writing</h1><p class="sub">Task 2 佔 Writing 約三分之二，但 Band 6 去 6.5 最快嘅路係減文法錯同跟足題目。</p><div class="tabs">${tabs.map(t=>`<button class="btn sm ${t[0]===sub?"sel":""}" data-t="${t[0]}">${t[1]}</button>`).join("")}</div><div id="w"></div>`;
 $$("[data-t]").forEach(b=>b.onclick=()=>go("writing",b.dataset.t));({fixit,tone,plan:()=>writer("plan"),para:()=>writer("para"),task1:()=>writer("task1"),task2:()=>writer("task2"),play,hist})[sub]()}
function fixDeck(){const t=day(),o=[];S.myfix.forEach((f,i)=>{if((f.due||"")<=t)o.push({id:"m"+i,w:f.orig,a:[f.fixed],r:f.rule,tag:f.tag,mine:1})});const seen=FIXIT.map((f,i)=>({...f,id:"f"+i})).filter(f=>(S.fix[f.id]?.due||"")<=t);return[...o,...shuffle(seen)].slice(0,8)}
function fixit(){const q=fixDeck();let i=0,ok=0;const box=$("#w");const norm=s=>nrm(s).replace(/[,;]/g,m=>m);
 const show=()=>{if(i>=q.length){mark("writing");box.innerHTML=`<div class="card"><b>${ok}/${q.length} 一次過啱。</b> 錯嘅會隔日再出。<div class="row" style="margin-top:9px"><button class="btn" id="m">再嚟</button><button class="btn pri" onclick="go('today')">返今日</button></div></div>`;$("#m").onclick=fixit;return}
  const c=q[i];box.innerHTML=`<div class="card"><div class="row between"><span class="mute small">${i+1}/${q.length}${c.mine?" · 你自己寫過嘅錯":""}</span><span class="mute small">${esc(TAGS[c.tag]||"")}</span></div><p>改到啱晒（可能唔止一個錯）：</p><textarea id="t" rows="2" spellcheck="false" style="font:17px/1.5 var(--serif)">${esc(c.w)}</textarea><div id="fb"></div><div class="row" style="margin-top:9px"><button class="btn pri" id="c">Check</button></div></div>`;
  const ta=$("#t");ta.focus();$("#c").onclick=()=>{const v=ta.value,good=c.a.some(a=>norm(a)===norm(v));const step=g=>{if(g)ok++;const st=c.mine?S.myfix[+c.id.slice(1)]:(S.fix[c.id]??={box:0});st.box=g?Math.min(5,(st.box||0)+1):0;st.due=day(BOX[st.box]||1);save();i++;show()};
   if(good){$("#fb").innerHTML=`<div class="r ok"><b>✓</b> ${esc(c.r)}</div>`;$("#c").textContent="下一題";$("#c").onclick=()=>step(true)}
   else if(v.trim()===c.w.trim()){$("#fb").innerHTML=`<div class="r bad">呢句仲未改，入面有錯。參考：<b>${esc(c.a[0])}</b><div>${esc(c.r)}</div></div>`;$("#c").textContent="下一題";$("#c").onclick=()=>step(false)}
   else{const b=$("#c");b.disabled=true;$("#fb").innerHTML='<div class="r"><span class="spin"></span> 同參考唔同，AI 判緊…</div>';aiCheck("Correct all errors in: "+c.w,c.a[0],v).then(r=>{b.disabled=false;b.textContent="下一題";const g=r?r.ok:false;$("#fb").innerHTML=r?`<div class="r ${g?"ok":"bad"}">${g?"<b>✓ 都啱</b>":`<b>✗ 未啱</b>，可以改成：<b>${esc(r.fixed)}</b>`}<div>${esc(r.why)}</div><div class="small mute" style="margin-top:4px">${esc(c.r)}</div></div>`:`<div class="r bad">AI 用唔到，暫時當錯。參考：<b>${esc(c.a[0])}</b><div>${esc(c.r)}</div></div>`;b.onclick=()=>step(g)})}}};show()}
function tone(){const q=shuffle(TONE).slice(0,6);let i=0;const box=$("#w");const show=()=>{if(i>=q.length){mark("writing");box.innerHTML=`<div class="card">做完。Task 1 全封信語氣要一致，呢個係 TA 分。<div class="row" style="margin-top:9px"><button class="btn" id="m">再嚟</button><button class="btn pri" onclick="go('today')">返今日</button></div></div>`;$("#m").onclick=tone;return}
 const c=q[i];box.innerHTML=`<div class="card"><span class="mute small">${i+1}/${q.length}</span><p>改寫成 <b>${c.to}</b>：<br><span style="font:18px var(--serif)">${esc(c.s)}</span></p><textarea id="t" rows="2" spellcheck="false"></textarea><div id="fb"></div><div class="row" style="margin-top:9px"><button class="btn pri" id="c">睇參考</button></div></div>`;$("#t").focus();
 $("#c").onclick=()=>{$("#fb").innerHTML=`<div class="r ok">參考：<b>${esc(c.a)}</b></div>`;$("#c").textContent="下一題";$("#c").onclick=()=>{i++;show()}}};show()}
const LIM={plan:[5,0,"寫：立場一句＋兩個論點，每個配一個具體例子。唔使句子靚。"],para:[15,110,"揀一個論點寫一段：主題句 → 解釋 → 具體例子 → 小結。"],task1:[20,150,"三點各一段，語氣由頭到尾一致。"],task2:[40,250,"四段：引言＋兩段論點＋結論。直接答題目問嘅嘢。"]};
function pool(kind){return kind==="task1"?T1.map(x=>({q:`${x.q}\n\nWrite a letter (${x.tone}). In your letter:\n${x.b.map(b=>"• "+b).join("\n")}`,key:x.q})):T2.map(x=>({q:x.q,key:x.q}))}
function writer(kind){const box=$("#w"),[mn,wmin,tip]=LIM[kind],p=pool(kind),used=new Set(S.writing.map(w=>w.key));const dk="draft_"+kind;let sel=(S[dk]?.key&&p.findIndex(x=>x.key===S[dk].key)+1||p.findIndex(x=>!used.has(x.key))+1||1)-1;
 box.innerHTML=`<div class="card"><div class="row between"><select id="pk" style="max-width:75%">${p.map((x,i)=>`<option value="${i}" ${i==sel?"selected":""}>${used.has(x.key)?"✓ ":""}${esc(x.q.slice(0,70))}…</option>`).join("")}</select><span class="timer" id="tm">${mn}:00</span></div>
 <p style="white-space:pre-wrap;font:17px/1.55 var(--serif)" id="pq">${esc(p[sel].q)}</p><p class="mute small">${esc(tip)}${wmin?` 最少 ${wmin} 字。`:""} 拼字檢查已閂，同考試一樣。</p>
 <textarea class="ess" id="tx" spellcheck="false" autocorrect="off" placeholder="開始打字就起錶">${esc(S[dk]?.text||"")}</textarea>
 <div class="row between" style="margin-top:8px"><span id="wc" class="mute"></span><button class="btn pri" id="sub">交俾 AI 改</button></div></div><div id="res"></div>`;
 let el=null;const tx=$("#tx"),wc=()=>{const n=tx.value.trim()?tx.value.trim().split(/\s+/).length:0;$("#wc").textContent=n+" 字"+(wmin&&n<wmin?`（仲差 ${wmin-n}）`:"");return n};wc();
 tx.oninput=()=>{if(!el)el=timer($("#tm"),mn*60);wc();S[dk]={key:p[sel].key,text:tx.value};save()};
 $("#pk").onchange=e=>{sel=+e.target.value;$("#pq").textContent=p[sel].q;if(S[dk])S[dk].key=p[sel].key};
 $("#sub").onclick=async()=>{if(wc()<8)return;const b=$("#sub"),secs=el?el():0,r=$("#res");stopClock();b.disabled=true;r.innerHTML='<div class="card"><span class="spin"></span> AI 改緊，大約半分鐘至 2 分鐘。文字已自動保存。</div>';
  try{const f=await fetch("/api/mark",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind,prompt:p[sel].q,text:tx.value,minutes:Math.round(secs/60)})});const j=await f.json();if(!f.ok)throw Error(j.error);
   S.writing.push({date:day(),kind,key:p[sel].key,prompt:p[sel].q,text:tx.value,mins:Math.round(secs/60),result:j});(j.corrections||[]).filter(c=>c.orig&&c.fixed&&c.orig.split(" ").length<=30).forEach(c=>{if(!S.myfix.some(m=>m.orig===c.orig))S.myfix.push({orig:c.orig,fixed:c.fixed,rule:c.rule,tag:c.tag,due:day(1),box:0})});delete S[dk];mark("writing");save();r.innerHTML=resHtml(j,kind);r.scrollIntoView({behavior:"smooth"})}
  catch(e){r.innerHTML=`<div class="card"><b>AI 改唔到：</b>${esc(e.message)}。文字冇失，可以再撳。</div>`}b.disabled=false}}
function resHtml(j,kind){const lb={task:kind==="task1"?"Task Achievement":"Task Response",cc:"Coherence & Cohesion",lr:"Lexical Resource",gra:"Grammar"};
 return`<div class="card"><div class="row between"><h2 style="margin:0">AI 估分 <span class="big" style="margin-left:6px">${j.overall}</span></h2><span class="mute small">AI 估算，唔係官方分數</span></div><p><b>最值得改：</b>${esc(j.biggest)}</p>
 <table>${Object.keys(lb).map(k=>`<tr><td style="width:170px">${lb[k]}</td><td style="width:44px"><b>${j.bands[k]}</b></td><td>${esc(j.why?.[k])}</td></tr>`).join("")}</table>
 ${j.corrections?.length?`<h3>改錯（已加入你嘅「改句子」，聽日再考你）</h3>${j.corrections.map(c=>`<div class="corr"><s>${esc(c.orig)}</s><br><ins>${esc(c.fixed)}</ins><div class="small mute">${esc(TAGS[c.tag]||c.tag||"")}：${esc(c.rule)}</div></div>`).join("")}`:""}
 ${j.upgrade?.length?`<h3>可以升級</h3>${j.upgrade.map(u=>`<div class="corr">${esc(u.orig)} → <ins>${esc(u.better)}</ins></div>`).join("")}`:""}
 ${j.model?`<h3>最弱一段點改</h3><div class="corr"><s>${esc(j.rewrite_target)}</s><br><ins style="font-weight:400">${esc(j.model)}</ins></div>`:""}</div>`}
function play(){$("#w").innerHTML=`<div class="grid"><div class="card"><h2>Task 1 信（20 分鐘，150 字+）</h2><table><tr><th>語氣</th><th>開頭</th><th>結尾</th></tr><tr><td>Formal（唔知名）</td><td>Dear Sir or Madam,</td><td>Yours faithfully,</td></tr><tr><td>Semi-formal（知姓）</td><td>Dear Mr Chan,</td><td>Yours sincerely,</td></tr><tr><td>Informal（朋友）</td><td>Dear Amy,</td><td>Best wishes,</td></tr></table>
 <h3>結構</h3><ul class="tight"><li>第 1 段：一句講點解寫</li><li>第 2–4 段：題目三點，一點一段，全部要答</li><li>最後一句：想對方做咩</li></ul><h3>Band 7 重點</h3><ul class="tight"><li>語氣全封一致，唔好 formal 中間夾 can't、gonna</li><li>每點加一個具體細節（日期、型號、後果）</li><li>寫 160–190 字，唔使寫長</li></ul></div>
 <div class="card"><h2>Task 2 文（40 分鐘，250 字+）</h2><h3>結構</h3><ul class="tight"><li>引言：改寫題目＋立場（2 句）</li><li>論點 1：主題句 → 解釋 → 例子 → 小結</li><li>論點 2：同上（可包括反方再反駁）</li><li>結論：重申立場（2 句）</li></ul><h3>四種題型</h3><ul class="tight"><li><b>Opinion：</b>全篇一個立場</li><li><b>Discuss：</b>兩邊都講，再講自己</li><li><b>Problem：</b>原因一段，方案一段</li><li><b>Advantage：</b>答「邊邊大」，唔係列清單</li></ul><h3>Band 7 重點</h3><ul class="tight"><li>每段得一個主要論點，講深唔講多</li><li>例子要具體，唔好 many people say</li><li>唔好背 template，考官會睇得出，唔計分</li><li>留 3 分鐘 check：s、the、tense</li></ul></div>
 <div class="card"><h2>Reading 考場策略</h2><ul class="tight"><li>全卷 60 分鐘，<b>冇額外謄答案時間</b></li><li>Section 1、2 共用 30–33 分鐘，留 Section 3 約 27 分鐘</li><li>先睇題，再返文章搵關鍵字嘅改寫</li><li>TFNG 順住文章次序；問自己：「文章有冇講呢點？」冇＝NG，有但相反＝F</li><li>因 some、most、all、always、may 呢啲字中伏最多</li><li>一題卡超過 90 秒就跳，40 題一定要填晒，唔答冇分</li></ul></div></div>`}
function hist(){const W=[...S.writing].reverse();$("#w").innerHTML=W.length?`<div class="card"><table><thead><tr><th>日期</th><th>類型</th><th>分數</th><th></th></tr></thead><tbody>${W.map((w,i)=>`<tr><td>${w.date}</td><td>${w.kind}</td><td>${w.result?.overall??""}</td><td><button class="btn sm" data-w="${i}">睇</button></td></tr>`).join("")}</tbody></table></div><div id="res"></div>`:'<div class="card mute">未有紀錄。</div>';
 $$("[data-w]").forEach(b=>b.onclick=()=>{const w=W[+b.dataset.w];$("#res").innerHTML=`<div class="card"><p style="white-space:pre-wrap;font:16px/1.6 var(--serif)">${esc(w.text)}</p></div>`+resHtml(w.result,w.kind)})}

/* ---------- 進度 ---------- */
function bars(rows){return rows.map(([n,v,txt,pct])=>`<div class="bar" title="${esc(n)}：${esc(txt)}"><span>${esc(n)}</span><div class="t"><div class="f" style="width:${Math.max(pct,1)}%"></div></div><span class="v">${esc(txt)}</span></div>`).join("")}
function stats(){const q=Object.keys(QT).map(k=>{const s=S.qstats[k]||{ok:0,n:0},p=s.n?Math.round(s.ok/s.n*100):0;return[QT[k],p,s.n?`${p}%（${s.n}）`:"未做",p]});
 const rs=REASONS.map(r=>[r[1],S.reasons[r[0]]||0]),mx=Math.max(1,...rs.map(r=>r[1]));
 const tg={};S.myfix.forEach(f=>tg[f.tag]=(tg[f.tag]||0)+1);const tr=Object.entries(tg).sort((a,b)=>b[1]-a[1]),tm=Math.max(1,...tr.map(x=>x[1]));
 const ws=S.writing.filter(w=>w.result&&["task1","task2"].includes(w.kind));const b=[0,0,0,0,0,0];Object.values(S.vocab).forEach(v=>b[v.box]++);
 const dn=Object.keys(S.days).length,top=rs.slice().sort((a,b)=>b[1]-a[1])[0];
 main.innerHTML=`<h1>進度</h1><p class="sub">做咗 ${dn} 日 · Reading ${S.reading.length} 份 · Writing ${S.writing.length} 次 · 生字已見 ${Object.keys(S.vocab).length} 個${top&&top[1]?`。Reading 最大失分原因：${top[0]}`:""}</p>
 <div class="grid"><div class="card"><h2>Reading 題型準確率</h2>${bars(q)}</div><div class="card"><h2>Reading 失分原因</h2>${bars(rs.map(r=>[r[0],r[1],String(r[1]),r[1]/mx*100]))}</div>
 <div class="card"><h2>Reading 陷阱類型準確率</h2>${bars(Object.keys(TRAPZH).map(k=>{const t=S.trap[k]||{ok:0,n:0},p=t.n?Math.round(t.ok/t.n*100):0;return[TRAPZH[k],p,t.n?`${p}%（${t.n}）`:"未做",p]}))}<p class="mute small">由下一份起開始記。呢度睇到要補邊類技巧。</p></div>
 <div class="card"><h2>Writing 常犯錯</h2>${tr.length?bars(tr.map(([k,v])=>[TAGS[k]||k,v,String(v),v/tm*100])):'<p class="mute">交 AI 改之後會出現。</p>'}</div>
 <div class="card"><h2>Writing 分數</h2>${ws.length?`<table><thead><tr><th>日期</th><th>類型</th><th>TA/TR</th><th>CC</th><th>LR</th><th>GRA</th><th>Overall</th></tr></thead><tbody>${ws.map(w=>`<tr><td>${w.date.slice(5)}</td><td>${w.kind}</td><td>${w.result.bands.task}</td><td>${w.result.bands.cc}</td><td>${w.result.bands.lr}</td><td>${w.result.bands.gra}</td><td><b>${w.result.overall}</b></td></tr>`).join("")}</tbody></table>`:'<p class="mute">未有全篇紀錄。</p>'}</div>
 <div class="card"><h2>Grammar 單元準確率</h2>${bars(GRAMMAR.map(u=>{const s=uStat(u),p=s.n?Math.round(s.ok/s.n*100):0;return[u.name,p,s.n?`${p}%（${s.n}）`:"未練",p]}))}</div>
 <div class="card"><h2>Vocab 熟練度</h2>${bars(["新學","1 日","2 日","4 日","7 日","14 日"].map((n,i)=>[n,b[i],String(b[i]),b[i]/Math.max(1,...b)*100]))}<p class="mute small">日數＝下次溫習相隔，愈長愈穩；7 日或以上先計「已穩」。</p></div></div>`}

/* ---------- 導航 ---------- */
const view={page:"today",sub:null,set:null,replay:false};
const NAV=[["today","今日"],["reading","Reading"],["vocab","Vocab"],["grammar","Grammar"],["writing","Writing"],["stats","進度"]];
function go(p,sub){view.page=p;view.sub=sub||null;render()}
function render(){stopClock();document.onkeydown=null;document.onmouseup=null;document.onpointerup=null;document.onpointerdown=null;main.onclick=null;$("#addword").hidden=true;main.classList.remove("wide");
 $("#nav").innerHTML=NAV.map(n=>`<button class="${n[0]===view.page?"on":""}" data-n="${n[0]}">${n[1]}</button>`).join("");$$("[data-n]").forEach(b=>b.onclick=()=>go(b.dataset.n));
 const d=left();$("#count").textContent=d>0?`考試倒數 ${d} 日`:"";window.scrollTo(0,0);
 ({today,reading:()=>reading(view.sub),vocab,grammar:()=>grammar(view.sub),writing:()=>writing(view.sub),stats})[view.page]();if(view.page==="stats"&&window.syncPanel)syncPanel()}
Object.assign(window,{go,sprint,grammar});
async function boot(){
 let r=null;try{r=await fetch("/api/state")}catch(e){if(/^(127\.|localhost)/.test(location.hostname))throw Error("連唔到本機 server")}
 if(r&&r.ok&&(r.headers.get("content-type")||"").includes("json")){const j=await r.json();S=hydrate(j.progress);GEN=j.generated||[];SETV=j.setvocab||{};STR=j.structure||{}}
 else{STATIC=true;try{const j=await(await fetch("static-data.json")).json();GEN=j.generated||[];SETV=j.setvocab||{};STR=j.structure||{}}catch(e2){}
  let p={};try{p=JSON.parse(localStorage.getItem(LSKEY)||"{}")}catch(e3){}S=hydrate(p)}
 loaded=true;render();window.syncStart&&syncStart()}
boot().catch(e=>{main.textContent="讀唔到進度："+e.message});
