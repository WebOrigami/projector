import { isPlainObject, isPrimitive, Tree } from "@weborigami/async-tree";
import {
  formatError as cliFormatError,
  markers,
  parse,
} from "@weborigami/language";
import { Origami } from "@weborigami/origami";
import * as path from "node:path";

export function formatError(error) {
  let message = cliFormatError(error);
  // Remove ANSI escape codes from the message.
  message = message.replace(/\x1b\[[0-9;]*m/g, "");
  // Prevent HTML in the error message from being interpreted as HTML.
  message = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return message;
}

// For a path like `path/to/site.ori/public`, return `path/to/site.ori`
export function getSiteFilePath(root, sitePath) {
  if (!sitePath) {
    return null;
  }
  const parts = sitePath.split(/\/|\\/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part.endsWith(".ori")) {
      return path.join(root.path, parts.slice(0, i + 1).join(path.sep));
    }
  }
  return null;
}

// Return the path of the site relative to the project root
export function getSitePath(packageData) {
  // Check if we have package.json data
  if (!packageData) {
    return ".";
  }

  const scripts = ["dev", "start", "serve", "build"];
  for (const scriptName of scripts) {
    const script = packageData.scripts?.[scriptName];
    const sitePath = getSitePathFromScript(script);
    if (sitePath) {
      return sitePath;
    }
  }

  return ".";
}

function getSitePathFromScript(script) {
  if (!script) {
    return null;
  }

  const sitePathRegex = /[A-Za-z0-9\/\.\-]*\.ori[A-Za-z0-9\/\.\-]*/g;
  const match = script.match(sitePathRegex);
  if (!match) {
    return null;
  }

  return match[0];
}

/**
 * Returns true if the object is "simple": a plain object or array that does not
 * have any getters in its deep structure.
 *
 * This test is used to avoid serializing complex objects to YAML.
 *
 * @param {any} object
 */
export function isSimpleObject(object) {
  if (!(object instanceof Array || isPlainObject(object))) {
    return false;
  }

  for (const key of Object.keys(object)) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor) {
      continue; // not sure why this would happen
    } else if (typeof descriptor.get === "function") {
      return false; // Getters aren't simple
    } else if (isPrimitive(descriptor.value)) {
      continue; // Primitives are simple
    } else if (!isSimpleObject(descriptor.value)) {
      return false; // Deep structure wasn't simple
    }
  }

  return true;
}

/**
 * The user is viewing the HTML result of a command and clicks a link on the
 * given href.
 *
 * If the href is:
 *
 * * an external URL: return null.
 * * an absolute path: add that to the site path.
 * * otherwise: resolve it against the command.
 *
 * When resolving against a command, if the command is already a path traversal
 * we extend it. If it's not, we enclose the entire command in parentheses and
 * then extend it.
 *
 * @param {string} href
 * @param {string} command
 * @param {string} sitePath
 */
export function resolveHref(href, command, sitePath) {
  if (URL.canParse(href)) {
    // If we can parse it as a URL, it's external.
    return null;
  }

  if (path.isAbsolute(href)) {
    return path.join(sitePath, href);
  }

  let trimmed = command.trim();
  let isTraversal;
  try {
    const parsed = parse(trimmed, {
      grammarSource: {
        text: trimmed,
      },
      mode: "shell",
      startRule: "expression",
    });
    isTraversal = parsed[0] === markers.traverse;
  } catch (e) {
    // This shouldn't happen: for the user to be clicking on a link, the command
    // must have already executed successfully.
    isTraversal = false;
  }

  if (!isTraversal) {
    // Wrap in parentheses and append the path
    return `(${trimmed})/${href}`;
  }

  // Extend the path using URL rules
  const base = new URL(trimmed, "http://fake");
  const resolved = new URL(href, base);
  const pathname = resolved.pathname;
  return pathname.startsWith("/") ? pathname.slice(1) : pathname;
}

/**
 * Apply preprocessing to the resource before constructing a response.
 */
export async function preprocessResource(resource) {
  if (resource instanceof Function) {
    // Invoke the function to get the final desired result
    resource = await resource();
  }

  if (Tree.isMaplike(resource)) {
    // Note: the following operations can invoke project code, so may throw
    let map = await Tree.from(resource);
    let indexHtml = await map.get("index.html");
    if (indexHtml instanceof Function) {
      indexHtml = await indexHtml(); // Get the actual index page
    }
    if (indexHtml) {
      // Return index.html page
      resource = indexHtml;
    } else if (isSimpleObject(resource)) {
      // Serialize to YAML
      resource = await Origami.yaml(map);
    } else {
      // Return index page
      resource = await Origami.indexPage(map);
    }
  }

  return resource;
}
