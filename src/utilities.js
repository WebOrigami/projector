import { isPlainObject, Tree } from "@weborigami/async-tree";

// Return the path of the site relative to the project root
export async function getSitePath(packageData) {
  // Check for `$` global first
  // if (globals?.$) {
  //   let site = globals.$;
  //   if (isUnpackable(site)) {
  //     site = await site.unpack();
  //   }
  //   return site;
  // }

  // Check if we have package.json data
  if (!packageData) {
    return null;
  }

  // Get the `start` script
  const startScript = packageData.scripts?.start;
  if (!startScript) {
    return null;
  }

  // Look for the first path to a .ori file in the start script
  const sitePathRegex = /[A-Za-z0-9\/\.\-]*\.ori[A-Za-z0-9\/\.\-]*/g;
  const match = startScript.match(sitePathRegex);
  if (!match) {
    return null;
  }

  const relativePath = match[0];
  return relativePath;
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
