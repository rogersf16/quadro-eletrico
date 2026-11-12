import type { Fornecimento, Projeto } from '../../core/types';
import { Campo } from './Campo';
import { SeletorFornecimento } from './SeletorFornecimento';

interface Props {
  projeto: Projeto;
  onChange: (m: Partial<Projeto>) => void;
}

export function PainelProjeto({ projeto: p, onChange }: Props) {
  return (
    <section className="painel">
      <h2>Instalação</h2>
      <Campo rotulo="Nome">
        <input value={p.nome} onChange={(e) => onChange({ nome: e.target.value })} />
      </Campo>
      <Campo rotulo="Endereço / observação">
        <input value={p.endereco} onChange={(e) => onChange({ endereco: e.target.value })} />
      </Campo>
      <div className="campo">
        <span className="campo-rotulo">Fases que chegam da rua</span>
        <SeletorFornecimento valor={p.fornecimento} onChange={(f: Fornecimento) => onChange({ fornecimento: f })} />
        <details className="como-descobrir">
          <summary>Como descobrir?</summary>
          <ul>
            <li><b>Disjuntor do padrão</b> (junto do medidor): 1 alavanca = 1 fase, 2 alavancas = 2 fases, 3 = 3 fases.</li>
            <li><b>Fios que chegam do poste</b>: 2 fios = 1 fase + neutro, 3 = 2 fases + neutro, 4 = 3 fases + neutro.</li>
            <li><b>Conta de luz</b>: vem escrito "monofásico", "bifásico" ou "trifásico".</li>
            <li>Na maior parte do Brasil, a tensão é 127 V entre fase e neutro e 220 V entre duas fases. Em alguns estados é 220 V fase-neutro: aí escolha "1 fase · 220V".</li>
          </ul>
        </details>
      </div>
      <label className="check">
        <input type="checkbox" checked={p.dps} onChange={(e) => onChange({ dps: e.target.checked })} />
        Tem DPS (protetor de surto) no quadro
      </label>
    </section>
  );
}
