import re
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()
match = re.search(r'<section.*?class="pricing-section".*?</section>', html, re.DOTALL)
if match:
    print('Found pricing section, length:', len(match.group(0)))
else:
    print('Pricing section not found with class')
