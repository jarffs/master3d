import { supabase } from './supabaseClient.js';
import { t } from './i18n.js';

const loginBtn = document.getElementById('login-btn');
const authSection = document.getElementById('auth-section');
const authModal = document.getElementById('auth-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authSwitchAction = document.getElementById('auth-switch-action');
const authSwitchText = document.getElementById('auth-switch-text');
const authError = document.getElementById('auth-error');
const authNotice = document.getElementById('auth-notice');
const authSuccess = document.getElementById('auth-success');

export function openAuthModal(message) {
  if (authNotice) {
    authNotice.textContent = message || '';
    authNotice.classList.toggle('hidden', !message);
  }
  authModal.classList.remove('hidden');
}

function setLoginMode(loginMode) {
  isLoginMode = loginMode;
  authError.classList.add('hidden');
  authTitle.textContent = t(isLoginMode ? 'auth.login_title' : 'auth.register_title');
  if (document.getElementById('auth-subtitle')) document.getElementById('auth-subtitle').textContent = 'Personalize seus modelos 3D';
  authSubmitBtn.textContent = t(isLoginMode ? 'auth.login_btn' : 'auth.register_btn');
  authSwitchText.textContent = t(isLoginMode ? 'auth.no_account' : 'auth.has_account');
  authSwitchAction.textContent = t(isLoginMode ? 'auth.register' : 'auth.login');
}

export function openLoginModal(message) {
  setLoginMode(true);
  openAuthModal(message);
}

export function openRegistrationModal(message) {
  setLoginMode(false);
  openAuthModal(message);
}
const forgotPasswordBtn = document.getElementById('forgot-password-btn');

let isLoginMode = true;
let isRecoveryMode = false;

// Define se o usuário está logado
export let currentUser = null;
export let userProfile = null;

// Callbacks para quando o estado de auth mudar
const authListeners = [];
export function onAuthChange(callback) {
  authListeners.push(callback);
}

function notifyListeners() {
  authListeners.forEach(cb => cb(currentUser, userProfile));
}

// Inicializa a sessão atual
async function initAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  await handleSession(session);
  
  // Ouve mudanças (login, logout, recovery)
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      isRecoveryMode = true;
      authModal.classList.remove('hidden');
      authTitle.textContent = t('auth.reset_title');
      authSubmitBtn.textContent = t('auth.reset_btn');
      document.getElementById('auth-email').parentElement.classList.add('hidden');
      forgotPasswordBtn.classList.add('hidden');
      authSwitchText.parentElement.classList.add('hidden');
    }
    
    await handleSession(session);
  });
}

async function handleSession(session) {
  currentUser = session?.user || null;
  
  if (currentUser) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    
    if (error || !data) {
      // Tenta criar o perfil se não existir
      const { data: newProfile } = await supabase.from('profiles').insert([{ id: currentUser.id, credits: 3 }]).select().single();
      userProfile = newProfile;
    } else {
      userProfile = data;
    }
  } else {
    userProfile = null;
  }
  
  updateAuthUI();
  notifyListeners();
}

function updateAuthUI() {
  if (currentUser) {
    const avatarContent = userProfile?.avatar_url 
      ? `<img src="${userProfile.avatar_url}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`
      : currentUser.email.charAt(0).toUpperCase();

    authSection.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; position: relative;">
        <div id="topbar-credits" class="topbar-credits" title="${t('profile.credits')}">
          <span class="topbar-credits-label">${t('profile.credits')}</span>
          <strong>${userProfile?.credits ?? 0}</strong>
        </div>
        <div id="topbar-avatar" style="width: 32px; height: 32px; border-radius: 50%; background: var(--text-primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; cursor: pointer;" title="${t('profile.title')}">
          ${avatarContent}
        </div>
        <!-- Dropdown Menu -->
        <div id="avatar-dropdown" style="display: none; position: absolute; top: 100%; right: 0; margin-top: 8px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); flex-direction: column; min-width: 150px; z-index: 1000; overflow: hidden;">
          <button id="dropdown-profile-btn" style="padding: 12px 16px; background: none; border: none; text-align: left; cursor: pointer; color: var(--text-primary); font-size: 14px; border-bottom: 1px solid var(--border-color);" onmouseover="this.style.background='var(--bg-color)'" onmouseout="this.style.background='none'" data-i18n="profile.title">Perfil</button>
          <button id="dropdown-designs-btn" style="padding: 12px 16px; background: none; border: none; text-align: left; cursor: pointer; color: var(--text-primary); font-size: 14px; border-bottom: 1px solid var(--border-color);" onmouseover="this.style.background='var(--bg-color)'" onmouseout="this.style.background='none'" data-i18n="app.my_designs">Meus Projetos</button>
          <button id="dropdown-logout-btn" style="padding: 12px 16px; background: none; border: none; text-align: left; cursor: pointer; color: var(--text-secondary); font-size: 14px;" onmouseover="this.style.background='var(--bg-color)'" onmouseout="this.style.background='none'" data-i18n="nav.logout">Sair</button>
        </div>
      </div>
    `;
    
    const avatar = document.getElementById('topbar-avatar');
    const dropdown = document.getElementById('avatar-dropdown');
    
    avatar?.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? 'flex' : 'none';
    });
    
    document.addEventListener('click', () => {
      if (dropdown) dropdown.style.display = 'none';
    });
    
    document.getElementById('dropdown-profile-btn')?.addEventListener('click', async () => {
      const { openProfileModal } = await import('./profile.js');
      openProfileModal();
    });

    document.getElementById('dropdown-designs-btn')?.addEventListener('click', () => {
      window.dispatchEvent(new Event('open-designs-modal'));
    });

    document.getElementById('dropdown-logout-btn')?.addEventListener('click', async () => {
      await supabase.auth.signOut();
    });
  } else {
    authSection.innerHTML = `<button id="login-btn" class="secondary-btn" style="padding: 6px 16px; font-size: 13px; border-radius: 20px;">${t('nav.login')}</button>`;
    document.getElementById('login-btn')?.addEventListener('click', () => {
      openLoginModal();
    });
  }
}

// Eventos do Modal
loginBtn?.addEventListener('click', () => {
  openLoginModal();
});

closeModalBtn?.addEventListener('click', () => {
  authModal.classList.add('hidden');
});

authSwitchAction?.addEventListener('click', () => {
  setLoginMode(!isLoginMode);
});

document.getElementById('google-auth-btn')?.addEventListener('click', async () => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
    if (error) throw error;
  } catch (err) {
    authError.textContent = err.message || t('js.error_login');
    authError.classList.remove('hidden');
  }
});

forgotPasswordBtn?.addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value;
  authError.classList.add('hidden');
  authSuccess.classList.add('hidden');
  
  if (!email) {
    authError.textContent = t('auth.reset_desc');
    authError.classList.remove('hidden');
    return;
  }
  
  authSubmitBtn.disabled = true;
  forgotPasswordBtn.textContent = '...';
  
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/app.html',
    });
    if (error) throw error;
    
    authSuccess.textContent = t('js.reset_email_sent');
    authSuccess.classList.remove('hidden');
  } catch (err) {
    authError.textContent = err.message || t('js.error_reset');
    authError.classList.remove('hidden');
  } finally {
    authSubmitBtn.disabled = false;
    forgotPasswordBtn.textContent = t('auth.forgot_password');
  }
});

authForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');
  authSuccess.classList.add('hidden');
  
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  
  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = '...';
  
  try {
    if (isRecoveryMode) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      alert(t('js.password_updated'));
      authModal.classList.add('hidden');
      isRecoveryMode = false;
      document.getElementById('auth-email').parentElement.classList.remove('hidden');
      forgotPasswordBtn.classList.remove('hidden');
      authSwitchText.parentElement.classList.remove('hidden');
      authTitle.textContent = t('auth.login_title');
      authSubmitBtn.textContent = t('auth.login_btn');
    } else if (isLoginMode) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      authModal.classList.add('hidden');
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      alert(t('js.check_email'));
      authModal.classList.add('hidden');
    }
  } catch (err) {
    if (err.message && err.message.includes("Failed to execute 'fetch'")) {
      authError.textContent = "Erro de configuração: Verifique as variáveis de ambiente do Supabase no Vercel.";
    } else {
      authError.textContent = err.message || t('js.error_login');
    }
    authError.classList.remove('hidden');
  } finally {
    if (!isRecoveryMode) {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = isLoginMode ? t('auth.login_btn') : t('auth.register_btn');
    } else {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = t('auth.reset_btn');
    }
  }
});

initAuth();
