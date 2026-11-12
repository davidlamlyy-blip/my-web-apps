/* GitHub 同步進度：Mac 同手機／iPad 用同一份。存喺私人 repo davidlamlyy-blip/cadet-progress 嘅 ielts-progress.json。
   - Mac（本機 server）：經 server 用 `gh` 登入嘅身份讀寫，唔使 token。
   - 手機／iPad（GitHub Pages）：用 GitHub fine-grained token（同 Cadet 學習站同一個 localStorage key cadetGhToken，已設定過就共用）。
   合併：兩邊較新嗰份做底（_t＝最後改動時間），Reading／Writing／自訂生字／myfix 取聯集，每日打卡取聯集，生字只喺一邊有就補入。
   唔會做嘅事：雙方各自離線改同一個生字／統計，只保留較新嗰份。 */
const SYNC={busy:false,timer:null,msg:"",last:""};
const SYNC_FILE="ielts-progress.json";
const ghCfg=()=>{try{const t=localStorage.getItem("cadetGhToken");return t?{t,repo:localStorage.getItem("cadetGhRepo")||"davidlamlyy-blip/cadet-progress"}:null}catch(e){return null}};
const stableJ=o=>JSON.stringify(o,(k,v)=>v&&typeof v==="object"&&!Array.isArray(v)?Object.keys(v).sort().reduce((a,x)=>(a[x]=v[x],a),{}):v);
const b64e=s=>btoa(unescape(encodeURIComponent(s))),b64d=s=>decodeURIComponent(escape(atob(s.replace(/\n/g,""))));
const forSync=o=>{const c=structuredClone(o);delete c._rev;return c};
function mergeProgress(L,R){
 R=hydrate(R||{});const lt=L._t||0,rt=R._t||0,useR=rt>lt;
 const base=structuredClone(useR?R:L),oth=useR?L:R;
 const uni=(k,key)=>{const seen=new Set(base[k].map(key));(oth[k]||[]).forEach(x=>{const id=key(x);if(!seen.has(id)){base[k].push(x);seen.add(id)}})};
 uni("reading",r=>[r.id,r.date,r.secs].join("|"));
 uni("writing",w=>[w.date,w.kind,w.key,(w.text||"").length].join("|"));
 uni("custom",c=>nrm(c.w));
 uni("myfix",m=>m.orig);
 const byDate=(a,b)=>a.date<b.date?-1:a.date>b.date?1:0;base.reading.sort(byDate);base.writing.sort(byDate);
 for(const d in oth.days)base.days[d]={...oth.days[d],...base.days[d]};
 for(const id in oth.vocab)if(!base.vocab[id])base.vocab[id]=oth.vocab[id];
 base._rev=L._rev;base._t=Math.max(lt,rt);return base}
/* transport：回 {doc,sha}（未有檔＝doc null）；put 回 false＝sha 衝突 */
const TR={
 async get(){
  if(!STATIC){const r=await fetch("/api/gh");const j=await r.json();if(!r.ok)throw Error(j.error||"HTTP "+r.status);return j}
  const c=ghCfg();const r=await fetch(`https://api.github.com/repos/${c.repo}/contents/${SYNC_FILE}`,{headers:{Authorization:"Bearer "+c.t,Accept:"application/vnd.github+json"},cache:"no-store"});
  if(r.status===404)return{doc:null,sha:null};
  if(r.status===401||r.status===403)throw Error("Token 無效或冇權限（"+r.status+"）");
  if(!r.ok)throw Error("GitHub 回應 "+r.status);
  const j=await r.json();return{doc:JSON.parse(b64d(j.content)),sha:j.sha}},
 async put(doc,sha){
  if(!STATIC){const r=await fetch("/api/gh",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({doc,sha})});if(r.status===409)return false;const j=await r.json();if(!r.ok)throw Error(j.error||"HTTP "+r.status);return true}
  const c=ghCfg();const r=await fetch(`https://api.github.com/repos/${c.repo}/contents/${SYNC_FILE}`,{method:"PUT",headers:{Authorization:"Bearer "+c.t,Accept:"application/vnd.github+json"},body:JSON.stringify({message:"ielts sync "+new Date().toISOString(),content:b64e(JSON.stringify(doc)),...(sha?{sha}:{})})});
  if(r.status===409||r.status===422)return false;if(!r.ok)throw Error("寫入失敗 "+r.status);return true}};
function setSync(m){SYNC.msg=m;const el=$("#syncMsg");if(el)el.textContent=m}
async function syncNow(manual,retry){
 if(!loaded)return;if(STATIC&&!ghCfg()){setSync("未設定 token");return}
 if(SYNC.busy)return;SYNC.busy=true;setSync("同步緊…");
 try{
  const rm=await TR.get();
  const before=stableJ(forSync(S));
  const merged=rm.doc?mergeProgress(S,rm.doc):S;
  const changedLocal=stableJ(forSync(merged))!==before;
  if(changedLocal){S=merged;saveRawLocal();if(["today","stats"].includes(view.page))render()}
  const out=forSync(S);
  if(!rm.doc||stableJ(out)!==stableJ(rm.doc)){
   const ok=await TR.put(out,rm.sha);
   if(!ok){SYNC.busy=false;if(!retry)return syncNow(manual,true);throw Error("衝突，請再試")}}
  SYNC.last=new Date().toLocaleTimeString("zh-HK");setSync("✅ 已同步 "+SYNC.last)
 }catch(e){setSync("❌ 同步失敗："+e.message)}finally{SYNC.busy=false}}
/* 合併後寫返本機：手機寫 localStorage；Mac 經 server（有 _rev 保護） */
function saveRawLocal(){if(STATIC){try{localStorage.setItem(LSKEY,JSON.stringify(S))}catch(e){}}else pushSave()}
function scheduleSync(){if(STATIC&&!ghCfg())return;clearTimeout(SYNC.timer);SYNC.timer=setTimeout(()=>syncNow(false),4000)}
function syncStart(){
 syncNow(false);
 document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")syncNow(false)});
 addEventListener("online",()=>syncNow(false))}
function syncPanel(){
 const c=ghCfg(),d=document.createElement("div");d.className="card";d.style.marginTop="16px";
 d.innerHTML=STATIC
  ?`<h2>☁️ GitHub 同步進度</h2><p class="mute small">手機／iPad 同 Mac 用同一份進度，存喺私人 repo。Token 只存喺呢部裝置（同 Cadet 學習站共用，已設定過就唔使再貼）。AI 改 Writing、出新題要用 Mac 版。</p>
   <input id="ghTok" type="password" autocomplete="off" placeholder="${c?"已設定（留空＝唔改）":"貼上 github_pat_… token"}" style="width:100%;padding:8px;margin:6px 0"><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="ghSave">儲存並同步</button><button class="btn" id="ghNow">立即同步</button><button class="btn" id="ghOff">移除 token</button></div><p class="small" id="syncMsg">${esc(SYNC.msg||(c?"已設定 token":"未設定"))}</p>`
  :`<h2>☁️ GitHub 同步進度</h2><p class="mute small">Mac 用 <code>gh</code> 登入身份自動同步，唔使 token。手機／iPad 開 Pages 版，貼 token 即同步。</p><div style="display:flex;gap:8px"><button class="btn" id="ghNow">立即同步</button></div><p class="small" id="syncMsg">${esc(SYNC.msg||"")}</p>`;
 main.append(d);
 const q=s=>d.querySelector(s);
 if(q("#ghSave"))q("#ghSave").onclick=()=>{const t=q("#ghTok").value.trim();try{if(t)localStorage.setItem("cadetGhToken",t)}catch(e){}q("#ghTok").value="";syncNow(true)};
 if(q("#ghOff"))q("#ghOff").onclick=()=>{try{localStorage.removeItem("cadetGhToken")}catch(e){}setSync("已移除 token")};
 q("#ghNow").onclick=()=>syncNow(true)}
