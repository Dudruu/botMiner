const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');

// ==========================================
// 1. CONFIGURAÇÕES PADRÃO
// (podem ser sobrescritas por argumentos ou pelas perguntas do terminal)
// ==========================================
const NICHOS_PADRAO = [
    'Clinica Odontologica',
    'Clinica de Estetica',
    'Pizzaria',
    'Hamburgueria',
    'Oficina Mecanica',
    'Pet Shop',
    'Imobiliaria',
    'Salao de Beleza',
    'Escritorio de Contabilidade',
    'Academia'
];

const LOCAIS_PADRAO = ['Itajuba, MG'];
const RAIO_PADRAO_KM = 20;
const META_PADRAO = 15; // leads válidos por combinação (nicho + local)
const MAX_FORA_DO_RAIO_SEGUIDOS = 8; // encerra a busca quando só aparecem resultados longe demais
const CAMINHO_ARQUIVO = path.join(__dirname, 'leads.json');

// ==========================================
// 2. TERMINAL (CORES E AJUDA)
// ==========================================
const c = {
    reset: '\x1b[0m',
    negrito: '\x1b[1m',
    verde: '\x1b[32m',
    vermelho: '\x1b[31m',
    amarelo: '\x1b[33m',
    ciano: '\x1b[36m',
    cinza: '\x1b[90m'
};

function mostrarAjuda() {
    console.log(`
${c.negrito}Minerador de Leads - Google Maps${c.reset}

Uso:
  node minerar_leads.js                      (modo interativo: pergunta as opções)
  node minerar_leads.js --local "Itajuba, MG" --raio 30

Opções:
  --local     Cidade, endereço ou coordenadas "lat,lng". Separe vários com ";"
              Ex.: --local "Itajuba, MG; Pouso Alegre, MG"
              Ex.: --local "-22.4256,-45.4528"
  --raio      Raio de atuação em km a partir do local (padrão: ${RAIO_PADRAO_KM})
  --nichos    Segmentos separados por vírgula
              Ex.: --nichos "Pizzaria, Pet Shop, Academia"
  --meta      Leads válidos por combinação nicho + local (padrão: ${META_PADRAO})
  --headless  Executa sem abrir a janela do navegador
  --ajuda     Mostra esta mensagem
`);
}

// ==========================================
// 3. FUNÇÕES UTILITÁRIAS E PERSISTÊNCIA
// ==========================================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Localiza um navegador instalado conforme o sistema operacional.
// Retorna undefined para o Puppeteer usar o Chromium que ele mesmo baixou.
// Você também pode forçar um caminho com a variável de ambiente CHROME_PATH.
function encontrarNavegador() {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
        return process.env.CHROME_PATH;
    }

    let candidatos = [];

    if (process.platform === 'win32') {
        const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
        const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        const localAppData = process.env['LOCALAPPDATA'] || '';

        candidatos = [
            path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        ];
    } else if (process.platform === 'darwin') {
        candidatos = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
    } else {
        candidatos = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
    }

    return candidatos.find(p => p && fs.existsSync(p));
}

function formatarTelefone(telefoneExtraido) {
    let limpo = telefoneExtraido.replace(/\D/g, '');
    if (limpo.length >= 10 && !limpo.startsWith('55')) {
        limpo = '55' + limpo;
    }
    return limpo;
}

function carregarLeadsExistentes() {
    if (fs.existsSync(CAMINHO_ARQUIVO)) {
        try {
            return JSON.parse(fs.readFileSync(CAMINHO_ARQUIVO, 'utf8'));
        } catch (e) {
            return [];
        }
    }
    return [];
}

function salvarNovoLead(novoLead, listaCompleta) {
    listaCompleta.push(novoLead);
    fs.writeFileSync(CAMINHO_ARQUIVO, JSON.stringify(listaCompleta, null, 2), 'utf8');
}

// ==========================================
// 4. LOCALIZAÇÃO E RAIO
// ==========================================
function lerArgumentos() {
    const args = process.argv.slice(2);
    const resultado = {};
    for (let i = 0; i < args.length; i++) {
        if (!args[i].startsWith('--')) continue;
        const chave = args[i].slice(2);
        const proximo = args[i + 1];
        if (proximo === undefined || proximo.startsWith('--')) {
            resultado[chave] = true;
        } else {
            resultado[chave] = proximo;
            i++;
        }
    }
    return resultado;
}

async function perguntar(rl, texto, padrao) {
    const resposta = (await rl.question(`${texto} ${c.cinza}[${padrao}]${c.reset}: `)).trim();
    return resposta || String(padrao);
}

async function obterConfig() {
    const args = lerArgumentos();

    if (args.ajuda || args.help) {
        mostrarAjuda();
        process.exit(0);
    }

    let local = args.local;
    let raio = args.raio;
    let nichos = args.nichos;
    let meta = args.meta;

    // Sem nenhum argumento e com terminal interativo: pergunta as opções
    const interativo = process.argv.length <= 2 && process.stdin.isTTY;
    if (interativo) {
        console.log(`${c.negrito}⚙️  Configuração da busca${c.reset} ${c.cinza}(Enter aceita o padrão)${c.reset}\n`);
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        local = await perguntar(rl, '📍 Localização (cidade, endereço ou "lat,lng"; vários com ";")', LOCAIS_PADRAO.join('; '));
        raio = await perguntar(rl, '📏 Raio de atuação em km', RAIO_PADRAO_KM);
        nichos = await perguntar(rl, '🏷️  Nichos (separados por vírgula)', NICHOS_PADRAO.join(', '));
        meta = await perguntar(rl, '🎯 Meta de leads por busca', META_PADRAO);
        rl.close();
        console.log('');
    }

    const locais = String(local || LOCAIS_PADRAO.join(';')).split(';').map(s => s.trim()).filter(Boolean);
    const listaNichos = nichos && nichos !== true
        ? String(nichos).split(',').map(s => s.trim()).filter(Boolean)
        : NICHOS_PADRAO;

    let raioKm = parseFloat(String(raio).replace(',', '.'));
    if (!raioKm || raioKm <= 0) raioKm = RAIO_PADRAO_KM;

    let metaPorBusca = parseInt(meta, 10);
    if (!metaPorBusca || metaPorBusca <= 0) metaPorBusca = META_PADRAO;

    return {
        locais,
        nichos: listaNichos,
        raioKm,
        meta: metaPorBusca,
        headless: !!args.headless
    };
}

// Aceita "lat,lng" direto ou geocodifica o texto via OpenStreetMap (Nominatim)
async function geocodificar(local) {
    const coord = local.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coord) {
        return { nome: local, lat: parseFloat(coord[1]), lng: parseFloat(coord[2]) };
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(local)}`;
    const resposta = await fetch(url, {
        headers: { 'User-Agent': 'minerador-leads/1.0', 'Accept-Language': 'pt-BR' }
    });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

    const dados = await resposta.json();
    if (!dados.length) throw new Error('local não encontrado');

    return { nome: local, lat: parseFloat(dados[0].lat), lng: parseFloat(dados[0].lon) };
}

function distanciaKm(a, b) {
    const R = 6371;
    const rad = (g) => g * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// Converte o raio em um nível de zoom do Google Maps (aproximado)
function zoomParaRaio(raioKm, lat) {
    const metrosPorPixelZoom0 = 156543.03392 * Math.cos(lat * Math.PI / 180);
    const zoom = Math.log2((metrosPorPixelZoom0 * 400) / (raioKm * 1000));
    return Math.max(8, Math.min(17, Math.floor(zoom)));
}

// Os links e URLs de lugares do Maps trazem as coordenadas como !3d{lat}!4d{lng}
function extrairCoordenadas(texto) {
    const m = (texto || '').match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null;
}

// ==========================================
// 5. RESUMO NO TERMINAL
// ==========================================
const estado = { novos: [], browser: null, totalBase: 0, encerrando: false };

function exibirResumo() {
    const novos = estado.novos;
    console.log(`\n${c.negrito}${'='.repeat(60)}${c.reset}`);
    console.log(`${c.negrito}📋 RESUMO DA EXECUÇÃO${c.reset}`);
    console.log(`${'='.repeat(60)}`);

    if (!novos.length) {
        console.log(`${c.amarelo}Nenhum lead novo encontrado nesta execução.${c.reset}`);
    } else {
        console.table(novos.map(l => ({
            Nome: l.nome,
            Telefone: l.telefone,
            Nicho: l.nicho,
            'Dist. (km)': l.distancia_km ?? '-',
            Local: l.cidade
        })));

        const porNicho = {};
        novos.forEach(l => { porNicho[l.nicho] = (porNicho[l.nicho] || 0) + 1; });
        console.log(`${c.negrito}Por nicho:${c.reset}`);
        Object.entries(porNicho).forEach(([nicho, qtd]) => console.log(`  • ${nicho}: ${qtd}`));
    }

    console.log(`\n${c.verde}${c.negrito}Novos leads: ${novos.length}${c.reset} | Total em leads.json: ${estado.totalBase}`);
    console.log(`📁 Arquivo: ${CAMINHO_ARQUIVO}`);
}

// Ctrl+C: mostra o que já foi capturado (os leads já estão salvos no arquivo)
process.on('SIGINT', async () => {
    if (estado.encerrando) process.exit(1);
    estado.encerrando = true;
    console.log(`\n${c.amarelo}⏹️  Interrompido pelo usuário.${c.reset}`);
    exibirResumo();
    try { if (estado.browser) await estado.browser.close(); } catch (e) {}
    process.exit(0);
});

// ==========================================
// 6. MOTOR DE MINERAÇÃO
// ==========================================
async function minerarLeads() {
    const config = await obterConfig();

    let todosLeads = carregarLeadsExistentes();
    estado.totalBase = todosLeads.length;
    // Set com os telefones já salvos para nunca duplicar contatos
    const telefonesSalvos = new Set(todosLeads.map(lead => lead.telefone));

    console.log(`📂 Leads já cadastrados na base: ${todosLeads.length}`);
    console.log(`📏 Raio de atuação: ${config.raioKm} km`);
    console.log(`🏷️  Nichos: ${config.nichos.length} | 🎯 Meta por busca: ${config.meta}\n`);

    // Localiza as coordenadas de cada ponto de busca
    const locais = [];
    for (const nome of config.locais) {
        try {
            const g = await geocodificar(nome);
            locais.push(g);
            console.log(`📍 ${nome} → ${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`);
        } catch (e) {
            console.log(`${c.vermelho}❌ Não foi possível localizar "${nome}": ${e.message}${c.reset}`);
        }
        await sleep(1100); // respeita o limite de 1 requisição/s do Nominatim
    }

    if (!locais.length) {
        console.log(`${c.vermelho}Nenhum local válido. Tente informar "lat,lng" direto em --local.${c.reset}`);
        return;
    }

    const executablePath = encontrarNavegador();
    console.log(`\n🌐 Navegador: ${executablePath || 'Chromium embutido do Puppeteer'}`);

    const launchOptions = {
        headless: config.headless,
        args: ['--disable-notifications', '--start-maximized', '--lang=pt-BR'],
        defaultViewport: null
    };

    if (executablePath) launchOptions.executablePath = executablePath;

    // --no-sandbox só é necessário no Linux (principalmente root/containers)
    if (process.platform === 'linux') {
        launchOptions.args.push('--no-sandbox', '--disable-setuid-sandbox');
    }

    const browser = await puppeteer.launch(launchOptions);
    estado.browser = browser;
    const page = await browser.newPage();

    try {
        for (const local of locais) {
            const centro = { lat: local.lat, lng: local.lng };
            const zoom = zoomParaRaio(config.raioKm, local.lat);

            for (const nicho of config.nichos) {
                console.log(`\n${c.ciano}${'='.repeat(60)}${c.reset}`);
                console.log(`${c.ciano}🔎 "${nicho}" num raio de ${config.raioKm} km de ${local.nome}${c.reset}`);
                console.log(`${c.ciano}${'='.repeat(60)}${c.reset}`);

                const urlBusca = `https://www.google.com.br/maps/search/${encodeURIComponent(nicho)}/@${local.lat},${local.lng},${zoom}z?hl=pt-BR`;

                try {
                    await page.goto(urlBusca, { waitUntil: 'networkidle2', timeout: 60000 });
                    await sleep(4000);

                    let leadsNestaBusca = 0;
                    let indexAtual = 0;
                    let tentativasSemNovosCards = 0;
                    let foraDoRaioSeguidos = 0;

                    while (leadsNestaBusca < config.meta) {
                        let cards = await page.$$('a[href*="/maps/place/"]');

                        if (indexAtual >= cards.length) {
                            console.log(`${c.cinza}📜 Rolando a lista para expandir resultados...${c.reset}`);
                            await page.evaluate(() => {
                                const feed = document.querySelector('div[role="feed"]');
                                if (feed) feed.scrollBy(0, 2000);
                            });
                            await sleep(3500);

                            let cardsAposScroll = await page.$$('a[href*="/maps/place/"]');
                            if (cardsAposScroll.length === cards.length) {
                                tentativasSemNovosCards++;
                                if (tentativasSemNovosCards >= 2) {
                                    console.log(`${c.amarelo}⚠️ Fim da lista para esta busca.${c.reset}`);
                                    break;
                                }
                            } else {
                                tentativasSemNovosCards = 0;
                            }
                            continue;
                        }

                        const card = cards[indexAtual];

                        try {
                            // Verificação de raio ANTES de abrir o card (economiza tempo)
                            const href = await card.evaluate(el => el.href);
                            let coords = extrairCoordenadas(href);
                            let distancia = coords ? distanciaKm(centro, coords) : null;

                            if (distancia !== null && distancia > config.raioKm) {
                                foraDoRaioSeguidos++;
                                console.log(`${c.cinza}📏 Fora do raio (${distancia.toFixed(1)} km), pulando...${c.reset}`);
                                indexAtual++;
                                if (foraDoRaioSeguidos >= MAX_FORA_DO_RAIO_SEGUIDOS) {
                                    console.log(`${c.amarelo}⚠️ Só há resultados fora do raio. Próxima busca.${c.reset}`);
                                    break;
                                }
                                continue;
                            }

                            await card.click();
                            await sleep(3200);

                            // Sem coordenadas no link? Tenta pela URL da página aberta
                            if (distancia === null) {
                                coords = extrairCoordenadas(page.url());
                                distancia = coords ? distanciaKm(centro, coords) : null;
                                if (distancia !== null && distancia > config.raioKm) {
                                    foraDoRaioSeguidos++;
                                    console.log(`${c.cinza}📏 Fora do raio (${distancia.toFixed(1)} km), pulando...${c.reset}`);
                                    indexAtual++;
                                    if (foraDoRaioSeguidos >= MAX_FORA_DO_RAIO_SEGUIDOS) {
                                        console.log(`${c.amarelo}⚠️ Só há resultados fora do raio. Próxima busca.${c.reset}`);
                                        break;
                                    }
                                    continue;
                                }
                            }
                            foraDoRaioSeguidos = 0;

                            const dadosEmpresa = await page.evaluate(() => {
                                const nomeEl = document.querySelector('h1.DUwDvf');
                                let nome = nomeEl ? nomeEl.innerText.trim() : null;

                                let temSite = !!document.querySelector('a[data-item-id="authority"]');

                                let telefone = null;
                                const btnTelefone = document.querySelector('button[data-item-id^="phone:tel:"]');
                                if (btnTelefone) {
                                    telefone = btnTelefone.getAttribute('data-item-id').replace('phone:tel:', '');
                                }

                                let endereco = null;
                                const btnEndereco = document.querySelector('button[data-item-id="address"]');
                                if (btnEndereco) {
                                    endereco = (btnEndereco.getAttribute('aria-label') || btnEndereco.innerText || '')
                                        .replace(/^Endere[cç]o:\s*/i, '')
                                        .trim();
                                }

                                return { nome, temSite, telefone, endereco };
                            });

                            if (!dadosEmpresa.nome) {
                                indexAtual++;
                                continue;
                            }

                            if (!dadosEmpresa.temSite && dadosEmpresa.telefone) {
                                const telefoneFormatado = formatarTelefone(dadosEmpresa.telefone);

                                if (telefonesSalvos.has(telefoneFormatado)) {
                                    console.log(`${c.amarelo}⏭️ Duplicado (já na lista): ${dadosEmpresa.nome}${c.reset}`);
                                } else {
                                    const novoLead = {
                                        nome: dadosEmpresa.nome,
                                        telefone: telefoneFormatado,
                                        endereco: dadosEmpresa.endereco,
                                        nicho: nicho,
                                        cidade: local.nome,
                                        distancia_km: distancia !== null ? Number(distancia.toFixed(1)) : null,
                                        status: 'pendente'
                                    };

                                    salvarNovoLead(novoLead, todosLeads);
                                    estado.novos.push(novoLead);
                                    estado.totalBase = todosLeads.length;
                                    telefonesSalvos.add(telefoneFormatado);
                                    leadsNestaBusca++;

                                    const distTxt = novoLead.distancia_km !== null ? ` | ${novoLead.distancia_km} km` : '';
                                    console.log(`${c.verde}✅ [${leadsNestaBusca}/${config.meta}] ${c.negrito}${novoLead.nome}${c.reset}${c.verde} | ${novoLead.telefone}${distTxt}${c.reset}`);
                                    if (novoLead.endereco) {
                                        console.log(`${c.cinza}   📍 ${novoLead.endereco}${c.reset}`);
                                    }
                                }
                            } else if (dadosEmpresa.temSite) {
                                console.log(`${c.vermelho}❌ Ignorado (possui site): ${dadosEmpresa.nome}${c.reset}`);
                            } else {
                                console.log(`${c.vermelho}❌ Ignorado (sem telefone): ${dadosEmpresa.nome}${c.reset}`);
                            }

                        } catch (error) {
                            console.log(`${c.amarelo}⚠️ Erro no card ${indexAtual}, pulando...${c.reset}`);
                        }

                        indexAtual++;
                    }

                } catch (erroNavegacao) {
                    console.log(`${c.vermelho}❌ Erro ao carregar a busca "${nicho}", pulando para a próxima...${c.reset}`);
                }
            }
        }
    } finally {
        await browser.close();
        estado.browser = null;
    }

    console.log(`\n🎉 Varredura completa!`);
    exibirResumo();
}

minerarLeads().catch(err => {
    console.error(`${c.vermelho}Erro fatal:${c.reset}`, err);
    process.exit(1);
});