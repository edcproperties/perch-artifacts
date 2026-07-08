/* CSI division classifier — POST {input: "<url or pasted text>"}.
   Fetches the company site server-side (dodges CORS), keyword-scores the text
   against per-division trade lexicons, returns ranked divisions + evidence.
   No AI, no keys — deterministic and explainable ("because their site says X").
   If input isn't URL-shaped, it's classified as raw text (fallback for
   JS-rendered sites the fetch can't read). */

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" };

// division -> {s: strong terms (x3), w: weak terms (x1)}. Phrases match as substrings on
// lowercased text; single words match on word boundaries.
const LEX = {
  "02": { s: ["demolition", "abatement", "asbestos", "site remediation"], w: ["demo work", "hazardous material", "tear-down"] },
  "03": { s: ["concrete", "flatwork", "precast", "rebar", "formwork", "foundations"], w: ["footings", "slab", "curb and gutter", "cement", "shotcrete"] },
  "04": { s: ["masonry", "brick", "cmu", "stone mason", "block wall"], w: ["veneer", "mortar", "manufactured stone"] },
  "05": { s: ["structural steel", "steel fabrication", "metal fabrication", "stainless steel", "misc metals", "steel erection", "ornamental iron"], w: ["welding", "handrail", "railings", "fabricator", "metal work"] },
  "06": { s: ["millwork", "casework", "finish carpentry", "cabinetry", "architectural woodwork"], w: ["carpentry", "cabinets", "trim work", "woodwork", "framing"] },
  "07": { s: ["roofing", "waterproofing", "membrane roof", "dampproofing", "spray foam", "insulation contractor"], w: ["roof repair", "flashing", "sealants", "caulking", "siding", "rain gutter", "shingle"] },
  "08": { s: ["glazing", "storefront", "curtain wall", "overhead door", "hollow metal"], w: ["glass", "windows", "doors", "garage door", "skylight", "door hardware"] },
  "09": { s: ["drywall", "gypsum", "painting contractor", "flooring", "acoustical", "plastering", "stucco", "epoxy floor"], w: ["paint", "tile", "ceilings", "carpet", "lvp", "polished concrete", "wallcovering"] },
  "10": { s: ["signage", "toilet partitions", "lockers", "wall protection"], w: ["signs", "awnings", "canopies", "flagpole"] },
  "11": { s: ["foodservice equipment", "commercial kitchen", "restaurant equipment", "kitchen equipment", "laboratory equipment"], w: ["food service", "walk-in cooler", "walk-in freezer", "exhaust hood", "equipment package", "restaurant contractor"] },
  "12": { s: ["furnishings", "window treatments", "systems furniture"], w: ["furniture", "countertops", "casegoods", "blinds", "shades"] },
  "13": { s: ["pre-engineered metal building", "metal buildings", "swimming pool", "clean room", "cold storage construction"], w: ["pool construction", "dome", "greenhouse", "fountain"] },
  "14": { s: ["elevator", "escalator", "wheelchair lift"], w: ["conveying", "dumbwaiter", "vertical transportation"] },
  "21": { s: ["fire sprinkler", "fire protection", "fire suppression"], w: ["sprinkler system", "standpipe", "fire pump", "nfpa 13"] },
  "22": { s: ["plumbing", "plumber", "hydronic piping", "medical gas"], w: ["water heater", "drain cleaning", "backflow", "fixtures", "repipe"] },
  "23": { s: ["hvac", "mechanical contractor", "air conditioning", "heating and cooling", "ductwork", "boiler", "chiller", "refrigeration"], w: ["furnace", "heat pump", "sheet metal", "kitchen hood", "exhaust", "vrf", "rooftop unit", "radiant heat"] },
  "25": { s: ["building automation", "energy management system", "controls contractor"], w: ["bas", "bms", "ddc controls", "smart building"] },
  "26": { s: ["electrical contractor", "electrician", "electrical construction", "solar installation"], w: ["wiring", "lighting", "panel upgrade", "generator", "ev charger", "photovoltaic", "switchgear"] },
  "27": { s: ["structured cabling", "low voltage", "data cabling", "fiber optic", "telecommunications contractor"], w: ["cat6", "network cabling", "audio visual", "av integration", "distributed antenna"] },
  "28": { s: ["fire alarm", "access control", "security systems", "video surveillance"], w: ["cctv", "intrusion detection", "card access", "life safety systems"] },
  "31": { s: ["excavation", "earthwork", "grading", "sitework", "shoring", "piling"], w: ["site work", "trenching", "mass excavation", "soil nail", "micropile", "site prep", "land clearing"] },
  "32": { s: ["asphalt paving", "paving contractor", "landscaping", "landscape construction", "irrigation"], w: ["paving", "asphalt", "hardscape", "striping", "seal coat", "fencing", "retaining wall", "sports field", "playground"] },
  "33": { s: ["underground utilities", "wet utilities", "sanitary sewer", "storm drain", "water line", "pipeline construction"], w: ["sewer", "waterline", "utility contractor", "directional drilling", "manhole"] },
  "40": { s: ["process piping", "industrial piping", "industrial process"], w: ["pipe fabrication", "skid fabrication", "orbital welding"] },
  "42": { s: ["industrial boiler", "process steam", "industrial refrigeration"], w: ["ammonia refrigeration", "process cooling"] },
  "48": { s: ["power generation", "cogeneration", "power plant construction"], w: ["substation", "battery storage", "microgrid"] },
};

const PRIVATE_HOST = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|\[?::1)/i;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function fetchText(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: ctl.signal });
    if (!r.ok) return "";
    return (await r.text()).slice(0, 300_000);
  } catch { return ""; }
  finally { clearTimeout(t); }
}

const strip = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").toLowerCase();

// headline text gets a 2x bonus — a trade named in the <title>/h1 is who they ARE
function headline(html) {
  const parts = [];
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); if (t) parts.push(t[1]);
  const d = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i); if (d) parts.push(d[1]);
  for (const m of html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)) parts.push(m[1]);
  return strip(parts.join(" "));
}

function hits(text, term) {
  if (term.includes(" ") || term.includes("-")) {
    let n = 0, i = -1;
    while ((i = text.indexOf(term, i + 1)) !== -1 && n < 3) n++;
    return n;
  }
  const m = text.match(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"));
  return Math.min(m ? m.length : 0, 3);
}

// company intel off the raw HTML we already fetched — phones/emails on the site,
// bid-platform links (fit-to-pay), founded year, commercial-vs-residential lean,
// and a "they run a subs/plan-room page" GC-side signal. All deterministic.
const PLATS = {
  buildingconnected: /buildingconnected\.com|bcassets/i,
  procore: /procore\.com/i,
  smartbid: /smartbidnet|constructconnect\.com/i,
  planhub: /planhub\.com/i,
  isqft: /isqft\.com/i,
};
function intel(rawAll, bodyText) {
  const phones = [];
  for (const m of rawAll.matchAll(/href=["']tel:([^"']+)/gi)) {
    let d = m[1].replace(/\D/g, ""); if (d.length === 11 && d[0] === "1") d = d.slice(1);
    if (d.length === 10 && !phones.includes(d)) phones.push(d);
  }
  for (const m of rawAll.matchAll(/\(?([2-9]\d{2})\)?[\s.–-]{0,2}(\d{3})[\s.–-]{1,2}(\d{4})\b/g)) {
    const d = m[1] + m[2] + m[3];
    if (!phones.includes(d) && phones.length < 4) phones.push(d);
  }
  const emails = [];
  for (const m of rawAll.matchAll(/mailto:([^"'?&\s]+)/gi)) {
    let e = m[1].toLowerCase();
    try { e = decodeURIComponent(e); } catch { /* keep raw */ }
    e = e.trim();
    if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e) && !emails.includes(e) && emails.length < 3) emails.push(e);
  }
  const platforms = Object.keys(PLATS).filter((k) => PLATS[k].test(rawAll));
  const founded = (rawAll.match(/\b(?:since|established|est\.?|founded)\s*(?:in\s*)?((?:19|20)\d\d)/i) || [])[1] || null;
  const com = (bodyText.match(/\bcommercial\b/g) || []).length;
  const res = (bodyText.match(/\bresidential\b/g) || []).length;
  const gcSignal = /(subcontractor|trade[- ]partners?|plan\s?room|invitation to bid|current bids|bid opportunities)/i.test(rawAll);
  return { phones: phones.slice(0, 4), emails, platforms, founded, mix: { commercial: com, residential: res }, gcSignal };
}

function score(body, head) {
  const out = [];
  for (const [div, lex] of Object.entries(LEX)) {
    let s = 0; const ev = [];
    for (const t of lex.s) { const n = hits(body, t) + hits(head, t) * 2; if (n) { s += 3 * n; ev.push(t); } }
    for (const t of lex.w) { const n = hits(body, t) + hits(head, t) * 2; if (n) { s += n; ev.push(t); } }
    if (s) out.push({ div, score: s, evidence: ev.slice(0, 8) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 4);
}

export async function onRequestPost({ request }) {
  let input = "";
  try { input = ((await request.json()).input || "").trim(); } catch { /* fall through */ }
  if (!input) return json({ error: "paste a website URL or a description" }, 400);

  // raw-text mode: not URL-shaped -> classify the pasted words directly
  const urlish = !/\s/.test(input) && input.includes(".");
  if (!urlish) {
    const text = input.toLowerCase();
    const top = score(text, text);
    return json({ mode: "text", fetched: false, top });
  }

  let url = input;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  let host;
  try { host = new URL(url).hostname; } catch { return json({ error: "that doesn't look like a valid URL" }, 400); }
  if (PRIVATE_HOST.test(host)) return json({ error: "not a public website" }, 400);

  let html = await fetchText(url);
  if (!html && url.startsWith("https://")) html = await fetchText(url.replace("https://", "http://"));
  if (!html) return json({ mode: "url", fetched: false, top: [], error: "couldn't reach the site — paste a sentence about what they do instead" });

  // follow up to 2 self-describing subpages (about/services/capabilities)
  const pages = ["/"];
  const links = [...html.matchAll(/href=["']([^"'#?]+)/gi)].map((m) => m[1]);
  const want = /(about|service|capabilit|what-we-do|products|fabricat|division|specialt|portfolio|markets|contact)/i;
  const seen = new Set(["/"]);
  let extra = "", rawExtra = "";
  for (const href of links) {
    if (pages.length >= 3) break;
    let p; try { p = new URL(href, url); } catch { continue; }
    if (p.hostname !== host || !want.test(p.pathname) || seen.has(p.pathname)) continue;
    if (/\.(css|js|png|jpe?g|svg|webp|gif|pdf|ico|xml|json|woff2?)$/i.test(p.pathname)) continue;
    seen.add(p.pathname);
    const h = await fetchText(p.href);
    if (h) { extra += " " + strip(h); rawExtra += " " + h; pages.push(p.pathname); }
  }

  const body = strip(html) + extra;
  const head = headline(html);
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ""])[1].replace(/\s+/g, " ").trim().slice(0, 120);
  return json({ mode: "url", fetched: true, title, pages, top: score(body, head), intel: intel(html + rawExtra, body) });
}
