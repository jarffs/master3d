import * as THREE from 'three';
import ClipperLib from 'clipper-lib';
import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
import { BaseEngine } from './BaseEngine.js';

export class KeychainEngine extends BaseEngine {
  static MAX_BATCH_ITEMS = 9;

  constructor(scene) {
    super(scene);
    this.name = 'keychain';
    this.evaluator = new Evaluator();
    this.evaluator.useGroups = false;

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
    const schema = [
      {
        id: 'keychainWidth',
        type: 'slider',
        label: 'app.keychain_width',
        desc: 'app.keychain_width_desc',
        min: 10,
        max: 40,
        step: 1,
        default: 25,
        suffix: 'mm',
        category: 'base'
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
        category: 'base'
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
        category: 'text'
      },
      {
        id: 'textThickness',
        type: 'slider',
        label: 'app.text_thickness',
        desc: 'app.text_thickness_desc',
        min: -2,
        max: 3,
        step: 0.1,
        default: 0,
        suffix: 'mm',
        category: 'text'
      },
      {
        id: 'engraved',
        type: 'toggle',
        label: 'app.engraved_text',
        desc: 'app.engraved_text_desc',
        default: false,
        category: 'text'
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
        category: 'base'
      },
      {
        id: 'ringAngle',
        type: 'slider',
        label: 'app.ring_angle',
        desc: 'app.ring_angle_desc',
        min: 0,
        max: 360,
        step: 5,
        default: 180,
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
        category: 'base'
      },
      {
        id: 'colorTop',
        type: 'select',
        label: 'app.color_top',
        desc: 'app.color_top_desc',
        options: this.plaColors,
        default: '#ffffff',
        category: 'text'
      }
    ];

    return schema;
  }

  async generate3DModel(params) {
    if (!this.currentSvgShapes || this.currentSvgShapes.length === 0) return false;

    this.clear();

    if (params.colorBase) this.partMaterials.base.color.set(params.colorBase);
    if (params.colorBase) this.partMaterials.ring.color.set(params.colorBase);
    if (params.colorTop) this.partMaterials.top.color.set(params.colorTop);

    const group = this.buildKeychain(params, this.currentSvgShapes, 0, 1);
    
    const bounds = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    if (size.y > 0) this.svgAspectRatio = size.x / size.y;

    return true;
  }

  buildKeychain(params, svgShapes, itemIndex, lineCount = 1) {
    const keychainGroup = new THREE.Group();
    keychainGroup.name = `Keychain_${itemIndex + 1}`;
    this.group.add(keychainGroup);

    const baseHeight = parseFloat(params.baseHeight) || 2.5;
    const stampHeight = parseFloat(params.stampHeight) || 2; 
    const totalHeight = baseHeight + stampHeight;
    const baseOffset = parseFloat(params.baseOffset) ?? 3;
    const textThickness = parseFloat(params.textThickness) || 0;
    const isEngraved = params.engraved || false;
    
    const ringAngle = parseFloat(params.ringAngle) || 0;
    const ringRadius = parseFloat(params.ringRadius) || 5;
    const ringThickness = parseFloat(params.ringThickness) || 2;

    const keychainWidth = parseFloat(params.keychainWidth) || 25;
    const td = Math.max(2, keychainWidth - (baseOffset * 2));
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
    
    const scaleY = svgHeight > 0 ? td / svgHeight : 1;
    const scaleX = scaleY;
    
    const toClipperPath = (pts) => pts.map(p => ({ 
      X: Math.round((p.x - centerX) * scaleX * scale), 
      Y: Math.round(-(p.y - centerY) * scaleY * scale) 
    }));
    const toThreeVec2 = (pts) => pts.map(p => new THREE.Vector2(p.X / scale, p.Y / scale));

    const solutionToShapes = (solutionPaths) => {
      const cleanShapes = [];
      solutionPaths.forEach(path => {
        if (ClipperLib.Clipper.Orientation(path)) {
          const shape = new THREE.Shape(toThreeVec2(path));
          shape.closePath();
          cleanShapes.push({ shape: shape, rawPath: path });
        }
      });
      solutionPaths.forEach(path => {
        if (!ClipperLib.Clipper.Orientation(path)) {
          const pt = path[0];
          for (let i = 0; i < cleanShapes.length; i++) {
            if (ClipperLib.Clipper.PointInPolygon(pt, cleanShapes[i].rawPath) !== 0) {
              const holePath = new THREE.Path(toThreeVec2(path));
              holePath.closePath();
              cleanShapes[i].shape.holes.push(holePath);
              break;
            }
          }
        }
      });
      return cleanShapes.map(cs => cs.shape);
    };

    const allOriginalPaths = [];
    extractedShapes.forEach(points => {
      allOriginalPaths.push(toClipperPath(points.shape));
    });

    // 1. Criar a base sólida (Backing Plate) usando ClipperOffset
    let fullBasePaths = new ClipperLib.Paths();
    if (baseOffset > 0) {
      const coBase = new ClipperLib.ClipperOffset(2, 0.25);
      coBase.AddPaths(allOriginalPaths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
      coBase.Execute(fullBasePaths, baseOffset * scale);
    } else {
      const cl = new ClipperLib.Clipper();
      cl.AddPaths(allOriginalPaths, ClipperLib.PolyType.ptSubject, true);
      cl.Execute(ClipperLib.ClipType.ctUnion, fullBasePaths, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    }

    if (fullBasePaths.length > 0) {
      const closeRadius = (td / Math.max(1, lineCount)) * 0.25 * scale;
      const arcTolerance = 0.05 * scale;
      const dilatedPaths = new ClipperLib.Paths();
      const coDilate = new ClipperLib.ClipperOffset(2, arcTolerance);
      coDilate.AddPaths(fullBasePaths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
      coDilate.Execute(dilatedPaths, closeRadius);

      const closedPaths = new ClipperLib.Paths();
      const coErode = new ClipperLib.ClipperOffset(2, arcTolerance);
      coErode.AddPaths(dilatedPaths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
      coErode.Execute(closedPaths, -closeRadius);

      if (closedPaths.length > 0) fullBasePaths = closedPaths;
    }

    // 2. Construir Shapes do Texto (com controlo de espessura)
    let stampShapes = [];
    if (textThickness !== 0) {
      const textPathsForOffset = new ClipperLib.Paths();
      extractedShapes.forEach(points => {
        textPathsForOffset.push(toClipperPath(points.shape));
        points.holes.forEach(hole => textPathsForOffset.push(toClipperPath(hole)));
      });
      
      const coText = new ClipperLib.ClipperOffset(2, 0.25);
      coText.AddPaths(textPathsForOffset, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
      
      const offsetSolution = new ClipperLib.Paths();
      coText.Execute(offsetSolution, textThickness * scale);
      
      stampShapes = solutionToShapes(offsetSolution);
    } else {
      extractedShapes.forEach((points) => {
        const shapePts = toThreeVec2(toClipperPath(points.shape));
        const stampShape = new THREE.Shape(shapePts);
        points.holes.forEach(hole => {
          stampShape.holes.push(new THREE.Path(toThreeVec2(toClipperPath(hole))));
        });
        stampShapes.push(stampShape);
      });
    }

    // 3. CSG: Combinar Base e Texto
    let baseBrush = null;
    fullBasePaths
      .filter(path => ClipperLib.Clipper.Orientation(path))
      .forEach(path => {
        const baseShape = new THREE.Shape(toThreeVec2(path));
        const baseGeom = new THREE.ExtrudeGeometry(baseShape, { depth: baseHeight, bevelEnabled: false, curveSegments: 12 });
        baseGeom.clearGroups();
        const brush = new Brush(baseGeom, this.partMaterials.base);
        brush.updateMatrixWorld();
        if (!baseBrush) baseBrush = brush;
        else baseBrush = this.evaluator.evaluate(baseBrush, brush, ADDITION);
      });

    let textBrush = null;
    if (stampShapes.length > 0) {
      stampShapes.forEach(shape => {
        const stampGeom = new THREE.ExtrudeGeometry(shape, { depth: stampHeight, bevelEnabled: false, curveSegments: 12 });
        stampGeom.clearGroups();
        
        if (isEngraved) {
          stampGeom.translate(0, 0, baseHeight - stampHeight);
        } else {
          stampGeom.translate(0, 0, baseHeight);
        }
        
        const brush = new Brush(stampGeom, this.partMaterials.top);
        brush.updateMatrixWorld();
        if (!textBrush) textBrush = brush;
        else textBrush = this.evaluator.evaluate(textBrush, brush, ADDITION);
      });
    }

    if (baseBrush && textBrush) {
      if (isEngraved) {
        // Texto embutido (corta a base e adiciona o texto no buraco para multi-color inlay)
        baseBrush = this.evaluator.evaluate(baseBrush, textBrush, SUBTRACTION);
        const finalBaseMesh = new THREE.Mesh(baseBrush.geometry, this.partMaterials.base);
        finalBaseMesh.name = 'Base';
        keychainGroup.add(finalBaseMesh);
        
        // Adicionar o texto no mesmo sítio para preencher o buraco (flush with surface)
        const textMesh = new THREE.Mesh(textBrush.geometry, this.partMaterials.top);
        textMesh.name = 'Text';
        keychainGroup.add(textMesh);
      } else {
        // Texto em alto relevo
        const baseMesh = new THREE.Mesh(baseBrush.geometry, this.partMaterials.base);
        baseMesh.name = 'Base';
        keychainGroup.add(baseMesh);
        
        const textMesh = new THREE.Mesh(textBrush.geometry, this.partMaterials.top);
        textMesh.name = 'Text';
        keychainGroup.add(textMesh);
      }
    } else if (baseBrush) {
      const baseMesh = new THREE.Mesh(baseBrush.geometry, this.partMaterials.base);
      baseMesh.name = 'Base';
      keychainGroup.add(baseMesh);
    }

    // 4. Adicionar a Argola (Keyring)
    if (fullBasePaths.length > 0) {
      let bestPt = { X: 0, Y: 0 };
      let maxDot = -Infinity;

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

    return keychainGroup;
  }
}
