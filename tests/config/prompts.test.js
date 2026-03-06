"use strict";

/**
 * Unit tests for config/prompts.js
 *
 * Verifies that prompts load correctly from prompts/*.md files.
 */

const { ASK, TASK, JIRA } = require("../../config/prompts");

describe("config/prompts", () => {
  describe("exports", () => {
    test("exports ASK, TASK, JIRA", () => {
      expect(ASK).toBeDefined();
      expect(TASK).toBeDefined();
      expect(JIRA).toBeDefined();
    });

    test("each prompt has system and user strings", () => {
      for (const prompt of [ASK, TASK, JIRA]) {
        expect(typeof prompt.system).toBe("string");
        expect(typeof prompt.user).toBe("string");
      }
    });

    test("system prompts are non-empty", () => {
      expect(ASK.system.length).toBeGreaterThan(50);
      expect(TASK.system.length).toBeGreaterThan(50);
      expect(JIRA.system.length).toBeGreaterThan(50);
    });
  });

  describe("placeholders", () => {
    test("ASK.user contains {question} and {context}", () => {
      expect(ASK.user).toContain("{question}");
      expect(ASK.user).toContain("{context}");
    });

    test("TASK.user contains {question} and {context}", () => {
      expect(TASK.user).toContain("{question}");
      expect(TASK.user).toContain("{context}");
    });

    test("JIRA.user contains {question} and {context}", () => {
      expect(JIRA.user).toContain("{question}");
      expect(JIRA.user).toContain("{context}");
    });
  });
});
