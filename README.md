# Quadro Elétrico

Aplicação web (PWA em construção) para **montar, visualizar, simular e diagnosticar um quadro de distribuição elétrica residencial** no padrão brasileiro (NBR 5410, simplificada). O usuário cadastra a entrada de energia, o disjuntor geral, os DRs e os disjuntores dos circuitos. Depois liga e desliga cada peça num mapa interativo, vê por onde a energia passa, recebe alertas de dimensionamento errado e dicas de diagnóstico para defeitos reais da instalação. O projeto é salvo num arquivo `.quadro` (JSON), que pode ser reaberto ou enviado a um eletricista.

> **Aviso:** é uma ferramenta de apoio e estudo. As tabelas são simplificadas e a simulação é didática. Não substitui projeto elétrico nem avaliação de um profissional habilitado.

---

## 1. Para quem e para quê

| Uso | Como a aplicação ajuda |
|---|---|
| Mapear o quadro de casa | Cadastrar cada disjuntor com o que ele alimenta, a bitola do fio, a fase e se está atrás de DR. |
| Conferir se está bem dimensionado | Valida a regra carga ≤ disjuntor ≤ capacidade do fio, a bitola mínima, os polos, o DR em áreas molhadas e o balanceamento de fases. |
| Diagnosticar defeito | O usuário marca o sintoma do circuito (desarma, o DR cai, esquenta, pisca…) e recebe as causas prováveis, cruzadas com os dados cadastrados. |
| Simular | Ligar e desligar peças, cortar uma fase da rua e ver quais circuitos ficam sem energia e quais proteções atuam. |
| Compartilhar | Exportar e importar o arquivo `.quadro`. |

---

## 2. Funcionalidades

### 2.1 Mapa interativo do quadro
- Área de trabalho grande e rolável, com fundo pontilhado. **Cada peça é arrastada livremente** (encaixa numa grade de 8 px). A posição no mapa **não precisa** corresponder à posição física no quadro: a ideia é mapear as **ligações**, não desenhar o quadro real.
- **Zoom** de 30% a 160%: botões − / + / 100% / **Ajustar** (encaixa tudo na tela) e **Ctrl + roda do mouse**.
- Botão **Expandir**: o mapa ocupa a largura toda e o painel lateral vai para baixo.
- Botão **Organizar**: reposiciona tudo automaticamente em árvore (entrada → geral → DRs/circuitos → circuitos dos DRs).
- Botões **Ligar tudo** / **Desligar tudo**.
- Clicar no fundo do mapa limpa a seleção. Clicar numa peça, sem arrastar, a seleciona e abre o editor dela.

### 2.2 Peças do mapa

| Peça | Visual | Interações |
|---|---|---|
| **Entrada da rua** (padrão/medidor) | Caixa escura com seletor de fornecimento e bornes coloridos A/B/C/N na base | Escolher 1 fase 127 V / 1 fase 220 V / 2 fases / 3 fases. **Clicar num borne de fase corta ou religa aquela fase** (simula falta de fase da concessionária). |
| **Disjuntor geral** | Disjuntor DIN com alavanca vermelha | Alavanca liga/desliga. Configurado no painel lateral "Instalação". |
| **DR** (interruptor diferencial) | Disjuntor DIN azulado, alavanca azul, botão **T** amarelo | Alavanca liga/desliga. **T** simula o botão de teste (o DR desarma). |
| **Medidor de energia** (multimedidor DIN) | Corpo DIN escuro com display LCD verde | Não tem alavanca: fica sempre passando energia. O display mostra tensão e corrente de cada fase e a potência total do que está ligado depois dele (ex.: o CPD). Avisa com "!" se a corrente passar do limite de medição. **Não protege nada**: o circuito continua precisando de disjuntor. |
| **Disjuntor de circuito** | Disjuntor DIN com rótulo `C20`, `B32`… e bitola no topo | Alavanca liga/desliga. LED de status (verde/amarelo/vermelho) e "!" se houver sintoma relatado. |

Detalhes visuais de cada disjuntor:
- Largura proporcional ao número de polos (56 px por polo). Os de 2 e 3 polos têm as alavancas unidas por uma barra.
- Bornes com parafusos em cima (entrada) e embaixo (saída). **Brilham em laranja quando há energia.**
- Janela de estado: **vermelha "I ON"** = ligado, **verde "O OFF"** = desligado (convenção real dos fabricantes), **laranja piscando "TRIP"** = desarmado pela proteção (alavanca fica no meio).
- Etiqueta abaixo com número, nome, bolinhas coloridas das fases e a corrente (⚡ 18,2 A) quando energizado, ou "sem energia" / "falta fase B".

### 2.3 Fios
- **Entrada → geral**: um fio por condutor, nas cores **A vermelho, B preto, C cinza, N azul-claro**. A fase cortada aparece tracejada e apagada.
- **Geral/DR → DR/circuito**: curva desenhada da saída da origem até a entrada do destino. A espessura acompanha a bitola. **Quando energizado, o fio fica laranja com fluxo animado.**
- A ligação de cada circuito é definida no editor, no campo **"Sai de"**: direto do geral ou de um DR específico.

### 2.4 Simulação de energia e proteções
Regras de **energização** (`src/core/energia.ts`):
1. Fases presentes = fases do fornecimento menos as cortadas na entrada.
2. O **geral** tem energia na saída se está ligado e há pelo menos uma fase presente.
3. Um **DR** tem energia se está ligado e a origem dele (o geral) tem energia.
4. Um **circuito** tem energia se está ligado, a origem dele (geral ou DR) tem energia **e todas as fases que ele usa estão presentes**.

Depois de qualquer manobra, as **proteções** atuam nesta ordem (`aplicarProtecoes`):
1. **Disjuntor do circuito desarma** se estiver energizado com carga (Ib) maior que a corrente nominal (In).
2. **DR desarma** se algum circuito energizado abaixo dele tiver o sintoma "O DR desarma". É assim que o app reproduz uma fuga relatada.
3. **Geral desarma** se a soma das correntes energizadas em alguma fase passar da corrente do geral.

Cada atuação gera um evento, mostrado numa faixa amarela acima do mapa. Religar uma peça desarmada "rearma" e testa de novo.

### 2.5 Editor de circuito (ao selecionar um disjuntor)
- **Dados**: nome, tipo (iluminação, tomadas, chuveiro, torneira elétrica, ar-condicionado, forno/cooktop, motor/bomba, outro), potência total (W) e tensão (127/220 V, conforme o fornecimento).
- **Disjuntor**: corrente (2 a 125 A), polos (1P/2P/3P), curva (B/C/D) e **fases** em chips coloridos clicáveis. A quantidade de fases é exigida automaticamente: 220 V em bi/trifásico = 2 fases.
- **Fio**: bitola de 1,5 a 35 mm² (cobre) e **"Sai de"** (geral ou DR).
- **Números**: Ib (carga), In (disjuntor) e Iz (capacidade do fio), com a regra "carga ≤ disjuntor ≤ fio".
- **Sugestão**: calcula o menor disjuntor comercial ≥ 1,05 × Ib e o menor fio que esse disjuntor protege, com botão **Aplicar**.
- **Alertas** do circuito (ver 2.8).
- **Diagnóstico**: escolher o sintoma e ler as dicas. Campo de notas livre.

### 2.6 Editor de DR
Nome, corrente nominal (25/40/63/80/100 A), sensibilidade (30 mA para proteção de pessoas, 300 mA só contra incêndio), polos (2P ou 4P), lista dos circuitos protegidos (clicáveis) com a soma de corrente e o botão **"+ Circuito neste DR"**.

### 2.7 Painel lateral
- **Instalação**: nome, endereço, fases que chegam da rua (com um "Como descobrir?" explicando como identificar), disjuntor geral (corrente e polos) e se há DPS.
- **Carga por fase**: barra com a corrente **ligada agora** sobre o **pior caso** (tudo ligado), comparada com o geral, mais os alertas gerais.

### 2.8 Regras de validação (`src/core/calculos.ts`)
Por circuito:
- Ib > In → **erro** (vai desarmar). Ib > 90% de In → **aviso**.
- In > Iz → **erro** (o fio pode superaquecer sem o disjuntor desarmar).
- Bitola abaixo do mínimo (1,5 mm² iluminação, 2,5 mm² demais) → **erro**.
- Circuito precisa de mais fases do que o fornecimento tem → **erro**.
- 220 V entre fases com disjuntor de 1 polo → **erro**.
- Chuveiro/torneira sem DR → **erro**. Tomada sem DR → **aviso**.
- Motor/ar-condicionado com curva B → **aviso**.

Gerais:
- Soma de uma fase (pior caso) > geral → **erro**. Fases com diferença > 30% → **aviso**.
- Geral com menos polos que as fases do fornecimento → **erro**.
- DR sem circuitos → **aviso**. DR com corrente menor que a soma dos circuitos → **aviso**. DR bipolar alimentando circuito de 2+ fases → **erro**.
- Sem DPS → **aviso**.

### 2.9 Diagnóstico por sintoma
| Sintoma | O que o app considera |
|---|---|
| Disjuntor desarma com o uso | Se Ib > In: sobrecarga, dividir o circuito. Senão: aparelho não cadastrado, disjuntor fraco ou curto intermitente. |
| Desarma ao ligar o aparelho | Curto no aparelho ou corrente de partida (sugere curva C ou D). |
| O DR desarma | Fuga para a terra: umidade, resistência do chuveiro, isolamento, neutro misturado. Teste religando um circuito por vez. |
| Esquenta | Se In > Iz: fio fino demais. Senão: mau contato no borne. |
| Cheiro de queimado | Parar de usar e chamar eletricista. |
| Sem energia | Disjuntor no meio do curso, fase faltando, fio rompido, problema antes do quadro. |
| Luz piscando | Neutro frouxo (risco de sobretensão) ou mau contato. |

### 2.10 Arquivos e persistência
- **Salvar arquivo** baixa `<nome>.quadro` (JSON indentado). **Abrir .quadro** importa e valida.
- **Rascunho automático** no navegador (localStorage), 400 ms depois de cada mudança.
- Arquivos de versão antiga são **migrados** ao abrir.

---

## 3. Formato do arquivo `.quadro` (versão 2)

Exemplo resumido:

```json
{
  "app": "quadro-eletrico",
  "versao": 2,
  "nome": "Minha casa",
  "endereco": "",
  "fornecimento": "bi",
  "entrada": { "pos": { "x": 48, "y": 24 }, "faltando": [] },
  "geral": { "corrente": 50, "polos": 2, "ligado": true, "desarmado": false, "pos": { "x": 96, "y": 232 } },
  "dps": false,
  "drs": [
    { "id": "dr-1", "nome": "DR banheiro", "corrente": 40, "sensibilidade": 30, "polos": 4,
      "origem": "geral", "ligado": true, "desarmado": false, "pos": { "x": 24, "y": 520 } }
  ],
  "circuitos": [
    { "id": "c-1", "nome": "Chuveiro", "tipo": "chuveiro", "potencia": 6800, "tensao": 220,
      "disjuntor": { "corrente": 40, "polos": 2, "curva": "B" }, "bitola": 6, "fases": ["A", "B"],
      "origem": "dr-1", "sintoma": "nenhum", "notas": "", "ligado": true, "desarmado": false,
      "pos": { "x": 24, "y": 816 } }
  ],
  "atualizadoEm": "2026-11-10T18:00:00.000Z"
}
```

O que cada campo significa (JSON não aceita comentários, por isso a explicação vem aqui):

**Raiz**

| Campo | Tipo | Significado |
|---|---|---|
| `app` | `"quadro-eletrico"` | Assinatura. Arquivos sem ela são rejeitados. |
| `versao` | `2` | Versão do formato. `1` é migrada automaticamente. |
| `nome`, `endereco` | string | Identificação livre. |
| `fornecimento` | `"mono127"` \| `"mono220"` \| `"bi"` \| `"tri"` | Fases da rua: 1 fase 127 V, 1 fase 220 V, 2 fases 127/220 V, 3 fases 127/220 V. |
| `entrada.pos` | `{x,y}` | Posição da peça "Entrada da rua" no mapa (px, zoom 100%). |
| `entrada.faltando` | `("A"\|"B"\|"C")[]` | Fases cortadas na simulação de falta de fase. |
| `geral` | objeto | Disjuntor geral: `corrente` (A), `polos` (1–3), `ligado`, `desarmado`, `pos`. |
| `dps` | boolean | Existe DPS (protetor de surto) no quadro. |
| `drs` | array | DRs (ver abaixo). |
| `circuitos` | array | Disjuntores de circuito (ver abaixo). A ordem define a numeração #1, #2… |
| `atualizadoEm` | ISO 8601 | Data em que o arquivo foi salvo. |

**DR (`drs[]`)**

| Campo | Significado |
|---|---|
| `id` | Identificador único (UUID). |
| `nome` | Nome livre. |
| `corrente` | Corrente nominal em A (25, 40, 63, 80, 100). |
| `sensibilidade` | `30` ou `300` mA. |
| `polos` | `2` (fase + neutro) ou `4` (até 3 fases + neutro). |
| `origem` | De onde vem a energia. Hoje é sempre `"geral"`. |
| `ligado` / `desarmado` | Estado da alavanca. `desarmado: true` = caiu sozinho (TRIP). |
| `pos` | Posição no mapa. |

**Circuito (`circuitos[]`)**

| Campo | Significado |
|---|---|
| `id`, `nome` | Identificador único e nome livre. |
| `tipo` | `iluminacao`, `tomada`, `chuveiro`, `torneira`, `ar`, `forno`, `motor`, `outro`. |
| `potencia` | Soma das potências dos aparelhos do circuito, em W. |
| `tensao` | `127` ou `220` V. |
| `disjuntor.corrente` | Corrente nominal In em A. |
| `disjuntor.polos` | `1`, `2` ou `3`. |
| `disjuntor.curva` | `B` (resistivo), `C` (geral/motores pequenos), `D` (partida pesada). |
| `bitola` | Seção do fio de cobre em mm² (1.5, 2.5, 4, 6, 10, 16, 25, 35). |
| `fases` | Fases usadas: 1 para fase-neutro, 2 para 220 V entre fases, 3 para trifásico. |
| `origem` | `"geral"` ou o `id` de um DR. É a "ligação" desenhada no mapa. |
| `sintoma` | `nenhum`, `desarma`, `desarma_ao_ligar`, `dr_desarma`, `esquenta`, `cheiro`, `sem_energia`, `oscila`. |
| `notas` | Texto livre (o que tem ligado, medições, quando acontece). |
| `ligado` / `desarmado` / `pos` | Iguais aos do DR. |

**Fórmulas e tabelas usadas**
- Corrente do circuito: `Ib = P / V` (1 ou 2 polos). Para 3 polos: `Ib = P / (√3 × 220)`. Fator de potência considerado 1.
- Capacidade do fio (Iz): cobre, PVC 70 °C, método B1 (eletroduto embutido), NBR 5410 tabela 36, sem fatores de agrupamento ou temperatura.

| mm² | 1,5 | 2,5 | 4 | 6 | 10 | 16 | 25 | 35 |
|---|---|---|---|---|---|---|---|---|
| 2 condutores carregados (A) | 17,5 | 24 | 32 | 41 | 57 | 76 | 101 | 125 |
| 3 condutores carregados (A) | 15,5 | 21 | 28 | 36 | 50 | 68 | 89 | 110 |

- Corrente por fase: um circuito de 2 fases soma o seu Ib **em cada uma** das duas fases.

---

## 4. Arquitetura

Stack: **React 18 + TypeScript + Vite 5**, sem backend obrigatório. O código é dividido em camadas para trocar a hospedagem ou o armazenamento sem mexer na interface.

```
src/
  core/        Regras do domínio. TypeScript puro, sem DOM: roda no navegador ou num servidor Node.
    types.ts       Tipos do projeto (formato do arquivo).
    catalogo.ts    Catálogos: correntes, curvas, bitolas, tabela Iz, fornecimentos, tipos, sintomas, cores.
    calculos.ts    Corrente, validações, sugestão, diagnóstico, carga por fase.
    energia.ts     Simulação: energização e atuação das proteções.
    layout.ts      Geometria das peças, organização automática, posição livre.
    projeto.ts     Projeto vazio, serialização, validação e migração do arquivo.
  storage/     Onde o projeto é guardado.
    repositorio.ts Interface Repositorio { carregar(), salvar() }.
    local.ts       Implementação com localStorage (padrão).
    api.ts         Implementação HTTP (GET/PUT {VITE_API_URL}/projeto) para um servidor próprio futuro.
    arquivo.ts     Exportar/importar .quadro no navegador.
    index.ts       Escolhe a implementação conforme a config.
  ui/          React. Só conversa com core/ e storage/.
    useProjeto.ts  Estado do projeto e todas as ações (adicionar, mover, alternar, cortar fase…).
    App.tsx        Layout geral.
    components/    Mapa, Dispositivo (disjuntor), Entrada, editores, painel lateral, resumo.
    estilos.css    Estilos com tokens de cor (claro/escuro automático).
  config.ts    Lê variáveis de ambiente (VITE_ARMAZENAMENTO, VITE_API_URL).
```

Princípios:
- Toda regra elétrica fica em `core/`. A UI não faz conta, só chama funções.
- Toda mudança de estado passa por `useProjeto`. As manobras (ligar/desligar, cortar fase) passam por `aplicarProtecoes`.
- Mudar o formato do arquivo exige incrementar `VERSAO_FORMATO` e escrever uma migração em `core/projeto.ts`.

---

## 5. Como rodar

Requisito: Node.js (testado com v26 via nvm).

```bash
npm install          # baixa as dependências listadas no package.json
npm run dev          # servidor de desenvolvimento com recarga automática em http://localhost:5173
npm run build        # checa os tipos (tsc --noEmit) e gera a versão final em dist/
npm run preview      # serve a pasta dist/ localmente pra conferir a build
```

### Configuração (`.env`, ver `.env.example`)
| Variável | Valores | Efeito |
|---|---|---|
| `VITE_ARMAZENAMENTO` | `local` (padrão) \| `api` | Onde o rascunho automático é salvo. |
| `VITE_API_URL` | ex.: `/api` | Base da API quando `VITE_ARMAZENAMENTO=api`. |

### Deploy
- **Hospedagem estática** (Netlify, Vercel, Cloudflare Pages, GitHub Pages): rodar `npm run build` e publicar a pasta `dist/`.
- **Servidor próprio com Docker**:

```bash
# build = monta a imagem; -t quadro = dá o nome "quadro" pra imagem; o "." usa o Dockerfile da pasta atual
docker build -t quadro .
# run = sobe um container; -p 8080:80 = a porta 8080 do servidor aponta pra porta 80 do nginx dentro do container
docker run -p 8080:80 quadro
```

O `nginx.conf` já tem um bloco comentado `location /api/` para quando existir backend.

---

## 6. Limitações conhecidas
- A simulação é **binária** (tem ou não tem energia). Não calcula queda de tensão, curto-circuito, seletividade nem curvas de disparo por tempo.
- O fator de potência é considerado 1 e não há fator de demanda: o "pior caso" soma tudo ligado ao mesmo tempo.
- O DR desarma na simulação apenas pelo sintoma relatado ou pelo botão T. Fuga real não é calculada.
- A tabela de Iz é fixa (método B1, sem fatores de correção).
- As ligações são escolhidas no editor ("Sai de"), ainda não arrastando fios.
- DRs sempre saem do geral (não há DR em cascata nem sub-quadros).
- PWA (instalar e funcionar offline) ainda não configurado.

## 7. Ideias de evolução
- Criar e editar ligações arrastando fios entre bornes.
- Sub-quadros (quadro de distribuição alimentando outro quadro).
- Lista de aparelhos por circuito (somando a potência automaticamente) e fator de demanda.
- Queda de tensão por comprimento do circuito.
- Exportar PDF ou imagem do quadro para imprimir e colar na tampa.
- Manifesto PWA e service worker.
