/* Shared Quest engine (lessons 2+). Lesson 1 keeps its own inline copy.
   Usage: const Q = Quest({key, title, pred, quiz, ranks, pauseMax});
   Expects the same element ids as lesson 1: #predList #checkList #quizBox #pauseScore #xp #levels #summary #copyBtn #wipeBtn ... */
(function(){
const $ = s => document.querySelector(s);
const esc = t => String(t).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const COL = {grav:"var(--f-grav)",norm:"var(--f-norm)",fric:"var(--f-fric)",tens:"var(--f-tens)",app:"var(--f-app)",fake:"var(--f-fake)",ink:"var(--ink)",acc:"var(--bad)",muted:"var(--muted)"};

function arrow(x1,y1,x2,y2,k,label,lx,ly,anchor){
  const c = COL[k]||k, ang = Math.atan2(y2-y1,x2-x1), h = 11;
  const p1 = [x2 - h*Math.cos(ang-0.42), y2 - h*Math.sin(ang-0.42)], p2 = [x2 - h*Math.cos(ang+0.42), y2 - h*Math.sin(ang+0.42)];
  const ex = x2 - 7*Math.cos(ang), ey = y2 - 7*Math.sin(ang);
  return `<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" style="stroke:${c}" stroke-width="4" stroke-linecap="round"/>`+
    `<polygon points="${x2},${y2} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}" style="fill:${c}"/>`+
    (label?`<text x="${lx}" y="${ly}" text-anchor="${anchor||"middle"}" style="fill:${c};font:700 14px var(--mono)">${label}</text>`:"");
}
/* fbd: list of {d:"up"|"down"|"left"|"right"| angle-in-degrees, len, k, t} */
function fbd(list, size=150){
  const c = size/2; let s = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Free-body diagram">`;
  const dir = {up:90,down:270,left:180,right:0};
  for (const f of list){ const ang = (typeof f.d==="number"?f.d:dir[f.d])*Math.PI/180, L = f.len*(size/2-26);
    const dx = Math.cos(ang), dy = -Math.sin(ang);
    const lx = c+dx*(L+16) + (Math.abs(dy)>.9? 16:0), ly = c+dy*(L+16) + (Math.abs(dx)>.9? -8:5);
    s += arrow(c,c,c+dx*L,c+dy*L,f.k,f.t,lx,ly,Math.abs(dy)>.9?"start":"middle"); }
  return s + `<circle cx="${c}" cy="${c}" r="6" style="fill:var(--ink)"/></svg>`;
}

window.Quest = function(cfg){
  const KEY = cfg.key, PRED = cfg.pred, Q = cfg.quiz, RANKS = cfg.ranks, PMAX = cfg.pauseMax||6;
  /* Shuffle multiple-choice options with a fixed seed per question, so the right answer isn't always in one slot
     but the order stays the same across visits (saved answers and redo lists keep matching). */
  let seed = [...KEY].reduce((h,c)=>(h*31 + c.charCodeAt(0))>>>0, 7);
  const rnd = () => (seed = (seed*1664525 + 1013904223)>>>0) / 4294967296;
  Q.forEach(q=>{ if (q.t!=="mc") return; const idx = q.o.map((_,i)=>i);
    for (let i=idx.length-1;i>0;i--){ const j = Math.floor(rnd()*(i+1)); [idx[i],idx[j]] = [idx[j],idx[i]]; }
    q.o = idx.map(i=>q.o[i]); q.a = idx.indexOf(q.a); });
  let S = { pred:{}, grade:{}, quiz:{ i:0, answers:{}, streak:0, best:0, done:false, retry:null }, pause:"", xp:0 };
  try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(S, JSON.parse(raw)); } catch(e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e) {} renderXP(); renderSummary(); };

  function renderPred(){
    $("#predList").innerHTML = PRED.map((p,n)=>{ const st = S.pred[p.id]||{}; const locked = !!st.locked;
      return `<div class="pred" data-id="${p.id}"><span class="qnum">PREDICTION ${n+1} OF ${PRED.length}</span><p class="qtext"><strong>${p.q}</strong></p>
      <div class="opts">${p.o.map((o,i)=>`<button type="button" class="opt" data-i="${i}" aria-pressed="${st.c===i}" ${locked?"disabled":""}><span class="k">${"ABCD"[i]}</span><span>${o}</span></button>`).join("")}</div>
      <label class="note" for="why-${p.id}">Why do you think so? One sentence.</label>
      <textarea id="why-${p.id}" ${locked?"disabled":""}>${esc(st.why||"")}</textarea>
      <div class="row"><button type="button" class="btn lock" ${locked||st.c==null?"disabled":""}>${locked?"Locked in ✓":"Lock in prediction"}</button>${locked?"":'<span class="note">Pick an answer, write your reason, then lock it in.</span>'}</div></div>`; }).join("");
    document.querySelectorAll(".pred").forEach(el=>{ const id = el.dataset.id;
      el.querySelectorAll(".opt").forEach(b=>b.addEventListener("click",()=>{ S.pred[id] = Object.assign(S.pred[id]||{}, {c:+b.dataset.i, why:el.querySelector("textarea").value}); save(); renderPred(); }));
      el.querySelector("textarea").addEventListener("input",e=>{ S.pred[id] = Object.assign(S.pred[id]||{}, {why:e.target.value}); try{localStorage.setItem(KEY,JSON.stringify(S));}catch(_){} });
      el.querySelector(".lock").addEventListener("click",()=>{ const st=S.pred[id]; if(!st||st.c==null||st.locked) return; st.why = el.querySelector("textarea").value; st.locked = true; S.xp += 10; save(); renderPred(); renderCheck(); });
    });
  }

  function renderCheck(){
    $("#checkList").innerHTML = PRED.map((p,n)=>{ const st = S.pred[p.id]||{}; const g = S.grade[p.id];
      const has = st.locked; const right = has && st.c===p.a;
      return `<div class="reveal" data-id="${p.id}"><span class="qnum">PREDICTION ${n+1}</span><p><strong>${p.q}</strong></p>
      ${has?`<span class="verdict ${right?"ok":"no"}">${right?"Your pick: correct":"Your pick: "+"ABCD"[st.c]+", not quite"}</span>
        <p class="yours">You wrote: ${st.why?esc(st.why):"<em>(no reason written)</em>"}</p>`:`<span class="verdict none">Not predicted yet. Go back to Stage 2 first.</span>`}
      <p><strong>Answer: ${"ABCD"[p.a]}. ${p.o[p.a]}.</strong> ${p.why}</p>
      ${has?`<div class="seg" aria-label="Grade your reasoning">${["Nailed it, answer and reason","Right answer, shaky reason","Missed it, but I get it now"].map((t,i)=>`<button type="button" data-g="${i}" aria-pressed="${g===i}">${t}</button>`).join("")}</div>`:""}</div>`; }).join("");
    document.querySelectorAll(".reveal").forEach(el=>el.querySelectorAll(".seg button").forEach(b=>b.addEventListener("click",()=>{
      const id = el.dataset.id; if (S.grade[id]==null) S.xp += 15; S.grade[id] = +b.dataset.g; save(); renderCheck(); })));
  }

  let picked = new Set(), answered = false;
  const quizOrder = () => S.quiz.retry ? S.quiz.retry : Q.map((_,i)=>i);
  function renderQuiz(){
    const order = quizOrder(), box = $("#quizBox");
    if (S.quiz.done){
      const ans = S.quiz.answers, right = Q.filter((_,i)=>ans[i]===true).length, missed = Q.map((_,i)=>i).filter(i=>ans[i]!==true);
      const rank = RANKS.filter(r=>S.xp>=r[0]).pop()[1];
      box.innerHTML = `<div class="score"><span class="eyebrow">Run complete</span><span class="num">${right} / ${Q.length}</span>
        <span class="rank">Rank: ${rank} · ${S.xp} XP · best streak ${S.quiz.best}</span>
        ${missed.length?`<p>Missed: ${missed.map(i=>"Q"+(i+1)).join(", ")}. Redo them now while the explanations are fresh. A redo still counts.</p>
        <div class="row"><button type="button" class="btn" id="retryBtn">Redo missed (${missed.length})</button><button type="button" class="btn ghost" id="restartBtn">Restart full run</button></div>`
        :`<p>Clean sweep. Head to Stage 6 and learn how to turn this into FRQ points.</p><div class="row"><button type="button" class="btn ghost" id="restartBtn">Restart full run</button></div>`}</div>`;
      const r = $("#retryBtn"); if (r) r.onclick = ()=>{ S.quiz.retry = missed; S.quiz.i = 0; S.quiz.done = false; S.quiz.streak = 0; save(); renderQuiz(); };
      $("#restartBtn").onclick = ()=>{ S.quiz = {i:0,answers:{},streak:0,best:S.quiz.best,done:false,retry:null}; save(); renderQuiz(); };
      return;
    }
    const qi = order[S.quiz.i], q = Q[qi]; picked = new Set(); answered = false;
    box.innerHTML = `<div class="qcard"><div class="quiz-top"><span>${S.quiz.retry?"REDO":"Q"} ${S.quiz.i+1} / ${order.length}</span><span class="streak">${S.quiz.streak>=2?"streak ×"+S.quiz.streak:""}</span></div>
      <div class="meter"><i style="width:${S.quiz.i/order.length*100}%"></i></div>
      ${q.boss?'<span class="boss">BOSS QUESTION · 2× XP</span>':""}
      <p class="qtext"><strong>${q.q}</strong></p>${q.img||""}
      ${q.t==="fbd"?'<p class="note">Select all that apply, then check.</p>':""}
      <div class="opts">${q.o.map((o,i)=>`<button type="button" class="opt" data-i="${i}" aria-pressed="false"><span class="k">${"ABCDEF"[i]}</span><span>${q.t==="fbd"?o[1]:o}</span></button>`).join("")}</div>
      ${q.t==="fbd"?'<div class="row"><button type="button" class="btn" id="checkFbd" disabled>Check my FBD</button></div>':""}
      <div id="fb"></div></div>`;
    box.querySelectorAll(".opt").forEach(b=>b.addEventListener("click",()=>{ if (answered) return; const i=+b.dataset.i;
      if (q.t==="mc") return grade(qi, i===q.a, b);
      picked.has(i)?picked.delete(i):picked.add(i); b.setAttribute("aria-pressed", picked.has(i)); $("#checkFbd").disabled = picked.size===0; }));
    const cf = $("#checkFbd"); if (cf) cf.onclick = ()=>{ const want = new Set(q.a), got = [...picked].map(i=>q.o[i][0]);
      grade(qi, got.length===want.size && got.every(k=>want.has(k))); };
  }
  function grade(qi, ok, btn){
    answered = true; const q = Q[qi], opts = document.querySelectorAll("#quizBox .opt");
    if (q.t==="mc"){ opts.forEach((b,j)=>{ b.disabled = true; if (j===q.a) b.classList.add("right"); }); if (!ok && btn) btn.classList.add("wrong"); }
    else { opts.forEach((b,j)=>{ b.disabled = true; const k = q.o[j][0]; if (q.a.includes(k)) b.classList.add("right"); else if (picked.has(j)) b.classList.add("wrong"); }); $("#checkFbd").disabled = true; }
    if (ok){ S.quiz.streak++; S.quiz.best = Math.max(S.quiz.best, S.quiz.streak); S.xp += (q.boss?20:10) + (S.quiz.streak>=3?5:0); }
    else S.quiz.streak = 0;
    if (S.quiz.answers[qi]!==true) S.quiz.answers[qi] = ok;
    const last = S.quiz.i === quizOrder().length-1;
    $("#fb").innerHTML = `<div class="feedback ${ok?"ok":"no"}"><strong>${ok?"Correct"+(S.quiz.streak>=3?" · +5 streak bonus":""):"Not this time"}</strong>
      ${q.fbd?`<div class="fbd-wrap">${fbd(q.fbd,130)}<p style="flex:1;min-width:180px">${q.e}</p></div>`:`<p>${q.e}</p>`}
      <p class="tip"><strong>FRQ tip:</strong> ${q.tip}</p></div>
      <div class="row" style="margin-top:10px"><button type="button" class="btn" id="nextBtn">${last?"See results":"Next question"}</button></div>`;
    $("#nextBtn").onclick = ()=>{ if (last){ S.quiz.done = true; S.quiz.retry = null; } else S.quiz.i++; save(); renderQuiz(); $("#quiz").scrollIntoView({block:"start"}); };
    save();
  }

  const ps = $("#pauseScore");
  if (ps){ ps.innerHTML = '<option value="">–</option>' + Array.from({length:PMAX+1},(_,i)=>`<option>${i}</option>`).join("");
    ps.value = S.pause || ""; ps.addEventListener("change",()=>{ const old = +S.pause||0, nw = +ps.value||0; S.xp += (nw-old)*5; S.pause = ps.value; save(); }); }

  function renderXP(){
    $("#xp").textContent = S.xp;
    const done = { hook:true, predict: PRED.every(p=>S.pred[p.id]&&S.pred[p.id].locked), learn: S.pause!=="", check: PRED.every(p=>S.grade[p.id]!=null), quiz: S.quiz.done && !S.quiz.retry, frq:false };
    document.querySelectorAll("#levels a").forEach(a=>a.classList.toggle("done", !!done[a.dataset.stage]));
  }
  function renderSummary(){
    const G3 = ["nailed it","right answer, shaky reason","missed, understands now"];
    const lines = [`${cfg.title} · ${new Date().toLocaleDateString()} · ${S.xp} XP`, "", "PREDICTIONS"];
    PRED.forEach((p,n)=>{ const st=S.pred[p.id]; lines.push(`P${n+1}: ${st&&st.locked?("ABCD"[st.c]+(st.c===p.a?" ✓":" ✗")+" | self-grade: "+(S.grade[p.id]!=null?G3[S.grade[p.id]]:"–")+" | why: "+(st.why||"–")):"not done"}`); });
    lines.push("", `PAUSE-AND-SOLVE: ${S.pause||"–"}/${PMAX}`, "", "QUIZ");
    const ans = S.quiz.answers; const right = Q.filter((_,i)=>ans[i]===true).length;
    lines.push(`Correct (incl. redos): ${right}/${Q.length} · best streak ${S.quiz.best}`);
    const miss = Q.map((q,i)=>[q,i]).filter(([_,i])=>ans[i]===false); if (miss.length) lines.push("Still missed: "+miss.map(([q,i])=>"Q"+(i+1)+" ("+q.q.replace(/<[^>]+>/g,"").slice(0,50)+"…)").join("; "));
    $("#summary").textContent = lines.join("\n");
  }
  $("#copyBtn").onclick = async ()=>{ const t = $("#summary").textContent;
    try { await navigator.clipboard.writeText(t); $("#copyMsg").textContent = "Copied."; }
    catch(e){ const r = document.createRange(); r.selectNodeContents($("#summary")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $("#copyMsg").textContent = "Text selected. Press Copy."; } };
  $("#wipeBtn").onclick = ()=>{ $("#wipeAsk").hidden = false; };
  $("#wipeYes").onclick = ()=>{ try{localStorage.removeItem(KEY);}catch(e){} location.reload(); };

  renderPred(); renderCheck(); renderQuiz(); renderXP(); renderSummary();
  return { arrow, fbd, $ };
};
window.QuestKit = { arrow, fbd, $ };
})();
