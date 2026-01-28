/**
 * Mock Electron APIs for testing purposes
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

export const app = {
  // For faking settings path
  getPath(name) {
    const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
    return path.join(moduleDirectory, name);
  },

  name: "",

  on() {},

  whenReady() {
    return Promise.resolve();
  },
};

export const BrowserWindow = class {
  static getAllWindows() {
    return [];
  }

  focus() {}
};

export const dialog = {
  showMessageBox() {},
};

export const Menu = class {
  static buildFromTemplate(template) {
    return {};
  }

  static setApplicationMenu(menu) {}
};

export const protocol = {
  registerSchemesAsPrivileged() {},
};

export const session = {
  fromPartition(partition) {
    return {
      protocol: {
        handle(scheme, handler) {},
      },
    };
  },
};

export const shell = {
  openExternal() {},
};
