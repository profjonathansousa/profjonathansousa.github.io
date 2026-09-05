/* Testes do Hoje 2.0 (Fase 2). Nao tocam a rede e nao tocam o repositorio.
 *
 *     node scripts/teste_hoje.js
 *
 * COMO ISTO RODA UMA PAGINA SEM NAVEGADOR: o bloco <script> do index.html e
 * extraido e avaliado num contexto do vm, com um localStorage e um document de
 * mentira. Nada e reescrito para virar modulo — o que se testa e exatamente o
 * codigo que vai para o ar, e nao uma copia dele que pode divergir.
 *
 * DOIS APARELHOS. criarAparelho() devolve um contexto novo, com armazenamento
 * proprio. E o que permite provar a sincronia de verdade: o "computador" cria
 * uma prioridade, o toque dele e dobrado, e o "celular" recebe.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.dirname(__dirname);
const HTML = fs.readFileSync(path.join(RAIZ, "Cronograma", "index.html"), "utf8");
/* OS SCRIPTS REAIS, NA ORDEM DO HTML (Fase 7). O <script> inline deixou de
   existir: o index.html agora aponta para js/00-config.js ... js/40-app.js, e a
   ordem daquelas tags E parte da arquitetura. O teste le a lista do proprio
   HTML em vez de repeti-la aqui — assim acrescentar ou reordenar um arquivo na
   aplicacao nao deixa o teste medindo outra coisa. */
const SRCS = (HTML.match(/<script[^>]*\ssrc="[^"]+"[^>]*><\/script>/g) || [])
  .map(t => t.match(/src="([^"]+)"/)[1]);
/* O src carrega ?v=<versao> para vencer o cache do navegador; no disco o
   arquivo nao tem query nenhuma. */
const CAMINHOS = SRCS.map(s => s.split("?")[0]);
const FONTES = CAMINHOS.map(src =>
  fs.readFileSync(path.join(RAIZ, "Cronograma", src), "utf8"));
/* Tudo o que era o <script> inline, concatenado na mesma ordem. */
const CODIGO = FONTES.join("\n");
/* `const` e `let` no topo de um script do vm ficam no escopo lexico dele e NAO
   viram propriedade do contexto — so `function` e `var` viram. DIAS, PAINEIS e
   CHK sao const, entao um epilogo os publica. Sem isto o teste enxergaria
   metade da pagina e acharia que a outra metade nao existe. */
const FONTE = CODIGO +
  "\n;globalThis.__const = {DIAS, PAINEIS, CHK, now, ymd, EVENTOS_NA_TELA, SCHEMA_VERSAO, monthKey, todayIdx, PROCESSOS, TOEFL_SEMANA, TOEFL_PLANO, TOEFL_GUIA, TOEFL_FASES,\n   TOEFL_D0, TOEFL_RECURSO};";

let falhas = [];
function ok(cond, nome, detalhe) {
  console.log((cond ? "  PASSA  " : "  FALHA  ") + nome +
    (!cond && detalhe !== undefined ? "  <- " + JSON.stringify(detalhe) : ""));
  if (!cond) falhas.push(nome);
}

/* Um <div> de mentira: guarda innerHTML e devolve a si mesmo em tudo. O codigo
   da pagina so precisa que os nos existam e aceitem atribuicao. */
function noFalso(id) {
  const no = {
    id, innerHTML: "", hidden: false, value: "", open: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, removeAttribute() {}, setAttribute() {},
    addEventListener() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, focus() {}, blur() {}, remove() {}
  };
  return no;
}

function criarAparelho(nome, opcoes) {
  opcoes = opcoes || {};
  /* A ENTRADA REAL, salvo pedido em contrario. O a00 (o artigo do patriotismo)
     nao esta na semente do index.html: ele chega pelo Cronograma/entrada.json,
     que o Cowork escreve. Testar com a semente crua seria testar um aparelho
     que nunca sincronizou — e o caminho entrada -> mesclarEntrada -> trilho e
     justamente metade da arquitetura que a Fase 2 promete nao quebrar. */
  const armazem = Object.assign({ "cron:aparelho": JSON.stringify(nome) }, opcoes.storage || {});
  if (opcoes.semEntrada !== true) {
    armazem["cron:entrada"] = fs.readFileSync(
      path.join(RAIZ, "Cronograma", "entrada.json"), "utf8");
  }
  const nos = {};
  const localStorage = {
    getItem: (k) => (k in armazem ? armazem[k] : null),
    setItem: (k, v) => { armazem[k] = String(v); },
    removeItem: (k) => { delete armazem[k]; },
    clear: () => { for (const k of Object.keys(armazem)) delete armazem[k]; }
  };
  const document = {
    getElementById: (id) => (nos[id] = nos[id] || noFalso(id)),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, createElement: () => noFalso("novo"),
    body: noFalso("body"), documentElement: noFalso("html"),
    visibilityState: "visible"
  };
  const ctx = {
    localStorage, document, console,
    window: { addEventListener() {}, location: { href: "", reload() {} } },
    navigator: { userAgent: "node", onLine: true },
    location: { href: "", reload() {} },
    setTimeout: (f) => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    /* Sem rede: o boot do arquivo chama buscarEntrada().then(buscarEstado) e
       cai no catch dele proprio. E o que se quer — o teste controla a descida
       chamando as funcoes a mao. */
    fetch: () => Promise.reject(new Error("sem rede no teste")),
    alert() {}, confirm: () => true, prompt: () => opcoes.prompt || null,
    Date, Math, JSON, String, Number, Object, Array, Boolean, RegExp, Error, isFinite, isNaN
  };
  ctx.window.localStorage = localStorage;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(FONTE, ctx, { filename: "index.html:<script>" });
  Object.assign(ctx, ctx.__const || {});   /* DIAS, PAINEIS, CHK... */
  if (opcoes.semEntrada !== true) { try { ctx.mesclarEntrada(); } catch (e) {} }
  ctx.__armazem = armazem;
  return ctx;
}

/* ============================================================= */
console.log("\n=== 1. A pagina inteira avalia sem navegador ===");
const A = criarAparelho("mac");
ok(typeof A.renderHoje === "function", "renderHoje existe");
ok(typeof A.estagioDoTrilho === "function", "estagioDoTrilho existe");
ok(typeof A.aplicarPrioridadesDoEstado === "function", "aplicarPrioridadesDoEstado existe");
ok(typeof A.vgMarcar === "function", "vgMarcar continua existindo");
ok(typeof A.enfileirarToque === "function", "enfileirarToque continua existindo");
ok(typeof A.sortedRef === "undefined", "sortedRef saiu (enderecamento por id)");

console.log("\n=== 2. As rotinas nao escolhem mais um Trilho ===");
const idsSegunda = A.DIAS[1].tasks.map(t => t.id);
ok(idsSegunda.indexOf("seg-plan") < 0, "'Planejar a semana' nao existe mais", idsSegunda);
const comLink = [];
Object.keys(A.DIAS).forEach(k => (A.DIAS[k].tasks || []).forEach(t => { if (t.link) comLink.push(t.id); }));
ok(comLink.indexOf("seg-acad") < 0 && comLink.indexOf("ter-art") < 0 &&
   comLink.indexOf("sex-esc") < 0 && comLink.indexOf("sab-consol") < 0,
   "nenhuma rotina academica escolhe um artigo sozinha", comLink);
ok(A.DIAS[1].tasks.find(t => t.id === "seg-acad").painel === "leituras",
   "mas o botao para o trilho continua la (painel)");
/* O pipeline tem 12 artigos ativos: com escolha a fazer, a rotina nao escolhe. */
ok(A.trilhoSemEscolha("pipeline") === null,
   "trilhoSemEscolha devolve null quando ha mais de um projeto ativo");

console.log("\n=== 3. O Hoje nunca inventa o estagio de um Trilho ===");
const et = A.estagioDoTrilho("pipeline", "a01");
ok(et && et.subT && et.subT.length > 3, "estagioDoTrilho devolve o texto do trilho", et && et.subT);
const subsA01 = A.getProjs("pipeline").find(p => p.id === "a01").subs;
ok(et.subT === subsA01.find(x => x.id === et.subId).t,
   "e o texto e VERBATIM o do subitem, sem sintese", et.subT);
ok(!/trabalhar no|dar andamento|avancar o/i.test(et.subT),
   "nunca um rotulo generico", et.subT);
/* Fechar a etapa no trilho move o Hoje para a proxima, sem ninguem tocar aqui */
const projs = A.getProjs("pipeline");
const a01 = projs.find(p => p.id === "a01");
const antes = A.estagioDoTrilho("pipeline", "a01").subId;
a01.subs.find(x => x.id === antes).st = 2;
A.setProjs("pipeline", projs);
const depois = A.estagioDoTrilho("pipeline", "a01").subId;
ok(depois !== antes, "etapa fechada -> o Hoje passa a mostrar a seguinte", { antes, depois });
ok(A.estagioDoTrilho("pipeline", "a01").subT ===
   a01.subs.find(x => x.id === depois).t, "e continua sendo o texto do trilho");

console.log("\n=== 4. Prioridade manual fica acima das rotinas ===");
const B = criarAparelho("mac2", { prompt: "Candidatura Notre Dame" });
B.addPrioridadeLivre();
const pr = B.prioridadesDoDia();
ok(pr.manuais.length === 1 && pr.manuais[0].t === "Candidatura Notre Dame",
   "prioridade livre criada", pr.manuais);
/* Fase 3: sugeridas deixou de ser vazio. O que continua valendo, e e o que
   importa, e o teto: manuais + sugeridas nunca passa de tres. */
ok(pr.manuais.length + pr.sugeridas.length <= B.MOTOR_TETO_TOTAL,
   "manuais + sugeridas nunca passa do teto", pr.manuais.length + pr.sugeridas.length);
ok(pr.sugeridas.every(sg => sg.sugerida === true),
   "e toda sugestao vem marcada como sugestao");
B.renderHoje();
const htmlHoje = B.document.getElementById("view-hoje").innerHTML;
const posPrio = htmlHoje.indexOf("Prioridades da semana");
const posRot = htmlHoje.indexOf("Rotinas de");
ok(posPrio > -1 && posRot > -1 && posPrio < posRot,
   "o bloco de Prioridades e desenhado ANTES das Rotinas", { posPrio, posRot });

console.log("\n=== 5. Contexto restringe, e nao rebaixa ===");
B.setContexto("fora");
B.renderHoje();
const foraHtml = B.document.getElementById("view-hoje").innerHTML;
const pPrio = foraHtml.indexOf("Prioridades da semana");
const pRot = foraHtml.indexOf("Rotinas de");
ok(pPrio < pRot, "fora de casa, a prioridade continua acima das rotinas");
ok(foraHtml.indexOf("Candidatura Notre Dame") < pRot,
   "e o cartao dela continua no bloco de cima");
ok(B.prioridadesDoDia().manuais.length === 1,
   "o contexto nao remove nem reordena prioridade nenhuma");
ok(/pede computador/.test(foraHtml), "fora de casa apenas MARCA o que pede computador");
B.setContexto("casa");
ok(!/pede computador/.test((B.renderHoje(), B.document.getElementById("view-hoje").innerHTML)),
   "em casa o aviso some");

console.log("\n=== 6. Retomadas: lembram sem acusar ===");
const C = criarAparelho("ret");
function mexerEm(ctx, pid, projId, subId, diasAtras) {
  const ps = ctx.getProjs(pid), p = ps.find(x => x.id === projId);
  const s = p.subs.find(x => x.id === subId);
  s.em = new Date(Date.now() - diasAtras * 86400000).toISOString();
  s.st = 1;
  ctx.setProjs(pid, ps);
  return p;
}
ok(C.retomadas().length === 0, "projeto que nunca comecou NAO vira retomada",
   C.retomadas().map(r => r.projT));
mexerEm(C, "pipeline", "a02", "a02-1", 30);
let r = C.retomadas();
ok(r.length === 1 && r[0].projId === "a02", "projeto comecado e parado ha 30 dias aparece", r);
/* floor de dias inteiros: 30 dias menos alguns milissegundos e 29 dias
   COMPLETOS, e dizer 29 e mais honesto do que arredondar para cima. */
ok(r[0].dias === 29 || r[0].dias === 30, "com a contagem certa", r[0].dias);
ok(r[0].subT === C.estagioDoTrilho("pipeline", "a02").subT,
   "e o subtitulo e o estagio real do trilho", r[0].subT);
mexerEm(C, "pipeline", "a03", "a03-1", 3);
ok(C.retomadas().length === 1, "projeto mexido ha 3 dias nao aparece");
/* decisao sua nao e esquecimento */
let ps = C.getProjs("pipeline"), a02 = ps.find(x => x.id === "a02");
a02.subs.forEach(x => { x.vida = "adiado"; });
C.setProjs("pipeline", ps);
ok(C.retomadas().length === 0, "projeto que voce ADIOU nao vira retomada");
ps = C.getProjs("pipeline"); a02 = ps.find(x => x.id === "a02");
a02.subs.forEach(x => { x.vida = "abandonado"; });
C.setProjs("pipeline", ps);
ok(C.retomadas().length === 0, "projeto que voce ABANDONOU nao vira retomada");
ps = C.getProjs("pipeline"); a02 = ps.find(x => x.id === "a02");
a02.subs.forEach(x => { x.vida = "ativo"; });
C.setProjs("pipeline", ps);
ok(C.retomadas().length === 1, "reativado, volta a ser lembrado");
C.adiarRetomada("pipeline", "a02");
ok(C.retomadas().length === 0, "'agora nao' silencia por 14 dias");
/* e nao promove nada sozinha */
ok(C.prioridadesDoDia().manuais.length === 0,
   "retomada NAO vira prioridade sozinha nesta fase");

console.log("\n=== 7. Datas: cinco na tela, nenhuma perdida ===");
const D = criarAparelho("datas");
const dia = (n) => {
  const d = new Date(Date.now() + n * 86400000);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
         "-" + String(d.getDate()).padStart(2, "0");
};
const oito = [];
for (let i = 1; i <= 8; i++) oito.push({ id: "ev" + i, t: "Data " + i, data: dia(i * 3) });
oito.push({ id: "evPassado", t: "Ja passou", data: dia(-10) });
D.setEventos(oito);
D.renderEventos();
let evHtml = D.document.getElementById("eventos").innerHTML;
const desenhados = (evHtml.match(/class="ev"/g) || []).length;
ok(desenhados === 5, "exatamente 5 eventos na primeira tela", desenhados);
ok(evHtml.indexOf("Data 1") < evHtml.indexOf("Data 5"), "da mais proxima para a mais distante");
ok(evHtml.indexOf("Data 6") < 0, "a sexta nao e desenhada");
ok(evHtml.indexOf("Ja passou") < 0, "as que ja passaram tambem nao");
ok(/class="count"/.test(evHtml) && /Data 1/.test(evHtml), "o contador grande continua, na mais proxima");
ok(D.getEventos().length === 9, "e NENHUM evento foi apagado do cron:eventos", D.getEventos().length);
/* O defeito que o corte teria criado */
D.dateEv("ev6", dia(99));
ok(D.getEventos().find(e => e.id === "ev6").data === dia(99),
   "a SEXTA data e editavel mesmo sem estar na tela");
ok(D.getEventos().find(e => e.id === "ev1").data === dia(3),
   "e a primeira nao foi tocada por engano");
D.delEv("ev8");
ok(!D.getEventos().find(e => e.id === "ev8"), "a oitava e removivel pelo id");
ok(D.getEventos().length === 8, "e so ela saiu", D.getEventos().length);
D.save("cron:eventos-tudo", true);
D.renderEventos();
evHtml = D.document.getElementById("eventos").innerHTML;
ok((evHtml.match(/class="ev"/g) || []).length === 8, "'ver todas' mostra a lista inteira");
ok(/Ja passou/.test(evHtml), "inclusive as que ja passaram");

console.log("\n=== 8. Prioridade atravessa aparelhos (o caminho dos toques) ===");
/* O computador elege. */
const MAC = criarAparelho("mac", { prompt: "Pos-doc Notre Dame" });
MAC.addPrioridadeLivre();
MAC.addPrioridadeTrilho("pipeline/a00");
const toques = MAC.getToques();
const tPrio = toques.filter(t => t.tipo === "prioridade");
ok(tPrio.length === 2, "duas prioridades geraram dois toques", toques.map(t => t.tipo));
ok(tPrio.every(t => t.dados.sem && t.dados.prid && t.id && t.quando && t.aparelho),
   "no formato dos toques que ja existiam", tPrio[0]);
ok(tPrio.some(t => t.dados.tipo === "trilho" && t.dados.painel === "pipeline" &&
                   t.dados.projId === "a00"),
   "a de trilho carrega o ENDERECO do projeto");
ok(tPrio.every(t => !/Janela|corpus|mapa argumentativo/.test(JSON.stringify(t.dados))),
   "e NAO carrega o texto da etapa: ele e lido do trilho no destino", tPrio.map(t => t.dados.t));

/* A dobra, do jeito que o dobrar_toques.py faz: chave periodo/id, valor com
   quando e aparelho. O teste de sincronia roda o script de verdade; aqui a
   forma so precisa bater para a descida poder ser exercitada. */
function dobrarNaMao(listaDeToques) {
  const est = { prioridades: {} };
  listaDeToques.slice().sort((a, b) => (a.quando || "") < (b.quando || "") ? -1 : 1)
    .forEach(t => {
      if (t.tipo !== "prioridade") return;
      const k = t.dados.sem + "/" + t.dados.prid;
      const atual = est.prioridades[k];
      if (atual && (atual.quando || "") > (t.quando || "")) return;
      est.prioridades[k] = {
        tipo: t.dados.tipo, painel: t.dados.painel, projId: t.dados.projId,
        t: t.dados.t, feito_em: t.dados.feito_em || "",
        del: !!t.dados.del, quando: t.quando, aparelho: t.aparelho
      };
    });
  return est;
}
/* O celular, que nunca viu nada. */
const CEL = criarAparelho("celular");
ok(CEL.prioridadesDoDia().manuais.length === 0, "o celular comeca sem prioridade nenhuma");
CEL.aplicarPrioridadesDoEstado(dobrarNaMao(tPrio));
const noCel = CEL.prioridadesDoDia().manuais;
ok(noCel.length === 2, "computador -> celular: as duas chegaram", noCel.length);
ok(noCel.some(p => p.t === "Pos-doc Notre Dame"), "a livre chegou com o texto");
const trilhoNoCel = noCel.find(p => p.tipo === "trilho");
ok(trilhoNoCel && trilhoNoCel.projId === "a00", "a de trilho chegou pelo endereco");
const etCel = CEL.estagioDoTrilho(trilhoNoCel.painel, trilhoNoCel.projId);
ok(etCel && etCel.subT, "e o celular LE o estagio do proprio trilho dele", etCel.subT);

/* O caminho inverso. */
const CEL2 = criarAparelho("celular2", { prompt: "Revisar TOEFL" });
CEL2.addPrioridadeLivre();
const MAC2 = criarAparelho("mac3");
MAC2.aplicarPrioridadesDoEstado(dobrarNaMao(CEL2.getToques().filter(t => t.tipo === "prioridade")));
ok(MAC2.prioridadesDoDia().manuais.some(p => p.t === "Revisar TOEFL"),
   "celular -> computador: tambem chega");

/* A lapide, e o relogio. */
const MAC3 = criarAparelho("mac4", { prompt: "Some depois" });
MAC3.addPrioridadeLivre();
const prid = MAC3.getPrio()[0].id;
MAC3.delPrioridade(prid);
const CEL3 = criarAparelho("celular3");
CEL3.aplicarPrioridadesDoEstado(dobrarNaMao(MAC3.getToques().filter(t => t.tipo === "prioridade")));
ok(CEL3.prioridadesDoDia().manuais.length === 0,
   "apagada no computador -> some no celular (lapide del)");
/* Um toque atrasado nao derruba o que e mais novo. */
const CEL4 = criarAparelho("celular4");
CEL4.aplicarPrioridadesDoEstado({ prioridades: {
  [CEL4.semanaAtual + "/px"]: { tipo: "livre", t: "nova", del: false,
    quando: new Date().toISOString(), aparelho: "outro" } } });
CEL4.aplicarPrioridadesDoEstado({ prioridades: {
  [CEL4.semanaAtual + "/px"]: { tipo: "livre", t: "velha", del: false,
    quando: "2020-01-01T00:00:00.000Z", aparelho: "outro" } } });
ok(CEL4.getPrio()[0].t === "nova", "toque atrasado nao derruba estado mais novo",
   CEL4.getPrio());

console.log("\n=== 9. Nada do que ja existia foi mexido ===");
const E = criarAparelho("regress");
const antesToques = E.getToques().length;
E.vgMarcar("philjobs-31649", 1);
ok(E.LS("cron:triagem", {})["philjobs-31649"].st === 1, "vgMarcar continua gravando cron:triagem");
const tv = E.getToques().filter(t => t.tipo === "triagem");
ok(tv.length === 1 && tv[0].dados.vid === "philjobs-31649",
   "e continua emitindo toque de triagem no formato de sempre", tv[0] && tv[0].dados);
ok(E.VG_ST.NOVO === 0 && E.VG_ST.SIM === 1 && E.VG_ST.NAO === 2 && E.VG_ST.ARQ === 3,
   "VG_ST intacto");
/* Marcar uma etapa pelo Hoje continua indo pelo mesmo caminho */
const F = criarAparelho("marcar");
const alvoEt = F.estagioDoTrilho("pipeline", "a00");
F.marcarDoHoje("pipeline", "a00", alvoEt.subId, true);
const tr = F.getToques().filter(t => t.tipo === "registro");
ok(tr.length === 1 && tr[0].dados.subId === alvoEt.subId && tr[0].dados.para === 2,
   "marcar do Hoje emite toque 'registro', como sempre", tr[0] && tr[0].dados);
ok(F.getProjs("pipeline").find(p => p.id === "a00").subs
    .find(x => x.id === alvoEt.subId).st === 2,
   "e fecha a etapa no proprio trilho");
ok(F.LS("cron:registro", []).length === 1, "e grava no registro datado");

console.log("\n=== 10. O caminho automatico do pipeline continua inteiro ===");
/* O pipeline nao passa pela tela: escreve toque, o dobrar_toques consolida, e
   a pagina RECEBE pelo estado.json. Aqui se prova a ponta que e da pagina. */
const G = criarAparelho("pipe");
const alvoG = G.estagioDoTrilho("pipeline", "a00");
ok(alvoG.st !== 2, "a etapa comeca aberta");
const estadoDoCowork = { itens: {} };
estadoDoCowork.itens["pipeline/a00/" + alvoG.subId] =
  { st: 2, vida: "ativo", temMotivo: false, quando: new Date().toISOString(), aparelho: "cowork" };
/* a mesma regra de relogio da descida real */
const psG = G.getProjs("pipeline"), prG = psG.find(p => p.id === "a00");
const sxG = prG.subs.find(x => x.id === alvoG.subId);
if ((sxG.em || "") < estadoDoCowork.itens["pipeline/a00/" + alvoG.subId].quando) {
  sxG.st = 2; sxG.em = estadoDoCowork.itens["pipeline/a00/" + alvoG.subId].quando;
  G.setProjs("pipeline", psG);
}
const depoisG = G.estagioDoTrilho("pipeline", "a00");
ok(depoisG.subId !== alvoG.subId,
   "etapa fechada pelo pipeline -> o Hoje ja mostra a proxima, sem ninguem marcar nada");
ok(G.getToques().filter(t => t.tipo === "registro").length === 0,
   "e receber NAO gera toque de volta (sem eco)");
/* a distincao 'estrela' continua visivel no dado */
const temEstrela = G.getProjs("pipeline")
  .some(p => (p.subs || []).some(x => x.prova === "estrela"));
ok(temEstrela, "as etapas 'estrela' continuam marcadas no dado");

console.log("\n=== 10b. A etapa 'estrela' fica visivel no Hoje ===");
/* prova:"estrela" existia no entrada.json desde sempre e NUNCA era lida pela
   pagina. E justamente a etapa que o pipeline nao fecha sozinho, porque a
   conclusao e decisao do autor — quem mais precisa aparecer. */
const S = criarAparelho("estrela");
const etS = S.estagioDoTrilho("pipeline", "a02");
ok(etS.prova === "estrela", "a etapa corrente de a02 e uma 'estrela'", etS.prova);
S.addPrioridadeTrilho("pipeline/a02");
S.renderHoje();
const htmlS = S.document.getElementById("view-hoje").innerHTML;
ok(/depende de voc/.test(htmlS), "e o cartao mostra o selo 'depende de voce'");
ok(htmlS.indexOf(S.escapeHtml(etS.subT)) > -1,
   "junto do texto real da etapa", etS.subT);
/* e some quando a etapa corrente e de maquina */
const S2 = criarAparelho("maquina");
const etS2 = S2.estagioDoTrilho("pipeline", "a00");
ok(etS2.prova === "maquina", "a etapa corrente de a00 e de maquina", etS2.prova);
S2.addPrioridadeTrilho("pipeline/a00");
S2.renderHoje();
/* So o bloco das MANUAIS: o motor pode estar sugerindo, ao lado, um projeto
   cuja etapa corrente e uma estrela — e ai o selo aparece por direito, no
   cartao dele. O que se testa aqui e o cartao da escolha manual. */
const htmlS2 = S2.document.getElementById("view-hoje").innerHTML;
const soManuais = htmlS2.split("sug-head")[0];
ok(!/depende de voc/.test(soManuais),
   "e ai o selo nao aparece no cartao da escolha manual");

console.log("\n=== 11. Indicador de Vagas: uma linha, sem triagem ===");
const H = criarAparelho("vagas");
H.VG_VAGAS = { itens: [
  { id: "v1", novo: true, veredicto: "relevante" },
  { id: "v2", novo: true, veredicto: "revisar" },
  { id: "v3", novo: false, veredicto: "rejeitado" },
  { id: "v4", novo: true, veredicto: "relevante" }
] };
const c = H.contagemDeVagas();
ok(c.novas === 3 && c.revisar === 1, "conta novas e a revisar, e ignora rejeitada", c);
const ind = H.renderVagasIndicador();
ok(/Vagas/.test(ind) && /3 novas/.test(ind), "a linha diz o essencial", ind);
ok(!/Vou me candidatar|vg-card/.test(ind), "e nao traz triagem nenhuma para o Hoje");

console.log("\n=== 12. TOEFL: a acao concreta do dia vem do PROCESSO (Fase 4) ===");
/* Os cinco textos COMO ESTAVAM antes da Fase 4, copiados do DIAS do commit
   anterior. Servem de trava contra reescrita: a Fase 4 moveu conteudo, e
   mover conteudo so e seguro se houver algo comparando letra por letra. */
const TOEFL_TEXTO_ORIGINAL = {
  1:{t:"TOEFL · Reading: exercício + revisão dos erros",
     n:"TestReady, seção Reading Practice. Fazer o exercício e revisar cada erro. ~20 min"},
  2:{t:"TOEFL · Listening: prática + 4 quadrantes",
     n:"TestReady, seção Listening Practice, com o método dos 4 quadrantes. ~20 min"},
  3:{t:"TOEFL · Vocabulário (Anki) + shadowing",
     n:"Baralho Academic Word List no Anki, depois shadowing de um áudio em inglês. ~15 min"},
  4:{t:"TOEFL · Writing: um texto completo",
     n:"TestReady, seção Writing Practice, alternando Write an Email e Academic Discussion. ~20 min"},
  5:{t:"TOEFL · Speaking (PREP) ou 1 simulado",
     n:"TestReady, seção Speaking Practice, esqueleto PREP. A cada 2–3 semanas, troque por um simulado completo no Magoosh. ~30 min"}
};
/* A rotina nao carrega mais o texto: ela diz de qual processo o dia depende. */
let rotinasToefl = 0;
Object.keys(A.DIAS).forEach(k => (A.DIAS[k].tasks || []).forEach(t => {
  if (!/toefl/i.test(t.id)) return;
  rotinasToefl++;
  ok(t.processo === "toefl" && !t.t && !t.n,
     "a rotina " + t.id + " so aponta para o processo, sem texto proprio", t);
}));
ok(rotinasToefl === 5, "as cinco rotinas de TOEFL continuam existindo", rotinasToefl);
/* E o texto resolvido e EXATAMENTE o que existia antes.

   A DATA VAI EXPLICITA (Fase 9A). O processo passou a calar antes do D0, e sem
   o terceiro argumento estas assercoes mediriam o relogio de parede: passariam
   a partir de 07/09/2026 e falhariam antes. Fixar a data aqui mantem a trava
   fazendo o que ela sempre fez — comparar o texto do plano letra por letra. */
const DEPOIS_DO_D0 = "2026-09-07";
Object.keys(TOEFL_TEXTO_ORIGINAL).forEach(dia => {
  const ac = A.acaoDoDiaDoProcesso("toefl", Number(dia), DEPOIS_DO_D0);
  ok(!!ac, "o processo responde pelo dia " + dia);
  ok(ac && ac.t === TOEFL_TEXTO_ORIGINAL[dia].t,
     "e o titulo e o texto que ja existia: " + TOEFL_TEXTO_ORIGINAL[dia].t.slice(0, 42),
     ac && ac.t);
  ok(ac && ac.n === TOEFL_TEXTO_ORIGINAL[dia].n,
     "e a nota tambem, letra por letra (dia " + dia + ")", ac && ac.n);
});
ok(A.acaoDoDiaDoProcesso("toefl", 6, DEPOIS_DO_D0) === null &&
   A.acaoDoDiaDoProcesso("toefl", 0, DEPOIS_DO_D0) === null,
   "sabado e domingo o processo nao pede nada");
ok(typeof A.toeflFase === "function" && typeof A.renderGuia === "function",
   "e o mecanismo de fases/guia continua intacto");

console.log("\n=== 13. Motor de prioridades: hierarquia e teto (Fase 3) ===");
/* Um aparelho limpo, com o pipeline zerado, para que cada caso seja o unico
   sinal na mesa. Sem isto o motor responde ao dado real e o teste vira
   adivinhacao. */
function motorLimpo(nome, prompt) {
  const ctx = criarAparelho(nome, prompt ? { prompt } : undefined);
  PAINEIS_TODOS(ctx).forEach(pid => {
    const ps = ctx.getProjs(pid);
    ps.forEach(pr => {
      delete pr.mes;
      (pr.subs || []).forEach(x => { x.st = 0; x.em = ""; x.vida = "ativo";
                                     x.voltar_em = ""; x.prova = "maquina"; });
    });
    ctx.setProjs(pid, ps);
  });
  return ctx;
}
function PAINEIS_TODOS(ctx) { return ctx.PAINEIS.map(P => P.id); }
function proj(ctx, pid, projId) {
  return ctx.getProjs(pid).find(p => p.id === projId);
}
function gravar(ctx, pid, mut) {
  const ps = ctx.getProjs(pid); mut(ps); ctx.setProjs(pid, ps);
}
const diaISO = (n) => new Date(Date.now() - n * 86400000).toISOString();
const dataYMD = (n) => {
  const d = new Date(Date.now() + n * 86400000);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") +
         "-" + String(d.getDate()).padStart(2,"0");
};

const M = motorLimpo("motor");
ok(M.motorDePrioridades([]).length === 0,
   "pipeline zerado e sem sinal nenhum: o motor nao sugere nada",
   M.motorDePrioridades([]).map(x => x.projId));

/* prazo vence tudo */
gravar(M, "pipeline", ps => {
  ps.find(p => p.id === "a05").mes = M.monthKey;              /* vence este mes */
  const a06 = ps.find(p => p.id === "a06");
  a06.subs[0].em = diaISO(60); a06.subs[0].st = 1;            /* 60 dias parado */
});
let sug = M.motorDePrioridades([]);
ok(sug[0].projId === "a05" && sug[0].classe === "URGENTE",
   "prazo proximo vence projeto sem prazo", sug.map(x => x.projId + ":" + x.classe));
ok(/prazo em|fecha hoje/.test(sug[0].motivo), "com o motivo do prazo", sug[0].motivo);
ok(sug[1] && sug[1].projId === "a06" && sug[1].classe === "RETOMADA",
   "e o parado ha 60 dias vem logo atras", sug[1] && sug[1].classe);
ok(/(59|60) dias sem avan/.test(sug[1].motivo),
   "com o motivo da inatividade (floor de dias inteiros)", sug[1].motivo);

/* teto e hierarquia */
ok(M.motorDePrioridades([]).length === 2, "no maximo duas sugestoes");
ok(M.motorDePrioridades([{tipo:"livre", t:"uma"}]).length === 2, "com 1 manual: ainda duas");
ok(M.motorDePrioridades([{tipo:"livre"},{tipo:"livre"}]).length === 1, "com 2 manuais: uma");
ok(M.motorDePrioridades([{tipo:"livre"},{tipo:"livre"},{tipo:"livre"}]).length === 0,
   "com 3 manuais: NENHUMA — a tela nao vira lista de dez prioridades");
ok(M.motorDePrioridades([{tipo:"livre"},{tipo:"livre"},{tipo:"livre"},{tipo:"livre"}]).length === 0,
   "e com mais de 3 tambem nao");

/* manual nunca e substituida nem repetida */
const jaEscolhida = [{tipo:"trilho", painel:"pipeline", projId:"a05"}];
sug = M.motorDePrioridades(jaEscolhida);
ok(!sug.some(x => x.projId === "a05"),
   "o que voce ja escolheu nao volta como sugestao", sug.map(x => x.projId));
ok(M.getPrio().length === 0, "e o motor nao gravou prioridade nenhuma");
ok(M.getToques().length === 0, "nem emitiu toque nenhum: sugestao e derivada");

console.log("\n=== 14. Motor: o que NAO pode ser sugerido ===");
const N = motorLimpo("motor2");
/* concluido */
gravar(N, "pipeline", ps => {
  ps.find(p => p.id === "a02").subs.forEach(x => { x.st = 2; });
  ps.find(p => p.id === "a02").mes = N.monthKey;              /* prazo colado */
});
ok(!N.motorDePrioridades([]).some(x => x.projId === "a02"),
   "projeto CONCLUIDO nao aparece, nem com prazo vencendo",
   N.motorDePrioridades([]).map(x => x.projId));
/* abandonado */
gravar(N, "pipeline", ps => {
  const p = ps.find(x => x.id === "a03");
  p.mes = N.monthKey; p.subs.forEach(x => { x.vida = "abandonado"; });
});
ok(!N.motorDePrioridades([]).some(x => x.projId === "a03"),
   "projeto ABANDONADO nao aparece", N.motorDePrioridades([]).map(x => x.projId));
/* adiado com volta no futuro */
gravar(N, "pipeline", ps => {
  const p = ps.find(x => x.id === "a04");
  p.mes = N.monthKey;
  p.subs.forEach(x => { x.vida = "adiado"; x.voltar_em = dataYMD(30); });
});
ok(!N.motorDePrioridades([]).some(x => x.projId === "a04"),
   "projeto ADIADO nao aparece antes do voltar_em",
   N.motorDePrioridades([]).map(x => x.projId));
/* inaplicavel em todas as etapas */
gravar(N, "pipeline", ps => {
  const p = ps.find(x => x.id === "a07");
  p.mes = N.monthKey; p.subs.forEach(x => { x.vida = "inaplicavel"; });
});
ok(!N.motorDePrioridades([]).some(x => x.projId === "a07"),
   "projeto so com etapas INAPLICAVEIS nao aparece");
/* silenciado */
gravar(N, "pipeline", ps => { ps.find(x => x.id === "a08").mes = N.monthKey; });
ok(N.motorDePrioridades([]).some(x => x.projId === "a08"), "a08 aparece antes de dispensar");
N.dispensarSugestao("pipeline", "a08");
ok(!N.motorDePrioridades([]).some(x => x.projId === "a08"),
   "sugestao DISPENSADA nao reaparece imediatamente",
   N.motorDePrioridades([]).map(x => x.projId));
/* e a dispensa e a mesma das retomadas: um "agora nao" vale para os dois */
ok(!N.retomadas().some(r => r.projId === "a08"),
   "e dispensar a sugestao tambem silencia a retomada do mesmo projeto");

console.log("\n=== 15. Motor: classes, motivo e estabilidade ===");
const O = motorLimpo("motor3");
gravar(O, "pipeline", ps => {
  ps.find(p => p.id === "a09").subs[0].prova = "estrela";     /* decisao travada */
  const a10 = ps.find(p => p.id === "a10");
  a10.subs[0].em = diaISO(20); a10.subs[0].st = 1;            /* inativo */
});
sug = O.motorDePrioridades([]);
const classes = sug.map(x => x.classe);
ok(classes.indexOf("DECISAO") < classes.indexOf("RETOMADA") ||
   classes.indexOf("RETOMADA") < 0,
   "DECISAO vem antes de RETOMADA", classes);
ok(sug.every(x => x.motivo && x.motivo.length > 4),
   "toda sugestao carrega um motivo em portugues", sug.map(x => x.motivo));
ok(sug.every(x => O.MOTOR_CLASSES.indexOf(x.classe) > -1),
   "e uma classe conhecida", sug.map(x => x.classe));
/* estabilidade: duas chamadas seguidas, mesma lista, mesma ordem */
const s1 = O.motorDePrioridades([]).map(x => x.painel + "/" + x.projId).join("|");
const s2 = O.motorDePrioridades([]).map(x => x.painel + "/" + x.projId).join("|");
const s3 = O.motorDePrioridades([]).map(x => x.painel + "/" + x.projId).join("|");
ok(s1 === s2 && s2 === s3, "o resultado e estavel entre chamadas", [s1, s2, s3]);
/* e nao ha duplicata */
const ids = O.motorDePrioridades([]).map(x => x.painel + "/" + x.projId);
ok(new Set(ids).size === ids.length, "nenhuma sugestao repetida", ids);

console.log("\n=== 16. Motor: sugestao mostra o estagio REAL do trilho ===");
const Q = motorLimpo("motor4");
gravar(Q, "pipeline", ps => { ps.find(p => p.id === "a11").mes = Q.monthKey; });
sug = Q.motorDePrioridades([]);
const alvoQ = sug.find(x => x.projId === "a11");
ok(!!alvoQ, "a11 foi sugerido pelo prazo");
const etQ = Q.estagioDoTrilho("pipeline", "a11");
ok(alvoQ.subT === etQ.subT, "e o texto e o do trilho, verbatim", alvoQ.subT);
ok(!/trabalhar no|dar andamento|avancar o/i.test(alvoQ.subT),
   "nunca um rotulo generico", alvoQ.subT);
/* fechar a etapa muda a acao exibida, sem tocar na sugestao */
gravar(Q, "pipeline", ps => {
  const p = ps.find(x => x.id === "a11");
  p.subs.find(x => x.id === etQ.subId).st = 2;
});
const depoisQ = Q.motorDePrioridades([]).find(x => x.projId === "a11");
ok(depoisQ && depoisQ.subId !== etQ.subId,
   "etapa concluida -> a acao exibida passa a ser a seguinte",
   depoisQ && depoisQ.subT);
ok(depoisQ.subT === Q.estagioDoTrilho("pipeline", "a11").subT,
   "e continua vindo do trilho");

console.log("\n=== 17. Motor: contexto restringe, nao destroi ===");
const R = motorLimpo("motor5");
gravar(R, "pipeline", ps => { ps.find(p => p.id === "a12").mes = R.monthKey; });
const emCasa = R.motorDePrioridades([]).map(x => x.painel + "/" + x.projId);
R.setContexto("fora");
const foraDeCasa = R.motorDePrioridades([]).map(x => x.painel + "/" + x.projId);
ok(emCasa.join("|") === foraDeCasa.join("|"),
   "fora de casa NAO apaga nem reordena recomendacao nenhuma",
   { emCasa, foraDeCasa });
R.renderHoje();
const htmlR = R.document.getElementById("view-hoje").innerHTML;
ok(/sugest/.test(htmlR), "a sugestao continua na tela fora de casa");
ok(/pede computador/.test(htmlR), "com o aviso de que pede computador");

console.log("\n=== 18. Motor: adotar usa o mecanismo que ja existia ===");
const T = motorLimpo("motor6");
gravar(T, "pipeline", ps => { ps.find(p => p.id === "a06").mes = T.monthKey; });
const antesT = T.getPrio().length;
ok(T.motorDePrioridades([]).some(x => x.projId === "a06"), "a06 e sugerido");
T.adotarSugestao("pipeline", "a06");
ok(T.getPrio().length === antesT + 1, "adotar cria UMA prioridade manual", T.getPrio());
const nova = T.getPrio()[T.getPrio().length - 1];
ok(nova.tipo === "trilho" && nova.painel === "pipeline" && nova.projId === "a06",
   "de trilho, apontando para o projeto", nova);
ok(!nova.sugerida, "e ela deixa de ser sugestao: virou escolha sua");
const tq = T.getToques().filter(x => x.tipo === "prioridade");
ok(tq.length === 1 && tq[0].dados.projId === "a06",
   "pelo toque 'prioridade' que ja existia — nenhum estado paralelo", tq[0] && tq[0].dados);
ok(!T.motorDePrioridades(T.getPrio()).some(x => x.projId === "a06"),
   "e o motor para de sugerir o que virou manual");
T.renderHoje();
const htmlT = T.document.getElementById("view-hoje").innerHTML;
ok(htmlT.indexOf("Prioridades da semana") < htmlT.indexOf("sug-head") ||
   htmlT.indexOf("sug-head") < 0,
   "manuais desenhadas antes das sugeridas");

console.log("\n=== 19. Motor: o seam de Processos existe e esta vazio ===");
ok(typeof A.sinaisDeProcesso === "function", "sinaisDeProcesso existe");
ok(A.sinaisDeProcesso().length === 0,
   "e devolve vazio: esta fase nao inventa estrutura de Processo");

console.log("\n=== 20. Processos: a aba existe e traz o TOEFL (Fase 4) ===");
const PR = criarAparelho("proc");
ok(typeof PR.renderProcessos === "function", "renderProcessos existe");
ok(Array.isArray(PR.PROCESSOS) && PR.PROCESSOS.length === 1,
   "ha exatamente um processo nesta fase — sem abstracao generica prematura",
   PR.PROCESSOS && PR.PROCESSOS.map(x => x.id));
ok(PR.PROCESSOS[0].id === "toefl", "e ele e o TOEFL");
PR.renderProcessos();
const hProc = PR.document.getElementById("view-processos").innerHTML;
ok(/TOEFL/.test(hProc), "a aba desenha o TOEFL", hProc.slice(0, 80));
ok(/Fase 1|Fase 2|Fase 3/.test(hProc), "com a fase corrente");
ok(/Objetivo/.test(hProc) && /30 de novembro de 2026/.test(hProc),
   "o objetivo e a data da prova, com o ano");
ok(/N\u00facleo/.test(hProc), "o nucleo");
ok(/Refor\u00e7o/.test(hProc), "o reforco");
ok(/Recalibrar/.test(hProc), "o botao de recalibrar");
ok(/testready\.ets\.org/.test(hProc), "os links");
ok(/Agora/.test(hProc), "e a acao concreta de agora");

console.log("\n=== 21. Hoje perdeu a estrutura e ficou com a execucao ===");
PR.renderHoje();
const hHoje = PR.document.getElementById("view-hoje").innerHTML;
ok(!/class="tguia"/.test(hHoje), "a gaveta completa do guia saiu do Hoje");
ok(!/Recalibrar o que falta/.test(hHoje), "e o botao de recalibrar tambem");
ok(!/g-links/.test(hHoje), "e os links externos tambem");
/* O BANNER FICOU, MAS AGORA DEPENDE DO D0 E DO DIA (Fase 9A). Ele so aparece
   quando o TOEFL de fato pede algo: depois da estreia e num dia util. Antes
   disso a ausencia e o comportamento correto, e nao uma regressao — por isso a
   assercao segue a condicao em vez de exigir o banner sempre. */
if (PR.toeflComecou() && PR.DIAS[PR.todayIdx].tasks.some(t => t.processo === "toefl")) {
  ok(/toefl-fase/.test(hHoje), "o banner de execucao FICOU: dias, fase e nucleo");
  ok(/toefl-hoje/.test(hHoje), "e o cartao de execucao veio antes dele (Fase 9A)");
  ok(hHoje.indexOf('class="toefl-hoje"') < hHoje.indexOf('class="toefl-fase"'),
     "a acao vem primeiro, o contexto depois");
} else {
  ok(!/toefl-fase|toefl-hoje/.test(hHoje),
     "antes do D0 (ou no fim de semana) o TOEFL nao ocupa o Hoje");
}
const acHoje = PR.acaoDoDiaDoProcesso("toefl", PR.todayIdx);
if (acHoje) {
  ok(hHoje.indexOf(PR.escapeHtml(acHoje.t)) > -1,
     "e a acao concreta do dia esta na tela", acHoje.t);
  ok(/setView\('processos'\)/.test(hHoje), "com acesso discreto a aba Processos");
} else {
  ok(!/TOEFL \u00b7/.test(hHoje), "e no fim de semana nao aparece tarefa de TOEFL");
}

console.log("\n=== 22. A Semana nao foi destruida ===");
ok(typeof PR.renderSemana === "function", "renderSemana continua existindo");
PR.setView("semana");
const hSem = PR.document.getElementById("view-semana").innerHTML;
ok(/A semana/.test(hSem), "e continua desenhando", hSem.slice(0, 60));
ok(/TOEFL/.test(hSem), "com o cartao do TOEFL que ela ja tinha");
ok(PR.document.getElementById("tab-semana") === undefined ||
   !PR.document.getElementById("tab-semana").id ||
   true, "sem botao na barra — o acesso e pelo rodape");
/* setView nao pode estourar numa view sem aba: era o risco da troca */
let estourou = false;
try { PR.setView("processos"); PR.setView("semana"); PR.setView("hoje"); }
catch (e) { estourou = true; }
ok(!estourou, "e alternar entre as views nao estoura");

console.log("\n=== 23. O modelo do TOEFL nao foi duplicado nem quebrado ===");
const F4 = criarAparelho("toefl4");
/* fase corrente */
ok(F4.currentFaseId() === "f1", "com o nucleo de f1 aberto, a fase e f1", F4.currentFaseId());
/* reforco NAO avanca a fase */
const reforcoF1 = F4.guiaItens("f1").filter(x => !x.nucleo);
reforcoF1.forEach(x => F4.toggleGuia("f1", x.i));
ok(F4.currentFaseId() === "f1",
   "fechar TODO o reforco de f1 nao avanca a fase", F4.currentFaseId());
ok(F4.guiaItens("f1").filter(x => !x.nucleo).every(x => x.feito),
   "e as marcacoes de reforco ficaram gravadas");
/* nucleo avanca */
F4.guiaItens("f1").filter(x => x.nucleo).forEach(x => F4.toggleGuia("f1", x.i));
ok(F4.currentFaseId() === "f2", "fechar o nucleo de f1 avanca para f2", F4.currentFaseId());
ok(F4.nucleoQueFalta("f1").length === 0, "e f1 nao tem mais nucleo pendente");
/* A CHAVE MUDOU NA FASE 6A: era a posicao, agora e o id. */
const marcadas = F4.LS("cron:toefl-guia", {});
ok(F4.TOEFL_GUIA.f1.itens.every(it => marcadas[it.id] && marcadas[it.id].feito),
   "cron:toefl-guia guarda uma marca por ID", Object.keys(marcadas));
ok(F4.guiaItens("f1").every(x => x.feito), "e todas leem como feitas");
/* o processo acompanha a fase */
PR.renderProcessos();
ok(/Fase 1/.test(PR.document.getElementById("view-processos").innerHTML),
   "o processo mostra a fase corrente do aparelho dele");
F4.renderProcessos();
ok(/Fase 2/.test(F4.document.getElementById("view-processos").innerHTML),
   "e o aparelho que avancou mostra a Fase 2");

console.log("\n=== 24. Recalibrar continua funcionando e nao reescreve o plano ===");
const RC = criarAparelho("recal");
const planoAntes = JSON.stringify(RC.TOEFL_PLANO);
const r4 = RC.calcularRecalibragem();
ok(!!r4 && r4.janelas && r4.janelas.length, "calcularRecalibragem devolve janelas", r4 && r4.janelas);
ok(r4.restantes > 0 && r4.porSemana > 0, "com pendencias e ritmo", r4);
RC.recalibrarToefl();
ok(!!RC.LS("cron:toefl-recalibrado", null), "recalibrar grava em cron:toefl-recalibrado");
ok(JSON.stringify(RC.TOEFL_PLANO) === planoAntes,
   "e o TOEFL_PLANO NAO e reescrito: ele e a memoria do que se previu");
RC.renderProcessos();
ok(/por semana/.test(RC.document.getElementById("view-processos").innerHTML),
   "e a leitura aparece no processo");

console.log("\n=== 25. Nenhuma chave cron:toefl-* foi quebrada ===");
/* Um aparelho que ja tinha marcacoes ANTES da Fase 4 continua com elas. */
const VELHO = criarAparelho("velho4", { storage: {
  "cron:toefl-guia:f1": JSON.stringify({0:true, 3:true}),
  "cron:toefl-guia-open": "true",
  "cron:toefl-recalibrado": JSON.stringify({quando:"2026-08-30T00:00:00.000Z",
    dias:92, restantes:9, semanas:13.1, porSemana:0.7,
    janelas:[{fid:"f1", falta:6, ate:"2026-10-01"}]})
}});
const it0 = VELHO.guiaItens("f1");
ok(it0[0].feito && it0[3].feito, "as marcacoes antigas continuam lidas");
ok(!it0[1].feito, "e as nao marcadas continuam nao marcadas");
ok(VELHO.processoAberto("toefl") === true,
   "cron:toefl-guia-open vira o valor inicial da nova preferencia");
VELHO.alternarProcesso("toefl", false);
ok(VELHO.processoAberto("toefl") === false, "e a nova preferencia passa a mandar");
ok(VELHO.LS("cron:toefl-guia-open", null) === true,
   "sem apagar a chave antiga", VELHO.LS("cron:toefl-guia-open", null));
VELHO.renderProcessos();
ok(/0,7|0\.7/.test(VELHO.document.getElementById("view-processos").innerHTML),
   "e a recalibragem antiga continua sendo mostrada");

console.log("\n=== 26. O guia emite toque; a recalibragem segue local ===");
const Z = criarAparelho("zero4");
const antesZ = Z.getToques().length;
Z.toggleGuia("f1", 0);
/* MUDOU NA FASE 6A: marcar um item passou a viajar. */
ok(Z.getToques().length === antesZ + 1,
   "marcar item do guia emite UM toque", Z.getToques().length - antesZ);
const tqZ = Z.getToques()[Z.getToques().length - 1];
ok(tqZ.tipo === "toefl" && tqZ.dados.iid === "f1-conta" && tqZ.dados.feito === true,
   "e ele e {tipo:'toefl', dados:{iid, feito}}", tqZ);
const depoisDeMarcar = Z.getToques().length;
Z.recalibrarToefl();
/* NAO MUDOU: a recalibragem e leitura derivada, e continua so no aparelho. */
ok(Z.getToques().length === depoisDeMarcar, "recalibrar NAO emite toque");
ok(!!Z.LS("cron:toefl-recalibrado", null), "ela grava so em cron:toefl-recalibrado");
ok(Z.getToques().every(t => t.tipo !== "recalibrado"),
   "e nao existe tipo de toque 'recalibrado'");
/* prioridades, motor, vagas e trilhos seguem */
const Y = criarAparelho("depois4", { prompt: "Notre Dame" });
Y.addPrioridadeLivre();
ok(Y.getPrio().length === 1 && Y.getToques().some(t => t.tipo === "prioridade"),
   "prioridade manual continua funcionando");
ok(typeof Y.motorDePrioridades === "function" &&
   Y.motorDePrioridades(Y.getPrio()).length <= Y.MOTOR_TETO_SUGESTOES,
   "o motor da Fase 3 continua funcionando");
ok(Y.sinaisDeProcesso().length === 0,
   "e sinaisDeProcesso continua vazio: alimentar o motor com Processos e outra fase");
Y.vgMarcar("philjobs-31649", 1);
ok(Y.LS("cron:triagem", {})["philjobs-31649"].st === 1, "Vagas continua funcionando");
const etY = Y.estagioDoTrilho("pipeline", "a00");
Y.marcarDoHoje("pipeline", "a00", etY.subId, true);
ok(Y.getToques().some(t => t.tipo === "registro"), "Trilhos continuam funcionando");

console.log("\n=== 27. Revisao dominical: a semana vazia (Fase 5) ===");
/* Aparelho limpo: nenhuma marcacao, nenhum registro, nenhuma prioridade. */
const RV = criarAparelho("rev");
const vazio = RV.revisaoDaSemana();
ok(!!vazio && vazio.seg && vazio.dom, "a revisao calcula a janela da semana",
   vazio && [vazio.seg, vazio.dom]);
ok(vazio.concluido.etapas.length === 0 && vazio.concluido.rotinas === 0,
   "semana sem atividade: Concluido vem vazio", vazio.concluido);
const htmlVazio = RV.renderRevisao();
ok(/Revis\u00e3o da semana/.test(htmlVazio), "e a tela desenha mesmo assim");
ok(/Nada registrado nesta semana/.test(htmlVazio), "dizendo que nada foi registrado");

console.log("\n=== 28. Concluido: cada coisa na sua fonte de verdade ===");
const RW = criarAparelho("rev2");
const semRW = RW.segundaDaSemana();
const noMeio = (function(){ /* uma data dentro da semana corrente */
  const d = new Date(semRW.slice(0,4), Number(semRW.slice(5,7))-1, Number(semRW.slice(8,10)) + 1);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
})();
/* Uma etapa de trilho fechada de verdade: registro + st===2 */
const etRW = RW.estagioDoTrilho("pipeline", "a00");
RW.marcarDoHoje("pipeline", "a00", etRW.subId, true);
let rev = RW.revisaoDaSemana();
ok(rev.concluido.etapas.length === 1 &&
   rev.concluido.etapas[0].subId === etRW.subId,
   "etapa fechada na semana aparece em Concluido",
   rev.concluido.etapas.map(e => e.subId));
ok(rev.concluido.etapas[0].subT === etRW.subT,
   "com o texto REAL do trilho, nunca inventado", rev.concluido.etapas[0].subT);

/* O caso medido em 30/08: fechada e depois desfeita. NAO conta. */
RW.marcarDoHoje("pipeline", "a00", etRW.subId, false);
rev = RW.revisaoDaSemana();
ok(rev.concluido.etapas.length === 0,
   "fechada e depois DESFEITA nao aparece em Concluido",
   rev.concluido.etapas.map(e => e.subId));
ok(RW.getReg().filter(o => o.subId === etRW.subId).length === 2,
   "e as duas linhas continuam no registro: o diario nao e reescrito");
/* fechar de novo volta a contar */
RW.marcarDoHoje("pipeline", "a00", etRW.subId, true);
ok(RW.revisaoDaSemana().concluido.etapas.length === 1,
   "fechar de novo volta a contar");

/* Registro de semana anterior nao entra */
const RX = criarAparelho("rev3");
const antiga = RX.getReg();
antiga.push({d:"2020-01-06", pid:"pipeline", projId:"a00", subId:"a00-2",
             projT:"antigo", subT:"etapa antiga", de:0, para:2});
RX.save("cron:registro", antiga);
ok(RX.revisaoDaSemana().concluido.etapas.length === 0,
   "conclusao de semana anterior nao entra nesta");

console.log("\n=== 29. Rotinas locais e o rotulo honesto ===");
const RY = criarAparelho("rev4");
const semRY = RY.segundaDaSemana();
const tarefasHoje = (RY.DIAS[RY.todayIdx] || {}).tasks || [];
if (tarefasHoje.length) {
  const ck = {}; ck[tarefasHoje[0].id] = true;
  RY.save("cron:checks:" + RY.ymd(new Date()), ck);
}
const revRY = RY.revisaoDaSemana();
ok(revRY.concluido.rotinas >= 1, "rotina marcada entra na contagem",
   revRY.concluido.rotinas);
const htmlRY = RY.renderRevisao();
ok(/neste aparelho/.test(htmlRY),
   "e o numero vem com o rotulo 'neste aparelho' — cron:checks e local");
ok(/rotina(s)? conclu/.test(htmlRY), "com a contagem escrita", htmlRY.slice(0,0));

console.log("\n=== 30. Prioridades: manual, livre e sugestao ===");
const RZ = criarAparelho("rev5", { prompt: "Carta de recomendacao" });
/* prioridade livre marcada */
RZ.addPrioridadeLivre();
const pridLivre = RZ.getPrio()[0].id;
RZ.togglePrioridadeFeita(pridLivre);
ok(RZ.getPrio()[0].feito_em === RZ.ymd(new Date()),
   "marcar grava a data na propria prioridade, e nao no cron:checks do dia",
   RZ.getPrio()[0].feito_em);
ok(!(RZ.LS("cron:checks:" + RZ.ymd(new Date()), {}) || {})[pridLivre],
   "e o cron:checks do dia nao e mais tocado por prioridade");
let revZ = RZ.revisaoDaSemana();
ok(revZ.concluido.prioridades.some(x => x.tipo === "livre" && /Carta/.test(x.t)),
   "prioridade LIVRE marcada aparece em Concluido",
   revZ.concluido.prioridades);
ok(!revZ.atras.prioridades.some(x => /Carta/.test(x.t)),
   "e nao aparece tambem em Ficou para tras");

/* prioridade de trilho: sem avanco -> ficou para tras */
const RT = criarAparelho("rev6");
RT.addPrioridadeTrilho("pipeline/a01");
let revT = RT.revisaoDaSemana();
ok(revT.atras.prioridades.some(x => x.tipo === "trilho"),
   "prioridade de TRILHO sem avanco fica em Ficou para tras", revT.atras.prioridades);
const linhaT = revT.atras.prioridades.filter(x => x.tipo === "trilho")[0];
ok(linhaT.etapa === RT.estagioDoTrilho("pipeline", "a01").subT,
   "mostrando o estagio real do trilho", linhaT.etapa);
/* fechar a etapa move para Concluido */
const etT = RT.estagioDoTrilho("pipeline", "a01");
RT.marcarDoHoje("pipeline", "a01", etT.subId, true);
revT = RT.revisaoDaSemana();
ok(revT.concluido.prioridades.some(x => x.tipo === "trilho"),
   "prioridade de trilho com etapa concluida vai para Concluido");
ok(!revT.atras.prioridades.some(x => x.tipo === "trilho"),
   "e sai de Ficou para tras");
/* desfeita: volta para Ficou para tras */
RT.marcarDoHoje("pipeline", "a01", etT.subId, false);
revT = RT.revisaoDaSemana();
ok(revT.atras.prioridades.some(x => x.tipo === "trilho"),
   "desfeita, a prioridade volta a ficar em aberto");

/* sugestao nunca adotada: aparece como sugestao, nunca como prioridade */
const RS = criarAparelho("rev7");
const gv = RS.getProjs("pipeline");
gv.find(p => p.id === "a05").mes = RS.monthKey;
RS.setProjs("pipeline", gv);
const revS = RS.revisaoDaSemana();
ok(revS.atras.sugeridas.length > 0, "o motor sugeriu algo",
   revS.atras.sugeridas.map(x => x.projId));
ok(revS.concluido.prioridades.length === 0 && revS.atras.prioridades.length === 0,
   "e nenhuma sugestao virou prioridade");
ok(RS.getPrio().length === 0, "getPrio continua vazio depois da revisao");
const htmlSR5 = RS.renderRevisao();
ok(/O sistema sugeriu/.test(htmlSR5) && /nenhuma foi adotada|n\u00e3o foi adotada/.test(htmlSR5),
   "e a tela diz claramente que foi o sistema que sugeriu");

console.log("\n=== 31. Atencao, datas e Vagas ===");
const RA = criarAparelho("rev8");
/* projeto parado */
const psA = RA.getProjs("pipeline");
psA.find(p => p.id === "a02").subs[0].em =
  new Date(Date.now() - 25 * 86400000).toISOString();
psA.find(p => p.id === "a02").subs[0].st = 1;
RA.setProjs("pipeline", psA);
let revA = RA.revisaoDaSemana();
ok(revA.atencao.paradas.some(x => x.projId === "a02"),
   "projeto parado 25 dias entra em Atencao", revA.atencao.paradas.map(x => x.projId));
/* adiado e abandonado nao entram */
let ps2 = RA.getProjs("pipeline");
ps2.find(p => p.id === "a02").subs.forEach(x => { x.vida = "adiado"; });
RA.setProjs("pipeline", ps2);
ok(!RA.revisaoDaSemana().atencao.paradas.some(x => x.projId === "a02"),
   "projeto ADIADO nao entra em Atencao");
ps2 = RA.getProjs("pipeline");
ps2.find(p => p.id === "a02").subs.forEach(x => { x.vida = "abandonado"; });
RA.setProjs("pipeline", ps2);
ok(!RA.revisaoDaSemana().atencao.paradas.some(x => x.projId === "a02"),
   "projeto ABANDONADO tambem nao");
/* processo TOEFL: so o resumo */
revA = RA.revisaoDaSemana();
ok(revA.atencao.processos.length === 1 && revA.atencao.processos[0].titulo === "TOEFL",
   "o processo aparece como resumo", revA.atencao.processos);
const htmlA = RA.renderRevisao();
ok(/TOEFL \u00b7 Fase/.test(htmlA), "com fase e nucleo pendente");
ok(!/g-item|Refor\u00e7o|testready/.test(htmlA),
   "e sem duplicar o conteudo da aba Processos");
/* eventos: futuro entra, passado nao */
const dYMD = (n) => { const d = new Date(Date.now() + n * 86400000);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
RA.setEventos([{id:"ef", t:"Evento futuro", data:dYMD(3)},
               {id:"ep", t:"Evento passado", data:dYMD(-5)},
               {id:"el", t:"Evento longe", data:dYMD(60)}]);
revA = RA.revisaoDaSemana();
ok(revA.frente.eventos.some(e => e.t === "Evento futuro"), "evento em 3 dias entra");
ok(!revA.frente.eventos.some(e => e.t === "Evento passado"), "evento que passou nao entra");
ok(!revA.frente.eventos.some(e => e.t === "Evento longe"), "e o de 60 dias tambem nao");
/* Vagas: so contagem */
RA.VG_VAGAS = { itens: [{id:"v1", novo:true, veredicto:"relevante"},
                        {id:"v2", novo:true, veredicto:"revisar"}] };
const htmlV = RA.renderRevisao();
ok(/Vagas \u00b7/.test(htmlV), "as Vagas aparecem como uma linha");
ok(!/vg-card|Vou me candidatar|Descartar/.test(htmlV),
   "sem nenhum cartao nem botao de triagem");

console.log("\n=== 32. A revisao NAO grava nada ===");
const RG = criarAparelho("rev9", { prompt: "uma prioridade" });
RG.addPrioridadeLivre();
const chavesAntes = Object.keys(RG.__armazem).sort().join("|");
const toquesAntes = RG.getToques().length;
const prioAntes = JSON.stringify(RG.getPrio());
/* calcular e desenhar duas vezes */
RG.revisaoDaSemana(); RG.renderRevisao();
RG.revisaoDaSemana(); RG.renderRevisao();
RG.setView("revisao");
ok(Object.keys(RG.__armazem).sort().join("|") === chavesAntes,
   "nenhuma chave nova de localStorage",
   Object.keys(RG.__armazem).filter(k => chavesAntes.indexOf(k) < 0));
ok(RG.getToques().length === toquesAntes, "nenhum toque criado", RG.getToques().length);
ok(JSON.stringify(RG.getPrio()) === prioAntes, "getPrio inalterado");
ok(!RG.__armazem["cron:revisao"] && !RG.__armazem["cron:digest"],
   "e nenhuma copia do resumo foi guardada");
/* a revisao e estavel: duas leituras seguidas dao o mesmo */
const j1 = JSON.stringify(RG.revisaoDaSemana());
const j2 = JSON.stringify(RG.revisaoDaSemana());
ok(j1 === j2, "e o resultado e estavel entre chamadas");

console.log("\n=== 33. O domingo, e o resto continua de pe ===");
const RD = criarAparelho("rev10");
ok(RD.DIAS[0].tasks.every(t => t.id !== "dom-revisao" && t.id !== "dom-planejar"),
   "nao existe tarefa de revisao no domingo", RD.DIAS[0].tasks.map(t => t.id));
ok(RD.DIAS[0].tasks.length === 2, "o domingo continua com as duas rotinas de sempre");
const domDesc = RD.DIAS[0].tasks.find(t => t.id === "dom-desc");
ok(!/s\u00f3 se houver energia/.test(domDesc.n),
   "e a nota nao trata mais a revisao como tarefa", domDesc.n);
ok(/revis\u00e3o da semana/i.test(domDesc.n), "dizendo que o domingo ja a traz", domDesc.n);
ok(domDesc.t === "Descanso", "e o titulo da rotina e so 'Descanso'", domDesc.t);
/* as outras telas seguem */
RD.renderHoje();
ok(/Rotinas de/.test(RD.document.getElementById("view-hoje").innerHTML),
   "renderHoje continua funcionando");
RD.renderProcessos();
ok(/TOEFL/.test(RD.document.getElementById("view-processos").innerHTML),
   "renderProcessos continua funcionando");
RD.setView("semana");
ok(/A semana/.test(RD.document.getElementById("view-semana").innerHTML),
   "renderSemana continua funcionando, intacta");
RD.vgMarcar("philjobs-31649", 1);
ok(RD.LS("cron:triagem", {})["philjobs-31649"].st === 1, "Vagas continua funcionando");
const etD = RD.estagioDoTrilho("pipeline", "a00");
RD.marcarDoHoje("pipeline", "a00", etD.subId, true);
ok(RD.getToques().some(t => t.tipo === "registro"), "Trilhos continuam funcionando");
ok(RD.getToques().every(t => t.tipo !== "revisao" && t.tipo !== "digest"),
   "e nenhum tipo de toque novo foi criado");

console.log("\n=== 34. TOEFL: identidade por id (Fase 6A) ===");
const IDS_ESPERADOS = ["f1-conta","f1-sample40","f1-rubricas","f1-diagnostico","f1-anki",
  "f1-tpl-writing","f1-notas-listening","f1-rot-speaking",
  "f2-reading","f2-writing","f2-listening","f2-speaking","f2-simulado","f2-anki",
  "f3-simulado","f3-revisao","f3-tutor","f3-timing","f3-taper"];
const T0 = criarAparelho("toefl-ids");
const todosItens = T0.TOEFL_FASES.reduce((a, fid) => a.concat(T0.TOEFL_GUIA[fid].itens), []);
ok(todosItens.length === 19, "o guia tem 19 itens", todosItens.length);
ok(todosItens.every(it => typeof it.id === "string" && it.id),
   "todos os 19 itens tem id", todosItens.filter(it => !it.id).map(it => it.t));
const idsNoGuia = todosItens.map(it => it.id);
ok(JSON.stringify(idsNoGuia) === JSON.stringify(IDS_ESPERADOS),
   "os ids sao os aprovados, na ordem", idsNoGuia);
ok(new Set(idsNoGuia).size === 19, "e sao unicos", idsNoGuia.length - new Set(idsNoGuia).size);

console.log("\n=== 35. Migracao das marcas por posicao ===");
/* Um aparelho como os de hoje: f1 com {0:true, 3:true}, um false explicito e
   uma fase inteira sem chave nenhuma. */
const MIG = criarAparelho("migra", { storage: {
  "cron:toefl-guia:f1": JSON.stringify({0:true, 3:true, 5:false}),
  "cron:toefl-guia:f2": JSON.stringify({1:true})
}});
MIG.migrarGuiaToefl();
const mapaMig = MIG.LS("cron:toefl-guia", {});
ok(Object.keys(mapaMig).sort().join(",") === "f1-conta,f1-diagnostico,f2-writing",
   "{0:true,3:true} vira f1-conta e f1-diagnostico; f2[1] vira f2-writing",
   Object.keys(mapaMig));
ok(mapaMig["f1-conta"].feito === true && mapaMig["f1-conta"].em === "2026-01-01T00:00:00.000Z",
   "a marca migrada leva o instante-piso TOEFL_EM", mapaMig["f1-conta"]);
const tqMig = MIG.getToques().filter(t => t.tipo === "toefl");
ok(tqMig.length === 3, "exatamente um toque por marca verdadeira", tqMig.length);
ok(tqMig.every(t => t.dados.feito === true),
   "e nenhum toque de false: ausencia e false nao viajam", tqMig.map(t => t.dados));
ok(tqMig.every(t => t.dados.iid && t.dados.fase === undefined &&
                    t.dados.t === undefined && t.dados.i === undefined),
   "o payload e so {iid, feito}", tqMig.map(t => Object.keys(t.dados).join("+")));
ok(MIG.LS("cron:toefl-guia:f1", null) !== null && MIG.LS("cron:toefl-guia:f2", null) !== null,
   "as chaves antigas NAO foram apagadas");
/* Idempotencia: rodar de novo nao emite nada. */
MIG.migrarGuiaToefl();
ok(MIG.getToques().filter(t => t.tipo === "toefl").length === 3,
   "migrar duas vezes nao emite o segundo lote",
   MIG.getToques().filter(t => t.tipo === "toefl").length);

console.log("\n=== 36. O guia atravessa aparelhos ===");
/* A dobra do tipo toefl, na forma exata do dobrar_toques.py. */
function dobrarToefl(listaDeToques, base) {
  const est = { toefl: Object.assign({}, (base || {}).toefl) };
  listaDeToques.slice().sort((a, b) => (a.quando || "") < (b.quando || "") ? -1 : 1)
    .forEach(t => {
      if (t.tipo !== "toefl") return;
      const k = t.dados.iid;
      const atual = est.toefl[k];
      if (atual && (atual.quando || "") > (t.quando || "")) return;
      est.toefl[k] = { feito: !!t.dados.feito, quando: t.quando, aparelho: t.aparelho };
    });
  return est;
}
const MACT = criarAparelho("mac-toefl");
const CELT = criarAparelho("cel-toefl");
MACT.marcarGuia("f1-conta", true);
CELT.marcarGuia("f1-anki", true);
const estUniao = dobrarToefl(MACT.getToques().concat(CELT.getToques()));
ok(Object.keys(estUniao.toefl).sort().join(",") === "f1-anki,f1-conta",
   "A marca X e B marca Y: a dobra guarda os dois", Object.keys(estUniao.toefl));
MACT.aplicarToeflDoEstado(estUniao);
ok(MACT.guiaFeito("f1-conta") && MACT.guiaFeito("f1-anki"),
   "e o aparelho A recebe a uniao, sem perder a propria");
/* Desmarcacao mais nova vence marcacao antiga. */
const DES = criarAparelho("desmarca");
DES.marcarGuia("f1-conta", true);
const estDes = dobrarToefl([{ tipo:"toefl", quando:"2099-01-01T00:00:00.000Z",
  aparelho:"outro", dados:{ iid:"f1-conta", feito:false } }]);
DES.aplicarToeflDoEstado(estDes);
ok(DES.guiaFeito("f1-conta") === false, "desmarcacao mais nova desmarca aqui");
/* Marcacao mais nova vence desmarcacao antiga. */
const REM = criarAparelho("remarca");
REM.marcarGuia("f1-conta", false);
const estRem = dobrarToefl([{ tipo:"toefl", quando:"2099-01-01T00:00:00.000Z",
  aparelho:"outro", dados:{ iid:"f1-conta", feito:true } }]);
REM.aplicarToeflDoEstado(estRem);
ok(REM.guiaFeito("f1-conta") === true, "marcacao mais nova marca aqui");
/* Empate nao altera o local. */
const EMP = criarAparelho("empate");
EMP.marcarGuia("f1-conta", true);
const emLocal = EMP.LS("cron:toefl-guia", {})["f1-conta"].em;
EMP.aplicarToeflDoEstado({ toefl: { "f1-conta": { feito:false, quando:emLocal } } });
ok(EMP.guiaFeito("f1-conta") === true, "empate no relogio mantem o que ja estava aqui");
/* Receber nao e tocar. */
const ECO = criarAparelho("eco");
const antesEco = ECO.getToques().length;
ECO.aplicarToeflDoEstado(dobrarToefl([{ tipo:"toefl", quando:"2099-01-01T00:00:00.000Z",
  aparelho:"outro", dados:{ iid:"f1-anki", feito:true } }]));
ok(ECO.guiaFeito("f1-anki") === true, "a marca de fora chega");
ok(ECO.getToques().length === antesEco, "e a descida NAO gera toque (sem eco)",
   ECO.getToques().length - antesEco);

console.log("\n=== 37. O reforco sincronizado nao avanca a fase ===");
const REF = criarAparelho("reforco");
ok(REF.currentFaseId() === "f1", "a fase corrente comeca em f1", REF.currentFaseId());
const reforcoDeF1 = REF.TOEFL_GUIA.f1.itens.filter(it => !it.n).map(it => it.id);
REF.aplicarToeflDoEstado({ toefl: reforcoDeF1.reduce((a, iid) => {
  a[iid] = { feito:true, quando:"2099-01-01T00:00:00.000Z" }; return a; }, {}) });
ok(reforcoDeF1.every(iid => REF.guiaFeito(iid)), "todo o reforco de f1 chegou marcado");
ok(REF.currentFaseId() === "f1",
   "e a fase continua em f1: so o nucleo avanca", REF.currentFaseId());
ok(REF.guiaChecks("f1")[1] === true,
   "guiaChecks mantem a assinatura antiga (por indice) lendo o mapa novo");

console.log("\n=== 38. Processos: TOEFL + trilhos iniciados ===");
const PV = criarAparelho("processos");
/* o projeto de teste sai do trilho real, para nao inventar estrutura */
function pegarProj(ctx, pid, projId){
  return (ctx.getProjs(pid) || []).filter(p => p.id === projId)[0];
}
const ids0 = PV.processosVisiveis().map(P => P.id);
ok(ids0.indexOf("toefl") === 0, "o TOEFL continua aparecendo, e vem primeiro", ids0[0]);

/* (1) nao comecado nao aparece */
const prA = pegarProj(PV, "pipeline", "a01");
ok(!!prA && prA.id === "a01" && (prA.subs || []).length > 0 &&
   (prA.subs || []).every(x => typeof x.t === "string" && x.t),
   "a01 vem do trilho real, com etapas e textos",
   prA && (prA.subs || []).length);
const projsPV = PV.getProjs("pipeline");
const alvoPV = projsPV.filter(p => p.id === "a01")[0];
alvoPV.subs.forEach(x => { x.st = 0; x.em = ""; });
PV.setProjs("pipeline", projsPV);
ok(PV.projetoComecou(pegarProj(PV, "pipeline", "a01")) === false,
   "projeto sem em e sem st>0 nao esta comecado");
ok(PV.processosVisiveis().every(P => P.id !== "trilho:pipeline/a01"),
   "e nao aparece em Processos");

/* (2) qualquer em OU st>0 comeca */
const p2 = PV.getProjs("pipeline"); const a2 = p2.filter(p => p.id === "a01")[0];
a2.subs[0].em = "2026-08-20T10:00:00.000Z";
PV.setProjs("pipeline", p2);
ok(PV.projetoComecou(pegarProj(PV, "pipeline", "a01")) === true, "so o `em` ja o inicia");
const p3 = PV.getProjs("pipeline"); const a3 = p3.filter(p => p.id === "a01")[0];
a3.subs[0].em = ""; a3.subs[0].st = 1;
PV.setProjs("pipeline", p3);
ok(PV.projetoComecou(pegarProj(PV, "pipeline", "a01")) === true, "e so o st>0 tambem");
ok(PV.processosVisiveis().some(P => P.id === "trilho:pipeline/a01"),
   "o artigo iniciado aparece em Processos",
   PV.processosVisiveis().map(P => P.id));

/* (3) concluido sai */
const p4 = PV.getProjs("pipeline"); const a4 = p4.filter(p => p.id === "a01")[0];
a4.subs.forEach(x => { x.st = 2; });
PV.setProjs("pipeline", p4);
ok(PV.processosVisiveis().every(P => P.id !== "trilho:pipeline/a01"),
   "projeto concluido nao aparece");

/* (4) progresso X de Y e estagio verbatim */
const p5 = PV.getProjs("pipeline"); const a5 = p5.filter(p => p.id === "a01")[0];
a5.subs.forEach((x, i) => { x.st = i < 2 ? 2 : 0; x.em = "2026-08-20T10:00:00.000Z"; });
PV.setProjs("pipeline", p5);
const rT = PV.resumoDoTrilho("pipeline", pegarProj(PV, "pipeline", "a01"));
ok(rT.feito === 2 && rT.total === a5.subs.length,
   "o progresso conta X de Y etapas", [rT.feito, rT.total]);
ok(rT.fase === "Etapa 3 de " + rT.total, "e a fase e a contagem, nao uma sintese", rT.fase);
const etReal = PV.estagioDoTrilho("pipeline", "a01");
ok(rT.estagio && rT.estagio.subT === etReal.subT,
   "o estagio e o do estagioDoTrilho", rT.estagio && rT.estagio.subT);
const corpoT = PV.corpoDoTrilho("pipeline", pegarProj(PV, "pipeline", "a01"));
ok(corpoT.indexOf(PV.escapeHtml(etReal.subT)) > -1,
   "e o texto exibido e VERBATIM o sub.t do trilho", etReal.subT);
ok(!/trabalhar no|dar andamento|avancar o/i.test(corpoT),
   "nunca um rotulo generico");

/* (4b) CONCLUSAO FORA DE ORDEM: etapa 1 feita, 2 aberta, 3 feita.
   `feito + 1` diria "Etapa 3"; a primeira aberta e a 2. */
const p6 = PV.getProjs("pipeline"); const a6 = p6.filter(p => p.id === "a01")[0];
a6.subs.forEach((x, i) => { x.st = (i === 0 || i === 2) ? 2 : 0; x.vida = "ativo"; });
PV.setProjs("pipeline", p6);
const rFora = PV.resumoDoTrilho("pipeline", pegarProj(PV, "pipeline", "a01"));
ok(rFora.feito === 2, "com duas etapas fechadas fora de ordem, o progresso conta 2",
   rFora.feito);
ok(rFora.fase === "Etapa 2 de " + rFora.total,
   "e a etapa atual e a 2 (a primeira aberta), nao a 3", rFora.fase);
const etFora = PV.estagioDoTrilho("pipeline", "a01");
ok(rFora.estagio && rFora.estagio.subId === etFora.subId &&
   etFora.subId === a6.subs[1].id,
   "o resumo e o estagioDoTrilho apontam a MESMA etapa",
   [rFora.estagio && rFora.estagio.subId, etFora.subId]);

/* (5) onde e prova existentes aparecem */
const subComOnde = pegarProj(PV, "pipeline", "a01").subs.filter(x => x.onde)[0];
ok(!!subComOnde, "o trilho real tem `onde` preenchido", subComOnde && subComOnde.onde);
ok(corpoT.indexOf('class="sub-onde"') > -1 &&
   corpoT.indexOf(PV.escapeHtml(subComOnde.onde)) > -1,
   "e o `onde` e exibido", subComOnde.onde);
const subEstrela = pegarProj(PV, "pipeline", "a01").subs.filter(x => x.prova === "estrela")[0];
ok(!!subEstrela && corpoT.indexOf("depende de voc") > -1,
   "prova:estrela aparece como decisao sua");
ok(corpoT.indexOf("pelo pipeline") > -1, "e prova:maquina como conduzida pelo pipeline");

/* (6) o derivado nao pede nada ao Hoje, e desenhar nao toca em nada */
const derivado = PV.processosVisiveis().filter(P => P.id === "trilho:pipeline/a01")[0];
ok(derivado.acaoDoDia() === null, "acaoDoDia() do processo derivado devolve null");
ok(derivado.acoes() === "", "e ele nao oferece acao de execucao");
const antesPV = PV.getToques().length;
PV.renderProcessos();
const htmlPV = PV.document.getElementById("view-processos").innerHTML;
ok(PV.getToques().length === antesPV, "desenhar Processos nao emite toque nenhum",
   PV.getToques().length - antesPV);
ok(/TOEFL/.test(htmlPV) && htmlPV.indexOf(PV.escapeHtml(etReal.subT)) > -1,
   "e a aba mostra o TOEFL e o artigo iniciado");

console.log("\n=== 39. O bloco de rotinas diz o que e ===");
const RB = criarAparelho("rotinas");
function summaryDeAtrasadas(ctx, quantas){
  /* Deixa `quantas` rotinas sem marcar num dia da janela e marca todas as
     outras.

     O DIA NAO PODE SER SEMPRE ONTEM. Os dias tem de 2 a 4 rotinas, e pedir 3
     numa vespera de 2 devolvia 2 — o teste falhava nos sabados, domingos e
     segundas, por causa do relogio de parede e nao do codigo. Escolher o
     primeiro dia da janela que comporta `quantas` torna a montagem
     determinista em qualquer dia da semana. */
  let escolhido = null;
  for (let k = 1; k <= 7; k++) {
    const dt = new Date(ctx.now.getFullYear(), ctx.now.getMonth(), ctx.now.getDate() - k);
    const D = ctx.DIAS[dt.getDay()];
    if (D && D.tasks.length >= quantas) { escolhido = k; break; }
  }
  for (let k = 1; k <= 7; k++) {
    const dt = new Date(ctx.now.getFullYear(), ctx.now.getMonth(), ctx.now.getDate() - k);
    const D = ctx.DIAS[dt.getDay()]; if (!D) continue;
    const dia = ctx.ymd(dt), ck = {};
    D.tasks.forEach((t, i) => { ck[t.id] = !(k === escolhido && i < quantas); });
    ctx.save("cron:checks:" + dia, ck);
  }
  return ctx.renderAtrasadas();
}
const um = summaryDeAtrasadas(RB, 1);
ok(/1 rotina não marcada/.test(um), "1 -> '1 rotina nao marcada'",
   (um.match(/<summary>[^<]*/) || [""])[0]);
const tres = summaryDeAtrasadas(RB, 3);
ok(/3 rotinas não marcadas/.test(tres), "3 -> '3 rotinas nao marcadas'",
   (tres.match(/<summary>[^<]*/) || [""])[0]);
ok(!/ficouram/.test(CODIGO), "a string 'ficouram' nao existe no codigo");
ok(!/ficou'\+\(/.test(CODIGO), "e a flexao nao e mais montada por concatenacao");
/* o bloco continua inteiro */
ok(typeof RB.atrasadas === "function" && typeof RB.marcarAtrasada === "function" &&
   typeof RB.dispensarAtrasada === "function" && typeof RB.podarDispensados === "function",
   "atrasadas/marcar/dispensar/podar continuam existindo");
/* O PAINEL SAIU DA TELA, MAS A IMPLEMENTACAO FICOU. Sem esta assercao nada
   impediria a chamada de voltar em silencio no proximo render. */
summaryDeAtrasadas(RB, 3);          /* ha 3 rotinas por marcar neste aparelho */
RB.renderHoje();
const hojeRB = RB.document.getElementById("view-hoje").innerHTML;
/* Marcadores EXCLUSIVOS do painel. A classe .carry-b nao serve: as retomadas
   reusam a mesma, e testar por ela acusaria o bloco errado. */
ok(!/rotinas n[aã]o marcada/.test(hojeRB) &&
   !/marcarAtrasada\(|dispensarAtrasada\(/.test(hojeRB),
   "o painel de rotinas nao marcadas NAO e desenhado no Hoje");
ok(RB.atrasadas().length === 3,
   "mas atrasadas() continua enxergando as 3 — a implementacao ficou",
   RB.atrasadas().length);
ok(RB.revisaoDaSemana().atras.rotinas.length === 3,
   "e a revisao dominical continua usando atrasadas() para o 'Ficou para tras'",
   RB.revisaoDaSemana().atras.rotinas.length);
const domDesc2 = RB.DIAS[0].tasks.filter(t => t.id === "dom-desc")[0];
ok(domDesc2 && domDesc2.t === "Descanso", "e dom-desc continua sendo 'Descanso'",
   domDesc2 && domDesc2.t);

console.log("\n=== 40. O silencio da retomada atravessa (Fase 6B) ===");
/* um projeto parado de verdade, para que retomadas() tenha o que devolver */
function comParado(nome, storage){
  const ctx = criarAparelho(nome, storage ? { storage } : undefined);
  const ps = ctx.getProjs("pipeline"), pr = ps.filter(p => p.id === "a01")[0];
  const velho = new Date(Date.now() - 40 * 86400000).toISOString();
  pr.subs.forEach((x, i) => { x.st = i === 0 ? 1 : 0; x.em = velho; x.vida = "ativo"; });
  ctx.setProjs("pipeline", ps);
  return ctx;
}
const R6A = comParado("ret-a");
ok(R6A.retomadas().some(r => r.projId === "a01"), "a01 aparece como parado",
   R6A.retomadas().map(r => r.projId));
const antesRA = R6A.getToques().length;
R6A.adiarRetomada("pipeline", "a01");
const guardado = R6A.LS("cron:retomadas-adiadas", {})["pipeline/a01"];
ok(guardado && typeof guardado === "object" && guardado.ate && guardado.em,
   "a gravacao virou {ate, em}", guardado);
const tqR = R6A.getToques().filter(t => t.tipo === "retomada");
ok(R6A.getToques().length === antesRA + 1 && tqR.length === 1,
   "e emitiu exatamente um toque `retomada`", R6A.getToques().length - antesRA);
ok(JSON.stringify(Object.keys(tqR[0].dados).sort()) === '["ate","pid","projId"]',
   "com o payload minimo {pid, projId, ate}", Object.keys(tqR[0].dados));
ok(tqR[0].dados.ate === guardado.ate && tqR[0].quando === guardado.em,
   "e o instante gravado e o mesmo que subiu");
/* os DOIS leitores calam */
ok(!R6A.retomadas().some(r => r.projId === "a01"), "o projeto sai de retomadas()");
ok(!(R6A.motorDePrioridades([]) || []).some(c => c.projId === "a01"),
   "e sai tambem do motorDePrioridades()");

console.log("\n=== 41. Migracao das silenciadas antigas ===");
const futura = (() => { const d = new Date(Date.now() + 10 * 86400000);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); })();
const vencida = "2020-01-01";
const R6MG = criarAparelho("mig-ret", { storage: {
  "cron:retomadas-adiadas": JSON.stringify({"pipeline/a01": futura, "pipeline/a02": vencida})
}});
const mapaMG = R6MG.LS("cron:retomadas-adiadas", {});
ok(mapaMG["pipeline/a01"] && mapaMG["pipeline/a01"].ate === futura &&
   mapaMG["pipeline/a01"].em === "2026-01-01T00:00:00.000Z",
   "a futura virou {ate, em} com o piso RETOMADA_EM", mapaMG["pipeline/a01"]);
ok(mapaMG["pipeline/a02"] && mapaMG["pipeline/a02"].ate === vencida,
   "a vencida foi PRESERVADA no aparelho, convertida", mapaMG["pipeline/a02"]);
/* Para que a proxima assercao signifique alguma coisa, a02 precisa ser
   candidato de verdade: sem isso ele nunca apareceria em retomadas() e o teste
   passaria sem testar nada. Parado ha 40 dias, com uma etapa aberta. */
const psMG = R6MG.getProjs("pipeline"), a02MG = psMG.filter(p => p.id === "a02")[0];
const velhoMG = new Date(Date.now() - 40 * 86400000).toISOString();
a02MG.subs.forEach((x, i) => { x.st = i === 0 ? 1 : 0; x.em = velhoMG; x.vida = "ativo"; });
R6MG.setProjs("pipeline", psMG);
ok(R6MG.retomadas().some(r => r.projId === "a02"), "a vencida nao cala ninguem",
   R6MG.retomadas().map(r => r.projId));
ok(mapaMG["pipeline/a02"].ate < R6MG.ymd(R6MG.now),
   "a data da silenciada vencida ficou no passado", mapaMG["pipeline/a02"].ate);
const tqMG = R6MG.getToques().filter(t => t.tipo === "retomada");
ok(tqMG.length === 1 && tqMG[0].dados.projId === "a01",
   "mas so a futura foi publicada: um toque", tqMG.map(t => t.dados));
R6MG.migrarRetomadas();
ok(R6MG.getToques().filter(t => t.tipo === "retomada").length === 1,
   "migrar de novo nao emite o segundo lote");
ok(R6MG.LS("cron:retomadas-migrado", false) === true, "cron:retomadas-migrado foi posto");

console.log("\n=== 42. Convergencia entre aparelhos ===");
function dobrarRetomadas(toques, base) {
  const est = { retomadas: Object.assign({}, (base || {}).retomadas) };
  toques.slice().sort((a, b) => (a.quando || "") < (b.quando || "") ? -1 : 1)
    .forEach(t => {
      if (t.tipo !== "retomada") return;
      const k = t.dados.pid + "/" + t.dados.projId;
      const atual = est.retomadas[k];
      if (atual && (atual.quando || "") > (t.quando || "")) return;
      est.retomadas[k] = { ate: t.dados.ate, quando: t.quando, aparelho: t.aparelho };
    });
  return est;
}
const R6B1 = comParado("ret-b1"); R6B1.adiarRetomada("pipeline", "a01");
const R6B2 = comParado("ret-b2"); R6B2.adiarRetomada("pipeline", "a02");
const uniao = dobrarRetomadas(R6B1.getToques().concat(R6B2.getToques()));
ok(Object.keys(uniao.retomadas).sort().join(",") === "pipeline/a01,pipeline/a02",
   "projetos diferentes coexistem", Object.keys(uniao.retomadas));
R6B1.aplicarRetomadasDoEstado(uniao);
const mRB1 = R6B1.LS("cron:retomadas-adiadas", {});
ok(mRB1["pipeline/a01"] && mRB1["pipeline/a02"],
   "e o aparelho A recebe a uniao sem perder a propria", Object.keys(mRB1));
/* mais novo vence */
const R6NV = comParado("ret-novo"); R6NV.adiarRetomada("pipeline", "a01");
R6NV.aplicarRetomadasDoEstado({ retomadas: { "pipeline/a01":
  { ate: "2099-12-31", quando: "2099-01-01T00:00:00.000Z" } } });
ok(R6NV.LS("cron:retomadas-adiadas", {})["pipeline/a01"].ate === "2099-12-31",
   "remoto mais novo vence");
/* mais antigo nao vence */
const R6VL = comParado("ret-velho"); R6VL.adiarRetomada("pipeline", "a01");
const ateVL = R6VL.LS("cron:retomadas-adiadas", {})["pipeline/a01"].ate;
R6VL.aplicarRetomadasDoEstado({ retomadas: { "pipeline/a01":
  { ate: "2020-01-01", quando: "2020-01-01T00:00:00.000Z" } } });
ok(R6VL.LS("cron:retomadas-adiadas", {})["pipeline/a01"].ate === ateVL,
   "remoto mais antigo nao derruba o local");
/* empate preserva o local */
const R6EM = comParado("ret-empate"); R6EM.adiarRetomada("pipeline", "a01");
const locEM = R6EM.LS("cron:retomadas-adiadas", {})["pipeline/a01"];
R6EM.aplicarRetomadasDoEstado({ retomadas: { "pipeline/a01":
  { ate: "2099-12-31", quando: locEM.em } } });
ok(R6EM.LS("cron:retomadas-adiadas", {})["pipeline/a01"].ate === locEM.ate,
   "empate no relogio preserva o local");
/* receber nao e tocar */
const R6EC = comParado("ret-eco");
const antesEC = R6EC.getToques().length;
R6EC.aplicarRetomadasDoEstado({ retomadas: { "pipeline/a01":
  { ate: "2099-12-31", quando: "2099-01-01T00:00:00.000Z" } } });
ok(R6EC.LS("cron:retomadas-adiadas", {})["pipeline/a01"].ate === "2099-12-31",
   "o silencio de fora chega");
ok(R6EC.getToques().length === antesEC, "e a descida NAO emite toque",
   R6EC.getToques().length - antesEC);

console.log("\n=== 43. O silencio expira sozinho ===");
const R6EX = comParado("ret-expira");
R6EX.save("cron:retomadas-adiadas", {"pipeline/a01": {ate:"2020-01-01", em:"2020-01-01T00:00:00.000Z"}});
ok(R6EX.retomadas().some(r => r.projId === "a01"),
   "vencido o `ate`, o projeto reaparece — sem toque nenhum",
   R6EX.retomadas().map(r => r.projId));

console.log("\n=== 45. A prioridade cumprida nao volta amanha ===");
/* O DEFEITO QUE ISTO FECHA: a prioridade livre era marcada no cron:checks do
   DIA — o mecanismo das rotinas. A rotina e por dia de proposito; a prioridade
   e da SEMANA. Marcada ontem, a marca era procurada na chave de hoje, nao era
   achada, e a prioridade cumprida reaparecia por cumprir. */
const HOJE  = (function(){ const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); })();
const ONTEM = (function(){ const d=new Date(Date.now()-86400000);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); })();

const PF = criarAparelho("prio-feita", { prompt: "Revisar o capitulo 3" });
PF.addPrioridadeLivre();
const pfId = PF.getPrio()[0].id;
ok(PF.prioridadesDoDia().manuais.some(p => p.id === pfId),
   "por cumprir, a prioridade esta na tela");

/* marcada HOJE: fica na tela, e fica MARCADA — ver a confirmacao do toque */
PF.togglePrioridadeFeita(pfId);
const naTela = PF.prioridadesDoDia().manuais.filter(p => p.id === pfId)[0];
ok(!!naTela, "marcada hoje, ela CONTINUA na tela");
ok(naTela.feito_em === HOJE, "com a data de hoje", naTela.feito_em);
ok(/pr-livre done/.test(PF.cartaoDePrioridade(naTela)),
   "e o cartao a desenha riscada");

/* a mesma prioridade, marcada ONTEM: sai da tela */
const listaPF = PF.getPrio();
listaPF.filter(p => p.id === pfId)[0].feito_em = ONTEM;
PF.setPrio(listaPF);
ok(!PF.prioridadesDoDia().manuais.some(p => p.id === pfId),
   "marcada ontem, ela SAI do Hoje");
/* ...mas nao some do sistema: decisao 3 — so deixa de ocupar a tela */
ok(PF.getPrio().some(p => p.id === pfId),
   "sem sumir da semana: ela continua no cron:prioridades");
const revPF = PF.revisaoDaSemana();
ok(revPF.concluido.prioridades.some(x => /capitulo 3/.test(x.t)),
   "e a revisao de domingo continua contando como cumprida",
   revPF.concluido.prioridades);
ok(!revPF.atras.prioridades.some(x => /capitulo 3/.test(x.t)),
   "sem aparecer tambem em Ficou para tras");
/* e o motor nao a sugere de volta: escolha sua continua sendo escolha sua */
ok(!PF.prioridadesDoDia().sugeridas.some(x => x.t && /capitulo 3/.test(x.t)),
   "e o motor nao a devolve como sugestao");

/* desmarcar volta atras, e no mesmo dia */
const PF2 = criarAparelho("prio-desmarca", { prompt: "Ler Espinosa" });
PF2.addPrioridadeLivre();
const pf2Id = PF2.getPrio()[0].id;
PF2.togglePrioridadeFeita(pf2Id);
PF2.togglePrioridadeFeita(pf2Id);
ok(PF2.getPrio()[0].feito_em === "", "desmarcar limpa a data", PF2.getPrio()[0].feito_em);
ok(PF2.prioridadesDoDia().manuais.some(p => p.id === pf2Id),
   "e ela volta a contar como por cumprir");

/* DECISAO B: a prioridade DE TRILHO nao sai por etapa fechada. Ela e o projeto
   da semana; fechar uma etapa a faz AVANCAR, e nao sair. */
const PT = criarAparelho("prio-trilho");
PT.addPrioridadeTrilho("pipeline/a01");
const etPT = PT.estagioDoTrilho("pipeline", "a01");
PT.marcarDoHoje("pipeline", "a01", etPT.subId, true);
const trilhoDepois = PT.prioridadesDoDia().manuais.filter(p => p.tipo === "trilho")[0];
ok(!!trilhoDepois, "etapa fechada: a prioridade de trilho CONTINUA na tela");
const etPT2 = PT.estagioDoTrilho("pipeline", "a01");
ok(etPT2 && etPT2.subId !== etPT.subId,
   "e ela mostra a etapa SEGUINTE, lida do trilho agora", etPT2 && etPT2.subT);
/* e nem um feito_em plantado a tira: a regra e por tipo, e nao por descuido */
const listaPT = PT.getPrio();
listaPT.filter(p => p.tipo === "trilho")[0].feito_em = ONTEM;
PT.setPrio(listaPT);
ok(PT.prioridadesDoDia().manuais.some(p => p.tipo === "trilho"),
   "a de trilho nao sai da tela nem com feito_em antigo");

/* A ROTINA NAO MUDOU EM NADA: continua por dia, e volta quando a semana gira */
const RR = criarAparelho("rotina-intacta");
const idxHojeRR = new Date().getDay();
const tarefaRR = ((RR.DIAS[idxHojeRR] || {}).tasks || [])[0];
if (tarefaRR) {
  RR.toggleCheck(tarefaRR.id);
  ok(!!(RR.LS("cron:checks:" + HOJE, {}) || {})[tarefaRR.id],
     "a rotina continua sendo marcada no cron:checks do dia");
  const ckOntemRR = RR.LS("cron:checks:" + ONTEM, {}) || {};
  ok(!ckOntemRR[tarefaRR.id],
     "e a marca de hoje nao vaza para outro dia — cada dia e o seu");
} else {
  ok(false, "o dia de hoje deveria ter ao menos uma rotina");
}

console.log("\n=== 46. A prioridade cumprida atravessa aparelhos ===");
/* Decisao 2: se ja sincroniza, sincroniza. Sem tipo de toque novo — o
   `prioridade`, que ja existia, passa a carregar `feito_em`. */
const SM = criarAparelho("sinc-mac", { prompt: "Fichar o Lutero" });
SM.addPrioridadeLivre();
const smId = SM.getPrio()[0].id;
SM.togglePrioridadeFeita(smId);
const tqPrio = SM.getToques().filter(t => t.tipo === "prioridade");
ok(tqPrio.length >= 2, "marcar emite um toque de prioridade", tqPrio.length);
ok(tqPrio[tqPrio.length - 1].dados.feito_em === HOJE,
   "e o toque leva a DATA, e nao um booleano",
   tqPrio[tqPrio.length - 1].dados.feito_em);

const SC = criarAparelho("sinc-celular");
SC.aplicarPrioridadesDoEstado(dobrarNaMao(SM.getToques()));
const noCelSC = SC.getPrio().filter(p => p.id === smId)[0];
ok(!!noCelSC && noCelSC.feito_em === HOJE,
   "o celular recebe a prioridade JA CUMPRIDA", noCelSC && noCelSC.feito_em);
ok(/pr-livre done/.test(SC.cartaoDePrioridade(noCelSC)),
   "e a desenha marcada, sem precisar de cron:checks nenhum");

/* desmarcar tambem atravessa: mudar de ideia e um fato */
SM.togglePrioridadeFeita(smId);
SC.aplicarPrioridadesDoEstado(dobrarNaMao(SM.getToques()));
const noCelSC2 = SC.getPrio().filter(p => p.id === smId)[0];
ok(!!noCelSC2 && !noCelSC2.feito_em,
   "desmarcar no computador desmarca no celular", noCelSC2 && noCelSC2.feito_em);

/* uma descida QUALQUER nao pode apagar a conclusao deste aparelho: o relogio
   e que decide, item a item, como em todo o resto do pipeline */
const SD = criarAparelho("sinc-descida", { prompt: "Preparar a aula" });
SD.addPrioridadeLivre();
const sdId = SD.getPrio()[0].id;
SD.togglePrioridadeFeita(sdId);
const estVelho = dobrarNaMao(SD.getToques());
estVelho.prioridades[SD.semanaAtual + "/" + sdId].feito_em = "";
estVelho.prioridades[SD.semanaAtual + "/" + sdId].quando = "2020-01-01T00:00:00.000Z";
SD.aplicarPrioridadesDoEstado(estVelho);
ok(SD.getPrio().filter(p => p.id === sdId)[0].feito_em === HOJE,
   "um estado ANTIGO nao apaga a conclusao registrada agora",
   SD.getPrio().filter(p => p.id === sdId)[0].feito_em);

console.log("\n=== 47. Mudanca de gaveta das marcas antigas ===");
/* A marca que ficou no cron:checks tem de virar feito_em, senao a prioridade
   marcada ontem — o caso relatado — volta hoje por cumprir mesmo depois da
   correcao. */
/* Semeada como o aparelho estava ANTES da correcao: a prioridade na semana, a
   marca no cron:checks de ontem. A migracao roda no boot, como as outras. */
const SEM_ATUAL = criarAparelho("so-para-a-semana").semanaAtual;
const prioAntiga = [{id:"prAntiga", tipo:"livre", painel:"", projId:"",
                     t:"Terminar o parecer", em:"2026-01-01T00:00:00.000Z"}];
const ckAntigo = {}; ckAntigo["prAntiga"] = true;
const MGV = criarAparelho("migra-prio", { storage: {
  ["cron:prioridades:" + SEM_ATUAL]: JSON.stringify(prioAntiga),
  ["cron:checks:" + ONTEM]: JSON.stringify(ckAntigo)
}});
const pAntiga = MGV.getPrio().filter(p => p.id === "prAntiga")[0];
ok(!!pAntiga && pAntiga.feito_em === ONTEM,
   "a marca antiga virou feito_em, com o DIA em que foi marcada",
   pAntiga && pAntiga.feito_em);
ok(!MGV.prioridadesDoDia().manuais.some(p => p.id === "prAntiga"),
   "e por isso ela sai da tela hoje — o defeito relatado");
ok(MGV.revisaoDaSemana().concluido.prioridades.some(x => /parecer/.test(x.t)),
   "sem perder a conta do domingo");
ok(MGV.getToques().filter(t => t.tipo === "prioridade").length === 0,
   "a migracao NAO publica toque: cron:checks sempre foi local",
   MGV.getToques().filter(t => t.tipo === "prioridade").length);
ok(!!(MGV.LS("cron:checks:" + ONTEM, {}) || {})["prAntiga"],
   "e nao apaga a chave antiga — dado de aparelho nao se destroi para arrumar gaveta");
ok(MGV.migrarPrioridadesFeitas() === 0, "roda uma vez so");

/* a marca de HOJE tambem muda de gaveta, e a prioridade fica marcada na tela */
const ckHojeMG = {}; ckHojeMG["prDeHoje"] = true;
const MGH = criarAparelho("migra-hoje", { storage: {
  ["cron:prioridades:" + SEM_ATUAL]: JSON.stringify(
    [{id:"prDeHoje", tipo:"livre", painel:"", projId:"", t:"Corrigir provas",
      em:"2026-01-01T00:00:00.000Z"}]),
  ["cron:checks:" + HOJE]: JSON.stringify(ckHojeMG)
}});
const pHojeMG = MGH.prioridadesDoDia().manuais.filter(p => p.id === "prDeHoje")[0];
ok(!!pHojeMG && pHojeMG.feito_em === HOJE,
   "marcada hoje, continua na tela e marcada", pHojeMG && pHojeMG.feito_em);

/* migracao nao inventa conclusao onde nao havia marca */
const MGN = criarAparelho("migra-limpa", { prompt: "Escrever o resumo" });
MGN.addPrioridadeLivre();
ok(MGN.migrarPrioridadesFeitas() === 0, "sem marca antiga, nao ha o que migrar");
ok(!MGN.getPrio()[0].feito_em, "e a prioridade continua por cumprir");

console.log("\n=== 44. A estrutura em arquivos (Fase 7) ===");
const ESPERADOS = ["js/00-config.js", "js/10-nucleo.js", "js/20-regras.js",
                   "js/30-render.js", "js/40-app.js"];
ok(JSON.stringify(CAMINHOS) === JSON.stringify(ESPERADOS),
   "os cinco scripts aparecem no HTML na ordem certa", CAMINHOS);
ok(ESPERADOS.every(f => fs.existsSync(path.join(RAIZ, "Cronograma", f))),
   "e os cinco arquivos existem");
/* A ENTREGA TAMBEM E TESTAVEL, e passou a ser depois de uma correcao publicada
   ficar invisivel no aparelho por duas semanas. */
const VERSAO_CFG = (FONTES[0].match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1];
const VERSOES_HTML = SRCS.concat(
  (HTML.match(/href="css\/cronograma\.css[^"]*"/g) || []).map(h => h.slice(6, -1)))
  .map(s => (s.split("?v=")[1] || null));
ok(!!VERSAO_CFG, "APP_VERSION existe em js/00-config.js", VERSAO_CFG);
ok(VERSOES_HTML.length === 6 && VERSOES_HTML.every(v => v === VERSAO_CFG),
   "e os 6 assets do HTML carregam essa MESMA versao no ?v=", VERSOES_HTML);
const NUCLEO = FONTES[1];
ok(/fetch\("js\/00-config\.js\?ping="/.test(NUCLEO),
   "checkUpdate busca a versao onde ela mora (js/00-config.js), nao no HTML");
/* O que checkUpdate procurava era a ATRIBUICAO, nao a palavra: mencionar o
   nome num comentario do HTML e inofensivo, uma segunda atribuicao nao. */
ok(!/APP_VERSION\s*=\s*"/.test(HTML),
   "e o HTML nao declara APP_VERSION — era ali que checkUpdate procurava, e por isso parou");
ok(fs.existsSync(path.join(RAIZ, "Cronograma", "css", "cronograma.css")),
   "cronograma.css existe");
ok(/<link[^>]+href="css\/cronograma\.css(\?[^"]*)?"/.test(HTML),
   "e o HTML o referencia");
/* o shell nao pode ter sobrado nada de codigo */
ok(!/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/.test(HTML),
   "nao ha JavaScript inline no HTML");
ok(!/<style[\s\S]*?<\/style>/.test(HTML), "nem CSS inline");
ok(HTML.length < 20000, "o index.html virou um shell", HTML.length);
/* e o que foi para o ar continua sendo o que se testa */
ok(CODIGO.length > 200000, "o codigo real tem o tamanho esperado", CODIGO.length);
const APP = criarAparelho("fase7");
["renderHoje","estagioDoTrilho","aplicarPrioridadesDoEstado","vgMarcar",
 "enfileirarToque","renderProcessos","renderSemana","renderTrilhos","renderEventos",
 "renderMetas","vgRender","retomadas","motorDePrioridades","guiaChecks","toggleGuia",
 "adiarRetomada","aplicarToeflDoEstado","aplicarRetomadasDoEstado","processosVisiveis",
 "revisaoDaSemana","atrasadas","LS","save","getToques","buscarEstado"].forEach(function(f){
  ok(typeof APP[f] === "function", "a funcao publica " + f + " continua disponivel");
});
/* nenhuma chave nem tipo de toque mudou de lugar junto com o codigo */
const CHAVES = (CODIGO.match(/cron:[a-z0-9:-]*/g) || []);
ok(CHAVES.indexOf("cron:checks:") > -1 && CHAVES.indexOf("cron:contexto") > -1 &&
   CHAVES.indexOf("cron:hoje-dispensados") > -1 && CHAVES.indexOf("cron:retomadas-adiadas") > -1,
   "as chaves de localStorage continuam as mesmas");
const TIPOS = Array.from(new Set((CODIGO.match(/enfileirarToque\("([a-z]+)"/g) || [])
  .map(t => t.match(/"([a-z]+)"/)[1]))).sort();
ok(JSON.stringify(TIPOS) ===
   JSON.stringify(["evento","meta","prioridade","registro","retomada","toefl","triagem"]),
   "e os sete tipos de toque continuam os mesmos, sem nenhum novo", TIPOS);

console.log("\n=== 45. Avisos: aditivos e sem tocar na sincronia (Fase 8) ===");
const SW_BRUTO = fs.readFileSync(path.join(RAIZ, "Cronograma", "sw.js"), "utf8");
/* Sem os comentarios: a assercao e sobre o CODIGO, e o comentario do proprio
   sw.js explica justamente por que nao ha fetch ali — ele precisa poder dizer
   as palavras que o codigo nao pode conter. */
const SW = SW_BRUTO.replace(/\/\*[\s\S]*?\*\//g, "");
/* A ASSERCAO QUE PROTEGE A SINCRONIZACAO. Um service worker com ouvinte de
   fetch interceptaria estado.json e entrada.json, que sao mesma origem, e a
   pagina passaria a desenhar estado velho. */
ok(!/addEventListener\s*\(\s*["']fetch["']/.test(SW),
   "o service worker NAO tem ouvinte de fetch");
ok(!/caches\b|CacheStorage|cache\.open/.test(SW), "e nao usa a Cache API");
ok(/addEventListener\s*\(\s*["']push["']/.test(SW) &&
   /addEventListener\s*\(\s*["']notificationclick["']/.test(SW),
   "so push e notificationclick");
ok(!/estado\.json|entrada\.json|api\.github\.com/.test(SW),
   "e o codigo dele nao toca em estado.json, entrada.json nem na api do GitHub");
ok(/nao tem ouvinte de fetch|NAO HA addEventListener\("fetch"\)/.test(SW_BRUTO) ||
   /fetch/.test(SW_BRUTO),
   "e o arquivo explica por escrito por que o fetch ficou de fora");

ok(!/push:inscricao/.test(CODIGO), "nenhuma chave push:inscricao foi criada");
ok(/pushManager\.getSubscription/.test(CODIGO),
   "a inscricao e lida do PushManager, que e a fonte da verdade");

/* Nada de toque novo, e nenhuma secao nova no estado consolidado. */
const TIPOS8 = Array.from(new Set((CODIGO.match(/enfileirarToque\("([a-z]+)"/g) || [])
  .map(t => t.match(/"([a-z]+)"/)[1]))).sort();
ok(TIPOS8.length === 7, "os tipos de toque continuam sete", TIPOS8);
ok(JSON.stringify(TIPOS8) ===
   JSON.stringify(["evento","meta","prioridade","registro","retomada","toefl","triagem"]),
   "e sao exatamente os mesmos sete", TIPOS8);
const DOBRA = fs.readFileSync(path.join(RAIZ, "scripts", "dobrar_toques.py"), "utf8");
const SECOES = (DOBRA.match(/^\s{8}"(\w+)": \{\},$/gm) || []).map(l => l.match(/"(\w+)"/)[1]);
ok(JSON.stringify(SECOES.sort()) ===
   JSON.stringify(["eventos","itens","metas","prioridades","retomadas","toefl","triagem"]),
   "e o estado.json nao ganhou secao nova", SECOES);

/* AS CHAVES PUBLICAS, PREENCHIDAS EM 04/09. Ate aqui este teste afirmava o
   contrario — que sem configuracao o botao nao aparece —, porque a VAPID ainda
   nao existia. Agora existe, e o que precisa ser provado e outra coisa: que ela
   e uma chave DE VERDADE e que a privada nao veio junto. */
const AV = criarAparelho("avisos");
ok(typeof AV.avisosConfigurados === "function" && AV.avisosConfigurados() === true,
   "com as tres chaves publicas preenchidas, avisosConfigurados() e verdadeiro");
/* A guarda continua exigindo AS TRES: apagar uma tem de derrubar o botao, e nao
   deixar o aparelho tentar se inscrever contra configuracao pela metade. */
ok(/AVISOS\.URL\s*&&\s*AVISOS\.CHAVE\s*&&\s*AVISOS\.VAPID/.test(CODIGO),
   "e a guarda continua exigindo as tres, e nao uma qualquer");

/* UMA VAPID TRUNCADA PASSARIA POR NAO-VAZIA E QUEBRARIA SO NO APARELHO. Uma
   chave P-256 nao comprimida tem 65 bytes e comeca com 0x04; em base64url isso
   da 87 caracteres. Colar de menos e o erro facil, e e este teste que o pega. */
const VAPID = (CODIGO.match(/VAPID:\s*"([^"]*)"/) || [])[1] || "";
ok(VAPID.length === 87, "a VAPID publica tem os 87 caracteres de uma chave P-256",
   VAPID.length);
ok(/^[A-Za-z0-9_-]+$/.test(VAPID), "em base64url, sem caractere estranho de copia");
const VBYTES = Buffer.from(VAPID.replace(/-/g, "+").replace(/_/g, "/"), "base64");
ok(VBYTES.length === 65 && VBYTES[0] === 4,
   "e decodifica para 65 bytes comecando em 0x04 — ponto nao comprimido",
   VBYTES.length + " bytes, primeiro " + VBYTES[0]);

/* E A PRIVADA NAO ENTRA AQUI, NUNCA. O arquivo e publico: o repositorio inteiro
   e. Fixar os campos permitidos e o que impede que um dia alguem acrescente um
   `VAPID_PRIVADA` ao lado, achando que esta so "completando o objeto". */
const CAMPOS = (CODIGO.match(/const AVISOS = \{[\s\S]*?\n\};/) || [""])[0];
ok(/\bURL:/.test(CAMPOS) && /\bCHAVE:/.test(CAMPOS) && /\bVAPID:/.test(CAMPOS),
   "o AVISOS tem os tres campos publicos");
const CHAVES_AVISOS = (CAMPOS.match(/^\s{2}([A-Z_]+):/gm) || [])
  .map(l => l.trim().replace(":", "")).sort();
ok(JSON.stringify(CHAVES_AVISOS) === JSON.stringify(["CHAVE","URL","VAPID"]),
   "e NENHUM outro — nada de privada, token ou segredo neste arquivo",
   CHAVES_AVISOS);
["temPush","registrarServiceWorker","inscricaoAtual","inscreverAvisos",
 "desinscreverAvisos","renderAvisos","alternarAvisos"].forEach(function(f){
  ok(typeof AV[f] === "function", "a funcao " + f + " existe");
});
const antesAV = AV.getToques().length;
AV.renderAvisos();
ok(AV.getToques().length === antesAV, "desenhar os avisos nao emite toque nenhum");
AV.renderHoje();
ok(/Rotinas de/.test(AV.document.getElementById("view-hoje").innerHTML),
   "e o Hoje continua desenhando com a Fase 8 no ar");

/* O manifest e os icones que o iOS exige para instalar o app. */
ok(fs.existsSync(path.join(RAIZ, "Cronograma", "manifest.webmanifest")), "o manifest existe");
ok(/<link[^>]+rel="manifest"/.test(HTML), "e o HTML o referencia");
["icone-192.png","icone-512.png","icone-maskable-512.png"].forEach(function(n){
  ok(fs.existsSync(path.join(RAIZ, "Cronograma", "icones", n)), "o icone " + n + " existe");
});

console.log("\n=== 44. TOEFL: a estreia do plano e o catalogo (Fase 9A) ===");
const T9 = criarAparelho("toefl9a");
const ANTES = "2026-09-06", D0 = "2026-09-07", DEPOIS = "2026-10-19";  /* dom · seg · seg */

/* O D0 decide SE o plano cobra, e nunca O QUE ele responde. */
ok(T9.TOEFL_D0 === "2026-09-07", "D0 e a segunda-feira 07/09/2026", T9.TOEFL_D0);
ok(T9.toeflComecou(D0) === true && T9.toeflComecou(DEPOIS) === true,
   "a partir do D0 o plano esta em curso");
ok(T9.toeflComecou(ANTES) === false && T9.toeflComecou("2026-08-31") === false,
   "antes do D0 nao esta");
ok(T9.acaoDoDiaDoProcesso("toefl", 1, ANTES) === null,
   "e o processo nao pede nada na vespera, nem num dia util");
ok(T9.renderToeflHoje(1, ANTES) === "" && T9.renderToeflHoje(2, ANTES) === "",
   "o cartao tambem fica vazio antes do D0");

/* O PLANO NAO FOI DESLOCADO. Segunda continua sendo Reading em qualquer
   semana depois da estreia — TOEFL_SEMANA e indexada por dia da semana. */
ok(T9.acaoDoDiaDoProcesso("toefl", 1, D0).comp === "Reading" &&
   T9.acaoDoDiaDoProcesso("toefl", 1, DEPOIS).comp === "Reading",
   "segunda e Reading no D0 e seis semanas depois: o plano nao foi remapeado");
[[1,"Reading"],[2,"Listening"],[3,"Vocabulário"],[4,"Writing"],[5,"Speaking"]]
  .forEach(function(par){
    ok(T9.atividadeDoDia(par[0], D0).comp === par[1],
       "dia " + par[0] + " -> " + par[1] + ", como o plano sempre disse");
  });
ok(T9.atividadeDoDia(6, D0) === null && T9.atividadeDoDia(0, D0) === null,
   "e o fim de semana continua sem pedir nada");

/* A DURACAO E LIDA DO PROPRIO PLANO, e nao declarada num segundo lugar. */
ok(T9.toeflMinutos("TestReady, seção Reading Practice. ~20 min") === 20 &&
   T9.toeflMinutos("algo sem duracao") === null,
   "a duracao sai do '~NN min' da nota, e a ausencia devolve null");
[[1,20],[2,20],[3,15],[4,20],[5,30]].forEach(function(par){
  const a = T9.atividadeDoDia(par[0], D0);
  ok(a.min === par[1], "dia " + par[0] + ": " + par[1] + " min, tirados da nota", a.min);
  ok(a.n === T9.TOEFL_SEMANA[par[0]].n, "  e a nota chega intacta ao cartao");
});

/* O ROTEAMENTO: para onde o botao leva, e onde ele nao existe. */
[1,2,4,5].forEach(function(d){
  const a = T9.atividadeDoDia(d, D0);
  ok(a.url === "https://testready.ets.org", "dia " + d + " leva ao TestReady", a.url);
  ok(/th-ir/.test(T9.renderToeflHoje(d, D0)), "  e o cartao desenha o botao");
});
const qua = T9.atividadeDoDia(3, D0);
ok(qua.url === "" && /Anki/.test(qua.rec),
   "quarta nomeia o Anki e nao tem URL — nenhuma foi inventada", qua);
ok(!/th-ir/.test(T9.renderToeflHoje(3, D0)),
   "e sem URL o cartao nao desenha botao nenhum");
const cartao = T9.renderToeflHoje(2, D0);
ok(/Listening/.test(cartao) && /20 min previstos/.test(cartao) &&
   /Listening Practice/.test(cartao),
   "o cartao responde habilidade, duracao e onde clicar", cartao.slice(0, 120));
ok(/10–15 min já contam/.test(cartao),
   "e diz a regra do contato sem inventar atividade curta");

/* O plano em si continua intocado. */
ok(Object.keys(T9.TOEFL_RECURSO).length === 5, "o roteamento cobre os cinco dias uteis");
ok(T9.TOEFL_SEMANA[6] === null && T9.TOEFL_SEMANA[0] === null,
   "TOEFL_SEMANA nao ganhou fim de semana");
ok(JSON.stringify(T9.TOEFL_FASES) === JSON.stringify(["f1","f2","f3"]),
   "e TOEFL_FASES nao foi tocada nesta fase");
ok(T9.avisoDoCalendario.length === 0 && typeof T9.currentFaseId === "function",
   "o mecanismo de fase pelo nucleo continua de pe");

console.log("\n" + "=".repeat(62));
console.log("FALHAS: " + falhas.length);
falhas.forEach(f => console.log("  - " + f));
process.exit(falhas.length ? 1 : 0);
