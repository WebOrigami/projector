/**
 * Mock Electron APIs for testing purposes
 */

export const app = {
  name: "",
  getPath(name) {
    return `/mock/path/${name}`;
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
