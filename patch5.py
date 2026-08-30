import sys

with open('app.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace hardcoded colors with CSS variables
replacements = {
    'background: white;': 'background: var(--panel-bg);',
    'color: #111827;': 'color: var(--text-primary);',
    'color: #6b7280;': 'color: var(--text-secondary);',
    'color:#6b7280;': 'color: var(--text-secondary);',
    'color: #374151;': 'color: var(--text-primary);',
    'color: #9ca3af;': 'color: var(--text-secondary);',
    'color: #603a45;': 'color: var(--accent-color);',
    'color:#111827;': 'color: var(--accent-color);', # Register button
    'background: #e5e7eb;': 'background: var(--border-color);',
    'border: 1px solid #d1d5db;': 'border: 1px solid var(--border-color);',
    'Entre para personalizar modelos 3D': 'Personalize seus modelos 3D',
    'style="width: 100%; padding: 14px; background: #603a45; color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 16px; cursor: pointer; margin-top: 8px; transition: opacity 0.3s;"': 'class="primary-btn" style="width: 100%; padding: 14px; font-size: 16px; margin-top: 8px;"'
}

for k, v in replacements.items():
    content = content.replace(k, v)

# Also fix the subtitle in auth.js
with open('auth.js', 'r', encoding='utf-8') as f:
    auth_content = f.read()

auth_content = auth_content.replace("'Entre para personalizar modelos 3D'", "'Personalize seus modelos 3D'")
auth_content = auth_content.replace("'Crie uma conta para começar'", "'Personalize seus modelos 3D'")

with open('app.html', 'w', encoding='utf-8') as f:
    f.write(content)
with open('auth.js', 'w', encoding='utf-8') as f:
    f.write(auth_content)

print('Colors and subtitle reverted/updated!')
