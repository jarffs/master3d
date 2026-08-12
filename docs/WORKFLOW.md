# WORKFLOW DO USUÁRIO

Este documento descreve como os usuários de diferentes níveis de acesso interagem com o sistema.

## 1. Visitante (Usuário Não Autenticado)
O visitante tem acesso à demonstração do gerador 3D.
- **Acesso ao Gerador:** Pode abrir o app, fazer upload de um SVG, ajustar as barras e visualizar a prévia em 3D.
- **Restrição de Download:** O botão de "Exportar STL" fica **bloqueado**. Ao tentar clicar, é exibida uma mensagem de que é necessário criar uma conta para fazer o download.
- **Restrição de Salvamento:** O botão de "Salvar Design" exibe um modal ou redireciona para a página de Login/Cadastro.

## 2. Processo de Autenticação
- O usuário acessa a funcionalidade de Login (via menu ou ao tentar uma ação bloqueada).
- Informa E-mail e Senha, ou usa autenticação social (Google/GitHub, dependendo da configuração).
- Após login bem-sucedido, a interface é atualizada para mostrar a área logada e a imagem de perfil do usuário.

## 3. Usuário Autenticado (Área Logada)
O usuário logado possui todas as permissões ativadas:
- **Exportação:** Pode baixar arquivos STL gerados sem restrições.
- **Salvar Projetos:** Pode salvar a configuração atual (SVG + sliders de configuração) com um nome na nuvem.
- **Meus Projetos:** Possui um menu ou página para visualizar e carregar (restaurar) modelos salvos anteriormente.
- **Perfil do Usuário:** Pode atualizar seus dados e subir uma foto de perfil (Avatar).
- **Mesas Personalizadas (Build Plates):** Pode adicionar novas mesas de impressão às configurações. Essas mesas personalizadas aparecerão automaticamente na lista (dropdown) de mesas disponíveis para aquele usuário.
