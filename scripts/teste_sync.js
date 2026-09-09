/* Testes da Fase 9A (infraestrutura) e 9B (prioridades online).
 *
 *     node scripts/teste_sync.js
 *
 * NAO TOCAM A REDE E NAO TOCAM O REPOSITORIO. O Supabase e um servidor de
 * mentira que roda dentro do processo — e que EMULA O GATILHO DO RELOGIO
 * (cron_estado_relogio): um upsert com `em` que nao seja estritamente mais novo
 * e descartado em silencio, exatamente como o Postgres faz. Sem isso o teste
 * provaria o cliente contra um servidor complacente, que e nao provar nada.
 *
 * O CODIGO TESTADO E O QUE VAI PARA O AR: os arquivos reais sao lidos do
 * index.html, na ordem em que ele os declara, e avaliados num contexto do vm —
 * mesmo desenho do teste_hoje.js.
 *
 * O QUE ESTE TESTE NAO ALCANCA, e esta dito de proposito:
 *   · isolamento entre usuarios (RLS) e regra do Postgres, nao do JavaScript.
 *     Prova-se contra o banco, com SQL. Ver o relatorio da Fase 9A no README.
 *   · a integridade do CONTAS_CASA, pela mesma razao.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.dirname(__dirname);
const HTML = fs.readFileSync(path.join(RAIZ, "Cronograma", "index.html"), "utf8");
const CAMINHOS = (HTML.match(/<script[^>]*\ssrc="[^"]+"[^>]*><\/script>/g) || [])
  .map(t => t.match(/src="([^"]+)"/)[1]).map(s => s.split("?")[0]);
const FONTE = CAMINHOS
  .map(src => fs.readFileSync(path.join(RAIZ, "Cronograma", src), "utf8"))
  .join("\n") + "\n;globalThis.__const = {SINCRONIA, SYNC_FILA_KEY, SYNC_CACHE_KEY, SYNC_MARCA_KEY, SYNC_MARCA_REG_KEY, SYNC_LIGADO_KEY, SYNC_SESSAO_KEY, dateKey, monthKey, now, TOEFL_FASES, TOEFL_GUIA};\n;globalThis.__checks = function(){ return checks; };";

/* O 20-regras.js entra nos guardas de lista desde a 9E: o funil do TOEFL
   (marcarGuia) mora la, e um guarda que so varresse o 30-render.js diria que o
   dominio nao esta conectado. */
const regrasSrc = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "20-regras.js"), "utf8");

let falhas = [];
function ok(cond, nome, detalhe) {
  console.log((cond ? "  PASSA  " : "  FALHA  ") + nome +
    (!cond && detalhe !== undefined ? "  <- " + JSON.stringify(detalhe) : ""));
  if (!cond) falhas.push(nome);
}

/* ================= O SUPABASE DE MENTIRA =================
   Uma tabela em memoria, compartilhada por todos os aparelhos do teste — que e
   exatamente o que o Postgres e para eles. */
function criarServidor() {
  const srv = {
    linhas: [],            /* cron_estado */
    donos: ["dono-1"],     /* cron_dono */
    seq: 0,
    falhar: false,         /* simula rede fora */
    assinantes: [],        /* callbacks do Realtime */
    recusados: 0,          /* upserts descartados pelo gatilho */
    escritas: 0,
    registros: [],         /* cron_registro */
    repetidos: 0           /* inserts de registro que bateram na chave primaria */
  };
  srv.chave = (l) => l.dono + "|" + l.dominio + "|" + l.chave;

  /* O GATILHO. Espelha cron_estado_relogio: em <= old.em -> descarta. */
  srv.upsert = function (linha) {
    if (srv.falhar) throw new Error("sem rede");
    const k = srv.chave(linha);
    const atual = srv.linhas.find(x => srv.chave(x) === k);
    if (atual && String(linha.em) <= String(atual.em)) { srv.recusados++; return {ok: true}; }
    srv.seq++;
    const nova = Object.assign({}, linha,
      {servidor_em: new Date(Date.UTC(2030, 0, 1) + srv.seq * 1000).toISOString()});
    if (atual) Object.assign(atual, nova); else srv.linhas.push(nova);
    srv.escritas++;
    const entregue = atual || nova;
    srv.assinantes.forEach(a => {
      if (a.tabela !== "cron_estado") return;
      try { a.fn({new: JSON.parse(JSON.stringify(entregue))}); } catch (e) {}
    });
    return {ok: true};
  };
  /* cron_registro: SO CRESCE. A chave primaria e (dono, id), e o id e o do
     toque. O `ignoreDuplicates` do cliente vira ON CONFLICT DO NOTHING: mandar
     a mesma linha de novo e silencio, e nao erro — sem isso uma drenagem que
     caiu no meio travaria a fila para sempre no mesmo item. E NAO HA UPDATE:
     o grant da tabela e `select, insert`, entao reescrever linha de historico
     nem sequer e uma possibilidade. */
  srv.inserirRegistro = function (linha) {
    if (srv.falhar) throw new Error("sem rede");
    const k = linha.dono + "|" + linha.id;
    if (srv.registros.some(x => x.dono + "|" + x.id === k)) { srv.repetidos++; return {ok: true}; }
    srv.seq++;
    const nova = Object.assign({}, linha,
      {servidor_em: new Date(Date.UTC(2030, 0, 1) + srv.seq * 1000).toISOString()});
    srv.registros.push(nova);
    srv.escritas++;
    srv.assinantes.forEach(a => {
      if (a.tabela !== "cron_registro") return;
      try { a.fn({new: JSON.parse(JSON.stringify(nova))}); } catch (e) {}
    });
    return {ok: true};
  };
  return srv;
}

/* O cliente: so o que o 15-sync.js realmente usa. Cada metodo devolve o proprio
   construtor de consulta, e o `then` no fim o torna aguardavel. */
function criarCliente(srv, uid) {
  function consulta(tabela) {
    const f = {tabela, filtros: [], _limite: null, _de: 0, _ate: 1e9};
    f.select = () => f;
    f.eq = (c, v) => { f.filtros.push([c, "eq", v]); return f; };
    f.in = (c, v) => { f.filtros.push([c, "in", v]); return f; };
    f.gte = (c, v) => { f.filtros.push([c, "gte", v]); return f; };
    f.order = () => f;
    f.limit = (n) => { f._limite = n; return f; };
    f.range = (a, b) => { f._de = a; f._ate = b; return f; };
    f.upsert = (linha, opts) => {
      const p = {};
      p.then = (res, rej) => {
        try {
          if (f.tabela === "cron_registro") {
            /* O 15-sync.js TEM de pedir ON CONFLICT DO NOTHING aqui: a tabela
               nao da UPDATE ao aplicativo. Um upsert de verdade seria negado
               pelo Postgres, e o teste passaria contra um servidor mais
               permissivo do que o real. */
            if (!opts || opts.ignoreDuplicates !== true || opts.onConflict !== "dono,id") {
              throw new Error("cron_registro so aceita insert com ON CONFLICT DO NOTHING");
            }
            srv.inserirRegistro(linha);
          } else {
            srv.upsert(linha);
          }
          return Promise.resolve({error: null}).then(res, rej);
        }
        catch (e) { return Promise.resolve({error: {message: e.message}}).then(res, rej); }
      };
      return p;
    };
    f.then = (res, rej) => {
      let out;
      try {
        if (srv.falhar) throw new Error("sem rede");
        if (f.tabela === "cron_dono") {
          out = srv.donos.filter(d => d === uid).map(d => ({uid: d}));
        } else {
          const fonte = f.tabela === "cron_registro" ? srv.registros : srv.linhas;
          out = fonte.filter(l => f.filtros.every(([c, op, v]) =>
            op === "eq" ? l[c] === v : op === "in" ? v.indexOf(l[c]) >= 0 : String(l[c]) >= String(v)));
          out = out.slice(f._de, f._ate + 1);
        }
        if (f._limite) out = out.slice(0, f._limite);
      } catch (e) {
        return Promise.resolve({data: null, error: {message: e.message}}).then(res, rej);
      }
      return Promise.resolve({data: JSON.parse(JSON.stringify(out)), error: null}).then(res, rej);
    };
    return f;
  }
  return {
    from: consulta,
    removeChannel() {},
    channel() {
      /* UM canal, VARIOS .on — um por tabela, como o Realtime de verdade. Guardar
         so o ultimo callback (era o que este falso fazia) faria o teste do
         registro passar e o do estado sumir, sem ninguem perceber. */
      const c = {_ons: []};
      c.on = (_t, o, fn) => { c._ons.push({tabela: o && o.table, fn}); return c; };
      c.subscribe = (cb) => {
        c._ons.forEach(x => srv.assinantes.push({tabela: x.tabela, fn: x.fn}));
        if (cb) cb("SUBSCRIBED");
        return c;
      };
      return c;
    },
    auth: {
      getSession: () => Promise.resolve({data: {session: {user: {id: uid}}}}),
      signInWithPassword: () => Promise.resolve({error: null}),
      signOut: () => Promise.resolve({})
    }
  };
}

function criarAparelho(nome, srv, opcoes) {
  opcoes = opcoes || {};
  const uid = opcoes.uid || "dono-1";
  const armazem = Object.assign({
    "cron:aparelho": JSON.stringify(nome),
    "cron:sync-ligado": JSON.stringify(opcoes.ligado !== false)
  }, opcoes.storage || {});
  /* `length` e `key(i)` NAO sao enfeite: o coletarDados() do backup varre o
     armazenamento por indice, e sem eles ele percorreria zero chaves — o teste
     do backup passaria por vacuidade, provando nada. */
  const localStorage = {
    getItem: (k) => (k in armazem ? armazem[k] : null),
    setItem: (k, v) => { armazem[k] = String(v); },
    removeItem: (k) => { delete armazem[k]; },
    key: (i) => Object.keys(armazem)[i] ?? null,
    get length() { return Object.keys(armazem).length; },
    clear: () => { for (const k of Object.keys(armazem)) delete armazem[k]; }
  };
  const noFalso = () => ({
    innerHTML: "", hidden: false, value: "", open: false, isContentEditable: false,
    tagName: "DIV", classList: {add(){}, remove(){}, toggle(){}, contains: () => false},
    appendChild(){}, setAttribute(){}, removeAttribute(){}, addEventListener(){},
    querySelector: () => null, querySelectorAll: () => [], focus(){}, blur(){}, remove(){}
  });
  const nos = {};
  const document = {
    getElementById: (id) => (nos[id] = nos[id] || noFalso()),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener(){}, removeEventListener(){},
    createElement: () => noFalso(), head: noFalso(),
    body: noFalso(), documentElement: noFalso(),
    visibilityState: "visible", activeElement: null
  };
  const ctx = {
    localStorage, document, console,
    window: {addEventListener(){}, location: {href: "", reload(){}}},
    navigator: {userAgent: "node", onLine: true},
    location: {href: "", replace(){}, reload(){}, pathname: "/Cronograma/"},
    setTimeout: (f) => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    fetch: () => Promise.reject(new Error("sem rede no teste")),
    alert(){}, confirm: () => true, prompt: () => ctx.__prompt || null,
    Promise, Date, Math, JSON, String, Number, Object, Array, Boolean, RegExp,
    Error, isFinite, isNaN, TextEncoder, btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary")
  };
  /* RELOGIO CONGELAVEL — new Date() E Date.now() ao mesmo tempo. Congelar so
     o Date.now() faria o caller ler o relogio real e o instanteDoToque ler o
     congelado: a divergencia medida seria artefato da instrumentacao, e nao o
     mecanismo. Com os dois de acordo, sobra so o que se quer medir — o
     desempate do relogio monotonico quando duas acoes caem no mesmo ms. */
  let congelado = null;
  class DataFalsa extends Date {
    constructor(...a){ if(!a.length && congelado !== null) super(congelado); else super(...a); }
    static now(){ return congelado !== null ? congelado : Date.now(); }
  }
  ctx.Date = DataFalsa;
  ctx.__congelar = (ms) => { congelado = ms; };
  ctx.__descongelar = () => { congelado = null; };
  ctx.window.localStorage = localStorage;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(FONTE, ctx, {filename: "cronograma"});
  Object.assign(ctx, ctx.__const || {});
  ctx.__armazem = armazem;
  ctx.__uid = uid;
  ctx.__prompt = null;
  /* Injeta a sessao ja pronta: o SDK nao e carregado (nao ha CDN no teste), e o
     que se quer testar e a logica, nao o <script> do jsdelivr. */
  ctx.__conectar = function () {
    ctx.SYNC_CLI = criarCliente(srv, uid);
    ctx.SYNC_DONO = uid;
    return ctx;
  };
  return ctx;
}

const P = (v) => Promise.resolve(v);
async function principal() {

console.log("\n=== 1. Carrega, e nao liga nada por conta propria ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv, {ligado: false});
  ok(typeof A.SYNC === "object", "SYNC existe depois do carregamento");
  ok(typeof A.SYNC.salvarAlteracao === "function", "salvarAlteracao existe");
  ok(A.SYNC.ligado() === false, "sem cron:sync-ligado, a sincronia esta DESLIGADA");
  const r = await A.SYNC.iniciar();
  ok(r.ligado === false && /desligado/.test(r.motivo),
     "e iniciar() devolve na primeira linha", r);
  ok(srv.escritas === 0 && srv.linhas.length === 0,
     "nada foi escrito no servidor por carregar a pagina");
  ok(typeof A.enviarToques === "function" && typeof A.buscarEstado === "function",
     "13. o caminho antigo do GitHub continua inteiro");
  ok(typeof A.enfileirarToque === "function" && typeof A.gravarNoGitHub === "function",
     "    e a fila de toques tambem");
}

console.log("\n=== 2. O relogio: quem vence, quem nao vence, e o empate ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const S = A.SYNC;
  ok(S.venceRemoto("2026-01-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z") === true,
     "1. remoto mais novo vence local antigo");
  ok(S.venceRemoto("2026-06-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z") === false,
     "2. remoto antigo NAO vence local mais novo");
  ok(S.venceRemoto("2026-06-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z") === false,
     "3. empate fica como esta");
  ok(S.venceRemoto("", "2026-01-01T00:00:00.000Z") === true, "   sem local, remoto entra");
  ok(S.venceRemoto("2026-01-01T00:00:00.000Z", "") === false, "   sem instante nao vence nada");

  /* Agora contra o cache de verdade, e nao so a funcao pura. */
  S.salvarAlteracao("toefl", "t1", {feito: true}, {em: "2026-06-01T00:00:00.000Z"});
  const velho = S.aplicarRemoto({dono: "dono-1", dominio: "toefl", chave: "t1",
    valor: {feito: false}, em: "2026-01-01T00:00:00.000Z", aparelho: "celular",
    servidor_em: "2030-01-01T00:00:10.000Z"});
  ok(velho.aplicou === false && /mais novo/.test(velho.motivo),
     "   linha antiga nao sobrescreve o cache mais novo", velho);
  const novo = S.aplicarRemoto({dono: "dono-1", dominio: "toefl", chave: "t1",
    valor: {feito: false}, em: "2026-12-01T00:00:00.000Z", aparelho: "celular",
    servidor_em: "2030-01-01T00:00:20.000Z"});
  ok(novo.aplicou === true, "   linha mais nova entra", novo);
}

console.log("\n=== 3. Eco proprio e ausencia de toque ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const S = A.SYNC;
  const antesToques = A.getToques().length;
  const it = S.salvarAlteracao("meta", "2026-09/m1", {done: true});
  const eco = S.aplicarRemoto({dono: "dono-1", dominio: "meta", chave: "2026-09/m1",
    valor: {done: true}, em: it.em, aparelho: "mac", servidor_em: "2030-01-01T00:00:30.000Z"});
  ok(eco.aplicou === false && /eco/.test(eco.motivo),
     "5. o proprio evento nao e reaplicado", eco);
  const deOutro = S.aplicarRemoto({dono: "dono-1", dominio: "meta", chave: "2026-09/m2",
    valor: {done: true}, em: "2027-01-01T00:00:00.000Z", aparelho: "celular",
    servidor_em: "2030-01-01T00:00:40.000Z"});
  ok(deOutro.aplicou === true, "   evento de outro aparelho e aplicado");
  ok(A.getToques().length === antesToques,
     "4. NENHUM toque foi gerado — receber nao e tocar", A.getToques().length);
  ok(S.aplicarRemoto({dono: "dono-2", dominio: "meta", chave: "x",
     valor: {}, em: "2027-01-01T00:00:00.000Z", aparelho: "estranho"}).aplicou === false,
     "   linha de outro dono e recusada antes de tocar o cache");
  ok(S.aplicarRemoto({dono: "dono-1", dominio: "inventado", chave: "x",
     valor: {}, em: "2027-01-01T00:00:00.000Z"}).aplicou === false,
     "   dominio fora dos onze e recusado");
}

console.log("\n=== 4. Offline: a fila guarda, persiste e espera ===");
{
  const srv = criarServidor();
  srv.falhar = true;
  const A = criarAparelho("mac", srv).__conectar();
  const S = A.SYNC;
  S.salvarAlteracao("triagem", "philjobs-1", {st: 2});
  S.salvarAlteracao("triagem", "philjobs-2", {st: 1});
  ok(S.situacao().fila === 2, "6. alteracao sem rede entra na fila", S.situacao().fila);
  ok(JSON.parse(A.__armazem["cron:sync-fila"]).length === 2,
     "7. e a fila esta no localStorage, nao so na memoria");
  const r = await S.drenarFila();
  ok(r.enviados === 0 && !!r.falha, "   drenar sem rede nao envia nada", r);
  ok(S.situacao().fila === 2, "9. falha de rede NAO perde a alteracao", S.situacao().fila);

  /* O aparelho fecha e reabre: a fila tem de sobreviver. */
  const B = criarAparelho("mac", srv, {storage: A.__armazem}).__conectar();
  ok(B.SYNC.situacao().fila === 2, "   e sobrevive a recarregar a pagina");

  srv.falhar = false;
  const r2 = await B.SYNC.drenarFila();
  ok(r2.enviados === 2, "8. a rede volta e a fila sobe", r2);
  ok(B.SYNC.situacao().fila === 0, "   e a fila so esvazia depois de confirmada");
  ok(srv.linhas.length === 2, "   as duas linhas chegaram ao servidor", srv.linhas.length);
}

console.log("\n=== 5. Persistencia parcial: o que falhou continua na fila ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const S = A.SYNC;
  S.salvarAlteracao("evento", "e1", {data: "2026-11-30"});
  await S.drenarFila();
  ok(S.situacao().fila === 0 && srv.linhas.length === 1, "primeira sobe e sai da fila");
  srv.falhar = true;
  S.salvarAlteracao("evento", "e2", {data: "2026-12-01"});
  await S.drenarFila();
  ok(S.situacao().fila === 1, "a segunda falha e FICA", S.situacao().fila);
  ok(JSON.parse(A.__armazem["cron:sync-fila"])[0].chave === "e2",
     "e a que ficou e exatamente a que falhou");
}

console.log("\n=== 6. Reconexao: recupera o que se perdeu, depois envia ===");
{
  const srv = criarServidor();
  const MAC = criarAparelho("mac", srv).__conectar();
  const CEL = criarAparelho("celular", srv).__conectar();

  /* O Mac decide duas coisas enquanto o celular esta fora. */
  MAC.SYNC.salvarAlteracao("retomada", "pipeline/a01", {ate: "2026-10-01"});
  MAC.SYNC.salvarAlteracao("prioridade", "2026-W37/p1", {t: "Lutero"});
  await MAC.SYNC.drenarFila();
  ok(srv.linhas.length === 2, "o Mac publicou duas decisoes", srv.linhas.length);

  /* O celular, offline, decidiu uma terceira. */
  srv.falhar = true;
  CEL.SYNC.salvarAlteracao("toefl", "t9", {feito: true});
  await CEL.SYNC.drenarFila();
  ok(CEL.SYNC.situacao().fila === 1, "o celular tem uma decisao presa na fila");
  ok(CEL.SYNC.situacao().marca === "", "e nunca recebeu nada");

  /* Volta. */
  srv.falhar = false;
  await CEL.SYNC.reconectar(true);
  const cache = JSON.parse(CEL.__armazem["cron:sync-cache"]);
  ok(!!cache["retomada␟pipeline/a01"] && !!cache["prioridade␟2026-W37/p1"],
     "10. a reconexao trouxe o que se perdeu", Object.keys(cache));
  ok(CEL.SYNC.situacao().fila === 0, "    e so entao subiu o que estava preso");
  ok(srv.linhas.length === 3, "    o servidor tem as tres", srv.linhas.length);
  ok(CEL.SYNC.situacao().marca !== "", "    e a marca de entrega avancou",
     CEL.SYNC.situacao().marca);

  /* Reconectar de novo nao pode duplicar nem regredir. */
  const marcaAntes = CEL.SYNC.situacao().marca;
  const d = await CEL.SYNC.buscarDelta();
  ok(d.lidas > 0 && d.aplicadas === 0,
     "    reler o mesmo trecho nao aplica nada de novo (idempotente)", d);
  ok(CEL.SYNC.situacao().marca >= marcaAntes, "    e a marca nunca anda para tras");
}

console.log("\n=== 7. Realtime: chega no outro aparelho, sem toque e sem volta ===");
{
  const srv = criarServidor();
  const MAC = criarAparelho("mac", srv).__conectar();
  const CEL = criarAparelho("celular", srv).__conectar();
  await CEL.SYNC.assinarMudancas();
  const toquesAntes = CEL.getToques().length;

  MAC.SYNC.salvarAlteracao("item", "pipeline/a01/a01-4", {st: 2});
  await MAC.SYNC.drenarFila();

  const cache = JSON.parse(CEL.__armazem["cron:sync-cache"]);
  ok(!!cache["item␟pipeline/a01/a01-4"], "o evento chegou ao celular pelo Realtime",
     Object.keys(cache));
  ok(cache["item␟pipeline/a01/a01-4"].valor.st === 2, "com o valor certo");
  ok(CEL.getToques().length === toquesAntes,
     "4. e nao gerou toque nenhum no celular", CEL.getToques().length);
  ok(CEL.SYNC.situacao().fila === 0,
     "   nem reenviou a alteracao de volta", CEL.SYNC.situacao().fila);
  ok(srv.escritas === 1, "   o servidor recebeu UMA escrita, nao um laco", srv.escritas);
}

console.log("\n=== 8. O gatilho do servidor recusa o atrasado ===");
{
  const srv = criarServidor();
  const MAC = criarAparelho("mac", srv).__conectar();
  const CEL = criarAparelho("celular", srv).__conectar();
  MAC.SYNC.salvarAlteracao("meta", "2026-09/m1", {t: "novo"}, {em: "2027-01-01T00:00:00.000Z"});
  await MAC.SYNC.drenarFila();
  /* O celular estava offline e decidiu ANTES; a fila dele so sobe agora. */
  CEL.SYNC.salvarAlteracao("meta", "2026-09/m1", {t: "velho"}, {em: "2026-01-01T00:00:00.000Z"});
  const r = await CEL.SYNC.drenarFila();
  ok(r.enviados === 1, "o atrasado sobe (o cliente nao adivinha)", r);
  ok(srv.recusados === 1, "mas o gatilho o RECUSA no servidor", srv.recusados);
  ok(srv.linhas[0].valor.t === "novo", "e o valor mais novo permanece", srv.linhas[0].valor);
  ok(CEL.SYNC.situacao().fila === 0, "e ele sai da fila: perdeu por ser velho, nao por falhar");
}

console.log("\n=== 9. Render seguro: nao destroi o que se esta digitando ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const S = A.SYNC;
  let desenhos = 0;
  A.renderTesteX = function () { desenhos++; };

  ok(S.podeRenderizar() === true, "sem foco em campo, pode desenhar");
  S.pedirRender(["renderTesteX"]);
  S.descarregarRender();
  ok(desenhos === 1, "e desenha", desenhos);

  A.document.activeElement = {isContentEditable: true, tagName: "DIV"};
  ok(S.editando() === true, "com o cursor num contenteditable, esta editando");
  ok(S.podeRenderizar() === false, "e NAO pode desenhar");
  S.pedirRender(["renderTesteX"]);
  const r = S.descarregarRender();
  ok(r.adiado === true && desenhos === 1, "o desenho fica ADIADO, nao perdido", r);

  A.document.activeElement = null;
  S.descarregarRender();
  ok(desenhos === 2, "e sai assim que o campo perde o foco", desenhos);

  /* Rajada: dez eventos, um desenho. */
  A.renderTesteY = function () { desenhos++; };
  for (let i = 0; i < 10; i++) S.pedirRender(["renderTesteY"]);
  S.descarregarRender();
  ok(desenhos === 3, "dez eventos seguidos viram UM desenho", desenhos);
  ok(S.descarregarRender().renderizados.length === 0, "e a fila de desenho esvazia");
}

console.log("\n=== 10. Compatibilidade: quebrar o Supabase nao quebra o app ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv);          /* sem __conectar: sem SDK */
  const S = A.SYNC;
  ok(S.pronto() === false, "sem sessao, a camada se declara nao-pronta");
  S.salvarAlteracao("rotina", "2026-09-06/seg-min", {feito: true});
  ok(S.situacao().fila === 1, "mas a decisao e guardada do mesmo jeito");
  const r = await S.drenarFila();
  ok(r.enviados === 0 && /sem sessão/.test(r.motivo), "e espera sessao para subir", r);
  ok(S.situacao().fila === 1, "sem perder nada");
  const c = await S.carregarEstado();
  ok(c.lidas === 0 && !!c.motivo, "carregarEstado sem sessao nao lanca", c);
  const d = await S.buscarDelta();
  ok(d.lidas === 0 && !!d.motivo, "buscarDelta sem sessao nao lanca", d);
  ok(A.SYNC.situacao().aparelho === "mac", "e a identidade do aparelho continua de pe");

  /* A conta autenticada que NAO e dona do Cronograma. */
  const B = criarAparelho("mac", srv, {uid: "dono-2"});
  B.SYNC_CLI = criarCliente(srv, "dono-2");
  B.SYNC_DONO = "dono-2";
  const sou = await B.SYNC.souDono();
  ok(sou === false, "11. conta autenticada fora da cron_dono nao e dona (lado cliente)");
  const souSim = await A.__conectar().SYNC.souDono();
  ok(souSim === true, "    e a conta da allowlist e");
}

console.log("\n=== 11. Guardas de escrita ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  let erro1 = null, erro2 = null;
  try { A.SYNC.salvarAlteracao("inventado", "x", {}); } catch (e) { erro1 = e.message; }
  try { A.SYNC.salvarAlteracao("meta", "", {}); } catch (e) { erro2 = e.message; }
  ok(/desconhecido/.test(erro1 || ""), "dominio fora dos onze e recusado antes da rede", erro1);
  ok(/sem chave/.test(erro2 || ""), "alteracao sem chave e recusada", erro2);
  ok(A.SYNC.situacao().fila === 0, "e nenhuma das duas sujou a fila");
  ok(A.SINCRONIA.DOMINIOS.length === 11, "os onze dominios do esquema estao declarados",
     A.SINCRONIA.DOMINIOS.length);
}

console.log("\n=== 12. O que continua local ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  A.SYNC.salvarAlteracao("toefl", "t1", {feito: true});
  await A.SYNC.drenarFila();
  const subiram = srv.linhas.map(l => l.dominio + "/" + l.chave).join(" ");
  ["cron:aparelho", "sync:token", "cron:contexto"].forEach(k => {
    ok(subiram.indexOf(k) < 0, k + " nao viajou");
  });
  ok(A.__armazem["cron:aparelho"] === '"mac"', "e cron:aparelho segue local e intacto");
  const cache = JSON.parse(A.__armazem["cron:sync-cache"]);
  ok(Object.keys(cache).length === 1 && !!cache["toefl␟t1"],
     "o cache guarda so o que passou pela camada", Object.keys(cache));
}

console.log("\n=== 13. Dominios AINDA nao conectados nao tocam o estado local ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  /* ESTA SECAO NASCEU NA 9A como "nenhum dominio foi conectado", e o seu
     sentido evoluiu a cada fase: prioridade (9B), meta (9C-2), evento (9C-3) e
     triagem (9D) passaram a escrever o proprio estado, de proposito. O que ela
     guarda agora e o COMPLEMENTO — os dominios que ainda NAO foram conectados
     continuam inertes, e a linha deles fica no cache esperando a fase que os
     conectar. Ela quebra na hora em que alguem conectar um deles sem passar
     por uma fase que o autorize. */
  const antes = {
    pipeline: A.__armazem["cron:pipeline"],
    toefl: A.__armazem["cron:toefl-guia"],
    triagem: A.__armazem["cron:triagem"],
    prio: A.__armazem["cron:prioridades:2026-W37"]
  };
  A.SINCRONIA.DOMINIOS.forEach((d, i) => {
    A.SYNC.aplicarRemoto({dono: "dono-1", dominio: d, chave: "k" + i, valor: {x: 1},
      em: "2027-01-01T00:00:0" + (i % 10) + ".000Z",
      aparelho: "celular", servidor_em: "2030-02-01T00:00:00.000Z"});
  });
  ok(A.__armazem["cron:pipeline"] === antes.pipeline, "cron:pipeline intacto");
  /* O toefl SAIU desta lista na 9E, junto com o item. */
  ok(A.__armazem["cron:toefl-guia"] !== antes.toefl,
     "cron:toefl-guia JA responde — conectado na 9E");
  /* A triagem SAIU desta lista na 9D: agora ela tem aplicador e escreve. */
  ok(A.__armazem["cron:triagem"] !== antes.triagem,
     "cron:triagem JA responde — conectada na 9D");
  ok(A.__armazem["cron:prioridades:2026-W37"] === antes.prio,
     "e a chave sem periodo nao vira prioridade (o aplicador exige AAAA-Wnn/id)");
  ok(Object.keys(JSON.parse(A.__armazem["cron:sync-cache"])).length === 11,
     "as onze linhas ficaram no cache, esperando 9B");
  ok(A.getToques().length === 0, "e nenhum toque foi gerado por nada disso");
}

/* ================= FASE 9B — AS PRIORIDADES ONLINE =================
   Dois aparelhos de verdade contra o mesmo servidor de mentira. O que se prova
   aqui e o caminho inteiro: a acao da tela (addPrioridadeLivre, editPrioridade,
   togglePrioridadeFeita, delPrioridade) -> tocarPrioridade -> SYNC -> gatilho
   -> Realtime -> aplicarPrioridadeOnline -> cron:prioridades do outro. */
function parOnline(srv) {
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  return [A, B];
}
/* O estado que a TELA le, e nao o cache do SYNC: e ele que prova que o dominio
   foi mesmo conectado, e nao so que a linha chegou. */
const prioridades = (ap, sem) => ap.getPrio(sem || ap.semanaAtual);
const acharPrio = (ap, id, sem) => prioridades(ap, sem).filter(x => x.id === id)[0] || null;

console.log("\n=== 15. Criar no A aparece no B (9B) ===");
{
  const srv = criarServidor();
  const [A, B] = parOnline(srv);
  await B.SYNC.assinarMudancas();
  ok(prioridades(B).length === 0, "o celular comeca sem prioridade nenhuma");

  A.__prompt = "Reler o De servo arbitrio";
  A.addPrioridadeLivre();
  const criada = prioridades(A)[0];
  ok(!!criada && criada.t === "Reler o De servo arbitrio",
     "1. o Mac criou, e ela ja esta na tela dele (otimista)", criada && criada.t);
  await A.SYNC.drenarFila();

  const noCel = acharPrio(B, criada.id);
  ok(!!noCel, "   e chegou ao celular pelo Realtime", prioridades(B));
  ok(noCel && noCel.t === "Reler o De servo arbitrio" && noCel.tipo === "livre",
     "   com texto e tipo certos", noCel);
  ok(noCel && noCel.em === criada.em, "   e com o MESMO instante da decisao", noCel && noCel.em);
}

console.log("\n=== 16. Marcar, desmarcar, editar e excluir (9B) ===");
{
  const srv = criarServidor();
  const [A, B] = parOnline(srv);
  await B.SYNC.assinarMudancas();
  A.__prompt = "Fichar o Tratado Teologico-Politico";
  A.addPrioridadeLivre();
  const id = prioridades(A)[0].id;
  await A.SYNC.drenarFila();
  ok(!!acharPrio(B, id), "a prioridade existe nos dois");

  A.togglePrioridadeFeita(id);
  await A.SYNC.drenarFila();
  ok(acharPrio(A, id).feito_em === A.dateKey, "2. o Mac marcou", acharPrio(A, id).feito_em);
  ok(acharPrio(B, id).feito_em === A.dateKey,
     "   e o celular recebeu o feito_em com a DATA", acharPrio(B, id).feito_em);

  A.togglePrioridadeFeita(id);
  await A.SYNC.drenarFila();
  ok(acharPrio(A, id).feito_em === "", "3. o Mac desmarcou");
  ok(acharPrio(B, id).feito_em === "",
     "   e o celular recebeu feito_em vazio — nao a ausencia do campo",
     acharPrio(B, id));
  ok("feito_em" in acharPrio(B, id), "   o campo EXISTE e esta vazio");

  A.editPrioridade(id, "Fichar o TTP, capitulos 1 a 7");
  await A.SYNC.drenarFila();
  ok(acharPrio(B, id).t === "Fichar o TTP, capitulos 1 a 7",
     "4. edicao no Mac chega ao celular", acharPrio(B, id).t);

  A.delPrioridade(id);
  await A.SYNC.drenarFila();
  ok(acharPrio(A, id) === null, "5. o Mac apagou");
  ok(acharPrio(B, id) === null, "   e ela sumiu do celular tambem");
  const linha = srv.linhas.filter(l => l.dominio === "prioridade" && l.chave.indexOf(id) > 0)[0];
  ok(!!linha && linha.del === true,
     "   e a exclusao e LAPIDE no servidor, nao ausencia de linha", linha && linha.del);
}

console.log("\n=== 17. O caminho de volta: alteracao no B chega ao A (9B) ===");
{
  const srv = criarServidor();
  const [A, B] = parOnline(srv);
  await A.SYNC.assinarMudancas();
  B.__prompt = "Preparar a aula de Galatas";
  B.addPrioridadeLivre();
  const id = prioridades(B)[0].id;
  await B.SYNC.drenarFila();
  ok(!!acharPrio(A, id), "6. o celular criou e o Mac recebeu", prioridades(A));
  B.togglePrioridadeFeita(id);
  await B.SYNC.drenarFila();
  ok(acharPrio(A, id).feito_em === B.dateKey, "   e a marca tambem volta");
}

console.log("\n=== 18. Duas prioridades da mesma semana nao se atropelam (9B) ===");
{
  const srv = criarServidor();
  const [A, B] = parOnline(srv);
  await A.SYNC.assinarMudancas();
  await B.SYNC.assinarMudancas();

  A.__prompt = "Escrever a secao 2 do artigo";
  A.addPrioridadeLivre();
  const idA = prioridades(A)[0].id;
  await A.SYNC.drenarFila();

  B.__prompt = "Responder o parecer da revista";
  B.addPrioridadeLivre();
  const idB = prioridades(B).filter(x => x.id !== idA)[0].id;
  await B.SYNC.drenarFila();

  ok(idA !== idB, "sao duas prioridades distintas");
  ok(prioridades(A).length === 2 && prioridades(B).length === 2,
     "7. os dois aparelhos veem AS DUAS",
     {mac: prioridades(A).map(x => x.t), cel: prioridades(B).map(x => x.t)});
  ok(!!acharPrio(A, idB) && !!acharPrio(B, idA),
     "   e cada um recebeu a do outro sem perder a sua");

  /* A prova de que nao e snapshot de semana: cada uma e uma LINHA. */
  const chaves = srv.linhas.filter(l => l.dominio === "prioridade").map(l => l.chave);
  ok(chaves.length === 2 && chaves.every(k => k.indexOf(A.semanaAtual + "/") === 0),
     "   e o servidor tem DUAS linhas da semana, nao um retrato dela", chaves);

  /* Cada um edita a SUA: nenhuma edicao apaga a do outro. */
  A.editPrioridade(idA, "Escrever a secao 2 e a 3");
  await A.SYNC.drenarFila();
  B.editPrioridade(idB, "Responder o parecer ate sexta");
  await B.SYNC.drenarFila();
  ok(acharPrio(A, idA).t === "Escrever a secao 2 e a 3" &&
     acharPrio(A, idB).t === "Responder o parecer ate sexta",
     "   edicoes cruzadas convivem no Mac", prioridades(A).map(x => x.t));
  ok(acharPrio(B, idA).t === "Escrever a secao 2 e a 3" &&
     acharPrio(B, idB).t === "Responder o parecer ate sexta",
     "   e no celular", prioridades(B).map(x => x.t));
}

console.log("\n=== 19. Offline, reconexao e precedencia (9B) ===");
{
  const srv = criarServidor();
  const [A, B] = parOnline(srv);
  await B.SYNC.assinarMudancas();

  srv.falhar = true;
  A.__prompt = "Revisar o writing sample";
  A.addPrioridadeLivre();
  const id = prioridades(A)[0].id;
  await A.SYNC.drenarFila();
  ok(prioridades(A).length === 1, "8. sem rede, a prioridade existe na tela do Mac");
  ok(A.SYNC.situacao().fila === 1, "   e fica pendente na fila", A.SYNC.situacao().fila);
  ok(prioridades(B).length === 0, "   o celular ainda nao sabe de nada");

  srv.falhar = false;
  await A.SYNC.reconectar(true);
  ok(A.SYNC.situacao().fila === 0, "   a rede volta e a fila sobe");
  ok(!!acharPrio(B, id), "   e o celular recebe", prioridades(B));

  /* Enquanto o CELULAR esta fora, o Mac decide mais uma coisa. */
  const C = criarAparelho("ipad", srv, {storage: {}}).__conectar();
  await C.SYNC.reconectar(true);
  ok(!!acharPrio(C, id), "9. um aparelho que chega depois recupera pelo delta", prioridades(C));
  A.editPrioridade(id, "Revisar o writing sample e as cartas");
  await A.SYNC.drenarFila();
  await C.SYNC.reconectar(true);
  ok(acharPrio(C, id).t === "Revisar o writing sample e as cartas",
     "   e a reconexao traz o que mudou no intervalo", acharPrio(C, id).t);
}

console.log("\n=== 20. Receber nao gera envio, nem eco, nem toque (9B) ===");
{
  const srv = criarServidor();
  const [A, B] = parOnline(srv);
  await B.SYNC.assinarMudancas();
  const toquesB = B.getToques().length;

  A.__prompt = "Fechar o capitulo 3";
  A.addPrioridadeLivre();
  const id = prioridades(A)[0].id;
  await A.SYNC.drenarFila();

  ok(!!acharPrio(B, id), "a prioridade chegou ao celular");
  ok(B.getToques().length === toquesB,
     "10. e NAO gerou toque no celular — receber nao e tocar", B.getToques().length);
  ok(B.SYNC.situacao().fila === 0, "    nem enfileirou envio de volta");
  ok(srv.escritas === 1, "    o servidor recebeu UMA escrita, nao um laco", srv.escritas);

  /* O proprio evento voltando: nao pode ser reaplicado. */
  const antes = JSON.stringify(prioridades(A));
  const r = A.SYNC.aplicarRemoto(srv.linhas[0]);
  ok(r.aplicou === false && /eco/.test(r.motivo), "    e o eco proprio e recusado no Mac", r);
  ok(JSON.stringify(prioridades(A)) === antes, "    sem mexer na lista dele");
}

console.log("\n=== 21. Prioridade antiga nao vence a mais nova (9B) ===");
{
  const srv = criarServidor();
  const [A, B] = parOnline(srv);
  A.__prompt = "Ler Ebeling";
  A.addPrioridadeLivre();
  const id = prioridades(A)[0].id;
  await A.SYNC.drenarFila();
  await B.SYNC.reconectar(true);
  B.editPrioridade(id, "Ler Ebeling — texto DEFINITIVO");
  await B.SYNC.drenarFila();

  /* Uma linha ANTIGA chega ao celular: nao pode desfazer o que ele acabou de
     escrever. Duas guardas a recusam — o cache do SYNC e o `em` do item. */
  const velha = {dono: "dono-1", dominio: "prioridade",
                 chave: A.semanaAtual + "/" + id,
                 valor: {tipo: "livre", painel: "", projId: "", t: "Ler Ebeling", feito_em: ""},
                 del: false, em: "2020-01-01T00:00:00.000Z", aparelho: "mac",
                 servidor_em: "2030-06-01T00:00:00.000Z"};
  const r = B.SYNC.aplicarRemoto(velha);
  ok(r.aplicou === false, "11. a linha antiga e recusada", r);
  ok(acharPrio(B, id).t === "Ler Ebeling — texto DEFINITIVO",
     "    e o texto mais novo permanece", acharPrio(B, id).t);

  /* E a mesma guarda, aplicada direto ao merge, sem passar pelo cache: e o que
     protege o caso em que o caminho LEGADO aplicou algo mais novo por fora. */
  const lista = B.getPrio(A.semanaAtual);
  const mudou = B.mesclarPrioridade(lista, id,
    {quando: "2020-01-01T00:00:00.000Z", t: "velho", tipo: "livre"});
  ok(mudou === false, "    e o mesclarPrioridade tambem a recusa sozinho");
  ok(B.mesclarPrioridade(lista, id,
    {quando: "2099-01-01T00:00:00.000Z", t: "futuro", tipo: "livre"}) === true,
    "    mas aceita a mais nova");
}

console.log("\n=== 22. O que a 9B NAO mudou ===");
{
  const srv = criarServidor();
  const [A] = parOnline(srv);

  /* 13. trilho e livre continuam com a semantica de sempre. */
  A.addPrioridadeTrilho("pipeline/a01");
  const t = prioridades(A).filter(x => x.tipo === "trilho")[0];
  ok(!!t && t.painel === "pipeline" && t.projId === "a01",
     "13. a prioridade de trilho guarda o ENDERECO, nao o texto da etapa", t);
  ok(!t.t || t.t.indexOf("etapa") < 0, "    o texto e o titulo do projeto, como sempre", t.t);
  A.addPrioridadeTrilho("pipeline/a01");
  ok(prioridades(A).filter(x => x.projId === "a01").length === 1,
     "    e a mesma peca nao entra duas vezes");
  A.__prompt = "uma livre";
  A.addPrioridadeLivre();
  const l = prioridades(A).filter(x => x.tipo === "livre")[0];
  ok(!!l && l.painel === "" && l.projId === "", "    a livre continua sem endereco", l);

  /* 12. o motor continua funcionando com as prioridades existentes. */
  const pr = A.prioridadesDoDia();
  ok(!!pr && Array.isArray(pr.manuais) && Array.isArray(pr.sugeridas),
     "12. prioridadesDoDia continua devolvendo manuais e sugeridas", Object.keys(pr));
  ok(pr.manuais.length === 2, "    e enxerga as duas que acabamos de criar", pr.manuais.length);
  ok(typeof A.renderHoje === "function" && (A.renderHoje(), true),
     "    e o Hoje desenha sem erro");

  /* 14. cron:checks passou a viajar na 9D.4 — e continua morando aqui. */
  A.toggleCheck("seg-min");
  await A.SYNC.drenarFila();
  const dominios = srv.linhas.map(l => l.dominio);
  ok(dominios.indexOf("rotina") >= 0,
     "14. marcar rotina virou dominio online na 9D.4", dominios);
  ok(!!A.__armazem["cron:checks:" + A.dateKey],
     "    e cron:checks continua sendo onde a marca mora no aparelho");
  ok(dominios.every(d => d === "prioridade" || d === "rotina"),
     "    e nenhum outro dominio foi conectado por tabela", dominios);

  /* O caminho legado continua inteiro e continua recebendo o mesmo ato. */
  const tiposDeToque = A.getToques().map(x => x.tipo);
  /* DOIS, e nao tres: o segundo addPrioridadeTrilho e recusado por duplicata
     antes de tocar em nada — que e a semantica de sempre, verificada acima. */
  ok(tiposDeToque.filter(x => x === "prioridade").length === 2,
     "    e o toque legado continua sendo emitido por toda operacao", tiposDeToque);
  ok(typeof A.aplicarPrioridadesDoEstado === "function",
     "    a descida pelo estado.json continua existindo");
}

console.log("\n=== 23. Um escritor so, e uma implementacao de merge so (9B) ===");
{
  const fonte = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  const nucleo = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "10-nucleo.js"), "utf8");
  /* SO o tocarPrioridade escreve prioridade online. Se um dia alguem
     acrescentar um segundo escritor, este teste cai. */
  const escritores = (fonte.match(/SYNC\.salvarAlteracao\(\s*"prioridade"/g) || []).length;
  ok(escritores === 1, "ha UM unico ponto que escreve prioridade online", escritores);
  ok(/function tocarPrioridade[\s\S]{0,1400}SYNC\.salvarAlteracao\(\s*"prioridade"/.test(fonte),
     "e ele e o tocarPrioridade, por onde as cinco operacoes ja passavam");
  /* E UMA implementacao de merge, usada pelos dois caminhos de descida. */
  ok((nucleo.match(/function mesclarPrioridade/g) || []).length === 1,
     "ha UMA implementacao de merge");
  ok(/aplicarPrioridadesDoEstado[\s\S]*?mesclarPrioridade/.test(nucleo),
     "o caminho legado (estado.json) a usa");
  ok(/aplicarPrioridadeOnline[\s\S]*?mesclarPrioridade/.test(nucleo),
     "e o caminho online tambem — nao ha logica de relogio paralela");
  /* O mesmo instante nos dois caminhos. */
  ok(/var iso = enfileirarToque\("prioridade", d\);[\s\S]{0,400}\{em: iso, del: d\.del\}/.test(fonte),
     "e os dois caminhos carregam o MESMO instante da decisao");
}

console.log("\n=== 24. A tela do estado online (9B) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv, {ligado: false});

  ok(typeof A.entrarSincronia === "function", "entrarSincronia existe");
  ok(typeof A.sairSincronia === "function", "sairSincronia existe");
  ok(typeof A.renderSincroniaOnline === "function", "renderSincroniaOnline existe");

  /* A camada tinha SYNC.entrar() desde a 9A e NADA a chamava: estava no ar e
     era inalcancavel de dentro do aplicativo. Num PWA de iPhone nao ha console. */
  const html = fs.readFileSync(path.join(RAIZ, "Cronograma", "index.html"), "utf8");
  ok(/id="sync-email"/.test(html) && /id="sync-senha"/.test(html),
     "e a tela tem os campos de e-mail e senha");
  ok(/onclick="entrarSincronia\(\)"/.test(html) && /onclick="sairSincronia\(\)"/.test(html),
     "com os dois botoes ligados aos handlers");
  ok(/type="password"[^>]*id="sync-senha"/.test(html), "a senha e campo de senha");
  ok(/id="sync-token"/.test(html) && /onclick="salvarToken\(\)"/.test(html),
     "e o bloco do token do GitHub continua inteiro — os dois convivem");

  /* A frase muda com a situacao, e a diferenca entre "nao entrei" e "entrei com
     a conta errada" e o caso que a allowlist cron_dono cria. */
  A.renderSincroniaOnline();
  const alvo = A.document.getElementById("sync-online");
  ok(/desligada/i.test(alvo.textContent), "desligada: a tela diz isso", alvo.textContent);
  A.SYNC_SITUACAO = "sem-dono";
  A.renderSincroniaOnline();
  ok(/não é dona/i.test(alvo.textContent),
     "conta sem Cronograma: a tela distingue de 'nao entrei'", alvo.textContent);
  A.SYNC_SITUACAO = "pronto";
  A.renderSincroniaOnline();
  ok(/segundos/i.test(alvo.textContent), "ligada: diz o que passa a acontecer", alvo.textContent);
  A.SYNC_SITUACAO = "offline";
  A.renderSincroniaOnline();
  ok(/nada se perde/i.test(alvo.textContent),
     "offline: diz que nada se perde", alvo.textContent);
}

console.log("\n=== 25. A sessao NAO entra no backup exportado (9B) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  /* O coletarDados() varre TODA chave que comece com "cron:", excluindo so o
     que casa com /token/i. Uma sessao guardada em "cron:sync-sessao" — como
     estava ate aqui — iria para o .json que se baixa e as vezes se manda por
     e-mail, com JWT e refresh token dentro. */
  ok(A.SYNC_SESSAO_KEY === "sync:sessao",
     "a chave da sessao mora fora do prefixo cron:", A.SYNC_SESSAO_KEY);
  ok(A.SYNC_SESSAO_KEY.indexOf("cron:") !== 0, "e por isso o backup nao a alcanca");

  A.__armazem[A.SYNC_SESSAO_KEY] = JSON.stringify({access_token: "SEGREDO", refresh_token: "SEGREDO"});
  A.__armazem["sync:token"] = "github_pat_SEGREDO";
  A.SYNC.salvarAlteracao("prioridade", "2026-W37/p9", {t: "uma qualquer"});
  const backup = JSON.stringify(A.coletarDados());
  ok(backup.indexOf("SEGREDO") < 0, "nenhum segredo no backup exportado");
  ok(backup.indexOf("cron:sync-fila") > -1,
     "mas a fila vai — ela nao tem segredo e o backup deve preserva-la");
  ok(Object.keys(A.coletarDados()).length > 3,
     "e o backup nao esta vazio — a varredura de fato aconteceu",
     Object.keys(A.coletarDados()).length);

  const fonte = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "15-sync.js"), "utf8");
  ok(/storageKey:SYNC_SESSAO_KEY/.test(fonte),
     "e o cliente do Supabase usa essa chave, nao uma literal solta");
  ok(!/storageKey:\s*"cron:/.test(fonte), "nenhuma sessao guardada sob cron:");
}

console.log("\n=== 26. O relogio de Metas e Eventos (9C-0) ===");
{
  /* A DIVERGENCIA ERA REAL E FOI MEDIDA. Antes da 9C-0, tocarMeta/tocarEvento
     nao devolviam nada e cada caller carimbava o `em` com new Date(). No
     caminho feliz os dois relogios coincidem — por isso o defeito ficou
     invisivel. Mas o instanteDoToque() e MONOTONICO: na 2a acao de um mesmo
     milissegundo ele soma 1ms e o new Date() do caller nao acompanha.
     Medido no codigo de antes: 1a acao coincide, 2a diverge +1ms, 3a +2ms.
     Este bloco existe para que nao volte. */
  const srv = criarServidor();
  const A = criarAparelho("mac", srv, {ligado: false});
  const ultimoToque = () => { const t = A.getToques(); return t[t.length - 1]; };

  const casos = [];
  function medir(nome, acao, lerEm) {
    const antes = A.getToques().length;
    acao();
    const t = ultimoToque();
    casos.push({nome, em: lerEm(), quando: t.quando, novos: A.getToques().length - antes});
    return casos[casos.length - 1];
  }

  A.addMeta();
  const mi = A.getMetas().length - 1;
  A.__congelar(1800000000000);
  const m1 = medir("editMeta 1a no ms",  () => A.editMeta(mi, "primeira"),  () => A.getMetas()[mi].em);
  const m2 = medir("editMeta 2a no ms",  () => A.editMeta(mi, "segunda"),   () => A.getMetas()[mi].em);
  const m3 = medir("toggleMeta 3a no ms",() => A.toggleMeta(mi),            () => A.getMetas()[mi].em);
  A.__descongelar();

  ok(m1.em === m1.quando, "4. o `em` da meta e o ISO do toque (1a no milissegundo)", m1);
  ok(m2.em === m2.quando, "   e continua sendo na 2a — onde o monotonico desempata", m2);
  ok(m3.em === m3.quando, "   e na 3a", m3);
  ok(m2.quando > m1.quando && m3.quando > m2.quando,
     "   os instantes avancam de verdade (o desempate aconteceu)",
     [m1.quando, m2.quando, m3.quando]);
  ok([m1, m2, m3].every(c => c.novos === 1),
     "11. cada operacao de meta gera EXATAMENTE um toque", casos.map(c => c.novos));

  A.addEv();
  const eid = A.getEventos()[A.getEventos().length - 1].id;
  const achaEv = () => A.getEventos().filter(x => x.id === eid)[0];
  A.__congelar(1800000001000);
  const e1 = medir("editEv 1a no ms", () => A.editEv(eid, "uma data"),      () => achaEv().em);
  const e2 = medir("dateEv 2a no ms", () => A.dateEv(eid, "2027-04-01"),    () => achaEv().em);
  A.__descongelar();

  ok(e1.em === e1.quando, "9. o `em` do evento e o ISO do toque (1a no milissegundo)", e1);
  ok(e2.em === e2.quando, "   e continua sendo na 2a", e2);
  ok(e2.quando > e1.quando, "   com os instantes avancando", [e1.quando, e2.quando]);
  ok(e1.novos === 1 && e2.novos === 1,
     "11. cada operacao de evento gera EXATAMENTE um toque", [e1.novos, e2.novos]);

  /* trazerTodas era o pior caso: N metas com UM `agora` compartilhado. */
  const B = criarAparelho("celular", srv, {ligado: false});
  B.__armazem["cron:metas:2026-07"] = JSON.stringify([
    {id: "old1", t: "pendente um",  done: false, em: "2026-07-01T00:00:00.000Z"},
    {id: "old2", t: "pendente dois", done: false, em: "2026-07-01T00:00:00.000Z"}
  ]);
  B.__congelar(1800000002000);
  B.trazerTodas();
  B.__descongelar();
  const trazidas = B.getMetas(B.monthKey).filter(m => m.de === "2026-07");
  ok(trazidas.length === 2, "trazerTodas trouxe as duas", trazidas.length);
  const toquesT = B.getToques().filter(t => t.tipo === "meta");
  const porId = {};
  toquesT.forEach(t => { if (!t.dados.del) porId[t.dados.mid] = t.quando; });
  ok(trazidas.every(m => m.em === porId[m.id]),
     "e cada meta trazida ficou com o SEU instante, nao um `agora` compartilhado",
     trazidas.map(m => ({id: m.id, em: m.em, toque: porId[m.id]})));
  ok(new Set(trazidas.map(m => m.em)).size === 2,
     "os dois `em` sao distintos — era aqui que o defeito mordia");
}

console.log("\n=== 27. Um escritor so para Meta e Evento (9C-0) ===");
{
  const fonte = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  ["meta", "evento", "prioridade"].forEach(function (d) {
    const n = (fonte.match(new RegExp('enfileirarToque\\("' + d + '"', "g")) || []).length;
    ok(n === 1, "10. ha UM unico enfileirarToque(\"" + d + "\") no codigo", n);
  });
  ok(/var iso = tocarEvento\(ev, false, x\.novo \? ACERVO_EM : null\)/.test(fonte),
     "    e o botao do acervo publica evento PELO FUNIL");
  ok(/var iso = tocarMeta\(c\.mes, c\.m, false, ACERVO_EM\)/.test(fonte),
     "    e meta tambem");
  /* O corpo do tocarMeta cresceu na 9C-2 (ganhou a escrita online), entao a
     verificacao passou a ser sobre o CONTRATO e nao sobre a proximidade das
     linhas: aceita quandoISO, repassa-o ao toque, e devolve o iso. */
  const tocarM = fonte.split("function tocarMeta(")[1].split("\n}")[0];
  ok(/^mes, m, apagada, quandoISO\)/.test(tocarM), "    o funil da meta aceita quandoISO");
  ok(/enfileirarToque\("meta", d, quandoISO\)/.test(tocarM), "    e o repassa ao toque");
  ok(/return iso;/.test(tocarM), "    e DEVOLVE o instante que subiu");
  /* Mesmo motivo do tocarMeta acima: o corpo cresceu na 9C-3 (ganhou a escrita
     online), entao verifica-se o CONTRATO e nao a proximidade das linhas. */
  const tocarE = fonte.split("function tocarEvento(")[1].split("\n}")[0];
  ok(/^ev, apagado, quandoISO, opts\)/.test(tocarE),
     "    o funil do evento aceita quandoISO e opts (9C-4)");
  ok(/enfileirarToque\("evento", d, quandoISO\)/.test(tocarE), "    e o repassa ao toque");
  ok(/return iso;/.test(tocarE), "    e DEVOLVE o instante que subiu");
  /* 4. NENHUM caminho novo de sincronia foi criado nesta etapa. */
  /* Esta lista cresce a cada dominio conectado — prioridade (9B), meta (9C-2),
     evento (9C-3) — e e atualizada de proposito a cada fase. O que ela guarda e
     que NENHUM dominio entre online sem uma fase que o autorize: os proximos
     (triagem, toefl, retomada, rotina, dispensa, item, estrutura_*) sao 9D. */
  const online = ((fonte + regrasSrc).match(/SYNC\.salvarAlteracao\(\s*"(\w+)"/g) || [])
    .map(x => x.match(/"(\w+)"/)[1]).sort();
  ok(JSON.stringify(online) === JSON.stringify(["dispensa", "evento", "item", "meta", "prioridade", "retomada", "rotina", "toefl", "triagem"]),
     "12. os nove dominios online (9B, 9C, 9D e o progresso da 9E)", online);
  ok(["estrutura_proj","estrutura_sub"]
       .every(d => online.indexOf(d) < 0),
     "    e nenhum dominio ainda nao autorizado foi antecipado", online);
}

console.log("\n=== 28. A vista da Revisao volta a se atualizar (9C-1) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();

  ok(typeof A.renderVistaRevisao === "function", "renderVistaRevisao existe");
  const nucleo = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "10-nucleo.js"), "utf8");
  ok(/return \["renderHoje", "renderVistaRevisao"\]/.test(nucleo),
     "2. e o aplicador remoto de prioridade a pede");
  /* MENOR REPERCUSSAO CORRETA: renderSemana NAO entra. A auditoria dizia que a
     revisao morava nele; nao mora — a linha estava no setView. */
  const render = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  /* O CORPO VAI ATE O PRIMEIRO `}` NA COLUNA 0, e nao ate o proximo `function`:
     cortar no `function` seguinte atravessa para dentro do setView e captura
     106 linhas em vez de 90 — foi o que fez esta assercao falhar por engano na
     primeira escrita. */
  const corpoDe = (fonte, nome) => fonte.split("function " + nome + "(")[1].split("\n}")[0];
  const corpoSemana = corpoDe(render, "renderSemana");
  ok(!/getPrio|getMetas|getEventos|renderRevisao/.test(corpoSemana),
     "5. renderSemana nao depende de prioridade, meta nem evento — e por isso NAO foi acrescentado",
     corpoSemana.match(/getPrio|getMetas|getEventos|renderRevisao/g));
  ok(!/renderSemana/.test(corpoDe(nucleo, "aplicarPrioridadeOnline")),
     "   nenhum render extra foi introduzido");

  /* A view escondida nao e redesenhada; a visivel e. */
  const vista = A.document.getElementById("view-revisao");
  vista.hidden = true; vista.innerHTML = "";
  A.renderVistaRevisao();
  ok(vista.innerHTML === "", "com a aba escondida, nao redesenha (nada a atualizar)");
  vista.hidden = false;
  A.renderVistaRevisao();
  ok(/Revis/.test(vista.innerHTML), "com a aba na frente, redesenha", vista.innerHTML.slice(0, 40));

  /* O caminho inteiro: chega do Realtime e a vista muda. */
  const B = criarAparelho("celular", srv).__conectar();
  await A.SYNC.assinarMudancas();
  const vistaA = A.document.getElementById("view-revisao");
  vistaA.hidden = false; vistaA.innerHTML = "";
  B.__prompt = "prioridade vinda do celular";
  B.addPrioridadeLivre();
  await B.SYNC.drenarFila();
  A.SYNC.descarregarRender(true);
  ok(/prioridade vinda do celular/.test(vistaA.innerHTML),
     "1+2. alteracao remota com a aba Revisao aberta atualiza a tela",
     vistaA.innerHTML.slice(0, 80));
  ok(A.getToques().filter(t => t.tipo === "prioridade").length === 0,
     "6. e continua sem gerar toque: nenhuma regra de negocio mudou");
}

/* ================= FASE 9C-2 — AS METAS ONLINE ================= */
const metas    = (ap, mes) => ap.getMetas(mes || ap.monthKey);
const achaMeta = (ap, id, mes) => metas(ap, mes).filter(x => x.id === id)[0] || null;
/* addMeta nasce sem texto e NAO emite toque nenhum; o primeiro editMeta e que
   publica. Este atalho reproduz o gesto real da tela: criar e nomear. */
function criarMeta(ap, texto) {
  ap.addMeta();
  const i = ap.getMetas().length - 1;
  ap.editMeta(i, texto);
  return ap.getMetas()[i].id;
}

console.log("\n=== 29. Criar, editar, concluir, desconcluir, excluir (9C-2) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();

  const id = criarMeta(A, "Submeter o artigo do patriotismo");
  await A.SYNC.drenarFila();
  const noCel = achaMeta(B, id);
  ok(!!noCel, "1. criar no Mac chega ao celular", metas(B).map(m => m.t));
  ok(noCel && noCel.t === "Submeter o artigo do patriotismo", "   com o texto certo", noCel && noCel.t);
  ok(noCel && noCel.em === achaMeta(A, id).em, "   e com o MESMO instante da decisao");

  const i = A.getMetas().findIndex(m => m.id === id);
  A.editMeta(i, "Submeter o artigo ate sexta");
  await A.SYNC.drenarFila();
  ok(achaMeta(B, id).t === "Submeter o artigo ate sexta", "2. editar chega", achaMeta(B, id).t);

  A.toggleMeta(i);
  await A.SYNC.drenarFila();
  ok(achaMeta(A, id).done === true, "3. o Mac concluiu");
  ok(achaMeta(B, id).done === true, "   e o celular recebeu done=true");

  A.toggleMeta(i);
  await A.SYNC.drenarFila();
  ok(achaMeta(A, id).done === false, "4. o Mac desconcluiu");
  ok(achaMeta(B, id).done === false, "   e o celular recebeu done=false");

  A.delMeta(i);
  await A.SYNC.drenarFila();
  ok(achaMeta(A, id) === null, "5. o Mac apagou");
  ok(achaMeta(B, id) === null, "   e sumiu do celular");
  const linha = srv.linhas.filter(l => l.dominio === "meta" && l.chave.indexOf(id) > 0)[0];
  ok(!!linha && linha.del === true, "   e a exclusao e LAPIDE, nao ausencia de linha", linha && linha.del);
  ok(!!linha && linha.chave === A.monthKey + "/" + id,
     "   a chave e AAAA-MM/mid", linha && linha.chave);
}

console.log("\n=== 30. Duas metas do mesmo mes nao se atropelam (9C-2) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await A.SYNC.assinarMudancas();
  await B.SYNC.assinarMudancas();

  const idA = criarMeta(A, "Meta do Mac");
  await A.SYNC.drenarFila();
  const idB = criarMeta(B, "Meta do celular");
  await B.SYNC.drenarFila();

  ok(idA !== idB, "sao duas metas distintas");
  ok(!!achaMeta(A, idB) && !!achaMeta(B, idA),
     "6+7. cada aparelho recebeu a do outro sem perder a sua",
     {mac: metas(A).filter(m => m.t).map(m => m.t), cel: metas(B).filter(m => m.t).map(m => m.t)});

  const chaves = srv.linhas.filter(l => l.dominio === "meta").map(l => l.chave);
  ok(chaves.length === 2, "   o servidor tem DUAS linhas, nao um retrato do mes", chaves);

  A.editMeta(A.getMetas().findIndex(m => m.id === idA), "Meta do Mac, revisada");
  await A.SYNC.drenarFila();
  ok(achaMeta(B, idA).t === "Meta do Mac, revisada" && achaMeta(B, idB).t === "Meta do celular",
     "   editar uma nao encosta na outra", metas(B).filter(m => m.t).map(m => m.t));
}

console.log("\n=== 31. A mesma meta, dois aparelhos: vence o relogio (9C-2) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  const id = criarMeta(A, "disputada");
  await A.SYNC.drenarFila();
  await B.SYNC.reconectar(true);
  ok(!!achaMeta(B, id), "os dois conhecem a meta");

  B.editMeta(B.getMetas().findIndex(m => m.id === id), "versao do celular");
  await B.SYNC.drenarFila();
  ok(achaMeta(B, id).t === "versao do celular", "8. o celular escreveu por ultimo");

  /* Uma linha ANTIGA nao pode desfazer o que ele acabou de escrever. */
  const velha = {dono: "dono-1", dominio: "meta", chave: A.monthKey + "/" + id,
                 valor: {t: "versao antiga do mac", done: false, de: null},
                 del: false, em: "2020-01-01T00:00:00.000Z", aparelho: "mac",
                 servidor_em: "2030-06-01T00:00:00.000Z"};
  const r = B.SYNC.aplicarRemoto(velha);
  ok(r.aplicou === false, "9. a linha antiga e recusada", r);
  ok(achaMeta(B, id).t === "versao do celular", "   e o texto mais novo permanece");

  const lista = B.getMetas(A.monthKey);
  ok(B.mesclarMeta(lista, id, {quando: "2020-01-01T00:00:00.000Z", t: "velha"}) === false,
     "   e o mesclarMeta a recusa sozinho — a guarda do caminho legado");
  ok(B.mesclarMeta(lista, id, {quando: "2099-01-01T00:00:00.000Z", t: "futura"}) === true,
     "   mas aceita a mais nova");
}

console.log("\n=== 32. Receber nao gera eco nem toque (9C-2) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();
  const toquesB = B.getToques().length;
  const id = criarMeta(A, "vinda do Mac");
  await A.SYNC.drenarFila();

  ok(!!achaMeta(B, id), "a meta chegou ao celular");
  ok(B.getToques().length === toquesB, "10. e NAO gerou toque no celular", B.getToques().length);
  ok(B.SYNC.situacao().fila === 0, "    nem enfileirou envio de volta");
  ok(srv.escritas === 1, "    o servidor recebeu UMA escrita, nao um laco", srv.escritas);
  const eco = A.SYNC.aplicarRemoto(srv.linhas[0]);
  ok(eco.aplicou === false && /eco/.test(eco.motivo), "    e o eco proprio e recusado no Mac", eco);
}

console.log("\n=== 33. Offline, fila e reconexao cruzada (9C-2) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();
  /* O MAC NAO ASSINA O CANAL — e o que "offline" quer dizer aqui. Com ele
     assinado, o Realtime do servidor de mentira entregaria a escrita do celular
     na hora e o cenario deixaria de existir: nao haveria nada para o delta
     recuperar, e o teste passaria provando outra coisa. */
  srv.falhar = true;
  const idA = criarMeta(A, "escrita do Mac, sem rede");
  await A.SYNC.drenarFila();
  ok(A.SYNC.situacao().fila === 1, "11. sem rede, a alteracao fica na fila", A.SYNC.situacao().fila);
  ok(!!achaMeta(A, idA), "    e existe na tela do Mac (otimista)");

  srv.falhar = false;
  const idB = criarMeta(B, "escrita do celular, com rede");
  await B.SYNC.drenarFila();
  ok(!achaMeta(A, idB), "    o Mac ainda nao sabe da meta do celular");

  await A.SYNC.reconectar(true);
  ok(!!achaMeta(A, idB), "13. o delta trouxe o que se perdeu na desconexao", metas(A).filter(m=>m.t).map(m=>m.t));
  ok(A.SYNC.situacao().fila === 0, "12. e so entao a fila subiu");
  ok(!!achaMeta(B, idA), "    e o celular recebeu a do Mac");
  ok(srv.linhas.filter(l => l.dominio === "meta").length === 2,
     "    nenhum estado foi perdido: as duas estao no servidor");
}

console.log("\n=== 34. trazerMeta e trazerTodas (9C-2) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv, {storage: {
    "cron:metas:2026-07": JSON.stringify([
      {id: "velha1", t: "pendente um",  done: false, em: "2026-07-01T00:00:00.000Z"},
      {id: "velha2", t: "pendente dois", done: false, em: "2026-07-01T00:00:00.000Z"}
    ])
  }}).__conectar();
  const B = criarAparelho("celular", srv, {storage: {
    "cron:metas:2026-07": JSON.stringify([
      {id: "velha1", t: "pendente um",  done: false, em: "2026-07-01T00:00:00.000Z"},
      {id: "velha2", t: "pendente dois", done: false, em: "2026-07-01T00:00:00.000Z"}
    ])
  }}).__conectar();
  await B.SYNC.assinarMudancas();

  A.trazerMeta(0);
  await A.SYNC.drenarFila();
  const linhas = srv.linhas.filter(l => l.dominio === "meta");
  const criada = linhas.filter(l => !l.del)[0];
  const lapide = linhas.filter(l => l.del)[0];
  ok(!!criada && criada.chave.indexOf(A.monthKey + "/") === 0,
     "14. trazerMeta CRIA no mes de destino", criada && criada.chave);
  ok(!!lapide && lapide.chave === "2026-07/velha1",
     "    e deixa LAPIDE no mes de origem", lapide && lapide.chave);
  ok(B.getMetas("2026-07").filter(m => m.id === "velha1").length === 0,
     "    o celular perdeu a da origem");
  ok(B.getMetas(A.monthKey).filter(m => m.de === "2026-07").length === 1,
     "    e ganhou a do destino", B.getMetas(A.monthKey).map(m => m.t));

  /* 15. Falha ENTRE as duas: a fila para na primeira e nada se perde. */
  const C = criarAparelho("ipad", srv, {storage: {
    "cron:metas:2026-08": JSON.stringify([
      {id: "v9", t: "outra pendente", done: false, em: "2026-08-01T00:00:00.000Z"}
    ])
  }}).__conectar();
  C.trazerMeta(C.pendencias().findIndex(o => o.meta.id === "v9"));
  ok(C.SYNC.situacao().fila === 2, "15. trazerMeta enfileira DUAS operacoes", C.SYNC.situacao().fila);
  srv.falhar = true;
  await C.SYNC.drenarFila();
  ok(C.SYNC.situacao().fila === 2, "    sem rede, as duas ficam — nada se perde");
  srv.falhar = false;
  await C.SYNC.drenarFila();
  ok(C.SYNC.situacao().fila === 0, "    e sobem juntas quando a rede volta");
  const daC = srv.linhas.filter(l => l.chave.indexOf("v9") > 0 || l.valor.t === "outra pendente");
  ok(daC.length === 2 && daC.some(l => l.del) && daC.some(l => !l.del),
     "    criacao e lapide, na ordem", daC.map(l => ({c: l.chave, del: l.del})));

  /* 16. trazerTodas com varias. */
  /* MES ANTERIOR AO CORRENTE, e nao o corrente: pendencias() varre k < monthKey.
     Metas do mes de hoje nao sao pendencias — sao as metas do mes. E o mes tem
     as suas proprias sementes (ROTEIRO/METAS_DEFAULT), entao a contagem e feita
     sobre AS TRES, e nao sobre o total de linhas do servidor. */
  const MESPEND = "2026-08";
  const D = criarAparelho("outro", srv, {storage: {
    ["cron:metas:" + MESPEND]: JSON.stringify([
      {id: "t1", t: "tres",   done: false, em: "2026-08-01T00:00:00.000Z"},
      {id: "t2", t: "quatro", done: false, em: "2026-08-01T00:00:00.000Z"},
      {id: "t3", t: "cinco",  done: false, em: "2026-08-01T00:00:00.000Z"}
    ])
  }}).__conectar();
  ok(D.pendencias().filter(o => ["t1","t2","t3"].indexOf(o.meta.id) >= 0).length === 3,
     "as tres estao pendentes antes de trazer");
  D.trazerTodas();
  await D.SYNC.drenarFila();
  const meus = ["tres", "quatro", "cinco"];
  const lapides = srv.linhas.filter(l => l.del && l.chave.indexOf(MESPEND + "/t") === 0);
  const criadas = srv.linhas.filter(l => !l.del && meus.indexOf(l.valor.t) >= 0
                                      && l.chave.indexOf(D.monthKey + "/") === 0);
  ok(lapides.length === 3 && criadas.length === 3,
     "16. trazerTodas com 3 metas produz 3 criacoes + 3 lapides",
     {lapides: lapides.length, criadas: criadas.length});
  /* TRAZER TODAS TRAZ TODAS, e a semente do ROTEIRO daquele mes e uma pendencia
     legitima como qualquer outra — metaEhSementeIntocada so vale para o acervo,
     nao para pendencias(). Entao a assercao e sobre AS MINHAS tres, e a
     propriedade do instante e verificada sobre o conjunto inteiro, que e onde
     ela realmente importa. */
  const trazidas = D.getMetas(D.monthKey).filter(m => m.de === MESPEND);
  ok(meus.every(t => trazidas.some(m => m.t === t)),
     "    as tres foram trazidas", trazidas.map(m => m.t));
  ok(trazidas.length >= 3, "    junto com as demais pendencias do mes", trazidas.length);
  const ems = trazidas.map(m => m.em);
  ok(new Set(ems).size === trazidas.length,
     "    e CADA UMA com o seu instante, sem repetir (a 9C-0 continua valendo)", ems);
  ok(D.getMetas(MESPEND).filter(m => ["t1","t2","t3"].indexOf(m.id) >= 0).length === 0,
     "    e sairam do mes de origem");
}

console.log("\n=== 35. O que a 9C-2 NAO mudou ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();

  /* 17. mes diferente nao mexe no mesAtivo. */
  const antesMes = A.mesAtivo;
  A.SYNC.aplicarRemoto({dono: "dono-1", dominio: "meta", chave: "2027-05/futura",
    valor: {t: "meta de maio de 2027", done: false, de: null}, del: false,
    em: "2027-01-01T00:00:00.000Z", aparelho: "celular", servidor_em: "2030-03-01T00:00:00.000Z"});
  ok(A.mesAtivo === antesMes, "17. meta de outro mes nao mexe no mesAtivo", A.mesAtivo);
  ok(A.getMetas("2027-05").filter(m => m.id === "futura").length === 1,
     "    mas foi gravada no mes dela", A.getMetas("2027-05").length);

  /* 18+19+20. Acervo, legado e online no mesmo ato. */
  const B = criarAparelho("celular", srv).__conectar();
  const antesToques = B.getToques().filter(t => t.tipo === "meta").length;
  const antesLinhas = srv.linhas.filter(l => l.dominio === "meta").length;
  const id = criarMeta(B, "uma meta qualquer");
  await B.SYNC.drenarFila();
  ok(B.getToques().filter(t => t.tipo === "meta").length === antesToques + 1,
     "19. o toque legado continua sendo emitido", B.getToques().filter(t => t.tipo === "meta").length);
  ok(srv.linhas.filter(l => l.dominio === "meta").length === antesLinhas + 1,
     "20. e o online tambem, no mesmo ato");
  const toque = B.getToques().filter(t => t.tipo === "meta").pop();
  const online = srv.linhas.filter(l => l.chave.indexOf(id) > 0)[0];
  ok(toque.quando === online.em, "    com o MESMO instante nos dois caminhos",
     {toque: toque.quando, online: online.em});
  ok(toque.dados.t === online.valor.t && toque.dados.done === online.valor.done,
     "    e o mesmo payload", {legado: toque.dados, online: online.valor});

  /* Eventos permanecem intocados. */
  const fonte = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  const dominiosOnline = ((fonte + regrasSrc).match(/SYNC\.salvarAlteracao\(\s*"(\w+)"/g) || [])
    .map(x => x.match(/"(\w+)"/)[1]).sort();
  ok(JSON.stringify(dominiosOnline) === JSON.stringify(["dispensa", "evento", "item", "meta", "prioridade", "retomada", "rotina", "toefl", "triagem"]),
     "13. os tres da 9C, os quatro da 9D e os dois da 9E", dominiosOnline);
  const app = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "40-app.js"), "utf8");
  const assinados = (app.match(/assinarDominio\("(\w+)"/g) || []).map(x => x.match(/"(\w+)"/)[1]).sort();
  ok(JSON.stringify(assinados) === JSON.stringify(["dispensa", "evento", "item", "meta", "prioridade", "retomada", "rotina", "toefl", "triagem"]),
     "    e os seis tem aplicador registrado", assinados);
}

console.log("\n=== 36. Um escritor e um merge, tambem para Meta (9C-2) ===");
{
  const render = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  const nucleo = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "10-nucleo.js"), "utf8");
  ok((render.match(/SYNC\.salvarAlteracao\(\s*"meta"/g) || []).length === 1,
     "18. ha UM unico ponto que escreve meta online");
  ok(/function tocarMeta[\s\S]{0,2200}SYNC\.salvarAlteracao\(\s*"meta"/.test(render),
     "    e ele e o tocarMeta, o mesmo funil do caminho legado");
  ok((render.match(/enfileirarToque\("meta"/g) || []).length === 1,
     "    e continua havendo UM enfileirarToque de meta (a 9C-0 nao regrediu)");
  ok((nucleo.match(/function mesclarMeta/g) || []).length === 1, "ha UMA implementacao de merge");
  ok(/aplicarMetasDoEstado[\s\S]*?mesclarMeta/.test(nucleo), "o caminho legado a usa");
  ok(/aplicarMetaOnline[\s\S]*?mesclarMeta/.test(nucleo), "e o online tambem");
  ok(/var iso = tocarMeta\(c\.mes, c\.m, false, ACERVO_EM\)/.test(render),
     "    e o acervo continua publicando pelo funil (9C-0 intacta)");
  /* Os renders minimos. */
  const corpo = nucleo.split("function aplicarMetaOnline(")[1].split("\n}")[0];
  ok(/renderMetas/.test(corpo) && /renderVistaRevisao/.test(corpo),
     "os renders da meta sao renderMetas e renderVistaRevisao");
  ok(!/renderSemana/.test(corpo), "e NAO renderSemana — ele nao le getMetas");
  ok(/todayIdx === 0/.test(corpo),
     "renderHoje so no domingo, o unico dia em que a revisao mora dentro dele");
}

/* ================= FASE 9C-3 — OS EVENTOS ONLINE ================= */
const eventos  = (ap) => ap.getEventos();
const achaEv   = (ap, id) => eventos(ap).filter(x => x.id === id)[0] || null;
/* addEv nasce sem nome e NAO emite toque; o primeiro editEv ou dateEv publica.
   Este atalho reproduz o gesto real da tela: criar e nomear. */
function criarEvento(ap, texto, data) {
  ap.addEv();
  const id = eventos(ap)[eventos(ap).length - 1].id;
  if (data) ap.dateEv(id, data);
  ap.editEv(id, texto);
  return id;
}

console.log("\n=== 37. Criar, editar, mover e excluir (9C-3) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();

  const id = criarEvento(A, "Defesa do pos-doc", "2027-03-10");
  await A.SYNC.drenarFila();
  const noCel = achaEv(B, id);
  ok(!!noCel, "A. criar no Mac chega ao celular", eventos(B).map(e => e.t));
  ok(noCel && noCel.t === "Defesa do pos-doc", "   com o titulo", noCel && noCel.t);
  ok(noCel && noCel.data === "2027-03-10", "   e com a data", noCel && noCel.data);
  ok(noCel && noCel.em === achaEv(A, id).em, "L. e com o MESMO instante da decisao");
  const linha = srv.linhas.filter(l => l.dominio === "evento")[0];
  ok(!!linha && linha.chave === id, "   a chave e o proprio id do evento", linha && linha.chave);

  A.editEv(id, "Defesa do pos-doc na UFRJ");
  await A.SYNC.drenarFila();
  ok(achaEv(B, id).t === "Defesa do pos-doc na UFRJ", "B. editar chega", achaEv(B, id).t);

  /* J. MOVER = editar a data. O id e estavel; nao ha criacao no destino nem
     lapide na origem, porque nao ha origem — e o mesmo evento, noutro dia. */
  A.dateEv(id, "2027-04-22");
  await A.SYNC.drenarFila();
  ok(achaEv(B, id).data === "2027-04-22", "J. mover a data chega", achaEv(B, id).data);
  ok(achaEv(B, id).id === id, "   e o evento continua sendo O MESMO (id estavel)");
  ok(srv.linhas.filter(l => l.dominio === "evento").length === 1,
     "   uma linha so: mover e edicao, nao criar+lapide",
     srv.linhas.filter(l => l.dominio === "evento").length);
  ok(achaEv(B, id).t === "Defesa do pos-doc na UFRJ", "   e o titulo sobreviveu a mudanca de data");

  A.delEv(id);
  await A.SYNC.drenarFila();
  ok(achaEv(A, id) === null, "E. o Mac apagou");
  ok(achaEv(B, id) === null, "   e sumiu do celular");
  const lap = srv.linhas.filter(l => l.dominio === "evento" && l.chave === id)[0];
  ok(!!lap && lap.del === true, "K. a exclusao e LAPIDE, nao ausencia de linha", lap && lap.del);
}

console.log("\n=== 38. Varios eventos, conflito e eco (9C-3) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await A.SYNC.assinarMudancas();
  await B.SYNC.assinarMudancas();

  const idA = criarEvento(A, "Banca de qualificacao", "2027-05-01");
  await A.SYNC.drenarFila();
  const idB = criarEvento(B, "Congresso da ANPOF", "2027-06-15");
  await B.SYNC.drenarFila();

  ok(idA !== idB, "F. sao dois eventos distintos");
  ok(!!achaEv(A, idB) && !!achaEv(B, idA),
     "   cada aparelho recebeu o do outro sem perder o seu",
     {mac: eventos(A).filter(e => e.t).map(e => e.t), cel: eventos(B).filter(e => e.t).map(e => e.t)});
  ok(srv.linhas.filter(l => l.dominio === "evento").length === 2,
     "   duas linhas no servidor, uma por evento");

  /* G. conflito: linha antiga nao vence a mais nova. */
  B.editEv(idA, "Banca de qualificacao — remarcada");
  await B.SYNC.drenarFila();
  const velha = {dono: "dono-1", dominio: "evento", chave: idA,
                 valor: {t: "Banca de qualificacao", data: "2027-05-01", priv: false},
                 del: false, em: "2020-01-01T00:00:00.000Z", aparelho: "mac",
                 servidor_em: "2030-06-01T00:00:00.000Z"};
  const r = B.SYNC.aplicarRemoto(velha);
  ok(r.aplicou === false, "G. a linha antiga e recusada", r);
  ok(achaEv(B, idA).t === "Banca de qualificacao — remarcada", "   e o texto mais novo permanece");
  const lista = B.getEventos();
  ok(B.mesclarEvento(lista, idA, {quando: "2020-01-01T00:00:00.000Z", data: "2020-01-01"}) === false,
     "   e o mesclarEvento a recusa sozinho — a guarda do caminho legado");
  ok(B.mesclarEvento(lista, idA, {quando: "2099-01-01T00:00:00.000Z", data: "2099-01-01"}) === true,
     "   mas aceita a mais nova");

  /* H. RECEBER NAO E TOCAR. A medicao cerca SO a recepcao, e sobre um evento
     NOVO que so o Mac tocou.

     POR QUE NAO SOBRE O `idA`, que os dois ja editaram: os relogios monotonicos
     sao POR APARELHO, e num teste as escritas caem todas no mesmo
     milissegundo. Medido: o `em` do celular e o da escrita seguinte do Mac
     saem IDENTICOS — e a regra e "empate fica como esta", entao a escrita do
     Mac perde. Isso e o LWW funcionando como desenhado, nao um defeito; mas
     amarrar a medicao do no-echo a essa corrida seria medir o relogio em vez de
     medir o eco. */
  const toquesB = B.getToques().length;
  const filaB = B.SYNC.situacao().fila;
  const idNovo = criarEvento(A, "Aula inaugural", "2027-08-01");
  await A.SYNC.drenarFila();
  ok(!!achaEv(B, idNovo), "   um evento novo do Mac chega ao celular", eventos(B).map(e => e.t));
  ok(B.getToques().length === toquesB,
     "H. e receber NAO gerou toque nenhum no celular", B.getToques().length - toquesB);
  ok(B.SYNC.situacao().fila === filaB, "   nem enfileirou envio de volta");
  const eco = A.SYNC.aplicarRemoto(srv.linhas.filter(l => l.chave === idNovo)[0]);
  ok(eco.aplicou === false && /eco/.test(eco.motivo), "   e o eco proprio e recusado no Mac", eco);
}

console.log("\n=== 39. Offline e reconexao (9C-3) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();
  /* O Mac nao assina: e o que "desconectado" quer dizer aqui. */

  srv.falhar = true;
  const idA = criarEvento(A, "Prova do TOEFL remarcada", "2027-02-08");
  await A.SYNC.drenarFila();
  ok(A.SYNC.situacao().fila > 0, "I. sem rede, a alteracao fica na fila", A.SYNC.situacao().fila);
  ok(!!achaEv(A, idA), "   e existe na tela do Mac (otimista)");

  srv.falhar = false;
  const idB = criarEvento(B, "Entrevista em Northwestern", "2027-02-20");
  await B.SYNC.drenarFila();
  ok(!achaEv(A, idB), "   o Mac ainda nao sabe do evento do celular");

  await A.SYNC.reconectar(true);
  ok(!!achaEv(A, idB), "I. o delta trouxe o que se perdeu", eventos(A).filter(e => e.t).map(e => e.t));
  ok(A.SYNC.situacao().fila === 0, "   e so entao a fila subiu");
  ok(!!achaEv(B, idA), "   e o celular recebeu o do Mac");
}

console.log("\n=== 40. Privacidade: a fronteira nao foi ampliada (9C-3) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();

  const id = criarEvento(A, "Consulta medica", "2027-01-20");
  await A.SYNC.drenarFila();
  ok(achaEv(B, id).t === "Consulta medica", "publico: o titulo viaja, como sempre");

  A.privEv(id);                       /* o confirm() do harness devolve true */
  await A.SYNC.drenarFila();
  ok(achaEv(A, id).priv === true, "O. o Mac marcou como privado");
  const linha = srv.linhas.filter(l => l.chave === id)[0];
  ok(linha.valor.priv === true, "   a MARCA sobe", linha.valor);
  /* ESTA ASSERCAO INVERTEU NA 9C-4, de proposito. Ate a 9C-3 o titulo privado
     nao subia a lugar nenhum; agora ele sobe para o registro ONLINE, que e
     privado por RLS, e continua fora do caminho legado. O que a secao guarda
     passou a ser a fronteira nova, e ela e verificada nos dois lados. */
  ok(Object.prototype.hasOwnProperty.call(linha.valor, "t"),
     "O. o titulo sobe para o registro ONLINE (9C-4)", Object.keys(linha.valor));
  const toquePriv = A.getToques().filter(t => t.tipo === "evento" && t.dados.eid === id).pop();
  ok(!("t" in toquePriv.dados),
     "O. e NAO sobe no payload legado — a fronteira publica nao mudou", Object.keys(toquePriv.dados));
  ok(achaEv(B, id).priv === true, "   o celular recebeu a marca");

  /* O titulo que o celular JA tinha nao pode ser apagado pela descida. */
  ok(achaEv(B, id).t === "Consulta medica",
     "O. e o titulo que o celular ja tinha NAO foi apagado", achaEv(B, id).t);

  /* Renomear um privado que ja subiu nao publica nada de novo. */
  const antes = srv.linhas.filter(l => l.chave === id)[0].em;
  const toquesAntes = A.getToques().filter(t => t.tipo === "evento" && t.dados.eid === id).length;
  A.__armazem["cron:la-fora"] = JSON.stringify({metas:{}, eventos:{[id]:{q:antes,t:false,p:true}}, piso:0});
  A.editEv(id, "Consulta com o cardiologista");
  await A.SYNC.drenarFila();
  const depois = srv.linhas.filter(l => l.chave === id)[0];
  /* TAMBEM INVERTEU NA 9C-4: renomear um privado ja publicado passou a gerar
     escrita ONLINE (era a lacuna que a 9C-3 deixou), e continua NAO gerando
     toque legado — que e o que protege o repositorio publico. */
  ok(depois.em !== antes, "   renomear um privado ja publicado ATUALIZA o online (9C-4)", depois.em);
  ok(depois.valor.t === "Consulta com o cardiologista",
     "   com o nome novo", depois.valor.t);
  ok(A.getToques().filter(t => t.tipo === "evento" && t.dados.eid === id).length === toquesAntes,
     "   e NAO gera toque legado — o repositorio publico nao ve nada");
  ok(achaEv(A, id).t === "Consulta com o cardiologista", "   e o nome novo fica no aparelho");

  /* A garantia estrutural: o payload nem monta o campo. */
  const regras = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "20-regras.js"), "utf8");
  ok(/if\(!ev\.priv\) d\.t = ev\.t \|\| "";/.test(regras),
     "   dadosDoEvento nao MONTA o `t` quando priv — nao ha segundo filtro a esquecer");
}

console.log("\n=== 41. Legado e online no mesmo ato, e o que nao mudou (9C-3) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const antesToques = A.getToques().filter(t => t.tipo === "evento").length;
  const id = criarEvento(A, "Prazo da FAPERJ", "2026-12-15");
  await A.SYNC.drenarFila();

  const toques = A.getToques().filter(t => t.tipo === "evento");
  ok(toques.length > antesToques, "M. o toque legado continua sendo emitido", toques.length);
  const online = srv.linhas.filter(l => l.chave === id)[0];
  const ultimo = toques[toques.length - 1];
  ok(ultimo.quando === online.em, "M. com o MESMO ISO nos dois caminhos",
     {legado: ultimo.quando, online: online.em});
  ok(ultimo.dados.data === online.valor.data && ultimo.dados.t === online.valor.t,
     "   e o mesmo payload", {legado: ultimo.dados, online: online.valor});
  ok(typeof A.aplicarEventosDoEstado === "function", "   a descida pelo estado.json continua existindo");

  /* O evento NAO tem `done`: nao existe concluir/desconcluir neste dominio. */
  ok(!("done" in (A.getEventos()[0] || {})),
     "C/D. o modelo de evento nao tem `done` — nao ha o que concluir",
     Object.keys(A.getEventos()[0] || {}));
  ok(typeof A.toggleEv === "undefined" && typeof A.concluirEv === "undefined",
     "     e nao existe handler de conclusao");

  /* Os tres dominios online, e so eles. */
  const render = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  const app = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "40-app.js"), "utf8");
  const dominios = ((render + regrasSrc).match(/SYNC\.salvarAlteracao\(\s*"(\w+)"/g) || [])
    .map(x => x.match(/"(\w+)"/)[1]).sort();
  ok(JSON.stringify(dominios) === JSON.stringify(["dispensa", "evento", "item", "meta", "prioridade", "retomada", "rotina", "toefl", "triagem"]),
     "os nove dominios de estado escrevem online", dominios);
  const assinados = (app.match(/assinarDominio\("(\w+)"/g) || []).map(x => x.match(/"(\w+)"/)[1]).sort();
  ok(JSON.stringify(assinados) === JSON.stringify(["dispensa", "evento", "item", "meta", "prioridade", "retomada", "rotina", "toefl", "triagem"]),
     "   e os nove tem aplicador registrado", assinados);
}

console.log("\n=== 42. Um escritor e um merge, tambem para Evento (9C-3) ===");
{
  const render = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  const nucleo = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "10-nucleo.js"), "utf8");
  ok((render.match(/SYNC\.salvarAlteracao\(\s*"evento"/g) || []).length === 1,
     "ha UM unico ponto que escreve evento online");
  ok((render.match(/enfileirarToque\("evento"/g) || []).length === 1,
     "e UM unico enfileirarToque de evento (a 9C-0 nao regrediu)");
  ok(/function tocarEvento[\s\S]{0,2200}SYNC\.salvarAlteracao\(\s*"evento"/.test(render),
     "e ele e o tocarEvento, o mesmo funil do caminho legado");
  ok((nucleo.match(/function mesclarEvento/g) || []).length === 1, "ha UMA implementacao de merge");
  ok(/aplicarEventosDoEstado[\s\S]*?mesclarEvento/.test(nucleo), "o caminho legado a usa");
  ok(/aplicarEventoOnline[\s\S]*?mesclarEvento/.test(nucleo), "e o online tambem");
  ok(/var iso = tocarEvento\(ev, false, x\.novo \? ACERVO_EM : null\)/.test(render),
     "e o acervo continua publicando pelo funil (9C-0 intacta)");

  const corpo = nucleo.split("function aplicarEventoOnline(")[1].split("\n}")[0];
  ok(/renderEventos/.test(corpo) && /renderVistaRevisao/.test(corpo),
     "N. os renders sao renderEventos e renderVistaRevisao");
  ok(!/renderSemana/.test(corpo), "   e NAO renderSemana — ele nao le getEventos");
  ok(/todayIdx === 0/.test(corpo), "   renderHoje so no domingo");
  /* A clausula que protege o titulo local nao pode ser simplificada. */
  const merge = nucleo.split("function mesclarEvento(")[1].split("\n}")[0];
  ok(/typeof r\.t === "string"/.test(merge),
     "   e o merge distingue `t` vazio de `t` ausente — apagar um titulo e um ato");
  ok(/if\(!r\.data\) return false;/.test(merge), "   evento sem data continua sendo ignorado");
}

console.log("\n=== 43. O titulo privado no caminho online (9C-4) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();
  const toqueDe = (ap, id) => ap.getToques().filter(t => t.tipo === "evento" && t.dados.eid === id);
  const linhaDe = (id) => srv.linhas.filter(l => l.dominio === "evento" && l.chave === id)[0];

  /* A. publico: o titulo viaja pelos DOIS caminhos, como sempre. */
  const id = criarEvento(A, "Retiro de casais", "2027-07-10");
  await A.SYNC.drenarFila();
  ok(achaEv(B, id).t === "Retiro de casais", "A. publico: o titulo chega ao outro aparelho");
  ok(toqueDe(A, id).some(t => t.dados.t === "Retiro de casais"),
     "   e viaja tambem no payload legado");
  ok(linhaDe(id).valor.t === "Retiro de casais", "   e no online");

  /* B + D. marcar privado: a marca viaja pelos dois; o titulo, so pelo online. */
  const antesToques = toqueDe(A, id).length;
  A.privEv(id);
  await A.SYNC.drenarFila();
  const toquePriv = toqueDe(A, id)[toqueDe(A, id).length - 1];
  ok(toqueDe(A, id).length === antesToques + 1, "B. marcar privado gera um toque legado");
  ok(toquePriv.dados.priv === true, "   com a MARCA", toquePriv.dados);
  ok(!("t" in toquePriv.dados),
     "C. e SEM o titulo — o campo nem existe no payload legado", Object.keys(toquePriv.dados));
  ok(achaEv(B, id).priv === true, "   o celular recebeu a marca");
  ok(linhaDe(id).valor.priv === true && linhaDe(id).valor.t === "Retiro de casais",
     "D. e o titulo esta no registro ONLINE", linhaDe(id).valor);

  /* E. editar o titulo enquanto privado: sincroniza online, nao vaza no legado. */
  A.__armazem["cron:la-fora"] = JSON.stringify(
    {metas:{}, eventos:{[id]:{q:linhaDe(id).em, t:false, p:true}}, piso:0});
  const antes2 = toqueDe(A, id).length;
  A.editEv(id, "Retiro de casais — Igreja de Nova Iguacu");
  await A.SYNC.drenarFila();
  ok(toqueDe(A, id).length === antes2,
     "E/C. renomear um privado ja publicado NAO gera toque legado", toqueDe(A, id).length - antes2);
  ok(linhaDe(id).valor.t === "Retiro de casais — Igreja de Nova Iguacu",
     "E. mas ATUALIZA o registro online", linhaDe(id).valor.t);
  ok(achaEv(B, id).t === "Retiro de casais — Igreja de Nova Iguacu",
     "D. e o nome novo chega ao outro aparelho autorizado", achaEv(B, id).t);
  ok(achaEv(B, id).priv === true, "   ainda marcado como privado la");

  /* K. em NENHUM toque de evento deste aparelho ha titulo de evento privado. */
  const vazando = A.getToques().filter(t => t.tipo === "evento" && t.dados.priv && "t" in t.dados);
  ok(vazando.length === 0, "K. nenhum toque legado carrega titulo de evento privado", vazando);

  /* F. reconectar recupera o titulo privado. */
  const C = criarAparelho("ipad", srv).__conectar();
  ok(!achaEv(C, id) || !achaEv(C, id).t, "um aparelho novo comeca sem o titulo");
  await C.SYNC.reconectar(true);
  ok(achaEv(C, id) && achaEv(C, id).t === "Retiro de casais — Igreja de Nova Iguacu",
     "F. reconectar recupera o titulo privado pelo delta", achaEv(C, id) && achaEv(C, id).t);
  ok(achaEv(C, id).priv === true, "   com a marca de privado junto");

  /* G. tornar publico de novo: o titulo volta a poder ser publicado. */
  const antes3 = toqueDe(A, id).length;
  A.privEv(id);
  await A.SYNC.drenarFila();
  const toquePub = toqueDe(A, id)[toqueDe(A, id).length - 1];
  ok(toqueDe(A, id).length === antes3 + 1, "G. tornar publico gera toque legado");
  ok(toquePub.dados.priv === false, "   com priv=false");
  ok(toquePub.dados.t === "Retiro de casais — Igreja de Nova Iguacu",
     "G. e agora o titulo VIAJA no payload legado", toquePub.dados.t);
  ok(achaEv(B, id).priv === false && achaEv(B, id).t === "Retiro de casais — Igreja de Nova Iguacu",
     "   e os dois aparelhos convergem", achaEv(B, id));

  /* H. exclusao: lapide, e sem deixar o titulo na tabela. */
  A.delEv(id);
  await A.SYNC.drenarFila();
  ok(achaEv(A, id) === null && achaEv(B, id) === null, "H. apagar remove nos dois aparelhos");
  ok(linhaDe(id).del === true, "   a lapide fica");
  ok(!("t" in linhaDe(id).valor),
     "H. e a lapide NAO carrega o titulo — o conteudo privado sai da tabela",
     linhaDe(id).valor);
}

console.log("\n=== 44. Conflito, eco e limites da 9C-4 ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();
  const id = criarEvento(A, "Consulta", "2027-09-09");
  A.privEv(id);
  await A.SYNC.drenarFila();
  const toquesB = B.getToques().length;

  /* I. o relogio continua decidindo, tambem para o titulo privado. */
  const velha = {dono: "dono-1", dominio: "evento", chave: id,
                 valor: {t: "titulo antigo", data: "2027-09-09", priv: true},
                 del: false, em: "2020-01-01T00:00:00.000Z", aparelho: "mac",
                 servidor_em: "2030-07-01T00:00:00.000Z"};
  const r = B.SYNC.aplicarRemoto(velha);
  ok(r.aplicou === false, "I. linha antiga com titulo privado e recusada", r);
  ok(achaEv(B, id).t === "Consulta", "   e o titulo mais novo permanece", achaEv(B, id).t);

  /* J. no-echo. */
  const idNovo = criarEvento(A, "Outra consulta", "2027-10-10");
  A.privEv(idNovo);
  await A.SYNC.drenarFila();
  ok(achaEv(B, idNovo).t === "Outra consulta", "   um privado novo chega ao celular");
  ok(B.getToques().length === toquesB, "J. e receber nao gerou toque no celular",
     B.getToques().length - toquesB);
  ok(B.SYNC.situacao().fila === 0, "   nem enfileirou envio de volta");

  /* AUSENCIA vs VAZIO continua distinguida: apagar um titulo e um ato. */
  const lista = B.getEventos();
  ok(B.mesclarEvento(lista, id, {quando: "2099-01-01T00:00:00.000Z", data: "2027-09-09", priv: true}) === true,
     "sem `t` no registro, a data desce e o titulo local fica");
  ok(lista.filter(e => e.id === id)[0].t === "Consulta", "   o titulo local sobreviveu");
  ok(B.mesclarEvento(lista, id, {quando: "2099-02-01T00:00:00.000Z", data: "2027-09-09", priv: true, t: ""}) === true,
     "com `t` vazio, apagar o titulo E um ato");
  ok(lista.filter(e => e.id === id)[0].t === "", "   e ele e apagado", lista.filter(e => e.id === id)[0].t);

  /* L. nenhum dominio da 9D foi antecipado. */
  const render = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  const online = ((render + regrasSrc).match(/SYNC\.salvarAlteracao\(\s*"(\w+)"/g) || [])
    .map(x => x.match(/"(\w+)"/)[1]).sort();
  ok(JSON.stringify(online) === JSON.stringify(["dispensa", "evento", "item", "meta", "prioridade", "retomada", "rotina", "toefl", "triagem"]),
     "L. nove dominios online — a 9E acrescentou item e toefl", online);
}

console.log("\n=== 45. A fronteira publica, verificada nos artefatos (9C-4) ===");
{
  /* As perguntas de privacidade da 9C-4, respondidas contra o codigo e nao
     contra a intencao. */
  const regras = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "20-regras.js"), "utf8");
  const render = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  const dobra  = fs.readFileSync(path.join(RAIZ, "scripts", "dobrar_toques.py"), "utf8");
  const sql    = fs.readFileSync(path.join(RAIZ, "sql", "cron_estado.sql"), "utf8");

  ok(/if\(!ev\.priv\) d\.t = ev\.t \|\| "";/.test(regras),
     "1/4. dadosDoEvento (payload legado) nao MONTA o titulo quando priv");
  ok(/if not d\.get\("priv"\) and isinstance\(d\.get\("t"\), str\):/.test(dobra),
     "1. e a dobra tambem o recusa — dois guardas independentes no cano publico");
  /* O cron:la-fora guarda so um booleano `t`, nunca o texto. */
  ok(/t:\(!ev\.priv && !!String\(ev\.t\|\|""\)\.trim\(\)\)/.test(render.replace(/\s/g, "")) ||
     /marcarLaForaLocal\("eventos", ev\.id, \{q:iso, t:\(!ev\.priv/.test(render),
     "3. cron:la-fora guarda um booleano, nunca o texto do titulo");
  /* O titulo privado so entra no payload ONLINE, e a partir de ev.t. */
  const tocar = render.split("function tocarEvento(")[1].split("\n}")[0];
  ok(/if\(!apagado\) valor\.t = ev\.t \|\| "";/.test(tocar),
     "5. o titulo entra no registro online — e so ali");
  ok(!/valor\.t = d\.t/.test(tocar),
     "   lido de ev.t e nao de d.t: `d` e o payload publico e nele o campo nao existe");
  /* 6. Quem pode ler cron_estado. */
  ok(/using \(dono = auth\.uid\(\) and cron_e_dono\(\)\)/.test(sql),
     "6. a leitura de cron_estado exige dono = auth.uid() E a allowlist");
  ok(!/create policy[^;]*cron_estado[^;]*to anon/.test(sql),
     "   e nao ha politica nenhuma para o papel anon");
  ok(/revoke all on public\.cron_estado\s+from anon;/.test(sql),
     "   com revoke explicito");
}

/* ================= FASE 9D (1 de 5) — A TRIAGEM DAS VAGAS ================= */
const triagem  = (ap) => ap.vgTriagem();
const stDe     = (ap, vid) => ap.vgEstado(vid);
const linhaTri = (srv, vid) => srv.linhas.filter(l => l.dominio === "triagem" && l.chave === vid)[0];

console.log("\n=== 46. Registrar, mudar e propagar a decisao (9D) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();
  const VAGA = "philjobs-31649";

  ok(stDe(B, VAGA) === A.VG_ST.NOVO, "o celular comeca sem decisao sobre a vaga");

  A.vgMarcar(VAGA, A.VG_ST.SIM);
  await A.SYNC.drenarFila();
  ok(stDe(A, VAGA) === A.VG_ST.SIM, "A. o Mac decidiu 'vou me candidatar'");
  ok(stDe(B, VAGA) === A.VG_ST.SIM, "C. e a decisao chegou ao celular", stDe(B, VAGA));
  ok(triagem(B)[VAGA].em === triagem(A)[VAGA].em,
     "L. com o MESMO instante da decisao", triagem(B)[VAGA]);

  const l = linhaTri(srv, VAGA);
  ok(!!l && l.chave === VAGA, "M. a chave online e o ID DA VAGA", l && l.chave);
  ok(JSON.stringify(Object.keys(l.valor)) === JSON.stringify(["st"]),
     "N. e o valor leva SO a decisao — nada de veredicto", Object.keys(l.valor));

  A.vgMarcar(VAGA, A.VG_ST.NAO);
  await A.SYNC.drenarFila();
  ok(stDe(A, VAGA) === A.VG_ST.NAO && stDe(B, VAGA) === A.VG_ST.NAO,
     "B. mudar a decisao propaga", stDe(B, VAGA));

  /* Tocar de novo desmarca: st 0 e um VALOR, nao uma exclusao. */
  A.vgMarcar(VAGA, A.VG_ST.NAO);
  await A.SYNC.drenarFila();
  ok(stDe(A, VAGA) === A.VG_ST.NOVO, "   tocar de novo desmarca, como sempre");
  ok(stDe(B, VAGA) === A.VG_ST.NOVO, "   e o desmarcar tambem viaja", stDe(B, VAGA));
  ok(linhaTri(srv, VAGA).del === false,
     "   sem lapide: descartar uma vaga nao a apaga do lote", linhaTri(srv, VAGA).del);
}

console.log("\n=== 47. Varias vagas, conflito, empate e eco (9D) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await A.SYNC.assinarMudancas();
  await B.SYNC.assinarMudancas();

  A.vgMarcar("vaga-1", A.VG_ST.SIM);
  await A.SYNC.drenarFila();
  B.vgMarcar("vaga-2", B.VG_ST.NAO);
  await B.SYNC.drenarFila();
  ok(stDe(A, "vaga-1") === 1 && stDe(A, "vaga-2") === 2,
     "D. o Mac tem as duas decisoes", [stDe(A, "vaga-1"), stDe(A, "vaga-2")]);
  ok(stDe(B, "vaga-1") === 1 && stDe(B, "vaga-2") === 2, "   e o celular tambem");
  ok(srv.linhas.filter(l => l.dominio === "triagem").length === 2,
     "   duas linhas no servidor, uma por vaga");

  /* E/G. relogio: linha antiga recusada. */
  const velha = {dono: "dono-1", dominio: "triagem", chave: "vaga-1",
                 valor: {st: 2}, del: false, em: "2020-01-01T00:00:00.000Z",
                 aparelho: "mac", servidor_em: "2030-08-01T00:00:00.000Z"};
  const r = B.SYNC.aplicarRemoto(velha);
  ok(r.aplicou === false, "G. a linha antiga e recusada", r);
  ok(stDe(B, "vaga-1") === 1, "   e a decisao mais nova permanece");

  /* F. empate fica como esta. */
  const emAtual = triagem(B)["vaga-1"].em;
  const lista = B.vgTriagem();
  ok(B.mesclarTriagem(lista, "vaga-1", {quando: emAtual, st: 3}) === false,
     "F. empate exato nao muda nada");
  ok(B.mesclarTriagem(lista, "vaga-1", {quando: "2099-01-01T00:00:00.000Z", st: 3}) === true,
     "E. mas o mais novo vence");

  /* J+K. no-echo, e receber nao e tocar. */
  const toquesB = B.getToques().length;
  const filaB = B.SYNC.situacao().fila;
  A.vgMarcar("vaga-3", A.VG_ST.ARQ);
  await A.SYNC.drenarFila();
  ok(stDe(B, "vaga-3") === 3, "   a terceira decisao chegou ao celular");
  ok(B.getToques().length === toquesB, "K. e NAO gerou toque no celular",
     B.getToques().length - toquesB);
  ok(B.SYNC.situacao().fila === filaB, "   nem enfileirou envio de volta");
  const eco = A.SYNC.aplicarRemoto(linhaTri(srv, "vaga-3"));
  ok(eco.aplicou === false && /eco/.test(eco.motivo), "J. e o eco proprio e recusado", eco);
}

console.log("\n=== 48. Offline, fila e delta antes da fila (9D) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();
  /* O Mac NAO assina: e o que "desconectado" quer dizer aqui. */

  srv.falhar = true;
  A.vgMarcar("vaga-X", A.VG_ST.SIM);
  await A.SYNC.drenarFila();
  ok(stDe(A, "vaga-X") === 1, "H. sem rede, a decisao aparece na tela do Mac (otimista)");
  ok(A.SYNC.situacao().fila === 1, "   e fica na fila", A.SYNC.situacao().fila);

  srv.falhar = false;
  B.vgMarcar("vaga-Y", B.VG_ST.NAO);
  await B.SYNC.drenarFila();
  ok(stDe(A, "vaga-Y") === 0, "   o Mac ainda nao sabe da decisao do celular");

  await A.SYNC.reconectar(true);
  ok(stDe(A, "vaga-Y") === 2, "I. o delta de Y chegou ANTES de a fila de X subir",
     stDe(A, "vaga-Y"));
  ok(A.SYNC.situacao().fila === 0, "H. e so entao a fila subiu");
  ok(stDe(B, "vaga-X") === 1, "   e o celular recebeu a do Mac");
  ok(srv.linhas.filter(l => l.dominio === "triagem").length === 2,
     "   nenhuma decisao foi perdida");
}

console.log("\n=== 49. O que a 9D NAO mudou (9D) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();

  /* N. veredicto e triagem sao eixos separados: o veredicto vem do coletor,
     em dados/vagas.json, e nao passa por aqui. */
  A.vgMarcar("vaga-Z", A.VG_ST.SIM);
  await A.SYNC.drenarFila();
  const l = linhaTri(srv, "vaga-Z");
  ["veredicto", "t", "titulo", "prazo", "url", "novo", "urgente"].forEach(function (campo) {
    ok(!(campo in l.valor), "N. `" + campo + "` nao viaja na triagem", Object.keys(l.valor));
  });

  /* O toque legado e o online carregam o mesmo instante e o mesmo payload. */
  const toque = A.getToques().filter(t => t.tipo === "triagem").pop();
  ok(toque.quando === l.em, "L. legado e online com o MESMO ISO",
     {legado: toque.quando, online: l.em});
  ok(toque.dados.vid === l.chave && toque.dados.st === l.valor.st,
     "   e o mesmo payload", {legado: toque.dados, online: l.valor});
  ok(typeof A.aplicarTriagemDoEstado === "function",
     "   a descida pelo estado.json continua existindo");

  /* O. nenhum dominio posterior da 9D/9E foi antecipado. */
  const render = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  const app = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "40-app.js"), "utf8");
  const online = ((render + regrasSrc).match(/SYNC\.salvarAlteracao\(\s*"(\w+)"/g) || [])
    .map(x => x.match(/"(\w+)"/)[1]).sort();
  ok(JSON.stringify(online) === JSON.stringify(["dispensa", "evento", "item", "meta", "prioridade", "retomada", "rotina", "toefl", "triagem"]),
     "O. nove dominios online: 9C, 9D e o progresso da 9E", online);
  ok(["estrutura_proj", "estrutura_sub"]
       .every(d => online.indexOf(d) < 0),
     "O. e a ESTRUTURA nao foi antecipada: ela espera o merge de tres vias", online);
  const assinados = (app.match(/assinarDominio\("(\w+)"/g) || []).map(x => x.match(/"(\w+)"/)[1]).sort();
  ok(JSON.stringify(assinados) === JSON.stringify(["dispensa", "evento", "item", "meta", "prioridade", "retomada", "rotina", "toefl", "triagem"]),
     "   e os nove tem aplicador registrado", assinados);
}

console.log("\n=== 50. Um escritor e um merge, tambem para a Triagem (9D) ===");
{
  const render = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  const nucleo = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "10-nucleo.js"), "utf8");
  ok((render.match(/SYNC\.salvarAlteracao\(\s*"triagem"/g) || []).length === 1,
     "ha UM unico ponto que escreve triagem online");
  /* Ate a 9D havia DOIS enfileirarToque de triagem: o vgMarcar e a migracao. */
  const toquesRender = (render.match(/enfileirarToque\("triagem"/g) || []).length;
  const toquesNucleo = (nucleo.match(/enfileirarToque\("triagem"/g) || []).length;
  ok(toquesRender + toquesNucleo === 1,
     "e UM unico enfileirarToque de triagem (a migracao passou a usar o funil)",
     {render: toquesRender, nucleo: toquesNucleo});
  ok(/migrarTriagemUmaVez[\s\S]*?tocarTriagem\(vid, r\.st, em\)/.test(nucleo),
     "e a migracao das marcacoes antigas passa pelo funil");
  ok(/function tocarTriagem[\s\S]{0,1400}SYNC\.salvarAlteracao\(\s*"triagem"/.test(render),
     "o escritor e o tocarTriagem, e o vgMarcar passa por ele");
  const vg = render.split("function vgMarcar(")[1].split("\n}")[0];
  ok(/var iso = tocarTriagem\(id, st\)/.test(vg), "   o vgMarcar chama o funil");
  ok(!/new Date\(\)\.toISOString\(\)/.test(vg.split("iso ? new Date(iso)")[0]),
     "   e nao carimba um `em` proprio antes dele");
  ok((nucleo.match(/function mesclarTriagem/g) || []).length === 1, "ha UMA implementacao de merge");
  ok(/aplicarTriagemDoEstado[\s\S]*?mesclarTriagem/.test(nucleo), "o caminho legado a usa");
  ok(/aplicarTriagemOnline[\s\S]*?mesclarTriagem/.test(nucleo), "e o online tambem");

  /* Os renders, todos comprovados por leitura de vgEstado(). */
  const corpo = nucleo.split("function aplicarTriagemOnline(")[1].split("\n}")[0];
  ["renderVistaVagas", "renderHoje", "renderSemana", "renderVistaRevisao"].forEach(function (r) {
    ok(corpo.indexOf(r) > -1, "o aplicador pede " + r);
  });
  const regras = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "20-regras.js"), "utf8");
  const corpoDe = (fonte, nome) => fonte.split("function " + nome + "(")[1].split("\n}")[0];
  ok(/vgEstado/.test(corpoDe(render, "renderSemana")),
     "   e renderSemana ENTRA por prova: ele le vgEstado (ao contrario de meta e evento)");
  ok(/vgEstado/.test(corpoDe(regras, "revisaoDaSemana")), "   a revisao tambem le vgEstado");
  ok(/vgEstado/.test(corpoDe(regras, "contagemDeVagas")),
     "   e o indicador do Hoje passa pelo contagemDeVagas");
}

/* ================= FASE 9D (2 de 5) — AS RETOMADAS SILENCIADAS ================= */
const silencio  = (ap, pid, projId) => ap.retomadasAdiadas()[pid + "/" + projId] || null;
const linhaRet  = (srv, chave) => srv.linhas.filter(l => l.dominio === "retomada" && l.chave === chave)[0];

console.log("\n=== 51. Silenciar propaga entre aparelhos (9D.2) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();
  const CHAVE = "pipeline/a01";

  ok(silencio(B, "pipeline", "a01") === null, "o celular comeca sem silencio sobre o a01");

  A.adiarRetomada("pipeline", "a01");
  await A.SYNC.drenarFila();
  const noMac = silencio(A, "pipeline", "a01");
  const noCel = silencio(B, "pipeline", "a01");
  ok(!!noMac && /^\d{4}-\d{2}-\d{2}$/.test(noMac.ate), "o Mac silenciou ate uma data", noMac);
  ok(!!noCel, "e o silencio chegou ao celular", noCel);
  ok(noCel.ate === noMac.ate, "com a MESMA data absoluta", {mac: noMac.ate, cel: noCel.ate});
  ok(noCel.em === noMac.em, "e o MESMO instante da decisao");

  const l = linhaRet(srv, CHAVE);
  ok(!!l && l.chave === CHAVE, "a chave online e painel/projeto", l && l.chave);
  ok(JSON.stringify(Object.keys(l.valor)) === JSON.stringify(["ate"]),
     "e o valor leva SO o `ate` — nem titulo nem estagio", Object.keys(l.valor));
  ok(l.del === false, "sem lapide: nao existe operacao de dessilenciar", l.del);
}

console.log("\n=== 52. Relogio, eco e ausencia de toque ao receber (9D.2) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await A.SYNC.assinarMudancas();
  await B.SYNC.assinarMudancas();

  A.adiarRetomada("pipeline", "a01");
  await A.SYNC.drenarFila();
  B.adiarRetomada("leituras", "l1");
  await B.SYNC.drenarFila();
  ok(!!silencio(A, "leituras", "l1") && !!silencio(B, "pipeline", "a01"),
     "dois silencios independentes convivem nos dois aparelhos");
  ok(srv.linhas.filter(l => l.dominio === "retomada").length === 2,
     "duas linhas no servidor, uma por projeto");

  /* Linha antiga nao vence a mais nova. */
  const emAtual = silencio(B, "pipeline", "a01").em;
  const velha = {dono: "dono-1", dominio: "retomada", chave: "pipeline/a01",
                 valor: {ate: "2020-01-01"}, del: false, em: "2020-01-01T00:00:00.000Z",
                 aparelho: "mac", servidor_em: "2030-09-01T00:00:00.000Z"};
  const r = B.SYNC.aplicarRemoto(velha);
  ok(r.aplicou === false, "a linha antiga e recusada", r);
  ok(silencio(B, "pipeline", "a01").em === emAtual, "e o silencio mais novo permanece");

  /* Empate e mais-novo, direto no merge. */
  const m = B.retomadasAdiadas();
  ok(B.mesclarRetomada(m, "pipeline/a01", {quando: emAtual, ate: "2099-01-01"}) === false,
     "empate exato nao muda nada");
  ok(B.mesclarRetomada(m, "pipeline/a01", {quando: "2099-01-01T00:00:00.000Z", ate: "2099-01-01"}) === true,
     "mas o mais novo vence");
  ok(B.mesclarRetomada(m, "pipeline/a01", {quando: "2099-02-01T00:00:00.000Z"}) === false,
     "e sem `ate` nao ha silencio a aplicar");

  /* A FORMA ANTIGA (string) continua sendo lida — a clausula que nao pode ser
     simplificada. Uma entrada string vale como "sem instante", entao qualquer
     coisa com `quando` vence. */
  const m2 = {"tecnico/p1": "2027-01-01"};
  ok(B.mesclarRetomada(m2, "tecnico/p1", {quando: "2026-01-01T00:00:00.000Z", ate: "2026-06-01"}) === true,
     "a entrada em forma ANTIGA (string) e tratada como sem instante");
  ok(m2["tecnico/p1"].em === "2026-01-01T00:00:00.000Z", "e vira a forma nova", m2["tecnico/p1"]);

  /* Receber nao e tocar; eco proprio recusado. */
  const toquesB = B.getToques().length, filaB = B.SYNC.situacao().fila;
  A.adiarRetomada("posdoc", "pd1");
  await A.SYNC.drenarFila();
  ok(!!silencio(B, "posdoc", "pd1"), "o terceiro silencio chegou ao celular");
  ok(B.getToques().length === toquesB, "e NAO gerou toque no celular",
     B.getToques().length - toquesB);
  ok(B.SYNC.situacao().fila === filaB, "nem enfileirou envio de volta");
  const eco = A.SYNC.aplicarRemoto(linhaRet(srv, "posdoc/pd1"));
  ok(eco.aplicou === false && /eco/.test(eco.motivo), "e o eco proprio e recusado", eco);
}

console.log("\n=== 53. Offline, fila e delta antes da fila (9D.2) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();
  /* O Mac NAO assina: e o que "desconectado" quer dizer aqui. */

  srv.falhar = true;
  A.adiarRetomada("pipeline", "a01");
  await A.SYNC.drenarFila();
  ok(!!silencio(A, "pipeline", "a01"), "sem rede, o silencio vale na hora no Mac");
  ok(A.SYNC.situacao().fila === 1, "e fica na fila", A.SYNC.situacao().fila);

  srv.falhar = false;
  B.adiarRetomada("leituras", "l1");
  await B.SYNC.drenarFila();
  ok(silencio(A, "leituras", "l1") === null, "o Mac ainda nao sabe do silencio do celular");

  await A.SYNC.reconectar(true);
  ok(!!silencio(A, "leituras", "l1"), "o delta chegou ANTES de a fila subir");
  ok(A.SYNC.situacao().fila === 0, "e so entao a fila subiu");
  ok(!!silencio(B, "pipeline", "a01"), "e o celular recebeu o do Mac");
  ok(srv.linhas.filter(l => l.dominio === "retomada").length === 2, "nada se perdeu");
}

console.log("\n=== 54. Um escritor, um merge, e o que a 9D.2 NAO mudou ===");
{
  const render = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  const nucleo = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "10-nucleo.js"), "utf8");
  const regras = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "20-regras.js"), "utf8");
  const app = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "40-app.js"), "utf8");
  const corpoDe = (f, n) => { const p = f.split("function " + n + "(")[1]; return p ? p.split("\n}")[0] : ""; };

  ok((render.match(/SYNC\.salvarAlteracao\(\s*"retomada"/g) || []).length === 1,
     "ha UM unico ponto que escreve retomada online");
  const tr = (render.match(/enfileirarToque\("retomada"/g) || []).length;
  const tn = (nucleo.match(/enfileirarToque\("retomada"/g) || []).length;
  ok(tr + tn === 1, "e UM unico enfileirarToque (a migracao passou a usar o funil)",
     {render: tr, nucleo: tn});
  ok(/migrarRetomadas[\s\S]*?tocarRetomada\(chave\.slice\(0, corte\)/.test(nucleo),
     "e a migracao das entradas antigas passa pelo funil");
  ok(/var iso = tocarRetomada\(pid, projId, ate\)/.test(corpoDe(render, "adiarRetomada")),
     "o adiarRetomada chama o funil");
  ok((nucleo.match(/function mesclarRetomada/g) || []).length === 1, "ha UMA implementacao de merge");
  ok(/aplicarRetomadasDoEstado[\s\S]*?mesclarRetomada/.test(nucleo), "o caminho legado a usa");
  ok(/aplicarRetomadaOnline[\s\S]*?mesclarRetomada/.test(nucleo), "e o online tambem");
  /* A clausula que le as DUAS formas nao pode ser simplificada. */
  ok(/typeof loc === "object"/.test(corpoDe(nucleo, "mesclarRetomada")),
     "o merge le a entrada local nas duas formas (string antiga e objeto)");

  /* Os renders: dois, e ambos comprovados. */
  const corpo = corpoDe(nucleo, "aplicarRetomadaOnline");
  ok(/renderHoje/.test(corpo) && /renderVistaRevisao/.test(corpo),
     "os renders sao renderHoje e renderVistaRevisao");
  ok(!/renderSemana/.test(corpo),
     "e NAO renderSemana — ele nao le retomada (ao contrario da triagem da 9D.1)");
  ok(!/renderSemana/.test(corpo) &&
     !/retomadasAdiadas|renderRetomadas/.test(corpoDe(render, "renderSemana")),
     "   verificado: renderSemana nao le retomada nenhuma");
  ok(/renderRetomadas/.test(corpoDe(render, "renderHoje")), "   renderHoje desenha as retomadas");
  ok(/retomadas\(\)/.test(corpoDe(regras, "revisaoDaSemana")), "   e a revisao le retomadas()");
  ok(/retomadasAdiadas/.test(corpoDe(regras, "motorDePrioridades")),
     "   e o motor de prioridades le o que esta silenciado");

  /* Seis dominios online, e nenhum a mais. */
  const online = ((render + regrasSrc).match(/SYNC\.salvarAlteracao\(\s*"(\w+)"/g) || [])
    .map(x => x.match(/"(\w+)"/)[1]).sort();
  ok(JSON.stringify(online) === JSON.stringify(["dispensa", "evento", "item", "meta", "prioridade", "retomada", "rotina", "toefl", "triagem"]),
     "nove dominios online: 9B, 9C, 9D e o progresso da 9E", online);
  ok(["estrutura_proj", "estrutura_sub"]
       .every(d => online.indexOf(d) < 0),
     "e nenhum dominio ainda nao autorizado foi antecipado", online);
  const assinados = (app.match(/assinarDominio\("(\w+)"/g) || []).map(x => x.match(/"(\w+)"/)[1]).sort();
  ok(JSON.stringify(assinados) === JSON.stringify(["dispensa", "evento", "item", "meta", "prioridade", "retomada", "rotina", "toefl", "triagem"]),
     "e os nove tem aplicador registrado", assinados);

  /* Legado e online no mesmo ato, com o mesmo ISO. */
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  A.adiarRetomada("concursos", "c1");
  await A.SYNC.drenarFila();
  const toque = A.getToques().filter(t => t.tipo === "retomada").pop();
  const l = linhaRet(srv, "concursos/c1");
  ok(toque.quando === l.em, "legado e online com o MESMO ISO",
     {legado: toque.quando, online: l.em});
  ok(toque.dados.ate === l.valor.ate, "e a mesma data absoluta");
  ok(!("t" in l.valor) && !("projT" in l.valor),
     "e nem titulo nem estagio viajam (regra da Fase 6B)", Object.keys(l.valor));
}

console.log("\n=== 55. Um ato, tres consumidores, um id so (9D.3) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const PROJ = {id: "a01", t: "Artigo sobre Lutero"};
  const SUB  = {id: "s1", t: "Levantamento", vida: "ativo", motivo: "parei na Dieta de Worms"};

  const antes = A.getReg().length;
  A.logar("pipeline", PROJ, SUB, 0, 2);
  await A.SYNC.drenarFila();

  ok(A.getReg().length === antes + 1, "a linha entrou em cron:registro na hora");
  const toque = A.getToques().filter(t => t.tipo === "registro").pop();
  ok(!!toque, "e o toque legado foi enfileirado do mesmo jeito");
  ok(srv.registros.length === 1, "e UMA linha subiu para cron_registro", srv.registros.length);

  const l = srv.registros[0];
  ok(l.id === toque.id, "com o MESMO id do toque — a chave que une os dois caminhos",
     {toque: toque.id, online: l.id});
  ok(l.pid === "pipeline" && l.proj_id === "a01" && l.sub_id === "s1",
     "o endereco viaja em colunas, nao num blob", {pid: l.pid, proj: l.proj_id, sub: l.sub_id});
  ok(l.de === 0 && l.para === 2, "o de/para viaja inteiro", {de: l.de, para: l.para});
  ok(l.proj_t === PROJ.t && l.sub_t === SUB.t, "e os titulos fotografados no momento");
  ok(l.aparelho === "mac", "carimbado com o aparelho que escreveu", l.aparelho);

  /* O MOTIVO. O caminho do GitHub o corta (repositorio publico); este nao. */
  ok(l.motivo === SUB.motivo, "o motivo VIAJA no caminho online — a base e privada", l.motivo);
  ok(!("motivo" in toque.dados) && toque.dados.temMotivo === true,
     "e continua NAO viajando no caminho do GitHub", toque.dados);

  /* Nao ha relogio nem lapide: historico nao tem versao. */
  ok(!("em" in l) && !("del" in l), "sem `em` e sem lapide: historico nao tem versao",
     Object.keys(l));
  ok(srv.linhas.length === 0, "e nada disso foi parar em cron_estado", srv.linhas.length);
}

console.log("\n=== 56. O registro chega ao outro aparelho, e no lugar certo (9D.3) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();

  ok(B.getReg().length === 0, "o celular comeca sem registro");
  A.logar("pipeline", {id: "a01", t: "Artigo"}, {id: "s1", t: "Levantamento", motivo: "com razao"}, 0, 2);
  await A.SYNC.drenarFila();

  const noCel = B.getReg();
  ok(noCel.length === 1, "a linha do Mac chegou ao celular pelo Realtime", noCel.length);
  ok(noCel[0].projId === "a01" && noCel[0].subId === "s1", "com o endereco certo", noCel[0]);
  ok(noCel[0].para === 2 && noCel[0].de === 0, "e o de/para inteiro");
  ok(noCel[0].motivo === "com razao", "e com o motivo, e nao com um rotulo", noCel[0].motivo);
  ok(!!noCel[0].tid, "a linha recebida guarda o tid — e por ele que ela nao repete");

  /* APPEND-ONLY: fechar de novo nao substitui, acrescenta. */
  A.logar("pipeline", {id: "a01", t: "Artigo"}, {id: "s1", t: "Levantamento"}, 2, 1);
  await A.SYNC.drenarFila();
  ok(srv.registros.length === 2, "o recuo virou OUTRA linha, e nao uma correcao da primeira",
     srv.registros.length);
  ok(B.getReg().length === 2, "e as duas estao no celular");
  ok(B.getReg().filter(o => o.para === 1).length === 1, "inclusive o recuo");

  /* ORDEM POR DATA DE ORIGEM, e nao por ordem de chegada. */
  const antiga = {id: "2020-01-01T00-00-00-000Z-tablet", dono: "dono-1", d: "2020-01-01",
                  pid: "leituras", proj_id: "l1", sub_id: "x1", proj_t: "Spinoza", sub_t: "Etica",
                  de: null, para: 2, vida: "ativo", motivo: "", aparelho: "tablet",
                  servidor_em: "2030-09-01T00:00:00.000Z"};
  const renders = B.aplicarRegistroOnline(antiga);
  const reg = B.getReg();
  ok(reg.length === 3 && reg[0].subId === "x1",
     "uma linha de 2020 entra NA FRENTE, e nao no fim da lista", reg.map(o => o.d));
  ok(JSON.stringify(renders) === JSON.stringify(["renderRegistro", "renderSemana", "renderVistaRevisao"]),
     "e pede os tres renders que leem o registro", renders);
}

console.log("\n=== 57. Nao duplica: por id, por aparelho, e entre os dois caminhos (9D.3) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();

  A.logar("pipeline", {id: "a01", t: "Artigo"}, {id: "s1", t: "Levantamento"}, 0, 2);
  await A.SYNC.drenarFila();
  const linha = JSON.parse(JSON.stringify(srv.registros[0]));
  ok(B.getReg().length === 1, "chegou uma vez");

  /* 1. Reler a mesma linha (delta com sobreposicao) nao repete. */
  ok(B.aplicarRegistroOnline(linha).length === 0, "reaplicar a MESMA linha nao devolve render");
  ok(B.getReg().length === 1, "e nao cria segunda copia");
  await B.SYNC.buscarDeltaRegistro();
  ok(B.getReg().length === 1, "nem o delta com sobreposicao de 30s");

  /* 2. Eco proprio: quem escreveu ja tem a linha. */
  const eco = A.SYNC.aplicarRegistroRemoto(linha);
  ok(eco.aplicou === false && /eco/.test(eco.motivo), "toque meu nao desce nunca", eco);
  ok(A.getReg().length === 1, "e o Mac continua com uma linha so");

  /* 3. A PONTE ENTRE OS DOIS CAMINHOS. O mesmo toque, agora chegando pelo
        estado.json: o tid ja esta visto, entao a descida legada o ignora. */
  const toque = A.getToques().filter(t => t.tipo === "registro").pop();
  const vistos = {};
  B.getReg().forEach(o => { if (o && o.tid) vistos[o.tid] = true; });
  ok(vistos[toque.id] === true,
     "a linha que desceu pelo Supabase ja esta vista pelo criterio do estado.json");

  /* 4. Receber nao e tocar. */
  const toquesB = B.getToques().length, filaB = B.SYNC.situacao().fila;
  A.logar("leituras", {id: "l1", t: "Spinoza"}, {id: "s9", t: "Etica II"}, 1, 2);
  await A.SYNC.drenarFila();
  ok(B.getReg().length === 2, "a segunda linha chegou ao celular");
  ok(B.getToques().length === toquesB, "e NAO gerou toque no celular",
     B.getToques().length - toquesB);
  ok(B.SYNC.situacao().fila === filaB, "nem enfileirou subida de volta");

  /* 5. Reenviar o mesmo item, depois de uma drenagem que caiu no meio, e
        silencio — e nao erro que trava a fila. */
  const item = A.SYNC.registrar(
    {d: "2026-09-09", pid: "pipeline", projId: "a01", subId: "s1", para: 2},
    {id: srv.registros[0].id});
  const r = await A.SYNC.drenarFila();
  ok(!r.falha, "reenviar id ja gravado nao e falha", r.falha);
  ok(srv.repetidos === 1, "o servidor o descartou pela chave primaria", srv.repetidos);
  ok(A.SYNC.situacao().fila === 0, "e a fila nao travou", A.SYNC.situacao().fila);
}

console.log("\n=== 58. Offline, marca propria, e o que a 9D.3 NAO mudou ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();

  /* A fila e a MESMA, e a garantia de offline tambem. */
  srv.falhar = true;
  A.logar("pipeline", {id: "a01", t: "Artigo"}, {id: "s1", t: "Levantamento"}, 0, 2);
  ok(A.getReg().length === 1, "sem rede, a linha vale na hora no Mac");
  await A.SYNC.drenarFila();
  ok(A.SYNC.situacao().fila === 1, "e espera na fila", A.SYNC.situacao().fila);

  srv.falhar = false;
  B.logar("leituras", {id: "l1", t: "Spinoza"}, {id: "s9", t: "Etica"}, 1, 2);
  await B.SYNC.drenarFila();
  ok(A.getReg().length === 1, "o Mac ainda nao sabe da linha do celular");

  await A.SYNC.reconectar(true);
  ok(A.getReg().length === 2, "o delta do registro trouxe a linha do celular");
  ok(A.SYNC.situacao().fila === 0, "e a fila do Mac subiu depois", A.SYNC.situacao().fila);
  ok(B.getReg().length === 2, "e o celular recebeu a do Mac");
  ok(srv.registros.length === 2, "duas linhas no servidor, nenhuma perdida");

  /* MARCA PROPRIA: uma marca so faria a entrega de uma tabela adiantar o
     ponto de partida da outra. */
  const est = A.__armazem[A.SYNC_MARCA_KEY], reg = A.__armazem[A.SYNC_MARCA_REG_KEY];
  ok(A.SYNC_MARCA_REG_KEY === "cron:sync-marca-reg", "o registro tem marca propria",
     A.SYNC_MARCA_REG_KEY);
  ok(!!reg, "e ela avancou com a entrega do registro", reg);
  ok(est !== reg, "as duas marcas sao independentes", {estado: est, registro: reg});

  const nucleo = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "10-nucleo.js"), "utf8");
  const sync = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "15-sync.js"), "utf8");
  const render = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  const app = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "40-app.js"), "utf8");
  const corpoDe = (f, n) => { const p = f.split("function " + n + "(")[1]; return p ? p.split("\n}")[0] : ""; };

  /* UM ESCRITOR. */
  ok((nucleo.match(/SYNC\.registrar\(/g) || []).length === 1,
     "ha UM unico ponto que escreve registro online");
  ok((nucleo.match(/enfileirarToque\("registro"/g) || []).length === 1,
     "e UM unico enfileirarToque de registro");
  ok(/enfileirarToque\("registro"[\s\S]{0,600}?SYNC\.registrar\(/.test(corpoDe(nucleo, "logar")),
     "os dois no MESMO ato, dentro do logar()");
  ok((render.match(/SYNC\.registrar\(/g) || []).length === 0,
     "e nada no 30-render.js escreve registro por fora");

  /* UMA FORMULA PARA O ID, que e o que faz a ponte funcionar. */
  ok((nucleo.match(/replace\(\/\[:\.\]\/g,"-"\) \+ "-" \+ aparelhoId\(\)/g) || []).length === 1,
     "ha UMA formula do id do toque, e nao duas");
  ok(/id: idDoToque\(iso\)/.test(corpoDe(nucleo, "enfileirarToque")),
     "o enfileirarToque a usa");
  ok(/idDoToque\(iso\)/.test(corpoDe(nucleo, "logar")), "e o registro online tambem");

  /* NAO E DOMINIO DO cron_estado: o CHECK do Postgres nao o conhece. */
  const dominios = A.SINCRONIA.DOMINIOS;
  ok(dominios.indexOf("registro") < 0,
     "`registro` NAO entrou na lista de dominios do cron_estado", dominios);
  ok(/assinarRegistro\(aplicarRegistroOnline\)/.test(app),
     "ele tem caminho proprio, registrado pelo assinarRegistro");
  const assinados = (app.match(/assinarDominio\("(\w+)"/g) || []).map(x => x.match(/"(\w+)"/)[1]).sort();
  ok(JSON.stringify(assinados) === JSON.stringify(["dispensa", "evento", "item", "meta", "prioridade", "retomada", "rotina", "toefl", "triagem"]),
     "e os dominios de estado agora sao nove", assinados);

  /* SEM MERGE, SEM RELOGIO, SEM LAPIDE — e a ausencia e o desenho. */
  const corpo = corpoDe(nucleo, "aplicarRegistroOnline");
  ok(!/venceRemoto|mesclar|\bdel\b/.test(corpo),
     "o aplicador do registro nao tem relogio, merge nem lapide");
  ok(/tid === linha\.id/.test(corpo), "a unica pergunta e se o id ja esta aqui");
  ok(/REG_TETO/.test(corpo) && /registro-arquivo/.test(corpo),
     "e o teto e o arquivo do excedente sao os mesmos do logar()");

  /* OS RENDERS, cada um comprovado no arquivo que o justifica. */
  ok(/renderRegistro/.test(corpoDe(render, "renderTrilhos")),
     "   renderRegistro desenha o painel");
  const regras = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "20-regras.js"), "utf8");
  ok(/getReg\(\)/.test(corpoDe(regras, "ritmoDoRegistro")) &&
     /ritmoDoRegistro/.test(corpoDe(render, "renderSemana")),
     "   renderSemana le o registro pelo ritmoDoRegistro");
  ok(/getReg\(\)/.test(corpoDe(regras, "revisaoDaSemana")),
     "   e a revisao da semana tambem le");

  /* O CAMINHO LEGADO CONTINUA INTEIRO. */
  ok(/est\.historico/.test(nucleo) && /t\.tipo !== "registro"/.test(nucleo),
     "a descida pelo estado.json continua onde estava");
  ok(/function semMotivo/.test(nucleo) && /semMotivo\(linha\)/.test(nucleo),
     "e o semMotivo continua cortando o motivo do caminho publico");
  ok((sync.match(/TABELA_REGISTRO/g) || []).length >= 4,
     "a camada fala com cron_registro em leitura, delta, Realtime e escrita");
  ok(/ignoreDuplicates:true/.test(sync.replace(/\s/g, "")),
     "e escreve com ON CONFLICT DO NOTHING — a tabela nao da UPDATE ao app");
}

console.log("\n=== 59. Marcar e DESMARCAR rotina atravessa aparelhos (9D.4) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();
  const ID = "seg-min", DIA = A.dateKey;
  const linhaRot = (k) => srv.linhas.find(l => l.dominio === "rotina" && l.chave === k);
  const marcado = (X, dia, id) => !!(X.LS("cron:checks:" + dia, {}) || {})[id];

  ok(marcado(B, DIA, ID) === false, "o celular comeca sem a rotina marcada");
  A.toggleCheck(ID);
  await A.SYNC.drenarFila();

  ok(marcado(A, DIA, ID) === true, "o Mac marcou");
  ok(marcado(B, DIA, ID) === true, "e a marca chegou ao celular");
  const l = linhaRot(DIA + "/" + ID);
  ok(!!l && l.chave === DIA + "/" + ID, "a chave online e AAAA-MM-DD/idDaRotina", l && l.chave);
  ok(JSON.stringify(Object.keys(l.valor)) === JSON.stringify(["feito"]),
     "e o valor leva SO o `feito`", Object.keys(l.valor));
  ok(l.valor.feito === true, "com o valor certo");
  ok(l.del === false, "sem lapide: `feito:false` e um estado, nao uma ausencia", l.del);

  /* EXPIRA DE VELHA: a marca do dia nao e decisao, e cron_podar() a leva. */
  ok(!!l.expira_em, "a linha carrega expira_em", l.expira_em);
  const vida = (new Date(l.expira_em) - new Date(DIA + "T00:00:00.000Z")) / 86400000;
  ok(vida === 90, "de 90 dias contados a partir do DIA da marca, nao do envio", vida);

  /* DESMARCAR e o caso que so um estado resolve. */
  A.toggleCheck(ID);
  await A.SYNC.drenarFila();
  ok(marcado(A, DIA, ID) === false, "desmarcar no Mac desmarca ali");
  ok(marcado(B, DIA, ID) === false, "e desmarca tambem no celular");
  ok(linhaRot(DIA + "/" + ID).valor.feito === false,
     "porque `feito:false` viajou como estado", linhaRot(DIA + "/" + ID).valor);
  ok(srv.linhas.filter(l2 => l2.dominio === "rotina").length === 1,
     "e continua UMA linha: e a mesma chave", srv.linhas.filter(l2 => l2.dominio === "rotina").length);

  /* A COPIA EM MEMORIA. Sem atualiza-la, o renderHoje repinta o valor velho. */
  A.toggleCheck(ID);
  await A.SYNC.drenarFila();
  ok(B.__checks()[ID] === true, "o `checks` em memoria do celular acompanha o que desceu", B.__checks()[ID]);
  ok(A.__checks()[ID] === true, "e o do Mac, o que ele mesmo escreveu");
}

console.log("\n=== 60. Um funil, tres escritores, e o que a 9D.4 NAO tem (9D.4) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();
  const linhaRot = (k) => srv.linhas.find(l => l.dominio === "rotina" && l.chave === k);
  const marcado = (X, dia, id) => !!(X.LS("cron:checks:" + dia, {}) || {})[id];
  const DIA = A.dateKey, ONTEM = "2026-09-08";

  /* marcarAtrasada grava na DATA DE ORIGEM, e e ela que viaja. */
  A.marcarAtrasada(ONTEM, "ter-art");
  await A.SYNC.drenarFila();
  ok(marcado(B, ONTEM, "ter-art") === true, "a marca de um dia passado chegou ao celular");
  ok(!!linhaRot(ONTEM + "/ter-art"), "na chave do dia de ORIGEM", ONTEM + "/ter-art");
  ok(!linhaRot(DIA + "/ter-art"), "e nao na de hoje");

  /* limparHoje desmarca uma a uma, e o outro aparelho fica sabendo. */
  A.toggleCheck("seg-min");
  A.toggleCheck("seg-esc");
  await A.SYNC.drenarFila();
  ok(marcado(B, DIA, "seg-min") && marcado(B, DIA, "seg-esc"), "duas marcas de hoje no celular");
  A.limparHoje();
  await A.SYNC.drenarFila();
  ok(!marcado(A, DIA, "seg-min") && !marcado(A, DIA, "seg-esc"), "limpar desmarcou as duas no Mac");
  ok(!marcado(B, DIA, "seg-min") && !marcado(B, DIA, "seg-esc"),
     "e o celular soube — limpar nao e esvaziar a gaveta em silencio");
  ok(marcado(B, ONTEM, "ter-art") === true, "e limpar HOJE nao encostou em ontem");

  /* Receber nao e tocar. */
  const toquesB = B.getToques().length, filaB = B.SYNC.situacao().fila;
  A.toggleCheck("seg-acad");
  await A.SYNC.drenarFila();
  ok(marcado(B, DIA, "seg-acad"), "a marca seguinte chegou");
  ok(B.getToques().length === toquesB, "e NAO gerou toque no celular",
     B.getToques().length - toquesB);
  ok(B.SYNC.situacao().fila === filaB, "nem enfileirou subida de volta");
  const eco = A.SYNC.aplicarRemoto(linhaRot(DIA + "/seg-acad"));
  ok(eco.aplicou === false && /eco/.test(eco.motivo), "e o eco proprio e recusado", eco);

  /* Aplicar duas vezes o mesmo valor nao pede render a toa. */
  ok(B.aplicarRotinaOnline({chave: DIA + "/seg-acad", valor: {feito: true}}).length === 0,
     "reaplicar o mesmo valor nao pede render");
  const renders = B.aplicarRotinaOnline({chave: DIA + "/seg-acad", valor: {feito: false}});
  ok(JSON.stringify(renders) === JSON.stringify(["renderHoje", "renderVistaRevisao"]),
     "e a mudanca pede os dois renders que leem cron:checks", renders);

  /* ESTRUTURA: um funil, e nenhum caminho legado a preservar. */
  const render = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  const nucleo = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "10-nucleo.js"), "utf8");
  const regras = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "20-regras.js"), "utf8");
  const corpoDe = (f, n) => { const p = f.split("function " + n + "(")[1]; return p ? p.split("\n}")[0] : ""; };

  ok((render.match(/SYNC\.salvarAlteracao\(\s*"rotina"/g) || []).length === 1,
     "ha UM unico ponto que escreve rotina online");
  const grava = (render.match(/save\("cron:checks:"/g) || []).length +
                (nucleo.match(/save\("cron:checks:"/g) || []).length;
  ok(grava === 2, "e so DOIS lugares gravam cron:checks: o funil e a descida", grava);
  ok(/save\("cron:checks:"/.test(corpoDe(render, "tocarRotina")), "   o funil");
  ok(/save\("cron:checks:"/.test(corpoDe(nucleo, "aplicarRotinaOnline")), "   e o aplicador");
  ["toggleCheck", "marcarAtrasada", "limparHoje"].forEach(f => {
    ok(/tocarRotina\(/.test(corpoDe(render, f)), "   " + f + " passa pelo funil");
  });

  /* NAO HA CAMINHO LEGADO PARA ESTE DOMINIO, e nao se inventou um. */
  ok((render.match(/enfileirarToque\("rotina"/g) || []).length === 0 &&
     (nucleo.match(/enfileirarToque\("rotina"/g) || []).length === 0,
     "nao existe toque `rotina` — cron:checks nunca atravessou pelo GitHub");
  ok(A.getToques().every(t => t.tipo !== "rotina"),
     "e marcar rotina nao passou a emitir um", A.getToques().map(t => t.tipo));
  ok(!/rotina/.test(corpoDe(nucleo, "buscarEstado") || ""),
     "e a descida do estado.json nao ganhou secao de rotina");

  /* Os leitores, cada um comprovado onde mora. */
  ok(/cron:checks:/.test(corpoDe(regras, "atrasadas")), "   atrasadas() le cron:checks");
  ok(/cron:checks:/.test(corpoDe(regras, "revisaoDaSemana")), "   e a revisao da semana tambem");
  ok(!/cron:checks/.test(corpoDe(render, "renderSemana")),
     "   e renderSemana NAO le — por isso ele nao entra nos renders");
}

console.log("\n=== 61. Dispensar uma rotina atrasada atravessa aparelhos (9D.5) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();
  const DIA = "2026-09-08", ID = "ter-art";
  const K = DIA + "|" + ID, ONLINE = "rotina/" + DIA + "/" + ID;
  const dispensada = (X, k) => !!(X.LS("cron:hoje-dispensados", {}) || {})[k];
  const linhaDisp = (k) => srv.linhas.find(l => l.dominio === "dispensa" && l.chave === k);

  ok(dispensada(B, K) === false, "o celular comeca sem a dispensa");
  A.dispensarAtrasada(DIA, ID);
  await A.SYNC.drenarFila();

  ok(dispensada(A, K) === true, "o Mac dispensou");
  ok(dispensada(B, K) === true, "e a dispensa chegou ao celular");

  /* AS DUAS FORMAS DA CHAVE: `|` no aparelho, `rotina/.../...` no estado. */
  const l = linhaDisp(ONLINE);
  ok(!!l, "a chave online e rotina/AAAA-MM-DD/id", srv.linhas.filter(x => x.dominio === "dispensa").map(x => x.chave));
  ok(Object.keys(B.LS("cron:hoje-dispensados", {})).indexOf(K) >= 0,
     "e no aparelho ela continua sendo AAAA-MM-DD|id", Object.keys(B.LS("cron:hoje-dispensados", {})));
  ok(JSON.stringify(l.valor) === "{}", "o valor e vazio: a chave ja diz tudo", l.valor);
  ok(l.del === false, "sem lapide: nao existe desdispensar", l.del);

  /* Expira de velha, com a mesma vida da marca de rotina. */
  ok(!!l.expira_em, "a linha carrega expira_em", l.expira_em);
  const vida = (new Date(l.expira_em) - new Date(DIA + "T00:00:00.000Z")) / 86400000;
  ok(vida === 90, "de 90 dias a partir do DIA dispensado, nao do envio", vida);

  /* O efeito de verdade: a rotina para de aparecer no bloco do celular. */
  ok(B.atrasadas().every(o => !(o.dia === DIA && o.id === ID)),
     "e o `ficou para tras` do celular deixou de listar aquela rotina");

  /* Chave de outra forma e IGNORADA, e nao adivinhada. */
  const antes = JSON.stringify(B.LS("cron:hoje-dispensados", {}));
  ok(B.aplicarDispensaOnline({chave: "meta-aviso/2026-09"}).length === 0,
     "a forma meta-aviso (prevista no esquema, sem escritor) e ignorada");
  ok(B.aplicarDispensaOnline({chave: "rotina/so-duas-partes"}).length === 0,
     "e uma chave malformada tambem");
  /* O caso que so o PREFIXO pega: tres partes, forma errada. */
  ok(B.aplicarDispensaOnline({chave: "meta-aviso/2026-09/x"}).length === 0,
     "e uma de tres partes com o prefixo errado — quem recusa aqui e o prefixo");
  ok(JSON.stringify(B.LS("cron:hoje-dispensados", {})) === antes,
     "nenhuma das duas sujou a gaveta");
}

console.log("\n=== 62. Um funil, sem caminho legado, e a 9D fechada (9D.5) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();
  const DIA = "2026-09-07", ID = "seg-esc";
  const dispensada = (X, k) => !!(X.LS("cron:hoje-dispensados", {}) || {})[k];

  /* Receber nao e tocar. */
  const toquesB = B.getToques().length, filaB = B.SYNC.situacao().fila;
  A.dispensarAtrasada(DIA, ID);
  await A.SYNC.drenarFila();
  ok(dispensada(B, DIA + "|" + ID), "a dispensa chegou");
  ok(B.getToques().length === toquesB, "e NAO gerou toque no celular",
     B.getToques().length - toquesB);
  ok(B.SYNC.situacao().fila === filaB, "nem enfileirou subida de volta");
  const eco = A.SYNC.aplicarRemoto(
    srv.linhas.find(l => l.dominio === "dispensa" && l.chave === "rotina/" + DIA + "/" + ID));
  ok(eco.aplicou === false && /eco/.test(eco.motivo), "e o eco proprio e recusado", eco);
  ok(B.aplicarDispensaOnline({chave: "rotina/" + DIA + "/" + ID}).length === 0,
     "reaplicar a mesma dispensa nao pede render");

  /* Offline: a decisao vale na hora e espera na fila. */
  srv.falhar = true;
  A.dispensarAtrasada("2026-09-06", "dom-rev");
  ok(dispensada(A, "2026-09-06|dom-rev"), "sem rede, a dispensa vale na hora no Mac");
  await A.SYNC.drenarFila();
  ok(A.SYNC.situacao().fila === 1, "e fica na fila", A.SYNC.situacao().fila);
  srv.falhar = false;
  await A.SYNC.reconectar(true);
  ok(A.SYNC.situacao().fila === 0, "que sobe na reconexao");
  ok(dispensada(B, "2026-09-06|dom-rev"), "e chega ao celular");

  /* ESTRUTURA. */
  const render = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  const nucleo = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "10-nucleo.js"), "utf8");
  const regras = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "20-regras.js"), "utf8");
  const corpoDe = (f, n) => { const p = f.split("function " + n + "(")[1]; return p ? p.split("\n}")[0] : ""; };

  ok((render.match(/SYNC\.salvarAlteracao\(\s*"dispensa"/g) || []).length === 1,
     "ha UM unico ponto que escreve dispensa online");
  const grava = (render.match(/save\(ATRASO_KEY/g) || []).length +
                (nucleo.match(/save\(ATRASO_KEY/g) || []).length +
                (regras.match(/save\(ATRASO_KEY/g) || []).length;
  ok(grava === 2, "e so DOIS lugares gravam a chave: o funil e a descida", grava);
  ok(/save\(ATRASO_KEY/.test(corpoDe(render, "tocarDispensa")), "   o funil");
  ok(/save\(ATRASO_KEY/.test(corpoDe(nucleo, "aplicarDispensaOnline")), "   e o aplicador");
  ok(/tocarDispensa\(/.test(corpoDe(render, "dispensarAtrasada")),
     "   e dispensarAtrasada passa por ele");
  ok(/podarDispensados\(\)/.test(corpoDe(render, "tocarDispensa")),
     "a poda local dos sete dias continua acontecendo na escrita");

  /* Sem caminho legado — nao havia, e nao se inventou um. */
  ok((render.match(/enfileirarToque\("dispensa"/g) || []).length === 0 &&
     (nucleo.match(/enfileirarToque\("dispensa"/g) || []).length === 0,
     "nao existe toque `dispensa`: a chave nunca atravessou pelo GitHub");
  ok(A.getToques().every(t => t.tipo !== "dispensa"),
     "e dispensar nao passou a emitir um", A.getToques().map(t => t.tipo));

  /* Um render, e so um. */
  const corpo = corpoDe(nucleo, "aplicarDispensaOnline");
  ok(/renderHoje/.test(corpo) && !/renderVistaRevisao|renderSemana/.test(corpo),
     "o unico render e renderHoje", corpo.match(/render\w+/g));
  ok(/ATRASO_KEY/.test(corpoDe(regras, "atrasadas")),
     "   porque atrasadas() e o unico leitor, e ele desenha no Hoje");

  /* A 9D esta fechada: os onze dominios do esquema, sete conectados. */
  const dominios = A.SINCRONIA.DOMINIOS;
  ok(dominios.length === 11, "o esquema segue com onze dominios", dominios.length);
  ["triagem", "retomada", "rotina", "dispensa"].forEach(d => {
    ok(dominios.indexOf(d) >= 0, "   " + d + " esta no esquema desde a 9A");
  });
  ok(["estrutura_proj", "estrutura_sub"]
       .every(d => !new RegExp('salvarAlteracao\\(\\s*"' + d + '"').test(render + regrasSrc)),
     "e a estrutura, que sobra da 9E, nao foi antecipada");
}

console.log("\n=== 63. Progresso do trilho online, e o `em` que era do relogio errado (9E) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();
  const sub = (X, pid, projId, subId) => {
    let achado = null;
    (X.getProjs(pid) || []).forEach(pr => { if (pr.id === projId)
      (pr.subs || []).forEach(x => { if (x.id === subId) achado = x; }); });
    return achado;
  };
  const alvo = (() => {
    const pr = (A.getProjs("pipeline") || [])[0];
    return pr && pr.subs && pr.subs[0] ? {projId: pr.id, subId: pr.subs[0].id} : null;
  })();
  ok(!!alvo, "ha um subitem de trilho para exercitar", alvo);

  const antes = sub(B, "pipeline", alvo.projId, alvo.subId).st;
  const r = A.marcarSub("pipeline", alvo.projId, alvo.subId, (antes + 1) % 3);
  await A.SYNC.drenarFila();
  ok(!!r, "o Mac marcou o subitem", r);

  const noMac = sub(A, "pipeline", alvo.projId, alvo.subId);
  const noCel = sub(B, "pipeline", alvo.projId, alvo.subId);
  ok(noCel.st === noMac.st, "e o progresso chegou ao celular", {mac: noMac.st, cel: noCel.st});
  ok(noCel.em === noMac.em, "com o MESMO instante da decisao", {mac: noMac.em, cel: noCel.em});

  /* O `em` VEM DO RELOGIO DO TOQUE, e nao de um new Date() proprio. */
  const toque = A.getToques().filter(t => t.tipo === "registro").pop();
  ok(noMac.em === toque.quando, "o `em` do subitem e o MESMO ISO do toque legado",
     {sub: noMac.em, toque: toque.quando});
  const l = srv.linhas.find(x => x.dominio === "item" &&
                            x.chave === "pipeline/" + alvo.projId + "/" + alvo.subId);
  ok(!!l && l.em === toque.quando, "e a linha online carrega esse mesmo ISO", l && l.em);
  ok(l.valor.st === noMac.st, "com o st", l.valor);
  ok("vida" in l.valor && "voltar_em" in l.valor && "vidaDesde" in l.valor,
     "e a vida inteira, como o esquema declara", Object.keys(l.valor));

  /* O MONOTONICO DESEMPATA. Duas marcacoes seguidas no mesmo milissegundo
     recebiam o mesmo `em` quando ele vinha do relogio de parede. */
  A.__congelar(Date.UTC(2026, 8, 9, 12, 0, 0));
  const e1 = A.marcarSub("pipeline", alvo.projId, alvo.subId, (noMac.st + 1) % 3);
  const em1 = sub(A, "pipeline", alvo.projId, alvo.subId).em;
  A.marcarSub("pipeline", alvo.projId, alvo.subId, (noMac.st + 2) % 3);
  const em2 = sub(A, "pipeline", alvo.projId, alvo.subId).em;
  A.__descongelar();
  ok(!!e1 && em1 !== em2, "duas marcacoes no MESMO milissegundo recebem instantes distintos",
     {primeira: em1, segunda: em2});
  ok(em2 > em1, "e a segunda e mais nova — o desempate funciona", {em1, em2});
}

console.log("\n=== 64. Dois escritores: voce e o pipeline (9E) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const sub = (X, pid, projId, subId) => {
    let achado = null;
    (X.getProjs(pid) || []).forEach(pr => { if (pr.id === projId)
      (pr.subs || []).forEach(x => { if (x.id === subId) achado = x; }); });
    return achado;
  };
  const pr = (A.getProjs("pipeline") || [])[0];
  const projId = pr.id, subId = pr.subs[0].id;

  /* O pipeline escreve pelo caminho legado, como "mais um aparelho": um toque
     `registro` com aparelho "cowork", dobrado em est.itens. E por ali que ele
     desce — a 9E NAO o transformou num escritor do Supabase. */
  A.marcarSub("pipeline", projId, subId, 1);
  await A.SYNC.drenarFila();
  const meuEm = sub(A, "pipeline", projId, subId).em;

  /* 1. O pipeline mais NOVO vence: progresso e fato verificavel. */
  const doPipeline = {quando: "2099-01-01T00:00:00.000Z", st: 2, vida: "ativo", motivo: ""};
  const x = sub(A, "pipeline", projId, subId);
  ok(A.mesclarItem(x, doPipeline) === true, "o pipeline mais novo entra");
  ok(x.st === 2 && x.em === doPipeline.quando, "e o progresso dele manda", {st: x.st, em: x.em});

  /* 2. O pipeline mais VELHO nao desfaz a sua decisao. */
  const velho = {quando: "2020-01-01T00:00:00.000Z", st: 0, vida: "ativo", motivo: ""};
  ok(A.mesclarItem(x, velho) === false, "o pipeline mais velho NAO desfaz o que voce fez");
  ok(x.st === 2, "e o st fica onde estava", x.st);
  ok(A.mesclarItem(x, {quando: x.em, st: 0}) === false, "empate exato tambem fica como esta");

  /* 3. A FRONTEIRA NAO E O DESEMPATE, e ela esta no dado: o --registrar RECUSA
        subitem de prova "estrela". Isso e do pipeline, e a 9E nao o move. */
  const pipe = fs.readFileSync(path.join(RAIZ, "scripts", "dobrar_toques.py"), "utf8");
  ok(/prova == "estrela" and not forcar/.test(pipe),
     "o --registrar recusa subitem de prova `estrela`");
  ok(/RECUSADO/.test(pipe), "e diz por que recusou");
  ok(/aparelho": "cowork"/.test(pipe) || /"aparelho": "cowork"/.test(pipe),
     "e escreve como um aparelho a mais, e nao como autoridade");
  ok(!/supabase|cron_estado/i.test(pipe),
     "o pipeline NAO virou escritor do Supabase: ele continua no caminho legado");

  /* 4. Receber nao e tocar: aplicar um item remoto nao gera toque nem fila. */
  const B = criarAparelho("celular", srv).__conectar();
  const toquesB = B.getToques().length, filaB = B.SYNC.situacao().fila;
  const linha = srv.linhas.find(l => l.dominio === "item");
  const renders = B.aplicarItemOnline(linha);
  ok(renders.length === 4, "o item aplicado pede os quatro renders do progresso", renders);
  ok(B.getToques().length === toquesB, "e NAO gerou toque", B.getToques().length - toquesB);
  ok(B.SYNC.situacao().fila === filaB, "nem enfileirou subida de volta");
  ok(B.aplicarItemOnline(linha).length === 0, "e reaplicar a mesma linha nao repinta");

  /* 5. Progresso NAO cria estrutura. */
  ok(B.aplicarItemOnline({chave: "pipeline/nao-existe/x1", em: "2099-01-01T00:00:00.000Z",
                          valor: {st: 2}}).length === 0,
     "progresso de peca que este aparelho nao conhece nao pousa em lugar nenhum");
  ok(!(B.getProjs("pipeline") || []).some(p => p.id === "nao-existe"),
     "e nao inventa o projeto: estrutura e outro dominio");
}

console.log("\n=== 65. O guia do TOEFL online, e a estrutura que a 9E NAO fez (9E) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();
  const IID = Object.keys(A.guiaStore()).length ? Object.keys(A.guiaStore())[0]
            : A.TOEFL_GUIA[A.TOEFL_FASES[0]].itens[0].id;

  A.marcarGuia(IID, true);
  await A.SYNC.drenarFila();
  ok(A.guiaStore()[IID].feito === true, "o Mac marcou o item do guia");
  ok(!!B.guiaStore()[IID] && B.guiaStore()[IID].feito === true, "e chegou ao celular",
     B.guiaStore()[IID]);
  ok(B.guiaStore()[IID].em === A.guiaStore()[IID].em, "com o mesmo instante");

  const l = srv.linhas.find(x => x.dominio === "toefl" && x.chave === IID);
  ok(!!l && l.chave === IID, "a chave online e o id do item do guia", l && l.chave);
  ok(JSON.stringify(Object.keys(l.valor)) === JSON.stringify(["feito"]),
     "e o valor leva SO o `feito`", Object.keys(l.valor));

  /* DESMARCAR viaja; ausencia nao e false. */
  A.marcarGuia(IID, false);
  await A.SYNC.drenarFila();
  ok(B.guiaStore()[IID].feito === false, "desmarcar tambem atravessa");
  ok(A.mesclarToefl({}, "x9", {quando: "", feito: true}) === false,
     "e sem instante nada entra — ausencia e `nunca decidido`, nao false");

  /* Um merge, duas descidas. */
  const nucleo = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "10-nucleo.js"), "utf8");
  const render = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  const corpoDe = (f, n) => { const p = f.split("function " + n + "(")[1]; return p ? p.split("\n}")[0] : ""; };

  ok((nucleo.match(/function mesclarToefl/g) || []).length === 1, "ha UMA implementacao de merge do guia");
  ok(/aplicarToeflDoEstado[\s\S]*?mesclarToefl/.test(nucleo), "o caminho legado a usa");
  ok(/aplicarToeflOnline[\s\S]*?mesclarToefl/.test(nucleo), "e o online tambem");
  ok((nucleo.match(/function mesclarItem/g) || []).length === 1, "ha UMA implementacao de merge do item");
  ok(/mesclarItem/.test(corpoDe(nucleo, "aplicarItemOnline")), "o online a usa");
  ok(/mesclarItem\(x, r &&/.test(nucleo), "e a descida do estado.json tambem");

  /* UM FUNIL POR ESCRITOR HUMANO. */
  ok((regrasSrc.match(/SYNC\.salvarAlteracao\(\s*"toefl"/g) || []).length === 1,
     "ha UM unico ponto que escreve toefl online");
  ok((nucleo.match(/enfileirarToque\("toefl"/g) || []).length +
     (regrasSrc.match(/enfileirarToque\("toefl"/g) || []).length === 1,
     "e UM unico enfileirarToque de toefl — a migracao passou a usar o funil");
  ok(/marcarGuia\(it\.id, true, TOEFL_EM\)/.test(nucleo),
     "a migracao do guia passa pelo funil, com o piso fixo no passado");
  ok((render.match(/SYNC\.salvarAlteracao\(\s*"item"/g) || []).length === 1,
     "ha UM unico ponto que escreve item online");
  ok((render.match(/x\.em\s*=\s*new Date\(\)/g) || []).length === 0,
     "e NENHUM subitem carimba mais o proprio new Date()");
  ["marcarSub", "ciclarVida"].forEach(f => {
    ok(/tocarItem\(/.test(corpoDe(render, f)), "   " + f + " passa pelo funil");
  });

  /* A ESTRUTURA NAO ENTROU, e a ausencia e deliberada. */
  ok(!/salvarAlteracao\(\s*"estrutura_/.test(render + regrasSrc + nucleo),
     "estrutura_proj e estrutura_sub NAO foram conectadas");
  const SQL = fs.readFileSync(path.join(RAIZ, "sql", "cron_estado.sql"), "utf8");
  ok(/cron_estrutura_base/.test(SQL), "a cron_estrutura_base continua no esquema, intacta");
  ok(/grant select\s+on public\.cron_estrutura_base/.test(SQL),
     "e o app segue com SELECT e mais nada: quem escreve a base e o pipeline");
  ok(!/cron_estrutura_base/.test(fs.readFileSync(path.join(RAIZ, "scripts", "dobrar_toques.py"), "utf8")),
     "que ainda nao a escreve — e por isso o merge de tres vias nao foi feito pela metade");
}

console.log("\n=== 14. O esquema: isolamento do CONTAS_CASA e forma das politicas ===");
{
  /* O PROJETO SUPABASE E COMPARTILHADO. Este bloco le o sql/cron_estado.sql e
     prova, mecanicamente, que ele nao encosta em nada do CONTAS_CASA — em vez
     de confiar em ter lido com atencao. A lista abaixo foi tirada do banco de
     verdade (pg_class e pg_proc do schema public) em 06/09. */
  const CASA_TABELAS = ["casa", "perfil", "lancamento", "modelo",
                        "push_inscricao", "aviso_enviado", "mes_gerado"];
  const CASA_FUNCOES = ["calc_vencimento", "fixar_mes", "garantir_mes", "gerar_mes",
                        "minha_casa", "parcela_no_mes", "resumo_do_dia",
                        "tg_lancamento", "tg_modelo"];
  const SQL = fs.readFileSync(path.join(RAIZ, "sql", "cron_estado.sql"), "utf8");
  /* So o codigo: comentario que MENCIONA minha_casa() nao e tocar em
     minha_casa(). Um teste que nao distingue os dois proibiria documentar. */
  const CODIGO = SQL.split("\n").filter(l => !/^\s*--/.test(l)).join("\n");

  CASA_TABELAS.forEach(t => {
    const usa = new RegExp("\\b(public\\.)?" + t + "\\b").test(
      CODIGO.replace(/\bcron_push_inscricao\b/g, "").replace(/\bcron_[a-z_]+\b/g, ""));
    ok(!usa, "12. o SQL nao encosta na tabela " + t + " do CONTAS_CASA");
  });
  CASA_FUNCOES.forEach(f => {
    ok(CODIGO.indexOf(f + "(") < 0, "    nem na funcao " + f + "()");
  });

  /* Todo objeto criado tem de nascer no espaco de nomes do Cronograma. */
  const CRIADOS = (CODIGO.match(/create (?:table if not exists|or replace function|policy|index if not exists) ([a-z_.]+)/g) || [])
    .map(m => m.split(" ").pop().replace("public.", ""));
  ok(CRIADOS.length > 0 && CRIADOS.every(n => n.indexOf("cron_") === 0),
     "    e todo objeto criado tem o prefixo cron_", CRIADOS.filter(n => n.indexOf("cron_") !== 0));

  /* A publicacao do Realtime e ACRESCIMO, nunca substituicao: o CONTAS_CASA ja
     publica lancamento e modelo, e um `drop publication` os derrubaria. */
  ok(!/drop publication/i.test(CODIGO) && /alter publication supabase_realtime add table/i.test(CODIGO),
     "    e o Realtime e acrescentado, nunca recriado");

  /* Forma das politicas do Cronograma. */
  const POLITICAS = CODIGO.match(/create policy[\s\S]*?;/g) || [];
  ok(POLITICAS.length >= 7, "as politicas do Cronograma existem", POLITICAS.length);
  ok(POLITICAS.every(p => /to authenticated/.test(p)),
     "11. nenhuma politica do Cronograma e do papel anon");
  ok(!/for all to authenticated/.test(CODIGO),
     "    nenhuma politica `for all` — a ausencia de DELETE e explicita");
  const DE_ESTADO = POLITICAS.filter(p => /on public\.cron_(estado|registro|estrutura_base)/.test(p));
  ok(DE_ESTADO.length === 6 && DE_ESTADO.every(p => /dono = auth\.uid\(\)/.test(p)),
     "    toda politica de estado exige dono = auth.uid()", DE_ESTADO.length);
  ok(DE_ESTADO.every(p => /cron_e_dono\(\)/.test(p)),
     "    e exige tambem estar na allowlist cron_dono");
  ok(!/create policy[^;]*cron_estado[^;]*for delete/i.test(CODIGO) &&
     !/grant[^;]*delete[^;]*cron_estado/i.test(CODIGO),
     "    e nao ha DELETE de cron_estado para o app: a lapide fica");
  /* A allowlist e so de leitura: o app nao se declara dono. */
  ok(!/create policy[^;]*on public\.cron_dono[^;]*for (insert|update|delete)/i.test(CODIGO),
     "    o app nao pode escrever na cron_dono");
  ok(!/create policy[^;]*on public\.cron_estrutura_base[^;]*for (insert|update|delete)/i.test(CODIGO),
     "    nem na cron_estrutura_base (merge de tres vias)");
}

console.log("\n==============================================================");
console.log(falhas.length ? "FALHAS: " + falhas.length : "TUDO PASSA");
falhas.forEach(f => console.log("  - " + f));
process.exit(falhas.length ? 1 : 0);
}
principal().catch(e => { console.error(e); process.exit(1); });
