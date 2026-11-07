// Void service worker: always tries the launcher first for the newest version,
// and falls back to the saved copy when the launcher isn't running.
// It also builds the app manifest with the icon chosen in Settings.
// If you change this file, bump CACHE and the SW_CACHE constant in void.html together,
// so the app can tell the owner to run the launcher once.
const CACHE = "void-app-v3";
const ICON_IDS = ["planet", "cube", "eclipse", "infinity", "portal"];
const ICON_SIZES = [16, 24, 32, 48, 64, 96, 128, 192, 256, 512];
const FILES = ["void.html", "manifest.webmanifest",
  ...ICON_IDS.flatMap(id => ICON_SIZES.map(n => `icons/${id}-${n}.png`))];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function baseManifest(){
  try {
    const res = await fetch("manifest.webmanifest", { cache: "no-store" });
    if (res.ok) { (await caches.open(CACHE)).put("manifest.webmanifest", res.clone()); return await res.json(); }
  } catch {}
  const hit = await caches.match("manifest.webmanifest");
  return hit ? hit.json() : null;
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return; // market data and Claude go straight to the network

  if (url.pathname.endsWith("/manifest.webmanifest") && url.searchParams.has("icon")) {
    const id = ICON_IDS.includes(url.searchParams.get("icon")) ? url.searchParams.get("icon") : "planet";
    e.respondWith(baseManifest().then(m => {
      if (!m) return fetch(e.request);
      m.icons = ICON_SIZES.map(n => ({ src: `icons/${id}-${n}.png`, sizes: `${n}x${n}`, type: "image/png", purpose: "any" }));
      return new Response(JSON.stringify(m), { headers: { "content-type": "application/manifest+json" } });
    }));
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then(hit => hit || caches.match("void.html")))
  );
});
