import sys
with open('profile.js', 'r', encoding='utf-8') as f:
    content = f.read()

import re
matches = re.findall(r'save-name-btn.*?}\)', content, re.DOTALL)
for match in matches:
    print(match)
