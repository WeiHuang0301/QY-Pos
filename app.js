const $ = id => document.getElementById(id);
const money = n => "$" + n;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- 整理菜單（自動補上編號、出餐區、必選組合） ----------
const STATION_KEYS = Object.keys(STATIONS);
MENU.forEach((c, ci) => {
  c.group = c.group || "菜單";
  c.items.forEach((it, ii) => {
    it.id = it.id || ci + "-" + ii;
    it.station = it.station || c.station;
    if (!STATIONS[it.station]) {
      console.warn("找不到出餐區：", it.station, it.name);
      it.station = STATION_KEYS[0];
    }
    it.allChoices = (it.choices || []).concat(c.choices || []);
  });
});
const GROUPS = [...new Set(MENU.map(c => c.group))];
const catsOf = g => MENU.filter(c => c.group === g);

// ---------- 畫面上的文字（想改字就改這裡） ----------
const MODES = { dinein: "內用", cooked: "外帶-熟", raw: "外帶生鮮" };           // 櫃台「內用／外帶」切換按鈕上的字
const MODE_TAGS = { dinein: "內用", cooked: "外帶-C熟", raw: "外帶-R生鮮" };   // 廚房與已完成單子上的標籤字
const OPTIONS_LABEL = "隨附調整";                                               // 彈出視窗裡「可選客製」那一組的標題

let cart = [];            // 目前正在輸入的訂單
let grp = GROUPS[0];      // 目前的大分類
let cat = 0;              // 目前大分類裡的第幾個小分類
let mode = "dinein";      // 內用 / 外帶煮熟 / 外帶生鮮
let side = "";            // 桌子的哪一半：「內」（靠店內）/「外」（靠門口）/ 沒選

// 選項可以寫成 "牛肉"，也可以寫成 { name: "牛肉", extra: 30 }（extra 是加價）
const optName = o => (typeof o === "string" ? o : o.name);
const optExtra = o => (typeof o === "string" ? 0 : o.extra || 0);

// 單子上的標籤：「內用 8 號」「外帶-R生鮮」
const tagText = o => (o.mode === "dinein" ? "內用 " + o.table + " 號" + (o.side ? "・" + o.side : "") : MODE_TAGS[o.mode] || "");
const orderTag = o => esc(tagText(o));
const tagClass = o => (o.mode === "dinein" ? "dine" : "take");
// 品名後面接選擇：「養生藥膳鍋 / 豬」（選擇的部分會上色）
const nameHtml = (name, picks) =>
  esc(name) + (picks || []).map(p => ` / <span class="pk${p.includes("：") ? " set" : ""}">${esc(p)}</span>`).join("");
// ---------- 畫面切換（櫃台 / 廚房 / 已完成） ----------
function setView(v) {
  location.hash = "#" + v;
  $("counter").hidden = v !== "counter";
  $("kitchen").hidden = v !== "kitchen";
  $("done").hidden = v !== "done";
  $("vCounter").classList.toggle("on", v === "counter");
  $("vKitchen").classList.toggle("on", v === "kitchen");
  $("vDone").classList.toggle("on", v === "done");
  if (v === "kitchen") renderKitchen();
  if (v === "done") renderDone();
  updateBadge();
}

// ---------- 櫃台：分類與菜單 ----------
function renderTabs() {
  $("tabs").innerHTML =
    `<div class="grpbar">${GROUPS.map(g =>
      `<button class="gtab ${g === grp ? "on" : ""}" data-g="${esc(g)}">${esc(g)}</button>`).join("")}</div>` +
    `<div class="catbar">${catsOf(grp).map((c, i) =>
      `<button class="tab ${i === cat ? "on" : ""}" data-i="${i}">${esc(c.category)}</button>`).join("")}</div>`;
}

function renderGrid() {
  const c = catsOf(grp)[cat];
  $("grid").innerHTML = c.items.map(it => {
    const price = it.custom ? "手動輸入" : "$ " + it.price;
    return `<button class="item ${it.mark ? "mk-" + it.mark : ""}" data-id="${esc(it.id)}">` +
      `<span class="nm">${esc(it.name)}</span>${it.note ? `<small>${esc(it.note)}</small>` : ""}<b>${price}</b></button>`;
  }).join("");
}

function findItem(id) {
  for (const c of MENU) for (const it of c.items) if (it.id === id) return it;
}

// ---------- 櫃台：外帶 / 桌號 ----------
function renderMode() {
  $("modeSeg").innerHTML = Object.keys(MODES).map(m =>
    `<button class="${m === mode ? "on" : ""}" data-m="${m}">${MODES[m]}</button>`).join("");
  $("tableWrap").hidden = mode !== "dinein";
}

// 桌號旁邊的「內／外」：一張大桌分給兩組客人時用。點一下選取，再點同一個取消，也可以都不選
function renderSide() {
  $("sideSeg").innerHTML = ["內", "外"].map(s =>
    `<button class="${s === side ? "on" : ""}" data-s="${s}">${s}</button>`).join("");
}

// ---------- 櫃台：目前訂單 ----------
function addToCart(id) {
  const it = findItem(id);
  if (!it) return;
  if (it.custom) { openCustom(it); return; }                       // 手動輸入品名價格
  // 有必選／選填／隨附調整的餐點，先跳視窗讓人選
  if (it.allChoices.length || (it.options && it.options.length)) { openChoice(it); return; }
  pushLine(it, [], [], 0);
}

// 品名、選擇、客製都完全一樣的，合併成同一行（數量 +1）
function pushLine(it, picks, opts, extra) {
  const key = it.id + "|" + picks.join(",") + "|" + opts.join(",");
  const same = cart.find(l => l.key === key);
  if (same) same.qty++;
  else cart.push({ id: it.id, key, name: it.name, picks, opts, price: it.price + extra, qty: 1, station: it.station });
  renderCart();
}

function renderCart() {
  if (!cart.length) {
    $("lines").innerHTML = '<p class="empty">點左邊的餐點加入訂單</p>';
  } else {
    $("lines").innerHTML = cart.map((l, k) => `
      <div class="line">
        <div class="top">
          <span class="name">${nameHtml(l.name, l.picks)}</span>
          <span class="qty">
            <button data-a="dec" data-k="${k}">−</button>
            <b>${l.qty}</b>
            <button data-a="inc" data-k="${k}">+</button>
          </span>
          <span class="sub">${money(l.price * l.qty)}</span>
        </div>
        ${l.opts.length ? `<div class="tags">${l.opts.map(o => `<span class="otag">${esc(o)}</span>`).join("")}</div>` : ""}
      </div>`).join("");
  }
  const total = cart.reduce((s, l) => s + l.price * l.qty, 0);
  $("total").textContent = money(total);
  $("send").disabled = !cart.length;
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}

// ---------- 彈出視窗：必選 / 選填項目（肉品、附餐）＋ 隨附調整（不加蔥…） ----------
let pending = null;   // 正在選項目的餐點

function openChoice(it) {
  pending = { it, sel: {}, opts: [] };
  renderModal();
  $("modal").hidden = false;
}

function closeChoice() {
  pending = null;
  $("modal").hidden = true;
}

function renderModal() {
  const { it, sel, opts } = pending;
  const extra = it.allChoices.reduce((s, g, gi) => s + (sel[gi] === undefined ? 0 : optExtra(g.options[sel[gi]])), 0);
  $("mTitle").innerHTML = esc(it.name) + "<span>" + money(it.price + extra) + "</span>";
  const groups = it.allChoices.map((g, gi) => `
    <div class="grp">
      <div class="gl">${esc(g.label)}<small class="${g.required === false ? "opt" : ""}">${g.required === false ? "選填" : "必選"}</small></div>
      <div class="gopts">${g.options.map((o, j) => `
        <button class="chip ${sel[gi] === j ? "on" : ""}" data-g="${gi}" data-j="${j}">${esc(optName(o))}${optExtra(o) ? " +" + money(optExtra(o)) : ""}</button>`
      ).join("")}</div>
    </div>`).join("");
  const adjust = (it.options && it.options.length) ? `
    <div class="grp">
      <div class="gl">${esc(OPTIONS_LABEL)}<small class="opt">選填</small></div>
      <div class="gopts">${it.options.map((o, j) => `
        <button class="chip ${opts.includes(j) ? "on" : ""}" data-o="${j}">${esc(optName(o))}</button>`
      ).join("")}</div>
    </div>` : "";
  $("mGroups").innerHTML = groups + adjust;
  $("mOk").disabled = it.allChoices.some((g, gi) => g.required !== false && sel[gi] === undefined);
}

function confirmChoice() {
  const { it, sel } = pending;
  const picks = [];
  let extra = 0;
  it.allChoices.forEach((g, gi) => {
    if (sel[gi] === undefined) return;
    const o = g.options[sel[gi]];
    picks.push((g.prefix || "") + optName(o));
    extra += optExtra(o);
  });
  const opts = pending.opts.slice().sort((a, b) => a - b).map(j => optName(it.options[j]));
  pushLine(it, picks, opts, extra);
  closeChoice();
}

// ---------- 手動輸入視窗（季節時蔬、期間限定） ----------
let customFor = null;

function openCustom(it) {
  customFor = it;
  $("cTitle").textContent = it.name;
  $("cName").value = "";
  $("cPrice").value = it.price || "";
  $("cModal").hidden = false;
  $("cName").focus();
}

function closeCustom() {
  customFor = null;
  $("cModal").hidden = true;
}

function confirmCustom() {
  const n = $("cName").value.trim();
  const raw = $("cPrice").value.trim();
  const p = Number(raw);
  if (!n) { toast("請輸入品名"); return; }
  if (raw === "" || !Number.isFinite(p) || p < 0) { toast("請輸入正確的價格"); return; }
  const it = customFor;
  const name = it.name + "：" + n;
  const key = it.id + "|" + n + "|" + p;
  const same = cart.find(l => l.key === key);
  if (same) same.qty++;
  else cart.push({ id: it.id, key, name, picks: [], opts: [], price: p, qty: 1, station: it.station });
  closeCustom();
  renderCart();
}

// ---------- 送出訂單 ----------
let lastId = 0;
const newId = () => (lastId = Math.max(Date.now(), lastId + 1));   // 訂單的內部編號，保證不會重複

function sendOrder() {
  if (!cart.length) return;
  const table = $("table").value.trim();
  if (mode === "dinein" && !table) {
    toast("請先輸入桌號");
    $("table").focus();
    return;
  }
  const order = {
    id: newId(),
    no: Store.nextNo(),
    time: new Date().toISOString(),
    mode,
    table: mode === "dinein" ? table : "",
    side: mode === "dinein" ? side : "",
    lines: cart.map(l => ({ name: l.name, picks: l.picks, opts: l.opts, qty: l.qty, station: l.station })),
    total: cart.reduce((s, l) => s + l.price * l.qty, 0),
    done: []
  };
  Store.add(order);
  Store.prune();
  cart = [];
  mode = "dinein";
  $("table").value = "";
  side = "";
  renderMode();
  renderSide();
  renderCart();
  updateBadge();
  toast("已送出 #" + order.no + "（" + tagText(order) + "）");
}

// ---------- 廚房（每個出餐區各一欄，內容就是各區出單機要印的單子） ----------
let lastKitchen = "";

function pendingStations(o) {
  const used = [...new Set(o.lines.map(l => l.station))];
  return used.filter(s => !(o.done || []).includes(s));
}

function ticketHtml(o, s) {
  const lines = o.lines.filter(l => l.station === s);
  const mins = Math.floor((Date.now() - new Date(o.time)) / 60000);
  return `
    <article class="ticket ${tagClass(o)} ${mins >= 10 ? "late" : ""}">
      <div class="th"><span class="tag ${tagClass(o)}">${orderTag(o)}</span><span class="ago">${mins}分鐘前</span></div>
      <ul>${lines.map(l =>
        `<li><span class="q">${l.qty} x</span><div class="ln"><span class="nm">${nameHtml(l.name, l.picks)}</span>` +
        (l.opts && l.opts.length ? `<em>${l.opts.map(esc).join("、")}</em>` : "") +
        `</div></li>`).join("")}</ul>
      <div class="tf"><button class="done" data-id="${o.id}" data-s="${s}">完成</button><span class="no"># ${o.no}</span></div>
    </article>`;
}

function renderKitchen() {
  const orders = Store.load();
  const html = STATION_KEYS.map(s => {
    const mine = orders.filter(o => pendingStations(o).includes(s));
    return `<section class="kcol"><h2>${esc(STATIONS[s])}</h2>` +
      `<div class="orders">${mine.length ? mine.map(o => ticketHtml(o, s)).join("") :
        '<p class="empty">目前沒有待處理的單</p>'}</div></section>`;
  }).join("");
  if (html !== lastKitchen) {
    $("kitchen").innerHTML = html;
    lastKitchen = html;
  }
}

// ---------- 已完成訂單（今天所有出餐區都按過「完成」的單） ----------
let lastDone = "";

function lineText(l) {
  const opts = (l.opts || []).length ? `<small>（${l.opts.map(esc).join("、")}）</small>` : "";
  return `<span class="li"><span class="q">${l.qty}x</span> [${nameHtml(l.name, l.picks)}]${opts}</span>`;
}

function doneHtml(o) {
  const t = new Date(o.time);
  const hm = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
  return `
    <article class="drow">
      <div class="dmain">
        <div class="dh"><span class="no"># ${o.no}</span><span class="tag ${tagClass(o)}">${orderTag(o)}</span><span class="dt">${hm}</span></div>
        <div class="di">${o.lines.map(lineText).join("")}</div>
      </div>
      <div class="dm">${money(o.total)}</div>
    </article>`;
}

function renderDone() {
  const today = new Date().toDateString();
  const list = Store.load()
    .filter(o => new Date(o.time).toDateString() === today && pendingStations(o).length === 0)
    .sort((a, b) => a.no - b.no);                      // 單號小的在上面（想要最新的在最上面，改成 b.no - a.no）
  const sum = list.reduce((s, o) => s + o.total, 0);
  const html = `<div class="dsum"><span class="t">今日完成訂單:</span>` +
    `<span class="s">合計 <b>${list.length}</b> 單 / <i>${money(sum)}</i> 元</span></div>` +
    (list.length ? `<div class="dlist">${list.map(doneHtml).join("")}</div>` : '<p class="empty">今天還沒有完成的訂單</p>');
  if (html !== lastDone) {                              // 內容沒變就不重畫，捲動位置才不會跳掉
    $("done").innerHTML = html;
    lastDone = html;
  }
}

function updateBadge() {
  const n = Store.load().filter(o => pendingStations(o).length).length;
  $("kBadge").hidden = !n;
  $("kBadge").textContent = n;
}

// ---------- 事件 ----------
$("tabs").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.g !== undefined) { grp = b.dataset.g; cat = 0; }
  else if (b.dataset.i !== undefined) cat = Number(b.dataset.i);
  renderTabs();
  renderGrid();
});

$("grid").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (b) addToCart(b.dataset.id);
});

$("modeSeg").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  mode = b.dataset.m;
  if (mode !== "dinein") side = "";                     // 改成外帶就清掉內／外選擇
  renderMode();
  renderSide();
});

$("sideSeg").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  side = side === b.dataset.s ? "" : b.dataset.s;       // 再點一次已選的 = 取消
  renderSide();
});

$("lines").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  const k = Number(b.dataset.k);
  const line = cart[k];
  if (!line) return;
  if (b.dataset.a === "inc") line.qty++;
  if (b.dataset.a === "dec") { line.qty--; if (line.qty <= 0) cart.splice(k, 1); }
  renderCart();
});

$("mGroups").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b || !pending) return;
  if (b.dataset.o !== undefined) {                      // 隨附調整：可以多選，再點一次取消
    const j = Number(b.dataset.o);
    const at = pending.opts.indexOf(j);
    if (at >= 0) pending.opts.splice(at, 1); else pending.opts.push(j);
  } else {                                              // 必選／選填：同一組只能選一個
    const gi = Number(b.dataset.g), j = Number(b.dataset.j);
    const g = pending.it.allChoices[gi];
    if (g.required === false && pending.sel[gi] === j) delete pending.sel[gi];   // 選填：再點一次取消
    else pending.sel[gi] = j;
  }
  renderModal();
});
$("mOk").addEventListener("click", () => { if (pending) confirmChoice(); });
$("mCancel").addEventListener("click", closeChoice);
$("modal").addEventListener("click", e => { if (e.target === $("modal")) closeChoice(); });

$("cOk").addEventListener("click", () => { if (customFor) confirmCustom(); });
$("cCancel").addEventListener("click", closeCustom);
$("cModal").addEventListener("click", e => { if (e.target === $("cModal")) closeCustom(); });

$("clear").addEventListener("click", () => { cart = []; renderCart(); });
$("send").addEventListener("click", sendOrder);

$("kitchen").addEventListener("click", e => {
  const b = e.target.closest("button.done");
  if (!b) return;
  Store.markDone(Number(b.dataset.id), b.dataset.s);
  renderKitchen();
  updateBadge();
});

$("vCounter").addEventListener("click", () => setView("counter"));
$("vKitchen").addEventListener("click", () => setView("kitchen"));
$("vDone").addEventListener("click", () => setView("done"));

// 資料有變動時刷新（同一台裝置開多個分頁也會同步）
window.addEventListener("storage", () => {
  if (!$("kitchen").hidden) renderKitchen();
  if (!$("done").hidden) renderDone();
  updateBadge();
});
setInterval(() => {
  if (!$("kitchen").hidden) renderKitchen();
  if (!$("done").hidden) renderDone();
  updateBadge();
}, 2000);

// ---------- 啟動 ----------
renderMode();
renderSide();
renderTabs();
renderGrid();
renderCart();
const startView = location.hash.slice(1);
setView(["counter", "kitchen", "done"].includes(startView) ? startView : "counter");
