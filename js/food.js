"use strict";
/* =========================================================
   Alimentos: busca, porção, produto, favoritos,
   meus produtos, receitas e combos
   ========================================================= */

/* ---------- adicionar entradas (com desfazer + metas) ---------- */
function addEntries(list, msg){
  const date = list[0]?.date; if (!date) return;
  const before = totals(eatenEntries().filter(e => e.date === date)), bh = habitDay(date), bs = streaks(loggedDates()).cur;
  S.entries.push(...list);
  save(); buzz(); closeSheet(); renderAll();
  const ids = new Set(list.map(e => e.id));
  toast(msg, {label: "Desfazer", fn: () => { S.entries = S.entries.filter(e => !ids.has(e.id)); save(); renderAll(); }});
  const after = totals(eatenEntries().filter(e => e.date === date)), gp = S.goals.prot;
  if (gp && before.prot < gp && after.prot >= gp){ setTimeout(() => { celebrate(); toast("Meta de proteína batida! 💪"); }, 900); }
  else habitCheck(date, bh, bs);
}
function removeEntries(ids, msg = "Removido"){
  ids = new Set(ids);
  const removed = S.entries.filter(e => ids.has(e.id)); if (!removed.length) return;
  S.entries = S.entries.filter(e => !ids.has(e.id));
  save(); closeSheet(); renderAll();
  toast(msg, {label: "Desfazer", fn: () => { S.entries.push(...removed); save(); renderAll(); }});
}
function toggleFav(id){
  const p = getProduct(id); if (!p) return false;
  S.products[id] = {...p, fav: !p.fav}; save();
  return S.products[id].fav;
}

/* ---------- consulta por código ---------- */
async function lookup(code){
  code = String(code).replace(/\D/g, "");
  const local = S.products[code];
  if (local) return portionSheet(code, local);
  openSheet(`<h2>Procurando…</h2><div class="sub">Código ${esc(code)} · Open Food Facts <span class="spin"></span></div>`);
  let p = null, err = false;
  try { p = await offProduct(code); } catch { err = true; }
  if (!sheetOpen) return; // a pessoa fechou enquanto buscava
  if (p && p.hasNutrition){ S.products[code] = p; save(); return portionSheet(code, p); }
  const msg = err
    ? `<div class="warnbox">Sem conexão com o Open Food Facts agora. Você pode preencher à mão.</div>`
    : p ? `<div class="warnbox">Achei “${esc(p.name)}”, mas sem tabela nutricional na base. Preencha com o rótulo (por 100 ${esc(p.unit)}).</div>`
        : `<div class="warnbox">Esse código ainda não está no Open Food Facts. Preencha com o rótulo — fica salvo pra próxima.</div>`;
  productForm(code, p || {}, msg);
}
async function refreshFromOFF(id){
  const p = S.products[id]; if (!p?.code) return;
  toast("Atualizando do Open Food Facts…");
  let r = null; try { r = await offProduct(p.code); } catch { return toast("Sem conexão agora. Tente de novo mais tarde."); }
  if (!r) return toast("Esse código não está mais no Open Food Facts.");
  const edited = p.source === "off+edit";
  S.products[id] = {...p, image: r.image || p.image, nutriscore: r.nutriscore, nova: r.nova,
    ...(edited || !r.hasNutrition ? {} : {per100: r.per100, name: r.name, brand: r.brand, portion: r.portion ?? p.portion, servingLabel: r.servingLabel ?? p.servingLabel})};
  save(); toast(edited ? "Atualizado (mantive os valores que você corrigiu)" : "Produto atualizado");
  if (sheetOpen) portionSheet(id, S.products[id]);
}

/* ---------- formulário de produto ---------- */
function productForm(code, p, msg, fixedId, after){
  openSheet(`<h2>${fixedId ? "Editar produto" : "Produto novo"}</h2>
    <div class="sub">${code ? `Código ${esc(code)}` : "Sem código"}</div>
    ${msg || ""}
    <label class="f">Nome</label><input type="text" id="pName" value="${esc(p.name || "")}" placeholder="ex: Iogurte grego natural">
    <div class="grid2">
      <div><label class="f">Unidade</label><select id="pUnit"><option value="g">g</option><option value="ml"${p.unit === "ml" ? " selected" : ""}>ml</option></select></div>
      <div><label class="f">Porção do rótulo</label><input type="number" inputmode="decimal" id="pPort" value="${p.portion ?? ""}" placeholder="opcional"></div>
    </div>
    <label class="f">Rendimento ao cozinhar <small class="muted">(se o rótulo é do alimento cru)</small></label>
    <select id="pYield">${yieldOptions(p.cooked === 0 ? 0 : num(p.cooked) ?? guessYield(p.name || ""))}</select>
    <input type="number" inputmode="decimal" step="any" id="pYieldC" class="hidden" placeholder="peso cozido ÷ peso cru, ex: 2,8" style="margin-top:8px">
    <div class="sub" style="margin:14px 0 0">Valores <b>por 100</b> do rótulo</div>
    <div class="grid2">${NUTS.map(n => `<div><label class="f">${esc(n.n)} (${n.u})</label><input type="number" inputmode="decimal" step="any" id="v_${n.k}" value="${p.per100?.[n.k] != null ? Math.round(p.per100[n.k] * 100) / 100 : ""}"></div>`).join("")}</div>
    <div class="warnbox hidden" id="pWarn">Preencha pelo menos o nome e as kcal.</div>
    <div class="row"><button class="btn sec" data-close>Cancelar</button><button class="btn" id="pSave">Salvar</button></div>
    ${code ? `<div class="note">Dica: dá pra adicionar esse produto ao Open Food Facts pelo app oficial deles e ajudar todo mundo.</div>` : ""}`);
  if (!fixedId) setTimeout(() => { if (!$("#pName")?.value) $("#pName")?.focus(); }, 60);
  let yieldTouched = false;
  $("#pYield").onchange = () => { yieldTouched = true; $("#pYieldC").classList.toggle("hidden", $("#pYield").value !== "c"); };
  $("#pName").addEventListener("input", () => { // sugere o rendimento pelo nome enquanto a pessoa não escolheu
    if (yieldTouched || p.cooked != null) return;
    const gy = guessYield($("#pName").value), sel = $("#pYield");
    sel.innerHTML = yieldOptions(gy); $("#pYieldC").classList.toggle("hidden", sel.value !== "c");
  });
  $("#pSave").onclick = () => {
    const per100 = {}; for (const n of NUTS) per100[n.k] = num($("#v_" + n.k).value);
    const name = $("#pName").value.trim();
    if (!name || per100.kcal == null){ $("#pWarn").classList.remove("hidden"); return; }
    const id = fixedId || code || "my-" + uid();
    const old = S.products[id] || {};
    S.products[id] = {...old, ...p, name, per100, unit: $("#pUnit").value, portion: num($("#pPort").value), code: code || null,
      source: old.source === "off" || p.source === "off" || old.source === "off+edit" ? "off+edit" : "manual", hasNutrition: true};
    delete S.products[id].id;
    const yv = $("#pYield").value, yc = num($("#pYieldC").value);
    const yieldVal = yv === "c" ? (yc > 0.1 && yc < 6 ? yc : null) : yv === "" ? 0 : +yv;
    if (yieldVal == null) delete S.products[id].cooked; else S.products[id].cooked = yieldVal;
    save();
    if (after) after(id, S.products[id]); else portionSheet(id, S.products[id]);
  };
}

function yieldOptions(v){
  const known = YIELDS.some(y => y[0] === v);
  return `<option value=""${!v ? " selected" : ""}>Não se aplica (já vem pronto / não cozinha)</option>`
    + YIELDS.map(([f, l]) => `<option value="${f}"${f === v ? " selected" : ""}>${esc(l)} · ×${fmt(f, 2)}</option>`).join("")
    + `<option value="c"${v && !known ? " selected" : ""}>Outro…${v && !known ? ` (×${fmt(v, 2)})` : ""}</option>`;
}

/* ---------- porção ----------
   opts: grams, meal, entryId, date  (editar entrada)
         pick(g), back()             (escolher ingrediente de receita) */
function portionSheet(id, p, opts = {}){
  const unit = p.unit || "g";
  const units = [...(p.units || [])];
  if (p.portion && !units.some(u => u[1] === p.portion)) units.unshift([p.servingLabel ? `1 porção (${p.servingLabel})` : "1 porção", p.portion]);
  const grams0 = opts.grams ?? p.lastGrams ?? units[0]?.[1] ?? 100;
  let meal = opts.meal ?? pendingMeal ?? (curDate === today() ? mealByHour() : 1);
  const quick = [...units.map(u => ({l: `${u[0]}`, g: u[1]})), ...[50, 100, 150, 200].filter(x => !units.some(u => u[1] === x)).map(x => ({l: `${x} ${unit}`, g: x}))].slice(0, 7);
  const fav = !!getProduct(id)?.fav;
  const date = opts.date || curDate;
  const yf = opts.pick ? null : productYield(p);
  let cooked = !!yf && !!(opts.cooked ?? p.lastCooked);
  openSheet(`<div class="phead">${p.image ? `<img src="${esc(p.image)}" alt="">` : thumb(p)}<div class="pt"><h2>${esc(p.name)}</h2>
      <div class="sub" style="margin:0">${p.brand ? esc(p.brand) + " · " : ""}${fmt(num(p.per100?.kcal), 0)} kcal por 100 ${esc(unit)}${p.generic ? " · valor médio" : ""}${p.recipe ? " · receita" : ""}</div>
      ${badges(p) ? `<div class="badges">${badges(p)}</div>` : ""}</div>
      <button class="round star${fav ? " on" : ""}" id="favP" aria-label="Favorito" aria-pressed="${fav}">${icon("star")}</button></div>
    ${yf ? `<div class="ckrow"><label class="f">Quanto? <small class="muted" id="ckHint"></small></label><div class="seg sm" id="ckSeg"><button data-ck="0">Cru</button><button data-ck="1">Cozido</button></div></div>` : `<label class="f">Quanto?</label>`}
    <div class="grams"><button class="round" id="gMinus" aria-label="Menos">${icon("minus")}</button><input type="number" inputmode="decimal" id="gIn" value="${Math.round(grams0 * 10) / 10}"><span class="u">${esc(unit)}</span><button class="round" id="gPlus" aria-label="Mais">${icon("plus")}</button></div>
    <div class="quick" id="quick">${quick.map(q => `<button data-g="${q.g}">${esc(q.l)}${/\d\s*(g|ml)\b/.test(q.l) ? "" : ` · ${fmt(q.g, 0)} ${esc(unit)}`}</button>`).join("")}</div>
    ${opts.pick ? "" : `<label class="f">Refeição${date !== today() ? ` · ${esc(dateLabel(date))}` : ""}</label>
    <div class="quick" id="mealPick">${MEALS.map((m, i) => `<button data-m="${i}" class="${i === meal ? "on" : ""}">${m}</button>`).join("")}</div>`}
    <div class="macrosum" id="msum"></div>
    <details class="ntd"><summary>Tabela nutricional completa</summary><table class="nt" id="ntab"></table></details>
    <div class="row">${opts.back ? `<button class="btn sec" id="pBack">Voltar</button>` : `<button class="btn sec" data-close>Cancelar</button>`}<button class="btn" id="addE">${opts.pick ? "Adicionar à receita" : opts.confirm ? `${icon("check")} Comi` : opts.entryId ? "Salvar" : "Adicionar"}</button></div>
    ${opts.pick || opts.entryId ? "" : `<button class="linkish planlink" id="planE">${icon("cal")} Só planejar (ainda não comi)</button>`}
    ${opts.pick ? "" : `<div class="links">${p.recipe ? `<button class="linkish" id="editR">${icon("edit")} Editar receita</button>`
      : p.generic ? "" : `<button class="linkish" id="editP">${icon("edit")} Corrigir valores</button>`}${p.code && S.products[id] ? `<button class="linkish" id="offR">${icon("refresh")} Atualizar do Open Food Facts</button>` : ""}</div>`}`);
  const rawOf = g => cooked ? g / yf : g;
  const upd = () => {
    const g = num($("#gIn").value) || 0, v = scaleNuts(p.per100, rawOf(g));
    if (yf){
      $("#ckSeg").querySelectorAll("button").forEach(b => b.classList.toggle("on", +b.dataset.ck === +cooked));
      $("#ckHint").textContent = cooked ? `≈ ${fmt(rawOf(g), 0)} ${unit} cru (rende ×${fmt(yf, 2)})` : "peso do rótulo";
    }
    $("#msum").innerHTML = `<div class="mk"><b>${fmt(v.kcal, 0)}</b><span>kcal</span></div>` + [["prot", "Proteína"], ["carb", "Carbo"], ["gord", "Gordura"]].map(([k, l]) =>
      `<div class="mk" style="--c:var(--${k})"><b>${fmt(v[k], 1)}<small>g</small></b><span>${l}</span></div>`).join("");
    $("#ntab").innerHTML = `<tr><th></th><th>por 100${yf ? " cru" : ""}</th><th>${fmt(g, 0)} ${esc(unit)}${cooked ? " cozido" : ""}</th></tr>` + NUTS.map(n => `<tr><td>${n.sub ? "&nbsp;&nbsp;" : ""}${esc(n.n)}</td><td>${fmt(num(p.per100?.[n.k]), n.dec)}</td><td>${fmt(v[n.k], n.dec)} ${n.u}</td></tr>`).join("");
  };
  upd(); $("#gIn").oninput = upd;
  if (yf) $("#ckSeg").onclick = e => { const b = e.target.closest("[data-ck]"); if (b){ cooked = b.dataset.ck === "1"; upd(); } };
  const nudge = d => { const g = num($("#gIn").value) || 0, st = g >= 100 ? 10 : 5; $("#gIn").value = Math.max(0, Math.round((g + d * st) / st) * st); upd(); };
  $("#gMinus").onclick = () => nudge(-1); $("#gPlus").onclick = () => nudge(1);
  $("#quick").onclick = e => { const g = e.target.closest("[data-g]")?.dataset.g; if (g){ $("#gIn").value = g; upd(); } };
  if ($("#mealPick")) $("#mealPick").onclick = e => { const b = e.target.closest("[data-m]"); if (!b) return; meal = +b.dataset.m; $("#mealPick").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); };
  $("#favP").onclick = () => { const on = toggleFav(id); $("#favP").classList.toggle("on", on); $("#favP").setAttribute("aria-pressed", on); buzz(); toast(on ? "Adicionado aos favoritos" : "Removido dos favoritos"); };
  if ($("#pBack")) $("#pBack").onclick = opts.back;
  if ($("#editP")) $("#editP").onclick = () => productForm(p.code || null, p, "", id);
  if ($("#editR")) $("#editR").onclick = () => editRecipe(id);
  if ($("#offR")) $("#offR").onclick = () => refreshFromOFF(id);
  const commit = planned => {
    const g = num($("#gIn").value); if (!g || g <= 0){ $("#gIn").focus(); return; }
    if (opts.pick) return opts.pick(g);
    const cur = getProduct(id) || p; // pode ter virado favorito nesta folha
    S.products[id] = {...cur, lastGrams: g, lastUsed: Date.now(), ...(yf ? {lastCooked: cooked} : {})}; delete S.products[id].id;
    if (opts.entryId){
      const e = S.entries.find(x => x.id === opts.entryId);
      if (!e) return closeSheet();
      const bh = habitDay(e.date), bs = streaks(loggedDates()).cur, wasPlanned = !!e.planned;
      Object.assign(e, {name: entryName(p), grams: g, unit, meal, n: scaleNuts(p.per100, rawOf(g)), productId: id});
      if (cooked) e.cooked = true; else delete e.cooked;
      delete e.est;
      if (opts.confirm){ delete e.planned; e.createdAt = Date.now(); }
      save(); buzz(); closeSheet(); renderAll();
      if (opts.confirm){ toast("Confirmado · " + MEALS[meal], {label: "Desfazer", fn: () => { e.planned = true; save(); renderAll(); }}); if (wasPlanned) habitCheck(e.date, bh, bs); }
      else toast("Salvo");
      return;
    }
    const entry = makeEntry(id, p, g, meal, date, {cooked, planned});
    addEntries([entry], planned ? `Planejado · ${MEALS[meal]}` : `Adicionado · ${MEALS[meal]}`);
  };
  $("#addE").onclick = () => commit(false);
  if ($("#planE")) $("#planE").onclick = () => commit(true);
}

/* ---------- editar entrada ---------- */
function editEntrySheet(eid, extra = {}){
  const e = S.entries.find(x => x.id === eid); if (!e) return;
  const p = e.productId ? getProduct(e.productId) : null;
  if (!p) return quickSheet({entry: e});
  portionSheet(e.productId, p, {grams: e.grams, meal: e.meal, entryId: eid, date: e.date, cooked: !!e.cooked, confirm: extra.confirm || false});
  if (extra.confirm) return;
  $("#sheet .row").insertAdjacentHTML("afterend", `<div class="row three">
    <button class="btn sec" id="dupE">${icon("copy")} Duplicar</button>
    ${e.date !== today() ? `<button class="btn sec" id="todayE">${icon("plus")} Pra hoje</button>` : ""}
    <button class="btn sec warn-t" id="delE">${icon("trash")} Remover</button></div>`);
  entryExtras(e);
}
function entryExtras(e){
  $("#delE").onclick = () => removeEntries([e.id]);
  $("#dupE").onclick = () => addEntries([{...e, id: uid(), createdAt: Date.now()}], "Duplicado");
  if ($("#todayE")) $("#todayE").onclick = () => addEntries([{...e, id: uid(), createdAt: Date.now(), date: today(), meal: mealByHour()}], "Adicionado hoje");
}

/* ---------- busca por nome ----------
   opts.onPick(id, p) → modo "escolher ingrediente"; opts.back() → voltar */
let offCache = {};
function searchSheet(opts = {}){
  const pick = !!opts.onPick;
  openSheet(`<h2>${pick ? "Adicionar ingrediente" : "Buscar alimento"}</h2><div class="sub">Seus produtos, receitas, alimentos genéricos (fruta, arroz, frango…) e o Open Food Facts.</div>
    <form id="sForm" class="sfield">${icon("search")}<input type="search" id="sIn" placeholder="ex: banana, iogurte Danone, arroz…" autocomplete="off" enterkeyhint="search"></form>
    <div class="results" id="sLocal"></div>
    <div id="sOffWrap"></div>
    <div class="row">${pick ? `<button class="btn sec" id="sBack">Voltar à receita</button>` : `<button class="btn sec" id="sRecipe">${icon("pot")} Nova receita</button>`}<button class="btn sec" id="sManual">${icon("edit")} Criar manual</button></div>
    ${pick ? "" : `<div class="links"><button class="linkish" id="sMine">${icon("box")} Meus produtos</button><button class="linkish" id="sQuick">${icon("bolt")} Só as calorias</button></div>`}`);
  const input = $("#sIn"); setTimeout(() => input.focus(), 60);
  const choose = (id, p) => pick ? opts.onPick(id, p) : portionSheet(id, p);
  const local = () => {
    const q = norm(input.value).trim();
    const mine = Object.entries(S.products).map(([id, p]) => ({...p, id})).filter(p => !(pick && p.id === opts.exclude));
    let html;
    if (!q){
      const favs = mine.filter(p => p.fav).sort((a, b) => a.name.localeCompare(b.name));
      const rec = mine.filter(p => p.lastUsed && !p.fav).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 8);
      html = (favs.length ? `<div class="sec-title">Favoritos</div>` + favs.map(resRow).join("") : "")
        + (rec.length ? `<div class="sec-title">Recentes</div>` + rec.map(resRow).join("") : "");
    } else {
      const terms = q.split(/\s+/);
      const match = p => { const h = norm(p.name + " " + (p.brand || "")); return terms.every(t => h.includes(t)); };
      const list = [...mine.filter(match).sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || (b.lastUsed || 0) - (a.lastUsed || 0)),
        ...GENERICS.filter(g => !S.products[g.id] && match(g))].slice(0, 25);
      html = list.map(resRow).join("") || `<div class="empty">Nada nos seus produtos nem nos genéricos.</div>`;
    }
    $("#sLocal").innerHTML = html;
    $("#sOffWrap").innerHTML = q.length >= 3 ? `<button class="btn sec full" id="sOff" style="margin-top:8px">${icon("search")} Buscar “${esc(input.value.trim())}” no Open Food Facts</button>` : "";
    if ($("#sOff")) $("#sOff").onclick = remote;
  };
  const remote = async () => {
    const q = input.value.trim(); if (q.length < 3) return;
    $("#sOffWrap").innerHTML = `<div class="note"><span class="spin"></span> Buscando produtos vendidos em Portugal…</div>`;
    try {
      const res = await offSearch(q);
      if (!$("#sOffWrap")) return;
      offCache = Object.fromEntries(res.map(p => ["off-" + p.code, p]));
      $("#sOffWrap").innerHTML = res.length
        ? `<div class="sec-title" style="margin-top:14px">Open Food Facts</div><div class="results">${res.map(p => resRow({...p, id: "off-" + p.code})).join("")}</div>`
        : `<div class="empty">Nenhum resultado no Open Food Facts.</div>`;
    } catch { if ($("#sOffWrap")) $("#sOffWrap").innerHTML = `<div class="warnbox">Não consegui buscar agora (sem conexão ou servidor lento). Tente de novo daqui a pouco.</div>`; }
  };
  input.oninput = local; local();
  $("#sForm").onsubmit = e => { e.preventDefault(); input.blur(); remote(); };
  $("#sManual").onclick = () => productForm(null, {name: input.value.trim()}, "", null, pick ? (id, p) => choose(id, p) : null);
  if ($("#sBack")) $("#sBack").onclick = opts.back;
  if ($("#sRecipe")) $("#sRecipe").onclick = () => newRecipe(input.value.trim());
  if ($("#sMine")) $("#sMine").onclick = myProductsSheet;
  if ($("#sQuick")) $("#sQuick").onclick = () => quickSheet({meal: pendingMeal});
  $("#sheet").onclick = e => {
    const r = e.target.closest("[data-rid]"); if (!r) return;
    const id = r.dataset.rid;
    if (id.startsWith("off-")){ const p = offCache[id]; if (!p) return; S.products[p.code] = {...(S.products[p.code] || {}), ...p}; save(); return choose(p.code, S.products[p.code]); }
    const p = getProduct(id); if (p) choose(id, p);
  };
}
function resRow(p){
  const tag = p.recipe ? `<span class="tag">receita</span>` : p.generic ? `<span class="tag">genérico</span>` : "";
  return `<div class="res" data-rid="${esc(p.id)}">${thumb(p, "🛒")}<div class="nm"><div>${p.fav ? `<span class="fav-dot">${icon("star")}</span>` : ""}${esc(p.name)}${tag}</div><small>${esc(p.brand || "")}${badges(p)}</small></div><div class="k">${fmt(num(p.per100?.kcal), 0)}<small> kcal/100${esc(p.unit || "g")}</small></div></div>`;
}

/* ---------- meus produtos ---------- */
function myProductsSheet(){
  openSheet(`<h2>Meus produtos</h2><div class="sub">Tudo que você já escaneou, criou ou favoritou. Apagar um produto não mexe no que já está no diário.</div>
    <form class="sfield" onsubmit="return false">${icon("search")}<input type="search" id="mpIn" placeholder="Filtrar…" autocomplete="off"></form>
    <div id="mpList" class="results"></div>
    ${S.combos.length ? `<div class="sec-title">Combos</div><div class="results">${S.combos.map(c => `<div class="res" data-cid="${esc(c.id)}"><div class="thumb">${icon("layers")}</div><div class="nm"><div>${esc(c.name)}</div><small>${c.items.length} itens · ${fmt(c.items.reduce((s, x) => s + (num(x.n?.kcal) || 0), 0), 0)} kcal</small></div><button class="round sm" data-delc="${esc(c.id)}" aria-label="Apagar combo">${icon("trash")}</button></div>`).join("")}</div>` : ""}
    <div class="row"><button class="btn sec" data-close>Fechar</button><button class="btn" id="mpRecipe">${icon("pot")} Nova receita</button></div>`);
  const list = () => {
    const q = norm($("#mpIn").value).trim();
    const items = Object.entries(S.products).map(([id, p]) => ({...p, id})).filter(p => !p.generic || p.fav)
      .filter(p => !q || norm(p.name + " " + (p.brand || "")).includes(q))
      .sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || a.name.localeCompare(b.name));
    $("#mpList").innerHTML = items.map(p => `<div class="res" data-mid="${esc(p.id)}">${thumb(p, "🛒")}<div class="nm"><div>${esc(p.name)}${p.recipe ? `<span class="tag">receita</span>` : ""}</div><small>${esc(p.brand || "")} ${fmt(num(p.per100?.kcal), 0)} kcal/100${esc(p.unit || "g")}</small></div>
      <button class="round sm star${p.fav ? " on" : ""}" data-fav="${esc(p.id)}" aria-label="Favorito">${icon("star")}</button>
      ${p.generic ? "" : `<button class="round sm" data-del="${esc(p.id)}" aria-label="Apagar">${icon("trash")}</button>`}</div>`).join("")
      || `<div class="empty">${q ? "Nada com esse nome." : "Nenhum produto salvo ainda. Escaneie algo!"}</div>`;
  };
  list(); $("#mpIn").oninput = list;
  $("#mpRecipe").onclick = () => newRecipe();
  $("#sheet").onclick = e => {
    const f = e.target.closest("[data-fav]"); if (f){ toggleFav(f.dataset.fav); buzz(); return list(); }
    const d = e.target.closest("[data-del]");
    if (d){
      const id = d.dataset.del, old = S.products[id];
      delete S.products[id]; save(); list(); renderAll();
      return toast(`“${old.name}” apagado`, {label: "Desfazer", fn: () => { S.products[id] = old; save(); renderAll(); if ($("#mpList")) list(); }});
    }
    const dc = e.target.closest("[data-delc]");
    if (dc){
      const i = S.combos.findIndex(c => c.id === dc.dataset.delc), old = S.combos[i];
      S.combos.splice(i, 1); save(); renderAll(); myProductsSheet();
      return toast(`Combo “${old.name}” apagado`, {label: "Desfazer", fn: () => { S.combos.splice(i, 0, old); save(); renderAll(); }});
    }
    const c = e.target.closest("[data-cid]"); if (c) return comboSheet(c.dataset.cid);
    const r = e.target.closest("[data-mid]"); if (!r) return;
    const id = r.dataset.mid, p = S.products[id];
    if (p.recipe) return editRecipe(id, myProductsSheet);
    if (p.generic) return portionSheet(id, p);
    productForm(p.code || null, p, "", id, () => { toast("Produto salvo"); myProductsSheet(); });
  };
}

/* =========================================================
   RECEITAS — viram um produto normal (rec-…), com per100 calculado
   ========================================================= */
let draft = null;
function newRecipe(name = ""){ draft = {id: null, name, items: [], totalGrams: null, servings: 1}; recipeSheet(); }
function editRecipe(id, after){
  const p = S.products[id]; if (!p?.recipe) return;
  draft = {id, name: p.name, items: p.recipe.items.map(x => ({...x})), totalGrams: p.recipe.totalGrams ?? null, servings: p.recipe.servings || 1, after};
  recipeSheet();
}
function recipeCalc(d){
  const sum = Object.fromEntries(NUTS.map(n => [n.k, 0])); let raw = 0, missing = 0;
  for (const it of d.items){
    const p = getProduct(it.productId); raw += it.grams;
    if (!p){ missing++; continue; }
    const v = scaleNuts(p.per100, it.grams); for (const n of NUTS) if (v[n.k] != null) sum[n.k] += v[n.k];
  }
  const total = num(d.totalGrams) || raw, servings = Math.max(1, Math.round(num(d.servings) || 1));
  const per100 = total ? Object.fromEntries(NUTS.map(n => [n.k, sum[n.k] * 100 / total])) : null;
  return {sum, raw, total, servings, per100, serving: total / servings, missing};
}
function recipeSheet(){
  const d = draft;
  openSheet(`<h2>${d.id ? "Editar receita" : "Nova receita"}</h2>
    <div class="sub">Junte os ingredientes. Se puder, pese a receita pronta (sem a panela): assim a água que evapora ou que o arroz absorve entra na conta.</div>
    <label class="f">Nome</label><input type="text" id="rName" value="${esc(d.name)}" placeholder="ex: Sopa de legumes da vó">
    <div class="sec-title">Ingredientes</div>
    <div class="card flat" id="rItems">${d.items.length ? d.items.map((it, i) => {
      const p = getProduct(it.productId);
      return `<div class="ing"><div class="nm"><div>${esc(p?.name || it.name || "Ingrediente removido")}</div><small>${p ? fmt(num(p.per100?.kcal) * it.grams / 100, 0) + " kcal" : "sem dados"}</small></div>
        <input type="number" inputmode="decimal" class="mini" data-ig="${i}" value="${it.grams}"><span class="u">${esc(p?.unit || "g")}</span>
        <button class="round sm" data-ix="${i}" aria-label="Tirar">${icon("x")}</button></div>`; }).join("")
      : `<div class="empty">Nenhum ingrediente ainda.</div>`}</div>
    <button class="btn sec full" id="rAdd">${icon("plus")} Adicionar ingrediente</button>
    <div class="grid2">
      <div><label class="f">Peso final pronto (g)</label><input type="number" inputmode="decimal" id="rTotal" value="${d.totalGrams ?? ""}" placeholder="soma"></div>
      <div><label class="f">Rende quantas porções?</label><input type="number" inputmode="numeric" id="rServ" value="${d.servings}" min="1"></div>
    </div>
    <div class="okbox" id="rSum"></div>
    <div class="warnbox hidden" id="rWarn">Dê um nome e adicione pelo menos um ingrediente.</div>
    <div class="row"><button class="btn sec" id="rCancel">Cancelar</button><button class="btn" id="rSave">Salvar receita</button></div>
    ${d.id ? `<div class="links"><button class="linkish warn-t" id="rDel">${icon("trash")} Apagar receita</button></div>` : ""}`);
  const sync = () => {
    d.name = $("#rName").value; d.totalGrams = num($("#rTotal").value); d.servings = num($("#rServ").value) || 1;
    $$("[data-ig]").forEach(x => { const g = num(x.value); if (g > 0) d.items[+x.dataset.ig].grams = g; });
    const c = recipeCalc(d);
    $("#rTotal").placeholder = `soma: ${fmt(c.raw, 0)}`;
    $("#rSum").innerHTML = d.items.length
      ? `<b>${fmt(c.sum.kcal, 0)} kcal</b> no total · ${fmt(c.total, 0)} g<br><b>1 porção ≈ ${fmt(c.serving, 0)} g · ${fmt(c.sum.kcal / c.servings, 0)} kcal</b> · P ${fmt(c.sum.prot / c.servings)} · C ${fmt(c.sum.carb / c.servings)} · G ${fmt(c.sum.gord / c.servings)}${c.missing ? `<br>⚠️ ${c.missing} ingrediente(s) sem dados (apagado)` : ""}`
      : "Adicione os ingredientes pra ver as calorias por porção.";
    $("#rItems").querySelectorAll(".ing").forEach((row, i) => { const p = getProduct(d.items[i].productId); if (p) row.querySelector("small").textContent = fmt(num(p.per100?.kcal) * d.items[i].grams / 100, 0) + " kcal"; });
  };
  sync();
  $("#sheet").oninput = sync;
  $("#sheet").onclick = e => { const x = e.target.closest("[data-ix]"); if (x){ sync(); d.items.splice(+x.dataset.ix, 1); recipeSheet(); } };
  const pickIng = () => searchSheet({exclude: d.id, back: recipeSheet, onPick: (pid, p) =>
    portionSheet(pid, p, {grams: p.lastGrams ?? 100, back: pickIng, pick: g => { d.items.push({productId: pid, grams: g, name: p.name}); recipeSheet(); }})});
  $("#rAdd").onclick = () => { sync(); pickIng(); };
  $("#rCancel").onclick = () => { const after = d.after; draft = null; after ? after() : closeSheet(); };
  if ($("#rDel")) $("#rDel").onclick = () => {
    const id = d.id, old = S.products[id];
    delete S.products[id]; save(); draft = null; closeSheet(); renderAll();
    toast(`Receita “${old.name}” apagada`, {label: "Desfazer", fn: () => { S.products[id] = old; save(); renderAll(); }});
  };
  $("#rSave").onclick = () => {
    sync();
    const name = d.name.trim(), c = recipeCalc(d);
    if (!name || !d.items.length || !c.per100){ $("#rWarn").classList.remove("hidden"); return; }
    const id = d.id || "rec-" + uid(), old = S.products[id] || {};
    const units = [["1 porção", Math.round(c.serving)]]; if (c.servings > 1) units.push(["receita inteira", Math.round(c.total)]);
    S.products[id] = {...old, name, brand: "", unit: "g", per100: c.per100, units, portion: null, source: "recipe", hasNutrition: true,
      recipe: {items: d.items.map(x => ({productId: x.productId, grams: x.grams, name: getProduct(x.productId)?.name || x.name})), totalGrams: num(d.totalGrams) || null, servings: c.servings},
      lastGrams: old.lastGrams ?? Math.round(c.serving), lastUsed: old.lastUsed || Date.now()};
    const after = d.after; draft = null; save(); toast(d.id ? "Receita atualizada" : "Receita criada 🍲");
    if (after) after(); else portionSheet(id, S.products[id]);
  };
}

/* =========================================================
   COMBOS — um conjunto de itens que você come junto
   ========================================================= */
function saveComboSheet(date, meal){
  const items = S.entries.filter(e => e.date === date && e.meal === meal); if (!items.length) return;
  openSheet(`<h2>Salvar como combo</h2><div class="sub">${items.length} itens · ${fmt(totals(items).kcal, 0)} kcal. Depois é só um toque pra adicionar tudo de novo.</div>
    <label class="f">Nome do combo</label><input type="text" id="cName" value="${esc("Meu " + MEALS[meal].toLowerCase())}">
    <div class="card flat">${items.map(e => `<div class="ing"><div class="nm"><div>${esc(e.name)}</div><small>${fmt(e.grams, 0)} ${esc(e.unit || "g")} · ${fmt(e.n?.kcal, 0)} kcal</small></div></div>`).join("")}</div>
    <div class="row"><button class="btn sec" data-close>Cancelar</button><button class="btn" id="cSave">${icon("layers")} Salvar combo</button></div>`);
  setTimeout(() => { const i = $("#cName"); i?.focus(); i?.select(); }, 60);
  $("#cSave").onclick = () => {
    const name = $("#cName").value.trim() || MEALS[meal];
    S.combos.push({id: "cb-" + uid(), name, meal, items: items.map(e => ({productId: e.productId || null, grams: e.grams, unit: e.unit || "g", name: e.name, n: e.n}))});
    save(); closeSheet(); renderAll(); buzz(); toast(`Combo “${name}” salvo`);
  };
}
function comboSheet(cid){
  const c = S.combos.find(x => x.id === cid); if (!c) return;
  let meal = pendingMeal ?? c.meal ?? mealByHour();
  const nutsFor = (it, g) => { const p = it.productId ? getProduct(it.productId) : null; if (p) return scaleNuts(p.per100, g); const f = g / (it.grams || 1); return Object.fromEntries(NUTS.map(n => [n.k, it.n?.[n.k] == null ? null : it.n[n.k] * f])); };
  openSheet(`<h2>${esc(c.name)}</h2><div class="sub">Desmarque o que não comeu hoje ou ajuste as quantidades.</div>
    <div class="card flat" id="cbItems">${c.items.map((it, i) => `<label class="ing chk"><input type="checkbox" data-ck="${i}" checked><div class="nm"><div>${esc(it.name)}</div><small data-kc="${i}"></small></div>
      <input type="number" inputmode="decimal" class="mini" data-cg="${i}" value="${it.grams}"><span class="u">${esc(it.unit || "g")}</span></label>`).join("")}</div>
    <label class="f">Refeição</label>
    <div class="quick" id="mealPick">${MEALS.map((m, i) => `<button data-m="${i}" class="${i === meal ? "on" : ""}">${m}</button>`).join("")}</div>
    <div class="row"><button class="btn sec" data-close>Cancelar</button><button class="btn" id="cbAdd"></button></div>`);
  const sel = () => c.items.map((it, i) => ({it, on: $(`[data-ck="${i}"]`).checked, g: num($(`[data-cg="${i}"]`).value) || 0, i}));
  const upd = () => {
    let k = 0, n = 0;
    for (const s of sel()){ const v = nutsFor(s.it, s.g); $(`[data-kc="${s.i}"]`).textContent = `${fmt(v.kcal, 0)} kcal`; if (s.on && s.g > 0){ k += v.kcal || 0; n++; } }
    $("#cbAdd").textContent = n ? `Adicionar ${n} ${n === 1 ? "item" : "itens"} · ${fmt(k, 0)} kcal` : "Nada marcado";
    $("#cbAdd").disabled = !n;
  };
  upd(); $("#cbItems").oninput = upd; $("#cbItems").onchange = upd;
  $("#mealPick").onclick = e => { const b = e.target.closest("[data-m]"); if (!b) return; meal = +b.dataset.m; $("#mealPick").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); };
  $("#cbAdd").onclick = () => {
    const list = sel().filter(s => s.on && s.g > 0).map(s => ({id: uid(), createdAt: Date.now(), date: curDate, name: s.it.name, grams: s.g, unit: s.it.unit || "g", meal, n: nutsFor(s.it, s.g), productId: s.it.productId || undefined}));
    if (!list.length) return;
    for (const e of list) if (e.productId && S.products[e.productId]) S.products[e.productId].lastUsed = Date.now();
    addEntries(list, `${c.name} · ${MEALS[meal]}`);
  };
}
