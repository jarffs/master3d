export class ControlBuilder {
  constructor(containerId, onChangeCallback) {
    this.container = document.getElementById(containerId);
    this.onChangeCallback = onChangeCallback;
    this.controls = {};
  }

  build(schema, t, options = {}) {
    if (!this.container) return;
    this.container.innerHTML = '';
    this.controls = {};

    // Agrupar por categoria
    const categories = {};
    schema.forEach(item => {
      const cat = item.category || 'general';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(item);
    });

    const categoryOrder = options.categoryOrder || Object.keys(categories);
    categoryOrder.filter(cat => categories[cat]).forEach(cat => {
      const isPlain = options.plainCategories?.includes(cat) || false;
      const isCollapsible = options.collapsible && !isPlain;
      const section = document.createElement('div');
      section.className = isCollapsible ? 'settings settings-collapsible' : 'settings';
      if (isPlain) section.classList.add('settings-primary');
      section.id = `section-${cat}`;

      let header = null;
      if (!isPlain) {
        header = document.createElement(isCollapsible ? 'button' : 'div');
        header.className = 'settings-header';
        if (isCollapsible) {
          header.type = 'button';
          header.setAttribute('aria-expanded', 'false');
          header.setAttribute('aria-controls', `section-${cat}-content`);
        } else {
          header.style.marginBottom = '20px';
        }

        const title = document.createElement('span');
        title.className = 'settings-title';
        title.style.fontSize = '13px';
        title.style.fontWeight = '600';
        title.style.color = 'var(--text-secondary)';
        title.style.textTransform = 'uppercase';
        title.style.letterSpacing = '0.5px';
        title.textContent = t ? t(`app.category_${cat}`) : cat.toUpperCase();

        header.appendChild(title);
        if (isCollapsible) {
          const chevron = document.createElement('span');
          chevron.className = 'settings-chevron';
          chevron.setAttribute('aria-hidden', 'true');
          header.appendChild(chevron);
        }
        section.appendChild(header);
      }

      const content = document.createElement('div');
      content.className = 'settings-content';
      content.id = `section-${cat}-content`;
      content.hidden = isCollapsible;

      categories[cat].forEach(item => {
        const controlWrapper = this._createControl(item, t);
        content.appendChild(controlWrapper);
      });

      section.appendChild(content);

      if (isCollapsible) {
        header.addEventListener('click', () => {
          const isOpen = header.getAttribute('aria-expanded') === 'true';
          header.setAttribute('aria-expanded', String(!isOpen));
          content.hidden = isOpen;
        });
      }

      this.container.appendChild(section);
    });

    // Inicializar lógica de dependências (visibility)
    this._updateDependencies(schema);
  }

  _createControl(item, t) {
    const wrapper = document.createElement('div');
    wrapper.className = 'slider-group';
    if (item.dependsOn) {
      wrapper.id = `wrapper-${item.id}`;
      wrapper.style.display = 'none'; // Hidden by default if it depends on something
    }

    if (item.type === 'slider') {
      wrapper.innerHTML = `
        <div class="slider-header">
          <div class="label-container" style="display: flex; flex-direction: column;">
            <label for="${item.id}-slider" style="font-size: 14px; font-weight: 600; color: var(--text-primary);">${t ? t(item.label) : item.label}</label>
            <div class="label-desc" style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${t ? t(item.desc) : item.desc}</div>
          </div>
          <div class="slider-val-box">
            <input type="number" id="${item.id}-val-input" value="${item.default}" min="${item.min}" max="${item.max}" step="${item.step}" />
            <span class="slider-suffix">${item.suffix || ''}</span>
          </div>
        </div>
        <div class="slider-track-wrapper">
          <span class="limit limit-min">${item.min}</span>
          <input type="range" id="${item.id}-slider" min="${item.min}" max="${item.max}" value="${item.default}" step="${item.step}" />
          <span class="limit limit-max">${item.max}</span>
        </div>
      `;

      // Event listeners
      setTimeout(() => {
        const slider = document.getElementById(`${item.id}-slider`);
        const input = document.getElementById(`${item.id}-val-input`);
        this.controls[item.id] = { slider, input, type: 'slider', dependsOn: item.dependsOn };

        const updateValue = (val) => {
          let num = parseFloat(val);
          if (isNaN(num)) num = item.default;
          if (num < item.min) num = item.min;
          if (num > item.max) num = item.max;
          slider.value = num;
          input.value = num;
          if (this.onChangeCallback) this.onChangeCallback(item.id, num);
        };

        slider.addEventListener('input', (e) => updateValue(e.target.value));
        input.addEventListener('change', (e) => updateValue(e.target.value));
      }, 0);

    } else if (item.type === 'toggle') {
      wrapper.className = 'control-group toggle-group';
      wrapper.style.marginBottom = '20px';
      wrapper.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 4px;">
          <label for="${item.id}" style="font-size: 14px; font-weight: 600; color: var(--text-primary); cursor: pointer;">${t ? t(item.label) : item.label}</label>
          <label class="switch" style="margin: 0;">
            <input type="checkbox" id="${item.id}" ${item.default ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
        </div>
        <div class="label-desc" style="font-size: 12px; color: var(--text-secondary);">${t ? t(item.desc) : item.desc}</div>
      `;

      setTimeout(() => {
        const checkbox = document.getElementById(item.id);
        this.controls[item.id] = { checkbox, type: 'toggle', dependsOn: item.dependsOn };
        checkbox.addEventListener('change', (e) => {
          if (this.onChangeCallback) this.onChangeCallback(item.id, e.target.checked);
          this._updateDependencies([{ ...item, value: e.target.checked }]);
        });
      }, 0);
    } else if (item.type === 'select') {
      let optionsHtml = '';
      if (item.options) {
        item.options.forEach(opt => {
          optionsHtml += `<option value="${opt.value}" ${opt.value === item.default ? 'selected' : ''}>${t ? t(opt.label) : opt.label}</option>`;
        });
      }
      
      wrapper.innerHTML = `
        <div class="slider-header" style="align-items: center;">
          <div class="label-container" style="display: flex; flex-direction: column;">
            <label for="${item.id}-select" style="font-size: 14px; font-weight: 600; color: var(--text-primary);">${t ? t(item.label) : item.label}</label>
            <div class="label-desc" style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${t ? t(item.desc) : item.desc}</div>
          </div>
          <select id="${item.id}-select" class="language-selector" style="width: auto; min-width: 100px;">
            ${optionsHtml}
          </select>
        </div>
      `;

      setTimeout(() => {
        const select = document.getElementById(`${item.id}-select`);
        this.controls[item.id] = { select, type: 'select', dependsOn: item.dependsOn };
        select.addEventListener('change', (e) => {
          if (this.onChangeCallback) this.onChangeCallback(item.id, e.target.value);
        });
      }, 0);
    } else if (item.type === 'font') {
      wrapper.innerHTML = `
        <div class="font-picker-control">
          <div class="label-container" style="display: flex; flex-direction: column;">
            <label for="${item.id}-picker" style="font-size: 14px; font-weight: 600; color: var(--text-primary);">${t ? t(item.label) : item.label}</label>
            <div class="label-desc" style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${t ? t(item.desc) : item.desc}</div>
          </div>
          <button type="button" id="${item.id}-picker" class="font-picker-button">
            <span class="font-picker-value" style="font-family: '${item.default}', sans-serif;">${item.default}</span>
            <span class="font-picker-action">${t ? t('app.choose_font') : 'Choose font'}</span>
          </button>
        </div>
      `;

      setTimeout(() => {
        const button = document.getElementById(`${item.id}-picker`);
        const value = button.querySelector('.font-picker-value');
        this.controls[item.id] = { button, value, currentValue: item.default, type: 'font', dependsOn: item.dependsOn };
        button.addEventListener('click', () => {
          if (this.onChangeCallback) {
            this.onChangeCallback(item.id, this.controls[item.id].currentValue, { action: 'pickFont' });
          }
        });
      }, 0);
    } else if (item.type === 'text') {
      const textField = item.multiline
        ? `<textarea id="${item.id}-text" placeholder="${item.placeholder ? (t ? t(item.placeholder) : item.placeholder) : ''}" rows="3" style="width: 100%; padding: 8px 12px; font-size: 14px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-color); color: var(--text-primary); box-sizing: border-box; resize: vertical;">${item.default || ''}</textarea>`
        : `<input type="text" id="${item.id}-text" value="${item.default || ''}" placeholder="${item.placeholder ? (t ? t(item.placeholder) : item.placeholder) : ''}" style="width: 100%; padding: 8px 12px; font-size: 14px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-color); color: var(--text-primary); box-sizing: border-box;">`;

      wrapper.innerHTML = `
        <div class="slider-header" style="align-items: flex-start; flex-direction: column;">
          <div class="label-container" style="display: flex; flex-direction: column; margin-bottom: 8px;">
            <label for="${item.id}-text" style="font-size: 14px; font-weight: 600; color: var(--text-primary);">${t ? t(item.label) : item.label}</label>
            <div class="label-desc" style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${t ? t(item.desc) : item.desc}</div>
          </div>
          ${textField}
        </div>
      `;

      setTimeout(() => {
        const textInput = document.getElementById(`${item.id}-text`);
        this.controls[item.id] = { textInput, type: 'text', dependsOn: item.dependsOn };

        let debounceTimer;
        textInput.addEventListener('input', (e) => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (this.onChangeCallback) this.onChangeCallback(item.id, e.target.value);
          }, 300); // 300ms debounce for typing
        });
      }, 0);
    }

    return wrapper;
  }

  _updateDependencies() {
    Object.keys(this.controls).forEach(key => {
      const ctrl = this.controls[key];
      if (ctrl.dependsOn) {
        const wrapper = document.getElementById(`wrapper-${key}`);
        const dependencyCtrl = this.controls[ctrl.dependsOn];
        if (dependencyCtrl && dependencyCtrl.type === 'toggle') {
          wrapper.style.display = dependencyCtrl.checkbox.checked ? 'block' : 'none';
        }
      }
    });
  }

  getValues() {
    const vals = {};
    for (const [id, ctrl] of Object.entries(this.controls)) {
      if (ctrl.type === 'slider' && ctrl.slider) {
        vals[id] = parseFloat(ctrl.slider.value);
      } else if (ctrl.type === 'toggle' && ctrl.checkbox) {
        vals[id] = ctrl.checkbox.checked;
      } else if (ctrl.type === 'select' && ctrl.select) {
        vals[id] = ctrl.select.value;
      } else if (ctrl.type === 'font' && ctrl.button) {
        vals[id] = ctrl.currentValue;
      } else if (ctrl.type === 'text' && ctrl.textInput) {
        vals[id] = ctrl.textInput.value;
      }
    }
    return vals;
  }

  setValues(values) {
    Object.keys(values).forEach(key => {
      const ctrl = this.controls[key];
      if (ctrl) {
        if (ctrl.type === 'slider' && ctrl.slider) {
          ctrl.slider.value = values[key];
          ctrl.input.value = values[key];
        } else if (ctrl.type === 'toggle' && ctrl.checkbox) {
          ctrl.checkbox.checked = values[key] === true || values[key] === 'true';
        } else if (ctrl.type === 'select' && ctrl.select) {
          ctrl.select.value = values[key];
        } else if (ctrl.type === 'font' && ctrl.button) {
          ctrl.currentValue = values[key];
          ctrl.value.textContent = values[key];
          ctrl.value.style.fontFamily = `'${values[key]}', sans-serif`;
        } else if (ctrl.type === 'text' && ctrl.textInput) {
          ctrl.textInput.value = values[key];
        }
      }
    });
    this._updateDependencies();
  }

  setValue(id, value) {
    this.setValues({ [id]: value });
  }
}
