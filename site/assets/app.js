// Sito Biasola Rivalta Calcio: legge i dati raccolti in data/*.json e li mostra.

const LOGO = `<svg viewBox="0 0 48 56" aria-hidden="true"><path d="M24 2 44 9v18c0 13-9 22-20 27C13 49 4 40 4 27V9Z" fill="#141414" stroke="#e8741c" stroke-width="3"/><path d="M24 8 38 13v14c0 9-6 16-14 20-8-4-14-11-14-20V13Z" fill="#7a1f2b"/><path d="M10 26h28v6H10z" fill="#e8741c"/><text x="24" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="11" fill="#fff">BR</text></svg>`;
const IG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>`;
const TIPI = { societa: "Biasola", campionato: "Campionato", ufficiale: "Comunicato FIGC" };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const noi = (nome) => /biasola/i.test(nome || "");

function dataIt(iso, conOra = false) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  if (isNaN(d)) return "";
  const opt = { day: "numeric", month: "short", year: "numeric" };
  if (conOra) Object.assign(opt, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("it-IT", opt);
}

async function carica(nome) {
  try {
    const r = await fetch(`data/${nome}.json`, { cache: "no-cache" });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

function layout(pagina, squadre) {
  const links = [["index.html", "Home", "home"]]
    .concat(squadre.map((s) => [`squadra.html?id=${s.id}`, s.nome, s.id]))
    .concat([["societa.html", "Società", "societa"]]);
  document.querySelector("header").innerHTML = `
    <div class="top"><div class="top-inner">
      <a class="brand" href="index.html">${LOGO}<span><b>Biasola Rivalta Calcio</b><small>Rivalta · Reggio Emilia</small></span></a>
      <nav>${links.map(([h, t, id]) => `<a href="${h}"${id === pagina ? ' aria-current="page"' : ""}>${esc(t)}</a>`).join("")}</nav>
    </div></div>`;
}

function footer(stato) {
  const f = document.querySelector("footer");
  if (!stato) { f.textContent = "Biasola Rivalta Calcio"; return; }
  const fonti = Object.entries(stato.fonti || {});
  f.innerHTML = `Biasola-Rivalta Calcio A.P.S. · Notizie raccolte automaticamente dal web, i diritti restano alle fonti originali.
    <br>Ultimo aggiornamento: ${dataIt(stato.ultimo_aggiornamento, true)}
    <details><summary>Stato delle fonti</summary><ul>${fonti.map(([n, s]) => `<li>${s.ok ? "✅" : "⚠️"} ${esc(n)}${s.ok ? "" : " (non raggiungibile in questo aggiornamento)"}</li>`).join("")}</ul></details>`;
}

function listaNews(el, news, filtroIniziale = "tutte") {
  const filtri = [["tutte", "Tutte"], ["societa", "Biasola"], ["campionato", "Campionato"], ["ufficiale", "Comunicati FIGC"]];
  let attivo = filtroIniziale, quante = 15;
  const render = () => {
    const sel = news.filter((n) => attivo === "tutte" || n.tipo === attivo);
    el.innerHTML = `
      <div class="filtri">${filtri.map(([k, t]) => `<button data-f="${k}" aria-pressed="${k === attivo}">${t}</button>`).join("")}</div>
      ${sel.length ? `<ul class="news">${sel.slice(0, quante).map(voceNews).join("")}</ul>` : `<p class="vuoto">Nessuna notizia per ora: la raccolta automatica gira ogni giorno.</p>`}
      ${sel.length > quante ? `<div class="filtri" style="margin-top:12px"><button data-altre>Mostra altre</button></div>` : ""}`;
    el.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { attivo = b.dataset.f; quante = 15; render(); });
    const altre = el.querySelector("[data-altre]");
    if (altre) altre.onclick = () => { quante += 15; render(); };
  };
  render();
}

function voceNews(n) {
  const righe = n.righe?.length
    ? `<details><summary>Righe del comunicato (${n.righe.length})</summary><ul>${n.righe.map((r) => `<li>${r.sezione ? `<b>${esc(r.sezione)}:</b> ` : ""}${esc(r.testo)}</li>`).join("")}</ul></details>`
    : "";
  return `<li>
    <a class="t" href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.titolo)}</a>
    <div class="meta"><span class="tag ${esc(n.tipo)}">${TIPI[n.tipo] || esc(n.tipo)}</span><span>${esc(n.fonte)}</span><span>${dataIt(n.data)}</span></div>
    ${n.estratto && !n.righe ? `<p class="estr">${esc(n.estratto)}</p>` : ""}${righe}
  </li>`;
}

function partitaBox(p, etichetta) {
  if (!p) return "";
  return `<div class="label">${etichetta}</div>
    <div class="match"><div class="sq">${esc(p.casa)}</div><div class="score">${p.risultato ? esc(p.risultato) : "vs"}</div><div class="sq">${esc(p.ospite)}</div></div>
    <div class="match-info">${p.giornata ? `${p.giornata}ª giornata · ` : ""}${dataIt(p.data)}</div>`;
}

function ultimaProssima(partite) {
  const giocate = partite.filter((p) => p.risultato);
  const oggi = new Date().toISOString().slice(0, 10);
  const future = partite.filter((p) => !p.risultato && (!p.data || p.data >= oggi));
  return [giocate.at(-1), future[0]];
}

function classificaTab(cl) {
  if (!cl?.length) return `<p class="vuoto">Classifica non ancora disponibile.</p>`;
  return `<div class="table-wrap"><table><thead><tr><th class="n">#</th><th>Squadra</th><th class="n">Pt</th><th class="n">G</th></tr></thead><tbody>
    ${cl.map((r) => `<tr class="${r.noi || noi(r.squadra) ? "noi" : ""}"><td class="n">${r.pos}</td><td>${esc(r.squadra)}</td><td class="n">${r.punti}</td><td class="n">${r.giocate}</td></tr>`).join("")}
  </tbody></table></div>`;
}

function calendarioTab(partite) {
  if (!partite?.length) return `<p class="vuoto">Calendario non ancora disponibile.</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>G.</th><th>Data</th><th>Partita</th><th class="n">Ris.</th><th></th></tr></thead><tbody>
    ${partite.map((p) => `<tr><td>${p.giornata ?? ""}</td><td>${dataIt(p.data)}</td><td>${esc(p.casa)} – ${esc(p.ospite)}</td><td class="n">${esc(p.risultato || "")}</td><td>${p.esito ? `<span class="esito ${p.esito}">${p.esito}</span>` : ""}</td></tr>`).join("")}
  </tbody></table></div>`;
}

function instagram(url) {
  return `<a class="ig" href="${esc(url)}" target="_blank" rel="noopener">${IG}<span>Foto e video su Instagram<br><small style="font-weight:500">@biasola_rivalta_calcio</small></span></a>`;
}

async function avvia() {
  const pagina = document.body.dataset.page;
  const [dati, news, stato] = await Promise.all([carica("squadre"), carica("news"), carica("stato")]);
  const squadre = dati?.squadre || [];
  const soc = dati?.societa || {};
  layout(pagina === "squadra" ? new URLSearchParams(location.search).get("id") : pagina, squadre);
  footer(stato);
  const $ = (id) => document.getElementById(id);

  if (pagina === "home") {
    const prima = squadre[0];
    if (prima) {
      const [ultima, prossima] = ultimaProssima(prima.partite || []);
      $("partite").innerHTML = `<h2>${esc(prima.nome)}</h2>${partitaBox(ultima, "Ultima partita") || ""}
        ${prossima ? `<div class="prossima">${partitaBox(prossima, "Prossima partita")}</div>` : ""}
        ${!ultima && !prossima ? `<p class="vuoto">Partite non ancora disponibili.</p>` : ""}`;
      $("classifica").innerHTML = `<h2>Classifica</h2><p class="vuoto" style="margin-top:-6px">${esc(prima.campionato)}</p>${classificaTab(prima.classifica)}`;
    }
    $("squadre").innerHTML = squadre.map((s) => `<a class="squadra-card" href="squadra.html?id=${s.id}"><b>${esc(s.nome)}</b><span>${esc(s.campionato)}</span>${s.da_confermare ? `<div class="avviso">Stagione in corso da confermare</div>` : ""}</a>`).join("");
    $("ig").innerHTML = instagram(soc.instagram || "https://www.instagram.com/biasola_rivalta_calcio/");
    listaNews($("news"), news || []);
  }

  if (pagina === "squadra") {
    const id = new URLSearchParams(location.search).get("id");
    const s = squadre.find((x) => x.id === id) || squadre[0];
    if (!s) return;
    document.title = `${s.nome} · Biasola Rivalta Calcio`;
    $("titolo").textContent = s.nome;
    $("sottotitolo").textContent = s.campionato + (s.allenatore ? ` · Allenatore: ${s.allenatore}` : "");
    const [ultima, prossima] = ultimaProssima(s.partite || []);
    $("partite").innerHTML = `<h2>Partite</h2>${partitaBox(ultima, "Ultima partita")}${prossima ? `<div class="prossima">${partitaBox(prossima, "Prossima partita")}</div>` : ""}`;
    $("classifica").innerHTML = `<h2>Classifica</h2>${classificaTab(s.classifica)}`;
    $("calendario").innerHTML = `<h2>Calendario e risultati</h2>${calendarioTab(s.partite)}`;
    const mie = (news || []).filter((n) => n.squadra === s.id || (!n.squadra && n.tipo === "societa" && s === squadre[0]));
    listaNews($("news"), mie);
    $("fonti").innerHTML = `<h2>Approfondisci</h2><ul>${(s.link || []).map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(new URL(u).hostname.replace("www.", ""))}</a></li>`).join("")}</ul>`;
  }

  if (pagina === "societa") {
    $("info").innerHTML = `<h2>La società</h2><dl>
      <dt>Nome</dt><dd>${esc(soc.nome_esteso)}</dd>
      <dt>Fondata</dt><dd>${esc(soc.fondazione)}</dd>
      <dt>Colori</dt><dd>${esc(soc.colori)}</dd>
      <dt>Presidente</dt><dd>${esc(soc.presidente)}</dd>
      <dt>Sede</dt><dd>${esc(soc.sede)}</dd>
      <dt>Campo</dt><dd>${esc(soc.campo)}</dd></dl>`;
    $("squadre").innerHTML = `<h2>Le nostre squadre</h2><ul>${squadre.map((s) => `<li><a href="squadra.html?id=${s.id}">${esc(s.nome)}</a>: ${esc(s.campionato)}</li>`).join("")}</ul>`;
    $("ig").innerHTML = instagram(soc.instagram || "https://www.instagram.com/biasola_rivalta_calcio/");
  }
}

avvia();
