"use strict";
/* =========================================================
   DIÁRIO
   ========================================================= */
let curDate = today(), showAllNuts = false, nagDismissed = false;
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const RING_C = 2 * Math.PI * 60, MINI_C = 2 * Math.PI * 21;

function dayEntries(date = curDate){ return S.entries.filter(e => e.date === date).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); }
function dateLabel(s){
  const t = today();
  if (s === t) return "Hoje"; if (s === addDays(t, -1)) return "Ontem";
  return fmtDay(s, {weekday: "short", day: "numeric", month: "short"});
}
const relDay = s => { const l = dateLabel(s); return l === "Hoje" || l === "Ontem" ? l.toLowerCase() : l; };
function setDate(d){ curDate = d > today() ? today() : d; renderDiary(); }

function renderDiary(){
  const byDate = groupByDate(S.entries);
  const list = (byDate.get(curDate) || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  $("#dateLabel").textContent = dateLabel(curDate);
  $("#dateSub").textContent = fmtDay(curDate, {weekday: "long", day: "numeric", month: "long"});
  $("#todayBtn").classList.toggle("hidden", curDate === today());
  renderWeek(byDate);
  renderHero(totals(list));
  renderWater();
  renderShortcuts();
  renderMeals(list, byDate);
  renderNag();
}

/* ---------- faixa da semana ---------- */
function renderWeek(byDate){
  const dow = (parseYmd(curDate).getDay() + 6) % 7, mon = addDays(curDate, -dow), t = today(), g = S.goals.kcal || 2000;
  let h = `<button class="round sm ghost" id="wkPrev" aria-label="Semana anterior">${icon("left")}</button><div class="days">`;
  for (let i = 0; i < 7; i++){
    const s = addDays(mon, i), items = byDate.get(s) || [], k = totals(items).kcal;
    const st = !items.length ? "" : k > g * 1.05 ? " over" : " ok";
    h += `<button class="day${s === curDate ? " on" : ""}${s === t ? " today" : ""}${st}" data-day="${s}"${s > t ? " disabled" : ""}><span>${WEEKDAYS[parseYmd(s).getDay()]}</span><b>${parseYmd(s).getDate()}</b><i></i></button>`;
  }
  h += `</div><button class="round sm ghost" id="wkNext" aria-label="Próxima semana"${addDays(mon, 7) > t ? " disabled" : ""}>${icon("right")}</button>`;
  $("#week").innerHTML = h;
}
$("#week").onclick = e => {
  const d = e.target.closest("[data-day]"); if (d && !d.disabled) return setDate(d.dataset.day);
  if (e.target.closest("#wkPrev")) setDate(addDays(curDate, -7));
  if (e.target.closest("#wkNext")) setDate(addDays(curDate, 7));
};

/* ---------- hero (anel + macros) ---------- */
function renderHero(t){
  const G = S.goals, g = G.kcal || 2000, over = t.kcal > g;
  countUp($("#kcalBig"), Math.round(Math.abs(g - t.kcal)));
  $("#kcalLbl").textContent = over ? "kcal acima da meta" : "kcal restantes";
  $("#hero").classList.toggle("over", over);
  $("#hGoal").textContent = fmt(g, 0);
  $("#hEaten").textContent = fmt(t.kcal, 0);
  $("#hPct").textContent = fmt(t.kcal / g * 100, 0) + "%";
  // anel segmentado pela origem das calorias (P×4, C×4, G×9)
  const parts = [["segP", t.prot * 4], ["segC", t.carb * 4], ["segG", t.gord * 9]], sum = parts.reduce((s, p) => s + p[1], 0);
  const arc = clamp(t.kcal / g, 0, 1) * RING_C;
  const set = (id, len, off) => { const c = $("#" + id); c.style.strokeDasharray = `${Math.max(0, len)} ${RING_C}`; c.style.strokeDashoffset = -off; };
  if (over || !sum){ set("segK", over ? RING_C : arc, 0); for (const [id] of parts) set(id, 0, 0); }
  else {
    set("segK", 0, 0);
    const shown = parts.filter(p => p[1] > 0), gap = shown.length > 1 && arc > 30 ? 4 : 0;
    let off = 0; for (const [id, v] of parts){ const len = arc * v / sum; set(id, len - (v > 0 ? gap : 0), off); off += len; }
  }
  // mini anéis
  $("#macros").innerHTML = [["prot", "Proteína"], ["carb", "Carbo"], ["gord", "Gordura"]].map(([k, l]) => {
    const n = NUTS.find(x => x.k === k), gv = G[k] || n.goal, v = t[k], bad = n.limit && v > gv, done = !n.limit && v >= gv;
    return `<div class="mac${bad ? " bad" : ""}${done ? " done" : ""}" style="--c:var(--${k})"><svg viewBox="0 0 52 52"><circle class="trk" cx="26" cy="26" r="21"/><circle class="val" cx="26" cy="26" r="21" style="stroke-dasharray:${clamp(v / gv, 0, 1) * MINI_C} ${MINI_C}"/></svg>
      <span>${l}</span><b>${fmt(v, 0)}<small>/${fmt(gv, 0)}g</small></b></div>`;
  }).join("");
  $("#bars").innerHTML = NUTS.filter(n => !["kcal", "prot", "carb", "gord"].includes(n.k)).map(n => {
    const gv = G[n.k] || n.goal, v = t[n.k], pc = Math.min(v / gv * 100, 100), bad = n.limit && v > gv;
    return `<div class="bar${bad ? " over" : ""}"><div class="top2"><span>${esc(n.n.replace(/^d[ao]s quais /, ""))}${n.limit ? " <small>(limite)</small>" : ""}</span><span>${fmt(v, n.dec)} / ${fmt(gv, n.dec)} ${n.u}</span></div><div class="track"><div class="fill" style="width:${pc}%;background:var(${n.c})"></div></div></div>`;
  }).join("");
  $("#bars").classList.toggle("hidden", !showAllNuts);
  $("#moreNuts").innerHTML = `${showAllNuts ? "Menos detalhes" : "Açúcares, saturadas, fibras e sal"} ${icon(showAllNuts ? "up" : "down")}`;
}
$("#moreNuts").onclick = () => { showAllNuts = !showAllNuts; renderDiary(); };
(() => { // deslizar o hero pros lados troca o dia
  const h = $("#hero"); let st = null;
  h.addEventListener("touchstart", e => { st = {x: e.touches[0].clientX, y: e.touches[0].clientY}; }, {passive: true});
  h.addEventListener("touchend", e => {
    if (!st) return; const dx = e.changedTouches[0].clientX - st.x, dy = e.changedTouches[0].clientY - st.y; st = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * .6) return;
    if (dx > 0) setDate(addDays(curDate, -1)); else if (curDate < today()) setDate(addDays(curDate, 1));
    buzz(8);
  });
})();

/* ---------- água ---------- */
function renderWater(){
  const ml = S.water[curDate] || 0, goal = S.settings.waterGoal || 2000, step = S.settings.waterStep || 250;
  const n = clamp(Math.ceil(goal / step), 1, 12), f = ml / step;
  $("#water").classList.toggle("done", ml >= goal);
  $("#water").innerHTML = `<div class="wh"><div class="wi">${icon("drop")}</div><div class="wt"><b>${fmt(ml / 1000, 2)} L</b><span>de ${fmt(goal / 1000, 2)} L de água${ml >= goal ? " ✓" : ""}</span></div>
      <button class="round sm" id="wMinus" aria-label="Tirar ${step} ml"${ml ? "" : " disabled"}>${icon("minus")}</button><button class="round sm solid" id="wPlus" aria-label="Mais ${step} ml">${icon("plus")}</button></div>
    <div class="cups">${Array.from({length: n}, (_, i) => `<button class="cup" data-cup="${i}" aria-label="${(i + 1) * step} ml"><i style="height:${clamp(f - i, 0, 1) * 100}%"></i></button>`).join("")}${f > n ? `<span class="cup-more">+${fmt((ml - n * step) / 1000, 2)} L</span>` : ""}</div>`;
}
function setWater(ml){
  const goal = S.settings.waterGoal || 2000, before = S.water[curDate] || 0;
  ml = Math.max(0, Math.round(ml));
  if (ml) S.water[curDate] = ml; else delete S.water[curDate];
  save(); renderWater(); buzz(8);
  if (before < goal && ml >= goal){ celebrate(); toast("Meta de água batida! 💧"); }
}
$("#water").onclick = e => {
  const step = S.settings.waterStep || 250, ml = S.water[curDate] || 0;
  if (e.target.closest("#wPlus")) return setWater(ml + step);
  if (e.target.closest("#wMinus")) return setWater(ml - step);
  const c = e.target.closest("[data-cup]"); if (!c) return;
  const target = (+c.dataset.cup + 1) * step;
  setWater(ml === target ? target - step : target);
};

/* ---------- atalhos: combos, favoritos, recentes ---------- */
function renderShortcuts(){
  const prods = Object.entries(S.products).map(([id, p]) => ({...p, id}));
  const favs = prods.filter(p => p.fav).sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
  const rec = prods.filter(p => p.lastUsed && !p.fav).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 10);
  const html = S.combos.map(c => `<button class="chip combo" data-combo="${esc(c.id)}">${icon("layers")}<span>${esc(c.name)}</span></button>`).join("")
    + favs.map(p => `<button class="chip fav" data-pid="${esc(p.id)}">${icon("star")}<span>${esc(p.name)}</span></button>`).join("")
    + rec.map(p => `<button class="chip" data-pid="${esc(p.id)}"><span>${esc(p.name)}</span></button>`).join("");
  $("#shortcutsWrap").classList.toggle("hidden", !html);
  $("#shortcuts").innerHTML = html;
}
$("#shortcuts").onclick = e => {
  const c = e.target.closest("[data-combo]"); if (c) return comboSheet(c.dataset.combo);
  const id = e.target.closest("[data-pid]")?.dataset.pid; const p = id && getProduct(id); if (p) portionSheet(id, p);
};

/* ---------- refeições ---------- */
function renderMeals(list, byDate){
  if (!list.length){
    const y = addDays(curDate, -1), yl = byDate.get(y) || [];
    $("#dayEmpty").innerHTML = `<div class="card empty-day"><svg class="ill" viewBox="0 0 120 80" aria-hidden="true"><ellipse cx="60" cy="62" rx="44" ry="9" fill="var(--soft)"/><circle cx="60" cy="40" r="28" fill="var(--card)" stroke="var(--line)" stroke-width="3"/><circle cx="60" cy="40" r="18" fill="none" stroke="var(--line)" stroke-width="2" stroke-dasharray="4 5"/><path d="M22 18v26M18 18v10a4 4 0 0 0 8 0V18M98 18c-5 4-6 12-6 18h6v14" fill="none" stroke="var(--muted)" stroke-width="3" stroke-linecap="round"/><circle cx="84" cy="22" r="5" fill="var(--lime)"/><circle cx="36" cy="64" r="3" fill="var(--carb)"/></svg>
      <b>${curDate === today() ? "Seu dia está em branco" : "Nada registrado nesse dia"}</b>
      <span>Escaneie um código de barras, busque um alimento${yl.length ? ` ou repita o que comeu ${relDay(y)}` : ""}.</span>
      <div class="row">${yl.length ? `<button class="btn sec" id="copyDay">${icon("copy")} Repetir ${relDay(y)} · ${fmt(totals(yl).kcal, 0)} kcal</button>` : `<button class="btn sec" id="emptyScan">${icon("scan")} Escanear</button>`}</div></div>`;
    if ($("#copyDay")) $("#copyDay").onclick = () => copyEntries(yl, curDate);
    if ($("#emptyScan")) $("#emptyScan").onclick = startScanner;
  } else $("#dayEmpty").innerHTML = "";
  const byMeal = MEALS.map(() => []);
  for (const e of list) byMeal[e.meal ?? 4].push(e);
  $("#meals").innerHTML = MEALS.map((m, i) => {
    const items = byMeal[i];
    if (!items.length && i === 4) return "";
    const t = totals(items);
    return `<div class="meal card${items.length ? "" : " is-empty"}" style="--mc:var(${MEAL_COLORS[i]})">
      <div class="mh"><div class="mi">${icon(MEAL_ICONS[i])}</div><div class="mt"><b>${m}</b><small>${items.length ? `${fmt(t.kcal, 0)} kcal · P ${fmt(t.prot, 0)} · C ${fmt(t.carb, 0)} · G ${fmt(t.gord, 0)}` : "nada ainda"}</small></div>
      <button class="round sm ghost" data-more="${i}" aria-label="Opções de ${m}">${icon("more")}</button><button class="round sm addm" data-meal="${i}" aria-label="Adicionar em ${m}">${icon("plus")}</button></div>
      ${items.length ? `<div class="entries">${items.map(entryRow).join("")}</div>` : ""}</div>`;
  }).join("");
}
function entryRow(e){
  const p = e.productId ? getProduct(e.productId) : null;
  return `<div class="entry" data-eid="${esc(e.id)}">${e.quick ? `<div class="thumb">${icon("bolt")}</div>` : thumb(p)}<div class="nm"><div>${esc(e.name)}</div><div>${e.quick ? "adição rápida" : `${fmt(e.grams, 0)} ${esc(e.unit || "g")}`} · P ${fmt(e.n?.prot)} · C ${fmt(e.n?.carb)} · G ${fmt(e.n?.gord)}</div></div><div class="k">${fmt(e.n?.kcal, 0)}<small> kcal</small></div></div>`;
}
$("#meals").onclick = e => {
  const add = e.target.closest("[data-meal]"); if (add){ pendingMeal = +add.dataset.meal; return searchSheet(); }
  const more = e.target.closest("[data-more]"); if (more) return mealMenu(+more.dataset.more);
  const row = e.target.closest("[data-eid]"); if (row) editEntrySheet(row.dataset.eid);
};
function copyEntries(list, date, meal){
  const now = Date.now();
  addEntries(list.map((e, i) => ({...e, id: uid(), createdAt: now + i, date, meal: meal ?? e.meal})), `${list.length} ${list.length === 1 ? "item copiado" : "itens copiados"}`);
}
function mealMenu(i){
  const items = dayEntries().filter(e => e.meal === i), y = addDays(curDate, -1), yItems = dayEntries(y).filter(e => e.meal === i);
  const acts = [
    {icon: "search", label: "Buscar alimento", fn: () => { searchSheet(); pendingMeal = i; }},
    {icon: "bolt", label: "Adição rápida", sub: "só as calorias, sem produto", fn: () => quickSheet({meal: i})},
  ];
  if (yItems.length) acts.push({icon: "copy", label: `Copiar de ${relDay(y)}`, sub: `${yItems.length} ${yItems.length === 1 ? "item" : "itens"} · ${fmt(totals(yItems).kcal, 0)} kcal`, fn: () => copyEntries(yItems, curDate, i)});
  if (items.length) acts.push({icon: "layers", label: "Salvar como combo", sub: "pra adicionar tudo com um toque", fn: () => saveComboSheet(curDate, i)});
  if (items.length) acts.push({icon: "trash", label: "Limpar refeição", danger: true, fn: () => removeEntries(items.map(e => e.id), `${MEALS[i]} limpo`)});
  actionSheet(MEALS[i], acts, dateLabel(curDate));
}

/* ---------- adição rápida (só kcal/macros) ---------- */
function quickSheet({entry, meal} = {}){
  const e = entry;
  let m = e?.meal ?? meal ?? pendingMeal ?? (curDate === today() ? mealByHour() : 1);
  const v = k => e?.n?.[k] != null ? Math.round(e.n[k] * 10) / 10 : "";
  openSheet(`<h2>${e ? "Editar registro" : "Adição rápida"}</h2><div class="sub">${e ? "Registro sem produto vinculado." : "Pra quando você só sabe as calorias: restaurante, algo que comeu fora…"}</div>
    <label class="f">O que foi? (opcional)</label><input type="text" id="qName" value="${esc(e?.name || "")}" placeholder="ex: Almoço no restaurante">
    <label class="f">Calorias</label><div class="grams"><input type="number" inputmode="decimal" id="qK" value="${v("kcal")}" placeholder="0"><span class="u">kcal</span></div>
    <div class="grid3">${[["prot", "Proteína"], ["carb", "Carbo"], ["gord", "Gordura"]].map(([k, l]) => `<div><label class="f">${l} (g)</label><input type="number" inputmode="decimal" id="q_${k}" value="${v(k)}" placeholder="opcional"></div>`).join("")}</div>
    <label class="f">Refeição</label>
    <div class="quick" id="mealPick">${MEALS.map((x, i) => `<button data-m="${i}" class="${i === m ? "on" : ""}">${x}</button>`).join("")}</div>
    <div class="row"><button class="btn sec" data-close>Cancelar</button><button class="btn" id="qSave">${e ? "Salvar" : "Adicionar"}</button></div>
    ${e ? `<div class="row three"><button class="btn sec" id="dupE">${icon("copy")} Duplicar</button>${e.date !== today() ? `<button class="btn sec" id="todayE">${icon("plus")} Pra hoje</button>` : ""}<button class="btn sec warn-t" id="delE">${icon("trash")} Remover</button></div>` : ""}`);
  if (!e) setTimeout(() => $("#qK")?.focus(), 60);
  $("#mealPick").onclick = ev => { const b = ev.target.closest("[data-m]"); if (!b) return; m = +b.dataset.m; $("#mealPick").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); };
  $("#qSave").onclick = () => {
    const kcal = num($("#qK").value); if (!kcal || kcal <= 0) return $("#qK").focus();
    const n = Object.fromEntries(NUTS.map(x => [x.k, null])); n.kcal = kcal;
    for (const k of ["prot", "carb", "gord"]) n[k] = num($("#q_" + k).value);
    const data = {name: $("#qName").value.trim() || "Adição rápida", grams: null, unit: "", meal: m, n, quick: true};
    if (e){ Object.assign(e, data); save(); closeSheet(); renderAll(); toast("Salvo"); return; }
    addEntries([{...data, id: uid(), createdAt: Date.now(), date: curDate}], `Adicionado · ${MEALS[m]}`);
  };
  if (e) entryExtras(e);
}

/* ---------- lembrete de backup ---------- */
function renderNag(){
  const last = S.settings.lastExport, days = last ? Math.floor((Date.now() - last) / 864e5) : null;
  const need = !nagDismissed && !(syncReady() && !syncCfg().lastError) && S.entries.length >= 15 && (days == null || days > 30);
  $("#nag").innerHTML = need ? `<div class="nag">${icon("download")}<div><b>Hora de um backup</b><span>${days != null ? `O último foi há ${days} dias.` : "Você ainda não exportou seus dados."} Eles ficam só neste aparelho.</span></div>
    <button class="btn sm" id="nagExp">Exportar</button><button class="round sm ghost" id="nagX" aria-label="Agora não">${icon("x")}</button></div>` : "";
  if (!need) return;
  $("#nagExp").onclick = exportData;
  $("#nagX").onclick = () => { nagDismissed = true; renderNag(); };
}

/* ---------- topo ---------- */
$("#searchBtn").onclick = () => searchSheet();
$("#quickBtn").onclick = () => quickSheet();
$("#todayBtn").onclick = () => setDate(today());
$("#dateBtn").onclick = () => {
  const i = $("#datePick"); i.max = today(); i.value = curDate;
  try { i.showPicker(); } catch { i.click(); }
};
$("#datePick").onchange = e => { if (e.target.value) setDate(e.target.value); };
