import re
with open('style.css', 'r', encoding='utf-8') as f:
    css = f.read()
if '.theme-dark' in css or '[data-theme=\"dark\"]' in css:
    print('Dark theme found!')
else:
    print('No dark theme!')
