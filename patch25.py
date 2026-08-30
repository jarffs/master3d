import sys
with open('app.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if '<!-- Profile Modal -->' in line or '<!-- Topbar' in line or '<script' in line:
        print(i, line.strip())
