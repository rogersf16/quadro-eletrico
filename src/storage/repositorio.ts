import type { Projeto } from '../core/types';

// Contrato de armazenamento. A UI só conhece isto; trocar de backend = nova implementação.
export interface Repositorio {
  carregar(): Promise<Projeto | null>;
  salvar(p: Projeto): Promise<void>;
}
