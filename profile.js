import { supabase } from './supabaseClient.js';
import { currentUser, userProfile } from './auth.js';
import { t } from './i18n.js';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';

// Elements
const profileModal = document.getElementById('profile-modal');
const closeProfileBtn = document.getElementById('close-profile-btn');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Avatar
const avatarUpload = document.getElementById('avatar-upload');
const profileAvatarPreview = document.getElementById('profile-avatar-preview');
const cropperModal = document.getElementById('cropper-modal');
const cropperImage = document.getElementById('cropper-image');
const cropperCancelBtn = document.getElementById('cropper-cancel-btn');
const cropperSaveBtn = document.getElementById('cropper-save-btn');
let cropper = null;

// Account Info
const profileEmail = document.getElementById('profile-email');
const profileName = document.getElementById('profile-name');
const saveNameBtn = document.getElementById('save-name-btn');
const changePasswordForm = document.getElementById('change-password-form');
const changePasswordBtn = document.getElementById('change-password-btn');
const passwordMessage = document.getElementById('password-message');

// Printers
const printersList = document.getElementById('printers-list');
const savePrintersBtn = document.getElementById('save-printers-btn');
const printerSearch = document.getElementById('printer-search');
const addCustomPrinterForm = document.getElementById('add-custom-printer-form');
const customPrinterSubmit = document.getElementById('custom-printer-submit');

// --- TABS LOGIC ---
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

closeProfileBtn?.addEventListener('click', () => {
  profileModal.classList.add('hidden');
});

// To be called from auth.js when user clicks their avatar
export function openProfileModal() {
  if (!currentUser) return;
  
  // Render Avatar Preview
  if (userProfile?.avatar_url) {
    profileAvatarPreview.innerHTML = `<img src="${userProfile.avatar_url}" alt="Avatar">`;
  } else {
    profileAvatarPreview.innerHTML = currentUser.email.charAt(0).toUpperCase();
  }
  
  // Render Account Info
  profileEmail.value = currentUser.email;
  profileName.value = userProfile?.username || '';
  
  const shopCreditsEl = document.getElementById('profile-current-credits-shop');
  if (shopCreditsEl) shopCreditsEl.textContent = userProfile?.credits || 0;

  passwordMessage.style.display = 'none';
  document.getElementById('profile-current-password').value = '';
  document.getElementById('profile-new-password').value = '';
  document.getElementById('profile-confirm-password').value = '';
  
  const isGoogleAuth = currentUser.app_metadata?.providers?.includes('google') || currentUser.app_metadata?.provider === 'google';
  const pwdForm = document.getElementById('change-password-form');
  if (pwdForm) {
    const title = pwdForm.previousElementSibling;
    const hr = title?.previousElementSibling;
    if (isGoogleAuth) {
      pwdForm.style.display = 'none';
      if (title) title.style.display = 'none';
      if (hr) hr.style.display = 'none';
    } else {
      pwdForm.style.display = 'flex';
      if (title) title.style.display = 'block';
      if (hr) hr.style.display = 'block';
    }
  }
  
  // Render Printers List
  renderPrintersList();
  
  profileModal.classList.remove('hidden');
}

// --- AVATAR & CROPPER LOGIC ---
avatarUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    cropperImage.src = event.target.result;
    profileModal.classList.add('hidden'); // Hide profile modal temporarily
    cropperModal.classList.remove('hidden');
    
    if (cropper) {
      cropper.destroy();
    }
    
    cropper = new Cropper(cropperImage, {
      aspectRatio: 1,
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 1,
      restore: false,
      guides: false,
      center: false,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
    });
  };
  reader.readAsDataURL(file);
  e.target.value = ''; // Reset input
});

cropperCancelBtn.addEventListener('click', () => {
  cropperModal.classList.add('hidden');
  profileModal.classList.remove('hidden');
});

cropperSaveBtn.addEventListener('click', async () => {
  if (!cropper) return;
  
  cropperSaveBtn.disabled = true;
  cropperSaveBtn.textContent = t('js.saving');
  
  try {
    const canvas = cropper.getCroppedCanvas({
      width: 256,
      height: 256,
    });
    
    canvas.toBlob(async (blob) => {
      const fileName = `${currentUser.id}-${Date.now()}.jpg`;
      
      // Upload to Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: true
        });
        
      if (uploadError) throw uploadError;
      
      // Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);
        
      // Update Profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', currentUser.id);
        
      if (updateError) throw updateError;
      
      // Update local state and UI
      userProfile.avatar_url = publicUrl;
      profileAvatarPreview.innerHTML = `<img src="${publicUrl}" alt="Avatar">`;
      
      // Force trigger Auth update so the Topbar avatar updates
      const topbarAvatarImg = document.getElementById('topbar-avatar');
      if (topbarAvatarImg) topbarAvatarImg.innerHTML = `<img src="${publicUrl}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
      
      cropperModal.classList.add('hidden');
      profileModal.classList.remove('hidden');
    }, 'image/jpeg');
    
  } catch (err) {
    console.error(err);
    alert(t('js.error_avatar'));
  } finally {
    cropperSaveBtn.disabled = false;
    cropperSaveBtn.textContent = t('profile.save_photo');
  }
});

// --- ACCOUNT INFO LOGIC ---
saveNameBtn?.addEventListener('click', async () => {
  if (!currentUser) return;
  const newName = profileName.value.trim();
  
  saveNameBtn.disabled = true;
  saveNameBtn.textContent = '...';
  
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ username: newName })
      .eq('id', currentUser.id);
      
    if (error) throw error;
    
    if (userProfile) {
      userProfile.username = newName;
    }
    alert(t('js.name_updated'));
  } catch (error) {
    console.error(error);
    alert(t('js.error_name'));
  } finally {
    saveNameBtn.disabled = false;
    saveNameBtn.textContent = t('profile.save');
  }
});

changePasswordForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser) return;
  
  const currentPassword = document.getElementById('profile-current-password').value;
  const newPassword = document.getElementById('profile-new-password').value;
  const confirmPassword = document.getElementById('profile-confirm-password').value;
  
  if (newPassword !== confirmPassword) {
    passwordMessage.textContent = t('js.password_mismatch');
    passwordMessage.style.color = '#ef4444';
    passwordMessage.style.display = 'block';
    return;
  }
  
  if (!newPassword || newPassword.length < 6) {
    passwordMessage.textContent = t('js.password_short');
    passwordMessage.style.color = '#ef4444';
    passwordMessage.style.display = 'block';
    return;
  }
  
  changePasswordBtn.disabled = true;
  changePasswordBtn.textContent = '...';
  passwordMessage.style.display = 'none';
  
  try {
    // 1. Verify current password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: currentPassword,
    });
    
    if (signInError) {
      throw new Error(t('js.wrong_password'));
    }
  
    // 2. Update to new password
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    
    passwordMessage.textContent = t('js.password_updated');
    passwordMessage.style.color = '#10b981'; // green
    passwordMessage.style.display = 'block';
    document.getElementById('profile-current-password').value = '';
    document.getElementById('profile-new-password').value = '';
    document.getElementById('profile-confirm-password').value = '';
  } catch (error) {
    console.error(error);
    passwordMessage.textContent = error.message || t('js.error_password');
    passwordMessage.style.color = '#ef4444';
    passwordMessage.style.display = 'block';
  } finally {
    changePasswordBtn.disabled = false;
    changePasswordBtn.textContent = t('profile.update_password');
  }
});

// --- PRINTERS LOGIC ---
async function renderPrintersList() {
  printersList.innerHTML = `<p>${t('js.loading')}</p>`;
  try {
    const { data: defaultPlates, error: err1 } = await supabase.from('default_build_plates').select('*').order('brand', { ascending: true });
    if (err1) throw err1;
    
    let customPlates = [];
    if (currentUser) {
      const { data: userPlates, error: err2 } = await supabase.from('custom_build_plates').select('*').eq('user_id', currentUser.id);
      if (err2) throw err2;
      if (userPlates) customPlates = userPlates;
    }
    
    printersList.innerHTML = '';
    const selected = userProfile?.selected_printers || [];
    
    const allPrinters = [...customPlates, ...defaultPlates];
    
    allPrinters.forEach(printer => {
      const isCustom = !!printer.user_id; // Se tem user_id, é customizada
      
      const label = document.createElement('label');
      label.className = 'printer-item';
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.justifyContent = 'space-between';
      label.style.width = '100%';
      
      // Armazena o nome minúsculo no dataset para pesquisa rápida
      label.dataset.name = printer.name.toLowerCase();
      
      const leftDiv = document.createElement('div');
      leftDiv.style.display = 'flex';
      leftDiv.style.alignItems = 'center';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = printer.id;
      if (selected.includes(printer.id)) {
        checkbox.checked = true;
      }
      
      const text = document.createElement('span');
      text.textContent = printer.name + (isCustom ? ` (${printer.width}x${printer.depth})` : '');
      
      leftDiv.appendChild(checkbox);
      leftDiv.appendChild(text);
      label.appendChild(leftDiv);
      
      // Se for customizada, adiciona o botão de apagar
      if (isCustom) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.innerHTML = '&times;'; // Ícone simples de X
        delBtn.style.background = 'none';
        delBtn.style.border = 'none';
        delBtn.style.color = '#ef4444'; // vermelho
        delBtn.style.fontSize = '18px';
        delBtn.style.cursor = 'pointer';
        delBtn.title = t('profile.delete_printer');
        
        delBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation(); // Evita que clique no label marque o checkbox
          
          if (confirm(t('js.delete_printer_confirm', { name: printer.name }))) {
            try {
              const { error } = await supabase.from('custom_build_plates').delete().eq('id', printer.id);
              if (error) throw error;
              
              // Se estava selecionada, remover da seleção
              if (checkbox.checked) {
                userProfile.selected_printers = userProfile.selected_printers.filter(id => id !== printer.id);
                await supabase.from('profiles').update({ selected_printers: userProfile.selected_printers }).eq('id', currentUser.id);
              }
              
              renderPrintersList();
              window.dispatchEvent(new Event('auth-state-changed'));
            } catch (error) {
              alert(t('js.error_delete_printer'));
            }
          }
        });
        
        label.appendChild(delBtn);
      }
      
      printersList.appendChild(label);
    });
    
    // Dispara a pesquisa logo ao carregar para manter o filtro atual
    if (printerSearch.value) {
      printerSearch.dispatchEvent(new Event('keyup'));
    }
    
  } catch (err) {
    printersList.innerHTML = `<p style="color:red">${t('js.error_load_printers')}</p>`;
  }
}

printerSearch?.addEventListener('keyup', (e) => {
  const term = e.target.value.toLowerCase();
  const items = printersList.querySelectorAll('.printer-item');
  
  items.forEach(item => {
    if (item.dataset.name.includes(term)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
});

savePrintersBtn?.addEventListener('click', async () => {
  if (!currentUser) return;
  
  savePrintersBtn.disabled = true;
  savePrintersBtn.textContent = t('js.saving');
  
  try {
    const checkboxes = printersList.querySelectorAll('input[type="checkbox"]');
    const selectedIds = Array.from(checkboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);
      
    const { error } = await supabase
      .from('profiles')
      .update({ selected_printers: selectedIds })
      .eq('id', currentUser.id);
      
    if (error) throw error;
    
    // Update local state
    if (userProfile) {
      userProfile.selected_printers = selectedIds;
    }
    
    alert(t('js.preferences_saved'));
    // Trigger main.js to reload printers
    window.dispatchEvent(new Event('auth-state-changed')); // We need a way to reload printers in main.js
    
  } catch (err) {
    console.error(err);
    alert(t('js.error_save_printers'));
  } finally {
    savePrintersBtn.disabled = false;
    savePrintersBtn.textContent = t('profile.save_changes');
  }
});

addCustomPrinterForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser) return;
  
  customPrinterSubmit.disabled = true;
  customPrinterSubmit.textContent = t('js.adding');
  
  const name = document.getElementById('custom-printer-name').value;
  const width = parseFloat(document.getElementById('custom-printer-x').value);
  const depth = parseFloat(document.getElementById('custom-printer-y').value);
  
  try {
    const { data, error } = await supabase.from('custom_build_plates').insert([{
      user_id: currentUser.id,
      name: name,
      width: width,
      depth: depth
    }]).select().single();
    
    if (error) throw error;
    
    // Adicionar automaticamente aos selecionados
    if (userProfile) {
      if (!userProfile.selected_printers) userProfile.selected_printers = [];
      userProfile.selected_printers.push(data.id);
      
      await supabase.from('profiles').update({ selected_printers: userProfile.selected_printers }).eq('id', currentUser.id);
    }
    
    // Limpar form
    addCustomPrinterForm.reset();
    
    // Recarregar UI
    renderPrintersList();
    window.dispatchEvent(new Event('auth-state-changed'));
    
  } catch (error) {
    console.error(error);
    alert(t('js.error_add_printer'));
  } finally {
    customPrinterSubmit.disabled = false;
    customPrinterSubmit.textContent = t('profile.add_printer');
  }
});
