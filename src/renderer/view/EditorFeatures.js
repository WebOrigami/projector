import { getLanguageFromPath } from "./languageMap.js";

/**
 * @typedef {Object} Accelerator
 * @property {string} key
 * @property {boolean} metaKey
 * @property {boolean} ctrlKey
 * @property {boolean} altKey
 * @property {boolean} shiftKey
 */

// Mixin to handle editor-related features in the project window
export default function EditorFeatures(Base) {
  return class extends Base {
    constructor() {
      super();

      // Flag to work around Monaco editor raising input events when setting the
      // value programmatically
      this.ignoreEditorInput = false;

      // Objects describing the app's accelerators
      this._accelerators = [];
    }

    loaded() {
      super.loaded?.();

      window.editor.addEventListener("input", async () => {
        // Unlike a standard <input>, the Monaco editor raises input events event
        // when setting the value programmatically, so we need to use a flag to
        // ignore those.
        if (this.ignoreEditorInput) {
          return;
        }

        // Changing result via editor input should preserve scroll position
        this.restoreScroll = true;

        // if (timeStart === null) {
        //   // User started typing; start perf timer
        //   timeStart = performance.now();
        // }

        // Notify main process that the content has changed
        await window.api.invokeProjectMethod("setState", {
          dirty: true,
          text: window.editor.value,
          textSource: "editor",
        });
      });

      window.editor.addEventListener("keydown", (event) => {
        if (isEventForAccelerator(event, this._accelerators)) {
          event.stopImmediatePropagation();
          console.log("stopped");
        }
      });

      // Editor gets initial focus
      if (window.editor.getMonacoInstance()) {
        window.focusEditor();
      } else {
        window.editor.addEventListener("ready", window.focusEditor, {
          once: true,
        });
      }
    }

    render(state, changed) {
      super.render?.(state, changed);

      if (changed.accelerators) {
        this._accelerators = parseAccelerators(state.accelerators);
      }

      if (changed.editor) {
        Object.assign(window.editor, state.editor);
      }

      if (changed.fileName && state.fileName) {
        window.editor.language = getLanguageFromPath(state.fileName);
      }

      if (changed.text && state.textSource === "file") {
        this.ignoreEditorInput = true;
        window.editor.value = state.text ?? "";
        window.editor.disabled = state.text === null;
        this.ignoreEditorInput = false;
      }
    }
  };
}

/**
 * Returns true if the given keyboard event matches any of the given
 * accelerators.
 *
 * @param {KeyboardEvent} event
 * @param {Accelerator[]} accelerators
 */
function isEventForAccelerator(event, accelerators) {
  const key = event.key.toLowerCase();

  return accelerators.some(
    (accelerator) =>
      accelerator.key === key &&
      accelerator.metaKey === event.metaKey &&
      accelerator.ctrlKey === event.ctrlKey &&
      accelerator.altKey === event.altKey &&
      accelerator.shiftKey === event.shiftKey,
  );
}

function normalizeAcceleratorKey(key) {
  const aliases = {
    return: "enter",
    esc: "escape",
    plus: "+",
    up: "arrowup",
    down: "arrowdown",
    left: "arrowleft",
    right: "arrowright",
    space: " ",
  };

  return aliases[key] ?? key;
}

/**
 * Parse Electron accelerator strings into efficiently matchable objects.
 *
 * @param {string[]} strings
 * @returns {Accelerator[]}
 */
function parseAccelerators(strings) {
  return strings.map((string) => parseAccelerator(string));
}

function parseAccelerator(string) {
  const isMac = navigator.platform.startsWith("Mac");

  const parts = string.toLowerCase().split("+");
  const acceleratorKey = parts.pop();

  const accelerator = {
    key: normalizeAcceleratorKey(acceleratorKey),
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  };

  for (const part of parts) {
    switch (part) {
      case "command":
      case "cmd":
        accelerator.metaKey = true;
        break;

      case "control":
      case "ctrl":
        accelerator.ctrlKey = true;
        break;

      case "commandorcontrol":
      case "cmdorctrl":
        if (isMac) {
          accelerator.metaKey = true;
        } else {
          accelerator.ctrlKey = true;
        }
        break;

      case "super":
      case "meta":
        accelerator.metaKey = true;
        break;

      case "alt":
      case "option":
        accelerator.altKey = true;
        break;

      case "shift":
        accelerator.shiftKey = true;
        break;

      default:
        throw new Error(`Unknown accelerator modifier: ${part}`);
    }
  }

  return accelerator;
}
