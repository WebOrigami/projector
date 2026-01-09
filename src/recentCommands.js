import { loadSettings, saveSettings } from "./settings.js";

const MAX_RECENT_COMMANDS = 100;

export async function addCommand(command) {
  const recentCommands = await getCommands();

  // Remove if already in list
  let newCommands = recentCommands.filter((cmd) => cmd !== command);

  // Add to end
  newCommands.push(command);

  // Limit to MAX_RECENT_COMMANDS
  if (newCommands.length > MAX_RECENT_COMMANDS) {
    newCommands = newCommands.slice(newCommands.length - MAX_RECENT_COMMANDS);
  }

  // Save to disk
  await saveCommands(newCommands);
}

export async function clearCommands() {
  const recentCommands = [];
  await saveCommands(recentCommands);
}

export async function getCommands() {
  const settings = await loadSettings();
  return settings.recentCommands || [];
}

export async function removeCommand(command) {
  const recentCommands = await getCommands();
  const newCommands = recentCommands.filter((cmd) => cmd !== command);
  await saveCommands(newCommands);
}

async function saveCommands(recentCommands) {
  await saveSettings({ recentCommands });
}
