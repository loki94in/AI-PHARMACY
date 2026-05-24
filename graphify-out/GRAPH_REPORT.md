# Graph Report - .  (2026-05-24)

## Corpus Check
- Corpus is ~10,073 words - fits in a single context window. You may not need a graph.

## Summary
- 39 nodes · 33 edges · 10 communities (5 shown, 5 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]

## God Nodes (most connected - your core abstractions)
1. `Settings & Preferences (Page 14)` - 7 edges
2. `whatsapp Flag` - 5 edges
3. `loadPageData` - 4 edges
4. `email_parser Flag` - 4 edges
5. `ai_camera Flag` - 3 edges
6. `learning_engine Flag` - 3 edges
7. `legal_register Flag` - 3 edges
8. `permissions` - 2 edges
9. `initDemo` - 2 edges
10. `cloud_backup Flag` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Settings & Preferences (Page 14)` --references--> `ai_camera Flag`  [EXTRACTED]
  ui-demo.html → docs/superpowers/specs/2026-05-23-page-wise-design.md
- `Settings & Preferences (Page 14)` --references--> `email_parser Flag`  [EXTRACTED]
  ui-demo.html → docs/superpowers/specs/2026-05-23-page-wise-design.md
- `Expiry Monitor (Page 7)` --references--> `whatsapp Flag`  [EXTRACTED]
  ui-demo.html → docs/superpowers/specs/2026-05-23-page-wise-design.md
- `CRM (Page 8)` --references--> `whatsapp Flag`  [EXTRACTED]
  ui-demo.html → docs/superpowers/specs/2026-05-23-page-wise-design.md
- `Settings & Preferences (Page 14)` --references--> `whatsapp Flag`  [EXTRACTED]
  ui-demo.html → docs/superpowers/specs/2026-05-23-page-wise-design.md

## Hyperedges (group relationships)
- **Pages using ai_camera Flag** — page1, page5 [EXTRACTED 1.00]
- **Pages using email_parser Flag** — page4, page6, page10 [EXTRACTED 1.00]
- **Pages using whatsapp Flag** — page7, page8, page15, page19 [EXTRACTED 1.00]

## Communities (10 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.25
Nodes (8): cloud_backup Flag, cloud_export Flag, legal_register Flag, Safety & Backup (Page 13), Settings & Preferences (Page 14), Archive & Purge (Page 16), Legal & Compliance (Page 17), Reports & Analytics (Page 9)

### Community 1 - "Community 1"
Cohesion: 0.33
Nodes (6): apiGet, initDemo, loadPageData, mockDb, show, updateFlags

### Community 2 - "Community 2"
Cohesion: 0.40
Nodes (5): ai_camera Flag, learning_engine Flag, POS Billing (Page 1), Learning Engine (Page 18), Returns & Expiry (Page 5)

### Community 3 - "Community 3"
Cohesion: 0.40
Nodes (5): whatsapp Flag, Support & Dispatch (Page 15), Messaging Hub (Page 19), Expiry Monitor (Page 7), CRM (Page 8)

### Community 4 - "Community 4"
Cohesion: 0.50
Nodes (4): email_parser Flag, Email Parser (Page 10), Purchases (Page 4), Orders & Requests (Page 6)

## Knowledge Gaps
- **23 isolated node(s):** `mockDb`, `fs`, `html`, `allow`, `apiGet` (+18 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Settings & Preferences (Page 14)` connect `Community 0` to `Community 2`, `Community 3`, `Community 4`?**
  _High betweenness centrality (0.257) - this node is a cross-community bridge._
- **Why does `whatsapp Flag` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `email_parser Flag` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **What connects `mockDb`, `fs`, `html` to the rest of the system?**
  _23 weakly-connected nodes found - possible documentation gaps or missing edges._