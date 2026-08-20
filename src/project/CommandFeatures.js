import { spawn } from "child_process";

// const evaluatorPath = new URL("evaluateExpression.js", import.meta.url)
//   .pathname;
const oriPath = new URL(
  "../../node_modules/@weborigami/origami/src/cli/cli.js",
  import.meta.url,
).pathname;

export default function CommandFeatures(Base) {
  return class extends Base {
    async runCommand(index) {
      const command = this.config?.projectorCommands?.[index];
      if (!command) {
        console.warn(`No command found at index ${index}`);
        return;
      }

      const expression = `config.ori/projectorCommands[${index}].click()`;
      const promise = new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [oriPath, expression], {
          cwd: this._rootPath,
          env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: "1",
          },
          stdio: "pipe",
        });

        child.stdout.on("data", (data) => {
          console.log(data.toString());
        });

        child.stderr.on("data", (data) => {
          console.error(data.toString());
        });

        child.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Command exited with code ${code}`));
          }
        });
      });

      await promise;
    }
  };
}
