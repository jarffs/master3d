import * as THREE from 'three';
import ClipperLib from 'clipper-lib';
import { BaseEngine } from './BaseEngine.js';

export class ColoringEngine extends BaseEngine {
  constructor(scene) {
    super(scene);
    this.name = 'coloring';
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
      base: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide }),
      top: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide })
    };
  }

  getControlSchema() {
    return [
      {
        id: 'baseThickness', type: 'slider', label: 'app.base_thickness', desc: 'app.base_thickness_desc',
        min: 0.4, max: 10, step: 0.2, default: 1.6, suffix: 'mm', category: 'base'
      },
      {
        id: 'baseMargin', type: 'slider', label: 'app.base_margin', desc: 'app.base_margin_desc',
        min: 0, max: 10, step: 0.5, default: 3, suffix: 'mm', category: 'base'
      },
      {
        id: 'colorBase', type: 'select', label: 'app.color_base', desc: 'app.color_base_desc',
        options: this.plaColors, default: '#ffffff', category: 'base'
      },
      {
        id: 'topThickness', type: 'slider', label: 'app.top_thickness', desc: 'app.top_thickness_desc',
        min: 0.2, max: 2, step: 0.1, default: 0.6, suffix: 'mm', category: 'borders'
      },
      {
        id: 'borderWidth', type: 'slider', label: 'app.border_width', desc: 'app.border_width_desc',
        min: 0.4, max: 3, step: 0.1, default: 1, suffix: 'mm', category: 'borders'
      },
      {
        id: 'colorTop', type: 'select', label: 'app.color_top', desc: 'app.color_top_desc',
        options: this.plaColors, default: '#1a1a1a', category: 'borders'
      }
    ];
  }

  generate3DModel(params) {
    if (!this.currentSvgShapes?.length) return false;

    this.clear();

    const baseThickness = this.numberParam(params.baseThickness, 1.6);
    const topThickness = this.numberParam(params.topThickness, 0.6);
    const borderWidth = this.numberParam(params.borderWidth, 1);
    const baseMargin = this.numberParam(params.baseMargin, 3);
    const targetWidth = this.numberParam(params.targetWidth, 80);
    const targetDepth = this.numberParam(params.targetDepth, 80);

    if (params.colorBase) this.partMaterials.base.color.set(params.colorBase);
    if (params.colorTop) this.partMaterials.top.color.set(params.colorTop);

    const extractedShapes = this.currentSvgShapes.map(shape => shape.extractPoints(10));
    const bounds = this.getBounds(extractedShapes);
    if (!bounds) return false;

    const sourceWidth = bounds.maxX - bounds.minX;
    const sourceHeight = bounds.maxY - bounds.minY;
    this.svgAspectRatio = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 1;
    this.svgNaturalWidth = sourceWidth;
    this.svgNaturalHeight = sourceHeight;

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const scaleX = sourceWidth > 0 ? targetWidth / sourceWidth : 1;
    const scaleY = sourceHeight > 0 ? targetDepth / sourceHeight : 1;
    const clipperScale = 1000;
    const toClipperPath = points => points.map(point => ({
      X: Math.round((point.x - centerX) * scaleX * clipperScale),
      Y: Math.round(-(point.y - centerY) * scaleY * clipperScale)
    }));

    const sourcePaths = [];
    extractedShapes.forEach(points => {
      if (points.shape.length >= 3) sourcePaths.push(toClipperPath(points.shape));
      points.holes.forEach(hole => {
        if (hole.length >= 3) sourcePaths.push(toClipperPath(hole));
      });
    });
    if (!sourcePaths.length) return false;

    const borderPaths = this.offsetPaths(sourcePaths, borderWidth / 2, clipperScale);
    const basePaths = this.offsetPaths(sourcePaths, baseMargin + borderWidth / 2, clipperScale);
    this.createBaseMeshes(basePaths, baseThickness, clipperScale);
    this.createBorderMeshes(borderPaths, baseThickness + topThickness, clipperScale);

    return true;
  }

  numberParam(value, fallback) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  getBounds(shapes) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    shapes.forEach(points => {
      [...points.shape, ...points.holes.flat()].forEach(point => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
    });
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  }

  offsetPaths(paths, distance, scale) {
    const offset = new ClipperLib.ClipperOffset(2, 0.25 * scale);
    offset.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    const result = new ClipperLib.Paths();
    offset.Execute(result, distance * scale);
    return result;
  }

  createBaseMeshes(paths, height, scale) {
    const toVector2 = path => path.map(point => new THREE.Vector2(point.X / scale, point.Y / scale));
    const contours = this.getContours(paths);

    contours
      .filter(contour => contour.depth === 0)
      .forEach((contour, index) => {
        const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(toVector2(contour.path)), {
          depth: height,
          bevelEnabled: false,
          curveSegments: 12
        });
        const mesh = new THREE.Mesh(geometry, this.partMaterials.base);
        mesh.name = `Base_${index + 1}`;
        this.group.add(mesh);
      });
  }

  createBorderMeshes(paths, height, scale) {
    const toVector2 = path => path.map(point => new THREE.Vector2(point.X / scale, point.Y / scale));
    const contours = this.getContours(paths);

    const shapes = new Map();
    contours.forEach(contour => {
      if (contour.depth % 2 === 0) {
        shapes.set(contour, new THREE.Shape(toVector2(contour.path)));
      }
    });
    contours.forEach(contour => {
      if (contour.depth % 2 === 0) return;
      let parent = contour.parent;
      while (parent && parent.depth % 2 !== 0) parent = parent.parent;
      if (parent && shapes.has(parent)) {
        shapes.get(parent).holes.push(new THREE.Path(toVector2(contour.path)));
      }
    });

    [...shapes.values()].forEach((shape, index) => {
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 12 });
      const mesh = new THREE.Mesh(geometry, this.partMaterials.top);
      mesh.name = `Border_${index + 1}`;
      this.group.add(mesh);
    });
  }

  getContours(paths) {
    const contours = paths
      .filter(path => path.length >= 3)
      .map(path => ({ path, area: Math.abs(ClipperLib.Clipper.Area(path)), parent: null, depth: 0 }));

    contours.forEach((contour, index) => {
      let closestParent = null;
      contours.forEach((candidate, candidateIndex) => {
        if (index === candidateIndex || candidate.area <= contour.area) return;
        if (ClipperLib.Clipper.PointInPolygon(contour.path[0], candidate.path) === 0) return;
        if (!closestParent || candidate.area < closestParent.area) closestParent = candidate;
      });
      contour.parent = closestParent;
      contour.depth = closestParent ? closestParent.depth + 1 : 0;
    });
    return contours;
  }
}