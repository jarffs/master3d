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
        default: 50,
        suffix: 'mm',
        category: 'primary'
      },
      {
        id: 'extrusion',
        type: 'slider',
        label: 'app.stamp_extrusion',
        desc: 'app.stamp_extrusion_desc',
        min: 1,
        max: 10,
        step: 0.5,
        default: 3,
        suffix: 'mm',
        category: 'primary'
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
        category: 'primary'
      }
    ];
  }

  generate3DModel(params) {
    if (!this.currentSvgShapes || this.currentSvgShapes.length === 0) return false;
    
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

    const mirroredShapes = [];
    
    this.currentSvgShapes.forEach(shape => {
      const pts = shape.extractPoints(5);
      
      // Mirror X, center, apply targetScale, and invert Y for 3D coordinate system
      const processPoint = (p) => {
        let cx = p.x - centerX;
        let cy = p.y - centerY;
        
        cx = -cx; // Mirror X
        
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

    // 2. Generate Base Plate (Offset of mirrored shapes)
    const offsetClipper = new ClipperLib.ClipperOffset();
    
    mirroredShapes.forEach(shape => {
      const extracted = shape.extractPoints(5);
      const toClipperPath = (pts) => pts.map(p => ({ X: Math.round(p.x * scale), Y: Math.round(p.y * scale) }));
      
      const clipperPath = toClipperPath(extracted.shape);
      if (ClipperLib.Clipper.Orientation(clipperPath)) {
        offsetClipper.AddPath(clipperPath, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
      } else {
        clipperPath.reverse();
        offsetClipper.AddPath(clipperPath, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
      }
    });

    const offsetSolution = new ClipperLib.Paths();
    // Base plate offset (padding around the text)
    const padding = 5; 
    offsetClipper.Execute(offsetSolution, padding * scale);

    if (offsetSolution.length === 0) {
      console.error("Offset falhou, revertendo para bounding box");
      return false;
    }

    const baseShapes = [];
    const toThreeVec2 = (pts) => pts.map(p => new THREE.Vector2(p.X / scale, p.Y / scale));

    solutionToShapes(offsetSolution).forEach(shape => baseShapes.push(shape));

    function solutionToShapes(solutionPaths) {
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
    }

    this.group.clear();

    // -- STAMP MESH --
    const baseThick = params.baseThickness;
    const extThick = params.extrusion;
    const holeRadius = 6; // 12mm diameter hole
    const holeDepth = Math.max(1, baseThick - 1); // leave 1mm solid above hole

    // Create Base geometry
    let baseBrush = null;
    baseShapes.forEach(shape => {
      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: baseThick,
        bevelEnabled: false,
        curveSegments: 1
      });
      geom.clearGroups();
      const brush = new Brush(geom, this.material);
      brush.updateMatrixWorld();
      if (!baseBrush) baseBrush = brush;
      else baseBrush = this.evaluator.evaluate(baseBrush, brush, ADDITION);
    });

    // Create the Female Hole (Subtracted from the BOTTOM of the base)
    const holeGeom = new THREE.CylinderGeometry(holeRadius, holeRadius, holeDepth, 32);
    holeGeom.rotateX(Math.PI / 2); // align with Z axis
    holeGeom.translate(0, 0, holeDepth / 2); // move up so it cuts from bottom
    holeGeom.clearGroups();
    const holeBrush = new Brush(holeGeom, this.material);
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
      const brush = new Brush(geom, this.material);
      brush.updateMatrixWorld();
      if (!textBrush) textBrush = brush;
      else textBrush = this.evaluator.evaluate(textBrush, brush, ADDITION);
    });

    const finalStampBrush = this.evaluator.evaluate(baseBrush, textBrush, ADDITION);
    const stampMesh = new THREE.Mesh(finalStampBrush.geometry, this.material);
    
    // -- HANDLE MESH (Design Ergonómico) --
    const handleHeight = 45;
    const smoothPoints = [];
    smoothPoints.push(new THREE.Vector2(0, 0));
    
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const y = t * handleHeight;
      let r;
      if (t < 0.1) {
        // Base flat edge & slight taper (16 to 14)
        const nt = t / 0.1;
        r = 16 - 2 * nt;
      } else if (t < 0.5) {
        // Neck taper (14 to 8)
        const nt = (t - 0.1) / 0.4;
        const easeInOut = nt < 0.5 ? 2 * nt * nt : 1 - Math.pow(-2 * nt + 2, 2) / 2;
        r = 14 - 6 * easeInOut;
      } else if (t < 0.8) {
        // Bulb swell (8 to 18)
        const nt = (t - 0.5) / 0.3;
        const easeOut = Math.sin(nt * Math.PI / 2);
        r = 8 + 10 * easeOut;
      } else {
        // Bulb top curve (18 to 0)
        const nt = (t - 0.8) / 0.2;
        r = 18 * Math.cos(nt * Math.PI / 2);
      }
      smoothPoints.push(new THREE.Vector2(Math.max(0, r), y));
    }
    
    if (smoothPoints[smoothPoints.length - 1].x > 0.01) {
      smoothPoints.push(new THREE.Vector2(0, handleHeight));
    }

    const handleGeom = new THREE.LatheGeometry(smoothPoints, 48);
    handleGeom.rotateX(Math.PI / 2); // Alinha com o eixo Z (Fica de pé)
    handleGeom.clearGroups();
    
    const handleBaseBrush = new Brush(handleGeom, this.material);
    handleBaseBrush.updateMatrixWorld();
    
    // Subtrair o mesmo furo na base do suporte
    const finalHandleBrush = this.evaluator.evaluate(handleBaseBrush, holeBrush, SUBTRACTION);
    const handleMesh = new THREE.Mesh(finalHandleBrush.geometry, this.material);

    // -- PIN MESH (Pino separado de encaixe duplo) --
    const tolerance = 0.3;
    const pinRadius = holeRadius - tolerance;
    const pinDepth = (holeDepth * 2) - tolerance; // Altura para entrar nos dois lados

    const pinGeom = new THREE.CylinderGeometry(pinRadius, pinRadius, pinDepth, 32);
    pinGeom.rotateX(Math.PI / 2);
    pinGeom.translate(0, 0, pinDepth / 2);
    pinGeom.clearGroups();
    const pinMesh = new THREE.Mesh(pinGeom, this.material);

    // -- POSITIONING --
    stampMesh.geometry.computeBoundingBox();
    const stampBbox = stampMesh.geometry.boundingBox;
    const stampWidth = stampBbox.max.x - stampBbox.min.x;
    
    // Carimbo na esquerda
    stampMesh.position.x = - (stampWidth / 2) - 10;
    
    // Suporte no meio
    handleMesh.position.x = 20;

    // Pino na direita
    pinMesh.position.x = 20 + 20 + 10;

    this.group.add(stampMesh);
    this.group.add(handleMesh);
    this.group.add(pinMesh);
    
    this.centerGroup();
    return true;
  }
}
