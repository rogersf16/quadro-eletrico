# Quadro Elétrico

Aplicação web para **montar, simular e diagnosticar um quadro de distribuição elétrica** no padrão brasileiro (NBR 5410, simplificada). Você monta a instalação como ela é de verdade: peças (entrada da rua, disjuntores, DRs, barramentos, cargas…) ligadas por **cabos de borne a borne**. Depois liga e desliga as peças, vê por onde a energia passa, quanto de corrente corre em cada cabo e quais proteções atuam. O app avisa sobre dimensionamento errado e dá dicas para diagnosticar defeitos reais. O projeto é salvo num arquivo `.quadro` (JSON), que pode ser reaberto ou enviado a um eletricista.

> **Aviso:** é uma ferramenta de apoio e estudo. As tabelas são simplificadas e a simulação é didática. Não substitui projeto elétrico nem avaliação de um profissional habilitado.

**Online:** publicado no GitHub Pages a cada `git push` na branch `main` (ver [Deploy](#deploy)).

---

## 1. Para quem e para quê

| Uso | Como a aplicação ajuda |
|---|---|
| Mapear o quadro | Desenhar cada peça e cada cabo como estão ligados, com bitola, cor e anotações de "gambiarra". |
| Conferir o dimensionamento | Valida carga ≤ disjuntor ≤ cabo, a corrente real em **cada trecho de cabo** (inclusive antes do geral), bitola mínima, DR em áreas molhadas e balanceamento de fases. |
| Diagnosticar defeito | Marca o sintoma do circuito (desarma, o DR cai, esquenta, pisca…) e recebe as causas prováveis, cruzadas com os dados cadastrados. |
| Simular | Ligar e desligar peças, cortar uma fase da rua, ligar um cabo energizado, fechar um curto, testar o DR e a transferência rua/gerador. |
| Compartilhar | Exportar e importar o arquivo `.quadro`. |

---

## 2. Funcionalidades

### 2.1 Mapa interativo
- Área de trabalho com zoom (roda do mouse ou botões +/−/ajustar) e minimapa. Cada peça é arrastada livremente e encaixa numa grade de 8 px. A posição no mapa **não precisa** ser a posição física: o que importa são as **ligações**.
- **Adicionar**: Quadro, Gerador, Disjuntor, DR, Medidor, Carga, Emenda, Barra N, Barra T. A peça nova nasce num **lugar livre** perto do centro da tela, sem ficar em cima de outra.
- **Ligar tudo / Desligar tudo**, **Organizar** (layout automático com o mínimo de cruzamentos de cabos, usando ELK) e **Expandir** (mapa na largura toda).
- **Mostrar**: filtros por condutor (fase, neutro, terra, retorno) e etiquetas de bitola em todos os cabos.
- **Seguir o fio**: passando o mouse num cabo, todo o cobre contínuo dele fica em destaque (atravessa emendas e barramentos, para nos disjuntores). Passando numa peça, os cabos dela ganham uma plaquinha com o polo e a fase.
- Clicar numa peça ou cabo abre o editor dele na coluna da direita. **Delete** apaga o que estiver selecionado.

### 2.2 Peças

| Peça | Visual | Interações |
|---|---|---|
| **Entrada da rua** (padrão) | Caixa escura com seletor de fornecimento e bornes A/B/C/N/T | Escolher 1 fase 127 V, 1 fase 220 V, 2 fases ou 3 fases. **Clicar em A, B ou C corta ou religa a fase** (simula falta de fase da concessionária). |
| **Disjuntor** | DIN com rótulo `C20`, `B32`…, 1P/2P/3P | Alavanca liga/desliga/rearma. Janela vermelha "I ON", verde "O OFF" ou laranja piscando "TRIP". LED de status do dimensionamento e "!" se houver sintoma. Pode ser marcado como **geral** ou como **transferência manual** (ver 2.3). |
| **DR** | DIN azulado, botão **T** amarelo | 2P (fase + N) ou 4P (3 fases + N), 30 ou 300 mA. **T** simula o botão de teste. |
| **Gerador** | Carcaça amarela com botão ON/OFF, barra de uso e bornes L1/L2/L3/N/T | Segunda fonte de energia. Ligação (1 fase 127 V, 1 fase 220 V, 2 ou 3 fases) e potência (kVA). Botão dá partida/desliga; mostra a potência entregue e a % da capacidade. Desarma sozinho em sobrecarga ou curto (ver 2.4). |
| **Medidor de energia** (multimedidor DIN) | Corpo escuro com display LCD verde | Sem alavanca: sempre passa energia. Mostra tensão e corrente de cada fase e a potência do que está ligado depois dele (ex.: o CPD). "!" se passar do limite de medição. **Não protege nada.** |
| **Barramento** (neutro ou terra) | Barra de latão com faixa azul ou verde | Todos os furos são o mesmo ponto elétrico. Quantidade de bornes ajustável. **Horizontal** (furos embaixo) ou **vertical** (furos à direita ou à esquerda). |
| **Emenda** | Pequeno "⨯" | Une todos os cabos ligados nela (cobre com cobre). |
| **Carga** | Cartão com ícone do tipo | Tipo (iluminação, tomada, chuveiro, torneira, ar, forno, motor, outro), potência e tensão. Mostra se funciona e por quê ("sem neutro", "só uma fase chegando"…). |
| **Quadro** (caixa) | Retângulo translúcido com título | Agrupa peças visualmente (ex.: "Quadro quarto"). Nome e cor editáveis, redimensiona pelos cantos. Arrastar pelo título leva junto o que está dentro. Não entra na simulação. |

Os bornes brilham conforme o potencial que chega neles (fase, neutro, terra).

### 2.3 Disjuntor de transferência manual
Opção **"Transferência manual"** no editor de qualquer disjuntor (1P, 2P ou 3P). Ele vira **dois disjuntores lado a lado com intertravamento**:
- **Lado I** (ex.: rua) à esquerda e **lado II** (ex.: gerador) à direita, **cada um com entrada em cima e saída embaixo**. Um bipolar tem 8 bornes.
- Cada lado tem a sua alavanca. Só um pode ficar ligado. **Se os dois forem ligados, os dois desarmam.**
- Funciona como disjuntor normal em sobrecarga e curto. "Ligar tudo" liga só o lado I.

### 2.4 Gerador (segunda fonte)
- As fases do gerador aparecem como **G1, G2, G3** e **não são sincronizadas** com as da rua (A, B, C). Se rua e gerador se encontram no mesmo ponto (**paralelo**), é curto: cai o primeiro disjuntor no caminho ou o disjuntor do próprio gerador, com a mensagem explicando o paralelo.
- **Rua e gerador no mesmo disjuntor comum** (ex.: rua no polo 1 e gerador no polo 2 de um bipolar, ou de um DR): o disjuntor **desarma na hora** e não fica ligado enquanto a ligação continuar. O aviso explica os riscos reais: fio derretendo, arco elétrico/explosão no disjuntor, gerador queimado e choque em quem trabalha na rede. No paralelo, cai o disjuntor que está **no caminho entre as duas fontes**.
- **Na tomada/carga**: faixa **vermelha piscando em cima da carga** quando ela recebe **rua e gerador juntos** (em qualquer borne, mesmo com o gerador parado) ou quando a fase chega **sem passar por nenhum disjuntor** (direto da entrada ou do gerador). O cartão fica com borda vermelha e o editor e as validações mostram o erro com os riscos. Sem disjuntor no caminho, o paralelo derruba o próprio gerador.
- Se o gerador estiver parado, a ligação perigosa já gera um aviso na hora de ligar o cabo (fica na tela até ser desfeita) e um erro nas validações.
- Ligação certa: fases da rua no **lado I** e fases do gerador no **lado II** de um disjuntor de transferência, saídas I e II unidas. O neutro pode ser comum (barramento N); a carcaça (T) vai no barramento terra.
- **Sobrecarga**: se as cargas alimentadas passam da potência nominal (ou uma fase passa de `potência ÷ fases ÷ tensão F-N`), o gerador desarma.
- **Tensão errada**: gerador 220 V F-N num aparelho de 127 V queima (a carga mostra "queima!"); 127 V num aparelho de 220 V não funciona. Carga 220 V com uma ponta na rua e outra no gerador não funciona.
- **Retorno pra rua**: num apagão (fase cortada), se a energia do gerador chegar nos bornes da entrada aparece um aviso de perigo: ela volta pela rede da concessionária.
- **Validações**: paralelo rua × gerador (com tudo ligado), retorno pra rua num apagão, gerador menor que as cargas que ele alimenta e gerador sem nada ligado.

### 2.5 Cabos
- **Criar**: arrastar de um borne até outro. O tipo do condutor (fase, neutro, terra) e a cor vêm do borne. Cabos que saem da entrada pegam a cor da fase (A vermelho, B preto, C cinza).
- **Editor do cabo**: bitola (1,5 a 35 mm²), função (fase, neutro, terra, retorno), cor da capa, marcação **"fora do padrão"** (gambiarra), notas, corrente passando agora × capacidade, botões Endireitar, Inverter e Remover.
- **Caminho**: com o cabo selecionado, arrastar os **+** cria dobras. Duplo clique numa dobra a remove.
- **Energizado**: fluxo laranja animado.
- **Bitola insuficiente**: quando a corrente passa da capacidade do cabo, o fluxo fica **"desgovernado"** (tracejados amarelo e laranja indo e voltando aos trancos), o cabo pulsa em vermelho e mostra a etiqueta `⚠ 47 A / 41 A`.
- **Faísca**: ligar um cabo num ponto com fase viva solta uma faísca no borne. Se a ligação fechar um curto, a faísca é maior e vermelha.

### 2.6 Simulação
A instalação é um **grafo**: cada borne é um ponto, e cabos, emendas, barramentos e contatos fechados (disjuntor ligado, DR ligado, medidor, lado ativo da transferência) unem pontos (union-find em `core/rede.ts`). Os potenciais (fases, neutro, terra) partem da entrada da rua.

- **Cargas** funcionam se recebem o que precisam: fase + neutro (127/220 V F-N) ou duas fases diferentes (220 V F-F em bi/trifásico).
- **Corrente** de cada disjuntor/DR: soma das cargas funcionando abaixo dele (pior polo).
- **Corrente em cada cabo**: o cabo é retirado da rede e somam-se as cargas que perdem a fase (ou o neutro). Assim vale para qualquer trecho, do padrão até a tomada. No neutro, as correntes de fases diferentes se compensam (defasagem de 120°).

Depois de cada mudança, as **proteções** atuam até estabilizar (`aplicarProtecoes`):
1. **Intertravamento**: os dois lados da transferência ligados → os dois desarmam.
2. **Curto** (duas fases, ou fase com neutro/terra no mesmo ponto): cai o primeiro disjuntor do caminho (circuito antes do geral).
3. **Sobrecarga**: corrente > nominal → desarma (circuitos antes do geral).
4. **DR**: desarma se fase e neutro de alguma carga não passam os dois por ele (neutro misturado) ou se há o sintoma "O DR desarma" num circuito abaixo.

### 2.7 Avisos
- Cada desarme, curto, falta de fase ou cabo que passou a ficar sobrecarregado gera um aviso na faixa amarela acima do mapa.
- **O aviso sai sozinho quando o problema é resolvido** (rearmou, religou a fase, engrossou o cabo, desfez o curto). Avisos informativos somem em 6 segundos. Um aviso novo sobre o mesmo problema substitui o anterior.

### 2.8 Validações
**Por disjuntor**: carga > disjuntor (erro) ou acima de 90% (aviso); disjuntor maior que o cabo mais fino depois dele (erro); bitola abaixo do mínimo (1,5 mm² iluminação, 2,5 mm² demais); neutro mais fino que a fase; motor/ar com curva B; geral com menos polos que as fases; transferência com entrada ou saída sem ligar.

**Por carga**: não funciona nem com tudo ligado (erro); área molhada sem DR (erro); tomada sem DR (aviso); 220 V F-F vindo de dois disjuntores diferentes (aviso); sem terra em tomada, chuveiro, ar ou forno (aviso).

**Gerais** (painel "Carga por fase"): curto com tudo ligado; neutro unido ao terra fora do padrão; fase acima do geral; fases desbalanceadas > 30%; DR sem carga ou acima da corrente nominal; **qualquer cabo com corrente acima da capacidade** (com a bitola mínima sugerida); emendas; cabos fora do padrão; falta de DPS.

### 2.9 Editor do disjuntor
Corrente (2 a 125 A), polos, curva, geral, transferência manual; números **Ib** (carga), **In** (disjuntor) e **Iz** (cabo) com a regra "carga ≤ disjuntor ≤ cabo"; **sugestão** de disjuntor e bitola com botão **Aplicar**; cargas alimentadas; alertas; **diagnóstico por sintoma**; notas.

| Sintoma | O que o app considera |
|---|---|
| Desarma com o uso | Se Ib > In: sobrecarga, dividir o circuito. Senão: aparelho não cadastrado, disjuntor fraco ou curto intermitente. |
| Desarma ao ligar o aparelho | Curto no aparelho ou corrente de partida (curva C ou D). |
| O DR desarma | Fuga para a terra: umidade, resistência do chuveiro, isolamento, neutro misturado. |
| Esquenta | Se In > Iz: cabo fino demais. Senão: mau contato no borne. |
| Cheiro de queimado | Parar de usar e chamar eletricista. |
| Sem energia | Disjuntor no meio do curso, fase faltando, fio rompido, problema antes do quadro. |
| Luz piscando | Neutro frouxo (risco de sobretensão) ou mau contato. |

### 2.10 Arquivos e persistência
- **Salvar arquivo** baixa `<nome>.quadro`. **Abrir .quadro** importa, valida e **migra** arquivos de versões anteriores (1, 2 e as versões de teste da transferência).
- **Rascunho automático** no navegador (localStorage), 400 ms depois de cada mudança.

---

## 3. Formato do arquivo `.quadro` (versão 3)

```json
{
  "app": "quadro-eletrico",
  "versao": 3,
  "nome": "Minha casa",
  "endereco": "",
  "fornecimento": "bi",
  "dps": false,
  "pecas": [
    { "id": "entrada", "tipo": "entrada", "nome": "Entrada da rua", "notas": "", "pos": { "x": 40, "y": 24 }, "faltando": [] },
    { "id": "geral", "tipo": "disjuntor", "nome": "Disjuntor geral", "notas": "", "pos": { "x": 88, "y": 232 },
      "geral": true, "corrente": 50, "polos": 2, "curva": "C", "sintoma": "nenhum", "ligado": true, "desarmado": false }
  ],
  "cabos": [
    { "id": "c1", "de": { "peca": "entrada", "borne": "A" }, "para": { "peca": "geral", "borne": "in:1" },
      "condutor": "fase", "cor": "#d0302a", "bitola": 10, "pontos": [], "foraDoPadrao": false, "notas": "" }
  ],
  "atualizadoEm": "2026-11-12T18:00:00.000Z"
}
```

**Raiz**: `app` (assinatura), `versao` (3), `nome`, `endereco`, `fornecimento` (`mono127` \| `mono220` \| `bi` \| `tri`), `dps`, `pecas[]`, `cabos[]`, `atualizadoEm`.

**Campos comuns de toda peça**: `id`, `tipo`, `nome`, `notas`, `pos` `{x, y}`.

| `tipo` | Campos próprios |
|---|---|
| `entrada` | `faltando`: fases cortadas (`"A"`, `"B"`, `"C"`). |
| `disjuntor` | `geral`, `corrente` (A), `polos` (1–3), `curva` (B/C/D), `sintoma`, `ligado`, `desarmado`. Transferência: `transferencia: true` e `II: { ligado, desarmado }` (o lado I usa `ligado`/`desarmado` da raiz). |
| `dr` | `corrente`, `sensibilidade` (30/300), `polos` (2/4), `ligado`, `desarmado`. |
| `medidor` | `polos` (2/4), `correnteMax` (A). |
| `barramento` | `condutor` (`neutro`/`terra`), `bornes`, `orientacao` (`horizontal` \| `vertical-dir` \| `vertical-esq`, opcional). |
| `emenda` | — |
| `carga` | `tipoCarga`, `potencia` (W), `tensao` (127/220). |
| `gerador` | `ligacao` (`mono127`/`mono220`/`bi`/`tri`), `potencia` (VA), `ligado`, `desarmado`. Bornes `L1`…`L3`, `N`, `T`. |
| `quadro` | `w`, `h` (px), `cor` (hex). |

**Bornes** (usados em `cabos[].de/para.borne`):

| Peça | Bornes |
|---|---|
| Entrada | `A`, `B`, `C` (conforme o fornecimento), `N`, `T` |
| Disjuntor | `in:1…n` (em cima) e `out:1…n` (embaixo). Transferência: lado II em `inII:k` e `outII:k`. |
| DR / Medidor | `in:1`, `in:N` … e `out:1`, `out:N` … (4P: 1, 2, 3, N) |
| Barramento | `b:1…n` |
| Emenda | `e:t`, `e:b`, `e:l`, `e:r` |
| Carga | `L1` + `N` (fase-neutro) ou `L1` + `L2` (220 V entre fases), e `T` |

**Cabo**: `de`/`para` (`{peca, borne}`), `condutor` (`fase`/`neutro`/`terra`/`retorno`), `cor`, `bitola` (mm²), `pontos` (dobras), `rotaAuto` (dobras do Organizar), `foraDoPadrao`, `notas`.

**Tabela de capacidade dos cabos (Iz)**: cobre, PVC 70 °C, método B1 (eletroduto embutido), NBR 5410 tabela 36, sem fatores de agrupamento ou temperatura.

| mm² | 1,5 | 2,5 | 4 | 6 | 10 | 16 | 25 | 35 |
|---|---|---|---|---|---|---|---|---|
| 2 condutores carregados (A) | 17,5 | 24 | 32 | 41 | 57 | 76 | 101 | 125 |
| 3 condutores carregados (A) | 15,5 | 21 | 28 | 36 | 50 | 68 | 89 | 110 |

---

## 4. Arquitetura

Stack: **React 18 + TypeScript + Vite 5 + React Flow (@xyflow/react) + ELK (elkjs)**, sem backend obrigatório.

```
src/
  core/          Regras do domínio. TypeScript puro, sem DOM.
    types.ts       Tipos do projeto (formato do arquivo).
    catalogo.ts    Correntes, curvas, bitolas, tabela Iz, fornecimentos, tipos de carga, sintomas, cores.
    rede.ts        Bornes de cada peça e a rede elétrica (union-find): quem está no mesmo ponto.
    simulacao.ts   Cargas, correntes, curtos, proteções, medidores e corrente em cada cabo.
    validacao.ts   Alertas de dimensionamento, sugestão e diagnóstico por sintoma.
    layout.ts      Tamanho das peças e organização simples em camadas.
    layoutAuto.ts  Organização automática com ELK (carregado só quando usado).
    migracao.ts    Conversão de arquivos versão 1 e 2 para a 3.
    projeto.ts     Fábricas de peças, projeto vazio, serialização e leitura do arquivo.
    testes/        Testes Vitest do núcleo (*.test.ts) e montar.ts, que monta circuitos de exemplo.
  storage/       Onde o projeto é guardado (localStorage, API HTTP ou arquivo).
  ui/            React. Só conversa com core/ e storage/.
    useProjeto.ts  Estado do projeto, todas as ações e os avisos.
    chave.ts       Chave "elétrica" do projeto (evita recalcular ao só arrastar peças).
    App.tsx        Layout geral.
    components/    Cabeçalho, painel do projeto, resumo de carga, campos.
    editores/      Editores de disjuntor, cabo e demais peças.
    mapa/          Mapa (React Flow), nós das peças, cabos, faíscas, "seguir o fio".
    estilos.css    Estilos com tokens de cor (claro/escuro automático).
  config.ts      Lê as variáveis de ambiente.
```

Princípios:
- Toda regra elétrica fica em `core/`. A UI não faz conta, só chama funções.
- Toda mudança de estado passa por `useProjeto`. Mudanças elétricas passam por `aplicarProtecoes`.
- Mudar o formato do arquivo exige incrementar `VERSAO_FORMATO` e escrever a migração.
- Mudou uma regra elétrica? Rode `npm test`. Achou um bug? Escreva primeiro um teste que reproduz o bug e só depois corrija.

---

## 5. Como rodar

Requisito: Node.js (testado com v26).

```bash
npm install          # baixa as dependências listadas no package.json
npm run dev          # servidor de desenvolvimento com recarga automática em http://localhost:5173
npm run build        # checa os tipos (tsc --noEmit) e gera a versão final em dist/
npm run preview      # serve a pasta dist/ localmente pra conferir a build
npm test             # roda os testes automáticos (Vitest) uma vez
npm run test:watch   # roda os testes de novo a cada arquivo salvo
```

### Configuração (`.env`, ver `.env.example`)
| Variável | Valores | Efeito |
|---|---|---|
| `VITE_ARMAZENAMENTO` | `local` (padrão) \| `api` | Onde o rascunho automático é salvo. |
| `VITE_API_URL` | ex.: `/api` | Base da API quando `VITE_ARMAZENAMENTO=api`. |

### Deploy
- **GitHub Pages (atual)**: o workflow `.github/workflows/deploy.yml` roda `npm ci`, `npm test` e `npm run build` e publica `dist/` a cada push na `main`. O andamento aparece na aba **Actions**. Se algum teste ou o build falhar, o site continua na versão anterior. O `vite.config.ts` usa `base: './'`, então funciona com qualquer nome de repositório.
- **Outra hospedagem estática** (Netlify, Vercel, Cloudflare Pages): `npm run build` e publicar `dist/`.
- **Servidor próprio com Docker**:

```bash
# build = monta a imagem; -t quadro = dá o nome "quadro" pra imagem; o "." usa o Dockerfile da pasta atual
docker build -t quadro .
# run = sobe um container; -p 8080:80 = a porta 8080 do servidor aponta pra porta 80 do nginx dentro do container
docker run -p 8080:80 quadro
```

---

## 6. Limitações conhecidas
- Gerador sem partida/transferência automática (ATS), sem sincronismo nem tempo de partida. O neutro e o terra do gerador não são verificados (aterramento da carcaça é só um borne T).
- Sem queda de tensão, seletividade nem curvas de disparo por tempo. O fator de potência é 1 e não há fator de demanda: o "pior caso" soma tudo ligado.
- Capacidade dos cabos com tabela fixa (método B1, 2 condutores carregados).
- Cabos em paralelo (anel) não dividem a corrente no cálculo por cabo.
- O DR desarma por neutro misturado, sintoma relatado ou botão T. Fuga real para a terra não é calculada.
- Os testes cobrem só o núcleo (`src/core`): rede, simulação, proteções, validações e arquivo. A interface não tem teste automático. PWA (instalar e funcionar offline) não configurado.

## 7. Ideias de evolução
- Transferência automática (ATS) para o gerador e quadro de cargas essenciais.
- Relatório em PDF do quadro para o eletricista ou para colar na tampa.
- Compartilhar o projeto por link.
- Lista de aparelhos por carga e fator de demanda.
- Queda de tensão pelo comprimento do cabo.
- Manifesto PWA e service worker.
