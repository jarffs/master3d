import opentype from 'opentype.js';

/**
 * TextToSvg — Modular component for generating SVG from text using Google Fonts.
 * 
 * Usage:
 *   const textToSvg = new TextToSvg('text-modal');
 *   textToSvg.open((svgString) => {
 *     // Use svgString in your pipeline
 *   });
 * 
 * This module is fully decoupled and can be reused across different tools.
 */
export class TextToSvg {
  constructor(modalId) {
    this.modal = document.getElementById(modalId);
    this.onConfirmCallback = null;
    this.fonts = [];
    this.filteredFonts = [];
    this.selectedFont = null;
    this.loadedOpenTypeFont = null;
    this.currentPage = 0;
    this.fontsPerPage = 30;
    this.isLoadingMore = false;

    // Cache of loaded opentype.js Font objects
    this.fontObjectCache = {};

    // Elements
    this.textInput = document.getElementById('text-to-svg-input');
    this.fontSearch = document.getElementById('text-to-svg-search');
    this.fontGrid = document.getElementById('text-to-svg-font-grid');
    this.btnCancel = document.getElementById('text-to-svg-cancel');
    this.btnConfirm = document.getElementById('text-to-svg-confirm');
    this.loadingIndicator = document.getElementById('text-to-svg-loading');

    this.setupListeners();
    this.fetchGoogleFonts();
  }

  setupListeners() {
    this.btnCancel.addEventListener('click', () => this.close());
    this.btnConfirm.addEventListener('click', () => this.confirm());

    this.textInput.addEventListener('input', () => {
      this.updateAllPreviews();
    });

    this.fontSearch.addEventListener('input', () => {
      this.currentPage = 0;
      this.filterFonts();
      this.renderFontGrid();
    });

    // Infinite scroll inside font grid
    this.fontGrid.addEventListener('scroll', () => {
      if (this.isLoadingMore) return;
      const { scrollTop, scrollHeight, clientHeight } = this.fontGrid;
      if (scrollTop + clientHeight >= scrollHeight - 50) {
        this.loadMoreFonts();
      }
    });
  }

  async fetchGoogleFonts() {
    try {
      // Fetch popular fonts from Google Fonts API
      // Using the public webfonts endpoint
      const response = await fetch(
        'https://www.googleapis.com/webfonts/v1/webfonts?sort=popularity&key=AIzaSyBwIX97bVWr3-6AIUvGkcNnmFgirefZ-5Q'
      );

      if (response.ok) {
        const data = await response.json();
        this.fonts = data.items.map(f => ({
          family: f.family,
          category: f.category,
          variants: f.variants,
          files: f.files
        }));
      } else {
        this.fonts = this.getFallbackFonts();
      }
    } catch (err) {
      console.warn('Google Fonts API unavailable, using fallback list:', err.message);
      this.fonts = this.getFallbackFonts();
    }

    this.filteredFonts = [...this.fonts];
    this.renderFontGrid();
  }

  getFallbackFonts() {
    const families = [
      'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald',
      'Raleway', 'Poppins', 'Nunito', 'Playfair Display', 'Merriweather',
      'Ubuntu', 'Lobster', 'Pacifico', 'Bebas Neue', 'Dancing Script',
      'Permanent Marker', 'Righteous', 'Alfa Slab One', 'Bangers', 'Bungee',
      'Fredoka', 'Press Start 2P', 'Anton', 'Archivo Black', 'Black Ops One',
      'Carter One', 'Chewy', 'Courgette', 'Creepster', 'Fugaz One',
      'Gloria Hallelujah', 'Indie Flower', 'Kablammo', 'Luckiest Guy', 'Monoton',
      'Orbitron', 'Passion One', 'Patua One', 'Russo One', 'Satisfy',
      'Shadows Into Light', 'Special Elite', 'Titan One', 'Ultra', 'Zilla Slab',
      'Abril Fatface', 'Bungee Shade', 'Concert One', 'Frijole', 'Gravitas One',
      'Inter', 'Josefin Sans', 'Kaushan Script', 'Libre Baskerville', 'Noto Sans',
      'Outfit', 'PT Sans', 'Quicksand', 'Source Sans 3', 'Work Sans',
      'Caveat', 'Comfortaa', 'DM Sans', 'Exo 2', 'Fira Sans',
      'Great Vibes', 'Hind', 'IBM Plex Sans', 'Jost', 'Kanit',
      'League Spartan', 'Manrope', 'Nunito Sans', 'Overpass', 'Philosopher',
      'Questrial', 'Rubik', 'Sacramento', 'Teko', 'Urbanist',
      'Varela Round', 'Yanone Kaffeesatz', 'Zeyada', 'Abel', 'Barlow',
      'Cinzel', 'Domine', 'EB Garamond', 'Fjalla One', 'Gudea'
    ];
    return families.map(f => ({ family: f, category: 'sans-serif', variants: ['regular'], files: {} }));
  }

  filterFonts() {
    const query = this.fontSearch.value.toLowerCase().trim();
    if (!query) {
      this.filteredFonts = [...this.fonts];
    } else {
      this.filteredFonts = this.fonts.filter(f =>
        f.family.toLowerCase().includes(query)
      );
    }
  }

  renderFontGrid() {
    this.fontGrid.innerHTML = '';
    const end = Math.min((this.currentPage + 1) * this.fontsPerPage, this.filteredFonts.length);
    const fontsToShow = this.filteredFonts.slice(0, end);

    fontsToShow.forEach(font => {
      const card = this.createFontCard(font);
      this.fontGrid.appendChild(card);
    });
  }

  createFontCard(font) {
    const card = document.createElement('div');
    card.className = 'text-font-card' + (this.selectedFont?.family === font.family ? ' selected' : '');
    card.dataset.family = font.family;

    // Load font via Google Fonts CSS for visual preview
    this.loadFontCSS(font.family);

    const text = this.textInput.value || 'Aa';

    card.innerHTML = `
      <div class="text-font-preview" style="font-family: '${font.family}', ${font.category};">${this.escapeHtml(text)}</div>
      <div class="text-font-name">${font.family}</div>
    `;

    card.addEventListener('click', () => this.selectFont(font, card));
    return card;
  }

  loadMoreFonts() {
    const totalPages = Math.ceil(this.filteredFonts.length / this.fontsPerPage);
    if (this.currentPage + 1 >= totalPages) return;

    this.isLoadingMore = true;
    this.currentPage++;

    const start = this.currentPage * this.fontsPerPage;
    const end = Math.min(start + this.fontsPerPage, this.filteredFonts.length);
    const fontsToAdd = this.filteredFonts.slice(start, end);

    fontsToAdd.forEach(font => {
      const card = this.createFontCard(font);
      this.fontGrid.appendChild(card);
    });

    this.isLoadingMore = false;
  }

  loadFontCSS(family) {
    const id = `gfont-${family.replace(/\s+/g, '-')}`;
    if (document.getElementById(id)) return;

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
    document.head.appendChild(link);
  }

  async selectFont(font, cardElement) {
    // Update selection UI
    this.fontGrid.querySelectorAll('.text-font-card').forEach(c => c.classList.remove('selected'));
    cardElement.classList.add('selected');
    this.selectedFont = font;

    // Show loading state
    if (this.loadingIndicator) this.loadingIndicator.style.display = 'block';
    this.btnConfirm.disabled = true;

    try {
      await this.loadOpenTypeFont(font);
      this.btnConfirm.disabled = false;
    } catch (err) {
      console.error('Error loading font for SVG conversion:', err);
      // Even if opentype loading fails, still allow confirm — we'll use canvas fallback
      this.loadedOpenTypeFont = null;
      this.btnConfirm.disabled = false;
    } finally {
      if (this.loadingIndicator) this.loadingIndicator.style.display = 'none';
    }
  }

  async loadOpenTypeFont(font) {
    const family = font.family;

    // Check cache
    if (this.fontObjectCache[family]) {
      this.loadedOpenTypeFont = this.fontObjectCache[family];
      return;
    }

    // Try to get TTF URL from API files
    let ttfUrl = font.files?.regular || font.files?.['400'] || font.files?.['300'] || font.files?.['700'];
    
    // Try any available variant
    if (!ttfUrl && font.files) {
      const keys = Object.keys(font.files);
      if (keys.length > 0) ttfUrl = font.files[keys[0]];
    }

    if (!ttfUrl) {
      throw new Error(`No TTF URL available for ${family}`);
    }

    // Ensure HTTPS
    ttfUrl = ttfUrl.replace('http://', 'https://');

    const loadedFont = await opentype.load(ttfUrl);
    this.fontObjectCache[family] = loadedFont;
    this.loadedOpenTypeFont = loadedFont;
  }

  updateAllPreviews() {
    const text = this.textInput.value || 'Aa';
    this.fontGrid.querySelectorAll('.text-font-preview').forEach(el => {
      el.textContent = text;
    });
  }

  generateSvgFromOpenType() {
    if (!this.loadedOpenTypeFont) return null;

    const text = this.textInput.value.trim();
    if (!text) return null;

    const fontSize = 200;
    const path = this.loadedOpenTypeFont.getPath(text, 0, fontSize, fontSize);
    const bb = path.getBoundingBox();

    const padding = 5;
    const width = bb.x2 - bb.x1 + padding * 2;
    const height = bb.y2 - bb.y1 + padding * 2;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.x1 - padding} ${bb.y1 - padding} ${width} ${height}" width="${width}" height="${height}">
      <path d="${path.toPathData()}" fill="black" stroke="none"/>
    </svg>`;
  }

  generateSvgFromCanvas() {
    const text = this.textInput.value.trim();
    if (!text || !this.selectedFont) return null;

    const fontSize = 200;
    const family = this.selectedFont.family;

    // Create a canvas to render the text
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Measure text
    ctx.font = `${fontSize}px '${family}'`;
    const metrics = ctx.measureText(text);
    const textWidth = Math.ceil(metrics.width) + 40;
    const textHeight = Math.ceil(fontSize * 1.4) + 40;

    canvas.width = textWidth;
    canvas.height = textHeight;

    // Fill white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw text in black
    ctx.fillStyle = 'black';
    ctx.font = `${fontSize}px '${family}'`;
    ctx.textBaseline = 'top';
    ctx.fillText(text, 20, 20);

    // Convert to data URL and return it for tracing
    return canvas.toDataURL('image/png');
  }

  open(callback) {
    this.onConfirmCallback = callback;
    this.textInput.value = '';
    this.fontSearch.value = '';
    this.selectedFont = null;
    this.loadedOpenTypeFont = null;
    this.currentPage = 0;
    this.btnConfirm.disabled = true;

    this.filterFonts();
    this.renderFontGrid();

    this.modal.classList.remove('hidden');
  }

  close() {
    this.modal.classList.add('hidden');
  }

  confirm() {
    const text = this.textInput.value.trim();
    if (!text) {
      alert('Por favor, digite um texto.');
      return;
    }
    if (!this.selectedFont) {
      alert('Por favor, selecione uma fonte.');
      return;
    }

    // Try opentype.js first (perfect vector paths)
    let svgString = this.generateSvgFromOpenType();

    if (svgString) {
      this.close();
      if (this.onConfirmCallback) {
        this.onConfirmCallback(svgString);
      }
    } else {
      // Fallback: use canvas rendering + ImageTracer in main.js
      const dataUrl = this.generateSvgFromCanvas();
      if (dataUrl) {
        this.close();
        if (this.onConfirmCallback) {
          // Pass data URL with a special prefix so main.js knows to trace it
          this.onConfirmCallback({ type: 'raster', dataUrl });
        }
      }
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
