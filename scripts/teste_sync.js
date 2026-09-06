/* Testes da Fase 9A — a infraestrutura de estado compartilhado online.
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
  .join("\n") + "\n;globalThis.__const = {SINCRONIA, SYNC_FILA_KEY, SYNC_CACHE_KEY, SYNC_MARCA_KEY, SYNC_LIGADO_KEY};";

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
  const localStorage = {
    getItem: (k) => (k in armazem ? armazem[k] : null),
    setItem: (k, v) => { armazem[k] = String(v); },
    removeItem: (k) => { delete armazem[k]; },
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
    alert(){}, confirm: () => true, prompt: () => null,
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
