/* CRONOGRAMA — 40-app.js
   Bootstrap: as migracoes de abertura, as sementes, os primeiros desenhos e a
   busca da entrada e do estado, mais os ouvintes de online e visibilitychange.

   E o unico arquivo com codigo executavel de topo, e carrega por ultimo. */
(function pullToRefresh(){
  let startY=null, armed=false;
  const ptr=document.getElementById("ptr");
  /* ARRASTAR SOBRE UM CONTROLE NAO E PUXAR A PAGINA. Sem esta guarda, deslizar
     o dedo sobre "Vou me candidatar" na aba Vagas — com a lista no topo e mais
     de 70px para baixo — armava o gesto e o touchend fazia location.replace: a
     pagina recarregava, e como view-hoje e o unico painel sem `hidden`, o app
     reabria no Hoje. Pior: a vaga nem chegava a ser marcada, porque o arrasto
     nao vira clique. Era exatamente o "as vezes ele volta para o Hoje".

     O gesto de atualizar continua inteiro na area livre da tela; ele so deixa
     de nascer em cima de algo que existe para ser tocado. */
  window.addEventListener("touchstart",e=>{
    var emControle = e.target && e.target.closest &&
                     e.target.closest("button, a, select, input, textarea, [contenteditable]");
    startY = (!emControle && window.scrollY<=0)? e.touches[0].clientY : null;
  },{passive:true});
  window.addEventListener("touchmove",e=>{
    if(startY===null || window.scrollY>0){return;}
    const dy=e.touches[0].clientY-startY;
    if(dy>70){ ptr.classList.add("show"); ptr.textContent="Solte para atualizar"; armed=true; }
    else{ ptr.classList.remove("show"); armed=false; }
  },{passive:true});
  window.addEventListener("touchend",()=>{
    if(armed){ ptr.textContent="Atualizando…"; location.replace(baseUrl()+"?v="+Date.now()); }
    startY=null; armed=false;
  });
})();
/* Fase 8: o service worker existe so para receber o push. Ele NAO tem ouvinte
   de fetch, entao nao intercepta o entrada.json — a unica coisa que a pagina
   ainda busca no repositorio — nem as chamadas do Supabase. */
try{
  if(avisosConfigurados()) registrarServiceWorker();
  var _btnAvisos = document.getElementById("btn-avisos");
  if(_btnAvisos) _btnAvisos.addEventListener("click", alternarAvisos);
  renderAvisos();
}catch(e){ console.error("avisos:", e); }
renderBackupAviso();
/* O GITHUB SAIU DOS DOIS LADOS. A subida legada foi na 9G-2 — o `enviarToques`
   e os quatro ouvintes que o chamavam (abrir, `online`, `visibilitychange`,
   `pagehide`) —, e a descida na 9G-3: o `buscarEstado`, os `aplicar*DoEstado` e
   a leitura do estado.json. Cada decisao sobe e desce pelo SYNC, que tem a
   propria fila e os proprios ouvintes. O que continua vindo do repositorio e a
   ESTRUTURA, pelo entrada.json, logo abaixo. */
try{ migrarTriagemUmaVez(); }catch(e){ console.error("migracao da triagem falhou:", e); }
document.getElementById("ver").textContent = "v"+APP_VERSION;
/* Migração do esquema v1 -> v2. Roda UMA vez, antes das sementes e de
   qualquer render. Nada é descartado: ver migrarEsquema(). */
try{ migrarEsquema(); }catch(e){ console.error("migração do esquema falhou:", e); }
/* Fase 9G-0 B2: a gaveta antiga vira `vida=arquivado` no proprio painel, uma
   vez por aparelho. Antes do mesclarEntrada, para que a entrada ja encontre as
   pecas arquivadas no lugar e nao as recrie como novas. */
try{
  var _arq = migrarArquivo();
  if(_arq.travados && _arq.travados.length)
    console.error("cron:arquivo NAO migrado: " + _arq.travados.length +
                  " entrada(s) sem projeto-pai. A gaveta ficou intacta.", _arq.travados);
}catch(e){ console.error("migracao do arquivo falhou:", e); }
try{ mesclarEntrada(); }catch(e){ console.error("mesclagem da entrada falhou:", e); }
/* Antes de qualquer descida: o aparelho precisa falar por `id` para que o
   estado compartilhado possa responder por `id`. */
try{ migrarGuiaToefl(); }catch(e){ console.error("migracao do guia TOEFL falhou:", e); }
try{ migrarRetomadas(); }catch(e){ console.error("migracao das retomadas falhou:", e); }
/* Esta nao publica toque — so muda a conclusao da prioridade de gaveta, do
   cron:checks do dia para a propria prioridade. Ver PRIO_MIGRADO_KEY. */
try{ migrarPrioridadesFeitas(); }catch(e){ console.error("migracao das prioridades falhou:", e); }
/* Seed do bloco de projetos por MESCLAGEM (não destrutiva).
   Acrescenta projetos e subtarefas novos sem apagar o estado já marcado. */
if(LS("cron:tecnico-seed", null) !== TEC_SEED){
  let atual = getTec().filter(function(p){return p.id !== "p5" && p.id !== "p6";});
  const base = JSON.parse(JSON.stringify(TECNICO_DEFAULT));
  base.forEach(function(pNovo){
    const pAtual = atual.find(function(p){return p.id === pNovo.id;});
    if(!pAtual){ atual.push(pNovo); return; }
    pNovo.subs.forEach(function(sNovo){
      if(!pAtual.subs.find(function(s){return s.id === sNovo.id;})) pAtual.subs.push(sNovo);
    });
  });
  setTec(atual);
  save("cron:tecnico-seed", TEC_SEED);
}
/* Seed das entregas mensais.
   Acrescenta por id ausente (n\u00e3o pula o m\u00eas inteiro) e remove o roteiro antigo,
   que fatiava o ensaio Berggruen em v\u00e1rios meses. */
if(LS("cron:metas-seed", null) !== METAS_SEED){
  Object.keys(ROTEIRO).forEach(function(k){
    var atual = LS("cron:metas:"+k, []).filter(function(m){
      return String(m.id).indexOf("seed-") !== 0;   // limpa o seed antigo, preserva o que voc\u00ea escreveu
    });
    ROTEIRO[k].forEach(function(t,i){
      var id = "art-"+k+"-"+i;
      if(!atual.some(function(m){return m.id===id;})) atual.push({id:id, t:t, done:false});
    });
    save("cron:metas:"+k, atual);
  });
  save("cron:metas-seed", METAS_SEED);
}
renderOrdo(); renderHoje(); renderSemana(); renderTrilhos();
checkUpdate();

/* ---- Entrada: o Cowork escreve, a pagina mescla ----
   O mesclarEntrada() existe desde o Passo 2 e nunca teve quem o alimentasse.
   Este e o alimentador: um arquivo no repositorio, escrito pelo Cowork a partir
   do que o pipeline produziu, com a ESTRUTURA das pecas — quais artigos, quais
   subitens, e os titulos.

   A divisao de trabalho e a de sempre: a ENTRADA manda na estrutura, o TOQUE
   manda no progresso. Por isso o mesclarEntrada() nao encosta em st nem em vida
   de subitem que ja existe. Projeto NOVO entra inteiro, com os estados que
   vierem nele — e assim que uma peca nasce ja marcada.

   Sem rede nao acontece nada: o que ja foi mesclado continua valendo. */
try{
  buscarEntrada();
  window.addEventListener("online", function(){ buscarEntrada(); });
  /* Voltar para a aba pede a VERSAO, e so ela. Ate a 9G-3 este ouvinte tambem
     chamava o buscarEstado(): o progresso descia do estado.json e uma aba
     aberta no bolso mostraria o que era verdade quando foi aberta. Agora quem
     mantem o progresso em dia e o SYNC, que tem os proprios ouvintes e o
     proprio catch-up por delta — buscar aqui seria uma segunda descida com
     regra propria, que e exatamente o que a 9G veio desfazer.

     O checkUpdate FICA, e a trava de 20s com ele. Ele so rodava no boot, entao
     uma aba deixada aberta nunca ficava sabendo de uma versao nova. Foi
     exatamente assim que o Safari do Mac passou a tarde na sincronia2 depois
     da sincronia3 no ar: marcando vagas sem publicar nada, porque o codigo que
     publica estava na versao que ele nao tinha carregado. Uma correcao que so
     chega a quem recarrega e meia correcao. */
  document.addEventListener("visibilitychange", function(){
    if(document.visibilityState !== "visible") return;
    var agora = Date.now();
    if(agora - ULTIMA_BUSCA < 20000) return;
    ULTIMA_BUSCA = agora;
    try{ checkUpdate(); }catch(e){}
  });
}catch(e){ console.error("busca da entrada falhou:", e); }

/* ---- Fase 9A: a sincronia online, se este aparelho a tiver ligado ----
   ULTIMA LINHA DO BOOT, e de proposito: tudo acima ja rodou, entao um erro aqui
   nao pode deixar a pagina pela metade. E ela devolve na primeira linha quando
   cron:sync-ligado e falso, que e o padrao.

   DESDE A 9G ELA E A SINCRONIA, e nao mais uma segunda ao lado de outra: os
   ouvintes do GitHub sairam (subida na 9G-2, descida na 9G-3) e o que restou
   acima e o entrada.json, que traz ESTRUTURA e nao progresso. Um aparelho que
   nao entrou nao sincroniza — nao ha mais caminho de reserva por baixo. */
/* Fase 9B: as prioridades sao o primeiro dominio a usar a camada. O registro
   mora aqui, e nao dentro do 15-sync.js, porque a camada e infraestrutura e nao
   pode conhecer dominio nenhum — quem conhece os dois lados e o bootstrap. */
try{ SYNC.assinarDominio("prioridade", aplicarPrioridadeOnline); }
catch(e){ console.error("sincronia: dominio prioridade:", e); }
/* Fase 9C-2: as metas sao o segundo dominio. */
try{ SYNC.assinarDominio("meta", aplicarMetaOnline); }
catch(e){ console.error("sincronia: dominio meta:", e); }
/* Fase 9C-3: as datas importantes sao o terceiro. */
try{ SYNC.assinarDominio("evento", aplicarEventoOnline); }
catch(e){ console.error("sincronia: dominio evento:", e); }
/* Fase 9D (1 de 5): a triagem das vagas. Retomadas, registro, rotinas e
   dispensas continuam LEGADOS. */
try{ SYNC.assinarDominio("triagem", aplicarTriagemOnline); }
catch(e){ console.error("sincronia: dominio triagem:", e); }
/* Fase 9D (2 de 5): as retomadas silenciadas. Rotinas e dispensas continuam
   LEGADAS. */
try{ SYNC.assinarDominio("retomada", aplicarRetomadaOnline); }
catch(e){ console.error("sincronia: dominio retomada:", e); }
/* Fase 9D (3 de 5): o registro datado. NAO e assinarDominio, e nao por
   distracao: o registro nao mora em cron_estado — tem tabela propria, e a
   camada trata os dois caminhos separados porque as regras sao outras (nao ha
   relogio nem lapide para historico). Rotinas e dispensas continuam LEGADAS. */
try{ SYNC.assinarRegistro(aplicarRegistroOnline); }
catch(e){ console.error("sincronia: registro datado:", e); }
/* Fase 9D (4 de 5): as marcas de rotina do dia. Elas NUNCA atravessaram
   aparelho — nao havia caminho legado a preservar aqui, so um a estrear. */
try{ SYNC.assinarDominio("rotina", aplicarRotinaOnline); }
catch(e){ console.error("sincronia: dominio rotina:", e); }
/* Fase 9D (5 de 5): as dispensas de rotina atrasada. Fecha a 9D — e, como a
   rotina, estreia em vez de migrar: cron:hoje-dispensados tambem nunca
   atravessou aparelho. */
try{ SYNC.assinarDominio("dispensa", aplicarDispensaOnline); }
catch(e){ console.error("sincronia: dominio dispensa:", e); }
/* Fase 9E: os Trilhos. O `item` e o unico dominio com DOIS escritores reais —
   voce e o pipeline, pelo `--registrar` —, e a fronteira que os separa esta no
   dado e nao no desempate: o pipeline recusa subitem de prova "estrela". O
   `toefl` vem junto por ser progresso pela mesma regra. A ESTRUTURA
   (estrutura_proj, estrutura_sub) NAO entrou: ela depende do merge de tres vias
   e da cron_estrutura_base, que so o pipeline pode escrever. Ver o README. */
try{ SYNC.assinarDominio("item", aplicarItemOnline); }
catch(e){ console.error("sincronia: dominio item:", e); }
try{ SYNC.assinarDominio("toefl", aplicarToeflOnline); }
catch(e){ console.error("sincronia: dominio toefl:", e); }
try{ renderSincroniaOnline(); }catch(e){}
/* DEPOIS do iniciar(), e nao antes: a publicacao das decisoes anteriores ao
   corte precisa da sincronia LIGADA para ter onde escrever, e o iniciar() e
   quem estabelece a sessao. Rodando antes, ela devolveria na primeira linha e
   gravaria a trava sem ter publicado nada — o pior dos dois mundos. */
try{
  SYNC.iniciar().then(function(){
    try{ renderSincroniaOnline(); }catch(e){}
    try{
      var pub = publicarDecisoesAntigas();
      if(pub && (pub.triagem || pub.itens)){
        try{ renderVistaVagas(); }catch(e){}
        try{ renderProcessos(); }catch(e){}
      }
    }catch(e){ console.error("publicacao das decisoes antigas:", e); }
  });
}catch(e){ console.error("sincronia online:", e); }
