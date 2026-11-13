import { useCallback, useState } from 'react';
import { exportarArquivo, importarArquivo } from '../storage';
import { Cabecalho } from './components/Cabecalho';
import { PainelProjeto } from './components/PainelProjeto';
import { Resumo } from './components/Resumo';
import { EditorSelecao } from './editores/EditorSelecao';
import type { Selecao } from './mapa/contexto';
import { Mapa } from './mapa/Mapa';
import { useProjeto } from './useProjeto';

export function App() {
  const acoes = useProjeto();
  const { projeto } = acoes;
  const [selecao, setSelecao] = useState<Selecao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [expandido, setExpandido] = useState(false);
  const [pedidoFoco, setPedidoFoco] = useState<{ pecas: string[]; n: number } | null>(null);
  const mostrar = useCallback((pecas: string[]) => setPedidoFoco((x) => ({ pecas, n: (x?.n ?? 0) + 1 })), []);
  const selecionar = useCallback((s: Selecao | null) => setSelecao(s), []);

  // Editor só aparece se o item selecionado ainda existe.
  const existe =
    selecao &&
    (selecao.tipo === 'cabo' ? projeto.cabos.some((c) => c.id === selecao.id) : projeto.pecas.some((x) => x.id === selecao.id));

  return (
    <div className="app">
      <Cabecalho
        nome={projeto.nome}
        onNovo={() => {
          if (confirm('Começar um quadro novo? O atual some (salve o arquivo antes se quiser guardar).')) {
            acoes.novo();
            setSelecao(null);
          }
        }}
        onSalvar={() => exportarArquivo(projeto)}
        onAbrir={async (f) => {
          try {
            acoes.substituir(await importarArquivo(f));
            setSelecao(null);
            setErro(null);
          } catch (e) {
            setErro((e as Error).message);
          }
        }}
      />
      {erro && (
        <div className="banner-erro" role="alert">
          {erro} <button onClick={() => setErro(null)}>Fechar</button>
        </div>
      )}

      <main className={`layout ${expandido ? 'expandido' : ''} ${existe ? 'com-editor' : ''}`}>
        <aside className="lateral">
          <PainelProjeto projeto={projeto} onChange={acoes.atualizarProjeto} />
          <Resumo projeto={projeto} onMostrar={mostrar} />
        </aside>
        <div className="principal">
          <Mapa
            acoes={acoes}
            selecao={selecao}
            onSelecionar={selecionar}
            expandido={expandido}
            onExpandir={() => setExpandido((x) => !x)}
            pedidoFoco={pedidoFoco}
          />
        </div>
        {existe && (
          <aside className="editor-lateral">
            <EditorSelecao selecao={selecao} projeto={projeto} acoes={acoes} onSelecionar={selecionar} />
          </aside>
        )}
      </main>
      <footer className="rodape">
        Ferramenta de apoio, com tabelas simplificadas da NBR 5410. A simulação é didática e não substitui projeto
        nem avaliação de eletricista. Sempre desligue o disjuntor geral antes de mexer no quadro.
      </footer>
    </div>
  );
}
