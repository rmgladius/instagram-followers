# Instagram Followers

Extensão para Chrome que mostra quais contas você segue no Instagram e não seguem você de volta. A comparação roda no navegador usando sua sessão aberta, sem pedir senha ou importar um ZIP.

## Instalação

1. Clone este repositório ou baixe o código e extraia os arquivos.
2. Abra `chrome://extensions` no Chrome e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta que contém o `manifest.json`.

## Uso

1. Entre no Instagram pelo Chrome e abra seu próprio perfil.
2. Clique no ícone da extensão **Instagram Recíproco** e depois em **Analisar meu perfil**.
3. Mantenha a aba aberta enquanto a extensão lê as duas listas. Use a busca para filtrar os resultados.
4. Clique em **Abrir perfil** e use **Deixar de seguir** no próprio Instagram quando quiser.

A extensão usa as permissões `activeTab` e `scripting` para ler a interface da aba do Instagram quando você a aciona. Os dados da análise ficam no navegador e a extensão não os envia a servidores. Se as listas não puderem ser verificadas pelos totais que o Instagram exibe, a extensão informa que a análise ficou incompleta. Mudanças na interface do Instagram podem afetar a leitura.

## Licença

[MIT](LICENSE)
