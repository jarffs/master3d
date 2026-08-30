import sys
with open('profile.js', 'r', encoding='utf-8') as f:
    content = f.read()

import re
matches = re.findall(r'supabase\.from\(\'profiles\'\)\..*?;', content, re.DOTALL)
for match in matches:
    print(match)
