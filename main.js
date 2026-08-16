import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CookieCutterEngine } from './CookieCutterEngine.js';
import ImageTracer from 'imagetracerjs';
import { supabase } from './supabaseClient.js';
import { currentUser, userProfile, onAuthChange } from './auth.js';

let scene, camera, renderer, controls;
let engine;
let currentSvgText = null;
let buildPlateGroup = null;
let printersData = [];

// UI Elements
const uploadInput = document.getElementById('svg-upload');
const fileNameDisplay = document.getElementById('file-name');
const downloadBtn = document.getElementById('download-btn');

// Build Plate UI
const bpWidthInput = document.getElementById('bp-width');
const bpDepthInput = document.getElementById('bp-depth');
const bpRotateBtn = document.getElementById('bp-rotate-btn');
const bpWarning = document.getElementById('bp-warning');
const printerProfileSelect = document.getElementById('printer-profile');

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
  
  // Build Plate
  buildPlateGroup = new THREE.Group();
  scene.add(buildPlateGroup);

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 1000);
  camera.position.set(0, -60, 60); // looking at XY plane from bottom-front-up
  camera.up.set(0, 0, 1); // Z is up

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  
  loadPrinters();
  initUI();
  updateBuildPlate();
  
  onAuthChange((user, profile) => {
    loadPrinters(); // Recarrega a lista de impressoras com base no auth
    if (engine && currentSvgText) {
      if (user) {
        downloadBtn.disabled = false;
        downloadBtn.title = '';
      } else {
        downloadBtn.disabled = true;
        downloadBtn.title = 'Faça login para exportar o STL';
      }
    }
  });
  
  // Ouve atualizações de perfil vindas do profile.js
  window.addEventListener('auth-state-changed', loadPrinters);
  
  animate();
}

async function loadPrinters() {
  try {
    const { data: defaultPlates, error } = await supabase.from('default_build_plates').select('*');
    if (error) throw error;
    
    let availableDefaults = defaultPlates;
    
    // Se o usuário estiver logado e tiver selecionado impressoras específicas no perfil
    if (currentUser && userProfile?.selected_printers?.length > 0) {
       availableDefaults = defaultPlates.filter(p => userProfile.selected_printers.includes(p.id));
    }
    
    let customPlates = [];
    if (currentUser) {
      const { data: userPlates } = await supabase.from('custom_build_plates').select('*');
      if (userPlates) customPlates = userPlates;
    }
    
    if (availableDefaults.length === 0 && customPlates.length === 0) {
      printersData = [{ id: 'default', name: 'Impressora Padrão', width: 220, depth: 220 }];
    } else {
      printersData = [...availableDefaults, ...customPlates];
    }
    
    printerProfileSelect.innerHTML = '';
    printersData.forEach(printer => {
      const option = document.createElement('option');
      option.value = printer.id;
      option.textContent = printer.name + ` (${printer.width}x${printer.depth})`;
      printerProfileSelect.appendChild(option);
    });
    
    // Configura os inputs escondidos para a impressora selecionada (a primeira)
    if (printersData.length > 0) {
      printerProfileSelect.value = printersData[0].id;
      bpWidthInput.value = printersData[0].width;
      bpDepthInput.value = printersData[0].depth;
    }
    
    updateBuildPlate();
  } catch (error) {
    console.error('Erro ao carregar impressoras do Supabase:', error);
  }
}

function initUI() {
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
  
  updateBuildPlate();
  
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

function updateBuildPlate() {
  if (!buildPlateGroup) return;
  
  while(buildPlateGroup.children.length > 0) {
    const child = buildPlateGroup.children[0];
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material.dispose();
    }
    buildPlateGroup.remove(child);
  }
  
  const width = parseFloat(bpWidthInput.value) || 220;
  const depth = parseFloat(bpDepthInput.value) || 220;
  
  const radius = 8;
  const frontTabBaseWidth = 100;
  const frontTabTipWidth = 70;
  const frontTabDepth = 20;
  
  const backTabWidth = 25;
  const backTabDepth = 12;
  const backTabOffset = 15;
  
  const shape = new THREE.Shape();
  const w2 = width / 2;
  const d2 = depth / 2;
  
  shape.moveTo(-w2 + radius, -d2);
  
  // Front Tab
  shape.lineTo(-frontTabBaseWidth/2, -d2);
  shape.lineTo(-frontTabTipWidth/2, -d2 - frontTabDepth);
  shape.lineTo(frontTabTipWidth/2, -d2 - frontTabDepth);
  shape.lineTo(frontTabBaseWidth/2, -d2);
  
  // Bottom Right Corner
  shape.lineTo(w2 - radius, -d2);
  shape.quadraticCurveTo(w2, -d2, w2, -d2 + radius);
  
  // Right Edge & Top Right Corner
  shape.lineTo(w2, d2 - radius);
  shape.quadraticCurveTo(w2, d2, w2 - radius, d2);
  
  // Back Right Tab
  shape.lineTo(w2 - backTabOffset, d2);
  shape.lineTo(w2 - backTabOffset, d2 + backTabDepth);
  shape.lineTo(w2 - backTabOffset - backTabWidth, d2 + backTabDepth);
  shape.lineTo(w2 - backTabOffset - backTabWidth - 4, d2);
  
  // Top Edge (between back tabs)
  shape.lineTo(-w2 + backTabOffset + backTabWidth + 4, d2);
  
  // Back Left Tab
  shape.lineTo(-w2 + backTabOffset + backTabWidth, d2 + backTabDepth);
  shape.lineTo(-w2 + backTabOffset, d2 + backTabDepth);
  shape.lineTo(-w2 + backTabOffset, d2);
  
  // Top Left Corner
  shape.lineTo(-w2 + radius, d2);
  shape.quadraticCurveTo(-w2, d2, -w2, d2 - radius);
  
  // Left Edge & Bottom Left Corner
  shape.lineTo(-w2, -d2 + radius);
  shape.quadraticCurveTo(-w2, -d2, -w2 + radius, -d2);
  
  const extrudeSettings = {
    depth: 2,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.5,
    bevelThickness: 0.5
  };
  
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geometry.translate(0, 0, -2);
  
  const material = new THREE.MeshStandardMaterial({
    color: 0x1f2224,
    roughness: 0.9,
    metalness: 0.2
  });
  
  const plateMesh = new THREE.Mesh(geometry, material);
  buildPlateGroup.add(plateMesh);
  
  const gridGeom = new THREE.BufferGeometry();
  const vertices = [];
  const spacing = 10;
  
  const gridMaterial = new THREE.LineBasicMaterial({ 
    color: 0x666666, transparent: true, opacity: 0.6
  });
  const majorGridMaterial = new THREE.LineBasicMaterial({ 
    color: 0x999999, transparent: true, opacity: 0.8
  });
  
  const majorVertices = [];
  
  for (let x = 0; x < w2; x += spacing) {
    if (x === 0) {
      majorVertices.push(0, -d2, 0, 0, d2, 0);
    } else {
      const isMajor = (x % 50 === 0);
      if (isMajor) {
        majorVertices.push(x, -d2, 0, x, d2, 0);
        majorVertices.push(-x, -d2, 0, -x, d2, 0);
      } else {
        vertices.push(x, -d2, 0, x, d2, 0);
        vertices.push(-x, -d2, 0, -x, d2, 0);
      }
    }
  }
  for (let y = 0; y < d2; y += spacing) {
    if (y === 0) {
      majorVertices.push(-w2, 0, 0, w2, 0, 0);
    } else {
      const isMajor = (y % 50 === 0);
      if (isMajor) {
        majorVertices.push(-w2, y, 0, w2, y, 0);
        majorVertices.push(-w2, -y, 0, w2, -y, 0);
      } else {
        vertices.push(-w2, y, 0, w2, y, 0);
        vertices.push(-w2, -y, 0, w2, -y, 0);
      }
    }
  }
  
  gridGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const gridLines = new THREE.LineSegments(gridGeom, gridMaterial);
  gridLines.position.z = 0.51;
  buildPlateGroup.add(gridLines);
  
  if (majorVertices.length > 0) {
    const majorGridGeom = new THREE.BufferGeometry();
    majorGridGeom.setAttribute('position', new THREE.Float32BufferAttribute(majorVertices, 3));
    const majorGridLines = new THREE.LineSegments(majorGridGeom, majorGridMaterial);
    majorGridLines.position.z = 0.52;
    buildPlateGroup.add(majorGridLines);
  }
  
  // Outer shape outline (only print area, ignoring tabs)
  const printAreaShape = new THREE.Shape();
  printAreaShape.moveTo(-w2 + radius, -d2);
  printAreaShape.lineTo(w2 - radius, -d2);
  printAreaShape.quadraticCurveTo(w2, -d2, w2, -d2 + radius);
  printAreaShape.lineTo(w2, d2 - radius);
  printAreaShape.quadraticCurveTo(w2, d2, w2 - radius, d2);
  printAreaShape.lineTo(-w2 + radius, d2);
  printAreaShape.quadraticCurveTo(-w2, d2, -w2, d2 - radius);
  printAreaShape.lineTo(-w2, -d2 + radius);
  printAreaShape.quadraticCurveTo(-w2, -d2, -w2 + radius, -d2);
  
  const shapePoints = printAreaShape.getPoints();
  const shapeGeom = new THREE.BufferGeometry().setFromPoints(shapePoints);
  const shapeOutline = new THREE.Line(shapeGeom, majorGridMaterial);
  shapeOutline.position.z = 0.52;
  buildPlateGroup.add(shapeOutline);
  
  // Add dimension text (e.g., "220 x 220") to top-left corner
  const textCanvas = document.createElement('canvas');
  textCanvas.width = 256;
  textCanvas.height = 64;
  const ctx = textCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${width} x ${depth}`, 10, 32);
  
  const textTexture = new THREE.CanvasTexture(textCanvas);
  textTexture.needsUpdate = true;
  // Optional: textTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  
  const textMat = new THREE.MeshBasicMaterial({ 
    map: textTexture, 
    transparent: true
  });
  const textPlane = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), textMat);
  
  // Position at top-left, slightly offset from the edge
  textPlane.position.set(-w2 + 30, d2 - 20, 0.53);
  buildPlateGroup.add(textPlane);
  
  checkBuildPlateLimits();
  frameCamera();
}

function checkBuildPlateLimits() {
  if (!engine || !engine.cookieGroup || engine.cookieGroup.children.length === 0) {
    bpWarning.classList.add('hidden');
    if (buildPlateGroup && buildPlateGroup.children[0]) {
      buildPlateGroup.children[0].material.color.setHex(0x1f2224);
    }
    return;
  }
  
  const box = new THREE.Box3().setFromObject(engine.cookieGroup);
  const size = new THREE.Vector3();
  box.getSize(size);
  
  const width = parseFloat(bpWidthInput.value) || 220;
  const depth = parseFloat(bpDepthInput.value) || 220;
  
  if (size.x > width || size.y > depth) {
    bpWarning.classList.remove('hidden');
    if (buildPlateGroup && buildPlateGroup.children[0]) {
      buildPlateGroup.children[0].material.color.setHex(0x7f1d1d);
    }
  } else {
    bpWarning.classList.add('hidden');
    if (buildPlateGroup && buildPlateGroup.children[0]) {
      buildPlateGroup.children[0].material.color.setHex(0x1f2224);
    }
  }
}

function frameCamera() {
  const width = parseFloat(bpWidthInput.value) || 220;
  const depth = parseFloat(bpDepthInput.value) || 220;
  const maxDim = Math.max(width, depth);
  const dist = maxDim * 1.3;
  
  camera.position.set(0, -dist * 0.7, dist * 0.8);
  controls.target.set(0, 0, 0);
  controls.update();
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
    if (currentUser) {
      downloadBtn.disabled = false;
      downloadBtn.title = '';
    } else {
      downloadBtn.disabled = true;
      downloadBtn.title = 'Faça login para exportar o STL';
    }
    checkBuildPlateLimits();
  }
}

// Event Listeners
printerProfileSelect.addEventListener('change', (e) => {
  const val = e.target.value;
  const printer = printersData.find(p => p.id === val);
  if (printer) {
    bpWidthInput.value = printer.width;
    bpDepthInput.value = printer.depth;
    updateBuildPlate();
  }
});

bpWidthInput.addEventListener('input', () => {
  printerProfileSelect.value = 'custom';
  updateBuildPlate();
});
bpDepthInput.addEventListener('input', () => {
  printerProfileSelect.value = 'custom';
  updateBuildPlate();
});
bpRotateBtn.addEventListener('click', () => {
  printerProfileSelect.value = 'custom';
  const temp = bpWidthInput.value;
  bpWidthInput.value = bpDepthInput.value;
  bpDepthInput.value = temp;
  updateBuildPlate();
});
uploadInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  fileNameDisplay.textContent = file.name;
  
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

downloadBtn.addEventListener('click', async () => {
  if (!currentUser || !userProfile) {
    alert("Por favor, faça login para exportar.");
    return;
  }
  
  // Verifica limites do plano Free
  const planType = userProfile.plan_type || 'free';
  if (planType === 'free') {
     downloadBtn.disabled = true;
     const originalText = downloadBtn.textContent;
     downloadBtn.textContent = 'A verificar limites...';
     
     try {
       const sevenDaysAgo = new Date();
       sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
       
       const { data, error } = await supabase
          .from('export_logs')
          .select('id')
          .gte('exported_at', sevenDaysAgo.toISOString())
          .eq('user_id', currentUser.id);
          
       if (error) throw error;
       
       if (data && data.length >= 1) {
         alert("Atenção: Atingiu o limite do plano Free (1 exportação por semana). Faça upgrade para o Pro para obter exportações ilimitadas e guardar os seus designs na nuvem!");
         downloadBtn.disabled = false;
         downloadBtn.textContent = originalText;
         return;
       }
       
       // Regista a exportação
       await supabase.from('export_logs').insert([{ user_id: currentUser.id }]);
       
     } catch (err) {
       console.error("Erro na verificação de limites:", err);
       alert("Ocorreu um erro ao verificar o seu plano. Tente novamente.");
       downloadBtn.disabled = false;
       downloadBtn.textContent = originalText;
       return;
     }
     
     downloadBtn.disabled = false;
     downloadBtn.textContent = originalText;
  }
  
  engine.exportSTL();
});

// Initialize
initThree();
