export class SvgEditor {
  constructor(containerId, modalId) {
    this.container = document.getElementById(containerId);
    this.modal = document.getElementById(modalId);
    
    // Bind buttons
    this.btnDelete = document.getElementById('svg-editor-delete');
    this.btnCancel = document.getElementById('svg-editor-cancel');
    this.btnConfirm = document.getElementById('svg-editor-confirm');

    this.onConfirmCallback = null;
    this.svgDoc = null;

    this.setupListeners();
  }

  setupListeners() {
    this.btnDelete.addEventListener('click', () => this.deleteSelected());
    this.btnCancel.addEventListener('click', () => this.close());
    this.btnConfirm.addEventListener('click', () => this.confirm());
    
    // Clicking on the container to interact with SVG elements
    this.container.addEventListener('click', (e) => {
      // Find closest SVG geometry element
      const target = e.target;
      if (['path', 'circle', 'rect', 'polygon', 'polyline', 'ellipse'].includes(target.tagName.toLowerCase())) {
        target.classList.toggle('svg-path-selected');
      }
    });
  }

  open(svgString, onConfirm) {
    this.onConfirmCallback = onConfirm;
    
    // Parse the SVG
    const parser = new DOMParser();
    this.svgDoc = parser.parseFromString(svgString, "image/svg+xml");
    
    // Add selectable class to all geometry elements
    const elements = this.svgDoc.querySelectorAll('path, circle, rect, polygon, polyline, ellipse');
    elements.forEach(el => {
      el.classList.add('svg-path-selectable');
      // Some tracer generators apply inline fills. To make our CSS selection visible, we might need to rely on !important in CSS.
    });

    // Render it in container
    this.container.innerHTML = '';
    this.container.appendChild(this.svgDoc.documentElement);

    // Show modal
    this.modal.style.display = 'flex';
  }

  deleteSelected() {
    if (!this.svgDoc) return;
    
    const selected = this.svgDoc.querySelectorAll('.svg-path-selected');
    selected.forEach(el => el.remove());
  }

  confirm() {
    if (!this.svgDoc) return;
    
    // Clean up our temporary classes before exporting
    const elements = this.svgDoc.querySelectorAll('.svg-path-selectable, .svg-path-selected');
    elements.forEach(el => {
      el.classList.remove('svg-path-selectable', 'svg-path-selected');
      if (el.getAttribute('class') === '') {
        el.removeAttribute('class');
      }
    });

    // Serialize back to string
    const serializer = new XMLSerializer();
    const cleanSvgString = serializer.serializeToString(this.svgDoc);

    this.close();
    
    if (this.onConfirmCallback) {
      this.onConfirmCallback(cleanSvgString);
    }
  }

  close() {
    this.modal.style.display = 'none';
    this.container.innerHTML = '';
    this.svgDoc = null;
    this.onConfirmCallback = null;
  }
}
