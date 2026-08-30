import sys
with open('profile.js', 'r', encoding='utf-8') as f:
    content = f.read()

import re
matches = re.search(r'saveNameBtn\.addEventListener.*?}\);', content, re.DOTALL)
if matches:
    print(matches.group(0))
else:
    print('Not found')
