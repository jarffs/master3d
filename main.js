import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CookieCutterEngine } from './CookieCutterEngine.js';
import ImageTracer from 'imagetracerjs';

let scene, camera, renderer, controls;
let engine;
let currentSvgText = null;

// UI Elements
const uploadInput = document.getElementById('svg-upload');
const fileNameDisplay = document.getElementById('file-name');
const downloadBtn = document.getElementById('download-btn');
const viewerOverlay = document.getElementById('viewer-overlay');

// Sliders
const heightSlider = document.getElementById('height-slider');
const heightVal = document.getElementById('height-val');
const wallSlider = document.getElementById('wall-slider');
const wallVal = document.getElementById('wall-val');
const baseWidthSlider = document.getElementById('base-width-slider');
const baseWidthVal = document.getElementById('base-width-val');
const baseHeightSlider = document.getElementById('base-height-slider');
const baseHeightVal = document.getElementById('base-height-val');

function initThree() {
  const container = document.getElementById('canvas-container');
  
  scene = new THREE.Scene();
  
  // Add some grid/helpers
  const gridHelper = new THREE.GridHelper(100, 10, 0x444444, 0x222222);
  gridHelper.rotation.x = Math.PI / 2; // align grid with XY plane
  scene.add(gridHelper);

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 1000);
  camera.position.set(0, -60, 60); // looking at XY plane from bottom-front-up
  camera.up.set(0, 0, 1); // Z is up

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(50, 50, 100);
  scene.add(dirLight);
  
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
  fillLight.position.set(-50, -50, -50);
  scene.add(fillLight);

  engine = new CookieCutterEngine(scene);

  window.addEventListener('resize', onWindowResize);
  
  animate();
}

function onWindowResize() {
  const container = document.getElementById('canvas-container');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function updateModel() {
  if (!currentSvgText) return;
  
  const params = {
    height: parseFloat(heightSlider.value),
    wallThickness: parseFloat(wallSlider.value),
    baseWidth: parseFloat(baseWidthSlider.value),
    baseHeight: parseFloat(baseHeightSlider.value)
  };
  
  const success = engine.generate3DModel(params);
  
  if (success) {
    downloadBtn.disabled = false;
    viewerOverlay.classList.add('hidden');
  }
}

// Event Listeners
uploadInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  fileNameDisplay.textContent = file.name;
  viewerOverlay.innerHTML = '<p>Processando...</p>';
  viewerOverlay.classList.remove('hidden');
  
  if (file.name.toLowerCase().endsWith('.svg')) {
    const reader = new FileReader();
    reader.onload = (event) => {
      currentSvgText = event.target.result;
      engine.loadSVG(currentSvgText);
      updateModel();
    };
    reader.readAsText(file);
  } else {
    // Process raster image
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      
      const img = new Image();
      img.onload = () => {
        // Create canvas to flatten transparent background to white
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        // Fill white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Draw image over it
        ctx.drawImage(img, 0, 0);
        
        // Strict thresholding to guarantee pure black and white
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          // Luminance formula
          const brightness = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
          // If transparent or bright, make it white. Otherwise make it black.
          const color = (data[i+3] < 128 || brightness > 128) ? 255 : 0;
          data[i] = color;
          data[i+1] = color;
          data[i+2] = color;
          data[i+3] = 255; // fully opaque
        }
        ctx.putImageData(imageData, 0, 0);
        
        const flattenedDataUrl = canvas.toDataURL('image/png');
        
        // options for exact black and white silhouette tracing
        const options = {
          ltres: 1,
          qtres: 1,
          pathomit: 8,
          colorsampling: 0, 
          numberofcolors: 2,
          pal: [{r:0,g:0,b:0,a:255}, {r:255,g:255,b:255,a:255}]
        };
        
        ImageTracer.imageToSVG(flattenedDataUrl, (svgString) => {
          // Parse SVG safely and remove white paths
          const parser = new DOMParser();
          const doc = parser.parseFromString(svgString, "image/svg+xml");
          
          const paths = doc.querySelectorAll('path');
          paths.forEach(p => {
             const fill = p.getAttribute('fill');
             if (fill && (fill.replace(/\s/g, '') === 'rgb(255,255,255)' || fill === '#ffffff')) {
                 p.remove();
             }
          });
          
          currentSvgText = new XMLSerializer().serializeToString(doc);
          engine.loadSVG(currentSvgText);
          updateModel();
        }, options);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }
});

// Update value displays and model on slider change
function setupSlider(slider, display, suffix = ' mm') {
  slider.addEventListener('input', (e) => {
    display.textContent = `${e.target.value}${suffix}`;
    updateModel();
  });
}

setupSlider(heightSlider, heightVal);
setupSlider(wallSlider, wallVal);
setupSlider(baseWidthSlider, baseWidthVal);
setupSlider(baseHeightSlider, baseHeightVal);

downloadBtn.addEventListener('click', () => {
  engine.exportSTL();
});

// Initialize
initThree();
