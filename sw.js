// Service worker: guarda o app pra abrir rápido e offline. A API do Open Food Facts nunca é guardada aqui.
const CACHE = "meudia-v6";
const SHELL = ["./", "index.html", "style.css", "foods.js",
  "js/core.js", "js/food.js", "js/diary.js", "js/scanner.js", "js/weight.js", "js/progress.js", "js/settings.js", "js/sync.js", "js/main.js",
  "vendor/zxing.min.js", "vendor/fonts/bricolage-latin.woff2", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // rede primeiro (pega atualizações), cache se estiver offline
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, {ignoreSearch: true}).then(r => r || caches.match("index.html"))));
});
