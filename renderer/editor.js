window.addEventListener("DOMContentLoaded", () => {
  const editor = document.getElementById("editor");

  editor.focus();

  editor.addEventListener("input", () => {
    // Notify main process that the content has changed
    window.api.notifyContentChanged();
  });
});
