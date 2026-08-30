import sys
with open('app_backup.html', 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find('<!-- Profile Modal -->')
if start_idx != -1:
    modal_end_idx = content.find('    <!-- Designs Modal -->', start_idx)
    print("Between Profile and Designs Modal:")
    print(content[start_idx:modal_end_idx][-100:])
