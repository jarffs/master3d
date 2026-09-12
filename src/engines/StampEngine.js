import * as THREE from 'three';
import ClipperLib from 'clipper-lib';
import { BaseEngine } from './BaseEngine.js';
import manifoldWasmUrl from 'manifold-3d/manifold.wasm?url';

let manifoldModule;

function loadManifold() {
  if (!manifoldModule) {
    manifoldModule = import('manifold-3d').then(({ default: initialize }) =>
      initialize({ locateFile: () => manifoldWasmUrl })
    ).then(module => {
      module.setup();
      return module;
    }).catch(error => {
      manifoldModule = null;
      throw error;
    });
  }
  return manifoldModule;
}

export class StampEngine extends BaseEngine {
  constructor(scene) {
    super(scene);
    this.name = 'stamp';
    this._generation = 0;
    
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
        id: 'wallThickness',
        type: 'slider',
        label: 'app.stamp_wall_thickness',
        desc: 'app.stamp_wall_thickness_desc',
        min: 0.2,
        max: 1.2,
        step: 0.1,
        default: 0.4,
        suffix: 'mm',
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

  clear() {
    this._generation++;
    const geometries = new Set();
    this.group.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const part of object.userData.exportParts || []) geometries.add(part.geometry);
    });
    geometries.forEach(geometry => geometry.dispose());
    this.group.clear();
    this.group.position.set(0, 0, 0);
  }

  _buildWallShapes(contours, thickness) {
    const scale = 1000;
    const wallPaths = [];
    const toVectors = path => path.map(point => new THREE.Vector2(point.X / scale, point.Y / scale));
    for (const points of contours) {
      const paths = [];
      for (const [index, contour] of [points.shape, ...points.holes].entries()) {
        const path = ClipperLib.Clipper.CleanPolygon(contour.map(point => ({
          X: Math.round(point.x * scale), Y: Math.round(point.y * scale)
        })), 5);
        if (path.length < 3) continue;
        if (ClipperLib.Clipper.Orientation(path) !== (index === 0)) path.reverse();
        paths.push(path);
      }
      const offsetter = new ClipperLib.ClipperOffset(2, 10);
      offsetter.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
      const expanded = new ClipperLib.Paths();
      offsetter.Execute(expanded, thickness * scale / 2);
      wallPaths.push(...expanded);
    }
    const union = new ClipperLib.Clipper();
    union.StrictlySimple = true;
    union.AddPaths(wallPaths, ClipperLib.PolyType.ptSubject, true);
    const tree = new ClipperLib.PolyTree();
    union.Execute(ClipperLib.ClipType.ctUnion, tree,
      ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    const shapes = [];
    const visit = node => {
      if (!node.IsHole() && node.Contour().length >= 3) {
        const shape = new THREE.Shape(toVectors(node.Contour()));
        node.Childs().filter(child => child.IsHole()).forEach(child => {
          shape.holes.push(new THREE.Path(toVectors(child.Contour())));
        });
        shapes.push(shape);
      }
      node.Childs().forEach(visit);
    };
    tree.Childs().forEach(visit);
    return shapes;
  }

  async _extrudeWalls(shapes, depth) {
    const { CrossSection } = await loadManifold();
    const contours = shapes.flatMap(shape => [shape, ...shape.holes].map(path =>
      path.getPoints(1).map(point => [point.x, point.y])
    ));
    const section = new CrossSection(contours, 'EvenOdd');
    let solid;
    try {
      solid = section.extrude(depth);
      return this._solidGeometry(solid);
    } finally {
      solid?.delete();
      section.delete();
    }
  }

  _solidGeometry(solid, baseHeight = Infinity) {
    if (solid.status() !== 'NoError') throw new Error(`Invalid stamp solid: ${solid.status()}`);
    const mesh = solid.getMesh();
    const positions = new Float32Array(mesh.triVerts.length * 3);
    for (let index = 0; index < mesh.triVerts.length; index++) {
      const offset = mesh.triVerts[index] * mesh.numProp;
      positions.set(mesh.vertProperties.subarray(offset, offset + 3), index * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    let groupStart = 0;
    let materialIndex = -1;
    for (let index = 0; index < positions.length; index += 9) {
      const heights = [positions[index + 2], positions[index + 5], positions[index + 8]];
      const nextMaterial = Math.min(...heights) >= baseHeight - 0.00001 && Math.max(...heights) > baseHeight + 0.00001 ? 1 : 0;
      if (nextMaterial !== materialIndex) {
        if (materialIndex !== -1) geometry.addGroup(groupStart, index / 3 - groupStart, materialIndex);
        groupStart = index / 3;
        materialIndex = nextMaterial;
      }
    }
    if (materialIndex !== -1) geometry.addGroup(groupStart, positions.length / 3 - groupStart, materialIndex);
    return geometry;
  }

  _flattenForExport() {
    const exportGroup = new THREE.Group();
    this.group.updateMatrixWorld(true);
    this.group.traverse(object => {
      if (!object.isMesh) return;
      const parts = object.userData.exportParts || [{ geometry: object.geometry, material: object.material, name: object.name }];
      for (const part of parts) {
        const mesh = new THREE.Mesh(part.geometry.clone().applyMatrix4(object.matrixWorld), part.material);
        mesh.name = part.name;
        exportGroup.add(mesh);
      }
    });
    return exportGroup;
  }

  async generate3DModel(params) {
    if (!this.currentSvgShapes || this.currentSvgShapes.length === 0) return false;
    const generation = ++this._generation;
    const { Manifold, CrossSection } = await loadManifold();
    if (generation !== this._generation) return false;
    
    if (params.colorBase) this.partMaterials.base.color.set(params.colorBase);
    if (params.colorTop) this.partMaterials.top.color.set(params.colorTop);
    
    const extractedShapes = this.currentSvgShapes.map(shape => this.extractShapePoints(shape));
    const wallThickness = THREE.MathUtils.clamp(Number(params.wallThickness) || 0.4, 0.2, 1.2);

    // 1. Process shapes and mirror X for stamping
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    // First find original bounds to calculate mirror and scale
    extractedShapes.forEach(pts => {
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
    if (!Number.isFinite(maxDim) || maxDim <= 0) return false;
    
    // Calculate uniform scale to reach target stampSize (in mm)
    const targetScale = params.stampSize / maxDim;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Calcular o raio máximo a partir do centro para garantir que a base circular cobre tudo
    let maxDistSq = 0;
    extractedShapes.forEach(pts => {
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
    
    extractedShapes.forEach(pts => {
      
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

      mirroredShapes.push({
        shape: pts.shape.map(processPoint),
        holes: (pts.holes || []).map(hole => hole.map(processPoint))
      });
    });

    // A base agora é sempre circular, combinando com o design do sinete.
    // O texto já está centralizado em (0,0).
    const wallShapes = this._buildWallShapes(mirroredShapes, wallThickness);
    this.clear();
    const resources = [];
    const own = resource => { resources.push(resource); return resource; };
    try {

    // -- STAMP MESH --
    const baseThick = params.baseThickness;
    const extThick = params.extrusion;
    const holeRadius = 6; // 12mm diameter hole
    const holeDepth = Math.max(1, baseThick - 1); // leave 1mm solid above hole
    
    // O raio da base é o raio máximo da textura + 1mm de margem (ou seja, diâmetro 2mm maior)
    const baseR = maxRadiusScaled + wallThickness + 1;

    const baseSolid = own(Manifold.cylinder(baseThick, baseR, baseR, 64));
    const holeSolid = own(Manifold.cylinder(holeDepth, holeRadius, holeRadius, 32));
    let stampSolid = own(baseSolid.subtract(holeSolid));
    const stampBase = stampSolid;
    let stampRelief;
    if (wallShapes.length) {
      const contours = wallShapes.flatMap(shape => [shape, ...shape.holes].map(path =>
        path.getPoints(1).map(point => [point.x, point.y])
      ));
      const section = own(new CrossSection(contours, 'EvenOdd'));
      const raised = own(section.extrude(extThick));
      const positioned = own(raised.translate([0, 0, baseThick]));
      stampRelief = positioned;
      stampSolid = own(stampSolid.add(positioned));
    }
    const stampGroup = new THREE.Group();
    const baseMesh = new THREE.Mesh(this._solidGeometry(stampSolid, baseThick), [this.partMaterials.base, this.partMaterials.top]);
    baseMesh.name = 'Stamp';
    baseMesh.userData.exportParts = [{
      geometry: this._solidGeometry(stampBase), material: this.partMaterials.base, name: 'Stamp Base'
    }];
    if (stampRelief) baseMesh.userData.exportParts.push({
      geometry: this._solidGeometry(stampRelief), material: this.partMaterials.top, name: 'Stamp Relief'
    });
    stampGroup.add(baseMesh);
    
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

    const handleSection = own(new CrossSection([smoothPoints.map(point => [point.x, point.y])], 'EvenOdd'));
    const handleSolid = own(handleSection.revolve(48));
    const boredHandle = own(handleSolid.subtract(holeSolid));
    const handleMesh = new THREE.Mesh(this._solidGeometry(boredHandle), this.partMaterials.base);
    handleMesh.name = 'Handle';

    // -- PIN MESH (Pino separado de encaixe duplo) --
    const tolerance = 0.3;
    const pinRadius = holeRadius - tolerance;
    const pinDepth = (holeDepth * 2) - tolerance; // Altura para entrar nos dois lados

    const pinSolid = own(Manifold.cylinder(pinDepth, pinRadius, pinRadius, 32));
    const pinMesh = new THREE.Mesh(this._solidGeometry(pinSolid), this.partMaterials.base);
    pinMesh.name = 'Pin';

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
    
    const box = new THREE.Box3().setFromObject(this.group);
    const center = box.getCenter(new THREE.Vector3());
    this.group.position.x = -center.x;
    this.group.position.y = -center.y;
    return true;
    } finally {
      resources.reverse().forEach(resource => resource.delete());
    }
  }
}
