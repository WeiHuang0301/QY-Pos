// ===== 訂單儲存層 =====
// 目前：訂單存在這台裝置的瀏覽器裡（localStorage）。
// 之後要接出單機或多台裝置同步，只要換掉這個檔案，app.js 不用改。
//
// 名詞：每按一次「送出」或「追加點餐」會產生一張「出單」（ticket，印給廚房的單子）。
//   同一桌的第一張出單和後來追加的出單，屬於同一張「帳單」（bill），結帳時一起結。
//   出單的 bill = 帳單編號（第一張出單的 id），extra = 第幾次追加（第一張是 0）。
const Store = {
  KEY: "pos_orders_v2",     // ← 你的版本如果改過這個名字，請保留你自己的，不要換成這個
  KEEP_DAYS: 10,            // 保留幾天的歷史訂單（今天以外）

  load() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || []; }
    catch (e) { return []; }
  },

  save(list) {
    localStorage.setItem(this.KEY, JSON.stringify(list));
  },

  add(order) {
    const list = this.load();
    list.push(order);
    this.save(list);
  },

  // 結帳／取消結帳：整張帳單（含所有追加）一起改
  setPaid(billId, paid) {
    const list = this.load();
    list.forEach(o => {
      if ((o.bill || o.id) === billId) {
        o.paid = !!paid;
        o.paidAt = paid ? new Date().toISOString() : null;
      }
    });
    this.save(list);
  },

  // 今天的第幾張帳單（每天從 1 重新開始；追加的出單不算新的一號）
  nextNo() {
    const today = new Date().toDateString();
    return this.load().filter(o => !o.extra && new Date(o.time).toDateString() === today).length + 1;
  },

  // 只保留最近 KEEP_DAYS 天（加今天）的訂單，更早的自動刪除
  prune() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const cutoff = d.getTime() - this.KEEP_DAYS * 24 * 60 * 60 * 1000;
    this.save(this.load().filter(o => new Date(o.time).getTime() >= cutoff));
  }
};
