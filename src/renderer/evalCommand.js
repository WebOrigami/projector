// Expose the oriEval function so that project DebugFeatures can make the !eval
// command available to the user. This function isn't directly by the renderer,
// but sits in the renderer folder so it's discoverable by the debugger.
export { oriEval as default } from "@weborigami/origami";
