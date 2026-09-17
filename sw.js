// Voltman offline cache.
// Strategy: the app shell is served from cache when the network is unavailable, so a
// quote can be built in a basement with no signal. When online the network wins, so a
// new deploy is picked up immediately. Google APIs are never cached — stale sync data
// or a cached auth response would be worse than a clean failure.
const CACHE = "voltman-v1";
const SHELL = [
  "./",
  "./index.html",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // A missing CDN must not abort the whole install, so each entry is added on its own.
      Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const BYPASS = /googleapis\.com|google\.com|gstatic\.com|generativelanguage|accounts\.google/;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (BYPASS.test(req.url)) return;                 // auth, Drive, Gemini: always live

  const isPage = req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isPage) {
    // Network first: a fresh deploy should show up as soon as there is signal.
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Everything else (the PDF library): cache first, it never changes.
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit)
    )
  );
});
