# botMiner# Minerador de Leads — Google Maps

Script em Node.js + Puppeteer que automatiza buscas no Google Maps e coleta **empresas que não possuem site, mas têm telefone cadastrado**. O resultado é salvo em `leads.json`, pronto para ser usado em prospecção (por exemplo, via WhatsApp).

## Como funciona

1. Cruza uma lista de **nichos** com uma lista de **cidades** (ex.: `Pizzaria em Itajuba, MG`).
2. Abre cada busca no Google Maps e percorre os cards de resultados, rolando a lista para carregar mais.
3. Para cada empresa, extrai nome, telefone e se existe site.
4. Salva apenas empresas **sem site** e **com telefone**, ignorando duplicatas.
5. Grava cada lead no `leads.json` assim que é capturado, então nada se perde se o script for interrompido.

## Requisitos

- [Node.js](https://nodejs.org/) 18 ou superior
- Google Chrome ou Microsoft Edge instalado (opcional, veja abaixo)
- Windows, Linux ou macOS

## Instalação

```bash
npm install puppeteer
```

O Puppeteer baixa o próprio Chromium na instalação. Se você já tem Chrome ou Edge, o script tenta usá-los automaticamente.

## Uso

```bash
node minerar_leads.js
```

O navegador abre em modo visível (`headless: false`) e você acompanha a mineração pelo terminal.

## Configuração

Tudo fica no topo do arquivo:

| Variável | Descrição |
|---|---|
| `NICHOS` | Segmentos de negócio a buscar (ex.: Pizzaria, Pet Shop) |
| `CIDADES` | Cidades ou polos da região a varrer |
| `META_POR_BUSCA` | Quantidade de leads válidos por combinação nicho + cidade (padrão: 15) |
| `CAMINHO_ARQUIVO` | Onde o `leads.json` é gravado (padrão: pasta do script) |

### Escolhendo o navegador

A função `encontrarNavegador()` procura, nesta ordem:

1. A variável de ambiente `CHROME_PATH`
2. Chrome ou Edge nos caminhos padrão do sistema (Windows, macOS ou Linux)
3. O Chromium embutido do Puppeteer

Para forçar um caminho no PowerShell:

```powershell
$env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
node minerar_leads.js
```

## Formato de saída

`leads.json` é uma lista de objetos:

```json
[
  {
    "nome": "Pizzaria Exemplo",
    "telefone": "5535999999999",
    "nicho": "Pizzaria",
    "cidade": "Itajuba, MG",
    "status": "pendente"
  }
]
```

- `telefone`: apenas dígitos, com prefixo `55` (formato aceito por links `wa.me`).
- `status`: começa como `pendente`, para você controlar o andamento da prospecção.

Se o arquivo já existir, o script o carrega e **não duplica** telefones já salvos, então é seguro rodar várias vezes.

## Solução de problemas

- **Navegador não abre:** defina `CHROME_PATH` com o caminho do executável.
- **Nenhum lead capturado:** o Google Maps muda seus seletores CSS com frequência. Se isso acontecer, revise `h1.DUwDvf`, `a[data-item-id="authority"]` e `button[data-item-id^="phone:tel:"]`.
- **Emojis quebrados no terminal do Windows:** use o Windows Terminal ou rode `chcp 65001` antes do script.
- **Busca travando:** aumente os valores de `sleep()` em conexões lentas.

## Observações

- O telefone coletado pode ser fixo e não ter WhatsApp. Vale validar antes do contato.
- Automatizar o Google Maps pode violar os termos de uso da plataforma, e o uso dos dados deve respeitar a **LGPD**. Use com moderação e com abordagem comercial responsável.