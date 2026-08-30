import json
import sys

def add_keys(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    if 'pricing' not in data:
        data['pricing'] = {}
        
    data['pricing'].update({
        "mini_title": "Pacote Mini" if 'pt' in filepath else "Mini Pack",
        "mini_btn": "Comprar Mini" if 'pt' in filepath else "Buy Mini",
        "popular_title": "Pacote Popular" if 'pt' in filepath else "Popular Pack",
        "popular_btn": "Comprar Popular" if 'pt' in filepath else "Buy Popular",
        "advanced_title": "Pacote Avançado" if 'pt' in filepath else "Advanced Pack",
        "advanced_btn": "Comprar Avançado" if 'pt' in filepath else "Buy Advanced",
        "studio_title": "Pacote Studio" if 'pt' in filepath else "Studio Pack",
        "studio_btn": "Comprar Studio" if 'pt' in filepath else "Buy Studio",
        "title": "Planos e Créditos" if 'pt' in filepath else "Plans and Credits"
    })
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

add_keys('locales/pt.json')
add_keys('locales/en.json')
print('Translation keys added.')
