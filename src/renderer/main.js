import updateState from "./updateState.js";
import View from "./view/View.js";

/**
 * Main entry point for the renderer process
 */

// Create the page state shared with the Project object in the main process
const state = {};

// Create the view singleton
const view = new View();

// Define globals and add methods to window so main process can call them and so
// we can easily inspect them in the console
Object.assign(window, {
  focusCommand() {
    window.command.focus();
    window.command.select();
  },

  focusEditor() {
    window.editor.focus();
  },

  setState(changes) {
    const { newState, changed } = updateState(window.state, changes);
    window.state = newState;
    window.view.render(window.state, changed);
  },

  state,

  view,
});

// Tell the view when the DOM is ready
window.addEventListener("DOMContentLoaded", () => {
  window.view.loaded();
});

// Subscribe to state changes from main process and save the unsubscribe function
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
