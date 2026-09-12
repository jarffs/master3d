import { PRESETS, resolveParams } from './vectorizationCore.js';

export { PRESETS };

export class VectorizationPipeline {
  constructor(mode = '3d_print', overrides = {}) {
    this.mode = mode;
    this.params = resolveParams(mode, overrides);
    this.controller = null;
    this.lastResult = null;
  }

  async process(source, options = {}) {
    return (await this.processDetailed(source, options)).svg;
  }

  async processDetailed(source, { signal } = {}) {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const params = resolveParams(this.mode, this.params);
    try {
      controller.signal.throwIfAborted();
      const canvas = await this._loadAndNormalize(source, params.maxSize, controller.signal);
      const original = canvas.toDataURL('image/png');
      const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const result = await this._traceInWorker(image, params, controller.signal);
      controller.signal.throwIfAborted();
      const comparison = await this._compare(canvas, result.svg, result.stats.threshold, params, controller.signal);
      controller.signal.throwIfAborted();
      const suggestions = [];
      if (comparison.metrics.foregroundIoU < 0.98) {
        suggestions.push({ label: 'Threshold automatico', params: { threshold: -1 } });
        if (params.optTolerance > 0.02) suggestions.push({ label: 'Mais fidelidade', params: { optTolerance: Math.max(0.01, params.optTolerance / 2) } });
      }
      if (result.stats.points > params.maxPoints * 0.75) {
        suggestions.push({ label: 'Menos pontos', params: { optTolerance: Math.min(2, params.optTolerance * 2) } });
      }
      if (params.minThickness * result.stats.drawingWidth / params.modelWidth < 2 * params.geometryTolerance && params.minThickness > 0) {
        result.stats.warnings.push('Thickness is below geometry sampling precision; increase resolution or lower geometry tolerance');
      }
      const output = { svg: result.svg, stats: result.stats, original, rasterized: comparison.rasterized,
        metrics: comparison.metrics, suggestions, isColor: VectorizationPipeline.analyzeColor(canvas).isColor };
      this.lastResult = output;
      return output;
    } finally {
      signal?.removeEventListener('abort', abort);
      if (this.controller === controller) this.controller = null;
    }
  }

  cancel() {
    this.controller?.abort();
  }

  _loadAndNormalize(source, maxSize, signal) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const cleanup = () => {
        signal.removeEventListener('abort', abort);
        image.onload = image.onerror = null;
      };
      const abort = () => {
        cleanup();
        image.src = '';
        reject(new DOMException('Conversion cancelled', 'AbortError'));
      };
      signal.addEventListener('abort', abort, { once: true });
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        cleanup();
        try {
          if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('Image exceeds 40 megapixels');
          const ratio = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.imageSmoothingQuality = 'high';
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas);
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => {
        cleanup();
        reject(new Error('Cannot decode image. Use PNG, JPG or WebP with CORS permission.'));
      };
      image.src = source;
      if (signal.aborted) abort();
    });
  }

  _traceInWorker(image, params, signal) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./vectorization.worker.js', import.meta.url), { type: 'module' });
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        worker.terminate();
        if (error) reject(error);
        else resolve(result);
      };
      const abort = () => finish(new DOMException('Conversion cancelled', 'AbortError'));
      const timer = setTimeout(() => finish(new Error('Vectorization timed out. Reduce resolution or remove noise.')), params.timeoutMs);
      signal.addEventListener('abort', abort, { once: true });
      worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data);
      worker.onerror = (event) => finish(new Error(event.message || 'Worker failed'));
      worker.onmessageerror = () => finish(new Error('Cannot read worker result'));
      if (signal.aborted) return abort();
      try {
        worker.postMessage({ pixels: image.data.buffer, width: image.width, height: image.height, params, mode: this.mode }, [image.data.buffer]);
      } catch (error) {
        finish(error);
      }
    });
  }

  async _compare(original, svg, threshold, params, signal) {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const rendered = await this._loadAndNormalize(url, params.maxSize, signal);
      const reference = original.getContext('2d').getImageData(0, 0, original.width, original.height).data;
      const actual = rendered.getContext('2d').getImageData(0, 0, rendered.width, rendered.height).data;
      let absoluteError = 0;
      let intersection = 0;
      let union = 0;
      let different = 0;
      for (let index = 0; index < actual.length; index += 4) {
        const gray = 0.2126 * reference[index] + 0.7152 * reference[index + 1] + 0.0722 * reference[index + 2];
        const target = params.blackOnWhite ? gray : 255 - gray;
        const referenceInk = (gray <= threshold) === params.blackOnWhite;
        const actualInk = actual[index] < 128;
        absoluteError += Math.abs(target - actual[index]) / 255;
        if (referenceInk && actualInk) intersection++;
        if (referenceInk || actualInk) union++;
        if (referenceInk !== actualInk) different++;
      }
      const pixels = original.width * original.height;
      return { rasterized: rendered.toDataURL('image/png'), metrics: {
        foregroundIoU: union ? intersection / union : 1,
        meanAbsoluteError: absoluteError / pixels, differentPixelRatio: different / pixels,
        width: original.width, height: original.height,
      } };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  static analyzeColor(canvas) {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let total = 0;
    let count = 0;
    for (let index = 0; index < data.length; index += 16) {
      const maximum = Math.max(data[index], data[index + 1], data[index + 2]);
      const minimum = Math.min(data[index], data[index + 1], data[index + 2]);
      total += maximum ? (maximum - minimum) / maximum : 0;
      count++;
    }
    const saturationAvg = count ? total / count : 0;
    return { isColor: saturationAvg > 0.15, saturationAvg };
  }

  setParam(key, value) {
    if (!(key in PRESETS[this.mode])) throw new Error(`Unknown vectorization parameter: ${key}`);
    this.params = resolveParams(this.mode, { ...this.params, [key]: value });
  }

  getParams() {
    return { ...this.params };
  }

  setMode(mode) {
    this.params = resolveParams(mode);
    this.mode = mode;
  }
}