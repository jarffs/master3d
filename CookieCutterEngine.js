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
      const style = path.userData ? path.userData.style : null;
      
      if (style) {
        const fill = (style.fill || '').toLowerCase().replace(/\s/g, '');
        // Ignore white paths (typically background from image tracing or explicit SVG backgrounds)
        if (fill === 'rgb(255,255,255)' || fill === '#ffffff' || fill === '#fff' || fill === 'white') {
          continue;
        }
        // Force fill to ensure stroked paths without fill are still processed as solid shapes
        style.fill = '#000';
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
    
    const { 
      height, 
      wallThickness, 
      baseWidth, 
      baseHeight, 
      targetWidth, 
      targetDepth,
      enableContour,
      contourOffset
    } = params;
    
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
    const svgWidth = maxX - minX;
    const svgHeight = maxY - minY;
    
    // Store SVG aspect ratio for external use
    this.svgAspectRatio = svgWidth > 0 && svgHeight > 0 ? svgWidth / svgHeight : 1;
    this.svgNaturalWidth = svgWidth;
    this.svgNaturalHeight = svgHeight;
    
    // Use provided target dimensions, or fallback to 80mm max
    const tw = targetWidth || 80;
    const td = targetDepth || 80;
    
    // Separate scale factors for X and Y
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
      // 1. Create the unified contour silhouette
      const coContour = new ClipperLib.ClipperOffset(2, 0.25);
      allOriginalPaths.forEach(path => {
        coContour.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
      });
      
      const masterContourPaths = new ClipperLib.Paths();
      // Offset by contourOffset
      coContour.Execute(masterContourPaths, contourOffset * scale);
      
      if (masterContourPaths.length > 0) {
        // Find the largest outer path to use as the master contour (in case there are disjoint pieces that didn't merge)
        // Usually, contour offset merges them into one big piece if the offset is large enough.
        // We will process all resulting pieces just in case.
        masterContourPaths.forEach(masterPath => {
          // 2. Generate Cutter Wall for the master contour
          const outerWallPaths = new ClipperLib.Paths();
          const coWall = new ClipperLib.ClipperOffset(2, 0.25);
          coWall.AddPath(masterPath, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
          coWall.Execute(outerWallPaths, wallThickness * scale);
          
          if (outerWallPaths.length > 0) {
            const outerWallPts = toThreeVec2(outerWallPaths[0]);
            const holePts = toThreeVec2(masterPath);
            
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
          
          // 3. Generate Base Flange for the master contour
          if (baseWidth > 0 && baseHeight > 0) {
            const outerBasePaths = new ClipperLib.Paths();
            const coBase = new ClipperLib.ClipperOffset(2, 0.25);
            coBase.AddPath(masterPath, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
            coBase.Execute(outerBasePaths, (wallThickness + baseWidth) * scale);
            
            if (outerBasePaths.length > 0) {
              const outerBasePts = toThreeVec2(outerBasePaths[0]);
              const holePts = toThreeVec2(masterPath);
              
              const baseShape = new THREE.Shape(outerBasePts);
              baseShape.holes.push(new THREE.Path(holePts));
              
              const baseGeom = new THREE.ExtrudeGeometry(baseShape, {
                depth: baseHeight,
                bevelEnabled: false,
                curveSegments: 12
              });
              const baseMesh = new THREE.Mesh(baseGeom, this.material);
              this.cookieGroup.add(baseMesh);
            }
          }
        });
        
        // 4. Create the Stamp (Carimbo) from the ORIGINAL paths
        // The stamp should be slightly higher than the base, but lower than the cutter wall
        const stampHeight = params.stampHeight || Math.max(baseHeight + 1, height - 3);
        
        allOriginalPaths.forEach(origPath => {
          // We can just extrude the original path as a solid block up to stampHeight!
          // Actually, if the stamp has some thickness, we might want to offset it slightly, 
          // or just extrude the path directly as a filled shape.
          const pts = toThreeVec2(origPath);
          const stampShape = new THREE.Shape(pts);
          const stampGeom = new THREE.ExtrudeGeometry(stampShape, {
            depth: stampHeight,
            bevelEnabled: false,
            curveSegments: 12
          });
          const stampMesh = new THREE.Mesh(stampGeom, this.material);
          this.cookieGroup.add(stampMesh);
        });
      }
    } else {
      // Standard behavior without contour offset
      allOriginalPaths.forEach(originalPath => {
        // 1. Create Cutter Wall
        const outerWallPaths = new ClipperLib.Paths();
        const coWall = new ClipperLib.ClipperOffset(2, 0.25);
        coWall.AddPath(originalPath, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
        coWall.Execute(outerWallPaths, wallThickness * scale);
        
        // 2. Create Base Flange
        const outerBasePaths = new ClipperLib.Paths();
        const coBase = new ClipperLib.ClipperOffset(2, 0.25);
        coBase.AddPath(originalPath, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
        coBase.Execute(outerBasePaths, (wallThickness + baseWidth) * scale);
        
        if (outerWallPaths.length > 0) {
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
    }

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
