"use strict";
/* =========================================================
   PESO
   ========================================================= */
let wRange = 30;
function weightsSorted(){ return [...S.weights].sort((a, b) => a.date.localeCompare(b.date)); }
function weightAt(list, date, maxDays){ // último registro até 'date', no máximo maxDays antes
  let best = null; for (const w of list){ if (w.date <= date) best = w; }
  if (!best) return null;
  return daysBetween(best.date, date) <= maxDays ? best : null;
}
function movingAvg(list){ // média dos últimos 7 dias para cada registro
  return list.map(w => { const win = list.filter(x => { const d = daysBetween(x.date, w.date); return d >= 0 && d < 7; }); return {date: w.date, kg: win.reduce((s, x) => s + x.kg, 0) / win.length}; });
}
/** tendência (kg/dia) por regressão sobre a média móvel de uma janela que termina no último registro */
function weightTrend(list, days = 28, end){
  const last = end || list[list.length - 1]?.date; if (!last) return null;
  const from = addDays(last, -days);
  const avg = movingAvg(list).filter(a => a.date >= from && a.date <= last);
  if (avg.length < 3 || daysBetween(avg[0].date, avg[avg.length - 1].date) < 7) return null;
  const r = regress(avg.map(a => ({x: daysBetween(from, a.date), y: a.kg}))); if (!r) return null;
  return {slope: r.slope, now: r.at(daysBetween(from, last)), from: avg[0].date, to: avg[avg.length - 1].date, n: avg.length};
}
function forecastHTML(list){
  const goal = S.profile.goalKg; if (!goal || !list.length) return "";
  const tr = weightTrend(list);
  if (!tr) return `<div class="fc">${icon("target")}<span>Registre o peso por pelo menos uma semana pra eu prever quando você chega na meta de <b>${fmt(goal, 1)} kg</b>.</span></div>`;
  const diff = goal - tr.now, wk = tr.slope * 7, wkTxt = `${wk > 0 ? "+" : ""}${fmt(wk, 2)} kg/sem`;
  if (Math.abs(diff) < 0.3) return `<div class="fc ok">${icon("check")}<span>Você está na meta! Tendência de <b>${fmt(tr.now, 1)} kg</b> (${wkTxt}).</span></div>`;
  if (Math.abs(tr.slope) < 0.005 || Math.sign(tr.slope) !== Math.sign(diff))
    return `<div class="fc warn">${icon("target")}<span>No ritmo atual (<b>${wkTxt}</b>) o peso ${Math.abs(tr.slope) < 0.005 ? "está estável" : "está indo pro lado oposto"} da meta de ${fmt(goal, 1)} kg.</span></div>`;
  const days = Math.round(diff / tr.slope);
  if (days > 730) return `<div class="fc">${icon("target")}<span>No ritmo atual (<b>${wkTxt}</b>) a meta de ${fmt(goal, 1)} kg fica pra daqui a mais de 2 anos.</span></div>`;
  const when = addDays(today(), days);
  return `<div class="fc ok">${icon("target")}<span>No ritmo atual (<b>${wkTxt}</b>) você chega em <b>${fmt(goal, 1)} kg</b> por volta de <b>${fmtDay(when, {day: "numeric", month: "short", year: when.slice(0, 4) !== today().slice(0, 4) ? "numeric" : undefined})}</b> (≈ ${days < 14 ? days + " dias" : Math.round(days / 7) + " semanas"}).</span></div>`;
}
function renderWeight(){
  const list = weightsSorted(), P = S.profile;
  const last = list[list.length - 1], first = list[0];
  const delta = days => { if (!last) return null; const ref = weightAt(list, addDays(last.date, -days), Math.max(3, days / 3)); return ref ? last.kg - ref.kg : null; };
  const d7 = delta(7), d30 = delta(30);
  const dcls = v => v == null ? "" : v < 0 ? "down" : v > 0 ? "up" : "";
  const dtxt = v => v == null ? "—" : (v > 0 ? "+" : "") + fmt(v, 1);
  let prog = "";
  if (last && P.goalKg && first && Math.abs(first.kg - P.goalKg) > 0.1){
    const pc = clamp((first.kg - last.kg) / (first.kg - P.goalKg), 0, 1);
    prog = `<div class="wprog"><div class="top2"><span>${fmt(first.kg, 1)} kg</span><span><b>${fmt(pc * 100, 0)}%</b> do caminho</span><span>meta ${fmt(P.goalKg, 1)} kg</span></div><div class="track"><div class="fill" style="width:${pc * 100}%"></div></div></div>`;
  }
  $("#wstats").innerHTML = `<div class="wbig"><b>${last ? fmt(last.kg, 1) : "—"}</b><span>kg ${last ? `· ${relDay(last.date)}` : ""}</span></div>
    <div class="wdelta"><div><b class="${dcls(d7)}">${dtxt(d7)}</b><span>7 dias</span></div><div><b class="${dcls(d30)}">${dtxt(d30)}</b><span>30 dias</span></div>
    ${last && P.heightCm ? `<div><b>${fmt(last.kg / (P.heightCm / 100) ** 2, 1)}</b><span>IMC</span></div>` : ""}</div>`;
  $("#wprog").innerHTML = prog;
  $("#wforecast").innerHTML = forecastHTML(list);
  $("#wRange").querySelectorAll("button").forEach(b => b.classList.toggle("on", +b.dataset.r === wRange));
  $("#wchart").innerHTML = chartSVG(list);
  $("#wlist").innerHTML = list.length
    ? [...list].reverse().map((w, i, arr) => { const prev = arr[i + 1]; const dd = prev ? w.kg - prev.kg : null;
        return `<div class="wrow" data-wd="${w.date}"><div><b>${fmt(w.kg, 1)} kg</b> ${dd != null ? `<small class="${dcls(dd)}">${dtxt(dd)}</small>` : ""}</div><small>${fmtDay(w.date, {weekday: "short", day: "numeric", month: "short", year: w.date.slice(0, 4) !== today().slice(0, 4) ? "numeric" : undefined})}</small></div>`; }).join("")
    : `<div class="empty">Nenhum peso registrado ainda.</div>`;
}
function chartSVG(all){
  const W = 340, H = 190, L = 34, R = 10, T = 12, B = 24;
  let list = all;
  if (wRange) list = all.filter(w => w.date >= addDays(today(), -wRange));
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
  const xl = `<text x="${L}" y="${H - 6}">${fmtDay(list[0].date)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${fmtDay(list[list.length - 1].date)}</text>`;
  const gl = goal && goal >= lo && goal <= hi ? `<line x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--accent)" stroke-dasharray="4 4"/><text x="${W - R}" y="${y(goal) - 4}" text-anchor="end" style="fill:var(--accent)">meta</text>` : "";
  const pts = list.map(w => `<circle cx="${x(w.date)}" cy="${y(w.kg)}" r="2.8" fill="var(--card)" stroke="var(--prot)" stroke-width="1.6"/>`).join("");
  const lp = avg.map(a => `${x(a.date)},${y(a.kg)}`);
  const area = `<polygon fill="url(#wgrad)" points="${x(avg[0].date)},${H - B} ${lp.join(" ")} ${x(avg[avg.length - 1].date)},${H - B}"/>`;
  const line = `<polyline fill="none" stroke="var(--prot)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" points="${lp.join(" ")}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de peso"><defs><linearGradient id="wgrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--prot)" stop-opacity=".22"/><stop offset="1" stop-color="var(--prot)" stop-opacity="0"/></linearGradient></defs>${grid}${area}${gl}${line}${pts}${xl}</svg><div class="note" style="margin:4px 0 0">Pontos = pesagens · linha = média de 7 dias</div>`;
}
$("#wRange").onclick = e => { const r = e.target.closest("[data-r]"); if (r){ wRange = +r.dataset.r; renderWeight(); } };
$("#addWeightBtn").onclick = () => weightSheet();
$("#wlist").onclick = e => { const r = e.target.closest("[data-wd]"); if (r) weightSheet(r.dataset.wd); };
function weightSheet(date){
  const existing = date ? S.weights.find(w => w.date === date) : null;
  const last = weightsSorted().pop();
  openSheet(`<h2>${existing ? "Editar peso" : "Registrar peso"}</h2><div class="sub">Dica: pese-se sempre no mesmo horário (de manhã, em jejum) pra comparar melhor.</div>
    <div class="grams"><button class="round" id="wM" aria-label="Menos 0,1">${icon("minus")}</button><input type="number" inputmode="decimal" step="0.1" id="wIn" value="${existing ? existing.kg : last ? last.kg : ""}" placeholder="0,0"><span class="u">kg</span><button class="round" id="wP" aria-label="Mais 0,1">${icon("plus")}</button></div>
    <label class="f">Data</label><input type="date" id="wDate" value="${date || today()}" max="${today()}">
    <div class="row"><button class="btn sec" data-close>Cancelar</button><button class="btn" id="wSave">Salvar</button></div>
    ${existing ? `<div class="row"><button class="btn sec warn-t" id="wDel">${icon("trash")} Apagar registro</button></div>` : ""}`);
  setTimeout(() => { const i = $("#wIn"); i?.focus(); i?.select(); }, 60);
  const nudge = d => { const v = num($("#wIn").value) || 0; $("#wIn").value = Math.round((v + d) * 10) / 10; };
  $("#wM").onclick = () => nudge(-0.1); $("#wP").onclick = () => nudge(0.1);
  $("#wSave").onclick = () => {
    const kg = num($("#wIn").value), d = $("#wDate").value || today();
    if (!kg || kg < 20 || kg > 400){ $("#wIn").focus(); return; }
    S.weights = S.weights.filter(w => w.date !== d && (!existing || w.date !== existing.date));
    S.weights.push({date: d, kg: Math.round(kg * 10) / 10});
    save(); buzz(); closeSheet(); renderAll(); toast("Peso salvo");
  };
  if (existing) $("#wDel").onclick = () => {
    const old = existing;
    S.weights = S.weights.filter(w => w.date !== date); save(); closeSheet(); renderAll();
    toast("Registro apagado", {label: "Desfazer", fn: () => { S.weights.push(old); save(); renderAll(); }});
  };
}
