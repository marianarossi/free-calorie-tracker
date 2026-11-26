"use strict";
/* =========================================================
   PROGRESSO — médias, sequência, gráficos e gasto real estimado
   ========================================================= */
let pRange = 30;
const TDEE_WINDOW = 28;

function streaks(dates){
  const t = today();
  let cur = 0, d = dates.has(t) ? t : addDays(t, -1);
  while (dates.has(d)){ cur++; d = addDays(d, -1); }
  let best = 0, run = 0, prev = null;
  for (const s of [...dates].sort()){ run = prev && daysBetween(prev, s) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = s; }
  return {cur, best};
}
function renderProgress(){
  const t = today(), G = S.goals, g = G.kcal || 2000;
  const byDate = groupByDate(S.entries);
  const rows = Array.from({length: pRange}, (_, i) => { const d = addDays(t, i - pRange + 1), l = byDate.get(d) || []; return {d, n: l.length, ...totals(l)}; });
  const logged = rows.filter(r => r.n);
  const avg = k => logged.length ? logged.reduce((s, r) => s + r[k], 0) / logged.length : null;
  const inGoal = logged.filter(r => r.kcal <= g * 1.05).length;
  const st = streaks(new Set(byDate.keys()));
  $("#pRange").querySelectorAll("button").forEach(b => b.classList.toggle("on", +b.dataset.r === pRange));

  $("#ptiles").innerHTML = [
    ["chart", "Média por dia", logged.length ? fmt(avg("kcal"), 0) : "—", "kcal", `meta ${fmt(g, 0)}`],
    ["target", "Dentro da meta", logged.length ? `${inGoal}<small>/${logged.length}</small>` : "—", "dias", logged.length ? `${fmt(inGoal / logged.length * 100, 0)}% dos dias registrados` : "sem registros"],
    ["flame", "Sequência", st.cur, st.cur === 1 ? "dia" : "dias", `recorde: ${st.best} ${st.best === 1 ? "dia" : "dias"}`],
    ["prot", "Proteína média", logged.length ? fmt(avg("prot"), 0) : "—", "g/dia", `meta ${fmt(G.prot, 0)} g`],
  ].map(([ic, l, v, u, s], i) => `<div class="tile${i === 2 && st.cur >= 3 ? " hot" : ""}">${ic === "prot" ? `<i class="dot" style="background:var(--prot)"></i>` : icon(ic)}<span>${l}</span><b>${v}<small> ${u}</small></b><em>${s}</em></div>`).join("");

  $("#pchart").innerHTML = logged.length ? kcalBars(rows, g) : `<div class="empty">Sem registros nesse período ainda.</div>`;

  const pk = logged.reduce((s, r) => s + r.prot * 4, 0), ck = logged.reduce((s, r) => s + r.carb * 4, 0), fk = logged.reduce((s, r) => s + r.gord * 9, 0), sum = pk + ck + fk;
  $("#pmacros").innerHTML = sum ? `<div class="donut-wrap">${donut([[pk, "--prot"], [ck, "--carb"], [fk, "--gord"]])}
    <div class="legend">${[["Proteína", pk, "prot", 4], ["Carboidratos", ck, "carb", 4], ["Gorduras", fk, "gord", 9]].map(([l, v, k, f]) =>
      `<div><i style="background:var(--${k})"></i><span>${l}</span><b>${fmt(v / sum * 100, 0)}%</b><small>${fmt(v / f / logged.length, 0)} g/dia</small></div>`).join("")}</div></div>`
    : `<div class="empty">Sem dados de macros nesse período.</div>`;

  const foods = new Map();
  for (const r of rows) for (const e of byDate.get(r.d) || []){
    const k = e.productId || "q:" + e.name, f = foods.get(k) || {name: e.name.split(" · ")[0], kcal: 0, n: 0};
    f.kcal += num(e.n?.kcal) || 0; f.n++; foods.set(k, f);
  }
  const top = [...foods.values()].sort((a, b) => b.kcal - a.kcal).slice(0, 5), topMax = top[0]?.kcal || 1;
  $("#ptop").innerHTML = top.length ? top.map((f, i) => `<div class="topf"><span class="rk">${i + 1}</span><div class="nm"><div>${esc(f.name)}</div><div class="track"><div class="fill" style="width:${f.kcal / topMax * 100}%"></div></div></div><div class="k">${fmt(f.kcal, 0)}<small> kcal · ${f.n}×</small></div></div>`).join("")
    : `<div class="empty">Nada ainda.</div>`;

  $("#ptdee").innerHTML = tdeeHTML(byDate);
  if ($("#tdeeUse")) $("#tdeeUse").onclick = () => {
    const v = +$("#tdeeUse").dataset.v, old = S.goals.kcal;
    S.goals.kcal = v; save(); renderAll();
    toast(`Meta ajustada pra ${fmt(v, 0)} kcal`, {label: "Desfazer", fn: () => { S.goals.kcal = old; save(); renderAll(); }});
  };

  const wrows = rows.map(r => ({d: r.d, ml: S.water[r.d] || 0}));
  const wl = wrows.filter(r => r.ml);
  $("#pwaterWrap").classList.toggle("hidden", !wl.length);
  if (wl.length){
    const goal = S.settings.waterGoal || 2000, mx = Math.max(goal, ...wl.map(r => r.ml));
    $("#pwater").innerHTML = `<div class="wbars">${wrows.map(r => `<i class="${r.ml >= goal ? "ok" : ""}" style="height:${Math.max(r.ml ? 6 : 2, r.ml / mx * 100)}%" title="${fmtDay(r.d)}: ${fmt(r.ml / 1000, 2)} L"></i>`).join("")}</div>
      <div class="note" style="margin:6px 0 0">Média de <b>${fmt(wl.reduce((s, r) => s + r.ml, 0) / wl.length / 1000, 2)} L</b> nos dias registrados · meta batida em ${wl.filter(r => r.ml >= goal).length} dias</div>`;
  }
}
function kcalBars(rows, g){
  const W = 340, H = 170, L = 30, R = 6, T = 12, B = 22, n = rows.length;
  const top = Math.max(g * 1.2, ...rows.map(r => r.kcal)), stepK = top > 3200 ? 1000 : 500, mx = Math.ceil(top / stepK) * stepK;
  const y = v => T + (1 - v / mx) * (H - T - B), bw = (W - L - R) / n, gap = bw * (n <= 7 ? .34 : n <= 31 ? .24 : .12);
  let s = "";
  for (let k = stepK; k <= mx; k += stepK) s += `<line x1="${L}" x2="${W - R}" y1="${y(k)}" y2="${y(k)}" stroke="var(--line)"/><text x="${L - 5}" y="${y(k) + 3}" text-anchor="end">${fmt(k / 1000, 1)}k</text>`;
  rows.forEach((r, i) => {
    const x = L + i * bw + gap / 2, w = bw - gap, rx = Math.min(5, w / 2);
    if (r.n){ const yy = y(r.kcal); s += `<rect class="b ${r.kcal > g * 1.05 ? "over" : "ok"}${r.d === today() ? " now" : ""}" x="${x}" y="${yy}" width="${w}" height="${Math.max(2, H - B - yy)}" rx="${rx}"/>`; }
    else s += `<rect class="b none" x="${x}" y="${H - B - 3}" width="${w}" height="3" rx="1.5"/>`;
    s += `<rect class="hit" data-day="${r.d}" x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}"><title>${fmtDay(r.d)}: ${r.n ? fmt(r.kcal, 0) + " kcal" : "sem registro"}</title></rect>`;
  });
  s += `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" stroke="var(--ink)" stroke-dasharray="4 4" opacity=".55"/><text x="${W - R}" y="${y(g) - 4}" text-anchor="end" style="fill:var(--ink)">meta</text>`;
  const lab = (i, a = "middle") => `<text x="${L + i * bw + bw / 2}" y="${H - 6}" text-anchor="${a}">${n <= 7 ? WEEKDAYS[parseYmd(rows[i].d).getDay()] : fmtDay(rows[i].d)}</text>`;
  s += n <= 7 ? rows.map((_, i) => lab(i)).join("") : lab(0, "start") + lab(Math.floor(n / 2)) + lab(n - 1, "end");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Calorias por dia">${s}</svg><div class="note" style="margin:4px 0 0">Toque numa barra pra abrir o dia</div>`;
}
function donut(parts){
  const r = 38, C = 2 * Math.PI * r, sum = parts.reduce((s, p) => s + p[0], 0);
  let off = 0, h = "";
  for (const [v, c] of parts){ const len = v / sum * C; if (len > 0) h += `<circle cx="50" cy="50" r="${r}" fill="none" stroke="var(${c})" stroke-width="16" stroke-dasharray="${Math.max(0, len - 2)} ${C}" stroke-dashoffset="${-off}"/>`; off += len; }
  return `<svg class="donut" viewBox="0 0 100 100" aria-hidden="true"><g transform="rotate(-90 50 50)">${h}</g></svg>`;
}
/** gasto real ≈ média ingerida − variação de peso (tendência) × 7700 kcal/kg */
function tdeeHTML(byDate){
  const t = today(), to = addDays(t, -1), from = addDays(t, -TDEE_WINDOW);
  const days = Array.from({length: TDEE_WINDOW}, (_, i) => addDays(from, i));
  const logged = days.filter(d => (byDate.get(d) || []).length);
  const ws = weightsSorted(), inWin = ws.filter(w => w.date >= from && w.date <= t);
  const span = inWin.length ? daysBetween(inWin[0].date, inWin[inWin.length - 1].date) : 0;
  const formula = formulaTDEE();
  const fTxt = formula ? `<div class="note" style="text-align:left;margin:8px 0 0">Pela fórmula (Mifflin-St Jeor × atividade): <b>${fmt(formula, 0)} kcal/dia</b>.</div>` : "";
  const head = `<div class="ph">${icon("flame")}<div><b>Gasto real estimado</b><span>cruza o que você comeu com a tendência do peso nas últimas 4 semanas</span></div></div>`;
  if (logged.length < 10 || inWin.length < 2 || span < 10){
    const ck = (ok, txt) => `<li class="${ok ? "ok" : ""}">${icon(ok ? "check" : "x")}${txt}</li>`;
    return head + `<ul class="checks">${ck(logged.length >= 10, `Dias com comida registrada: <b>${logged.length}/10</b>`)}${ck(inWin.length >= 2, `Pesagens nas últimas 4 semanas: <b>${inWin.length}/2</b>`)}${ck(span >= 10, `Pesagens cobrindo pelo menos 10 dias: <b>${span}/10</b>`)}</ul>` + fTxt;
  }
  const intake = logged.reduce((s, d) => s + totals(byDate.get(d)).kcal, 0) / logged.length;
  const tr = weightTrend(ws, TDEE_WINDOW, inWin[inWin.length - 1].date);
  const slope = tr ? tr.slope : (inWin[inWin.length - 1].kg - inWin[0].kg) / span;
  const tdee = intake - slope * KCAL_PER_KG;
  if (tdee < 1000 || tdee > 5000) return head + `<div class="warnbox">A conta deu ${fmt(tdee, 0)} kcal/dia, o que não parece real. Provavelmente faltam itens nos dias registrados.</div>` + fTxt;
  const rate = num(S.profile.rateKg) || 0, suggest = Math.round((tdee + rate * KCAL_PER_KG / 7) / 10) * 10;
  return head + `<div class="tdee"><b>${fmt(tdee, 0)}</b><span>kcal/dia</span></div>
    <div class="sub" style="margin:0">Você comeu em média <b>${fmt(intake, 0)} kcal</b> em ${logged.length} dias e o peso ${Math.abs(slope * 7) < 0.05 ? "ficou estável" : `${slope < 0 ? "caiu" : "subiu"} <b>${fmt(Math.abs(slope * 7), 2)} kg/sem</b>`}.</div>
    ${fTxt}<div class="note" style="text-align:left;margin:6px 0 0">É uma estimativa: só fica boa se você registra tudo que come.</div>
    ${Math.abs(suggest - (S.goals.kcal || 0)) >= 50 ? `<button class="btn sec full" id="tdeeUse" data-v="${suggest}" style="margin-top:10px">${icon("target")} Ajustar meta pra ${fmt(suggest, 0)} kcal ${rate ? `(${rate > 0 ? "+" : ""}${fmt(rate, 2)} kg/sem)` : "(manter)"}</button>` : ""}`;
}
$("#pRange").onclick = e => { const r = e.target.closest("[data-r]"); if (r){ pRange = +r.dataset.r; renderProgress(); } };
$("#pchart").onclick = e => { const h = e.target.closest("[data-day]"); if (h){ curDate = h.dataset.day; setTab("diary"); } };
