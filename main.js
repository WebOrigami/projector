import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Store window-specific state
const windowState = new WeakMap();

// Handle content-changed messages from renderer
ipcMain.on("content-changed", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const state = windowState.get(window);
  if (state) {
    state.dirty = true;
  }
});

function createMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New",
          accelerator: "CmdOrCtrl+N",
          click: fileNew,
        },
        {
          label: "Open…",
          accelerator: "CmdOrCtrl+O",
          click: fileOpen,
        },
        { type: "separator" },
        { role: "close" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: fileSave,
        },
        {
          label: "Save As…",
          accelerator: "CmdOrCtrl+Shift+S",
          click: fileSaveAs,
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "Debug",
      submenu: [{ role: "toggleDevTools" }],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "preload.js"),
    },
  });

  // Initialize window state
  windowState.set(window, {
    filePath: null,
    dirty: false,
  });

  // Handle window close event
  window.on("close", (event) => {
    const state = windowState.get(window);
    if (state.dirty) {
      // Prevent the window from closing immediately
      event.preventDefault();

      // Show save prompt and handle the response
      promptSaveChanges(window).then((shouldContinue) => {
        if (shouldContinue) {
          // Mark as clean to avoid infinite loop, then close
          state.dirty = false;
          window.close();
        }
      });
    }
  });

  window.loadFile("renderer/index.html");
  return window;
}

async function fileNew(_menuItem, browserWindow) {
  const state = windowState.get(browserWindow);

  // Check if there are unsaved changes
  if (state.dirty) {
    const shouldContinue = await promptSaveChanges(browserWindow);
    if (!shouldContinue) {
      return;
    }
  }

  // Clear the editor and reset state
  browserWindow.webContents.executeJavaScript(
    `document.getElementById('editor').value = '';`
  );
  state.filePath = null;
  state.dirty = false;
}

async function fileOpen(_menuItem, browserWindow) {
  const state = windowState.get(browserWindow);

  // Check if there are unsaved changes
  if (state.dirty) {
    const shouldContinue = await promptSaveChanges(browserWindow);
    if (!shouldContinue) {
      return;
    }
  }

  const result = await dialog.showOpenDialog(browserWindow, {
    properties: ["openFile"],
  });

  if (result.canceled) {
    // User canceled
    return;
  }

  // Get the selected file path, save it in window state
  const filePath = result.filePaths[0];
  state.filePath = filePath;
  state.dirty = false;

  // Read file, send to textarea
  const fileContents = await readFile(filePath, "utf8");
  browserWindow.webContents.executeJavaScript(
    `document.getElementById('editor').value = ${JSON.stringify(fileContents)};`
  );
}

async function fileSave(_menuItem, browserWindow) {
  const state = windowState.get(browserWindow);

  // If no file path, show Save As dialog first
  if (state.filePath === null) {
    await fileSaveAs(_menuItem, browserWindow);
    return;
  }

  // Get editor contents and write to file
  const contents = await getEditorContents(browserWindow);
  await writeFile(state.filePath, contents, "utf8");

  // Mark as clean
  state.dirty = false;
}

async function fileSaveAs(_menuItem, browserWindow) {
  const result = await dialog.showSaveDialog(browserWindow, {});

  if (result.canceled) {
    // User canceled
    return;
  }

  // Get the selected file path
  const filePath = result.filePath;
  const state = windowState.get(browserWindow);
  state.filePath = filePath;

  // Get editor contents and write to file
  const contents = await getEditorContents(browserWindow);
  await writeFile(filePath, contents, "utf8");

  // Mark as clean
  state.dirty = false;
}

async function getEditorContents(browserWindow) {
  return await browserWindow.webContents.executeJavaScript(
    `document.getElementById('editor').value`
  );
}

async function promptSaveChanges(browserWindow) {
  const result = await dialog.showMessageBox(browserWindow, {
    type: "question",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: "Save changes?",
  });

  if (result.response === 0) {
    // Save
    await fileSave(null, browserWindow);
    return true;
  } else if (result.response === 1) {
    // Don't Save
    return true;
  } else {
    // Cancel
    return false;
  }
}

app.whenReady().then(() => {
  createMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
