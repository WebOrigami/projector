import globals from "./globals.json" with { type: "json" };

/**
 * Monarch tokenizer definition for the Origami language
 *
 * Origami is a JavaScript expressions dialect with paths and extended syntax.
 * See README.md for complete specification.
 */
export const language = {
  defaultToken: "invalid",
  tokenPostfix: ".ori",

  // Keywords from JavaScript (expression-related only)
  keywords: [
    "await",
    "async",
    "false",
    "import",
    "in",
    "instanceof",
    "new",
    "null",
    "true",
    "typeof",
    "void",
  ],

  // JavaScript globals (from globals.json)
  jsGlobals: globals,

  // Operators
  operators: [
    "<=",
    ">=",
    "==",
    "!=",
    "===",
    "!==",
    "=>",
    "+",
    "-",
    "*",
    "/",
    "%",
    "++",
    "--",
    "<<",
    ">>",
    ">>>",
    "&",
    "|",
    "^",
    "!",
    "~",
    "&&",
    "||",
    "??",
    "?",
    ":",

    // Origami-specific: pipe operators
    "->",
    "→",
  ],

  // Bracket pairs
  brackets: [
    ["{", "}", "delimiter.curly"],
    ["[", "]", "delimiter.square"],
    ["(", ")", "delimiter.parenthesis"],
    ["<", ">", "delimiter.angle"],
  ],

  // Escape sequences
  escapes:
    /\\(?:[abfnrtv\\"'`]|x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

  // Tokenizer states
  tokenizer: {
    root: [
      // Angle bracket paths: <path with spaces>
      [/</, { token: "constant", next: "@angleBracketPath" }],

      // Scheme-based paths: https://example.com
      // RFC 3986: ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
      // Match complete URL: scheme + colon + non-whitespace/non-closing-bracket chars
      [/[a-zA-Z][a-zA-Z0-9+\-.]*:[^\s)\]}]+/, "constant"],

      // Spread operator (must come before dot paths)
      [/\.\.\./, "operator"],

      // Relative paths and hidden files: ./foo, ../bar, .ssh/id_rsa, .vscode
      // Starts with . or .. followed by path characters
      // This won't match .max after Math because Math pushes afterGlobal state
      [/\.\.?[a-zA-Z0-9_$@~!%&*+\-^|./]+/, "constant"],

      // Whitespace
      [/[ \t\r\n]+/, ""],

      // Comments
      [/\/\/.*$/, "comment"],
      [/\/\*/, "comment", "@comment"],

      // Numbers
      [/0[xX][0-9a-fA-F]+n?/, "number.hex"],
      [/0[oO][0-7]+n?/, "number.octal"],
      [/0[bB][01]+n?/, "number.binary"],
      [/\d+n/, "number.bigint"],
      [/\d*\.\d+([eE][\-+]?\d+)?/, "number.float"],
      [/\d+([eE][\-+]?\d+)?/, "number"],

      // Strings
      [/"/, "string", "@string_double"],
      [/'/, "string", "@string_single"],
      [/`/, "string", "@string_backtick"],

      // Regular expressions
      [/\/(?=([^\/\\\n]|\\.)+\/)/, "regexp", "@regexp"],

      // Potential paths or identifiers
      // This is complex - needs to check for slashes, JS globals, etc.
      [
        /[a-zA-Z_$@~][a-zA-Z0-9_$@~!%&*+\-^|]*/,
        {
          cases: {
            "@keywords": "keyword",
            "@jsGlobals": { token: "identifier", next: "@afterGlobal" },
            "@default": { token: "@rematch", next: "@identifierOrPath" },
          },
        },
      ],

      // Pipe operators (must come before other operators)
      [/->|→/, "keyword.operator.pipe"],

      // Arrow function operator (must come before = delimiter and > delimiter)
      [/=>/, "operator"],

      // Operators and delimiters
      [/[{}()\[\]]/, "@brackets"],
      [/[<>](?![=])/, "delimiter"], // Not <= or >=
      [/[;,:.]/, "delimiter"],
      [/=(?![=>])/, "delimiter"], // Property getter or assignment
      [/[=<>!]=?/, "operator"],
      [/[+\-*\/%&|^!~?@]/, "operator"],
    ],

    // State: Angle bracket path <path>
    angleBracketPath: [
      [/\\>/, "constant"], // Escaped closing bracket
      [/>/, "constant", "@pop"],
      [/[^>\\]+/, "constant"],
      [/./, "constant"],
    ],

    // State: After JS global identifier (like Math, Object, etc.)
    // Treat . as property access delimiter, not path
    afterGlobal: [
      [/\./, "delimiter", "@pop"],
      [/./, { token: "@rematch", next: "@pop" }],
    ],

    // State: Scheme-based path https://example.com
    schemePath: [
      [/[a-zA-Z][a-zA-Z0-9+\-.]*:[^\s)\]}]+/, "constant", "@pop"],
      [/./, { token: "@rematch", next: "@pop" }],
    ],

    // State: Determine if identifier or path
    identifierOrPath: [
      // Check if contains slash - if so, it's a path
      [
        /[a-zA-Z_$@~][a-zA-Z0-9_$@~!%&*+\-^|.]*\/[^\s)\]}]*/,
        "constant",
        "@pop",
      ],
      // Check if contains dot - if so, it's a path (file name or dotted path)
      [/[a-zA-Z_$@~][a-zA-Z0-9_$@~!%&*+\-^|]*\.[a-zA-Z0-9_$@~!%&*+\-^|.]*/, "constant", "@pop"],
      // Check if contains hyphen after first char - if so, it's a path
      [/[a-zA-Z_$@~][a-zA-Z0-9_$@~!%&*+\-^|]*-[a-zA-Z0-9_$@~!%&*+\-^|.]*/, "constant", "@pop"],
      // Otherwise it's an identifier
      [/[a-zA-Z_$@~][a-zA-Z0-9_$@~!%&*+\-^|]*/, "identifier", "@pop"],
      [/./, { token: "@rematch", next: "@pop" }],
    ],

    // State: Block comment
    comment: [
      [/[^/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[/*]/, "comment"],
    ],

    // State: Double-quoted string
    string_double: [
      [/[^\\"]+/, "string"],
      [/@escapes/, "string.escape"],
      [/\\./, "string.escape.invalid"],
      [/"/, "string", "@pop"],
    ],

    // State: Single-quoted string
    string_single: [
      [/[^\\']+/, "string"],
      [/@escapes/, "string.escape"],
      [/\\./, "string.escape.invalid"],
      [/'/, "string", "@pop"],
    ],

    // State: Template string
    string_backtick: [
      [/\$\{/, "delimiter.bracket", "@bracketCounting"],
      [/[^\\`$]+/, "string"],
      [/@escapes/, "string.escape"],
      [/\\./, "string.escape.invalid"],
      [/`/, "string", "@pop"],
    ],

    // State: Template string interpolation
    bracketCounting: [
      [/\{/, "delimiter.bracket", "@bracketCounting"],
      [/\}/, "delimiter.bracket", "@pop"],
      { include: "root" },
    ],

    // State: Regular expression
    regexp: [
      [/(\/)([gimsuy]*)/, ["regexp", { token: "regexp", next: "@pop" }]],
      [/[^\\/\[]/, "regexp"],
      [/@escapes/, "regexp.escape"],
      [/\\./, "regexp.escape.invalid"],
      [/\[/, "regexp.escape", "@regexpCharClass"],
      [/./, "regexp"],
    ],

    // State: Regular expression character class
    regexpCharClass: [
      [/\]/, "regexp.escape", "@pop"],
      [/@escapes/, "regexp.escape"],
      [/[^\]\\]/, "regexp"],
    ],
  },
};
