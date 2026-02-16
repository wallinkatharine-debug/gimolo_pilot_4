
/* Gimolo — static GitHub Pages prototype (no build tooling) */

// Simple on-device error surfacing (mobile browser consoles are painful).
function showFatal(msg){
  const el = document.getElementById('fatal');
  if(!el) return;
  el.hidden = false;
  el.textContent = `Gimolo hit a loading error: ${msg}`;
}

window.addEventListener('error', (e)=>{
  showFatal(e?.message || 'Unknown error');
});

window.addEventListener('unhandledrejection', (e)=>{
  const r = e?.reason;
  showFatal(r?.message || String(r || 'Unknown promise rejection'));
});

let ACTIVITIES = [];
let current = null;
let matches = 0;

const state = {
  tone: "classic",
  soundOn: true,
  filters: {
    time: "any",      // any | 0-5 | 10 | 20+
    effort: "any",    // any | Light | Medium | High
    location: "Either", // Either | Indoor | Outdoor
    civicOnly: false,
  }
};

const $ = (id) => document.getElementById(id);
function setText(id, value){
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = value;
}


function showScreen(which){
  const screens = ["screenSpin","screenFilters","screenActivity","screenProgress","screenDone","screenProfile"];
  screens.forEach(id => {
    const el = $(id);
    if(!el) return;
    el.classList.toggle("screen--active", id === which);
  });

  // nav active
  document.querySelectorAll(".navBtn").forEach(b => b.classList.remove("navBtn--active"));
  if(which === "screenSpin"){ const b=document.querySelector('.navBtn[data-nav="spin"]'); if(b) b.classList.add("navBtn--active"); }
  if(which === "screenFilters"){ const b=document.querySelector('.navBtn[data-nav="filters"]'); if(b) b.classList.add("navBtn--active"); }
  if(which === "screenProfile"){ const b=document.querySelector('.navBtn[data-nav="profile"]'); if(b) b.classList.add("navBtn--active"); }
  if(which === "screenDone") burstConfetti();
}

function beep(kind="tap"){
  if(!state.soundOn) return;
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = kind === "count" ? 660 : (kind === "spin" ? 520 : 440);
    g.gain.value = 0.04;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.10);
  }catch(e){}
}

function setSound(on){
  state.soundOn = !!on;
  const pill = $("soundToggle");
  if(pill) pill.dataset.on = on ? "true" : "false";
}

function toneLine(){
  const lines = {
    classic: "One gentle step. You’re doing great.",
    warm: "Okay, sweet human. One tiny win.",
    grumpy: "Sure. Let’s pretend we’re excited."
  };
  return lines[state.tone] || lines.classic;
}

function normalizeActivity(a){
  const out = {...a};
  // effort normalization
  if(out.effort){
    const s = String(out.effort).trim();
    if(["light","tiny","low","1"].includes(s.toLowerCase())) out.effort = "Light";
    if(["med","medium","2"].includes(s.toLowerCase())) out.effort = "Medium";
    if(["high","3"].includes(s.toLowerCase())) out.effort = "High";
  }
  // time bucket
  if(!out.time_bucket){
    const m = Number(out.time_min ?? 10);
    out.time_bucket = m<=5 ? "0-5" : (m<=10 ? "10" : "20+");
  }
  if(!out.location) out.location = "Either";
  return out;
}

async function loadActivities(){
  const candidates = ["activities_combined_full.json", "activities_combined_normalized.json"];
  for(const path of candidates){
    try{
      const res = await fetch(path, {cache:"no-store"});
      if(!res.ok) continue;
      const data = await res.json();
      if(Array.isArray(data) && data.length){
        ACTIVITIES = data.map(normalizeActivity);
        return;
      }
    }catch(e){}
  }
  // tiny fallback
  ACTIVITIES = [{
    id:"demo-1",
    title:"Two-Minute Story",
    description:"Tell a 2-minute story where every sentence starts with “Suddenly…”.",
    effort:"Medium", time_min:10, time_bucket:"10", location:"Indoor", participation:"Solo", is_civic:false, lane:"Play Moment"
  }].map(normalizeActivity);
}

function passesFilters(a){
  const f = state.filters;

  if(f.civicOnly && !a.is_civic) return false;

  if(f.time !== "any"){
    if(a.time_bucket !== f.time) return false;
  }

  if(f.effort !== "any"){
    if(String(a.effort || "").toLowerCase() !== String(f.effort).toLowerCase()) return false;
  }

  if(f.location && f.location !== "Either"){
    if(String(a.location || "Either") !== f.location) return false;
  }
  return true;
}

function pickActivity(){
  const pool = ACTIVITIES.filter(passesFilters);
  const list = pool.length ? pool : ACTIVITIES;
  return list[Math.floor(Math.random() * list.length)];
}

function setActivity(a){
  current = a;

  setText("activityTitle", (a.title || "Untitled").toString().toUpperCase());
  setText("activityDesc", a.description || "");
  setText("activityLane", (a.lane || (a.is_civic ? "COMMUNITY" : "A GENTLE SPARK")).toString().toUpperCase());

  const time = a.time_min ? `${a.time_min} min` : (a.time_bucket === "0-5" ? "0–5 min" : "10 min");
  const loc = a.location || "Either";
  const eff = a.effort || "Light";
  const part = a.participation || (a.supports_solo ? "Solo" : "Solo");
  setText("activityMeta", `${time} • ${loc} • ${eff} • ${part}`);

  // progress mirrors
  setText("progressTitle", document.getElementById("activityTitle")?.textContent || "");
  setText("progressDesc", a.description || "");
  setText("progressLane", "IN PROGRESS");
  setText("progressMeta", document.getElementById("activityMeta")?.textContent || "");
}

async function spinToActivity(){
  const wheel = $("spinBtn");
  wheel.classList.add("isSpinning");
  beep("spin");

  const a = pickActivity();
  // create a tiny sense of "working"
  await new Promise(r => setTimeout(r, 520));
  wheel.classList.remove("isSpinning");

  matches += 1;
  {
    const el = document.getElementById("matchCount") || document.getElementById("matchesText");
    if (el) el.textContent = `Matches: ${matches}`;
  }
  setActivity(a);
  showScreen("screenActivity");
}

async function spinAgainFromActivity(){
  const btn = $("spinAgainBtn");
  btn.disabled = true;
  btn.textContent = "Spinning…";
  beep("spin");

  // micro delay so user knows something is happening
  await new Promise(r => setTimeout(r, 650));

  const a = pickActivity();
  setActivity(a);

  btn.disabled = false;
  btn.textContent = "Spin again";
}

async function countdownThenGo(){
  const overlay = $("countdownOverlay");
  const num = $("countNum");
  overlay.classList.add("isOn");
  overlay.setAttribute("aria-hidden","false");

  const seq = ["3","2","1","GO"];
  for(let i=0;i<seq.length;i++){
    num.textContent = seq[i];
    beep("count");
    await new Promise(r => setTimeout(r, 520));
  }
  overlay.classList.remove("isOn");
  overlay.setAttribute("aria-hidden","true");
  showScreen("screenProgress");
}

function wireUI(){
  // top profile icon
  $("profileBtnTop").addEventListener("click", () => showScreen("screenProfile"));

  // sound
  $("soundToggle").addEventListener("click", () => {
    setSound(!state.soundOn);
    beep("tap");
  });

  // nav
  document.querySelectorAll(".navBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const dest = btn.dataset.nav;
      beep("tap");
      if(dest === "spin") showScreen("screenSpin");
      if(dest === "filters") showScreen("screenFilters");
      if(dest === "profile") showScreen("screenProfile");
    });
  });

  // tone
  document.querySelectorAll(".face").forEach(b => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".face").forEach(x => x.classList.remove("face--active"));
      b.classList.add("face--active");
      state.tone = b.dataset.tone || "classic";
      $("spinLine").textContent = toneLine();
      beep("tap");
    });
  });

  // spin
  {
    const el = document.getElementById("spinWheel") || document.getElementById("spinBtn");
    if (el) el.addEventListener("click", spinToActivity);
  }

  // filters toggles
  document.querySelectorAll(".segBtn").forEach(b => {
    b.addEventListener("click", () => {
      const group = b.dataset.filter;
      const value = b.dataset.value;
      if(!group) return;
      // update group active
      document.querySelectorAll(`.segBtn[data-filter="${group}"]`).forEach(x => x.classList.remove("segBtn--active"));
      b.classList.add("segBtn--active");
      state.filters[group] = value;
      beep("tap");
    });
  });
  {
    const el = document.getElementById("civicOnly");
    if (el) el.addEventListener("change", (e) => {
      state.filters.civicOnly = e.target.checked;
      beep("tap");
    });
  }
  {
    const el = document.getElementById("filtersDone");
    if (el) el.addEventListener("click", () => showScreen("screenSpin"));
  }

  // activity actions
  {
    const el = document.getElementById("startBtn");
    if (el) el.addEventListener("click", async () => {
    beep("tap");
    await countdownThenGo();
    });
  }
  {
    const el = document.getElementById("spinAgainBtn");
    if (el) el.addEventListener("click", spinAgainFromActivity);
  }

  // progress actions
  {
    const el = document.getElementById("completeBtn");
    if (el) el.addEventListener("click", () => {
    beep("tap");
    showScreen("screenDone");
    // stats
    const statEl = document.getElementById("statTotal");
    if (statEl) statEl.textContent = String(matches);
    });
  }
  {
    const el = document.getElementById("swapBtn");
    if (el) el.addEventListener("click", async () => {
    beep("tap");
    await spinAgainFromActivity();
    showScreen("screenActivity");
    });
  }
  // done actions
  ["keepEnergyBtn","switchVibeBtn","surpriseBtn"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", () => showScreen("screenSpin"));
  });
}

(async function init(){
  try{
    setSound(true);
    $("spinLine").textContent = toneLine();
    await loadActivities();
    {
      const el = document.getElementById("matchCount") || document.getElementById("matchesText");
      if (el) el.textContent = `Matches: ${matches}`;
    }
    // seed first activity so activity screen is coherent if navigated
    setActivity(pickActivity());
    wireUI();
    showScreen("screenSpin");
  }catch(err){
    showFatal(err?.message || String(err));
  }
})();


function burstConfetti() {
  const layer = document.getElementById("confettiLayer");
  if (!layer) return;
  layer.innerHTML = "";
  const n = 24;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("div");
    p.className = "confettiPiece";
    const left = Math.random() * 100;
    const delay = Math.random() * 200;
    const dur = 800 + Math.random() * 600;
    const size = 6 + Math.random() * 8;
    const hue = 180 + Math.random() * 140; // teal->pink range
    p.style.left = left + "%";
    p.style.width = size + "px";
    p.style.height = (size * 0.6) + "px";
    p.style.background = `hsl(${hue} 90% 70% / 0.95)`;
    p.style.animationDelay = delay + "ms";
    p.style.animationDuration = dur + "ms";
    layer.appendChild(p);
  }
  // cleanup after
  setTimeout(() => { if (layer) layer.innerHTML = ""; }, 1700);
}
