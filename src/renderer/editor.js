import * as scrollState from "./scrollState.js";
import { appAreaHref, defaultResultHref, resultAreaHref } from "./shared.js";
import updateState from "./updateState.js";

// Page state
window.state = {
  lastScroll: scrollState.defaultState,
};

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

function render(state, changed) {
  if (changed.backEnabled) {
    backButton.disabled = !state.backEnabled;
  }

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

  if (changed.forwardEnabled) {
    forwardButton.disabled = !state.forwardEnabled;
  }

  if (changed.recentFiles) {
    // Update recent files buttons
    updateRecentBar(state);
  }

  if (changed.resultHref) {
    if (resultPath.value !== state.resultHref) {
      updateResultPath(state.resultHref);
    }
  }

  if (changed.resultVersion && state.resultVersion > 0) {
    reloadResult();
  }

  if (changed.text && state.textSource === "file") {
    editor.value = state.text;
  }
}

function restoreScrollPositionIfSamePage() {
  const { lastScroll } = state;
  const { command, href } = lastScroll;
  if (command !== state.command) {
    // Different command, do not restore scroll
    return;
  }
  if (href !== result.contentWindow.location.href) {
    // Different page, do not restore scroll
    return;
  }
  scrollState.restoreState(result.contentWindow, lastScroll);
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

// Trim down the result href to a path and display it
function updateResultPath(resultHref) {
  let displayPath = resultHref;
  if (displayPath === defaultResultHref) {
    // Viewing default, hide result path
    displayPath = "";
  } else if (displayPath.startsWith(resultAreaHref)) {
    // Within result of command, show relative path
    displayPath = displayPath.slice(resultAreaHref.length);
    if (state.command && !state.command.endsWith("/")) {
      displayPath = "/" + displayPath;
    }
  } else if (displayPath.startsWith(appAreaHref)) {
    // Within default site
    displayPath = displayPath.slice(appAreaHref.length);

    // Is the current command for the default site?
    let normalizedCommand = state.command || "";
    if (normalizedCommand && normalizedCommand.endsWith("/")) {
      normalizedCommand = normalizedCommand.slice(0, -1);
    }
    let normalizedSitePath = state.sitePath || "";
    if (normalizedSitePath && normalizedSitePath.endsWith("/")) {
      normalizedSitePath = normalizedSitePath.slice(0, -1);
    }
    const isCommandForDefaultSite = normalizedCommand === normalizedSitePath;
    if (!isCommandForDefaultSite) {
      // Outside command
      displayPath = "[default]/" + displayPath;
    }
  }

  resultPath.textContent = displayPath;
  resultPath.display = displayPath ? "block" : "none";
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
    const lastScroll = scrollState.getState(result.contentWindow);
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
    window.api.invokeProjectMethod("goBack");
  });

  forwardButton.addEventListener("click", async () => {
    window.api.invokeProjectMethod("goForward");
  });

  result.addEventListener("load", () => {
    const href = result.contentWindow.location.href;

    // If the href is for an image, limit the width of the image to fit
    // within the iframe
    if (imageExtensions.some((ext) => href.endsWith(ext))) {
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

    // Restore scroll position
    restoreScrollPositionIfSamePage();
    const resultHref = result.contentWindow.location.href;
    if (state.resultHref !== resultHref) {
      window.api.invokeProjectMethod("setState", {
        resultHref,
      });
    }

    // Intercept external link clicks to open in default browser
    result.contentDocument.addEventListener("click", (event) => {
      const link = event.target.closest("a");
      if (link) {
        const href = link.getAttribute("href");
        const isValidUrl = URL.canParse(href, appAreaHref);
        if (!isValidUrl) {
          // Ignore invalid URLs
          return;
        }
        const url = new URL(href, resultHref);
        const isExternal = !url.href.startsWith(appAreaHref);
        if (isExternal) {
          event.preventDefault();
          window.api.invokeProjectMethod("openExternalLink", href);
        }
      }
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
        `Main process tried to invoke non-existent page method: ${fnName}`,
      );
    }
  },
);

// Unsubscribe from events when the window is unloaded to free memory
window.addEventListener("beforeunload", () => {
  invokePageMethodUnsubscribe();
});
