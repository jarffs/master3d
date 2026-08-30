import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

const loader = new SVGLoader();
try {
  const result = loader.parse('<svg><path d="M0 0 L10 10"/></svg>');
  console.log('Parsed successfully. Paths:', result.paths.length);
} catch (e) {
  console.error('ERROR:', e.message);
}
