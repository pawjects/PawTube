/**
 * PawTube - Frontend Instance Manager
 */

import { getCustomInstance, setCustomInstance } from '../../storage/preferences/preferencesStorage.js';

export class InstanceManager {
  static getCustom() {
    return getCustomInstance();
  }

  static setCustom(url) {
    setCustomInstance(url);
  }

  static clearCustom() {
    setCustomInstance('');
  }
}

export default InstanceManager;
