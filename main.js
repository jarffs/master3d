import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CookieCutterEngine } from './CookieCutterEngine.js';

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
  
  const reader = new FileReader();
  reader.onload = (event) => {
    currentSvgText = event.target.result;
    engine.loadSVG(currentSvgText);
    updateModel();
  };
  reader.readAsText(file);
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
