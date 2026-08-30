import sys

with open('app.html', 'r', encoding='utf-8') as f:
    content = f.read()

import re

# Encontrar o bloco do Enterprise Plan
pattern = r'<!-- Plano Enterprise \(Unlimited\) - Futuro -->.*?</div>\s*</div>'
match = re.search(pattern, content, re.DOTALL)
if match:
    content = content[:match.start()] + content[match.end():]
    with open('app.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Enterprise plan removed.")
else:
    print("Could not find Enterprise plan.")
