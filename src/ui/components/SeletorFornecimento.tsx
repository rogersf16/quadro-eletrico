import { FORNECIMENTOS } from '../../core/catalogo';
import type { Fornecimento } from '../../core/types';

interface Props {
  valor: Fornecimento;
  onChange: (f: Fornecimento) => void;
  compacto?: boolean;
}

// Botões lado a lado pra escolher quantas fases chegam da rua.
export function SeletorFornecimento({ valor, onChange, compacto }: Props) {
  return (
    <div className={`segmentado ${compacto ? 'compacto' : ''}`} role="radiogroup" aria-label="Fornecimento">
      {FORNECIMENTOS.map((f) => (
        <button
          key={f.valor}
          role="radio"
          aria-checked={valor === f.valor}
          className={valor === f.valor ? 'ativo' : ''}
          title={f.desc}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onChange(f.valor)}
        >
          {f.curto.split(' · ').map((parte, i) => (
            <span key={i} className="linha">{parte}</span>
          ))}
        </button>
      ))}
    </div>
  );
}
