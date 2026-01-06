import updateState from "./updateState.js";
let state = {};

function renderState(changes) {
  const { newState, changed } = updateState(state, changes);
  state = newState;

  if (changed.command) {
    console.log("Updating command:", state.command);
    if (command.value !== state.command) {
      command.value = state.command;
    }
  }
  if (changed.text) {
    console.log("Updating text");
    if (editor.value !== state.text) {
      editor.value = state.text;
    }
  }
}

window.reloadResult = () => {
  // Force iframe to reload
  result.src = "origami://app/_result";
};

window.addEventListener("DOMContentLoaded", () => {
  editor.addEventListener("input", () => {
    // Notify main process that the content has changed
    window.api.updateState({
      dirty: true,
      text: editor.value,
    });
    result.classList.add("pending");
  });

  command.addEventListener("input", () => {
    // Notify main process that the command has changed
    window.api.updateState({ command: command.value });
  });
  command.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      !(event.shiftKey || event.ctrlKey || event.altKey)
    ) {
      event.preventDefault();
      window.api.runCommand();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      window.api.nextCommand();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      window.api.previousCommand();
    }
  });

  result.addEventListener("load", () => {
    result.classList.remove("pending");
  });

  editor.focus();
});

// Subscribe to state changes from main process
const unsubscribe = window.api.onStateChanged(renderState);

window.addEventListener("beforeunload", () => {
  // Unsubscribe from state changes when the window is unloaded
  unsubscribe();
});
