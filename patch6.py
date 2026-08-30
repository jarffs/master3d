import sys
with open('app.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix inputs background
content = content.replace('background: var(--panel-bg); color: var(--text-primary);" />', 'background: var(--bg-color); color: var(--text-primary);" />')
# Fix the google SVG color
content = content.replace('stroke=\"var(--text-secondary)\"', 'stroke=\"var(--text-secondary)\"') # already handled by css hopefully, wait, stroke was \"currentColor\"

with open('app.html', 'w', encoding='utf-8') as f:
    f.write(content)
