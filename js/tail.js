/* TAIL — Ultramarine Broadsheet. Renders the desk from data/fund.json and wires
   the motion: scroll reveals, count-up numerals, dossier <dialog>, card tilt,
   the consensus constellation, and click-to-copy. Data layer is untouched. */
const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nice = (s) => esc(s).replace(/\b([A-Z]{2,})\b/g, (m) => m[0] + m.slice(1).toLowerCase());
const initials = (n) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const money = (v) => !v ? "—" : v >= 1e9 ? "$" + (v / 1e9).toFixed(v >= 1e11 ? 0 : 1) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(0) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(0) + "K" : "$" + Math.round(v);
const bigMoney = (v) => v >= 100e9 ? "$" + (v / 1e9).toFixed(0) + "B" : v >= 1e9 ? "$" + (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(0) + "M" : "$" + Math.round(v);
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const HOVER = matchMedia("(hover:hover) and (pointer:fine)").matches;

let DATA = null;
const rowByCusip = new Map();       // consensus cusip -> <tr>
const traderShares = new Map();     // trader name -> [cusip,...] it holds among consensus

async function main() {
  try { DATA = await (await fetch("data/fund.json", { cache: "no-store" })).json(); }
  catch { $("#deskGrid").innerHTML = '<p class="awaiting">Could not load the desk.</p>'; return; }

  const traders = DATA.traders || [], consensus = DATA.consensus || [];
  const withBook = traders.filter((t) => t.top && t.top.length);
  const biggest = withBook.flatMap((t) => t.top.map((h) => ({ ...h, who: t.name }))).sort((a, b) => b.value - a.value)[0];

  $("#rosterLine").textContent = traders.map((t) => t.name).join(" · ");
  $("#updated").textContent = "filings synced " + new Date(DATA.updated).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  // stat ledger
  const tiles = [
    { l: "Book we tail", count: DATA.trackedAUM, fmt: bigMoney, s: "live · combined" },
    { l: "On the desk", count: DATA.deskSize, fmt: (n) => String(Math.round(n)), s: "traders tracked" },
    { l: "Consensus names", count: consensus.length, fmt: (n) => String(Math.round(n)), s: "held by 2+" },
    { l: "Top conviction", name: biggest ? nice(biggest.name).split(" ")[0] : "—", s: biggest ? money(biggest.value) + " · " + biggest.who.split(" ").pop() : "" },
  ];
  const ledger = $("#ledger");
  for (const t of tiles) {
    const cell = el("div", "cell");
    if (t.name != null) cell.innerHTML = `<span class="l">${t.l}</span><span class="v name">${t.name}</span><span class="s">${esc(t.s)}</span>`;
    else { cell.innerHTML = `<span class="l">${t.l}</span><span class="v" data-count="${t.count}">0</span><span class="s">${esc(t.s)}</span>`;
      cell.querySelector("[data-count]")._fmt = t.fmt; }
    ledger.appendChild(cell);
  }

  // ticker
  const items = [];
  for (const c of consensus) items.push(`<span class="t"><b>${nice(c.name).split(" ")[0]}</b> <i>${c.holders.length}× desk</i></span>`);
  for (const t of withBook) items.push(`<span class="t">${esc(t.name.split(" ").pop())} <b>${money(t.portfolioValue)}</b></span>`);
  $("#ticker").innerHTML = items.join("").repeat(2);

  // precompute constellation membership
  consensus.forEach((c) => c.holders.forEach((h) => {
    if (!traderShares.has(h)) traderShares.set(h, []);
    traderShares.get(h).push(c.cusip || c.name);
  }));

  // desk cards
  const grid = $("#deskGrid");
  traders.forEach((t, i) => grid.appendChild(makeCard(t, i)));

  // consensus table
  const tb = $("#consensus");
  consensus.forEach((c) => {
    const tr = el("tr");
    tr.dataset.cusip = c.cusip || c.name;
    tr.innerHTML = `<td class="name">${nice(c.name)}</td><td class="count">${c.holders.length}</td>
      <td><div class="chips">${c.holders.map((h) => `<span class="chip">${esc(h.split(" ").pop())}</span>`).join("")}</div></td>
      <td class="val">${money(c.value)}</td>`;
    tb.appendChild(tr);
    rowByCusip.set(c.cusip || c.name, tr);
  });
  if (!consensus.length) tb.innerHTML = '<tr><td colspan="4">No overlap this cycle.</td></tr>';

  wireReveal();
  wireCopy();
  if (HOVER && !REDUCED) sizeConstellation();
}

function makeCard(t, i) {
  const b = el("button", "card" + (t.pending || t.error ? " pending" : ""));
  b.type = "button";
  b.style.setProperty("--i", (i % 3) + 1);
  b.setAttribute("data-reveal", "");
  b.setAttribute("aria-haspopup", "dialog");
  b.dataset.trader = t.name;
  const head = `<span class="num">${String(i + 1).padStart(2, "0")}</span>
    <span class="brk tr"></span><span class="brk bl"></span>
    <div class="top"><div class="mono-avatar">${initials(t.name)}</div>
      <div class="who"><div class="name">${esc(t.name)}</div><div class="firm">${esc(t.firm)}</div></div>
      <div class="tag">${esc(t.tag || "")}</div></div>
    <div class="blurb">“${esc(t.blurb || "")}”</div>`;

  if (t.pending || t.error) {
    b.innerHTML = head + `<div class="awaiting">AWAITING SIGNAL<span class="el"></span></div>
      <div class="foot"><span class="src">${esc(t.source || "PTR")}</span><span class="open">OPEN ↗</span></div>`;
  } else {
    const max = Math.max(...t.top.map((h) => h.value), 1);
    const holds = t.top.slice(0, 6).map((h, j) => `<div class="hold">
        <div class="r"><span class="nm">${nice(h.name)}</span><span class="vv">${money(h.value)}</span></div>
        <div class="bar" style="--bi:${j}"><i style="width:${Math.max(5, (h.value / max) * 100)}%"></i></div></div>`).join("");
    b.innerHTML = head + `<div class="kpi">
        <div class="k"><span class="l">Book</span><span class="v" data-count="${t.portfolioValue}">$0</span></div>
        <div class="k"><span class="l">Positions</span><span class="v">${t.positions}</span></div>
      </div><div class="holds">${holds}</div>
      <div class="foot"><span class="src">${esc(t.source)} · ${esc(t.asOf || "")}</span><span class="open">OPEN ↗</span></div>`;
    b.querySelector("[data-count]")._fmt = bigMoney;
  }

  b.addEventListener("click", () => openDossier(t, b));
  if (HOVER && !REDUCED) {
    b.addEventListener("mousemove", (e) => tilt(e, b));
    b.addEventListener("mouseleave", () => { b.style.setProperty("--rx", "0deg"); b.style.setProperty("--ry", "0deg"); clearLines(); });
    b.addEventListener("mouseenter", () => drawLines(t.name, b));
  }
  return b;
}

/* ── reveal + count-up ───────────────────────────────────────────────────── */
function wireReveal() {
  const ro = new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting) { e.target.classList.add("in"); ro.unobserve(e.target); }
  }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll("[data-reveal]").forEach((n) => ro.observe(n));
  $("#hero").classList.add("in"); // hero visible on load → fire the TAIL fill immediately

  const co = new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting) { countUp(e.target); co.unobserve(e.target); }
  }, { threshold: 0.4 });
  document.querySelectorAll("[data-count]").forEach((n) => co.observe(n));
}
function countUp(node) {
  const to = Number(node.dataset.count) || 0, fmt = node._fmt || ((n) => String(Math.round(n)));
  if (REDUCED) { node.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 1100, ease = (x) => 1 - Math.pow(1 - x, 3);
  const tick = (now) => { const p = Math.min(1, (now - t0) / dur); node.textContent = fmt(to * ease(p)); if (p < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

/* ── card tilt (desktop) ─────────────────────────────────────────────────── */
let tiltRAF = 0;
function tilt(e, card) {
  const r = card.getBoundingClientRect();
  const dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
  cancelAnimationFrame(tiltRAF);
  tiltRAF = requestAnimationFrame(() => {
    card.style.setProperty("--rx", (dx * 4).toFixed(2) + "deg");
    card.style.setProperty("--ry", (-dy * 4).toFixed(2) + "deg");
  });
}

/* ── constellation ───────────────────────────────────────────────────────── */
const CST = $("#constellation");
function sizeConstellation() {
  const set = () => { CST.style.height = document.documentElement.scrollHeight + "px"; CST.setAttribute("viewBox", `0 0 ${window.innerWidth} ${document.documentElement.scrollHeight}`); CST.setAttribute("preserveAspectRatio", "none"); };
  set(); let raf = 0;
  addEventListener("resize", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(set); });
}
function anchor(node, side) {
  const r = node.getBoundingClientRect(), x = window.scrollX, y = window.scrollY;
  if (side === "bottom") return [r.left + r.width / 2 + x, r.bottom + y];
  return [r.left + x + 8, r.top + r.height / 2 + y];
}
function drawLines(name, card) {
  if (!HOVER || REDUCED || window.innerWidth < 768) return;
  clearLines();
  const shares = traderShares.get(name) || [];
  const [x1, y1] = anchor(card, "bottom");
  for (const cusip of shares) {
    const row = rowByCusip.get(cusip); if (!row) continue;
    const [x2, y2] = anchor(row.querySelector(".name"), "left");
    const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
    ln.setAttribute("x1", x1); ln.setAttribute("y1", y1); ln.setAttribute("x2", x2); ln.setAttribute("y2", y2);
    CST.appendChild(ln);
  }
  if (CST.children.length) CST.classList.add("show");
}
function clearLines() { CST.classList.remove("show"); CST.replaceChildren(); }

/* ── dossier <dialog> ────────────────────────────────────────────────────── */
const DLG = $("#dossier");
let invoker = null;
function openDossier(t, card) {
  invoker = card;
  const pending = t.pending || t.error;
  let ledger = "";
  if (!pending) {
    const max = Math.max(...t.top.map((h) => h.value), 1);
    ledger = `<div class="dledger"><div class="dh"><span>Position</span><span>Value</span></div>
      ${t.top.map((h) => `<div class="drow"><div class="rr"><span class="dn">${nice(h.name)}</span><span class="dv">${money(h.value)}</span></div>
        <div class="dbar"><i style="width:${Math.max(5, (h.value / max) * 100)}%"></i></div></div>`).join("")}</div>
      <div class="dsrc">${esc(t.source)} · as of ${esc(t.asOf || "")} · ${t.positions} positions reported</div>`;
  } else {
    ledger = `<p class="pend">${t.error ? "This filing is temporarily unavailable — it will refresh on the next sync." :
      "Congressional trades are filed as Periodic Transaction Reports (PTRs), which can lag the actual trade by weeks. This dossier lights up the moment the disclosure feed is connected."}</p>`;
  }
  DLG.innerHTML = `<div class="dossier">
    <button class="x" type="button" data-close aria-label="Close dossier">Close ✕</button>
    <div class="inner">
      <p class="dtag">${esc(t.tag || "")} · ${esc(t.firm)}</p>
      <h3 id="dossierName">${esc(t.name)}</h3>
      ${pending ? "" : `<div class="dkpi"><div><div class="l">Book value</div><div class="v">${money(t.portfolioValue)}</div></div>
        <div><div class="l">Positions</div><div class="v">${t.positions}</div></div></div>`}
      <p class="dblurb">“${esc(t.blurb || "")}”</p>
      ${ledger}
    </div></div>`;
  DLG.showModal();
  document.body.style.overflow = "hidden";
  DLG.querySelector("[data-close]").focus();
}
DLG.addEventListener("click", (e) => { if (e.target.closest("[data-close]") || e.target === DLG) DLG.close(); });
DLG.addEventListener("close", () => { document.body.style.overflow = ""; if (invoker) invoker.focus(); invoker = null; });

/* ── copy CA (wired for launch) ──────────────────────────────────────────── */
function wireCopy() {
  const btn = $("#caCopy"), toast = $("#toast");
  btn.addEventListener("click", () => {
    const a = btn.dataset.addr;
    if (!a) { $("#caSoon").textContent = "not live yet — check back at launch"; return; }
    navigator.clipboard?.writeText(a);
    toast.textContent = "Copied ✓ " + a.slice(0, 6) + "…" + a.slice(-4);
    toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 1400);
  });
}

main();
