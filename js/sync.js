"use strict";
/* =========================================================
   SINCRONIZAÇÃO com um arquivo JSON num repositório (privado)
   do GitHub, pela API de conteúdo. Assim o app no celular, o
   app no PC e o Claude (editando o arquivo) veem os mesmos dados.
   Junção em 3 vias: base (última versão sincronizada) × local × remoto,
   item a item (refeições por id, pesos por data, produtos por chave…).
   O token fica só neste aparelho (localStorage), nunca no arquivo.
   ========================================================= */
const SYNC_KEY = "meudia:sync", BASE_KEY = "meudia:syncbase";
const LOCAL_ONLY = ["theme", "lastExport"]; // ajustes que são de cada aparelho
let syncBusy = false, syncAgain = false, syncTimer = null, syncState = "idle";

function syncCfg(){ try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || null; } catch { return null; } }
function setSyncCfg(c){ c ? localStorage.setItem(SYNC_KEY, JSON.stringify(c)) : localStorage.removeItem(SYNC_KEY); }
function syncReady(){ const c = syncCfg(); return !!(c?.token && c.owner && c.repo && c.path); }
function syncSoon(ms = 1500){ if (!syncReady()) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), ms); }

/* ---------- documento remoto ---------- */
function toDoc(s){
  const settings = {...s.settings}; for (const k of LOCAL_ONLY) delete settings[k];
  return {products: s.products, entries: s.entries, weights: s.weights, goals: s.goals, profile: s.profile, water: s.water, train: s.train || {}, combos: s.combos, settings};
}
/** JSON legível e fácil de editar à mão: um item por linha */
function serializeDoc(doc){
  const J = v => JSON.stringify(v);
  const block = (v, isArr) => {
    const items = isArr ? v.map(J) : Object.entries(v).map(([k, x]) => `${J(k)}: ${J(x)}`);
    return items.length ? `${isArr ? "[" : "{"}\n  ${items.join(",\n  ")}\n ${isArr ? "]" : "}"}` : (isArr ? "[]" : "{}");
  };
  const head = {app: "meu-dia", version: 2, updatedAt: new Date().toISOString()};
  const parts = Object.entries(head).map(([k, v]) => ` ${J(k)}: ${J(v)}`);
  for (const k of ["goals", "profile", "settings", "water", "train", "weights", "combos", "products", "entries"]) parts.push(` ${J(k)}: ${block(doc[k], Array.isArray(doc[k]))}`);
  return `{\n${parts.join(",\n")}\n}\n`;
}

/* ---------- junção em 3 vias ---------- */
const jstr = v => v === undefined ? undefined : JSON.stringify(v);
function merge3(b = {}, l = {}, r = {}, prefer = "local"){
  const out = {};
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])){
    const bv = jstr(b[k]), lv = jstr(l[k]), rv = jstr(r[k]);
    let v;
    if (lv === rv) v = l[k];
    else if (lv === bv) v = r[k];          // só o remoto mudou (ou apagou)
    else if (rv === bv) v = l[k];          // só aqui mudou (ou apagou)
    else if (l[k] === undefined) v = r[k]; // apagado de um lado, editado do outro: a edição ganha
    else if (r[k] === undefined) v = l[k];
    else v = prefer === "remote" ? r[k] : l[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}
const byKey = (list, f) => Object.fromEntries((list || []).map(x => [f(x), x]));
const entryKey = e => e.id || "~" + JSON.stringify(e);
function mergeDocs(b, l, r, prefer){
  b = b || {};
  const lists = {entries: entryKey, weights: w => w.date, combos: c => c.id || "~" + JSON.stringify(c)};
  const out = {};
  for (const [k, f] of Object.entries(lists)) out[k] = Object.values(merge3(byKey(b[k], f), byKey(l[k], f), byKey(r[k], f), prefer));
  for (const k of ["products", "water", "train", "goals", "profile", "settings"]) out[k] = merge3(b[k], l[k], r[k], prefer);
  out.entries.sort((x, y) => x.date.localeCompare(y.date) || (x.createdAt || 0) - (y.createdAt || 0));
  out.weights.sort((x, y) => x.date.localeCompare(y.date));
  return out;
}
function applyDoc(doc){
  const n = normalize({...doc, settings: {...doc.settings, ...Object.fromEntries(LOCAL_ONLY.map(k => [k, S.settings[k]]))}});
  const changed = jstr(toDoc(n)) !== jstr(toDoc(S));
  S = n;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
  return changed;
}

/* ---------- API do GitHub ---------- */
const b64enc = s => { const by = new TextEncoder().encode(s); let bin = ""; for (let i = 0; i < by.length; i += 0x8000) bin += String.fromCharCode(...by.subarray(i, i + 0x8000)); return btoa(bin); };
const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), c => c.charCodeAt(0)));
class SyncError extends Error {}
async function ghFetch(c, url, opts = {}, accept = "application/vnd.github+json"){
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 20000);
  try {
    return await fetch(url, {...opts, cache: "no-store", signal: ac.signal,
      headers: {Accept: accept, Authorization: "Bearer " + c.token, "X-GitHub-Api-Version": "2022-11-28", ...(opts.body ? {"Content-Type": "application/json"} : {})}});
  } catch (e){ throw new SyncError(e.name === "AbortError" ? "o GitHub demorou demais pra responder" : "sem conexão com o GitHub"); }
  finally { clearTimeout(t); }
}
function ghError(r, what){
  if (r.status === 401) return new SyncError("token inválido ou expirado");
  if (r.status === 403 && r.headers.get("x-ratelimit-remaining") === "0") return new SyncError("limite de uso da API do GitHub, tenta daqui a pouco");
  if (r.status === 403) return new SyncError("o token não tem permissão de escrita (Contents: Read and write)");
  if (r.status === 404) return new SyncError("repositório não encontrado, ou o token não tem acesso a ele");
  return new SyncError(`erro ${r.status} ao ${what}`);
}
const contentsURL = c => `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${c.path.split("/").map(encodeURIComponent).join("/")}`;
async function ghGet(c){
  const r = await ghFetch(c, contentsURL(c));
  if (r.status === 404){
    const repo = await ghFetch(c, `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`);
    if (!repo.ok) throw ghError(repo, "abrir o repositório");
    return {doc: null, sha: null};
  }
  if (!r.ok) throw ghError(r, "ler os dados");
  const meta = await r.json();
  let text;
  if (meta.encoding === "base64" && meta.content) text = b64dec(meta.content);
  else { // arquivo grande (> 1 MB): a API não manda o conteúdo junto
    const raw = await ghFetch(c, contentsURL(c), {}, "application/vnd.github.raw+json");
    if (!raw.ok) throw ghError(raw, "ler os dados");
    text = await raw.text();
  }
  let doc;
  try { doc = JSON.parse(text); } catch { throw new SyncError(`o arquivo ${c.path} no GitHub não é um JSON válido (alguém editou à mão?)`); }
  return {doc, sha: meta.sha};
}
async function ghPut(c, text, sha, message){
  const r = await ghFetch(c, contentsURL(c), {method: "PUT", body: JSON.stringify({message, content: b64enc(text), ...(sha ? {sha} : {})})});
  if (r.status === 409 || r.status === 422 && sha) return {conflict: true};
  if (!r.ok) throw ghError(r, "salvar os dados");
  return {sha: (await r.json()).content?.sha};
}

/* ---------- ciclo de sincronização ---------- */
function loadBase(){ try { return JSON.parse(localStorage.getItem(BASE_KEY)) || null; } catch { return null; } }
function saveBase(doc){ try { localStorage.setItem(BASE_KEY, JSON.stringify(doc)); } catch {} }
function setSyncState(s){ syncState = s; document.documentElement.dataset.sync = s; const el = $("#syncStatus"); if (el) el.innerHTML = syncStatusHTML(); }

async function syncNow({manual = false} = {}){
  const c = syncCfg(); if (!syncReady()) return false;
  if (syncBusy){ syncAgain = true; return false; }
  if (!navigator.onLine){ setSyncState("offline"); if (manual) toast("Sem internet. Sincronizo quando voltar."); return false; }
  syncBusy = true; setSyncState("busy");
  let ok = false;
  try {
    for (let attempt = 0; attempt < 4 && !ok; attempt++){
      const remote = await ghGet(c);
      const base = loadBase(), L0 = toDoc(S);
      const R = remote.doc ? toDoc(normalize(remote.doc)) : null;
      // 1ª vez neste aparelho: junta tudo; em conflito de metas/perfil, vale quem tem mais registros
      const prefer = base ? "local" : (R && R.entries.length >= L0.entries.length ? "remote" : "local");
      const M = R ? mergeDocs(base, L0, R, prefer) : L0;
      let sha = remote.sha;
      if (!R || jstr(M) !== jstr(R)){
        const res = await ghPut(c, serializeDoc(M), sha, `Meu Dia: sincronizado pelo app (${navigator.userAgentData?.mobile || /Mobi/.test(navigator.userAgent) ? "celular" : "computador"})`);
        if (res.conflict) continue; // alguém salvou no meio: tenta de novo com a versão nova
        sha = res.sha;
      }
      const now = toDoc(S); // mudanças feitas aqui enquanto sincronizava não se perdem
      const known = new Set([...L0.entries, ...(base?.entries || [])].map(entryKey));
      const arrived = R ? M.entries.filter(e => !known.has(entryKey(e))) : [];
      const changed = applyDoc(jstr(now) === jstr(L0) ? M : mergeDocs(L0, now, M, "local"));
      saveBase(M);
      if (arrived.length && base){ // na 1ª sincronização de um aparelho tudo é "novo": não avisa
        for (const e of arrived) freshIds.add(e.id);
        const byClaude = arrived.every(e => e.by === "claude"), n = arrived.length;
        if (!manual) toast(`${n} ${n === 1 ? "item chegou" : "itens chegaram"}${byClaude ? " do Claude" : " de outro aparelho"}`, arrived[0].date !== curDate ? {label: "Ver", fn: () => { setTab("diary"); setDate(arrived[0].date); }} : null);
      }
      setSyncCfg({...syncCfg(), sha, lastSync: Date.now(), lastError: null});
      ok = true;
      if (changed && typeof renderAll === "function") renderAll();
      if (manual) toast(changed ? "Sincronizado · dados novos chegaram" : "Tudo sincronizado");
    }
    if (!ok) throw new SyncError("muitas alterações ao mesmo tempo, tenta de novo");
  } catch (e){
    const msg = e instanceof SyncError ? e.message : "erro inesperado (" + (e.message || e) + ")";
    const had = syncCfg()?.lastError;
    setSyncCfg({...syncCfg(), lastError: msg});
    if (manual || !had) toast("Sincronização falhou: " + msg);
  } finally {
    syncBusy = false;
    setSyncState(ok ? "ok" : navigator.onLine ? "error" : "offline");
    if (syncAgain){ syncAgain = false; syncSoon(300); }
  }
  return ok;
}

function ago(t){
  const m = Math.round((Date.now() - t) / 6e4);
  return m < 1 ? "agora mesmo" : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`;
}
function syncStatusHTML(){
  const c = syncCfg();
  if (!syncReady()) return "Desligada. Os dados ficam só neste aparelho.";
  if (syncState === "busy") return "Sincronizando…";
  if (c.lastError) return `<span class="warn-t">Falhou: ${esc(c.lastError)}</span>`;
  if (syncState === "offline") return "Sem internet. Sincronizo quando voltar.";
  return c.lastSync ? `Sincronizado ${ago(c.lastSync)} com <b>${esc(c.owner)}/${esc(c.repo)}</b>` : "Conectado, ainda não sincronizou.";
}

/* ---------- folha de configuração ---------- */
function syncSheet(){
  const c = syncCfg() || {path: "data.json"};
  openSheet(`<h2>Sincronizar com o GitHub</h2>
    <div class="sub">Guarda seus dados num arquivo de um repositório <b>privado</b> seu. Assim o app no celular e no computador mostram a mesma coisa, e o Claude consegue lançar refeições por você editando esse arquivo.</div>
    <details class="howto"><summary>Como configurar (5 min, uma vez só)</summary><ol>
      <li>Crie um repositório <b>privado</b> no GitHub, ex: <code>meu-dia-dados</code> (<a href="https://github.com/new" target="_blank" rel="noopener">github.com/new</a>).</li>
      <li>Crie um token <i>fine-grained</i> em <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>: em <i>Repository access</i> escolha <b>Only select repositories</b> → o repo de dados; em <i>Permissions</i> → <b>Contents: Read and write</b>. Validade: até 1 ano.</li>
      <li>Cole aqui embaixo e toque em Conectar. Repita no outro aparelho (pode usar o mesmo token).</li></ol></details>
    <div class="grid2"><div><label class="f">Usuário do GitHub</label><input id="syOwner" type="text" autocapitalize="off" autocomplete="off" spellcheck="false" value="${esc(c.owner || "")}" placeholder="seu-usuario"></div>
    <div><label class="f">Repositório</label><input id="syRepo" type="text" autocapitalize="off" autocomplete="off" spellcheck="false" value="${esc(c.repo || "")}" placeholder="meu-dia-dados"></div></div>
    <label class="f">Arquivo</label><input id="syPath" type="text" autocapitalize="off" spellcheck="false" value="${esc(c.path || "data.json")}">
    <label class="f">Token</label><input id="syToken" type="password" autocomplete="off" spellcheck="false" value="${esc(c.token || "")}" placeholder="github_pat_…">
    <div class="sub" id="syncStatus" style="margin-top:12px">${syncStatusHTML()}</div>
    <div class="row"><button class="btn sec" ${syncReady() ? 'id="syOff"' : "data-close"}>${syncReady() ? "Desconectar" : "Cancelar"}</button><button class="btn" id="syGo">${icon("refresh")} ${syncReady() ? "Sincronizar agora" : "Conectar"}</button></div>
    <div class="note">O token fica salvo só neste aparelho. Seus dados continuam também aqui, então dá pra usar offline.</div>`);
  $("#syGo").onclick = async () => {
    const v = id => $(id).value.trim();
    const owner = v("#syOwner").replace(/^https?:\/\/github\.com\//, "").replace(/\/.*$/, ""), repo = v("#syRepo").replace(/\.git$/, ""), path = v("#syPath").replace(/^\/+/, "") || "data.json", token = v("#syToken");
    if (!owner || !repo || !token){ toast("Preencha usuário, repositório e token"); return; }
    const old = syncCfg();
    const same = old && old.owner === owner && old.repo === repo && old.path === path;
    if (!same) localStorage.removeItem(BASE_KEY); // outro arquivo: começa a junção do zero
    setSyncCfg({...(same ? old : {}), owner, repo, path, token, lastError: null});
    $("#syGo").disabled = true;
    const ok = await syncNow({manual: true});
    if (!$("#syGo")) return;
    $("#syGo").disabled = false;
    if (ok){ closeSheet(); renderAll(); }
  };
  if ($("#syOff")) $("#syOff").onclick = () => {
    setSyncCfg(null); localStorage.removeItem(BASE_KEY); setSyncState("idle");
    closeSheet(); toast("Sincronização desligada. Os dados continuam neste aparelho.");
  };
}

window.addEventListener("online", () => syncSoon(500));
setInterval(() => { if (!document.hidden && !syncBusy) syncNow(); }, 60000); // pega o que o Claude lançou com o app aberto
