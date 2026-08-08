import * as scrollState from "./scrollState.js";

// Extensions for image files, which trigger special styling in the result pane
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

// Page-only state
window.previousScrollState = null;
window.restoreScroll = false;

// Performance timings: editor input -> iframe load
// let timings = [];
// let timeStart = null; // current run start time

// Mixin to handle features related to running a command
export default function RunFeatures(Base) {
  return class extends Base {
    loaded() {
      super.loaded?.();

      command.addEventListener("keydown", async (event) => {
        // Changing result via command bar should reset scroll position
        window.restoreScroll = false;

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

      [window.frame0, window.frame1].forEach((frame) => {
        frame.addEventListener("load", (event) => resultLoaded(event.target));
      });
    }

    render(state, changed) {
      super.render?.(state, changed);

      if (changed.backEnabled) {
        window.backButton.disabled = !state.backEnabled;
      }

      if (changed.command) {
        if (window.command.value !== state.command) {
          window.command.value = state.command;
        }
      }

      if (changed.error) {
        window.command.classList.toggle("error", state.error !== null);
        window.error.innerHTML = state.error || "";
        window.error.style.display = state.error ? "block" : "none";
      }

      if (changed.forwardEnabled) {
        forwardButton.disabled = !state.forwardEnabled;
      }

      if (changed.resultVersion && state.resultVersion > 0) {
        reloadResult();
      }
    }
  };
}

// function logPerformance() {
//   if (timeStart === null) {
//     return;
//   }

//   const timeEnd = performance.now();
//   const elapsed = timeEnd - timeStart;
//   if (elapsed < 0) {
//     return;
//   }
//   timeStart = null;

//   // Only keep the most recent timings
//   if (timings.length >= 5) {
//     timings = timings.slice(-4);
//   }
//   timings.push(elapsed);

//   // Average the times
//   const average = timings.reduce((a, b) => a + b, 0) / timings.length;

//   console.log(
//     `Refresh rate: ${timings.map((t) => t.toFixed(0)).join(" ")} → ${average.toFixed(0)}`,
//   );
// }

// Pick an iframe to the load the next result into and trigger the load
function reloadResult() {
  const activeFrameId = resultPane.getAttribute("data-active-frame");

  if (window.restoreScroll && window.previousScrollState === null) {
    // No reload in progress, save scroll state of active frame
    const frame = document.getElementById(activeFrameId);
    window.previousScrollState = scrollState.getState(frame.contentWindow);
  }

  // Pick the next iframe
  const nextFrameId = activeFrameId === "frame0" ? "frame1" : "frame0";
  const frame = document.getElementById(nextFrameId);

  let unencoded = window.state.command;

  const trailingSlash = unencoded.endsWith("/");
  if (trailingSlash) {
    // We'll shift the trailing slash to the URL
    unencoded = unencoded.slice(0, -1);
  }

  // The browser will normalize away the path `.`, so we rewrite that as `(.)`
  // so that it is preserved in the URL. The result will be the same.
  if (unencoded === ".") {
    unencoded = "(.)";
  }

  const encoded = encodeURIComponent(unencoded);
  let src = `/!eval/${encoded}`;
  if (trailingSlash) {
    src += "/";
  }

  frame.src = src;
}

// Called when a result iframe has finished loading
function resultLoaded(frame) {
  // See if the result contains an error message
  const errorElement = frame.contentDocument.querySelector(
    ".origami-server-error",
  );
  if (errorElement) {
    window.api.invokeProjectMethod("setState", {
      error: errorElement.innerHTML,
    });
    return;
  }

  const frameId = frame.id;
  window.resultPane.setAttribute("data-active-frame", frameId);

  // If the command ends with image extension, limit the width of the image to
  // fit within the iframe
  const command = window.state.command || "";
  if (imageExtensions.some((ext) => command.endsWith(ext))) {
    const img = frame.contentDocument.querySelector("img");
    if (img) {
      Object.assign(frame.contentDocument.body.style, {
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

  if (window.previousScrollState) {
    // Restore scroll position
    scrollState.restoreState(frame.contentWindow, window.previousScrollState);
    window.previousScrollState = null;
  }

  // Intercept external link clicks to open in default browser
  frame.contentDocument.addEventListener("click", async (event) => {
    const link = event.target.closest("a");
    if (link) {
      const href = link.getAttribute("href");
      const isValidUrl = URL.canParse(href, window.location.origin);
      if (!isValidUrl) {
        // Ignore invalid URLs
        return;
      }
      event.preventDefault();

      await window.api.invokeProjectMethod("navigateToHref", href);
    }
  });

  // Log performance
  // logPerformance();

  // Notify main process that the result has loaded, also pass page title
  const newState = {
    error: null,
    lastRunCrashed: false, // Clear crash state on successful load
    pageTitle: frame.contentDocument.title,
  };
  window.api.invokeProjectMethod("setState", newState);
}
