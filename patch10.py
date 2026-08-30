import sys

with open('app.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Change modal background to solid white
content = content.replace('class=\"modal-content\" style=\"max-width: 420px; border-radius: 12px; padding: 40px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); background: var(--bg-surface);\"', 'class=\"modal-content\" style=\"max-width: 420px; border-radius: 12px; padding: 40px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); background: #ffffff;\"')

# Change Google auth button background to solid white
content = content.replace('justify-content: space-between; background: var(--bg-surface); color: var(--text-primary);', 'justify-content: space-between; background: #ffffff; color: var(--text-primary);')

# Change input fields background to var(--bg-main)
content = content.replace('background: var(--bg-surface); color: var(--text-primary);\" />', 'background: var(--bg-main); color: var(--text-primary);\" />')
content = content.replace('background: var(--bg-color); color: var(--text-primary);\" />', 'background: var(--bg-main); color: var(--text-primary);\" />')

with open('app.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Solid white applied!')
