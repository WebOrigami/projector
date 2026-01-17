import {
  FileMap,
  getRealmObjectPrototype,
  ObjectMap,
  Tree,
} from "@weborigami/async-tree";
import { formatError } from "@weborigami/language";
import { constructResponse, keysFromUrl, Origami } from "@weborigami/origami";
import { protocol } from "electron";
import { isSimpleObject } from "./utilities.js";

const TypedArray = Object.getPrototypeOf(Uint8Array);

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

async function getSessionTree(session) {
  let tree = treeForSession.get(session);
  if (!tree) {
    // The basic tree is the result and the renderer files
    tree = new ObjectMap({
      get _result() {
        return session.project.result;
      },
      renderer,
    });

    treeForSession.set(session, tree);
  }

  return tree;
}

async function handleRequest(request, session) {
  let tree = await getSessionTree(session);

  // If the project has a site, merge that in
  const site = await session.project.site;
  if (site) {
    tree = await Tree.merge(tree, site);
  }

  // The request `url` is a string
  const url = new URL(request.url, "origami://");
  console.log(request.url);

  const keys = keysFromUrl(url);

  let resource;
  try {
    resource = await Tree.traverseOrThrow(tree, ...keys);
  } catch (error) {
    resource = error;
  }

  if (
    typeof resource === "string" ||
    resource instanceof ArrayBuffer ||
    resource instanceof TypedArray
  ) {
    // Return as is
  } else if (resource == null) {
    return new Response(null, { status: 404 });
  } else if (resource instanceof Error) {
    return respondWithError(resource);
  } else if (
    !(resource instanceof Array) &&
    (typeof resource !== "object" ||
      resource.toString !== getRealmObjectPrototype(resource)?.toString)
  ) {
    resource = resource.toString();
  } else if (Tree.isMaplike(resource)) {
    let map = await Tree.from(resource);
    const indexHtml = await map.get("index.html");
    if (indexHtml) {
      // Return index.html page
      resource = indexHtml;
    } else if (await isSimpleObject(resource)) {
      // Serialize to YAML
      resource = await Origami.yaml(map);
    } else {
      // Return index page
      resource = await Origami.indexPage(map);
    }
  }

  let requestForResponse = request;
  if (url.pathname === "/_result") {
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
