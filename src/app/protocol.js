import { protocol } from "#electron";
import {
  AsyncMap,
  FileMap,
  isUnpackable,
  trailingSlash,
  Tree,
} from "@weborigami/async-tree";
import { constructResponse, keysFromUrl } from "@weborigami/origami";
import { defaultResultHref } from "../renderer/shared.js";
import { formatError, preprocessResource } from "../utilities.js";

// Client-side files used by the renderer are also served via origami: protocol
const rendererUrl = new URL("../renderer", import.meta.url);
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
async function handleRequest(request, session, debugTree) {
  // The request `url` is a string
  const url = new URL(request.url, "origami://");
  console.log(request.url);

  const keys = keysFromUrl(url);
  let resource;
  try {
    // resource = await traverse(session.project, ...keys);
    resource = await Tree.traverseOrThrow(debugTree, ...keys);
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
  const debugTree = composeDebugTree(ses.project);
  ses.protocol.handle("origami", (request) =>
    handleRequest(request, ses, debugTree),
  );
}

// Copied from Origami server -- should be shared but that implementation
// assumes a Node.js response object.
async function respondWithError(error) {
  const message = await formatError(error);
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
 * Return a tree that combines the site, the result, and the renderer files.
 */
function composeDebugTree(project) {
  return Object.assign(new AsyncMap(), {
    async get(key) {
      const normalizedKey = trailingSlash.remove(key);
      if (normalizedKey === "_renderer") {
        return renderer;
      } else if (normalizedKey === "_result") {
        // _result/foo and _result/_default/foo are synonyms
        const result = project.result;
        return async (key) => {
          if (trailingSlash.remove(key) === "_default") {
            return result;
          }
          let tree = result;
          if (isUnpackable(tree)) {
            tree = await tree.unpack();
          }
          tree = Tree.from(tree);
          return tree.get(key);
        };
      }

      return project.site.then((site) => Tree.from(site).get(key));
    },

    async *keys() {
      const site = Tree.from(await project.site);
      return site.keys();
    },
  });
}
