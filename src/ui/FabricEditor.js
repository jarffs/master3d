const fabric = window.fabric;

export class FabricEditor {
  /**
   * @param {string} containerId - The ID of the container element
   * @param {Object} options - Configuration options
   */
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error(`Container ${containerId} not found`);

    this.options = {
      width: options.width || 800,
      height: options.height || 800,
      backgroundColor: options.backgroundColor || '#f8fafc',
      onSelectionChange: options.onSelectionChange || (() => {}),
      onObjectModified: options.onObjectModified || (() => {}),
    };

    this.canvas = null;
    this.layers = []; // Logical layers array
    
    this._initUI();
    this._initCanvas();
    this._bindEvents();
  }

  _initUI() {
    // Generate the generic UI shell (Toolbars + Canvas Area + Right Panel)
    this.container.innerHTML = `
      <div class="fe-layout">
        <aside class="fe-left-toolbar">
          <button class="fe-tool-btn" data-tool="text">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
            <span>Texto</span>
          </button>
          <button class="fe-tool-btn" data-tool="image">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span>Imagem</span>
          </button>
          <button class="fe-tool-btn" data-tool="shapes">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><polygon points="12 2 2 22 22 22"/></svg>
            <span>Formas</span>
          </button>
        </aside>
        
        <main class="fe-main-area">
          <header class="fe-top-toolbar">
            <!-- Dynamic tools based on selection -->
            <div id="fe-dynamic-tools" class="fe-tools-group">
              <input type="color" id="fe-color-picker" class="fe-color-btn" value="#000000">
              <select id="fe-font-picker" class="fe-select">
                <option value="Montserrat">Montserrat</option>
                <option value="Playfair Display">Playfair Display</option>
                <option value="Roboto">Roboto</option>
              </select>
            </div>
            
            <div class="fe-tools-group fe-align-right">
              <button class="fe-action-btn" id="fe-undo-btn"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg></button>
              <button class="fe-action-btn" id="fe-redo-btn"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg></button>
            </div>
          </header>
          
          <div class="fe-canvas-wrapper">
            <canvas id="fe-canvas"></canvas>
          </div>
        </main>
        
        <aside class="fe-right-panel">
          <div class="fe-panel-section">
            <h3 class="fe-panel-title">CAMADAS</h3>
            <ul id="fe-layers-list" class="fe-layers-list">
              <!-- Layers injected dynamically -->
            </ul>
          </div>
        </aside>
      </div>
    `;

    // References
    this.ui = {
      colorPicker: this.container.querySelector('#fe-color-picker'),
      fontPicker: this.container.querySelector('#fe-font-picker'),
      layersList: this.container.querySelector('#fe-layers-list'),
      dynamicTools: this.container.querySelector('#fe-dynamic-tools')
    };
  }

  _initCanvas() {
    this.canvas = new fabric.Canvas('fe-canvas', {
      backgroundColor: this.options.backgroundColor,
      preserveObjectStacking: true // Important for layers
    });
    this.canvas.setWidth(this.options.width);
    this.canvas.setHeight(this.options.height);
    this.canvas.calcOffset();

    // Custom controls style
    fabric.Object.prototype.set({
      transparentCorners: false,
      cornerColor: '#ffffff',
      cornerStrokeColor: '#0ea5e9',
      borderColor: '#0ea5e9',
      cornerSize: 10,
      padding: 5,
      cornerStyle: 'circle'
    });
  }

  _bindEvents() {
    this.canvas.on('selection:created', (e) => this._onSelection(e));
    this.canvas.on('selection:updated', (e) => this._onSelection(e));
    this.canvas.on('selection:cleared', (e) => this._onSelection(e));
    
    this.canvas.on('object:modified', () => {
      this.options.onObjectModified();
    });

    this.ui.colorPicker.addEventListener('input', (e) => {
      const activeObj = this.canvas.getActiveObject();
      if (activeObj) {
        activeObj.set('fill', e.target.value);
        this.canvas.requestRenderAll();
        this.options.onObjectModified();
      }
    });

    this.ui.fontPicker.addEventListener('change', async (e) => {
      const activeObj = this.canvas.getActiveObject();
      if (activeObj && activeObj.type === 'i-text') {
        const family = e.target.value;
        await this.loadFont(family);
        activeObj.set('fontFamily', family);
        this.canvas.requestRenderAll();
        this.options.onObjectModified();
      }
    });
  }

  _onSelection(e) {
    const activeObj = this.canvas.getActiveObject();
    if (activeObj) {
      this.ui.dynamicTools.style.opacity = '1';
      this.ui.dynamicTools.style.pointerEvents = 'auto';
      
      this.ui.colorPicker.value = activeObj.fill || '#000000';
      if (activeObj.type === 'i-text') {
        this.ui.fontPicker.style.display = 'block';
        this.ui.fontPicker.value = activeObj.fontFamily;
      } else {
        this.ui.fontPicker.style.display = 'none';
      }

      this._highlightLayer(activeObj.id);
    } else {
      this.ui.dynamicTools.style.opacity = '0.5';
      this.ui.dynamicTools.style.pointerEvents = 'none';
      this._highlightLayer(null);
    }
    
    this.options.onSelectionChange(activeObj);
  }

  // --- Public API ---

  async loadFont(family) {
    const id = `gfont-${family.replace(/\s+/g, '-')}`;
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, '+')}&display=swap`;
      document.head.appendChild(link);
    }
    try {
      await Promise.race([
        document.fonts.load(`16px '${family}'`),
        new Promise(resolve => setTimeout(resolve, 1500))
      ]);
    } catch(e) {}
  }

  addText(text, options = {}) {
    const defaultOptions = {
      left: this.options.width / 2,
      top: this.options.height / 2,
      fontFamily: 'Arial',
      fontSize: 40,
      fill: '#000000',
      originX: 'center',
      originY: 'center',
      id: `text_${Date.now()}`,
      layerName: 'Texto'
    };
    const merged = { ...defaultOptions, ...options };
    
    return new Promise(async (resolve) => {
      await this.loadFont(merged.fontFamily);
      const iText = new fabric.IText(text, merged);
      iText.id = merged.id;
      iText.layerName = merged.layerName;
      this.canvas.add(iText);
      this._addLayer(iText);
      console.log(`Added text: ${text}, Canvas objects: ${this.canvas.getObjects().length}, left: ${iText.left}, top: ${iText.top}`);
      this.canvas.renderAll();
      resolve(iText);
    });
  }

  addRect(options = {}) {
    const defaultOptions = {
      left: this.options.width / 2,
      top: this.options.height / 2,
      width: 100,
      height: 100,
      fill: '#cccccc',
      originX: 'center',
      originY: 'center',
      id: `rect_${Date.now()}`,
      layerName: 'Forma'
    };
    const merged = { ...defaultOptions, ...options };
    const rect = new fabric.Rect(merged);
    rect.id = merged.id;
    rect.layerName = merged.layerName;
    this.canvas.add(rect);
    this._addLayer(rect);
    this.canvas.renderAll();
    return rect;
  }

  async applyPreset(presetId) {
    const bigLetter = this.canvas.getObjects().find(o => o.id === 'BigLetter');
    const nameText = this.canvas.getObjects().find(o => o.id === 'NameText');
    if (!bigLetter) return;
    
    // Default color reset
    bigLetter.set('fill', '#e91e7b');
    bigLetter.patternName = null;
    
    if (presetId === 'classic') {
      await this.loadFont('Montserrat');
      bigLetter.set({ fontFamily: 'Montserrat', fill: '#e91e7b' });
    } else if (presetId === 'clouds') {
      await this.loadFont('Chewy');
      bigLetter.set({ fontFamily: 'Chewy' });
      await this._applyPattern(bigLetter, '/assets/patterns/clouds.svg', 'clouds');
    } else if (presetId === 'stars') {
      await this.loadFont('Fredoka One');
      bigLetter.set({ fontFamily: 'Fredoka One' });
      await this._applyPattern(bigLetter, '/assets/patterns/stars.svg', 'stars');
    } else if (presetId === 'stripes') {
      await this.loadFont('Bebas Neue');
      bigLetter.set({ fontFamily: 'Bebas Neue' });
      await this._applyPattern(bigLetter, '/assets/patterns/stripes.svg', 'stripes');
    }
    
    this.canvas.renderAll();
  }
  
  _applyPattern(obj, url, patternName) {
    return new Promise((resolve) => {
      fabric.util.loadImage(url, (img) => {
        if (img) {
          const pattern = new fabric.Pattern({
            source: img,
            repeat: 'repeat'
          });
          obj.set('fill', pattern);
          obj.patternName = patternName;
        }
        resolve();
      });
    });
  }

  _addLayer(fabricObj) {
    this.layers.unshift(fabricObj); // Add to top of list
    this._renderLayersList();
  }

  _renderLayersList() {
    this.ui.layersList.innerHTML = '';
    this.layers.forEach((obj, index) => {
      const li = document.createElement('li');
      li.className = 'fe-layer-item';
      if (obj === this.canvas.getActiveObject()) li.classList.add('active');
      
      li.innerHTML = `
        <div class="fe-layer-thumb" style="background-color: ${obj.fill}"></div>
        <span class="fe-layer-name">${obj.layerName || obj.id}</span>
      `;
      
      li.addEventListener('click', () => {
        this.canvas.setActiveObject(obj);
        this.canvas.requestRenderAll();
      });
      
      this.ui.layersList.appendChild(li);
    });
  }

  _highlightLayer(objId) {
    const items = this.ui.layersList.querySelectorAll('.fe-layer-item');
    items.forEach((item, index) => {
      if (this.layers[index] && this.layers[index].id === objId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  getCanvas() {
    return this.canvas;
  }

  exportSVG() {
    return this.canvas.toSVG();
  }
  
  exportDataURL(options = {}) {
    return this.canvas.toDataURL(options);
  }

  resize(width, height) {
    this.options.width = width;
    this.options.height = height;
    this.canvas.setWidth(width);
    this.canvas.setHeight(height);
    this.canvas.requestRenderAll();
  }

  show() {
    this.container.style.display = 'block';
  }

  hide() {
    this.container.style.display = 'none';
  }
  
  clear() {
    this.canvas.clear();
    this.canvas.backgroundColor = this.options.backgroundColor;
    this.layers = [];
    this._renderLayersList();
  }
}
