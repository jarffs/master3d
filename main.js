import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CookieCutterEngine } from './src/engines/CookieCutterEngine.js';
import { KeychainEngine } from './src/engines/KeychainEngine.js';
import { ColoringEngine } from './src/engines/ColoringEngine.js';
import { BigLettersEngine } from './src/engines/BigLettersEngine.js';
import { ControlBuilder } from './src/ui/ControlBuilder.js';
import { SvgEditor } from './src/ui/SvgEditor.js';
import ImageTracer from 'imagetracerjs';
window.ImageTracer = ImageTracer;
import { supabase } from './supabaseClient.js';
import { currentUser, userProfile, onAuthChange, openAuthModal } from './auth.js';
import { t } from './i18n.js';
import { ViewHelper } from 'three/addons/helpers/ViewHelper.js';
import { TextToSvg } from './src/ui/TextToSvg.js';
import { initStripeCheckout, processStripeCheckout } from './src/ui/stripe.js';
import { Dialog } from './src/ui/Dialog.js';

let scene, camera, renderer, controls;
let engine;
let controlBuilder;
let svgEditor;
let textToSvg;
let viewHelper;
let currentSvgText = null;
let buildPlateGroup = null;
let printersData = [];
let modelUpdateId = 0;

function getControlBuilderOptions() {
  if (engine?.name === 'keychain') {
    return {
      collapsible: true,
      categoryOrder: ['primary', 'base', 'text', 'keyring'],
      plainCategories: ['primary']
    };
  }
  if (engine?.name === 'cookie_cutter') {
    return {
      collapsible: true,
      categoryOrder: ['cut', 'base', 'contour']
    };
  }
  if (engine?.name === 'coloring') {
    return {
      collapsible: true,
      categoryOrder: ['base', 'borders']
    };
  }
  if (engine?.name === 'big_letters') {
    return {
      collapsible: true,
      categoryOrder: ['primary', 'secondary', 'dimensions'],
      plainCategories: ['primary', 'secondary']
    };
  }
  return {};
}

async function handleControlChange(id, value, meta) {
  if (meta?.action === 'pickFont' && textToSvg) {
    let currentText = controlBuilder.getValues().textContent || 'A';
    if (engine?.name === 'big_letters') {
      currentText = id === 'bigLetterFont' ? controlBuilder.getValues().bigLetter : controlBuilder.getValues().nameText;
    }
    await textToSvg.openFontPicker({
      text: currentText,
      selectedFamily: value,
      onSelect: family => {
        controlBuilder.setValue(id, family);
        if (engine?.name !== 'big_letters') {
          updateModel();
        }
      }
    });
    return;
  }
  if (engine?.name === 'big_letters') {
    // Wait for explicit "Generate 3D" click
    return;
  }
  updateModel();
}

// UI Elements
const uploadInput = document.getElementById('svg-upload');
const fileNameDisplay = document.getElementById('file-name');
const downloadBtn = document.getElementById('download-btn');
const saveDesignBtn = document.getElementById('save-design-btn');
const modelLoading = document.getElementById('model-loading');

// Build Plate UI
const bpWidthInput = document.getElementById('bp-width');
const bpDepthInput = document.getElementById('bp-depth');
const bpRotateBtn = document.getElementById('bp-rotate-btn');
const bpWarning = document.getElementById('bp-warning');
const printerProfileSelect = document.getElementById('printer-profile');


// Model Dimensions
const modelWidthInput = document.getElementById('model-width');
const modelDepthInput = document.getElementById('model-depth');
const lockRatioBtn = document.getElementById('lock-ratio-btn');
const dimensionsSection = document.getElementById('model-dimensions-section');
let lockRatio = true;
let svgAspectRatio = 1;

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
  renderer.autoClear = false;
  viewHelper = new ViewHelper(camera, renderer.domElement);
  if (viewHelper.location) {
    viewHelper.location.bottom = null;
    viewHelper.location.top = 16;
    viewHelper.location.right = 16;
  }
  
  const canvasContainer = document.getElementById('canvas-container');
  if (canvasContainer) {
    canvasContainer.addEventListener('pointerup', (e) => {
      viewHelper.handleClick(e);
    });
  }

  const homeBtn = document.getElementById('home-view-btn');
  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      frameCamera();
    });
  }
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  
  loadPrinters();
  initUI();
  updateBuildPlate();
  initStripeCheckout();

  // Load tool from URL
  const params = new URLSearchParams(window.location.search);
  const tool = params.get('tool') || 'cookie_cutter';
  const loadDesignId = params.get('load_design');

  if (tool === 'cookie_cutter') {
    engine = new CookieCutterEngine(scene);
  } else if (tool === 'keychain') {
    engine = new KeychainEngine(scene);
  } else if (tool === 'coloring') {
    engine = new ColoringEngine(scene);
  } else if (tool === 'big_letters') {
    engine = new BigLettersEngine(scene);
  } else {
    // Fallback
    engine = new CookieCutterEngine(scene);
  }

  controlBuilder = new ControlBuilder('dynamic-controls', handleControlChange);
  controlBuilder.build(engine.getControlSchema(), t, getControlBuilderOptions());

  const toolReferenceImage = document.getElementById('tool-reference-image');
  const toolReferenceTitle = document.getElementById('tool-reference-title');
  const toolReferences = {
    cookie_cutter: {
      image: '/images/tools/cookie-cutter.jpg',
      title: t('app.tool_cookie_cutter'),
      alt: t('app.tool_cookie_cutter_reference')
    },
    keychain: {
      image: '/images/tools/keychain.jpg',
      title: t('app.tool_keychain'),
      alt: t('app.tool_keychain_reference')
    },
    coloring: {
      image: '/images/tools/coloring.jpg',
      title: t('app.tool_coloring'),
      alt: t('app.tool_coloring_reference')
    }
  };
  const toolReference = toolReferences[tool];
  if (toolReference && toolReferenceImage && toolReferenceTitle) {
    toolReferenceImage.src = toolReference.image;
    toolReferenceImage.alt = toolReference.alt;
    toolReferenceTitle.textContent = toolReference.title;
  }
  
  // Dynamic UI texts based on tool
  if (tool === 'keychain' || tool === 'coloring' || tool === 'big_letters') {
    const titleEl = document.querySelector('h3[data-i18n="app.upload_image_title"]');
    const uploadDescEl = document.querySelector('p[data-i18n="app.upload_desc"]');
    const exportBtnText = document.querySelector('#download-btn span');
    
    if (titleEl && tool !== 'big_letters') {
      titleEl.setAttribute('data-i18n', 'app.upload_image_title_keychain');
    }
    if (uploadDescEl && tool !== 'big_letters') {
      uploadDescEl.setAttribute('data-i18n', 'app.upload_desc_keychain');
    }
    if (exportBtnText) {
      exportBtnText.setAttribute('data-i18n', 'app.export_3mf');
      exportBtnText.textContent = 'Exportar 3MF';
    }
    
    if (tool === 'keychain') {
      // Hide image upload for keychain, only allow text
      const uploadGroup = document.querySelector('.upload-group');
      const orSeparator = document.querySelector('.or-separator');
      if (uploadGroup) uploadGroup.style.display = 'none';
      if (orSeparator) orSeparator.style.display = 'none';
      const textCreateBtn = document.getElementById('create-from-text-btn');
      if (textCreateBtn) textCreateBtn.style.display = 'none';
      if (orSeparator) orSeparator.style.display = 'none';
    } else if (tool === 'coloring') {
      const orSeparator = document.querySelector('.or-separator');
      const textCreateBtn = document.getElementById('create-from-text-btn');
      if (orSeparator) orSeparator.style.display = 'none';
      if (textCreateBtn) textCreateBtn.style.display = 'none';
    } else if (tool === 'big_letters') {
      // Hide everything related to upload/svg generation
      const uploadGroups = document.querySelectorAll('.upload-group');
      uploadGroups.forEach(el => el.style.display = 'none');
      
      const orSeparator = document.querySelector('.or-separator');
      if (orSeparator) orSeparator.style.display = 'none';
      
      const textCreateBtn = document.getElementById('create-from-text-btn');
      if (textCreateBtn) textCreateBtn.style.display = 'none';
      
      // Show explicit "Generate 3D" button
      const generateBtn = document.getElementById('generate-3d-btn');
      if (generateBtn) {
        generateBtn.style.display = 'flex';
        generateBtn.addEventListener('click', () => {
          updateModel();
        });
      }
      
      // Trigger initial build
      setTimeout(() => { updateModel(); }, 500);
    }
  }
  
  svgEditor = new SvgEditor('svg-editor-container', 'svg-editor-modal');
  textToSvg = new TextToSvg('text-to-svg-modal');

  const createFromTextBtn = document.getElementById('create-from-text-btn');
  if (createFromTextBtn && tool !== 'keychain') {
    createFromTextBtn.addEventListener('click', () => {
      textToSvg.open((result) => {
        if (typeof result === 'string') {
          // Direct SVG from opentype.js — perfect vector
          currentSvgText = result;
          if (engine.name === 'keychain') {
            engine.loadTextSVG(currentSvgText);
            const oldValues = controlBuilder.getValues();
            controlBuilder.build(engine.getControlSchema(), t, getControlBuilderOptions());
            controlBuilder.setValues(oldValues);
          } else {
            engine.loadSVG(currentSvgText);
          }
          fileNameDisplay.textContent = '✏️ Texto';
          fileNameDisplay.style.display = 'block';
          initDimensionsFromSVG();
          updateModel();
        } else if (result?.type === 'raster' && result.dataUrl) {
          // Canvas fallback — need to trace to SVG via ImageTracer
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            
            // Threshold to pure B&W
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
              const brightness = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
              const color = brightness > 128 ? 255 : 0;
              data[i] = color; data[i+1] = color; data[i+2] = color; data[i+3] = 255;
            }
            ctx.putImageData(imageData, 0, 0);
            
            const flatUrl = canvas.toDataURL('image/png');
            const options = {
              ltres: 1, qtres: 1, pathomit: 8,
              colorsampling: 0, numberofcolors: 2,
              pal: [{r:0,g:0,b:0,a:255}, {r:255,g:255,b:255,a:255}]
            };
            
            ImageTracer.imageToSVG(flatUrl, async (svgString) => {
              const parser = new DOMParser();
              const doc = parser.parseFromString(svgString, "image/svg+xml");
              doc.querySelectorAll('path').forEach(p => {
                const fill = p.getAttribute('fill');
                if (fill && (fill.replace(/\s/g, '') === 'rgb(255,255,255)' || fill === '#ffffff')) {
                  p.remove();
                }
              });
              currentSvgText = new XMLSerializer().serializeToString(doc);
              if (engine.name === 'keychain') {
                engine.loadTextSVG(currentSvgText);
                const oldValues = controlBuilder.getValues();
                controlBuilder.build(engine.getControlSchema(), t, getControlBuilderOptions());
                controlBuilder.setValues(oldValues);
              } else {
                engine.loadSVG(currentSvgText);
              }
              fileNameDisplay.textContent = '✏️ Texto';
              fileNameDisplay.style.display = 'block';
              await initDimensionsFromSVG();
              await updateModel();
            }, options);
          };
          img.src = result.dataUrl;
        }
      });
    });
  }
  
  let initialDesignLoaded = false;
  onAuthChange(async (user, profile) => {
    loadPrinters(); // Recarrega a lista de impressoras com base no auth
    if (engine?.group?.children.length > 0) refreshExportButtons();
    
    if (user && loadDesignId && !initialDesignLoaded) {
      initialDesignLoaded = true;
      try {
        const { data, error } = await supabase
          .from('saved_designs')
          .select('*')
          .eq('id', loadDesignId)
          .single();
        
        if (data && !error) {
          loadDesignIntoEngine(data);
        }
      } catch (err) {
        console.error("Failed to load design from URL:", err);
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

  // Engine is now initialized when user selects a tool in the Hub
  // engine = new CookieCutterEngine(scene);

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
  renderer.clear();
  renderer.render(scene, camera);
  if (viewHelper) {
    viewHelper.render(renderer);
  }
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
  if (!engine || !engine.group || engine.group.children.length === 0) {
    bpWarning.classList.add('hidden');
    if (buildPlateGroup && buildPlateGroup.children[0]) {
      buildPlateGroup.children[0].material.color.setHex(0x1f2224);
    }
    return;
  }
  
  const box = new THREE.Box3().setFromObject(engine.group);
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

// Os botões seguem clicáveis sem login para que o usuário saiba que precisa de conta
function refreshExportButtons() {
  downloadBtn.disabled = false;
  downloadBtn.title = currentUser ? '' : t('js.account_required_export');
  if (saveDesignBtn) {
    saveDesignBtn.disabled = false;
    saveDesignBtn.title = currentUser ? '' : t('js.account_required_save');
  }
}

async function updateModel() {
  if (!currentSvgText && engine?.name !== 'keychain') return;
  if (!engine || !controlBuilder) return;

  const updateId = ++modelUpdateId;
  modelLoading?.classList.remove('hidden');
  // Deixa o loader pintar antes da geração; em aba oculta o rAF não dispara, então há um limite
  await new Promise(resolve => {
    requestAnimationFrame(resolve);
    setTimeout(resolve, 50);
  });

  const params = controlBuilder.getValues();
  params.targetWidth = parseFloat(modelWidthInput.value) || 80;
  params.targetDepth = parseFloat(modelDepthInput.value) || 80;

  let success = false;
  try {
    success = await engine.generate3DModel(params);
  } finally {
    if (updateId === modelUpdateId) modelLoading?.classList.add('hidden');
  }
  
  if (success) {
    // After first generation, update dimension inputs with correct aspect ratio
    if (engine.svgAspectRatio && engine.svgAspectRatio !== svgAspectRatio) {
      svgAspectRatio = engine.svgAspectRatio;
    }
    
    refreshExportButtons();
    checkBuildPlateLimits();
  }
}

async function initDimensionsFromSVG() {
  // Show the dimensions section
  dimensionsSection.style.display = '';
  
  // Run a preliminary generation to get aspect ratio
  if (!engine || !controlBuilder) return;
  const tempParams = controlBuilder.getValues();
  tempParams.targetWidth = 80;
  tempParams.targetDepth = 80;
  await engine.generate3DModel(tempParams);
  
  if (engine.svgAspectRatio) {
    svgAspectRatio = engine.svgAspectRatio;
    // Set initial dimensions based on 80mm max and aspect ratio
    if (svgAspectRatio >= 1) {
      // Wider than tall
      modelWidthInput.value = 80;
      modelDepthInput.value = Math.round(80 / svgAspectRatio);
    } else {
      // Taller than wide
      modelDepthInput.value = 80;
      modelWidthInput.value = Math.round(80 * svgAspectRatio);
    }
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

// Model Dimensions Event Listeners
lockRatioBtn.addEventListener('click', () => {
  lockRatio = !lockRatio;
  lockRatioBtn.classList.toggle('active', lockRatio);
  // Swap icon between locked and unlocked
  if (lockRatio) {
    lockRatioBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
  } else {
    lockRatioBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 5-5 5 5 0 0 1 5 5"></path></svg>';
  }
});

modelWidthInput.addEventListener('input', () => {
  if (lockRatio && svgAspectRatio > 0) {
    const newWidth = parseFloat(modelWidthInput.value) || 80;
    modelDepthInput.value = Math.round(newWidth / svgAspectRatio);
  }
  updateModel();
});

modelDepthInput.addEventListener('input', () => {
  if (lockRatio && svgAspectRatio > 0) {
    const newDepth = parseFloat(modelDepthInput.value) || 80;
    modelWidthInput.value = Math.round(newDepth * svgAspectRatio);
  }
  updateModel();
});

uploadInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  fileNameDisplay.textContent = file.name;
  
  if (file.name.toLowerCase().endsWith('.svg')) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const svgText = event.target.result;
      svgEditor.open(svgText, async (editedSvg) => {
        currentSvgText = editedSvg;
        if (engine.name === 'keychain') {
          engine.loadImageSVG(currentSvgText);
        } else {
          engine.loadSVG(currentSvgText);
        }
        await initDimensionsFromSVG();
        await updateModel();
      });
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
        
        ImageTracer.imageToSVG(flattenedDataUrl, async (svgString) => {
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
          
          const initialSvg = new XMLSerializer().serializeToString(doc);
          
          // Open editor for cleanup
          svgEditor.open(initialSvg, async (editedSvg) => {
            currentSvgText = editedSvg;
            if (engine.name === 'keychain') {
              engine.loadImageSVG(currentSvgText);
            } else {
              engine.loadSVG(currentSvgText);
            }
            await initDimensionsFromSVG();
            await updateModel();
          });
        }, options);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }
});

// Static slider listeners removed, handled by ControlBuilder


downloadBtn.addEventListener('click', async () => {
  if (!currentUser || !userProfile) {
    openAuthModal(t('js.account_required_export'));
    return;
  }
  
  downloadBtn.disabled = true;
  if(saveDesignBtn) saveDesignBtn.disabled = true;
  const originalText = downloadBtn.innerHTML;
  downloadBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> <span>...</span>`;
  
  // Desconta o crédito no Backend usando RPC
  try {
    const { data: success, error } = await supabase.rpc('deduct_credit');
    
    if (error) throw error;
    
    if (!success) {
      await Dialog.alert("Não tem créditos suficientes. Por favor, adquira mais pacotes de STLs.");
      
      const profileModal = document.getElementById('profile-modal');
      if (profileModal) profileModal.classList.remove('hidden');
      
      downloadBtn.disabled = false;
      if(saveDesignBtn) saveDesignBtn.disabled = false;
      downloadBtn.innerHTML = originalText;
      return;
    }
    
    // Atualizar a UI
    if (userProfile && typeof userProfile.credits === 'number') {
      userProfile.credits -= 1;
      const shopCreditsEl = document.getElementById('profile-current-credits-shop');
      if (shopCreditsEl) shopCreditsEl.textContent = userProfile.credits;
      const topbarCreditsEl = document.querySelector('#topbar-credits strong');
      if (topbarCreditsEl) topbarCreditsEl.textContent = userProfile.credits;
    }
    
  } catch (err) {
    console.error("Erro ao descontar crédito:", err);
    await Dialog.alert("Ocorreu um erro ao processar o seu crédito. Tente novamente.");
    downloadBtn.disabled = false;
    if(saveDesignBtn) saveDesignBtn.disabled = false;
    downloadBtn.innerHTML = originalText;
    return;
  }
  
  downloadBtn.disabled = false;
  if(saveDesignBtn) saveDesignBtn.disabled = false;
  downloadBtn.innerHTML = originalText;
  
  if (engine.name === 'keychain') {
    await engine.export3MF('master3d_chaveiro.3mf');
  } else if (engine.name === 'coloring') {
    await engine.export3MF('master3d_colorir.3mf');
  } else {
    engine.exportSTL();
  }
});

// Initialize
initThree();


// --- SAVE DESIGN LOGIC ---
if (saveDesignBtn) {
  saveDesignBtn.addEventListener('click', async () => {
    if (!currentUser) {
      openAuthModal(t('js.account_required_save'));
      return;
    }
    
    if (!currentSvgText) return;
    
    const projectName = await Dialog.prompt(t('app.save_prompt') || 'Name your design:');
    if (!projectName) return; // User cancelled
    
    // UI Loading state
    const originalText = saveDesignBtn.innerHTML;
    saveDesignBtn.disabled = true;
    saveDesignBtn.innerHTML = '...';
    
    try {
      // Check for existing
      const { data: existingDesign } = await supabase
        .from('saved_designs')
        .select('id, thumbnail_url')
        .eq('user_id', currentUser.id)
        .eq('name', projectName)
        .maybeSingle();
        
      if (existingDesign) {
        const confirmOverwrite = await Dialog.confirm("Um projeto com este nome já existe. Deseja substituí-lo?");
        if (!confirmOverwrite) {
          saveDesignBtn.innerHTML = originalText;
          saveDesignBtn.disabled = false;
          return;
        }
      }

      // Thumbnail storage is optional; projects must still save if the bucket is unavailable.
      let publicUrl = existingDesign?.thumbnail_url || null;
      try {
        const oldBg = scene.background;
        scene.background = new THREE.Color(0xf8fafc);
        renderer.render(scene, camera);
        const dataUrl = renderer.domElement.toDataURL('image/jpeg', 0.8);
        scene.background = oldBg;
        renderer.render(scene, camera);

        const blob = await (await fetch(dataUrl)).blob();
        const fileName = `thumb_${Date.now()}.jpg`;
        const filePath = `${currentUser.id}/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from('thumbnails')
          .upload(filePath, blob, { contentType: 'image/jpeg' });

        if (uploadError) throw uploadError;
        publicUrl = supabase.storage.from('thumbnails').getPublicUrl(filePath).data.publicUrl;
      } catch (thumbnailError) {
        console.warn('Unable to save project thumbnail:', thumbnailError);
      }
      
      // 2. Save Settings
      const settings = controlBuilder ? controlBuilder.getValues() : {};
      settings.modelWidth = parseFloat(modelWidthInput.value);
      settings.modelDepth = parseFloat(modelDepthInput.value);
      
      // 3. Insert or Update into Database
      if (existingDesign) {
        const { error: dbError } = await supabase.from('saved_designs').update({
          svg_data: currentSvgText || '<svg xmlns="http://www.w3.org/2000/svg"/>',
          settings: settings,
          thumbnail_url: publicUrl,
          tool_type: engine ? engine.name : 'cookie_cutter',
          updated_at: new Date().toISOString()
        }).eq('id', existingDesign.id);
        
        if (dbError) throw dbError;
        
        // Remove old thumbnail
        if (existingDesign.thumbnail_url) {
           const oldPath = existingDesign.thumbnail_url.split('/').pop();
           supabase.storage.from('thumbnails').remove([`${currentUser.id}/${oldPath}`]);
        }
      } else {
        const { error: dbError } = await supabase.from('saved_designs').insert({
          user_id: currentUser.id,
          name: projectName,
          svg_data: currentSvgText || '<svg xmlns="http://www.w3.org/2000/svg"/>',
          settings: settings,
          tool_type: engine ? engine.name : 'cookie_cutter',
          thumbnail_url: publicUrl
        });
        
        if (dbError) throw dbError;
      }
      
      await Dialog.alert(t('app.save_success') || 'Design saved successfully!');
      
    } catch (err) {
      console.error('Error saving design:', err);
      await Dialog.alert('Error saving design: ' + err.message);
    } finally {
      saveDesignBtn.innerHTML = originalText;
      saveDesignBtn.disabled = false;
    }
  });
}


// --- MY DESIGNS MODAL LOGIC ---
const designsModal = document.getElementById('designs-modal');
const closeDesignsBtn = document.getElementById('close-designs-btn');
const designsGrid = document.getElementById('designs-grid');
const designsLoading = document.getElementById('designs-loading');
const designsEmpty = document.getElementById('designs-empty');

if (designsModal) {
  window.addEventListener('open-designs-modal', () => {
    if (!currentUser) return;
    designsModal.classList.remove('hidden');
    loadDesigns();
  });

  closeDesignsBtn?.addEventListener('click', () => {
    designsModal.classList.add('hidden');
  });
}

async function loadDesigns() {
  if (!designsGrid) return;
  designsGrid.innerHTML = '';
  designsLoading.style.display = 'block';
  designsEmpty.style.display = 'none';

  try {
    const { data, error } = await supabase
      .from('saved_designs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    designsLoading.style.display = 'none';

    if (!data || data.length === 0) {
      designsEmpty.style.display = 'block';
      designsEmpty.textContent = 'Nenhum projeto salvo encontrado.';
      return;
    }

    data.forEach(design => {
      const card = document.createElement('div');
      card.style.cssText = 'border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; cursor: pointer; transition: transform 0.2s; background: var(--bg-surface);';
      card.onmouseover = () => card.style.transform = 'translateY(-4px)';
      card.onmouseout = () => card.style.transform = 'translateY(0)';
      
      const imgHtml = design.thumbnail_url 
        ? `<img src="${design.thumbnail_url}" style="width: 100%; height: 150px; object-fit: cover; border-bottom: 1px solid var(--border-color); display: block;">`
        : `<div style="width: 100%; height: 150px; background: var(--border-color); display: flex; align-items: center; justify-content: center; color: var(--text-secondary);">Sem Imagem</div>`;

      const date = new Date(design.created_at).toLocaleDateString();

      card.innerHTML = `
        ${imgHtml}
        <div style="padding: 12px; position: relative;">
          <h4 style="margin: 0 0 4px 0; font-size: 14px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 30px;" title="${design.name}">${design.name}</h4>
          <div style="font-size: 12px; color: var(--text-secondary);">${date}</div>
          <button class="delete-design-btn" style="position: absolute; right: 12px; top: 12px; background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px; border-radius: 4px;" title="Excluir" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='none'">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;

      card.addEventListener('click', async () => {
        if (!(await Dialog.confirm('Deseja sair do projeto atual? Alterações não salvas serão perdidas.'))) {
          return;
        }
        
        const currentTool = engine ? engine.name : 'cookie_cutter';
        const targetTool = design.tool_type || 'cookie_cutter';
        
        if (currentTool !== targetTool) {
          window.location.href = `app.html?tool=${targetTool}&load_design=${design.id}`;
        } else {
          loadDesignIntoEngine(design);
          if (designsModal) designsModal.classList.add('hidden');
        }
      });
      
      const delBtn = card.querySelector('.delete-design-btn');
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (await Dialog.confirm(`Tem certeza que deseja apagar "${design.name}"?`)) {
          const oldHtml = delBtn.innerHTML;
          delBtn.innerHTML = '...';
          
          const { error } = await supabase.from('saved_designs').delete().eq('id', design.id);
          
          if (!error) {
            // Remove thumb
            if (design.thumbnail_url) {
               const oldPath = design.thumbnail_url.split('/').pop();
               supabase.storage.from('thumbnails').remove([`${currentUser.id}/${oldPath}`]);
            }
            card.remove();
            if (designsGrid.children.length === 0) {
              designsEmpty.style.display = 'block';
            }
          } else {
            console.error(error);
            await Dialog.alert('Erro ao apagar projeto.');
            delBtn.innerHTML = oldHtml;
          }
        }
      });

      designsGrid.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading designs:', err);
    designsLoading.style.display = 'none';
    designsEmpty.style.display = 'block';
    designsEmpty.textContent = 'Erro ao carregar projetos: ' + err.message;
  }
}

function loadDesignIntoEngine(design) {
  // Identify engine based on tool_type
  const toolType = design.tool_type || 'cookie_cutter';
  
  if (engine && engine.group) {
    scene.remove(engine.group);
  }

  if (toolType === 'cookie_cutter') {
    engine = new CookieCutterEngine(scene);
  } else if (toolType === 'keychain') {
    engine = new KeychainEngine(scene);
  } else if (toolType === 'coloring') {
    engine = new ColoringEngine(scene);
  } else {
    // Fallback for future engines
    engine = new CookieCutterEngine(scene);
  }

  // Rebuild dynamic controls
  controlBuilder = new ControlBuilder('dynamic-controls', handleControlChange);
  controlBuilder.build(engine.getControlSchema(), t, getControlBuilderOptions());

  // Load SVG
  currentSvgText = design.svg_data;
  if (engine.name !== 'keychain') engine.loadSVG(currentSvgText);
  
  // Update UI Inputs
  if (design.settings) {
    // Remapear valores salvos antigos pro novo formato (ex: 'wall' -> 'wallThickness') se necessário
    if (design.settings.wall !== undefined && design.settings.wallThickness === undefined) {
      design.settings.wallThickness = design.settings.wall;
    }
    controlBuilder.setValues(design.settings);
    
    if (design.settings.modelWidth !== undefined) {
      modelWidthInput.value = design.settings.modelWidth;
    }
    if (design.settings.modelDepth !== undefined) {
      modelDepthInput.value = design.settings.modelDepth;
    }
  }
  
  dimensionsSection.style.display = '';
  
  // Visual Update
  fileNameDisplay.style.display = 'block';
  fileNameDisplay.textContent = design.name + ' (Carregado)';
  
  updateModel();
}


// Handle automatic checkout redirection from landing page
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const planToBuy = urlParams.get('buy');
  const action = urlParams.get('action');
  
  if (planToBuy) {
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
    
    const tryCheckout = () => {
      if (currentUser) {
        processStripeCheckout(planToBuy);
      } else {
        openAuthModal();
        let checkoutStarted = false;
        onAuthChange((user) => {
          if (user && !checkoutStarted) {
            checkoutStarted = true;
            processStripeCheckout(planToBuy);
          }
        });
      }
    };

    setTimeout(tryCheckout, 800);
  } else if (action === 'profile' || action === 'designs') {
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);

    const openRequestedModal = async () => {
      if (action === 'profile') {
        const { openProfileModal } = await import('./profile.js');
        openProfileModal();
      } else if (action === 'designs') {
        window.dispatchEvent(new Event('open-designs-modal'));
      }
    };

    const tryOpen = () => {
      if (currentUser) {
        openRequestedModal();
      } else {
        let opened = false;
        onAuthChange((user) => {
          if (user && !opened) {
            opened = true;
            openRequestedModal();
          }
        });
      }
    };
    
    setTimeout(tryOpen, 800);
  }
});
