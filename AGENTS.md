# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts (e.g. spelling fixes, style cleanups) do not need updates.

---

# AI Agent Rules — Auto-Knowledge Graph

Every AI agent (opencode, Claude, Cursor, Windsurf, Aider, etc.) working on this project **MUST** follow these rules to keep the knowledge graph auto-updated.

---

## CRITICAL: Auto-Update Knowledge Graph

After ANY code change (add file, edit file, delete file, rename file), you **MUST** run:

```bash
node scripts/quick-update.mjs
```

This takes **< 30 seconds** and updates `.understand-anything/knowledge-graph.json`.

### When to Run
- **After creating a new file** → run `node scripts/quick-update.mjs`
- **After editing a file** → run `node scripts/quick-update.mjs`
- **After deleting a file** → run `node scripts/quick-update.mjs`
- **After renaming a file** → run `node scripts/quick-update.mjs`
- **Before finishing your session** → run `node scripts/quick-update.mjs`

### What It Does
1. Scans all project files (excluding node_modules, dist, .git)
2. Detects new/changed/deleted files since last update
3. Updates the knowledge graph with new nodes and edges
4. Refreshes `PROJECT_AUDIT.md` with current structure
5. Updates `meta.json` with latest commit hash

**Total time: 10-30 seconds**

---

## Reading the Knowledge Graph

Before starting work, read the knowledge graph to understand the project:

```bash
# Quick project overview
cat .understand-anything/meta.json

# Full architecture (223 KB, parse with JSON)
cat .understand-anything/knowledge-graph.json | python3 -c "import json,sys; g=json.load(sys.stdin); print(f'Nodes: {len(g[\"nodes\"])}, Edges: {len(g[\"edges\"])}, Layers: {len(g[\"layers\"])}')"

# Human-readable audit
cat .understand-anything/PROJECT_AUDIT.md
```

---

## File Structure Reference

```
.understand-anything/
├── knowledge-graph.json    # Machine-readable graph (223 KB)
├── PROJECT_AUDIT.md        # Human-readable audit (26 KB)
├── meta.json               # Update metadata
└── .understandignore       # Files to exclude from scan
```

---

## Node ID Convention

When adding nodes, use these ID prefixes:

| Prefix | Type | Example |
|--------|------|---------|
| `file:` | Source code | `file:src/server.ts` |
| `config:` | Config files | `config:package.json` |
| `document:` | Documentation | `document:README.md` |
| `service:` | Services | `file:src/services/emailService.ts` |
| `test:` | Test files | `file:tests/aiCamera.test.ts` |

---

## Quick Commands

```bash
# Update graph (run after ANY file change)
node scripts/quick-update.mjs

# View project stats
node -e "const g=require('./.understand-anything/knowledge-graph.json'); console.log('Nodes:', g.nodes.length, 'Edges:', g.edges.length)"

# List all files in a layer
node -e "const g=require('./.understand-anything/knowledge-graph.json'); const l=g.layers.find(l=>l.id==='layer:api'); l.nodeIds.forEach(n=>console.log(n))"

# Find what imports a file
node -e "const g=require('./.understand-anything/knowledge-graph.json'); const file='src/server.ts'; g.edges.filter(e=>e.target==='file:'+file).forEach(e=>console.log(e.source, e.type))"
```

---

## Adding New Files

When you create a new file, the quick-update script will automatically:
1. Detect the new file
2. Add a node with type based on path/location
3. Scan for imports/exports to create edges
4. Assign to appropriate architecture layer

No manual editing of the graph is needed.

---

## Architecture Layers

| Layer | Description |
|-------|-------------|
| `layer:presentation` | Frontend React SPA |
| `layer:mobile` | React Native Expo app |
| `layer:api` | Express.js route handlers |
| `layer:service` | Business logic services |
| `layer:data` | Database, migrations, data files |
| `layer:infrastructure` | Middleware, workers, config |
| `layer:testing` | Test files |
| `layer:documentation` | Docs, specs, guides |
| `layer:scripts` | CLI tools, seed scripts |
| `layer:configuration` | Package configs, env files |

---

## Troubleshooting

### Graph seems outdated
```bash
node scripts/quick-update.mjs
```

### Graph is too large
The graph is ~223 KB for 258 files. This is normal. If it exceeds 1 MB, check for duplicate nodes:
```bash
node -e "const g=require('./.understand-anything/knowledge-graph.json'); const ids=g.nodes.map(n=>n.id); const dupes=ids.filter((id,i)=>ids.indexOf(id)!==i); console.log('Duplicates:', dupes)"
```

### New file not showing in graph
Run the update script:
```bash
node scripts/quick-update.mjs
```

---

## For Human Reference

- **Architecture**: See `layer:*` nodes in knowledge graph
- **Dependencies**: See `depends-on` and `imports` edges
- **API Routes**: See `layer:api` nodes
- **Services**: See `layer:service` nodes
- **Tests**: See `tested_by` edges

---

*This file ensures every AI agent keeps the project knowledge graph synchronized.*

---

## Delegating to Subagents

To maximize response efficiency and prevent main context bloat, agents **SHOULD** delegate tasks to subagents:
1. **Research & Code Scanning**: Delegate extensive file reading, codebase-wide grep searches, or external documentation lookups to the `research` subagent.
2. **Parallelizable/Isolated Tasks**: Use `self` or `research` subagents for independent tasks (e.g., verifying test cases, analyzing a specific component's security model) while keeping the main conversation focused on user interaction.
3. **Task Hand-off**: When starting a subagent, provide a clear, actionable prompt and wait for the system to notify you when it completes. Do not poll or loop in the meantime.

---

## UI Development Guidelines

**CRITICAL RULE FOR ALL NEW UI COMPONENTS:**
Never hardcode raw Tailwind colors like `bg-black/20`, `bg-[#18181b]`, `text-white`, or `bg-white/5` when building UI.
This breaks the light mode/theme toggle.
**ALWAYS** use the semantic Tailwind variables defined in the project:
- Backgrounds: `bg-bg`, `bg-bg2`, `bg-bg3`, `bg-glass-bg`
- Text: `text-text`, `text-muted`
- Borders: `border-border`, `border-glass-border`
