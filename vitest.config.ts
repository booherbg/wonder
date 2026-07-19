import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Fable agents work in git worktrees under .claude/worktrees/. Those carry
    // their own — often mid-edit, deliberately-failing — copies of the tests.
    // Keep them out of the main suite so `vitest run` only ever judges main.
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
});
