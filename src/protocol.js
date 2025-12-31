import { compile, jsGlobals } from "@weborigami/language";
import { BrowserWindow, protocol } from "electron";

// Register the custom protocol at the module's top level so it happens before
// the app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: "origami",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

async function evaluate(source) {
  const fn = compile.expression(source, {
    globals: jsGlobals,
    parent: null,
  });

  let value = await fn();
  if (value instanceof Function) {
    value = await value();
  }

  return value;
}

async function handleRequest(request) {
  const window = BrowserWindow.getFocusedWindow();
  const source = await window.document.getText();

  const text = await evaluate(source);
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
