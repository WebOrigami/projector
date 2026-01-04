window.reloadResult = () => {
  // Force iframe to reload
  result.src = "origami://root";
};

window.addEventListener("DOMContentLoaded", () => {
  const editor = document.getElementById("editor");

  editor.addEventListener("input", () => {
    // Notify main process that the content has changed
    window.api.notifyContentChanged();
    result.classList.add("pending");
  });

  const command = document.getElementById("command");
  command.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      !(event.shiftKey || event.ctrlKey || event.altKey)
    ) {
      event.preventDefault();
      window.api.runCommand();
    }
  });

  result.addEventListener("load", () => {
    result.classList.remove("pending");
  });

  editor.focus();
});
