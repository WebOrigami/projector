import { compile } from "@weborigami/language";
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

  let source;
  if (document.filePath) {
    source = `<${document.filePath}>/`;
  } else {
    source = await document.getText();
  }

  const text = await evaluate(source, { globals, parent });
  const body = `<pre>${text}</pre>`;

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  });
}

export function registerOrigamiProtocol() {
  protocol.handle("origami", handleRequest);
}
