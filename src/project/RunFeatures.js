import recent from "../recent.js";

const recentCommandsUpdater = recent(50);

/**
 * Mixin defining project features related to running commands
 */
export default function RunFeatures(Base) {
  return class extends Base {
    constructor(...args) {
      super(...args);

      // State shared with the renderer
      Object.assign(this.state, {
        command: "",
        error: null,
        lastRunCrashed: false,
        // The runVersion is incremented each time a run is started. The
        // renderer uses this to know when to reload the result iframe.
        runVersion: 0,
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

    async run() {
      let command = this.state.command;
      if (!command) {
        return;
      }

      const commands = recentCommandsUpdater.add(
        this.state.recentCommands || [],
        command,
      );

      // Signal editor to reload. We consider the run to have crashed until it
      // completes successfully.
      await this.setState({
        lastRunCrashed: true,
        recentCommands: commands,
        runVersion: this.state.runVersion + 1,
      });
    }
  };
}
