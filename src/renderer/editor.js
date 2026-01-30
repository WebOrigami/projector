import { getLanguageFromPath } from "./languageMap.js";
import * as scrollState from "./scrollState.js";
import { appAreaHref, defaultResultHref } from "./shared.js";
import updateState from "./updateState.js";

// Page state, will be populated by main process
window.state = {};

const imageExtensions = [
  ".avif",
  ".bmp",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".tif",
  ".tiff",
  ".webp",
];

function getFileName(filePath) {
  if (!filePath) return "Untitled";

  // Approximate the logic in path.basename
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1];
}

function getCurrentResultFrame() {
  const activeFrameId = resultPane.getAttribute("data-active-frame");
  return document.getElementById(activeFrameId);
}

function getResultFrames() {
  return [frame0, frame1];
}

function getNextResultFrame() {
  const activeFrameId = resultPane.getAttribute("data-active-frame");
  const nextFrameId = activeFrameId === "frame0" ? "frame1" : "frame0";
  return document.getElementById(nextFrameId);
}

function render(state, changed) {
  if (changed.backEnabled) {
    backButton.disabled = !state.backEnabled;
  }

  if (changed.command) {
    if (command.value !== state.command) {
      command.value = state.command;
    }
  }

  if (changed.error) {
    command.classList.toggle("error", state.error !== null);
    error.textContent = state.error || "";
    error.style.display = state.error ? "block" : "none";
  }

  if (changed.forwardEnabled) {
    forwardButton.disabled = !state.forwardEnabled;
  }

  if (changed.recentFiles) {
    // Update recent files buttons
    updateRecentBar(state);
  }

  if (
    changed.resultVersion &&
    state.resultVersion > 0 &&
    state.error === null
  ) {
    reloadResult();
  }

  if (changed.text && state.textSource === "file") {
    editor.value = state.text ?? "";
    editor.toggleAttribute("disabled", state.text === null);
  }

  if (changed.fileName && state.fileName) {
    const language = getLanguageFromPath(state.fileName);
    editor.setLanguage(language);
  }
}

// Called when the result iframe has finished loading
function resultLoaded(event) {
  const result = event.target;
  const frameId = result.id;
  resultPane.setAttribute("data-active-frame", frameId);

  // If the command ends with image extension, limit the width of the image to
  // fit within the iframe
  const command = state.command || "";
  if (imageExtensions.some((ext) => command.endsWith(ext))) {
    const img = result.contentDocument.querySelector("img");
    if (img) {
      Object.assign(result.contentDocument.body.style, {
        backgroundColor: "black",
        display: "grid",
        height: "100%",
      });
      Object.assign(img.style, {
        margin: "auto",
        maxWidth: "100%",
      });
    }
  }

  if (state.lastScroll) {
    // We're refreshing the command result; restore scroll position
    scrollState.restoreState(result.contentWindow, state.lastScroll);
  }

  // Intercept external link clicks to open in default browser
  result.contentDocument.addEventListener("click", async (event) => {
    const link = event.target.closest("a");
    if (link) {
      const href = link.getAttribute("href");
      const isValidUrl = URL.canParse(href, appAreaHref);
      if (!isValidUrl) {
        // Ignore invalid URLs
        return;
      }
      event.preventDefault();

      await window.api.invokeProjectMethod("navigateToHref", href);
    }
  });

  // Notify main process that the result has loaded, also pass page title
  const newState = {
    loadedVersion: state.resultVersion,
    pageTitle: result.contentDocument.title,
  };
  if (!state.error) {
    // Clear lastScroll only if there was no error loading the result
    newState.lastScroll = null;
  }
  window.api.invokeProjectMethod("setState", newState);
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
    command.select();
  },

  focusEditor() {
    editor.focus();
  },

  getScrollPosition() {
    const frame = getCurrentResultFrame();
    return scrollState.getState(frame.contentWindow);
  },

  reloadResult() {
    // Force iframe to reload
    const frame = getNextResultFrame();
    frame.src = defaultResultHref;
  },

  setState(changes) {
    const { newState, changed } = updateState(state, changes);
    state = newState;
    render(state, changed);
  },
});

window.addEventListener("DOMContentLoaded", () => {
  // Wire up event handlers

  fileOpen.addEventListener("click", async () => {
    await window.api.invokeProjectMethod("fileOpen");
  });

  editor.addEventListener("input", async () => {
    // Notify main process that the content has changed
    await window.api.invokeProjectMethod("setState", {
      dirty: true,
      text: editor.value,
      textSource: "editor",
    });
  });

  command.addEventListener("keydown", async (event) => {
    if (
      event.key === "Enter" &&
      !(event.shiftKey || event.ctrlKey || event.altKey)
    ) {
      // Navigate forward to result of command
      event.preventDefault();
      await window.api.invokeProjectMethod("navigateAndRun", command.value);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      await window.api.invokeProjectMethod("nextCommand");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      await window.api.invokeProjectMethod("previousCommand");
    }
  });

  backButton.addEventListener("click", async () => {
    await window.api.invokeProjectMethod("goBack");
  });

  forwardButton.addEventListener("click", async () => {
    await window.api.invokeProjectMethod("goForward");
  });

  getResultFrames().forEach((frame) =>
    frame.addEventListener("load", resultLoaded),
  );

  editor.focus();
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
