import { fasesDoFornecimento } from '../../core/catalogo';
import { simular, simularPiorCaso } from '../../core/simulacao';
import type { PecaDisjuntor, Projeto } from '../../core/types';
import { validarProjeto } from '../../core/validacao';
import { useMemo } from 'react';
import { chaveEletrica } from '../chave';

export function Resumo({ projeto, onMostrar }: { projeto: Projeto; onMostrar?: (pecas: string[]) => void }) {
  const chave = chaveEletrica(projeto);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { agora, pior, alertas } = useMemo(
    () => ({ agora: simular(projeto).correntePorFase, pior: simularPiorCaso(projeto).correntePorFase, alertas: validarProjeto(projeto) }),
    [chave],
  );
  const geral = projeto.pecas.find((x): x is PecaDisjuntor => x.tipo === 'disjuntor' && x.geral)?.corrente ?? 0;
  const ref = geral || Math.max(1, ...Object.values(pior));

  return (
    <section className="painel">
      <h2>Carga por fase</h2>
      <p className="campo-dica">Barra cheia = o que está funcionando agora. Clara = pior caso (tudo ligado junto).</p>
      {fasesDoFornecimento(projeto.fornecimento).map((f) => {
        const nivel = agora[f] > ref ? 'erro' : agora[f] > ref * 0.8 ? 'aviso' : 'ok';
        return (
          <div key={f} className="barra-fase">
            <div className="barra-rotulo">
              <span>Fase {f}</span>
              <span className="num" title="Agora · máximo com tudo ligado / disjuntor geral">
                {agora[f].toFixed(1).replace('.', ',')} A · máx {pior[f].toFixed(1).replace('.', ',')}{geral ? ` / ${geral} A` : ' A'}
              </span>
            </div>
            <div className="barra-trilho">
              <div className="barra-max" style={{ width: `${Math.min(100, (pior[f] / ref) * 100)}%` }} />
              <div className={`barra-valor nivel-${nivel}`} style={{ width: `${Math.min(100, (agora[f] / ref) * 100)}%` }} />
            </div>
          </div>
        );
      })}
      {alertas.length > 0 && (
        <ul className="alertas">
          {alertas.map((a, i) =>
            a.pecas?.length && onMostrar ? (
              <li key={i} className={`alerta alerta-${a.nivel} alerta-acao`}>
                <button onClick={() => onMostrar(a.pecas!)} title="Mostrar no mapa">
                  {a.msg} <u>Mostrar no mapa</u>
                </button>
              </li>
            ) : (
              <li key={i} className={`alerta alerta-${a.nivel}`}>{a.msg}</li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
