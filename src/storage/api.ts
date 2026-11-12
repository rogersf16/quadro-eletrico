import { desserializar, serializar } from '../core/projeto';
import type { Repositorio } from './repositorio';

// Implementação pra quando existir um servidor próprio.
// Espera: GET {base}/projeto -> JSON do projeto (404 se não houver) | PUT {base}/projeto com o JSON.
export function criarRepositorioApi(base: string): Repositorio {
  return {
    async carregar() {
      const r = await fetch(`${base}/projeto`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`Erro ao carregar do servidor (${r.status})`);
      return desserializar(await r.text());
    },
    async salvar(p) {
      const r = await fetch(`${base}/projeto`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: serializar(p),
      });
      if (!r.ok) throw new Error(`Erro ao salvar no servidor (${r.status})`);
    },
  };
}
