"use strict";

/**
 * Unit tests for config/stopwords.js
 *
 * Verifies that stopwords load correctly from prompts/stopwords.md.
 */

const stopwords = require("../../config/stopwords");

describe("config/stopwords", () => {
  test("exports a Set", () => {
    expect(stopwords instanceof Set).toBe(true);
  });

  test("contains expected stop words", () => {
    expect(stopwords.has("what")).toBe(true);
    expect(stopwords.has("how")).toBe(true);
    expect(stopwords.has("the")).toBe(true);
    expect(stopwords.has("and")).toBe(true);
  });

  test("excludes non-stopwords", () => {
    expect(stopwords.has("registration")).toBe(false);
    expect(stopwords.has("authentication")).toBe(false);
  });

  test("has reasonable size", () => {
    expect(stopwords.size).toBeGreaterThanOrEqual(60);
  });
});
