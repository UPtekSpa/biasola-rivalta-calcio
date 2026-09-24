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

function layout(pagina, squadre, conFoto) {
  const links = [["index.html", "Home", "home"], ["notizie.html", "Notizie", "notizie"]]
    .concat(conFoto ? [["foto.html", "Foto", "foto"]] : [])
    .concat(squadre.map((s) => [`squadra.html?id=${s.id}`, s.nome, s.id]))
    .concat([["societa.html", "Società", "societa"]]);
  const header = document.querySelector("header");
  header.innerHTML = `
    <div class="top"><div class="top-inner">
      <a class="brand" href="index.html"><img src="assets/stemma.png" alt=""><span><b>Biasola Rivalta</b><small>Calcio · Reggio Emilia</small></span></a>
      <button class="menu-btn" aria-label="Apri il menu" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
      <nav>${links.map(([h, t, id]) => `<a href="${h}"${id === pagina ? ' aria-current="page"' : ""}>${esc(t)}</a>`).join("")}</nav>
    </div></div>`;
  const btn = header.querySelector(".menu-btn"), nav = header.querySelector("nav");
  btn.onclick = () => btn.setAttribute("aria-expanded", nav.classList.toggle("aperto"));
}

function footer(stato, soc, squadre) {
  const f = document.querySelector("footer");
  f.className = "ricco";
  const fonti = Object.entries(stato?.fonti || {});
  f.innerHTML = `
    <div class="footer-inner">
      <div class="footer-brand"><img src="assets/stemma.png" alt="">
        <div><h3>${esc(soc.nome_esteso || "Biasola-Rivalta Calcio A.P.S.")}</h3>
        <p>${esc(soc.sede || "")}<br>Campo: ${esc(soc.campo || "")}<br>Colori: ${esc(soc.colori || "")}</p></div></div>
      <div><h3>Squadre</h3><ul>${squadre.map((s) => `<li><a href="squadra.html?id=${s.id}">${esc(s.nome)}</a></li>`).join("")}</ul></div>
      <div><h3>Seguici</h3><ul>
        <li><a href="${esc(soc.instagram || "https://www.instagram.com/biasola_rivalta_calcio/")}" target="_blank" rel="noopener">Instagram</a></li>
        <li><a href="notizie.html">Tutte le notizie</a></li>
        <li><a href="societa.html">La società</a></li></ul></div>
    </div>
    <div class="footer-legal">Notizie raccolte automaticamente dal web: i diritti restano alle fonti originali.
      ${stato ? `Ultimo aggiornamento: ${dataIt(stato.ultimo_aggiornamento, true)}.` : ""}
      ${fonti.length ? `<details><summary>Stato delle fonti</summary><ul>${fonti.map(([n, s]) => `<li>${s.ok ? "✅" : "⚠️"} ${esc(n)}${s.ok ? "" : " (non raggiungibile in questo aggiornamento)"}</li>`).join("")}</ul></details>` : ""}
    </div>`;
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
    ? `<details><summary>Righe del comunicato (${n.righe.length})</summary><ul>${n.righe.map((r) => `<li>${esc(r.testo)}</li>`).join("")}</ul></details>`
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
  const v = (r, i) => r.valori?.[i] ?? "";
  return `<div class="table-wrap"><table><thead><tr><th class="n">#</th><th>Squadra</th><th class="n">Pt</th><th class="n">G</th><th class="n">V</th><th class="n">N</th><th class="n">P</th><th class="n">DR</th></tr></thead><tbody>
    ${cl.map((r) => `<tr class="${r.noi || noi(r.squadra) ? "noi" : ""}"><td class="n">${r.pos}</td><td>${esc(r.squadra)}</td><td class="n"><b>${r.punti}</b></td><td class="n">${r.giocate}</td><td class="n">${v(r, 2)}</td><td class="n">${v(r, 3)}</td><td class="n">${v(r, 4)}</td><td class="n">${v(r, 7)}</td></tr>`).join("")}
  </tbody></table></div>`;
}

function giornataTab(girone) {
  const giocate = (girone || []).filter((p) => p.risultato && p.giornata);
  if (!giocate.length) return "";
  const g = Math.max(...giocate.map((p) => p.giornata));
  const righe = girone.filter((p) => p.giornata === g);
  return `<h2>Risultati ${g}ª giornata</h2><div class="table-wrap"><table><tbody>
    ${righe.map((p) => `<tr class="${p.noi ? "noi" : ""}"><td>${esc(p.casa)}</td><td class="n"><b>${esc(p.risultato || "-")}</b></td><td>${esc(p.ospite)}</td></tr>`).join("")}
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
  const [dati, news, stato, album] = await Promise.all([carica("squadre"), carica("news"), carica("stato"), carica("foto")]);
  const foto = album?.foto || [];
  const squadre = dati?.squadre || [];
  const soc = dati?.societa || {};
  layout(pagina === "squadra" ? new URLSearchParams(location.search).get("id") : pagina, squadre, foto.length > 0);
  footer(stato, soc, squadre);
  const $ = (id) => document.getElementById(id);

  if (pagina === "home") renderHome(squadre, news || []);

  if (pagina === "notizie") listaNews($("news"), news || []);

  if (pagina === "foto") {
    $("galleria").innerHTML = foto.length ? galleria(foto) : `<p class="vuoto">Le foto arriveranno presto. Nel frattempo le trovi su Instagram.</p>`;
    attivaLightbox($("galleria"), foto);
  }

  if (pagina === "home" && foto.length) {
    const sez = $("foto-home");
    sez.hidden = false;
    sez.querySelector(".galleria").innerHTML = galleria(foto.slice(0, 6));
    attivaLightbox(sez, foto.slice(0, 6));
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
    const gt = giornataTab(s.girone);
    $("giornata").innerHTML = gt;
    $("giornata").hidden = !gt;
    const mie = (news || []).filter((n) => n.squadra === s.id || n.tipo === "ufficiale" || (!n.squadra && n.tipo === "societa" && s === squadre[0]));
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

function galleria(foto) {
  return foto.map((f, i) => `<button class="foto" data-i="${i}" aria-label="Apri foto: ${esc(f.didascalia || "")}">
      <img src="${esc(f.miniatura || f.src)}" alt="${esc(f.didascalia || "Foto Biasola Rivalta Calcio")}" loading="lazy">
      ${f.didascalia ? `<span>${esc(f.didascalia)}</span>` : ""}</button>`).join("");
}

function attivaLightbox(contenitore, foto) {
  let dlg = document.getElementById("lightbox");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "lightbox";
    dlg.innerHTML = `<button class="lb-chiudi" aria-label="Chiudi">×</button><button class="lb-prec" aria-label="Foto precedente">‹</button><figure><img alt=""><figcaption></figcaption></figure><button class="lb-succ" aria-label="Foto successiva">›</button>`;
    document.body.append(dlg);
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  }
  let i = 0;
  const mostra = (n) => {
    i = (n + foto.length) % foto.length;
    const f = foto[i];
    dlg.querySelector("img").src = f.src;
    dlg.querySelector("img").alt = f.didascalia || "";
    dlg.querySelector("figcaption").innerHTML = [esc(f.didascalia), f.data ? dataIt(f.data) : "", f.link ? `<a href="${esc(f.link)}" target="_blank" rel="noopener">Vedi su Instagram</a>` : ""].filter(Boolean).join(" · ");
  };
  contenitore.addEventListener("click", (e) => {
    const b = e.target.closest(".foto");
    if (!b) return;
    dlg.querySelector(".lb-chiudi").onclick = () => dlg.close();
    dlg.querySelector(".lb-prec").onclick = () => mostra(i - 1);
    dlg.querySelector(".lb-succ").onclick = () => mostra(i + 1);
    dlg.onkeydown = (ev) => { if (ev.key === "ArrowLeft") mostra(i - 1); if (ev.key === "ArrowRight") mostra(i + 1); };
    mostra(Number(b.dataset.i));
    dlg.showModal();
  });
}

function giorniA(iso) {
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  return Math.round((new Date(iso + "T00:00:00") - oggi) / 86400000);
}

function renderHome(squadre, news) {
  const $ = (id) => document.getElementById(id);
  const prima = squadre[0];
  if (!prima) return;
  const [ultima, prossima] = ultimaProssima(prima.partite || []);

  // copertina: prossima partita con conto alla rovescia
  let hero = `<div class="label">${prossima ? "Prossima partita" : "Ultima partita"}</div>`;
  const p = prossima || ultima;
  if (p) {
    hero += `<div class="mh-squadre"><b class="${noi(p.casa) ? "noi" : ""}">${esc(p.casa)}</b><span class="mh-vs">${p.risultato ? esc(p.risultato) : "VS"}</span><b class="${noi(p.ospite) ? "noi" : ""}">${esc(p.ospite)}</b></div>
      <div class="mh-quando">${esc(prima.campionato)}${p.giornata ? ` · ${p.giornata}ª giornata` : ""}<br>${p.data ? new Date(p.data + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }) : ""}</div>`;
    if (prossima?.data) {
      const g = giorniA(prossima.data);
      hero += g <= 0
        ? `<div class="countdown"><div><b>OGGI</b><small>si gioca</small></div></div>`
        : `<div class="countdown"><div><b>${g}</b><small>${g === 1 ? "giorno" : "giorni"}</small></div></div>`;
    }
    if (prossima && ultima) {
      hero += `<div class="mh-ultima"><span>Ultima: ${esc(ultima.casa)} – ${esc(ultima.ospite)}</span><span><b>${esc(ultima.risultato)}</b> ${ultima.esito ? `<span class="esito ${ultima.esito}">${ultima.esito}</span>` : ""}</span></div>`;
    }
  } else {
    hero += `<p class="vuoto">Il calendario arriverà con il prossimo aggiornamento.</p>`;
  }
  $("match-hero").innerHTML = hero;

  // numeri della stagione
  const riga = (prima.classifica || []).find((r) => r.noi || noi(r.squadra));
  const giocate = (prima.partite || []).filter((x) => x.esito);
  const forma = giocate.slice(-5);
  const gol = giocate.reduce((t, x) => {
    const [a, b] = x.risultato.split("-").map(Number);
    return t + (noi(x.casa) ? a : b);
  }, 0);
  $("numeri").innerHTML = `
    <div class="numero"><b>${riga ? `${riga.pos}°` : "–"}</b><span>posto in classifica</span></div>
    <div class="numero"><b>${riga ? riga.punti : "–"}</b><span>punti in ${riga ? riga.giocate : 0} partite</span></div>
    <div class="numero"><div class="forma">${forma.length ? forma.map((x) => `<span class="esito ${x.esito}">${x.esito}</span>`).join("") : "<b>–</b>"}</div><span>ultimi risultati</span></div>
    <div class="numero"><b>${gol}</b><span>gol segnati in campionato</span></div>`;

  // notizie in evidenza: la più recente di ogni tipo, poi le altre
  const scelte = [];
  for (const tipo of ["societa", "campionato", "ufficiale"]) {
    const n = news.find((x) => x.tipo === tipo);
    if (n) scelte.push(n);
  }
  for (const n of news) if (scelte.length < 3 && !scelte.includes(n)) scelte.push(n);
  scelte.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  $("news-evidenza").innerHTML = scelte.length ? scelte.map((n) => `
    <a class="news-card" href="${esc(n.link)}" target="_blank" rel="noopener">
      <div class="fascia ${esc(n.tipo)}"><span>${TIPI[n.tipo] || esc(n.tipo)}</span></div>
      <div class="corpo"><b>${esc(n.titolo)}</b>${n.estratto ? `<p>${esc(n.estratto)}</p>` : ""}<small>${esc(n.fonte)} · ${dataIt(n.data)}</small></div>
    </a>`).join("") : `<p class="vuoto">Nessuna notizia per ora.</p>`;

  $("classifica").innerHTML = `<h2>Classifica</h2><p class="vuoto" style="margin-top:-6px">${esc(prima.campionato)}</p>${classificaTab(prima.classifica)}`;
  const gt = giornataTab(prima.girone);
  $("giornata").innerHTML = gt || `<h2>Risultati</h2><p class="vuoto">I risultati arriveranno con il prossimo aggiornamento.</p>`;

  $("squadre").innerHTML = squadre.map((s, i) => `
    <a class="squadra-grande" href="squadra.html?id=${s.id}"><span class="num">${{ "prima-squadra": "1ª", juniores: "U19" }[s.id] || ""}</span>
      <b>${esc(s.nome)}</b><span>${esc(s.campionato)}</span><em>Partite e classifica →</em></a>`).join("");
}

avvia();
