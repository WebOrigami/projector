import { FileMap, ObjectMap, Tree } from "@weborigami/async-tree";
import { formatError } from "@weborigami/language";
import { constructResponse, keysFromUrl } from "@weborigami/origami";
import { protocol } from "electron";

const treeForSession = new WeakMap();

// Client-side files used by the renderer are also served via origami: protocol
const rendererUrl = new URL("renderer", import.meta.url);
const renderer = new FileMap(rendererUrl);

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

async function handleRequest(request, session) {
  let tree = treeForSession.get(session);
  if (!tree) {
    tree = new ObjectMap({
      get _result() {
        return session.project.result;
      },
      renderer,
    });
    treeForSession.set(session, tree);
  }

  // The request `url` is a string
  const url = new URL(request.url, "origami://");
  const keys = keysFromUrl(url);

  let resource;
  try {
    resource = await Tree.traverseOrThrow(tree, ...keys);
  } catch (error) {
    resource = error;
  }

  if (resource === undefined) {
    return new Response(null, { status: 404 });
  }
  if (resource instanceof Error) {
    return respondWithError(resource);
  }

  const response = await constructResponse(request, resource);
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
