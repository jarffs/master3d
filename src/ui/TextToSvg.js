import opentype from 'opentype.js';
import { Dialog } from './Dialog.js';
import { t } from '../../i18n.js';

// Catálogo de fontes embutido na aplicação — os .ttf ficam em public/assets/fonts/
// e são servidos localmente, sem depender da API do Google Fonts (chave/quota/403)
// nem de um CDN externo em tempo de execução.
const LOCAL_FONT_CATALOG = [
  { family: 'Roboto', category: 'sans-serif', file: '/assets/fonts/roboto.ttf' },
  { family: 'Open Sans', category: 'sans-serif', file: '/assets/fonts/opensans.ttf' },
  { family: 'Lato', category: 'sans-serif', file: '/assets/fonts/lato.ttf' },
  { family: 'Montserrat', category: 'sans-serif', file: '/assets/fonts/montserrat.ttf' },
  { family: 'Oswald', category: 'sans-serif', file: '/assets/fonts/oswald.ttf' },
  { family: 'Raleway', category: 'sans-serif', file: '/assets/fonts/raleway.ttf' },
  { family: 'Poppins', category: 'sans-serif', file: '/assets/fonts/poppins.ttf' },
  { family: 'Nunito', category: 'sans-serif', file: '/assets/fonts/nunito.ttf' },
  { family: 'Playfair Display', category: 'serif', file: '/assets/fonts/playfairdisplay.ttf' },
  { family: 'Merriweather', category: 'serif', file: '/assets/fonts/merriweather.ttf' },
  { family: 'Ubuntu', category: 'sans-serif', file: '/assets/fonts/ubuntu.ttf' },
  { family: 'Lobster', category: 'display', file: '/assets/fonts/lobster.ttf' },
  { family: 'Pacifico', category: 'handwriting', file: '/assets/fonts/pacifico.ttf' },
  { family: 'Bebas Neue', category: 'display', file: '/assets/fonts/bebasneue.ttf' },
  { family: 'Dancing Script', category: 'handwriting', file: '/assets/fonts/dancingscript.ttf' },
  { family: 'Permanent Marker', category: 'handwriting', file: '/assets/fonts/permanentmarker.ttf' },
  { family: 'Righteous', category: 'display', file: '/assets/fonts/righteous.ttf' },
  { family: 'Alfa Slab One', category: 'display', file: '/assets/fonts/alfaslabone.ttf' },
  { family: 'Bangers', category: 'display', file: '/assets/fonts/bangers.ttf' },
  { family: 'Bungee', category: 'display', file: '/assets/fonts/bungee.ttf' },
  { family: 'Fredoka', category: 'display', file: '/assets/fonts/fredoka.ttf' },
  { family: 'Press Start 2P', category: 'display', file: '/assets/fonts/pressstart2p.ttf' },
  { family: 'Anton', category: 'display', file: '/assets/fonts/anton.ttf' },
  { family: 'Archivo Black', category: 'display', file: '/assets/fonts/archivoblack.ttf' },
  { family: 'Black Ops One', category: 'display', file: '/assets/fonts/blackopsone.ttf' },
  { family: 'Carter One', category: 'display', file: '/assets/fonts/carterone.ttf' },
  { family: 'Chewy', category: 'display', file: '/assets/fonts/chewy.ttf' },
  { family: 'Courgette', category: 'handwriting', file: '/assets/fonts/courgette.ttf' },
  { family: 'Creepster', category: 'display', file: '/assets/fonts/creepster.ttf' },
  { family: 'Fugaz One', category: 'display', file: '/assets/fonts/fugazone.ttf' }
].map((font, popularityRank) => ({ ...font, popularityRank }));

/**
 * TextToSvg — Modular component for generating SVG from text using a local font catalog.
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
    this.fonts = LOCAL_FONT_CATALOG;
    this.filteredFonts = [];
    this.selectedFont = null;
    this.loadedOpenTypeFont = null;
    this.currentPage = 0;
    this.fontsPerPage = 30;
    this.isLoadingMore = false;
    this.mode = 'generate';
    this.fontPickerCallback = null;

    // Cache of loaded opentype.js Font objects e de FontFace já registados
    this.fontObjectCache = {};
    this.fontFaceCache = {};

    // Elements
    this.textInput = document.getElementById('text-to-svg-input');
    this.fontSearch = document.getElementById('text-to-svg-search');
    this.fontGrid = document.getElementById('text-to-svg-font-grid');
    this.btnCancel = document.getElementById('text-to-svg-cancel');
    this.btnConfirm = document.getElementById('text-to-svg-confirm');
    this.loadingIndicator = document.getElementById('text-to-svg-loading');

    this.setupListeners();
    this.fontCatalogPromise = Promise.resolve();
    this.filterFonts();
  }

  setupListeners() {
    this.btnCancel.addEventListener('click', () => this.close());
    this.btnConfirm.addEventListener('click', async () => await this.confirm());

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

  sortByPopularity(fonts) {
    return [...fonts].sort((a, b) => a.popularityRank - b.popularityRank);
  }

  filterFonts() {
    const query = this.fontSearch.value.toLowerCase().trim();
    if (!query) {
      this.filteredFonts = this.sortByPopularity(this.fonts);
    } else {
      this.filteredFonts = this.sortByPopularity(this.fonts.filter(f =>
        f.family.toLowerCase().includes(query)
      ));
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

    // Regista o @font-face local para o preview do cartão (sem rede externa)
    this.ensureFontFaceLoaded(font);

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

  /**
   * Regista (uma única vez por família) o @font-face local no document.fonts,
   * usado tanto no preview dos cartões como no fallback via canvas.
   */
  async ensureFontFaceLoaded(font) {
    if (this.fontFaceCache[font.family]) return this.fontFaceCache[font.family];

    const promise = (async () => {
      try {
        const face = new FontFace(font.family, `url(${font.file})`);
        const loaded = await face.load();
        document.fonts.add(loaded);
        return loaded;
      } catch (err) {
        console.warn(`Failed to load local font face for ${font.family}:`, err.message);
        return null;
      }
    })();

    this.fontFaceCache[font.family] = promise;
    return promise;
  }

  async selectFont(font, cardElement) {
    // Update selection UI
    this.fontGrid.querySelectorAll('.text-font-card').forEach(c => c.classList.remove('selected'));
    cardElement.classList.add('selected');
    this.selectedFont = font;

    if (this.mode === 'font-picker') {
      this.btnConfirm.disabled = false;
      return;
    }

    // Show loading state
    if (this.loadingIndicator) this.loadingIndicator.style.display = 'block';
    this.btnConfirm.disabled = true;

    try {
      await Promise.all([
        this.loadOpenTypeFont(font),
        this.ensureFontFaceLoaded(font)
      ]);
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

    // opentype.js 2.0.0 depreciou load()/loadSync() (viraram no-ops que retornam
    // undefined) — é preciso buscar o binário local e usar parse() diretamente.
    const response = await fetch(font.file);
    if (!response.ok) {
      throw new Error(`Failed to fetch font file for ${family}`);
    }
    const buffer = await response.arrayBuffer();
    const loadedFont = opentype.parse(buffer);
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
    try {
      const path = this.loadedOpenTypeFont.getPath(text, 0, fontSize, fontSize);
      const bb = path.getBoundingBox();

      const padding = 5;
      const width = bb.x2 - bb.x1 + padding * 2;
      const height = bb.y2 - bb.y1 + padding * 2;

      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.x1 - padding} ${bb.y1 - padding} ${width} ${height}" width="${width}" height="${height}">
      <path d="${path.toPathData()}" fill="black" stroke="none"/>
    </svg>`;
    } catch (err) {
      // Algumas fontes vari\u00e1veis usam recursos GSUB (ligaduras) que o opentype.js
      // n\u00e3o suporta \u2014 cai para o fallback via canvas em vez de quebrar o bot\u00e3o.
      console.warn('opentype.js failed to render this text with the selected font, using canvas fallback:', err.message);
      return null;
    }
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
    this.mode = 'generate';
    this.fontPickerCallback = null;
    this.onConfirmCallback = callback;
    this.modal.querySelector('h2').textContent = t('app.text_modal_title');
    this.btnConfirm.textContent = t('app.generate_3d');
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

  async openFontPicker({ text, selectedFamily, onSelect }) {
    await this.fontCatalogPromise;
    this.mode = 'font-picker';
    this.fontPickerCallback = onSelect;
    this.onConfirmCallback = null;
    this.textInput.value = text || 'Aa';
    this.fontSearch.value = '';
    this.selectedFont = this.fonts.find(font => font.family === selectedFamily) || null;
    this.loadedOpenTypeFont = null;
    this.currentPage = 0;
    this.btnConfirm.disabled = !this.selectedFont;
    this.modal.querySelector('h2').textContent = t('app.choose_font_title');
    this.btnConfirm.textContent = t('app.use_font');

    this.filterFonts();
    this.renderFontGrid();
    this.modal.classList.remove('hidden');
  }

  close() {
    this.modal.classList.add('hidden');
  }

  async confirm() {
    if (!this.selectedFont) {
      await Dialog.alert('Por favor, selecione uma fonte.');
      return;
    }

    if (this.mode === 'font-picker') {
      const family = this.selectedFont.family;
      this.close();
      if (this.fontPickerCallback) this.fontPickerCallback(family);
      return;
    }

    const text = this.textInput.value.trim();
    if (!text) {
      await Dialog.alert('Por favor, digite um texto.');
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
