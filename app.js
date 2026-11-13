"use strict";
/* =========================================================
   Meu Dia — contador de calorias + tracker de peso
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
const OFF = "https://world.openfoodfacts.org";
const OFF_FIELDS = "code,product_name,product_name_pt,generic_name_pt,brands,nutriments,serving_quantity,serving_size,quantity,product_quantity_unit,image_front_small_url";

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num = v => { if (v == null || v === "") return null; const x = typeof v === "string" ? parseFloat(v.replace(",", ".")) : +v; return Number.isFinite(x) ? x : null; };
const fmt = (v, d = 1) => v == null ? "—" : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString("pt-PT", {maximumFractionDigits: d});
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
function scaleNuts(per100, g){ const o = {}; for (const n of NUTS){ const v = num(per100?.[n.k]); o[n.k] = v == null ? null : v * g / 100; } return o; }
function eanValid(code){
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const d = code.split("").map(Number), check = d.pop();
  const sum = d.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - sum % 10) % 10 === check;
}
function mealByHour(){ const h = new Date().getHours() + new Date().getMinutes() / 60; return h < 11 ? 0 : h < 15.5 ? 1 : h < 18.5 ? 2 : h < 22.5 ? 3 : 4; }
function note(t){ $("#note").textContent = t || ""; }

/* ---------- armazenamento local ---------- */
const KEY = "meudia:v1";
let S = load();
function load(){
  let d = {};
  try { d = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
  return {
    products: d.products || {},
    entries: d.entries || [],
    weights: d.weights || [],
    goals: {...DEFAULT_GOALS, ...(d.goals || {})},
    profile: d.profile || {},
  };
}
function save(){
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch { note("⚠️ Não consegui salvar (armazenamento cheio?). Exporte um backup nas configurações."); }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

/* ---------- genéricos ---------- */
const GENERICS = (window.GENERIC_FOODS || []).map((r, i) => ({
  id: "gen-" + i, name: r[0], generic: true, unit: "g",
  per100: {kcal:r[1], prot:r[2], carb:r[3], acuc:r[4], gord:r[5], sat:r[6], fibra:r[7], sal:r[8]},
  units: r[9] || [],
}));
function getProduct(id){ return S.products[id] || GENERICS.find(g => g.id === id) || null; }

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
   DIÁRIO
   ========================================================= */
let curDate = today();
function dayEntries(){ return S.entries.filter(e => e.date === curDate).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); }
function totals(list){ const t = Object.fromEntries(NUTS.map(n => [n.k, 0])); for (const e of list) for (const n of NUTS){ const v = num(e.n?.[n.k]); if (v != null) t[n.k] += v; } return t; }
function dateLabel(s){
  const t = today(), y = new Date(); y.setDate(y.getDate() - 1);
  if (s === t) return "Hoje"; if (s === ymd(y)) return "Ontem";
  return parseYmd(s).toLocaleDateString("pt-BR", {weekday:"short", day:"numeric", month:"short"});
}
function shiftDate(n){ const d = parseYmd(curDate); d.setDate(d.getDate() + n); curDate = ymd(d); renderDiary(); }

function renderDiary(){
  $("#dateLabel").textContent = dateLabel(curDate);
  $("#nextDay").style.visibility = curDate >= today() ? "hidden" : "visible";
  const list = dayEntries(), t = totals(list), G = S.goals;
  const g = G.kcal || 2000, p = Math.min(t.kcal / g, 1);
  $("#kcalBig").textContent = fmt(t.kcal, 0);
  const rf = $("#ringFill"); rf.style.strokeDashoffset = 314.16 * (1 - p); rf.style.stroke = t.kcal > g ? "var(--warn)" : "var(--kcal)";
  const left = g - t.kcal;
  $("#kcalLeft").innerHTML = left >= 0
    ? `Faltam <b>${fmt(left, 0)}</b> kcal<br>meta de ${fmt(g, 0)}`
    : `<b style="color:var(--warn)">${fmt(-left, 0)}</b> kcal acima<br>da meta de ${fmt(g, 0)}`;
  $("#bars").innerHTML = NUTS.filter(n => n.k !== "kcal").map(n => {
    const gv = G[n.k] || n.goal, v = t[n.k], pc = Math.min(v / gv * 100, 100);
    const over = n.limit && v > gv;
    return `<div class="bar${n.sub ? " sub" : ""}${over ? " over" : ""}"><div class="top2"><span>${esc(n.n)}</span><span>${fmt(v, n.dec)} / ${fmt(gv, n.dec)} ${n.u}</span></div><div class="track"><div class="fill" style="width:${pc}%;background:var(${n.c})"></div></div></div>`;
  }).join("");

  // refeições
  const byMeal = MEALS.map(() => []);
  for (const e of list) byMeal[e.meal ?? 4].push(e);
  $("#meals").innerHTML = MEALS.map((m, i) => {
    const items = byMeal[i];
    if (!items.length && i === 4) return "";
    const k = totals(items).kcal;
    return `<div class="sec-title"><span>${m}</span><span>${items.length ? fmt(k, 0) + " kcal" : `<button class="meal-add" data-meal="${i}">＋ adicionar</button>`}</span></div>
      ${items.length ? `<div class="card">${items.map(entryRow).join("")}</div>` : ""}`;
  }).join("");
  renderRecents();
}
function entryRow(e){
  const p = e.productId ? getProduct(e.productId) : null;
  const img = p?.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : `<div class="thumb">${p?.generic ? "🥗" : "🍽️"}</div>`;
  return `<div class="entry" data-eid="${esc(e.id)}">${img}<div class="nm"><div>${esc(e.name)}</div><div>${fmt(e.grams, 0)} ${esc(e.unit || "g")} · P ${fmt(e.n?.prot)} · C ${fmt(e.n?.carb)} · G ${fmt(e.n?.gord)}</div></div><div class="k">${fmt(e.n?.kcal, 0)} kcal</div></div>`;
}
function renderRecents(){
  const list = Object.entries(S.products).map(([id, p]) => ({id, ...p})).filter(p => p.lastUsed).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 12);
  $("#recentsWrap").classList.toggle("hidden", !list.length);
  $("#recents").innerHTML = list.map(p => `<button class="chip" data-pid="${esc(p.id)}">${esc(p.name)}</button>`).join("");
}

$("#prevDay").onclick = () => shiftDate(-1);
$("#nextDay").onclick = () => shiftDate(1);
$("#dateLabel").onclick = () => { if (curDate !== today()){ curDate = today(); renderDiary(); } };
$("#recents").onclick = e => { const id = e.target.closest("[data-pid]")?.dataset.pid; const p = id && getProduct(id); if (p) portionSheet(id, p); };
$("#meals").onclick = e => {
  const add = e.target.closest("[data-meal]"); if (add){ pendingMeal = +add.dataset.meal; return searchSheet(); }
  const row = e.target.closest("[data-eid]"); if (row) editEntrySheet(row.dataset.eid);
};
let pendingMeal = null;

/* ---------- folha ---------- */
function openSheet(html){ $("#sheet").innerHTML = html; $("#veil").classList.add("on"); $("#sheet").scrollTop = 0; }
function closeSheet(){ $("#veil").classList.remove("on"); $("#sheet").innerHTML = ""; pendingMeal = null; }
$("#veil").addEventListener("click", e => { if (e.target.id === "veil" || e.target.closest("[data-close]")) closeSheet(); });

/* ---------- consulta por código ---------- */
async function lookup(code){
  code = String(code).replace(/\D/g, "");
  const local = S.products[code];
  if (local) return portionSheet(code, local);
  openSheet(`<h2>Procurando…</h2><div class="sub">Código ${esc(code)} · Open Food Facts <span class="spin"></span></div>`);
  let p = null, err = false;
  try { p = await offProduct(code); } catch { err = true; }
  if (p && p.hasNutrition){ S.products[code] = p; save(); return portionSheet(code, p); }
  const msg = err
    ? `<div class="warnbox">Sem conexão com o Open Food Facts agora. Você pode preencher à mão.</div>`
    : p ? `<div class="warnbox">Achei “${esc(p.name)}”, mas sem tabela nutricional na base. Preencha com o rótulo (por 100 ${esc(p.unit)}).</div>`
        : `<div class="warnbox">Esse código ainda não está no Open Food Facts. Preencha com o rótulo — fica salvo pra próxima.</div>`;
  productForm(code, p || {}, msg);
}

/* ---------- formulário de produto ---------- */
function productForm(code, p, msg, fixedId){
  openSheet(`<h2>${fixedId ? "Editar produto" : "Produto novo"}</h2>
    <div class="sub">${code ? `Código ${esc(code)}` : "Sem código"}</div>
    ${msg || ""}
    <label class="f">Nome</label><input type="text" id="pName" value="${esc(p.name || "")}" placeholder="ex: Iogurte grego natural">
    <div class="grid2">
      <div><label class="f">Unidade</label><select id="pUnit"><option value="g">g</option><option value="ml"${p.unit === "ml" ? " selected" : ""}>ml</option></select></div>
      <div><label class="f">Porção do rótulo</label><input type="number" inputmode="decimal" id="pPort" value="${p.portion ?? ""}" placeholder="opcional"></div>
    </div>
    <div class="sub" style="margin:14px 0 0">Valores <b>por 100</b> do rótulo</div>
    <div class="grid2">${NUTS.map(n => `<div><label class="f">${esc(n.n)} (${n.u})</label><input type="number" inputmode="decimal" step="any" id="v_${n.k}" value="${p.per100?.[n.k] != null ? Math.round(p.per100[n.k] * 100) / 100 : ""}"></div>`).join("")}</div>
    <div class="warnbox hidden" id="pWarn">Preencha pelo menos o nome e as kcal.</div>
    <div class="row"><button class="btn sec" data-close>Cancelar</button><button class="btn" id="pSave">Salvar</button></div>
    ${code ? `<div class="note">Dica: dá pra adicionar esse produto ao Open Food Facts pelo app oficial deles e ajudar todo mundo.</div>` : ""}`);
  $("#pSave").onclick = () => {
    const per100 = {}; for (const n of NUTS) per100[n.k] = num($("#v_" + n.k).value);
    const name = $("#pName").value.trim();
    if (!name || per100.kcal == null){ $("#pWarn").classList.remove("hidden"); return; }
    const id = fixedId || code || "my-" + uid();
    const old = S.products[id] || {};
    S.products[id] = {...old, ...p, name, per100, unit: $("#pUnit").value, portion: num($("#pPort").value), code: code || null, source: old.source === "off" || p.source === "off" ? "off+edit" : "manual", hasNutrition: true};
    save(); portionSheet(id, S.products[id]);
  };
}

/* ---------- porção ---------- */
function portionSheet(id, p, opts = {}){
  const unit = p.unit || "g";
  const units = [...(p.units || [])];
  if (p.portion && !units.some(u => u[1] === p.portion)) units.unshift([p.servingLabel ? `1 porção (${p.servingLabel})` : "1 porção", p.portion]);
  const grams0 = opts.grams ?? p.lastGrams ?? units[0]?.[1] ?? 100;
  let meal = opts.meal ?? pendingMeal ?? mealByHour();
  const quick = [...units.map(u => ({l: `${u[0]}`, g: u[1]})), ...[50, 100, 150, 200].filter(x => !units.some(u => u[1] === x)).map(x => ({l: `${x} ${unit}`, g: x}))].slice(0, 7);
  openSheet(`<div class="phead">${p.image ? `<img src="${esc(p.image)}" alt="">` : ""}<div><h2>${esc(p.name)}</h2>
      <div class="sub" style="margin:0">${p.brand ? esc(p.brand) + " · " : ""}${fmt(num(p.per100?.kcal), 0)} kcal por 100 ${esc(unit)}${p.generic ? " · valor médio" : ""}</div></div></div>
    <label class="f">Quanto?</label>
    <div class="grams"><input type="number" inputmode="decimal" id="gIn" value="${Math.round(grams0 * 10) / 10}"><span class="u">${esc(unit)}</span></div>
    <div class="quick" id="quick">${quick.map(q => `<button data-g="${q.g}">${esc(q.l)}${/\d\s*(g|ml)\b/.test(q.l) ? "" : ` · ${fmt(q.g, 0)} ${esc(unit)}`}</button>`).join("")}</div>
    <label class="f">Refeição</label>
    <div class="quick" id="mealPick">${MEALS.map((m, i) => `<button data-m="${i}" class="${i === meal ? "on" : ""}">${m}</button>`).join("")}</div>
    <table class="nt" id="ntab"></table>
    <div class="row"><button class="btn sec" data-close>Cancelar</button><button class="btn" id="addE">${opts.entryId ? "Salvar" : "Adicionar"}</button></div>
    <div style="text-align:center">${p.generic ? "" : `<button class="linkish" id="editP">Corrigir valores do produto</button>`}</div>`);
  const upd = () => {
    const g = num($("#gIn").value) || 0, v = scaleNuts(p.per100, g);
    $("#ntab").innerHTML = `<tr><th></th><th>por 100</th><th>${fmt(g, 0)} ${esc(unit)}</th></tr>` + NUTS.map(n => `<tr><td>${n.sub ? "&nbsp;&nbsp;" : ""}${esc(n.n)}</td><td>${fmt(num(p.per100?.[n.k]), n.dec)}</td><td>${fmt(v[n.k], n.dec)} ${n.u}</td></tr>`).join("");
  };
  upd(); $("#gIn").oninput = upd;
  $("#quick").onclick = e => { const g = e.target.closest("[data-g]")?.dataset.g; if (g){ $("#gIn").value = g; upd(); } };
  $("#mealPick").onclick = e => { const b = e.target.closest("[data-m]"); if (!b) return; meal = +b.dataset.m; $("#mealPick").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); };
  if ($("#editP")) $("#editP").onclick = () => productForm(p.code || null, p, "", id);
  $("#addE").onclick = () => {
    const g = num($("#gIn").value); if (!g || g <= 0){ $("#gIn").focus(); return; }
    const entry = {date: opts.date || curDate, name: p.brand && !p.name.includes(p.brand) ? `${p.name} · ${p.brand}` : p.name, grams: g, unit, meal, n: scaleNuts(p.per100, g), productId: id};
    if (opts.entryId){ const e = S.entries.find(x => x.id === opts.entryId); Object.assign(e, entry); }
    else S.entries.push({...entry, id: uid(), createdAt: Date.now()});
    S.products[id] = {...p, lastGrams: g, lastUsed: Date.now()};
    save(); closeSheet(); renderDiary();
  };
}
function editEntrySheet(eid){
  const e = S.entries.find(x => x.id === eid); if (!e) return;
  const p = e.productId ? getProduct(e.productId) : null;
  if (p){
    portionSheet(e.productId, p, {grams: e.grams, meal: e.meal, entryId: eid, date: e.date});
    $("#sheet .row").insertAdjacentHTML("afterend", `<div class="row"><button class="btn sec" id="delE" style="color:var(--warn)">Remover do dia</button></div>`);
  } else {
    openSheet(`<h2>${esc(e.name)}</h2><div class="sub">${fmt(e.grams, 0)} ${esc(e.unit || "g")} · ${fmt(e.n?.kcal, 0)} kcal</div><div class="row"><button class="btn sec" data-close>Fechar</button><button class="btn danger" id="delE">Remover</button></div>`);
  }
  $("#delE").onclick = () => { S.entries = S.entries.filter(x => x.id !== eid); save(); closeSheet(); renderDiary(); };
}

/* ---------- busca por nome ---------- */
$("#searchBtn").onclick = () => searchSheet();
function searchSheet(){
  openSheet(`<h2>Buscar alimento</h2><div class="sub">Seus produtos, alimentos genéricos (fruta, arroz, frango…) e o Open Food Facts.</div>
    <form id="sForm"><input type="search" id="sIn" placeholder="ex: banana, iogurte Danone, arroz…" autocomplete="off" enterkeyhint="search"></form>
    <div class="results" id="sLocal"></div>
    <div id="sOffWrap"></div>
    <div class="row"><button class="btn sec" id="sManual">Criar alimento manual</button></div>`);
  const input = $("#sIn"); setTimeout(() => input.focus(), 60);
  const local = () => {
    const q = norm(input.value).trim();
    const mine = Object.entries(S.products).map(([id, p]) => ({id, ...p}));
    let list;
    if (!q) list = mine.filter(p => p.lastUsed).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 8);
    else {
      const terms = q.split(/\s+/);
      const match = p => { const h = norm(p.name + " " + (p.brand || "")); return terms.every(t => h.includes(t)); };
      list = [...mine.filter(match), ...GENERICS.filter(g => !S.products[g.id] && match(g))].slice(0, 25);
    }
    $("#sLocal").innerHTML = list.map(resRow).join("") || (q ? `<div class="empty">Nada nos seus produtos nem nos genéricos.</div>` : "");
    $("#sOffWrap").innerHTML = q.length >= 3 ? `<button class="btn sec full" id="sOff" style="margin-top:8px">🔎 Buscar “${esc(input.value.trim())}” no Open Food Facts</button>` : "";
    if ($("#sOff")) $("#sOff").onclick = remote;
  };
  const remote = async () => {
    const q = input.value.trim(); if (q.length < 3) return;
    $("#sOffWrap").innerHTML = `<div class="note"><span class="spin"></span> Buscando produtos vendidos em Portugal…</div>`;
    try {
      const res = await offSearch(q);
      offCache = Object.fromEntries(res.map(p => ["off-" + p.code, p]));
      $("#sOffWrap").innerHTML = res.length
        ? `<div class="sec-title" style="margin-top:14px">Open Food Facts</div><div class="results">${res.map(p => resRow({...p, id: "off-" + p.code})).join("")}</div>`
        : `<div class="empty">Nenhum resultado no Open Food Facts.</div>`;
    } catch { $("#sOffWrap").innerHTML = `<div class="warnbox">Não consegui buscar agora (sem conexão ou servidor lento). Tente de novo daqui a pouco.</div>`; }
  };
  input.oninput = local; local();
  $("#sForm").onsubmit = e => { e.preventDefault(); input.blur(); remote(); };
  $("#sManual").onclick = () => productForm(null, {name: input.value.trim()});
  $("#sheet").onclick = e => {
    const r = e.target.closest("[data-rid]"); if (!r) return;
    const id = r.dataset.rid;
    if (id.startsWith("off-")){ const p = offCache[id]; if (!p) return; S.products[p.code] = {...(S.products[p.code] || {}), ...p}; save(); return portionSheet(p.code, S.products[p.code]); }
    const p = getProduct(id); if (p) portionSheet(id, p);
  };
}
let offCache = {};
function resRow(p){
  const img = p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" class="thumb">` : `<div class="thumb">${p.generic ? "🥗" : "🛒"}</div>`;
  return `<div class="res" data-rid="${esc(p.id)}">${img}<div class="nm"><div>${esc(p.name)}${p.generic ? `<span class="tag">genérico</span>` : ""}</div><small>${esc(p.brand || "")}</small></div><div class="k">${fmt(num(p.per100?.kcal), 0)} kcal/100${esc(p.unit || "g")}</div></div>`;
}

/* =========================================================
   SCANNER (câmera ao vivo)
   ========================================================= */
let stream = null, scanning = false, detector = null, torchOn = false;
$("#scanBtn").onclick = startScanner;
$("#scanClose").onclick = stopScanner;
$("#scanType").onclick = () => { stopScanner(); typeSheet(); };
$("#scanPhoto").onclick = () => { stopScanner(); $("#photoInput").value = ""; $("#photoInput").click(); };

async function initDetector(){
  if (detector !== null) return detector;
  detector = false;
  if ("BarcodeDetector" in window){
    try {
      const f = await BarcodeDetector.getSupportedFormats();
      if (f.includes("ean_13")) detector = new BarcodeDetector({formats: ["ean_13", "ean_8", "upc_a", "upc_e"].filter(x => f.includes(x))});
    } catch {}
  }
  return detector;
}
async function startScanner(){
  if (!navigator.mediaDevices?.getUserMedia){ return typeSheet("Este navegador não libera a câmera. Use uma foto ou digite o código."); }
  $("#scanner").classList.remove("hidden", "found");
  $("#scanMsg").textContent = "Aponte para o código de barras";
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal: "environment"}, width: {ideal: 1920}, height: {ideal: 1080}}});
  } catch (e) {
    $("#scanner").classList.add("hidden");
    return typeSheet(e?.name === "NotAllowedError" ? "Sem permissão pra câmera. Libere nas configurações do navegador, ou use foto/digite o código." : "Não consegui abrir a câmera. Use uma foto ou digite o código.");
  }
  const v = $("#video"); v.srcObject = stream; await v.play().catch(() => {});
  const track = stream.getVideoTracks()[0];
  try {
    const caps = track.getCapabilities?.() || {};
    $("#torchBtn").classList.toggle("hidden", !caps.torch);
    if (caps.focusMode?.includes("continuous")) track.applyConstraints({advanced: [{focusMode: "continuous"}]}).catch(() => {});
  } catch {}
  torchOn = false; $("#torchBtn").classList.remove("on");
  await initDetector();
  scanning = true; scanLoop();
}
$("#torchBtn").onclick = async () => {
  const track = stream?.getVideoTracks()[0]; if (!track) return;
  torchOn = !torchOn;
  try { await track.applyConstraints({advanced: [{torch: torchOn}]}); $("#torchBtn").classList.toggle("on", torchOn); } catch { torchOn = false; }
};
function stopScanner(){
  scanning = false;
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  $("#video").srcObject = null;
  $("#scanner").classList.add("hidden");
}
const scanCanvas = document.createElement("canvas");
let frameN = 0, lastCode = null, lastCount = 0;
async function scanLoop(){
  const v = $("#video");
  while (scanning){
    await new Promise(r => setTimeout(r, detector ? 120 : 180));
    if (!scanning || v.readyState < 2 || !v.videoWidth) continue;
    let code = null;
    try {
      if (detector){ const r = await detector.detect(v); code = r[0]?.rawValue || null; }
      else code = decodeVideoFrame(v);
    } catch {}
    if (!code || !eanValid(code)) continue;
    // ZXing: exige 2 leituras iguais seguidas pra evitar erro
    if (!detector){ if (code === lastCode) lastCount++; else { lastCode = code; lastCount = 1; } if (lastCount < 2) continue; }
    $("#scanner").classList.add("found");
    $("#scanMsg").textContent = code;
    navigator.vibrate?.(60);
    await new Promise(r => setTimeout(r, 250));
    stopScanner(); lastCode = null;
    return lookup(code);
  }
}
function decodeVideoFrame(v){
  // recorta a faixa central (onde fica a moldura)
  const vw = v.videoWidth, vh = v.videoHeight;
  const rot = (frameN++ % 4 === 3) ? 90 : 0;
  const sw = Math.round(vw * 0.9), sh = Math.round(vh * 0.5);
  const sx = Math.round((vw - sw) / 2), sy = Math.round((vh - sh) / 2);
  const scale = Math.min(1, 1000 / Math.max(sw, sh));
  const w = Math.round(sw * scale), h = Math.round(sh * scale);
  const c = scanCanvas, x = c.getContext("2d", {willReadFrequently: true});
  if (rot){ c.width = h; c.height = w; x.save(); x.translate(h / 2, w / 2); x.rotate(Math.PI / 2); x.drawImage(v, sx, sy, sw, sh, -w / 2, -h / 2, w, h); x.restore(); }
  else { c.width = w; c.height = h; x.drawImage(v, sx, sy, sw, sh, 0, 0, w, h); }
  return zxDecode(lumOf(c), c.width, c.height);
}
function lumOf(c){
  const {data} = c.getContext("2d").getImageData(0, 0, c.width, c.height);
  const L = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
  return L;
}
let zxReader = null;
function zxDecode(L, w, h){
  const Z = window.ZXing; if (!Z) return null;
  if (!zxReader){
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    zxReader = new Z.MultiFormatReader(); zxReader.setHints(hints);
  }
  const src = new Z.RGBLuminanceSource(L, w, h);
  for (const B of [Z.HybridBinarizer, Z.GlobalHistogramBinarizer]){
    try { return zxReader.decode(new Z.BinaryBitmap(new B(src))).getText(); } catch {}
  }
  return null;
}

/* foto (alternativa) */
function loadImg(file){ return new Promise((res, rej) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; }); }
async function decodePhoto(file){
  const img = await loadImg(file);
  await initDetector();
  if (detector){ try { const r = await detector.detect(img); if (r[0]) return r[0].rawValue; } catch {} }
  for (const side of [1400, 900, 2200]) for (const rot of [0, 90]){
    const s = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
    const c = document.createElement("canvas"), x = c.getContext("2d", {willReadFrequently: true});
    if (rot){ c.width = h; c.height = w; x.translate(h / 2, w / 2); x.rotate(Math.PI / 2); x.drawImage(img, -w / 2, -h / 2, w, h); }
    else { c.width = w; c.height = h; x.drawImage(img, 0, 0, w, h); }
    const code = zxDecode(lumOf(c), c.width, c.height);
    if (code) return code;
    await new Promise(r => setTimeout(r, 0));
  }
  return null;
}
$("#photoInput").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  openSheet(`<h2>Lendo o código…</h2><div class="sub"><span class="spin"></span></div>`);
  let code = null; try { code = await decodePhoto(f); } catch {}
  if (code) lookup(code); else typeSheet("Não consegui ler o código nessa foto. Tente mais perto e com boa luz, ou digite os números.");
};
function typeSheet(msg){
  openSheet(`<h2>Digitar código</h2>${msg ? `<div class="warnbox">${esc(msg)}</div>` : `<div class="sub">Os números embaixo das barras.</div>`}
    <form id="cForm"><input type="tel" id="codeIn" inputmode="numeric" placeholder="ex: 5601234567890" autocomplete="off"></form>
    <div class="row"><button class="btn sec" data-close>Cancelar</button><button class="btn" id="codeGo">Buscar</button></div>`);
  const go = () => { const v = $("#codeIn").value.replace(/\D/g, ""); if (v.length >= 6) lookup(v); else $("#codeIn").focus(); };
  $("#codeGo").onclick = go; $("#cForm").onsubmit = e => { e.preventDefault(); go(); };
  setTimeout(() => $("#codeIn")?.focus(), 60);
}

/* =========================================================
   PESO
   ========================================================= */
let wRange = 30;
function weightsSorted(){ return [...S.weights].sort((a, b) => a.date.localeCompare(b.date)); }
function weightAt(list, date, maxDays){ // último registro até 'date', no máximo maxDays antes
  let best = null; for (const w of list){ if (w.date <= date) best = w; }
  if (!best) return null;
  return (parseYmd(date) - parseYmd(best.date)) / 864e5 <= maxDays ? best : null;
}
function movingAvg(list){ // média dos últimos 7 dias para cada registro
  return list.map(w => { const t = parseYmd(w.date); const win = list.filter(x => { const d = (t - parseYmd(x.date)) / 864e5; return d >= 0 && d < 7; }); return {date: w.date, kg: win.reduce((s, x) => s + x.kg, 0) / win.length}; });
}
function renderWeight(){
  const list = weightsSorted(), P = S.profile;
  const last = list[list.length - 1];
  const delta = days => { if (!last) return null; const d = parseYmd(last.date); d.setDate(d.getDate() - days); const ref = weightAt(list, ymd(d), Math.max(3, days / 3)); return ref ? last.kg - ref.kg : null; };
  const d7 = delta(7), d30 = delta(30);
  const dcls = v => v == null ? "" : v < 0 ? "down" : v > 0 ? "up" : "";
  const dtxt = v => v == null ? "—" : (v > 0 ? "+" : "") + fmt(v, 1);
  $("#wstats").innerHTML = `<div><b>${last ? fmt(last.kg, 1) : "—"}</b><span>atual (kg)</span></div>
    <div><b class="${dcls(d7)}">${dtxt(d7)}</b><span>7 dias</span></div>
    <div><b class="${dcls(d30)}">${dtxt(d30)}</b><span>30 dias</span></div>`
    + (last && P.heightCm ? `<div class="bmi" style="grid-column:1/-1">IMC ${fmt(last.kg / (P.heightCm / 100) ** 2, 1)}${P.goalKg ? ` · meta ${fmt(P.goalKg, 1)} kg (faltam ${fmt(Math.abs(last.kg - P.goalKg), 1)})` : ""}</div>`
       : last && P.goalKg ? `<div class="bmi" style="grid-column:1/-1">meta ${fmt(P.goalKg, 1)} kg (faltam ${fmt(Math.abs(last.kg - P.goalKg), 1)})</div>` : "");
  $("#wRange").querySelectorAll("button").forEach(b => b.classList.toggle("on", +b.dataset.r === wRange));
  $("#wchart").innerHTML = chartSVG(list);
  $("#wlist").innerHTML = list.length
    ? [...list].reverse().map((w, i, arr) => { const prev = arr[i + 1]; const dd = prev ? w.kg - prev.kg : null;
        return `<div class="wrow" data-wd="${w.date}"><div><b>${fmt(w.kg, 1)} kg</b> ${dd != null ? `<small class="${dcls(dd)}">${dtxt(dd)}</small>` : ""}</div><small>${parseYmd(w.date).toLocaleDateString("pt-BR", {weekday: "short", day: "numeric", month: "short", year: parseYmd(w.date).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined})}</small></div>`; }).join("")
    : `<div class="empty">Nenhum peso registrado ainda.</div>`;
}
function chartSVG(all){
  const W = 340, H = 190, L = 34, R = 10, T = 12, B = 24;
  let list = all;
  if (wRange){ const from = new Date(); from.setDate(from.getDate() - wRange); list = all.filter(w => w.date >= ymd(from)); }
  if (list.length < 2) return `<div class="empty">${all.length < 2 ? "Registre pelo menos 2 pesos pra ver o gráfico." : "Poucos registros nesse período."}</div>`;
  const avg = movingAvg(all).filter(a => list.some(w => w.date === a.date));
  const t0 = +parseYmd(list[0].date), t1 = Math.max(+parseYmd(list[list.length - 1].date), t0 + 864e5);
  const vals = list.map(w => w.kg);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const goal = S.profile.goalKg; if (goal && goal > lo - 3 && goal < hi + 3){ lo = Math.min(lo, goal); hi = Math.max(hi, goal); }
  const padK = Math.max(0.5, (hi - lo) * 0.15); lo -= padK; hi += padK;
  const x = d => L + (parseYmd(d) - t0) / (t1 - t0) * (W - L - R);
  const y = k => T + (hi - k) / (hi - lo) * (H - T - B);
  const step = (hi - lo) > 8 ? 2 : (hi - lo) > 3 ? 1 : 0.5;
  let grid = "";
  for (let k = Math.ceil(lo / step) * step; k <= hi; k += step) grid += `<line x1="${L}" x2="${W - R}" y1="${y(k)}" y2="${y(k)}" stroke="var(--line)"/><text x="${L - 5}" y="${y(k) + 3}" text-anchor="end">${fmt(k, step < 1 ? 1 : 0)}</text>`;
  const fmtD = d => parseYmd(d).toLocaleDateString("pt-BR", {day: "numeric", month: "short"}).replace(".", "");
  const xl = `<text x="${L}" y="${H - 6}">${fmtD(list[0].date)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${fmtD(list[list.length - 1].date)}</text>`;
  const gl = goal && goal >= lo && goal <= hi ? `<line x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--accent)" stroke-dasharray="4 4"/><text x="${W - R}" y="${y(goal) - 4}" text-anchor="end" style="fill:var(--accent)">meta</text>` : "";
  const pts = list.map(w => `<circle cx="${x(w.date)}" cy="${y(w.kg)}" r="2.6" fill="var(--prot)" opacity=".55"/>`).join("");
  const line = `<polyline fill="none" stroke="var(--prot)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" points="${avg.map(a => `${x(a.date)},${y(a.kg)}`).join(" ")}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de peso">${grid}${gl}${line}${pts}${xl}</svg><div class="note" style="margin:4px 0 0">Pontos = pesagens · linha = média de 7 dias</div>`;
}
$("#wRange").onclick = e => { const r = e.target.closest("[data-r]"); if (r){ wRange = +r.dataset.r; renderWeight(); } };
$("#addWeightBtn").onclick = () => weightSheet();
$("#wlist").onclick = e => { const r = e.target.closest("[data-wd]"); if (r) weightSheet(r.dataset.wd); };
function weightSheet(date){
  const existing = date ? S.weights.find(w => w.date === date) : null;
  const last = weightsSorted().pop();
  openSheet(`<h2>${existing ? "Editar peso" : "Registrar peso"}</h2><div class="sub">Dica: pese-se sempre no mesmo horário (de manhã, em jejum) pra comparar melhor.</div>
    <div class="grams"><input type="number" inputmode="decimal" step="0.1" id="wIn" value="${existing ? existing.kg : last ? last.kg : ""}" placeholder="0,0"><span class="u">kg</span></div>
    <label class="f">Data</label><input type="date" id="wDate" value="${date || today()}" max="${today()}">
    <div class="row"><button class="btn sec" data-close>Cancelar</button><button class="btn" id="wSave">Salvar</button></div>
    ${existing ? `<div class="row"><button class="btn sec" id="wDel" style="color:var(--warn)">Apagar registro</button></div>` : ""}`);
  setTimeout(() => { const i = $("#wIn"); i?.focus(); i?.select(); }, 60);
  $("#wSave").onclick = () => {
    const kg = num($("#wIn").value), d = $("#wDate").value || today();
    if (!kg || kg < 20 || kg > 400){ $("#wIn").focus(); return; }
    S.weights = S.weights.filter(w => w.date !== d && (!existing || w.date !== existing.date));
    S.weights.push({date: d, kg: Math.round(kg * 10) / 10});
    save(); closeSheet(); renderWeight();
  };
  if (existing) $("#wDel").onclick = () => { S.weights = S.weights.filter(w => w.date !== date); save(); closeSheet(); renderWeight(); };
}

/* =========================================================
   CONFIGURAÇÕES + BACKUP
   ========================================================= */
$("#settingsBtn").onclick = $("#settingsBtn2").onclick = settingsSheet;
function settingsSheet(){
  const G = S.goals, P = S.profile;
  openSheet(`<h2>Configurações</h2>
    <div class="sec-title" style="margin-top:8px">Metas diárias</div>
    <div class="sub">Padrão: valores de referência da UE para adultos (2000 kcal).</div>
    <div class="grid2">${NUTS.map(n => `<div><label class="f">${esc(n.n)} (${n.u})</label><input type="number" inputmode="decimal" id="g_${n.k}" value="${G[n.k]}"></div>`).join("")}</div>
    <button class="linkish" id="gReset">Voltar ao padrão</button>
    <div class="sec-title">Corpo</div>
    <div class="grid2"><div><label class="f">Altura (cm)</label><input type="number" inputmode="decimal" id="hCm" value="${P.heightCm ?? ""}" placeholder="opcional"></div>
    <div><label class="f">Peso meta (kg)</label><input type="number" inputmode="decimal" id="gKg" value="${P.goalKg ?? ""}" placeholder="opcional"></div></div>
    <div class="row"><button class="btn sec" data-close>Cancelar</button><button class="btn" id="setSave">Salvar</button></div>
    <div class="sec-title">Backup</div>
    <div class="sub">Os dados ficam só neste aparelho/navegador. Exporte de vez em quando pra não perder nada.</div>
    <div class="row"><button class="btn sec" id="exp">⬇️ Exportar</button><button class="btn sec" id="imp">⬆️ Importar</button></div>
    <div class="note" style="margin-top:16px">${S.entries.length} registros de comida · ${Object.keys(S.products).length} produtos salvos · ${S.weights.length} pesagens<br>
    Dados de produtos: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> (ODbL)</div>`);
  $("#gReset").onclick = () => { for (const n of NUTS) $("#g_" + n.k).value = DEFAULT_GOALS[n.k]; };
  $("#setSave").onclick = () => {
    for (const n of NUTS){ const v = num($("#g_" + n.k).value); S.goals[n.k] = v && v > 0 ? v : DEFAULT_GOALS[n.k]; }
    S.profile.heightCm = num($("#hCm").value); S.profile.goalKg = num($("#gKg").value);
    save(); closeSheet(); renderAll();
  };
  $("#exp").onclick = exportData;
  $("#imp").onclick = () => { $("#importInput").value = ""; $("#importInput").click(); };
}
function exportData(){
  const blob = new Blob([JSON.stringify({app: "meu-dia", version: 1, exportedAt: new Date().toISOString(), ...S}, null, 1)], {type: "application/json"});
  const file = new File([blob], `meu-dia-backup-${today()}.json`, {type: "application/json"});
  if (navigator.canShare?.({files: [file]})){ navigator.share({files: [file], title: "Backup Meu Dia"}).catch(() => {}); return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$("#importInput").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  let d; try { d = JSON.parse(await f.text()); } catch { return openSheet(`<h2>Arquivo inválido</h2><div class="warnbox">Não é um backup do Meu Dia.</div><div class="row"><button class="btn sec" data-close>Fechar</button></div>`); }
  if (!d || d.app !== "meu-dia") return openSheet(`<h2>Arquivo inválido</h2><div class="warnbox">Não é um backup do Meu Dia.</div><div class="row"><button class="btn sec" data-close>Fechar</button></div>`);
  openSheet(`<h2>Importar backup?</h2><div class="sub">${(d.entries || []).length} registros de comida, ${(d.weights || []).length} pesagens, ${Object.keys(d.products || {}).length} produtos.</div>
    <div class="row"><button class="btn sec" id="impMerge">Juntar com o atual</button><button class="btn danger" id="impRepl">Substituir tudo</button></div>
    <div class="row"><button class="btn sec" data-close>Cancelar</button></div>`);
  $("#impRepl").onclick = () => { S = {products: d.products || {}, entries: d.entries || [], weights: d.weights || [], goals: {...DEFAULT_GOALS, ...(d.goals || {})}, profile: d.profile || {}}; save(); closeSheet(); renderAll(); };
  $("#impMerge").onclick = () => {
    const ids = new Set(S.entries.map(x => x.id));
    S.entries.push(...(d.entries || []).filter(x => !ids.has(x.id)));
    S.products = {...(d.products || {}), ...S.products};
    const wd = new Set(S.weights.map(w => w.date)); S.weights.push(...(d.weights || []).filter(w => !wd.has(w.date)));
    save(); closeSheet(); renderAll();
  };
};

/* =========================================================
   ABAS + INÍCIO
   ========================================================= */
let tab = "diary";
document.querySelector(".tabs").onclick = e => { const b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab); };
function setTab(t){
  tab = t;
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  $("#view-diary").classList.toggle("hidden", t !== "diary");
  $("#view-weight").classList.toggle("hidden", t !== "weight");
  $("#dockDiary").classList.toggle("hidden", t !== "diary");
  renderAll(); window.scrollTo(0, 0);
}
function renderAll(){ if (tab === "diary") renderDiary(); else renderWeight(); }
document.addEventListener("visibilitychange", () => { if (!document.hidden && !scanning){ S = load(); renderAll(); } });
renderAll();

if ("serviceWorker" in navigator && location.protocol === "https:"){
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
