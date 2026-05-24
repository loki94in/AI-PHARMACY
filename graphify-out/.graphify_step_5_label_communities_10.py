import json
from pathlib import Path

labels = {
    0: "Backup & Compliance",
    1: "Core Demo Functions",
    2: "AI Camera & Learning",
    3: "WhatsApp Messaging",
    4: "Email Parsing",
    5: "Script Utilities",
    6: "Update Data Tools",
    7: "Claude Settings",
    8: "Dashboard Page",
    9: "Inventory Page"
}
Path('graphify-out/.graphify_labels.json').write_text(json.dumps({str(k): v for k, v in labels.items()}, ensure_ascii=False), encoding='utf-8')
print('Labels written')