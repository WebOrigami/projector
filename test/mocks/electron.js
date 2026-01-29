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

export class BrowserWindow {
  constructor() {
    const client = new MockClient();
    this._client = client;

    this.webContents = {
      send(...args) {
        if (args[0] === "invoke-page" && args[1] === "setState") {
          client.setState(args[2]);
        }
      },
    };
  }

  focus() {}

  static getAllWindows() {
    return [];
  }

  setDocumentEdited() {}

  setTitle() {}
}

export const dialog = {
  showMessageBox() {},
};

export class Menu {
  static buildFromTemplate(template) {
    return {};
  }

  static setApplicationMenu(menu) {}
}

class MockClient {
  constructor() {
    this.state = {};
  }

  setState(changes) {
    Object.assign(this.state, changes);
  }
}

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
