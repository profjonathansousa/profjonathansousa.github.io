/* PROVA DA ESCRITA DUPLA — Fase 9F.
 *
 *     node scripts/prova_dupla_escrita.js
 *
 * A Fase 9 manteve DOIS caminhos vivos de propósito, e esta prova media se os
 * dois diziam a mesma coisa. A Fase 9G-2 cortou a SUBIDA legada: o aplicativo
 * já não publica toque nenhum, então metade do que ela comparava deixou de ter
 * o outro lado.
 *
 * O QUE ELA MEDE AGORA, e continua sendo a fronteira entre caminhos:
 *   · o instante de uma decisão é UM só — o do aparelho e o da linha online;
 *   · receber do Supabase não escreve de volta (o laço que não pode existir);
 *   · receber do `estado.json` — a DESCIDA, que fica até a 9G-3 — não escreve
 *     online: é a fronteira que ainda tem dois lados;
 *   · o pipeline continua sendo o segundo escritor real, e a fronteira do
 *     `prova: "estrela"` continua antes da escrita;
 *   · o registro continua append-only, e a chave continua unindo as descidas.
 *
 * O QUE ELA NÃO É. Não é mais uma bateria de testes de unidade: o
 * `teste_sync.js` prova cada domínio por dentro. Esta prova olha para a
 * FRONTEIRA entre os dois caminhos, e só para ela, com um critério por vez.
 *
 * O HARNESS É O MESMO do teste_sync.js, importado e não copiado: um segundo
 * Supabase de mentira seria um segundo servidor a manter de acordo com o
 * Postgres, e no dia em que divergissem esta prova mediria o falso.
 *
 * A ESTRUTURA (estrutura_proj, estrutura_sub) NÃO ENTRA. Ela não foi
 * conectada, e deliberadamente: depende do merge de três vias e da
 * cron_estrutura_base. Provar coerência de quem não escreve seria provar o
 * vazio. Ver o README, "Fase 9E".
 */
const fs = require("fs");
const path = require("path");
const {criarServidor, criarAparelho, RAIZ} = require("./teste_sync.js");

let falhas = [];
function ok(cond, nome, detalhe) {
  console.log((cond ? "  COERENTE  " : "  DIVERGE   ") + nome +
    (!cond && detalhe !== undefined ? "  <- " + JSON.stringify(detalhe) : ""));
  if (!cond) falhas.push(nome);
}
function titulo(t) { console.log("\n" + t); }

/* CONTRAPARTE AUSENTE É DIVERGÊNCIA, E NÃO EXCEÇÃO.
 *
 * Uma prova que estoura ao não encontrar o que procurava não cumpre o próprio
 * contrato: o caso em que ela mais precisa falar — um caminho não escreveu o
 * que o outro escreveu — é justamente o que a derrubava com TypeError, sem
 * DIVERGE, sem veredicto e com o código de saída errado.
 *
 * Então toda contraparte esperada passa por aqui: a ausência vira uma linha
 * DIVERGE, e o que segue recebe um objeto vazio para que as asserções seguintes
 * também possam falar em vez de derrubar tudo. O `valor` e o `dados` já vêm
 * como objetos porque é neles que a prova entra em seguida.
 *
 * ISTO NÃO ENGOLE ERRO DE PROGRAMAÇÃO. Só a ausência da contraparte é tratada;
 * qualquer outra exceção continua subindo, e o `catch` do rodapé continua
 * imprimindo o erro e saindo com 1. */
const AUSENTE = Object.freeze({valor: Object.freeze({}), dados: Object.freeze({})});
function contraparte(v, nome, detalhe) {
  ok(!!v, nome, detalhe);
  return v || AUSENTE;
}

/* A peça de trilho de que quase toda seção depende. Se o entrada.json mudar e
   ela sumir, a prova diz isso numa linha em vez de estourar em dez. */
function pecaDeTrilho(X) {
  const pr = (X.getProjs("pipeline") || [])[0];
  if (pr && pr.subs && pr.subs[0]) return pr;
  /* Só fala quando falta: uma linha por seção dizendo que está tudo bem seria
     ruído em oito lugares. */
  ok(false, "há uma peça de trilho com subitem para exercitar");
  return {id: "sem-peca", subs: [{id: "sem-sub"}]};
}

/* ---- Localizadores: onde cada caminho guarda a mesma decisão ---- */
const linhaDe = (srv, dominio, chave) =>
  srv.linhas.find(l => l.dominio === dominio && l.chave === chave);
async function principal() {

/* ============================================================
   1. UMA DECISÃO, UM INSTANTE — NO APARELHO E ONLINE.
   ============================================================
   Até a 9G-2 o critério comparava os dois caminhos do aplicativo. Cortada a
   subida legada, o outro lado passou a ser a CÓPIA DO APARELHO — que é a que
   decide o LWW local. Se ela discordar da linha online, o aparelho e o servidor
   passam a ter opiniões diferentes sobre quando aquilo aconteceu, que é
   exatamente o defeito que a 9E mediu e corrigiu.

   Cada domínio é dirigido pela ação de verdade — a que a tela chama —, e não
   pelo funil por dentro. */
titulo("=== 1. Uma decisão humana, um instante só ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();

  /* --- item: a etapa de trilho --- */
  const pr = pecaDeTrilho(A);
  A.marcarSub("pipeline", pr.id, pr.subs[0].id, 2);
  await A.SYNC.drenarFila();
  const chaveItem = "pipeline/" + pr.id + "/" + pr.subs[0].id;
  const lItem = contraparte(linhaDe(srv, "item", chaveItem),
                            "item        · há linha online para a decisão", chaveItem);
  let noAparelho = null;
  (A.getProjs("pipeline") || []).forEach(p => { if (p.id === pr.id)
    (p.subs || []).forEach(x => { if (x.id === pr.subs[0].id) noAparelho = x; }); });
  noAparelho = contraparte(noAparelho, "item        · o subitem existe no aparelho");
  ok(noAparelho.em === lItem.em, "item        · o mesmo ISO no aparelho e online",
     {aparelho: noAparelho.em, online: lItem.em});
  ok(lItem.valor.st === noAparelho.st, "item        · e o mesmo st",
     {aparelho: noAparelho.st, online: lItem.valor.st});

  /* --- triagem --- */
  A.vgMarcar("philjobs-9f", A.VG_ST.SIM);
  await A.SYNC.drenarFila();
  const lTri = contraparte(linhaDe(srv, "triagem", "philjobs-9f"),
                           "triagem     · há linha online para a decisão");
  const tTri = contraparte(A.vgTriagem()["philjobs-9f"],
                           "triagem     · e a vaga está marcada no aparelho");
  ok(lTri.em === tTri.em, "triagem     · o mesmo ISO no aparelho e online",
     {aparelho: tTri.em, online: lTri.em});
  ok(lTri.valor.st === tTri.st, "triagem     · e o mesmo st");

  /* --- meta --- */
  A.addMeta();
  const metas = A.getMetas();
  A.editMeta(metas.length - 1, "Terminar o capítulo sobre Spinoza");
  await A.SYNC.drenarFila();
  const meta = contraparte(A.getMetas()[A.getMetas().length - 1],
                           "meta        · a meta existe no aparelho");
  const lMeta = contraparte(srv.linhas.find(l => l.dominio === "meta"),
                            "meta        · há linha online para a decisão");
  ok(lMeta.em === meta.em, "meta        · o mesmo ISO no aparelho e online",
     {aparelho: meta.em, online: lMeta.em});
  ok(/^\d{4}-\d{2}\/.+/.test(lMeta.chave) && lMeta.chave.indexOf(meta.id) > 0,
     "meta        · e a chave é AAAA-MM/id", lMeta.chave);

  /* --- evento --- */
  A.addEv();
  const evs = A.getEventos();
  const eid = contraparte(evs[evs.length - 1], "evento      · o evento existe no aparelho").id;
  A.editEv(eid, "Defesa na UFRJ");
  await A.SYNC.drenarFila();
  const lEv = contraparte(linhaDe(srv, "evento", eid),
                          "evento      · há linha online para a decisão", eid);
  const evAp = contraparte(A.getEventos().filter(e => e.id === eid)[0],
                           "evento      · e ele continua no aparelho");
  ok(lEv.em === evAp.em, "evento      · o mesmo ISO no aparelho e online",
     {aparelho: evAp.em, online: lEv.em});

  /* --- prioridade --- */
  A.__prompt = "Reler a Ética II";
  A.addPrioridadeLivre();
  await A.SYNC.drenarFila();
  const p = contraparte(A.getPrio()[A.getPrio().length - 1],
                        "prioridade  · a prioridade existe no aparelho");
  const lPrio = contraparte(srv.linhas.find(l => l.dominio === "prioridade"),
                            "prioridade  · há linha online para a decisão");
  ok(lPrio.em === p.em, "prioridade  · o mesmo ISO no aparelho e online",
     {aparelho: p.em, online: lPrio.em});
  ok(/^\d{4}-W\d{2}\/.+/.test(lPrio.chave) && lPrio.chave.indexOf(p.id) > 0,
     "prioridade  · e a chave é AAAA-Wnn/id", lPrio.chave);

  /* --- retomada --- */
  A.adiarRetomada("pipeline", pr.id);
  await A.SYNC.drenarFila();
  const lRet = contraparte(linhaDe(srv, "retomada", "pipeline/" + pr.id),
                           "retomada    · há linha online para a decisão");
  const retAp = contraparte((A.LS("cron:retomadas-adiadas", {}) || {})["pipeline/" + pr.id],
                            "retomada    · e o silêncio está no aparelho");
  ok(lRet.em === retAp.em, "retomada    · o mesmo ISO no aparelho e online",
     {aparelho: retAp.em, online: lRet.em});
  ok(lRet.valor.ate === retAp.ate, "retomada    · e a mesma data absoluta");

  /* --- toefl --- */
  const iid = A.TOEFL_GUIA[A.TOEFL_FASES[0]].itens[0].id;
  A.marcarGuia(iid, true);
  await A.SYNC.drenarFila();
  const lTo = contraparte(linhaDe(srv, "toefl", iid),
                          "toefl       · há linha online para a decisão", iid);
  const toAp = contraparte((A.LS("cron:toefl-guia", {}) || {})[iid],
                           "toefl       · e a marca está no aparelho");
  ok(lTo.em === toAp.em, "toefl       · o mesmo ISO no aparelho e online",
     {aparelho: toAp.em, online: lTo.em});

  /* --- registro: a tabela própria, chaveada pelo id do toque --- */
  const reg = contraparte(srv.registros.find(r => r.sub_id === pr.subs[0].id),
                          "registro    · há linha no cron_registro para a decisão");
  ok(reg.id.indexOf(noAparelho.em.replace(/[:.]/g, "-")) === 0,
     "registro    · e a chave dela carrega o MESMO instante da decisão",
     {chave: reg.id, em: noAparelho.em});

  /* --- rotina e dispensa: sobem, e nunca tiveram outro caminho --- */
  A.toggleCheck("seg-min");
  A.dispensarAtrasada("2026-09-08", "ter-art");
  await A.SYNC.drenarFila();
  ok(!!linhaDe(srv, "rotina", A.dateKey + "/seg-min"), "rotina      · sobe online");
  ok(!!linhaDe(srv, "dispensa", "rotina/2026-09-08/ter-art"), "dispensa    · sobe online");
}

/* ============================================================
   2 e 3. RECEBER NÃO É TOCAR — nos dois sentidos.
   ============================================================
   O laço que esta prova existe para excluir: aplicar estado de um caminho e,
   com isso, escrever no outro. Se acontecesse, cada carregamento republicaria
   tudo, para sempre, e os dois caminhos se alimentariam um do outro. */
titulo("=== 2. O que desce do Supabase não vira toque ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();

  const pr = pecaDeTrilho(A);
  A.marcarSub("pipeline", pr.id, pr.subs[0].id, 2);
  A.vgMarcar("philjobs-9f", A.VG_ST.NAO);
  A.adiarRetomada("pipeline", pr.id);
  A.toggleCheck("seg-min");
  A.marcarGuia(A.TOEFL_GUIA[A.TOEFL_FASES[0]].itens[0].id, true);
  const antesFila = B.SYNC.situacao().fila;
  const antesEscritas = srv.escritas;
  await A.SYNC.drenarFila();

  ok(B.SYNC.situacao().fila === antesFila,
     "cinco domínios desceram e o celular NÃO enfileirou nada de volta",
     B.SYNC.situacao().fila - antesFila);
  const escritasDoMac = srv.escritas - antesEscritas;
  await B.SYNC.drenarFila();
  ok(srv.escritas - antesEscritas === escritasDoMac,
     "e nada mais foi escrito no servidor: o eco não virou laço",
     srv.escritas - antesEscritas - escritasDoMac);
}

titulo("=== 3. O que desce do estado.json não vira escrita online ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const antesEscritas = srv.escritas, antesFila = A.SYNC.situacao().fila;

  /* O estado.json de um OUTRO aparelho, aplicado pelos mesmos aplicadores que
     o buscarEstado usa. É o caminho legado inteiro, menos a rede. */
  const pr = pecaDeTrilho(A);
  const est = {
    itens: {}, triagem: {}, metas: {}, eventos: {}, prioridades: {},
    toefl: {}, retomadas: {}
  };
  est.itens["pipeline/" + pr.id + "/" + pr.subs[0].id] =
    {quando: "2027-01-01T00:00:00.000Z", st: 2, vida: "ativo", temMotivo: false};
  est.triagem["philjobs-9f"] = {quando: "2027-01-01T00:00:00.000Z", st: 1};
  est.toefl[A.TOEFL_GUIA[A.TOEFL_FASES[0]].itens[0].id] =
    {quando: "2027-01-01T00:00:00.000Z", feito: true};

  ok(A.aplicarTriagemDoEstado(est) === true, "a triagem do estado.json foi aplicada");
  ok(A.aplicarToeflDoEstado(est) === true, "e o guia do TOEFL também");
  ok(srv.escritas === antesEscritas,
     "e NADA foi escrito no Supabase por receber estado legado",
     srv.escritas - antesEscritas);
  ok(A.SYNC.situacao().fila === antesFila,
     "nem entrou na fila para subir depois", A.SYNC.situacao().fila - antesFila);
  ok(A.SYNC.situacao().fila === 0, "e nenhum toque foi gerado");
}

/* ============================================================
   4 e 5. O LWW É DETERMINÍSTICO, E A ORDEM DE CHEGADA NÃO MANDA.
   ============================================================
   O caso que dói: a alteração feita às 9h sem rede, drenada às 18h, não pode
   vencer a alteração legítima das 17h. É por isso que o relógio é do APARELHO
   e não do servidor — e é isto que a prova mede, com os dois caminhos
   representando alterações diferentes do MESMO item. */
titulo("=== 4. Dois caminhos, alterações diferentes do mesmo item ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const pr = pecaDeTrilho(A);
  const subId = pr.subs[0].id;
  const acha = () => {
    let x = null;
    (A.getProjs("pipeline") || []).forEach(p => { if (p.id === pr.id)
      (p.subs || []).forEach(s => { if (s.id === subId) x = s; }); });
    return x || AUSENTE;      /* ausência é divergência mais abaixo, não estouro */
  };

  /* O aparelho decide st=1 agora. */
  A.marcarSub("pipeline", pr.id, subId, 1);
  const meuEm = acha().em;
  ok(acha().st === 1, "o aparelho decidiu st=1");

  /* O caminho legado traz st=2, MAIS NOVO. */
  const est = {itens: {}};
  est.itens["pipeline/" + pr.id + "/" + subId] =
    {quando: "2099-01-01T00:00:00.000Z", st: 2, vida: "ativo", temMotivo: false};
  const projs = A.getProjs("pipeline");
  let x = null;
  projs.forEach(p => { if (p.id === pr.id)
    (p.subs || []).forEach(s => { if (s.id === subId) x = s; }); });
  ok(A.mesclarItem(x, {quando: est.itens["pipeline/" + pr.id + "/" + subId].quando,
                       st: 2, vida: "ativo", motivo: ""}) === true,
     "o legado mais novo entra");
  /* O merge MUTA e quem chama grava — é o contrato dele, e é o que a descida
     do estado.json faz com setProjs. Sem gravar, o próximo `acha()` releria o
     armazenamento e a prova mediria a si mesma. */
  A.setProjs("pipeline", projs);
  ok(acha().st === 2, "e o st gravado passa a 2", acha().st);

  /* Agora o ONLINE traz st=0, mais VELHO que os dois. Nada acontece. */
  const rOnline = A.aplicarItemOnline({
    chave: "pipeline/" + pr.id + "/" + subId,
    em: meuEm, valor: {st: 0, vida: "ativo", motivo: ""}});
  ok(rOnline.length === 0, "e o online mais velho é recusado, chegando depois", rOnline);
  ok(acha().st === 2, "o st mais novo permanece — a ordem de chegada não manda", acha().st);

  /* Os dois caminhos, dado o MESMO instante, decidem o MESMO: é a definição
     de determinismo aqui, e por isso a regra mora numa implementação só. */
  const a = {em: "2026-01-01T00:00:00.000Z", st: 0};
  const b = {em: "2026-01-01T00:00:00.000Z", st: 0};
  const r = {quando: "2026-06-01T00:00:00.000Z", st: 2, vida: "ativo", motivo: ""};
  ok(A.mesclarItem(a, r) === A.mesclarItem(b, r) && a.st === b.st && a.em === b.em,
     "o mesmo merge, chamado pelos dois caminhos, produz o mesmo resultado");
  ok(A.mesclarItem(a, {quando: a.em, st: 9}) === false,
     "e o empate exato fica como está, nos dois");
}

titulo("=== 5. A decisão de 9h, drenada às 18h, não vence a das 17h ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();

  /* 9h: o Mac decide SEM REDE. A fila guarda. */
  srv.falhar = true;
  A.__congelar(Date.UTC(2026, 8, 9, 9, 0, 0));
  A.vgMarcar("philjobs-9f", A.VG_ST.SIM);
  A.__descongelar();
  await A.SYNC.drenarFila();
  ok(A.SYNC.situacao().fila === 1, "9h: a decisão do Mac ficou na fila, sem rede");

  /* 17h: o celular decide outra coisa, com rede. */
  srv.falhar = false;
  B.__congelar(Date.UTC(2026, 8, 9, 17, 0, 0));
  B.vgMarcar("philjobs-9f", B.VG_ST.NAO);
  B.__descongelar();
  await B.SYNC.drenarFila();
  const das17 = contraparte(linhaDe(srv, "triagem", "philjobs-9f"),
                            "17h: há linha online da decisão do celular");
  ok(das17.valor.st === B.VG_ST.NAO, "17h: a decisão do celular está no servidor", das17.valor);

  /* 18h: a rede volta e o Mac drena a decisão das 9h. */
  await A.SYNC.reconectar(true);
  const depois = contraparte(linhaDe(srv, "triagem", "philjobs-9f"),
                             "18h: a linha continua no servidor");
  ok(depois.valor.st === B.VG_ST.NAO,
     "18h: a decisão de 9h NÃO venceu a das 17h", depois.valor);
  ok(depois.em === das17.em, "o servidor guarda o instante das 17h", depois.em);
  ok(srv.recusados >= 1, "e o gatilho do relógio recusou a mais velha", srv.recusados);
  ok(A.SYNC.situacao().fila === 0,
     "a fila do Mac esvaziou mesmo assim: perder por ser mais velha não é falha");
  ok(contraparte(A.vgTriagem()["philjobs-9f"],
                 "o Mac tem a vaga na triagem").st === B.VG_ST.NAO,
     "e o Mac já mostra a decisão das 17h", A.vgTriagem()["philjobs-9f"]);
}

/* ============================================================
   6 e 7. CADA DOMÍNIO CARREGA O QUE É DELE, E NADA MAIS.
   ============================================================ */
titulo("=== 6. O toefl é booleano, e não transporta estrutura nem texto ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const g = A.TOEFL_GUIA[A.TOEFL_FASES[0]];
  const it = g.itens[0];
  A.marcarGuia(it.id, true);
  await A.SYNC.drenarFila();

  const l = contraparte(linhaDe(srv, "toefl", it.id),
                        "há linha online para o item do guia", it.id);
  ok(JSON.stringify(Object.keys(l.valor)) === JSON.stringify(["feito"]),
     "o valor online tem UM campo: `feito`", Object.keys(l.valor));
  ok(typeof l.valor.feito === "boolean", "e ele é booleano", typeof l.valor.feito);
  const texto = JSON.stringify(l.valor) + "|" +
                JSON.stringify((A.LS("cron:toefl-guia", {}) || {})[it.id] || {});
  ok(it.t === undefined || texto.indexOf(it.t) < 0,
     "o texto do item do guia NÃO viaja, e nem fica guardado com a marca", texto);
  ok(l.chave === it.id, "a chave é o id do item, e a estrutura do guia é do código",
     l.chave);

  /* Desmarcar viaja; ausência não é false. */
  A.marcarGuia(it.id, false);
  await A.SYNC.drenarFila();
  ok(contraparte(linhaDe(srv, "toefl", it.id),
                 "a linha do guia continua no servidor").valor.feito === false,
     "desmarcar viaja como estado");
  ok(A.mesclarToefl({}, "nunca-visto", {quando: "", feito: true}) === false,
     "e ausência é `nunca decidido`, não `false`");
}

titulo("=== 7. O item é progresso, e progresso não cria estrutura ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const pr = pecaDeTrilho(A);
  A.marcarSub("pipeline", pr.id, pr.subs[0].id, 2);
  await A.SYNC.drenarFila();

  const l = contraparte(linhaDe(srv, "item", "pipeline/" + pr.id + "/" + pr.subs[0].id),
                        "há linha online para o progresso");
  const campos = Object.keys(l.valor).sort();
  ok(JSON.stringify(campos) === JSON.stringify(["motivo", "st", "vida", "vidaDesde", "voltar_em"]),
     "o valor do item é só progresso e ciclo de vida", campos);
  ok(!("t" in l.valor) && !("subT" in l.valor) && !("subs" in l.valor),
     "nenhum título, nenhum filho: estrutura não viaja por aqui", Object.keys(l.valor));

  /* Progresso de peça desconhecida não pousa, e não inventa a peça. */
  const antes = JSON.stringify(A.getProjs("pipeline"));
  ok(A.aplicarItemOnline({chave: "pipeline/inexistente/x1",
                          em: "2099-01-01T00:00:00.000Z", valor: {st: 2}}).length === 0,
     "progresso de peça que este aparelho não conhece não é aplicado");
  ok(JSON.stringify(A.getProjs("pipeline")) === antes,
     "e o painel fica exatamente como estava");

  /* E a estrutura continua sem escritor online, como a 9E documentou. */
  const render = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "30-render.js"), "utf8");
  const nucleo = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "10-nucleo.js"), "utf8");
  const regras = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "20-regras.js"), "utf8");
  ok(!/salvarAlteracao\(\s*"estrutura_/.test(render + nucleo + regras),
     "e estrutura_proj/estrutura_sub seguem sem escritor: fora do escopo da 9F");
}

/* ============================================================
   8 e 9. O SEGUNDO ESCRITOR REAL, E A FRONTEIRA DELE.
   ============================================================ */
titulo("=== 8. O pipeline escreve nos dois caminhos, e não vira espelho ===");
{
  const pipe = fs.readFileSync(path.join(RAIZ, "scripts", "dobrar_toques.py"), "utf8");
  ok(/"aparelho": "cowork"/.test(pipe),
     "o --registrar escreve um toque com aparelho `cowork`");
  ok(/"tipo": "registro"/.test(pipe),
     "do tipo `registro` — a mesma porta por onde o iPhone entra");
  ok(/DIR_TOQUES/.test(pipe) && /json\.dump/.test(pipe),
     "e o destino é um arquivo de toque, como o de qualquer aparelho");

  /* A 9G-0 deu ao pipeline o caminho online que faltava. O critério não é mais
     "ele não fala com o Supabase" — é que, falando, ele continue afirmando um
     FATO SEU e não espelhando estado alheio. */
  ok(/def publicar_online/.test(pipe),
     "e desde a 9G-0 publica o MESMO toque também no estado compartilhado");
  const corpo = pipe.split("def publicar_online")[1].split("\ndef ")[0];
  ok(/toque\["quando"\]/.test(corpo),
     "com o `em` do próprio toque, e não um instante novo");
  ok(/toque\["id"\]/.test(corpo),
     "e com o id do próprio toque como chave do registro");
  ok(/"dominio": "item"/.test(corpo) && !/estrutura_/.test(corpo),
     "publica `item` e NUNCA estrutura: a separação do esquema é respeitada");
  const dominios = (corpo.match(/"dominio": "(\w+)"/g) || []).map(x => x.match(/"(\w+)"$/)[1]);
  ok(JSON.stringify(dominios) === JSON.stringify(["item"]),
     "e um domínio só, o dele: não é espelho de estado", dominios);
  ok(/aparelho": "cowork"/.test(corpo),
     "assinando como `cowork` também online — um aparelho, não uma autoridade");

  /* O toque é o artefato durável: publicar vem DEPOIS de gravar, e falhar em
     publicar não pode custar o toque. */
  /* A ordem que importa é a da rodada de verdade. O `--seco` também chama o
     publicador, antes — mas para dizer que não publicou nada, e ele retorna
     sem escrever arquivo nenhum. Medir a primeira ocorrência mediria isso. */
  const reg = pipe.split("def registrar(")[1];
  const daRodadaReal = reg.split("os.makedirs(DIR_TOQUES")[1] || "";
  ok(daRodadaReal.indexOf("json.dump") >= 0 &&
     daRodadaReal.indexOf("json.dump") < daRodadaReal.indexOf("publicar_online"),
     "na rodada de verdade, grava o arquivo de toque ANTES de tentar publicar");
  ok(/if seco:[\s\S]{0,220}return 0/.test(reg),
     "e o --seco sai antes de escrever qualquer coisa");
  ok(/except Exception as e:[\s\S]{0,200}nao publicado online/.test(reg),
     "e uma rede fora não custa o toque: diz o que não fez e segue");

  /* Nenhum segredo no repositório: só leitura do ambiente. */
  ok(/os\.environ\.get\(API_URL\)/.test(pipe) && /os\.environ\.get\(API_CHAVE\)/.test(pipe),
     "as credenciais vêm do ambiente, e só de lá");
  ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(pipe) && !/service_role"\s*:/.test(pipe),
     "e nenhuma chave está gravada no arquivo");

  /* E o caminho legado continua inteiro no aplicativo, que é o outro lado da
     dupla escrita: se ele saísse agora, o pipeline ficaria sem interlocutor. */
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  /* 9G-2: o aplicativo já não ESCREVE no GitHub; a leitura fica até a 9G-3. */
  ok(typeof A.buscarEstado === "function",
     "e o aplicativo continua LENDO o estado.json — a descida sai na 9G-3");
  ok(typeof A.enviarToques === "undefined" && typeof A.gravarNoGitHub === "undefined",
     "mas não escreve mais nada lá: a subida saiu na 9G-2");
}

titulo("=== 9. A fronteira do pipeline: prova `estrela` continua dele ===");
{
  const pipe = fs.readFileSync(path.join(RAIZ, "scripts", "dobrar_toques.py"), "utf8");
  ok(/prova == "estrela" and not forcar/.test(pipe),
     "o --registrar RECUSA subitem de prova `estrela`");
  ok(/return 1/.test(pipe.split('prova == "estrela"')[1].slice(0, 600)),
     "e sai sem escrever nada quando recusa");
  ok(/decisao do autor/.test(pipe),
     "dizendo por quê: a conclusão é decisão do autor, não artefato");
  ok(/--forcar/.test(pipe),
     "e a exceção é explícita, e não um caminho silencioso");

  /* O PONTO DA 9F AQUI: a fronteira está ANTES da escrita, e a 9E não a moveu
     para o desempate. O merge é o mesmo para todo mundo — é a recusa a priori
     que protege a decisão do autor, e não uma regra de quem vence. */
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const nucleo = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "10-nucleo.js"), "utf8");
  const corpo = nucleo.split("function mesclarItem(")[1].split("\n}")[0];
  ok(!/estrela|prova|cowork/.test(corpo),
     "o merge do item não conhece `estrela`, `prova` nem `cowork`", corpo.length);
  const x = {st: 0, em: "2026-01-01T00:00:00.000Z"};
  ok(A.mesclarItem(x, {quando: "2027-01-01T00:00:00.000Z", st: 2}) === true,
     "ele trata toda origem igual — a proteção não mora aqui");
}

/* ============================================================
   10. O REGISTRO NÃO É LWW, E POR ISSO É PROVADO À PARTE.
   ============================================================ */
titulo("=== 10. O registro é append-only, e a chave une os dois caminhos ===");
{
  const srv = criarServidor();
  const A = criarAparelho("mac", srv).__conectar();
  const B = criarAparelho("celular", srv).__conectar();
  await B.SYNC.assinarMudancas();
  const pr = pecaDeTrilho(A);

  A.marcarSub("pipeline", pr.id, pr.subs[0].id, 2);
  await A.SYNC.drenarFila();
  A.marcarSub("pipeline", pr.id, pr.subs[0].id, 1);   /* o recuo */
  await A.SYNC.drenarFila();

  ok(srv.registros.length === 2,
     "fechar e recuar são DOIS fatos, e os dois ficam", srv.registros.length);
  ok(srv.registros.every(r => "d" in r && !("em" in r) && !("del" in r)),
     "sem relógio e sem lápide: histórico não tem versão", Object.keys(srv.registros[0]));
  ok(B.getReg().length === 2, "e as duas chegaram ao celular");

  /* A ponte com o caminho legado: o id da linha É o id do toque, então o
     estado.json não a duplica quando trouxer o mesmo toque. */
  const ids = srv.registros.map(r => r.id).sort();
  ok(ids.every(id => /^\d{4}-\d{2}-\d{2}T[\d-]+Z-mac$/.test(id)),
     "os ids online continuam no formato do id do toque (ISO + aparelho)", ids);
  const vistos = {};
  B.getReg().forEach(o => { if (o && o.tid) vistos[o.tid] = true; });
  ok(ids.every(id => vistos[id] === true),
     "e o critério de deduplicação do estado.json já as reconhece");

  /* Reler não duplica — que é o que substitui o LWW aqui. */
  const antes = B.getReg().length;
  await B.SYNC.buscarDeltaRegistro();
  srv.registros.forEach(r => B.aplicarRegistroOnline(r));
  ok(B.getReg().length === antes,
     "reler o histórico inteiro não cria uma linha a mais", B.getReg().length - antes);

  /* E o LWW não se aplica: uma linha "mais velha" não é recusada por ser
     velha, é aceita por ser outra. */
  const nova = {id: "2020-01-01T00-00-00-000Z-tablet", d: "2020-01-01",
                pid: "pipeline", proj_id: pr.id, sub_id: pr.subs[0].id,
                proj_t: "", sub_t: "", de: null, para: 2, vida: "ativo",
                motivo: "", aparelho: "tablet"};
  ok(B.aplicarRegistroOnline(nova).length > 0,
     "uma linha de 2020 entra depois das de hoje — não há `mais novo vence`");
  ok(B.getReg().length === antes + 1 && B.getReg()[0].d === "2020-01-01",
     "e entra no lugar certo, pela data de origem", B.getReg().map(o => o.d));
}

console.log("\n==============================================================");
console.log(falhas.length
  ? "A FRONTEIRA DIVERGE EM " + falhas.length + " PONTO(S)"
  : "FRONTEIRA COERENTE — aparelho, online e pipeline dizem o mesmo");
falhas.forEach(f => console.log("  - " + f));
process.exit(falhas.length ? 1 : 0);
}

principal().catch(e => { console.error(e); process.exit(1); });
