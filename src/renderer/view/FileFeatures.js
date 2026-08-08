// Mixin to handle file-related features in the project window
export default function FileFeatures(Base) {
  return class extends Base {
    loaded() {
      super.loaded?.();

      fileOpen.addEventListener("click", async () => {
        await window.api.invokeProjectMethod("fileOpen");
      });
    }

    render(state, changed) {
      super.render?.(state, changed);

      if (changed.recentFiles) {
        // Update recent files buttons
        updateRecentBar(state);
      }
    }
  };
}

function getFileName(filePath) {
  if (!filePath) return "Untitled";

  // Approximate the logic in path.basename
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1];
}

function updateRecentBar(state) {
  const recentButtons = document.getElementById("recentButtons");
  recentButtons.innerHTML = ""; // Clear existing buttons

  // Create buttons in reverse order (most recent first)
  const recentFilesReversed = [...state.recentFiles].reverse();
  recentFilesReversed.forEach((filePath, index) => {
    if (recentFilesReversed.length <= 4 && index === 1) {
      // Add a label after the most recent file. Once there are multiple recent
      // files, we assume the user understands the concept and hide the label.
      const separator = document.createElement("span");
      separator.textContent = "Recent:";
      recentButtons.appendChild(separator);
    }

    const button = document.createElement("button");
    button.textContent = getFileName(filePath);
    button.title = filePath;
    button.addEventListener("click", async () => {
      await window.api.invokeProjectMethod("loadFile", filePath);
    });
    recentButtons.appendChild(button);
  });
}
