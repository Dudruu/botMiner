const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. MATRIZ DE BUSCA (NICHOS x REGIÕES)
// ==========================================
const NICHOS = [
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

// Para aumentar a distância de forma eficaz no Maps, listamos cidades vizinhas ou polos da região
const CIDADES = [
    'Itajuba, MG',
    'Pouso Alegre, MG',
    'Santa Rita do Sapucai, MG',
    'Piranguinho, MG',
    'Maria da Fe, MG',
    'Sao Lourenco, MG',
    'Varginha, MG'
];

const META_POR_BUSCA = 15; // Quantos leads válidos buscar por combinação (Nicho + Cidade)
const CAMINHO_ARQUIVO = path.join(__dirname, 'leads.json');

// ==========================================
// 2. FUNÇÕES UTILITÁRIAS E PERSISTÊNCIA
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
// 3. MOTOR DE MINERAÇÃO MULTI-REGIÃO
// ==========================================
async function minerarLeads() {
    let todosLeads = carregarLeadsExistentes();
    // Cria um Set com os telefones já salvos para nunca duplicar contatos
    const telefonesSalvos = new Set(todosLeads.map(lead => lead.telefone));

    console.log(`📂 Leads já cadastrados na base: ${todosLeads.length}`);

    const executablePath = encontrarNavegador();
    console.log(`🌐 Navegador: ${executablePath || 'Chromium embutido do Puppeteer'}`);

    const launchOptions = {
        headless: false,
        args: [
            '--disable-notifications',
            '--start-maximized'
        ],
        defaultViewport: null
    };

    if (executablePath) {
        launchOptions.executablePath = executablePath;
    }

    // --no-sandbox só é necessário no Linux (principalmente root/containers)
    if (process.platform === 'linux') {
        launchOptions.args.push('--no-sandbox', '--disable-setuid-sandbox');
    }

    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    // Loop cruzando Cidades e Nichos
    for (const cidade of CIDADES) {
        for (const nicho of NICHOS) {
            const termoBusca = `${nicho} em ${cidade}`;
            console.log(`\n==================================================`);
            console.log(`🔎 Buscando: "${termoBusca}"`);
            console.log(`==================================================`);

            const urlBusca = `https://www.google.com.br/maps/search/${encodeURIComponent(termoBusca)}`;

            try {
                await page.goto(urlBusca, { waitUntil: 'networkidle2', timeout: 60000 });
                await sleep(4000);

                // Afasta o zoom do mapa clicando no botão de Zoom Out (-) do Google Maps se disponível
                try {
                    const btnZoomOut = await page.$('button[id="widget-zoom-out"], button[aria-label*="Diminuir o zoom"]');
                    if (btnZoomOut) {
                        await btnZoomOut.click();
                        await sleep(1000);
                        await btnZoomOut.click();
                        await sleep(2000);
                    }
                } catch (e) {}

                let leadsNestaBusca = 0;
                let indexAtual = 0;
                let tentativasSemNovosCards = 0;

                while (leadsNestaBusca < META_POR_BUSCA) {
                    let cards = await page.$$('a[href*="/maps/place/"]');

                    if (indexAtual >= cards.length) {
                        console.log('📜 Rolando a lista para expandir resultados...');
                        await page.evaluate(() => {
                            const feed = document.querySelector('div[role="feed"]');
                            if (feed) feed.scrollBy(0, 2000);
                        });
                        await sleep(3500);

                        let cardsAposScroll = await page.$$('a[href*="/maps/place/"]');
                        if (cardsAposScroll.length === cards.length) {
                            tentativasSemNovosCards++;
                            if (tentativasSemNovosCards >= 2) {
                                console.log('⚠️ Fim da lista para esta categoria/cidade.');
                                break;
                            }
                        } else {
                            tentativasSemNovosCards = 0;
                        }
                        continue;
                    }

                    const card = cards[indexAtual];

                    try {
                        await card.click();
                        await sleep(3200);

                        const dadosEmpresa = await page.evaluate(() => {
                            const nomeEl = document.querySelector('h1.DUwDvf');
                            let nome = nomeEl ? nomeEl.innerText.trim() : null;

                            let temSite = !!document.querySelector('a[data-item-id="authority"]');

                            let telefone = null;
                            const btnTelefone = document.querySelector('button[data-item-id^="phone:tel:"]');
                            if (btnTelefone) {
                                telefone = btnTelefone.getAttribute('data-item-id').replace('phone:tel:', '');
                            }

                            return { nome, temSite, telefone };
                        });

                        if (!dadosEmpresa.nome) {
                            indexAtual++;
                            continue;
                        }

                        if (!dadosEmpresa.temSite && dadosEmpresa.telefone) {
                            const telefoneFormatado = formatarTelefone(dadosEmpresa.telefone);

                            if (telefonesSalvos.has(telefoneFormatado)) {
                                console.log(`⏭️ Duplicado (Já na lista): ${dadosEmpresa.nome}`);
                            } else {
                                const novoLead = {
                                    nome: dadosEmpresa.nome,
                                    telefone: telefoneFormatado,
                                    nicho: nicho,
                                    cidade: cidade,
                                    status: 'pendente'
                                };

                                salvarNovoLead(novoLead, todosLeads);
                                telefonesSalvos.add(telefoneFormatado);
                                leadsNestaBusca++;

                                console.log(`✅ [${leadsNestaBusca}/${META_POR_BUSCA}] Capturado: ${dadosEmpresa.nome} (${nicho}) | ${telefoneFormatado}`);
                            }
                        } else if (dadosEmpresa.temSite) {
                            console.log(`❌ Ignorado (Possui site): ${dadosEmpresa.nome}`);
                        } else {
                            console.log(`❌ Ignorado (Sem telefone): ${dadosEmpresa.nome}`);
                        }

                    } catch (error) {
                        console.log(`⚠️ Erro no card ${indexAtual}, pulando...`);
                    }

                    indexAtual++;
                }

            } catch (erroNavegacao) {
                console.log(`❌ Erro ao carregar a busca "${termoBusca}", pulando para a próxima...`);
            }
        }
    }

    console.log(`\n🎉 Varredura completa! Total acumulado no leads.json: ${todosLeads.length} leads.`);
    await browser.close();
}

minerarLeads();