import sys
import re

with open('app.html', 'r', encoding='utf-8') as f:
    content = f.read()

# We need to find the entire <div id="auth-modal" class="modal hidden"> ... </div> block and replace it.
# It starts at: <div id="auth-modal" class="modal hidden">
# And ends at the matching closing </div> before profile-modal.

start_tag = '<div id=\"auth-modal\" class=\"modal hidden\">'
end_tag = '<!-- Profile Modal -->'

if start_tag in content and end_tag in content:
    before = content.split(start_tag)[0]
    after = end_tag + content.split(end_tag)[1]

    new_modal = '''<div id="auth-modal" class="modal hidden">
      <div class="modal-content" style="max-width: 420px; border-radius: 12px; padding: 40px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); background: white;">
        <button id="close-modal-btn" class="close-btn">&times;</button>
        
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 id="auth-title" style="margin: 0 0 8px 0; font-size: 28px; font-weight: 700; color: #111827;" data-i18n="auth.login_title">Bem-vindo de Volta</h2>
          <p id="auth-subtitle" style="margin: 0; color: #6b7280; font-size: 14px;" data-i18n="auth.login_subtitle">Entre para personalizar modelos 3D</p>
        </div>

        <button id="google-auth-btn" type="button" style="width: 100%; display: flex; align-items: center; justify-content: space-between; background: white; color: #374151; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px 16px; font-weight: 500; font-size: 14px; cursor: pointer; margin-bottom: 24px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: background 0.3s;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 24px; height: 24px; border-radius: 50%; background: #e5e7eb; display: flex; align-items: center; justify-content: center; overflow: hidden; color: #6b7280;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </div>
            <div style="text-align: left; line-height: 1.2;">
              <span style="display: block; font-size: 13px; font-weight: 600;" data-i18n="auth.google_login">Continuar com o Google</span>
            </div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        </button>

        <div id="auth-divider" style="display: flex; align-items: center; margin-bottom: 24px;">
          <div style="flex: 1; height: 1px; background: #e5e7eb;"></div>
          <span style="padding: 0 16px; color: #9ca3af; font-size: 13px;" data-i18n="auth.or_continue_email">ou continue com e-mail</span>
          <div style="flex: 1; height: 1px; background: #e5e7eb;"></div>
        </div>

        <form id="auth-form" style="display: flex; flex-direction: column; gap: 16px;">
          <div class="input-group" style="margin-bottom: 0;">
            <label for="auth-email" style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px; display: block;" data-i18n="auth.email">E-mail</label>
            <input type="email" id="auth-email" placeholder="voce@exemplo.com" required style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: white; color: #111827;" />
          </div>
          
          <div class="input-group" style="margin-bottom: 0;">
            <label for="auth-password" style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 6px; display: block;" data-i18n="auth.password">Senha</label>
            <input type="password" id="auth-password" placeholder="••••••••" required style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: white; color: #111827;" />
            <div style="text-align: right; margin-top: 8px;">
              <button type="button" id="forgot-password-btn" class="text-btn" style="background:none; border:none; color:#6b7280; font-size:13px; cursor:pointer; padding:0; text-decoration: none;" data-i18n="auth.forgot_password">Esqueceu a senha?</button>
            </div>
          </div>

          <p id="auth-error" class="error-msg hidden" style="color: #e11d48; font-size: 13px; margin: 0;"></p>
          <p id="auth-success" class="success-msg hidden" style="color: #10b981; font-size: 13px; margin: 0;"></p>

          <button type="submit" id="auth-submit-btn" style="width: 100%; padding: 14px; background: #603a45; color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 16px; cursor: pointer; margin-top: 8px; transition: opacity 0.3s;" data-i18n="auth.login_btn">Entrar</button>
        </form>

        <div style="text-align: center; margin-top: 24px;">
          <p class="auth-switch" style="font-size: 14px; margin: 0 0 8px 0; color: #6b7280;">
            <span id="auth-switch-text" data-i18n="auth.no_account">Não tem uma conta?</span>
            <button id="auth-switch-action" type="button" class="text-btn" style="background:none; border:none; color:#111827; font-weight:700; cursor:pointer; padding: 0 4px;" data-i18n="auth.register">Cadastrar</button>
          </p>
          <p id="auth-bonus-text" style="font-size: 14px; font-weight: 600; color: #603a45; margin: 0 0 24px 0;" data-i18n="auth.bonus_credits">É grátis! Ganhe 3 créditos ao se cadastrar.</p>
          
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">
            <a href="#" style="color: inherit; text-decoration: none;" data-i18n="auth.terms">Termos de Uso</a> • 
            <a href="#" style="color: inherit; text-decoration: none;" data-i18n="auth.privacy">Política de Privacidade</a>
          </p>
        </div>
      </div>
    </div>
    
    '''

    new_content = before + start_tag + new_modal[41:] + after

    with open('app.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Modal updated!")
else:
    print("Could not find start or end tags")
