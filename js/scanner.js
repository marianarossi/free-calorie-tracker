"use strict";
/* =========================================================
   SCANNER (câmera ao vivo) + foto + digitar código
   ========================================================= */
let stream = null, scanning = false, scannerOpen = false, detector = null, torchOn = false;
let scanMode = null; // "catalog" = só cadastrar produtos (não lança no diário)
$("#scanBtn").onclick = () => startScanner();
$("#scanClose").onclick = () => stopScanner();
$("#scanType").onclick = () => { stopScanner(true); typeSheet(); };
$("#scanPhoto").onclick = () => { pickPhoto(); stopScanner(true); };
function pickPhoto(){ const i = $("#photoInput"); i.value = ""; i.click(); }

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
async function startScanner(mode){
  scanMode = mode === "catalog" ? "catalog" : null;
  if (sheetOpen) closeSheet();
  if (!navigator.mediaDevices?.getUserMedia){ return typeSheet("Este navegador não libera a câmera. Use uma foto ou digite o código."); }
  $("#scanner").classList.remove("hidden", "found");
  $("#scanner").classList.toggle("catalog", !!scanMode);
  $("#scanMsg").textContent = scanMode ? "Cadastrar produto: aponte para o código" : "Aponte para o código de barras";
  scannerOpen = true; navOpen();
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal: "environment"}, width: {ideal: 1920}, height: {ideal: 1080}}});
  } catch (e) {
    $("#scanner").classList.add("hidden"); scannerOpen = false;
    return typeSheet(e?.name === "NotAllowedError" ? "Sem permissão pra câmera. Libere nas configurações do navegador, ou use foto/digite o código." : "Não consegui abrir a câmera. Use uma foto ou digite o código.");
  }
  if (!scannerOpen){ stream.getTracks().forEach(t => t.stop()); stream = null; return; } // fechou antes da câmera abrir
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
function stopScanner(fromPop){
  scanning = false;
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  $("#video").srcObject = null;
  $("#scanner").classList.add("hidden");
  if (scannerOpen){ scannerOpen = false; if (!fromPop) navClose(); }
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
    buzz(60);
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
function loadImg(file){
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), i = new Image();
    i.onload = () => { URL.revokeObjectURL(u); res(i); };
    i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("img")); };
    i.src = u;
  });
}
/** reduz fotos grandes (iPhone: 12–48 MP) antes de decodificar, pra não estourar a memória */
async function shrinkPhoto(file, max = 2400){
  if (window.createImageBitmap){
    try {
      const b = await createImageBitmap(file);
      const s = Math.min(1, max / Math.max(b.width, b.height));
      const c = document.createElement("canvas"); c.width = Math.round(b.width * s); c.height = Math.round(b.height * s);
      c.getContext("2d").drawImage(b, 0, 0, c.width, c.height); b.close?.();
      return await loadImg(await new Promise(r => c.toBlob(r, "image/jpeg", 0.92)));
    } catch {}
  }
  return loadImg(file);
}
async function decodePhoto(file){
  const img = await shrinkPhoto(file);
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
  let code = null;
  try { code = await Promise.race([decodePhoto(f), new Promise(r => setTimeout(() => r(null), 15000))]); } catch {}
  if (code) lookup(code); else typeSheet("Não consegui ler o código nessa foto. Tente uma foto mais perto, reta e com boa luz, ou digite os números.");
};
function typeSheet(msg){
  openSheet(`<h2>${scanMode ? "Cadastrar por código" : "Digitar código"}</h2>${msg ? `<div class="warnbox">${esc(msg)}</div>` : `<div class="sub">Os números embaixo das barras.</div>`}
    <form id="cForm"><input type="tel" id="codeIn" inputmode="numeric" placeholder="ex: 5601234567890" autocomplete="off"></form>
    <div class="row"><button class="btn sec" data-close>Cancelar</button><button class="btn" id="codeGo">Buscar</button></div>
    <button class="linkish planlink" id="codePhoto">${icon("image")} Escolher foto da galeria</button>`);
  $("#codePhoto").onclick = pickPhoto;
  const go = () => { const v = $("#codeIn").value.replace(/\D/g, ""); if (v.length >= 6) lookup(v); else $("#codeIn").focus(); };
  $("#codeGo").onclick = go; $("#cForm").onsubmit = e => { e.preventDefault(); go(); };
  setTimeout(() => $("#codeIn")?.focus(), 60);
}
