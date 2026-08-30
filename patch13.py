import sys

with open('style.css', 'r', encoding='utf-8') as f:
    content = f.read()

new_styles = '''

/* Profile Dashboard Grid */
.profile-dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  align-items: flex-start;
}

@media (max-width: 768px) {
  .profile-dashboard-grid {
    grid-template-columns: 1fr;
  }
}

.profile-section-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.printers-scroll-container {
  max-height: 250px;
  overflow-y: auto;
  padding-right: 8px;
  margin-bottom: 16px;
}
.printers-scroll-container::-webkit-scrollbar {
  width: 6px;
}
.printers-scroll-container::-webkit-scrollbar-track {
  background: var(--bg-main);
  border-radius: 4px;
}
.printers-scroll-container::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}

/* Compact Price Cards */
.compact-pricing-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 450px;
  overflow-y: auto;
  padding-right: 8px;
}
.compact-pricing-list::-webkit-scrollbar {
  width: 6px;
}
.compact-pricing-list::-webkit-scrollbar-track {
  background: var(--bg-main);
  border-radius: 4px;
}
.compact-pricing-list::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}

.compact-price-card {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.compact-price-card.pro {
  border: 2px solid var(--accent-color);
  background: var(--bg-surface);
}

.compact-price-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.compact-price-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

.compact-price-value {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
}

.compact-price-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: -8px;
}

.compact-price-btn {
  width: 100%;
  padding: 10px;
  text-align: center;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-primary);
}

.compact-price-card.pro .compact-price-btn {
  background: var(--accent-color);
  color: white;
  border: none;
}

.compact-price-btn:hover {
  opacity: 0.9;
}
'''
content = content + new_styles
with open('style.css', 'w', encoding='utf-8') as f:
    f.write(content)
print('style.css updated')
