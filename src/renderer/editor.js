import { defaultResultHref } from "./shared.js";
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
    updateRecentBar(state);
  }

  if (
    changed.resultHref ||
    (changed.resultVersion && state.resultVersion > 0)
  ) {
    reloadResult();
  }

  if (changed.text && state.textSource === "file") {
    editor.value = state.text;
  }
}

function updateRecentBar(state) {
  const recentButtons = document.getElementById("recentButtons");
  recentButtons.innerHTML = ""; // Clear existing buttons

  // Create buttons in reverse order (most recent first)
  const recentFilesReversed = [...state.recentFiles].reverse();
  recentFilesReversed.forEach((filePath, index) => {
    if (recentFilesReversed.length <= 4 && index === 1) {
      // Add a label after the most recent file. Once there are multiple recent
      // files, we assume the user understands the concept and hide the label.
      const separator = document.createElement("span");
      separator.textContent = "Recent:";
      recentButtons.appendChild(separator);
    }

    const button = document.createElement("button");
    button.textContent = getFileName(filePath);
    button.title = filePath;
    button.addEventListener("click", async () => {
      await window.api.invokeProjectMethod("loadFile", filePath);
    });
    recentButtons.appendChild(button);
  });
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
    let lastScroll;
    try {
      lastScroll = {
        x: result.contentWindow.scrollX,
        y: result.contentWindow.scrollY,
      };
    } catch (e) {
      // Ignore errors (e.g., if iframe is cross-origin)
      lastScroll = { x: 0, y: 0 };
    }
    setState({ lastScroll });

    // Force iframe to reload
    result.src = state.resultHref;
  },

  setState(changes) {
    const { newState, changed } = updateState(state, changes);
    state = newState;
    render(state, changed);
  },
});

window.addEventListener("DOMContentLoaded", () => {
  editor.addEventListener("input", async () => {
    // Notify main process that the content has changed
    await window.api.invokeProjectMethod("setState", {
      dirty: true,
      text: editor.value,
      textSource: "editor",
    });
  });

  command.addEventListener("input", async () => {
    // Notify main process that the command has changed
    await window.api.invokeProjectMethod("setState", {
      command: command.value,
    });
  });

  command.addEventListener("keydown", async (event) => {
    if (
      event.key === "Enter" &&
      !(event.shiftKey || event.ctrlKey || event.altKey)
    ) {
      event.preventDefault();
      await window.api.invokeProjectMethod("setState", {
        resultHref: defaultResultHref,
      });
      await window.api.invokeProjectMethod("run");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      await window.api.invokeProjectMethod("nextCommand");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      await window.api.invokeProjectMethod("previousCommand");
    }
  });

  fileOpen.addEventListener("click", async () => {
    await window.api.invokeProjectMethod("fileOpen");
  });

  result.addEventListener("load", () => {
    // Restore scroll position
    result.contentWindow.scrollTo(state.lastScroll.x, state.lastScroll.y);
    const resultHref = result.contentWindow.location.href;
    window.api.invokeProjectMethod("setState", {
      resultHref,
    });
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
