import { compile } from "@weborigami/language";
import { constructResponse } from "@weborigami/origami";
import { BrowserWindow, protocol } from "electron";

// Register the custom protocol at the module's top level so it happens before
// the app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: "origami",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

async function evaluate(source, options = {}) {
  const fn = compile.expression(source, options);

  let value = await fn();
  if (value instanceof Function) {
    value = await value();
  }

  return value;
}

async function handleRequest(request) {
  const window = BrowserWindow.getFocusedWindow();
  const { document } = window;
  const globals = await document.getGlobals();
  const parent = await document.getParent();

  let source = await document.getCommand();
  if (!source) {
    source = `<${document.filePath}>/`;
  }

  const text = await evaluate(source, {
    globals,
    mode: "shell",
    parent,
  });

  const response = await constructResponse(null, text);
  Object.assign(response.headers, {
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Opener-Policy": "same-origin",
  });

  return response;
}

export function registerOrigamiProtocol() {
  protocol.handle("origami", handleRequest);
}
