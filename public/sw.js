// Service worker do caixa: deixa a tela do caixa abrir mesmo sem internet.
// - Tela /caixa: tenta a rede; sem rede, usa a última cópia guardada.
// - Arquivos do app (/_next/static): guarda na primeira vez e reaproveita (o nome muda a cada versão).
// - Todo o resto (dados, ações): vai direto para a rede. Os dados offline ficam no IndexedDB, não aqui.

const VERSAO = "caixa-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.tipo === "guardar" && Array.isArray(e.data.urls)) {
    e.waitUntil(
      caches.open(VERSAO).then((c) =>
        Promise.all(
          e.data.urls
            .filter((u) => new URL(u, self.location.origin).origin === self.location.origin)
            .map((u) => c.match(u).then((ja) => ja || fetch(u, { credentials: "same-origin" }).then((r) => (r.ok ? c.put(u, r) : null)).catch(() => null))),
        ),
      ),
    );
  }
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.open(VERSAO).then((c) =>
        c.match(req).then((ja) => ja || fetch(req).then((r) => { if (r.ok) { const copia = r.clone(); c.put(req, copia); } return r; })),
      ),
    );
    return;
  }

  if (req.mode === "navigate" && url.pathname === "/caixa") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          // Só guarda a tela de verdade (não o redirecionamento para login ou abertura de turno).
          if (r.ok && !r.redirected) {
            const copia = r.clone();
            caches.open(VERSAO).then((c) => c.put("/caixa", copia));
          }
          return r;
        })
        .catch(() => caches.open(VERSAO).then((c) => c.match("/caixa")).then((r) => r || Response.error())),
    );
  }
});
