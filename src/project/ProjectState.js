import updateState from "../renderer/updateState.js"; // Shared with renderer

export default function ProjectState(Base) {
  return class extends Base {
    constructor(...args) {
      super(...args);
      this.state = {};
    }

    async setState(changes) {
      const { newState, changed } = updateState(this.state, changes);
      this.state = newState;
      return { newState, changed };
    }
  };
}
