import { app } from "#electron";
import fs from "node:fs";
import path from "node:path";
import AppBase from "./AppBase.js";

const settingsFileName = "settings.json";
const settingsPath = path.join(app.getPath("userData"), settingsFileName);

/**
 * Main Projector application object
 *
 * In addition to holding app state, this wires together the window manager, the
 * set of open projects, and the settings storage.
 */
export default class ProjectorApp extends AppBase {
  constructor() {
    super();

    try {
      const json = fs.readFileSync(settingsPath, "utf8");
      const data = JSON.parse(json);
      Object.assign(this._state, data);
    } catch (error) {
      // File doesn't exist or is invalid, will use default state
    }
  }

  async render(state, changed) {
    await super.render(state, changed);

    // if (changed.openProjects) {
    //   // Window manager
    // }

    // if (changed.openProjects || changed.recentProjects) {
    //   await createMenu();
    // }

    if (Object.keys(changed).length > 0) {
      await this.saveSettings();
    }
  }

  // Save updated settings to disk
  async saveSettings() {
    try {
      const json = JSON.stringify(this._state, null, 2);
      await fs.promises.writeFile(settingsPath, json, "utf8");
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  }
}
