import AttributeMarshallingMixin from "./AttributeMarshallingMixin.js";
import { conf as origamiLanguageConfig } from "./tokenizer/languageConfiguration.js";
import { language as origamiLanguage } from "./tokenizer/origami.js";

/**
 * Monaco Editor Web Component
 *
 * Provides a textarea-compatible API while wrapping Monaco Editor.
 */
class MonacoEditor extends AttributeMarshallingMixin(HTMLElement) {
  constructor() {
    super();

    this._editor = null;

    // Cache all options (both before and after editor is ready)
    this._options = {
      autoSurround: "languageDefined",
      indentSize: 2,
      insertSpaces: true,
      lineNumbers: "off",
      readOnly: false,
      tabSize: 2,
    };

    this._language = "";
    this._value = "";
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

    // Register Origami language
    monaco.languages.register({ id: "origami" });
    monaco.languages.setLanguageConfiguration("origami", origamiLanguageConfig);
    monaco.languages.setMonarchTokensProvider("origami", origamiLanguage);

    // Create Monaco editor with cached options
    this._editor = monaco.editor.create(this, {
      automaticLayout: true,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 13,
      guides: {
        indentation: false,
      },
      language: "plaintext",
      minimap: { enabled: false },
      renderWhitespace: "none",
      scrollbar: {
        useShadows: false,
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
      scrollBeyondLastLine: false,
      theme: "vs-dark",
      unicodeHighlight: {
        // Highlighting these characters would be confusing to non-devs
        ambiguousCharacters: false,
        invisibleCharacters: false,
        nonBasicASCII: false,
      },
      value: this._value,
      wordBasedSuggestions: "off",
      wordWrap: "on",

      // Options derived from page state
      ...this._options,
    });

    // Apply language if it was set before editor was ready
    if (this._language) {
      const model = this._editor.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, this._language);
      }
    }

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

  get autoClosingBrackets() {
    return this._editor?.getOption(
      monaco.editor.EditorOption.autoClosingBrackets,
    );
  }
  set autoClosingBrackets(autoClosingBrackets) {
    this._editor?.updateOptions({ autoClosingBrackets });
  }

  connectedCallback() {
    this.style.display = "block";
    this.style.overflow = "hidden";
  }

  get disabled() {
    return (
      this._editor?.getOptions(monaco.editor.EditorOption.readOnly) ??
      this._options.readOnly
    );
  }
  set disabled(disabled) {
    this._options.readOnly = disabled;
    if (this._editor) {
      this._editor.updateOptions({ readOnly: disabled });
    }
    this.toggleAttribute("disabled", disabled);
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
   * Get whether spaces are inserted when Tab is pressed
   *
   * @returns {boolean}
   */
  get insertSpaces() {
    return this.getModelOptions().insertSpaces;
  }
  /**
   * Set whether to insert spaces when Tab is pressed
   *
   * @param {boolean} value
   */
  set insertSpaces(value) {
    this.setModelOptions({ insertSpaces: value });
  }

  // Return model options if available, otherwise cached options
  getModelOptions() {
    return this.model?.getOptions() ?? this._options;
  }

  /**
   * Get editor language
   *
   * @returns {string}
   */
  get language() {
    return this._language;
  }
  /**
   * Set editor language for syntax highlighting
   *
   * @param {string} language - Monaco language ID
   */
  set language(language) {
    this._language = language;
    if (this._editor) {
      const model = this._editor.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, language);
      }
    }
  }

  /**
   * Get line numbers display mode
   *
   * @returns {string}
   */
  get lineNumbers() {
    return this._editor?.getOption(monaco.editor.EditorOption.lineNumbers);
  }
  /**
   * Set line numbers display mode
   *
   * @param {string} value - "on", "off", "relative", or "interval"
   */
  set lineNumbers(value) {
    this._editor?.updateOptions({ lineNumbers: value });
  }

  get model() {
    return this._editor?.getModel() ?? null;
  }

  // Set cached options and apply to model if available
  setModelOptions(options) {
    Object.assign(this._options, options);
    this.model?.updateOptions(options);
  }

  /**
   * Get tab size
   *
   * @returns {number}
   */
  get tabSize() {
    return this.getModelOptions().tabSize;
  }
  /**
   * Set tab size
   *
   * @param {number} value
   */
  set tabSize(value) {
    this.setModelOptions({ tabSize: value });
  }

  /**
   * Get editor text
   *
   * @returns {string}
   */
  get value() {
    if (this._editor) {
      return this._editor.getValue();
    }
    return this._value;
  }
  /**
   * Set editor text
   *
   * @param {string} text
   */
  set value(text = "") {
    this._value = text;
    if (this._editor) {
      const current = this._editor.getValue();
      if (current !== text) {
        this._editor.setValue(text);
      }
    }
  }
}

// Register the custom element
customElements.define("monaco-editor", MonacoEditor);
