import sys
with open('app.html', 'r', encoding='utf-8') as f:
    content = f.read()

print("File size:", len(content))
print("Last 300 chars:")
print(content[-300:])
