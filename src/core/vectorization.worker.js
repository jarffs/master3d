import { vectorize } from './vectorizationCore.js';

self.onmessage = ({ data }) => {
  try {
    const { pixels, width, height, params, mode = '3d_print' } = data;
    const result = vectorize({ data: new Uint8ClampedArray(pixels), width, height }, mode, params);
    self.postMessage(result, [result.binary]);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};