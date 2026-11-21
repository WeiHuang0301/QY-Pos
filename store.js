// ===== 訂單儲存層 =====
// 目前：訂單存在這台裝置的瀏覽器裡（localStorage）。
// 之後要接出單機或多台裝置同步，只要換掉這個檔案，app.js 不用改。
const Store = {
  KEY: "pos_counter_orders_v1",
// locoalStorage by Safari(一个贴了标签的瀏覽器置物柜)

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

  // 某個出餐區把這張單做完了
  markDone(id, station) {
    const list = this.load();
    const order = list.find(o => o.id === id);
    if (order) {
      order.done = order.done || [];
      if (!order.done.includes(station)) order.done.push(station);
    }
    this.save(list);
  },

  // 今天的第幾張單（每天從 1 重新開始）
  nextNo() {
    const today = new Date().toDateString();
    return this.load().filter(o => new Date(o.time).toDateString() === today).length + 1;
  },

  // 只保留最近 2 天的訂單，避免資料越存越多
  prune() {
    const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
    this.save(this.load().filter(o => new Date(o.time).getTime() > cutoff));
  }
};
