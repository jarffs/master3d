import sys

with open('profile.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove tab logic
tab_logic_start = "    // Configurar abas do modal"
tab_logic_end = "    // Event listeners para avatar"

# If the tab logic is present, remove it
start_idx = content.find(tab_logic_start)
end_idx = content.find(tab_logic_end)
if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + content[end_idx:]

# We need to make sure the loadUserCredits function also updates the shop credits
credits_logic_start = "if (creditsEl) creditsEl.textContent = Number(data.credits);"
credits_logic_replace = "if (creditsEl) creditsEl.textContent = Number(data.credits);\n        const shopCreditsEl = document.getElementById('profile-current-credits-shop');\n        if (shopCreditsEl) shopCreditsEl.textContent = Number(data.credits);"

content = content.replace(credits_logic_start, credits_logic_replace)

# Also remove references to .tab-content and .active
# Specifically openProfileModal function which has:
# document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
# document.querySelector('.tab-btn[data-tab=\"avatar-tab\"]').classList.add('active');
# document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
# document.getElementById('avatar-tab').classList.add('active');

open_modal_to_remove = '''    // Resetar abas
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab=\"avatar-tab\"]').classList.add('active');
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById('avatar-tab').classList.add('active');'''

content = content.replace(open_modal_to_remove, '')

with open('profile.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('profile.js updated')
