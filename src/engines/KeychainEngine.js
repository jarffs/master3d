import * as THREE from 'three';
import ClipperLib from 'clipper-lib';
import { BaseEngine } from './BaseEngine.js';

export class KeychainEngine extends BaseEngine {
  constructor(scene) {
    super(scene);
    this.name = 'keychain';

    this.textSvgShapes = [];
    this.generationId = 0;
    
    // Default PLA colors for the simplified palette
    this.plaColors = [
      { value: '#ffffff', label: 'Branco' },
      { value: '#1a1a1a', label: 'Preto' },
      { value: '#dc2626', label: 'Vermelho' },
      { value: '#2563eb', label: 'Azul' },
      { value: '#eab308', label: 'Amarelo' },
      { value: '#16a34a', label: 'Verde' },
      { value: '#f97316', label: 'Laranja' }
    ];
    
    this.partMaterials = {
      base: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide }),
      ring: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide }),
      top: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide })
    };
  }

  loadSVG(svgText) {
    this.loadTextSVG(svgText);
  }

  loadImageSVG(svgText) {
    this.loadTextSVG(svgText);
  }

  loadTextSVG(svgText) {
    this.textSvgShapes = this.parseSVG(svgText);
    this.currentSvgShapes = this.textSvgShapes;
  }

  getControlSchema() {
    const fontFamilies = [
      'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald',
      'Raleway', 'Poppins', 'Nunito', 'Playfair Display', 'Merriweather',
      'Ubuntu', 'Lobster', 'Pacifico', 'Bebas Neue', 'Dancing Script',
      'Permanent Marker', 'Righteous', 'Alfa Slab One', 'Bangers', 'Bungee',
      'Fredoka', 'Press Start 2P', 'Anton', 'Archivo Black', 'Black Ops One',
      'Carter One', 'Chewy', 'Courgette', 'Creepster', 'Fugaz One',
      'Gloria Hallelujah', 'Indie Flower', 'Kablammo', 'Luckiest Guy', 'Monoton',
      'Orbitron', 'Passion One', 'Patua One', 'Russo One', 'Satisfy',
      'Shadows Into Light', 'Special Elite', 'Titan One', 'Ultra', 'Zilla Slab',
      'Abril Fatface', 'Bungee Shade', 'Concert One', 'Frijole', 'Gravitas One',
      'Inter', 'Josefin Sans', 'Kaushan Script', 'Libre Baskerville', 'Noto Sans',
      'Outfit', 'PT Sans', 'Quicksand', 'Source Sans 3', 'Work Sans',
      'Caveat', 'Comfortaa', 'DM Sans', 'Exo 2', 'Fira Sans',
      'Great Vibes', 'Hind', 'IBM Plex Sans', 'Jost', 'Kanit',
      'League Spartan', 'Manrope', 'Nunito Sans', 'Overpass', 'Philosopher'
    ].sort();

    const fontOptions = fontFamilies.map(f => ({ value: f, label: f }));

    const schema = [
      {
        id: 'textContent',
        type: 'text',
        label: 'app.text_content',
        desc: 'app.text_content_desc',
        placeholder: 'app.text_input_placeholder',
        default: 'Master3D',
        multiline: true,
        category: 'settings'
      },
      {
        id: 'textFont',
        type: 'select',
        label: 'app.text_font',
        desc: 'app.text_font_desc',
        options: fontOptions,
        default: 'Roboto',
        category: 'settings'
      },
      {
        id: 'enableBase',
        type: 'toggle',
        label: 'app.enable_base',
        desc: 'app.enable_base_desc',
        default: true,
        category: 'settings'
      },
      {
        id: 'baseHeight',
        type: 'slider',
        label: 'app.base_height',
        desc: 'app.base_height_desc',
        min: 1,
        max: 10,
        step: 0.5,
        default: 2.5,
        suffix: 'mm',
        category: 'settings'
      },
      {
        id: 'stampHeight',
        type: 'slider',
        label: 'app.stamp_height',
        desc: 'app.stamp_height_desc',
        min: 0.5,
        max: 10,
        step: 0.5,
        default: 2,
        suffix: 'mm',
        category: 'settings'
      },
      {
        id: 'baseOffset',
        type: 'slider',
        label: 'app.base_offset',
        desc: 'app.base_offset_desc',
        min: 0,
        max: 10,
        step: 0.5,
        default: 3,
        suffix: 'mm',
        category: 'settings'
      },
      {
        id: 'letterSpacing',
        type: 'slider',
        label: 'app.letter_spacing',
        desc: 'app.letter_spacing_desc',
        min: -50,
        max: 200,
        step: 1,
        default: 0,
        suffix: '%',
        category: 'settings'
      },
      {
        id: 'lineSpacing',
        type: 'slider',
        label: 'app.line_spacing',
        desc: 'app.line_spacing_desc',
        min: -50,
        max: 200,
        step: 1,
        default: 0,
        suffix: '%',
        category: 'settings'
      },
      {
        id: 'ringAngle',
        type: 'slider',
        label: 'app.ring_angle',
        desc: 'app.ring_angle_desc',
        min: 0,
        max: 360,
        step: 5,
        default: 90,
        suffix: '°',
        category: 'keyring'
      },
      {
        id: 'ringRadius',
        type: 'slider',
        label: 'app.ring_radius',
        desc: 'app.ring_radius_desc',
        min: 3,
        max: 15,
        step: 0.5,
        default: 5,
        suffix: 'mm',
        category: 'keyring'
      },
      {
        id: 'ringThickness',
        type: 'slider',
        label: 'app.ring_thickness',
        desc: 'app.ring_thickness_desc',
        min: 1,
        max: 5,
        step: 0.1,
        default: 2,
        suffix: 'mm',
        category: 'keyring'
      },
      {
        id: 'colorBase',
        type: 'select',
        label: 'app.color_base',
        desc: 'app.color_base_desc',
        options: this.plaColors,
        default: '#1a1a1a',
        category: 'colors'
      },
      {
        id: 'colorTop',
        type: 'select',
        label: 'app.color_top',
        desc: 'app.color_top_desc',
        options: this.plaColors,
        default: '#ffffff',
        category: 'colors'
      }
    ];

    return schema;
  }

  async loadFontCSS(family) {
    const id = `gfont-${family.replace(/\s+/g, '-')}`;
    if (document.getElementById(id)) {
      try {
        await document.fonts.load(`150px '${family}'`);
      } catch(e) {}
      return;
    }

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, '+')}&display=swap`;
    document.head.appendChild(link);

    // Wait for browser to process the stylesheet and load the font
    try {
      await document.fonts.load(`150px '${family}'`);
    } catch(e) {
      console.warn("Font loading timeout or error", e);
    }
  }

  async generateSvgFromTextCanvas(text, family, letterSpacing, lineSpacing) {
    await this.loadFontCSS(family);

    const fontSize = 150;
    const letterSpacingPx = fontSize * ((letterSpacing || 0) / 100);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const lines = text.split('\n');
    ctx.font = `bold ${fontSize}px '${family}'`;
    
    ctx.letterSpacing = `${letterSpacingPx}px`;

    let maxWidth = 0;
    for (const line of lines) {
      const metrics = ctx.measureText(line);
      if (metrics.width > maxWidth) maxWidth = metrics.width;
    }
    
    const textWidth = Math.max(10, Math.ceil(maxWidth) + 60);
    const lineHeight = fontSize * 1.2 + (fontSize * (lineSpacing / 100));
    const textHeight = Math.max(10, Math.ceil(lines.length * lineHeight) + 60);

    canvas.width = textWidth;
    canvas.height = textHeight;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'black';
    ctx.font = `bold ${fontSize}px '${family}'`;
    ctx.letterSpacing = `${letterSpacingPx}px`;
    ctx.textBaseline = 'top';

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 30, 30 + (i * lineHeight));
    }

    return canvas.toDataURL('image/png');
  }

  async generate3DModel(params) {
    const generationId = ++this.generationId;
    const textItems = (params.textContent || 'Master3D')
      .split(',')
      .map(text => text.trim())
      .filter(Boolean);
    const textFont = params.textFont || 'Roboto';
    const letterSpacing = parseFloat(params.letterSpacing) || 0;
    const lineSpacing = parseFloat(params.lineSpacing) || 0;

    const shapesByItem = await Promise.all(textItems.map(async text => {
      const dataUrl = await this.generateSvgFromTextCanvas(text, textFont, letterSpacing, lineSpacing);
      const svgString = await new Promise(resolve => {
        window.ImageTracer.imageToSVG(dataUrl, resolve, {
          ltres: 1,
          qtres: 1,
          pathomit: 8,
          rightangleenhance: true,
          colorsampling: 0,
          numberofcolors: 2,
          mincolorratio: 0,
          colorquantcycles: 3,
          pal: [{r:0,g:0,b:0,a:255}, {r:255,g:255,b:255,a:255}]
        });
      });
      return this.parseSVG(svgString);
    }));

    if (generationId !== this.generationId) return false;
    if (shapesByItem.some(shapes => shapes.length === 0)) return false;

    this.clear();
    this.textSvgShapes = shapesByItem.flat();
    this.currentSvgShapes = this.textSvgShapes;

    if (params.colorBase) this.partMaterials.base.color.set(params.colorBase);
    if (params.colorBase) this.partMaterials.ring.color.set(params.colorBase);
    if (params.colorTop) this.partMaterials.top.color.set(params.colorTop);

    const targetWidth = parseFloat(params.targetWidth) || 50;
    const ringRadius = parseFloat(params.ringRadius) || 5;
    const itemStep = targetWidth + (ringRadius * 2) + 10;
    const firstItemX = -((shapesByItem.length - 1) * itemStep) / 2;

    shapesByItem.forEach((shapes, index) => {
      this.buildKeychain(params, shapes, firstItemX + (index * itemStep), index);
    });

    if (shapesByItem.length > 1) {
      const targetDepth = parseFloat(params.targetDepth) || 50;
      this.svgAspectRatio = ((shapesByItem.length - 1) * itemStep + targetWidth) / targetDepth;
    }

    return true;
  }

  buildKeychain(params, svgShapes, positionX, itemIndex) {
    const keychainGroup = new THREE.Group();
    keychainGroup.name = `Keychain_${itemIndex + 1}`;
    keychainGroup.position.x = positionX;
    this.group.add(keychainGroup);

    const baseHeight = parseFloat(params.baseHeight) || 2.5;
    const stampHeight = parseFloat(params.stampHeight) || 2; // altura acima da base
    const totalHeight = baseHeight + stampHeight;
    const baseOffset = parseFloat(params.baseOffset) ?? 3;
    
    const ringAngle = parseFloat(params.ringAngle) || 0;
    const ringRadius = parseFloat(params.ringRadius) || 5;
    const ringThickness = parseFloat(params.ringThickness) || 2;

    const enableBase = params.enableBase !== false;
    const textPosX = parseFloat(params.textPosX) || 0;
    const textPosY = parseFloat(params.textPosY) || 0;
    const textScale = parseFloat(params.textScale) || 1;

    const tw = parseFloat(params.targetWidth) || 50;
    const td = parseFloat(params.targetDepth) || 50;
    const scale = 1000;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    const extractedShapes = [];

    svgShapes.forEach((svgShape) => {
      const points = svgShape.extractPoints(10);
      
      extractedShapes.push(points);
      
      points.shape.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const svgWidth = maxX - minX;
    const svgHeight = maxY - minY;
    
    this.svgAspectRatio = svgWidth > 0 && svgHeight > 0 ? svgWidth / svgHeight : 1;
    this.svgNaturalWidth = svgWidth;
    this.svgNaturalHeight = svgHeight;
    
    const scaleX = svgWidth > 0 ? tw / svgWidth : 1;
    const scaleY = svgHeight > 0 ? td / svgHeight : 1;
    
    const toClipperPath = (pts) => pts.map(p => ({ 
      X: Math.round((p.x - centerX) * scaleX * scale), 
      Y: Math.round(-(p.y - centerY) * scaleY * scale) 
    }));
    const toThreeVec2 = (pts) => pts.map(p => new THREE.Vector2(p.X / scale, p.Y / scale));

    const allOriginalPaths = [];
    extractedShapes.forEach(points => {
      allOriginalPaths.push(toClipperPath(points.shape));
    });

    // 1. Criar a base sólida (Backing Plate)
    const fullBasePaths = new ClipperLib.Paths();
    if (baseOffset > 0) {
      const coBase = new ClipperLib.ClipperOffset(2, 0.25);
      coBase.AddPaths(allOriginalPaths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
      coBase.Execute(fullBasePaths, baseOffset * scale);
    } else {
      // Se offset for 0, usamos os caminhos originais fundidos
      const cl = new ClipperLib.Clipper();
      cl.AddPaths(allOriginalPaths, ClipperLib.PolyType.ptSubject, true);
      cl.Execute(ClipperLib.ClipType.ctUnion, fullBasePaths, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    }

    const outerShapes = [];
    fullBasePaths.forEach(path => {
      if (ClipperLib.Clipper.Orientation(path)) {
        outerShapes.push({
          shape: new THREE.Shape(toThreeVec2(path)),
          holes: [],
          rawPath: path
        });
      }
    });
    
    fullBasePaths.forEach(path => {
      if (!ClipperLib.Clipper.Orientation(path)) {
        const pt = path[0];
        for (let i = 0; i < outerShapes.length; i++) {
           if (ClipperLib.Clipper.PointInPolygon(pt, outerShapes[i].rawPath) !== 0) {
             outerShapes[i].shape.holes.push(new THREE.Path(toThreeVec2(path)));
             break;
           }
        }
      }
    });
    
    if (enableBase) {
      outerShapes.forEach(os => {
        const baseGeom = new THREE.ExtrudeGeometry(os.shape, { depth: baseHeight, bevelEnabled: false, curveSegments: 12 });
        const baseMesh = new THREE.Mesh(baseGeom, this.partMaterials.base);
        baseMesh.name = 'Base';
        keychainGroup.add(baseMesh);
      });
    }

    // 2. Criar o Desenho/Texto em Relevo (Stamp)
    extractedShapes.forEach((points, index) => {
      const shapePts = toThreeVec2(toClipperPath(points.shape));
      const stampShape = new THREE.Shape(shapePts);
      
      points.holes.forEach(hole => {
        stampShape.holes.push(new THREE.Path(toThreeVec2(toClipperPath(hole))));
      });

      const stampGeom = new THREE.ExtrudeGeometry(stampShape, { depth: totalHeight, bevelEnabled: false, curveSegments: 12 });
      
      const material = this.partMaterials.top;
      const meshName = `Text_${index}`;
      
      const stampMesh = new THREE.Mesh(stampGeom, material);
      stampMesh.name = meshName;
      keychainGroup.add(stampMesh);
    });

    // 3. Adicionar a Argola (Keyring)
    if (fullBasePaths.length > 0) {
      let bestPt = { X: 0, Y: 0 };
      let maxDot = -Infinity;

      // Converter ângulo para radianos (90 graus = topo no canvas Y para baixo, mas no three Y é para cima, vamos ajustar)
      const rad = ringAngle * (Math.PI / 180);
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);

      fullBasePaths.forEach(path => {
        path.forEach(pt => {
          const dot = pt.X * dx + pt.Y * dy;
          if (dot > maxDot) {
            maxDot = dot;
            bestPt = pt;
          }
        });
      });

      const attachX = bestPt.X / scale;
      const attachY = bestPt.Y / scale;

      // Posicionar o centro da argola de forma a sobrepor a base pela espessura, mas sem invadir o furo
      // O raio interno é ringRadius - ringThickness. 
      // Deixamos um extra de 0.2mm de margem de segurança para garantir que o furo fica limpo.
      const overlapDistance = ringThickness - 0.2;
      const rcX = attachX + dx * (ringRadius - overlapDistance);
      const rcY = attachY + dy * (ringRadius - overlapDistance);

      const ringShape = new THREE.Shape();
      ringShape.absarc(rcX, rcY, ringRadius, 0, Math.PI * 2, false);
      const ringHole = new THREE.Path();
      ringHole.absarc(rcX, rcY, ringRadius - ringThickness, 0, Math.PI * 2, true);
      ringShape.holes.push(ringHole);

      const ringGeom = new THREE.ExtrudeGeometry(ringShape, { depth: baseHeight, bevelEnabled: false, curveSegments: 24 });
      const ringMesh = new THREE.Mesh(ringGeom, this.partMaterials.ring);
      ringMesh.name = 'Ring';
      keychainGroup.add(ringMesh);
    }
  }
}
