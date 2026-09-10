/* ============================================================
   موتور ادیتور — مبتنی بر Fabric.js
   - کادرها (فضای چاپ / دوربین) فقط راهنما هستن و هیچ محدودیتی اعمال نمی‌کنن
   - خروجی چاپ: کل بوم، بدون هیچ برشی
   - پیش‌نمایش: کپی نمایشی که برش دوربین روش اعمال شده (فقط برای دید کاربر)
   ============================================================ */
const EditorEngine = {
  model: null,
  canvas: null,
  fitScale: 1,
  guideGroup: null,
  _objects: null,          // بکاپ آبجکت‌ها حین پیش‌نمایش
  state: { preview: false, zoom: 1 },

  /* ---------- راه‌اندازی ---------- */
  // کلون امن: در نسخه‌های مختلف fabric، clone گاهی promise برمی‌گرداند و گاهی فقط callback می‌گیرد
  cloneAsync(o) {
    return new Promise(res => {
      const r = o.clone(c => res(c));
      if (r && typeof r.then === 'function') r.then(c => res(c));
    });
  },

  // پاک‌کردن بوم بدون از دست دادن رنگ پس‌زمینه (در این نسخه fabric، clear() رنگ پس‌زمینه را پاک می‌کند)
  _clearKeepBg() {
    const bg = this.canvas.backgroundColor || '#f3f4f6';
    this.canvas.clear();
    this.canvas.backgroundColor = bg;
  },

  init(canvasEl, model, width, height) {
    this.model = model;
    const canvas = new fabric.Canvas(canvasEl, {
      width, height,
      backgroundColor: '#f3f4f6',
      preserveObjectStacking: true,
      selection: true,
      uniScaleTransform: true,
      stopContextMenu: true,
      fireRightClick: false,
    });
    this.canvas = canvas;
    this._bindEvents();
    this.setupImage(model.mockup.img, model.mockup.printRect, model.mockup.camRects, model.mockup.printMm);
    // برخی قالب‌ها/چیدمان‌ها (مثلاً حالت ستونی) لِیاوت را دیر می‌بندند؛
    // بعد از دو فریم، اگر اندازهٔ هولدر با بوم جور نیست، ری‌فیت کن
    requestAnimationFrame(() => requestAnimationFrame(() => this.resize()));
    return this;
  },

  setupImage(imgUrl, printRect, camRects, printMm) {
    const canvas = this.canvas;
    this._clearKeepBg();
    canvas.backgroundColor = '#f3f4f6';
    fabric.Image.fromURL(imgUrl, img => {
      if (!this.model) return; // تعویض مدل وسط لود
      this.model.mockup.imgW = img.width; this.model.mockup.imgH = img.height;
      this.mockupEl = img.getElement ? img.getElement() : img._element; // برای ماسک‌های نمایش
      // اسکیل به‌صورت نسبی از خود تصویر (تا با هر رزولوشن موکاپ جور دربیاد) + وسط‌چین‌کردن در بوم
      // ضریب ۰٫۹۴: حاشیه‌ی کوچک دور موکاپ تا به لبه‌ی بوم نچسبد
      const fit = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.94;
      this.fitScale = fit;
      this.offset = {
        x: Math.max(0, (canvas.width - img.width * fit) / 2),
        y: Math.max(0, (canvas.height - img.height * fit) / 2),
      };
      canvas.setZoom(fit);
      const imgScaled = new fabric.Rect({
        left: this.offset.x, top: this.offset.y, width: img.width, height: img.height,
        fill: new fabric.Pattern({ source: img.getElement ? img.getElement() : img._element, repeat: 'no-repeat' }),
        selectable: false, evented: false, excludeFromExport: true,
        objectCaching: false, name: '__mockup__',
      });
      imgScaled.set({ scaleX: fit, scaleY: fit });
      canvas.add(imgScaled);
      imgScaled.sendToBack();
      this.renderGuides(printRect, camRects);
      this.state.preview = false;
      this.state.zoom = 1;
      window.dispatchEvent(new CustomEvent('editor:modelLoaded'));
    }, { crossOrigin: 'anonymous' });
  },

  /* ---------- کادرهای راهنما ---------- */
  renderGuides(printRect, camRects) {
    const s = this.fitScale, M = this.model.mockup;
    const settings = DB.get().settings;
    const printColor = M.printColor || settings.printColor || '#818cf8';
    const camColor = M.camColor || settings.camColor || '#fbbf24';
    if (this.guideGroup) { this.canvas.remove(this.guideGroup); this.guideGroup = null; }
    const objs = [];
    const dash = [6, 4];
    const ox = this.offset?.x || 0, oy = this.offset?.y || 0;
    const pr = (printRect.radius || 0) * s; // شعاع گردی گوشه‌ها (از پنل ادمین)
    const printBox = new fabric.Rect({
      left: printRect.x * s + ox, top: printRect.y * s + oy, width: printRect.w * s, height: printRect.h * s,
      rx: pr, ry: pr,
      fill: 'rgba(48,79,254,0.05)', stroke: printColor, strokeWidth: 1.4 / s,
      strokeDashArray: dash, selectable: false, evented: false, excludeFromExport: true,
      objectCaching: false, name: '__guide_print__',
    });
    // برچسب چیپ‌شکل: پس‌زمینه‌ی گردِ همرنگ + متن سفید (بازطراحی تمیز)
    const mkChip = (txt, color, x, y, alignRight) => {
      const t = new fabric.Text(txt, {
        fontSize: 9.5 / s, fill: '#fff', fontFamily: 'Vazirmatn', fontWeight: 'bold',
        selectable: false, evented: false, excludeFromExport: true, objectCaching: false,
      });
      const pad = 6 / s;
      const chip = new fabric.Rect({
        left: alignRight ? x - t.width - pad * 2 : x, top: y,
        width: t.width + pad * 2, height: t.height + 4 / s,
        rx: (t.height + 4 / s) / 2, ry: (t.height + 4 / s) / 2,
        fill: color, selectable: false, evented: false, excludeFromExport: true, objectCaching: false,
      });
      t.set({ left: chip.left + pad, top: chip.top + 2 / s });
      return [chip, t];
    };
    const inset = 4 / s;
    const [printChip, printTxt] = mkChip('فضای چاپ', printColor, printBox.left + inset, printBox.top + inset, false);
    objs.push(printBox, printChip, printTxt);
    camRects.forEach(c => {
      const cr = (c.r || 0) * s;
      const camBox = new fabric.Rect({
        left: c.x * s + ox, top: c.y * s + oy, width: c.w * s, height: c.h * s,
        rx: cr, ry: cr,
        fill: 'rgba(237,25,68,0.06)', stroke: camColor, strokeWidth: 1.4 / s,
        strokeDashArray: dash, selectable: false, evented: false, excludeFromExport: true,
        objectCaching: false, name: '__guide_cam__',
      });
      const [camChip, camTxt] = mkChip('دوربین', camColor, camBox.left + camBox.width - inset, camBox.top + inset, true);
      objs.push(camBox, camChip, camTxt);
    });
    const group = new fabric.Group(objs, { selectable: false, evented: false, excludeFromExport: true });
    group.name = '__guide_group__';
    this.canvas.add(group);
    this.guideGroup = group;
    this.setGuidesVisible(DB.get().settings.guidesOn !== false);
    this._syncMasks(); // ماسک نمایش: طرح فقط داخل فضای چاپ + سوراخ دوربین‌ها
    group.bringToFront();
    this.canvas.requestRenderAll();
  },

  setGuidesVisible(v) {
    if (this.guideGroup) this.guideGroup.visible = !!v;
    this.canvas.requestRenderAll();
  },

  /* ---------- ماسک نمایش (فقط دیداری — فایل چاپ دست‌نخورده می‌ماند) ----------
     طرح آزادانه جابه‌جا می‌شود، اما فقط داخل «فضای چاپ» دیده می‌شود و
     در فضای دوربین‌ها نمایش داده نمی‌شود. این ماسک‌ها excludeFromExport
     هستند، پس خروجی چاپ همچنان کامل و بدون برش است. */
  _rrectD(x, y, w, h, r) {
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    if (!r) return `M ${x} ${y} h ${w} v ${h} h ${-w} Z`;
    return `M ${x + r} ${y} h ${w - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - 2 * r} a ${r} ${r} 0 0 1 ${-r} ${r} h ${-(w - 2 * r)} a ${r} ${r} 0 0 1 ${-r} ${-r} v ${-(h - 2 * r)} a ${r} ${r} 0 0 1 ${r} ${-r} Z`;
  },
  _syncMasks() {
    const canvas = this.canvas, m = this.model?.mockup;
    if (this.state.preview || !m || !this.mockupEl || !m.imgW) return;
    ['__outside_print_mask__', '__mockup_outside__', '__cam_mask__'].forEach(nm => {
      canvas.getObjects().forEach(o => { if (o.name === nm) canvas.remove(o); });
    });
    this.maskOutside = this.maskCam = null;
    const ox = this.offset?.x || 0, oy = this.offset?.y || 0, s = this.fitScale;
    const W = canvas.width, H = canvas.height;
    // ۱) ورقه‌ی زمینه به رنگ بوم، ۶ برابر ابعاد (با سوراخ فضای چاپ، fillRule evenodd):
    //    هیچ طرحی بیرونِ فضای چاپ دیده نمی‌شود — حتی آن‌سوی بدنه‌ی گوشی یا با زوم‌آوت و پن
    //    مختصات Path نسبت به مبدأ خودِ آبجکت است (pathOffset)، پس مبدأ را صفر می‌گیریم
    const p = m.printRect;
    const outer = `M 0 0 h ${6 * W} v ${6 * H} h ${-6 * W} Z`;
    const hole = this._rrectD(p.x * s + ox + 2.5 * W, p.y * s + oy + 2.5 * H, p.w * s, p.h * s, (p.radius || 0) * s);
    this.maskOutside = new fabric.Path(outer + ' ' + hole, {
      left: -2.5 * W, top: -2.5 * H, originX: 'left', originY: 'top',
      fill: canvas.backgroundColor || '#f3f4f6', fillRule: 'evenodd',
      selectable: false, evented: false, excludeFromExport: true,
      objectCaching: false, name: '__outside_print_mask__',
    });
    canvas.add(this.maskOutside);
    // ۲) بدنه‌ی گوشی فقط بیرونِ فضای چاپ (روی طرحِ مخفی‌شده، خود موکاپ دیده می‌شود)
    this.maskMockup = new fabric.Image(this.mockupEl, {
      left: ox, top: oy, scaleX: s, scaleY: s,
      selectable: false, evented: false, excludeFromExport: true,
      objectCaching: true, name: '__mockup_outside__',
    });
    this.maskMockup.clipPath = new fabric.Path(
      this._rrectD(p.x - m.imgW / 2, p.y - m.imgH / 2, p.w, p.h, p.radius || 0),
      { fillRule: 'nonzero', inverted: true });
    canvas.add(this.maskMockup);
    // ۳) فضای دوربین‌ها: موکاپ (لنز دوربین) روی طرح — طرح داخل دوربین دیده نمی‌شود
    const camD = (m.camRects || []).map(c => this._rrectD(c.x - m.imgW / 2, c.y - m.imgH / 2, c.w, c.h, c.r || 0)).join(' ');
    if (camD) {
      this.maskCam = new fabric.Image(this.mockupEl, {
        left: ox, top: oy, scaleX: s, scaleY: s,
        selectable: false, evented: false, excludeFromExport: true,
        objectCaching: true, name: '__cam_mask__',
      });
      this.maskCam.clipPath = new fabric.Path(camD, { fillRule: 'nonzero' });
      canvas.add(this.maskCam);
    }
    this._topMasks();
  },
  _topMasks() {
    if (!this.maskOutside && !this.maskCam) return;
    if (this.maskOutside) this.maskOutside.bringToFront();
    if (this.maskMockup) this.maskMockup.bringToFront();
    if (this.maskCam) this.maskCam.bringToFront();
    if (this.guideGroup) this.guideGroup.bringToFront();
    this.canvas.requestRenderAll();
  },

  /* ---------- رویدادها ---------- */
  _bindEvents() {
    this._space = false;
    this._panning = false;
    this._panLast = null;

    const isEditable = t => !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable));
    const editorOn = () => {
      const ea = document.getElementById('editorApp');
      return ea && ea.classList.contains('on');
    };

    /* ابزار دست با نگه‌داشتن Space */
    window.addEventListener('keydown', e => {
      if (e.code !== 'Space' || !editorOn()) return;
      if (isEditable(e.target)) return;                       // تایپ فاصله در فیلدها دست‌نخورده
      const a = this.canvas.getActiveObject();
      if (a && a.isEditing) return;                           // تایپ فاصله داخل متن
      e.preventDefault();                                     // همیشه جلوی اسکرول صفحه را بگیر
      if (this._space) return;
      this._space = true;
      this.canvas.selection = false;
      this.canvas.getObjects().forEach(o => { if (!o.excludeFromExport) { o.evented = false; o.selectable = false; } });
      this.canvas.defaultCursor = 'grab';
      this.canvas.setCursor('grab');
      this.canvas.requestRenderAll();
    });
    window.addEventListener('keyup', e => {
      if (e.code !== 'Space') return;
      this._space = false;
      if (this._panning) this._endPan();
      this.canvas.selection = true;
      this.canvas.getObjects().forEach(o => { if (!o.excludeFromExport) { o.evented = true; o.selectable = true; } });
      this.canvas.defaultCursor = 'default';
      this.canvas.setCursor('default');
      this.canvas.requestRenderAll();
    });
    // اگر وسطِ نگه‌داشتن Space فوکوس پنجره رفت، حالت دست قفل نشود
    window.addEventListener('blur', () => {
      if (!this._space) return;
      this._space = false;
      if (this._panning) this._endPan();
      this.canvas.selection = true;
      this.canvas.getObjects().forEach(o => { if (!o.excludeFromExport) { o.evented = true; o.selectable = true; } });
      this.canvas.defaultCursor = 'default';
      this.canvas.setCursor('default');
      this.canvas.requestRenderAll();
    });

    this.canvas.on('mouse:down', o => {
      const e = o.e;
      if (this._space && e.button === 0 || e.button === 1) { // Space+درگ یا کلیک وسط = پن
        this._panning = true;
        this._panLast = { x: e.clientX, y: e.clientY };
        this.canvas.discardActiveObject();
        this.canvas.setCursor('grabbing');
        try { this.canvas.upperCanvasEl.setPointerCapture(e.pointerId); } catch (_) {} // ادامه‌ی پن حتی بیرون بوم
        e.preventDefault();
      }
    });
    this.canvas.on('mouse:move', o => {
      if (!this._panning) return;
      const e = o.e;
      const dx = e.clientX - this._panLast.x, dy = e.clientY - this._panLast.y;
      this._panLast = { x: e.clientX, y: e.clientY };
      const vpt = this.canvas.viewportTransform;
      this.canvas.setViewportTransform([vpt[0], vpt[1], vpt[2], vpt[3], vpt[4] + dx, vpt[5] + dy]);
      this._clampViewport();
      e.preventDefault();
    });
    this.canvas.on('mouse:up', () => { if (this._panning) this._endPan(); });

    this.canvas.on('selection:created', e => this.onSelect(e.selected));
    this.canvas.on('selection:updated', e => this.onSelect(e.selected));
    this.canvas.on('selection:cleared', () => this.onSelect([]));
    this.canvas.on('object:modified', () => this.onObjectChanged());
    this.canvas.on('object:added', o => {
      const t = o.target;
      if (!t.excludeFromExport && !t.__loading) {
        if (!this.state.preview) this._topMasks();
        this.onObjectChanged();
      }
    });
    this.canvas.on('object:removed', o => { if (!o.target.excludeFromExport) this.onObjectChanged(); });
    this.canvas.on('mouse:wheel', opt => {
      const d = opt.e.deltaY;
      let zoom = this.canvas.getZoom();
      zoom *= 0.999 ** d;
      zoom = Math.min(Math.max(zoom, this.fitScale * 0.4), this.fitScale * 6);
      this.canvas.zoomToPoint(new fabric.Point(opt.e.offsetX, opt.e.offsetY), zoom);
      this.state.zoom = zoom / this.fitScale;
      this._clampViewport();
      opt.e.preventDefault(); opt.e.stopPropagation();
      this.emitZoom();
    });
    window.addEventListener('resize', () => this.resize());
    // تغییر اندازه‌ی ناحیه‌ی بوم (بدون رفرش پنجره) هم ری‌فیت کند — در قالب وردپرس لازم است
    const holder = document.getElementById('canvasHolder');
    if (holder && fabric.window.ResizeObserver) {
      this._ro = new fabric.window.ResizeObserver(() => this.resize());
      this._ro.observe(holder);
    }
  },

  _endPan() {
    this._panning = false;
    this._panLast = null;
    this.canvas.setCursor(this._space ? 'grab' : 'default');
    this.canvas.requestRenderAll();
  },

  resize() {
    const holder = document.getElementById('canvasHolder');
    const w = holder.clientWidth - 4, h = holder.clientHeight - 4;
    if (w < 100 || h < 100) return;
    const m = this.model?.mockup;
    if (!m || !m.imgW) { this.canvas.setDimensions({ width: w, height: h }); return; }
    // ری‌فیت کامل: موکاپ همیشه به اندازه‌ی درست و وسط بوم — و لایه‌ها نسبت به فضای چاپ قفل می‌مانند
    const oldFit = this.fitScale || 1;
    const newFit = Math.min(w / m.imgW, h / m.imgH) * 0.94;
    const k = newFit / oldFit;
    const oldOff = this.offset || { x: 0, y: 0 };
    const newOff = { x: (w - m.imgW * newFit) / 2, y: (h - m.imgH * newFit) / 2 };
    const oldBoxLeft = m.printRect.x * oldFit + oldOff.x;
    const oldBoxTop = m.printRect.y * oldFit + oldOff.y;
    const newBoxLeft = m.printRect.x * newFit + newOff.x;
    const newBoxTop = m.printRect.y * newFit + newOff.y;
    this.canvas.setDimensions({ width: w, height: h });
    this.fitScale = newFit;
    this.offset = newOff;
    // موکاپ
    const mk = this.canvas.getObjects().find(o => o.name === '__mockup__');
    if (mk) mk.set({ left: newOff.x, top: newOff.y, width: m.imgW, height: m.imgH, scaleX: newFit, scaleY: newFit });
    // لایه‌های کاربر: نسبت به کادر چاپ در همان نقطه می‌مانند (مقیاس هم همگام می‌شود)
    this.layers().forEach(o => {
      o.set({ left: newBoxLeft + (o.left - oldBoxLeft) * k, top: newBoxTop + (o.top - oldBoxTop) * k });
      if (o.type === 'textbox') o.set({ fontSize: (o.fontSize || 20) * k });
      else o.set({ scaleX: (o.scaleX || 1) * k, scaleY: (o.scaleY || 1) * k });
      o.setCoords();
    });
    if (!this.state.preview) this.renderGuides(m.printRect, m.camRects);
    this.canvas.setZoom(this.fitScale * this.state.zoom);
    this._clampViewport();
    this.canvas.requestRenderAll();
  },

  /* محدودکردن پن/زوم تا نمای بیرون از ورقه‌ی ماسک نرود (ماسک ۲٫۵ برابر ابعاد بوم را می‌پوشاند) */
  clampViewport() { this._clampViewport(); },
  topMasks() { this._topMasks(); },
  _clampViewport() {
    const vpt = this.canvas.viewportTransform;
    const W = this.canvas.width, H = this.canvas.height;
    const zoom = vpt[0] || 1;
    const minX = -3.5 * W * zoom + W, maxX = 2.5 * W * zoom;
    const minY = -3.5 * H * zoom + H, maxY = 2.5 * H * zoom;
    vpt[4] = Math.min(Math.max(vpt[4], minX), maxX);
    vpt[5] = Math.min(Math.max(vpt[5], minY), maxY);
    this.canvas.setViewportTransform(vpt);
  },

  onSelect(sel) { window.dispatchEvent(new CustomEvent('editor:select', { detail: sel })); },
  onObjectChanged() { window.dispatchEvent(new CustomEvent('editor:changed')); },
  emitZoom() { window.dispatchEvent(new CustomEvent('editor:zoom', { detail: this.state.zoom })); },

  /* ---------- افزودن آبجکت ---------- */
  center() { const p = this.printBox(); return new fabric.Point(p.left + p.width / 2, p.top + p.height / 2); },
  printBox() {
    const s = this.fitScale, r = this.model.mockup.printRect;
    return {
      left: r.x * s + (this.offset?.x || 0), top: r.y * s + (this.offset?.y || 0),
      width: r.w * s, height: r.h * s,
    };
  },
  fitObject(obj, maxRatio) {
    const box = this.printBox();
    const r = Math.min((box.width * (maxRatio || 0.7)) / obj.width, (box.height * 0.55) / obj.height);
    obj.scale(r);
  },

  addImage(url, opts = {}) {
    fabric.Image.fromURL(url, img => {
      img.set({ ...{ originX: 'center', originY: 'center', name: uid() }, ...opts });
      this.fitObject(img);
      const c = this.center();
      img.set({ left: c.x, top: c.y });
      this.canvas.add(img);
      this.canvas.setActiveObject(img);
      this.canvas.requestRenderAll();
    }, { crossOrigin: 'anonymous' });
  },

  addText(text = 'متن خود را بنویسید', opts = {}) {
    const t = new fabric.Textbox(text, {
      ...{
        originX: 'center', originY: 'center', name: uid(),
        fontFamily: 'Vazirmatn', fontSize: 44 / this.fitScale, fill: '#111827',
        width: (this.model.mockup.printRect.w * this.fitScale) * 0.85,
        textAlign: isRTLText(text) ? 'right' : 'left',
        direction: isRTLText(text) ? 'rtl' : 'ltr',
        splitByGrapheme: true, lineHeight: 1.3,
      }, ...opts,
    });
    const c = this.center();
    t.set({ left: c.x, top: c.y });
    this.canvas.add(t);
    this.canvas.setActiveObject(t);
    this.canvas.requestRenderAll();
    return t;
  },

  /* ---------- لایه‌ها ---------- */
  layers() { return this.canvas.getObjects().filter(o => !o.excludeFromExport); },
  selectLayer(id) {
    const o = this.layers().find(x => x.name === id);
    if (o) { this.canvas.setActiveObject(o); this.canvas.requestRenderAll(); }
  },

  /* ---------- پیش‌نمایش با برش نمایشی دوربین ---------- */
  enterPreview() {
    if (this.state.preview) return Promise.resolve();
    this.canvas.discardActiveObject();
    this._objects = this.canvas.getObjects();
    this._clearKeepBg();
    this.state.preview = true;
    window.dispatchEvent(new CustomEvent('editor:changed'));
    // ۱) اسنپ‌شات کامل طراحی (بدون راهنما و بدون موکاپ)
    const tmp = new fabric.StaticCanvas(null, { width: this.canvas.width, height: this.canvas.height });
    tmp.setZoom(this.canvas.getZoom());
    this._objects.forEach(o => { if (!o.excludeFromExport) tmp.add(o); });
    tmp.renderAll();
    const designUrl = tmp.toDataURL();
    // ۲) ساخت تصویر پیش‌نمایش: زمینه + موکاپ (گوشی) + طرحِ برش‌خورده
    //    - طرح فقط داخل فضای چاپ دیده می‌شود
    //    - فضای دوربین‌ها از روی طرح برش می‌خورد (لنز گوشی زیرش نمایان می‌ماند)
    const s = this.fitScale, z = this.canvas.getZoom();
    const ox = this.offset?.x || 0, oy = this.offset?.y || 0;
    const W = this.canvas.width, H = this.canvas.height;
    // پیش‌نمایش باید Promise بدهد تا مودال بعد از آماده‌شدن تصویر برش‌خورده ساخته شود (رفع باگ پیش‌نمایش خالی)
    return new Promise(resolve => {
      const img = new Image();
      const rr = (ctx, x, y, w, h, r) => {
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        if (ctx.beginPath) ctx.beginPath(); // Path2D متد beginPath ندارد
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
        else {
          ctx.moveTo(x + r, y);
          ctx.arcTo(x + w, y, x + w, y + h, r);
          ctx.arcTo(x + w, y + h, x, y + h, r);
          ctx.arcTo(x, y + h, x, y, r);
          ctx.arcTo(x, y, x + w, y, r);
          ctx.closePath();
        }
      };
      img.onload = () => {
        // الف) طرحِ تنها: برش دوربین‌ها + برش بیرونِ فضای چاپ (فقط نمایشی؛ فایل چاپ دست‌نخورده)
        const dcut = document.createElement('canvas');
        dcut.width = W; dcut.height = H;
        const dctx = dcut.getContext('2d');
        dctx.drawImage(img, 0, 0);
        dctx.globalCompositeOperation = 'destination-out';
        dctx.fillStyle = '#000';
        this.model.mockup.camRects.forEach(c => {
          rr(dctx, (c.x * s + ox) * z, (c.y * s + oy) * z, c.w * s * z, c.h * s * z, (c.r || 0) * s * z);
          dctx.fill();
        });
        const pr = this.model.mockup.printRect;
        const outer = new Path2D();
        outer.rect(0, 0, W, H);
        const inner = new Path2D();
        rr(inner, (pr.x * s + ox) * z, (pr.y * s + oy) * z, pr.w * s * z, pr.h * s * z, (pr.radius || 0) * s * z);
        if (outer.addPath) { outer.addPath(inner); dctx.fill(outer, 'evenodd'); }
        // ب) ترکیب نهایی: زمینه‌ی بوم + موکاپ + طرح برش‌خورده
        const plain = document.createElement('canvas');
        plain.width = W; plain.height = H;
        const pctx = plain.getContext('2d');
        pctx.fillStyle = this.canvas.backgroundColor || '#f3f4f6';
        pctx.fillRect(0, 0, W, H);
        if (this.mockupEl) {
          const M = this.model.mockup;
          // اسنپ‌شات طرح با زوم پخته‌شده است؛ موکاپ هم باید در همان فضای زوم‌دار رسم شود
          pctx.drawImage(this.mockupEl, ox * z, oy * z, M.imgW * s * z, M.imgH * s * z);
        }
        pctx.drawImage(dcut, 0, 0);
        const finalUrl = plain.toDataURL();
        fabric.Image.fromURL(finalUrl, fimg => {
          if (!this.state.preview) return resolve(); // پیش‌نمایش وسط کار لغو شد
          // اسنپ‌شات با زوم پخته‌شده (z) گرفته شده؛ برای نمایش ۱:۱ روی بومِ زوم‌دار
          // باید مقیاس عکس ۱/z باشد تا زوم بوم دقیقاً خنثی شود (جلوگیری از زوم مضاعف)
          fimg.set({ left: 0, top: 0, originX: 'left', originY: 'top', scaleX: 1 / z, scaleY: 1 / z, selectable: false, evented: false, excludeFromExport: true, name: '__preview_cut__' });
          this.canvas.add(fimg);
          // راهنماها روی پیش‌نمایش
          this.renderGuides(this.model.mockup.printRect, this.model.mockup.camRects);
          this.canvas.requestRenderAll();
          resolve();
        });
      };
      img.onerror = () => resolve();
      img.src = designUrl;
    });
  },

  exitPreview() {
    if (!this.state.preview) return;
    this._clearKeepBg();
    this.state.preview = false;
    (this._objects || []).forEach(o => this.canvas.add(o));
    this._objects = null;
    this.renderGuides(this.model.mockup.printRect, this.model.mockup.camRects);
    this.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent('editor:changed'));
  },

  togglePreview() { this.state.preview ? this.exitPreview() : this.enterPreview(); },

  /* ---------- خروجی چاپ: کامل، بدون هیچ برشی ---------- */
  // فقط ناحیه‌ی «فضای چاپ» روی بوم خروجی نگاشت می‌شود؛ هیچ برشی (از جمله برش دوربین) اعمال نمی‌شود.
  exportPrint(opts = {}) {
    const m = this.model.mockup;
    const boxW = m.printRect.w * this.fitScale, boxH = m.printRect.h * this.fitScale;
    const mmToPx = opts.dpi || m.dpi || 300; // پیکسل بر اینچ
    const pxW = Math.round(m.printMm.w * mmToPx / 25.4);
    const pxH = Math.round(m.printMm.h * mmToPx / 25.4);
    const sc = pxW / boxW;
    const exp = new fabric.StaticCanvas(null, { width: pxW, height: pxH });
    exp.backgroundColor = opts.bg || '#ffffff';
    const ox = this.offset?.x || 0, oy = this.offset?.y || 0;
    const boxLeft = m.printRect.x * this.fitScale + ox;
    const boxTop = m.printRect.y * this.fitScale + oy;
    const clones = this.layers().map(o => EditorEngine.cloneAsync(o).then(c => {
      c.set({ left: c.left - boxLeft, top: c.top - boxTop });
      exp.add(c);
    }));
    return Promise.all(clones).then(() => {
      // مقیاس ثابت: زوم نمایشی بوم نباید روی ابعاد فایل چاپ اثر بگذارد
      exp.setZoom(sc);
      exp.renderAll();
      return { dataUrl: exp.toDataURL({ format: 'png' }), width: pxW, height: pxH, scale: sc, mmToPx };
    });
  },

  exportPreviewThumb(includeMockup) {
    const inPreview = this.state.preview;
    const src = inPreview ? this.canvas.getObjects() : this.layers();
    const tmp = new fabric.StaticCanvas(null, { width: this.canvas.width, height: this.canvas.height, backgroundColor: '#ffffff' });
    tmp.setZoom(this.canvas.getZoom());
    if (inPreview) {
      src.forEach(o => {
        const n = String(o.name || '');
        if (n.startsWith('__preview')) tmp.add(o);               // فقط تصویر برش‌خورده‌ی پیش‌نمایش
      });
    } else {
      if (includeMockup) {
        const mk = this.canvas.getObjects().find(o => o.name === '__mockup__');
        if (mk) tmp.add(mk);
      }
      src.forEach(o => tmp.add(o));                              // لایه‌ها (ماسک‌ها و راهنماها excludeFromExport و خارج از layers هستند)
    }
    tmp.renderAll();
    return tmp.toDataURL({ format: 'jpeg', quality: 0.85 });
  },

  /* ---------- سریال‌سازی ---------- */
  serialize() {
    const layers = this.layers().map(o => ({
      name: o.name, type: o.type, left: o.left, top: o.top,
      scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle,
      ...(o.type === 'textbox' ? { text: o.text, fontSize: o.fontSize, fontFamily: o.fontFamily, fill: o.fill, fontWeight: o.fontWeight, textAlign: o.textAlign, direction: o.direction, width: o.width } : {}),
      src: o._originalElement ? o._originalElement.currentSrc || o._originalElement.src : (o.getSrc && o.getSrc()),
      modelId: this.model.id,
      fitScale: this.fitScale,
      version: 1,
    }));
    return JSON.stringify(layers);
  },

  loadSerialized(json) {
    try {
      const layers = JSON.parse(json);
      this._clearKeepBg();
      this.renderGuides(this.model.mockup.printRect, this.model.mockup.camRects);
      const self = this;
      let pending = layers.length;
      const ordered = []; // آبجکت‌ها با ایندکس سریال‌شده — برای بازسازی دقیق ترتیب لایه‌ها
      const done = () => {
        if (--pending !== 0) return;
        // عکس‌ها آسنکرون لود می‌شوند و ترتیب اضافه‌شدن را به هم می‌زنند؛
        // ترتیب ذخیره‌شده را دقیقاً بازسازی کن (پایین→بالا)
        ordered.sort((a, b) => a.i - b.i)
          .forEach(({ o }) => { self.canvas.remove(o); self.canvas.add(o); });
        self._topMasks();
        window.dispatchEvent(new CustomEvent('editor:changed'));
      };
      if (!pending) { window.dispatchEvent(new CustomEvent('editor:changed')); return; }
      layers.forEach((L, i) => {
        if (L.modelId !== self.model.id) { done(); return; }
        if (L.type === 'textbox') {
          const t = new fabric.Textbox(L.text, {
            left: L.left, top: L.top, scaleX: L.scaleX, scaleY: L.scaleY, angle: L.angle,
            fontFamily: L.fontFamily, fontSize: L.fontSize, fill: L.fill, fontWeight: L.fontWeight || 'normal',
            textAlign: L.textAlign, direction: L.direction, width: L.width, splitByGrapheme: true, name: L.name,
          });
          self.canvas.add(t);
          ordered.push({ o: t, i });
          done();
        } else if (L.src) {
          fabric.Image.fromURL(L.src, img => {
            img.set({ left: L.left, top: L.top, scaleX: L.scaleX, scaleY: L.scaleY, angle: L.angle, name: L.name });
            self.canvas.add(img);
            ordered.push({ o: img, i });
            done();
          }, { crossOrigin: 'anonymous' });
        } else { done(); }
      });
    } catch (e) { console.warn('loadSerialized:', e); }
  },

  /* ---------- بازنشانی ---------- */
  clearDesign() {
    this._clearKeepBg();
    this.renderGuides(this.model.mockup.printRect, this.model.mockup.camRects);
    this.onObjectChanged();
  },

  setModel(model) {
    this.model = model;
    this.setupImage(model.mockup.img, model.mockup.printRect, model.mockup.camRects, model.mockup.printMm);
  },
};
