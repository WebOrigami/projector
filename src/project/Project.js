import { isUnpackable, keysFromPath, Tree } from "@weborigami/async-tree";
import { projectGlobals, projectRootFromPath } from "@weborigami/language";
import * as path from "node:path";
import * as windowManager from "../app/windowManager.js";
import { getSitePath } from "../utilities.js";
import FileFeatures from "./FileFeatures.js";
import PageCommunication from "./PageCommunication.js";
import ProjectState from "./ProjectState.js";
import RunFeatures from "./RunFeatures.js";

/**
 * Project state
 */
export default class Project extends RunFeatures(
  FileFeatures(PageCommunication(ProjectState(Object))),
) {
  /**
   * Create a Project instance for the project root path, running in the given
   * window, in the given Projector application instance.
   *
   * To be used, the project must be loaded via loadProject(), which is async so
   * can't be called from the constructor.
   *
   * @param {string} rootPath
   * @param {import("electron").BrowserWindow} window
   * @param {import("../app/AppBase.js").default} projector
   */
  constructor(rootPath, window, projector) {
    super();
    this._rootPath = rootPath;
    this._window = window;
    this._projector = projector;

    // Internal state
    this._packageData = null;
    this._root = null;
    this._site = null;

    // State shared with the renderer
    Object.assign(this.state, {
      projectName: "New project",
      sitePath: null,
    });
  }

  // Project window is closing
  close() {
    // Stop any file watching
    // @ts-ignore unwatch() does exist but isn't declared yet
    this._root?.unwatch();

    // Break connection to window
    /** @type {any} */ (this._window) = null;
  }

  /**
   * (Re)load the project from the folder with the given root path.
   */
  async loadProject() {
    this._root = await projectRootFromPath(this._rootPath);

    // Force determination of project globals so we can patch them
    await projectGlobals(this._root);
    const globals = /** @type {any}  */ (this._root).globals;
    // Add all Dev globals at top level for convenience and to match CLI
    Object.assign(globals, globals.Dev);

    this._packageData = await getPackageData(this._root);
    const projectName = getProjectName(this._root, this._packageData);

    const sitePath = getSitePath(this._packageData);
    this._site = null;

    const projectSettings = await this._projector.getProjectSettings(this);
    const lastRunCrashed = projectSettings.lastRunCrashed || false;
    const recentCommands = projectSettings.recentCommands || [];
    const recentFiles = projectSettings.recentFiles || [];

    let command;
    // Use last command if it exists, otherwise run site if that exists
    if (recentCommands.length > 0) {
      command = recentCommands.at(-1);
    } else if (sitePath) {
      command = `${sitePath}/`;
    } else {
      command = "";
    }

    await this.setState({
      command,
      lastRunCrashed,
      projectName,
      recentCommands,
      recentFiles,
      sitePath,
    });

    // Watch for file changes in the project file tree
    const project = this;
    this._root.addEventListener("change", async (/** @type {any} */ event) => {
      if (!project._window) {
        debugger;
      }
      const { filePath } = event.options;
      await this.onChange(filePath);
    });
    // @ts-ignore watch() does exist but isn't declared yet
    this._root.watch();

    if (recentFiles.length > 0) {
      await this.loadMostRecentFile();
    } else if (sitePath) {
      // No recent files, load the site file
      const absolutePath = path.join(this._root.path, sitePath);
      await this.loadFile(absolutePath);
    }

    // If the last run didn't crash, auto-run the last command
    if (!lastRunCrashed && command) {
      await this.run();
    }
  }

  get name() {
    return this.state.projectName;
  }

  async onChange(filePath) {
    if (!this._root) {
      // Project not loaded yet
      return;
    }

    const relativePath = path.relative(this._root.path, filePath);

    const keys = keysFromPath(relativePath);
    if (keys.length > 0 && keys[0].startsWith(".") && keys[0].endsWith("/")) {
      // Ignore changes in root-level dot folders like `.git`
      return;
    }

    if (filePath !== this._filePath) {
      // Editing some file that's not the active file
      await this.clearCacheForFileChange(filePath);

      if (relativePath === "package.json" || relativePath === "config.ori") {
        // Need to reload project: project name, site, and config/globals may
        // have changed.
        await this.loadProject();
        await windowManager.addToRecentProjects(this); // in case name changed
        return;
      }

      if (relativePath === this.state.sitePath) {
        // Will need to reload site
        this._site = null;
      }

      if (!this._refreshTimeout) {
        // If we haven't already queued a refresh, do so now
        this.restartRefreshTimeout();
      }
      return;
    }

    if (this.state.dirty) {
      // User has edited file, ignore external changes
      return;
    }

    // See if file text has actually changed
    const text = this.loadFileText(filePath);
    if (text === this.state.text) {
      // Change event was result of our own save, ignore
      return;
    }

    // Force reload of current file through our normal path
    await this.loadMostRecentFile();

    await this.clearCacheForFileChange(filePath);
    if (!this._refreshTimeout) {
      // Refresh immediately
      this.refresh();
    }
  }

  get root() {
    return this._root;
  }

  // Tell the app to save project-specific settings
  async saveSettings() {
    // Remove null (unsaved) files from recent files
    const recentFiles = this.state.recentFiles.filter(
      (filePath) => filePath !== null,
    );

    const projectSettings = {
      lastRunCrashed: this.state.lastRunCrashed,
      recentCommands: this.state.recentCommands,
      recentFiles,
    };

    await this._projector.setProjectSettings(this, projectSettings);
  }

  // Used by protocol to signal error to renderer
  async setError(error) {
    // Don't overwrite an error already present in state
    if (!this.state.error) {
      await this.setState({ error });
    }
  }

  async setState(changes) {
    const { newState, changed } = await super.setState(changes);

    if (
      changed.lastRunCrashed ||
      changed.recentCommands ||
      changed.recentFiles
    ) {
      await this.saveSettings();
    }

    if (changed.projectName || changed.pageTitle || changed.dirty) {
      updateWindow(this._window, this.state);
    }

    return { newState, changed };
  }

  // Return a promise for the loaded site
  get site() {
    if (!this._site) {
      if (this.state.sitePath) {
        // Load site from path
        this._site = loadSite(this._root, this.state.sitePath);
      } else {
        // Use root as site
        this._site = this._root;
      }
    }

    return this._site;
  }

  get sitePath() {
    return this.state.sitePath;
  }

  get window() {
    return this._window;
  }
}

function getProjectName(root, packageData) {
  if (packageData?.name) {
    return packageData.name;
  }

  // Name is the name of the root folder
  const rootPath = root.path;
  return path.basename(rootPath);
}

async function getPackageData(root) {
  const packageJson = await root?.get("package.json");
  return packageJson?.unpack();
}

async function loadSite(root, sitePath) {
  // Evaluate the site file to get the site object
  let site;
  try {
    site = await Tree.traversePath(root, sitePath);
    if (isUnpackable(site)) {
      site = await site.unpack();
    }
  } catch (error) {
    return null;
  }

  return site;
}

// Reflect project state in the window
function updateWindow(window, state) {
  try {
    let title = state.projectName;
    if (state.pageTitle && state.pageTitle !== "") {
      title += ` — ${state.pageTitle}`;
    }
    window.setTitle(title);
    window.setDocumentEdited(state.dirty);
  } catch (error) {
    console.error("Failed to update window state:", error);
  }
}
