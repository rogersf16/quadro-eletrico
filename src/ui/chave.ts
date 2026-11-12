import type { Projeto } from '../core/types';

// Chave que muda só quando a parte elétrica muda (não ao arrastar peças ou dobras de cabo).
// Usada pra memorizar simulações e validações, que são as contas mais pesadas.
export const chaveEletrica = (p: Projeto) =>
  JSON.stringify([p.fornecimento, p.dps, p.pecas.filter((x) => x.tipo !== 'quadro').map(({ pos: _pos, ...r }) => r), p.cabos.map(({ pontos: _p, rotaAuto: _r, ...r }) => r)]);
