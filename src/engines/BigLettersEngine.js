import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { Evaluator, Brush, SUBTRACTION, ADDITION, INTERSECTION } from 'three-bvh-csg';
import ClipperLib from 'clipper-lib';
import opentype from 'opentype.js';
import { BaseEngine } from './BaseEngine.js';

const FONT_URLS = {
  'Montserrat': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/montserrat/Montserrat%5Bwght%5D.ttf',
  'Playfair Display': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf',
  'Roboto': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/roboto/Roboto%5Bwdth,wght%5D.ttf',
  'Chewy': 'https://cdn.jsdelivr.net/gh/google/fonts@main/apache/chewy/Chewy-Regular.ttf',
  'Fredoka One': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/fredokaone/FredokaOne-Regular.ttf',
  'Bebas Neue': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/bebasneue/BebasNeue-Regular.ttf'
};

export class BigLettersEngine extends BaseEngine {
  constructor(scene) {
    super(scene);
    this.name = 'big_letters';
    this.generationId = 0;
    
    // Core material for the output
    this.material = new THREE.MeshStandardMaterial({ 
      color: 0xff4081, 
      roughness: 0.3, 
      metalness: 0.2, 
      side: THREE.DoubleSide 
    });

    this.nameMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xffffff, 
      roughness: 0.3, 
      metalness: 0.2, 
      side: THREE.DoubleSide 
    });
    
    this.evaluator = new Evaluator();
  }

  getControlSchema() {
    return [
      {
        id: 'bigLetter',
        type: 'text',
        label: 'app.big_letter',
        desc: 'app.big_letter_desc',
        placeholder: 'M',
        default: 'M',
        multiline: false,
        category: 'primary'
      },
      {
        id: 'bigLetterFont',
        type: 'font',
        label: 'app.big_letter_font',
        desc: 'app.big_letter_font_desc',
        default: 'Montserrat',
        category: 'primary'
      },
      {
        id: 'nameText',
        type: 'text',
        label: 'app.sunken_name',
        desc: 'app.sunken_name_desc',
        placeholder: 'Master3D',
        default: 'Master3D',
        multiline: false,
        category: 'secondary'
      },
      {
        id: 'nameFont',
        type: 'font',
        label: 'app.name_font',
        desc: 'app.name_font_desc',
        default: 'Playfair Display',
        category: 'secondary'
      },
      {
        id: 'thickness',
        type: 'slider',
        label: 'app.total_thickness',
        desc: 'app.total_thickness_desc',
        min: 5,
        max: 50,
        step: 1,
        default: 15,
        suffix: 'mm',
        category: 'dimensions'
      },
      {
        id: 'cutoutDepth',
        type: 'slider',
        label: 'app.cutout_depth',
        desc: 'app.cutout_depth_desc',
        min: 1,
        max: 10,
        step: 0.5,
        default: 2.5,
        suffix: 'mm',
        category: 'dimensions'
      },
      {
        id: 'nameScale',
        type: 'slider',
        label: 'app.name_scale',
        desc: 'app.name_scale_desc',
        min: 0.5,
        max: 3.0,
        step: 0.05,
        default: 1.0,
        suffix: 'x',
        category: 'dimensions'
      },
      {
        id: 'nameOffsetY',
        type: 'slider',
        label: 'app.name_offset_y',
        desc: 'app.name_offset_y_desc',
        min: -50,
        max: 50,
        step: 1,
        default: 0,
        suffix: 'mm',
        category: 'dimensions'
      },
      {
        id: 'bottomCut',
        type: 'slider',
        label: 'app.bottom_cut',
        desc: 'app.bottom_cut_desc',
        min: 0,
        max: 30,
        step: 0.5,
        default: 0,
        suffix: 'mm',
        category: 'dimensions'
      }
    ];
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

    try {
      await document.fonts.load(`150px '${family}'`);
    } catch(e) {
      console.warn("Font loading timeout or error", e);
    }
  }

  async generateFromEditorData(params) {
    this.clear();
    const myGenId = ++this.generationId;

    try {
      // 1. Generate Big Letter Mesh
      const letterMesh = await this.generateMeshFromText(params.bigLetter, params.bigLetterFont, params.thickness, this.material);
      if (!letterMesh || myGenId !== this.generationId) return false;

      // Ensure the letter is centered (the generation centers it at 0,0,0)
      letterMesh.position.set(0, 0, 0);
      letterMesh.updateMatrixWorld();

      // Get dimensions of the letter to position the name relative to it
      letterMesh.geometry.computeBoundingBox();
      const letterBBox = letterMesh.geometry.boundingBox;
      const letterWidth = letterBBox.max.x - letterBBox.min.x;
      const letterHeight = letterBBox.max.y - letterBBox.min.y;

      let resultBrush = letterMesh;

      // 2. Generate Sunken Name Mesh
      if (params.nameText) {
        // Name thickness depends on hollowName
        const nameThickness = params.hollowName ? params.thickness : params.thickness + 5; 
        let nameMesh = await this.generateMeshFromText(params.nameText, params.nameFont, nameThickness, this.nameMaterial);
        
        if (nameMesh && myGenId === this.generationId) {
          nameMesh.geometry.computeBoundingBox();
          
          // Apply scale from editor
          const scale = params.nameScale * (letterWidth / 150); // relative scaling
          nameMesh.scale.set(scale, scale, 1);
          
          // Apply position from editor (normalized coordinates relative to canvas center)
          // Editor coords: 0,0 is top-left, 0.5,0.5 is center
          const relX = (params.nameX - 0.5) * letterWidth * 1.5;
          const relY = -(params.nameY - 0.5) * letterHeight * 1.5; // Invert Y for 3D

          const zPos = params.hollowName ? 0 : (params.thickness - params.cutoutDepth);
          
          nameMesh.position.set(relX, relY, zPos);
          nameMesh.updateMatrixWorld();

          if (params.nameBorder) {
            // Subtract bordered name
            let borderMesh = await this.generateMeshFromText(params.nameText, params.nameFont, params.thickness, this.material);
            borderMesh.scale.set(scale * 1.05, scale * 1.05, 1); // rough border expansion
            borderMesh.position.set(relX, relY, params.thickness - params.cutoutDepth);
            borderMesh.updateMatrixWorld();
            
            resultBrush = this.evaluator.evaluate(resultBrush, borderMesh, SUBTRACTION);
            resultBrush = this.evaluator.evaluate(resultBrush, nameMesh, ADDITION);
          } else {
            // Just subtract the name
            resultBrush = this.evaluator.evaluate(resultBrush, nameMesh, SUBTRACTION);
          }
        }
      }

      // 3. Base Cut (Corte da Base)
      if (params.bottomCutEnabled && params.bottomCutHeight > 0) {
        resultBrush.geometry.computeBoundingBox();
        const bbox = resultBrush.geometry.boundingBox;
        
        // Calculate cut height in mm based on normalized ratio
        const totalHeight = bbox.max.y - bbox.min.y;
        const cutHeightMm = params.bottomCutHeight * totalHeight * 1.2; 
        
        const cutGeom = new THREE.BoxGeometry(
          (bbox.max.x - bbox.min.x) * 2,
          cutHeightMm,
          params.thickness * 2
        );
        cutGeom.clearGroups();
        const cutBrush = new Brush(cutGeom, this.material);
        
        // Position at the bottom
        cutBrush.position.set(0, bbox.min.y + (cutHeightMm / 2), 0);
        cutBrush.updateMatrixWorld();

        resultBrush = this.evaluator.evaluate(resultBrush, cutBrush, SUBTRACTION);
      }

      // 4. Multi-color Pattern (Option B)
      let patternResultBrush = null;
      if (params.bigLetterPattern) {
        try {
          const patternUrl = `/assets/patterns/${params.bigLetterPattern}.svg`;
          const response = await fetch(patternUrl);
          const svgString = await response.text();
          
          const loader = new SVGLoader();
          const svgData = loader.parse(svgString);
          
          let patternShapes = [];
          for (const path of svgData.paths) {
            patternShapes.push(...path.toShapes(true));
          }
          
          if (patternShapes.length > 0) {
            // Create a tile group of the pattern
            const patternGeom = new THREE.ExtrudeGeometry(patternShapes, { depth: params.thickness + 0.5, bevelEnabled: false, curveSegments: 4 });
            patternGeom.center();
            patternGeom.clearGroups();
            
            // We scale the pattern down and repeat it across the letter's bounding box
            const tileScale = 0.5; // Scale of the SVG
            patternGeom.scale(tileScale, -tileScale, 1);
            
            const patternBrush = new Brush(patternGeom, new THREE.MeshStandardMaterial({ color: 0xffffff }));
            
            // Intersect with the letter's shape so it doesn't spill out
            // We use a clone of the letter's current shape for intersection
            const letterClone = resultBrush.clone();
            letterClone.updateMatrixWorld();
            patternBrush.updateMatrixWorld();
            
            patternResultBrush = this.evaluator.evaluate(patternBrush, letterClone, INTERSECTION);
            
            // To make it distinct for multi-color, we subtract it slightly from the main letter or leave it exactly on the surface
            // For true multi-color (like AMS), they can share the exact same volume, but it's better to subtract the pattern from the main letter
            resultBrush = this.evaluator.evaluate(resultBrush, patternResultBrush, SUBTRACTION);
          }
        } catch(e) {
          console.warn("Could not generate pattern mesh", e);
        }
      }

      if (myGenId !== this.generationId) return false;

      // Rotate to lay flat on the print bed
      this.group.rotation.x = 0;

      // Finalize
      resultBrush.geometry.computeBoundingBox();
      const finalBbox = resultBrush.geometry.boundingBox;
      const width = finalBbox.max.x - finalBbox.min.x;
      const height = finalBbox.max.y - finalBbox.min.y;
      this.svgAspectRatio = width / height;

      this.group.add(resultBrush);
      if (patternResultBrush) {
        this.group.add(patternResultBrush);
      }
      
      return true;
    } catch (e) {
      console.error("BigLettersEngine generation failed:", e);
      return false;
    }
  }

  async getOpentypeFont(family) {
    if (this.cachedFonts && this.cachedFonts[family]) {
      return this.cachedFonts[family];
    }
    const url = FONT_URLS[family] || FONT_URLS['Montserrat'];
    const buffer = await fetch(url).then(r => r.arrayBuffer());
    const font = opentype.parse(buffer);
    
    if (!this.cachedFonts) this.cachedFonts = {};
    this.cachedFonts[family] = font;
    return font;
  }

  async generateMeshFromText(text, font, depth, targetMaterial = this.material) {
    const otFont = await this.getOpentypeFont(font);
    const path = otFont.getPath(text, 0, 0, 100);
    const svgPathData = path.toPathData(2);
    
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${svgPathData}"/></svg>`;
    const loader = new SVGLoader();
    const svgData = loader.parse(svgString);

    // Bypass toShapes completely to avoid Three.js winding issues.
    // Extract pure math curves directly from the SVG subpaths!
    const scale = 1000;
    const clipper = new ClipperLib.Clipper();
    clipper.StrictlySimple = true;

    for (const p of svgData.paths) {
      for (const subPath of p.subPaths) {
        // 8 subdivisions for ultra-smooth curves
        const points = subPath.getPoints(8);
        const clipperPath = points.map(pt => ({ X: Math.round(pt.x * scale), Y: Math.round(pt.y * scale) }));
        clipper.AddPath(clipperPath, ClipperLib.PolyType.ptSubject, true);
      }
    }

    const solution = new ClipperLib.Paths();
    // pftEvenOdd completely ignores winding direction errors and mathematically resolves all overlaps!
    clipper.Execute(ClipperLib.ClipType.ctUnion, solution, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);

    if (solution.length === 0) return null;

    const toThreeVec2 = (pts) => pts.map(p => new THREE.Vector2(p.X / scale, p.Y / scale));
    const cleanShapes = [];

    // Separate outer boundaries from holes
    solution.forEach(path => {
      if (ClipperLib.Clipper.Orientation(path)) {
        const shape = new THREE.Shape(toThreeVec2(path));
        shape.closePath(); // CRITICAL: Explicitly close the path to prevent Earcut triangulation shattering
        cleanShapes.push({
          shape: shape,
          rawPath: path
        });
      }
    });

    solution.forEach(path => {
      if (!ClipperLib.Clipper.Orientation(path)) {
        const pt = path[0];
        for (let i = 0; i < cleanShapes.length; i++) {
          if (ClipperLib.Clipper.PointInPolygon(pt, cleanShapes[i].rawPath) !== 0) {
            const holePath = new THREE.Path(toThreeVec2(path));
            holePath.closePath(); // CRITICAL
            cleanShapes[i].shape.holes.push(holePath);
            break;
          }
        }
      }
    });

    const shapes = cleanShapes.map(cs => cs.shape);

    // Center and scale the shapes
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    shapes.forEach(shape => {
      const pts = shape.extractPoints(10);
      pts.shape.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    // Base scale to normalize roughly 100mm height
    const baseScale = 100 / (maxY - minY);

    const group = new THREE.Group();
    
    shapes.forEach(shape => {
      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: depth,
        bevelEnabled: false,
        curveSegments: 1 // Clipper shapes are already dense polygons
      });
      geom.clearGroups(); // CRITICAL: Prevents three-bvh-csg crash when using a single material
      geom.computeBoundingBox();
      geom.translate(-centerX, -centerY, 0);
      geom.scale(baseScale, -baseScale, 1);
      
      const mesh = new THREE.Mesh(geom, targetMaterial);
      group.add(mesh);
    });

    let finalBrush = null;
    group.updateMatrixWorld();
    group.traverse(child => {
      if (child.isMesh) {
        const brush = new Brush(child.geometry, targetMaterial);
        brush.matrix.copy(child.matrixWorld);
        brush.matrixWorldNeedsUpdate = true;
        brush.updateMatrixWorld();
        if (!finalBrush) {
          finalBrush = brush;
        } else {
          finalBrush = this.evaluator.evaluate(finalBrush, brush, ADDITION);
        }
      }
    });

    return finalBrush;
  }

  async generate3DModel(params) {
    const generationId = ++this.generationId;
    
    // Clear old group
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      if (child.geometry) child.geometry.dispose();
      this.group.remove(child);
    }

    const bigLetter = params.bigLetter || 'M';
    const bigLetterFont = params.bigLetterFont || 'Montserrat';
    const nameText = params.nameText || 'Master3D';
    const nameFont = params.nameFont || 'Playfair Display';
    const thickness = parseFloat(params.thickness) || 15;
    const cutoutDepth = parseFloat(params.cutoutDepth) || 2.5;
    const nameScale = parseFloat(params.nameScale) || 1.0;
    const nameOffsetY = parseFloat(params.nameOffsetY) || 0;
    const bottomCut = parseFloat(params.bottomCut) || 0;

    // 1. Generate base big letter mesh
    let baseBrush = await this.generateMeshFromText(bigLetter, bigLetterFont, thickness);
    if (this.generationId !== generationId || !baseBrush) return false;

    // 2. Base Cut (Flatten bottom)
    if (bottomCut > 0) {
      baseBrush.geometry.computeBoundingBox();
      const bbox = baseBrush.geometry.boundingBox;
      const height = bbox.max.y - bbox.min.y;
      const width = bbox.max.x - bbox.min.x;
      
      const cutHeight = bottomCut; // amount to cut from bottom
      const cutY = bbox.min.y + (cutHeight / 2);
      
      // Create a giant box at the bottom to subtract
      const cutBoxGeom = new THREE.BoxGeometry(width * 3, cutHeight, thickness * 3);
      const cutBoxBrush = new Brush(cutBoxGeom, this.material);
      // Position at bottom, centered in X and Z
      cutBoxBrush.position.set(
        (bbox.min.x + bbox.max.x) / 2, 
        cutY, 
        thickness / 2
      );
      cutBoxBrush.updateMatrixWorld();

      // CSG Subtract
      baseBrush = this.evaluator.evaluate(baseBrush, cutBoxBrush, SUBTRACTION);
    }

    // 3. Generate sunken name mesh
    const nameThickness = thickness * 2; 
    let nameBrush = await this.generateMeshFromText(nameText, nameFont, nameThickness);
    
    if (this.generationId !== generationId) return false;

    if (nameBrush) {
      // Position and scale name
      baseBrush.geometry.computeBoundingBox();
      const baseBbox = baseBrush.geometry.boundingBox;
      
      nameBrush.geometry.computeBoundingBox();
      const nameBbox = nameBrush.geometry.boundingBox;
      
      const baseWidth = baseBbox.max.x - baseBbox.min.x;
      const nameWidth = nameBbox.max.x - nameBbox.min.x;
      
      // Auto-scale to fit roughly 80% of the base letter width, multiplied by user scale
      const autoScale = (baseWidth * 0.8) / Math.max(1, nameWidth);
      const finalScale = autoScale * nameScale;
      
      nameBrush.scale.set(finalScale, finalScale, 1);
      
      // Position it in the center X, user defined Y, and shifted Z for the cutout depth
      nameBrush.position.set(0, nameOffsetY, thickness - cutoutDepth);
      nameBrush.updateMatrixWorld();
      
      // CSG Subtract Name from Base
      baseBrush = this.evaluator.evaluate(baseBrush, nameBrush, SUBTRACTION);
    }

    // Convert result back to standard Mesh
    const resultMesh = new THREE.Mesh(baseBrush.geometry, this.material);
    resultMesh.name = "BigLetter";

    // Add to group
    this.group.add(resultMesh);

    return true;
  }
}
