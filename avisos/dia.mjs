/* Cronograma — o resumo do dia por Web Push.

   QUATRO MOMENTOS, e cada um diz uma coisa diferente:
     manha  06:30  o dia inteiro: âncoras, prioridades, rotinas
     tarde  13:00  o que ainda está aberto
     noite  19:00  o que ainda dá para fazer hoje
     fim    23:00  o que ficou sem marca, e o que amanhã pede

   O AVISO NÃO TEM REGRA PRÓPRIA. Ele carrega o código do aplicativo — os
   mesmos arquivos, na mesma ordem do index.html — num contexto do `vm`, e
   pergunta a ele: `prioridadesDoDia()`, `estagioDoTrilho()`,
   `acaoDoDiaDoProcesso()`. É a técnica do scripts/teste_hoje.js. Uma segunda
   implementação das regras do Hoje divergiria no primeiro ajuste do motor, e o
   telefone passaria a dizer uma coisa e a tela outra.

   AS LINHAS DO cron_estado ENTRAM PELA PORTA DO APLICATIVO: `SYNC.aplicarRemoto`,
   a mesma que o iPhone usa ao receber. Relógio, lápide e aplicadores são os
   dele. Nada aqui interpreta o formato de um domínio. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const MOMENTOS = [
  { id: 'manha', hora: '06:30' },
  { id: 'tarde', hora: '13:00' },
  { id: 'noite', hora: '19:00' },
  { id: 'fim',   hora: '23:00' }
];
/* A JANELA DE CADA MOMENTO. O pg_cron dispara dois minutos antes, e o job
   leva perto de um minuto para subir; a folga de 15 minutos antes cobre isso.
   Os 90 minutos depois cobrem um atraso do GitHub, e nada além: o resumo da
   manhã chegando à tarde é pior do que não chegar. */
export const ANTES_MIN = 15;
export const DEPOIS_MIN = 90;
/* Um resumo de 06:30 não serve às 09:00. O push service descarta depois disto. */
export const TTL_DIA = 2 * 3600;

/* Os domínios que o Hoje lê. Triagem, meta e evento ficam de fora: o resumo
   do dia não fala deles, e as datas têm o aviso próprio. */
export const DOMINIOS_DO_DIA = ['item', 'toefl', 'retomada', 'dispensa', 'rotina', 'prioridade'];

function minutos(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }

/* Qual momento está na hora, pelo relógio LOCAL do processo — que o
   notificador fixa em America/Sao_Paulo antes de qualquer Date. */
export function momentoDaHora(agora) {
  const m = agora.getHours() * 60 + agora.getMinutes();
  for (const mo of MOMENTOS) {
    const alvo = minutos(mo.hora);
    if (m >= alvo - ANTES_MIN && m < alvo + DEPOIS_MIN) return mo.id;
  }
  return null;
}

/* ---------- o aplicativo, sem navegador ---------- */
function noFalso() {
  return {
    innerHTML: '', hidden: false, value: '', open: false, textContent: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, removeAttribute() {}, setAttribute() {},
    addEventListener() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, focus() {}, blur() {}, remove() {}
  };
}

/* O RELÓGIO DO CONTEXTO. O aplicativo lê `new Date()` uma vez, no topo do
   10-nucleo.js, e tudo o que é "hoje" sai dali. Para montar o resumo de amanhã
   basta outro contexto com outro instante. */
function relogio(instante) {
  const Real = Date;
  return class extends Real {
    constructor(...a) { if (a.length === 0) super(instante); else super(...a); }
    static now() { return instante; }
  };
}

export function fonteDoApp(raiz) {
  const html = fs.readFileSync(path.join(raiz, 'Cronograma', 'index.html'), 'utf8');
  const srcs = (html.match(/<script[^>]*\ssrc="[^"]+"[^>]*><\/script>/g) || [])
    .map((t) => t.match(/src="([^"]+)"/)[1].split('?')[0]);
  if (!srcs.length) throw new Error('index.html sem <script src>: o aplicativo mudou de forma');
  const codigo = srcs.map((s) => fs.readFileSync(path.join(raiz, 'Cronograma', s), 'utf8')).join('\n');
  /* `const` no topo de um script do vm não vira propriedade do contexto. */
  return codigo + '\n;globalThis.__const = {DIAS, now, todayIdx, dateKey, ymd};';
}

/* `linhas` são as do cron_estado, na ordem de servidor_em, como o delta do
   aplicativo as entrega. `entrada` é o texto do Cronograma/entrada.json. */
export function carregarApp({ fonte, entrada, linhas, instante }) {
  const armazem = { 'cron:aparelho': JSON.stringify('avisos') };
  if (entrada) armazem['cron:entrada'] = entrada;
  const localStorage = {
    getItem: (k) => (k in armazem ? armazem[k] : null),
    setItem: (k, v) => { armazem[k] = String(v); },
    removeItem: (k) => { delete armazem[k]; },
    clear: () => { for (const k of Object.keys(armazem)) delete armazem[k]; }
  };
  const nos = {};
  const document = {
    getElementById: (id) => (nos[id] = nos[id] || noFalso()),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, createElement: () => noFalso(),
    body: noFalso(), documentElement: noFalso(), visibilityState: 'hidden'
  };
  const ctx = {
    localStorage, document, console: { log() {}, warn() {}, error() {}, info() {} },
    window: { addEventListener() {}, location: { href: '', pathname: '/', reload() {} } },
    navigator: { userAgent: 'avisos', onLine: false },
    location: { href: '', pathname: '/', reload() {}, replace() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    /* SEM REDE. O boot do aplicativo pede entrada.json e versão, e as duas
       caem no catch dele. A estrutura já veio pelo armazem, acima. */
    fetch: () => Promise.reject(new Error('sem rede no notificador')),
    alert() {}, confirm: () => false, prompt: () => null,
    Date: relogio(instante)
  };
  ctx.window.localStorage = localStorage;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fonte, ctx, { filename: 'Cronograma/js (avisos)' });
  Object.assign(ctx, ctx.__const || {});
  (linhas || []).forEach((l) => { ctx.SYNC.aplicarRemoto(l); });
  return ctx;
}

/* ---------- o que o Hoje mostra, em dado ---------- */
export function resumoDoDia(app) {
  const d = app.DIAS[app.todayIdx];
  const checks = app.LS('cron:checks:' + app.dateKey, {}) || {};
  const pr = app.prioridadesDoDia();

  const prioridades = pr.manuais.map((p) => {
    if (p.tipo === 'trilho') {
      const et = app.estagioDoTrilho(p.painel, p.projId);
      const nome = p.t || (et && et.projT) || p.projId;
      if (!et) return { nome, etapa: '', aberta: false };
      if (et.concluido) return { nome, etapa: 'trilho concluído', aberta: false };
      return { nome, etapa: et.subT, aberta: true, estrela: et.prova === 'estrela' };
    }
    const feita = !!p.feito_em && p.feito_em === app.dateKey;
    return { nome: p.t || '', etapa: '', aberta: !feita, feita };
  }).filter((p) => p.nome);

  const sugeridas = pr.sugeridas.map((sg) => {
    const et = app.estagioDoTrilho(sg.painel, sg.projId);
    if (!et || et.concluido) return null;
    return { nome: sg.projT || sg.projId, etapa: et.subT, motivo: sg.motivo };
  }).filter(Boolean);

  const rotinas = [];
  d.tasks.forEach((t) => {
    let titulo = t.t;
    if (t.processo) {
      const ac = app.acaoDoDiaDoProcesso(t.processo);
      if (!ac) return;                  /* o processo não pede nada neste dia */
      titulo = ac.t;
    }
    rotinas.push({ id: t.id, titulo, feita: !!checks[t.id] });
  });

  return {
    data: app.dateKey, dia: app.todayIdx, nome: d.nome, eixo: d.eixo,
    ancoras: (d.anchors || []).map((a) => a.t + ' · ' + a.n),
    prioridades, sugeridas, rotinas
  };
}

/* ---------- o texto ---------- */
function lista(itens, max) {
  const n = itens.length;
  const vis = itens.slice(0, max || 3);
  return vis.join('; ') + (n > vis.length ? ' e mais ' + (n - vis.length) : '');
}
function rotuloPrioridade(p) {
  return p.etapa ? p.nome + ' → ' + p.etapa : p.nome;
}
function linhaPrioridades(r) {
  const abertas = r.prioridades.filter((p) => p.aberta);
  if (abertas.length) return 'Prioridades: ' + lista(abertas.map(rotuloPrioridade));
  return '';
}
/* SEGUNDA É DECISÃO. A semana nova começa sem prioridade nenhuma, e é aí que o
   aviso lembra de elegê-las — com a sugestão do motor, se houver. */
function linhaSemPrioridade(r) {
  if (r.prioridades.length) return '';
  const sug = r.sugeridas.length ? ' Sugestão: ' + rotuloPrioridade(r.sugeridas[0]) + '.' : '';
  if (r.dia === 1) return 'Segunda é decisão: eleja as prioridades da semana.' + sug;
  return sug ? 'Sem prioridades na semana.' + sug : '';
}

export function textoDoMomento(momento, hoje, amanha) {
  const abertas = hoje.rotinas.filter((x) => !x.feita);
  const feitas = hoje.rotinas.length - abertas.length;
  const linhas = [];
  let titulo = '';

  if (momento === 'manha') {
    titulo = hoje.nome + ' · ' + hoje.eixo;
    hoje.ancoras.forEach((a) => linhas.push(a));
    linhas.push(linhaPrioridades(hoje) || linhaSemPrioridade(hoje));
    if (abertas.length) linhas.push('Rotinas: ' + lista(abertas.map((x) => x.titulo), 4));
    if (hoje.dia === 0) linhas.push('A revisão da semana está no Hoje.');
  } else if (momento === 'tarde' || momento === 'noite') {
    const pr = linhaPrioridades(hoje);
    /* NADA ABERTO, NADA A DIZER. O telefone só toca quando há o que dizer. */
    if (!abertas.length && !pr) return null;
    titulo = momento === 'tarde' ? 'Tarde · ainda aberto hoje' : 'Noite · o que ainda dá para fazer';
    if (abertas.length) {
      linhas.push('Rotinas (' + feitas + ' de ' + hoje.rotinas.length + ' feitas): ' +
                  lista(abertas.map((x) => x.titulo)));
    } else {
      linhas.push('Rotinas: todas marcadas.');
    }
    if (pr) linhas.push(pr);
  } else if (momento === 'fim') {
    titulo = 'Fechamento · amanhã é ' + amanha.nome.toLowerCase();
    linhas.push(abertas.length
      ? 'Hoje ficou sem marca: ' + lista(abertas.map((x) => x.titulo))
      : 'Hoje: todas as rotinas marcadas.');
    amanha.ancoras.forEach((a) => linhas.push('Amanhã ' + a));
    linhas.push(linhaPrioridades(amanha) || linhaSemPrioridade(amanha));
    if (amanha.rotinas.length) {
      linhas.push('Rotinas de amanhã: ' + lista(amanha.rotinas.map((x) => x.titulo), 4));
    }
  } else {
    throw new Error('momento desconhecido: ' + momento);
  }
  return { titulo, corpo: linhas.filter(Boolean).join('\n') };
}

export function montarAvisoDoDia(momento, hoje, amanha) {
  const t = textoDoMomento(momento, hoje, amanha);
  if (!t) return null;
  /* UMA TAG PARA OS QUATRO: o aviso das 13h substitui o da manhã na central de
     notificações, em vez de empilhar quatro por dia. */
  return { ...t, tag: 'dia', url: './index.html', ttl: TTL_DIA, urgencia: 'high',
           ids: ['dia:' + hoje.data + ':' + momento] };
}

/* O dia seguinte, ao meio-dia LOCAL: longe de qualquer virada, sem depender de
   quantas horas faltam para a meia-noite. */
export function instanteDeAmanha(agora) {
  const a = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1, 12, 0, 0);
  return a.getTime();
}
