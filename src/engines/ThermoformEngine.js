import * as THREE from 'three';
import ClipperLib from 'clipper-lib';
import { BaseEngine } from './BaseEngine.js';
import { Brush, Evaluator, ADDITION, INTERSECTION } from 'three-bvh-csg';

const CLIPPER_SCALE = 1000;
const MIN_AREA_MM2 = 0.05;
const MAX_HOLES = 20000;

/**
 * ThermoformEngine — Gera duas peças para thermoforming:
 *   Peça A: Molde positivo sólido (forma do SVG extrudida sobre base circular)
 *   Peça B: Mesh frame (mesma silhueta com padrão vazado e parede exterior sólida)
 */
export class ThermoformEngine extends BaseEngine {
  constructor(scene) {
    super(scene);
    this.name = 'thermoform';
    this.evaluator = new Evaluator();
    this.evaluator.useGroups = false;
    // Brushes must expose the exact same attribute set, and merged geometries have no uv.
    this.evaluator.attributes = ['position', 'normal'];

    this.partMaterials = {
      mold: new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.3,
        metalness: 0.4,
        side: THREE.DoubleSide
      }),
      mesh: new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.3,
        metalness: 0.2,
        side: THREE.DoubleSide
      })
    };
  }

  getControlSchema() {
    return [
      // -- Mold Controls --
      {
        id: 'moldHeight',
        type: 'slider',
        label: 'app.thermoform_mold_height',
        desc: 'app.thermoform_mold_height_desc',
        min: 5,
        max: 40,
        step: 1,
        default: 15,
        suffix: 'mm',
        category: 'thermoform_mold'
      },
      {
        id: 'moldBaseThickness',
        type: 'slider',
        label: 'app.thermoform_mold_base',
        desc: 'app.thermoform_mold_base_desc',
        min: 2,
        max: 8,
        step: 0.5,
        default: 3,
        suffix: 'mm',
        category: 'thermoform_mold'
      },
      {
        id: 'moldShape',
        type: 'select',
        label: 'app.thermoform_mold_shape',
        desc: 'app.thermoform_mold_shape_desc',
        options: [
          { value: 'straight', label: 'app.thermoform_shape_straight' },
          { value: 'rounded', label: 'app.thermoform_shape_rounded' }
        ],
        default: 'straight',
        category: 'thermoform_mold'
      },
      // -- Mesh Controls --
      {
        id: 'meshHeight',
        type: 'slider',
        label: 'app.thermoform_mesh_height',
        desc: 'app.thermoform_mesh_height_desc',
        min: 3,
        max: 20,
        step: 1,
        default: 8,
        suffix: 'mm',
        category: 'thermoform_mesh'
      },
      {
        id: 'meshPattern',
        type: 'select',
        label: 'app.thermoform_mesh_pattern',
        desc: 'app.thermoform_mesh_pattern_desc',
        options: [
          { value: 'triangular', label: 'app.thermoform_pattern_triangular' },
          { value: 'honeycomb', label: 'app.thermoform_pattern_honeycomb' },
          { value: 'circular', label: 'app.thermoform_pattern_circular' },
          { value: 'square', label: 'app.thermoform_pattern_square' },
          { value: 'star', label: 'app.thermoform_pattern_star' }
        ],
        default: 'triangular',
        category: 'thermoform_mesh'
      },
      {
        id: 'meshDensity',
        type: 'slider',
        label: 'app.thermoform_mesh_density',
        desc: 'app.thermoform_mesh_density_desc',
        min: 3,
        max: 15,
        step: 0.5,
        default: 6,
        suffix: 'mm',
        category: 'thermoform_mesh'
      },
      {
        id: 'meshWallThickness',
        type: 'slider',
        label: 'app.thermoform_mesh_wall',
        desc: 'app.thermoform_mesh_wall_desc',
        min: 0.8,
        max: 3,
        step: 0.1,
        default: 1.2,
        suffix: 'mm',
        category: 'thermoform_mesh'
      },
      {
        id: 'meshOutlineThickness',
        type: 'slider',
        label: 'app.thermoform_mesh_outline',
        desc: 'app.thermoform_mesh_outline_desc',
        min: 1.5,
        max: 5,
        step: 0.5,
        default: 2.5,
        suffix: 'mm',
        category: 'thermoform_mesh'
      }
    ];
  }

  /**
   * Gera o modelo 3D completo (molde + mesh frame).
   */
  generate3DModel(params) {
    if (!this.currentSvgShapes || this.currentSvgShapes.length === 0) return false;
    this.clear();

    const targetWidth = this._num(params.targetWidth, 80);
    const targetDepth = this._num(params.targetDepth, 80);
    const moldHeight = this._num(params.moldHeight, 15);
    const moldBaseThickness = this._num(params.moldBaseThickness, 3);
    const moldShape = params.moldShape || 'straight';
    const meshHeight = this._num(params.meshHeight, 8);
    const meshPattern = params.meshPattern || 'triangular';
    const meshDensity = this._num(params.meshDensity, 6);
    const meshWallThickness = this._num(params.meshWallThickness, 1.2);
    const meshOutlineThickness = this._num(params.meshOutlineThickness, 2.5);

    const silhouette = this._buildSilhouette(targetWidth, targetDepth);
    if (!silhouette || silhouette.length === 0) return false;

    const bounds = this._pathsBounds(silhouette);
    if (!bounds) return false;

    const moldMesh = this._buildMold(silhouette, bounds, moldHeight, moldBaseThickness, moldShape);
    const meshFrame = this._buildMeshFrame(
      silhouette, bounds, meshHeight, meshPattern, meshDensity, meshWallThickness, meshOutlineThickness
    );
    if (!moldMesh && !meshFrame) return false;

    const gap = 15;
    if (moldMesh) {
      moldMesh.name = 'Thermoform_Mold';
      moldMesh.geometry.computeBoundingBox();
      moldMesh.position.x = -gap / 2 - moldMesh.geometry.boundingBox.max.x;
      this.group.add(moldMesh);
    }
    if (meshFrame) {
      meshFrame.name = 'Thermoform_MeshFrame';
      meshFrame.geometry.computeBoundingBox();
      meshFrame.position.x = gap / 2 - meshFrame.geometry.boundingBox.min.x;
      this.group.add(meshFrame);
    }

    // Center group
    const box = new THREE.Box3().setFromObject(this.group);
    const center = box.getCenter(new THREE.Vector3());
    this.group.position.x = -center.x;
    this.group.position.y = -center.y;

    return true;
  }

  // ==========================================
  // SILHOUETTE (2D)
  // ==========================================

  /**
   * Converte as formas do SVG num único contorno 2D (Clipper paths), escalado
   * para as dimensões pedidas, centrado na origem e com o eixo Y invertido
   * (o SVG usa Y para baixo).
   */
  _buildSilhouette(targetWidth, targetDepth) {
    const extracted = this.currentSvgShapes.map(shape => shape.extractPoints(24));

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    extracted.forEach(({ shape, holes }) => {
      [...shape, ...holes.flat()].forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
    });
    if (!Number.isFinite(minX)) return null;

    const sourceWidth = maxX - minX;
    const sourceHeight = maxY - minY;
    this.svgAspectRatio = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 1;
    this.svgNaturalWidth = sourceWidth;
    this.svgNaturalHeight = sourceHeight;

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const scaleX = sourceWidth > 0 ? targetWidth / sourceWidth : 1;
    const scaleY = sourceHeight > 0 ? targetDepth / sourceHeight : 1;

    const toPath = points => points.map(p => ({
      X: Math.round((p.x - centerX) * scaleX * CLIPPER_SCALE),
      Y: Math.round(-(p.y - centerY) * scaleY * CLIPPER_SCALE)
    }));
    const orient = (path, ccw) => {
      if ((ClipperLib.Clipper.Area(path) >= 0) !== ccw) path.reverse();
      return path;
    };

    const rawPaths = [];
    extracted.forEach(({ shape, holes }) => {
      if (shape.length < 3) return;
      rawPaths.push(orient(toPath(shape), true));
      holes.forEach(hole => {
        if (hole.length >= 3) rawPaths.push(orient(toPath(hole), false));
      });
    });
    if (rawPaths.length === 0) return null;

    // Non-zero union: overlapping outlines merge instead of cancelling into holes,
    // while the holes reported by SVGLoader (wound the other way) are preserved.
    return this._boolean(rawPaths, null, ClipperLib.ClipType.ctUnion, ClipperLib.PolyFillType.pftNonZero);
  }

  /**
   * Gera a Peça A: Molde Positivo.
   */
  _buildMold(silhouette, bounds, moldHeight, baseThickness, moldShape) {
    const shapes = this._pathsToShapes(silhouette);
    if (shapes.length === 0) return null;

    const moldGeom = this._extrudeMold(shapes, bounds, moldHeight, moldShape);
    if (!moldGeom) return null;

    const baseRadius = Math.max(bounds.width, bounds.height) / 2 + 5;
    const baseGeom = new THREE.CylinderGeometry(baseRadius, baseRadius, baseThickness, 96);
    baseGeom.rotateX(Math.PI / 2); // align with Z axis
    baseGeom.translate(bounds.centerX, bounds.centerY, -baseThickness / 2);

    let geometry = null;
    try {
      const moldBrush = new Brush(moldGeom, this.partMaterials.mold);
      moldBrush.updateMatrixWorld();
      const baseBrush = new Brush(baseGeom, this.partMaterials.mold);
      baseBrush.updateMatrixWorld();
      geometry = this.evaluator.evaluate(moldBrush, baseBrush, ADDITION).geometry;
    } catch (e) {
      console.warn('Thermoform: CSG union failed for mold, keeping overlapping solids.', e);
      geometry = this._mergeGeometries([moldGeom, baseGeom]);
    }
    if (!geometry) return null;

    geometry.computeBoundingBox();
    geometry.translate(0, 0, -geometry.boundingBox.min.z);
    geometry.computeBoundingBox();

    return new THREE.Mesh(geometry, this.partMaterials.mold);
  }

  _extrudeMold(shapes, bounds, moldHeight, moldShape) {
    // Overshoot downwards so the union with the base is a real overlap.
    const overlap = 0.4;
    const geom = new THREE.ExtrudeGeometry(shapes, {
      depth: moldHeight + overlap,
      bevelEnabled: false,
      curveSegments: 12
    });
    geom.translate(0, 0, -overlap);

    if (moldShape !== 'rounded') return geom;

    // Cut the extrusion with a half-ball of the same height: the dome peaks at the
    // centre and comes all the way down to the base at the sides.
    const domeGeom = new THREE.SphereGeometry(1, 96, 64);
    domeGeom.scale(bounds.width / 2, bounds.height / 2, moldHeight);
    domeGeom.translate(bounds.centerX, bounds.centerY, 0);

    try {
      const shapeBrush = new Brush(geom, this.partMaterials.mold);
      shapeBrush.updateMatrixWorld();
      const domeBrush = new Brush(domeGeom, this.partMaterials.mold);
      domeBrush.updateMatrixWorld();
      return this.evaluator.evaluate(shapeBrush, domeBrush, INTERSECTION).geometry;
    } catch (e) {
      console.warn('Thermoform: dome cut failed, keeping the straight mold.', e);
      return geom;
    }
  }

  /**
   * Gera a Peça B: Mesh Frame (contorno sólido + padrão vazado no interior).
   */
  _buildMeshFrame(silhouette, bounds, meshHeight, pattern, density, wallThickness, outlineThickness) {
    let region = silhouette;

    // Keep a solid outer wall: holes may only be punched inside the inset region.
    const inner = this._offsetPaths(silhouette, -outlineThickness);
    if (inner.length > 0) {
      const holePolygons = this._buildHolePolygons(pattern, bounds, density, wallThickness);
      if (holePolygons.length > 0) {
        const clippedHoles = this._boolean(
          holePolygons, inner, ClipperLib.ClipType.ctIntersection, ClipperLib.PolyFillType.pftNonZero
        );
        if (clippedHoles.length > 0) {
          region = this._boolean(
            silhouette, clippedHoles, ClipperLib.ClipType.ctDifference, ClipperLib.PolyFillType.pftNonZero
          );
        }
      }
    }

    const shapes = this._pathsToShapes(region);
    if (shapes.length === 0) return null;

    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: meshHeight,
      bevelEnabled: false,
      curveSegments: 12
    });
    geometry.computeBoundingBox();
    return new THREE.Mesh(geometry, this.partMaterials.mesh);
  }

  /**
   * Constrói os polígonos dos furos (coordenadas Clipper) para o padrão pedido.
   * `density` é o passo centro-a-centro e `wall` a espessura da parede entre furos.
   */
  _buildHolePolygons(pattern, bounds, density, wall) {
    // Widen the pitch when the requested wall would swallow the holes entirely.
    const minHole = 0.6;
    const minPitch = pattern === 'triangular'
      ? 2 * Math.sqrt(3) * (wall / 2 + minHole)
      : wall + 2 * minHole;
    const pitch = Math.max(density, minPitch);
    const polygons = [];
    const push = pointsMm => {
      if (polygons.length >= MAX_HOLES) return;
      const path = pointsMm.map(p => ({
        X: Math.round(p.x * CLIPPER_SCALE),
        Y: Math.round(p.y * CLIPPER_SCALE)
      }));
      if (ClipperLib.Clipper.Area(path) < 0) path.reverse();
      polygons.push(path);
    };

    const { minX, minY, maxX, maxY } = bounds;

    switch (pattern) {
      case 'honeycomb':
        this._tileHexagons(push, minX, minY, maxX, maxY, pitch, wall);
        break;
      case 'circular':
        this._tileRegular(push, minX, minY, maxX, maxY, pitch, wall, 24, 0);
        break;
      case 'square':
        this._tileRegular(push, minX, minY, maxX, maxY, pitch, wall, 4, Math.PI / 4, true);
        break;
      case 'star':
        this._tileStars(push, minX, minY, maxX, maxY, pitch, wall);
        break;
      case 'triangular':
      default:
        this._tileTriangles(push, minX, minY, maxX, maxY, pitch, wall);
    }

    return polygons;
  }

  // ==========================================
  // PATTERN GENERATORS (2D polygons, in mm)
  // ==========================================

  /**
   * Malha triangular real: triângulos equiláteros alternados (para cima/baixo),
   * separados por paredes de espessura `wall`.
   */
  _tileTriangles(push, minX, minY, maxX, maxY, pitch, wall) {
    const side = pitch;
    const rowH = side * Math.sqrt(3) / 2;
    const inradius = side / (2 * Math.sqrt(3));
    const shrink = (inradius - wall / 2) / inradius;
    if (shrink <= 0.05) return;

    const cols = Math.ceil((maxX - minX) / (side / 2)) + 3;
    const rows = Math.ceil((maxY - minY) / rowH) + 3;

    for (let r = 0; r < rows; r++) {
      const y0 = minY - rowH + r * rowH;
      for (let c = 0; c < cols; c++) {
        const x0 = minX - side + c * (side / 2);
        const up = (r + c) % 2 === 0;
        const verts = up
          ? [{ x: x0, y: y0 }, { x: x0 + side, y: y0 }, { x: x0 + side / 2, y: y0 + rowH }]
          : [{ x: x0 + side / 2, y: y0 }, { x: x0 + side, y: y0 + rowH }, { x: x0, y: y0 + rowH }];
        push(this._shrinkPolygon(verts, shrink));
      }
    }
  }

  /**
   * Favo de mel: hexágonos "pointy-top" em malha triangular.
   */
  _tileHexagons(push, minX, minY, maxX, maxY, pitch, wall) {
    const circumRadius = pitch / Math.sqrt(3);
    const inradius = pitch / 2;
    const shrink = (inradius - wall / 2) / inradius;
    if (shrink <= 0.05) return;

    const rowH = circumRadius * 1.5;
    const cols = Math.ceil((maxX - minX) / pitch) + 3;
    const rows = Math.ceil((maxY - minY) / rowH) + 3;

    for (let r = 0; r < rows; r++) {
      const cy = minY - rowH + r * rowH;
      const offsetX = (r % 2 === 0) ? 0 : pitch / 2;
      for (let c = 0; c < cols; c++) {
        const cx = minX - pitch + offsetX + c * pitch;
        const verts = [];
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i + Math.PI / 2;
          verts.push({ x: cx + circumRadius * Math.cos(angle), y: cy + circumRadius * Math.sin(angle) });
        }
        push(this._shrinkPolygon(verts, shrink));
      }
    }
  }

  /**
   * Furos regulares (círculo / quadrado) em linhas desencontradas.
   */
  _tileRegular(push, minX, minY, maxX, maxY, pitch, wall, segments, rotation, fromInradius = false) {
    const apothem = (pitch - wall) / 2;
    if (apothem <= 0.2) return;
    const radius = fromInradius ? apothem * Math.SQRT2 : apothem;

    const rowH = pitch * Math.sqrt(3) / 2;
    const cols = Math.ceil((maxX - minX) / pitch) + 3;
    const rows = Math.ceil((maxY - minY) / rowH) + 3;

    for (let r = 0; r < rows; r++) {
      const cy = minY - rowH + r * rowH;
      const offsetX = (r % 2 === 0) ? 0 : pitch / 2;
      for (let c = 0; c < cols; c++) {
        const cx = minX - pitch + offsetX + c * pitch;
        const verts = [];
        for (let i = 0; i < segments; i++) {
          const angle = (Math.PI * 2 / segments) * i + rotation;
          verts.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
        }
        push(verts);
      }
    }
  }

  /**
   * Estrelas de 5 pontas.
   */
  _tileStars(push, minX, minY, maxX, maxY, pitch, wall) {
    const outer = (pitch - wall) / 2;
    const inner = outer * 0.45;
    if (outer <= 0.4) return;

    const rowH = pitch * Math.sqrt(3) / 2;
    const cols = Math.ceil((maxX - minX) / pitch) + 3;
    const rows = Math.ceil((maxY - minY) / rowH) + 3;

    for (let r = 0; r < rows; r++) {
      const cy = minY - rowH + r * rowH;
      const offsetX = (r % 2 === 0) ? 0 : pitch / 2;
      for (let c = 0; c < cols; c++) {
        const cx = minX - pitch + offsetX + c * pitch;
        const verts = [];
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI / 5) * i - Math.PI / 2;
          const rad = i % 2 === 0 ? outer : inner;
          verts.push({ x: cx + rad * Math.cos(angle), y: cy + rad * Math.sin(angle) });
        }
        push(verts);
      }
    }
  }

  _shrinkPolygon(verts, factor) {
    const cx = verts.reduce((sum, v) => sum + v.x, 0) / verts.length;
    const cy = verts.reduce((sum, v) => sum + v.y, 0) / verts.length;
    return verts.map(v => ({
      x: cx + (v.x - cx) * factor,
      y: cy + (v.y - cy) * factor
    }));
  }

  // ==========================================
  // CLIPPER HELPERS
  // ==========================================

  _boolean(subject, clip, clipType, fillType) {
    const clipper = new ClipperLib.Clipper();
    clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
    if (clip && clip.length > 0) {
      clipper.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
    }
    const solution = new ClipperLib.Paths();
    clipper.Execute(clipType, solution, fillType, fillType);
    return solution;
  }

  _offsetPaths(paths, distanceMm) {
    const offset = new ClipperLib.ClipperOffset(2, 0.25 * CLIPPER_SCALE);
    offset.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    const result = new ClipperLib.Paths();
    offset.Execute(result, distanceMm * CLIPPER_SCALE);
    return result;
  }

  _pathsBounds(paths) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    paths.forEach(path => path.forEach(p => {
      minX = Math.min(minX, p.X);
      minY = Math.min(minY, p.Y);
      maxX = Math.max(maxX, p.X);
      maxY = Math.max(maxY, p.Y);
    }));
    if (!Number.isFinite(minX)) return null;

    minX /= CLIPPER_SCALE; minY /= CLIPPER_SCALE;
    maxX /= CLIPPER_SCALE; maxY /= CLIPPER_SCALE;
    return {
      minX, minY, maxX, maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    };
  }

  /**
   * Converte Clipper paths em THREE.Shape[] respeitando a hierarquia de furos.
   */
  _pathsToShapes(paths) {
    if (!paths || paths.length === 0) return [];

    const clipper = new ClipperLib.Clipper();
    clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
    const tree = new ClipperLib.PolyTree();
    clipper.Execute(
      ClipperLib.ClipType.ctUnion, tree,
      ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero
    );

    const minArea = MIN_AREA_MM2 * CLIPPER_SCALE * CLIPPER_SCALE;
    const toPoints = contour => contour.map(p => new THREE.Vector2(p.X / CLIPPER_SCALE, p.Y / CLIPPER_SCALE));

    const shapes = [];
    const walkOuter = node => {
      const contour = node.Contour();
      if (contour.length < 3 || Math.abs(ClipperLib.Clipper.Area(contour)) < minArea) return;

      const shape = new THREE.Shape(toPoints(contour));
      node.Childs().forEach(holeNode => {
        const holeContour = holeNode.Contour();
        if (holeContour.length >= 3 && Math.abs(ClipperLib.Clipper.Area(holeContour)) >= minArea) {
          shape.holes.push(new THREE.Path(toPoints(holeContour)));
        }
        holeNode.Childs().forEach(walkOuter);
      });
      shapes.push(shape);
    };
    tree.Childs().forEach(walkOuter);

    return shapes;
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  _num(value, fallback) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /**
   * Merge simples (position + normal) usado apenas quando o CSG falha.
   */
  _mergeGeometries(geometries) {
    const sources = geometries
      .filter(Boolean)
      .map(geom => (geom.index ? geom.toNonIndexed() : geom));
    if (sources.length === 0) return null;

    let total = 0;
    sources.forEach(geom => { total += geom.attributes.position.count; });

    const positions = new Float32Array(total * 3);
    const normals = new Float32Array(total * 3);
    let offset = 0;
    sources.forEach(geom => {
      positions.set(geom.attributes.position.array, offset);
      if (geom.attributes.normal) normals.set(geom.attributes.normal.array, offset);
      offset += geom.attributes.position.count * 3;
    });

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    return merged;
  }
}
