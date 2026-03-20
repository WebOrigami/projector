import { debugParent } from "@weborigami/origami";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Mixin defining project feature related to debugging
 */
export default function DebugFeatures(Base) {
  return class extends Base {
    constructor(...args) {
      super(...args);

      this._debugger = null;
    }

    async startDebugger() {
      if (this._debugger) {
        console.warn("Tried to start debugger but it's already running");
        return;
      }

      const dirname = path.dirname(fileURLToPath(import.meta.url));
      const debugFilesPath = path.join(dirname, "../renderer");

      this._debugger = await debugParent({
        debugFilesPath,
        enableUnsafeEval: true,
        expression: ".",
        parentPath: this._root.path,
      });

      // Wait for debugger's "ready" event
      const origin = await new Promise((resolve) => {
        this._debugger.once("ready", (event) => resolve(event.origin));
      });

      await this.setState({ origin });
    }

    async stopDebugger() {
      if (this._debugger) {
        await this._debugger.close();
        this._debugger = null;
      }
    }
  };
}
