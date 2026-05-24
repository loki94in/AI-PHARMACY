import json
from pathlib import Path

cached_path = Path('graphify-out/.graphify_cached.json')
cached = json.loads(cached_path.read_text(encoding='utf-8')) if cached_path.exists() else {'nodes': [], 'edges': [], 'hyperedges': []}
new_path = Path('graphify-out/.graphify_semantic_new.json')
new = json.loads(new_path.read_text(encoding='utf-8')) if new_path.exists() else {'nodes': [], 'edges': [], 'hyperedges': []}

all_nodes = cached.get('nodes', []) + new.get('nodes', [])
all_edges = cached.get('edges', []) + new.get('edges', [])
all_hyperedges = cached.get('hyperedges', []) + new.get('hyperedges', [])

# Deduplicate nodes by id
seen = set()
unique_nodes = []
for n in all_nodes:
    if n['id'] not in seen:
        seen.add(n['id'])
        unique_nodes.append(n)

merged = {
    'nodes': unique_nodes,
    'edges': all_edges,
    'hyperedges': all_hyperedges,
    'input_tokens': new.get('input_tokens', 0),
    'output_tokens': new.get('output_tokens', 0),
}
Path('graphify-out/.graphify_semantic.json').write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding='utf-8')
print(f'Extraction complete - {len(unique_nodes)} nodes, {len(all_edges)} edges ({len(cached.get("nodes", []))} from cache, {len(new.get("nodes", []))} new)')