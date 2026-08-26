import * as THREE from 'three';
import ClipperLib from 'clipper-lib';
import { BaseEngine } from './BaseEngine.js';

export class KeychainEngine extends BaseEngine {
  constructor(scene) {
    super(scene);
    this.name = 'keychain';
    
    this.imageSvgShapes = [];
    this.textSvgShapes = [];
    
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
      image: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide })
    };
    this.textMaterials = []; // One per letter
  }

  loadSVG(svgText) {
    // Default behavior is to load as image
    this.loadImageSVG(svgText);
  }

  loadImageSVG(svgText) {
    this.imageSvgShapes = this.parseSVG(svgText);
    this.currentSvgShapes = [...this.imageSvgShapes, ...this.textSvgShapes];
  }

  loadTextSVG(svgText) {
    this.textSvgShapes = this.parseSVG(svgText);
    this.currentSvgShapes = [...this.imageSvgShapes, ...this.textSvgShapes];
    
    // Ensure we have enough materials for each letter
    while (this.textMaterials.length < this.textSvgShapes.length) {
      this.textMaterials.push(
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide })
      );
    }
  }

  getControlSchema() {
    return [
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
        label: 'Cor da Base',
        desc: 'Cor da placa principal',
        options: this.plaColors,
        default: '#1a1a1a',
        category: 'colors'
      },
      {
        id: 'colorImage',
        type: 'select',
        label: 'Cor da Imagem',
        desc: 'Cor do desenho base',
        options: this.plaColors,
        default: '#ffffff',
        category: 'colors'
      },
      {
        id: 'colorRing',
        type: 'select',
        label: 'Cor da Argola',
        desc: 'Cor da argola',
        options: this.plaColors,
        default: '#1a1a1a',
        category: 'colors'
      }
    ];

    // Add color pickers for each text letter
    this.textSvgShapes.forEach((shape, index) => {
      schema.push({
        id: `colorText${index}`,
        type: 'select',
        label: `Cor Letra ${index + 1}`,
        desc: `Cor do elemento de texto ${index + 1}`,
        options: this.plaColors,
        default: '#ffffff',
        category: 'colors'
      });
    });

    return schema;
  }

  generate3DModel(params) {
    if (!this.currentSvgShapes || this.currentSvgShapes.length === 0) return false;
    
    this.clear(); // Limpa a geometria anterior

    // Update material colors from params
    if (params.colorBase) this.partMaterials.base.color.set(params.colorBase);
    if (params.colorRing) this.partMaterials.ring.color.set(params.colorRing);
    if (params.colorImage) this.partMaterials.image.color.set(params.colorImage);
    
    this.textMaterials.forEach((mat, index) => {
      const colorParam = params[`colorText${index}`];
      if (colorParam) mat.color.set(colorParam);
    });

    const baseHeight = parseFloat(params.baseHeight) || 2.5;
    const stampHeight = parseFloat(params.stampHeight) || 2; // altura acima da base
    const totalHeight = baseHeight + stampHeight;
    const baseOffset = parseFloat(params.baseOffset) ?? 3;
    
    const ringAngle = parseFloat(params.ringAngle) || 0;
    const ringRadius = parseFloat(params.ringRadius) || 5;
    const ringThickness = parseFloat(params.ringThickness) || 2;

    const tw = parseFloat(params.targetWidth) || 50;
    const td = parseFloat(params.targetDepth) || 50;
    const scale = 1000;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    const extractedShapes = [];

    this.currentSvgShapes.forEach(svgShape => {
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
    
    outerShapes.forEach(os => {
      const baseGeom = new THREE.ExtrudeGeometry(os.shape, { depth: baseHeight, bevelEnabled: false, curveSegments: 12 });
      const baseMesh = new THREE.Mesh(baseGeom, this.partMaterials.base);
      baseMesh.name = 'Base';
      this.group.add(baseMesh);
    });

    // 2. Criar o Desenho/Texto em Relevo (Stamp)
    // First, process image SVG shapes
    const imageShapesCount = this.imageSvgShapes.length;
    extractedShapes.forEach((points, index) => {
      const shapePts = toThreeVec2(points.shape);
      const stampShape = new THREE.Shape(shapePts);
      
      points.holes.forEach(hole => {
        stampShape.holes.push(new THREE.Path(toThreeVec2(hole)));
      });

      const stampGeom = new THREE.ExtrudeGeometry(stampShape, { depth: totalHeight, bevelEnabled: false, curveSegments: 12 });
      
      let material;
      let meshName;
      if (index < imageShapesCount) {
        material = this.partMaterials.image;
        meshName = `Image_${index}`;
      } else {
        const textIndex = index - imageShapesCount;
        material = this.textMaterials[textIndex];
        meshName = `Text_${textIndex}`;
      }
      
      const stampMesh = new THREE.Mesh(stampGeom, material);
      stampMesh.name = meshName;
      this.group.add(stampMesh);
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
      this.group.add(ringMesh);
    }

    return true;
  }
}
