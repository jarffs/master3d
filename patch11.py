import re
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()
match = re.search(r'<section id="pricing".*?</section>', html, re.DOTALL)
if match:
    print(match.group(0)[:1000])
else:
    print('Pricing section not found')
