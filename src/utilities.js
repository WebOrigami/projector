import { isPlainObject, Tree } from "@weborigami/async-tree";
import { formatError as cliFormatError } from "@weborigami/language";
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
    return null;
  }

  const scripts = ["dev", "start", "serve", "build"];
  for (const scriptName of scripts) {
    const script = packageData.scripts?.[scriptName];
    const sitePath = getSitePathFromScript(script);
    if (sitePath) {
      return sitePath;
    }
  }

  return null;
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
 * A simple object is defined as an object that does not have any keys
 * containing a period (.) and does not have any getters.
 *
 * @param {any} object
 */
export async function isSimpleObject(object) {
  const keys = await Tree.keys(object);
  const isPlain = isPlainObject(object);

  for (const key of keys) {
    if (isPlain) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (descriptor && typeof descriptor.get === "function") {
        return false;
      }
    }

    if (typeof key === "string") {
      if (key.includes(".")) {
        return false;
      }
    }
  }

  return true;
}
