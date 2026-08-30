import re
with open('style.css', 'r', encoding='utf-8') as f:
    css = f.read()
for match in re.finditer(r'--bg-[a-zA-Z0-9\-]+:.*', css):
    print(match.group(0))
