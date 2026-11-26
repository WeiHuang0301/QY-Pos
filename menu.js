// ===== 菜單設定：改這個檔案就能換成你自己的菜單 =====
//
// 【基本結構】
//   group    ：大分類（鍋物 / 加點），畫面上方第一排按鈕
//   category ：小分類（經典鍋物、蔬菜…），畫面上方第二排按鈕
//   station  ：這個分類的單子送去哪個出餐區（見下面的 STATIONS）
//   items    ：該分類的餐點，每個餐點至少要有 name（名稱）和 price（價格）
//              （餐點不需要再自己取 id 了，系統會自動編號）
//
// 【餐點可以加的設定】（全部都是選填）
//   options  ：「可選」的客製，可勾可不勾，例如 ["不加蔥段", "不加香菜"]
//   choices  ：「必選一個」的項目，例如肉品。寫法：
//              choices: [ { label: "肉品", options: ["豬肉", "牛肉"] } ]
//              選項要加價就寫成 { name: "牛肉", extra: 30 }
//              在那一組加上 required: false，就變成「選填」（可以不選）
//   note     ：按鈕上的小字說明
//   station  ：這道餐單獨指定出餐區（會蓋過分類的設定）
//   custom: true ：點了之後讓櫃台手動輸入品名和價格（季節時蔬、期間限定）
//   mark     ："hot"（橘紅色小直條）或 "veg"（綠色小直條）

// ----- 出餐區：左邊是代號（不要改），右邊是畫面上顯示的名稱 -----
const STATIONS = {
  soup: "湯品・切肉",
  prep: "其他出餐區",
  counter: "櫃檯"
};

// ----- 小工具 -----
// list(價格, [名稱, 名稱, ...], 共同設定)：一次建立多個「同價」的餐點
const list = (price, names, extra = {}) => names.map(name => ({ name, price, ...extra }));

// ----- 常用的必選 / 選填組合 -----
const MEAT_PICK = { label: "肉品", options: ["豬肉", "牛肉", "雞肉", "羊肉"] };

// extra means: 加價額＄
const CLASSIC_SIZE = {
  label: "份量",
  options: ["經典圓盤", { name: "肉+半份", extra: 50 }, { name: "肉+乙份", extra: 90 }]
};

// 每鍋附餐：選填，不選也不退錢。烏龍、拉麵補差價（20-10、25-10）
const VEG_SAUCE = ["素沙茶及素醬油", "單素沙茶", "單素醬油"];
const SET_MEAL = {
  label: "附餐主食", required: false, prefix: "附餐：",
  options: ["飯", "冬粉", "科學麵", "意麵", "蛋", "寬粉", "王子麵",
            { name: "日式烏龍", extra: 10 }, { name: "韓國拉麵", extra: 15 }]
};

const MENU = [
  // ================= 鍋物（單子送湯品・切肉區） =================
  {
    group: "鍋物", category: "經典鍋物", station: "soup", /* choices: [SET_MEAL], */
    items: list(230, ["梅花豬肉鍋", "五花豬肉鍋", "上等雞肉鍋", "大眾牛肉鍋", "上選羊肉鍋"],
                { choices: [CLASSIC_SIZE] })
  },
  {
    group: "鍋物", category: "風味鍋物", station: "soup", /* choices: [SET_MEAL], */
    items: [
      { name: "源佬麻辣鍋", price: 300, note: "無牛油・附油條", choices: [MEAT_PICK],
        options: ["不加油條", "不加蔥段", "不加香菜"] },
      ...list(290, ["慢熬胡椒鍋", "養生藥膳鍋", "香醇鮮奶鍋", "田園番茄鍋", "韓式泡菜鍋"],
              { choices: [MEAT_PICK] }),
      // 酸菜鍋的豬肉預設是五花；客人要求梅花才勾「改梅花豬」
      { name: "東北酸菜鍋", price: 290,
        choices: [{ label: "肉品", options: ["豬肉(五花)", "牛肉", "雞肉", "羊肉"] }],
        options: ["改梅花豬"] },
      { name: "蛤蜊雞腿鍋",note:["附米酒"], price: 290, options:["不需米酒"]}
    ]
  },
  {
    group: "鍋物", category: "海陸鍋物", station: "soup", /* choices: [SET_MEAL], */
    items: [
      { name: "五福海陸鍋", price: 500, choices: [MEAT_PICK] },
      { name: "四喜海陸鍋", price: 330, choices: [MEAT_PICK] },
      { name: "鮮蝦海陸鍋", price: 400, choices: [MEAT_PICK] },
      ...list(300, ["小卷海陸鍋", "蛤蜊海陸鍋", "鯛魚海陸鍋"], { choices: [MEAT_PICK] })
    ]
  },
  {
    group: "鍋物", category: "御肉鍋物", station: "soup", /* choices: [SET_MEAL], */
    items: [
      { name: "招牌牛肉鍋", price: 450 },
      { name: "霜降牛肉鍋", price: 350 },
      { name: "御牛五花鍋", price: 320 },
      { name: "松阪豬肉鍋", price: 350 },
      { name: "黑毛豬肉鍋", price: 340 }
    ]
  },
  {
    group: "鍋物", category: "海味鍋物", station: "soup", /* choices: [SET_MEAL], */
    items: [
      { name: "海鮮總匯鍋", price: 380 },
      { name: "鮮蝦蛤蜊鍋", price: 340 },
      { name: "挪威鮭魚頭鍋", price: 340 },
      { name: "深海鱸魚片鍋", price: 350 },
      { name: "台灣鯛魚片鍋", price: 250 }
    ]
  },
  {
    group: "鍋物", category: "素食鍋物", station: "soup",  options: VEG_SAUCE, optLabel: "素食醬料", /* choices: [SET_MEAL], */
    items: [
      { name: "原味蔬素鍋", price: 240 },
      { name: "源佬麻辣素鍋", price: 290 },
      { name: "慢熬胡椒素鍋", price: 280 },
      { name: "養生藥膳素鍋", price: 280 },
      { name: "香醇鮮奶素鍋", price: 280 },
      { name: "田園蕃茄素鍋", price: 280 }
    ]
  },

  // ================= 加點區 =================
  {
    group: "加點", category: "主食", station: "prep",
    items: [
      { name: "飯", price: 10, station: "counter" },
      ...list(10, [ "冬粉", "科學麵", "意麵", "蛋", "寬粉", "王子麵"]),
      { name: "日式烏龍", price: 20 },
      { name: "韓國拉麵", price: 25 }
    ]
  },
  {
    group: "加點", category: "蔬菜", station: "prep",
    items: [
      ...list(35, ["南瓜", "玉米", "金針菇", "高麗菜", "地瓜塊", "芋頭", "香菇",
                   "秀珍菇", "青花菜", "番茄", "木耳", "杏鮑菇", "玉米筍"]),
      { name: "季節時蔬", price: 35, custom: true }
    ]
  },
  {
    group: "加點", category: "肉盤", station: "soup",
    items: [
      { name: "招牌牛", price: 350 },
      { name: "霜降牛", price: 250 },
      { name: "牛五花", price: 220 },
      { name: "大眾牛", price: 130 },
      { name: "松阪豬", price: 250 },
      { name: "黑毛豬", price: 240 },
      { name: "梅花豬", price: 130 },
      { name: "五花豬", price: 130 },
      { name: "上選羊", price: 130 },
      { name: "上等雞", price: 130 },
      { name: "嫩雞腿", price: 130 }
    ]
  },
  {
    group: "加點", category: "海鮮", station: "prep",
    items: [
      { name: "海鮮盤", price: 280 },
      { name: "鱸魚片", price: 250 },
      { name: "鯛魚片", price: 150 },
      { name: "蝦仁漿", price: 90 },
      { name: "花枝漿", price: 90 },
      { name: "小卷", price: 90 },
      { name: "蚵仔", price: 90 },
      { name: "蝦子", price: 180 },
      { name: "蛤蜊", price: 90 }
    ]
  },
  {
    group: "加點", category: "火鍋料", station: "prep",
    items: [
      ...list(45, ["魚冊卷", "蟹肉棒", "綜合餃", "綜合麻糬"]),
      { name: "芋頭貢丸", price: 45 },
      ...list(35, ["貢丸", "魚丸", "蛋餃", "燕餃", "魚餃", "米血", "烏蛋", "甜不辣", "鑫鑫腸", "黃金魚蛋"]),
      ...list(35, ["豆皮", "蒟蒻", "油條", "凍豆腐", "板豆腐"], { mark: "veg" }),
      { name: "期間限定", price: 0, custom: true }
    ]
  },
  {
    group: "加點", category: "小品", station: "prep",
    items: [
      { name: "麻辣鴨血", price: 45, mark: "hot" },
      { name: "麻辣滷肥腸", price: 75, mark: "hot" }
    ]
  }
];
