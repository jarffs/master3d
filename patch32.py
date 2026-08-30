import sys

with open('app.html', 'r', encoding='utf-8') as f:
    app_content = f.read()

with open('app_backup.html', 'r', encoding='utf-8') as f:
    backup_content = f.read()

# Encontrar o início do Cropper Modal no backup
cropper_idx = backup_content.find('    <!-- Cropper Modal -->')

if cropper_idx != -1:
    missing_scripts_and_modals = backup_content[cropper_idx:]
    
    # Remover do app_content atual tudo a partir do <!-- Designs Modal -->, para não duplicar
    designs_idx = app_content.find('    <!-- Designs Modal -->')
    if designs_idx != -1:
        app_content_clean = app_content[:designs_idx]
    else:
        app_content_clean = app_content
        
    # Escrever a versão final
    with open('app.html', 'w', encoding='utf-8') as f:
        f.write(app_content_clean + missing_scripts_and_modals)
        
    print("Scripts and Cropper Modal restored successfully!")
else:
    print("Cropper Modal not found in backup")
