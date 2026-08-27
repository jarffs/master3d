import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { Evaluator, Brush, SUBTRACTION, ADDITION } from 'three-bvh-csg';
import { BaseEngine } from './BaseEngine.js';

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
      const letterMesh = await this.generateMeshFromText(params.bigLetter, params.bigLetterFont, params.thickness);
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
        let nameMesh = await this.generateMeshFromText(params.nameText, params.nameFont, nameThickness);
        
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
            let borderMesh = await this.generateMeshFromText(params.nameText, params.nameFont, params.thickness);
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
        const cutBrush = new Brush(cutGeom, this.material);
        
        // Position at the bottom
        cutBrush.position.set(0, bbox.min.y + (cutHeightMm / 2), 0);
        cutBrush.updateMatrixWorld();

        resultBrush = this.evaluator.evaluate(resultBrush, cutBrush, SUBTRACTION);
      }

      if (myGenId !== this.generationId) return false;

      // Finalize
      resultBrush.geometry.computeBoundingBox();
      const finalBbox = resultBrush.geometry.boundingBox;
      const width = finalBbox.max.x - finalBbox.min.x;
      const height = finalBbox.max.y - finalBbox.min.y;
      this.svgAspectRatio = width / height;

      this.group.add(resultBrush);
      
      return true;
    } catch (e) {
      console.error("BigLettersEngine generation failed:", e);
      return false;
    }
  }

  async generateSvgFromText(text, family) {
    await this.loadFontCSS(family);
    await this.loadFontCSS('Noto Emoji');

    const fontSize = 150;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const fontStack = `bold ${fontSize}px '${family}', 'Noto Emoji', sans-serif`;
    ctx.font = fontStack;

    const metrics = ctx.measureText(text);
    const textWidth = Math.max(10, Math.ceil(metrics.width) + 60);
    const textHeight = Math.max(10, Math.ceil(fontSize * 1.5) + 60);

    canvas.width = textWidth;
    canvas.height = textHeight;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'black';
    ctx.font = fontStack;
    ctx.textBaseline = 'top';
    ctx.fillText(text, 30, 30);

    return canvas.toDataURL('image/png');
  }



  async generateMeshFromText(text, font, depth) {
    const dataUrl = await this.generateSvgFromText(text, font);
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

    const shapes = this.parseSVG(svgString);
    if (shapes.length === 0) return null;

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
    // Base scale to normalize 150px font to roughly 100mm height
    const baseScale = 100 / (maxY - minY);

    const group = new THREE.Group();
    
    shapes.forEach(shape => {
      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: depth,
        bevelEnabled: false,
        curveSegments: 12
      });
      geom.computeBoundingBox();
      geom.translate(-centerX, -centerY, 0);
      geom.scale(baseScale, -baseScale, 1);
      
      const mesh = new THREE.Mesh(geom, this.material);
      group.add(mesh);
    });

    let finalBrush = null;
    group.updateMatrixWorld();
    group.traverse(child => {
      if (child.isMesh) {
        const brush = new Brush(child.geometry, this.material);
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
