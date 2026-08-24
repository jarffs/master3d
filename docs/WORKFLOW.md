# WORKFLOW DO USUÁRIO

Este documento descreve como os usuários de diferentes níveis de acesso interagem com a plataforma (agora focada em ser multi-ferramentas).

## 1. Visitante (Usuário Não Autenticado)
- **Acesso à Landing Page:** O usuário chega pela `index.html` e vê os benefícios, ferramentas disponíveis e a tabela de preços.
- **Acesso ao Gerador (`app.html`):** Pode abrir o app, fazer upload de um SVG/Imagem, ajustar as barras e visualizar a prévia em 3D de forma gratuita.
- **Restrição de Download:** O botão de "Exportar STL" fica **bloqueado**. Ao tentar clicar, é exibida uma mensagem de que é necessário criar uma conta.
- **Restrição de Salvamento:** O botão de "Salvar Design" exibe o modal de Login/Cadastro.

## 2. Processo de Autenticação
- O usuário acessa a funcionalidade de Login/Registro via modal no topo da tela.
- Após login bem-sucedido, a interface é atualizada para mostrar a área logada e a imagem de perfil do usuário.
- Existe fluxo de recuperação de senha caso o usuário precise.

## 3. Usuário Free (Conta Gratuita)
- **Criação e Salvamento:** Pode gerar e salvar seus projetos livremente na nuvem, acessando-os pelo menu lateral "Meus Projetos" ou aba de gerenciamento.
- **Exportação STL Limitada:** Pode baixar arquivos STL, mas existe uma restrição de cotas (ex: 1 download gratuito por semana).
- **Paywall:** Se a cota semanal for atingida, ao tentar baixar, um modal sugere o upgrade via Stripe Checkout.
- **Customização de Mesa:** Pode criar e salvar configurações de mesas personalizadas.

## 4. Usuário PRO (Assinante Stripe)
- **Status PRO:** A aplicação identifica via tabela `profiles` que o usuário é assinante.
- **Exportação STL Ilimitada:** O sistema ignora a verificação de cotas, permitindo downloads infinitos.
- **Portal do Cliente:** O usuário tem acesso ao Stripe Customer Portal pelo menu de usuário para gerenciar ou cancelar sua assinatura.

## 5. Hub e Multi-Ferramentas (Fase 6)
- **Escolha de Ferramenta:** Ao logar, o usuário seleciona qual ferramenta deseja utilizar (ex: Cookie Cutter, Chaveiros, Litofanias).
- O motor de renderização `ToolEngine` adapta o painel lateral com as propriedades exatas da ferramenta escolhida e carrega o projeto correto do Supabase.
