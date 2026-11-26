"use strict";
/* =========================================================
   AJUSTES: metas, calculadora, aparência, backup
   ========================================================= */
const ACTIVITY = [
  [1.2,   "Sedentário",    "pouco ou nenhum exercício"],
  [1.375, "Leve",          "exercício 1–3× por semana"],
  [1.55,  "Moderado",      "exercício 3–5× por semana"],
  [1.725, "Intenso",       "exercício 6–7× por semana"],
  [1.9,   "Muito intenso", "trabalho físico + treino"],
];
const OBJECTIVES = [[-0.75, "Perder 0,75 kg/sem"], [-0.5, "Perder 0,5 kg/sem"], [-0.25, "Perder 0,25 kg/sem"], [0, "Manter o peso"], [0.25, "Ganhar 0,25 kg/sem"]];

function lastWeightKg(){ return weightsSorted().pop()?.kg ?? null; }
function bmr(p, kg){
  const age = new Date().getFullYear() - (num(p.birthYear) || 0);
  if (!kg || !num(p.heightCm) || !p.sex || !num(p.birthYear) || age < 14 || age > 100) return null;
  return 10 * kg + 6.25 * num(p.heightCm) - 5 * age + (p.sex === "m" ? 5 : -161);
}
function formulaTDEE(p = S.profile, kg = lastWeightKg()){
  const b = bmr(p, kg); if (!b) return null;
  return b * (ACTIVITY[p.activity ?? 1]?.[0] || 1.375);
}
function calcGoals(p, kg){
  const tdee = formulaTDEE(p, kg); if (!tdee) return null;
  const rate = num(p.rateKg) || 0, floor = p.sex === "m" ? 1500 : 1200;
  let kcal = tdee + rate * KCAL_PER_KG / 7, floored = false;
  if (kcal < floor){ kcal = floor; floored = true; }
  kcal = Math.round(kcal / 10) * 10;
  const prot = Math.round(kg * (rate === 0 ? 1.2 : 1.6));
  const gord = Math.round(kcal * 0.30 / 9);
  const carb = Math.max(0, Math.round((kcal - prot * 4 - gord * 9) / 4));
  return {tdee, bmr: bmr(p, kg), floored, goals: {kcal, prot, carb, gord, fibra: Math.round(kcal / 1000 * 14),
    acuc: Math.round(90 * kcal / 2000), sat: Math.round(20 * kcal / 2000), sal: 6}};
}

/* ---------- tema ---------- */
function applyTheme(){
  const th = S.settings.theme;
  if (th === "light" || th === "dark") document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  document.querySelector('meta[name="theme-color"]').content = bg || "#F3EEE4";
}
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);

/* ---------- folha de ajustes ---------- */
function settingsSheet(){
  const G = S.goals, P = S.profile, st = S.settings;
  const last = st.lastExport ? Math.floor((Date.now() - st.lastExport) / 864e5) : null;
  openSheet(`<h2>Ajustes</h2>
    <button class="promo" id="calcBtn">${icon("calc")}<span><b>Calcular minhas metas</b><small>idade, altura, atividade e objetivo → calorias e macros sob medida</small></span>${icon("right")}</button>
    <div class="sec-title">Metas diárias</div>
    <div class="grid2">${NUTS.map(n => `<div><label class="f">${esc(n.n)} (${n.u})</label><input type="number" inputmode="decimal" id="g_${n.k}" value="${G[n.k]}"></div>`).join("")}
      <div><label class="f">Água (ml)</label><input type="number" inputmode="numeric" id="g_water" value="${st.waterGoal}"></div>
      <div><label class="f">Tamanho do copo (ml)</label><input type="number" inputmode="numeric" id="g_step" value="${st.waterStep}"></div></div>
    <button class="linkish" id="gReset">Voltar aos valores de referência da UE</button>
    <div class="sec-title">Corpo</div>
    <div class="grid2"><div><label class="f">Altura (cm)</label><input type="number" inputmode="decimal" id="hCm" value="${P.heightCm ?? ""}" placeholder="opcional"></div>
    <div><label class="f">Peso meta (kg)</label><input type="number" inputmode="decimal" id="gKg" value="${P.goalKg ?? ""}" placeholder="opcional"></div></div>
    <div class="row"><button class="btn sec" data-close>Cancelar</button><button class="btn" id="setSave">Salvar</button></div>
    <div class="sec-title">Aparência</div>
    <div class="seg" id="themeSeg">${[["auto", "Automático"], ["light", "Claro"], ["dark", "Escuro"]].map(([k, l]) => `<button data-th="${k}" class="${st.theme === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="sec-title">Seus alimentos</div>
    <div class="row"><button class="btn sec" id="openMine">${icon("box")} Meus produtos</button><button class="btn sec" id="openRecipe">${icon("pot")} Nova receita</button></div>
    <div class="sec-title">Sincronização</div>
    <button class="promo alt" id="syncBtn">${icon("refresh")}<span><b>${syncReady() ? "Sincronizando com o GitHub" : "Sincronizar com o GitHub"}</b><small id="syncStatus">${syncStatusHTML()}</small></span>${icon("right")}</button>
    <div class="sec-title">Backup</div>
    <div class="sub">${syncReady() ? "Uma cópia extra em arquivo, por garantia." : "Os dados ficam só neste aparelho/navegador."} ${last == null ? "Você ainda não exportou nenhum backup." : `Último backup há ${last} ${last === 1 ? "dia" : "dias"}.`}</div>
    <div class="row"><button class="btn sec" id="exp">${icon("download")} Exportar</button><button class="btn sec" id="imp">${icon("upload")} Importar</button></div>
    <div class="note" style="margin-top:16px">${S.entries.length} registros de comida · ${Object.keys(S.products).length} produtos salvos · ${S.weights.length} pesagens · ${S.combos.length} combos<br>
    Dados de produtos: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> (ODbL)</div>`);
  $("#calcBtn").onclick = goalCalcSheet;
  $("#syncBtn").onclick = syncSheet;
  $("#gReset").onclick = () => { for (const n of NUTS) $("#g_" + n.k).value = DEFAULT_GOALS[n.k]; };
  $("#setSave").onclick = () => {
    for (const n of NUTS){ const v = num($("#g_" + n.k).value); S.goals[n.k] = v && v > 0 ? v : DEFAULT_GOALS[n.k]; }
    const w = num($("#g_water").value), s = num($("#g_step").value);
    S.settings.waterGoal = w && w >= 250 ? Math.round(w) : 2000;
    S.settings.waterStep = s && s >= 50 && s <= 1000 ? Math.round(s) : 250;
    S.profile.heightCm = num($("#hCm").value); S.profile.goalKg = num($("#gKg").value);
    save(); closeSheet(); renderAll(); toast("Ajustes salvos");
  };
  $("#themeSeg").onclick = e => {
    const b = e.target.closest("[data-th]"); if (!b) return;
    S.settings.theme = b.dataset.th; save(); applyTheme();
    $("#themeSeg").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
  };
  $("#openMine").onclick = myProductsSheet;
  $("#openRecipe").onclick = () => newRecipe();
  $("#exp").onclick = exportData;
  $("#imp").onclick = () => { $("#importInput").value = ""; $("#importInput").click(); };
}

/* ---------- calculadora de metas ---------- */
function goalCalcSheet(){
  const P = {...S.profile}; P.activity ??= 1; P.rateKg ??= -0.5;
  let kg = lastWeightKg();
  openSheet(`<h2>Calcular metas</h2><div class="sub">Estimativa pela fórmula de Mifflin-St Jeor. É um ponto de partida: depois de umas semanas, a aba Progresso mostra o seu gasto real.</div>
    <label class="f">Sexo (pra fórmula)</label>
    <div class="seg" id="cSex"><button data-s="f" class="${P.sex === "f" ? "on" : ""}">Feminino</button><button data-s="m" class="${P.sex === "m" ? "on" : ""}">Masculino</button></div>
    <div class="grid3">
      <div><label class="f">Ano de nasc.</label><input type="number" inputmode="numeric" id="cYear" value="${P.birthYear ?? ""}" placeholder="ex: 1994"></div>
      <div><label class="f">Altura (cm)</label><input type="number" inputmode="decimal" id="cH" value="${P.heightCm ?? ""}"></div>
      <div><label class="f">Peso (kg)</label><input type="number" inputmode="decimal" id="cKg" value="${kg ?? ""}"></div>
    </div>
    <label class="f">Atividade</label>
    <select id="cAct">${ACTIVITY.map((a, i) => `<option value="${i}"${i === +P.activity ? " selected" : ""}>${a[1]} — ${a[2]}</option>`).join("")}</select>
    <label class="f">Objetivo</label>
    <select id="cObj">${OBJECTIVES.map(([v, l]) => `<option value="${v}"${v === +P.rateKg ? " selected" : ""}>${l}</option>`).join("")}</select>
    <div id="cRes"></div>
    <div class="row"><button class="btn sec" id="cBack">Voltar</button><button class="btn" id="cApply" disabled>Aplicar às metas</button></div>`);
  let res = null;
  const upd = () => {
    P.birthYear = num($("#cYear").value); P.heightCm = num($("#cH").value); kg = num($("#cKg").value);
    P.activity = +$("#cAct").value; P.rateKg = +$("#cObj").value;
    res = kg ? calcGoals(P, kg) : null;
    $("#cApply").disabled = !res;
    if (!res){ $("#cRes").innerHTML = `<div class="note">Preencha sexo, ano de nascimento, altura e peso.</div>`; return; }
    const g = res.goals;
    $("#cRes").innerHTML = `<div class="calc">
      <div class="cr"><span>Metabolismo basal</span><b>${fmt(res.bmr, 0)} kcal</b></div>
      <div class="cr"><span>Gasto estimado no dia</span><b>${fmt(res.tdee, 0)} kcal</b></div>
      <div class="cr big"><span>Sua meta</span><b>${fmt(g.kcal, 0)} kcal</b></div>
      <div class="cm">${[["prot", "Proteína", g.prot], ["carb", "Carbo", g.carb], ["gord", "Gordura", g.gord], ["fib", "Fibras", g.fibra]].map(([k, l, v]) => `<div style="--c:var(--${k})"><b>${v} g</b><span>${l}</span></div>`).join("")}</div>
      ${res.floored ? `<div class="warnbox">Ajustei pra ${fmt(g.kcal, 0)} kcal, o mínimo recomendado sem acompanhamento. Pra perder mais rápido que isso, fale com um nutricionista.</div>` : ""}
    </div>`;
  };
  upd();
  $("#sheet").oninput = upd; $("#sheet").onchange = upd;
  $("#cSex").onclick = e => { const b = e.target.closest("[data-s]"); if (!b) return; P.sex = b.dataset.s; $("#cSex").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); upd(); };
  $("#cBack").onclick = settingsSheet;
  $("#cApply").onclick = () => {
    if (!res) return;
    const old = {...S.goals};
    Object.assign(S.goals, res.goals);
    S.profile = {...S.profile, sex: P.sex, birthYear: P.birthYear, heightCm: P.heightCm, activity: P.activity, rateKg: P.rateKg};
    if (kg && kg !== lastWeightKg() && !S.weights.some(w => w.date === today())) S.weights.push({date: today(), kg: Math.round(kg * 10) / 10});
    save(); closeSheet(); renderAll(); celebrate();
    toast(`Metas atualizadas: ${fmt(res.goals.kcal, 0)} kcal`, {label: "Desfazer", fn: () => { S.goals = old; save(); renderAll(); }});
  };
}

/* ---------- backup ---------- */
function exportData(){
  const blob = new Blob([JSON.stringify({app: "meu-dia", version: 2, exportedAt: new Date().toISOString(), ...S}, null, 1)], {type: "application/json"});
  const file = new File([blob], `meu-dia-backup-${today()}.json`, {type: "application/json"});
  const done = () => { S.settings.lastExport = Date.now(); save(); renderAll(); };
  if (navigator.canShare?.({files: [file]})){ navigator.share({files: [file], title: "Backup Meu Dia"}).then(done).catch(() => {}); return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  done(); toast("Backup salvo nos downloads");
}
const badBackup = () => openSheet(`<h2>Arquivo inválido</h2><div class="warnbox">Não é um backup do Meu Dia.</div><div class="row"><button class="btn sec" data-close>Fechar</button></div>`);
$("#importInput").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  let d; try { d = JSON.parse(await f.text()); } catch { return badBackup(); }
  if (!d || d.app !== "meu-dia") return badBackup();
  const n = normalize(d);
  openSheet(`<h2>Importar backup?</h2><div class="sub">${n.entries.length} registros de comida, ${n.weights.length} pesagens, ${Object.keys(n.products).length} produtos, ${n.combos.length} combos.</div>
    <div class="row"><button class="btn sec" id="impMerge">Juntar com o atual</button><button class="btn danger" id="impRepl">Substituir tudo</button></div>
    <div class="row"><button class="btn sec" data-close>Cancelar</button></div>`);
  $("#impRepl").onclick = () => { S = n; save(); applyTheme(); closeSheet(); renderAll(); toast("Backup restaurado"); };
  $("#impMerge").onclick = () => {
    const ids = new Set(S.entries.map(x => x.id));
    S.entries.push(...n.entries.filter(x => !ids.has(x.id)));
    S.products = {...n.products, ...S.products};
    const wd = new Set(S.weights.map(w => w.date)); S.weights.push(...n.weights.filter(w => !wd.has(w.date)));
    S.water = {...n.water, ...S.water};
    const cids = new Set(S.combos.map(c => c.id)); S.combos.push(...n.combos.filter(c => !cids.has(c.id)));
    save(); closeSheet(); renderAll(); toast("Backup juntado");
  };
};
