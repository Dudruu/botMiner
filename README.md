# Minerador de Leads — Google Maps

Script em Node.js + Puppeteer que automatiza buscas no Google Maps e coleta **empresas que não possuem site, mas têm telefone cadastrado**, dentro de uma **localização e raio de atuação** que você define. O resultado é salvo em `leads.json` e exibido no terminal em tempo real e em uma tabela de resumo no final.

## Como funciona

1. Você informa uma **localização** (cidade, endereço ou coordenadas) e um **raio** em km.
2. O script converte o local em coordenadas (via OpenStreetMap/Nominatim) e abre o Google Maps centralizado ali, com zoom ajustado ao raio.
3. Para cada nicho, percorre os cards de resultados, rolando a lista para carregar mais.
4. A distância de cada empresa até o centro é calculada, e as que ficam **fora do raio são descartadas**.
5. Salva apenas empresas **sem site** e **com telefone**, ignorando duplicatas.
6. Cada lead aparece no terminal assim que é capturado e é gravado imediatamente no `leads.json`.
7. Ao final (ou com Ctrl+C), exibe uma tabela com os leads novos e a contagem por nicho.

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

### Modo interativo

```bash
node minerar_leads.js
```

O script pergunta localização, raio, nichos e meta. Pressione Enter para aceitar o valor padrão de cada pergunta.

### Por argumentos

```bash
node minerar_leads.js --local "Pouso Alegre, MG" --raio 30
node minerar_leads.js --local "Itajuba, MG; Varginha, MG" --raio 15 --nichos "Pizzaria, Pet Shop" --meta 20
node minerar_leads.js --local "-22.4256,-45.4528" --raio 10 --headless
```

| Opção | Descrição | Padrão |
|---|---|---|
| `--local` | Cidade, endereço ou `lat,lng`. Vários locais separados por `;` | `Itajuba, MG` |
| `--raio` | Raio de atuação em km a partir de cada local | `20` |
| `--nichos` | Segmentos separados por vírgula | lista no topo do script |
| `--meta` | Leads válidos por combinação nicho + local | `15` |
| `--headless` | Executa sem abrir a janela do navegador | desligado |
| `--ajuda` | Mostra a ajuda | — |

Os valores padrão ficam no topo do arquivo (`NICHOS_PADRAO`, `LOCAIS_PADRAO`, `RAIO_PADRAO_KM`, `META_PADRAO`).

### Escolhendo o navegador

A função `encontrarNavegador()` procura, nesta ordem:

1. A variável de ambiente `CHROME_PATH`
2. Chrome ou Edge nos caminhos padrão do sistema
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
    "endereco": "Rua Exemplo, 123 - Centro, Itajubá - MG",
    "nicho": "Pizzaria",
    "cidade": "Itajuba, MG",
    "distancia_km": 4.2,
    "status": "pendente"
  }
]
```

- `telefone`: apenas dígitos, com prefixo `55` (formato aceito por links `wa.me`).
- `distancia_km`: distância até o centro da busca (pode ser `null` se o Maps não informar coordenadas).
- `status`: começa como `pendente`, para você controlar o andamento da prospecção.

Se o arquivo já existir, o script o carrega e **não duplica** telefones já salvos, então é seguro rodar várias vezes. Leads antigos, sem `endereco` e `distancia_km`, continuam válidos.

## Solução de problemas

- **Local não encontrado:** informe as coordenadas direto em `--local "lat,lng"` (clique com o botão direito no Google Maps para copiá-las).
- **Navegador não abre:** defina `CHROME_PATH` com o caminho do executável.
- **Nenhum lead capturado:** o Google Maps muda seus seletores CSS com frequência. Se isso acontecer, revise `h1.DUwDvf`, `a[data-item-id="authority"]` e `button[data-item-id^="phone:tel:"]`.
- **Poucos resultados com raio pequeno:** o Maps limita quantos resultados mostra por busca. Aumente o raio ou use mais nichos.
- **Emojis quebrados no terminal do Windows:** use o Windows Terminal ou rode `chcp 65001` antes do script.
- **Busca travando:** aumente os valores de `sleep()` em conexões lentas.

## Observações

- O raio é aplicado em linha reta, pela distância entre as coordenadas da empresa e o centro, não por tempo de deslocamento.
- O telefone coletado pode ser fixo e não ter WhatsApp. Vale validar antes do contato.
- Automatizar o Google Maps pode violar os termos de uso da plataforma, e o uso dos dados deve respeitar a **LGPD**. Use com moderação e com abordagem comercial responsável.