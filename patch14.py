import sys

with open('app.html', 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = '<!-- Profile Modal -->'
end_marker = '<!-- Topbar (Controls & View Options) -->'
start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

new_modal = '''<!-- Profile Modal -->
    <div id="profile-modal" class="modal hidden">
      <div class="modal-content" style="max-width: 900px; padding: 40px;">
        <button id="close-profile-btn" class="close-btn">&times;</button>
        <h2 style="margin-top: 0; margin-bottom: 32px; font-size: 24px;" data-i18n="profile.title">Meu Perfil</h2>
        
        <div class="profile-dashboard-grid">
          <!-- Coluna Esquerda: Conta e Impressoras -->
          <div class="profile-left-col">
            <h3 class="profile-section-title" data-i18n="profile.tab_account">A minha Conta</h3>
            
            <div style="display: flex; gap: 24px; align-items: flex-start; margin-bottom: 24px;">
              <div class="avatar-upload-container">
                <div id="profile-avatar-preview" class="avatar-large" style="margin-bottom: 8px;">
                  <!-- Renderizado via JS -->
                </div>
                <label for="avatar-upload" class="text-btn" style="cursor: pointer; font-size: 13px; color: var(--accent-color); font-weight: 600; text-align: center; display: block;" data-i18n="profile.change_photo">Alterar Foto</label>
                <input type="file" id="avatar-upload" accept="image/png, image/jpeg, image/webp" hidden />
              </div>
              
              <div style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
                <div class="input-group" style="margin-bottom: 0;">
                  <label for="profile-name" style="font-size: 13px; margin-bottom: 4px;" data-i18n="profile.display_name">Nome</label>
                  <div style="display: flex; gap: 8px;">
                    <input type="text" id="profile-name" data-i18n="profile.display_name_placeholder" placeholder="Como quer ser chamado?" style="flex: 1; background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-primary); padding: 8px; border-radius: 6px;" />
                    <button id="save-name-btn" class="secondary-btn" style="padding: 8px 16px;" data-i18n="profile.save">Salvar</button>
                  </div>
                </div>
                <div class="input-group" style="margin-bottom: 0;">
                  <label for="profile-email" style="font-size: 13px; margin-bottom: 4px;" data-i18n="profile.email">E-mail</label>
                  <input type="email" id="profile-email" readonly style="background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-secondary); padding: 8px; border-radius: 6px; cursor: not-allowed; width: 100%; box-sizing: border-box;" />
                </div>
              </div>
            </div>

            <!-- Formulário de Senha (Escondido se for login Google) -->
            <div id="password-section" style="margin-bottom: 32px;">
              <h4 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600;" data-i18n="profile.change_password">Alterar Senha</h4>
              <form id="change-password-form" style="display: flex; flex-direction: column; gap: 12px;">
                <input type="password" id="profile-current-password" required data-i18n="profile.current_password" placeholder="Senha atual" style="background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-primary); padding: 8px; border-radius: 6px;" />
                <input type="password" id="profile-new-password" required data-i18n="profile.new_password" placeholder="Nova senha" style="background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-primary); padding: 8px; border-radius: 6px;" />
                <input type="password" id="profile-confirm-password" required data-i18n="profile.confirm_password" placeholder="Repita a nova senha" style="background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-primary); padding: 8px; border-radius: 6px;" />
                <p id="password-message" style="font-size: 13px; margin: 0; display: none;"></p>
                <button type="submit" id="change-password-btn" class="secondary-btn" style="align-self: flex-start; font-size: 13px;" data-i18n="profile.update_password">Atualizar Senha</button>
              </form>
            </div>

            <hr style="border: 0; height: 1px; background: var(--border-color); margin: 24px 0;">

            <h3 class="profile-section-title" data-i18n="profile.tab_printers">Minhas Impressoras</h3>
            <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;" data-i18n="profile.printers_desc">Selecione as impressoras que aparecem na lista do gerador.</p>
            
            <input type="text" id="printer-search" data-i18n="profile.search_printer" placeholder="Buscar impressora..." style="width: 100%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 12px; background: var(--bg-color); color: var(--text-primary); box-sizing: border-box;">
            
            <div class="printers-scroll-container">
              <div id="printers-list" class="printers-list">
                <!-- Renderizado via JS -->
              </div>
            </div>
            <button id="save-printers-btn" class="primary-btn" style="width: 100%; margin-bottom: 24px;" data-i18n="profile.save_changes">Salvar Impressoras</button>

            <h4 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600;" data-i18n="profile.add_custom">Adicionar Impressora Customizada</h4>
            <form id="add-custom-printer-form" style="display: flex; flex-direction: column; gap: 8px;">
              <input type="text" id="custom-printer-name" required placeholder="Nome (Ex: Voron)" style="background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-primary); padding: 8px; border-radius: 6px;" />
              <div style="display: flex; gap: 8px;">
                <input type="number" id="custom-printer-x" required min="50" max="1000" placeholder="X (mm)" style="flex: 1; background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-primary); padding: 8px; border-radius: 6px;" />
                <input type="number" id="custom-printer-y" required min="50" max="1000" placeholder="Y (mm)" style="flex: 1; background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-primary); padding: 8px; border-radius: 6px;" />
              </div>
              <button type="submit" id="custom-printer-submit" class="secondary-btn" style="font-size: 13px;" data-i18n="profile.add_printer">Adicionar Impressora</button>
            </form>
          </div>

          <!-- Coluna Direita: Loja / Planos -->
          <div class="profile-right-col" style="background: var(--bg-main); padding: 24px; border-radius: 12px; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <h3 class="profile-section-title" style="margin: 0;" data-i18n="pricing.title">Comprar Créditos</h3>
              <div style="background: rgba(217, 119, 6, 0.1); color: var(--accent-color); padding: 4px 12px; border-radius: 50px; font-weight: 700; font-size: 14px;">
                <span id="profile-current-credits-shop">0</span> Créditos
              </div>
            </div>
            <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 24px;">Os créditos permitem exportar STLs ilimitados no gerador visual.</p>
            
            <div class="compact-pricing-list">
              <!-- Pacote Mini -->
              <div class="compact-price-card">
                <div class="compact-price-header">
                  <div>
                    <h4 class="compact-price-title" data-i18n="pricing.mini_title">Pacote Mini</h4>
                    <p class="compact-price-desc">10 STLs</p>
                  </div>
                  <div class="compact-price-value">€5.00</div>
                </div>
                <button class="compact-price-btn" data-plan="mini" data-i18n="pricing.mini_btn">Comprar Mini</button>
              </div>

              <!-- Pacote Popular -->
              <div class="compact-price-card pro">
                <div class="compact-price-header">
                  <div>
                    <h4 class="compact-price-title" data-i18n="pricing.popular_title">Pacote Popular</h4>
                    <p class="compact-price-desc">15 STLs</p>
                  </div>
                  <div class="compact-price-value">€9.90</div>
                </div>
                <button class="compact-price-btn" data-plan="popular" data-i18n="pricing.popular_btn">Comprar Popular</button>
              </div>

              <!-- Pacote Avançado -->
              <div class="compact-price-card">
                <div class="compact-price-header">
                  <div>
                    <h4 class="compact-price-title" data-i18n="pricing.advanced_title">Pacote Avançado</h4>
                    <p class="compact-price-desc">50 STLs</p>
                  </div>
                  <div class="compact-price-value">€29.00</div>
                </div>
                <button class="compact-price-btn" data-plan="advanced" data-i18n="pricing.advanced_btn">Comprar Avançado</button>
              </div>

              <!-- Pacote Studio -->
              <div class="compact-price-card">
                <div class="compact-price-header">
                  <div>
                    <h4 class="compact-price-title" data-i18n="pricing.studio_title">Pacote Studio</h4>
                    <p class="compact-price-desc">200 STLs</p>
                  </div>
                  <div class="compact-price-value">€99.00</div>
                </div>
                <button class="compact-price-btn" data-plan="studio" data-i18n="pricing.studio_btn">Comprar Studio</button>
              </div>
              
              <!-- Plano Enterprise (Unlimited) - Futuro -->
              <div class="compact-price-card" style="opacity: 0.7; border-style: dashed;">
                <div class="compact-price-header">
                  <div>
                    <h4 class="compact-price-title">Plano Enterprise</h4>
                    <p class="compact-price-desc">Créditos Ilimitados</p>
                  </div>
                  <div class="compact-price-value">Em Breve</div>
                </div>
                <button class="compact-price-btn" disabled style="cursor: not-allowed; opacity: 0.5;">Indisponível</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    '''

content = content[:start_idx] + new_modal + content[end_idx:]

with open('app.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('app.html updated')
