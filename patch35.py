import sys
with open('app.html', 'r', encoding='utf-8') as f:
    content = f.read()

import re
matches = re.search(r'<div class="profile-right-col".*?</div>\s*</div>\s*</div>', content, re.DOTALL)
if matches:
    print(matches.group(0)[:500])
