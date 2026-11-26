"use strict";
/* =========================================================
   Meu Dia — núcleo: constantes, utilidades, estado,
   Open Food Facts, folha, toast e navegação (botão voltar).
   Dados salvos só neste aparelho (localStorage).
   Produtos: Open Food Facts (openfoodfacts.org, licença ODbL)
   ========================================================= */

/* ---------- nutrientes ---------- */
const NUTS = [
  {k:"kcal", n:"Energia",              u:"kcal", c:"--kcal", goal:2000, dec:0},
  {k:"prot", n:"Proteínas",            u:"g",    c:"--prot", goal:50,   dec:1},
  {k:"carb", n:"Carboidratos",         u:"g",    c:"--carb", goal:260,  dec:1},
  {k:"acuc", n:"dos quais açúcares",   u:"g",    c:"--carb", goal:90,   dec:1, sub:true, limit:true},
  {k:"gord", n:"Gorduras",             u:"g",    c:"--gord", goal:70,   dec:1, limit:true},
  {k:"sat",  n:"das quais saturadas",  u:"g",    c:"--gord", goal:20,   dec:1, sub:true, limit:true},
  {k:"fibra",n:"Fibras",               u:"g",    c:"--fib",  goal:25,   dec:1},
  {k:"sal",  n:"Sal",                  u:"g",    c:"--sal",  goal:6,    dec:2, limit:true},
];
const DEFAULT_GOALS = Object.fromEntries(NUTS.map(n => [n.k, n.goal]));
const MEALS = ["Café da manhã", "Almoço", "Lanche", "Jantar", "Outros"];
const MEAL_ICONS = ["sun", "bowl", "apple", "moon", "cookie"];
const MEAL_COLORS = ["--carb", "--accent", "--gord", "--prot", "--fib"];
const KCAL_PER_KG = 7700;
const OFF = "https://world.openfoodfacts.org";
const OFF_FIELDS = "code,product_name,product_name_pt,generic_name_pt,brands,nutriments,serving_quantity,serving_size,quantity,product_quantity_unit,image_front_small_url,nutriscore_grade,nova_group";
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num = v => { if (v == null || v === "") return null; const x = typeof v === "string" ? parseFloat(v.replace(",", ".")) : +v; return Number.isFinite(x) ? x : null; };
const fmt = (v, d = 1) => v == null || !Number.isFinite(v) ? "—" : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString("pt-PT", {maximumFractionDigits: d});
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const icon = (n, cls = "") => `<svg class="ic${cls ? " " + cls : ""}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const fmtDay = (s, o = {day: "numeric", month: "short"}) => parseYmd(s).toLocaleDateString("pt-BR", o).replace(/\./g, "");

function scaleNuts(per100, g){ const o = {}; for (const n of NUTS){ const v = num(per100?.[n.k]); o[n.k] = v == null ? null : v * g / 100; } return o; }
function totals(list){ const t = Object.fromEntries(NUTS.map(n => [n.k, 0])); for (const e of list) for (const n of NUTS){ const v = num(e.n?.[n.k]); if (v != null) t[n.k] += v; } return t; }
function eanValid(code){
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const d = code.split("").map(Number), check = d.pop();
  const sum = d.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - sum % 10) % 10 === check;
}
function mealByHour(){ const h = new Date().getHours() + new Date().getMinutes() / 60; return h < 11 ? 0 : h < 15.5 ? 1 : h < 18.5 ? 2 : h < 22.5 ? 3 : 4; }
function groupByDate(list){ const m = new Map(); for (const e of list){ if (!m.has(e.date)) m.set(e.date, []); m.get(e.date).push(e); } return m; }
/** regressão linear simples: pontos [{x, y}] → {slope, at(x)} */
function regress(pts){
  const n = pts.length; if (n < 2) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0, sxx = 0; for (const p of pts){ sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; }
  if (!sxx) return null;
  const slope = sxy / sxx;
  return {slope, at: x => my + slope * (x - mx)};
}

/* ---------- armazenamento local ---------- */
const KEY = "meudia:v1";
const DEFAULT_SETTINGS = {theme: "auto", waterGoal: 2000, waterStep: 250, lastExport: null};
function normalize(d){
  const obj = v => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const arr = v => Array.isArray(v) ? v : [];
  d = obj(d);
  return {
    products: obj(d.products),
    entries: arr(d.entries).filter(e => e && typeof e.date === "string"),
    weights: arr(d.weights).filter(w => w && typeof w.date === "string" && Number.isFinite(+w.kg)),
    goals: {...DEFAULT_GOALS, ...obj(d.goals)},
    profile: obj(d.profile),
    water: obj(d.water),
    combos: arr(d.combos).filter(c => c && Array.isArray(c.items)),
    train: obj(d.train),
    periods: arr(d.periods).filter(p => p && /^\d{4}-\d{2}-\d{2}$/.test(p.start) && (!p.end || (/^\d{4}-\d{2}-\d{2}$/.test(p.end) && p.end >= p.start))),
    settings: {...DEFAULT_SETTINGS, ...obj(d.settings)},
  };
}
function load(){
  let d = {};
  try { d = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
  return normalize(d);
}
let S = load();
function save(){
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch { toast("Não consegui salvar (armazenamento cheio?). Exporte um backup nos ajustes."); }
  if (typeof syncSoon === "function") syncSoon();
}
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

/* ---------- comido × planejado, hábitos, sequência ---------- */
const eatenEntries = () => S.entries.filter(e => !e.planned);
function loggedDates(){ return new Set(eatenEntries().map(e => e.date)); }
/** sequência atual (conta hoje se já registrou, senão termina ontem) e recorde */
function streaks(dates){
  const t = today();
  let cur = 0, d = dates.has(t) ? t : addDays(t, -1);
  while (dates.has(d)){ cur++; d = addDays(d, -1); }
  let best = 0, run = 0, prev = null;
  for (const s of [...dates].sort()){ run = prev && daysBetween(prev, s) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = s; }
  return {cur, best};
}
const TRAIN_TYPES = [["musc", "Musculação", "dumbbell"], ["cardio", "Cardio", "run"], ["esporte", "Esporte", "ball"], ["outro", "Outro", "bolt"]];
function habitDay(d, logged = loggedDates()){
  return {train: !!S.train[d], water: (S.water[d] || 0) >= (S.settings.waterGoal || 2000), log: logged.has(d)};
}
function habitDates(k){
  if (k === "train") return new Set(Object.keys(S.train));
  if (k === "water") return new Set(Object.keys(S.water).filter(d => S.water[d] >= (S.settings.waterGoal || 2000)));
  return loggedDates();
}

/* ---------- ciclo menstrual ---------- */
const PERIOD_CAP = 10; // menstruação sem fim registrado: conta no máximo 10 dias
function periodsSorted(){ return [...S.periods].sort((a, b) => a.start.localeCompare(b.start)); }
function periodEnd(p){ if (p.end) return p.end; const cap = addDays(p.start, PERIOD_CAP - 1), t = today(); return t < cap ? t : cap; }
function onPeriod(d){ return S.periods.some(p => p.start <= d && d <= periodEnd(p)); }
function openPeriod(){ const l = periodsSorted().at(-1); return l && !l.end && daysBetween(l.start, today()) < PERIOD_CAP ? l : null; }
/** dia do ciclo, média, previsão (só com 3+ ciclos completos) e fase aproximada */
function cycleInfo(d = today()){
  const all = periodsSorted(), before = all.filter(p => p.start <= d);
  if (!before.length) return null;
  const last = before.at(-1), day = daysBetween(last.start, d) + 1;
  const lens = []; for (let i = 1; i < all.length; i++) lens.push(daysBetween(all[i - 1].start, all[i].start));
  const recent = lens.slice(-6), avg = recent.length ? Math.round(recent.reduce((s, x) => s + x, 0) / recent.length) : null;
  const ended = all.filter(p => p.end), bleedLen = ended.length ? Math.round(ended.reduce((s, p) => s + daysBetween(p.start, p.end) + 1, 0) / ended.length) : 5;
  const canPredict = lens.length >= 3, lastStart = all.at(-1).start;
  const next = canPredict ? addDays(lastStart, avg) : null;
  const bleeding = onPeriod(d);
  let phase = bleeding ? "menstruação" : null, preMenstrual = false;
  if (!bleeding && canPredict && last.start === lastStart){
    const toNext = daysBetween(d, next);
    preMenstrual = toNext >= 0 && toNext <= 10;
    phase = day > avg - 14 ? "lútea" : "folicular";
  }
  return {start: last.start, day, lens, avg, bleedLen, canPredict, next, bleeding, phase, preMenstrual, lastLen: lens.at(-1) ?? null};
}
function predictedPeriod(d){
  const c = cycleInfo(); if (!c?.canPredict || d <= today() || onPeriod(d)) return false;
  return d >= c.next && d <= addDays(c.next, c.bleedLen - 1);
}

/* ---------- cru × cozido: rendimento = peso cozido ÷ peso cru ---------- */
const YIELDS = [
  [2.8, "Arroz", /\barroz\b/],
  [2.3, "Massa", /\b(massa|esparguete|spaghetti|macarr|penne|fusilli|talharim|lasanha|cuscuz|couscous|noodle)/],
  [2.5, "Feijão, grão, lentilha (secos)", /\b(feij|grao|grão|lentilha|ervilha seca|gr[aã]o-de-bico)/],
  [2.6, "Quinoa, bulgur", /\b(quinoa|quinua|bulgur|trigo)/],
  [0.75, "Carne vermelha ou moída", /\b(carne|bovin|vaca|novilho|porco|su[ií]n|picad|mo[ií]d|hamb[uú]rguer|burger|almôndega|almondega|lombo|bife)/],
  [0.7, "Frango ou peru", /\b(frango|galinha|peru|chicken|turkey|aves?)\b/],
  [0.8, "Peixe", /\b(peixe|salm[aã]o|bacalhau|pescada|atum fresco|dourada|robalo|tilápia|tilapia|merluza)/],
];
function guessYield(name){
  const n = norm(name);
  if (/\bcozid|\bassad|\bgrelhad|\bfrit|\benlatad|\bem lata|\bao natural/.test(n)) return null; // já está pronto
  return YIELDS.find(y => y[2].test(n))?.[0] ?? null;
}
const productYield = p => !p || p.cooked === 0 ? null : num(p.cooked) || (!p.generic && !p.recipe ? guessYield(p.name) : null);

/* ---------- produtos ---------- */
const GENERICS = (window.GENERIC_FOODS || []).map((r, i) => ({
  id: "gen-" + i, name: r[0], generic: true, unit: "g",
  per100: {kcal:r[1], prot:r[2], carb:r[3], acuc:r[4], gord:r[5], sat:r[6], fibra:r[7], sal:r[8]},
  units: r[9] || [],
}));
function getProduct(id){ return S.products[id] || GENERICS.find(g => g.id === id) || null; }
const entryName = p => p.brand && !p.name.includes(p.brand) ? `${p.name} · ${p.brand}` : p.name;
/** grams = o que foi pesado; cooked = pesado cozido (usa o rendimento do produto pra voltar ao peso cru do rótulo) */
function makeEntry(id, p, grams, meal, date, {cooked = false, planned = false} = {}){
  const raw = cooked ? grams / (productYield(p) || 1) : grams;
  const e = {id: uid(), createdAt: Date.now(), date, name: entryName(p), grams, unit: p.unit || "g", meal, n: scaleNuts(p.per100, raw), productId: id};
  if (cooked) e.cooked = true;
  if (planned) e.planned = true;
  return e;
}
function thumb(p, fallback = "🍽️"){
  if (p?.image) return `<img src="${esc(p.image)}" alt="" loading="lazy" class="thumb">`;
  return `<div class="thumb">${p?.recipe ? "🍲" : p?.generic ? "🥗" : fallback}</div>`;
}
function badges(p){
  let h = "";
  if (p?.nutriscore) h += `<span class="ns ns-${p.nutriscore}" title="Nutri-Score ${p.nutriscore.toUpperCase()}">${p.nutriscore.toUpperCase()}</span>`;
  if (p?.nova) h += `<span class="nova nova-${p.nova}" title="NOVA ${p.nova}: ${["", "in natura / minimamente processado", "ingrediente culinário", "processado", "ultraprocessado"][p.nova]}">NOVA ${p.nova}</span>`;
  return h;
}

/* ---------- Open Food Facts ---------- */
async function fetchJSON(url, ms = 12000){
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, {signal: ac.signal}); if (!r.ok) throw new Error("http " + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
function fromOFF(p){
  const n = p.nutriments || {};
  const g = k => num(n[k + "_100g"]);
  let kcal = g("energy-kcal");
  if (kcal == null){ const kj = g("energy-kj") ?? g("energy"); if (kj != null) kcal = kj / 4.184; }
  let sal = g("salt"); if (sal == null){ const so = g("sodium"); if (so != null) sal = so * 2.5; }
  const per100 = {kcal, prot:g("proteins"), carb:g("carbohydrates"), acuc:g("sugars"), gord:g("fat"), sat:g("saturated-fat"), fibra:g("fiber"), sal};
  const name = (p.product_name_pt || p.product_name || p.generic_name_pt || "").trim();
  const brand = (p.brands || "").split(",")[0].trim();
  const unit = /^(ml|cl|l)$/i.test(p.product_quantity_unit || "") || /\d\s*(ml|cl|l)\b/i.test(p.quantity || "") ? "ml" : "g";
  return {
    name: name || brand || "Produto " + p.code, brand, code: p.code, unit,
    per100, portion: num(p.serving_quantity), servingLabel: p.serving_size || null,
    image: p.image_front_small_url || null, source: "off",
    nutriscore: /^[a-e]$/.test(p.nutriscore_grade || "") ? p.nutriscore_grade : null,
    nova: [1, 2, 3, 4].includes(+p.nova_group) ? +p.nova_group : null,
    hasNutrition: kcal != null,
  };
}
async function offProduct(code){
  const j = await fetchJSON(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}&lc=pt`);
  if (j.status !== 1 || !j.product) return null;
  return fromOFF({...j.product, code: j.product.code || code});
}
async function offSearch(q){
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&lc=pt&sort_by=unique_scans_n`
    + `&tagtype_0=countries&tag_contains_0=contains&tag_0=portugal&fields=${OFF_FIELDS}`;
  const j = await fetchJSON(url, 15000);
  return (j.products || []).map(fromOFF).filter(p => p.hasNutrition);
}

/* =========================================================
   NAVEGAÇÃO: o botão voltar fecha folha/scanner em vez de sair
   ========================================================= */
const nav = {pending: false, repush: false};
function navOpen(){
  if (nav.pending){ nav.repush = true; return; }
  if (!history.state?.ov) history.pushState({ov: 1}, "");
}
function navClose(){
  if (nav.pending){ nav.repush = false; return; }
  if (history.state?.ov){ nav.pending = true; history.back(); }
}

/* ---------- folha (modal inferior) ---------- */
let sheetOpen = false, pendingMeal = null;
function openSheet(html){
  const sh = $("#sheet");
  sh.onclick = sh.oninput = sh.onchange = null; sh.style.transform = "";
  sh.innerHTML = `<div class="handle" aria-hidden="true"></div>` + html;
  sh.scrollTop = 0;
  if (!sheetOpen){ sheetOpen = true; $("#veil").classList.add("on"); navOpen(); }
}
function closeSheet(fromPop){
  if (!sheetOpen) return;
  sheetOpen = false;
  $("#veil").classList.remove("on"); $("#sheet").innerHTML = ""; $("#sheet").onclick = $("#sheet").oninput = $("#sheet").onchange = null;
  pendingMeal = null;
  if (!fromPop) navClose();
}
$("#veil").addEventListener("click", e => { if (e.target.id === "veil" || e.target.closest("[data-close]")) closeSheet(); });
(() => { // arrastar pra baixo fecha
  const sh = $("#sheet"); let drag = null;
  sh.addEventListener("touchstart", e => {
    if (sh.scrollTop > 0 || e.target.closest("input,select,textarea,.chips,.hscroll")) return;
    drag = {y: e.touches[0].clientY, dy: 0};
  }, {passive: true});
  sh.addEventListener("touchmove", e => {
    if (!drag) return;
    drag.dy = e.touches[0].clientY - drag.y;
    if (drag.dy > 0){ sh.style.transition = "none"; sh.style.transform = `translateY(${drag.dy}px)`; }
  }, {passive: true});
  sh.addEventListener("touchend", () => {
    if (!drag) return;
    sh.style.transition = ""; const far = drag.dy > 110; drag = null;
    if (far) closeSheet(); else sh.style.transform = "";
  });
})();
/** menu de ações: items = [{icon, label, sub?, fn, danger?}] */
function actionSheet(title, items, sub){
  openSheet(`<h2>${esc(title)}</h2>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}<div class="actions">${items.map((it, i) =>
    `<button class="act${it.danger ? " danger" : ""}" data-act="${i}">${icon(it.icon)}<span><b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ""}</span></button>`).join("")}</div>
    <div class="row"><button class="btn sec" data-close>Fechar</button></div>`);
  $("#sheet").onclick = e => { const b = e.target.closest("[data-act]"); if (b) items[+b.dataset.act].fn(); };
}

/* ---------- toast ---------- */
let toastT = null;
function toast(msg, action){
  const t = $("#toast");
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ""}`;
  t.classList.remove("on"); void t.offsetWidth; t.classList.add("on");
  if (action) t.querySelector("button").onclick = () => { t.classList.remove("on"); action.fn(); };
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), action ? 5000 : 2400);
}

/* ---------- micro-interações ---------- */
const buzz = (ms = 15) => navigator.vibrate?.(ms);
function celebrate(){
  buzz([20, 40, 20]);
  if (REDUCED_MOTION.matches) return;
  const box = document.createElement("div"); box.className = "confetti";
  const cols = ["var(--lime)", "var(--prot)", "var(--carb)", "var(--gord)", "var(--water)"];
  for (let i = 0; i < 28; i++){
    const s = document.createElement("i");
    s.style.cssText = `left:${50 + (Math.random() - .5) * 30}%;background:${cols[i % cols.length]};--dx:${(Math.random() - .5) * 340}px;--dy:${-160 - Math.random() * 260}px;--r:${Math.random() * 720 - 360}deg;animation-delay:${Math.random() * 80}ms`;
    box.appendChild(s);
  }
  document.body.appendChild(box); setTimeout(() => box.remove(), 1600);
}
/** anima o número de um elemento até 'to' */
function countUp(el, to, dec = 0){
  const from = num(el.dataset.v) ?? 0; el.dataset.v = to;
  if (REDUCED_MOTION.matches || from === to || !document.body.contains(el)){ el.textContent = fmt(to, dec); return; }
  const t0 = performance.now(), dur = 450;
  const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3; el.textContent = fmt(from + (to - from) * e, dec); if (k < 1 && el.dataset.v == to) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
