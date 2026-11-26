const $ = id => document.getElementById(id);
const money = n => "$" + n;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- 附餐規則（一鍋送一份主食） ----------
const POT_GROUP = "鍋物";        // 這個大分類裡的餐點，每點一個就算「一鍋」
const SET_CATEGORY = "主食";     // 這個小分類裡的餐點，每點一份就算「一份附餐」
const SET_DISCOUNT = 10;         // 每一份附餐折抵多少錢（最多折到跟鍋數一樣多份）

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
    if (!it.options && c.options) it.options = c.options;           // 小分類也可以統一設定「可選」項目（例如素食醬料）
    if (!it.optLabel && c.optLabel) it.optLabel = c.optLabel;
    it.pot = c.group === POT_GROUP;                                 // 這是「一鍋」
    it.set = c.category === SET_CATEGORY;                           // 這是「附餐主食」
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

// 桌號小鍵盤：點桌號格會在下面長出一個小數字鍵盤，不會叫出整個 iPad 大鍵盤
const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clr", "0", "bs"];
const PAD_MAX = 4;                                      // 桌號最多幾位數
function renderPad() {
  $("pad").innerHTML = PAD_KEYS.map(k =>
    `<button data-k="${k}" class="${k === "clr" || k === "bs" ? "fn" : ""}">${k === "clr" ? "清除" : k === "bs" ? "⌫" : k}</button>`).join("") +
    `<button data-k="ok" class="ok">完成</button>`;
}
function openPad() { $("pad").hidden = false; }
function closePad() { $("pad").hidden = true; }

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
  else cart.push({ id: it.id, key, name: it.name, picks, opts, price: it.price + extra, qty: 1, station: it.station, pot: it.pot, set: it.set });
  renderCart({ key, isNew: !same });                    // 這一行是剛加進去的 → 清單捲到最底、播放動畫
  flyToCart();
}

// 剛點的那個餐點格，縮小「飛」進訂單清單那一行（像 Safari 下載的效果）
let tapEl = null;                                       // 剛點下去的餐點格（點格子時記下來）
const FLY_MS = 350;                                     // 飛行時間（毫秒）；想快一點就改小
function flyToCart() {
  const src = tapEl;
  tapEl = null;
  try {
    if (!src || typeof document.createElement !== "function") return;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const line = $("lines").querySelector(".line.new, .line.bump");
    if (!line) return;
    const r = src.getBoundingClientRect(), t = line.getBoundingClientRect();
    const f = src.cloneNode(true);
    f.removeAttribute("id");
    f.classList.add("fly");
    Object.assign(f.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    document.body.appendChild(f);
    const dx = t.left + 90 - (r.left + r.width / 2), dy = t.top + t.height / 2 - (r.top + r.height / 2);
    const a = f.animate(
      [{ transform: "translate(0,0) scale(1)", opacity: 1 },
       { transform: `translate(${dx}px,${dy}px) scale(.14)`, opacity: .2 }],
      { duration: FLY_MS, easing: "cubic-bezier(.4,0,.6,1)" });
    a.onfinish = () => f.remove();
  } catch (e) { /* 動畫失敗不影響點餐 */ }
}

// 算錢：小計、幾鍋、幾份附餐、折抵多少、應收多少
// base：追加點餐時，原本那張帳單已有的鍋數、附餐數、折抵（整張帳單一起算折抵，這裡只算「這次新增」的部分）
function calc(base = { pots: 0, sets: 0, disc: 0 }) {
  let sum = 0, pots = 0, sets = 0;
  cart.forEach(l => {
    sum += l.price * l.qty;
    if (l.pot) pots += l.qty;
    if (l.set) sets += l.qty;
  });
  const covered = Math.min(pots + base.pots, sets + base.sets);   // 附餐份數超過鍋數的部分不折抵
  const disc = covered * SET_DISCOUNT - base.disc;
  return { sum, pots, sets, covered, disc, total: sum - disc };
}

// added = { key, isNew }：剛加進來的那一行（會捲到底，並帶入場動畫）；沒給的話維持原本的捲動位置
let padTimer = 0;
function renderCart(added, padPx) {
  const keepTop = $("lines").scrollTop;
  clearTimeout(padTimer);
  $("lines").style.paddingBottom = padPx ? padPx + "px" : "";   // 刪除動畫時暫時墊高底部（見 removeLine）
  if (!cart.length) {
    $("lines").innerHTML = '<p class="empty">點左邊的餐點加入訂單</p>';
  } else {
    $("lines").innerHTML = cart.map((l, k) => `
      <div class="line${added && added.key === l.key ? (added.isNew ? " new" : " bump") : ""}">
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
  const c = calc();
  // 鍋數／附餐數／折抵：點了鍋或附餐才會出現
  if (c.pots || c.sets) {
    const over = c.sets > c.pots ? `<span class="si-over">多 ${c.sets - c.pots} 份照價</span>` : "";
    $("setInfo").innerHTML =
      `<span class="si-l">鍋</span><b>${c.pots}</b>` +
      `<span class="si-l">附餐</span><b>${c.sets}</b>` +
      `<span class="si-l">折抵</span><b class="si-d">${c.disc ? "−" + money(c.disc) : "$0"}</b>` + over +
      `<button class="si-go" data-a="goset">＋附餐</button>`;
    $("setInfo").hidden = false;
  } else {
    $("setInfo").hidden = true;
  }
  $("total").textContent = money(c.total);
  if (added) $("lines").scrollTop = $("lines").scrollHeight;     // 一直自動往下，永遠看得到最新那一行
  else $("lines").scrollTop = keepTop;                           // 按 ＋／− 時不要跳回最上面
  $("send").disabled = !cart.length;
  $("append").disabled = !cart.length;
}

// 跳到「附餐主食」那一頁
function goSetCategory() {
  for (const g of GROUPS) {
    const i = catsOf(g).findIndex(x => x.category === SET_CATEGORY);
    if (i >= 0) { grp = g; cat = i; renderTabs(); renderGrid(); return; }
  }
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
      <div class="gl">${esc(it.optLabel || OPTIONS_LABEL)}<small class="opt">選填</small></div>
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

// billId 沒給 = 新的一張帳單；給了 = 追加到那一張帳單
function sendOrder(billId) {
  if (!cart.length) return;
  let bill = null, base;
  if (billId) {
    bill = billsOfDay(dayKey(new Date())).find(b => b.id === billId && !b.paid);
    if (!bill) { toast("這張訂單已經結帳或找不到"); return; }
    base = billBase(bill);
  } else {
    if (mode === "dinein" && !$("table").value.trim()) {
      toast("請先輸入桌號");
      openPad();
      return;
    }
  }
  const table = $("table").value.trim();
  const calcd = calc(base);
  const id = newId();
  const order = {
    id,
    no: bill ? bill.no : Store.nextNo(),
    bill: bill ? bill.id : id,                          // 帳單編號：第一張出單的 id
    extra: bill ? bill.tickets.length : 0,              // 第幾次追加（第一張是 0）
    time: new Date().toISOString(),
    mode: bill ? bill.first.mode : mode,
    table: bill ? bill.first.table : (mode === "dinein" ? table : ""),
    side: bill ? bill.first.side : (mode === "dinein" ? side : ""),
    lines: cart.map(l => ({ name: l.name, picks: l.picks, opts: l.opts, qty: l.qty, station: l.station, price: l.price, pot: !!l.pot, set: !!l.set })),
    disc: calcd.disc,                                   // 這張出單的附餐折抵（total 已經扣掉了）
    total: calcd.total,
    paid: false
  };
  Store.add(order);
  Store.prune();
  cart = [];
  if (!bill) {                                          // 追加時，桌號那一欄維持原樣
    mode = "dinein";
    $("table").value = "";
    side = "";
    closePad();
    renderMode();
    renderSide();
  }
  renderCart();
  updateBadge();
  toast((bill ? "已追加到 #" : "已送出 #") + order.no + "（" + tagText(order) + "）");
}

// ---------- 時間小工具 ----------
const p2 = n => String(n).padStart(2, "0");
const hhmm = iso => { const t = new Date(iso); return p2(t.getHours()) + ":" + p2(t.getMinutes()); };
const dayKey = iso => { const t = new Date(iso); return t.getFullYear() + "-" + p2(t.getMonth() + 1) + "-" + p2(t.getDate()); };
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

// ---------- 出單記錄（每個出餐區各一欄，內容就是各區出單機印出來的單子；只看不按） ----------
let lastKitchen = "";

// 迷你出單區（例如櫃檯只有「飯」）：欄位窄、單子小。要加其他區就把代號寫進來，例如 ["counter", "prep"]
const MINI_STATIONS = ["counter"];

// 追加的單，標籤後面多一段「 – 追加」
const kTag = o => orderTag(o) + (o.extra ? " – 追加" : "");

// 單子：上面標籤、中間品項、底下左邊單號、右邊時間（每個出餐區都一樣）
// folded = true 時是「已折疊單」裡的迷你單（字小一點）
function ticketHtml(o, s, mini, folded) {
  const lines = o.lines.filter(l => l.station === s);
  return `
    <article class="ticket ${tagClass(o)} ${mini ? "mini" : ""} ${folded ? "folded" : ""}">
      <div class="th"><span class="tag ${tagClass(o)}">${kTag(o)}</span></div>
      <ul>${lines.map(l =>
        `<li><span class="q">${l.qty} x</span><div class="ln"><span class="nm">${nameHtml(l.name, l.picks)}</span>` +
        (l.opts && l.opts.length ? `<em>${l.opts.map(esc).join("、")}</em>` : "") +
        `</div></li>`).join("")}</ul>
      <div class="tf"><span class="no"># ${o.no}</span><span class="ago">${hhmm(o.time)}</span></div>
    </article>`;
}

const PILE_KEEP = 4;          // 每個出餐區直接顯示最新的幾張（更早的收進左下角那一疊）
const pileOpen = {};          // 哪個出餐區的「已折疊單」已展開

// 已折疊單（大欄位用）：第一行 單號・標籤・時間，下面是品項（字比以前大）
function foldHtml(o, s) {
  const lines = o.lines.filter(l => l.station === s);
  return `<div class="fold ${tagClass(o)}">` +
    `<div class="fh"><span class="no"># ${o.no}</span><span class="tag ${tagClass(o)}">${kTag(o)}</span><span class="ago">${hhmm(o.time)}</span></div>` +
    `<div class="fi">${lines.map(l => `<span class="fl"><span class="q">${l.qty}x</span> ${nameHtml(l.name, l.picks)}` +
      (l.opts && l.opts.length ? `<small>（${l.opts.map(esc).join("、")}）</small>` : "") + `</span>`).join("")}</div></div>`;
}

// 左下角那一疊：最前面三張「已折疊單」的縮圖，疊成 1:1 圓角方塊；最上面一張蓋遮色片、中間顯示張數
function pileHtml(older, s) {
  const thumbs = older.slice(0, 3).map((o, i) =>
    `<span class="thumb t${i}">${ticketHtml(o, s, MINI_STATIONS.includes(s))}` +
    (i === 0 ? `<span class="mask"></span><span class="cnt">${older.length}</span>` : "") + `</span>`).reverse().join("");
  return `<button class="pile" data-s="${s}" aria-label="已折疊單">${thumbs}</button>`;
}

function renderKitchen() {
  const today = dayKey(new Date());
  const orders = Store.load().filter(o => dayKey(o.time) === today)
    .sort((a, b) => b.id - a.id);                                    // 最新的在最上面（id 越大越新）
  const html = STATION_KEYS.map(s => {
    const mine = orders.filter(o => o.lines.some(l => l.station === s));
    const fresh = mine.slice(0, PILE_KEEP), older = mine.slice(PILE_KEEP);
    const open = !!pileOpen[s] && older.length > 0;
    const mini = MINI_STATIONS.includes(s);
    const folds = open
      ? `<div class="foldwrap"><div class="foldbar"><button class="foldbtn" data-s="${s}">收起</button></div>` +
        `<hr class="foldline"><h3 class="foldtitle">已折疊單</h3>` +
        `<div class="foldlist">${older.map(o => mini ? ticketHtml(o, s, true, true) : foldHtml(o, s)).join("")}</div></div>`
      : "";
    return `<section class="kcol ${mini ? "mini" : ""}"><h2>${esc(STATIONS[s])}</h2>` +
      `<div class="orders">${fresh.length ? fresh.map(o => ticketHtml(o, s, mini)).join("") :
        '<p class="empty">今天還沒有出單</p>'}` +
      (older.length && !open ? pileHtml(older, s) : "") +          // 圖示固定接在最新 4 張的後面（要往下滑才看得到）
      `${folds}</div></section>`;
  }).join("");
  if (html !== lastKitchen) {
    const k = $("kitchen");
    const keep = k.querySelectorAll ? [...k.querySelectorAll(".orders")].map(e => e.scrollTop) : [];   // 重畫前先記住各欄捲到哪
    k.innerHTML = html;
    if (k.querySelectorAll) [...k.querySelectorAll(".orders")].forEach((e, i) => { e.scrollTop = keep[i] || 0; });
    lastKitchen = html;
  }
}

// ---------- 訂單總覽（每一張帳單一筆：未結帳在上、已結帳在下） ----------
let lastDone = "";
let ovTab = "today";        // "today" 今日 / "hist" 歷史訂單
let ovDay = "";             // 歷史：選到哪一天

// 把同一張帳單的所有出單（含追加）併成一筆
function groupBills(list) {
  const map = new Map();
  list.forEach(o => {
    const b = o.bill || o.id;
    if (!map.has(b)) map.set(b, []);
    map.get(b).push(o);
  });
  return [...map.entries()].map(([id, ts]) => {
    ts.sort((a, b) => a.id - b.id);
    return {
      id, no: ts[0].no, first: ts[0], tickets: ts, time: ts[0].time,
      total: ts.reduce((s, o) => s + o.total, 0),
      disc: ts.reduce((s, o) => s + (o.disc || 0), 0),
      paid: ts.every(o => o.paid)
    };
  }).sort((a, b) => a.no - b.no);                       // 單號小的在上面（想要最新的在最上面，改成 b.no - a.no）
}

// 某一天的帳單
const billsOfDay = key => groupBills(Store.load().filter(o => dayKey(o.time) === key));
// 這張帳單目前已經有幾鍋、幾份附餐、折抵了多少（追加時要一起算）
function billBase(b) {
  let pots = 0, sets = 0;
  b.tickets.forEach(o => o.lines.forEach(l => { if (l.pot) pots += l.qty; if (l.set) sets += l.qty; }));
  return { pots, sets, disc: b.disc };
}

function lineText(l) {
  const opts = (l.opts || []).length ? `<small>（${l.opts.map(esc).join("、")}）</small>` : "";
  return `<span class="li"><span class="q">${l.qty}x</span> [${nameHtml(l.name, l.picks)}]${opts}</span>`;
}

function billHtml(b) {
  const f = b.first;
  const body = b.tickets.map(o =>
    (o.extra ? `<span class="addmk">追加 ${hhmm(o.time)}</span>` : "") + o.lines.map(lineText).join("")).join("");
  const side = b.paid
    ? `<div class="dm">${money(b.total)}</div><div class="paidrow"><span class="paidtxt"># ${b.no} 已結帳</span>` +
      `<button class="unpay" data-a="unpay" data-b="${b.id}" aria-label="取消結帳">✕</button></div>`
    : `<div class="dm">${money(b.total)}</div><button class="pay" data-a="pay" data-b="${b.id}">結帳</button>`;
  return `
    <article class="drow ${b.paid ? "paid" : ""}">
      <div class="dmain">
        <div class="dh"><span class="no"># ${b.no}</span><span class="tag ${tagClass(f)}">${orderTag(f)}</span><span class="dt">${hhmm(b.time)}</span></div>
        <div class="di">${body}</div>
      </div>
      <div class="dside">${side}</div>
    </article>`;
}

// 歷史：今天之前 Store.KEEP_DAYS 天的日期按鈕
function histDays() {
  const out = [];
  for (let i = 1; i <= Store.KEEP_DAYS; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    out.push({ key: dayKey(d), label: (d.getMonth() + 1) + "/" + d.getDate(), wk: WEEK[d.getDay()] });
  }
  return out;
}

function viewDay() {
  if (ovTab === "today") return dayKey(new Date());
  const days = histDays();
  if (!days.some(d => d.key === ovDay)) ovDay = days[0].key;
  return ovDay;
}

function renderDone() {
  const key = viewDay();
  const bills = billsOfDay(key);
  const paid = bills.filter(b => b.paid), open = bills.filter(b => !b.paid);
  const sumPaid = paid.reduce((s, b) => s + b.total, 0), sumOpen = open.reduce((s, b) => s + b.total, 0);
  const bar = `<div class="ovbar">
      <div class="seg ovseg"><button class="${ovTab === "today" ? "on" : ""}" data-t="today">今日</button><button class="${ovTab === "hist" ? "on" : ""}" data-t="hist">歷史訂單</button></div>
      <button class="export" data-a="export">匯出 CSV</button>
    </div>` +
    (ovTab === "hist" ? `<div class="daystrip">${histDays().map(d =>
      `<button class="day ${d.key === key ? "on" : ""}" data-d="${d.key}"><b>${d.label}</b><small>${d.wk}</small></button>`).join("")}</div>` : "");
  const html = bar +
    `<div class="dsum"><span class="t">${ovTab === "today" ? "今日已結帳:" : key + " 已結帳:"}</span>` +
    `<span class="s">合計 <b>${paid.length}</b> 單 / <i>${money(sumPaid)}</i> 元</span></div>` +
    `<div class="dsum2"><span class="t">未結帳:</span><span class="s"><b>${open.length}</b> 單 / ${money(sumOpen)} 元</span></div>` +
    `<h3 class="sec">未結帳 <small>${open.length}</small></h3>` +
    (open.length ? `<div class="dlist">${open.map(billHtml).join("")}</div>` : '<p class="empty">沒有未結帳的訂單</p>') +
    `<h3 class="sec">已結帳 <small>${paid.length}</small></h3>` +
    (paid.length ? `<div class="dlist">${paid.map(billHtml).join("")}</div>` : '<p class="empty">還沒有結帳的訂單</p>');
  if (html !== lastDone) {                              // 內容沒變就不重畫，捲動位置才不會跳掉
    $("done").innerHTML = html;
    lastDone = html;
  }
}

// ---------- 匯出 CSV（目前看到的那一天；可用 Numbers、Excel 開） ----------
function csvOfDay(key) {
  const q = v => '"' + String(v === undefined || v === null ? "" : v).replace(/"/g, '""') + '"';
  const rows = [["日期", "時間", "單號", "類型", "桌號", "內外", "品名", "選擇", "客製", "數量", "單價", "小計", "狀態", "備註"]];
  const tickets = Store.load().filter(o => dayKey(o.time) === key).sort((a, b) => a.id - b.id);
  tickets.forEach(o => {
    const common = [key, hhmm(o.time), o.no, MODES[o.mode] || o.mode, o.table || "", o.side || ""];
    const state = o.paid ? "已結帳" : "未結帳", note = o.extra ? "追加" : "";
    o.lines.forEach(l => rows.push([...common, l.name, (l.picks || []).join(" / "), (l.opts || []).join("、"),
      l.qty, l.price === undefined ? "" : l.price, l.price === undefined ? "" : l.price * l.qty, state, note]));
    if (o.disc) rows.push([...common, "附餐折抵", "", "", 1, -o.disc, -o.disc, state, note]);
  });
  return "﻿" + rows.map(r => r.map(q).join(",")).join("\r\n");   // 開頭的 ﻿ 讓 Numbers/Excel 正確顯示中文
}

function exportCsv() {
  const key = viewDay();
  const name = "訂單_" + key + ".csv";
  const text = csvOfDay(key);
  try {
    const file = new File([text], name, { type: "text/csv" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {     // iPad：跳出「儲存到檔案／用 Numbers 開啟」
      navigator.share({ files: [file] }).catch(() => {});
      return;
    }
  } catch (e) {}
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// 「訂單總覽」按鈕上的小圓點 = 今天還沒結帳的帳單數
function updateBadge() {
  const n = billsOfDay(dayKey(new Date())).filter(b => !b.paid).length;
  $("kBadge").hidden = !n;
  $("kBadge").textContent = n;
}

// ---------- 追加點餐（把目前這些餐點，追加到某一張還沒結帳的帳單） ----------
function openAppend() {
  if (!cart.length) return;
  const open = billsOfDay(dayKey(new Date())).filter(b => !b.paid).sort((a, b) => b.no - a.no);
  if (!open.length) { toast("目前沒有未結帳的訂單可以追加"); return; }
  $("aList").innerHTML = open.map(b => {
    const names = b.tickets.flatMap(o => o.lines.map(l => l.name + " x" + l.qty)).join("、");
    return `<button class="bpick" data-b="${b.id}">` +
      `<span class="bp-no"># ${b.no}</span><span class="bp-tag">${orderTag(b.first)}</span><span class="bp-t">${hhmm(b.time)}</span>` +
      `<small>${esc(names)}</small></button>`;
  }).join("");
  $("aModal").hidden = false;
}
function closeAppend() { $("aModal").hidden = true; }

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
  if (!b) return;
  tapEl = b;
  addToCart(b.dataset.id);
});

$("modeSeg").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  mode = b.dataset.m;
  if (mode !== "dinein") { side = ""; closePad(); }     // 改成外帶就清掉內／外選擇、收起小鍵盤
  renderMode();
  renderSide();
});

$("sideSeg").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  side = side === b.dataset.s ? "" : b.dataset.s;       // 再點一次已選的 = 取消
  renderSide();
});

// 桌號：點格子就開小鍵盤；按鍵改的是格子裡的數字
$("table").addEventListener("focus", openPad);
$("table").addEventListener("click", openPad);
$("pad").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  const k = b.dataset.k, t = $("table");
  if (k === "ok") { closePad(); return; }
  if (k === "clr") t.value = "";
  else if (k === "bs") t.value = t.value.slice(0, -1);
  else if (t.value.length < PAD_MAX) t.value += k;
});
document.addEventListener("click", e => {               // 點到鍵盤與桌號格以外的地方就收起來
  if ($("pad").hidden) return;
  if (e.target.closest("#pad") || e.target === $("table")) return;
  closePad();
});

$("setInfo").addEventListener("click", e => {
  if (e.target.closest("button")) goSetCategory();
});

$("lines").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  const k = Number(b.dataset.k);
  const line = cart[k];
  if (!line) return;
    if (b.dataset.a === "inc") line.qty++;
  if (b.dataset.a === "dec") {
    if (line.qty <= 1) { removeLine(line, b.closest && b.closest(".line")); return; }   // 減到沒有 → 那一行往上收起來
    line.qty--;
  }
  renderCart();
});

// 刪除一行：先播「往上收」的動畫，下面的行會跟著往上補位；動畫結束才真的從訂單移除
const OUT_MS = 250;                                     // 收起來的速度（毫秒）
function removeLine(line, row) {
  const box = $("lines");
  let pad = 0;                                           // 清單捲在底部時，內容變短會讓「上面的往下掉」；先把底部墊高，才會是「下面的往上補」
  const done = () => {
    const i = cart.indexOf(line);
    if (i >= 0) cart.splice(i, 1);
    renderCart(undefined, pad);
    if (pad) {                                           // 動畫結束後，再慢慢把清單貼回底部，然後拿掉墊高
      const max = box.scrollHeight - pad - box.clientHeight;
      if (box.scrollTop > max && box.scrollTo) box.scrollTo({ top: Math.max(0, max), behavior: "smooth" });
      padTimer = setTimeout(() => { box.style.paddingBottom = ""; }, 350);
    }
  };
  try {
    if (!row || !row.animate || row.dataset.leaving) { if (!row || !row.animate) done(); return; }
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) { done(); return; }
    row.dataset.leaving = "1";
    const h = row.getBoundingClientRect().height;
    if (box.scrollHeight > box.clientHeight + 1) { pad = Math.ceil(h); box.style.paddingBottom = pad + "px"; }
    row.style.overflow = "hidden";
    const a = row.animate(
      [{ height: h + "px", opacity: 1, transform: "translateY(0)", paddingTop: "12px", paddingBottom: "12px" },
       { height: "0px", opacity: 0, transform: "translateY(-45%)", paddingTop: "0px", paddingBottom: "0px" }],
      { duration: OUT_MS, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
    a.onfinish = done;
  } catch (e) { done(); }
}

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
// 出單紀錄：左下角那一疊 → 展開／收起更早的單
$("kitchen").addEventListener("click", e => {
  const b = e.target.closest("button.pile, button.foldbtn");
  if (!b) return;
  pileOpen[b.dataset.s] = !pileOpen[b.dataset.s];
  renderKitchen();
});

$("send").addEventListener("click", () => sendOrder());
$("append").addEventListener("click", openAppend);
$("aCancel").addEventListener("click", closeAppend);
$("aModal").addEventListener("click", e => { if (e.target === $("aModal")) closeAppend(); });
$("aList").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b || !b.dataset.b) return;
  closeAppend();
  sendOrder(Number(b.dataset.b));
});

// 訂單總覽：今日／歷史、選日期、結帳、取消結帳、匯出
$("done").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.t) { ovTab = b.dataset.t; }
  else if (b.dataset.d) { ovDay = b.dataset.d; }
  else if (b.dataset.a === "pay") Store.setPaid(Number(b.dataset.b), true);
  else if (b.dataset.a === "unpay") Store.setPaid(Number(b.dataset.b), false);
  else if (b.dataset.a === "export") { exportCsv(); return; }
  lastDone = "";
  renderDone();
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
renderPad();
renderTabs();
renderGrid();
renderCart();
const startView = location.hash.slice(1);
setView(["counter", "kitchen", "done"].includes(startView) ? startView : "counter");
