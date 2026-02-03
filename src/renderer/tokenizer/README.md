# Monarch tokenizer for Origami

This folder defines a [Monarch tokenizer](https://microsoft.github.io/monaco-editor/monarch.html) for the [Origami dialect of JavaScript expressions](https://weborigami.org/language/expressions). This is used for files that end in a `.ori` extension.

Although Origami's VS Code extension already defines a [TextMate grammar for Origami](https://github.com/WebOrigami/origami-vscode-extension/blob/main/syntaxes/origami.tmLanguage.json), that grammar definition cannot be used with Monaco.VS Code uses the Monaco code editor, but VS Code itself uses its own syntax highlighting system based on TextMate grammars and the Oniguruma regular expression engine.

Since Origami is now a dialect of JavaScript expressions, instead of porting the TextMate grammar, this tokenizer is created by starting with Monaco's own [TypeScript](https://github.com/microsoft/monaco-editor/blob/main/src/languages/definitions/typescript/typescript.ts) tokenizer and the associated [tests](https://github.com/microsoft/monaco-editor/blob/main/src/languages/definitions/typescript/typescript.test.ts).

We then: a) focus on JavaScript expressions, stripping all tokenizer features for statements and other non-expression syntax, and b) add the expression syntax unique to Origami.

## Paths

Origami's primary contribution to JavaScript expression syntax is support for inline slash-delimited paths that can contain file names (including periods). A path may also be a file name alone.

To let paths and file names like `ReadMe.md` coexist with JavaScript property references like `Math.max`, Origami uses a [heuristic](https://weborigami.org/language/expressions#file-name-heuristic) to distinguish them. That heuristic includes looking at local definitions of function parameter names or object property keys.

Those are not available to a tokenizer, so the tokenizer makes use of a simpler heuristic to interpret a period in a sequence like `a.b.c`:

1. If the initial `a` portion is a standard JavaScript global (`Math`, `Object`, etc.), the tokenizer treats the sequence as a standard JavaScript property reference. See Globals below. For purposes of this heuristic, the `b` and `c` portions do not effect tokenization.
1. Otherwise Origami treats the complete name `a.b.c` as a reference to a local file or folder. This is considered a path.

Additionally:

- Sequences that start with a scheme (protocol) and a colon are treated as paths, e.g.: `https://example.com`. Schemes are defined in [RFC 3986](https://datatracker.ietf.org/doc/html/rfc3986#section-3.1), which defines a scheme as `ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )`.
- Sequences containing slashes are paths: `foo/bar`, `markdown/`.
- Sequences in angle brackets are paths: `<src>`. Spaces are legal within angle brackets. Angle brackets cannot be nested; everything up to the closing bracket is considered part of the path.
- A path may start with a `.` or `..` but not a `...` (which represents the spread operator).

Each entire path is tokenized using the Monarch `constant` token. Example: `x/y` is a single `constant` token.

### Globals

The list of globals is drawn from the top-level keys of the object exported by `jsGlobals` in the @weborigami/language package. ([Source](https://github.com/WebOrigami/origami/blob/main/language/src/project/jsGlobals.js)) This list does not include browser or Node globals.

To avoid loading the @weborigami/language package at runtime, an array of the top-level globals is extracted with the `gen-globals` npm script and saved in the `globals.json` file.

## Spaces around operators

Spaces are required around binary math operators:

- `x + y`
- `x - y`
- `x * y`
- `x / y`

Without the spaces, Origami interprets, e.g., `x/y` as a path (above). Similarly, `x - y` is a subtraction, but `x-y` is a path.

## Object definitions

- Object property names may be a path: `{ index.html: "Home page" }`. This extends to shorthand properties: `{ assets/ }`.
- Property getters make use of an equals sign instead of a colon: `{ a = 1 }`. The equals sign is tokenized as a `delimiter`.
- A property name may be enclosed in parentheses to mark it as non-enumerable: `{ (hidden) = 'secret' }`

## Newlines as separators

Newlines may be used as separators in addition to, or instead of, commas:

- lambda function parameter lists: `(x\ny) => true`
- arrays: `[1\n2\n3]`
- object property definitions: `{\n  a: 1\n  b: 2\n}`

## Pipe operator

Origami supports an additional pipe operator for function calls: `x -> y` or `x → y`

## Origami shorthand syntax not supported

The tokenizer only supports core Origami expression syntax. It does not support the additional shell shorthand syntax used on the command line, including the use of implicit parentheses, shorthand functions like `=x`, and guillemet strings.

### Monarch tokenizing strategy

To accommodate the dialect features in Origami, the tokenizer uses the following general strategy:

1. If a sequence starts with `<`, read to the closing angle bracket and treat the entire sequence as a path. A closing angle bracket can be escaped.
1. If a sequence starts with a scheme, read until encountering whitespace or an expression-closing bracket: `)`, `]`, `}` and treat the sequence as a path. Closing brackets can be escaped.
1. Read until encountering whitespace or an expression-closing bracket. If the sequence contains a slash, it's a path.
1. If the sequence starts with a JS global and a period, handle as an object property access.
1. Otherwise handle as a normal JavaScript expression.

Generally speaking, the tokenizer uses multiple states like `path`, `string`, etc., rather than trying to maintain a single `root` state with complex regex patterns.

## Testing

Testing the Monarch tokenizer seems ridiculously difficult.

- Although a tokenizer seems like an obviously distinct component, Microsoft provides no direct API to Monarch, nor does it provide a way of loading Monarch separately from loading the Monaco code editor.
- Microsoft itself appears to use JSDOM to load Monaco in a headless fashion. Tests then interact with an instance of Monaco.

To keep things simple, this project does its substantive testing of the Origami tokenizer for Monarch in an HTML page at /test/tokenizer/index.html.

- The page expects to be run by a local HTTP server running at the project root.
- The page loads an instance of Monaco from node_modules
- The page conducts a series of unit tests that check the tokenization of representative code fragments and displays the results in the console.
