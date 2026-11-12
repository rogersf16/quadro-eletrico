// Faísca rápida no borne quando um cabo é ligado com fase viva (e uma maior/vermelha se fechar curto).
// Só CSS (transform/opacity): os elementos existem ~0,5 s e depois somem do DOM.
import { ViewportPortal } from '@xyflow/react';
import type { CSSProperties } from 'react';

export interface Faisca {
  id: number;
  x: number; // coordenadas do mapa (não da tela)
  y: number;
  curto: boolean;
}

export function Faiscas({ lista }: { lista: Faisca[] }) {
  return (
    <ViewportPortal>
      {lista.map((f) => {
        const raios = f.curto ? 12 : 8;
        return (
          <div key={f.id} className={`faisca ${f.curto ? 'faisca-curto' : ''}`} style={{ transform: `translate(${f.x}px, ${f.y}px)` }} aria-hidden>
            <span className="faisca-clarao" />
            {Array.from({ length: raios }, (_, i) => (
              // Ângulo e alcance um pouco irregulares pra não parecer um asterisco perfeito.
              <span
                key={i}
                className="faisca-raio"
                style={{ '--a': `${(360 / raios) * i + ((i * 37) % 23) - 11}deg`, '--d': `${(f.curto ? 30 : 20) + ((i * 13) % 9)}px` } as CSSProperties}
              />
            ))}
          </div>
        );
      })}
    </ViewportPortal>
  );
}
