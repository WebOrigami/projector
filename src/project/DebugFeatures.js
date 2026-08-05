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

    async close() {
      await super.close?.();
      await this.stopDebugger();
    }

    isDebuggerRunning() {
      return this._debugger !== null;
    }

    async startDebugger() {
      if (this._debugger) {
        console.warn("Tried to start debugger but it's already running");
        return;
      }

      const dirname = path.dirname(fileURLToPath(import.meta.url));
      const srcPath = path.join(dirname, "..");

      const { sitePath } = this.state;
      const siteTerm = sitePath !== "." ? `...<${sitePath}>, ` : "";

      // The expression we serve is the current tree plus the debugger files
      const expression = `{
        ...<.>,
        ${siteTerm}_debugger: <${srcPath}/renderer>
      }`;

      this._debugger = await debugParent({
        expression,
        parentPath: this._root.path,
      });

      this._debugger.on("change", (event) => {
        const { filePath } = event;
        console.log(`${filePath} changed`);
      });

      const origin = this._debugger.origin;
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
