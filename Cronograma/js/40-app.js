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
renderBackupAviso();
renderSyncEstado();
renderToquesAviso();
/* Sobe sozinho ao abrir e quando a rede volta. Em silêncio: o toque foi feito,
   o envio é problema do app, não seu. */
try{ migrarTriagemUmaVez(); }catch(e){ console.error("migracao da triagem falhou:", e); }
try{
  enviarToques(true);
  window.addEventListener("online", function(){ enviarToques(true); });
  /* Sair da aba tambem envia. Quem marca e troca de app nao deixa a fila
     parada. E melhor esforco: se a rede cortar no meio, a fila fica intacta
     e sobe no proximo carregamento. */
  document.addEventListener("visibilitychange", function(){
    if(document.visibilityState === "hidden") enviarToques(true);
  });
  window.addEventListener("pagehide", function(){ enviarToques(true); });
}catch(e){ console.error("envio de toques falhou ao iniciar:", e); }
document.getElementById("ver").textContent = "v"+APP_VERSION;
/* Migração do esquema v1 -> v2. Roda UMA vez, antes das sementes e de
   qualquer render. Nada é descartado: ver migrarEsquema(). */
try{ migrarEsquema(); }catch(e){ console.error("migração do esquema falhou:", e); }
try{ mesclarEntrada(); }catch(e){ console.error("mesclagem da entrada falhou:", e); }
/* Antes de qualquer descida: o aparelho precisa falar por `id` para que o
   estado.json possa responder por `id`. */
try{ migrarGuiaToefl(); }catch(e){ console.error("migracao do guia TOEFL falhou:", e); }
try{ migrarRetomadas(); }catch(e){ console.error("migracao das retomadas falhou:", e); }
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
/* Depois do bloco de sementes de proposito: renderAcervoEstado le ROTEIRO,
   que so existe a partir da linha acima. */
try{ renderAcervoEstado(); }catch(e){ console.error("estado do acervo:", e); }
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
  buscarEntrada().then(buscarEstado);
  window.addEventListener("online", function(){ buscarEntrada().then(buscarEstado); });
  /* Voltar para a aba tambem re-le o estado. Sem isto, o celular que ficou
     aberto no bolso continua mostrando o que era verdade quando foi aberto,
     e so um recarregamento a mao mostra o que o Mac marcou depois. Trava de
     20s para alternar de app nao virar uma busca por vez. */
  document.addEventListener("visibilitychange", function(){
    if(document.visibilityState !== "visible") return;
    var agora = Date.now();
    if(agora - ULTIMA_BUSCA < 20000) return;
    ULTIMA_BUSCA = agora;
    /* checkUpdate junto, e nao so buscarEstado. Ele so rodava no boot, entao
       uma aba deixada aberta nunca ficava sabendo de uma versao nova. Foi
       exatamente assim que o Safari do Mac passou a tarde na sincronia2
       depois da sincronia3 no ar: marcando vagas sem publicar nada, porque o
       codigo que publica estava na versao que ele nao tinha carregado. Uma
       correcao que so chega a quem recarrega e meia correcao. */
    try{ checkUpdate(); }catch(e){}
    buscarEstado();
  });
}catch(e){ console.error("busca da entrada/estado falhou:", e); }
