import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Tests load settings from a different location
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const settingsPath = path.join(
  moduleDirectory,
  "mocks/userData/settings.json",
);

// Erase the settings file used by tests
export async function eraseSettings() {
  await fs.rm(settingsPath, { force: true });
}
