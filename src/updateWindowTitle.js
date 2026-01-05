export default function updateWindowTitle(window) {
  const project = window.project;

  let title = project.title;
  if (project.dirty) {
    title += " ⚫︎";
  }
  window.setTitle(title);

  // Set represented filename for macOS
  const representedFilename = project.filePath ? project.filePath : "";
  window.setRepresentedFilename(representedFilename);

  window.setDocumentEdited(project.dirty);
}
