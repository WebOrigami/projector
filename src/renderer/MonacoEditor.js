/**
 * Monaco Editor Web Component
 *
 * Provides a textarea-compatible API while wrapping Monaco Editor.
 */
class MonacoEditor extends HTMLElement {
  constructor() {
    super();
    this._editor = null;
    this._initPromise = this._initMonaco();
  }

  async _initMonaco() {
    // Wait for component to be added to DOM
    if (!this.isConnected) {
      await new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          if (this.isConnected) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }

    // Load Monaco using AMD loader
    const monaco = await new Promise((resolve) => {
      require(["vs/editor/editor.main"], function () {
        resolve(window.monaco);
      });
    });

    // Create Monaco editor
    this._editor = monaco.editor.create(this, {
      automaticLayout: true,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 13,
      insertSpaces: true,
      language: "plaintext",
      lineNumbers: "off",
      minimap: { enabled: false },
      readOnly: false,
      renderWhitespace: "none",
      scrollbar: {
        useShadows: false,
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
      scrollBeyondLastLine: false,
      tabSize: 2,
      theme: "vs-dark",
      value: "",
      wordBasedSuggestions: "off",
      wordWrap: "on",
    });

    // Wire up input event to match textarea behavior
    this._editor.onDidChangeModelContent(() => {
      this.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Customize theme to match existing design
    monaco.editor.defineTheme("projector-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#1a1a1a",
        "editor.foreground": "#fafafa",
        "editorLineNumber.foreground": "#666666",
        "editorCursor.foreground": "#ffffff",
        "editor.selectionBackground": "#264f78",
        "editor.inactiveSelectionBackground": "#3a3d41",
      },
    });
    monaco.editor.setTheme("projector-dark");
  }

  connectedCallback() {
    this.style.display = "block";
    this.style.overflow = "hidden";
  }

  disconnectedCallback() {
    if (this._editor) {
      this._editor.dispose();
      this._editor = null;
    }
  }

  /**
   * Focus the editor (textarea-compatible)
   */
  focus() {
    if (this._editor) {
      this._editor.focus();
    }
  }

  /**
   * Get the Monaco editor instance (for advanced usage)
   * @returns {monaco.editor.IStandaloneCodeEditor | null}
   */
  getMonacoInstance() {
    return this._editor;
  }

  /**
   * Set editor language for syntax highlighting
   * @param {string} language - Monaco language ID
   */
  setLanguage(language) {
    if (this._editor) {
      const model = this._editor.getModel();
      if (model) {
        window.monaco.editor.setModelLanguage(model, language);
      }
    }
  }

  /**
   * Toggle disabled attribute (textarea-compatible)
   * @param {string} attr - Attribute name
   * @param {boolean} force - Force state
   */
  toggleAttribute(attr, force) {
    if (attr === "disabled" && this._editor) {
      this._editor.updateOptions({ readOnly: force });
      this.classList.toggle("disabled", force);
    }
  }

  /**
   * Get editor value (textarea-compatible)
   * @returns {string}
   */
  get value() {
    return this._editor?.getValue() ?? "";
  }

  /**
   * Set editor value (textarea-compatible)
   * @param {string} text
   */
  set value(text) {
    if (this._editor) {
      const current = this._editor.getValue();
      if (current !== text) {
        this._editor.setValue(text || "");
      }
    }
  }
}

// Register the custom element
customElements.define("monaco-editor", MonacoEditor);
