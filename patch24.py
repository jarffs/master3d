import re

with open('app.html', 'r', encoding='utf-8') as f:
    content = f.read()

tags = re.findall(r'<(/?[a-z0-9]+)', content, re.IGNORECASE)
open_tags = []
self_closing = ['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'path', 'circle', 'polyline', 'line']

for tag in tags:
    tag_name = tag.lower()
    if tag_name.startswith('/'):
        if len(open_tags) > 0 and open_tags[-1] == tag_name[1:]:
            open_tags.pop()
    elif tag_name not in self_closing:
        open_tags.append(tag_name)

print("Open tags left:", open_tags)
