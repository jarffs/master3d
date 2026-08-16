import { supabase } from './supabaseClient.js';

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
const authSuccess = document.getElementById('auth-success');
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
      authTitle.textContent = 'Redefinir Senha';
      authSubmitBtn.textContent = 'Salvar Nova Senha';
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
      const { data: newProfile } = await supabase.from('profiles').insert([{ id: currentUser.id }]).select().single();
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
      <div style="display: flex; align-items: center; gap: 12px;">
        <button id="logout-btn" class="text-btn" style="font-size: 13px; color: var(--text-secondary); background: none; border: none; cursor: pointer;">Sair</button>
        <div id="topbar-avatar" style="width: 32px; height: 32px; border-radius: 50%; background: var(--text-primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; cursor: pointer;" title="Meu Perfil">
          ${avatarContent}
        </div>
      </div>
    `;
    
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      await supabase.auth.signOut();
    });
    
    document.getElementById('topbar-avatar')?.addEventListener('click', async () => {
      const { openProfileModal } = await import('./profile.js');
      openProfileModal();
    });
  } else {
    authSection.innerHTML = `<button id="login-btn" class="secondary-btn" style="padding: 6px 16px; font-size: 13px; border-radius: 20px;">Entrar</button>`;
    document.getElementById('login-btn')?.addEventListener('click', () => {
      authModal.classList.remove('hidden');
    });
  }
}

// Eventos do Modal
loginBtn?.addEventListener('click', () => {
  authModal.classList.remove('hidden');
});

closeModalBtn?.addEventListener('click', () => {
  authModal.classList.add('hidden');
});

authSwitchAction?.addEventListener('click', () => {
  isLoginMode = !isLoginMode;
  authError.classList.add('hidden');
  if (isLoginMode) {
    authTitle.textContent = 'Entrar';
    authSubmitBtn.textContent = 'Entrar';
    authSwitchText.textContent = 'Não tem uma conta?';
    authSwitchAction.textContent = 'Cadastre-se';
  } else {
    authTitle.textContent = 'Criar Conta';
    authSubmitBtn.textContent = 'Cadastrar';
    authSwitchText.textContent = 'Já tem uma conta?';
    authSwitchAction.textContent = 'Entre aqui';
  }
});

forgotPasswordBtn?.addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value;
  authError.classList.add('hidden');
  authSuccess.classList.add('hidden');
  
  if (!email) {
    authError.textContent = 'Por favor, insira o seu e-mail acima para recuperar a senha.';
    authError.classList.remove('hidden');
    return;
  }
  
  authSubmitBtn.disabled = true;
  forgotPasswordBtn.textContent = 'Enviando...';
  
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/app.html',
    });
    if (error) throw error;
    
    authSuccess.textContent = 'E-mail de recuperação enviado! Verifique a sua caixa de entrada.';
    authSuccess.classList.remove('hidden');
  } catch (err) {
    authError.textContent = err.message || 'Erro ao enviar e-mail de recuperação.';
    authError.classList.remove('hidden');
  } finally {
    authSubmitBtn.disabled = false;
    forgotPasswordBtn.textContent = 'Esqueci a senha';
  }
});

authForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');
  authSuccess.classList.add('hidden');
  
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  
  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = 'Aguarde...';
  
  try {
    if (isRecoveryMode) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      alert('Senha atualizada com sucesso!');
      authModal.classList.add('hidden');
      isRecoveryMode = false;
      // Restaurar UI padrão do modal
      document.getElementById('auth-email').parentElement.classList.remove('hidden');
      forgotPasswordBtn.classList.remove('hidden');
      authSwitchText.parentElement.classList.remove('hidden');
      authTitle.textContent = 'Entrar';
      authSubmitBtn.textContent = 'Entrar';
    } else if (isLoginMode) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      authModal.classList.add('hidden');
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      alert('Cadastro realizado! Se o e-mail de confirmação estiver ativado no Supabase, verifique sua caixa de entrada.');
      authModal.classList.add('hidden');
    }
  } catch (err) {
    authError.textContent = err.message || 'Ocorreu um erro.';
    authError.classList.remove('hidden');
  } finally {
    if (!isRecoveryMode) {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = isLoginMode ? 'Entrar' : 'Cadastrar';
    } else {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = 'Salvar Nova Senha';
    }
  }
});

initAuth();
