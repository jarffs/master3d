import sys
with open('app.html', 'r', encoding='utf-8') as f:
    content = f.read()
if '<div id="auth-modal"' in content:
    print('auth-modal is present')
else:
    print('auth-modal is MISSING')

if '<div id="profile-modal"' in content:
    print('profile-modal is present')
else:
    print('profile-modal is MISSING')

if '<div id="auth-section"' in content:
    print('auth-section is present')
else:
    print('auth-section is MISSING')
