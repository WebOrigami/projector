export default function updateWindowTitle(window) {
  const document = window.document;

  let title = document.title;
  if (document.dirty) {
    title += " ⚫︎";
  }
  window.setTitle(title);

  // Set represented filename for macOS
  const representedFilename = document.filePath ? document.filePath : "";
  window.setRepresentedFilename(representedFilename);

  window.setDocumentEdited(document.dirty);
}
