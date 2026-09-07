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
  .join("\n") + "\n;globalThis.__const = {SINCRONIA, SYNC_FILA_KEY, SYNC_CACHE_KEY, SYNC_MARCA_KEY, SYNC_LIGADO_KEY, SYNC_SESSAO_KEY, dateKey, monthKey, now};";

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
    escritas: 0
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
    srv.assinantes.forEach(fn => { try { fn({new: JSON.parse(JSON.stringify(entregue))}); } catch (e) {} });
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
    f.upsert = (linha) => {
      const p = {};
      p.then = (res, rej) => {
        try { srv.upsert(linha); return Promise.resolve({error: null}).then(res, rej); }
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
          out = srv.linhas.filter(l => f.filtros.every(([c, op, v]) =>
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
      const c = {};
      c.on = (_t, _o, fn) => { c._fn = fn; return c; };
      c.subscribe = (cb) => { srv.assinantes.push(l => c._fn(l)); if (cb) cb("SUBSCRIBED"); return c; };
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

console.log("\n=== 13. Nenhum dominio foi conectado (criterio de parada de 9A) ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  /* Um evento de cada dominio: nada pode mexer no estado das telas. */
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
  ok(A.__armazem["cron:toefl-guia"] === antes.toefl, "cron:toefl-guia intacto");
  ok(A.__armazem["cron:triagem"] === antes.triagem, "cron:triagem intacto");
  ok(A.__armazem["cron:prioridades:2026-W37"] === antes.prio, "as prioridades intactas");
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

  /* 14. cron:checks continua local. */
  A.toggleCheck("seg-min");
  await A.SYNC.drenarFila();
  const dominios = srv.linhas.map(l => l.dominio);
  ok(dominios.indexOf("rotina") < 0,
     "14. marcar rotina NAO virou dominio online nesta fase", dominios);
  ok(!!A.__armazem["cron:checks:" + A.dateKey], "    cron:checks continua no aparelho");
  ok(dominios.every(d => d === "prioridade"),
     "    e SO prioridade subiu: nenhum outro dominio foi conectado", dominios);

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
