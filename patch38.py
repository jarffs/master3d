import sys

with open('main.js', 'r', encoding='utf-8') as f:
    content = f.read()

import re

old_logic = r'''// Verifica limites do plano Free.*?if \(data && data\.length >= 1\) \{.*?}'''
new_logic = '''
  // Desconta o crédito no Backend usando RPC
  try {
    const { data: success, error } = await supabase.rpc('deduct_credit');
    
    if (error) throw error;
    
    if (!success) {
      alert("Não tem créditos suficientes. Por favor, compre mais pacotes de STLs.");
      // Opcional: Abrir o modal de compra automaticamente!
      const profileModal = document.getElementById('profile-modal');
      if (profileModal) profileModal.classList.remove('hidden');
      
      downloadBtn.disabled = false;
      if(saveDesignBtn) saveDesignBtn.disabled = false;
      downloadBtn.innerHTML = originalText;
      return;
    }
    
    // Atualizar o valor na UI instantaneamente
    if (userProfile && typeof userProfile.credits === 'number') {
      userProfile.credits -= 1;
      const shopCreditsEl = document.getElementById('profile-current-credits-shop');
      if (shopCreditsEl) shopCreditsEl.textContent = userProfile.credits;
    }
  } catch (err) {
    console.error("Erro ao descontar crédito:", err);
    alert("Ocorreu um erro ao processar o seu crédito. Tente novamente.");
    downloadBtn.disabled = false;
    if(saveDesignBtn) saveDesignBtn.disabled = false;
    downloadBtn.innerHTML = originalText;
    return;
  }
'''

# We need to accurately replace the try catch block.
# Let's do it precisely string by string since regex with dotall can be dangerous.
