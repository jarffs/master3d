import { supabase } from './supabaseClient.js';
import { currentUser, userProfile } from './auth.js';
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

// Printers
const printersList = document.getElementById('printers-list');
const savePrintersBtn = document.getElementById('save-printers-btn');

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
  cropperSaveBtn.textContent = 'Salvando...';
  
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
    alert('Erro ao salvar avatar.');
  } finally {
    cropperSaveBtn.disabled = false;
    cropperSaveBtn.textContent = 'Salvar Foto';
  }
});

// --- PRINTERS LOGIC ---
async function renderPrintersList() {
  printersList.innerHTML = '<p>Carregando...</p>';
  try {
    const { data, error } = await supabase.from('default_build_plates').select('*').order('brand', { ascending: true });
    if (error) throw error;
    
    printersList.innerHTML = '';
    const selected = userProfile?.selected_printers || [];
    
    data.forEach(printer => {
      const label = document.createElement('label');
      label.className = 'printer-item';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = printer.id;
      if (selected.includes(printer.id)) {
        checkbox.checked = true;
      }
      
      const text = document.createElement('span');
      text.textContent = printer.name;
      
      label.appendChild(checkbox);
      label.appendChild(text);
      printersList.appendChild(label);
    });
  } catch (err) {
    printersList.innerHTML = '<p style="color:red">Erro ao carregar impressoras.</p>';
  }
}

savePrintersBtn.addEventListener('click', async () => {
  if (!currentUser) return;
  
  savePrintersBtn.disabled = true;
  savePrintersBtn.textContent = 'Salvando...';
  
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
    
    alert('Preferências salvas com sucesso!');
    // Trigger main.js to reload printers
    window.dispatchEvent(new Event('auth-state-changed')); // We need a way to reload printers in main.js
    
  } catch (err) {
    console.error(err);
    alert('Erro ao salvar impressoras.');
  } finally {
    savePrintersBtn.disabled = false;
    savePrintersBtn.textContent = 'Salvar Alterações';
  }
});
