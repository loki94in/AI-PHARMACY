# AI Agent Collaboration Rules (Claude & Antigravity)

Hello Claude! You are working on this project side-by-side with another agent (Antigravity). To guarantee you never encounter an error and that our workflows stay perfectly in sync, **you must obey the following rules at all times:**

## 1. Always Run General Tests
Never attempt to test a specific file path like `npm test tests/utils/something.test.ts`. 
**Rule:** Always simply run `npm test`. The testing framework is configured to find and safely test all existing files without crashing.

## 2. Sync Before You Start
Antigravity is building features in the main branch. If you are working in a separate worktree or branch (e.g., `whatsapp-dev`), you might not have the latest files.
**Rule:** Before you attempt to test or modify a file that you didn't create, run a git pull or merge from the `main` branch to ensure you have the latest code.

## 3. Verify File Existence
Do not blindly run file-specific commands.
**Rule:** Always use your file listing / search tools to verify a file actually exists in your current folder before executing commands on it.

## 4. Testing Framework Safety
If you run `npm test` and no tests match, the framework is configured to exit with **Code 0** (`--passWithNoTests`). Do not treat this as an error.

## 5. Tool Formatting (CRITICAL)
When using your `Bash` or `Command` tools, **YOU MUST NEVER leave the `command` parameter blank.** Always provide the actual valid shell command string you wish to run. Leaving it empty will crash your tool execution with an `InputValidation` error.

## 6. Avoiding Edit Failures (HTML & Script Injection)
When editing an existing HTML file, your native find/replace tool will frequently throw an "Edit failed" error if you try to replace large chunks of nested HTML. This is because even a single hidden tab, invisible space, or newline mismatch will cause the exact-match algorithm to fail.

**FOOLPROOF RULES FOR NEVER FAILING AN EDIT:**
1. **Never attempt to replace large blocks of nested `<div>`s.**
2. If you need to append a `<script>` or add new content, target a **tiny, unique, single-line anchor** (like `</body>` or `</main>`).
   - *Example:* Replace `</body>` with `<script> // your code </script>\n</body>`.
3. If you must modify a large HTML component, either write a quick Node.js script using `fs.writeFileSync` to rewrite the file directly, OR read the file first and replace only small 1-3 line chunks at a time.
4. **ALWAYS read the file first** to capture the exact whitespace and indentation before attempting a replace.

## 7. Artifacts & File Writing Paths
If you are asked to generate a "plan" or an "artifact", **do not save it to the project root.** You must strictly use the designated absolute artifact folder path provided by your system prompt (e.g., `C:\Users\...`). Attempting to write artifacts to unauthorized folders will result in an `Invalid tool parameters` or `Write failed` error.

## 8. Preventing Freezes / Long Generations
If you are generating a massive checklist, log output, or plan, the terminal streaming may freeze or hang (e.g., getting stuck "Generating..." for 15+ minutes). To avoid this:
**Rule:** Write large outputs directly to a markdown file in the workspace or artifact directory rather than attempting to stream thousands of tokens directly to the chat console. 


When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.

## CRITICAL: Auto-Update Knowledge Graph

After ANY code change (add/edit/delete/rename file), run:
```bash
node scripts/quick-update.mjs
```
This takes ~30 seconds and keeps the knowledge graph in sync. See `AGENTS.md` for full details.

The Four Principles in Detail
## 9. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

LLMs often pick an interpretation silently and run with it. This principle forces explicit reasoning:

State assumptions explicitly — If uncertain, ask rather than guess
Present multiple interpretations — Don't pick silently when ambiguity exists
Push back when warranted — If a simpler approach exists, say so
Stop when confused — Name what's unclear and ask for clarification
## 10. Simplicity First
Minimum code that solves the problem. Nothing speculative.

Combat the tendency toward overengineering:

No features beyond what was asked
No abstractions for single-use code
No "flexibility" or "configurability" that wasn't requested
No error handling for impossible scenarios
If 200 lines could be 50, rewrite it
The test: Would a senior engineer say this is overcomplicated? If yes, simplify.

## 11. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting
Don't refactor things that aren't broken
Match existing style, even if you'd do it differently
If you notice unrelated dead code, mention it — don't delete it
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused
Don't remove pre-existing dead code unless asked
The test: Every changed line should trace directly to the user's request.

## 12. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform imperative tasks into verifiable goals:

Instead of...	Transform to...
"Add validation"	"Write tests for invalid inputs, then make them pass"
"Fix the bug"	"Write a test that reproduces it, then make it pass"
"Refactor X"	"Ensure tests pass before and after"
For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

## 13. Token Efficiency
Minimize tokens without reducing clarity, correctness, or maintainability.

- Ask only necessary questions
- Keep context focused and relevant
- Prefer concise explanations and smaller diffs
- Avoid repetition, verbosity, and speculative output
- Generate only what was requested
- Use simple structure over clever complexity

The test: Could this achieve the same result with fewer tokens and no loss of understanding?
Strong success criteria let the LLM loop independently. Weak criteria ("make it work") require constant clarification.

## 14. Skill and Plugin Synchronization
Whenever you install, update, or configure a new skill, plugin, or tool for the Claude CLI, you MUST automatically check for and run the equivalent installation command for the VS Code extension (if available) to ensure both the CLI and VS Code environments remain perfectly in sync on the PC.

By following these rules, we will build a flawless application together!
