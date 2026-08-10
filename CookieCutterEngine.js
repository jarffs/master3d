import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import ClipperLib from 'clipper-lib';

export class CookieCutterEngine {
  constructor(scene) {
    this.scene = scene;
    this.cookieGroup = new THREE.Group();
    // rotate group to lie flat on XY plane so Z is up (default 3D printing orientation)
    // Three.js extrudes along Z, but SVG is X-Y. So extruded object is on XY plane, extruded in Z.
    // This is already correct for 3D printing (Z is up).
    
    // Default material
    this.material = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.4,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    
    this.scene.add(this.cookieGroup);
    this.currentSvgShapes = null;
  }

  // Load SVG from string (file contents)
  loadSVG(svgText) {
    const loader = new SVGLoader();
    const svgData = loader.parse(svgText);
    
    this.currentSvgShapes = [];
    
    // Parse paths into Three.js shapes
    for (const path of svgData.paths) {
      // Force fill to ensure stroked paths without fill are still processed as solid shapes
      if (path.userData && path.userData.style) {
        path.userData.style.fill = '#000';
      }
      
      const shapes = path.toShapes(true); // true = generates holes automatically
      this.currentSvgShapes.push(...shapes);
    }
    
    // Helper is removed, centering is done on extracted points in generate3DModel
  }

  generate3DModel(params) {
    if (!this.currentSvgShapes || this.currentSvgShapes.length === 0) return false;
    
    // Clear old group
    while(this.cookieGroup.children.length > 0) {
      const child = this.cookieGroup.children[0];
      child.geometry.dispose();
      this.cookieGroup.remove(child);
    }
    
    const { height, wallThickness, baseWidth, baseHeight } = params;
    const scale = 1000; // ClipperLib uses integers, scale up by 1000 for precision

    // First extract all points and compute bounding box
    const extractedShapes = [];
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    this.currentSvgShapes.forEach(svgShape => {
      const points = svgShape.extractPoints(10); // get points with some resolution
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
    const width = maxX - minX;
    const h = maxY - minY;
    
    // Cookie cutters are usually around 80mm max dimension.
    const maxDim = Math.max(width, h);
    const targetSize = 80;
    const svgScaleFactor = maxDim > 0 ? targetSize / maxDim : 1;

    extractedShapes.forEach(points => {
      // We need to translate, scale, and invert Y because SVG origin is top-left, 3D is bottom-left
      const toClipperPath = (pts) => pts.map(p => ({ 
        X: Math.round((p.x - centerX) * svgScaleFactor * scale), 
        Y: Math.round(-(p.y - centerY) * svgScaleFactor * scale) 
      }));
      const toThreeVec2 = (pts) => pts.map(p => new THREE.Vector2(p.X / scale, p.Y / scale));
      
      const originalPath = toClipperPath(points.shape);

      // 1. Create Cutter Wall
      // We outset the original shape by wallThickness.
      // Inner boundary (hole) is the original shape.
      const outerWallPaths = new ClipperLib.Paths();
      const coWall = new ClipperLib.ClipperOffset(2, 0.25);
      coWall.AddPath(originalPath, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
      coWall.Execute(outerWallPaths, wallThickness * scale);
      
      // 2. Create Base Flange
      const outerBasePaths = new ClipperLib.Paths();
      const coBase = new ClipperLib.ClipperOffset(2, 0.25);
      coBase.AddPath(originalPath, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
      coBase.Execute(outerBasePaths, (wallThickness + baseWidth) * scale);
      
      // Generate geometries if we got valid paths back
      if (outerWallPaths.length > 0) {
        // Find largest area path to use as main outer boundary (simplification)
        const outerWallPts = toThreeVec2(outerWallPaths[0]);
        const holePts = toThreeVec2(originalPath);
        
        const wallShape = new THREE.Shape(outerWallPts);
        wallShape.holes.push(new THREE.Path(holePts));
        
        const wallGeom = new THREE.ExtrudeGeometry(wallShape, {
          depth: height,
          bevelEnabled: false,
          curveSegments: 12
        });
        const wallMesh = new THREE.Mesh(wallGeom, this.material);
        this.cookieGroup.add(wallMesh);
      }
      
      if (outerBasePaths.length > 0 && baseWidth > 0 && baseHeight > 0) {
        const outerBasePts = toThreeVec2(outerBasePaths[0]);
        const holePts = toThreeVec2(originalPath);
        
        const baseShape = new THREE.Shape(outerBasePts);
        // Base also has the inner hole so the cookie dough goes through
        baseShape.holes.push(new THREE.Path(holePts));
        
        const baseGeom = new THREE.ExtrudeGeometry(baseShape, {
          depth: baseHeight,
          bevelEnabled: false,
          curveSegments: 12
        });
        const baseMesh = new THREE.Mesh(baseGeom, this.material);
        this.cookieGroup.add(baseMesh);
      }
    });

    return true;
  }

  exportSTL() {
    const exporter = new STLExporter();
    const stlString = exporter.parse(this.cookieGroup);
    
    const blob = new Blob([stlString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = url;
    link.download = 'cookie_cutter.stl';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
