export class Dialog {
  static init() {
    if (document.getElementById('custom-dialog-overlay')) return;
    const html = `
      <div id="custom-dialog-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:99999; align-items:center; justify-content:center; backdrop-filter:blur(2px);">
        <div id="custom-dialog-box" style="background:var(--panel-bg); border:1px solid var(--border-color); border-radius:12px; padding:24px; max-width:400px; width:90%; box-shadow:0 10px 25px rgba(0,0,0,0.2); display:flex; flex-direction:column; gap:16px; transform:translateY(-20px); opacity:0; transition:all 0.2s ease;">
          <h3 id="custom-dialog-title" style="margin:0; font-size:18px; color:var(--text-primary);">Aviso</h3>
          <p id="custom-dialog-msg" style="margin:0; font-size:14px; color:var(--text-secondary); line-height:1.5;"></p>
          <input type="text" id="custom-dialog-input" style="display:none; width:100%; padding:10px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-input); color:var(--text-primary); box-sizing:border-box;">
          <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:8px;">
            <button id="custom-dialog-cancel" style="display:none; padding:8px 16px; border:1px solid var(--border-color); background:transparent; color:var(--text-primary); border-radius:6px; cursor:pointer; font-weight:500;">Cancelar</button>
            <button id="custom-dialog-confirm" style="padding:8px 16px; border:none; background:var(--accent-color); color:white; border-radius:6px; cursor:pointer; font-weight:500;">OK</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  static _show(options) {
    this.init();
    return new Promise(resolve => {
      const overlay = document.getElementById('custom-dialog-overlay');
      const box = document.getElementById('custom-dialog-box');
      const title = document.getElementById('custom-dialog-title');
      const msg = document.getElementById('custom-dialog-msg');
      const input = document.getElementById('custom-dialog-input');
      const btnCancel = document.getElementById('custom-dialog-cancel');
      const btnConfirm = document.getElementById('custom-dialog-confirm');

      title.textContent = options.title || 'Aviso';
      msg.textContent = options.message || '';
      
      if (options.type === 'prompt') {
        input.style.display = 'block';
        input.value = options.defaultValue || '';
      } else {
        input.style.display = 'none';
      }

      if (options.type === 'confirm' || options.type === 'prompt') {
        btnCancel.style.display = 'block';
        btnCancel.textContent = options.cancelText || 'Cancelar';
      } else {
        btnCancel.style.display = 'none';
      }

      btnConfirm.textContent = options.confirmText || 'OK';

      overlay.style.display = 'flex';
      // Animate in
      setTimeout(() => {
        box.style.transform = 'translateY(0)';
        box.style.opacity = '1';
      }, 10);
      
      if (options.type === 'prompt') {
        input.focus();
      } else {
        btnConfirm.focus();
      }

      const cleanup = () => {
        box.style.transform = 'translateY(-20px)';
        box.style.opacity = '0';
        setTimeout(() => {
          overlay.style.display = 'none';
        }, 200);
        btnConfirm.onclick = null;
        btnCancel.onclick = null;
        input.onkeydown = null;
      };

      btnConfirm.onclick = () => {
        cleanup();
        if (options.type === 'prompt') resolve(input.value);
        else resolve(true);
      };

      btnCancel.onclick = () => {
        cleanup();
        if (options.type === 'prompt') resolve(null);
        else resolve(false);
      };

      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          btnConfirm.click();
        } else if (e.key === 'Escape') {
          btnCancel.click();
        }
      };
    });
  }

  static alert(message, title = 'Aviso') {
    return this._show({ type: 'alert', message, title });
  }

  static confirm(message, title = 'Confirmação') {
    return this._show({ type: 'confirm', message, title });
  }

  static prompt(message, defaultValue = '', title = 'Entrada necessária') {
    return this._show({ type: 'prompt', message, defaultValue, title });
  }
}
