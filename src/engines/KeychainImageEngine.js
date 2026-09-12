import { KeychainEngine } from './KeychainEngine.js';

export class KeychainImageEngine extends KeychainEngine {
  constructor(scene) {
    super(scene);
    this.name = 'keychain_image';
  }

  getControlSchema() {
    return super.getControlSchema().filter(control =>
      !['textContent', 'textFont', 'letterSpacing', 'lineSpacing'].includes(control.id)
    );
  }

  async generate3DModel(params) {
    if (!this.currentSvgShapes?.length) return false;
    this.clear();
    if (params.colorBase) {
      this.partMaterials.base.color.set(params.colorBase);
      this.partMaterials.ring.color.set(params.colorBase);
    }
    if (params.colorTop) this.partMaterials.top.color.set(params.colorTop);
    this.buildKeychain(params, this.currentSvgShapes, 0);
    return true;
  }
}
