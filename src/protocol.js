import { compile, formatError, moduleCache } from "@weborigami/language";
import { constructResponse } from "@weborigami/origami";
import { protocol } from "electron";
import * as recentCommands from "./recentCommands.js";

// Register the custom protocol at the module's top level so it happens before
// the app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: "origami",
    privileges: {
      corsEnabled: true,
      secure: true,
      standard: true,
      supportFetchAPI: true,
    },
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

async function handleRequest(request, session) {
  const project = session.project;
  const globals = await project.getGlobals();
  const parent = await project.getParent();

  let command = project.command;
  if (command) {
    recentCommands.addCommand(command);
  } else {
    command = `<${project.filePath}>/`;
  }

  // Reset the module cache so that modules are reloaded on each request
  moduleCache.resetTimestamp();

  let resource;
  try {
    resource = await evaluate(command, {
      globals,
      mode: "shell",
      parent,
    });
  } catch (error) {
    const response = new Response(null);
    return respondWithError(error, response);
  }

  const response = await constructResponse(null, resource);
  if (response) {
    Object.assign(response.headers, {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    });
  }

  return response;
}

export function registerOrigamiProtocol(ses) {
  ses.protocol.handle("origami", (request) => handleRequest(request, ses));
}

// Copied from Origami server -- should be shared but that implementation
// assumes a Node.js response object.
function respondWithError(error) {
  // Remove ANSI escape codes from the message.
  let message = formatError(error);
  message = message.replace(/\x1b\[[0-9;]*m/g, "");
  // Prevent HTML in the error message from being interpreted as HTML.
  message = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  console.error(message);

  const html = `<!DOCTYPE html>
<html>
<head>
<title>Error: ${error.message}</title>
</head>
<body>
<h1>Error</h1>
<pre><code>
${message}
</code></pre>
</body>
</html>
`;

  const response = new Response(html, {
    status: 500,
    headers: { "Content-Type": "text/html" },
  });
  return response;
}
