"use strict";
/* =========================================================
   ABAS + INÍCIO
   ========================================================= */
let tab = "diary";
const VIEWS = {diary: renderDiary, progress: renderProgress, weight: renderWeight};
document.querySelector(".tabs").onclick = e => { const b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab); };
$("#settingsTab").onclick = settingsSheet;
function setTab(t){
  if (t !== tab) window.scrollTo(0, 0);
  tab = t;
  $$(".tabs [data-tab]").forEach(b => { const on = b.dataset.tab === t; b.classList.toggle("on", on); b.setAttribute("aria-current", on ? "page" : "false"); });
  for (const k in VIEWS) $("#view-" + k).classList.toggle("hidden", k !== t);
  renderAll();
}
function renderAll(){ VIEWS[tab](); }

/* botão voltar: fecha scanner/folha em vez de sair */
window.addEventListener("popstate", () => {
  if (nav.pending){ nav.pending = false; if (nav.repush){ nav.repush = false; history.pushState({ov: 1}, ""); } return; }
  if (scannerOpen) stopScanner(true);
  else if (sheetOpen) closeSheet(true);
});
if (history.state?.ov) history.replaceState(null, "");
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (scannerOpen) stopScanner(); else if (sheetOpen) closeSheet();
});
let wasToday = true; // se estava em "Hoje" e virou o dia com o app em segundo plano, vai pro novo hoje
document.addEventListener("visibilitychange", () => {
  if (document.hidden){ wasToday = curDate === today(); return; }
  if (scanning || sheetOpen) return;
  S = load();
  if (wasToday || curDate > today()) curDate = today();
  renderAll();
  syncSoon(200);
});

applyTheme();
setTab("diary");
syncSoon(0);

if ("serviceWorker" in navigator && location.protocol === "https:"){
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
