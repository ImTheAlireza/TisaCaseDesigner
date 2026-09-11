/* ============================================================
   موتور ادیتور — مبتنی بر Fabric.js
   - کادرها (فضای چاپ / دوربین / فریم اصلی) فقط راهنما هستن
   - خروجی چاپ: بر اساس فریم اصلی (اگر تعریف شده) وگرنه فضای چاپ
   - پیش‌نمایش: موکاپ وسط و بزرگ، همراه با ماسک‌ها
   ============================================================ */
const EditorEngine = {
  model: null,
  canvas: null,
  guideGroup: null,
  _objects: null,
  state: { preview: false, zoom: 1 },

  fitScale: 1,
  offset: { x: 0, y: 0 },
  MARGIN: 0.94,
  SAFE_GAP: 12,
  SAFE_TOP_MAX: 240,
  FONT_IMG: 44,
  ZOOM_MIN: 0.4, ZOOM_MAX: 6,

  safeTop() {
    const holder = document.getElementById('canvasHolder');
    const bar = document.querySelector && document.querySelector('#stage .ed-float');
    if (!holder || !bar || !holder.getBoundingClientRect || !bar.getBoundingClientRect) return 0;
    const hRect = holder.getBoundingClientRect(), bRect = bar.getBoundingClientRect();
    if (!(bRect.height > 0) || !(bRect.top <= hRect.bottom)) return 0;
    const over = bRect.bottom - hRect.top;
    if (!(over > 0)) return 0;
    return Math.min(over + this.SAFE_GAP, this.SAFE_TOP_MAX);
  },

  measure() {
    const holder = document.getElementById('canvasHolder');
    if (!holder) return { w: 0, h: 0, holder: null };
    const r = holder.getBoundingClientRect && holder.getBoundingClientRect();
    return {
      w: Math.round(((r && r.width) || holder.clientWidth || 0) * 100) / 100,
      h: Math.round(((r && r.height) || holder.clientHeight || 0) * 100) / 100,
      holder,
    };
  },

  _layoutFor(w, h, top) {
    const m = this.model && this.model.mockup;
    if (!m || !(m.imgW > 0) || !(m.imgH > 0) || !(w > 0) || !(h > 0)) return null;
    if (top == null) top = this.safeTop();
    const availH = Math.max(80, h - top);
    const s = Math.min(w / m.imgW, availH / m.imgH) * this.MARGIN;
    if (!isFinite(s) || s <= 0) return null;
    return { s, x: (w - m.imgW * s) / 2, y: top + (availH - m.imgH * s) / 2, top };
  },
  toWorld(x, y) {
    const s = this.fitScale, o = this.offset || { x: 0, y: 0 };
    return { x: x * s + o.x, y: y * s + o.y };
  },
  toImg(x, y) {
    const s = this.fitScale || 1, o = this.offset || { x: 0, y: 0 };
    return { x: (x - o.x) / s, y: (y - o.y) / s };
  },

  cloneAsync(o) {
    return new Promise(res => {
      const r = o.clone(c => res(c));
      if (r && typeof r.then === 'function') r.then(c => res(c));
    });
  },

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
    requestAnimationFrame(() => requestAnimationFrame(() => this.resize()));
    return this;
  },

  setupImage(imgUrl, printRect, camRects, printMm) {
    const canvas = this.canvas;
    this._clearKeepBg();
    canvas.backgroundColor = '#f3f4f6';
    fabric.Image.fromURL(imgUrl, img => {
      if (!this.model) return;
      this.model.mockup.imgW = img.width; this.model.mockup.imgH = img.height;
      this.mockupEl = img.getElement ? img.getElement() : img._element;
      const L = this._layoutFor(canvas.width, canvas.height) || { s: 1, x: 0, y: 0 };
      this.fitScale = L.s;
      this.offset = { x: Math.max(0, L.x), y: Math.max(0, L.y) };
      const mk = new fabric.Rect({
        left: this.offset.x, top: this.offset.y, width: img.width, height: img.height,
        fill: new fabric.Pattern({ source: img.getElement ? img.getElement() : img._element, repeat: 'no-repeat' }),
        selectable: false, evented: false, excludeFromExport: true,
        objectCaching: false, name: '__mockup__',
        scaleX: this.fitScale, scaleY: this.fitScale,
      });
      canvas.add(mk);
      mk.sendToBack();
      this.canvas.setZoom(1);
      this.renderGuides();
      this.state.preview = false;
      this.state.zoom = 1;
      window.dispatchEvent(new CustomEvent('editor:modelLoaded'));
    }, { crossOrigin: 'anonymous' });
  },

  /* ---------- کادرهای راهنما (چاپ / دوربین / فریم اصلی) ---------- */
  renderGuides(printRect, camRects) {
    const m = this.model?.mockup;
    if (!m) return;
    const pr = printRect || m.printRect;
    const crs = camRects || m.camRects || [];
    const mr = m.mainRect;
    const s = this.fitScale, settings = (typeof DB !== 'undefined' && DB.get) ? DB.get().settings : {};
    const printColor = m.printColor || settings.printColor || '#304ffe';
    const camColor = m.camColor || settings.camColor || '#ed1944';
    const mainColor = m.mainColor || settings.mainColor || '#10b981';
    if (this.guideGroup) { this.canvas.remove(this.guideGroup); this.guideGroup = null; }
    const objs = [];
    const dash = [6, 4];
    const ox = this.offset?.x || 0, oy = this.offset?.y || 0;

    const mkChip = (txt, color, x, y, alignRight) => {
      const t = new fabric.Text(txt, {
        fontSize: 9.5, fill: '#fff', fontFamily: 'Vazirmatn', fontWeight: 'bold',
        selectable: false, evented: false, excludeFromExport: true, objectCaching: false,
      });
      const pad = 6;
      const chip = new fabric.Rect({
        left: alignRight ? x - t.width - pad * 2 : x, top: y,
        width: t.width + pad * 2, height: t.height + 4,
        rx: (t.height + 4) / 2, ry: (t.height + 4) / 2,
        fill: color, selectable: false, evented: false, excludeFromExport: true, objectCaching: false,
      });
      t.set({ left: chip.left + pad, top: chip.top + 2 });
      return [chip, t];
    };

    const inset = 4;
    if (pr && pr.w > 0 && pr.h > 0) {
      const prR = (pr.radius || 0) * s;
      const printBox = new fabric.Rect({
        left: pr.x * s + ox, top: pr.y * s + oy, width: pr.w * s, height: pr.h * s,
        rx: prR, ry: prR,
        fill: 'rgba(48,79,254,0.05)', stroke: printColor, strokeWidth: 1.4,
        strokeDashArray: dash, selectable: false, evented: false, excludeFromExport: true,
        objectCaching: false, name: '__guide_print__',
      });
      const [printChip, printTxt] = mkChip('فضای چاپ', printColor, printBox.left + inset, printBox.top + inset, false);
      objs.push(printBox, printChip, printTxt);
    }

    (crs || []).forEach(c => {
      if (!c || c.w <= 0 || c.h <= 0) return;
      const cr = (c.r || 0) * s;
      const camBox = new fabric.Rect({
        left: c.x * s + ox, top: c.y * s + oy, width: c.w * s, height: c.h * s,
        rx: cr, ry: cr,
        fill: 'rgba(237,25,68,0.06)', stroke: camColor, strokeWidth: 1.4,
        strokeDashArray: dash, selectable: false, evented: false, excludeFromExport: true,
        objectCaching: false, name: '__guide_cam__',
      });
      const [camChip, camTxt] = mkChip('دوربین', camColor, camBox.left + camBox.width - inset, camBox.top + inset, true);
      objs.push(camBox, camChip, camTxt);
    });

    if (mr && mr.w > 0 && mr.h > 0) {
      const mrR = (mr.radius || 0) * s;
      const mainBox = new fabric.Rect({
        left: mr.x * s + ox, top: mr.y * s + oy, width: mr.w * s, height: mr.h * s,
        rx: mrR, ry: mrR,
        fill: 'rgba(16,185,129,0.06)', stroke: mainColor, strokeWidth: 1.6,
        strokeDashArray: [8, 5], selectable: false, evented: false, excludeFromExport: true,
        objectCaching: false, name: '__guide_main__',
      });
      const [mainChip, mainTxt] = mkChip('فریم اصلی', mainColor, mainBox.left + inset, mainBox.top + mainBox.height + 6, false);
      objs.push(mainBox, mainChip, mainTxt);
    }

    if (!objs.length) return;
    const group = new fabric.Group(objs, { selectable: false, evented: false, excludeFromExport: true });
    group.name = '__guide_group__';
    this.canvas.add(group);
    this.guideGroup = group;
    const guidesOn = (typeof DB !== 'undefined' && DB.get) ? (DB.get().settings.guidesOn !== false) : true;
    this.setGuidesVisible(guidesOn);
    this._syncMasks();
    group.bringToFront();
    this.canvas.requestRenderAll();
  },

  setGuidesVisible(v) {
    if (this.guideGroup) this.guideGroup.visible = !!v;
    if (this.canvas) this.canvas.requestRenderAll();
  },

  _rrectD(x, y, w, h, r) {
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    if (!r) return `M ${x} ${y} h ${w} v ${h} h ${-w} Z`;
    return `M ${x + r} ${y} h ${w - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - 2 * r} a ${r} ${r} 0 0 1 ${-r} ${r} h ${-(w - 2 * r)} a ${r} ${r} 0 0 1 ${-r} ${-r} v ${-(h - 2 * r)} a ${r} ${r} 0 0 1 ${r} ${-r} Z`;
  },

  _fillRoundedRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    ctx.fill();
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
    const p = m.printRect;
    if (!p || p.w <= 0) return;
    const outer = `M 0 0 h ${6 * W} v ${6 * H} h ${-6 * W} Z`;
    const hole = this._rrectD(p.x * s + ox + 2.5 * W, p.y * s + oy + 2.5 * H, p.w * s, p.h * s, (p.radius || 0) * s);
    this.maskOutside = new fabric.Path(outer + ' ' + hole, {
      left: -2.5 * W, top: -2.5 * H, originX: 'left', originY: 'top',
      fill: canvas.backgroundColor || '#f3f4f6', fillRule: 'evenodd',
      selectable: false, evented: false, excludeFromExport: true,
      objectCaching: false, name: '__outside_print_mask__',
    });
    canvas.add(this.maskOutside);
    this.maskMockup = new fabric.Image(this.mockupEl, {
      left: ox, top: oy, scaleX: s, scaleY: s,
      selectable: false, evented: false, excludeFromExport: true,
      objectCaching: true, name: '__mockup_outside__',
    });
    this.maskMockup.clipPath = new fabric.Path(
      this._rrectD(p.x - m.imgW / 2, p.y - m.imgH / 2, p.w, p.h, p.radius || 0),
      { fillRule: 'nonzero', inverted: true });
    canvas.add(this.maskMockup);
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

  _bindEvents() {
    this._space = false;
    this._panning = false;
    this._panLast = null;

    const isEditable = t => !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable));
    const editorOn = () => {
      const ea = document.getElementById('editorApp');
      return ea && ea.classList.contains('on');
    };

    window.addEventListener('keydown', e => {
      if (e.code !== 'Space' || !editorOn()) return;
      if (isEditable(e.target)) return;
      const a = this.canvas.getActiveObject();
      if (a && a.isEditing) return;
      e.preventDefault();
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
      if (this._space && e.button === 0 || e.button === 1) {
        this._panning = true;
        this._panLast = { x: e.clientX, y: e.clientY };
        this.canvas.discardActiveObject();
        this.canvas.setCursor('grabbing');
        try { this.canvas.upperCanvasEl.setPointerCapture(e.pointerId); } catch (_) {}
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
      let zoom = this.state.zoom * (0.999 ** d);
      zoom = Math.min(Math.max(zoom, this.ZOOM_MIN), this.ZOOM_MAX);
      this.canvas.zoomToPoint(new fabric.Point(opt.e.offsetX, opt.e.offsetY), zoom);
      this.state.zoom = zoom;
      this._clampViewport();
      opt.e.preventDefault(); opt.e.stopPropagation();
      this.emitZoom();
    });
    window.addEventListener('resize', () => this.resize());
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
    if (!this.canvas) return;
    const { w, h } = this.measure();
    if (w < 100 || h < 100) return;
    const safe = this.safeTop();
    if (this._lastW != null && Math.abs(this._lastW - w) < .5 && Math.abs(this._lastH - h) < .5
        && Math.abs((this._lastSafe || 0) - safe) < 1) return;
    this._lastW = w; this._lastH = h; this._lastSafe = safe;
    const m = this.model?.mockup;
    if (!m || !m.imgW) { this.canvas.setDimensions({ width: w, height: h }); return; }
    const L = this._layoutFor(w, h, safe);
    if (!L) return;
    const oldFit = this.fitScale > 0 ? this.fitScale : L.s, newFit = L.s;
    const oldOff = this.offset || { x: 0, y: 0 };
    const k = newFit / oldFit;
    const newOff = { x: Math.max(0, L.x), y: Math.max(0, L.y) };
    const oldBox = { x: m.printRect.x * oldFit + oldOff.x, y: m.printRect.y * oldFit + oldOff.y };
    const newBox = { x: m.printRect.x * newFit + newOff.x, y: m.printRect.y * newFit + newOff.y };
    this.canvas.setDimensions({ width: w, height: h });
    this.fitScale = newFit;
    this.offset = newOff;
    const mk = this.canvas.getObjects().find(o => o.name === '__mockup__');
    if (mk) mk.set({ left: newOff.x, top: newOff.y, width: m.imgW, height: m.imgH, scaleX: newFit, scaleY: newFit });
    this.layers().forEach(o => {
      o.set({ left: newBox.x + (o.left - oldBox.x) * k, top: newBox.y + (o.top - oldBox.y) * k });
      if (o.type === 'textbox') {
        o.set({ fontSize: (o.fontSize || 20) * k, width: Math.max(10, (o.width || 10) * k) });
      } else {
        o.set({ scaleX: (o.scaleX || 1) * k, scaleY: (o.scaleY || 1) * k });
      }
      o.setCoords();
    });
    if (!this.state.preview) this.renderGuides();
    this.canvas.setZoom(this.state.zoom);
    this._clampViewport();
    this.canvas.requestRenderAll();
  },

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

  center() { const p = this.printBox(); return new fabric.Point(p.left + p.width / 2, p.top + p.height / 2); },
  printBox() {
    const r = this.model.mockup.printRect, p = this.toWorld(r.x, r.y);
    return { left: p.x, top: p.y, width: r.w * this.fitScale, height: r.h * this.fitScale };
  },
  mainBox() {
    const m = this.model.mockup;
    const r = (m.mainRect && m.mainRect.w > 0) ? m.mainRect : m.printRect;
    const p = this.toWorld(r.x, r.y);
    return { left: p.x, top: p.y, width: r.w * this.fitScale, height: r.h * this.fitScale, rect: r };
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
        fontFamily: 'Vazirmatn', fontSize: this.FONT_IMG * this.fitScale, fill: '#111827',
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

  layers() { return this.canvas.getObjects().filter(o => !o.excludeFromExport); },
  selectLayer(id) {
    const o = this.layers().find(x => x.name === id);
    if (o) { this.canvas.setActiveObject(o); this.canvas.requestRenderAll(); }
  },

  /* ---------- تبدیل لایه world → img ---------- */
  _cloneToImgSpace(worldObj) {
    return this.cloneAsync(worldObj).then(clone => {
      const p = this.toImg(clone.left, clone.top);
      clone.set({
        left: p.x,
        top: p.y,
        scaleX: (clone.scaleX || 1) / (this.fitScale || 1),
        scaleY: (clone.scaleY || 1) / (this.fitScale || 1),
      });
      if (clone.type === 'textbox') {
        clone.set({
          fontSize: (clone.fontSize || 20) / (this.fitScale || 1),
          width: Math.max(10, (clone.width || 10) / (this.fitScale || 1)),
        });
      }
      return clone;
    });
  },

  _createDesignCanvasImgSpace() {
    const m = this.model?.mockup;
    if (!m || !m.imgW) return Promise.resolve(null);
    const W = m.imgW, H = m.imgH;
    const canvas = new fabric.StaticCanvas(null, { width: W, height: H, backgroundColor: 'transparent' });
    const layers = this.layers();
    if (!layers.length) {
      canvas.renderAll();
      return Promise.resolve(canvas);
    }
    const promises = layers.map(l => this._cloneToImgSpace(l).then(c => { canvas.add(c); }));
    return Promise.all(promises).then(() => {
      canvas.renderAll();
      return canvas;
    });
  },

  _createMaskedDesignCanvas() {
    const m = this.model?.mockup;
    if (!m) return Promise.resolve(null);
    return this._createDesignCanvasImgSpace().then(designCanvas => {
      if (!designCanvas) return null;
      const W = m.imgW, H = m.imgH;
      const designEl = designCanvas.lowerCanvasEl || (designCanvas.getElement && designCanvas.getElement()) || null;
      const masked = document.createElement('canvas');
      masked.width = W; masked.height = H;
      const ctx = masked.getContext('2d');
      if (designEl) {
        try { ctx.drawImage(designEl, 0, 0); } catch (e) {}
      }
      const pr = m.printRect;
      if (!pr || pr.w <= 0) return masked;
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = '#000';
      this._fillRoundedRect(ctx, pr.x, pr.y, pr.w, pr.h, pr.radius || 0);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      (m.camRects || []).forEach(c => {
        if (!c || c.w <= 0) return;
        this._fillRoundedRect(ctx, c.x, c.y, c.w, c.h, c.r || 0);
      });
      return masked;
    });
  },

  generateFullPreviewDataURL() {
    const m = this.model?.mockup;
    if (!m || !m.imgW || !this.mockupEl) return Promise.resolve('');
    return this._createMaskedDesignCanvas().then(maskedDesign => {
      if (!maskedDesign) return '';
      const W = m.imgW, H = m.imgH;
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = W; finalCanvas.height = H;
      const ctx = finalCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      try {
        ctx.drawImage(this.mockupEl, 0, 0, W, H);
      } catch (e) {
        // fallback: try to draw via pattern rect source already handled
      }
      ctx.drawImage(maskedDesign, 0, 0);
      return finalCanvas.toDataURL('image/png');
    });
  },

  /* ---------- پیش‌نمایش — همیشه وسط و بزرگ ---------- */
  enterPreview() {
    if (this.state.preview) return Promise.resolve();
    this.canvas.discardActiveObject();
    this._objects = this.canvas.getObjects().slice();
    this._clearKeepBg();
    this.state.preview = true;
    window.dispatchEvent(new CustomEvent('editor:changed'));
    return this.generateFullPreviewDataURL().then(dataUrl => {
      if (!this.state.preview) return;
      if (!dataUrl) {
        this.canvas.requestRenderAll();
        return;
      }
      const W = this.canvas.width, H = this.canvas.height;
      const m = this.model.mockup;
      const imgW = m.imgW, imgH = m.imgH;
      const scale = Math.min(W / imgW, H / imgH) * this.MARGIN;
      return new Promise(res => {
        fabric.Image.fromURL(dataUrl, fimg => {
          if (!this.state.preview) return res();
          fimg.set({
            left: (W - imgW * scale) / 2,
            top: (H - imgH * scale) / 2,
            originX: 'left',
            originY: 'top',
            scaleX: scale,
            scaleY: scale,
            selectable: false,
            evented: false,
            excludeFromExport: true,
            name: '__preview_cut__',
          });
          this.canvas.add(fimg);
          this.canvas.requestRenderAll();
          res();
        });
      });
    });
  },

  exitPreview() {
    if (!this.state.preview) return;
    this._clearKeepBg();
    this.state.preview = false;
    (this._objects || []).forEach(o => this.canvas.add(o));
    this._objects = null;
    this.renderGuides();
    this.canvas.requestRenderAll();
    window.dispatchEvent(new CustomEvent('editor:changed'));
  },

  togglePreview() { this.state.preview ? this.exitPreview() : this.enterPreview(); },

  _calcMainMmFromPrint() {
    const m = this.model?.mockup;
    if (!m) return { w: 66, h: 138 };
    const pr = m.printRect, mr = m.mainRect;
    if (!pr || !mr || pr.w <= 0 || pr.h <= 0) return m.printMm || { w: 66, h: 138 };
    const rw = mr.w / pr.w, rh = mr.h / pr.h;
    const base = m.printMm || { w: 66, h: 138 };
    return { w: base.w * rw, h: base.h * rh };
  },

  /* ---------- خروجی چاپ: بر اساس فریم اصلی اگر وجود داشته باشد ---------- */
  exportPrint(opts = {}) {
    const m = this.model.mockup;
    const hasMain = m.mainRect && m.mainRect.w > 0 && m.mainRect.h > 0;
    const srcRect = hasMain ? m.mainRect : m.printRect;
    const srcMm = hasMain ? (m.mainMm || this._calcMainMmFromPrint()) : m.printMm;
    const mmW = srcMm.w || 66, mmH = srcMm.h || 138;
    const mmToPx = opts.dpi || m.dpi || 300;
    const pxW = Math.round(mmW * mmToPx / 25.4);
    const pxH = Math.round(mmH * mmToPx / 25.4);
    const boxW = srcRect.w * this.fitScale;
    const boxH = srcRect.h * this.fitScale;
    const sc = pxW / (boxW || 1);
    const exp = new fabric.StaticCanvas(null, { width: pxW, height: pxH });
    exp.backgroundColor = opts.bg || '#ffffff';
    const worldLeft = srcRect.x * this.fitScale + (this.offset?.x || 0);
    const worldTop = srcRect.y * this.fitScale + (this.offset?.y || 0);
    const clones = this.layers().map(o => EditorEngine.cloneAsync(o).then(c => {
      c.set({ left: c.left - worldLeft, top: c.top - worldTop });
      exp.add(c);
    }));
    return Promise.all(clones).then(() => {
      exp.setZoom(sc);
      exp.renderAll();
      return { dataUrl: exp.toDataURL({ format: 'png' }), width: pxW, height: pxH, scale: sc, mmToPx, mmW, mmH, usingMain: !!hasMain };
    });
  },

  exportPreviewThumb(includeMockup) {
    if (includeMockup) {
      return this.generateFullPreviewDataURL().then(url => {
        if (!url) return '';
        return new Promise(res => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0);
            res(c.toDataURL('image/jpeg', 0.85));
          };
          img.onerror = () => res(url);
          img.src = url;
        });
      });
    } else {
      return this._createDesignCanvasImgSpace().then(canvas => {
        if (!canvas) return '';
        return canvas.toDataURL({ format: 'jpeg', quality: 0.85 });
      });
    }
  },

  serialize() {
    const s = this.fitScale || 1;
    const layers = this.layers().map(o => {
      const p = this.toImg(o.left, o.top);
      return {
        name: o.name, type: o.type, left: o.left, top: o.top,
        scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle,
        originX: o.originX, originY: o.originY,
        ...(o.type === 'textbox' ? { text: o.text, fontSize: o.fontSize, fontFamily: o.fontFamily, fill: o.fill, fontWeight: o.fontWeight, textAlign: o.textAlign, direction: o.direction, width: o.width } : {}),
        src: o._originalElement ? o._originalElement.currentSrc || o._originalElement.src : (o.getSrc && o.getSrc()),
        modelId: this.model.id,
        fitScale: s,
        ix: p.x, iy: p.y,
        iScaleX: (o.scaleX || 1) / s, iScaleY: (o.scaleY || 1) / s,
        ...(o.type === 'textbox' ? { iFontSize: (o.fontSize || 0) / s, iWidth: (o.width || 0) / s } : {}),
        version: 2,
      };
    });
    return JSON.stringify(layers);
  },

  loadSerialized(json) {
    try {
      const layers = JSON.parse(json);
      this._clearKeepBg();
      this.renderGuides();
      const self = this;
      const pos = L => (L.version >= 2 && typeof L.ix === 'number') ? this.toWorld(L.ix, L.iy) : { x: L.left, y: L.top };
      const isV2 = L => L.version >= 2 && typeof L.ix === 'number';
      let pending = layers.length;
      const ordered = [];
      const done = () => {
        if (--pending !== 0) return;
        ordered.sort((a, b) => a.i - b.i)
          .forEach(({ o }) => { self.canvas.remove(o); self.canvas.add(o); });
        self._topMasks();
        window.dispatchEvent(new CustomEvent('editor:changed'));
      };
      if (!pending) { window.dispatchEvent(new CustomEvent('editor:changed')); return; }
      layers.forEach((L, i) => {
        if (L.modelId !== self.model.id) { done(); return; }
        const v2 = isV2(L), f = v2 ? (self.fitScale || 1) : 1;
        const p = pos(L);
        const base = {
          left: p.x, top: p.y, angle: L.angle, name: L.name,
          scaleX: v2 ? (L.iScaleX ?? 1) * f : L.scaleX,
          scaleY: v2 ? (L.iScaleY ?? 1) * f : L.scaleY,
        };
        if (L.originX) base.originX = L.originX;
        if (L.originY) base.originY = L.originY;
        if (L.type === 'textbox') {
          const t = new fabric.Textbox(L.text, {
            ...base,
            fontFamily: L.fontFamily, fill: L.fill, fontWeight: L.fontWeight || 'normal',
            textAlign: L.textAlign, direction: L.direction, splitByGrapheme: true,
            fontSize: v2 ? (L.iFontSize ?? 20) * f : L.fontSize,
            width: Math.max(10, v2 ? (L.iWidth ?? 0) * f : L.width),
          });
          self.canvas.add(t);
          ordered.push({ o: t, i });
          done();
        } else if (L.src) {
          fabric.Image.fromURL(L.src, img => {
            img.set(base);
            self.canvas.add(img);
            ordered.push({ o: img, i });
            done();
          }, { crossOrigin: 'anonymous' });
        } else { done(); }
      });
    } catch (e) { console.warn('loadSerialized:', e); }
  },

  clearDesign() {
    this._clearKeepBg();
    this.renderGuides();
    this.onObjectChanged();
  },

  setModel(model) {
    this.model = model;
    this.setupImage(model.mockup.img, model.mockup.printRect, model.mockup.camRects, model.mockup.printMm);
  },
};
