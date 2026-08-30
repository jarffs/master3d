import sys

with open('app.html', 'r', encoding='utf-8') as f:
    app_content = f.read()

with open('app_backup.html', 'r', encoding='utf-8') as f:
    backup_content = f.read()

designs_modal_idx = backup_content.find('    <!-- Designs Modal -->')
if designs_modal_idx != -1:
    missing_part = backup_content[designs_modal_idx:]
    # Append the missing part to app_content
    with open('app.html', 'w', encoding='utf-8') as f:
        f.write(app_content + missing_part)
    print("Fixed app.html successfully!")
else:
    print("Could not find Designs Modal in backup.")
