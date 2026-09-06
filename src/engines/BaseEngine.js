import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { exportTo3MF } from 'three-3mf-exporter';

// Amostragem das curvas SVG: alvo de segmentos por contorno e limites por curva.
const TARGET_CONTOUR_SEGMENTS = 1200;
const MIN_CURVE_SEGMENTS = 12;
const MAX_CURVE_SEGMENTS = 256;

/**
 * Classe base para todos os motores de geração 3D.
 * Define a estrutura comum que cada ferramenta deve implementar.
 */
export class BaseEngine {
  constructor(scene) {
    this.name = 'BaseEngine';
    this.scene = scene;
    this.group = new THREE.Group();
    
    // Default material
    this.material = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.4,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    
    this.scene.add(this.group);
    this.currentSvgShapes = null;
    this.svgAspectRatio = 1;
    this.svgNaturalWidth = 0;
    this.svgNaturalHeight = 0;
  }

  /**
   * Retorna o schema de controles (UI) necessário para este motor.
   * O ControlBuilder usará isso para gerar a barra lateral.
   * Deve ser sobrescrito pelas classes filhas.
   */
  getControlSchema() {
    return [];
  }

  /**
   * Limpa o grupo 3D atual.
   */
  clear() {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      if (child.geometry) child.geometry.dispose();
      this.group.remove(child);
    }
  }

  loadSVG(svgText) {
    this.currentSvgShapes = this.parseSVG(svgText);
  }

  /**
   * Parseia um texto SVG e retorna as formas 2D extraídas (THREE.Shape).
   */
  parseSVG(svgText) {
    if (!svgText) return [];
    const loader = new SVGLoader();
    const svgData = loader.parse(svgText);
    const shapes = [];
    
    // Parse paths into Three.js shapes
    for (const path of svgData.paths) {
      const style = path.userData ? path.userData.style : null;
      
      if (style) {
        const fill = (style.fill || '').toLowerCase().replace(/\s/g, '');
        const rgb = fill.match(/^rgb\((\d+),(\d+),(\d+)\)$/);
        const isNearWhite = rgb && rgb.slice(1).every(value => Number(value) >= 245);
        // Ignore white paths (typically background from image tracing or explicit SVG backgrounds)
        if (isNearWhite || fill === '#ffffff' || fill === '#fff' || fill === 'white') {
          continue;
        }
        // Force fill to ensure stroked paths without fill are still processed as solid shapes
        style.fill = '#000';
      }
      
      const pathShapes = path.toShapes(true);
      shapes.push(...pathShapes);
    }
    return shapes;
  }

  /**
   * Equivalente a Shape.extractPoints(), mas distribuindo os segmentos pelo
   * comprimento de cada curva. O extractPoints() usa uma contagem fixa por
   * curva, o que reduz um círculo (uma única EllipseCurve) a um polígono
   * com poucos lados, independentemente do tamanho do modelo.
   */
  extractShapePoints(shape) {
    const chordLength = this._chordLength(shape);
    return {
      shape: this._curveToPoints(shape, chordLength),
      holes: (shape.holes || []).map(hole => this._curveToPoints(hole, chordLength))
    };
  }

  /**
   * Converte um contorno (Shape ou Path) numa lista de pontos.
   */
  extractContourPoints(curvePath) {
    return this._curveToPoints(curvePath, this._chordLength(curvePath));
  }

  _chordLength(curvePath) {
    const curves = curvePath.curves || [];
    const perimeter = curves.reduce((total, curve) => total + curve.getLength(), 0);
    return perimeter > 0 ? perimeter / TARGET_CONTOUR_SEGMENTS : 1;
  }

  _curveToPoints(curvePath, chordLength) {
    const curves = curvePath.curves || [];
    if (curves.length === 0) return curvePath.getPoints(MIN_CURVE_SEGMENTS);

    const points = [];
    curves.forEach((curve, index) => {
      const divisions = curve.isLineCurve
        ? 1
        : THREE.MathUtils.clamp(
            Math.ceil(curve.getLength() / chordLength),
            MIN_CURVE_SEGMENTS,
            MAX_CURVE_SEGMENTS
          );
      const curvePoints = curve.getPoints(divisions);
      // O primeiro ponto de cada curva repete o último ponto da curva anterior.
      points.push(...(index === 0 ? curvePoints : curvePoints.slice(1)));
    });
    return points;
  }

  /**
   * Gera o modelo 3D baseado nos parâmetros fornecidos.
   * Deve ser sobrescrito pelas classes filhas.
   */
  generate3DModel(params) {
    console.warn("generate3DModel não implementado na classe filha.");
    return false;
  }

  /**
   * Exporta o grupo atual como STL.
   */
  exportSTL(filename = 'model.stl') {
    const exporter = new STLExporter();
    const stlString = exporter.parse(this.group);
    
    const blob = new Blob([stlString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Achata a hierarquia em malhas de topo com as transformações já aplicadas:
   * o exportador 3MF processa um Mesh sem percorrer os filhos, pelo que peças
   * anexadas a outras peças (ex: parafusos) seriam descartadas.
   */
  _flattenForExport() {
    const exportGroup = new THREE.Group();
    this.group.updateMatrixWorld(true);

    this.group.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry || !obj.geometry.attributes.position) return;
      const geometry = obj.geometry.clone().applyMatrix4(obj.matrixWorld);
      const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = obj.name || `Part_${exportGroup.children.length + 1}`;
      exportGroup.add(mesh);
    });

    return exportGroup;
  }

  /**
   * Exporta o grupo atual como 3MF preservando cores.
   */
  async export3MF(filename = 'model.3mf') {
    const exportGroup = this._flattenForExport();
    if (exportGroup.children.length === 0) {
      console.error("Erro ao exportar 3MF: não há geometria para exportar.");
      return false;
    }

    try {
      const blob = await exportTo3MF(exportGroup);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      return true;
    } catch (e) {
      console.error("Erro ao exportar 3MF:", e);
      return false;
    } finally {
      exportGroup.children.forEach(mesh => mesh.geometry.dispose());
    }
  }

  /**
   * Limpeza de recursos ao destruir o motor.
   */
  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}
