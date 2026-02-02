import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { language } from "../../src/renderer/tokenizer/origami.js";

/**
 * Simplified tokenizer test harness
 * Validates that the tokenizer definition is correct without requiring Monaco
 */
describe("Origami Monarch tokenizer", () => {
  test("paths", () => {
    // Test that key attributes exist
    assert(language.tokenizer);
    assert(language.tokenizer.root);
    assert(language.tokenizer.angleBracketPath);
    assert(language.tokenizer.schemePath);

    // Test globals array
    assert(Array.isArray(language.jsGlobals));
    assert(language.jsGlobals.includes("Math"));
    assert(language.jsGlobals.includes("Object"));
    assert(!language.jsGlobals.includes("window"));
  });

  test("keywords", () => {
    assert(Array.isArray(language.keywords));
    assert(language.keywords.includes("await"));
    assert(language.keywords.includes("async"));
  });

  test("operators", () => {
    assert(Array.isArray(language.operators));
    assert(language.operators.includes("->"));
    assert(language.operators.includes("→"));
    assert(language.operators.includes("=>"));
  });

  test("bracket matching", () => {
    assert(Array.isArray(language.brackets));
    assert.equal(language.brackets.length, 4);
  });

  test("token rules", () => {
    const rootRules = language.tokenizer.root;

    assert(Array.isArray(rootRules));
    assert(rootRules.length > 10);

    // Check for specific rule patterns
    const hasAngleBracketRule = rootRules.some(
      (rule) => /** @type {any} */ (rule[0])?.source === "<" || rule[0] === "<",
    );
    assert(hasAngleBracketRule);

    const hasPipeRule = rootRules.some((rule) => {
      const pattern = /** @type {any} */ (rule[0]);
      if (pattern?.source) {
        return pattern.source.includes("->");
      }
      return false;
    });
    assert(hasPipeRule);
  });
});
