import updateState from "./updateState.js";
import View from "./view/View.js";

// Create the view singleton
window.view = new View();

// Page state shared with main process
window.state = {};

/**
 * Add methods to window so main process can call them
 */
Object.assign(window, {
  focusCommand() {
    window.command.focus();
    window.command.select();
  },

  focusEditor() {
    window.editor.focus();
  },

  setState(changes) {
    const { newState, changed } = updateState(state, changes);
    state = newState;
    window.view.render(state, changed);
  },
});

window.addEventListener("DOMContentLoaded", () => {
  window.view.loaded();
});

// Subscribe to state changes from main process
const invokePageMethodUnsubscribe = window.api.onInvokePageMethod(
  async (...args) => {
    const fnName = args.shift();
    const fn = window[fnName];
    if (fn instanceof Function) {
      return await fn(...args);
    } else {
      console.error(
        `Main process tried to invoke non-existent page method: ${fnName}`,
      );
    }
  },
);

// Unsubscribe from events when the window is unloaded to free memory
window.addEventListener("beforeunload", () => {
  invokePageMethodUnsubscribe();
});
