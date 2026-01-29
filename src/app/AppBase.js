import updateState from "../renderer/updateState.js";

/**
 * Base application object
 *
 * This holds the top-level application state. We factor this out from
 * ProjectorApp so that it can be reused in tests.
 */
export default class AppBase {
  constructor() {
    this._state = {
      openProjects: [],
      recentProjects: [],
      projects: {},
    };
  }

  getProjectSettings(project) {
    return this._state.projects[project.root.path] ?? {};
  }

  async render(state, changed) {}

  async setProjectSettings(project, settings) {
    const { root } = project;
    if (!root?.path) {
      return;
    }

    const { newState, changed } = updateState(this._state.projects, {
      [root.path]: settings,
    });
    if (Object.keys(changed).length === 0) {
      // No changes
      return;
    }

    return this.setState({
      projects: newState,
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
