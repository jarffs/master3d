import * as THREE from 'three';
import { BaseEngine } from './BaseEngine.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

const STL_PATH = '/assets/center_cap/60mm-center-cap.stl';
const ORIGINAL_DIAMETER = 60; // mm — diameter of the base STL

/**
 * CenterCapEngine — Generates customizable wheel center caps.
 * 
 * Loads a base 60mm STL center cap, allows resizing (X/Y only),
 * applying SVG logos via CSG boolean (emboss/engrave), and exports as 3MF.
 * The flat face sits at Z=0 (print bed).
 */
export class CenterCapEngine extends BaseEngine {
  constructor(scene) {
    super(scene);
    this.name = 'center_cap';
    this._generation = 0;
    this._baseGeometry = null;
    this._stlLoaded = false;
    this._stlLoadPromise = null;

    this.evaluator = new Evaluator();
    this.evaluator.useGroups = false;
    this.evaluator.attributes = ['position', 'normal'];

    this.plaColors = [
      { value: '#1a1a1a', label: 'app.color_black' },
      { value: '#ffffff', label: 'app.color_white' },
      { value: '#c0c0c0', label: 'app.color_silver' },
      { value: '#dc2626', label: 'app.color_red' },
      { value: '#2563eb', label: 'app.color_blue' },
      { value: '#eab308', label: 'app.color_yellow' },
      { value: '#16a34a', label: 'app.color_green' },
      { value: '#f97316', label: 'app.color_orange' }
    ];

    this.partMaterials = {
      base: new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.3,
        metalness: 0.6,
        side: THREE.DoubleSide
      }),
      logo: new THREE.MeshStandardMaterial({
        color: 0xc0c0c0,
        roughness: 0.3,
        metalness: 0.4,
        side: THREE.DoubleSide
      })
    };

    // Start loading the STL immediately
    this._loadBaseSTL().catch(() => {});
  }

  /**
   * Loads the base STL geometry once and caches it.
   */
  _loadBaseSTL() {
    if (this._stlLoadPromise) return this._stlLoadPromise;

    this._stlLoadPromise = new Promise((resolve, reject) => {
      const loader = new STLLoader();
      loader.load(
        STL_PATH,
        (geometry) => {
          geometry.computeBoundingBox();
          const box = geometry.boundingBox;

          // Center the geometry on X/Y (should already be centered, but just in case)
          const centerX = (box.min.x + box.max.x) / 2;
          const centerY = (box.min.y + box.max.y) / 2;
          const minZ = box.min.z;

          // Translate so the flat face is exactly at Z=0 and centered on X/Y
          geometry.translate(-centerX, -centerY, -minZ);
          geometry.computeBoundingBox();
          geometry.computeVertexNormals();

          this._baseGeometry = geometry;
          this._stlLoaded = true;
          resolve(geometry);
        },
        undefined,
        (error) => {
          console.error('Error loading center cap STL:', error);
          this._stlLoadPromise = null;
          reject(error);
        }
      );
    });

    return this._stlLoadPromise;
  }

  getControlSchema() {
    return [
      // -- Dimensions --
      {
        id: 'capDiameter',
        type: 'slider',
        label: 'app.center_cap_diameter',
        desc: 'app.center_cap_diameter_desc',
        min: 50,
        max: 75,
        step: 0.5,
        default: 60,
        suffix: 'mm',
        category: 'center_cap_dimensions'
      },
      // -- Design --
      {
        id: 'logoDepth',
        type: 'slider',
        label: 'app.center_cap_logo_depth',
        desc: 'app.center_cap_logo_depth_desc',
        min: 0.3,
        max: 2,
        step: 0.1,
        default: 0.8,
        suffix: 'mm',
        category: 'center_cap_design'
      },
      {
        id: 'logoScale',
        type: 'slider',
        label: 'app.center_cap_logo_scale',
        desc: 'app.center_cap_logo_scale_desc',
        min: 50,
        max: 100,
        step: 1,
        default: 80,
        suffix: '%',
        category: 'center_cap_design'
      },
      {
        id: 'logoMode',
        type: 'select',
        label: 'app.center_cap_logo_mode',
        desc: 'app.center_cap_logo_mode_desc',
        options: [
          { value: 'emboss', label: 'app.center_cap_mode_emboss' },
          { value: 'engrave', label: 'app.center_cap_mode_engrave' }
        ],
        default: 'emboss',
        category: 'center_cap_design'
      },
      {
        id: 'colorBase',
        type: 'select',
        label: 'app.center_cap_color_base',
        desc: 'app.center_cap_color_base_desc',
        options: this.plaColors,
        default: '#1a1a1a',
        category: 'center_cap_design'
      },
      {
        id: 'colorLogo',
        type: 'select',
        label: 'app.center_cap_color_logo',
        desc: 'app.center_cap_color_logo_desc',
        options: this.plaColors,
        default: '#c0c0c0',
        category: 'center_cap_design'
      }
    ];
  }

  clear() {
    this._generation++;
    const geometries = new Set();
    this.group.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
    });
    geometries.forEach(geometry => geometry.dispose());
    this.group.clear();
    this.group.position.set(0, 0, 0);
  }

  async generate3DModel(params) {
    this.clear();
    const generation = ++this._generation;

    // Wait for STL to load
    await this._loadBaseSTL();
    if (generation !== this._generation) return false;

    // Apply material colors
    if (params.colorBase) this.partMaterials.base.color.set(params.colorBase);
    if (params.colorLogo) this.partMaterials.logo.color.set(params.colorLogo);

    const capDiameter = params.capDiameter || 60;
    const logoDepth = params.logoDepth || 0.8;
    const logoScale = (params.logoScale || 80) / 100;
    const logoMode = params.logoMode || 'emboss';

    // Calculate X/Y scale factor
    const scaleFactor = capDiameter / ORIGINAL_DIAMETER;

    // Clone the base geometry
    const scaledGeometry = this._baseGeometry.clone();
    
    scaledGeometry.scale(scaleFactor, scaleFactor, 1);
    scaledGeometry.computeBoundingBox();
    scaledGeometry.computeVertexNormals();

    // Check if we have SVG shapes to apply
    const hasSvg = this.currentSvgShapes && this.currentSvgShapes.length > 0;

    if (hasSvg) {
      // Build SVG logo geometries
      const logoGeometries = this._buildLogoGeometries(
        capDiameter, logoDepth, logoScale
      );

      if (logoGeometries && generation === this._generation) {
        const { cuttingGeometry, logoGeometry, embossGeometry } = logoGeometries;
        try {
          if (logoMode === 'emboss') {
            // Emboss: adds protruding logo on top of the flat face (-logoDepth to 0)
            const baseMesh = new THREE.Mesh(scaledGeometry, this.partMaterials.base);
            baseMesh.name = 'CenterCap_Base';
            this.group.add(baseMesh);

            const logoMesh = new THREE.Mesh(embossGeometry, this.partMaterials.logo);
            logoMesh.name = 'CenterCap_Logo';
            this.group.add(logoMesh);

            cuttingGeometry.dispose();
            logoGeometry.dispose();
          } else {
            // Engrave: cuts the layer with the SVG shape and keeps the inset piece (no deleted layer)
            const baseBrush = new Brush(scaledGeometry, this.partMaterials.base);
            const cutBrush = new Brush(cuttingGeometry, this.partMaterials.base);
            baseBrush.updateMatrixWorld();
            cutBrush.updateMatrixWorld();

            const resultMesh = this.evaluator.evaluate(baseBrush, cutBrush, SUBTRACTION);
            resultMesh.material = this.partMaterials.base;
            resultMesh.name = 'CenterCap_Base';
            this.group.add(resultMesh);

            const logoMesh = new THREE.Mesh(logoGeometry, this.partMaterials.logo);
            logoMesh.name = 'CenterCap_Logo';
            this.group.add(logoMesh);

            cuttingGeometry.dispose();
            scaledGeometry.dispose();
            embossGeometry.dispose();
          }
        } catch (error) {
          scaledGeometry.dispose();
          cuttingGeometry.dispose();
          logoGeometry.dispose();
          embossGeometry.dispose();
          this.clear();
          throw error;
        }
      } else {
        // No valid logo geometry, show plain cap
        const baseMesh = new THREE.Mesh(scaledGeometry, this.partMaterials.base);
        baseMesh.name = 'CenterCap';
        this.group.add(baseMesh);
      }
    } else {
      // No SVG loaded — plain cap
      const baseMesh = new THREE.Mesh(scaledGeometry, this.partMaterials.base);
      baseMesh.name = 'CenterCap';
      this.group.add(baseMesh);
    }

    // Center the model on X/Y
    const box = new THREE.Box3().setFromObject(this.group);
    const center = box.getCenter(new THREE.Vector3());
    this.group.position.x = -center.x;
    this.group.position.y = -center.y;
    this.group.position.z = -box.min.z;

    return true;
  }

  /**
   * Builds 3D logo geometries from the current SVG shapes.
   * Returns a cutting tool (slightly oversized in Z for clean CSG subtraction)
   * and a flush logo geometry that fills the cut pocket from Z=0 to Z=logoDepth.
   */
  _buildLogoGeometries(capDiameter, logoDepth, logoScale) {
    if (!this.currentSvgShapes || this.currentSvgShapes.length === 0) return null;

    // Extract points from SVG shapes
    const extractedShapes = this.currentSvgShapes.map(shape => this.extractShapePoints(shape));

    // Find SVG bounds
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    extractedShapes.forEach(pts => {
      pts.shape.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });

    const svgWidth = maxX - minX;
    const svgHeight = maxY - minY;
    if (!Number.isFinite(svgWidth) || !Number.isFinite(svgHeight) || (svgWidth <= 0 && svgHeight <= 0)) return null;

    // Scale SVG to fit within the cap face with the logoScale factor
    const targetSize = (capDiameter * 0.85) * logoScale;
    const svgScale = targetSize / Math.hypot(svgWidth, svgHeight);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Build Three.js shapes from SVG data
    const threeShapes = [];
    extractedShapes.forEach(pts => {
      const processPoint = (p) => {
        const cx = (p.x - centerX) * svgScale;
        const cy = (p.y - centerY) * svgScale;
        return new THREE.Vector2(cx, cy);
      };

      const shape = new THREE.Shape(pts.shape.map(processPoint));
      if (pts.holes) {
        pts.holes.forEach(hole => {
          shape.holes.push(new THREE.Path(hole.map(processPoint)));
        });
      }
      threeShapes.push(shape);
    });

    if (threeShapes.length === 0) return null;

    // Cutting tool geometry for clean boolean subtraction
    const cuttingGeometry = new THREE.ExtrudeGeometry(threeShapes, {
      depth: logoDepth + 0.02,
      bevelEnabled: false,
      curveSegments: 12
    });
    cuttingGeometry.translate(0, 0, -0.02);
    cuttingGeometry.computeVertexNormals();

    // Inset logo piece that perfectly fills the cut pocket from Z=0 to Z=logoDepth (engrave with separated color part)
    const logoGeometry = new THREE.ExtrudeGeometry(threeShapes, {
      depth: logoDepth,
      bevelEnabled: false,
      curveSegments: 12
    });
    logoGeometry.computeVertexNormals();

    // Emboss logo geometry protruding from the flat face (from Z = -logoDepth to Z = 0)
    const embossGeometry = new THREE.ExtrudeGeometry(threeShapes, {
      depth: logoDepth,
      bevelEnabled: false,
      curveSegments: 12
    });
    embossGeometry.translate(0, 0, -logoDepth);
    embossGeometry.computeVertexNormals();

    return { cuttingGeometry, logoGeometry, embossGeometry };
  }

  /**
   * Override _flattenForExport to ensure proper export with materials.
   */
  _flattenForExport() {
    const exportGroup = new THREE.Group();
    this.group.updateMatrixWorld(true);

    this.group.traverse(object => {
      if (!object.isMesh || !object.geometry || !object.geometry.attributes.position) return;
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = object.name || `Part_${exportGroup.children.length + 1}`;
      exportGroup.add(mesh);
    });

    return exportGroup;
  }

  dispose() {
    this.clear();
    if (this._baseGeometry) {
      this._baseGeometry.dispose();
      this._baseGeometry = null;
    }
    this.evaluator = null;
    this.scene.remove(this.group);
  }
}
