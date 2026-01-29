import { shell } from "#electron";
import recent from "../recent.js";
import { resolveHref } from "../utilities.js";

const REFRESH_DELAY_MS = 250;

const backUpdater = recent(100);
const forwardUpdater = recent(100);

/**
 * Mixin handling project communication with the page running in the renderer
 */
export default function PageCommunication(Base) {
  return class extends Base {
    constructor(...args) {
      super(...args);

      // Internal state
      this._back = [];
      this._forward = [];
      this._refreshTimeout = null;

      // State shared with the renderer
      Object.assign(this.state, {
        backEnabled: false,
        forwardEnabled: false,
        lastScroll: null,
        pageTitle: "",
      });
    }

    /**
     * Send state to page
     */
    async broadcastState() {
      // We can only send structured-clonable data, so we use structuredClone to
      // copy the state.
      const snapshot = structuredClone(this.state);
      return this._window.webContents.send("invoke-page", "setState", snapshot);
    }

    async focusCommand() {
      return this.invokePageMethod("focusCommand");
    }

    async goBack() {
      if (this._back.length === 0) {
        return;
      }

      if (this.state.command !== "") {
        // Add current command to Forward stack
        this._forward = forwardUpdater.add(this._forward, this.state.command);
      }

      const command = this._back.pop();
      const backEnabled = this._back.length > 0;
      const forwardEnabled = this._forward.length > 0;

      await this.setState({
        backEnabled,
        command,
        forwardEnabled,
      });

      await this.run();
    }

    async goForward() {
      if (this._forward.length === 0) {
        return;
      }

      if (this.state.command !== "") {
        // Add current command to Back stack
        this._back = backUpdater.add(this._back, this.state.command);
      }

      const command = this._forward.pop();
      const backEnabled = this._back.length > 0;
      const forwardEnabled = this._forward.length > 0;

      await this.setState({
        backEnabled,
        command,
        forwardEnabled,
      });

      await this.run();
    }

    async goHome() {
      const command = this.state.sitePath ? `${this.state.sitePath}/` : "";
      if (command !== this.state.command) {
        await this.navigateAndRun(command);
      }
    }

    async invokePageFunction(functionName) {
      return this._window.webContents.executeJavaScript(`${functionName}()`);
    }

    async invokePageMethod(...args) {
      await this._window.webContents.send("invoke-page", ...args);
    }

    async navigateAndRun(command) {
      if (this.state.command && this.state.command !== "") {
        // Add previous command to Back stack
        this._back = backUpdater.add(this._back, this.state.command);
      }

      // Clear Forward stack
      this._forward = [];

      const backEnabled = this._back.length > 0;
      const forwardEnabled = this._forward.length > 0;

      await this.setState({
        backEnabled,
        command,
        forwardEnabled,
      });

      await this.run();
    }

    /**
     * The user clicked a link with the given href.
     *
     * @param {string} href
     */
    async navigateToHref(href) {
      const command = resolveHref(
        href,
        this.state.command,
        this.state.sitePath ?? "",
      );

      if (command === null) {
        // External URL, open in browser
        await shell.openExternal(href);
        return;
      }

      await this.navigateAndRun(command);
    }

    // Save and tell renderer to reload result pane
    async refresh() {
      if (!this.filePath) {
        // Refresh disabled until file has been saved
        return;
      }

      // Save before running
      if (this.dirty) {
        const saved = await this.save();
        if (!saved) {
          return;
        }
      }

      const lastScroll = await this.invokePageFunction("getScrollPosition");
      await this.setState({ lastScroll });

      await this.run();
    }

    restartRefreshTimeout() {
      if (this._refreshTimeout) {
        clearTimeout(this._refreshTimeout);
      }
      this._refreshTimeout = setTimeout(async () => {
        this._refreshTimeout = null;
        await this.refresh();
      }, REFRESH_DELAY_MS);
    }

    async setState(changes) {
      const { newState, changed } = await super.setState(changes);

      if (changed.dirty) {
        if (newState.dirty) {
          this.restartRefreshTimeout();
        }
      }

      if (Object.keys(changed).length > 0) {
        // Notify renderer of state change
        await this.broadcastState();
      }

      return { newState, changed };
    }
  };
}
