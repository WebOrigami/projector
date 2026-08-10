import EditorFeatures from "./EditorFeatures.js";
import FileFeatures from "./FileFeatures.js";
import RunFeatures from "./RunFeatures.js";

export default class View extends RunFeatures(
  EditorFeatures(FileFeatures(Object)),
) {}
