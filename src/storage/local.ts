import { desserializar, serializar } from '../core/projeto';
import type { Repositorio } from './repositorio';

const CHAVE = 'quadro-eletrico:rascunho';

// Rascunho no localStorage do navegador. Pode falhar (aba privada etc.), por isso os try/catch.
export const repositorioLocal: Repositorio = {
  async carregar() {
    try {
      const t = localStorage.getItem(CHAVE);
      return t ? desserializar(t) : null;
    } catch {
      return null;
    }
  },
  async salvar(p) {
    try {
      localStorage.setItem(CHAVE, serializar(p));
    } catch {
      /* sem armazenamento disponível: segue sem rascunho */
    }
  },
};
