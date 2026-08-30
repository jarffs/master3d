import sys

with open('app.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Increase modal width
content = content.replace('max-width: 900px; padding: 40px;', 'max-width: 1100px; padding: 40px;')

with open('app.html', 'w', encoding='utf-8') as f:
    f.write(content)

with open('style.css', 'r', encoding='utf-8') as f:
    css = f.read()

import re

# Update dashboard grid columns
css = re.sub(r'(\.profile-dashboard-grid\s*\{[^}]*?grid-template-columns:\s*)1fr 350px(;\s*)', r'\11fr 1fr\2', css)

# Update pricing list layout to grid
old_list = '''.compact-pricing-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 450px;
  overflow-y: auto;
  padding-right: 8px;
}'''

new_list = '''.compact-pricing-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding-right: 4px;
}'''

css = css.replace(old_list, new_list)

with open('style.css', 'w', encoding='utf-8') as f:
    f.write(css)

print('Updated app.html and style.css for wider modal and grid pricing.')
