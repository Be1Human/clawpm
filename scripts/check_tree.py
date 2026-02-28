import json

with open("/tmp/tree.json") as f:
    tree = json.load(f)

print(f"Total root nodes: {len(tree)}")
for node in tree:
    t = node.get("type", "?")
    children = node.get("children", [])
    indent = ""
    print(f"{indent}[{t:8}] {node['taskId']} - {node['title'][:30]} | progress={node['progress']}% status={node['status']} children={len(children)}")
    for c in children:
        ct = c.get("type", "?")
        cc = c.get("children", [])
        print(f"  [{ct:8}] {c['taskId']} - {c['title'][:30]} | progress={c['progress']}% children={len(cc)}")
        for g in cc:
            gt = g.get("type", "?")
            gc = g.get("children", [])
            print(f"    [{gt:8}] {g['taskId']} - {g['title'][:30]} | progress={g['progress']}% children={len(gc)}")
            for s in gc:
                print(f"      [{s.get('type','?'):8}] {s['taskId']} - {s['title'][:30]}")
