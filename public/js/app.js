/* ============================================================
   اپ سمت کاربر: انتخاب مدل → ادیتور → پیش‌نمایش → سبد خرید
   ============================================================ */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = (type === 'success' ? '<i class="fa-solid fa-circle-check"></i> ' : type === 'error' ? '<i class="fa-solid fa-triangle-exclamation"></i> ' : '<i class="fa-regular fa-lightbulb"></i> ') + esc(msg);
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.4s'; setTimeout(() => el.remove(), 400); }, 3400);
}
function modal(html, cls = '') {
  const veil = document.createElement('div');
  veil.className = 'modal-veil';
  veil.innerHTML = `<div class="modal ${cls}">${html}</div>`;
  veil.addEventListener('click', e => { if (e.target === veil) veil.remove(); });
  // داخل #case-designer-root اضافه می‌شود تا استایل‌های اسکوپ‌شده اعمال شوند
  (document.getElementById('case-designer-root') || document.body).appendChild(veil);
  veil.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => veil.remove()));
  return veil;
}
function updateCartCount() {
  const n = window.CaseDesignerData ? (window.CaseDesignerData.cartCount || 0) : cartGet().length;
  $$('.cart-count').forEach(el => { el.textContent = faNum(n); el.classList.toggle('hidden', !n); });
}

/* ============================================================
   صفحه‌ی ۱: انتخاب برند و مدل
   ============================================================ */
const Picker = {
  brandId: null,
  q: '',
  render() {
    const db = DB.get();
    $('#storeName').textContent = db.settings.storeName;
    $('#picker').classList.remove('hidden');
    $('#editorApp').classList.remove('on');
    // صفحه‌ی ادمین فقط در دمو وجود دارد — در وردپرس پنل داخل wp-admin است
    const adminApp = $('#adminApp');
    if (adminApp) adminApp.classList.remove('on');
    this.renderBrands();
    this.renderModels();
    updateCartCount();
  },
  renderBrands() {
    const db = DB.get();
    if (!this.brandId && db.brands.length) this.brandId = db.brands[0].id;
    $('#brandRow').innerHTML = db.brands.map(b =>
      `<button class="brand-chip ${b.id === this.brandId ? 'active' : ''}" data-brand="${b.id}">${esc(b.name)}</button>`).join('');
    $$('#brandRow [data-brand]').forEach(b => b.addEventListener('click', () => {
      this.brandId = b.dataset.brand; this.renderBrands(); this.renderModels();
    }));
  },
  renderModels() {
    const db = DB.get();
    let models = db.models.filter(m => m.brandId === this.brandId);
    if (this.q.trim()) {
      const q = this.q.trim().toLowerCase();
      models = db.models.filter(m =>
        m.name.toLowerCase().includes(q) ||
        (getBrand(m.brandId) || {}).name?.includes(q) ||
        (getBrand(m.brandId) || {}).en?.toLowerCase().includes(q));
    }
    const grid = $('#modelGrid');
    if (!models.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1">مدلی پیدا نشد 🤷</div>`;
      return;
    }
    grid.innerHTML = models.map(m => {
      const b = getBrand(m.brandId);
      return `<div class="model-card" data-model="${m.id}">
        <div class="model-thumb"><img src="${m.mockup.img}" alt="${esc(m.name)}"></div>
        <div class="model-info">
          <div class="model-name">${esc(m.name)}</div>
          <div class="model-meta"><span class="model-brand">${esc(b?.name || '')}</span><span class="model-price">${money(m.price)}</span></div>
        </div>
      </div>`;
    }).join('');
    $$('#modelGrid [data-model]').forEach(c => c.addEventListener('click', () => EditorApp.open(c.dataset.model)));
  },
  bind() {
    $('#searchInput').addEventListener('input', e => { this.q = e.target.value; this.renderModels(); });
    // دکمه‌ی پنل ادمین فقط در دمو وجود دارد — در صفحه‌ی وردپرس (شورت‌کد) نیست
    const adminBtn = $('#btnAdmin');
    if (adminBtn) adminBtn.addEventListener('click', () => Admin.render('mockups'));
    $('#btnClearCart').addEventListener('click', () => {
      if (window.CaseDesignerDB) {
        const u = window.CaseDesignerData.cartUrl;
        if (u) location.href = u;
        return;
      }
      cartClear(); updateCartCount(); toast('سبد خرید خالی شد');
    });
  },
};

/* ============================================================
   صفحه‌ی ۲: ادیتور
   ============================================================ */
const EditorApp = {
  model: null,
  E: null,
  activePanel: 'upload',
  clipboard: null,
  dirty: false,
  draftTimer: null,

  open(modelId) {
    const model = getModel(modelId);
    if (!model) return toast('مدل پیدا نشد', 'error');
    this.model = model;
    $('#picker').classList.add('hidden');
    $('#editorApp').classList.add('on');
    $('#editorModelName').textContent = model.name;
    const priceEl = $('#editorModelPrice');
    if (priceEl) priceEl.textContent = money(model.price);
    // اندازه از تک‌منبعِ ادیتور (EditorEngine.measure) تا با resize هیچ‌وقت دو
    // عدد متفاوت روی بوم ننشیند؛ اگر لِیاوت هنوز نبسته باشد فالبک می‌دهیم و
    // ResizeObserver + ری‌فیتِ دو-فریمیِ ادیتور بعداً اندازهٔ درست را اعمال می‌کند
    const { w, h } = EditorEngine.measure();
    const W = w > 100 ? w : 400;
    const H = h > 100 ? h : 320;
    this.E = EditorEngine.init($('#designCanvas'), model, W, H);
    this.renderPanels();
    this.setPreviewMode(false);
    window.addEventListener('editor:modelLoaded', () => this.onModelLoaded(), { once: true });
  },

  onModelLoaded() {
    this.restoreDraft();
    $('#designCanvas').focus();
  },

  back() {
    if (this.E && this.E.state.preview) this.E.exitPreview();
    // تایمر پیش‌نویس معلق را ببند و آخرین تغییر را همین‌جا ذخیره کن (قبل از null شدن E)
    clearTimeout(this.draftTimer);
    if (this.E && this.dirty) { try { this.saveDraft(true); } catch (e) {} }
    this.E = null;
    $('#editorApp').classList.remove('on');
    Picker.render();
  },

  /* ---------- پنل‌های ابزار ---------- */
  renderPanels() {
    this.renderUploadPanel();
    this.renderTextPanel();
    this.renderStickersPanel();
    this.renderDesignsPanel();
    this.renderLayers();
    this.bindTabs();
    this.bindDock();
    this.bindToolbar();
    this.bindGlobalKeys();
    this.renderInspector();
    window.addEventListener('editor:select', e => {
      this.renderInspector();
      this.renderLayers();   // هایلایت لیست باید همان لحظه‌ی انتخاب عوض شود (نه با دبونس)
    });
    window.addEventListener('editor:changed', () => this.onChanged());
    window.addEventListener('editor:zoom', e => {
      $('#zoomInfo').textContent = Math.round((e.detail || 1) * 100) + '٪';
    });
    this.renderInspector();
  },

  bindTabs() {
    $$('#editorApp .ed-dock').forEach(side => {
      $$('.side-tab', side).forEach(tab => tab.addEventListener('click', () => {
        $$('.side-tab', side).forEach(t => t.classList.remove('active'));
        $$('.panel', side).forEach(p => p.classList.add('hidden'));
        tab.classList.add('active');
        const p = $('#' + tab.dataset.panel);
        if (p) p.classList.remove('hidden');
      }));
    });
  },

  /* جمع‌شدن/بازشدن داک ابزارها (روی موبایل به‌صورت کشو) */
  bindDock() {
    const body = $('#edBody');
    const close = $('#dockClose'), open = $('#dockOpen');
    if (!body) return;
    if (close) close.addEventListener('click', () => body.classList.add('dock-closed'));
    if (open) open.addEventListener('click', () => {
      body.classList.remove('dock-closed');
      body.classList.add('dock-open');
    });
    // بستن کشو با کلیک روی بوم (فقط در حالت موبایل)
    $('#stage').addEventListener('click', () => {
      if (window.innerWidth <= 780 && body.classList.contains('dock-open')) {
        body.classList.remove('dock-open');
        body.classList.add('dock-closed');
      }
    });
  },

  renderUploadPanel() {
    $('#uploadPanel').innerHTML = `
      <div class="sec-title"><i class="fa-solid fa-image"></i> آپلود عکس</div>
      <div class="upload-zone" id="uploadZone">
        <span class="big"><i class="fa-solid fa-arrow-up"></i>️</span>
        <b>عکس را اینجا بکشید</b> یا کلیک کنید<br>
        <span class="muted">JPG / PNG — هر تعداد که بخواهید</span>
        <input type="file" id="uploadInput" accept="image/*" multiple class="hidden">
      </div>
      <div class="sec-title"><i class="fa-solid fa-puzzle-piece"></i> طرح‌های آماده</div>
      <div id="designsGrid" class="grid3"></div>
      <div class="sec-title"><i class="fa-regular fa-face-smile"></i> استیکرها</div>
      <div id="stickersGrid" class="grid3"></div>
    `;
    const zone = $('#uploadZone'), input = $('#uploadInput');
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => this.handleFiles(input.files));
    ['dragover', 'dragenter'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('drag'); }));
    zone.addEventListener('drop', e => this.handleFiles(e.dataTransfer.files));
  },

  handleFiles(files) {
    [...files].forEach(f => {
      if (!f.type.startsWith('image/')) return;
      const r = new FileReader();
      r.onload = () => {
        this.E.addImage(r.result);
        if (!this._imgHintShown) {
          this._imgHintShown = true;
          toast('عکس اضافه شد — برای جابه‌جایی آن را بکشید و برای تغییر اندازه از گوشه‌ها بگیرید');
        }
      };
      r.readAsDataURL(f);
    });
  },

  renderTextPanel() {
    $('#textPanel').innerHTML = `
      <div class="sec-title"><i class="fa-solid fa-pen-nib"></i> افزودن متن</div>
      <div class="field"><input class="input" id="txtContent" placeholder="متن خود را بنویسید..." value=""></div>
      <div class="row" style="margin-bottom:12px">
        <select class="select grow" id="txtFont">
          <option value="Vazirmatn">وزیرمتن</option>
          <option value="Vazirmatn" style="font-weight:700">وزیرمتن ضخیم</option>
        </select>
        <select class="select" id="txtWeight" style="width:96px">
          <option value="normal">معمولی</option><option value="bold">ضخیم</option><option value="900">خیلی ضخیم</option>
        </select>
      </div>
      <button class="btn btn-primary btn-block" id="btnAddText">افزودن متن</button>
      <div class="sec-title"><i class="fa-regular fa-comment-dots"></i> متن‌های پیشنهادی</div>
      <div class="grid2">
        ${['دوستت دارم ❤️', 'تولدت مبارک 🎂', 'اسم من', 'خدافظ گوشی خاموشی 😄', 'رویاهات رو دنبال کن', 'حال خوب ✨'].map(t =>
          `<button class="btn btn-outline btn-sm qtext">${esc(t)}</button>`).join('')}
      </div>
      <div class="note-box warn" style="margin-top:14px">
        <div class="note-title"><i class="fa-regular fa-lightbulb"></i> راهنما</div>
        متن با فونت وزیرمتن اضافه می‌شود. متن فارسی خودکار راست‌چین می‌شود.
      </div>
    `;
    const add = () => {
      const t = $('#txtContent').value.trim();
      this.E.addText(t || 'متن خود را بنویسید', { fontWeight: $('#txtWeight').value });
    };
    $('#btnAddText').addEventListener('click', add);
    $('#txtContent').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    $$('#textPanel .qtext').forEach(b => b.addEventListener('click', () => {
      $('#txtContent').value = b.textContent.trim(); add();
    }));
  },

  renderStickersPanel() {
    const db = DB.get();
    $('#stickersGrid').innerHTML = db.stickers.map(s =>
      `<div class="tile" data-sticker="${s.id}"><img src="${s.url}" alt="${esc(s.name)}"><div class="tname">${esc(s.name)}</div></div>`).join('');
    $$('#stickersGrid [data-sticker]').forEach(t => t.addEventListener('click', () => {
      const s = db.stickers.find(x => x.id === t.dataset.sticker);
      if (s) this.E.addImage(s.url, { maxRatio: 0.32 });
    }));
  },

  renderDesignsPanel() {
    const db = DB.get();
    $('#designsGrid').innerHTML = db.designs.map(d =>
      `<div class="tile" data-design="${d.id}"><img src="${d.url}" alt="${esc(d.name)}"><div class="tname">${esc(d.name)}</div></div>`).join('');
    $$('#designsGrid [data-design]').forEach(t => t.addEventListener('click', () => {
      const d = db.designs.find(x => x.id === t.dataset.design);
      if (d) this.addCover(d.url);
    }));
  },

  addCover(url) {
    fabric.Image.fromURL(url, img => {
      const box = this.E.printBox();
      img.set({ left: box.left, top: box.top, scaleX: box.width / img.width, scaleY: box.height / img.height, name: uid() });
      this.E.canvas.add(img);
      this.E.canvas.setActiveObject(img);
      this.E.canvas.requestRenderAll();
    }, { crossOrigin: 'anonymous' });
  },

  renderLayers() {
    const E = this.E;
    const wrap = $('#layersPanel');
    if (!wrap) return;
    // ترتیب نمایش: جلوترین لایه (بالاترین) اول لیست — لایه‌ی جدید همیشه بالای لیست می‌آید
    const layers = E.layers().slice().reverse();
    if (!layers.length) {
      wrap.innerHTML = `<div class="layer-empty">هنوز لایه‌ای اضافه نشده ✨</div>`;
      return;
    }
    const active = E.canvas.getActiveObject();
    wrap.innerHTML = layers.map((o, i) => {
      const label = o.type === 'textbox' ? (o.text || 'متن') : (o.type === 'image' ? 'عکس' : 'طرح');
      const thumb = o.type === 'image' && o.getSrc() ? `<img src="${o.getSrc()}" alt="">` : (o.type === 'textbox' ? '<i class="fa-solid fa-font"></i>' : '<i class="fa-solid fa-palette"></i>');
      // نشانگر رنگ مستقلِ هر لایه (برای متن‌ها) — رنگ هر لایه جدا و قابل مشاهده است
      const colorChip = o.type === 'textbox' ? `<span class="layer-colorchip" style="background:${o.fill || '#111827'}" title="رنگ این لایه"></span>` : '';
      const topMost = i === 0, bottomMost = i === layers.length - 1;
      return `<div class="layer-item ${active && active.name === o.name ? 'active' : ''}" data-layer="${o.name}">
        <div class="layer-thumb">${thumb}</div>
        <div class="layer-name">${esc(label)}${colorChip}</div>
        <div class="layer-ops">
          <button class="layer-op" data-op="up" title="بیار جلو" ${topMost ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i>️</button>
          <button class="layer-op" data-op="down" title="ببر عقب" ${bottomMost ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
          <button class="layer-op" data-op="del" title="حذف"><i class="fa-regular fa-trash-can"></i></button>
        </div>
      </div>`;
    }).join('');
    $$('#layersPanel [data-layer]').forEach(li => li.addEventListener('click', e => {
      const op = e.target.closest('[data-op]');
      if (op) {
        const o = E.layers().find(x => x.name === li.dataset.layer);
        if (!o) return;
        if (op.dataset.op === 'del') { E.canvas.remove(o); E.canvas.discardActiveObject(); }
        if (op.dataset.op === 'up') o.bringForward();
        if (op.dataset.op === 'down') o.sendBackwards();
        E.topMasks();
        E.canvas.requestRenderAll();
        E.onObjectChanged();          // تاریخچه + پیش‌نویس
        this.renderLayers();          // به‌روزرسانی فوری لیست (ترتیب جدید)
        return;
      }
      E.selectLayer(li.dataset.layer);
    }));
  },

  /* ---------- نوار ابزار ---------- */
  bindToolbar() {
    $('#btnBack').addEventListener('click', () => this.back());
    $('#btnUndo').addEventListener('click', () => this.undo());
    $('#btnRedo').addEventListener('click', () => this.redo());
    $('#btnCopy').addEventListener('click', () => this.copyActive());
    $('#btnPaste').addEventListener('click', () => this.paste());
    $('#btnFlipH').addEventListener('click', () => this.flip('x'));
    $('#btnFlipV').addEventListener('click', () => this.flip('y'));
    $('#btnDel').addEventListener('click', () => this.deleteActive());
    $('#btnClear').addEventListener('click', () => {
      if (!this.E.layers().length) return;
      if (confirm('همه‌ی لایه‌های طرح حذف شود؟')) this.E.clearDesign();
    });
    $('#btnZoomIn').addEventListener('click', () => this.zoomBy(1.15));
    $('#btnZoomOut').addEventListener('click', () => this.zoomBy(1 / 1.15));
    $('#btnFit').addEventListener('click', () => {
      const c = this.E.canvas;
      c.setViewportTransform([1, 0, 0, 1, 0, 0]); // ریست پن
      this.E.state.zoom = 1;
      c.setZoom(1);   // فیت = زومِ کاربر ۱ (fitScale در geometry پخته است، نه در زوم)
      $('#zoomInfo').textContent = '100٪';
      c.requestRenderAll();
    });
    $('#btnGuides').addEventListener('click', () => {
      const db = DB.get();
      db.settings.guidesOn = db.settings.guidesOn === false ? true : false;
      DB.save(db);
      this.E.setGuidesVisible(db.settings.guidesOn);
      $('#btnGuides').classList.toggle('on', db.settings.guidesOn);
    });
    $('#btnPreview').addEventListener('click', () => this.openPreviewModal());
    $('#btnCheckout').addEventListener('click', () => this.openCartModal());
    $('#btnDraft').addEventListener('click', () => { this.saveDraft(); toast('طرح ذخیره شد <i class="fa-solid fa-floppy-disk"></i>'); });
    $('#btnGuides').classList.toggle('on', DB.get().settings.guidesOn !== false);
  },

  bindGlobalKeys() {
    document.addEventListener('keydown', e => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const inEditor = $('#editorApp').classList.contains('on');
      if (!inEditor) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { this.copyActive(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { this.paste(); }
      if (e.key === 'Delete' || e.key === 'Backspace') { this.deleteActive(); }
    });
  },

  copyActive() {
    const o = this.E.canvas.getActiveObject();
    if (!o) return toast('اول یک لایه را انتخاب کنید', 'error');
    EditorEngine.cloneAsync(o).then(c => { this.clipboard = c; toast('کپی شد <i class="fa-regular fa-clipboard"></i>'); });
  },
  paste() {
    if (!this.clipboard) return;
    EditorEngine.cloneAsync(this.clipboard).then(c => {
      c.set({ left: c.left + 34, top: c.top + 34, name: uid() });
      this.E.canvas.add(c);
      this.E.canvas.setActiveObject(c);
      this.E.canvas.requestRenderAll();
    });
  },
  flip(axis) {
    const o = this.E.canvas.getActiveObject();
    if (!o) return;
    if (axis === 'x') o.set('flipX', !o.flipX);
    else o.set('flipY', !o.flipY);
    this.E.canvas.requestRenderAll();
    this.E.onObjectChanged();
  },
  deleteActive() {
    const o = this.E.canvas.getActiveObject();
    if (o) { this.E.canvas.remove(o); this.E.canvas.discardActiveObject(); }
  },
  zoomBy(f) {
    const c = this.E.canvas;
    // زوم روی مقیاسِ «نسبت به فیت» اعمال می‌شود؛ viewport zoom دیگر fitScale در خودش ندارد
    let z = this.E.state.zoom * f;
    z = Math.min(Math.max(z, this.E.ZOOM_MIN), this.E.ZOOM_MAX);
    const cc = c.getCenter(); // مرکز دید (با احتساب پن)
    c.zoomToPoint(new fabric.Point(cc.left, cc.top), z);
    this.E.state.zoom = z;
    this.E.clampViewport();
    $('#zoomInfo').textContent = Math.round(z * 100) + '٪';
  },

  /* ---------- پنل ویژگی‌ها (سمت چپ، پایین‌تر از ابزارها) ---------- */
  renderInspector() {
    const panel = $('#inspectorPanel');
    if (!this.E) { panel.innerHTML = ''; return; }
    const o = this.E.canvas.getActiveObject();
    if (!o) {
      panel.innerHTML = `<div class="sec-title"><i class="fa-solid fa-sliders"></i> ویژگی‌ها</div>
        <div class="layer-empty">لایه‌ای انتخاب نشده<br><span class="muted">روی یک لایه در بوم کلیک کنید</span></div>`;
      return;
    }
    let html = `<div class="sec-title"><i class="fa-solid fa-sliders"></i> ویژگی‌های لایه</div>
      <div class="field"><label>شفافیت (Opacity)</label>
        <input type="range" min="5" max="100" value="${Math.round((o.opacity ?? 1) * 100)}" id="inspOpacity" class="input" style="padding:0;border:none">
      </div>`;
    if (o.type === 'textbox') {
      const fams = ['Vazirmatn', 'Tahoma', 'Arial', 'Courier New', 'Georgia'];
      html += `
        <div class="field"><label>فونت</label><select class="select" id="inspFont">
          ${fams.map(f => `<option ${o.fontFamily === f ? 'selected' : ''}>${f}</option>`).join('')}
        </select></div>
        <div class="field"><label>اندازه</label>
          <!-- عدد به «پیکسلِ تصویر موکاپ» نشان داده می‌شود (img space) تا نه با اندازهٔ
               پنجره عوض شود و نه با زوم — همان چیزی که روی فایل چاپ هم می‌افتد -->
          <input type="number" class="input" id="inspSize" value="${Math.round(o.fontSize / (this.E.fitScale || 1))}" min="8" max="400"></div>
        <div class="field"><label>رنگ متن</label><div class="row" id="inspColors">
          ${['#111827', '#ffffff', '#e64553', '#f59e0b', '#10b981', '#2563eb', '#7c5cff', '#ec4899'].map(c =>
            `<div class="swatch ${o.fill === c ? 'active' : ''}" data-c="${c}" style="background:${c}"></div>`).join('')}
        </div></div>
        <div class="field"><label>تراز متن</label>
          <div class="align-btns">
            <button class="align-btn" data-align="right">راست</button>
            <button class="align-btn" data-align="center">وسط</button>
            <button class="align-btn" data-align="left">چپ</button>
          </div></div>`;
    } else {
      html += `<div class="muted" style="margin-bottom:10px">برای تصویر: می‌توانید با گوشه‌های انتخاب، اندازه را تغییر دهید و با کشیدن، جابه‌جا کنید.</div>`;
    }
    html += `<button class="btn btn-danger btn-block btn-sm" id="inspDelete">حذف این لایه <i class="fa-regular fa-trash-can"></i></button>`;
    panel.innerHTML = html;

    const apply = () => {
      const o = this.E.canvas.getActiveObject();
      if (!o) return;
      if (o.type === 'textbox') {
        o.set({
          fontFamily: $('#inspFont').value,
          fontSize: (+$('#inspSize').value || 24) * (this.E.fitScale || 1),   // img → world
        });
        const w = o.width;
        o.set('width', Math.max(w, o.calcTextWidth() + 20));
      }
      this.E.canvas.requestRenderAll();
      this.E.onObjectChanged();
    };
    $('#inspOpacity').addEventListener('input', e => {
      o.set('opacity', e.target.value / 100);
      this.E.canvas.requestRenderAll();
      this.E.onObjectChanged();
    });
    const fontSel = $('#inspFont'), sizeEl = $('#inspSize');
    if (fontSel) fontSel.addEventListener('change', apply);
    if (sizeEl) sizeEl.addEventListener('change', apply);
    $$('#inspColors .swatch').forEach(s => s.addEventListener('click', () => {
      o.set('fill', s.dataset.c);
      this.E.canvas.requestRenderAll();
      this.E.onObjectChanged();
      this.renderInspector();
    }));
    $$('#inspectorPanel [data-align]').forEach(b => b.addEventListener('click', () => {
      o.set('textAlign', b.dataset.align);
      this.E.canvas.requestRenderAll();
      this.E.onObjectChanged();
    }));
    $('#inspDelete').addEventListener('click', () => this.deleteActive());
  },

  /* ---------- تاریخچه (undo/redo) ---------- */
  _history: { stack: [], idx: -1 },
  pushHistory() {
    if (!this.E) return; // ادیتور بسته شده
    const snap = this.E.serialize();
    const h = this._history;
    if (h.stack[h.idx] === snap) return;
    h.stack = h.stack.slice(0, h.idx + 1);
    h.stack.push(snap);
    if (h.stack.length > 30) h.stack.shift();
    h.idx = h.stack.length - 1;
  },
  undo() {
    const h = this._history;
    if (h.idx <= 0) return;
    h.idx--;
    this.E.loadSerialized(h.stack[h.idx]);
  },
  redo() {
    const h = this._history;
    if (h.idx >= h.stack.length - 1) return;
    h.idx++;
    this.E.loadSerialized(h.stack[h.idx]);
  },

  onChanged() {
    this.dirty = true;
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      if (!this.E) return; // ادیتور وسط کار بسته شده
      this.pushHistory(); this.saveDraft(true); this.renderLayers();
    }, 700);
  },

  /* ---------- ذخیره / بازیابی پیش‌نویس ---------- */
  saveDraft(silent) {
    try {
      localStorage.setItem('caseDesigner.draft.' + this.model.id, this.E.serialize());
      if (!silent) toast('پیش‌نویس طرح ذخیره شد <i class="fa-solid fa-floppy-disk"></i>');
    } catch (e) { if (!silent) toast('فضای ذخیره‌سازی پر است', 'error'); }
  },
  restoreDraft() {
    const db = DB.get();
    if (db.settings && db.settings.restoreDraft === false) { this.pushHistory(); return; } // از تنظیمات پنل
    const d = localStorage.getItem('caseDesigner.draft.' + this.model.id);
    if (d) {
      this.E.loadSerialized(d);
      toast('پیش‌نویس قبلی این مدل بازیابی شد <i class="fa-solid fa-rotate"></i>');
    }
    this.pushHistory();
  },

  /* ---------- پیش‌نمایش ---------- */
  setPreviewMode(on) {
    this.E[on ? 'enterPreview' : 'exitPreview']();
    $('#btnPreview').classList.toggle('on', on);
    $('#btnCheckout').disabled = on;
  },

  async openPreviewModal() {
    if (!this.E.layers().length) return toast('اول چیزی روی قاب قرار بدهید <i class="fa-regular fa-face-smile-wink"></i>', 'error');
    // منتظر آماده‌شدن تصویر برش‌خورده‌ی پیش‌نمایش بمان (در غیر این صورت تامبنیل خالی می‌افتد)
    await this.E.enterPreview();
    const thumb = this.E.exportPreviewThumb(true);
    this.E.exitPreview();
    const m = this.model;
    const veil = modal(`
      <div class="modal-head"><i class="fa-solid fa-eye"></i> پیش‌نمایش نهایی <button class="x" data-close><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body preview-stage">
        <div class="preview-canvas"><img id="pvImg" src="${thumb}" alt="پیش‌نمایش"></div>
        <div class="preview-side">
          <div class="note-box warn">
            <div class="note-title"><i class="fa-solid fa-scissors"></i> درباره‌ی برش دوربین</div>
            این پیش‌نمایش دقیقاً همان چیزی است که بعد از چاپ می‌بینید: قسمت کادر دوربین از روی طرح <b>برش خورده</b> نمایش داده می‌شود.
          </div>
          <div class="note-box success">
            <div class="note-title"><i class="fa-solid fa-print"></i> فایل ارسالی به چاپخانه</div>
            فایل نهایی <b>بدون هیچ برشی</b> ذخیره و ارسال می‌شود — طرح کامل زیر کادر دوربین هم در فایل هست و چاپخانه خودش برش را اعمال می‌کند.
          </div>
          <div class="sum-row"><span>مدل</span><b>${esc(m.name)}</b></div>
          <div class="sum-row"><span>قیمت</span><b>${money(m.price)}</b></div>
          <div class="sum-row"><span>تعداد لایه‌ها</span><b>${faNum(this.E.layers().length)}</b></div>
          <div class="sum-row" style="border:none"><span>رزولوشن چاپ</span><b>${m.mockup.dpi} DPI</b></div>
          <button class="btn btn-success btn-block btn-lg" style="margin-top:16px" data-close>تأیید و ادامه به خرید <i class="fa-solid fa-cart-shopping"></i></button>
        </div>
      </div>`);
    veil.querySelector('.modal').classList.add('modal-xl');
    veil.querySelector('[data-close].btn')?.addEventListener('click', () => this.openCartModal());
  },

  /* ---------- افزودن به سبد خرید ---------- */
  async openCartModal() {
    if (!this.E.layers().length) return toast('اول چیزی روی قاب قرار بدهید <i class="fa-regular fa-face-smile-wink"></i>', 'error');
    const m = this.model;
    let print = null, printErr = null;
    try { print = await this.E.exportPrint({ dpi: 300 }); }
    catch (e) { printErr = e; print = await this.E.exportPrint({ dpi: 150 }); }
    const designJson = this.E.serialize();
    const pv = this.E.exportPreviewThumb(true);
    const veil = modal(`
      <div class="modal-head"><i class="fa-solid fa-cart-shopping"></i> افزودن به سبد خرید <button class="x" data-close><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <div class="grid2" style="margin-bottom:14px">
          <div>
            <div class="sec-title">طرح روی قاب</div>
            <div class="preview-canvas" style="min-height:0;padding:10px"><img src="${pv}" style="max-height:300px;border-radius:14px"></div>
          </div>
          <div>
            <div class="sec-title">فایل چاپ (بدون برش)</div>
            <div class="preview-canvas" style="min-height:0;padding:10px;background:#fff"><img src="${print.dataUrl}" style="max-height:300px;border-radius:10px"></div>
            <div class="note-box success" style="margin-top:10px">
              <div class="note-title"><i class="fa-solid fa-circle-check"></i> فایل کامل و بدون برش</div>
              تمام طرح — حتی بخش زیر کادر دوربین — در فایل چاپ موجود است.
            </div>
          </div>
        </div>
        <div class="sum-row"><span>مدل</span><b>${esc(m.name)}</b></div>
        <div class="sum-row"><span>قیمت</span><b>${money(m.price)}</b></div>
        <div class="sum-row"><span>رزولوشن فایل چاپ</span><b>${print.mmToPx} DPI — ${faNum(print.width)}×${faNum(print.height)} پیکسل</b></div>
        <div class="sum-row" style="border:none"><span>ابعاد چاپ</span><b>${faNum(m.mockup.printMm.w)}×${faNum(m.mockup.printMm.h)} میلی‌متر</b></div>
        ${printErr ? `<div class="note-box warn" style="margin-top:10px">حجم ذخیره‌سازی محدود بود؛ فایل با ۱۵۰DPI ذخیره شد.</div>` : ''}
      </div>
      <div class="modal-foot">
        <button class="btn btn-outline" id="dlPrint"><i class="fa-solid fa-arrow-down"></i> دانلود فایل چاپ (${print.mmToPx}DPI)</button>
        <button class="btn btn-primary" id="btnAddCart">افزودن به سبد خرید <i class="fa-solid fa-cart-shopping"></i></button>
      </div>`);
    veil.querySelector('.modal').classList.add('wide');
    veil.querySelector('#dlPrint').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = print.dataUrl;
      a.download = `print-${m.id}-full-${print.mmToPx}dpi.png`;
      a.click();
      toast('فایل چاپ بدون برش دانلود شد <i class="fa-solid fa-circle-check"></i>');
    });
    veil.querySelector('#btnAddCart').addEventListener('click', async () => {
      /* حالت وردپرس: ثبت سفارش واقعی در سبد ووکامرس از طریق REST */
      if (window.CaseDesignerDB) {
        const CD = window.CaseDesignerData;
        const rootEl = document.getElementById('case-designer-root');
        const fromUrl = parseInt(new URLSearchParams(location.search).get('product_id'), 10) || 0;
        const productId = m.productId || (rootEl ? parseInt(rootEl.dataset.productId, 10) || 0 : 0) || fromUrl;
        if (!productId) {
          return toast('برای این مدل هنوز محصول ووکامرس متصل نشده است — در پنل مدیریت «محصول متصل» را ثبت کنید', 'error');
        }
        const btn = veil.querySelector('#btnAddCart');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> در حال ثبت…';
        try {
          const res = await fetch(CD.restUrl + '/add-to-cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': CD.nonce || '' },
            body: JSON.stringify({
              product_id: productId, qty: 1,
              designJson, printPng: print.dataUrl, thumbPng: pv, modelName: m.name,
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error((data && data.message) || ('HTTP ' + res.status));
          this.saveDraft(true);
          veil.remove();
          toast('به سبد خرید اضافه شد <i class="fa-solid fa-circle-check"></i>');
          if (data.cart_url) setTimeout(() => { location.href = data.cart_url; }, 1400);
        } catch (e) {
          btn.disabled = false;
          btn.innerHTML = 'افزودن به سبد خرید <i class="fa-solid fa-cart-shopping"></i>';
          toast('افزودن به سبد ناموفق بود — ' + (e.message || 'خطای سرور'), 'error');
        }
        return;
      }

      /* حالت دمو: سفارش محلی */
      const db = DB.get();
      const order = {
        id: nextOrderId(),
        code: 'CS-' + (1000 + db.orders.length + 1),
        date: new Date().toISOString(),
        modelId: m.id, modelName: m.name,
        price: m.price, qty: 1,
        status: 'new',
        thumb: pv,
        designJson,
        printFile: print.dataUrl,   // فایل کامل — بدون برش دوربین
        printDpi: print.mmToPx, printW: print.width, printH: print.height,
        customer: 'کاربر دمو',
      };
      try {
        db.orders.unshift(order);
        DB.save(db);
        cartAdd({ type: 'case-design', orderId: order.id, modelName: m.name, price: m.price, thumb: pv });
        this.saveDraft(true);
        veil.remove();
        this.back();
        toast('سفارش شما ثبت شد و به سبد خرید اضافه گردید <i class="fa-solid fa-champagne-glasses"></i>');
        updateCartCount();
      } catch (e) {
        toast('حجم ذخیره‌سازی پر شد؛ فایل با کیفیت پایین‌تر دوباره ساخته شود', 'error');
      }
    });
  },
};

/* ============================================================
   شروع اپ
   ============================================================ */
const BOOT_LOADING_HTML = `<div style="padding:48px 0;text-align:center" class="muted"><i class="fa-solid fa-circle-notch fa-spin fa-2x" style="display:block;margin-bottom:12px"></i>در حال دریافت مدل‌ها از سرور…</div>`;

document.addEventListener('DOMContentLoaded', () => {
  const start = () => { Picker.bind(); Picker.render(); };

  if (window.CaseDesignerDB) {
    /* حالت وردپرس: داده از REST (پنل ادمین) */
    const boot = () => {
      const grid = $('#modelGrid');
      if (grid) grid.innerHTML = BOOT_LOADING_HTML;
      window.CaseDesignerDB.ready.then(start).catch(() => {
        const g = $('#modelGrid');
        if (!g) return start();
        g.innerHTML = `<div style="padding:40px;text-align:center" class="note-box error">
          <div class="note-title"><i class="fa-solid fa-triangle-exclamation"></i> دریافت داده‌ها از سرور ناموفق بود</div>
          اتصال سایت به سرور را بررسی کنید.<br>
          <button class="btn btn-primary" id="dbRetry" style="margin-top:14px"><i class="fa-solid fa-rotate-right"></i> تلاش دوباره</button>
        </div>`;
        $('#dbRetry').addEventListener('click', () => {
          g.innerHTML = BOOT_LOADING_HTML;
          window.CaseDesignerDB.refresh().then(start).catch(() => boot());
        });
      });
    };
    boot();
  } else {
    /* حالت دمو: localStorage */
    DB.get(); // seed
    start();
  }
});
