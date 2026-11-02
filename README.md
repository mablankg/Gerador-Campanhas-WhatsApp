# Gerador de Campanhas WhatsApp

Consumidor web da API `mablankg/WhatsApp-API-GO-Vercel`. Envia mensagens individuais e para grupos, lista os grupos da conta conectada e permite criar um grupo com participantes.

## Variáveis da Vercel

- `WHATSAPP_API_URL`: `https://whatsapp-api-go-vercel.vercel.app`
- `WHATSAPP_API_TOKEN`: o mesmo token secreto configurado na API Go
- `APP_ACCESS_TOKEN`: uma senha diferente, com pelo menos 16 caracteres, usada para entrar neste painel

As três variáveis são somente do servidor. O navegador recebe apenas a senha digitada pelo usuário durante a sessão e nunca recebe `WHATSAPP_API_TOKEN`.

## Publicação

Importe `mablankg/Gerador-Campanhas-WhatsApp` na Vercel, use o preset **Other**, mantenha a raiz `./` e não configure comando de build nem diretório de saída. Use o nome de projeto `gerador-campanhas-whatsapp`.

Esta versão não realiza disparos em massa, agendamento ou reenvio automático. O resultado `done` confirma que o WhatsApp aceitou o envio; recibos de entrega e leitura ainda não são acompanhados.
