import recent from "../recent.js";

const recentCommandsUpdater = recent(50);

/**
 * Mixin defining project features related to running commands
 */
export default function RunFeatures(Base) {
  return class extends Base {
    constructor(...args) {
      super(...args);

      // Internal state
      this._result = null;
      this._runVersion = 0;

      // State shared with the renderer
      Object.assign(this.state, {
        command: "",
        error: null,
        lastRunCrashed: false,
        loadedVersion: 0,
        resultVersion: 0,
        recentCommands: [],
      });
    }

    get command() {
      return this.state.command;
    }
    set command(command) {
      this.setState({ command });
    }

    async nextCommand() {
      const command = this.state.command;
      const commands = this.state.recentCommands || [];
      const index = commands.indexOf(command);
      let nextCommand;
      if (index >= 0 && index < commands.length - 1) {
        nextCommand = commands[index + 1];
      } else {
        nextCommand = "";
      }
      this.setState({ command: nextCommand });
    }

    async previousCommand() {
      const command = this.state.command;
      const commands = this.state.recentCommands || [];
      const index = commands.indexOf(command);
      let previousCommand;
      if (index > 0) {
        previousCommand = commands[index - 1];
      } else if (command === "" && commands.length > 0) {
        previousCommand = commands[commands.length - 1];
      } else {
        return;
      }
      this.setState({ command: previousCommand });
    }

    get recentCommands() {
      return this.state.recentCommands;
    }

    get result() {
      return this._result;
    }

    async run() {
      this._runVersion++;

      // We assume the run will crash until it completes successfully
      await this.setState({
        lastRunCrashed: true,
      });

      let command = this.state.command;
      if (!command) {
        return;
      }

      const commands = recentCommandsUpdater.add(
        this.state.recentCommands || [],
        command,
      );
      await this.setState({
        recentCommands: commands,
      });

      await this.invokePageFunction("reloadResult");
    }

    async runTool(toolName) {
      const command = `${toolName} ${this.state.sitePath}`;
      if (this.state.command === command) {
        // Re-run current command
        await this.run();
      } else {
        // Set and run new command
        await this.navigateAndRun(command);
      }
    }
  };
}
