import { FileMap, trailingSlash, Tree } from "@weborigami/async-tree";
import { constructResponse, keysFromUrl } from "@weborigami/origami";
import { protocol } from "electron";
import { defaultResultHref } from "./renderer/shared.js";
import { formatError, preprocessResource } from "./utilities.js";

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

/**
 * Handle a request from the renderer via the origami: protocol
 */
async function handleRequest(request, session) {
  // The request `url` is a string
  const url = new URL(request.url, "origami://");
  console.log(request.url);

  const keys = keysFromUrl(url);
  let resource;
  try {
    resource = await traverse(session.project, ...keys);
    resource = await preprocessResource(resource);
  } catch (/** @type {any} */ e) {
    resource = e;
  }

  if (resource == null) {
    // Not found
    return new Response(null, { status: 404 });
  } else if (resource instanceof Error) {
    // Let project communicate errors to the renderer
    await session.project.setError(resource);
    return respondWithError(resource);
  }

  let requestForResponse = request;
  if (url.href === defaultResultHref) {
    // Use command as URL, might be able to use file extension to determine
    // media type
    requestForResponse = Object.create(request);
    Object.defineProperty(requestForResponse, "url", {
      value: new URL(session.project.command, "origami://").toString(),
      writable: false,
      enumerable: true,
      configurable: true,
    });
  }

  const response = await constructResponse(requestForResponse, resource);
  return response;
}

export function registerOrigamiProtocol(ses) {
  ses.protocol.handle("origami", (request) => handleRequest(request, ses));
}

// Copied from Origami server -- should be shared but that implementation
// assumes a Node.js response object.
function respondWithError(error) {
  const message = formatError(error);
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

/**
 * Traverse the given keys in a combination of the renderer, the project site,
 * and the project's current result.
 */
async function traverse(project, ...keys) {
  let tree;

  if (keys.length > 0 && trailingSlash.remove(keys[0]) === "_renderer") {
    // Serve from the renderer files
    keys.shift();
    tree = renderer;
  } else if (keys.length > 0 && trailingSlash.remove(keys[0]) === "_result") {
    // Traverse the result
    keys = keys.slice(1);
    if (keys.length > 0 && trailingSlash.remove(keys[0]) === "_default") {
      // Another way of traversing the result
      keys = keys.slice(1);
    }
    tree = project.result;
  } else {
    // Traverse the site
    tree = await project.site;
  }

  let resource;
  try {
    resource = await Tree.traverseOrThrow(tree, ...keys);
  } catch (/** @type {any} */ error) {
    return error;
  }

  return resource;
}
