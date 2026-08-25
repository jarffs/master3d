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

    // Cache of loaded font URLs (family -> ttf URL)
    this.fontUrlCache = {};
    // Cache of loaded opentype.js Font objects
    this.fontObjectCache = {};

    // Elements
    this.textInput = document.getElementById('text-to-svg-input');
    this.fontSearch = document.getElementById('text-to-svg-search');
    this.fontGrid = document.getElementById('text-to-svg-font-grid');
    this.previewArea = document.getElementById('text-to-svg-preview');
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
      this.updateMainPreview();
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
      // Use the public Google Fonts CSS API to get popular fonts
      // We fetch from the developer API (no key needed for CSS endpoint)
      const response = await fetch(
        'https://www.googleapis.com/webfonts/v1/webfonts?sort=popularity&key=AIzaSyBwIX97bVWr3-6AIUvGkcNnmFgirefZ-5Q'
      );

      if (!response.ok) {
        // Fallback: use a static curated list
        this.fonts = this.getFallbackFonts();
      } else {
        const data = await response.json();
        this.fonts = data.items.map(f => ({
          family: f.family,
          category: f.category,
          variants: f.variants,
          files: f.files
        }));
      }

      this.filteredFonts = [...this.fonts];
      this.renderFontGrid();
    } catch (err) {
      console.error('Error fetching Google Fonts:', err);
      this.fonts = this.getFallbackFonts();
      this.filteredFonts = [...this.fonts];
      this.renderFontGrid();
    }
  }

  getFallbackFonts() {
    const families = [
      'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald',
      'Raleway', 'Poppins', 'Nunito', 'Playfair Display', 'Merriweather',
      'Ubuntu', 'Lobster', 'Pacifico', 'Bebas Neue', 'Dancing Script',
      'Permanent Marker', 'Righteous', 'Alfa Slab One', 'Bangers', 'Bungee',
      'Fredoka One', 'Press Start 2P', 'Anton', 'Archivo Black', 'Black Ops One',
      'Bungee Shade', 'Carter One', 'Chewy', 'Courgette', 'Creepster'
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
      const card = document.createElement('div');
      card.className = 'text-font-card' + (this.selectedFont?.family === font.family ? ' selected' : '');
      card.dataset.family = font.family;

      // Load font via Google Fonts CSS for preview
      this.loadFontCSS(font.family);

      const text = this.textInput.value || 'Aa';

      card.innerHTML = `
        <div class="text-font-preview" style="font-family: '${font.family}', ${font.category};">${this.escapeHtml(text)}</div>
        <div class="text-font-name">${font.family}</div>
      `;

      card.addEventListener('click', () => this.selectFont(font, card));
      this.fontGrid.appendChild(card);
    });
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
      const card = document.createElement('div');
      card.className = 'text-font-card';
      card.dataset.family = font.family;

      this.loadFontCSS(font.family);
      const text = this.textInput.value || 'Aa';

      card.innerHTML = `
        <div class="text-font-preview" style="font-family: '${font.family}', ${font.category};">${this.escapeHtml(text)}</div>
        <div class="text-font-name">${font.family}</div>
      `;

      card.addEventListener('click', () => this.selectFont(font, card));
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

    // Show loading state on confirm button
    this.btnConfirm.disabled = true;
    if (this.loadingIndicator) this.loadingIndicator.style.display = 'block';

    try {
      await this.loadOpenTypeFont(font);
      this.updateMainPreview();
      this.btnConfirm.disabled = false;
    } catch (err) {
      console.error('Error loading font:', err);
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

    // Get the TTF URL — try from API files first, then construct from Google Fonts
    let ttfUrl = font.files?.regular || font.files?.['400'];

    if (!ttfUrl) {
      // Construct URL via Google Fonts CSS API and parse it
      ttfUrl = await this.resolveFontUrl(family);
    }

    if (!ttfUrl) {
      throw new Error(`Could not resolve font URL for ${family}`);
    }

    // Ensure HTTPS
    ttfUrl = ttfUrl.replace('http://', 'https://');

    const loadedFont = await opentype.load(ttfUrl);
    this.fontObjectCache[family] = loadedFont;
    this.loadedOpenTypeFont = loadedFont;
  }

  async resolveFontUrl(family) {
    if (this.fontUrlCache[family]) return this.fontUrlCache[family];

    try {
      const res = await fetch(
        `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } } // Needed to get TTF instead of WOFF2
      );
      const css = await res.text();
      // Extract URL from CSS @font-face src
      const match = css.match(/url\((https:\/\/[^)]+\.ttf)\)/);
      if (match) {
        this.fontUrlCache[family] = match[1];
        return match[1];
      }
    } catch (err) {
      console.warn('Could not resolve font URL from CSS:', err);
    }
    return null;
  }

  updateAllPreviews() {
    const text = this.textInput.value || 'Aa';
    this.fontGrid.querySelectorAll('.text-font-preview').forEach(el => {
      el.textContent = text;
    });
  }

  updateMainPreview() {
    if (!this.loadedOpenTypeFont || !this.previewArea) return;

    const text = this.textInput.value || 'Aa';
    const fontSize = 120;

    try {
      const path = this.loadedOpenTypeFont.getPath(text, 0, fontSize, fontSize);
      const bb = path.getBoundingBox();

      const padding = 10;
      const width = bb.x2 - bb.x1 + padding * 2;
      const height = bb.y2 - bb.y1 + padding * 2;

      const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.x1 - padding} ${bb.y1 - padding} ${width} ${height}" width="100%" height="100%">
        <path d="${path.toPathData()}" fill="#333"/>
      </svg>`;

      this.previewArea.innerHTML = svgString;
    } catch (err) {
      console.warn('Preview error:', err);
    }
  }

  generateSvg() {
    if (!this.loadedOpenTypeFont) return null;

    const text = this.textInput.value.trim();
    if (!text) return null;

    const fontSize = 200; // High resolution for 3D conversion
    const path = this.loadedOpenTypeFont.getPath(text, 0, fontSize, fontSize);
    const bb = path.getBoundingBox();

    const padding = 5;
    const width = bb.x2 - bb.x1 + padding * 2;
    const height = bb.y2 - bb.y1 + padding * 2;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.x1 - padding} ${bb.y1 - padding} ${width} ${height}" width="${width}" height="${height}">
      <path d="${path.toPathData()}" fill="black" stroke="none"/>
    </svg>`;
  }

  open(callback) {
    this.onConfirmCallback = callback;
    this.textInput.value = '';
    this.fontSearch.value = '';
    this.selectedFont = null;
    this.loadedOpenTypeFont = null;
    this.currentPage = 0;
    this.btnConfirm.disabled = true;

    if (this.previewArea) this.previewArea.innerHTML = '';

    this.filterFonts();
    this.renderFontGrid();

    this.modal.classList.remove('hidden');
  }

  close() {
    this.modal.classList.add('hidden');
  }

  confirm() {
    const svgString = this.generateSvg();
    if (!svgString) {
      alert('Por favor, escreva um texto e escolha uma fonte.');
      return;
    }

    this.close();

    if (this.onConfirmCallback) {
      this.onConfirmCallback(svgString);
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
