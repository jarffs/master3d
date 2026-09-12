import * as THREE from 'three';
import ClipperLib from 'clipper-lib';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { BaseEngine } from './BaseEngine.js';

export class BrigadeiroEjectorEngine extends BaseEngine {
  constructor(scene) {
    super(scene);
    this.name = 'brigadeiro_ejector';
  }

  getControlSchema() {
    return [
      {
        id: 'cutterHeight',
        type: 'slider',
        label: 'app.cutter_height',
        desc: 'app.cutter_height_desc',
        min: 15,
        max: 50,
        step: 1,
        default: 25,
        suffix: 'mm',
        category: 'cutter'
      },
      {
        id: 'wallThickness',
        type: 'slider',
        label: 'app.thickness',
        desc: 'app.thickness_desc',
        min: 0.8,
        max: 3,
        step: 0.1,
        default: 0.8,
        suffix: 'mm',
        category: 'cutter'
      },
      {
        id: 'baseWidth',
        type: 'slider',
        label: 'app.base',
        desc: 'app.base_desc',
        min: 0,
        max: 10,
        step: 0.5,
        default: 1.5,
        suffix: 'mm',
        category: 'cutter'
      },
      {
        id: 'baseHeight',
        type: 'slider',
        label: 'app.base_height',
        desc: 'app.base_height_desc',
        min: 0,
        max: 5,
        step: 0.5,
        default: 2.5,
        suffix: 'mm',
        category: 'cutter'
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
        suffix: 'mm',
        category: 'stamp'
      },
      {
        id: 'tolerance',
        type: 'slider',
        label: 'app.tolerance',
        desc: 'app.tolerance_desc',
        min: 0.1,
        max: 1.0,
        step: 0.1,
        default: 0.3,
        suffix: 'mm',
        category: 'stamp'
      },
      {
        id: 'mirror',
        type: 'checkbox',
        label: 'app.stamp_mirror',
        desc: 'app.stamp_mirror_desc',
        default: true,
        category: 'stamp'
      }
    ];
  }

  generate3DModel(params) {
    if (!this.currentSvgShapes || this.currentSvgShapes.length === 0) return false;
    
    this.clear(); // Limpa a geometria anterior da scene

    const cutterHeight = parseFloat(params.cutterHeight) || 25;
    const wallThickness = parseFloat(params.wallThickness) || 1.6;
    const baseWidth = parseFloat(params.baseWidth) || 4;
    const baseHeight = parseFloat(params.baseHeight) || 1.5;
    const extrusion = parseFloat(params.extrusion) || 2;
    const tolerance = parseFloat(params.tolerance) || 0.3;
    const mirror = params.mirror !== false;
    
    const stampBaseHeight = Math.max(1, cutterHeight - extrusion);
    
    const scale = 1000;
    
    const extractedShapes = [];
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    this.currentSvgShapes.forEach(svgShape => {
      const points = this.extractShapePoints(svgShape);
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
    
    const tw = parseFloat(params.targetWidth) || svgWidth || 40;
    const td = parseFloat(params.targetDepth) || svgHeight || 40;
    
    const scaleX = svgWidth > 0 ? tw / svgWidth : 1;
    const scaleY = svgHeight > 0 ? td / svgHeight : 1;
    
    const toClipperPath = (pts, invertX = false) => pts.map(p => {
      let x = (p.x - centerX) * scaleX;
      let y = -(p.y - centerY) * scaleY;
      if (invertX) x = -x;
      return { X: Math.round(x * scale), Y: Math.round(y * scale) };
    });
    
    const toThreeVec2 = (pts) => pts.map(p => new THREE.Vector2(p.X / scale, p.Y / scale));

    const allOriginalPaths = [];
    const mirroredOriginalPaths = [];
    
    extractedShapes.forEach(points => {
      allOriginalPaths.push(toClipperPath(points.shape, false));
      mirroredOriginalPaths.push(toClipperPath(points.shape, mirror));
    });

    // Extract Silhouette (outer boundary only)
    const coSilhouette = new ClipperLib.ClipperOffset(2, 0.25);
    allOriginalPaths.forEach(path => {
      coSilhouette.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    });
    const masterPaths = new ClipperLib.Paths();
    coSilhouette.Execute(masterPaths, 0.1 * scale); // small offset to union
    
    let isOuterOrientation = true;
    if (masterPaths.length > 0) {
      const largestAreaPath = masterPaths.reduce((prev, current) => (Math.abs(ClipperLib.Clipper.Area(current)) > Math.abs(ClipperLib.Clipper.Area(prev)) ? current : prev));
      isOuterOrientation = ClipperLib.Clipper.Orientation(largestAreaPath);
    }
    const silhouettePaths = masterPaths.filter(p => ClipperLib.Clipper.Orientation(p) === isOuterOrientation);

    // Extract Silhouette Mirrored
    const coSilhouetteMirrored = new ClipperLib.ClipperOffset(2, 0.25);
    mirroredOriginalPaths.forEach(path => {
      coSilhouetteMirrored.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    });
    const masterPathsMirrored = new ClipperLib.Paths();
    coSilhouetteMirrored.Execute(masterPathsMirrored, 0.1 * scale);
    
    let isOuterOrientationMirrored = true;
    if (masterPathsMirrored.length > 0) {
      const largestAreaPathMirrored = masterPathsMirrored.reduce((prev, current) => (Math.abs(ClipperLib.Clipper.Area(current)) > Math.abs(ClipperLib.Clipper.Area(prev)) ? current : prev));
      isOuterOrientationMirrored = ClipperLib.Clipper.Orientation(largestAreaPathMirrored);
    }
    const silhouettePathsMirrored = masterPathsMirrored.filter(p => ClipperLib.Clipper.Orientation(p) === isOuterOrientationMirrored);

    const cutterGroup = new THREE.Group();
    const cutterGeometries = [];
    
    if (silhouettePaths.length > 0) {
      silhouettePaths.forEach(silPath => {
        // Cutter Wall
        const outerWallPaths = new ClipperLib.Paths();
        const coWall = new ClipperLib.ClipperOffset(2, 0.25);
        coWall.AddPath(silPath, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
        coWall.Execute(outerWallPaths, wallThickness * scale);
        
        if (outerWallPaths.length > 0) {
          const outerWallPts = toThreeVec2(outerWallPaths[0]);
          const holePts = toThreeVec2(silPath);
          
          const wallShape = new THREE.Shape(outerWallPts);
          wallShape.holes.push(new THREE.Path(holePts));
          
          const wallGeom = new THREE.ExtrudeGeometry(wallShape, { depth: cutterHeight, bevelEnabled: false, curveSegments: 12 });
          cutterGeometries.push(wallGeom);
        }
        
        // Cutter Base (Borda superior ou inferior)
        if (baseWidth > 0 && baseHeight > 0) {
          const outerBasePaths = new ClipperLib.Paths();
          const coBase = new ClipperLib.ClipperOffset(2, 0.25);
          coBase.AddPath(silPath, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
          coBase.Execute(outerBasePaths, (wallThickness + baseWidth) * scale);
          
          if (outerBasePaths.length > 0) {
            const outerBasePts = toThreeVec2(outerBasePaths[0]);
            const holePts = toThreeVec2(silPath);
            
            const baseShape = new THREE.Shape(outerBasePts);
            baseShape.holes.push(new THREE.Path(holePts));
            
            const baseGeom = new THREE.ExtrudeGeometry(baseShape, { depth: baseHeight, bevelEnabled: false, curveSegments: 12 });
            // Deixa na base (inferior) do cortador
            cutterGeometries.push(baseGeom);
          }
        }
      });
    }

    // 2. STAMP / PLUNGER
    const stampGroup = new THREE.Group();
    const stampGeometries = [];
    
    // Base do carimbo (Offset negativo da silhueta para aplicar tolerance)
    const coStampBase = new ClipperLib.ClipperOffset(2, 0.25);
    silhouettePathsMirrored.forEach(path => {
      coStampBase.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    });
    
    const stampBasePaths = new ClipperLib.Paths();
    // Offset negativo
    coStampBase.Execute(stampBasePaths, -tolerance * scale);
    
    if (stampBasePaths.length > 0) {
      stampBasePaths.forEach(basePath => {
        const basePts = toThreeVec2(basePath);
        const baseShape = new THREE.Shape(basePts);
        
        // Base geom (extrusão simples)
        const baseGeom = new THREE.ExtrudeGeometry(baseShape, {
          depth: stampBaseHeight,
          bevelEnabled: false,
          curveSegments: 12
        });
        stampGeometries.push(baseGeom);
      });
    }

    // Desenho (Extrusão) no carimbo
    extractedShapes.forEach(points => {
      const processPoint = (p) => {
        let x = (p.x - centerX) * scaleX;
        let y = -(p.y - centerY) * scaleY;
        if (mirror) x = -x;
        return new THREE.Vector2(x, y);
      };

      const extrudeShape = new THREE.Shape(points.shape.map(processPoint));
      if (points.holes) {
        points.holes.forEach(hole => {
          extrudeShape.holes.push(new THREE.Path(hole.map(processPoint)));
        });
      }
      
      const extrudeGeom = new THREE.ExtrudeGeometry(extrudeShape, {
        depth: extrusion,
        bevelEnabled: false,
        curveSegments: 12
      });
      // Move o desenho para a face superior da base
      extrudeGeom.translate(0, 0, stampBaseHeight);
      
      stampGeometries.push(extrudeGeom);
    });

    // Merge Cutter
    if (cutterGeometries.length > 0) {
      const mergedCutterGeom = BufferGeometryUtils.mergeGeometries(cutterGeometries, false);
      if (mergedCutterGeom) {
        cutterGroup.add(new THREE.Mesh(mergedCutterGeom, this.material));
      }
    }
    
    // Merge Stamp
    if (stampGeometries.length > 0) {
      const mergedStampGeom = BufferGeometryUtils.mergeGeometries(stampGeometries, false);
      if (mergedStampGeom) {
        stampGroup.add(new THREE.Mesh(mergedStampGeom, this.material));
      }
    }

        // Posicionamento Lado a Lado com ajuste de largura do carimbo
        const gap = 15;

        const cutterBox = new THREE.Box3().setFromObject(cutterGroup);
        const stampBox = new THREE.Box3().setFromObject(stampGroup);

        const cutterW = cutterBox.max.x - cutterBox.min.x;
        const stampW = stampBox.max.x - stampBox.min.x;

        // Se o carimbo for mais largo que o corpo, escala proporcionalmente
        if (stampW > cutterW) {
          const scaleFactor = cutterW / stampW;
          stampGroup.scale.multiplyScalar(scaleFactor);
          // Recalcula a caixa após escalonamento
          const newStampBox = new THREE.Box3().setFromObject(stampGroup);
          stampBox.copy(newStampBox);
        }

        // Cutter fica na origem (esquerda)
        cutterGroup.position.x = 0;

        // Stamp fica do lado direito, alinhado ao centro do cutter
        stampGroup.position.x = (cutterW / 2) + gap + ((stampBox.max.x - stampBox.min.x) / 2);
    
    this.group.add(cutterGroup);
    this.group.add(stampGroup);
    
    // Centraliza o conjunto todo
    const totalBox = new THREE.Box3().setFromObject(this.group);
    const center = totalBox.getCenter(new THREE.Vector3());
    this.group.position.x -= center.x;
    this.group.position.y -= center.y;

    return true;
  }
}
