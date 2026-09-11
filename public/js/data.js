/* ============================================================
   داده و ذخیره‌سازی دمو (شبیه‌ساز وردپرس/ووکامرس در مرورگر)
   در پلاگین واقعی: همه‌ی این‌ها Custom Post Type + Meta هستن
   ============================================================ */
const DB_KEY  = 'caseDesigner.v2';
const CART_KEY = 'caseDesigner.cart.v2';

const PRINT_RECT = { x: 110, y: 120, w: 580, h: 1200, radius: 30 }; // فضای چاپ پیش‌فرض (مختصات موکاپ 800×1500) + شعاع گردی گوشه‌ها
const MAIN_RECT = { x: 40, y: 50, w: 720, h: 1400, radius: 90 }; // فریم اصلی طرح — دقیقاً ابعاد گوشی روی موکاپ
const CAM_RECTS = {
  iphone:  [{ x: 130, y: 150, w: 180, h: 180, r: 24 }],
  samsung: [{ x: 135, y: 150, w: 160, h: 330, r: 26 }],
  xiaomi:  [{ x: 150, y: 160, w: 320, h: 320, r: 30 }],
};

/* ---------- تولید موکاپ نمونه (SVG) ---------- */
function _lens(cx, cy, r) {
  return `<circle cx='${cx}' cy='${cy}' r='${r}' fill='#0b0b10'/>`
    + `<circle cx='${cx}' cy='${cy}' r='${r * 0.72}' fill='url(#lensG)'/>`
    + `<circle cx='${cx - r * 0.22}' cy='${cy - r * 0.25}' r='${r * 0.16}' fill='rgba(255,255,255,.45)'/>`;
}
function mockupSVG(style, c1, c2, label) {
  let cam = '';
  if (style === 'iphone') {
    cam = `<rect x='130' y='150' width='180' height='180' rx='48' fill='url(#camB)' stroke='rgba(255,255,255,.14)' stroke-width='2'/>`
      + _lens(185, 205, 34) + _lens(255, 205, 34) + _lens(185, 275, 34)
      + `<circle cx='255' cy='275' r='13' fill='#e8dcc0'/>`;
  } else if (style === 'samsung') {
    cam = `<rect x='135' y='150' width='160' height='330' rx='80' fill='url(#camB)' stroke='rgba(255,255,255,.14)' stroke-width='2'/>`
      + _lens(215, 230, 34) + _lens(215, 315, 34) + _lens(215, 400, 34)
      + `<circle cx='215' cy='452' r='9' fill='#e8dcc0'/>`;
  } else {
    cam = `<circle cx='310' cy='320' r='160' fill='url(#camB)' stroke='rgba(255,255,255,.14)' stroke-width='2'/>`
      + _lens(310, 255, 44) + _lens(245, 320, 44) + _lens(375, 320, 44) + _lens(310, 385, 44)
      + `<circle cx='352' cy='183' r='9' fill='#e8dcc0'/>`;
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1500' viewBox='0 0 800 1500'>
  <defs>
    <linearGradient id='body' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/>
    </linearGradient>
    <linearGradient id='sheen' x1='0' y1='0' x2='1' y2='0'>
      <stop offset='0' stop-color='rgba(255,255,255,.14)'/><stop offset='.35' stop-color='rgba(255,255,255,0)'/>
    </linearGradient>
    <radialGradient id='lensG' cx='.5' cy='.5' r='.5'>
      <stop offset='.5' stop-color='#1a2038'/><stop offset='.8' stop-color='#0a0d1e'/><stop offset='1' stop-color='#05070f'/>
    </radialGradient>
    <linearGradient id='camB' x1='0' y1='0' x2='0' y2='1'>
      <stop offset='0' stop-color='#26262c'/><stop offset='1' stop-color='#0f0f13'/>
    </linearGradient>
  </defs>
  <rect x='40' y='50' width='720' height='1400' rx='110' fill='url(#body)'/>
  <rect x='40' y='50' width='720' height='1400' rx='110' fill='url(#sheen)'/>
  <rect x='68' y='78' width='664' height='1344' rx='92' fill='none' stroke='rgba(0,0,0,.22)' stroke-width='3'/>
  ${cam}
  <text x='400' y='1378' text-anchor='middle' font-size='27' fill='rgba(255,255,255,.55)' font-family='Vazirmatn, Tahoma, sans-serif'>${label}</text>
  </svg>`;
}
function generateMockup(style, c1, c2, label) {
  const svg = mockupSVG(style, c1, c2, label);
  return {
    img: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
    style,
    printRect: { ...PRINT_RECT },
    mainRect: { ...MAIN_RECT },
    camRects: CAM_RECTS[style].map(c => ({ ...c })),
    printMm: { w: 66, h: 138 },   // ابعاد واقعی چاپ روی قاب (میلی‌متر) — مربوط به فضای چاپ
    mainMm: { w: 74, h: 148 },    // ابعاد فریم اصلی (کل گوشی) — برای برش فایل نهایی
    dpi: 300,
    mainColor: '#10b981',
  };
}

/* ---------- استیکرهای پیش‌فرض (SVG) ---------- */
function stickerSVG(body) {
  return "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'>${body}</svg>`);
}
const STICKERS = [
  { id: 'heart', name: 'قلب', url: stickerSVG(`<path d='M120 205 C 45 145, 32 62, 76 40 C 102 27, 118 46, 120 58 C 122 46, 138 27, 164 40 C 208 62, 195 145, 120 205 Z' fill='#e64553'/><circle cx='92' cy='62' r='9' fill='rgba(255,255,255,.5)'/>`) },
  { id: 'star', name: 'ستاره', url: stickerSVG(`<path d='M120 22 L147 83 L214 87 L163 130 L180 194 L120 157 L60 194 L77 130 L26 87 L93 83 Z' fill='#f5c518'/>`) },
  { id: 'flower', name: 'گل', url: stickerSVG(`<g fill='#ff8fab'><circle cx='120' cy='76' r='24'/><circle cx='86' cy='100' r='24'/><circle cx='154' cy='100' r='24'/><circle cx='98' cy='144' r='24'/><circle cx='142' cy='144' r='24'/></g><circle cx='120' cy='110' r='26' fill='#ffd166'/>`) },
  { id: 'cat', name: 'گربه', url: stickerSVG(`<path d='M62 60 L72 20 L112 44 L128 44 L168 20 L178 60 Z' fill='#f4a261'/><circle cx='120' cy='130' r='82' fill='#f4a261'/><circle cx='95' cy='115' r='7' fill='#3b2f2f'/><circle cx='145' cy='115' r='7' fill='#3b2f2f'/><path d='M112 135 L128 135 L120 148 Z' fill='#e76f51'/><path d='M120 148 L120 160 M120 160 L100 168 M120 160 L140 168' stroke='#3b2f2f' stroke-width='4' stroke-linecap='round' fill='none'/>`) },
  { id: 'dog', name: 'سگ', url: stickerSVG(`<ellipse cx='62' cy='120' rx='26' ry='42' fill='#a9714b'/><ellipse cx='178' cy='120' rx='26' ry='42' fill='#a9714b'/><circle cx='120' cy='125' r='75' fill='#d4a373'/><circle cx='96' cy='112' r='7' fill='#3b2f2f'/><circle cx='144' cy='112' r='7' fill='#3b2f2f'/><ellipse cx='120' cy='135' rx='13' ry='10' fill='#3b2f2f'/>`) },
  { id: 'smiley', name: 'خنده', url: stickerSVG(`<circle cx='120' cy='120' r='92' fill='#ffd166'/><circle cx='90' cy='105' r='10' fill='#3b2f2f'/><circle cx='150' cy='105' r='10' fill='#3b2f2f'/><path d='M78 140 Q120 182 162 140' stroke='#3b2f2f' stroke-width='9' stroke-linecap='round' fill='none'/>`) },
  { id: 'icecream', name: 'بستنی', url: stickerSVG(`<path d='M88 205 L152 205 L138 120 L102 120 Z' fill='#d97706'/><circle cx='120' cy='88' r='46' fill='#f8a4b8'/><circle cx='104' cy='70' r='12' fill='#e64553'/>`) },
  { id: 'music', name: 'موزیک', url: stickerSVG(`<path d='M150 40 L92 62 L92 150 Q80 165 92 165 Q110 165 110 140 L110 88 L146 74 L146 138 Q134 153 146 153 Q164 153 164 128 L164 40 Z' fill='#6d28d9'/>`) },
  { id: 'sun', name: 'خورشید', url: stickerSVG(`<g stroke='#fbbf24' stroke-width='12' stroke-linecap='round'><path d='M120 28 L120 8 M120 212 L120 232 M28 120 L8 120 M212 120 L232 120 M55 55 L41 41 M185 185 L199 199 M185 55 L199 41 M55 185 L41 199'/></g><circle cx='120' cy='120' r='48' fill='#fbbf24'/>`) },
  { id: 'moon', name: 'ماه', url: stickerSVG(`<path d='M175 160 A78 78 0 1 1 62 58 A62 62 0 1 0 175 160 Z' fill='#6366f1'/>`) },
  { id: 'rainbow', name: 'رنگین‌کمان', url: stickerSVG(`<g fill='none' stroke-linecap='round'><path d='M40 195 A85 85 0 0 1 200 195' stroke='#e64553' stroke-width='17'/><path d='M55 195 A70 70 0 0 1 185 195' stroke='#f5c518' stroke-width='17'/><path d='M70 195 A55 55 0 0 1 170 195' stroke='#4f86f7' stroke-width='17'/><path d='M85 195 A40 40 0 0 1 155 195' stroke='#3fb68b' stroke-width='17'/></g>`) },
  { id: 'cake', name: 'کیک', url: stickerSVG(`<rect x='62' y='130' width='116' height='62' rx='10' fill='#f8a4b8'/><rect x='62' y='130' width='116' height='20' fill='#fff'/><rect x='72' y='90' width='96' height='50' rx='8' fill='#e64553'/><rect x='114' y='40' width='12' height='52' fill='#f5c518'/><path d='M118 30 Q128 18 140 26' fill='#ff8fab'/>`) },
  { id: 'bolt', name: 'آذرخش', url: stickerSVG(`<path d='M132 18 L62 130 L108 130 L88 222 L178 100 L126 100 Z' fill='#fbbf24'/>`) },
  { id: 'gift', name: 'هدیه', url: stickerSVG(`<rect x='52' y='90' width='136' height='110' rx='10' fill='#e64553'/><rect x='52' y='90' width='136' height='34' fill='#c22a3c'/><rect x='104' y='70' width='32' height='130' fill='#ffd166'/><path d='M104 78 Q120 40 152 52 Q132 70 120 78 Q108 70 88 52 Q120 40 136 78 Z' fill='#ffd166'/>`) },
  { id: 'paw', name: 'پنجه', url: stickerSVG(`<g fill='#8b5cf6'><ellipse cx='120' cy='140' rx='48' ry='40'/><ellipse cx='52' cy='98' rx='20' ry='25'/><ellipse cx='104' cy='58' rx='20' ry='25'/><ellipse cx='158' cy='58' rx='20' ry='25'/><ellipse cx='192' cy='98' rx='20' ry='25'/></g>`) },
];

/* ---------- طرح‌های آماده (الگوهای تولیدشده) ---------- */
function patternCanvas(draw) {
  const c = document.createElement('canvas'); c.width = 420; c.height = 880;
  draw(c.getContext('2d'), 420, 880);
  return c.toDataURL('image/png');
}
const PATTERNS = [
  { id: 'stripes', name: 'راه‌راه رنگی', gen: (x, w, h) => {
      x.save(); x.translate(w / 2, h / 2); x.rotate(-0.35); x.translate(-w * 1.6, -h * 1.6);
      const cols = ['#fde68a', '#fca5a5', '#c4b5fd', '#93c5fd', '#a7f3d0'];
      for (let i = 0; i < 30; i++) { x.fillStyle = cols[i % 5]; x.fillRect(i * 70, -h, 70, h * 4); }
      x.restore();
    } },
  { id: 'dots', name: 'خال‌خالی', gen: (x, w, h) => {
      x.fillStyle = '#fdf2f8'; x.fillRect(0, 0, w, h);
      const cols = ['#f472b6', '#a78bfa', '#60a5fa', '#fbbf24', '#34d399'];
      for (let r = 0; r < 18; r++) for (let c = 0; c < 9; c++) {
        x.fillStyle = cols[(r + c) % 5];
        x.beginPath(); x.arc(c * 52 + (r % 2 ? 26 : 0), r * 52 + 10, 15, 0, 7); x.fill();
      }
    } },
  { id: 'gradient', name: 'گرادیان صورتی', gen: (x, w, h) => {
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#f9a8d4'); g.addColorStop(.5, '#a78bfa'); g.addColorStop(1, '#7dd3fc');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    } },
  { id: 'marble', name: 'مرمری', gen: (x, w, h) => {
      x.fillStyle = '#f1f5f9'; x.fillRect(0, 0, w, h);
      const cols = ['#64748b', '#94a3b8', '#475569', '#7c8ba1'];
      for (let i = 0; i < 60; i++) {
        x.fillStyle = cols[i % 4]; x.globalAlpha = .05 + Math.random() * .08;
        x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 110, 12 + Math.random() * 70, Math.random() * 3, 0, 7); x.fill();
      }
      x.globalAlpha = 1;
      for (let i = 0; i < 8; i++) {
        x.strokeStyle = cols[i % 4]; x.globalAlpha = .07; x.lineWidth = 22 + Math.random() * 26;
        x.beginPath(); x.moveTo(Math.random() * w, Math.random() * h);
        x.quadraticCurveTo(Math.random() * w, Math.random() * h, Math.random() * w, Math.random() * h); x.stroke();
      }
      x.globalAlpha = 1;
    } },
  { id: 'galaxy', name: 'کهکشان', gen: (x, w, h) => {
      x.fillStyle = '#0b1020'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) {
        x.fillStyle = ['#ffffff', '#93c5fd', '#f0abfc', '#fde68a'][i % 4];
        x.globalAlpha = .25 + Math.random() * .75;
        x.beginPath(); x.arc(Math.random() * w, Math.random() * h, .5 + Math.random() * 2.2, 0, 7); x.fill();
      }
      x.globalAlpha = 1;
      ['rgba(99,102,241,.16)', 'rgba(236,72,153,.12)', 'rgba(56,189,248,.12)'].forEach((c, i) => {
        const g = x.createRadialGradient(w * (i + 1) / 4, h / 3, 0, w * (i + 1) / 4, h / 3, 120);
        g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      });
    } },
  { id: 'waves', name: 'موج', gen: (x, w, h) => {
      x.fillStyle = '#e0f2fe'; x.fillRect(0, 0, w, h);
      [['#22d3ee', 0], ['#818cf8', 40], ['#f472b6', 80]].forEach(([c, dy]) => {
        x.strokeStyle = c; x.lineWidth = 26; x.beginPath();
        for (let t = 0; t <= w; t += 8) { const y = h / 2 + dy + Math.sin(t / 40) * 46; t ? x.lineTo(t, y) : x.moveTo(t, y); }
        x.stroke();
      });
    } },
  { id: 'geo', name: 'هندسی', gen: (x, w, h) => {
      x.fillStyle = '#fef3c7'; x.fillRect(0, 0, w, h);
      const cols = ['#fda4af', '#a5b4fc', '#86efac', '#fcd34d', '#f0abfc'];
      for (let i = 0; i < 42; i++) {
        x.fillStyle = cols[i % 5]; x.globalAlpha = .75;
        const a = [Math.random() * w, Math.random() * h], b = [Math.random() * w, Math.random() * h], c = [Math.random() * w, Math.random() * h];
        x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(c[0], c[1]); x.closePath(); x.fill();
      }
      x.globalAlpha = 1;
    } },
  { id: 'checker', name: 'شطرنجی', gen: (x, w, h) => {
      for (let r = 0; r < 18; r++) for (let c = 0; c < 9; c++) {
        x.fillStyle = (r + c) % 2 ? '#a5b4fc' : '#e0e7ff';
        x.fillRect(c * 52, r * 52, 52, 52);
      }
    } },
];

/* ---------- دیتابیس دمو (localStorage) ---------- */
const DB = {
  seed() {
    const brands = [
      { id: 'apple', name: 'آیفون', en: 'iPhone' },
      { id: 'samsung', name: 'سامسونگ', en: 'Samsung' },
      { id: 'xiaomi', name: 'شیائومی', en: 'Xiaomi' },
    ];
    const M = (id, brandId, name, style, c1, c2, price) => ({
      id, brandId, name, price, style, colors: { c1, c2 },
      mockup: generateMockup(style, c1, c2, name),
    });
    const models = [
      M('iphone-16-pro', 'apple', 'iPhone 16 Pro', 'iphone', '#4b4b55', '#2e2e35', 379000),
      M('iphone-16-pro-max', 'apple', 'iPhone 16 Pro Max', 'iphone', '#3d4a5e', '#232c3a', 399000),
      M('iphone-15', 'apple', 'iPhone 15', 'iphone', '#e8c4cf', '#c79aa9', 349000),
      M('iphone-14', 'apple', 'iPhone 14', 'iphone', '#2a2f45', '#171a26', 329000),
      M('galaxy-s24-ultra', 'samsung', 'Galaxy S24 Ultra', 'samsung', '#6b7280', '#3f434d', 379000),
      M('galaxy-s23', 'samsung', 'Galaxy S23', 'samsung', '#7fa08a', '#4c6a59', 339000),
      M('galaxy-a55', 'samsung', 'Galaxy A55', 'samsung', '#b7a8d8', '#8577ae', 289000),
      M('xiaomi-14-ultra', 'xiaomi', 'Xiaomi 14 Ultra', 'xiaomi', '#3a3a3f', '#1d1d22', 359000),
      M('redmi-note-13-pro', 'xiaomi', 'Redmi Note 13 Pro', 'xiaomi', '#3f5a86', '#253552', 259000),
      M('poco-x6-pro', 'xiaomi', 'Poco X6 Pro', 'xiaomi', '#d9c168', '#a98f3e', 279000),
    ];
    return {
      settings: {
        storeName: 'تیساکیس', currency: 'تومان', defaultDpi: 300,
        guidesOn: true, guidesNote: 'برش دوربین فقط در پیش‌نمایش اعمال می‌شود؛ فایل ارسالی به چاپخانه بدون برش ذخیره می‌گردد.',
        printColor: '#304ffe', camColor: '#ed1944', mainColor: '#10b981',
      },
      brands, models,
      stickers: STICKERS.map(s => ({ id: s.id, name: s.name, url: s.url })),
      designs: PATTERNS.map(p => ({ id: p.id, name: p.name, url: patternCanvas(p.gen) })),
      orders: [],
    };
  },
  load() { try { return JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { return null; } },
  save(db) { this._cache = db; localStorage.setItem(DB_KEY, JSON.stringify(db)); },
  get() {
    if (this._cache) return this._cache; // کش حافظه — جلوگیری از پارس مکرر دیتابیس سنگین (فایل‌های چاپ چند مگابایتی)
    let db = this.load();
    if (!db) { db = this.seed(); this.save(db); }
    else this._cache = db;
    return db;
  },
  reset() { localStorage.removeItem(DB_KEY); localStorage.removeItem(CART_KEY); this._cache = null; return this.get(); },
};

function getModel(id) { return DB.get().models.find(m => m.id === id); }
function getBrand(id) { return DB.get().brands.find(b => b.id === id); }
function saveModel(model) {
  const db = DB.get();
  const i = db.models.findIndex(m => m.id === model.id);
  if (i >= 0) db.models[i] = model; else db.models.push(model);
  DB.save(db);
}
function deleteModel(id) {
  const db = DB.get(); db.models = db.models.filter(m => m.id !== id); DB.save(db);
}
function nextOrderId() {
  const db = DB.get();
  return 1000 + db.orders.length + 1;
}

/* ---------- سبد خرید ---------- */
function cartGet() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { return []; } }
function cartSet(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); document.dispatchEvent(new CustomEvent('cart:changed')); }
function cartAdd(item) { const c = cartGet(); c.push(item); cartSet(c); }
function cartClear() { cartSet([]); }

/* ---------- ابزارهای کمکی ---------- */
const faNum = n => (n ?? 0).toLocaleString('fa-IR');
const CUR = (window.CaseDesignerData && window.CaseDesignerData.currency) || 'تومان';
const money = n => faNum(n) + ' ' + CUR;
const faDate = d => (d || new Date()).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });
const isRTLText = t => /[\u0590-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(t || '');
function uid() { return 'id-' + Math.random().toString(36).slice(2, 9); }

/* ============================================================
   پل وردپرس: وقتی صفحه با شورت‌کد [case_designer] رندر شده،
   داده‌ها (مدل‌ها/استیکرها/طرح‌ها) همان چیزهایی است که ادمین در
   پنل «قاب‌ساز» ذخیره کرده — مستقیم توسط PHP در صفحه تزریق می‌شود
   (CaseDesignerData.models/stickers/designs) و نیازی به REST ندارد.
   REST فقط برای نوشتن (افزودن به سبد) به‌کار می‌رود.
   در حالت دمو (index.html) این بخش غیرفعال است و localStorage کار می‌کند.
   ============================================================ */
const CaseDesignerDB = (function () {
  const CD = window.CaseDesignerData;
  if (!CD || !CD.restUrl) return null;

  const BRANDS = [
    { id: 'apple', name: 'آیفون', en: 'iPhone' },
    { id: 'samsung', name: 'سامسونگ', en: 'Samsung' },
    { id: 'xiaomi', name: 'شیائومی', en: 'Xiaomi' },
  ];
  const styleOf = brandId => brandId === 'apple' ? 'iphone' : brandId === 'samsung' ? 'samsung' : 'xiaomi';
  const FALLBACK_COLORS = { iphone: ['#4b4b55', '#2e2e35'], samsung: ['#6b7280', '#3f434d'], xiaomi: ['#3a3a3f', '#1d1d22'] };
  const DEFAULT_GUIDES_NOTE = 'برش دوربین فقط در پیش‌نمایش اعمال می‌شود؛ فایل ارسالی به چاپخانه بدون برش ذخیره می‌گردد.';

  let db = null;

  function settings() {
    return Object.assign({
      storeName: CD.storeName || 'فروشگاه',
      currency: CD.currency || 'تومان',
      defaultDpi: 300, guidesOn: true, guidesNote: DEFAULT_GUIDES_NOTE,
      printColor: '#304ffe', camColor: '#ed1944', mainColor: '#10b981',
    }, CD.settings || {});
  }

  function buildDb(models, stickers, designs) {
    return {
      settings: settings(),
      brands: BRANDS,
      models: (models || []).map(rm => {
        const style = styleOf(rm.brandId);
        const m = rm.mockup || {};
        const img = m.img || generateMockup(style, ...(FALLBACK_COLORS[style] || FALLBACK_COLORS.iphone), rm.name).img;
        return {
          id: String(rm.id),
          brandId: rm.brandId || 'apple',
          name: rm.name || 'بدون نام',
          price: rm.price || 0,
          productId: rm.productId || 0,
          style,
          colors: { c1: (FALLBACK_COLORS[style] || FALLBACK_COLORS.iphone)[0], c2: (FALLBACK_COLORS[style] || FALLBACK_COLORS.iphone)[1] },
          mockup: {
            img,
            style,
            printRect: Object.assign({ x: 110, y: 120, w: 580, h: 1200, radius: 0 }, m.printRect || {}),
            mainRect: Object.assign({ x: 40, y: 50, w: 720, h: 1400, radius: 90 }, m.mainRect || {}),
            camRects: (m.camRects || []).map(c => ({ x: +c.x, y: +c.y, w: +c.w, h: +c.h, r: +c.r || 0 })),
            printMm: m.printMm || { w: 66, h: 138 },
            mainMm: m.mainMm || { w: 74, h: 148 },
            dpi: m.dpi || 300,
            mainColor: m.mainColor || '#10b981',
          },
        };
      }),
      stickers: (stickers || []).filter(s => s.url).map(s => ({ id: String(s.id), name: s.name, url: s.url })),
      designs: (designs || []).filter(d => d.url).map(d => ({ id: String(d.id), name: d.name, url: d.url })),
      orders: [],
    };
  }

  async function api(path, opts) {
    const res = await fetch(CD.restUrl + path, Object.assign({
      headers: { 'X-WP-Nonce': CD.nonce || '' },
    }, opts));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // به‌روزرسانی از REST (اختیاری — وقتی تزریق سمت سرور ناقص باشد)
  async function refresh() {
    const [models, stickers, designs] = await Promise.all([
      api('/models'),
      api('/stickers').catch(() => []),
      api('/designs').catch(() => []),
    ]);
    db = buildDb(models, stickers, designs);
    document.dispatchEvent(new CustomEvent('db:ready'));
    return db;
  }

  // در حالت وردپرس DB.get به دیتابیس تزریق‌شده اشاره می‌کند (localStorage بلااستفاده)
  db = buildDb(CD.models, CD.stickers, CD.designs);
  DB.get = () => db || { settings: settings(), brands: BRANDS, models: [], stickers: [], designs: [], orders: [] };
  DB.save = () => {};
  DB.load = () => db;
  DB.reset = () => {};
  DB.seed = () => db;

  return { isWp: true, refresh, get: () => db, ready: Promise.resolve(db) };
})();
window.CaseDesignerDB = CaseDesignerDB; // const در سطح اسکریپت روی window نمی‌نشیند — صریح تعریفش می‌کنیم
