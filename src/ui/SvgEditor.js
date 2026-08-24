export class SvgEditor {
  constructor(containerId, modalId) {
    this.container = document.getElementById(containerId);
    this.modal = document.getElementById(modalId);
    
    // Bind buttons
    this.btnDelete = document.getElementById('svg-editor-delete');
    this.btnCancel = document.getElementById('svg-editor-cancel');
    this.btnConfirm = document.getElementById('svg-editor-confirm');
    
    this.btnReset = document.getElementById('svg-editor-reset');
    this.btnInvert = document.getElementById('svg-editor-invert');
    this.btnZoomIn = document.getElementById('svg-editor-zoom-in');
    this.btnZoomOut = document.getElementById('svg-editor-zoom-out');

    this.onConfirmCallback = null;
    this.originalSvgString = null;
    
    // Pan & Zoom state
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;

    this.setupListeners();
  }

  setupListeners() {
    this.btnDelete.addEventListener('click', () => this.deleteSelected());
    this.btnCancel.addEventListener('click', () => this.close());
    this.btnConfirm.addEventListener('click', () => this.confirm());
    
    if(this.btnReset) this.btnReset.addEventListener('click', () => this.reset());
    if(this.btnInvert) this.btnInvert.addEventListener('click', () => this.invertSelection());
    if(this.btnZoomIn) this.btnZoomIn.addEventListener('click', () => this.zoom(1.2));
    if(this.btnZoomOut) this.btnZoomOut.addEventListener('click', () => this.zoom(1 / 1.2));
    
    // Pan & Zoom - Mouse Wheel
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? (1 / 1.1) : 1.1;
      this.zoom(zoomFactor);
    }, { passive: false });

    // Pan - Dragging
    this.container.addEventListener('mousedown', (e) => {
      // Only pan if clicking on empty space or dragging background
      if (!['path', 'circle', 'rect', 'polygon', 'polyline', 'ellipse'].includes(e.target.tagName.toLowerCase())) {
        this.isDragging = true;
        this.startX = e.clientX - this.translateX;
        this.startY = e.clientY - this.translateY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.translateX = e.clientX - this.startX;
      this.translateY = e.clientY - this.startY;
      this.applyTransform();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
    
    // Clicking on the container to interact with SVG elements
    this.container.addEventListener('click', (e) => {
      // Find closest SVG geometry element
      const target = e.target;
      if (['path', 'circle', 'rect', 'polygon', 'polyline', 'ellipse'].includes(target.tagName.toLowerCase())) {
        target.classList.toggle('svg-path-selected');
      }
    });
  }

  zoom(factor) {
    this.scale *= factor;
    // Limit zoom
    this.scale = Math.max(0.1, Math.min(this.scale, 20));
    this.applyTransform();
  }

  applyTransform() {
    const svgElement = this.container.querySelector('svg');
    if (svgElement) {
      svgElement.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }
  }

  open(svgString, onConfirm) {
    this.onConfirmCallback = onConfirm;
    this.originalSvgString = svgString;
    
    this.loadSvg(svgString);
    
    // Show modal first so we can calculate dimensions
    this.modal.style.display = 'flex';
    
    requestAnimationFrame(() => {
      this.centerAndFit();
    });
  }

  centerAndFit() {
    const svgElement = this.container.querySelector('svg');
    if (!svgElement) return;

    // Reset transform to calculate natural size
    svgElement.style.transform = '';
    svgElement.style.transformOrigin = 'center center';
    
    // Get true natural size of the SVG
    let svgWidth = parseFloat(svgElement.getAttribute('width'));
    let svgHeight = parseFloat(svgElement.getAttribute('height'));
    
    if (isNaN(svgWidth) || isNaN(svgHeight)) {
        if (svgElement.viewBox && svgElement.viewBox.baseVal && svgElement.viewBox.baseVal.width > 0) {
            svgWidth = svgElement.viewBox.baseVal.width;
            svgHeight = svgElement.viewBox.baseVal.height;
        } else {
            const rect = svgElement.getBoundingClientRect();
            svgWidth = rect.width;
            svgHeight = rect.height;
        }
    }
    
    if (!svgWidth || !svgHeight) return;

    // Ensure the SVG takes exactly its natural size so scaling is predictable
    svgElement.style.width = svgWidth + 'px';
    svgElement.style.height = svgHeight + 'px';

    const containerRect = this.container.getBoundingClientRect();
    
    if (containerRect.width === 0 || containerRect.height === 0) {
      setTimeout(() => this.centerAndFit(), 50);
      return;
    }

    const padding = 40;
    const availableWidth = Math.max(10, containerRect.width - padding * 2);
    const availableHeight = Math.max(10, containerRect.height - padding * 2);

    const scaleX = availableWidth / svgWidth;
    const scaleY = availableHeight / svgHeight;
    
    this.scale = Math.min(scaleX, scaleY);
    if (this.scale > 5) this.scale = 5; 
    
    this.translateX = (containerRect.width - svgWidth) / 2;
    this.translateY = (containerRect.height - svgHeight) / 2;

    this.applyTransform();
  }

  loadSvg(svgString) {
    // Parse the SVG and put it directly in the container
    this.container.innerHTML = svgString;
    
    // Add selectable class to all geometry elements
    const elements = this.container.querySelectorAll('path, circle, rect, polygon, polyline, ellipse');
    elements.forEach(el => {
      el.classList.add('svg-path-selectable');
    });
    this.applyTransform();
  }

  reset() {
    if (this.originalSvgString) {
      this.loadSvg(this.originalSvgString);
      requestAnimationFrame(() => {
        this.centerAndFit();
      });
    }
  }

  invertSelection() {
    const elements = this.container.querySelectorAll('.svg-path-selectable');
    elements.forEach(el => {
      el.classList.toggle('svg-path-selected');
    });
  }

  deleteSelected() {
    const selected = this.container.querySelectorAll('.svg-path-selected');
    selected.forEach(el => el.remove());
  }

  confirm() {
    // Clean up our temporary classes before exporting
    const elements = this.container.querySelectorAll('.svg-path-selectable, .svg-path-selected');
    elements.forEach(el => {
      el.classList.remove('svg-path-selectable', 'svg-path-selected');
      if (el.getAttribute('class') === '') {
        el.removeAttribute('class');
      }
    });

    // Serialize back to string
    const svgElement = this.container.querySelector('svg');
    if (!svgElement) return;
    
    // Remove transform style from exported SVG
    svgElement.style.transform = '';
    if (svgElement.getAttribute('style') === '') {
        svgElement.removeAttribute('style');
    }
    
    const serializer = new XMLSerializer();
    const cleanSvgString = serializer.serializeToString(svgElement);

    const callback = this.onConfirmCallback;
    this.close();
    
    if (callback) {
      callback(cleanSvgString);
    }
  }

  close() {
    this.modal.style.display = 'none';
    this.container.innerHTML = '';
    this.onConfirmCallback = null;
  }
}
