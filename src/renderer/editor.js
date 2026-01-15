import updateState from "./updateState.js";

// Page state
window.state = {
  lastScroll: {
    x: 0,
    y: 0,
  },
};

function getFileName(filePath) {
  if (!filePath) return "Untitled";

  // Approximate the logic in path.basename
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1];
}

function render(state, changed) {
  if (changed.command) {
    console.log("Updating command:", state.command);
    if (command.value !== state.command) {
      command.value = state.command;
    }
  }

  if (changed.dirty || changed.fileName) {
    // let name = state.fileName;
    // if (state.dirty) {
    //   name += " ⚫︎";
    // }
    // fileName.textContent = name;
  }

  if (changed.error) {
    command.classList.toggle("error", state.error !== null);
    error.textContent = state.error || "";
    error.style.display = state.error ? "block" : "none";
  }

  if (changed.recentFiles) {
    // Update recent files buttons
    const recentButtons = document.getElementById("recentButtons");
    recentButtons.innerHTML = ""; // Clear existing buttons

    // Create buttons in reverse order (most recent first)
    const recentFilesReversed = [...state.recentFiles].reverse();
    recentFilesReversed.forEach((filePath) => {
      const button = document.createElement("button");
      button.textContent = getFileName(filePath);
      button.title = filePath;
      button.addEventListener("click", () => {
        window.api.invokeProjectMethod("loadFile", filePath);
      });
      recentButtons.appendChild(button);
    });
  }

  if (changed.resultVersion && state.resultVersion > 0) {
    reloadResult();
  }

  if (changed.text && state.textSource === "file") {
    editor.value = state.text;
  }
}

/**
 * Add methods to window so main process can call them
 */
Object.assign(window, {
  focusCommand() {
    command.focus();
  },

  reloadResult() {
    // Save scroll position
    const lastScroll = {
      x: result.contentWindow.scrollX,
      y: result.contentWindow.scrollY,
    };
    setState({ lastScroll });

    // Force iframe to reload
    result.src = "origami://app/_result";
  },

  setState(changes) {
    const { newState, changed } = updateState(state, changes);
    state = newState;
    render(state, changed);
  },
});

window.addEventListener("DOMContentLoaded", () => {
  editor.addEventListener("input", () => {
    // Notify main process that the content has changed
    window.api.invokeProjectMethod("setState", {
      dirty: true,
      text: editor.value,
      textSource: "editor",
    });
  });

  command.addEventListener("input", () => {
    // Notify main process that the command has changed
    window.api.invokeProjectMethod("setState", { command: command.value });
  });

  command.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      !(event.shiftKey || event.ctrlKey || event.altKey)
    ) {
      event.preventDefault();
      window.api.invokeProjectMethod("run");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      window.api.invokeProjectMethod("nextCommand");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      window.api.invokeProjectMethod("previousCommand");
    }
  });

  fileOpen.addEventListener("click", () => {
    window.api.invokeProjectMethod("fileOpen");
  });

  result.addEventListener("load", () => {
    // Restore scroll position
    result.contentWindow.scrollTo(state.lastScroll.x, state.lastScroll.y);
  });

  editor.focus();
});

// Subscribe to state changes from main process
const invokePageMethodUnsubscribe = window.api.onInvokePageMethod(
  async (...args) => {
    const fnName = args.shift();
    const fn = window[fnName];
    if (fn instanceof Function) {
      await fn(...args);
    } else {
      console.error(
        `Main process tried to invoke non-existent page method: ${fnName}`
      );
    }
  }
);

// Unsubscribe from events when the window is unloaded to free memory
window.addEventListener("beforeunload", () => {
  invokePageMethodUnsubscribe();
});
