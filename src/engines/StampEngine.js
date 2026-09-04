import * as THREE from 'three';
import ClipperLib from 'clipper-lib';
import { BaseEngine } from './BaseEngine.js';
import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';

export class StampEngine extends BaseEngine {
  constructor(scene) {
    super(scene);
    this.name = 'stamp';
    this.evaluator = new Evaluator();
    this.evaluator.useGroups = false;
    
    this.plaColors = [
      { value: '#ffffff', label: 'app.color_white' },
      { value: '#1a1a1a', label: 'app.color_black' },
      { value: '#dc2626', label: 'app.color_red' },
      { value: '#2563eb', label: 'app.color_blue' },
      { value: '#eab308', label: 'app.color_yellow' },
      { value: '#16a34a', label: 'app.color_green' },
      { value: '#f97316', label: 'app.color_orange' }
    ];
    
    this.partMaterials = {
      base: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.3, metalness: 0.4, side: THREE.DoubleSide }),
      top: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide })
    };
  }

  getControlSchema() {
    return [
      {
        id: 'stampSize',
        type: 'slider',
        label: 'app.stamp_size',
        desc: 'app.stamp_size_desc',
        min: 20,
        max: 150,
        step: 1,
        default: 20,
        suffix: 'mm',
        category: 'stamp_design'
      },
      {
        id: 'extrusion',
        type: 'slider',
        label: 'app.stamp_extrusion',
        desc: 'app.stamp_extrusion_desc',
        min: 1,
        max: 10,
        step: 0.1,
        default: 2,
        category: 'stamp_design'
      },
      {
        id: 'mirror',
        type: 'checkbox',
        label: 'app.stamp_mirror',
        desc: 'app.stamp_mirror_desc',
        default: true,
        category: 'stamp_design'
      },
      {
        id: 'handleHeight',
        type: 'slider',
        label: 'app.stamp_handle_height',
        desc: 'app.stamp_handle_height_desc',
        min: 20,
        max: 100,
        step: 1,
        default: 40,
        suffix: 'mm',
        category: 'stamp_body'
      },
      {
        id: 'topDiameter',
        type: 'slider',
        label: 'app.stamp_top_diameter',
        desc: 'app.stamp_top_diameter_desc',
        min: 10,
        max: 60,
        step: 0.5,
        default: 25,
        suffix: 'mm',
        category: 'stamp_body'
      },
      {
        id: 'handleDiameter',
        type: 'slider',
        label: 'app.stamp_handle_diameter',
        desc: 'app.stamp_handle_diameter_desc',
        min: 5,
        max: 30,
        step: 0.5,
        default: 16,
        suffix: 'mm',
        category: 'stamp_body'
      },
      {
        id: 'baseThickness',
        type: 'slider',
        label: 'app.stamp_base_thickness',
        desc: 'app.stamp_base_thickness_desc',
        min: 2,
        max: 10,
        step: 0.5,
        default: 4,
        suffix: 'mm',
        category: 'stamp_body'
      },
      {
        id: 'colorBase',
        type: 'select',
        label: 'app.color_base',
        desc: 'app.color_base_desc',
        options: this.plaColors,
        default: '#2563eb', // Blue
        category: 'stamp_body'
      },
      {
        id: 'colorTop',
        type: 'select',
        label: 'app.color_top',
        desc: 'app.color_top_desc',
        options: this.plaColors,
        default: '#ffffff', // White
        category: 'stamp_design'
      }
    ];
  }

  generate3DModel(params) {
    if (!this.currentSvgShapes || this.currentSvgShapes.length === 0) return false;
    
    if (params.colorBase) this.partMaterials.base.color.set(params.colorBase);
    if (params.colorTop) this.partMaterials.top.color.set(params.colorTop);
    
    const scale = 1000;
    const clipper = new ClipperLib.Clipper();
    clipper.StrictlySimple = true;

    // 1. Process shapes and mirror X for stamping
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    // First find original bounds to calculate mirror and scale
    this.currentSvgShapes.forEach(shape => {
      const pts = shape.extractPoints(10);
      pts.shape.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });

    const origWidth = maxX - minX;
    const origHeight = maxY - minY;
    const maxDim = Math.max(origWidth, origHeight);
    
    // Calculate uniform scale to reach target stampSize (in mm)
    const targetScale = params.stampSize / maxDim;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Calcular o raio máximo a partir do centro para garantir que a base circular cobre tudo
    let maxDistSq = 0;
    this.currentSvgShapes.forEach(shape => {
      const pts = shape.extractPoints(10);
      pts.shape.forEach(p => {
        const dx = p.x - centerX;
        const dy = p.y - centerY;
        const distSq = dx*dx + dy*dy;
        if (distSq > maxDistSq) maxDistSq = distSq;
      });
    });
    const maxRadiusOrig = Math.sqrt(maxDistSq);
    const maxRadiusScaled = maxRadiusOrig * targetScale;

    const mirroredShapes = [];
    
    this.currentSvgShapes.forEach(shape => {
      const pts = shape.extractPoints(5);
      
      // Mirror X, center, apply targetScale, and invert Y for 3D coordinate system
      const processPoint = (p) => {
        let cx = p.x - centerX;
        let cy = p.y - centerY;
        
        if (params.mirror !== false) {
          cx = -cx; // Mirror X
        }
        
        cx *= targetScale;
        cy *= -targetScale; 
        
        return new THREE.Vector2(cx, cy);
      };

      const mirroredShape = new THREE.Shape(pts.shape.map(processPoint));
      if (pts.holes) {
        pts.holes.forEach(hole => {
          mirroredShape.holes.push(new THREE.Path(hole.map(processPoint)));
        });
      }
      mirroredShapes.push(mirroredShape);
    });

    // A base agora é sempre circular, combinando com o design do sinete.
    // O texto já está centralizado em (0,0).
    this.group.clear();

    // -- STAMP MESH --
    const baseThick = params.baseThickness;
    const extThick = params.extrusion;
    const holeRadius = 6; // 12mm diameter hole
    const holeDepth = Math.max(1, baseThick - 1); // leave 1mm solid above hole
    
    // O raio da base é o raio máximo da textura + 1mm de margem (ou seja, diâmetro 2mm maior)
    const baseR = maxRadiusScaled + 1;

    // Create Base geometry (Cylinder)
    const baseGeom = new THREE.CylinderGeometry(baseR, baseR, baseThick, 64);
    baseGeom.rotateX(Math.PI / 2); // aligns with Z
    baseGeom.translate(0, 0, baseThick / 2); // ExtrudeGeometry was 0 to baseThick
    baseGeom.clearGroups();
    
    let baseBrush = new Brush(baseGeom, this.partMaterials.base);
    baseBrush.updateMatrixWorld();

    // Create the Female Hole (Subtracted from the BOTTOM of the base)
    const holeGeom = new THREE.CylinderGeometry(holeRadius, holeRadius, holeDepth, 32);
    holeGeom.rotateX(Math.PI / 2); // align with Z axis
    holeGeom.translate(0, 0, holeDepth / 2); // move up so it cuts from bottom
    holeGeom.clearGroups();
    const holeBrush = new Brush(holeGeom, this.partMaterials.base);
    holeBrush.updateMatrixWorld();

    baseBrush = this.evaluator.evaluate(baseBrush, holeBrush, SUBTRACTION);

    // Create the Extruded Text (Stamp details)
    let textBrush = null;
    mirroredShapes.forEach(shape => {
      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: extThick,
        bevelEnabled: false,
        curveSegments: 1
      });
      geom.clearGroups();
      geom.translate(0, 0, baseThick); // Sit on top of the base
      const brush = new Brush(geom, this.partMaterials.top);
      brush.updateMatrixWorld();
      if (!textBrush) textBrush = brush;
      else textBrush = this.evaluator.evaluate(textBrush, brush, ADDITION);
    });

    const stampGroup = new THREE.Group();
    const baseMesh = new THREE.Mesh(baseBrush.geometry, this.partMaterials.base);
    stampGroup.add(baseMesh);
    
    if (textBrush) {
      const textMesh = new THREE.Mesh(textBrush.geometry, this.partMaterials.top);
      stampGroup.add(textMesh);
    }
    
    // -- HANDLE MESH (Design Ergonómico de Sinete Clássico) --
    const handleHeight = params.handleHeight !== undefined ? params.handleHeight : 60;
    const handleR = (params.handleDiameter !== undefined ? params.handleDiameter : 16) / 2;
    const topR = (params.topDiameter !== undefined ? params.topDiameter : 34) / 2;

    // O cabo não começa com a largura total do carimbo. 
    // Tem um diâmetro base próprio para colar no latão (max 26mm diâmetro)
    const handleBottomR = Math.min(baseR * 0.75, 13); 
    
    // Para a cúpula ser perfeitamente redonda, a sua altura (percentagem) tem de corresponder ao seu raio
    const domeRatio = Math.min(0.4, topR / handleHeight);
    const bulbRatio = 1 - domeRatio;
    const neckRatio = Math.max(0.20, 0.45 * bulbRatio); // O pescoço termina um pouco antes do bolbo

    const smoothPoints = [];
    smoothPoints.push(new THREE.Vector2(0, 0));
    
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const y = t * handleHeight;
      let r;
      
      if (t < 0.10) {
        // Curva de sino na base do plástico
        const nt = t / 0.10;
        const ease = 1 - Math.pow(1 - nt, 3); // Deceleração forte
        r = handleBottomR - (handleBottomR - (handleR + 1.5)) * ease;
      } else if (t < neckRatio) {
        // Pescoço fino e longo (taper muito suave)
        const nt = (t - 0.10) / (neckRatio - 0.10);
        const startR = handleR + 1.5;
        r = startR - (startR - handleR) * nt;
      } else if (t < bulbRatio) {
        // Bolbo (formato pêra alto)
        const nt = (t - neckRatio) / (bulbRatio - neckRatio);
        const ease = -(Math.cos(Math.PI * nt) - 1) / 2; // Smooth step
        r = handleR + (topR - handleR) * ease;
      } else {
        // Cúpula do topo perfeitamente esférica
        const nt = (t - bulbRatio) / domeRatio;
        r = topR * Math.sqrt(1 - Math.pow(nt, 2)); // Hemisfério perfeito
      }
      
      smoothPoints.push(new THREE.Vector2(Math.max(0, r), y));
    }
    
    if (smoothPoints[smoothPoints.length - 1].x > 0.01) {
      smoothPoints.push(new THREE.Vector2(0, handleHeight));
    }

    const handleGeom = new THREE.LatheGeometry(smoothPoints, 48);
    handleGeom.rotateX(Math.PI / 2); // Alinha com o eixo Z (Fica de pé)
    handleGeom.clearGroups();
    
    const handleBaseBrush = new Brush(handleGeom, this.partMaterials.base);
    handleBaseBrush.updateMatrixWorld();
    
    // Subtrair o mesmo furo na base do suporte
    const finalHandleBrush = this.evaluator.evaluate(handleBaseBrush, holeBrush, SUBTRACTION);
    const handleMesh = new THREE.Mesh(finalHandleBrush.geometry, this.partMaterials.base);

    // -- PIN MESH (Pino separado de encaixe duplo) --
    const tolerance = 0.3;
    const pinRadius = holeRadius - tolerance;
    const pinDepth = (holeDepth * 2) - tolerance; // Altura para entrar nos dois lados

    const pinGeom = new THREE.CylinderGeometry(pinRadius, pinRadius, pinDepth, 32);
    pinGeom.rotateX(Math.PI / 2);
    pinGeom.translate(0, 0, pinDepth / 2);
    pinGeom.clearGroups();
    const pinMesh = new THREE.Mesh(pinGeom, this.partMaterials.base);

    // -- POSITIONING --
    baseMesh.geometry.computeBoundingBox();
    const stampBbox = baseMesh.geometry.boundingBox;
    const stampWidth = stampBbox.max.x - stampBbox.min.x;
    
    const gap = 15; // 15mm gap between parts to ensure no overlap

    // Carimbo na esquerda
    stampGroup.position.x = 0;
    
    // Suporte no meio
    handleMesh.position.x = (stampWidth / 2) + gap + baseR;

    // Pino na direita
    pinMesh.position.x = handleMesh.position.x + baseR + gap + pinRadius;

    this.group.add(stampGroup);
    this.group.add(handleMesh);
    this.group.add(pinMesh);
    
    this.centerGroup();
    return true;
  }
}
