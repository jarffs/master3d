import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

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

  /**
   * Carrega e converte um SVG em formas 2D (THREE.Shape).
   * A extração de pontos e triangulação deve ser feita no generate3DModel.
   */
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
   * Limpeza de recursos ao destruir o motor.
   */
  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}
