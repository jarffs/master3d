import re
with open('style.css', 'r', encoding='utf-8') as f:
    css = f.read()
for match in re.finditer(r'--panel-bg:.*', css):
    print(match.group(0))
