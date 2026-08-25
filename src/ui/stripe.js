import { userProfile, currentUser } from '../../auth.js';
import { supabase } from '../../supabaseClient.js';

// Configuration mapping plans to Stripe Price IDs and Credit amounts
// The user needs to replace the price_XXX with their actual Stripe Price IDs
export const STRIPE_CONFIG = {
  mini: {
    priceId: 'price_1U8RlSBjCb453CpTSlVJMaEg',
    credits: 10
  },
  popular: {
    priceId: 'price_1U8RmQBjCb453CpTJchIXIeA',
    credits: 50
  },
  advanced: {
    priceId: 'price_1U8RnQBjCb453CpTGigWhWW5',
    credits: 200
  },
  studio: {
    priceId: 'price_1U8RnoBjCb453CpT11CsKeii',
    credits: 500
  }
};

export function initStripeCheckout() {
  const buyButtons = document.querySelectorAll('.compact-price-btn');
  
  buyButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      if (!currentUser) {
        alert('Por favor, inicie sessão para comprar créditos.');
        return;
      }

      const planKey = btn.getAttribute('data-plan');
      const planConfig = STRIPE_CONFIG[planKey];

      if (!planConfig) {
        console.error('Plano não encontrado na configuração:', planKey);
        return;
      }

      // Desativar botão e mostrar estado de carregamento
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span class="loading-spinner" style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-radius:50%;border-top-color:#fff;animation:spin 1s ease-in-out infinite;"></span>';
      btn.disabled = true;

      try {
        // Obter URL atual para sucesso/cancelamento
        const currentUrl = window.location.href;

        // Chamar a Edge Function do Supabase
        const { data, error } = await supabase.functions.invoke('create-checkout-session', {
          body: {
            priceId: planConfig.priceId,
            userId: currentUser.id,
            credits: planConfig.credits,
            successUrl: currentUrl,
            cancelUrl: currentUrl
          }
        });

        if (error) throw error;
        
        if (data && data.url) {
          // Redirecionar para o Checkout do Stripe
          window.location.href = data.url;
        } else {
          throw new Error('URL de checkout não retornado.');
        }
      } catch (err) {
        console.error('Erro ao iniciar checkout:', err);
        alert('Ocorreu um erro ao iniciar a compra. Tente novamente.');
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });
  });
}

// Add keyframe animation for spinner if not exists
if (!document.getElementById('stripe-spinner-style')) {
  const style = document.createElement('style');
  style.id = 'stripe-spinner-style';
  style.innerHTML = `
    @keyframes spin { 
      to { transform: rotate(360deg); } 
    }
  `;
  document.head.appendChild(style);
}
