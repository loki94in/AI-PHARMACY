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

By following these rules, we will build a flawless application together!
