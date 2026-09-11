/* ============================================================
   پنل ادمین وردپرس — بازطراحی «کاغذ گرم و فیروزه‌ای عمیق» (v3)
   - کاملاً مستقل از فایل‌های فرانت‌اند (بدون وابستگی به app.js)
   - اتصال واقعی به REST API وردپرس؛ در دمو با localStorage کار می‌کند
   - آیکن‌ها فقط SVG خطی درون‌خطی؛ تب‌ها با localStorage و hash ماندگارند
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- helpers ---------------- */
  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const faNum = n => (n ?? 0).toLocaleString('fa-IR');
  const money = n => faNum(n) + ' تومان';
  const faDate = d => { try { return new Date(d).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return d || ''; } };
  const uid = () => 'id-' + Math.random().toString(36).slice(2, 9);
  const fileToDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

  /* ---------- خط لولهٔ تصویر: اعتبارسنجی + کوچک‌سازی قبل از ذخیره ----------
     عکس خام دوربین چند مگابایت است و مرورگرها HEIC را نمی‌خوانند؛
     این تابع عکس را رمزگشایی می‌کند (تشخیص فرمت‌های خراب/پشتیبانی‌نشده)،
     به حداکثر ۱۶۰۰px کوچک می‌کند و خروجی فشرده می‌دهد. */
  function processImageFile(file, maxDim = 1600) {
    return new Promise(resolve => {
      const fail = msg => { toast(msg, 'err'); resolve(null); };
      if (!file || !file.type.startsWith('image/')) return fail('فایل انتخاب‌شده تصویر نیست');
      fileToDataURL(file).then(url => {
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) return fail('تصویر قابل خواندن نیست');
          const scale = Math.min(1, maxDim / Math.max(w, h));
          const big = scale < 1 || file.size > 2_000_000;
          if (!big) return resolve({ url, w, h }); // کوچک است — همان فایل
          const c = document.createElement('canvas');
          c.width = Math.round(w * scale); c.height = Math.round(h * scale);
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, c.width, c.height);
          const out = file.type === 'image/png' && scale > 0.5 ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85);
          resolve({ url: out, w: c.width, h: c.height, downscaled: true });
        };
        img.onerror = () => fail('این فرمت تصویر پشتیبانی نمی‌شود (مثلاً HEIC). لطفاً JPG یا PNG انتخاب کنید');
        img.src = url;
      }).catch(() => fail('خواندن فایل ناموفق بود'));
    });
  }

  const IS_WP = !!window.CaseDesignerAdmin;                       // داخل وردپرس واقعی؟
  const REST_BASE = IS_WP ? (window.CaseDesignerAdmin.restUrl || '/wp-json/case-designer/v1') : null;
  const NONCE = IS_WP ? (window.CaseDesignerAdmin.nonce || '') : '';
  const VERSION = (IS_WP && window.CaseDesignerAdmin.version) || '1.6.9';

  /* ---------------- آیکن‌های SVG خطی درون‌خطی (stroke 2، سر گرد) ---------------- */
  const ICONS = {
    logo: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    gauge: '<path d="M4.5 13.5a7.5 7.5 0 1 1 15 0"/><path d="M12 13.5l3.4-3.4"/><path d="M5.5 17.5h13"/>',
    mobile: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    heart: '<path d="M12 20.2S5.2 15.6 3 11.1A5.3 5.3 0 0 1 12 6.5a5.3 5.3 0 0 1 9 4.6C18.8 15.6 12 20.2 12 20.2z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    cart: '<path d="M3 3h2l2.2 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7H6"/><circle cx="9.5" cy="20.5" r="1.4"/><circle cx="17.5" cy="20.5" r="1.4"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l4.5-4 3.5 3 3-2.5 4.5 3.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none"/>',
    warning: '<path d="M12 3.5L21.5 20h-19z"/><path d="M12 10v4"/><circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4"/><path d="M8 21v-6h8v6"/>',
    download: '<path d="M12 4v10M7 10l5 5 5-5"/><path d="M4 19h16"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2"/><path d="M6.5 7l.8 12.2a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8L17.5 7"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    doc: '<path d="M6 3.5h8l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5A1.5 1.5 0 0 1 6.5 3.5z"/><path d="M14 3.5V8h4"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>',
    spark: '<path d="M13 2L5 13.5h6L11 22l8-11.5h-6z"/>',
    camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.5-2h4L15.5 6h2A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.2"/>',
    bullseye: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    flask: '<path d="M10 3h4M11 3v5.5L5.5 17a2.2 2.2 0 0 0 1.9 3.3h9.2a2.2 2.2 0 0 0 1.9-3.3L13 8.5V3"/>',
    boxes: '<path d="M3.5 7.5L12 3l8.5 4.5-8.5 4.5z"/><path d="M3.5 12.2L12 16.7l8.5-4.5"/><path d="M3.5 16.8L12 21.5l8.5-4.7"/><path d="M12 16.7V21.5"/>',
    link: '<path d="M9 15l6-6"/><path d="M8.5 12.5l-2 2a3.5 3.5 0 0 0 5 5l2-2"/><path d="M15.5 11.5l2-2a3.5 3.5 0 0 0-5-5l-2 2"/>',
  };
  const ic = (name, size = 15) => `<svg class="cd-ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.mobile}</svg>`;

  const BRANDS = [
    { id: 'apple', name: 'آیفون', ic: 'mobile' },
    { id: 'samsung', name: 'سامسونگ', ic: 'mobile' },
    { id: 'xiaomi', name: 'شیائومی', ic: 'mobile' },
  ];
  const brandOf = id => BRANDS.find(b => b.id === id) || { id, name: id, ic: 'mobile' };

  const PRINT_RECT = { x: 110, y: 120, w: 580, h: 1200 };
  const MAIN_RECT = { x: 40, y: 50, w: 720, h: 1400, radius: 90 };
  const CAM_RECTS = {
    iphone: [{ x: 130, y: 150, w: 180, h: 180 }],
    samsung: [{ x: 135, y: 150, w: 160, h: 330 }],
    xiaomi: [{ x: 150, y: 160, w: 320, h: 320 }],
  };

  /* ---------- تولید موکاپ نمونه (SVG) — مستقل از فرانت‌اند تا در wp-admin هم کار کند ---------- */
  const MOCK_PALETTES = { apple: ['#4b4b55', '#2e2e35'], samsung: ['#6b7280', '#3f434d'], xiaomi: ['#3a3a3f', '#1d1d22'] };
  function mockLens(cx, cy, r) {
    return `<circle cx='${cx}' cy='${cy}' r='${r}' fill='#0b0b10'/>`
      + `<circle cx='${cx}' cy='${cy}' r='${r * 0.72}' fill='url(#lensG)'/>`
      + `<circle cx='${cx - r * 0.22}' cy='${cy - r * 0.25}' r='${r * 0.16}' fill='rgba(255,255,255,.45)'/>`;
  }
  function mockupSVG(style, c1, c2, label) {
    let cam = '';
    if (style === 'samsung') {
      cam = `<rect x='135' y='150' width='160' height='330' rx='80' fill='url(#camB)' stroke='rgba(255,255,255,.14)' stroke-width='2'/>`
        + mockLens(215, 230, 34) + mockLens(215, 315, 34) + mockLens(215, 400, 34)
        + `<circle cx='215' cy='452' r='9' fill='#e8dcc0'/>`;
    } else if (style === 'xiaomi') {
      cam = `<circle cx='310' cy='320' r='160' fill='url(#camB)' stroke='rgba(255,255,255,.14)' stroke-width='2'/>`
        + mockLens(310, 255, 44) + mockLens(245, 320, 44) + mockLens(375, 320, 44) + mockLens(310, 385, 44)
        + `<circle cx='352' cy='183' r='9' fill='#e8dcc0'/>`;
    } else {
      cam = `<rect x='130' y='150' width='180' height='180' rx='48' fill='url(#camB)' stroke='rgba(255,255,255,.14)' stroke-width='2'/>`
        + mockLens(185, 205, 34) + mockLens(255, 205, 34) + mockLens(185, 275, 34)
        + `<circle cx='255' cy='275' r='13' fill='#e8dcc0'/>`;
    }
    return `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1500' viewBox='0 0 800 1500'>
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
      </svg>`)}`;
  }
  function genMockupPreview(style, name) {
    const pal = MOCK_PALETTES[style] || MOCK_PALETTES.apple;
    return mockupSVG(style, pal[0], pal[1], (name || '').trim() || 'موکاپ نمونه');
  }

  const DEFAULT_SETTINGS = {
    defaultDpi: 300, printColor: '#304ffe', camColor: '#ed1944', mainColor: '#10b981',
    guidesOn: true, restoreDraft: true,
    guidesNote: 'برش دوربین فقط در پیش‌نمایش اعمال می‌شود؛ فایل ارسالی به چاپخانه بدون برش ذخیره می‌گردد.',
  };

  const COLOR_PALETTE = [
    { c: '#304ffe', n: 'آبی برند' }, { c: '#0e7a6b', n: 'فیروزه‌ای' }, { c: '#177245', n: 'سبز' },
    { c: '#c2711d', n: 'کهربایی' }, { c: '#7c3f58', n: 'آلویی' }, { c: '#b3261e', n: 'قرمز' },
  ];

  const ORDER_STATUSES = IS_WP ? [
    { v: 'processing', l: 'در حال انجام' }, { v: 'pending', l: 'در انتظار پرداخت' },
    { v: 'completed', l: 'تکمیل شده' }, { v: 'cancelled', l: 'لغو شده' },
  ] : [
    { v: 'new', l: 'جدید' }, { v: 'printing', l: 'در چاپخانه' }, { v: 'done', l: 'تکمیل شده' }, { v: 'cancelled', l: 'لغو شده' },
  ];
  const statusLabel = v => (ORDER_STATUSES.find(s => s.v === v) || {}).l || v;

  /* ---------------- REST client ---------------- */
  async function api(method, path, body) {
    const res = await fetch(REST_BASE + path, {
      method, headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': NONCE },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /* ---------------- Store (WP / دمو) ---------------- */
  const Store = IS_WP ? {
    strIds(list) { return (list || []).map(x => Object.assign({}, x, { id: String(x.id) })); },
    async models() { return this.strIds(await api('GET', '/models')); },
    async createModel(data) { return await api('POST', '/models', data); },
    async saveMockup(id, mockup) { return await api('POST', `/models/${id}/mockup`, mockup); },
    async replaceImage(id, image) { return await api('POST', `/models/${id}/image`, { image }); },
    async deleteModel(id) { return await api('DELETE', `/models/${id}`); },
    async stickers() { return this.strIds(await api('GET', '/stickers')); },
    async addSticker(name, image) { return await api('POST', '/stickers', { name, image }); },
    async deleteSticker(id) { return await api('DELETE', `/stickers/${id}`); },
    async designs() { return this.strIds(await api('GET', '/designs')); },
    async addDesign(name, image) { return await api('POST', '/designs', { name, image }); },
    async deleteDesign(id) { return await api('DELETE', `/designs/${id}`); },
    async settings() { return await api('GET', '/settings'); },
    async saveSettings(s) { return await api('POST', '/settings', s); },
    async orders() { return this.strIds(await api('GET', '/orders')); },
    async setOrderStatus(id, status) { return await api('POST', `/orders/${id}/status`, { status }); },
  } : {
    /* حالت دمو — همان localStorage */
    async models() { return DB.get().models; },
    async createModel(data) {
      const db = DB.get();
      const style = data.brandId === 'apple' ? 'iphone' : data.brandId === 'samsung' ? 'samsung' : 'xiaomi';
      const palette = [['#5b6472', '#333a45'], ['#c7b8dd', '#8d7bb0'], ['#7ba98f', '#4d705c'], ['#c9887b', '#94584d'], ['#3f3f46', '#1e1e22'], ['#b8c2e0', '#7f8cb8']][Math.floor(Math.random() * 6)];
      const mockup = data.mockupImg ? {
        img: data.mockupImg, printRect: { ...PRINT_RECT }, mainRect: { ...MAIN_RECT }, camRects: CAM_RECTS[style].map(c => ({ ...c })),
        printMm: { w: 66, h: 138 }, mainMm: { w: 74, h: 148 }, dpi: 300, mainColor: '#10b981',
      } : window.generateMockup(style, palette[0], palette[1], data.name);
      db.models.push({ id: 'custom-' + Date.now(), brandId: data.brandId, name: data.name, price: data.price || 350000, productId: data.productId || 0, mockup });
      DB.save(db);
      return db.models;
    },
    async saveMockup(id, mockup) { const db = DB.get(); const m = db.models.find(x => x.id === id); if (m) { Object.assign(m.mockup, mockup); DB.save(db); } return db.models; },
    async replaceImage(id, image) { const db = DB.get(); const m = db.models.find(x => x.id === id); if (m) { m.mockup.img = image; DB.save(db); } return db.models; },
    async deleteModel(id) { const db = DB.get(); db.models = db.models.filter(m => m.id !== id); DB.save(db); return db.models; },
    async stickers() { return DB.get().stickers; },
    async addSticker(name, image) { const db = DB.get(); const s = { id: uid(), name, url: image }; db.stickers.push(s); DB.save(db); return s; },
    async deleteSticker(id) { const db = DB.get(); db.stickers = db.stickers.filter(x => x.id !== id); DB.save(db); return db.stickers; },
    async designs() { return DB.get().designs; },
    async addDesign(name, image) { const db = DB.get(); const d = { id: uid(), name, url: image }; db.designs.push(d); DB.save(db); return d; },
    async deleteDesign(id) { const db = DB.get(); db.designs = db.designs.filter(x => x.id !== id); DB.save(db); return db.designs; },
    async settings() { return { ...DB.get().settings }; },
    async saveSettings(s) { const db = DB.get(); Object.assign(db.settings, s); DB.save(db); return db.settings; },
    async orders() {
      return DB.get().orders.map(o => ({
        id: String(o.id), code: o.code, date: o.date, modelName: o.modelName,
        qty: o.qty || 1, price: o.price, status: o.status,
        thumb: o.thumb, printFile: o.printFile, printDpi: o.printDpi || 300,
      }));
    },
    async setOrderStatus(id, status) { const db = DB.get(); const o = db.orders.find(x => String(x.id) === String(id)); if (o) { o.status = status; DB.save(db); } return true; },
  };

  /* ---------------- UI کمکی ---------------- */
  function toast(msg, type = 'ok') {
    let wrap = q('.cd-toasts');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'cd-toasts'; document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = 'cd-toast ' + type;
    el.innerHTML = `${ic(type === 'ok' ? 'check' : type === 'err' ? 'warning' : 'info')} ${esc(msg)}`;
    wrap.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 350); }, 3200);
  }
  function modal(html, cls = '') {
    const veil = document.createElement('div');
    veil.className = 'cd-modal-veil';
    veil.innerHTML = `<div class="cd-modal ${cls}">${html}</div>`;
    veil.addEventListener('click', e => { if (e.target === veil) veil.remove(); });
    // داخل پنل اضافه می‌شود تا همه‌ی استایل‌های دیزاین سیستم (فرم، دراپ‌زون و…) روی مودال اعمال شوند
    (q('.case-designer-admin') || document.body).appendChild(veil);
    qa('[data-close]', veil).forEach(b => b.addEventListener('click', () => veil.remove()));
    return veil;
  }
  const spinner = label => `<div class="cd-loading"><span class="cd-spinner"></span> ${label || 'در حال بارگذاری…'}</div>`;
  const emptyState = (icon, title, desc) => `<div class="cd-empty">
    <div class="cd-empty-ic">${ic(icon, 24)}</div><div class="cd-empty-title">${title}</div><div class="cd-empty-desc">${desc || ''}</div></div>`;

  /* ---------- دراپ‌زون آپلود تصویر (کلیک + درگ‌انددراپ) ---------- */
  function dropzoneHTML(id, opts = {}) {
    const multiple = opts.multiple ? 'multiple' : '';
    return `<div class="cd-dropzone" id="${id}" role="button" tabindex="0" aria-label="${esc(opts.title || 'آپلود تصویر')}">
      <span class="cd-drop-ic">${ic('image', 21)}</span>
      <span class="cd-drop-title">${opts.title || 'تصویر را اینجا بکشید'}</span>
      <span class="cd-drop-hint">${opts.hint || 'PNG یا JPG — برای انتخاب، کلیک کنید'}</span>
      <span class="cd-drop-cta">${ic('plus', 13)} ${opts.cta || 'انتخاب فایل'}</span>
      <input type="file" accept="image/*" ${multiple} class="cd-hidden" id="${id}-input">
    </div>`;
  }
  function bindDropzone(id, onFiles) {
    const dz = q('#' + id);
    if (!dz) return;
    const input = q('#' + id + '-input');
    const titleEl = dz.querySelector('.cd-drop-title');
    const origTitle = titleEl ? titleEl.textContent : '';
    const busy = b => {
      dz.classList.toggle('busy', !!b);
      if (titleEl) titleEl.textContent = b ? 'در حال افزودن…' : origTitle;
    };
    dz.addEventListener('click', () => { if (!dz.classList.contains('busy')) input.click(); });
    dz.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && !dz.classList.contains('busy')) { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', () => {
      const files = [...(input.files || [])].filter(f => f.type.startsWith('image/'));
      input.value = '';
      if (files.length) onFiles(files, { busy });
    });
    ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', e => {
      const files = [...((e.dataTransfer || {}).files || [])].filter(f => f.type.startsWith('image/'));
      if (files.length && !dz.classList.contains('busy')) onFiles(files, { busy });
    });
  }

  let serverDown = false;
  function serverBanner() {
    if (!IS_WP) return;
    const host = q('#cdServerBanner');
    if (!host) return;
    if (serverDown) {
      host.classList.remove('cd-hidden');
      host.innerHTML = `${ic('warning')}
        اتصال به REST سرور برقرار نشد — لینک‌های یکتا (permalinks) و فعال‌بودن REST را بررسی کنید.
        <button class="cd-btn cd-btn-sm" id="cdRetry">${ic('refresh', 13)} تلاش دوباره</button>`;
      q('#cdRetry')?.addEventListener('click', () => { serverDown = false; CasePanel.render(State.tab); });
    } else {
      host.classList.add('cd-hidden');
    }
  }
  async function guarded(fn, fallback) {
    try { return { ok: true, data: await fn() }; }
    catch (e) {
      if (IS_WP) { serverDown = true; serverBanner(); }
      return { ok: false, data: fallback };
    }
  }

  /* ---------------- وضعیت پنل ---------------- */
  const State = { tab: null, modelId: null, boxes: [], displayScale: 1, settings: {} };

  /* ============================================================
     تب‌ها
     ============================================================ */
  const Tabs = {};

  /* ---------- داشبورد ---------- */
  Tabs.dash = {
    async load() {
      const pane = q('#atab-dash');
      pane.innerHTML = spinner('در حال آماده‌سازی داشبورد…');
      const [mdl, stk, dsg, ord] = await Promise.all([
        guarded(() => Store.models(), []), guarded(() => Store.stickers(), []),
        guarded(() => Store.designs(), []), guarded(() => Store.orders(), []),
      ]);
      State.models = mdl.data || []; State.stickers = stk.data || [];
      State.designs = dsg.data || []; State.orders = ord.data || [];
      pane.innerHTML = `
        <div class="cd-kpis">
          ${this.kpi('teal', 'mobile', 'موکاپ‌ها', State.models.length, `${State.models.filter(m => m.productId).length} با محصول ووکامرس متصل`)}
          ${this.kpi('amber', 'heart', 'استیکرها', State.stickers.length, 'آماده در کتابخانه مشتری')}
          ${this.kpi('plum', 'grid', 'طرح‌های آماده', State.designs.length, 'قابل استفاده با یک کلیک')}
          ${this.kpi('ink', 'cart', 'سفارش‌ها', State.orders.length, money(State.orders.reduce((t, o) => t + (+o.price || 0), 0)) + ' درآمد کل')}
        </div>
        <div class="cd-dashgrid">
          <div class="cd-card">
            <div class="cd-card-head" style="margin-bottom:4px">
              <span class="cd-card-title">${ic('gauge', 17)} سفارش‌های ۷ روز اخیر</span>
              <span class="cd-actions"><span class="cd-chip">${faNum(State.orders.length)} سفارش</span></span>
            </div>
            ${this.chart()}
          </div>
          <div class="cd-card">
            <div class="cd-sec-title"><span class="cd-sec-bar"></span> خلاصه فروشگاه</div>
            <div class="cd-sum-num">${faNum(State.orders.length)}</div>
            <div class="cd-helper">سفارش طراحی قاب</div>
            <div style="margin-top:8px">
              ${this.sumRow('cart', 'درآمد کل', money(State.orders.reduce((t, o) => t + (+o.price || 0), 0)))}
              ${this.sumRow('mobile', 'موکاپ‌های فعال', faNum(State.models.length))}
              ${this.sumRow('link', 'متصل به ووکامرس', faNum(State.models.filter(m => m.productId).length) + ' مدل')}
              ${this.sumRow('refresh', 'آخرین سفارش', State.orders.length ? faDate(State.orders[State.orders.length - 1].date) : '—')}
            </div>
          </div>
        </div>
        <div class="cd-dashgrid2">
          <div class="cd-healthcol">
            <div class="cd-health">
              <span class="cd-ring"><span class="cd-dot ${IS_WP ? (serverDown ? 'bad' : 'ok') : 'ok'}"></span></span>
              <div class="cd-health-txt">
                <b>${IS_WP ? 'اتصال فروشگاه' : 'حالت دمو'}</b>
                <span>${IS_WP ? (serverDown ? 'ارتباط با REST برقرار نیست' : 'ووکامرس و REST فعال‌اند') : 'ذخیره‌سازی محلی فعال — داده‌ها در همین مرورگر'}</span>
              </div>
            </div>
            <div class="cd-health">
              <span class="cd-ring"><span class="cd-dot ${serverDown ? 'bad' : 'ok'}"></span></span>
              <div class="cd-health-txt">
                <b>سلامت داده‌ها</b>
                <span>${faNum(State.models.length)} مدل، ${faNum(State.stickers.length)} استیکر و ${faNum(State.designs.length)} طرح بارگذاری شده</span>
              </div>
            </div>
          </div>
          <div class="cd-qlinks">
            <button class="cd-qlink" data-go="newModel"><span class="cd-qlink-ic">${ic('plus', 18)}</span><b>موکاپ جدید</b><span>افزودن موکاپ قاب و تنظیم کادرها</span></button>
            <button class="cd-qlink" data-go="stickers"><span class="cd-qlink-ic">${ic('heart', 18)}</span><b>استیکر جدید</b><span>افزودن به کتابخانه مشتری</span></button>
            <button class="cd-qlink" data-go="designs"><span class="cd-qlink-ic">${ic('grid', 18)}</span><b>طرح آماده</b><span>طرح‌های یک‌کلیکی مشتری</span></button>
            <button class="cd-qlink" data-go="settings"><span class="cd-qlink-ic">${ic('sliders', 18)}</span><b>تنظیمات</b><span>چاپ، کادرها و متن‌های راهنما</span></button>
          </div>
        </div>`;
      qa('#atab-dash [data-go]').forEach(b => b.addEventListener('click', () => {
        const go = b.dataset.go;
        if (go === 'newModel') Tabs.mockups.openAddModel();
        else CasePanel.render(go === 'stickers' || go === 'designs' ? go : 'settings');
      }));
      CasePanel.updateHeaderChips();
    },
    kpi(color, icon, label, val, sub) {
      const hex = { teal: 'linear-gradient(90deg,#14907d,#0e7a6b)', amber: 'linear-gradient(90deg,#d98a2f,#c2711d)', plum: 'linear-gradient(90deg,#93608f,#7c3f58)', ink: 'linear-gradient(90deg,#4a4235,#221d15)' }[color];
      return `<div class="cd-kpi"><span class="cd-kpi-strip" style="background:${hex}"></span>
        <div class="cd-kpi-label">${ic(icon, 14)} ${label}</div>
        <div class="cd-kpi-val">${faNum(val)}</div>
        <div class="cd-kpi-sub">${sub}</div></div>`;
    },
    sumRow(icon, k, v) {
      return `<div class="cd-sum-row"><span class="k">${ic(icon, 13)} ${k}</span><span class="v">${v}</span></div>`;
    },
    chart() {
      // سفارش‌های ۷ روز اخیر — نمودار ناحیه‌ای روشن (SVG درون‌خطی)
      const WD = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
      const days = [];
      for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
      const counts = days.map(d => State.orders.filter(o => { try { return new Date(o.date).toDateString() === d.toDateString(); } catch (e) { return false; } }).length);
      const total = counts.reduce((a, b) => a + b, 0);
      const max = Math.max(...counts, 1);
      const W = 560, H = 220, L = 34, R = 12, T = 14, B = 30;
      const plotW = W - L - R, plotH = H - T - B;
      const xAt = i => L + i * (plotW / 6);
      const yAt = v => T + plotH - (v / max) * plotH;
      const baseY = yAt(0);
      const linePts = counts.map((v, i) => `${i ? 'L' : 'M'} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' ');
      const areaPts = `${linePts} L ${xAt(6).toFixed(1)} ${baseY} L ${xAt(0).toFixed(1)} ${baseY} Z`;
      const gridVals = [0, max / 2, max];
      const grid = gridVals.map(v => {
        const y = yAt(v);
        return `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" stroke="#e7e1d5" stroke-width="1" stroke-dasharray="4 5"/>
          <text x="${L - 8}" y="${y + 3}" text-anchor="end" font-size="9.5" fill="#948d7c" font-family="Vazirmatn,Tahoma">${faNum(Math.round(v))}</text>`;
      }).join('');
      const xLabels = days.map((d, i) => `<text x="${xAt(i)}" y="${H - 9}" text-anchor="middle" font-size="9.5" fill="${counts[i] ? '#6f6a5e' : '#948d7c'}" font-family="Vazirmatn,Tahoma" font-weight="700">${WD[d.getDay()]}</text>`).join('');
      const circles = counts.map((v, i) => v > 0
        ? `<circle cx="${xAt(i)}" cy="${yAt(v)}" r="${i === 6 ? 5 : 4}" fill="#fff" stroke="#0e7a6b" stroke-width="2"/>`
        : '').join('');
      const line = total
        ? `<path d="${linePts}" fill="none" stroke="#0e7a6b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<line x1="${L}" y1="${baseY}" x2="${W - R}" y2="${baseY}" stroke="#d8d1c2" stroke-width="1.5" stroke-dasharray="5 6"/>`;
      const area = total
        ? `<path d="${areaPts}" fill="url(#cdChartGrad)" stroke="none"/>` : '';
      const empty = total ? '' : `<text x="${(L + W - R) / 2}" y="${T + plotH / 2 - 6}" text-anchor="middle" font-size="11" fill="#948d7c" font-family="Vazirmatn,Tahoma">هنوز سفارشی ثبت نشده</text>`;
      return `<svg class="cd-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="نمودار ناحیه‌ای سفارش‌های هفت روز اخیر" preserveAspectRatio="xMidYMid meet">
        <defs><linearGradient id="cdChartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(14,122,107,.28)"/><stop offset="1" stop-color="rgba(14,122,107,.02)"/>
        </linearGradient></defs>
        ${grid}${area}${line}${circles}${xLabels}${empty}
      </svg>`;
    },
  };

  /* ---------- موکاپ‌ها ---------- */
  Tabs.mockups = {
    async load() {
      const pane = q('#atab-mockups');
      pane.innerHTML = spinner();
      const { data: models, ok } = await guarded(() => Store.models(), []);
      State.models = models || [];
      if (!State.modelId || !State.models.find(m => m.id === State.modelId)) State.modelId = State.models[0]?.id || null;
      pane.innerHTML = `
        <div class="cd-grid">
          <div class="cd-card cd-list-card">
            <div class="cd-card-head">
              <span class="cd-card-title">${ic('mobile', 17)} مدل‌ها <span class="cd-count">${faNum(State.models.length)}</span></span>
              <button class="cd-btn cd-btn-primary cd-btn-sm" id="btnAddModel">${ic('plus', 14)} موکاپ جدید</button>
            </div>
            <div class="cd-mlist" id="mockupList"></div>
          </div>
          <div id="mockupEditorCard"></div>
        </div>`;
      this.renderList();
      this.renderEditor();
      q('#btnAddModel').addEventListener('click', () => this.openAddModel());
    },
    renderList() {
      const list = q('#mockupList');
      if (!list) return;
      if (!State.models.length) {
        list.innerHTML = emptyState('mobile', 'هنوز موکاپی نساخته‌اید', 'اولین موکاپ قاب را با دکمه‌ی «موکاپ جدید» بسازید.');
        return;
      }
      list.innerHTML = State.models.map(m => {
        const b = brandOf(m.brandId);
        return `<div class="cd-mitem ${m.id === State.modelId ? 'active' : ''}" data-id="${m.id}">
          ${m.mockup.img ? `<img class="cd-mthumb" src="${esc(m.mockup.img)}" alt="">` : `<span class="cd-mthumb cd-mthumb-empty">${ic('image', 18)}</span>`}
          <div class="cd-minfo"><div class="cd-mname">${esc(m.name)}</div>
          <div class="cd-mmeta">${ic(b.ic, 12)} ${esc(b.name)} · ${money(m.price)}</div></div>
          <button class="cd-mdel" data-del="${m.id}" title="حذف مدل">${ic('trash', 14)}</button>
        </div>`;
      }).join('');
      qa('#mockupList .cd-mitem').forEach(el => el.addEventListener('click', e => {
        if (e.target.closest('[data-del]')) return;
        State.modelId = el.dataset.id;
        this.renderList(); this.renderEditor();
      }));
      qa('#mockupList [data-del]').forEach(b => b.addEventListener('click', async () => {
        const m = State.models.find(x => x.id === b.dataset.del);
        if (!m || !confirm(`موکاپ «${m.name}» حذف شود؟`)) return;
        await guarded(() => Store.deleteModel(m.id));
        State.models = (await guarded(() => Store.models(), State.models)).data;
        if (State.modelId === m.id) State.modelId = State.models[0]?.id || null;
        this.renderList(); this.renderEditor();
        toast('موکاپ حذف شد');
      }));
    },
    renderEditor() {
      if (State.fitObs) { State.fitObs.disconnect(); State.fitObs = null; }
      const card = q('#mockupEditorCard');
      const m = State.models.find(x => x.id === State.modelId);
      if (!m) { card.innerHTML = `<div class="cd-card">${emptyState('mobile', 'مدلی انتخاب نشده', 'از لیست کنار، یک مدل انتخاب کنید.')}</div>`; return; }
      const b = brandOf(m.brandId);
      // ensure mainRect exists
      if (!m.mockup.mainRect) m.mockup.mainRect = { ...MAIN_RECT };
      if (!m.mockup.mainMm) m.mockup.mainMm = { w: 74, h: 148 };
      card.innerHTML = `
        <div class="cd-card">
          <div class="cd-card-head">
            <span class="cd-card-title">${ic('bullseye', 17)} کادرکشی موکاپ — ${esc(m.name)} <span class="cd-chip">${ic(b.ic, 12)} ${esc(b.name)}</span></span>
            <div class="cd-actions">
              <button class="cd-btn cd-btn-sm" id="btnReplaceImg">${ic('image', 14)} تعویض تصویر</button>
              <input type="file" id="mockupFile" accept="image/*" class="cd-hidden">
              <button class="cd-btn cd-btn-sm" id="btnAddCam">${ic('camera', 14)} کادر دوربین</button>
              <button class="cd-btn cd-btn-sm" id="btnAddMain">${ic('boxes', 14)} فریم اصلی</button>
              <button class="cd-btn cd-btn-primary cd-btn-sm" id="btnSaveMockup">${ic('save', 14)} ذخیره موکاپ</button>
            </div>
          </div>
          <div class="cd-fields cd-fields-2">
            <label class="cd-field">عرض چاپ (mm)<input type="number" class="cd-input" id="mmW" value="${m.mockup.printMm.w}" min="10" max="300"></label>
            <label class="cd-field">ارتفاع چاپ (mm)<input type="number" class="cd-input" id="mmH" value="${m.mockup.printMm.h}" min="10" max="500"></label>
            <label class="cd-field">DPI چاپ<input type="number" class="cd-input" id="dpiF" value="${m.mockup.dpi}" min="72" max="600"></label>
            <label class="cd-field">گردی گوشه‌ی کادر چاپ (px)<input type="number" class="cd-input" id="prRad" value="${m.mockup.printRect.radius || 0}" min="0" max="400"></label>
            <label class="cd-field">گردی گوشه‌ی کادر دوربین (px)<input type="number" class="cd-input" id="camRad" value="${(m.mockup.camRects[0] || {}).r || 0}" min="0" max="400"></label>
          </div>
          <div class="cd-fields cd-fields-2" style="margin-top:12px">
            <label class="cd-field" style="border:1px dashed rgba(16,185,129,.35);border-radius:10px;padding:10px;background:rgba(16,185,129,.06)"><b style="color:#0e7a6b">${ic('boxes',13)} فریم اصلی طرح</b>
              <span class="cd-helper">دقیقاً ابعاد گوشی را مشخص کنید — فایل نهایی در همین ابعاد کات و ذخیره می‌شود</span>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
                <label class="cd-field">عرض فریم اصلی (mm)<input type="number" class="cd-input" id="mainMmW" value="${m.mockup.mainMm.w}" min="10" max="400"></label>
                <label class="cd-field">ارتفاع فریم اصلی (mm)<input type="number" class="cd-input" id="mainMmH" value="${m.mockup.mainMm.h}" min="10" max="600"></label>
              </div>
              <label class="cd-field" style="margin-top:8px">گردی گوشه‌ی فریم اصلی (px)<input type="number" class="cd-input" id="mainRad" value="${m.mockup.mainRect.radius || 0}" min="0" max="500"></label>
            </label>
            <label class="cd-field"><span class="cd-helper">اگر فریم اصلی نداشته باشید، فایل چاپ بر اساس فضای چاپ برش می‌خورد. برای گوشی، فریم اصلی باید کل بدنه را بپوشاند.</span></label>
          </div>
          <div class="cd-drawwrap">
            <div class="cd-draw" id="drawArea">
              ${m.mockup.img ? `<div id="imgWrap" class="cd-imgwrap"><img id="mockupImg" src="${esc(m.mockup.img)}" alt=""></div>`
                : emptyState('image', 'تصویر موکاپ آپلود نشده', 'با «تعویض تصویر» موکاپ این مدل را بارگذاری کنید.')}
            </div>
          </div>
          <div class="cd-note cd-note-ok">
            ${ic('info', 14)}
            <span><b>کادر آبیرنگ = فضای چاپ</b>، <b>کادر قرمز = فضای دوربین</b> و <b>کادر سبزرنگ = فریم اصلی طرح</b>. کادرها را بکشید تا جابه‌جا شوند؛ دستگیره‌ی گوشه برای تغییر اندازه و دستگیره‌ی وسط لبه‌ی بالا برای گردی گوشه‌هاست.<br>
            در ادیتور، طرح فقط داخل فضای چاپ دیده می‌شود و دوربین‌ها سوراخ هستند؛ <b>فایل نهایی دقیقاً در ابعاد «فریم اصلی طرح» کات و ذخیره می‌شود</b> — اگر فریم اصلی نداشته باشید، بر اساس فضای چاپ برش می‌خورد.</span>
          </div>
        </div>`;
      this.loadImage(m);
      q('#btnAddCam').addEventListener('click', () => {
        const r = m.mockup.printRect;
        m.mockup.camRects.push({ x: r.x + 30, y: r.y + 30, w: 130, h: 130, r: +(q('#camRad')?.value || 0) });
        this.renderBoxes(m);
      });
      q('#btnAddMain').addEventListener('click', () => {
        const W = m.mockup.imgW || 800, H = m.mockup.imgH || 1500;
        m.mockup.mainRect = { x: Math.round(W*0.05), y: Math.round(H*0.03), w: Math.round(W*0.9), h: Math.round(H*0.94), radius: +(q('#mainRad')?.value || 90) };
        this.renderBoxes(m);
        toast('فریم اصلی اضافه شد — آن را بکشید تا دقیقاً روی گوشی قرار گیرد');
      });
      q('#btnSaveMockup').addEventListener('click', async () => {
        m.mockup.printMm = { w: +q('#mmW').value || 66, h: +q('#mmH').value || 138 };
        m.mockup.mainMm = { w: +q('#mainMmW').value || 74, h: +q('#mainMmH').value || 148 };
        m.mockup.dpi = +q('#dpiF').value || 300;
        m.mockup.printRect.radius = Math.max(0, Math.min(400, +q('#prRad').value || 0));
        m.mockup.mainRect.radius = Math.max(0, Math.min(500, +q('#mainRad')?.value || 0));
        const camRad = Math.max(0, Math.min(400, +q('#camRad').value || 0));
        m.mockup.camRects.forEach(c => { c.r = camRad; });
        const { ok } = await guarded(() => Store.saveMockup(m.id, m.mockup));
        if (ok) { this.renderBoxes(m); toast('موکاپ و کادرها ذخیره شد'); }
        else toast('ذخیره ناموفق بود', 'err');
      });
      q('#btnReplaceImg').addEventListener('click', () => q('#mockupFile').click());
      q('#mockupFile').addEventListener('change', async e => {
        const f = e.target.files[0]; if (!f) return;
        const img = await processImageFile(f);
        if (!img) return;
        const { ok } = await guarded(() => Store.replaceImage(m.id, img.url));
        if (ok) { State.models = (await guarded(() => Store.models(), State.models)).data; this.renderEditor(); toast('تصویر موکاپ جایگزین شد — کادرها را بازبینی کنید'); }
        else toast('آپلود تصویر ناموفق بود', 'err');
      });
    },
    loadImage(m) {
      const img = q('#mockupImg'), wrap = q('#imgWrap'), area = q('#drawArea'), drawwrap = area.parentElement;
      if (!img) return;
      const fit = () => {
        if (!area.isConnected || !img.naturalWidth) return;
        // فضای در دسترس: عرض پدر (داک خط‌چین بیرونی) منهای پدینگ‌ها؛ ارتفاع حداکثر ۵۶۰
        const availW = Math.max(80, (drawwrap.clientWidth || 0) - 52);
        const availH = 536;
        const s = Math.min(availW / img.naturalWidth, availH / img.naturalHeight, 1);
        State.displayScale = s;
        const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
        wrap.style.width = w + 'px';
        wrap.style.height = h + 'px';
        // خودِ <img> هم صریحاً فیت می‌شود تا رندر به CSS موروثی وابسته نباشد
        img.style.width = w + 'px';
        img.style.height = h + 'px';
        // کادر خط‌چین، عکس را «در آغوش» می‌گیرد تا عکس همیشه دقیقاً داخل کادر فیت شود
        area.style.width = Math.min(w + 48, (drawwrap.clientWidth || (w + 48)) - 28) + 'px';
        area.style.height = (h + 48) + 'px';
        m.mockup.imgW = img.naturalWidth; m.mockup.imgH = img.naturalHeight;
        this.clampRects(m, img.naturalWidth, img.naturalHeight);
        this.renderBoxes(m);
      };
      // اگر تصویر لود نشود، پیام خطای قابل‌دید نشان بده (نه فقط کادرهای شناور)
      const showErr = () => {
        qa('.cd-rect', wrap).forEach(b => b.remove());
        wrap.style.width = wrap.style.height = '';
        area.style.width = area.style.height = '';
        wrap.innerHTML = `<div class="cd-draw-err">
          <span class="cd-draw-err-ic">${ic('warning', 22)}</span>
          <b>تصویر موکاپ بارگذاری نشد</b>
          <span>فرمت پشتیبانی‌نشده (مثل HEIC) یا فایل خراب است — یک JPG یا PNG انتخاب کنید.</span>
          <button class="cd-btn cd-btn-sm" id="btnRetryImg">${ic('image', 13)} تعویض تصویر</button>
        </div>`;
        q('#btnRetryImg')?.addEventListener('click', () => q('#mockupFile')?.click());
      };
      img.onload = fit;
      img.onerror = showErr;
      if (img.complete) { img.naturalWidth ? fit() : showErr(); }
      // بازمحاسبهٔ فیت با تغییر اندازهٔ پنجره/چیدمان (مثلاً جمع‌شدن منو یا تغییر عرض ستون)
      if (State.fitObs) State.fitObs.disconnect();
      State.fitObs = new ResizeObserver(() => fit());
      State.fitObs.observe(drawwrap);
      window.removeEventListener('resize', State.fitResize);
      State.fitResize = () => fit();
      window.addEventListener('resize', State.fitResize);
    },
    /* اگر کادرها بیرون از تصویر باشند (مثلاً بعد از تعویض تصویر با عکسی با ابعاد دیگر)،
       به داخل تصویر برمی‌گردند تا همیشه روی عکس بمانند */
    clampRects(m, W, H) {
      const clamp = (r, minW, minH) => {
        if (!r) return;
        if (r.w > W) { r.w = Math.max(minW, Math.round(W * .8)); r.x = Math.max(0, Math.round((W - r.w) / 2)); }
        if (r.h > H) { r.h = Math.max(minH, Math.round(H * .8)); r.y = Math.max(0, Math.round((H - r.h) / 2)); }
        r.x = Math.min(Math.max(0, r.x), Math.max(0, W - r.w));
        r.y = Math.min(Math.max(0, r.y), Math.max(0, H - r.h));
      };
      clamp(m.mockup.printRect, 60, 80);
      if (m.mockup.mainRect) clamp(m.mockup.mainRect, 60, 80);
      m.mockup.camRects.forEach(c => clamp(c, 40, 40));
    },
    renderBoxes(m) {
      const wrap = q('#imgWrap'); if (!wrap) return;
      qa('.cd-rect', wrap).forEach(b => b.remove());
      State.boxes = [];
      const colors = {
        print: (State.settings || {}).printColor || m.mockup.printColor || '#304ffe',
        cam: (State.settings || {}).camColor || m.mockup.camColor || '#ed1944',
        main: (State.settings || {}).mainColor || m.mockup.mainColor || '#10b981'
      };
      const mk = (type, r, idx) => {
        if (!r || r.w <= 0) return;
        const el = document.createElement('div');
        el.className = 'cd-rect' + (type === 'main' ? ' cd-rect-main' : '');
        const color = type === 'print' ? colors.print : type === 'main' ? colors.main : colors.cam;
        el.style.borderColor = color;
        el.style.background = type === 'print' ? 'rgba(48,79,254,.07)' : type === 'main' ? 'rgba(16,185,129,.09)' : 'rgba(237,25,68,.07)';
        el.style.borderWidth = type === 'main' ? '2.5px' : '2px';
        const label = type === 'print' ? 'فضای چاپ' : type === 'main' ? 'فریم اصلی طرح' : 'دوربین ' + (idx + 1);
        el.innerHTML = `
          <div class="cd-rect-label" style="background:${color}">${label}</div>
          <div class="cd-rect-size"></div>
          ${type === 'cam' ? `<button class="cd-rect-del" title="حذف کادر">${ic('x', 11)}</button>` : type === 'main' ? `<button class="cd-rect-del" title="حذف فریم اصلی" data-main-del>${ic('x', 11)}</button>` : ''}
          <div class="cd-rect-handle" title="تغییر اندازه" style="border-color:${color}"></div>
          <div class="cd-rect-radhandle" title="بکشید تا گوشه‌ها گرد شوند" style="border-color:${color}"></div>`;
        wrap.appendChild(el);
        const box = { type, idx, r, el };
        const apply = () => {
          el.style.left = (r.x * State.displayScale) + 'px';
          el.style.top = (r.y * State.displayScale) + 'px';
          el.style.width = (r.w * State.displayScale) + 'px';
          el.style.height = (r.h * State.displayScale) + 'px';
          const rad = type === 'print' ? (r.radius || 0) : (r.r || r.radius || 0);
          el.style.borderRadius = (rad * State.displayScale) + 'px';
          let mmW, mmH;
          if (type === 'main') {
            mmW = (r.w / (m.mockup.printRect.w || 1)) * (m.mockup.printMm.w || 66);
            mmH = (r.h / (m.mockup.printRect.h || 1)) * (m.mockup.printMm.h || 138);
            // if mainMm exists, show its configured size
            if (m.mockup.mainMm) {
              el.querySelector('.cd-rect-size').textContent = `${mmW.toFixed(1)}×${mmH.toFixed(1)} mm → ${m.mockup.mainMm.w}×${m.mockup.mainMm.h} mm نهایی`;
            } else {
              el.querySelector('.cd-rect-size').textContent = `${mmW.toFixed(1)} × ${mmH.toFixed(1)} میلی‌متر (فریم اصلی)`;
            }
          } else {
            mmW = (r.w / m.mockup.printRect.w) * m.mockup.printMm.w;
            mmH = (r.h / m.mockup.printRect.h) * m.mockup.printMm.h;
            el.querySelector('.cd-rect-size').textContent = `${mmW.toFixed(1)} × ${mmH.toFixed(1)} میلی‌متر`;
          }
        };
        apply();
        this.bindBoxDrag(box, m);
        State.boxes.push(box);
        const del = el.querySelector('.cd-rect-del');
        if (del) del.addEventListener('click', e => {
          e.stopPropagation();
          if (type === 'main') {
            if (confirm('فریم اصلی حذف شود؟ فایل چاپ بعد از این بر اساس فضای چاپ برش می‌خورد.')) {
              m.mockup.mainRect = null;
              this.renderBoxes(m);
            }
          } else {
            m.mockup.camRects.splice(idx, 1); this.renderBoxes(m);
          }
        });
      };
      mk('print', m.mockup.printRect, 0);
      if (m.mockup.mainRect) mk('main', m.mockup.mainRect, 0);
      m.mockup.camRects.forEach((c, i) => mk('cam', c, i));
    },
    bindBoxDrag(box, m) {
      const el = box.el, s = State.displayScale;
      const imgW = m.mockup.imgW || 800, imgH = m.mockup.imgH || 1500;
      el.addEventListener('pointerdown', e => {
        if (e.target.closest('.cd-rect-del')) return;
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        const resize = !!e.target.closest('.cd-rect-handle');
        const radius = !!e.target.closest('.cd-rect-radhandle');
        const sx = e.clientX, sy = e.clientY;
        const orig = { ...box.r };
        const move = ev => {
          const dx = (ev.clientX - sx) / s, dy = (ev.clientY - sy) / s;
          if (radius) {
            const maxR = Math.min(box.r.w, box.r.h) / 2;
            const val = Math.max(0, Math.min(maxR, (orig.radius || orig.r || 0) + dx));
            if (box.type === 'print') box.r.radius = val;
            else if (box.type === 'main') box.r.radius = val;
            else box.r.r = val;
            el.style.borderRadius = (val * s) + 'px';
            const inp = box.type === 'print' ? q('#prRad') : box.type === 'main' ? q('#mainRad') : q('#camRad');
            if (inp) inp.value = Math.round(val);
          } else if (resize) {
            box.r.w = Math.max(20, Math.min(imgW - box.r.x, orig.w + dx));
            box.r.h = Math.max(20, Math.min(imgH - box.r.y, orig.h + dy));
          } else {
            box.r.x = Math.min(Math.max(orig.x + dx, 0), imgW - box.r.w);
            box.r.y = Math.min(Math.max(orig.y + dy, 0), imgH - box.r.h);
          }
          el.style.left = (box.r.x * s) + 'px'; el.style.top = (box.r.y * s) + 'px';
          el.style.width = (box.r.w * s) + 'px'; el.style.height = (box.r.h * s) + 'px';
          if (box.type === 'main') {
            const mmW = (box.r.w / (m.mockup.printRect.w || 1)) * (m.mockup.printMm.w || 66);
            const mmH = (box.r.h / (m.mockup.printRect.h || 1)) * (m.mockup.printMm.h || 138);
            el.querySelector('.cd-rect-size').textContent = `${mmW.toFixed(1)}×${mmH.toFixed(1)} mm (فریم اصلی)`;
          } else {
            const mmW = (box.r.w / m.mockup.printRect.w) * m.mockup.printMm.w;
            const mmH = (box.r.h / m.mockup.printRect.h) * m.mockup.printMm.h;
            el.querySelector('.cd-rect-size').textContent = `${mmW.toFixed(1)} × ${mmH.toFixed(1)} میلی‌متر`;
          }
        };
        const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      });
    },
    openAddModel() {
      let brandSel = 'apple';
      let pendingImg = null;
      const veil = modal(`
        <div class="cd-modal-head">${ic('plus', 17)} افزودن موکاپ جدید <button class="cd-modal-x" data-close>${ic('x', 13)}</button></div>
        <div class="cd-modal-body">
          <div class="cd-modal-cols">
            <div>
              <div class="cd-sec-title"><span class="cd-sec-bar"></span> برند و مشخصات</div>
              <div class="cd-brandcards" id="nmBrands">
                ${BRANDS.map((b, i) => `<button type="button" class="cd-brandcard ${i === 0 ? 'active' : ''}" data-brand="${b.id}">
                  <span class="cd-brandcard-ic">${ic(b.ic, 20)}</span><b>${esc(b.name)}</b>
                </button>`).join('')}
              </div>
              <div class="cd-fields cd-fields-2" style="margin-top:14px">
                <label class="cd-field">نام مدل<input class="cd-input" id="nmName" placeholder="مثلاً iPhone 17 Pro"></label>
                <label class="cd-field">قیمت (تومان)
                  <div class="cd-input-group"><input class="cd-input" id="nmPrice" type="number" placeholder="350000" min="0"><span class="cd-suffix">تومان</span></div>
                </label>
                <label class="cd-field" style="grid-column: 1 / -1">محصول ووکامرس متصل — شناسه (اختیاری)
                  <input class="cd-input" id="nmProduct" type="number" placeholder="مثلاً ۱۲۳" min="0">
                  <span class="cd-helper">با وارد کردن شناسه، دکمه‌ی «افزودن به سبد خرید» مشتری به همین محصول وصل می‌شود.</span>
                </label>
              </div>
            </div>
            <div>
              <div class="cd-sec-title"><span class="cd-sec-bar"></span> پیش‌نمایش زنده</div>
              <div class="cd-modal-preview" id="nmPreview"><img id="nmPrevImg" src="${genMockupPreview('apple', '')}" alt="پیش‌نمایش موکاپ"></div>
              <div class="cd-helper" id="nmPrevHint">موکاپ نمونه — با تایپ نام و تغییر برند، همین‌جا به‌روز می‌شود؛ با انتخاب تصویر، این جایگزین می‌شود.</div>
            </div>
          </div>
          <div class="cd-sec-title" style="margin-top:16px"><span class="cd-sec-bar"></span> تصویر موکاپ (اختیاری)</div>
          <div class="cd-nmpreview" id="nmPrevWrap">
            ${dropzoneHTML('nmDrop', { title: 'تصویر موکاپ را اینجا بکشید', hint: 'PNG یا JPG — تصویر گوشی یا قاب از روبرو', cta: 'انتخاب تصویر' })}
          </div>
          <div class="cd-note" style="margin-top:12px">${ic('info', 14)} <span>اگر تصویری نگذارید، موکاپ نمونه خودکار ساخته می‌شود و بعداً از بخش «کادرکشی موکاپ» قابل تعویض است. بعد از ساخت، کادرهای چاپ و دوربین را همان‌جا تنظیم کنید.</span></div>
        </div>
        <div class="cd-modal-foot">
          <button class="cd-btn cd-btn-sm" data-close>انصراف</button>
          <button class="cd-btn cd-btn-primary cd-btn-sm" id="nmSave">${ic('check', 14)} ایجاد موکاپ</button>
        </div>`, 'cd-modal-lg');

      const refreshPrev = () => {
        if (pendingImg) return;
        const img = q('#nmPrevImg');
        if (img) img.src = genMockupPreview(brandSel, q('#nmName') ? q('#nmName').value : '');
      };

      // انتخاب برند + به‌روزرسانی زنده‌ی پیش‌نمایش
      qa('#nmBrands .cd-brandcard').forEach(c => c.addEventListener('click', () => {
        qa('#nmBrands .cd-brandcard').forEach(x => x.classList.toggle('active', x === c));
        brandSel = c.dataset.brand;
        refreshPrev();
      }));

      // تایپ نام → پیش‌نمایش زنده
      q('#nmName').addEventListener('input', refreshPrev);

      // تصویر موکاپ: درگ‌انددراپ + پیش‌نمایش + حذف
      const showImage = url => {
        q('#nmPrevWrap').innerHTML = `
          <div class="cd-filebar">
            <img class="cd-filebar-thumb" src="${url}" alt="">
            <div class="cd-filebar-info"><b>تصویر موکاپ انتخاب شد</b><span>PNG / JPG — در پیش‌نمایش سمت چپ قابل مشاهده است</span></div>
            <button type="button" class="cd-nmremove" id="nmRemove">${ic('trash', 12)} حذف</button>
          </div>`;
        const prev = q('#nmPrevImg');
        if (prev) prev.src = url;
        const hint = q('#nmPrevHint');
        if (hint) hint.textContent = 'تصویر شما جایگزین موکاپ نمونه شد — بعد از ساخت، کادرها را روی همین تصویر تنظیم کنید.';
        q('#nmRemove').addEventListener('click', () => {
          pendingImg = null;
          q('#nmPrevWrap').innerHTML = dropzoneHTML('nmDrop', { title: 'تصویر موکاپ را اینجا بکشید', hint: 'PNG یا JPG — تصویر گوشی یا قاب از روبرو', cta: 'انتخاب تصویر' });
          bindDropzone('nmDrop', onImg);
          const hint2 = q('#nmPrevHint');
          if (hint2) hint2.textContent = 'موکاپ نمونه — با تایپ نام و تغییر برند، همین‌جا به‌روز می‌شود؛ با انتخاب تصویر، این جایگزین می‌شود.';
          refreshPrev();
        });
      };
      const onImg = async (files) => {
        const f = files[0];
        if (!f) return;
        const img = await processImageFile(f);
        if (!img) return; // پیام خطا نمایش داده شده
        pendingImg = img.url;
        showImage(pendingImg);
      };
      bindDropzone('nmDrop', onImg);

      // ارسال با Enter از فیلد نام
      q('#nmName').addEventListener('keydown', e => { if (e.key === 'Enter') q('#nmSave').click(); });

      q('#nmSave').addEventListener('click', async () => {
        const nameEl = q('#nmName');
        const name = nameEl.value.trim();
        if (!name) {
          nameEl.focus();
          nameEl.style.borderColor = 'var(--cd-bad-l)';
          nameEl.style.boxShadow = '0 0 0 4px rgba(179, 38, 30, .12)';
          return toast('نام مدل را بنویسید', 'err');
        }
        const data = { name, brandId: brandSel, price: Math.max(0, +q('#nmPrice').value || 350000), productId: Math.max(0, +q('#nmProduct').value || 0) };
        if (pendingImg) data.mockupImg = pendingImg;
        const btn = q('#nmSave');
        btn.disabled = true;
        btn.innerHTML = `${ic('refresh', 14)} در حال ایجاد…`;
        veil.remove();
        const pane = q('#atab-mockups'); pane.innerHTML = spinner('در حال ایجاد موکاپ…');
        const { ok } = await guarded(() => Store.createModel(data));
        if (ok) {
          State.models = (await guarded(() => Store.models(), State.models)).data;
          State.modelId = State.models[State.models.length - 1]?.id;
          this.load();
          toast('موکاپ ساخته شد — حالا کادرهای چاپ و دوربین را تنظیم کنید');
        } else { this.load(); toast('ساخت موکاپ ناموفق بود', 'err'); }
      });
    },
  };

  /* ---------- استیکرها ---------- */
  Tabs.stickers = {
    async load() {
      const pane = q('#atab-stickers');
      pane.innerHTML = spinner();
      const { data } = await guarded(() => Store.stickers(), []);
      State.stickers = data || [];
      pane.innerHTML = `
        <div class="cd-card">
          <div class="cd-card-head">
            <span class="cd-card-title">${ic('heart', 17)} کتابخانه استیکرها <span class="cd-count">${faNum(State.stickers.length)}</span></span>
          </div>
          ${dropzoneHTML('stkDrop', { multiple: true, title: 'استیکرها را اینجا بکشید', hint: 'PNG یا JPG — چند فایل با هم هم می‌شود', cta: 'انتخاب از فایل‌ها' })}
          <div class="cd-tiles" id="stkGrid"></div>
        </div>`;
      this.renderGrid();
      bindDropzone('stkDrop', async (files, ctl) => {
        ctl.busy(true);
        let added = 0;
        for (const f of files) {
          try {
            const img = await processImageFile(f);
            if (!img) continue; // پیام خطا قبلاً نمایش داده شده
            const { ok } = await guarded(() => Store.addSticker(f.name.replace(/\.[^.]+$/, ''), img.url));
            if (ok) added++;
          } catch (e) { /* ادامه با فایل بعدی */ }
        }
        ctl.busy(false);
        State.stickers = (await guarded(() => Store.stickers(), State.stickers)).data;
        this.renderGrid();
        if (added) toast(`${faNum(added)} استیکر اضافه شد`);
        else toast('آپلود ناموفق بود', 'err');
      });
    },
    renderGrid() {
      const grid = q('#stkGrid'); if (!grid) return;
      if (!State.stickers.length) { grid.innerHTML = `<div style="grid-column:1/-1">${emptyState('heart', 'استیکری ثبت نشده', 'استیکرهای شما اینجا به کاربران نمایش داده می‌شوند.')}</div>`; return; }
      grid.innerHTML = State.stickers.map(s => `
        <div class="cd-tile"><img src="${esc(s.url)}" alt="${esc(s.name)}"><div class="cd-tile-name">${esc(s.name)}</div>
        <button class="cd-btn cd-btn-danger cd-btn-sm cd-tile-del" data-del="${s.id}">${ic('trash', 13)} حذف</button></div>`).join('');
      qa('#stkGrid [data-del]').forEach(b => b.addEventListener('click', async () => {
        await guarded(() => Store.deleteSticker(b.dataset.del));
        State.stickers = (await guarded(() => Store.stickers(), State.stickers)).data;
        this.renderGrid(); toast('حذف شد');
      }));
    },
  };

  /* ---------- طرح‌های آماده ---------- */
  Tabs.designs = {
    async load() {
      const pane = q('#atab-designs');
      pane.innerHTML = spinner();
      const { data } = await guarded(() => Store.designs(), []);
      State.designs = data || [];
      pane.innerHTML = `
        <div class="cd-card">
          <div class="cd-card-head">
            <span class="cd-card-title">${ic('grid', 17)} طرح‌های آماده <span class="cd-count">${faNum(State.designs.length)}</span></span>
          </div>
          ${dropzoneHTML('dsgDrop', { multiple: true, title: 'طرح‌های آماده را اینجا بکشید', hint: 'PNG یا JPG — چند فایل با هم هم می‌شود', cta: 'انتخاب از فایل‌ها' })}
          <div class="cd-tiles" id="dsgGrid"></div>
        </div>`;
      this.renderGrid();
      bindDropzone('dsgDrop', async (files, ctl) => {
        ctl.busy(true);
        let added = 0;
        for (const f of files) {
          try {
            const img = await processImageFile(f);
            if (!img) continue;
            const { ok } = await guarded(() => Store.addDesign(f.name.replace(/\.[^.]+$/, ''), img.url));
            if (ok) added++;
          } catch (e) { /* ادامه با فایل بعدی */ }
        }
        ctl.busy(false);
        State.designs = (await guarded(() => Store.designs(), State.designs)).data;
        this.renderGrid();
        if (added) toast(`${faNum(added)} طرح اضافه شد`);
        else toast('آپلود ناموفق بود', 'err');
      });
    },
    renderGrid() {
      const grid = q('#dsgGrid'); if (!grid) return;
      if (!State.designs.length) { grid.innerHTML = `<div style="grid-column:1/-1">${emptyState('grid', 'طرح آماده‌ای ثبت نشده', 'طرح‌های آماده با یک کلیک روی قاب کاربر قرار می‌گیرند.')}</div>`; return; }
      grid.innerHTML = State.designs.map(d => `
        <div class="cd-tile"><img src="${esc(d.url)}" alt="${esc(d.name)}"><div class="cd-tile-name">${esc(d.name)}</div>
        <button class="cd-btn cd-btn-danger cd-btn-sm cd-tile-del" data-del="${d.id}">${ic('trash', 13)} حذف</button></div>`).join('');
      qa('#dsgGrid [data-del]').forEach(b => b.addEventListener('click', async () => {
        await guarded(() => Store.deleteDesign(b.dataset.del));
        State.designs = (await guarded(() => Store.designs(), State.designs)).data;
        this.renderGrid(); toast('حذف شد');
      }));
    },
  };

  /* ---------- سفارش‌ها ---------- */
  Tabs.orders = {
    async load() {
      const pane = q('#atab-orders');
      pane.innerHTML = spinner();
      const { data, ok } = await guarded(() => Store.orders(), []);
      State.orders = data || [];
      this.renderList(pane, ok);
      const cnt = q('#menuOrdersCount');
      if (cnt) { cnt.textContent = faNum(State.orders.length); cnt.classList.toggle('hidden', !State.orders.length); }
      const tabCount = q('[data-tab="orders"] .cd-badge');
      if (tabCount) { tabCount.textContent = faNum(State.orders.length); tabCount.classList.toggle('cd-hidden', !State.orders.length); }
    },
    renderList(pane, serverOk) {
      if (!State.orders.length) {
        pane.innerHTML = `<div class="cd-card">${emptyState('cart', 'هنوز سفارش طراحی‌قابی ثبت نشده', IS_WP ? 'سفارش‌هایی که آیتم طراحی قاب دارند، اینجا فهرست می‌شوند.' : 'از سمت کاربر یک قاب طراحی و سفارش بدهید.')}</div>`;
        return;
      }
      pane.innerHTML = `
        <div class="cd-card">
          <div class="cd-card-head">
            <span class="cd-card-title">${ic('cart', 17)} سفارش‌های طراحی قاب <span class="cd-count">${faNum(State.orders.length)}</span></span>
            <span class="cd-note-inline">${ic('doc', 13)} فایل چاپ هر سفارش «کامل و بدون برش» است — چاپخانه برش دوربین را خودش اعمال می‌کند.</span>
          </div>
          <div class="cd-table-wrap">
          <table class="cd-table">
            <thead><tr><th>سفارش</th><th>طرح</th><th>مدل</th><th>تعداد</th><th>مبلغ</th><th>وضعیت</th><th>تاریخ</th><th>عملیات</th></tr></thead>
            <tbody>${State.orders.map(o => `
              <tr>
                <td><b>${esc(o.code)}</b><div class="cd-sub">#${faNum(o.id)}</div></td>
                <td>${o.thumb ? `<img class="cd-thumb" src="${esc(o.thumb)}" alt="">` : `<span class="cd-sub">${ic('image', 15)}</span>`}</td>
                <td>${esc(o.modelName)}</td>
                <td>${faNum(o.qty)}</td>
                <td>${money(o.price)}</td>
                <td><select class="cd-input cd-status" data-status="${o.id}">
                  ${ORDER_STATUSES.map(s => `<option value="${s.v}" ${o.status === s.v ? 'selected' : ''}>${s.l}</option>`).join('')}
                </select></td>
                <td class="cd-sub">${faDate(o.date)}</td>
                <td><div class="cd-rowbtns">
                  ${o.printFile ? `<a class="cd-btn cd-btn-sm" href="${esc(o.printFile)}" download="print-${esc(o.code)}-full.png">${ic('download', 13)} فایل چاپ</a>` : ''}
                  <button class="cd-btn cd-btn-sm" data-preview="${o.id}">${ic('eye', 13)} طرح</button>
                </div></td>
              </tr>`).join('')}
            </tbody>
          </table>
          </div>
        </div>`;
      qa('#atab-orders [data-status]').forEach(sel => sel.addEventListener('change', async () => {
        const id = sel.dataset.status;
        const { ok } = await guarded(() => Store.setOrderStatus(id, sel.value));
        ok ? toast('وضعیت سفارش به‌روز شد') : toast('به‌روزرسانی ناموفق بود', 'err');
      }));
      qa('#atab-orders [data-preview]').forEach(b => b.addEventListener('click', () => {
        const o = State.orders.find(x => x.id === b.dataset.preview);
        if (!o) return;
        modal(`
          <div class="cd-modal-head">${ic('eye', 17)} طرح سفارش ${esc(o.code)} <button class="cd-modal-x" data-close>${ic('x', 13)}</button></div>
          <div class="cd-modal-body cd-modal-cols">
            <div><div class="cd-modal-label">نمای روی قاب</div>${o.thumb ? `<img src="${esc(o.thumb)}" class="cd-modal-img">` : '—'}</div>
            <div><div class="cd-modal-label">${ic('doc', 13)} فایل چاپ — بدون برش</div>
              <div class="cd-note cd-note-ok">${ic('check', 14)} <span>فایل زیر برای چاپخانه است؛ بخش دوربین در آن برش نخورده.</span></div>
              ${o.printFile ? `<img src="${esc(o.printFile)}" class="cd-modal-img">` : '—'}
              ${o.printFile ? `<a class="cd-btn cd-btn-primary cd-btn-sm" style="margin-top:10px" href="${esc(o.printFile)}" download>${ic('download', 13)} دانلود فایل چاپ (${o.printDpi ? faNum(o.printDpi) : 300} DPI)</a>` : ''}
            </div>
          </div>`);
      }));
    },
  };

  /* ---------- تنظیمات ---------- */
  Tabs.settings = {
    tmp: {},
    async load() {
      const pane = q('#atab-settings');
      pane.innerHTML = spinner();
      const { data } = await guarded(() => Store.settings(), {});
      State.settings = { ...DEFAULT_SETTINGS, ...(data || {}) };
      const S = State.settings;
      this.tmp = { printColor: S.printColor || '#304ffe', camColor: S.camColor || '#ed1944', mainColor: S.mainColor || '#10b981' };
      const seg = (id, cur) => `<div class="cd-seg" data-seg="${id}">
        ${COLOR_PALETTE.map(p => `<button type="button" class="cd-seg-opt ${p.c === cur ? 'active' : ''}" data-color="${p.c}"><span class="cd-swatch" style="background:${p.c}"></span>${p.n}</button>`).join('')}
      </div>`;
      pane.innerHTML = `
        <div class="cd-card">
          <div class="cd-card-head"><span class="cd-card-title">${ic('sliders', 17)} تنظیمات عمومی</span></div>
          <div class="cd-sec-title"><span class="cd-sec-bar"></span> چاپ و پیش‌نمایش</div>
          <div class="cd-fields cd-fields-2">
            <label class="cd-field">DPI پیش‌فرض چاپ<input type="number" class="cd-input" id="setDpi" value="${S.defaultDpi || 300}" min="72" max="600"><span class="cd-helper">رزولوشن فایل ارسالی به چاپخانه</span></label>
            <label class="cd-field">پیام راهنمای پیش‌نمایش<textarea class="cd-input" id="setNote" rows="3">${esc(S.guidesNote || '')}</textarea></label>
          </div>
          <div class="cd-sec-title" style="margin-top:18px"><span class="cd-sec-bar"></span> راهنماهای ادیتور مشتری</div>
          <div class="cd-fields" style="max-width:640px">
            <label class="cd-field">رنگ کادر «فضای چاپ»${seg('print', this.tmp.printColor)}</label>
            <label class="cd-field">رنگ کادر «فضای دوربین»${seg('cam', this.tmp.camColor)}</label>
            <label class="cd-field">رنگ کادر «فریم اصلی طرح»${seg('main', this.tmp.mainColor)}</label>
          </div>
          <div class="cd-sec-title" style="margin-top:18px"><span class="cd-sec-bar"></span> رفتار ادیتور</div>
          <div class="cd-switch-row">
            <span class="cd-switch-lbl"><b>نمایش کادرهای راهنما</b><span>کادر چاپ و دوربین روی موکاپ دیده شوند</span></span>
            <label class="cd-switch"><input type="checkbox" id="setGuidesOn" ${S.guidesOn !== false ? 'checked' : ''}><span class="cd-sw-track"><span class="cd-sw-knob"></span></span></label>
          </div>
          <div class="cd-switch-row">
            <span class="cd-switch-lbl"><b>بازیابی خودکار پیش‌نویس</b><span>با بازکردن ادیتور، آخرین طرح کاربر برگردد</span></span>
            <label class="cd-switch"><input type="checkbox" id="setRestoreDraft" ${S.restoreDraft !== false ? 'checked' : ''}><span class="cd-sw-track"><span class="cd-sw-knob"></span></span></label>
          </div>
          ${IS_WP ? '' : `
          <div class="cd-sec-title" style="margin-top:18px"><span class="cd-sec-bar"></span> فروشگاه (دمو)</div>
          <div class="cd-fields cd-fields-2" style="max-width:640px">
            <label class="cd-field">نام فروشگاه<input class="cd-input" id="setStore" value="${esc(S.storeName || '')}"></label>
            <label class="cd-field">واحد پول<input class="cd-input" id="setCurrency" value="${esc(S.currency || 'تومان')}"></label>
          </div>`}
          ${IS_WP ? `<div class="cd-note">${ic('info', 14)} <span>نام فروشگاه و واحد پول از تنظیمات ووکامرس خوانده می‌شوند.</span></div>` : ''}
          <div class="cd-actions" style="margin-top:16px">
            ${IS_WP ? '' : `<button class="cd-btn cd-btn-danger cd-btn-sm" id="btnResetDemo">${ic('refresh', 14)} بازنشانی کامل دمو</button>`}
            <button class="cd-btn cd-btn-primary cd-btn-sm" id="btnSaveSettings">${ic('save', 14)} ذخیره تنظیمات</button>
          </div>
        </div>`;
      qa('[data-seg] .cd-seg-opt').forEach(b => b.addEventListener('click', () => {
        const segEl = b.closest('[data-seg]');
        qa('.cd-seg-opt', segEl).forEach(x => x.classList.toggle('active', x === b));
        this.tmp[segEl.dataset.seg + 'Color'] = b.dataset.color;
      }));
      q('#btnSaveSettings').addEventListener('click', async () => {
        const s = {
          defaultDpi: +q('#setDpi').value || 300,
          printColor: this.tmp.printColor,
          camColor: this.tmp.camColor,
          mainColor: this.tmp.mainColor,
          guidesNote: q('#setNote').value,
          guidesOn: q('#setGuidesOn').checked,
          restoreDraft: q('#setRestoreDraft').checked,
        };
        if (!IS_WP) { s.storeName = q('#setStore').value || 'فروشگاه'; s.currency = q('#setCurrency').value || 'تومان'; }
        const { ok } = await guarded(() => Store.saveSettings(s));
        if (ok) { State.settings = { ...State.settings, ...s }; toast('تنظیمات ذخیره شد'); }
        else toast('ذخیره ناموفق بود', 'err');
      });
      const reset = q('#btnResetDemo');
      if (reset) reset.addEventListener('click', () => {
        if (confirm('همه داده‌های دمو بازنشانی شود؟')) { DB.reset(); CasePanel.render('settings'); toast('دمو بازنشانی شد'); }
      });
    },
  };

  /* ============================================================
     هسته پنل
     ============================================================ */
  const TAB_META = {
    dash: { icon: 'gauge', title: 'داشبورد', sub: 'نمای کلی فروشگاه: آمار، نمودار سفارش‌ها و سلامت اتصال' },
    mockups: { icon: 'mobile', title: 'موکاپ‌ها', sub: 'مدیریت مدل‌ها، تصاویر موکاپ و کادرهای چاپ/دوربین' },
    stickers: { icon: 'heart', title: 'استیکرها', sub: 'کتابخانه استیکرهای ادیتور کاربر' },
    designs: { icon: 'grid', title: 'طرح‌های آماده', sub: 'طرح‌های آماده‌ای که کاربر با یک کلیک روی قاب می‌گذارد' },
    orders: { icon: 'cart', title: 'سفارش‌ها', sub: 'سفارش‌های طراحی قاب با فایل چاپ کامل و بدون برش' },
    settings: { icon: 'sliders', title: 'تنظیمات', sub: 'DPI چاپ، رنگ کادرها، سوییچ‌های ادیتور و متن‌های راهنما' },
  };

  function ensureShell() {
    const root = q('.case-designer-admin');
    if (!root) return;
    if (q('#cdTabs', root)) return; // ساخته شده
    root.innerHTML = `
      <div class="cd-header">
        <span class="cd-logo">${ic('logo', 26)}</span>
        <div>
          <h1 id="adminPageTitle">${ic('logo', 22)} <span id="adminPageTitleText">${TAB_META[State.tab].title}</span> <span class="cd-ver">نسخه ${esc(VERSION)}</span></h1>
          <p class="cd-tagline" id="adminPageSub">${TAB_META[State.tab].sub}</p>
        </div>
        <div class="cd-hstats" id="cdHstats">
          <span class="cd-hchip"><span class="cd-dot ${IS_WP ? (serverDown ? 'bad' : 'ok') : 'ok'}"></span> ${IS_WP ? (serverDown ? 'اتصال قطع است' : 'ووکامرس متصل') : 'حالت دمو'}</span>
          <span class="cd-hchip"><span class="cd-dot ${serverDown ? 'bad' : 'ok'}"></span> ذخیره‌سازی ${serverDown ? 'خطا' : 'فعال'}</span>
        </div>
      </div>
      ${IS_WP ? `<div id="cdServerBanner" class="cd-banner cd-hidden"></div>` : ''}
      <div class="cd-tabbar"><nav class="cd-tabs" id="cdTabs">
        ${Object.keys(TAB_META).map(t => `
          <button class="cd-tab ${t === State.tab ? 'active' : ''}" data-tab="${t}" role="tab" aria-selected="${t === State.tab}">
            ${ic(TAB_META[t].icon, 15)} <span>${TAB_META[t].title}</span>
            ${t === 'orders' ? `<span class="cd-badge cd-hidden">۰</span>` : ''}
          </button>`).join('')}
      </nav></div>
      <div class="cd-body">
        ${Object.keys(TAB_META).map(t => `<div class="cd-tabpane ${t === State.tab ? '' : 'cd-hidden'}" id="atab-${t}"></div>`).join('')}
      </div>
      <div class="cd-savebar" id="cdSavebar"></div>
      <div class="cd-credit">${ic('heart', 13)} ساخته شده توسط علیرضا شعبان زاده</div>`;
    qa('#cdTabs .cd-tab').forEach(b => b.addEventListener('click', () => CasePanel.render(b.dataset.tab)));
  }

  function savebarFor(tab) {
    const bar = q('#cdSavebar');
    if (!bar) return;
    const conf = {
      dash: { note: `${ic('spark', 15)} داشبورد تیساکیس — داده‌های نمای بالا به‌روز است`, btn: `${ic('plus', 14)} موکاپ جدید`, act: () => Tabs.mockups.openAddModel() },
      mockups: { note: `${ic('info', 15)} کادرها را تنظیم کنید و تغییرات را ذخیره کنید`, btn: `${ic('save', 14)} ذخیره موکاپ`, act: () => q('#btnSaveMockup')?.click() },
      stickers: { note: `${ic('heart', 15)} استیکرهای جدید بلافاصله در ادیتور مشتری می‌آیند`, btn: `${ic('plus', 14)} افزودن استیکر`, act: () => q('#stkDrop')?.click() },
      designs: { note: `${ic('grid', 15)} طرح‌های آماده با یک کلیک روی قاب کاربر می‌نشینند`, btn: `${ic('plus', 14)} افزودن طرح`, act: () => q('#dsgDrop')?.click() },
      orders: { note: `${ic('doc', 15)} فایل چاپ هر سفارش کامل و بدون برش است`, btn: `${ic('refresh', 14)} تازه‌سازی`, act: () => CasePanel.render('orders') },
      settings: { note: `${ic('sliders', 15)} تغییرات تنظیمات را ذخیره کنید`, btn: `${ic('save', 14)} ذخیره تنظیمات`, act: () => q('#btnSaveSettings')?.click() },
    };
    const c = conf[tab] || conf.dash;
    bar.innerHTML = `<span class="cd-sb-note">${c.note}</span><button class="cd-btn cd-btn-primary" id="cdSbBtn">${c.btn}</button>`;
    q('#cdSbBtn').addEventListener('click', c.act);
  }

  function resolveInitialTab(hint) {
    // اولویت: hash → تبِ صفحه (پارامتر ?tab وردپرس / data-tab) → localStorage → داشبورد
    const fromHash = (location.hash.match(/^#cd-(.+)/) || [])[1];
    const fromLs = (() => { try { return localStorage.getItem('cdPanelTab'); } catch (e) { return null; } })();
    const cand = fromHash || hint || fromLs || 'dash';
    return Object.keys(TAB_META).includes(cand) ? cand : 'dash';
  }

  function render(tab) {
    State.tab = Object.keys(TAB_META).includes(tab) ? tab : resolveInitialTab(tab);
    const app = document.getElementById('adminApp');
    if (app) app.classList.add('on');
    ensureShell();
    if (!q('#cdTabs')) return;
    qa('#cdTabs .cd-tab').forEach(b => {
      const on = b.dataset.tab === State.tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    qa('.cd-tabpane').forEach(p => p.classList.add('cd-hidden'));
    const pane = q('#atab-' + State.tab);
    if (pane) pane.classList.remove('cd-hidden');
    const title = q('#adminPageTitleText'), sub = q('#adminPageSub');
    if (title) title.textContent = TAB_META[State.tab].title;
    if (sub) sub.textContent = TAB_META[State.tab].sub;
    try { localStorage.setItem('cdPanelTab', State.tab); } catch (e) {}
    try { history.replaceState(null, '', '#cd-' + State.tab); } catch (e) {}
    Tabs[State.tab].load();
    savebarFor(State.tab);
  }

  window.CasePanel = {
    render,
    refresh: () => render(State.tab),
    updateHeaderChips() {
      const host = q('#cdHstats'); if (!host) return;
      host.innerHTML = `
        <span class="cd-hchip"><span class="cd-dot ${IS_WP ? (serverDown ? 'bad' : 'ok') : 'ok'}"></span> ${IS_WP ? (serverDown ? 'اتصال قطع است' : 'ووکامرس متصل') : 'حالت دمو'}</span>
        <span class="cd-hchip"><span class="cd-dot ${serverDown ? 'bad' : 'ok'}"></span> ذخیره‌سازی ${serverDown ? 'خطا' : 'فعال'}</span>`;
    },
  };
  window.Admin = window.CasePanel; // سازگاری با دموی قبلی

  document.addEventListener('DOMContentLoaded', () => {
    const root = q('.case-designer-admin');
    if (!root) return;
    render(resolveInitialTab(root.dataset.tab));
  });
})();
