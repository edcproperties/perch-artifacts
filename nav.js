/* Perch CRO Notebook — shared nav: fixed top bar w/ dropdowns + contextual sidebar.
   Injected on every page via <script src="/nav.js" defer>. Single source of the site map. */
(function () {
  var SITE = [
    {
      id: "competitive", label: "Competitive", href: "/competitive/", sidebar: false, theme: "paper",
      groups: [{ items: [{ label: "Competitive Landscape", href: "/competitive/" }] }]
    },
    {
      id: "sales", label: "Sales & GTM", href: "/sales/", sidebar: false, theme: "paper",
      groups: [
        {
          items: [
            { label: "Overview", href: "/sales/" },
            { label: "Growth Thesis", href: "/sales/growth-thesis.html" },
            { label: "Role Models", href: "/sales/role-models.html" },
            { label: "Partner Program", href: "/sales/partner-program.html" },
            { label: "Bid-Surface Loop", href: "/sales/bid-loop.html" }
          ]
        },
        {
          title: "Legacy · dark (being ported)", items: [
            { label: "Sales Playbook", href: "/sales/playbook.html" },
            { label: "Sales Engine", href: "/sales/sales-engine.html" },
            { label: "Scenarios", href: "/sales/scenarios.html" },
            { label: "Centaur Timeline", href: "/sales/timeline.html" },
          ]
        }
      ]
    },
    {
      id: "onboarding", label: "Onboarding", href: "/onboarding/", sidebar: false, theme: "paper",
      groups: [
        { items: [{ label: "Overview", href: "/onboarding/" }] },
        {
          title: "Strategy & journey", items: [
            { label: "Journey Mind Map", href: "/onboarding/journey-map.html" },
            { label: "Decision Tree", href: "/onboarding/decision-tree.html" },
            { label: "Flow Diagram", href: "/onboarding/flow-diagram.html" },
            { label: "Flow in Action (scenario)", href: "/onboarding/flow-scenario.html" },
            { label: "Onboarding Model", href: "/onboarding/onboarding-model.html" },
          ]
        },
        {
          title: "Walkthroughs", items: [
            { label: "Squires · self-serve", href: "/onboarding/walkthrough-squires.html" },
            { label: "Cache Valley · white-glove", href: "/onboarding/walkthrough-cve.html" }
          ]
        },
        {
          title: "Build spec", items: [
            { label: "Technical Mapping", href: "/onboarding/tech-mapping.html" },
            { label: "Trade-Config Library", href: "/onboarding/trade-library.html" }
          ]
        },
        { title: "Reference", items: [{ label: "Test Clients", href: "/onboarding/test-clients.html" }] }
      ]
    }
  ];

  function norm(p) {
    p = (p || "/").split("#")[0].split("?")[0];
    p = p.replace(/index\.html$/, "").replace(/\.html$/, "");
    if (p.length > 1) p = p.replace(/\/$/, "");
    return p || "/";
  }
  var cur = norm(location.pathname);
  function secNorm(s) { return norm(s.href); }
  function inSection(s) { var n = secNorm(s); return cur === n || cur.indexOf(n + "/") === 0; }
  function isPage(href) { return norm(href) === cur; }

  var css = ''
    + 'body{padding-top:50px}'
    + '.pn-top{position:fixed;top:0;left:0;right:0;height:50px;z-index:99999;display:flex;align-items:center;gap:6px;'
    + 'padding:0 16px;background:rgba(12,14,18,.94);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);'
    + 'border-bottom:1px solid #262b35;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}'
    + '.pn-top a{text-decoration:none}'
    + '.pn-brand{display:flex;align-items:center;gap:9px;margin-right:8px}'
    + '.pn-mark{width:26px;height:26px;border-radius:7px;background:linear-gradient(135deg,#78bce6,#4a90c4);'
    + 'display:flex;align-items:center;justify-content:center;font-weight:800;color:#0c0e12;font-size:15px}'
    + '.pn-name{font-weight:700;font-size:14px;color:#e7eaf0;white-space:nowrap}.pn-name span{color:#6f7785;font-weight:500}'
    + '.pn-nav{display:flex;align-items:center;gap:2px;margin-left:auto}'
    + '.pn-item{position:relative;display:flex;align-items:center;height:50px}'
    + '.pn-link{font-size:13px;color:#aab2c0;padding:7px 8px 7px 10px;white-space:nowrap;transition:color .14s}'
    + '.pn-caret{appearance:none;border:0;background:transparent;color:#6f7785;font-size:10px;cursor:pointer;'
    + 'padding:8px 10px 8px 2px;line-height:1;transition:color .14s}'
    + '.pn-item::after{content:"";position:absolute;left:10px;right:10px;bottom:0;height:2px;background:transparent;transition:background .14s}'
    + '.pn-item:hover .pn-link,.pn-item:hover .pn-caret{color:#e7eaf0}'
    + '.pn-item.active .pn-link,.pn-item.active .pn-caret{color:#78bce6}'
    + '.pn-item.active::after{background:#78bce6}'
    + '.pn-menu{position:absolute;top:50px;right:0;min-width:248px;background:#14171d;border:1px solid #262b35;'
    + 'border-radius:12px;padding:7px;display:none;box-shadow:0 16px 40px rgba(0,0,0,.5);z-index:100000}'
    + '.pn-item:hover .pn-menu,.pn-item.open .pn-menu{display:block}'
    + '.pn-gt{font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#6f7785;padding:8px 10px 4px}'
    + '.pn-mi{display:block;font-size:13px;color:#cbd3df;padding:7px 10px;border-radius:8px;white-space:nowrap}'
    + '.pn-mi:hover{background:rgba(255,255,255,.06);color:#fff}'
    + '.pn-mi.here{color:#78bce6;background:rgba(120,188,230,.1)}'
    + '.pn-mi .a{float:right;color:#6f7785}'
    // sidebar
    + '.pn-side{position:fixed;top:50px;left:0;bottom:0;width:236px;overflow-y:auto;background:#0e1116;'
    + 'border-right:1px solid #20242d;padding:18px 14px 40px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;z-index:50}'
    + '.pn-side .sh{font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#6f7785;padding:0 8px 10px;margin-bottom:6px;border-bottom:1px solid #20242d}'
    + '.pn-side .sgt{font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#5b6472;padding:14px 8px 4px}'
    + '.pn-side a{display:block;text-decoration:none;font-size:13px;color:#aab2c0;padding:7px 10px;border-radius:8px;margin:1px 0;transition:all .12s}'
    + '.pn-side a:hover{background:rgba(255,255,255,.05);color:#e7eaf0}'
    + '.pn-side a.here{color:#78bce6;background:rgba(120,188,230,.12);font-weight:600}'
    + 'body.pn-has-side{padding-left:236px}'
    + '@media(max-width:1000px){body.pn-has-side{padding-left:0}.pn-side{display:none}}'
    + '@media(max-width:560px){.pn-name span{display:none}.pn-link{padding:7px 7px;font-size:12.5px}.pn-menu{right:-8px}}'
    // paper theme (sales section)
    + '.pn-top.paper{background:rgba(232,230,223,.96);border-bottom:1px solid #CECBC1}'
    + '.pn-top.paper .pn-mark{background:linear-gradient(135deg,#D2531D,#A23C12);color:#F5F3EE}'
    + '.pn-top.paper .pn-name{color:#181917}.pn-top.paper .pn-name span{color:#8A8B84}'
    + '.pn-top.paper .pn-link{color:#5D5F5A}.pn-top.paper .pn-caret{color:#8A8B84}'
    + '.pn-top.paper .pn-item:hover .pn-link,.pn-top.paper .pn-item:hover .pn-caret{color:#181917}'
    + '.pn-top.paper .pn-item.active .pn-link,.pn-top.paper .pn-item.active .pn-caret{color:#A23C12}'
    + '.pn-top.paper .pn-item.active::after{background:#D2531D}'
    + '.pn-top.paper .pn-menu{background:#FBFAF6;border-color:#CECBC1;box-shadow:0 16px 40px rgba(0,0,0,.18)}'
    + '.pn-top.paper .pn-gt{color:#8A8B84}'
    + '.pn-top.paper .pn-mi{color:#5D5F5A}.pn-top.paper .pn-mi:hover{background:rgba(24,25,23,.06);color:#181917}'
    + '.pn-top.paper .pn-mi.here{color:#A23C12;background:rgba(210,83,29,.1)}';

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ---- top bar ----
  var top = document.createElement("nav");
  top.className = "pn-top";
  var nav = SITE.map(function (s) {
    var menu = s.groups.map(function (g) {
      var t = g.title ? '<div class="pn-gt">' + g.title + "</div>" : "";
      var items = g.items.map(function (it) {
        return '<a class="pn-mi' + (isPage(it.href) ? " here" : "") + '" href="' + it.href + '">' + it.label + "</a>";
      }).join("");
      return t + items;
    }).join("");
    return '<div class="pn-item' + (inSection(s) ? " active" : "") + '" data-sec="' + s.id + '">'
      + '<a class="pn-link" href="' + s.href + '">' + s.label + "</a>"
      + '<button class="pn-caret" aria-label="' + s.label + ' menu">&#9662;</button>'
      + '<div class="pn-menu">' + menu + "</div>"
      + "</div>";
  }).join("");
  top.innerHTML =
    '<a class="pn-brand" href="/"><span class="pn-mark">P</span>'
    + '<span class="pn-name">Perch <span>· CRO Notebook</span></span></a>'
    + '<div class="pn-nav">' + nav + "</div>";
  document.body.insertBefore(top, document.body.firstChild);

  // per-section theme (paper for the sales notebook)
  var curSec = SITE.filter(function (s) { return inSection(s); })[0];
  if ((curSec && curSec.theme === "paper") || cur === "/") top.classList.add("paper");

  // ---- contextual sidebar ----
  var section = SITE.filter(function (s) { return s.sidebar && inSection(s); })[0];
  if (section) {
    var side = document.createElement("aside");
    side.className = "pn-side";
    var body = '<div class="sh">' + section.label + "</div>";
    body += section.groups.map(function (g) {
      var t = g.title ? '<div class="sgt">' + g.title + "</div>" : "";
      return t + g.items.map(function (it) {
        return '<a class="' + (isPage(it.href) ? "here" : "") + '" href="' + it.href + '">' + it.label + "</a>";
      }).join("");
    }).join("");
    side.innerHTML = body;
    document.body.insertBefore(side, top.nextSibling);
    document.body.classList.add("pn-has-side");
  }

  // ---- dropdown toggle (touch / click) ----
  top.querySelectorAll(".pn-caret").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var item = btn.parentElement, was = item.classList.contains("open");
      top.querySelectorAll(".pn-item.open").forEach(function (i) { i.classList.remove("open"); });
      if (!was) item.classList.add("open");
    });
  });
  document.addEventListener("click", function () {
    top.querySelectorAll(".pn-item.open").forEach(function (i) { i.classList.remove("open"); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") top.querySelectorAll(".pn-item.open").forEach(function (i) { i.classList.remove("open"); });
  });
})();
