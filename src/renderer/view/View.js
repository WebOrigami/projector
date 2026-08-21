import CommandFeatures from "./CommandFeatures.js";
import EditorFeatures from "./EditorFeatures.js";
import FileFeatures from "./FileFeatures.js";
import RunFeatures from "./RunFeatures.js";

export default class View extends CommandFeatures(
  RunFeatures(EditorFeatures(FileFeatures(Object))),
) {}
