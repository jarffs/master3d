import sys

with open('auth.js', 'r', encoding='utf-8') as f:
    content = f.read()

# find where modal is configured in switch logic
target1 = '''    authTitle.textContent = t('auth.login_title');
    authSubmitBtn.textContent = t('auth.login_btn');
    authSwitchText.textContent = t('auth.no_account');
    authSwitchAction.textContent = t('auth.register');'''

repl1 = '''    authTitle.textContent = t('auth.login_title');
    if (document.getElementById('auth-subtitle')) document.getElementById('auth-subtitle').textContent = 'Entre para personalizar modelos 3D';
    authSubmitBtn.textContent = t('auth.login_btn');
    authSwitchText.textContent = t('auth.no_account');
    authSwitchAction.textContent = t('auth.register');'''

target2 = '''    authTitle.textContent = t('auth.register_title');
    authSubmitBtn.textContent = t('auth.register_btn');
    authSwitchText.textContent = t('auth.has_account');
    authSwitchAction.textContent = t('auth.login');'''

repl2 = '''    authTitle.textContent = t('auth.register_title');
    if (document.getElementById('auth-subtitle')) document.getElementById('auth-subtitle').textContent = 'Crie uma conta para começar';
    authSubmitBtn.textContent = t('auth.register_btn');
    authSwitchText.textContent = t('auth.has_account');
    authSwitchAction.textContent = t('auth.login');'''

content = content.replace(target1, repl1)
content = content.replace(target2, repl2)

with open('auth.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('auth.js updated')
