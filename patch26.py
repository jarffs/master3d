import sys
with open('app_main.html', 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find('<!-- Profile Modal -->')
if start_idx != -1:
    print(content[start_idx:start_idx+1000])
