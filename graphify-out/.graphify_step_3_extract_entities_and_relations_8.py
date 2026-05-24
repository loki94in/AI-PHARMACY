import json
from pathlib import Path

ast_path = Path('graphify-out/.graphify_ast.json')
sem_path = Path('graphify-out/.graphify_semantic.json')
ast = json.loads(ast_path.read_text(encoding='utf-8'))
sem = json.loads(sem_path.read_text(encoding='utf-8'))

# Merge
seen = {n['id'] for n in ast.get('nodes', [])}
merged_nodes = list(ast.get('nodes', []))
for n in sem.get('nodes', []):
    if n['id'] not in seen:
        merged_nodes.append(n)
        seen.add(n['id'])

merged_edges = ast.get('edges', []) + sem.get('edges', [])
merged_hyperedges = sem.get('hyperedges', [])
merged = {
    'nodes': merged_nodes,
    'edges': merged_edges,
    'hyperedges': merged_hyperedges,
    'input_tokens': sem.get('input_tokens', 0),
    'output_tokens': sem.get('output_tokens', 0),
}
Path('graphify-out/.graphify_extract.json').write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding='utf-8')
print(f'Merged: {len(merged_nodes)} nodes, {len(merged_edges)} edges ({len(ast.get("nodes", []))} AST + {len(sem.get("nodes", []))} semantic)')