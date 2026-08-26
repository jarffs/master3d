import * as THREE from 'three';
import ClipperLib from 'clipper-lib';
import { BaseEngine } from './BaseEngine.js';

export class CookieCutterEngine extends BaseEngine {
  constructor(scene) {
    super(scene);
    this.name = 'cookie_cutter';
  }

  getControlSchema() {
    return [
      {
        id: 'height',
        type: 'slider',
        label: 'app.height',
        desc: 'app.height_desc',
        min: 5,
        max: 30,
        step: 1,
        default: 15,
        suffix: 'mm',
        category: 'cut'
      },
      {
        id: 'wallThickness',
        type: 'slider',
        label: 'app.thickness',
        desc: 'app.thickness_desc',
        min: 0.4,
        max: 3,
        step: 0.1,
        default: 1.2,
        suffix: 'mm',
        category: 'cut'
      },
      {
        id: 'baseWidth',
        type: 'slider',
        label: 'app.base',
        desc: 'app.base_desc',
        min: 0,
        max: 10,
        step: 0.5,
        default: 4,
        suffix: 'mm',
        category: 'base'
      },
      {
        id: 'baseHeight',
        type: 'slider',
        label: 'app.base_height',
        desc: 'app.base_height_desc',
        min: 0,
        max: 5,
        step: 0.5,
        default: 1.5,
        suffix: 'mm',
        category: 'base'
      },
      {
        id: 'enableContour',
        type: 'toggle',
        label: 'app.enable_contour',
        desc: 'app.contour_desc',
        default: false,
        category: 'contour'
      },
      {
        id: 'contourOffset',
        type: 'slider',
        label: 'app.contour_offset',
        desc: 'app.contour_offset_desc',
        min: 1,
        max: 20,
        step: 0.5,
        default: 5,
        suffix: 'mm',
        category: 'contour',
        dependsOn: 'enableContour'
      },
      {
        id: 'contourHeight',
        type: 'slider',
        label: 'app.contour_height',
        desc: 'app.contour_height_desc',
        min: 5,
        max: 30,
        step: 1,
        default: 15,
        suffix: 'mm',
        category: 'contour',
        dependsOn: 'enableContour'
      }
    ];
  }

  generate3DModel(params) {
    if (!this.currentSvgShapes || this.currentSvgShapes.length === 0) return false;
    
    this.clear(); // Limpa a geometria anterior da scene

    // Mapeando variáveis com fallback pros valores default se omitidos
    // Quando o contorno está ligado, height passa a ser a altura do desenho (carimbo)
    const height = parseFloat(params.height) || 15;
    const wallThickness = parseFloat(params.wallThickness) || 1.2;
    const baseWidth = parseFloat(params.baseWidth) || 4;
    const baseHeight = parseFloat(params.baseHeight) || 1.5;
    
    // Dimensões X,Y do modelo
    const tw = parseFloat(params.targetWidth) || 80;
    const td = parseFloat(params.targetDepth) || 80;

    const enableContour = params.enableContour === true || params.enableContour === 'true';
    const contourOffset = parseFloat(params.contourOffset) || 5;
    
    // Altura da parede externa do contorno
    const contourHeight = parseFloat(params.contourHeight) || Math.max(baseHeight + 1, height + 3);

    const scale = 1000;

    const extractedShapes = [];
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

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

    if (enableContour && contourOffset > 0) {
      const coContour = new ClipperLib.ClipperOffset(2, 0.25);
      allOriginalPaths.forEach(path => {
        coContour.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
      });
      
      const masterContourPaths = new ClipperLib.Paths();
      coContour.Execute(masterContourPaths, contourOffset * scale);
      
      if (masterContourPaths.length > 0) {
        masterContourPaths.forEach(masterPath => {
          // Cutter Wall
          const outerWallPaths = new ClipperLib.Paths();
          const coWall = new ClipperLib.ClipperOffset(2, 0.25);
          coWall.AddPath(masterPath, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
          coWall.Execute(outerWallPaths, wallThickness * scale);
          
          if (outerWallPaths.length > 0) {
            const outerWallPts = toThreeVec2(outerWallPaths[0]);
            const holePts = toThreeVec2(masterPath);
            
            const wallShape = new THREE.Shape(outerWallPts);
            wallShape.holes.push(new THREE.Path(holePts));
            
            const wallGeom = new THREE.ExtrudeGeometry(wallShape, { depth: contourHeight, bevelEnabled: false, curveSegments: 12 });
            const wallMesh = new THREE.Mesh(wallGeom, this.material);
            this.group.add(wallMesh);
          }
        });
        
        // Solid Backing Plate (connects the contour wall to the stamp)
        if (baseWidth > 0 && baseHeight > 0) {
          const fullBasePaths = new ClipperLib.Paths();
          const coBase = new ClipperLib.ClipperOffset(2, 0.25);
          coBase.AddPaths(masterContourPaths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
          coBase.Execute(fullBasePaths, (wallThickness + baseWidth) * scale);
          
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
            const baseMesh = new THREE.Mesh(baseGeom, this.material);
            this.group.add(baseMesh);
          });
        }
        
        // Stamp (same hollow wall format as standard, but with height since it's the main drawing)
        allOriginalPaths.forEach(originalPath => {
          const outerStampPaths = new ClipperLib.Paths();
          const coStamp = new ClipperLib.ClipperOffset(2, 0.25);
          coStamp.AddPath(originalPath, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
          coStamp.Execute(outerStampPaths, wallThickness * scale);
          
          if (outerStampPaths.length > 0) {
            const outerStampPts = toThreeVec2(outerStampPaths[0]);
            const holePts = toThreeVec2(originalPath);
            
            const stampShape = new THREE.Shape(outerStampPts);
            stampShape.holes.push(new THREE.Path(holePts));
            
            const stampGeom = new THREE.ExtrudeGeometry(stampShape, { depth: height, bevelEnabled: false, curveSegments: 12 });
            const stampMesh = new THREE.Mesh(stampGeom, this.material);
            this.group.add(stampMesh);
          }
        });
      }
    } else {
      // Standard behavior
      allOriginalPaths.forEach(originalPath => {
        const outerWallPaths = new ClipperLib.Paths();
        const coWall = new ClipperLib.ClipperOffset(2, 0.25);
        coWall.AddPath(originalPath, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
        coWall.Execute(outerWallPaths, wallThickness * scale);
        
        const outerBasePaths = new ClipperLib.Paths();
        const coBase = new ClipperLib.ClipperOffset(2, 0.25);
        coBase.AddPath(originalPath, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
        coBase.Execute(outerBasePaths, (wallThickness + baseWidth) * scale);
        
        if (outerWallPaths.length > 0) {
          const outerWallPts = toThreeVec2(outerWallPaths[0]);
          const holePts = toThreeVec2(originalPath);
          
          const wallShape = new THREE.Shape(outerWallPts);
          wallShape.holes.push(new THREE.Path(holePts));
          
          const wallGeom = new THREE.ExtrudeGeometry(wallShape, { depth: height, bevelEnabled: false, curveSegments: 12 });
          const wallMesh = new THREE.Mesh(wallGeom, this.material);
          this.group.add(wallMesh);
        }
        
        if (outerBasePaths.length > 0 && baseWidth > 0 && baseHeight > 0) {
          const outerBasePts = toThreeVec2(outerBasePaths[0]);
          const holePts = toThreeVec2(originalPath);
          
          const baseShape = new THREE.Shape(outerBasePts);
          baseShape.holes.push(new THREE.Path(holePts));
          
          const baseGeom = new THREE.ExtrudeGeometry(baseShape, { depth: baseHeight, bevelEnabled: false, curveSegments: 12 });
          const baseMesh = new THREE.Mesh(baseGeom, this.material);
          this.group.add(baseMesh);
        }
      });
    }

    return true;
  }
}
