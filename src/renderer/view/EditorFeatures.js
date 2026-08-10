import { getLanguageFromPath } from "./languageMap.js";

// Mixin to handle editor-related features in the project window
export default function EditorFeatures(Base) {
  return class extends Base {
    constructor() {
      super();

      // Flag to work around Monaco editor raising input events when setting the
      // value programmatically
      this.ignoreEditorInput = false;
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

      // Editor gets initial focus
      window.editor.focus();
    }

    render(state, changed) {
      super.render?.(state, changed);

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
