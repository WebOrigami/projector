/**
 * Map file extensions to Monaco Editor language identifiers
 */
export const languageMap = {
  // Web
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".less": "less",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".json": "json",
  ".xml": "xml",

  // Programming languages
  ".py": "python",
  ".java": "java",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "cpp",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",

  // Shell and config
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".toml": "toml",
  ".ini": "ini",
  ".conf": "ini",

  // Markdown and docs
  ".md": "markdown",
  ".markdown": "markdown",
  ".txt": "plaintext",

  // Origami-specific
  ".ori": "javascript", // Treat as JavaScript for syntax highlighting
};

/**
 * Get Monaco language ID from file path
 *
 * @param {string} filePath - Full file path or just filename
 * @returns {string} Monaco language ID
 */
export function getLanguageFromPath(filePath) {
  if (!filePath) {
    return "plaintext";
  }

  // Extract extension
  const match = filePath.match(/\.[^.\/\\]+$/);
  if (!match) {
    return "plaintext";
  }

  const ext = match[0].toLowerCase();
  return languageMap[ext] || "plaintext";
}
