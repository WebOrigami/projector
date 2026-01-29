import updateState from "../renderer/updateState.js";

/**
 * Base application object
 *
 * This holds the top-level application state. We factor this out from
 * ProjectorApp so that it can be reused in tests.
 */
export default class AppBase {
  constructor() {
    // Internal state
    this._isFileOpen = false;

    // State shared with the project and window manager
    this._state = {
      openProjects: [],
      recentProjects: [],
      projects: {},
    };
  }

  getProjectSettings(project) {
    return this._state.projects[project.root.path] ?? {};
  }

  async render(state, changed) {
    if (changed.openProjects) {
      // Update isFileOpen based on the new active project
      const activeProjectPath = state.openProjects.at(-1);
      const activeProjectSettings = state.projects[activeProjectPath] || {};
      const recentFiles = activeProjectSettings.recentFiles || [];
      this._isFileOpen = recentFiles.length > 0;
    }
  }

  async setProjectSettings(project, settings) {
    const { root } = project;
    if (!root?.path) {
      return;
    }

    const oldSettings = this._state.projects[root.path] || {};
    const { newState: newSettings, changed: changedSettings } = updateState(
      oldSettings,
      settings,
    );

    if (Object.keys(changedSettings).length === 0) {
      // No changes
      return;
    }

    if (changedSettings.recentFiles) {
      // File may have been created
      const isActiveProject = this._state.openProjects.at(-1) === root.path;
      if (isActiveProject) {
        // Refresh isFileOpen state
        this._isFileOpen = newSettings.recentFiles.length > 0;
      }
    }

    const projects = Object.assign({}, this._state.projects, {
      [root.path]: newSettings,
    });
    return this.setState({
      projects,
    });
  }

  async setState(changes) {
    const { newState, changed } = updateState(this._state, changes);
    this._state = newState;
    await this.render(this._state, changed);
  }

  get state() {
    return this._state;
  }
}
