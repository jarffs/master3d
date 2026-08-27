/**
 * BigLettersEditor — 2D canvas editor for the Big Letters tool.
 * Uses Polotno (frameworkless CDN bundle) to provide a visual editor
 * where users can compose a Big Letter + Sunken Name + Base Cut.
 */
export class BigLettersEditor {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.store = null;
    this.ready = false;
    this._onReadyCallbacks = [];

    // Default design data
    this.designData = {
      bigLetter: 'M',
      bigLetterFont: 'Montserrat',
      bigLetterColor: '#e91e7b',
      nameText: 'Master3D',
      nameFont: 'Playfair Display',
      nameColor: '#ffffff',
      bottomCutEnabled: true,
      bottomCutHeight: 40, // px in editor, mapped to mm later
    };
  }

  /**
   * Load Polotno via CDN and initialize the editor.
   */
  async init() {
    // Load CSS
    if (!document.getElementById('polotno-css')) {
      const link = document.createElement('link');
      link.id = 'polotno-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/polotno@4/ui.css';
      document.head.appendChild(link);
    }

    // Load JS bundle
    await new Promise((resolve, reject) => {
      if (window.createPolotnoApp) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/polotno@4/polotno.bundle.js';
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });

    // Wait for fonts
    await this._loadGoogleFont('Montserrat');
    await this._loadGoogleFont('Playfair Display');

    // Create Polotno app
    const { store } = window.createPolotnoApp({
      key: 'nFA5H9elEytDyPyvKL7T', // demo key for dev
      container: this.container,
      showCredit: true,
    });

    this.store = store;

    // Set canvas size (256x256mm mapped to px)
    store.setSize(800, 800);

    // Build initial design
    this._buildInitialDesign();

    this.ready = true;
    this._onReadyCallbacks.forEach(cb => cb());
    this._onReadyCallbacks = [];
  }

  /**
   * Build the initial 3-layer design.
   */
  _buildInitialDesign() {
    const store = this.store;
    const page = store.pages[0] || store.addPage();

    // Clear existing elements
    page.children.forEach(el => el.remove());

    // Layer 1: Big Letter (background)
    page.addElement({
      type: 'text',
      x: 50,
      y: 20,
      width: 700,
      height: 600,
      text: this.designData.bigLetter,
      fontSize: 500,
      fontFamily: this.designData.bigLetterFont,
      fontWeight: 'bold',
      fill: this.designData.bigLetterColor,
      align: 'center',
      verticalAlign: 'middle',
      name: 'Letra Grande',
      selectable: true,
      draggable: true,
    });

    // Layer 2: Sunken Name (overlaid)
    page.addElement({
      type: 'text',
      x: 100,
      y: 250,
      width: 600,
      height: 200,
      text: this.designData.nameText,
      fontSize: 120,
      fontFamily: this.designData.nameFont,
      fontWeight: 'normal',
      fontStyle: 'italic',
      fill: this.designData.nameColor,
      align: 'center',
      verticalAlign: 'middle',
      name: 'Nome',
      selectable: true,
      draggable: true,
    });

    // Layer 3: Base Cut (rectangle at bottom)
    if (this.designData.bottomCutEnabled) {
      page.addElement({
        type: 'figure',
        x: 50,
        y: 660,
        width: 700,
        height: this.designData.bottomCutHeight,
        fill: '#d4a574',
        name: 'Corte da Base',
        selectable: true,
        draggable: true,
        subType: 'rect',
        opacity: 0.7,
      });
    }
  }

  /**
   * Load a Google Font into the page.
   */
  async _loadGoogleFont(family) {
    const id = `gfont-${family.replace(/\s+/g, '-')}`;
    if (document.getElementById(id)) return;

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, '+')}&display=swap`;
    document.head.appendChild(link);

    try {
      await document.fonts.load(`150px '${family}'`);
    } catch (e) {
      // Timeout is acceptable
    }
  }

  /**
   * Get design data from the Polotno store to pass to the 3D engine.
   * Extracts text content, fonts, positions, and colors from the canvas elements.
   */
  getDesignData() {
    if (!this.store) return null;

    const page = this.store.pages[0];
    if (!page) return null;

    const data = {
      bigLetter: 'M',
      bigLetterFont: 'Montserrat',
      bigLetterColor: '#e91e7b',
      nameText: 'Master3D',
      nameFont: 'Playfair Display',
      nameColor: '#ffffff',
      bottomCutEnabled: false,
      bottomCutHeight: 0,
      // Positional data (normalized 0-1 relative to canvas)
      nameX: 0.5,
      nameY: 0.5,
      nameScale: 1.0,
      canvasWidth: page.width || 800,
      canvasHeight: page.height || 800,
    };

    for (const el of page.children) {
      const name = (el.name || '').toLowerCase();

      if (name.includes('letra grande') || name.includes('big letter')) {
        data.bigLetter = el.text || 'M';
        data.bigLetterFont = el.fontFamily || 'Montserrat';
        data.bigLetterColor = el.fill || '#e91e7b';
      } else if (name.includes('nome') || name.includes('name')) {
        data.nameText = el.text || 'Master3D';
        data.nameFont = el.fontFamily || 'Playfair Display';
        data.nameColor = el.fill || '#ffffff';
        // Normalize position
        data.nameX = (el.x + el.width / 2) / (page.width || 800);
        data.nameY = (el.y + el.height / 2) / (page.height || 800);
        data.nameScale = el.fontSize / 120; // relative to default
      } else if (name.includes('corte') || name.includes('cut')) {
        data.bottomCutEnabled = true;
        // Map height from px to a ratio of the canvas
        data.bottomCutHeight = el.height / (page.height || 800);
        data.bottomCutY = el.y / (page.height || 800);
      }
    }

    return data;
  }

  /**
   * Export current editor design as a PNG data URL for thumbnail.
   */
  async getSnapshot() {
    if (!this.store) return null;

    try {
      const page = this.store.pages[0];
      if (!page) return null;
      // Use Polotno's export
      const url = await this.store.toDataURL({ pixelRatio: 0.5 });
      return url;
    } catch (e) {
      console.warn('Failed to export snapshot:', e);
      return null;
    }
  }

  /**
   * Update a specific element on the canvas.
   */
  updateElement(elementName, props) {
    if (!this.store) return;
    const page = this.store.pages[0];
    if (!page) return;

    for (const el of page.children) {
      const name = (el.name || '').toLowerCase();
      if (name.includes(elementName.toLowerCase())) {
        el.set(props);
        break;
      }
    }
  }

  /**
   * Update the big letter text.
   */
  setBigLetter(letter) {
    this.designData.bigLetter = letter;
    this.updateElement('Letra Grande', { text: letter });
  }

  /**
   * Update the sunken name text.
   */
  setNameText(name) {
    this.designData.nameText = name;
    this.updateElement('Nome', { text: name });
  }

  /**
   * Wait for editor to be ready.
   */
  onReady(callback) {
    if (this.ready) {
      callback();
    } else {
      this._onReadyCallbacks.push(callback);
    }
  }

  /**
   * Show the editor.
   */
  show() {
    if (this.container) {
      this.container.style.display = 'block';
    }
  }

  /**
   * Hide the editor.
   */
  hide() {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  /**
   * Dispose the editor.
   */
  dispose() {
    if (this.store) {
      // Polotno doesn't have a direct dispose, but we can clear
      this.store = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
