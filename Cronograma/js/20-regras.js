/* CRONOGRAMA — 20-regras.js
   Logica de dominio e derivacao: trilhos, estagios, prioridades, motor,
   retomadas, processos, TOEFL, vagas, datas e revisao dominical.

   O CRITERIO DA DIVISAO: se a funcao produz a resposta sem tocar no DOM, ela
   mora aqui e nao em 30-render.js — mesmo quando devolve HTML. */
function podarDispensados(){
  var disp = LS(ATRASO_KEY, {}) || {}, out = {};
  var limite = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate()-ATRASO_DIAS));
  Object.keys(disp).forEach(function(k){ if(String(k).slice(0,10) >= limite) out[k] = disp[k]; });
  return out;
}
function atrasadas(){
  var out = [], disp = LS(ATRASO_KEY, {}) || {};
  for(var k=ATRASO_DIAS; k>=1; k--){
    var dt = new Date(now.getFullYear(), now.getMonth(), now.getDate()-k);
    var dia = ymd(dt), D = DIAS[dt.getDay()];
    if(!D) continue;
    var ck = LS("cron:checks:"+dia, {}) || {};
    D.tasks.forEach(function(t){
      if(ck[t.id]) return;
      if(disp[dia+"|"+t.id]) return;
      out.push({dia:dia, id:t.id, t:t.t, nome:D.nome});
    });
  }
  return out;
}
function weekOfMonth(d){return Math.min(4, Math.ceil(d.getDate()/7));}
const wom = weekOfMonth(now);
const phase = wom<=2 ? "livre" : (wom===3 ? "ebd1" : "ebd2");
/* A fase que o CALENDARIO previa. Só serve para o aviso. */
function faseDoCalendario(){
  const P=TOEFL_PLANO, h=ymd(now);
  return h < P.fase2 ? "f1" : (h < P.fase3 ? "f2" : "f3");
}
function toeflFase(){
  try{
    const dias = diasAte(TOEFL_PLANO.prova);
    if(dias < 0) return null;              // prova já passou
    const fid = currentFaseId(); if(!fid) return null;
    const r = TOEFL_ROTULO[fid], falta = nucleoQueFalta(fid);
    return {dias, sem: Math.max(0, Math.ceil(dias/7)), fid,
            fase:r.fase, foco:r.foco, falta:falta.length};
  }catch(e){ return null; }
}
/* Guia TOEFL — conteúdo por fase, marcável e com links (persistido)

   NUCLEO E REFORCO. `n:true` e nucleo: e o que a fase SEGUINTE precisa para
   fazer sentido, e o que da para fazer sozinho. `n:false` e reforco: vale a
   pena, mas nao tranca nada — tipicamente o que depende de terceiro, de
   dinheiro ou de agenda que nao e sua. Foi assim que a Fase 3 pos "feedback
   externo (tutor)" no reforco: uma tarefa que pode ser inviavel nao pode
   congelar a trilha inteira.

   O `id` E A IDENTIDADE, E ELE NAO PODE MUDAR (Fase 6A). Ate aqui a marcacao
   morava em cron:toefl-guia:<fase> indexada por POSICAO, e por isso a ordem
   desta lista era intocavel: reordenar movia as marcacoes para os itens
   errados, em silencio. Agora a marca mora em cron:toefl-guia endereçada pelo
   `id`, e o risco mudou de lugar — a ordem e o texto ficaram livres, e quem
   nao pode mudar (nem ser reaproveitado em outro item) e o `id`. Ele e global
   e nao leva a fase junto, para que a marca siga o item se ele mudar de fase.
   A separacao visual entre nucleo e reforco continua acontecendo na hora de
   desenhar, e cada item continua levando consigo o indice original. */
function guiaFeito(iid){ var r = guiaStore()[iid]; return !!(r && r.feito); }
/* Grava a marca e enfileira o toque no mesmo ato, com o MESMO instante: o
   enfileirarToque devolve o iso que usou, e guardar outro valor aqui faria os
   dois lados discordarem sobre quando aquilo aconteceu.

   Desmarcar viaja (feito:false com instante proprio). Ausencia nao viaja, e
   nao e false: e "nunca decidido". */
function marcarGuia(iid, feito){
  var st = guiaStore();
  var iso = enfileirarToque("toefl", {iid:iid, feito:!!feito});
  st[iid] = {feito:!!feito, em:iso};
  save(TOEFL_GUIA_KEY, st);
}
/* MESMA ASSINATURA DE SEMPRE: devolve {indice:true} da fase pedida. Quem chama
   (guiaItens) continua sem precisar saber que a identidade virou `id`. */
function guiaChecks(fid){
  var g = TOEFL_GUIA[fid]; if(!g) return {};
  var st = guiaStore(), out = {};
  g.itens.forEach(function(it, i){ if(st[it.id] && st[it.id].feito) out[i] = true; });
  return out;
}
/* Itens de uma fase com o INDICE ORIGINAL preso a cada um. Tudo o que desenha
   ou conta passa por aqui, para que ninguem precise lembrar de que a chave de
   marcacao e a POSICAO no array. */
function guiaItens(fid){
  const g=TOEFL_GUIA[fid]; if(!g) return [];
  const st=guiaChecks(fid);
  return g.itens.map((it,i)=>({i:i, iid:it.id, t:it.t, nucleo:!!it.n, feito:!!st[i]}));
}
function nucleoQueFalta(fid){ return guiaItens(fid).filter(x=>x.nucleo && !x.feito); }
function guiaQueFalta(fid){ return guiaItens(fid).filter(x=>!x.feito); }
/* A FASE AVANCA PELO NUCLEO, E NAO PELO CALENDARIO.
   A primeira fase cujo nucleo ainda nao fechou e a fase corrente. Fechados
   todos, a corrente e a ultima: a Fase 3 nao tem para onde avancar, e a
   prova continua sendo a unica data dura deste plano. */
function currentFaseId(){
  if(diasAte(TOEFL_PLANO.prova) < 0) return null;
  for(let k=0;k<TOEFL_FASES.length;k++){
    if(nucleoQueFalta(TOEFL_FASES[k]).length) return TOEFL_FASES[k];
  }
  return TOEFL_FASES[TOEFL_FASES.length-1];
}
/* Marcar um item do nucleo pode AVANCAR A FASE, e a fase aparece nos dois
   lugares: no corpo do processo e no banner de execucao do Hoje. Por isso os
   dois sao redesenhados — redesenhar so um deixaria o outro mentindo ate o
   proximo carregamento. */
function calcularRecalibragem(){
  const dias = diasAte(TOEFL_PLANO.prova);
  if(dias < 0) return null;
  const atual = currentFaseId(); if(!atual) return null;
  const desde = TOEFL_FASES.indexOf(atual);
  const fases = TOEFL_FASES.slice(desde).map(fid=>({fid:fid, falta:guiaQueFalta(fid).length}));
  const total = fases.reduce((s,f)=>s+f.falta, 0);
  const semanas = Math.max(1, dias/7);
  /* Fase sem nada pendente ainda ocupa tempo: dividir a janela pelo numero de
     pendencias faria a dela virar zero e empurraria a fase seguinte para
     comecar hoje. O piso de 1 mantem a ordem das janelas legivel. */
  const peso = fases.map(f=>Math.max(1, f.falta));
  const somaPeso = peso.reduce((s,x)=>s+x, 0);
  let acumulado = 0;
  const janelas = fases.map((f,k)=>{
    acumulado += dias * (peso[k]/somaPeso);
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Math.round(acumulado));
    return {fid:f.fid, falta:f.falta, ate:ymd(d)};
  });
  if(janelas.length) janelas[janelas.length-1].ate = TOEFL_PLANO.prova;
  return {quando:new Date().toISOString(), dias:dias, restantes:total,
          semanas:Math.round(semanas*10)/10,
          porSemana:Math.round((total/semanas)*10)/10, janelas:janelas};
}
function avisoDoCalendario(){
  const real=currentFaseId(), cal=faseDoCalendario();
  if(!real || TOEFL_FASES.indexOf(cal) <= TOEFL_FASES.indexOf(real)) return "";
  const marco = cal==="f2" ? TOEFL_PLANO.fase2 : TOEFL_PLANO.fase3;
  const nome = TOEFL_ROTULO[cal].fase.replace(/ \u00b7 .*$/, "");
  const atraso = diasAte(marco);
  return `<div class="aviso-cal">O calend\u00e1rio original previa a <b>${nome}</b> desde ${
    fmtData(marco)}${atraso<0?" \u2014 h\u00e1 "+(-atraso)+" dia"+(atraso===-1?"":"s"):""}.
    A fase agora anda pelo n\u00facleo, ent\u00e3o a data virou aviso: nada avan\u00e7a sozinho e nada congela.</div>`;
}
function processoDef(pid){
  for(var i=0;i<PROCESSOS.length;i++){ if(PROCESSOS[i].id===pid) return PROCESSOS[i]; }
  return null;
}

/* ================= PROCESSO DERIVADO DE UM TRILHO =================
   A aba prometia "a estrutura completa de um trabalho complexo" e entregava um
   processo so, porque PROCESSOS e uma lista escrita a mao. Um artigo nao cabe
   nessa lista: sao 13 na esteira, mudam a cada ciclo e vem do entrada.json.

   Entao PROCESSOS deixa de ser A lista e passa a ser a lista dos processos
   ESCRITOS A MAO. Os outros sao derivados do trilho a cada desenho, pelos
   dados que ja existem. NENHUM METADADO NOVO, nenhuma chave de localStorage,
   nenhum tipo de toque, nenhum cadastro paralelo.

   COMECADO E UMA DEFINICAO SO: algum subitem com `em` preenchido ou st > 0.
   E exatamente a regra que classificarProjeto e retomadas() ja aplicavam em
   linha, e nomea-la aqui e o que impede a aba de inventar um segundo criterio
   de "iniciado" e discordar do motor sobre o mesmo projeto. Aqueles dois
   seguem com o calculo em linha — eles o fazem no mesmo laco em que apuram
   `ultimo` e `temAtivo`, e troca-los por esta chamada custaria uma segunda
   varredura sem mudar um resultado. */
function projetoComecou(pr){
  var subs = (pr && pr.subs) || [];
  for(var i=0;i<subs.length;i++){
    var x = normSub(subs[i]);
    if(x.em) return true;
    if(x.st > 0) return true;
  }
  return false;
}
/* X DE Y ETAPAS, e nada mais fino do que isso. O `medida` ({feito,total}) existe
   no esquema e ja e desenhado nos Trilhos, mas esta vazio nos 78 subitens reais:
   usa-lo aqui seria inventar tamanho. Subitem "nao se aplica" sai da conta —
   ele nao e etapa que falta, e etapa que nao existe para este projeto. */
function resumoDoTrilho(pid, pr){
  var total = 0, feito = 0, ultimo = "", posAtual = 0;
  (pr.subs || []).forEach(function(sx){
    var x = normSub(sx);
    if(x.em && x.em > ultimo) ultimo = x.em;
    if(x.vida === "inaplicavel") return;
    total++;
    if(x.st === 2){ feito++; return; }
    /* A POSICAO DA ETAPA ATUAL NAO SE DEDUZ DA CONTAGEM. `feito + 1` so acerta
       quando as conclusoes sao um prefixo da lista, e nao sao: fechar a etapa 3
       antes da 2 e comum na esteira, e ali `feito + 1` apontaria a 3 enquanto o
       estagioDoTrilho — que devolve a PRIMEIRA nao concluida — aponta a 2, e a
       tela se contradiria. Entao a posicao vem da mesma regra do estagio: a
       primeira ainda aberta. O `feito` continua sendo a contagem real. */
    if(!posAtual) posAtual = total;
  });
  var et = estagioDoTrilho(pid, pr.id);
  return {
    /* "Etapa 3 de 6" e uma CONTAGEM, nao uma sintese: o texto da etapa nunca e
       reescrito. Ele aparece verbatim no corpo, na linha "Agora". */
    fase: !total ? "sem etapas"
        : posAtual ? ("Etapa " + posAtual + " de " + total)
        : "sem etapa aberta",
    feito: feito, total: total, falta: total - feito,
    dias: ultimo ? diasDesde(ultimo) : null,
    estagio: (et && !et.concluido) ? et : null
  };
}
function corpoDoTrilho(pid, pr){
  var r = resumoDoTrilho(pid, pr);
  var atual = r.estagio ? r.estagio.subId : "";
  var h = '<div class="g-body">';
  if(pr.n) h += '<p class="g-meta">' + escapeHtml(pr.n) + '</p>';
  if(r.estagio){
    h += '<div class="proc-linha agora"><span class="pl-r">Agora</span>' +
         '<span class="pl-v">' + escapeHtml(r.estagio.subT) + '</span></div>';
  }
  h += '<div class="g-grupo primeiro">Etapas <em>\u00b7 ' +
       r.feito + ' de ' + r.total + ' conclu\u00eddas</em></div>';
  (pr.subs || []).forEach(function(sx){
    var x = normSub(sx);
    /* O SELO DIZ DE QUEM DEPENDE A ETAPA. Os dois campos vem do entrada.json e
       estao preenchidos nos 78 subitens: `prova` diz quem fecha (estrela e
       decisao sua, maquina e o pipeline) e `onde` diz o lugar. Nenhum dos dois
       e inventado aqui, e nenhum e alterado. */
    var selo = x.prova && TRILHO_PROVA[x.prova]
      ? '<span class="pr-estrela">' + TRILHO_PROVA[x.prova] + '</span>' : "";
    var onde = x.onde ? '<span class="sub-onde">' + escapeHtml(x.onde) + '</span>' : "";
    var marca = x.vida === "inaplicavel" ? "n\u00e3o se aplica"
              : x.st === 2 ? "feita" : (x.id === atual ? "agora" : "falta");
    h += '<div class="proc-linha' + (x.id === atual ? ' agora' : '') + '">' +
         '<span class="pl-r">' + marca + '</span>' +
         '<span class="pl-v">' + escapeHtml(x.t || "") + ' ' + onde + selo + '</span></div>';
  });
  return h + '</div>';
}
/* SOMENTE LEITURA. Sem acoes e sem acao do dia — as duas por decisao, nao por
   falta de dado. Um artigo nao tem semana como o TOEFL_SEMANA, e inventar uma
   seria inventar metadado; e concluir etapa continua sendo do Trilho, do Hoje e
   do pipeline, pelo toque `registro`. Um segundo lugar de marcar seria um
   segundo mecanismo de conclusao. */
function processoDeTrilho(pid, pr){
  return {
    id: "trilho:" + pid + "/" + pr.id,
    titulo: pr.t || pr.id,
    resumo:    function(){ return resumoDoTrilho(pid, pr); },
    acaoDoDia: function(){ return null; },
    linhas:    function(){ return ""; },
    corpo:     function(){ return corpoDoTrilho(pid, pr); },
    acoes:     function(){ return ""; }
  };
}
/* A LISTA VISIVEL: os escritos a mao primeiro, depois os trilhos comecados e
   nao concluidos. A ordem e a dos PAINEIS e a dos projetos dentro de cada
   painel — estavel e sem heuristica: nada de "estagio mais avancado", que
   mudaria a ordem da tela a cada marcacao. */
function processosVisiveis(){
  var out = PROCESSOS.slice();
  PAINEIS.forEach(function(P){
    (getProjs(P.id) || []).forEach(function(pr){
      if(projConcluido(pr)) return;
      if(!projetoComecou(pr)) return;
      out.push(processoDeTrilho(P.id, pr));
    });
  });
  return out;
}

/* A PONTE PROCESSO -> HOJE. O Hoje nao sabe mais o que o TOEFL faz na terca:
   ele pergunta. Devolve null quando o processo nao pede nada naquele dia. */
function acaoDoDiaDoProcesso(pid, dia){
  const P = processoDef(pid); if(!P || !P.acaoDoDia) return null;
  const a = P.acaoDoDia(typeof dia === "number" ? dia : todayIdx);
  return a ? {processo:pid, titulo:P.titulo, comp:a.comp, t:a.t, n:a.n} : null;
}

/* A preferencia de abertura herda a antiga: quem ja tinha o guia aberto no
   Hoje encontra o processo aberto aqui. A chave velha continua existindo e
   nao e apagada — ela so deixa de ser a unica. */
function processoAberto(pid){
  const nova = LS("cron:processo-open:"+pid, null);
  if(nova !== null) return !!nova;
  return !!LS("cron:toefl-guia-open", false);
}

function _diasDaSemana(seg){
  var out = [], base = new Date(seg.slice(0,4), Number(seg.slice(5,7))-1, seg.slice(8,10));
  for(var k=0;k<7;k++){
    var d = new Date(base.getFullYear(), base.getMonth(), base.getDate()+k);
    out.push({dia:ymd(d), idx:d.getDay()});
  }
  return out;
}

function revisaoDaSemana(){
  var seg = segundaDaSemana(), dias = _diasDaSemana(seg), dom = dias[6].dia;
  var hojeStr = ymd(now);

  /* ---- CONCLUIDO · etapas de trilho ----
     A REGRA DAS TRES CONDICOES, e cada uma existe por um caso real. O
     cron:registro grava OS DOIS SENTIDOS: nas 19 linhas reais de 30 e 31/08 ha
     "de=1 para=2" seguido de "de=2 para=0" no mesmo subitem, no mesmo dia.
     Contar `para===2` ingenuamente diria duas etapas concluidas naquela
     semana; a verdade e zero.

       1. existe linha com para===2 dentro da semana
       2. ela e o ULTIMO movimento daquele subitem na semana
       3. o subitem esta com st===2 AGORA

     A 3 sozinha ja pegaria o caso acima — mas ela e o saldo, e a 2 e o
     diario. Manter as duas e o que preserva a distincao entre registro
     historico e estado atual: se um dia elas discordarem, o item nao entra, e
     discordar em silencio e o defeito caro. A ordem do array e confiavel
     porque a descida reordena por `d` com sort estavel. */
  var ultimoNaSemana = {};
  getReg().forEach(function(o){
    if(!o || !o.subId || !o.d) return;
    if(o.d < seg || o.d > dom) return;
    ultimoNaSemana[o.pid + "/" + o.projId + "/" + o.subId] = o;
  });
  var etapas = [];
  Object.keys(ultimoNaSemana).forEach(function(k){
    var o = ultimoNaSemana[k];
    if(o.para !== 2) return;                                  /* condicao 2 */
    var partes = k.split("/");
    var pr = (getProjs(partes[0]) || []).filter(function(x){ return x.id===partes[1]; })[0];
    var sx = pr && (pr.subs||[]).filter(function(x){ return x.id===partes[2]; })[0];
    if(!sx || sx.st !== 2) return;                            /* condicao 3 */
    etapas.push({pid:partes[0], projId:partes[1], subId:partes[2],
                 projT:o.projT || partes[1], subT:sx.t || o.subT || "", d:o.d});
  });
  etapas.sort(function(a,b){ return a.d < b.d ? -1 : (a.d > b.d ? 1 : 0); });

  /* ---- CONCLUIDO · metas ----
     A meta traz o proprio `done` e o `em` da ultima mudanca. A semana pode
     atravessar a virada do mes, entao os dois meses sao olhados. */
  var metasFeitas = [], meses = {};
  meses[seg.slice(0,7)] = true; meses[dom.slice(0,7)] = true;
  Object.keys(meses).forEach(function(mk){
    (getMetas(mk) || []).forEach(function(m){
      if(!m || !m.done || !m.em) return;
      var d = String(m.em).slice(0,10);
      if(d >= seg && d <= dom) metasFeitas.push({t:m.t || "", d:d});
    });
  });

  /* ---- CONCLUIDO · rotinas ----
     ISTO E DESTE APARELHO, e o rotulo na tela diz isso. cron:checks: sempre
     foi por aparelho — marcar no Mac nao aparece no celular. Mostrar o numero
     sem a ressalva seria apresentar dado local como se fosse o estado de
     todos. So contam ids que sao rotina do dia: prioridade livre tambem mora
     no cron:checks, e ela e contada a parte. */
  var rotinasFeitas = 0;
  dias.forEach(function(D){
    if(D.dia > hojeStr) return;
    var ck = LS("cron:checks:"+D.dia, {}) || {};
    ((DIAS[D.idx] || {}).tasks || []).forEach(function(t){ if(ck[t.id]) rotinasFeitas++; });
  });

  /* ---- PRIORIDADES · cada tipo na sua fonte de verdade ---- */
  var feitas = [], abertas = [];
  getPrio().forEach(function(pp){
    if(pp.tipo === "trilho"){
      var andou = etapas.some(function(e){
        return e.pid === pp.painel && e.projId === pp.projId; });
      var et = estagioDoTrilho(pp.painel, pp.projId);
      var rot = {tipo:"trilho", t:pp.t || (et && et.projT) || pp.projId,
                 etapa: (et && !et.concluido) ? et.subT : "",
                 concluido: !!(et && et.concluido)};
      (andou || rot.concluido ? feitas : abertas).push(rot);
    } else {
      /* Prioridade livre: o mesmo cron:checks das rotinas, varrido pela
         semana — ela pode ter sido marcada em qualquer dia. */
      var marcada = dias.some(function(D){
        return !!(LS("cron:checks:"+D.dia, {}) || {})[pp.id]; });
      (marcada ? feitas : abertas).push({tipo:"livre", t:pp.t || "", etapa:""});
    }
  });

  /* ---- SUGESTOES QUE NAO VIRARAM ESCOLHA ----
     O motor ja exclui o que virou manual, entao o que ele devolve agora e,
     por construcao, o que foi sugerido e nao foi adotado. Aparece rotulado
     como sugestao e NUNCA como prioridade sua. */
  var sugeridas = [];
  try{ sugeridas = motorDePrioridades(getPrio()) || []; }catch(e){ sugeridas = []; }

  /* ---- ATENCAO ---- */
  var paradas = [];
  try{ paradas = (retomadas() || []).slice(0, 3); }catch(e){ paradas = []; }
  var processos = [];
  (typeof PROCESSOS !== "undefined" ? PROCESSOS : []).forEach(function(P){
    var r = P.resumo ? P.resumo() : null;
    if(!r) return;
    processos.push({titulo:P.titulo, fase:r.fase, falta:r.falta, dias:r.dias});
  });

  /* ---- PROXIMA SEMANA ---- */
  var eventos = (getEventos() || []).map(function(e){
    return {t:e.t || "", data:e.data, dias:diasAte(e.data)}; })
    .filter(function(e){ return e.dias >= 0 && e.dias <= REVISAO_HORIZONTE; })
    .sort(function(a,b){ return a.dias - b.dias; });
  var prazos = [], vagas = null;
  try{ prazos = (prazosProximos(2) || {}).lista || []; }catch(e){ prazos = []; }
  try{
    vagas = contagemDeVagas();
    /* "NOVAS" NUMA REVISAO SEMANAL PRECISA QUERER DIZER "DESTA SEMANA".
       O contagemDeVagas() conta `i.novo`, que e posto na coleta e nunca
       apagado — no dado real de hoje isso da 160, que num digest e ruido e
       nao informacao. O `visto_em` diz quando o item foi visto pela primeira
       vez, e e ele que responde a pergunta que a revisao faz. O indicador do
       Hoje continua como esta: la "novas" quer dizer "ainda nao triadas", que
       e a pergunta certa para aquela tela. */
    var doFeed = ((typeof VG_VAGAS !== "undefined" && VG_VAGAS.itens) || [])
      .concat((typeof VG_CHAMADAS !== "undefined" && VG_CHAMADAS.itens) || []);
    vagas = {total:vagas.total, revisar:vagas.revisar, marcadas:vagas.marcadas,
             novas: doFeed.filter(function(i){
               return i && i.visto_em && i.visto_em >= seg && i.visto_em <= dom &&
                      i.veredicto !== "rejeitado" &&
                      (typeof vgEstado === "function" ? vgEstado(i.id) === 0 : true);
             }).length};
  }catch(e){ vagas = null; }

  return {
    seg:seg, dom:dom, emCurso: hojeStr < dom,
    concluido:{etapas:etapas, metas:metasFeitas, rotinas:rotinasFeitas,
               prioridades:feitas},
    atras:{rotinas:(function(){ try{ return atrasadas(); }catch(e){ return []; } })(),
           prioridades:abertas, sugeridas:sugeridas},
    atencao:{paradas:paradas, processos:processos},
    frente:{eventos:eventos, prazos:prazos, vagas:vagas}
  };
}
let mesAtivo = monthKey;
function mesLabel(k){const [y,m]=k.split("-").map(Number);
  return new Date(y,m-1,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"});}
function mesCurto(k){const [y,m]=k.split("-").map(Number);
  return new Date(y,m-1,1).toLocaleDateString("pt-BR",{month:"long"});}
function mesSoma(k,n){const [y,m]=k.split("-").map(Number);const d=new Date(y,m-1+n,1);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");}
function listaMeses(){
  const out=[];let k=MES_INICIO;const fim=mesSoma(monthKey,18);
  while(k<=fim){out.push(k);k=mesSoma(k,1);}
  return out;
}
function pendencias(){
  const out=[];let k=MES_INICIO;
  while(k<monthKey){
    getMetas(k).forEach(function(m){if(!m.done && m.t.trim()) out.push({mes:k,meta:m});});
    k=mesSoma(k,1);
  }
  return out;
}
function pisoJaGasto(base){
  var fora = LS(ACERVO_LA_FORA_KEY, null);
  if(!fora) return 0;
  /* `piso` vem do HISTORICO, e nao so das secoes. Faz diferenca num caso: uma
     meta publicada pelo botao e editada depois carrega na secao o instante da
     EDICAO, e o instante do piso sobrevive so no historico. Olhando apenas as
     secoes, o relogio poderia reemitir aquele instante — e a dobra descartaria
     o toque novo como ja visto. */
  if(base === new Date(ACERVO_EM).getTime() && fora.piso) return fora.piso;
  var maior = 0;
  ["metas","eventos"].forEach(function(s){
    var m = fora[s] || {};
    Object.keys(m).forEach(function(k){
      /* metas guardam a string do instante; eventos guardam um objeto */
      var q = (typeof m[k] === "string") ? m[k] : (m[k] && m[k].q);
      var ms = new Date(q).getTime();
      if(isFinite(ms) && ms >= base && ms < base + 86400000 && ms > maior) maior = ms;
    });
  });
  return maior;
}

/* Anota na fotografia local o que acabou de entrar na fila, para que apertar o
   botao duas vezes antes de o estado.json voltar nao republique o mesmo. Se o
   envio falhar, a proxima leitura desfaz esta anotacao sozinha: a fotografia e
   sempre reescrita pelo que o servidor realmente tem. */

function jaEstaLaFora(secao, chave, temInstante){
  var fora = LS(ACERVO_LA_FORA_KEY, null);
  /* Ainda nao lemos o estado publicado — primeira carga sem rede, tipicamente.
     Sem a fotografia, a regra conservadora e o instante: quem tem instante ou
     ja publicou ou ja recebeu. Nao republica por engano, e volta a acertar
     assim que a primeira leitura chegar. */
  if(!fora || !fora[secao]) return !!temInstante;
  return Object.prototype.hasOwnProperty.call(fora[secao], chave);
}

/* A semente e identica nos dois aparelhos: METAS_SEED reconstroi as metas
   art-* em qualquer navegador que carregue esta pagina, e o mes de inicio
   nasce com METAS_DEFAULT. Publicar uma que ninguem tocou so engordaria o
   estado.json com o que o outro lado ja tem igual. Feita ou trazida de outro
   mes, ja nao e semente intocada: viaja. */
function metaEhSementeIntocada(mes, m){
  if(m.done || m.de) return false;
  var r = (typeof ROTEIRO !== "undefined" && ROTEIRO[mes]) || [];
  for(var i=0;i<r.length;i++){ if(m.id === "art-"+mes+"-"+i) return m.t === r[i]; }
  if(mes === MES_INICIO){
    for(var j=0;j<METAS_DEFAULT.length;j++){
      if(m.id === METAS_DEFAULT[j].id) return m.t === METAS_DEFAULT[j].t;
    }
  }
  return false;
}

function metasParaPublicar(){
  var fora = [];
  listaMeses().forEach(function(mes){
    (getMetas(mes)||[]).forEach(function(m){
      if(!m || !m.id) return;
      if(!String(m.t||"").trim()) return;        /* meta em branco nao e meta */
      if(metaEhSementeIntocada(mes, m)) return;
      /* Nao ha mais trava de "uma vez por aparelho": ela impedia o conserto
         acima de acontecer. Quem decide, meta a meta, e se ela ja esta la fora
         — e isso ja impede o aparelho que RECEBEU de republicar o que recebeu,
         que era a unica coisa que a trava protegia. */
      if(jaEstaLaFora("metas", mes + "/" + m.id, m.em)) return;
      fora.push({mes:mes, m:m});
    });
  });
  return fora;
}

/* A semente de eventos tambem e identica nos dois aparelhos: EVENTOS_DEFAULT
   nasce igual em qualquer navegador. Data mudada ja nao e semente intocada. */
function eventoEhSementeIntocado(ev){
  for(var i=0;i<EVENTOS_DEFAULT.length;i++){
    if(ev.id === EVENTOS_DEFAULT[i].id) return ev.data === EVENTOS_DEFAULT[i].data;
  }
  return false;
}

function eventosParaPublicar(){
  var snap = LS(ACERVO_LA_FORA_KEY, null);
  var conhece = !!(snap && snap.eventos);
  var fora = [];
  (getEventos()||[]).forEach(function(ev){
    if(!ev || !ev.id || !ev.data) return;
    if(eventoEhSementeIntocado(ev)) return;
    if(!jaEstaLaFora("eventos", ev.id, ev.em)){ fora.push({ev:ev, novo:true}); return; }
    if(!conhece) return;
    var la = snap.eventos[ev.id];
    if(!la || typeof la !== "object") return;
    /* Ja esta la fora, mas o que esta la nao corresponde mais. Dois casos, e os
       dois nascem de 29/08, quando os eventos subiram sem titulo nenhum:
         · o titulo devia estar publicado e nao esta  -> publica para completar
         · o titulo esta publicado e agora e privado  -> publica para retirar
       Nos dois a condicao para de casar assim que o toque e dobrado e a
       fotografia e relida, o que faz isto acontecer uma vez e nao virar laco. */
    var falta   = !ev.priv && String(ev.t||"").trim() && !la.t;
    var retirar =  ev.priv && la.t;
    /* A MARCA TAMBEM PRECISA ATRAVESSAR, mesmo quando nao ha titulo a retirar.
       Sem esta terceira condicao, um evento ja publicado sem titulo e marcado
       como privado aqui nunca contaria ao outro aparelho que e privado — e o
       outro publicaria o titulo na primeira edicao. */
    var marca   = (!!ev.priv) !== (!!la.p);
    if(falta || retirar || marca) fora.push({ev:ev, novo:false});
  });
  return fora;
}
function diasAte(iso){const [y,m,dd]=iso.split("-").map(Number);
  const t0=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  return Math.round((new Date(y,m-1,dd)-t0)/86400000);}
function fmtData(iso){const [y,m,dd]=iso.split("-").map(Number);
  return new Date(y,m-1,dd).toLocaleDateString("pt-BR",{day:"numeric",month:"long"});}
/* CINCO NA PRIMEIRA TELA — Fase 2.
   A lista inteira nao cabe num celular sem empurrar tudo o mais para fora, e a
   sexta data nunca foi a que decide o dia. As demais NAO somem: ficam atras de
   um "ver todas", e continuam inteiras no cron:eventos. O contador grande
   continua sendo o da data mais proxima, como sempre foi.

   OS BOTOES PASSARAM A ANDAR POR ID, e isto nao e estilo — e correcao de um
   defeito que o corte teria criado. editEv/dateEv/delEv/privEv recebiam o
   INDICE da lista ordenada e o resolviam pelo sortedRef(i). Desenhando so
   cinco, o indice da tela deixaria de ser o indice da lista: o botao da sexta
   data editaria e APAGARIA a data errada. O id do evento e estavel e nao
   depende de quantos estao na tela. */
/* Este evento ja consta do estado.json publicado, segundo a ultima leitura. */
function eventoJaSubiu(eid){
  var fora = LS(ACERVO_LA_FORA_KEY, null);
  if(!fora || !fora.eventos) return false;
  return Object.prototype.hasOwnProperty.call(fora.eventos, eid);
}

/* UMA fonte para o que o toque de evento carrega. O botao do acervo montava o
   proprio payload e ficou para tras quando o titulo passou a viajar: publicava
   sem `t` e sem `priv`, justamente na hora em que existia para republicar os
   titulos que faltavam. Com uma funcao so, nao ha como um caminho envelhecer
   sem o outro. */
function dadosDoEvento(ev, apagado){
  var d = {eid:ev.id, data:ev.data||null, priv:!!ev.priv, del:!!apagado};
  /* O titulo entra so quando pode sair daqui. Num evento privado ele nem chega
     a ser montado: nao ha o que vazar por engano mais adiante. */
  if(!ev.priv) d.t = ev.t || "";
  return d;
}
function estagioDoTrilho(pid, projId){
  var projs = getProjs(pid) || [];
  for(var i=0;i<projs.length;i++){
    var pr = projs[i];
    if(projId){ if(pr.id !== projId) continue; }
    else if(projConcluido(pr)) continue;
    for(var j=0;j<(pr.subs||[]).length;j++){
      var x = normSub(pr.subs[j]);
      if(x.vida === "inaplicavel") continue;
      if(x.st === 2) continue;
      return {pid:pid, projId:pr.id, projT:pr.t, subId:x.id, subT:x.t, st:x.st,
              vida:x.vida, motivo:x.motivo, prova:x.prova||"", em:x.em||""};
    }
    /* Pedido por projeto e o projeto acabou: dizer "concluido" e diferente de
       devolver nada. Prioridade apontada para um artigo pronto merece dizer
       que ele esta pronto, e nao sumir da tela sem explicacao. */
    if(projId) return {pid:pid, projId:pr.id, projT:pr.t, concluido:true};
  }
  return null;
}
function proximaDoTrilho(pid){ return estagioDoTrilho(pid, null); }

/* QUANDO A ROTINA AINDA PODE APONTAR UM ESTAGIO SOZINHA: quando nao ha escolha
   a fazer. Um painel com um projeto ativo so tem uma proxima etapa possivel, e
   mostra-la nao e o sistema decidindo nada. Com dois ou mais, mostrar o
   primeiro do array E decidir — e essa decisao passou a ser sua, nas
   Prioridades. A regra le o dado, entao ela se corrige sozinha conforme os
   paineis enchem e esvaziam; nao ha lista de excecao para manter. */
function projetosAtivos(pid){
  return (getProjs(pid) || []).filter(function(pr){ return !projConcluido(pr); });
}
function trilhoSemEscolha(pid){
  var ativos = projetosAtivos(pid);
  return ativos.length === 1 ? estagioDoTrilho(pid, ativos[0].id) : null;
}

/* ==================== PRIORIDADES — Fase 2 ====================
   O QUE VOCE ELEGEU PARA A SEMANA. E a unica coisa no Hoje que decide QUAL
   projeto concreto recebe o dia; a rotina diz o que fazer, a prioridade diz
   em que.

   POR SEMANA, E NAO POR DIA. Voce elege na segunda e a escolha vale ate
   domingo. Prioridade diaria seria uma lista para alimentar todo dia — o
   oposto do que este sistema existe para fazer.

   ATRAVESSA APARELHOS, pelo mecanismo que ja existia. Nenhuma arquitetura
   nova: toque tipo "prioridade" -> dobrar_toques.py -> estado.prioridades ->
   descida pelo relogio, item a item. E o mesmo caminho da meta, que era o
   caso mais proximo. O frontend NUNCA escreve no estado.json.

   A PRIORIDADE DE TRILHO NAO GUARDA O TEXTO DA ETAPA. Guarda o endereco do
   projeto (painel + projId). O estagio e lido do trilho toda vez que a tela
   desenha — por isso, se o pipeline fechar uma etapa pelo --registrar, o Hoje
   mostra a proxima sem ninguem tocar em nada. Congelar o texto aqui seria
   inventar um estagio, que e o que a Fase 2 proibe.
   ============================================================== */
function semanaISO(d){
  /* Semana ISO: a que contem a quinta-feira. Sem isto, virada de ano parte a
     semana em duas chaves e a prioridade de 31/12 some no dia 1o. */
  var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  var ano = t.getUTCFullYear();
  var jan1 = Date.UTC(ano, 0, 1);
  var n = Math.ceil(((t.getTime() - jan1) / 86400000 + 1) / 7);
  return ano + "-W" + String(n).padStart(2, "0");
}
var semanaAtual = semanaISO(now);
function dadosDaPrioridade(p, sem, apagada){
  return {sem: sem || semanaAtual, prid: p.id, tipo: p.tipo || "livre",
          painel: p.painel || "", projId: p.projId || "",
          t: p.t || "", del: !!apagada};
}
function prazoDoProjeto(pr){
  if(!pr || !pr.mes || !/^\d{4}-\d{2}$/.test(pr.mes)) return null;
  var y = Number(pr.mes.slice(0, 4)), m = Number(pr.mes.slice(5, 7));
  var ultimo = new Date(y, m, 0);          /* dia 0 do mes seguinte = ultimo deste */
  return Math.round((ultimo.getTime() -
    new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
}

/* VOCE JA PRIORIZOU ISTO? Quatro semanas para tras, pelas chaves calculadas —
   sem varrer o localStorage, o que manteria o teste preso a uma implementacao
   de armazenamento. E o sinal de importancia mais honesto que existe aqui: nao
   e o sistema adivinhando o que importa, e o sistema lembrando do que VOCE
   disse que importava. */
function priorizadoRecentemente(painel, projId){
  for(var k = 1; k <= 4; k++){
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7 * k);
    var lista = getPrio(semanaISO(d));
    for(var i = 0; i < lista.length; i++){
      if(lista[i].painel === painel && lista[i].projId === projId) return true;
    }
  }
  return false;
}

/* Um projeto so e candidato se houver o que fazer nele HOJE. Espelha os
   filtros das retomadas, e pela mesma razao: decisao sua nao e esquecimento. */
function candidatoDoMotor(P, pr){
  if(projConcluido(pr)) return null;
  var ultimo = "", comecou = false, temAtivo = false, adiadoAte = "";
  (pr.subs || []).forEach(function(sx){
    var x = normSub(sx);
    if(x.em){ comecou = true; if(x.em > ultimo) ultimo = x.em; }
    if(x.st > 0) comecou = true;
    if(x.st === 2) return;
    if(x.vida === "inaplicavel" || x.vida === "abandonado") return;
    if(x.vida === "adiado"){
      if(x.voltar_em && x.voltar_em > adiadoAte) adiadoAte = x.voltar_em;
      return;
    }
    temAtivo = true;
  });
  if(!temAtivo) return null;         /* so restou o que voce parou, ou nada */
  var et = estagioDoTrilho(P.id, pr.id);
  if(!et || et.concluido || !et.subId) return null;
  return {painel:P.id, painelT:P.titulo, peso:P.peso || "medio",
          projId:pr.id, projT:pr.t, subId:et.subId, subT:et.subT,
          st:et.st, prova:et.prova || "", comecou: comecou,
          dias: comecou ? diasDesde(ultimo) : null,
          prazo: prazoDoProjeto(pr), adiadoAte: adiadoAte};
}

/* A CLASSIFICACAO. Primeira regra que casar vence; nada abaixo dela e somado.
   Devolve null para o que nao merece ser sugerido — que e a maioria, e e assim
   que a lista fica curta sem precisar de corte artificial. */
function classificarCandidato(c){
  if(c.prazo !== null && c.prazo <= MOTOR_PRAZO_DIAS){
    if(c.prazo < 0){
      var meses = Math.max(1, Math.round(-c.prazo / 30));
      return {classe:"URGENTE", motivo:"atrasado " + meses + " m\u00eas" + (meses===1?"":"es")};
    }
    return {classe:"URGENTE", motivo: c.prazo === 0 ? "o m\u00eas-alvo fecha hoje"
            : "prazo em " + c.prazo + " dia" + (c.prazo===1?"":"s")};
  }
  /* A unica dependencia que o dado conhece: etapa que o pipeline NAO fecha
     sozinho, porque a conclusao e decisao do autor. Enquanto ela nao for
     decidida, nada abaixo dela anda. */
  if(c.prova === "estrela") return {classe:"DECISAO", motivo:"depende de uma decis\u00e3o sua"};
  if(c.dias !== null && c.dias >= RETOMADA_DIAS)
    return {classe:"RETOMADA", motivo:c.dias + " dias sem avan\u00e7o"};
  /* PESO ALTO NAO ELEGE SOZINHO, e isto custou um defeito medido em
     2026-09-01, no primeiro ensaio do motor: com o pipeline zerado, os sete
     projetos do painel de candidatura (peso alto) viraram sugestao TODOS, para
     sempre, so por estarem nele. Um painel estrategico com doze projetos
     dentro nao diz qual deles importa hoje — dizer "isto e estrategico" sobre
     um artigo de julho de 2027 que ninguem abriu e recitar o painel, nao
     recomendar nada.
     Exige-se, portanto, um vinculo com a sua vida real: ou o projeto ja
     comecou, ou voce ja o escolheu a mao nas ultimas quatro semanas. */
  if(c.peso === "alto" && c.comecou)
    return {classe:"ESTRATEGICO", motivo:"prioridade estrat\u00e9gica"};
  if(priorizadoRecentemente(c.painel, c.projId))
    return {classe:"ESTRATEGICO", motivo:"voc\u00ea priorizou isto recentemente"};
  if(c.st === 1) return {classe:"EM CURSO", motivo:"come\u00e7ado e n\u00e3o terminado"};
  return null;                        /* NORMAL: existe, mas nao se sugere */
}

/* O DESEMPATE, e ele e inteiro deterministico — nada de aleatorio, nada que
   dependa da hora. A ultima chave e o endereco em ordem alfabetica, e ela
   existe justamente para que duas chamadas seguidas devolvam a MESMA lista. */
function ordenarSugestoes(a, b){
  var ca = MOTOR_CLASSES.indexOf(a.classe), cb = MOTOR_CLASSES.indexOf(b.classe);
  if(ca !== cb) return ca - cb;
  var pa = a.prazo === null ? 99999 : a.prazo, pb = b.prazo === null ? 99999 : b.prazo;
  if(pa !== pb) return pa - pb;                       /* prazo mais perto */
  var da = a.dias === null ? -1 : a.dias, db = b.dias === null ? -1 : b.dias;
  if(da !== db) return db - da;                       /* mais tempo parado */
  var wa = MOTOR_PESO_ORDEM[a.peso] !== undefined ? MOTOR_PESO_ORDEM[a.peso] : 1;
  var wb = MOTOR_PESO_ORDEM[b.peso] !== undefined ? MOTOR_PESO_ORDEM[b.peso] : 1;
  if(wa !== wb) return wa - wb;
  var ea = a.painel + "/" + a.projId, eb = b.painel + "/" + b.projId;
  return ea < eb ? -1 : (ea > eb ? 1 : 0);
}

/* SEAM PARA A FASE 4. Processos (TOEFL, candidatura Notre Dame) ainda nao
   existem como estrutura, e esta fase nao os inventa. Quando existirem, e daqui
   que os sinais deles entram: mesma forma de candidato, mesma classificacao,
   mesmo desempate. Devolver [] ate la mantem o motor honesto — ele nao finge
   conhecer um processo que ninguem escreveu. */
function sinaisDeProcesso(){ return []; }

function motorDePrioridades(manuais){
  manuais = manuais || [];
  var vagas = Math.min(MOTOR_TETO_TOTAL - manuais.length, MOTOR_TETO_SUGESTOES);
  if(vagas <= 0) return [];

  var jaManual = {}, silenciadas = retomadasAdiadas(), hojeStr = ymd(now);
  manuais.forEach(function(p){
    if(p.tipo === "trilho") jaManual[p.painel + "/" + p.projId] = true;
  });

  var candidatos = [];
  PAINEIS.forEach(function(P){
    (getProjs(P.id) || []).forEach(function(pr){
      var chave = P.id + "/" + pr.id;
      if(jaManual[chave]) return;                       /* voce ja escolheu */
      if(retomadaSilenciada(silenciadas, chave, hojeStr)) return;
      var c = candidatoDoMotor(P, pr);
      if(!c) return;
      if(c.adiadoAte && c.adiadoAte > hojeStr) return;  /* voltar_em no futuro */
      var cl = classificarCandidato(c);
      if(!cl) return;
      c.classe = cl.classe; c.motivo = cl.motivo;
      c.pedeComputador = true;   /* etapa de trilho e trabalho de computador */
      candidatos.push(c);
    });
  });
  candidatos = candidatos.concat(sinaisDeProcesso());

  /* NAO REPETIR O QUE A TELA JA MOSTRA. Se uma rotina de hoje ja desenha a
     etapa de um projeto (trilhoSemEscolha), sugeri-lo de novo seria a mesma
     coisa duas vezes na mesma tela. */
  var naRotina = {};
  ((DIAS[todayIdx] || {}).tasks || []).forEach(function(t){
    if(!t.link) return;
    var e = trilhoSemEscolha(t.link);
    if(e && e.projId) naRotina[t.link + "/" + e.projId] = true;
  });

  var vistos = {}, saida = [];
  candidatos.sort(ordenarSugestoes);
  for(var i = 0; i < candidatos.length && saida.length < vagas; i++){
    var c = candidatos[i], ch = c.painel + "/" + c.projId;
    if(vistos[ch] || naRotina[ch]) continue;
    vistos[ch] = true;
    c.id = "sug-" + ch.replace(/[^a-zA-Z0-9]/g, "-");
    c.tipo = "trilho";
    c.sugerida = true;
    saida.push(c);
  }
  return saida;
}

/* Dispensar uma sugestao usa A MESMA CHAVE das retomadas, de proposito: quem
   disse "agora nao" para um projeto disse para o projeto, e nao para o bloco
   onde ele apareceu. Dispensar num lugar silencia nos dois. */
function prioridadesDoDia(){
  var manuais = getPrio();
  return {manuais: manuais, sugeridas: motorDePrioridades(manuais)};
}

/* ==================== RETOMADAS — Fase 2 ====================
   PROJETO IMPORTANTE QUE PAROU. Nao e cobranca e nao e abandono: e memoria
   externa, para que um artigo nao desapareca so porque nenhuma tela o
   mencionou por tres semanas.

   DE ONDE VEM A DATA: de `sub.em`, que ja existia e ja atravessa aparelhos. O
   `em` e gravado pelo logar() quando voce marca aqui, e sobrescrito pela
   descida do estado.json quando o outro aparelho marcou. Ou seja: e o instante
   do ultimo movimento CONHECIDO POR TODOS, e nao o deste aparelho. Nao foi
   preciso inventar campo nenhum.

   QUATRO FILTROS, e cada um evita um falso diferente:

     1. so projeto JA COMECADO. Sem isto, um artigo de dezembro que nunca foi
        aberto apareceria com "45 dias sem avanco" — e nao ha nada para
        retomar em algo que nao comecou. Comecado = algum subitem com `em` ou
        com st > 0.
     2. `vida` adiado/abandonado/inaplicavel fica de fora. Voce DECIDIU parar;
        chamar isso de esquecimento e transformar uma decisao sua em cobranca.
     3. `voltar_em` no futuro fica de fora. Adiar ate 15/10 e ser lembrado em
        20/09 e o mesmo erro, so que pior, porque voce ja tinha respondido.
     4. concluido fica de fora.

   O TEXTO NUNCA E INVENTADO. A linha diz "N dias sem avanco" e o subtitulo e o
   estagio real do trilho, lido pelo estagioDoTrilho. Nunca "trabalhar no
   artigo".

   NAO VIRA PRIORIDADE SOZINHA. Esta fase nao tem motor de recomendacao: a
   retomada lembra, e quem promove e voce, no botao. */
function retomadaAte(m, chave){
  var r = m[chave];
  if(!r) return "";
  return (typeof r === "string") ? r : (r.ate || "");
}
function retomadaSilenciada(m, chave, hojeStr){
  var ate = retomadaAte(m, chave);
  return !!ate && ate > hojeStr;
}
/* SO O QUE AINDA CALA SOBE — mas TUDO FICA. Sao duas coisas diferentes:
   converter e publicar. Toda entrada e convertida para {ate, em} e continua no
   aparelho; so as que ainda calam viram toque. Publicar uma silenciada vencida
   seria historia publica permanente por nada, num historico que nunca e podado
   — e apaga-la seria perder dado, que e o que este projeto nao faz. Uma vencida
   nao afeta ninguem: os dois leitores exigem `ate > hoje`. */
function diasDesde(iso){
  if(!iso) return null;
  var t = new Date(iso).getTime();
  if(!isFinite(t)) return null;
  return Math.floor((now.getTime() - t) / 86400000);
}
function retomadas(limite){
  limite = (typeof limite === "number") ? limite : RETOMADA_DIAS;
  var adiadas = retomadasAdiadas(), hojeStr = ymd(now), out = [];
  PAINEIS.forEach(function(P){
    (getProjs(P.id) || []).forEach(function(pr){
      if(projConcluido(pr)) return;
      var chave = P.id + "/" + pr.id;
      if(retomadaSilenciada(adiadas, chave, hojeStr)) return;  /* silenciada */
      var ultimo = "", comecou = false, temAtivo = false;
      (pr.subs || []).forEach(function(sx){
        var x = normSub(sx);
        if(x.em){ comecou = true; if(x.em > ultimo) ultimo = x.em; }
        if(x.st > 0) comecou = true;
        if(x.st === 2) return;
        if(x.vida === "inaplicavel" || x.vida === "abandonado") return;
        if(x.vida === "adiado"){
          /* Adiada COM data no futuro nao conta; adiada sem data nenhuma
             tambem nao, porque continua sendo uma decisao sua. */
          return;
        }
        temAtivo = true;
      });
      if(!comecou) return;          /* filtro 1: nunca comecou */
      if(!temAtivo) return;         /* filtros 2 e 3: so restou o que voce parou */
      var dias = diasDesde(ultimo);
      if(dias === null || dias < limite) return;
      var et = estagioDoTrilho(P.id, pr.id);
      if(!et || et.concluido) return;
      out.push({pid:P.id, painelT:P.titulo, projId:pr.id, projT:pr.t,
                dias:dias, subT:et.subT, subId:et.subId, st:et.st,
                prova:et.prova||""});
    });
  });
  out.sort(function(a, b){ return b.dias - a.dias; });
  return out;
}
function getContexto(){ return LS("cron:contexto", "casa") || "casa"; }
function exigeComputador(o){ return (o && o.ctx === "computador") || false; }
function avisoDeContexto(o){
  return (getContexto() === "fora" && exigeComputador(o))
    ? '<span class="ctx-aviso" title="fora de casa: isto pede computador">pede computador</span>' : "";
}

/* ==================== INDICADOR DE VAGAS — Fase 2 ====================
   UMA LINHA, e nada mais. A triagem continua inteira na aba Vagas: trazer os
   cartoes para ca obrigaria a decidir sobre vagas no meio do dia, que e
   justamente o que a secao 18 do briefing separa.

   Nao custa requisicao: o vgCarregar() ja e chamado no boot, porque a aba
   Semana tambem precisa dos prazos. */
function contagemDeVagas(){
  var itens = ((typeof VG_VAGAS !== "undefined" && VG_VAGAS.itens) || [])
    .concat((typeof VG_CHAMADAS !== "undefined" && VG_CHAMADAS.itens) || []);
  var novas = 0, revisar = 0, marcadas = 0;
  itens.forEach(function(i){
    var st = (typeof vgEstado === "function") ? vgEstado(i.id) : 0;
    if(i.veredicto === "rejeitado") return;
    if(st === 3) return;
    if(st === 1) marcadas++;
    if(st === 0 && i.novo) novas++;
    if(i.veredicto === "revisar" && st !== 2) revisar++;
  });
  return {novas:novas, revisar:revisar, marcadas:marcadas, total:itens.length};
}
function projConcluido(p){
  var conta = (p && p.subs || []).filter(function(x){ return x.vida !== "inaplicavel"; });
  return conta.length > 0 && conta.every(function(x){ return x.st === 2; });
}
/* A PECA CORRENTE DA ESTEIRA — e por que ela deixou de ser "a peca do mes".

   ANTES: `mes === monthKey`. A esteira avancava porque o calendario virou. Em
   1o de setembro a peca de agosto que nao ficou pronta simplesmente sumia do
   Hoje e da chamada dos Trilhos, e a de setembro tomava o lugar sem ninguem
   decidir nada — exatamente o que a fase do TOEFL fazia em 17/08.

   AGORA: a corrente e a PRIMEIRA que ainda nao esta pronta, na ordem da
   esteira. O mes vira aviso: se ela ja devia ter saido, a tela diz isso, em
   vez de trocar de peca pelas costas. Uma peca so sai de cena quando fica
   pronta, que e a unica coisa que significa "entregue".

   `atraso` e em meses, e alimenta o aviso. `adiantada` cobre o caso de tudo
   estar pronto ate aqui e a proxima ser de um mes que ainda nao chegou. */
function mesesEntre(a, b){
  var pa=String(a).split("-"), pb=String(b).split("-");
  return (Number(pb[0])-Number(pa[0]))*12 + (Number(pb[1])-Number(pa[1]));
}
function pecaDoMes(){
  var projs=getProjs("pipeline"), p=null;
  for(var i=0;i<projs.length;i++){ if(!projConcluido(projs[i])){ p=projs[i]; break; } }
  if(!p) return null;
  var etapa=null;
  for(var j=0;j<p.subs.length;j++){
    if(p.subs[j].vida==="inaplicavel") continue;
    if(p.subs[j].st!==2){etapa=p.subs[j].t;break;}
  }
  var atraso = (p.mes && p.mes < monthKey) ? mesesEntre(p.mes, monthKey) : 0;
  return {id:p.id, curto:p.t.replace(/^[^\u00b7]*\u00b7\s*/,""), mes:p.mes,
          proxima: !!(p.mes && p.mes > monthKey), atraso: atraso,
          etapa: etapa || "pronta para submeter"};
}
/* O aviso da esteira, irmao do aviso do TOEFL e pela mesma razao. */
function avisoDaEsteira(){
  var pc = pecaDoMes();
  if(!pc || !pc.atraso) return "";
  return '<div class="aviso-cal">O calend\u00e1rio previa <b>' + escapeHtml(pc.curto) +
         '</b> em ' + escapeHtml(mesLabel(pc.mes)) + ', h\u00e1 ' + pc.atraso + ' m\u00eas' +
         (pc.atraso===1?'':'es') + '. A esteira n\u00e3o pula: ela s\u00f3 anda quando a pe\u00e7a fica pronta.</div>';
}
function segundaDaSemana(){
  return ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay()+6)%7)));
}
/* Marcacoes no registro: esta semana contra a media semanal desde a primeira
   linha. Depois da descida do registro isto conta os DOIS aparelhos — e o que
   torna a media honesta, porque antes cada um media so a propria metade. */
function ritmoDoRegistro(){
  var r = getReg().filter(function(o){ return o && /^\d{4}-\d{2}-\d{2}$/.test(o.d||""); });
  if(!r.length) return null;
  var seg = segundaDaSemana();
  var nSemana = r.filter(function(o){ return o.d >= seg; }).length;
  var primeira = r.reduce(function(a,o){ return (!a || o.d < a) ? o.d : a; }, null);
  var span = Math.max(1, Math.ceil((-diasAte(primeira) + 1) / 7));
  return {semana:nSemana, media:Math.round((r.length/span)*10)/10, total:r.length, semanas:span};
}
/* Artigos entregues contra previstos. "Previsto" e a peca cujo mes ja chegou;
   "entregue" e a peca com todas as etapas que contam concluidas — a mesma
   regra do pecaDoMes, e nao uma segunda contagem paralela que um dia
   discordaria dela. */
function entregaDosArtigos(){
  var projs = (getProjs("pipeline") || []).filter(function(p){ return p.mes; });
  var previstos = projs.filter(function(p){ return p.mes <= monthKey; });
  return {previstos:previstos.length, entregues:previstos.filter(projConcluido).length,
          total:projs.length};
}
/* Prazos ordenados por proximidade. Sai do mesmo feed e da mesma triagem da
   aba Vagas: o que voce marcou "nao" ou arquivou nao aparece, e o que ja
   venceu tambem nao. Nenhuma ordem inventada — e a data, so. */
function prazosProximos(n){
  var itens = (VG_VAGAS.itens||[]).concat(VG_CHAMADAS.itens||[]);
  var hoje = ymd(now);
  var abertas = itens.filter(function(i){
    if(!i || !/^\d{4}-\d{2}-\d{2}$/.test(i.prazo||"")) return false;
    if(i.prazo < hoje) return false;
    var st = vgEstado(i.id);
    return st !== VG_ST.NAO && st !== VG_ST.ARQ;
  });
  abertas.sort(function(a,b){ return a.prazo < b.prazo ? -1 : (a.prazo > b.prazo ? 1 : 0); });
  /* De quando e o feed que esta na tela. O painel abre pelo cache, que pode
     ser de dias atras: sem esta linha, "31 em aberto" parece de agora. */
  var quando = [VG_VAGAS._gerado_em, VG_CHAMADAS._gerado_em].filter(Boolean).sort().pop() || "";
  return {lista:abertas.slice(0,n), total:abertas.length, temFeed:itens.length>0,
          coletado: quando ? String(quando).slice(0,10) : ""};
}

function vgVisivel(i){
  var st = vgEstado(i.id);
  if(st===VG_ST.ARQ) return false;
  /* Vagas 2. O que a maquina rejeitou sai das listas de TRABALHO e continua
     em "Tudo" — nesta primeira rodada o coletor nao remove nada do arquivo,
     de proposito, para que o resultado possa ser auditado antes de virar
     remocao automatica. Item sem o campo se comporta como sempre. */
  var rejeitado = (i.veredicto==="rejeitado");
  if(VG_FILTRO==="abertas") return st!==VG_ST.NAO && !rejeitado;
  if(VG_FILTRO==="novas")   return st===VG_ST.NOVO && i.novo && !rejeitado;
  if(VG_FILTRO==="revisar") return st!==VG_ST.NAO && i.veredicto==="revisar";
  if(VG_FILTRO==="sim")     return st===VG_ST.SIM;
  if(VG_FILTRO==="nao")     return st===VG_ST.NAO;
  return true;
}

/* ==================== AVISOS — Fase 8 ====================
   Pura de proposito, e por isso mora aqui e nao no 30-render: ela responde sem
   tocar no DOM, e e ela que decide se o botao existe. Sem as tres chaves nao ha
   o que inscrever, e um botao que so pode falhar e pior do que botao nenhum. */
function avisosConfigurados(){
  return !!(typeof AVISOS !== "undefined" && AVISOS && AVISOS.URL && AVISOS.ANON && AVISOS.VAPID);
}
