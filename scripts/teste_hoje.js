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
/* `const` e `let` no topo de um script do vm ficam no escopo lexico dele e NAO
   viram propriedade do contexto — so `function` e `var` viram. DIAS, PAINEIS e
   CHK sao const, entao um epilogo os publica. Sem isto o teste enxergaria
   metade da pagina e acharia que a outra metade nao existe. */
const FONTE = HTML.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1] +
  "\n;globalThis.__const = {DIAS, PAINEIS, CHK, EVENTOS_NA_TELA, SCHEMA_VERSAO};";

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
ok(pr.sugeridas.length === 0, "nenhuma sugestao automatica nesta fase");
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
        t: t.dados.t, del: !!t.dados.del, quando: t.quando, aparelho: t.aparelho
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
ok(!/depende de voc/.test(S2.document.getElementById("view-hoje").innerHTML),
   "e ai o selo nao aparece");

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

console.log("\n=== 12. TOEFL: a atividade concreta do dia ===");
Object.keys(A.DIAS).forEach(k => (A.DIAS[k].tasks || []).forEach(t => {
  if (!/toefl/i.test(t.id)) return;
  ok(t.t !== "TOEFL" && t.t.length > 12 && /:|·/.test(t.t),
     "o titulo diz a atividade, nao so 'TOEFL': " + t.t);
}));
ok(typeof A.toeflFase === "function" && typeof A.renderGuia === "function",
   "e o mecanismo de fases/guia continua intacto");

console.log("\n" + "=".repeat(62));
console.log("FALHAS: " + falhas.length);
falhas.forEach(f => console.log("  - " + f));
process.exit(falhas.length ? 1 : 0);
