/* CRONOGRAMA — 30-render.js
   Apresentacao: os render*, e os handlers presos ao DOM (marcar, editar,
   apagar, trocar de aba). Nenhuma regra de dominio mora aqui: quem decide o
   que e verdade sao 20-regras.js e 10-nucleo.js; aqui so se desenha e se
   reage ao toque na tela. */
function toggleCheck(id){checks[id]=!checks[id];save("cron:checks:"+dateKey,checks);renderHoje();}

/* ================== O QUE FICOU PARA TRAS ==================
   As marcacoes do dia sao por DATA (cron:checks:AAAA-MM-DD). Isso e certo — o
   dia de ontem nao pode ser reescrito por um toque de hoje —, mas tem um
   custo: a tarefa que nao foi marcada simplesmente evapora com o dia. Nunca
   houve onde ve-la de novo.

   A JANELA E DE SETE DIAS, E ELA MESMA E A REGRA. Passados sete dias o item
   sai sozinho, sem ninguem dispensar nada. Nao ha ritual noturno para
   alimentar e nao ha lista que so cresce: o esquecimento e o padrao, e as duas
   acoes existem para as excecoes.

   MARCAR GRAVA NA DATA DE ORIGEM, e nao em hoje. Se a aula de quarta foi dada
   e voce so lembrou no sabado, quem recebe a marca e a quarta. Marcar em hoje
   faria a semana mentir duas vezes: quarta vazia e sabado cheio.

   ISTO NAO VIAJA, e nao e esquecimento: cron:checks: sempre foi por aparelho,
   e nada aqui muda o que atravessa. O bloco le e escreve a mesma chave que a
   aba Hoje ja usava.
   =========================================================== */
function marcarAtrasada(dia, id){
  var ck = LS("cron:checks:"+dia, {}) || {};
  ck[id] = true;
  save("cron:checks:"+dia, ck);
  if(dia === dateKey) checks = ck;
  renderHoje();
}
function dispensarAtrasada(dia, id){
  var disp = podarDispensados();
  disp[dia+"|"+id] = true;
  save(ATRASO_KEY, disp);
  renderHoje();
}
function renderAtrasadas(){
  var a = atrasadas();
  if(!a.length) return "";
  var aberto = LS("cron:atrasadas-open", false);
  /* O ROTULO DIZ O OBJETO, e por duas razoes. A revisao dominical tem um bloco
     chamado "Ficou para tras" que cobre prioridades, rotinas E sugestoes nao
     adotadas; este aqui cobre SO rotinas. Dois blocos com o mesmo nome e
     escopos diferentes apareciam juntos na tela de domingo.
     E A FLEXAO NAO PODE SER MONTADA POR CONCATENACAO. O plural de "ficou" e
     "ficaram": troca o radical, nao ganha sufixo. Colar "ram" no singular
     produzia uma forma que nao existe em portugues, e nenhum sufixo resolveria
     — o verbo e irregular. Passando a contagem para o substantivo ("1 rotina",
     "3 rotinas") o problema deixa de existir por construcao, e o teste guarda
     a forma errada para que ela nao volte. */
  var um = a.length === 1;
  var h = '<details class="carry recolhido" '+(aberto?"open":"")+
          ' ontoggle="save(\'cron:atrasadas-open\', this.open)">'+
          '<summary>'+a.length+(um?' rotina n\u00e3o marcada':' rotinas n\u00e3o marcadas')+
          '<span class="c-sub">nos \u00faltimos '+ATRASO_DIAS+' dias \u00b7 '+
            (um?'some sozinha':'somem sozinhas')+' depois disso</span>'+
          '</summary><div class="c-corpo">';
  a.forEach(function(o){
    h += '<div class="carry-i">'+
         '<span class="carry-dia">'+o.nome.slice(0,3)+' '+Number(o.dia.slice(8,10))+'</span>'+
         '<span class="carry-t">'+escapeHtml(o.t)+'</span>'+
         '<span class="carry-acoes">'+
         '<button class="carry-b" onclick="marcarAtrasada(\''+o.dia+'\',\''+o.id+'\')">marcar</button>'+
         '<button class="carry-b" onclick="dispensarAtrasada(\''+o.dia+'\',\''+o.id+'\')">dispensar</button>'+
         '</span></div>';
  });
  return h + '</div></details>';
}
function renderOrdo(){
  const romans=["I","II","III","IV"], labels=["livre","livre","EBD","EBD"];
  document.getElementById("ordo").innerHTML = romans.map((r,i)=>{
    const wk=i+1, cls=["ordo-seg"];
    if(wk>=3) cls.push("sprint"); if(wk===wom) cls.push("now");
    return `<div class="${cls.join(' ')}"><span class="rom">${r}</span><span class="lbl">${labels[i]}</span></div>`;
  }).join("");
  const notes={
    livre:"Semanas I–II · produção livre: artigo, pós-doc, agentes, técnico, Acolher.",
    ebd1:"Semana III · sprint EBD acende — Momento 1 (Cowork).",
    ebd2:"Semana IV · sprint EBD — Momento 2: revisar e formatar o material do mês seguinte."
  };
  document.getElementById("phase-note").textContent=notes[phase];
}
function tag(t){return t?`<span class="tag">${t}</span>`:"";}
function toggleGuia(fid,i){
  const g=TOEFL_GUIA[fid]; if(!g) return;
  const it=g.itens[i]; if(!it) return;
  marcarGuia(it.id, !guiaFeito(it.id));
  try{ renderProcessos(); }catch(e){}
  renderHoje();
}
/* ---- Migracao das marcas por posicao, uma vez por aparelho ----
   {0:true, 3:true} em f1 vira f1-conta e f1-diagnostico.

   SO O QUE E EXATAMENTE `true` SOBE. Ausencia e false no formato antigo querem
   dizer "nunca marcado", que nao e uma decisao: publica-los como feito:false
   deixaria um aparelho que migrasse depois apagar marca legitima de outro. Como
   so sobem as verdadeiras, dois aparelhos migrando em ordens diferentes
   produzem UNIAO, nunca subtracao.

   As chaves antigas ficam onde estao. */
/* A DESCIDA DO GUIA. Funcao propria, no molde do aplicarPrioridadesDoEstado:
   e o que permite ao teste exercitar a chegada sem rede nenhuma.
   Devolve true se algo mudou aqui. */
function recalibrarToefl(){
  const r = calcularRecalibragem();
  if(!r){ alert("A prova j\u00e1 passou \u2014 n\u00e3o h\u00e1 o que recalibrar."); return; }
  save(RECALIBRE_KEY, r);
  try{ renderProcessos(); }catch(e){}
  renderHoje();
}
/* O AVISO. E tudo o que restou do calendario: ele diz o que previa e nao manda
   mais em nada. So aparece quando a previsao e o estado real divergem —
   batendo, nao ha o que avisar. */
function renderRecalibragem(){
  const r = LS(RECALIBRE_KEY, null);
  if(!r || !r.janelas || !r.janelas.length) return "";
  const nomes = r.janelas.map(j=>TOEFL_ROTULO[j.fid].fase.replace(/ \u00b7 .*$/, "")+" at\u00e9 "+fmtData(j.ate));
  return `<div class="aviso-cal"><b>${r.porSemana}</b> tarefa${r.porSemana===1?"":"s"} por semana \u2014
    ${r.restantes} pendente${r.restantes===1?"":"s"} em ${r.semanas} semana${r.semanas===1?"":"s"}.
    <span style="display:block;margin-top:3px;color:var(--muted);">${escapeHtml(nomes.join(" \u00b7 "))}
    \u00b7 recalibrado em ${fmtData(String(r.quando).slice(0,10))}</span></div>`;
}
/* O CORPO DO PROCESSO TOEFL. E a mesma funcao de antes — nucleo, reforco,
   aviso do calendario, recalibragem e links —, com uma unica mudanca de forma:
   ela deixou de ser um <details> dentro do Hoje e passou a ser a secao da aba
   Processos. Nenhuma linha de logica foi reimplementada em outro lugar; se
   houvesse duas versoes disto, uma das duas comecaria a mentir. */
function renderGuia(){
  const fid=currentFaseId(); if(!fid) return "";
  const g=TOEFL_GUIA[fid]; if(!g) return "";
  const itens=guiaItens(fid);
  const nucleo=itens.filter(x=>x.nucleo), reforco=itens.filter(x=>!x.nucleo);
  const faltaN=nucleo.filter(x=>!x.feito).length;
  const linha=(x)=>`<div class="g-item ${x.feito?'on':''}" onclick="toggleGuia('${fid}',${x.i})">
      <span class="box">${CHK}</span><span class="g-x">${escapeHtml(x.t)}</span></div>`;
  let h=`<div class="g-body"><p class="g-meta">${g.meta}</p>`;
  h+=avisoDoCalendario();
  h+=`<div class="g-grupo primeiro">N\u00facleo <em>\u00b7 ${
        faltaN ? "trava o avan\u00e7o para a pr\u00f3xima fase" : "cumprido"}</em></div>`;
  nucleo.forEach(x=>{ h+=linha(x); });
  if(reforco.length){
    h+=`<div class="g-grupo">Refor\u00e7o <em>\u00b7 vale a pena, n\u00e3o trava nada</em></div>`;
    reforco.forEach(x=>{ h+=linha(x); });
  }
  h+=renderRecalibragem();
  /* O botao de recalibrar saiu daqui e virou `acoes` do processo — e uma acao
     sobre o processo inteiro, e nao um item do guia. A funcao chamada e a
     mesma, recalibrarToefl(), sem copia. */
  h+=`<div class="g-links">`;
  g.links.forEach(l=>{ h+=`<a href="${l.u}" target="_blank" rel="noopener">${l.t} \u2197</a>`; });
  h+=`</div></div>`;
  return h;
}

/* ============== PROCESSOS — Fase 4 ==============
   PROCESSO E A ESTRUTURA COMPLETA DE UM TRABALHO COMPLEXO. HOJE E A ACAO QUE
   PRECISA SER FEITA AGORA. Ate aqui as duas coisas moravam na mesma tela: o
   guia inteiro do TOEFL — fase, meta, nucleo, reforco, calendario,
   recalibragem e links — abria numa gaveta dentro do Hoje.

   O REGISTRO ABAIXO NAO E UMA ABSTRACAO GENERICA, e nao deve virar uma
   enquanto houver um processo so. Ele e uma lista com quatro funcoes por
   entrada, todas ja existentes no caso do TOEFL. Quando o Notre Dame chegar,
   ele implementa as mesmas quatro e entra na lista; se nessa hora o contrato
   nao servir, ele muda com dois casos reais na mao, que e a unica hora em que
   se sabe qual abstracao serve. */
function alternarProcesso(pid, aberto){
  save("cron:processo-open:"+pid, !!aberto);
}

function renderProcessos(){
  const alvo=document.getElementById("view-processos"); if(!alvo) return;
  let h='<p class="plate-eyebrow">Processos</p>'+
        '<h1 class="plate-day" style="font-size:30px;margin-bottom:6px;">O que est\u00e1 em curso</h1>'+
        '<p class="plate-eixo">A estrutura inteira. A a\u00e7\u00e3o do dia fica no Hoje.</p>';
  processosVisiveis().forEach(function(P){
    const r = P.resumo ? P.resumo() : null;
    const aberto = processoAberto(P.id);
    /* O processo diz se pede algo hoje; a aba nao adivinha. O derivado de
       trilho devolve null sempre, e por isso Processos nunca cria tarefa. */
    const acao = P.acaoDoDia ? P.acaoDoDia(todayIdx) : null;
    /* O contador da direita so faz sentido com numero. O TOEFL conta os dias
       ate a prova; um trilho conta os dias desde o ultimo avanco, e pode nao
       ter nenhum ainda. */
    const dias = (r && typeof r.dias === "number")
      ? r.dias+" dia"+(r.dias===1?"":"s") : "\u2014";
    h += '<details class="proc" '+(aberto?"open":"")+
         ' ontoggle="alternarProcesso(\''+P.id+'\', this.open)">'+
         '<summary><span class="proc-t">'+escapeHtml(P.titulo)+'</span>'+
           '<span class="proc-sub">'+(r ? escapeHtml(r.fase) : "sem fase")+'</span>'+
           '<span class="proc-n">'+dias+'</span>'+
         '</summary><div class="proc-corpo">';
    h += P.linhas ? P.linhas(r) : "";
    if(acao){
      /* A ACAO DE HOJE APARECE AQUI TAMBEM, mas so como leitura: quem executa
         e o Hoje, e a caixa de marcar mora la. Repetir a caixa criaria dois
         lugares para marcar a mesma coisa. */
      h += '<div class="proc-linha agora"><span class="pl-r">Agora</span>'+
           '<span class="pl-v">'+escapeHtml(acao.t)+
           ' <button class="proc-ir" onclick="setView(\'hoje\')">ver no Hoje \u203A</button></span></div>';
    }
    h += P.corpo ? P.corpo() : "";
    h += P.acoes ? P.acoes() : "";
    h += '</div></details>';
  });
  alvo.innerHTML = h;
}
/* O cartao de uma prioridade. Se ela aponta para um trilho, o texto grande e
   o ESTAGIO REAL, lido agora, e a caixa e a mesma do trilho — marcar aqui e
   marcar la, pelo marcarDoHoje, sem nenhum mecanismo paralelo. */
function cartaoDePrioridade(p){
  var corpo = "", acoes = "";
  if(p.tipo === "trilho"){
    var et = estagioDoTrilho(p.painel, p.projId);
    var P = painelDef(p.painel);
    var legenda = escapeHtml(p.t || (et && et.projT) || p.projId);
    if(!et){
      corpo = '<div class="pr-t">' + legenda + '</div>' +
              '<div class="pr-vazio">este projeto n\u00e3o est\u00e1 mais no trilho</div>';
    } else if(et.concluido){
      corpo = '<div class="pr-t">' + legenda + '</div>' +
              '<div class="pr-vazio">trilho conclu\u00eddo</div>';
    } else {
      var selo = et.prova === "estrela"
        ? '<span class="pr-estrela" title="esta etapa depende de uma decis\u00e3o sua: o pipeline n\u00e3o a fecha sozinho">depende de voc\u00ea</span>' : "";
      corpo = '<div class="pr-t">' + legenda + '</div>' +
              '<div class="sub st-' + et.st + '" onclick="event.stopPropagation();marcarDoHoje(\''+p.painel+'\',\''+p.projId+'\',\''+et.subId+'\',true)">' +
                '<span class="st-dot" title="marcar como conclu\u00edda"></span>' +
                '<div class="sub-text">' + escapeHtml(et.subT) + '</div>' + selo +
              '</div>';
      acoes = '<button class="ptr" onclick="event.stopPropagation();irAoTrilho(\''+p.painel+'\',\''+p.projId+'\')">' +
              (P?escapeHtml(P.titulo):p.painel) + '<span class="seta">\u203a</span></button>';
    }
  } else {
    /* A conclusao vem da PRIORIDADE, e nao do `checks` do dia. Marcada hoje,
       ela aparece marcada; marcada antes de hoje, ela nem chega aqui — o
       prioridadesDoDia ja a tirou da tela. */
    var feito = !!p.feito_em && p.feito_em === dateKey;
    corpo = '<div class="pr-livre ' + (feito?"done":"") + '" onclick="togglePrioridadeFeita(\''+p.id+'\')">' +
              '<span class="box">' + CHK + '</span>' +
              '<div class="pr-t" contenteditable="true" onclick="event.stopPropagation()"' +
              ' onblur="editPrioridade(\''+p.id+'\',this.innerText)">' + escapeHtml(p.t) + '</div>' +
            '</div>';
  }
  return '<div class="pr-card">' +
    '<button class="pr-x" onclick="delPrioridade(\''+p.id+'\')" aria-label="Tirar das prioridades">&times;</button>' +
    corpo + acoes + '</div>';
}
/* O CARTAO DE UMA SUGESTAO. Tem de ser reconhecivel como sugestao NUM RELANCE,
   e nao depois de ler: borda tracejada, o rotulo "sugestão", a classe e o
   motivo. Voce precisa distinguir "eu escolhi isto" de "o sistema esta
   propondo isto" sem pensar.

   A acao mostrada continua sendo o ESTAGIO REAL do trilho, lido agora — a
   sugestao aponta para painel + projeto, e nunca para um texto. */
function cartaoDeSugestao(sg){
  var et = estagioDoTrilho(sg.painel, sg.projId);
  if(!et || et.concluido) return "";       /* fechou entre o calculo e o desenho */
  var P = painelDef(sg.painel);
  var selo = et.prova === "estrela"
    ? '<span class="pr-estrela" title="esta etapa depende de uma decis\u00e3o sua: o pipeline n\u00e3o a fecha sozinho">depende de voc\u00ea</span>' : "";
  /* Contexto ANOTA e nao rebaixa: o cartao continua onde esta, com o aviso. */
  var ctx = (getContexto() === "fora" && sg.pedeComputador)
    ? '<span class="ctx-aviso">pede computador</span>' : "";
  return '<div class="pr-card sugerida">' +
    '<div class="sug-cab"><span class="sug-tag">sugest\u00e3o</span>' +
      '<span class="sug-motivo">' + escapeHtml(sg.motivo) + '</span></div>' +
    '<div class="pr-t">' + escapeHtml(sg.projT || sg.projId) + '</div>' +
    '<div class="sub st-' + et.st + '" onclick="event.stopPropagation();marcarDoHoje(\''+sg.painel+'\',\''+sg.projId+'\',\''+et.subId+'\',true)">' +
      '<span class="st-dot" title="marcar como conclu\u00edda"></span>' +
      '<div class="sub-text">' + escapeHtml(et.subT) + '</div>' + selo +
    '</div>' + ctx +
    '<div class="sug-acoes">' +
      '<button class="carry-b" onclick="adotarSugestao(\''+sg.painel+'\',\''+sg.projId+'\')">adotar como prioridade</button>' +
      '<button class="carry-b" onclick="dispensarSugestao(\''+sg.painel+'\',\''+sg.projId+'\')">agora n\u00e3o</button>' +
      '<button class="ptr" onclick="event.stopPropagation();irAoTrilho(\''+sg.painel+'\',\''+sg.projId+'\')">' +
        (P?escapeHtml(P.titulo):sg.painel) + '<span class="seta">\u203A</span></button>' +
    '</div></div>';
}

function renderPrioridades(){
  var pr = prioridadesDoDia();
  /* MANUAIS SEMPRE ANTES, e em bloco separado. Concatenar as duas listas num
     array so foi o que a Fase 2 fez enquanto sugeridas era vazio; agora que o
     motor devolve coisas, misturar deixaria de ser seguro — bastaria uma
     ordenacao futura para uma sugestao subir acima de uma escolha sua. Dois
     blocos e uma garantia estrutural, e nao uma regra para lembrar. */
  var h = '<div class="shead prio-head">Prioridades da semana' +
          '<span class="prio-sem">' + semanaAtual.replace("-W", " \u00b7 semana ") + '</span></div>';
  if(!pr.manuais.length && !pr.sugeridas.length){
    h += '<div class="prio-vazio"><b>Nenhuma prioridade esta semana.</b>' +
         'O que voc\u00ea escolher aqui fica acima das rotinas, em todos os aparelhos.</div>';
  }
  if(pr.manuais.length){
    h += '<div class="prio-lista">' + pr.manuais.map(cartaoDePrioridade).join("") + '</div>';
  }
  if(pr.sugeridas.length){
    h += '<div class="sug-head">' + (pr.manuais.length ? "O sistema tamb\u00e9m sugere"
         : "O sistema sugere") + '<span>voc\u00ea decide se entra</span></div>' +
         '<div class="prio-lista">' + pr.sugeridas.map(cartaoDeSugestao).join("") + '</div>';
  }
  /* O seletor lista os projetos ATIVOS de todos os paineis. Escolher e um
     toque; nao ha formulario. */
  var ops = '<option value="">+ eleger um projeto do trilho\u2026</option>';
  PAINEIS.forEach(function(P){
    var ativos = projetosAtivos(P.id);
    if(!ativos.length) return;
    ops += '<optgroup label="' + escapeHtml(P.titulo) + '">';
    ativos.forEach(function(pj){
      ops += '<option value="' + P.id + '/' + pj.id + '">' + escapeHtml(pj.t || pj.id) + '</option>';
    });
    ops += '</optgroup>';
  });
  h += '<div class="prio-add">' +
       '<select onchange="addPrioridadeTrilho(this.value);this.value=\'\'">' + ops + '</select>' +
       '<button onclick="addPrioridadeLivre()">+ texto livre</button></div>';
  return h;
}
function renderRetomadas(){
  var r = retomadas();
  if(!r.length) return "";
  var aberto = LS("cron:retomadas-open", false);
  var h = '<details class="carry retomadas" ' + (aberto?"open":"") +
          ' ontoggle="save(\'cron:retomadas-open\', this.open)">' +
          '<summary>' + r.length + ' projeto' + (r.length===1?'':'s') + ' sem avan\u00e7o' +
          '<span class="c-sub">h\u00e1 ' + RETOMADA_DIAS + ' dias ou mais \u00b7 lembrete, n\u00e3o cobran\u00e7a</span>' +
          '</summary><div class="c-corpo">';
  r.forEach(function(o){
    h += '<div class="ret-i">' +
         '<div class="ret-cab"><span class="ret-dias">' + o.dias + ' dias</span>' +
         '<span class="ret-proj">' + escapeHtml(o.projT || o.projId) + '</span></div>' +
         '<div class="ret-sub">' + escapeHtml(o.subT) + '</div>' +
         '<div class="ret-acoes">' +
           '<button class="carry-b" onclick="promoverRetomada(\''+o.pid+'\',\''+o.projId+'\')">tornar prioridade</button>' +
           '<button class="carry-b" onclick="adiarRetomada(\''+o.pid+'\',\''+o.projId+'\')">agora n\u00e3o</button>' +
         '</div></div>';
  });
  return h + '</div></details>';
}
/* ============== REVISAO DOMINICAL — Fase 5 ==============
   DOMINGO E INFORMACAO. SEGUNDA E DECISAO. Esta tela mostra o que aconteceu,
   o que ficou aberto e o que merece atencao — e para por ai. Ela nao escolhe
   prioridade, nao cria tarefa, nao grava nada e nao diz o que fazer na semana
   que vem. Dizer "Patriotismo ficou 18 dias sem avanco" e informacao; dizer
   "trabalhe em Patriotismo" seria decidir por voce.

   E DERIVADA, INTEIRA. Nenhuma chave nova de localStorage, nenhum tipo de
   toque, nenhuma copia do resumo guardada em lugar nenhum. Calcular a revisao
   duas vezes seguidas nao muda um byte do aparelho — ha teste disso.

   CADA COISA VEM DA SUA FONTE DE VERDADE, e nao de uma heuristica nova:
     etapa de trilho  -> cron:registro (o diario) + st do subitem (o saldo)
     prioridade livre -> cron:checks, o mesmo mecanismo de sempre
     rotina           -> cron:checks, pelo atrasadas() que ja existia
     meta             -> a meta, com o seu proprio `done`
     processo         -> toeflFase(), o resumo que o processo ja publica
   ======================================================== */
/* JANELA DE 14 DIAS, e nao os 7 dias literais da semana seguinte. O bloco se
   chama "Proxima semana" porque e assim que se olha para a frente no domingo,
   mas catorze dias e o alcance que faz o aviso chegar a tempo: um prazo que cai
   na terca da semana DEPOIS ja precisa ser visto agora, e nao no domingo
   seguinte, quando faltariam dois dias. */

function _revLinha(txt, sub){
  return '<div class="rev-i"><span class="rev-t">'+txt+'</span>'+
         (sub ? '<span class="rev-s">'+sub+'</span>' : '')+'</div>';
}
function renderRevisao(){
  var R = revisaoDaSemana();
  var per = fmtData(R.seg) + " a " + fmtData(R.dom);
  var h = '<div class="shead">Revis\u00e3o da semana</div>'+
          '<p class="rev-per">Semana de '+per+
          (R.emCurso ? ' \u00b7 <i>em curso</i>' : '')+'</p>';
  var C = R.concluido, A = R.atras, T = R.atencao, F = R.frente;

  /* ---- CONCLUIDO ---- */
  h += '<div class="rev-b"><div class="rev-h">Conclu\u00eddo</div>';
  var nadaFeito = !C.etapas.length && !C.metas.length && !C.rotinas && !C.prioridades.length;
  if(nadaFeito){
    h += '<div class="rev-vazio">Nada registrado nesta semana.</div>';
  } else {
    C.prioridades.forEach(function(x){
      h += _revLinha('<b>Prioridade</b> \u00b7 '+escapeHtml(x.t),
                     x.concluido ? "trilho conclu\u00eddo" : "");
    });
    C.etapas.forEach(function(e){
      h += _revLinha(escapeHtml(e.projT), escapeHtml(e.subT));
    });
    C.metas.forEach(function(m){ h += _revLinha('<b>Meta</b> \u00b7 '+escapeHtml(m.t), ""); });
    if(C.rotinas){
      /* O rotulo nao e enfeite: cron:checks: e por aparelho, e o numero seria
         outro no celular. */
      h += '<div class="rev-local">'+C.rotinas+' rotina'+(C.rotinas===1?'':'s')+
           ' conclu\u00edda'+(C.rotinas===1?'':'s')+' \u00b7 <i>neste aparelho</i></div>';
    }
  }
  h += '</div>';

  /* ---- FICOU PARA TRAS ---- */
  h += '<div class="rev-b"><div class="rev-h">Ficou para tr\u00e1s</div>';
  if(!A.prioridades.length && !A.rotinas.length && !A.sugeridas.length){
    h += '<div class="rev-vazio">Nada em aberto.</div>';
  } else {
    A.prioridades.forEach(function(x){
      h += _revLinha('<b>Prioridade</b> \u00b7 '+escapeHtml(x.t),
                     x.etapa ? escapeHtml(x.etapa) : "sem avan\u00e7o registrado");
    });
    if(A.rotinas.length){
      /* O NOME DA TAREFA, E NAO O DIA. A primeira versao mostrava "Qua 26 ·
         Qua 26 · Qua 26": o atrasadas() devolve uma linha por TAREFA, entao
         tres tarefas do mesmo dia viravam o mesmo rotulo tres vezes, dizendo
         nada. Nomes distintos dizem o que ficou. */
      var vistos = {}, nomes = [];
      A.rotinas.forEach(function(o){
        if(nomes.length >= 3 || vistos[o.t]) return;
        vistos[o.t] = true; nomes.push(escapeHtml(o.t));
      });
      h += _revLinha(A.rotinas.length+' rotina'+(A.rotinas.length===1?'':'s')+
                     ' n\u00e3o marcada'+(A.rotinas.length===1?'':'s'),
                     nomes.join(" \u00b7 ") + (A.rotinas.length>nomes.length ? " \u2026" : ""));
    }
    if(A.sugeridas.length){
      /* SUGESTAO NAO E ESCOLHA SUA, e a frase precisa deixar isso obvio. */
      h += _revLinha('O sistema sugeriu ' +
             A.sugeridas.map(function(x){ return escapeHtml(x.projT || x.projId); }).join(" e "),
             A.sugeridas.length===1 ? "n\u00e3o foi adotada" : "nenhuma foi adotada");
    }
  }
  h += '</div>';

  /* ---- ATENCAO ---- */
  h += '<div class="rev-b"><div class="rev-h">Aten\u00e7\u00e3o</div>';
  if(!T.paradas.length && !T.processos.length){
    h += '<div class="rev-vazio">Nada parado.</div>';
  } else {
    T.paradas.forEach(function(o){
      h += _revLinha(escapeHtml(o.projT || o.projId)+' \u00b7 '+o.dias+' dias sem avan\u00e7o',
                     escapeHtml(o.subT));
    });
    T.processos.forEach(function(o){
      h += _revLinha(escapeHtml(o.titulo)+' \u00b7 '+escapeHtml(o.fase),
                     o.falta ? o.falta+(o.falta===1?' item':' itens')+
                               ' do n\u00facleo pendente'+(o.falta===1?'':'s')
                             : 'n\u00facleo cumprido');
    });
  }
  h += '</div>';

  /* ---- PROXIMA SEMANA ----
     LISTA O QUE VEM, e nao o que fazer. Nenhuma frase aqui e imperativa: a
     decisao da semana que comeca continua sendo da segunda-feira, sua. */
  h += '<div class="rev-b"><div class="rev-h">Pr\u00f3xima semana</div>';
  var temFrente = F.eventos.length || F.prazos.length || (F.vagas && F.vagas.total);
  if(!temFrente){
    h += '<div class="rev-vazio">Nada marcado nos pr\u00f3ximos '+REVISAO_HORIZONTE+' dias.</div>';
  } else {
    F.eventos.forEach(function(e){
      h += _revLinha(escapeHtml(e.t) || '<i>sem nome</i>',
                     e.dias===0 ? "hoje" : "em "+e.dias+" dia"+(e.dias===1?"":"s"));
    });
    F.prazos.forEach(function(v){
      h += _revLinha(escapeHtml(v.titulo||""),
                     "prazo em "+(v.dias_ate_prazo!=null?v.dias_ate_prazo:"?")+" dias");
    });
    if(F.vagas && F.vagas.total){
      var partes = [];
      if(F.vagas.novas)   partes.push(F.vagas.novas+" nova"+(F.vagas.novas===1?"":"s")+" na semana");
      if(F.vagas.revisar) partes.push(F.vagas.revisar+" para revisar");
      h += '<div class="rev-local">Vagas \u00b7 '+
           (partes.join(" \u00b7 ") || "nada novo nesta semana")+'</div>';
    }
  }
  h += '</div>';
  return h;
}

function renderContexto(){
  var c = getContexto();
  return '<div class="ctx-barra">' +
    '<button class="' + (c==="casa"?"on":"") + '" onclick="setContexto(\'casa\')">Em casa</button>' +
    '<button class="' + (c==="fora"?"on":"") + '" onclick="setContexto(\'fora\')">Fora de casa</button>' +
    '<span class="ctx-nota">' + (c==="fora"
      ? "s\u00f3 o telefone \u00b7 o que pede computador fica marcado"
      : "computador e telefone \u00b7 voc\u00ea escolhe") + '</span></div>';
}
function renderHoje(){
  const d=DIAS[todayIdx];
  const dateStr=now.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"});
  let html="";
  html+=`<p class="plate-eyebrow">Hoje</p>`;
  html+=`<h1 class="plate-day">${d.nome}</h1>`;
  html+=`<p class="plate-eixo">${d.eixo}</p>`;
  html+=`<p class="plate-date">${dateStr.charAt(0).toUpperCase()+dateStr.slice(1)}</p>`;
  d.anchors.forEach(a=>{html+=`<div class="anchor"><span class="t">${a.t}</span><span class="n">${a.n}</span></div>`;});
  if(phase!=="livre"){
    html+=`<div class="sprint-card"><div class="lead">Sprint EBD — material do próximo mês</div>`;
    if(phase==="ebd1"){
      html+=`<div class="momento"><span class="m-n">1</span><span class="m-t"><b>Rodar o Cowork</b> para estruturar todo o material do mês seguinte.<span>Pode ser no Uber. Um dia dedicado.</span></span></div>`;
      html+=`<div class="momento"><span class="m-n">2</span><span class="m-t">Ler, avaliar, editar e formatar.<span>Chega na semana IV — bloco protegido, fora do Uber.</span></span></div>`;
    } else {
      html+=`<div class="momento"><span class="m-n">1</span><span class="m-t">Estrutura via Cowork <b>já feita</b> na semana III.</span></div>`;
      html+=`<div class="momento"><span class="m-n">2</span><span class="m-t"><b>Ler, avaliar, editar e formatar</b> plano de aula, material do aluno e texto base.<span>Deve sair pronto antes de virar o mês.</span></span></div>`;
    }
    html+=`</div>`;
  }
  /* O banner FICA no Hoje: dias ate a prova, fase corrente e quanto falta no
     nucleo sao contexto de EXECUCAO — o que voce precisa saber para fazer a
     tarefa de hoje. A estrutura (nucleo, reforco, calendario, recalibragem,
     links) saiu para a aba Processos. */
  /* A ACAO PRIMEIRO, O CONTEXTO DEPOIS (Fase 9A). O cartao diz o que fazer e
     para onde ir; o banner continua dizendo onde voce esta na preparacao. Os
     dois so aparecem depois do D0 — antes da estreia o TOEFL nao pede nada, e
     e o proprio atividadeDoDia() que devolve vazio. */
  html+=renderToeflHoje();
  const temToefl = d.tasks.some(t=>t.processo==="toefl") && toeflComecou();
  if(temToefl){ const f=toeflFase(); if(f){
    html+=`<div class="toefl-fase">TOEFL · faltam ${f.dias} dia${f.dias===1?"":"s"} (~${f.sem} sem) · <b>${f.fase}</b><span>${
      f.falta ? "faltam "+f.falta+" do núcleo para a fase avançar. "+f.foco : "núcleo cumprido. "+f.foco}</span></div>`;
  }}
  /* O aviso da esteira NAO vem aqui: o bloco de metas, que e desenhado dentro
     desta mesma aba, ja o traz. Duas vezes na mesma tela e uma vez a mais. */
  /* NO DOMINGO A REVISAO E A TELA. Ela vem antes de tudo porque o domingo nao
     tem trilho, nao tem TOEFL e tem duas rotinas — e porque o que importa no
     domingo e olhar para tras, nao executar. Nao ha caixa para marcar: a
     revisao acontece por existir. */
  if(todayIdx === 0) html+=renderRevisao();
  html+=renderContexto();
  /* PRIORIDADES ANTES DAS ROTINAS. A ordem no HTML e a garantia: o que voce
     elegeu aparece primeiro, e nenhum calculo pode empurra-lo para baixo
     porque nao ha calculo nenhum entre os dois blocos. */
  html+=renderPrioridades();
  html+=`<div class="shead">Rotinas de ${d.nome.toLowerCase()}</div>`;
  html+=`<ul class="tasks">`;
  const pc=pecaDoMes();
  d.tasks.forEach(t=>{
    const done=!!checks[t.id];
    let extra="";
    /* A ACAO CONCRETA VEM DO PROCESSO. A rotina so diz de qual processo o dia
       depende; o texto e resolvido agora, na fonte. O id NAO muda — e ele que
       o cron:checks: usa, e mudar o id apagaria a marcacao de hoje e o
       historico do "ficou para tras". */
    let titulo=t.t, nota=t.n;
    if(t.processo){
      const ac=acaoDoDiaDoProcesso(t.processo);
      if(!ac) return;                  /* processo nao pede nada neste dia */
      titulo=ac.t; nota=ac.n;
      extra+=`<button class="ptr" onclick="event.stopPropagation();setView('processos')">${
        escapeHtml(ac.titulo)}<span class="seta">\u203A</span></button>`;
    }
    extra+=avisoDeContexto(t);
    /* `painel` NAVEGA E NAO ESCOLHE. E o que sobrou das rotinas academicas
       depois da Fase 2: o botao continua levando ao trilho, mas quem diz em
       qual artigo trabalhar e a prioridade, la em cima. */
    const alvoPainel = t.link || t.painel;
    if(alvoPainel){
      const P=painelDef(alvoPainel);
      /* `link` ainda desenha o estagio, mas so onde nao ha escolha a fazer.
         Com dois projetos ativos o trilhoSemEscolha devolve null e a rotina
         fica sendo rotina. */
      const prox = t.link ? trilhoSemEscolha(t.link) : null;
      if(t.link==="pipeline" && pc){
        extra+=`<div class="task-live">${pc.proxima?"a seguir \u00b7 ":""}${escapeHtml(pc.curto)}</div>`;
      }
      if(prox && !prox.concluido){
        const selo = prox.vida && prox.vida!=="ativo"
          ? `<span class="sub-onde">${escapeHtml(VIDA_LBL[prox.vida]||prox.vida)}</span>` : "";
        extra+=`<div class="sub st-${prox.st}" onclick="event.stopPropagation();marcarDoHoje('${prox.pid}','${prox.projId}','${prox.subId}',true)">
          <span class="st-dot" title="marcar como conclu\u00edda"></span>
          <div class="sub-text">${escapeHtml(prox.subT)}</div>${selo}</div>`;
      }
      const alvo=(alvoPainel==="pipeline"&&pc)?`'${pc.id}'`:(prox?`'${prox.projId}'`:"null");
      extra+=`<button class="ptr" onclick="event.stopPropagation();irAoTrilho('${alvoPainel}',${alvo})">${P?P.titulo:alvoPainel}<span class="seta">\u203A</span></button>`;
    }
    html+=`<li class="task ${done?'done':''}" onclick="toggleCheck('${t.id}')">
      <span class="box">${CHK}</span>
      <div class="task-body"><div class="task-title">${titulo}</div>${nota?`<div class="task-note">${nota}</div>`:""}${extra}</div>
      ${tag(t.tag)}</li>`;
  });
  html+=`</ul>`;
  html+=renderRetomadas();
  /* O PAINEL DE ROTINAS NAO MARCADAS SAIU DA TELA, e so da tela: renderAtrasadas,
     atrasadas, marcarAtrasada, dispensarAtrasada e podarDispensados continuam
     inteiros logo acima, e cron:hoje-dispensados nao foi tocada. Basta
     descomentar esta linha para o painel voltar.

     A implementacao fica porque atrasadas() NAO e so deste painel: a revisao
     dominical a usa para montar o bloco "Ficou para tras" (ver revisaoDaSemana,
     em 20-regras.js). Apagar a funcao levaria junto um pedaco do domingo. */
  /* html+=renderAtrasadas(); */
  /* O renderGuia() saiu daqui na Fase 4: ele e a ESTRUTURA do processo, e
     estrutura mora em Processos. O Hoje ficou com a execucao. */
  html+=`<div class="rule"><b>No Uber:</b> ${d.uber} </div>`;
  html+=`<div id="metas-wrap"></div>`;
  html+=`<div class="shead">Datas importantes</div><div id="eventos"></div>`;
  html+=renderVagasIndicador();
  document.getElementById("view-hoje").innerHTML=html;
  renderMetas(); renderEventos();
}
function renderMetas(){
  const wrap=document.getElementById("metas-wrap"); if(!wrap)return;
  const corrente = mesAtivo===monthKey;
  let h=`<div class="shead">Metas do mês
    <select class="mes-sel" onchange="trocarMes(this.value)">`;
  listaMeses().forEach(function(k){
    h+=`<option value="${k}" ${k===mesAtivo?"selected":""}>${mesLabel(k)}${k===monthKey?" (atual)":""}</option>`;
  });
  h+=`</select></div>`;
  if(!corrente) h+=`<div class="offmonth">Você está ${mesAtivo<monthKey?"revendo":"planejando"} ${mesLabel(mesAtivo)}. O mês atual é ${mesLabel(monthKey)}.
    <button class="voltar" onclick="trocarMes('${monthKey}')">voltar ao atual</button></div>`;
  /* MESMO PRINCIPIO DO TOEFL, aplicado a esteira que alimenta estas metas.
     A entrega do mes e a peca corrente; se ela ficou para tras, quem diz isso
     e um aviso — nao uma troca silenciosa de peca. O bloco de pendencias
     abaixo ja era assim desde o inicio: nenhuma meta atravessa o mes sozinha,
     e "trazer" continua sendo um ato seu. */
  if(corrente) h+=avisoDaEsteira();
  if(corrente) h+=renderPendencias();
  const metas=getMetas(); let g="";
  metas.forEach(function(m,i){
    g+=`<div class="goal ${m.done?'done':''}">
      <span class="box" onclick="toggleMeta(${i})">${CHK}</span>
      <div class="goal-text" contenteditable="true" onblur="editMeta(${i},this.innerText)">${escapeHtml(m.t)}</div>
      ${m.de?`<span class="tag-de">${escapeHtml(mesCurto(m.de))}</span>`:""}
      <button class="del" onclick="delMeta(${i})" aria-label="Remover">&times;</button></div>`;
  });
  if(!metas.length) g+=`<div class="vazio">Nenhuma meta para ${mesLabel(mesAtivo)}.</div>`;
  g+=`<button class="add-row" onclick="addMeta()">+ Nova meta para ${mesCurto(mesAtivo)}</button>`;
  wrap.innerHTML=h+g;
}
function renderPendencias(){
  const p=pendencias(); if(!p.length) return "";
  if(LS("cron:metas-aviso:"+monthKey,false)) return "";
  let h=`<div class="carry"><div class="carry-h">${p.length} meta${p.length>1?"s":""} em aberto de meses anteriores
    <button class="carry-x" onclick="dispensarAviso()" aria-label="Dispensar">&times;</button></div>`;
  p.forEach(function(o,i){
    h+=`<div class="carry-i"><span class="carry-m">${escapeHtml(mesCurto(o.mes))}</span>
      <span class="carry-t">${escapeHtml(o.meta.t)}</span>
      <button class="carry-b" onclick="trazerMeta(${i})">trazer</button></div>`;
  });
  h+=`<button class="carry-all" onclick="trazerTodas()">Trazer todas para ${mesCurto(monthKey)}</button></div>`;
  return h;
}
function trazerMeta(i){
  const o=pendencias()[i]; if(!o)return;
  const nova={id:"m"+Date.now(), t:o.meta.t, done:false, de:o.mes, em:new Date().toISOString()};
  const destino=getMetas(monthKey);
  destino.push(nova);
  setMetas(destino,monthKey);
  const origem=getMetas(o.mes).filter(function(m){return m.id!==o.meta.id;});
  setMetas(origem,o.mes);
  /* Trazer e mover: nasce uma no mes atual e morre a do mes de origem. Os
     dois toques saem juntos, senao o outro aparelho ficaria com as duas. */
  tocarMeta(monthKey,nova,false);
  tocarMeta(o.mes,o.meta,true);
  renderMetas();
}
function trazerTodas(){
  const p=pendencias(); const destino=getMetas(monthKey); const porMes={};
  const agora=new Date().toISOString(); const novas=[];
  p.forEach(function(o,n){
    const nova={id:"m"+Date.now()+"-"+n, t:o.meta.t, done:false, de:o.mes, em:agora};
    destino.push(nova); novas.push(nova);
    (porMes[o.mes]=porMes[o.mes]||[]).push(o.meta.id);
  });
  setMetas(destino,monthKey);
  Object.keys(porMes).forEach(function(k){
    setMetas(getMetas(k).filter(function(m){return porMes[k].indexOf(m.id)<0;}),k);
  });
  novas.forEach(function(m){ tocarMeta(monthKey, m, false); });
  p.forEach(function(o){ tocarMeta(o.mes, o.meta, true); });
  renderMetas();
}
function dispensarAviso(){save("cron:metas-aviso:"+monthKey,true);renderMetas();}
function trocarMes(k){mesAtivo=k;renderMetas();}
/* UMA META VIAJA POR ID, nao pela lista do mes. Se o mes inteiro viajasse,
   duas metas criadas em aparelhos diferentes no mesmo mes se apagariam: a
   ultima lista a chegar levaria a outra junto. E `del` e a lapide de uma meta
   removida — sem ela, quem apaga no celular veria a meta voltar do Mac no
   carregamento seguinte, porque ausencia nao se distingue de desconhecimento. */
function tocarMeta(mes, m, apagada){
  if(!m || !m.id) return;
  enfileirarToque("meta", {mes:mes, mid:m.id, t:m.t||"", done:!!m.done,
                           de:m.de||null, del:!!apagada});
}
function toggleMeta(i){const k=mesAtivo;const m=getMetas();if(!m[i])return;m[i].done=!m[i].done;m[i].em=new Date().toISOString();setMetas(m);tocarMeta(k,m[i],false);renderMetas();}
/* Sai do onblur do contenteditable: so enfileira se o texto mudou de verdade,
   senao cada clique fora do campo viraria um toque. */
function editMeta(i,t){const k=mesAtivo;const m=getMetas();if(!m[i])return;const novo=t.trim()||m[i].t;if(novo===m[i].t)return;m[i].t=novo;m[i].em=new Date().toISOString();setMetas(m);tocarMeta(k,m[i],false);}
function delMeta(i){const k=mesAtivo;const m=getMetas();const fora=m[i];if(!fora)return;m.splice(i,1);setMetas(m);tocarMeta(k,fora,true);renderMetas();}
/* Nasce sem texto, e por isso nao enfileira nada: o toque sai no primeiro
   editMeta, ja com o que voce escreveu. */
function addMeta(){const m=getMetas();m.push({id:"m"+Date.now(), t:"", done:false, em:new Date().toISOString()});setMetas(m);renderMetas();
  const b=document.querySelectorAll("#metas-wrap .goal-text");if(b.length)b[b.length-1].focus();}

/* ============ PUBLICAR O ACERVO QUE JA ESTAVA NO APARELHO ============
   O toque so publica marcacao NOVA. A meta que voce escreveu antes de a
   sincronia existir mora so no aparelho que a escreveu, e nao viajaria nunca.
   A triagem teve o mesmo problema em 27/08 e ganhou o migrarTriagemUmaVez.

   POR QUE UM BOTAO, E NAO UMA ROTINA. A triagem podia migrar sozinha porque
   guardava o dia da marcacao: havia um instante verdadeiro a usar. A meta nao
   guarda data nenhuma. Sem instante verdadeiro, os dois aparelhos publicariam
   o proprio acervo com a mesma data inventada, e o empate seria decidido no
   servidor pelo nome do arquivo — que nao e dado, e ordem de leitura de
   diretorio. Com botao, quem decide qual aparelho e a fonte e voce.

   POR QUE UMA DATA ANTIGA. 1o de janeiro de 2026 nao e um instante verdadeiro,
   e ninguem finge que seja: e um piso. Publicar com a data de hoje faria este
   acervo vencer qualquer edicao real ja feita no outro aparelho. Com um piso,
   qualquer edicao feita depois — em qualquer aparelho — vence. E a licao do
   Passo 8 do briefing de 27/08, aplicada de novo.

   Cada meta recebe um instante distinto porque o relogio monotonico conta as
   bases explicitas a parte; sem isso as N metas nasceriam com o mesmo id.
   ==================================================================== */
function marcarLaForaLocal(secao, chave, valor){
  var fora = LS(ACERVO_LA_FORA_KEY, null) || {metas:{}, eventos:{}};
  if(!fora[secao]) fora[secao] = {};
  /* metas guardam a string do instante; eventos guardam {q, t, p} */
  fora[secao][chave] = valor;
  save(ACERVO_LA_FORA_KEY, fora);
}

function publicarAcervoUmaVez(){
  /* SEM A FOTOGRAFIA, NAO PUBLICA.
     O contador ate funciona sem ela, por uma regra de reserva; a publicacao,
     nao. Ela precisa saber qual instante do piso ja foi gasto, senao os toques
     nascem com ids que a dobra ja viu e sao descartados EM SILENCIO. E ela e
     gravada pelo buscarEstado, que corre depois do boot: apertar o botao nos
     primeiros instantes da pagina caia bem nessa janela. Recusar e visivel;
     publicar no vazio nao seria. */
  if(LS(ACERVO_LA_FORA_KEY, null) === null){
    alert("Este aparelho ainda n\u00e3o leu o estado publicado.\n\n" +
          "Sem isso n\u00e3o d\u00e1 para saber o que j\u00e1 est\u00e1 l\u00e1 fora, e a publica\u00e7\u00e3o poderia " +
          "repetir instantes j\u00e1 usados \u2014 o que faria os toques sumirem em sil\u00eancio.\n\n" +
          "Saia da aba e volte, ou recarregue, e tente de novo em alguns segundos.");
    return;
  }
  var metas = metasParaPublicar(), eventos = eventosParaPublicar();
  if(!metas.length && !eventos.length){
    renderAcervoEstado();
    alert("Nada a publicar: o que est\u00e1 neste aparelho ou j\u00e1 est\u00e1 l\u00e1 fora, ou \u00e9 o que a p\u00e1gina cria sozinha.");
    return;
  }
  var partes = [];
  if(metas.length)   partes.push(metas.length + " meta(s)");
  if(eventos.length) partes.push(eventos.length + " data(s) importante(s)");
  if(!confirm("Publicar " + partes.join(" e ") + " deste aparelho para os outros?\n\n" +
      "Sobem com data de 1\u00ba de janeiro de 2026, de prop\u00f3sito: assim qualquer edi\u00e7\u00e3o feita depois disso, " +
      "em qualquer aparelho, vence.\n\n" +
      "Das datas sobem a data E o t\u00edtulo, exceto as que est\u00e3o com o cadeado fechado \u2014 " +
      "dessas sobe s\u00f3 a data. O reposit\u00f3rio \u00e9 p\u00fablico.\n\n" +
      "Fa\u00e7a a partir do aparelho que tem o acervo certo.")) return;
  eventos.forEach(function(x){
    var ev = x.ev;
    /* O PISO SO VALE PARA O ACERVO DE VERDADE — o que nunca subiu e nao tem
       instante proprio. Corrigir o titulo ou a marca de um evento que JA esta
       la fora e um ato de agora: com o piso, o toque nasceria mais velho do que
       o estado que ele quer corrigir, a dobra o descartaria como atrasado, e o
       contador mostraria a mesma pendencia para sempre. Medido: a "Prova TOEFL",
       cujo estado veio de uma edicao das 01:35, nao recebia o titulo. */
    var iso = enfileirarToque("evento", dadosDoEvento(ev, false), x.novo ? ACERVO_EM : null);
    marcarLaForaLocal("eventos", ev.id, {q:iso, t:(!ev.priv && !!String(ev.t||"").trim()), p:!!ev.priv});
    if(!ev.em){
      var lista = getEventos();
      for(var i=0;i<lista.length;i++){ if(lista[i].id===ev.id){ lista[i].em = iso; break; } }
      setEventos(lista);
    }
  });
  metas.forEach(function(c){
    var iso = enfileirarToque("meta", {mes:c.mes, mid:c.m.id, t:c.m.t||"", done:!!c.m.done,
                                       de:c.m.de||null, del:false}, ACERVO_EM);
    marcarLaForaLocal("metas", c.mes + "/" + c.m.id, iso);
    /* Meta que nunca teve instante passa a ter o que subiu: assim ela deixa de
       ser "tempo desconhecido" aqui dentro e a mesclagem seguinte nao a devolve
       como se fosse novidade de fora. Meta que JA tinha instante fica como
       estava — aquele instante e verdadeiro e mais novo, e rebaixa-lo seria
       mentir sobre quando voce a editou. */
    if(!c.m.em){
      var lista = getMetas(c.mes);
      for(var i=0;i<lista.length;i++){ if(lista[i].id===c.m.id){ lista[i].em = iso; break; } }
      setMetas(lista, c.mes);
    }
  });
  renderAcervoEstado();
  try{ renderEventos(); }catch(e){}
  alert(partes.join(" e ") + " entraram na fila. Sobem em alguns segundos, e o outro aparelho as mostra em um a tr\u00eas minutos.");
}

function renderAcervoEstado(){
  var el = document.getElementById("acervo-estado"); if(!el) return;
  var m, e;
  try{ m = metasParaPublicar(); e = eventosParaPublicar(); }catch(err){ return; }
  var partes = [];
  if(m.length) partes.push(m.length + " meta(s)");
  if(e.length) partes.push(e.length + " data(s)");
  el.textContent = partes.length ? partes.join(" e ") + " daqui ainda sem publicar."
                                 : "Nada a publicar: tudo daqui j\u00e1 est\u00e1 l\u00e1 fora.";
  el.className = "backup-aviso" + (partes.length ? " velho" : "");
}
function renderEventos(){
  const box=document.getElementById("eventos"); if(!box)return;
  const evts=getEventos().slice().sort((a,b)=>a.data<b.data?-1:1);
  const futuros=evts.filter(e=>diasAte(e.data)>=0);
  const passados=evts.filter(e=>diasAte(e.data)<0);
  const tudo=LS("cron:eventos-tudo", false);
  let h="";
  if(futuros.length){
    const nx=futuros[0], d=diasAte(nx.data);
    const nome = (nx.t||"").trim() ? escapeHtml(nx.t) : '<span class="sem-nome">sem nome</span>';
    h+=`<div class="count"><span class="num">${d}</span><div class="meta">
      <div class="c-t">${nome}</div>
      <div class="c-s">${fmtData(nx.data)} · faltam ${d} dia${d===1?"":"s"}</div></div></div>`;
  }
  /* Da mais proxima para a mais distante — que e a ordem em que `evts` ja
     esta, porque o sort e por data crescente. */
  const naTela = tudo ? evts : futuros.slice(0, EVENTOS_NA_TELA);
  naTela.forEach(e=>{ h+=linhaDeEvento(e); });
  const escondidos = evts.length - naTela.length;
  if(escondidos > 0 || tudo){
    h+=`<button class="ev-mais" onclick="save('cron:eventos-tudo',${!tudo});renderEventos()">`+
       (tudo ? "mostrar s\u00f3 as cinco pr\u00f3ximas"
             : "ver todas \u00b7 mais " + escondidos +
               (passados.length ? " (inclui " + passados.length + " que j\u00e1 " +
                 (passados.length===1?"passou":"passaram") + ")" : ""))+
       `</button>`;
  }
  h+=`<button class="add-row" onclick="addEv()">+ Nova data importante</button>`;
  box.innerHTML=h;
}
function linhaDeEvento(e){
  const d=diasAte(e.data), badge = d<0 ? "\u2014" : d;
  const priv = !!e.priv;
  return `<div class="ev">
      <span class="ev-d">${badge}</span>
      <button class="ev-priv${priv?" on":""}" onclick="privEv('${e.id}')"
        title="${priv?"privada: o título fica nos aparelhos onde você o escrever":"pública: o título sobe para o repositório"}"
        aria-label="${priv?"privada":"pública"}">${priv?"\u{1F512}":"\u{1F513}"}</button>
      <div class="ev-t" contenteditable="true" onblur="editEv('${e.id}',this.innerText)">${escapeHtml(e.t)}</div>
      <input type="date" value="${e.data}" onchange="dateEv('${e.id}',this.value)">
      <button class="del" onclick="delEv('${e.id}')" aria-label="Remover">&times;</button></div>`;
}
/* sortedRef saiu na Fase 2. Ela existia para traduzir o indice da tela em
   evento, e o indice da tela deixou de ser confiavel no momento em que a lista
   passou a mostrar so cinco. Quem endereca um evento agora e o id dele. */
/* UM EVENTO VIAJA POR ID, E O TITULO VIAJA COM ELE — SALVO SE FOR PRIVADO.
   Primeira versao desta sessao nao publicava titulo nenhum. Estava errado, e o
   autor reverteu em 29/08: data sem nome nao e data importante, chega no outro
   aparelho como um numero solto. A maioria dos eventos nao e sensivel, e os
   titulos dos subitens de artigo ja sao publicos ha tempo — deixar a minoria
   decidir por todos custava caro e resolvia pouco.

   A MARCA E POR EVENTO, e nao um interruptor global, porque o risco tambem e
   por evento: um retiro de igreja e um compromisso pastoral nao correm o mesmo
   risco, e uma chave unica obrigaria a escolher o pior caso para os dois.

   O MOTIVO DA MARCA EXISTIR CONTINUA O MESMO: o `historico` nunca e podado.
   Um titulo publicado uma vez fica publico para sempre — inclusive depois de o
   evento ser apagado, porque a lapide tira da tela e nao do historico. Por
   isso marcar privado NAO e retroativo: tira o titulo do estado atual, nao
   desfaz o que ja subiu. E o que o aviso na interface diz, nas duas direcoes.

   `del` e a lapide: sem ela, quem apaga no celular veria o evento voltar do
   Mac no carregamento seguinte, porque ausencia nao se distingue de
   desconhecimento. */

function tocarEvento(ev, apagado){
  if(!ev || !ev.id) return;
  enfileirarToque("evento", dadosDoEvento(ev, apagado));
}

/* A marca de privado e do EVENTO e atravessa como tudo o mais: vai no toque,
   entra no estado.json e desce pela regra do relogio. Sem isso, ligar no
   celular nao impediria o Mac de publicar o titulo na proxima edicao. */
function privEv(eid){
  const e=getEventos(); const j=e.findIndex(x=>x.id===eid);
  if(j<0) return;
  const ligando = !e[j].priv;
  const nome = (e[j].t||"").trim();
  if(ligando){
    if(!confirm("Marcar \u201c" + (nome||"esta data") + "\u201d como privada?\n\n" +
      "O t\u00edtulo deixa de subir e passa a existir s\u00f3 nos aparelhos onde voc\u00ea o " +
      "escrever. A data continua atravessando.\n\n" +
      "ISTO N\u00c3O \u00c9 RETROATIVO. Se o t\u00edtulo j\u00e1 subiu alguma vez, aquela publica\u00e7\u00e3o " +
      "continua no hist\u00f3rico, que nunca \u00e9 podado. Marcar como privada agora tira o " +
      "t\u00edtulo do estado atual, mas n\u00e3o desfaz o que j\u00e1 foi publicado.")) return;
  } else {
    if(!confirm("Tirar a marca de privada de \u201c" + (nome||"esta data") + "\u201d?\n\n" +
      "O t\u00edtulo passa a subir para o reposit\u00f3rio, que \u00e9 p\u00fablico.\n\n" +
      "O hist\u00f3rico nunca \u00e9 podado: uma vez publicado, o nome fica p\u00fablico para " +
      "sempre \u2014 mesmo que voc\u00ea apague o evento ou marque como privada de novo depois.")) return;
  }
  e[j].priv = ligando;
  e[j].em = new Date().toISOString();
  setEventos(e);
  tocarEvento(e[j], false);
  renderEventos();
}
/* Sai do onblur do contenteditable: so grava se o texto mudou de verdade,
   senao cada clique fora do campo viraria um toque. O editMeta ja fazia esta
   guarda; o editEv nao fazia, e sem ela o tipo novo multiplicaria marcacao. */
function editEv(eid,t){const e=getEventos();const j=e.findIndex(x=>x.id===eid);
  if(j<0)return;const novo=t.trim();if(novo===e[j].t)return;
  e[j].t=novo;e[j].em=new Date().toISOString();setEventos(e);
  /* Num evento PRIVADO que ja subiu, renomear nao muda nada la fora — o toque
     seria um commit e uma reconstrucao do Pages a troco de nada. Mas se ele
     ainda nem subiu, o toque sai: nomear e o ato que o torna real, e a DATA
     precisa viajar mesmo que o nome fique aqui. */
  if(!e[j].priv || !eventoJaSubiu(e[j].id)) tocarEvento(e[j],false);
  renderEventos();}
function dateEv(eid,v){const e=getEventos();const j=e.findIndex(x=>x.id===eid);
  if(j<0||!v||e[j].data===v)return;
  e[j].data=v;e[j].em=new Date().toISOString();setEventos(e);tocarEvento(e[j],false);renderEventos();}
function delEv(eid){const fora=getEventos().find(x=>x.id===eid);if(!fora)return;
  if(!confirm("Remover \u201c"+((fora.t||"").trim()||"esta data")+"\u201d?"))return;
  setEventos(getEventos().filter(x=>x.id!==eid));tocarEvento(fora,true);renderEventos();}
/* Nasce sem nome e com a data de hoje, e por isso nao enfileira nada: o toque
   sai no primeiro editEv ou dateEv, ja com o que voce quis dizer. */
function addEv(){const e=getEventos();e.push({id:"e"+Date.now(),t:"",data:ymd(now)});setEventos(e);renderEventos();}
function marcarSub(pid, projId, subId, novoSt){
  var p = getProjs(pid), pi = -1, si = -1;
  for(var i=0;i<p.length && pi<0;i++){
    if(p[i].id !== projId) continue;
    for(var j=0;j<(p[i].subs||[]).length;j++){
      if(p[i].subs[j].id === subId){ pi = i; si = j; break; }
    }
  }
  if(pi < 0 || si < 0) return null;
  var x = normSub(p[pi].subs[si]), de = x.st;
  if(novoSt === de) return null;
  x.st = novoSt;
  x.em = new Date().toISOString();
  setProjs(pid, p);
  logar(pid, p[pi], x, de, x.st);
  return {pid:pid, pi:pi, si:si, de:de, para:x.st};
}
function cycleSub(pid,pi,si){
  var p=getProjs(pid), pr=p[pi], x=pr && pr.subs && normSub(pr.subs[si]);
  if(!x) return;
  if(!marcarSub(pid, pr.id, x.id, (x.st+1)%3)) return;
  renderPainel(pid); renderRegistro(); sincronizarHoje(pid);
}
/* A caixa que a aba Hoje mostra. Marcar conclui; desmarcar volta para "a
   fazer" — a caixa tem dois estados, e nao ha como ela adivinhar que o item
   estava "em andamento" antes. Quem precisa dos tres estados usa o ponto da
   aba Trilhos, que continua girando o ciclo inteiro. */
function marcarDoHoje(pid, projId, subId, concluir){
  if(!marcarSub(pid, projId, subId, concluir ? 2 : 0)) return;
  renderHoje();
  try{ if(!document.getElementById("view-trilhos").hidden) renderTrilhos(); }catch(e){}
}
/* A PROXIMA ACAO DE UM TRILHO: o primeiro subitem nao concluido, na ordem em
   que o trilho esta, dentro do primeiro projeto que ainda nao ficou pronto.
   Pula "nao se aplica" pela mesma razao que o pecaDoMes ja pulava: e uma etapa
   que o proprio trilho declarou que nao acontece, e mandar o dia para ela seria
   apontar para o nada. Hoje isso e o caso real do a00-3. */
function tocarPrioridade(p, sem, apagada){
  var iso = enfileirarToque("prioridade", dadosDaPrioridade(p, sem, apagada));
  return iso;
}
function addPrioridadeTrilho(valor){
  if(!valor) return;
  var corte = valor.indexOf("/");
  var painel = valor.slice(0, corte), projId = valor.slice(corte+1);
  var pr = (getProjs(painel)||[]).filter(function(x){ return x.id === projId; })[0];
  var lista = getPrio();
  if(lista.some(function(x){ return x.painel===painel && x.projId===projId; })) return;
  var p = {id:"pr"+Date.now(), tipo:"trilho", painel:painel, projId:projId,
           t:(pr&&pr.t)||"", em:new Date().toISOString()};
  lista.push(p); setPrio(lista);
  p.em = tocarPrioridade(p, semanaAtual, false) || p.em;
  setPrio(lista); renderHoje();
}
function addPrioridadeLivre(){
  var t = prompt("Prioridade da semana:", "");
  if(t === null) return;
  t = t.trim(); if(!t) return;
  var lista = getPrio();
  var p = {id:"pr"+Date.now(), tipo:"livre", painel:"", projId:"", t:t,
           em:new Date().toISOString()};
  lista.push(p); setPrio(lista);
  p.em = tocarPrioridade(p, semanaAtual, false) || p.em;
  setPrio(lista); renderHoje();
}
function delPrioridade(prid){
  var lista = getPrio(), j = -1;
  for(var i=0;i<lista.length;i++){ if(lista[i].id === prid){ j = i; break; } }
  if(j < 0) return;
  var fora = lista[j];
  lista.splice(j, 1); setPrio(lista);
  tocarPrioridade(fora, semanaAtual, true);   /* lapide: ausencia nao e desconhecimento */
  renderHoje();
}
/* MARCAR E DESMARCAR. Molde do editPrioridade, e pelas mesmas duas razoes: o
   `em` tem de virar o instante do toque, senao a descida seguinte — que compara
   `em` com o `quando` do estado — ignoraria a marca que acabou de ser feita; e
   a lista e gravada duas vezes porque o instante so existe depois de enfileirar.

   Desmarcar grava "" e tambem viaja: mudar de ideia e um fato, e um aparelho
   que so soubesse marcar deixaria a prioridade cumprida para sempre no outro. */
function togglePrioridadeFeita(prid){
  var lista = getPrio(), p = null;
  for(var i=0;i<lista.length;i++){ if(lista[i].id === prid){ p = lista[i]; break; } }
  if(!p) return;
  p.feito_em = (p.feito_em === dateKey) ? "" : dateKey;
  p.em = new Date().toISOString(); setPrio(lista);
  p.em = tocarPrioridade(p, semanaAtual, false) || p.em;
  setPrio(lista);
  renderHoje();
}
function editPrioridade(prid, texto){
  var lista = getPrio(), p = null;
  for(var i=0;i<lista.length;i++){ if(lista[i].id === prid){ p = lista[i]; break; } }
  if(!p) return;
  var novo = (texto||"").trim();
  if(!novo || novo === p.t) return;
  p.t = novo; p.em = new Date().toISOString(); setPrio(lista);
  p.em = tocarPrioridade(p, semanaAtual, false) || p.em;
  setPrio(lista);
}

/* A ORDEM E A GARANTIA. `manuais` primeiro, sempre; `sugeridas` existe vazia
   de proposito, para que a Fase 3 preencha sem que ninguem precise lembrar da
   regra de precedencia — ela ja esta na forma do retorno. */
/* A DESCIDA DAS PRIORIDADES. Isolada de proposito: o buscarEstado depende de
   fetch, e esta parte precisa poder ser testada sem rede — e e ela que prova
   que o computador e o celular veem a mesma prioridade.

   Molde da meta, linha por linha: chave "periodo/id", lapide `del`, e o
   relogio decidindo item a item. Mais novo manda; empate fica como esta. */
function dispensarSugestao(painel, projId){ adiarRetomada(painel, projId); }
function adotarSugestao(painel, projId){ addPrioridadeTrilho(painel + "/" + projId); }

/* A ORDEM E A GARANTIA. `manuais` primeiro, sempre. O motor recebe as manuais
   para saber quantas vagas sobraram e o que NAO repetir — e nao tem como
   devolve-las diferentes, porque nao as toca. */
function adiarRetomada(pid, projId){
  var m = retomadasAdiadas();
  var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14);
  var ate = ymd(d);
  /* O instante gravado e EXATAMENTE o que subiu no toque: guardar outro faria
     os dois lados discordarem sobre quando a decisao foi tomada. */
  var iso = enfileirarToque("retomada", {pid:pid, projId:projId, ate:ate});
  m[pid + "/" + projId] = {ate:ate, em:iso};
  save(RETOMADA_KEY, m);
  renderHoje();
}
function promoverRetomada(pid, projId){
  addPrioridadeTrilho(pid + "/" + projId);   /* decisao sua, num toque */
}

/* ==================== CONTEXTO — Fase 2 ====================
   DOIS ESTADOS, e so dois: casa e fora. Fora de casa quer dizer que o telefone
   e o que existe.

   ISTO NAO PONTUA NADA E NAO REORDENA NADA. Uma prioridade que voce escolheu
   continua no topo estando voce onde estiver — ela so ganha um aviso de que
   pede computador. Rebaixar a escolha do usuario por causa do lugar seria o
   sistema decidindo por ele, que e exatamente o que este Cronograma nao faz. */
function setContexto(c){ save("cron:contexto", c); renderHoje(); }
function renderVagasIndicador(){
  var c = contagemDeVagas();
  if(!c.total) return "";
  var partes = [];
  if(c.novas)    partes.push(c.novas + " nova" + (c.novas===1?"":"s"));
  if(c.revisar)  partes.push(c.revisar + " para revisar");
  if(c.marcadas) partes.push(c.marcadas + " selecionada" + (c.marcadas===1?"":"s"));
  if(!partes.length) partes.push("nada novo");
  return '<button class="hoje-vagas" onclick="setView(\'vagas\')">' +
         '<span class="hv-t">Vagas</span>' +
         '<span class="hv-n">' + partes.join(" \u00b7 ") + '</span>' +
         '<span class="seta">\u203a</span></button>';
}


/* Ciclo de vida: ativo -> adiado -> abandonado -> ativo. Pede motivo, e
   no caso de adiar pergunta também para quando voltar. O progresso (st)
   não é tocado: uma peça 60% escrita e adiada continua 60% escrita. */
function ciclarVida(pid,pi,si){
  var p=getProjs(pid), x=normSub(p[pi].subs[si]);
  /* Sair de "nao se aplica" e decisao, nao passo do ciclo: sem esta pergunta,
     um toque no lugar errado transformaria em "ativa" uma etapa que o pipeline
     ja disse que nao cabe neste artigo. */
  if(x.vida==="inaplicavel"){
    if(!confirm("Esta etapa esta marcada como \u201cn\u00e3o se aplica\u201d"+(x.motivo?" ("+x.motivo+")":"")+".\n\nVoltar para ativa?")) return;
    x.vida="ativo"; x.motivo=""; x.voltar_em=""; x.vidaDesde=ymd(now);
    x.em=new Date().toISOString();
    setProjs(pid,p); logar(pid, p[pi], x, x.st, x.st);
    renderPainel(pid); renderRegistro(); sincronizarHoje(pid); return;
  }
  var prox=VIDA_ORDEM[(VIDA_ORDEM.indexOf(x.vida)+1)%VIDA_ORDEM.length];
  if(prox==="ativo"){
    x.vida="ativo"; x.motivo=""; x.voltar_em="";
  } else {
    var m=prompt(prox==="adiado" ? "Por que adiar?" : "Por que abandonar?", x.motivo||"");
    if(m===null) return;
    x.vida=prox; x.motivo=(m||"").trim();
    if(prox==="adiado"){
      var v=prompt("Voltar em (AAAA-MM-DD). Deixe vazio se não souber.", x.voltar_em||"");
      if(v===null) return;
      x.voltar_em=(v||"").trim();
    } else { x.voltar_em=""; }
  }
  x.vidaDesde=ymd(now);
  x.em=new Date().toISOString();
  setProjs(pid,p);
  logar(pid, p[pi], x, x.st, x.st);
  renderPainel(pid); renderRegistro(); sincronizarHoje(pid);
}
/* ================== TOQUES — fila de sincronização (Passo 5) ==================
   Cada mudança de estado vira um TOQUE. O toque entra numa fila local e sobe
   depois, como ARQUIVO NOVO em Cronograma/toques/. Nunca se edita um arquivo já
   enviado: é isso, e só isso, que torna o desenho à prova de conflito quando o
   mesmo item é tocado no celular e no Mac no mesmo dia.

   A fila existe porque o toque não pode depender da rede. Você marca a etapa no
   metrô, a fila guarda, e o envio acontece quando houver sinal.

   ATENÇÃO ao nome. "Evento" já tem dois donos neste sistema: a pasta /eventos/
   na raiz é dos snapshots do coletor, e cron:eventos são os compromissos com
   data que alimentam o contador. Toque é o toque no painel, e só isso.
   ============================================================================ */
function renderToquesAviso(){
  var el = document.getElementById("toques-aviso"); if(!el) return;
  var n = getToques().length;
  if(typeof ENVIANDO !== "undefined" && ENVIANDO){ el.textContent = "Enviando…"; el.className="backup-aviso"; return; }
  el.textContent = n===0 ? "Nada esperando envio."
                 : n===1 ? "1 toque esperando envio."
                         : n + " toques esperando envio.";
  el.className = "backup-aviso" + (n>0 ? " velho" : "");
}

/* ---- Token de sincronização: mora no aparelho, nunca no backup ----
   A chave fica FORA do prefixo cron: de propósito. O exportarDados() varre
   todas as chaves cron:, e o .gitignore já diz por que um backup do Cronograma
   nunca entra no repositório: ele contém o estado inteiro. Um token dentro
   dele viajaria junto em cada exportação. */
function renderSyncEstado(){
  var el = document.getElementById("sync-estado"); if(!el) return;
  var t = getToken();
  if(!t){ el.textContent = "Sem token neste aparelho. Os toques ficam na fila."; el.className = "backup-aviso velho"; return; }
  el.textContent = "Token guardado neste aparelho, terminando em " + t.slice(-4) + ".";
  el.className = "backup-aviso";
}

/* O toque sobe para repositório público. O motivo é texto livre e não sobe;
   o toque leva apenas a marca de que existe um, para o estado.json saber que
   há uma razão registrada no aparelho. */
function renderRegistro(){
  var box=document.getElementById("registro"); if(!box) return;
  var r=getReg();
  if(!r.length){ box.innerHTML='<div class="vazio">Nada registrado ainda. Cada etapa que voc\u00ea fechar entra aqui com a data.</div>'; return; }
  var porMes={}, ordem=[];
  r.slice().reverse().forEach(function(o){
    var mk=o.d.slice(0,7);
    if(!porMes[mk]){porMes[mk]=[];ordem.push(mk);}
    porMes[mk].push(o);
  });
  var h="";
  ordem.forEach(function(mk){
    h+='<div class="reg-mes">'+mesLabel(mk)+'</div>';
    porMes[mk].forEach(function(o){
      h+='<div class="reg-i"><span class="reg-d">'+Number(o.d.slice(8,10))+'</span>'+
         '<span class="reg-t">'+escapeHtml(o.projT||o.p||"")+
         '<span>'+escapeHtml(o.subT||o.s||"")+' \u00b7 '+rotuloReg(o)+'</span></span></div>';
    });
  });
  var ant = LS("cron:registro-antigo", []) || [];
  if(ant.length){
    h+='<div class="reg-mes">Hist\u00f3rico antigo \u00b7 '+ant.length+' linha'+(ant.length===1?'':'s')+'</div>'+
       '<div class="vazio">Linhas que a migra\u00e7\u00e3o n\u00e3o conseguiu casar com nenhum item atual '+
       '\u2014 provavelmente de itens renomeados ou removidos. Guardadas inteiras, nada foi descartado.</div>';
    ant.slice().reverse().forEach(function(o){
      h+='<div class="reg-i"><span class="reg-d">'+Number(String(o.d||"").slice(8,10)||0)+'</span>'+
         '<span class="reg-t">'+escapeHtml(o.p||"")+
         '<span>'+escapeHtml(o.s||"")+' \u00b7 '+(o.st===2?'conclu\u00edda':'<i>em andamento</i>')+'</span></span></div>';
    });
  }
  box.innerHTML=h;
}
/* R\u00f3tulo de uma linha do registro. O recuo (voltar para "a fazer") era
   invis\u00edvel no esquema antigo; aqui ele aparece. */
function rotuloReg(o){
  if(o.vida==="adiado")     return '<i>adiada</i>'+(o.motivo?' \u00b7 '+escapeHtml(o.motivo):'');
  if(o.vida==="abandonado") return '<i>abandonada</i>'+(o.motivo?' \u00b7 '+escapeHtml(o.motivo):'');
  if(o.vida==="inaplicavel") return '<i>n\u00e3o se aplica</i>'+(o.motivo?' \u00b7 '+escapeHtml(o.motivo):'');
  var p = (o.para===undefined||o.para===null) ? o.st : o.para;
  if(p===2) return 'conclu\u00edda';
  if(p===1) return '<i>em andamento</i>';
  return (o.de>0) ? '<i>voltou para a fazer</i>' : '<i>a fazer</i>';
}
/* ---- Aba Arquivo: o que foi removido, com bot\u00e3o de restaurar ---- */
function renderArquivo(){
  var box=document.getElementById("arquivo"); if(!box) return;
  var a=getArquivo();
  if(!a.length){ box.innerHTML='<div class="vazio">Nada arquivado. Quando voc\u00ea remover um item de um painel, ele vem parar aqui \u2014 e pode voltar.</div>'; return; }
  var h="";
  a.slice().reverse().forEach(function(it, revIdx){
    var k=a.length-1-revIdx;
    var P=painelDef(it.pid);
    var titulo = it.item && it.item.t ? it.item.t : "(sem t\u00edtulo)";
    var contexto = it.tipo==="subtarefa" && it.ondeEstava && it.ondeEstava.projT ? " \u00b7 de \u201c"+it.ondeEstava.projT+"\u201d" : "";
    h+='<div class="reg-i"><span class="reg-d">'+Number(String(it.d||"").slice(8,10)||0)+'</span>'+
       '<span class="reg-t">'+escapeHtml(titulo)+
       '<span>'+(it.tipo==="projeto"?"item":"subtarefa")+' \u00b7 '+escapeHtml(P?P.titulo:it.pid)+escapeHtml(contexto)+'</span></span>'+
       '<button class="add-row" style="margin:0;padding:4px 10px" onclick="restaurarArquivo('+k+')">restaurar</button></div>';
  });
  box.innerHTML=h;
}
/* ABRE O RECURSO DO DIA (Fase 9A). Uma aba nova, e nada mais: nesta fase o
   botao so LEVA. O registro do estudo entra na 9B, e e la que este mesmo toque
   passa a valer tambem como "fiz" — um ato, dois efeitos. Ate la, marcar
   continua sendo na caixa da rotina, no unico lugar onde sempre foi.

   `noopener` porque a pagina de destino nao tem por que alcancar esta. */
function abrirRecursoToefl(dia){
  var a = atividadeDoDia(dia);
  if(!a || !a.url) return;
  try{ window.open(a.url, "_blank", "noopener"); }catch(e){}
}
/* UM ATO, DOIS EFEITOS (Fase 9B). Registrar o estudo tambem marca a rotina de
   TOEFL do dia. Sem isto a tela se contradiria: o cartao diria "contato
   cumprido" e a caixa da rotina, tres linhas abaixo, continuaria vazia — e a
   rotina reapareceria no "Ficou para tras" de domingo.

   O INVERSO NAO VALE, e a assimetria e o ponto: marcar a caixa continua sendo
   so marcar a caixa. Ela nao sabe quantos minutos foram nem qual habilidade, e
   deduzi-los seria inventar o registro. Nao ha, portanto, um segundo mecanismo
   de conclusao: ha um mecanismo que alimenta o outro, numa direcao so. */
/* O dia e a data vao por argumento pela mesma razao do D0: `todayIdx`, `checks`
   e `dateKey` sao fixados no carregamento, e sem isto o ato duplo — que e a
   afirmacao central desta fase — so poderia ser provado nos dias uteis. */
function marcarRotinaToefl(dia, dISO){
  var d = (typeof dia === "number") ? dia : todayIdx;
  var k = dISO || dateKey, D = DIAS[d];
  if(!D) return;
  /* No dia corrente e o `checks` vivo que tem de mudar, e nao so o disco: e
     dele que o renderHoje logo abaixo le a caixa da rotina. */
  var ck = (k === dateKey) ? checks : (LS("cron:checks:"+k, {}) || {});
  (D.tasks || []).forEach(function(t){
    if(t.processo === "toefl" && !ck[t.id]) ck[t.id] = true;
  });
  save("cron:checks:"+k, ck);
}
function registrarToefl(min, tipo, hojeISO){
  var d = hojeISO || dateKey;
  if(!registrarEstudo(min, d, tipo)) return;
  marcarRotinaToefl(diaDaSemanaDe(d), d);
  renderHoje();
}
/* Desfaz o ULTIMO registro do dia, e nao um qualquer: o erro que se comete numa
   fila de botoes e sempre o toque que se acabou de dar. A rotina marcada NAO e
   desmarcada junto — ela pode ter sido marcada a mao, e desfazer um lancamento
   de minutos nao autoriza apagar uma decisao que talvez nao seja deste botao. */
function desfazerUltimoToefl(){
  var r = estudoDoDia(dateKey);
  if(!r.length) return;
  desfazerEstudo(r[r.length - 1].rid);
  renderHoje();
}
/* ---- Navegação: da tarefa do dia para o item certo do trilho ---- */
function irAoTrilho(pid, projId){
  save("cron:painel-open:"+pid, true);
  if(projId) setProjAberto(pid, projId, true);
  setView("trilhos");
  setTimeout(function(){
    var sel = projId ? '#view-trilhos [data-proj="'+pid+'/'+projId+'"]' : '#painel-'+pid;
    var alvo = document.querySelector(sel) || document.getElementById("painel-"+pid);
    if(!alvo) return;
    try{ alvo.scrollIntoView({behavior:"smooth", block:"center"}); }catch(e){ alvo.scrollIntoView(); }
    alvo.classList.add("realce");
    setTimeout(function(){ alvo.classList.remove("realce"); }, 1700);
  }, 80);
}
function editProj(pid,i,t){var p=getProjs(pid);p[i].t=t.trim()||p[i].t;setProjs(pid,p);}
function editSub(pid,pi,si,t){var p=getProjs(pid);p[pi].subs[si].t=t.trim()||p[pi].subs[si].t;setProjs(pid,p);}
/* Remover deixa de destruir: vai para a aba Arquivo e pode voltar. */
function delProj(pid,i){if(!confirm("Arquivar este item e tudo o que est\u00e1 dentro dele?\n\nNada \u00e9 apagado \u2014 ele vai para a aba Arquivo e pode ser restaurado."))return;
  var p=getProjs(pid);var removido=p.splice(i,1)[0];
  arquivar(pid, removido, "projeto", {indice:i});
  setProjs(pid,p);renderPainel(pid);renderArquivo();sincronizarHoje(pid);}
function delSub(pid,pi,si){var p=getProjs(pid);var removido=p[pi].subs.splice(si,1)[0];
  arquivar(pid, removido, "subtarefa", {projId:p[pi].id, projT:p[pi].t, indice:si});
  setProjs(pid,p);renderPainel(pid);renderArquivo();sincronizarHoje(pid);}
function addProj(pid){var p=getProjs(pid);p.push(normProj({id:"p"+Date.now(),t:"",subs:[],origem:"manual"}));setProjs(pid,p);renderPainel(pid);
  var b=document.querySelectorAll('[data-painel="'+pid+'"] .proj-name');if(b.length)b[b.length-1].focus();}
function addSub(pid,pi){var p=getProjs(pid);p[pi].subs.push(normSub({id:"s"+Date.now(),t:"",st:0,origem:"manual"}));setProjs(pid,p);renderPainel(pid);
  var b=document.querySelectorAll('[data-painel="'+pid+'"] .proj[data-pi="'+pi+'"] .sub-text');if(b.length)b[b.length-1].focus();}
/* Antes so a esteira alimentava o Hoje, entao so ela precisava avisar. Agora
   qualquer trilho pode estar mostrando a proxima acao dele la, e um `if` por
   painel seria uma lista para alguem esquecer de atualizar. */
function sincronizarHoje(pid){ renderHoje(); }
function renderPainel(pid){
  var alvos=document.querySelectorAll('[data-painel="'+pid+'"]');
  if(!alvos.length) return;
  var projs=getProjs(pid), h="";
  projs.forEach(function(p,pi){
    var contam=p.subs.filter(function(x){return x.vida!=="inaplicavel";});
    var total=contam.length, feitas=contam.filter(function(x){return x.st===2;}).length;
    var emAnd=p.subs.some(function(x){return x.st===1;});
    var ab=projAberto(pid,p.id,emAnd);
    h+='<details class="proj'+(emAnd?" ativo":"")+'" data-pi="'+pi+'" data-proj="'+pid+'/'+p.id+'" '+(ab?"open":"")+
       ' ontoggle="setProjAberto(\''+pid+'\',\''+p.id+'\',this.open)">'+
       '<summary class="proj-head">'+
       '<div class="proj-name" contenteditable="true" onclick="event.stopPropagation()" '+
       'onblur="editProj(\''+pid+'\','+pi+',this.innerText)">'+escapeHtml(p.t)+'</div>'+
       '<span class="proj-prog">'+feitas+'/'+total+'</span></summary><div class="proj-body">';
    if(p.n) h+='<div class="proj-note">'+escapeHtml(p.n)+'</div>';
    p.subs.forEach(function(x,si){
      normSub(x);
      var vClass = x.vida && x.vida!=="ativo" ? " vida-"+x.vida : "";
      var selo = "";
      if(x.vida==="adiado")     selo='<span class="vida-selo v-adiado" title="'+escapeHtml(x.motivo||"")+'">adiada'+(x.voltar_em?" · volta "+escapeHtml(x.voltar_em):"")+'</span>';
      if(x.vida==="abandonado") selo='<span class="vida-selo v-abandonado" title="'+escapeHtml(x.motivo||"")+'">abandonada</span>';
      if(x.vida==="inaplicavel") selo='<span class="vida-selo v-inaplicavel" title="'+escapeHtml(x.motivo||"")+'">n\u00e3o se aplica</span>';
      var med = (x.medida && typeof x.medida.total==="number")
              ? '<span class="sub-medida">'+(x.medida.feito||0)+'/'+x.medida.total+'</span>' : '';
      var ondeT = x.onde ? '<span class="sub-onde">'+escapeHtml(x.onde)+'</span>' : '';
      h+='<div class="sub st-'+x.st+vClass+'">'+
         '<span class="st-dot" onclick="cycleSub(\''+pid+'\','+pi+','+si+')" title="'+ST_LBL[x.st]+'"></span>'+
         '<div class="sub-text" contenteditable="true" onblur="editSub(\''+pid+'\','+pi+','+si+',this.innerText)">'+escapeHtml(x.t)+'</div>'+
         selo+med+ondeT+
         '<button class="vida-btn" onclick="ciclarVida(\''+pid+'\','+pi+','+si+')" title="adiar, abandonar ou reativar">&#8943;</button>'+
         '<button class="del" onclick="delSub(\''+pid+'\','+pi+','+si+')" aria-label="Arquivar subtarefa">&times;</button></div>';
    });
    h+='<button class="add-sub" onclick="addSub(\''+pid+'\','+pi+')">+ subtarefa</button>'+
       '<button class="del-proj" onclick="delProj(\''+pid+'\','+pi+')">remover este item</button>'+
       '</div></details>';
  });
  h+='<button class="add-row" onclick="addProj(\''+pid+'\')">+ Novo item</button>';
  alvos.forEach(function(el){el.innerHTML=h;});
}
function renderTecnico(){renderPainel("tecnico");}
/* Uma peca esta pronta quando toda etapa que CONTA esta concluida. "Nao se
   aplica" nao conta — e a mesma regra que o contador do painel ja usava. */
function renderTrilhos(){
  var h='<p class="plate-eyebrow">Trilhos</p>'+
        '<h1 class="plate-day" style="font-size:30px;margin-bottom:6px;">A esteira</h1>'+
        '<p class="plate-eixo">Uma pe\u00e7a pronta para submeter por m\u00eas</p>'+
        '<p class="plate-date">Ler e fichar nas semanas III e IV do m\u00eas anterior. Redigir nas semanas I e II.</p>';
  var pc=pecaDoMes();
  h+=avisoDaEsteira();
  if(pc) h+='<div class="anchor"><span class="t">'+(pc.proxima?"a seguir":mesCurto(pc.mes))+'</span>'+
            '<span class="n">'+escapeHtml(pc.curto)+'<br><span style="color:#B9C0CE;font-size:12px;">'+escapeHtml(pc.etapa)+'</span></span></div>';
  h+='<div class="trilho-nota"><b>Como usar.</b> Toque no ponto para girar a etapa entre a fazer, em andamento e conclu\u00edda. '+
     'Mantenha no m\u00e1ximo duas pe\u00e7as em andamento ao mesmo tempo.</div>';
  PAINEIS.forEach(function(P){
    var ab=LS("cron:painel-open:"+P.id, P.aberto);
    h+='<details class="tecbloco" id="painel-'+P.id+'" '+(ab?"open":"")+' ontoggle="save(\'cron:painel-open:'+P.id+'\', this.open)">'+
       '<summary><span class="tb-t">'+P.titulo+'</span><span class="tb-sub">'+P.sub+'</span></summary>'+
       '<div class="tb-body"><div data-painel="'+P.id+'"></div></div></details>';
  });
  h+='<details class="tecbloco" id="painel-registro" '+(LS("cron:painel-open:registro",false)?"open":"")+
     ' ontoggle="save(\'cron:painel-open:registro\', this.open)">'+
     '<summary><span class="tb-t">Registro</span><span class="tb-sub">o que voc\u00ea fechou, por data</span></summary>'+
     '<div class="tb-body"><div id="registro"></div></div></details>';
  var nArq = getArquivo().length;
  h+='<details class="tecbloco" id="painel-arquivo" '+(LS("cron:painel-open:arquivo",false)?"open":"")+
     ' ontoggle="save(\'cron:painel-open:arquivo\', this.open)">'+
     '<summary><span class="tb-t">Arquivo</span><span class="tb-sub">'+(nArq? nArq+' item'+(nArq===1?'':'s')+' \u00b7 nada foi apagado' : 'nada arquivado')+'</span></summary>'+
     '<div class="tb-body"><div id="arquivo"></div></div></details>';
  document.getElementById("view-trilhos").innerHTML=h;
  PAINEIS.forEach(function(P){renderPainel(P.id);});
  renderRegistro();
  renderArquivo();
}
/* ================== A ABA SEMANA VIROU PAINEL ==================
   Ela repetia a grade fixa dos sete dias — a mesma que esta no DIAS, a mesma
   que ele sabe de cor. Uma tela que so repete o que voce ja sabe nao informa
   nada: gasta a aba inteira para nao dizer nada sobre hoje.

   Agora ela responde com NUMERO. Cada um sai de dado que ja existe no
   aparelho: nenhuma chave nova, nenhum registro novo, nada para alimentar a
   mao. A grade continua ali, recolhida no rodape, para conferir a forma da
   semana quando for o caso.
   ============================================================== */

/* Segunda-feira desta semana: a semana do app comeca na segunda, que e a
   ordem do ORDEM_SEMANA e o eixo de cada dia. */
function renderSemana(){
  const alvo=document.getElementById("view-semana"); if(!alvo) return;
  let html=`<p class="plate-eyebrow">Visão geral</p>`+
           `<h1 class="plate-day" style="font-size:30px;margin-bottom:4px;">A semana</h1>`+
           `<p class="plate-date">Desde ${fmtData(segundaDaSemana())} · onde as coisas estão.</p>`;

  const dias = diasAte(TOEFL_PLANO.prova);
  const art = entregaDosArtigos();
  const rit = ritmoDoRegistro();
  const pz = prazosProximos(5);
  const fase = toeflFase();

  html+=`<div class="nums">`;
  html+=`<div class="num-c largo${(dias>=0&&dias<=30)?" atencao":""}"><div class="n">${
    dias>=0?dias:"—"}<small> dia${dias===1?"":"s"}</small></div>
    <div class="t">até ${fmtData(TOEFL_PLANO.prova)} — a prova do TOEFL</div>
    <div class="s">${fase ? escapeHtml(fase.fase)+(fase.falta?" · "+fase.falta+" no núcleo":" · núcleo fechado")
                          : "a prova já passou"}</div></div>`;

  const emAberto = art.previstos - art.entregues;
  html+=`<div class="num-c${emAberto>0?" atencao":""}"><div class="n">${art.entregues}<small> de ${art.previstos}</small></div>
    <div class="t">artigos entregues contra previstos</div>
    <div class="s">${emAberto>0 ? emAberto+" em aberto · "+art.total+" na esteira"
                                : "em dia · "+art.total+" na esteira"}</div></div>`;

  if(rit && rit.semanas >= 2){
    const dif = Math.round((rit.semana - rit.media)*10)/10;
    html+=`<div class="num-c"><div class="n">${rit.semana}<small> / ${rit.media}</small></div>
      <div class="t">marcações nesta semana contra a média</div>
      <div class="s">${dif===0?"na média":(dif>0?"+"+dif+" acima":dif+" abaixo")} · ${rit.total} em ${rit.semanas} semanas</div></div>`;
  } else if(rit){
    /* MEDIA DE UMA SEMANA SO NAO E MEDIA. Medido: com o registro comecando em
       26/08, as 14 linhas do Mac caem todas na semana corrente e o cartao dizia
       "14 / 14 · na media" — verdadeiro e vazio, porque a media E esta semana.
       Enquanto nao houver duas semanas, o cartao diz o que tem: a contagem. */
    html+=`<div class="num-c"><div class="n">${rit.semana}</div>
      <div class="t">marcações nesta semana</div>
      <div class="s">a média chega quando houver duas semanas de registro</div></div>`;
  } else {
    html+=`<div class="num-c"><div class="n">—</div>
      <div class="t">marcações nesta semana contra a média</div>
      <div class="s">o registro ainda está vazio</div></div>`;
  }

  html+=`<div class="num-c largo${phase!=="livre"?" atencao":""}"><div class="n">Semana ${ROMANOS[wom-1]}</div>
    <div class="t">a fase do mês — ${FASE_LBL[phase]}</div>
    <div class="s">${escapeHtml(mesLabel(monthKey))}</div></div>`;
  html+=`</div>`;

  html+=`<div class="shead">Prazos mais próximos<span class="sub">${
    pz.temFeed ? pz.total+" em aberto"+(pz.coletado?" · coleta de "+fmtData(pz.coletado):"")
               : "carregando o feed…"}</span></div>`;
  if(pz.lista.length){
    pz.lista.forEach(i=>{
      const d = diasAte(i.prazo);
      const marca = vgEstado(i.id)===VG_ST.SIM ? ' · <i>marcada</i>' : '';
      html+=`<div class="reg-i"><span class="reg-d">${d}</span>
        <span class="reg-t">${escapeHtml(i.titulo||"(sem título)")}
        <span>${escapeHtml(i.instituicao||i.fonte||"")} · ${fmtData(i.prazo)}${marca}</span></span></div>`;
    });
  } else {
    html+=`<div class="vazio">${pz.temFeed ? "Nenhum prazo em aberto na lista."
                                           : "Abrindo o feed de vagas e chamadas…"}</div>`;
  }

  /* A grade fixa continua existindo, recolhida. Ele sabe de cor, mas conferir
     a forma da semana ainda tem uso — e ela nao custa nada estando fechada. */
  html+=`<details class="tecbloco" ${LS("cron:grade-open", false)?"open":""}
    ontoggle="save('cron:grade-open', this.open)">
    <summary><span class="tb-t">A grade fixa</span><span class="tb-sub">os sete dias, como sempre</span></summary>
    <div class="tb-body">`;
  ORDEM_SEMANA.forEach(idx=>{
    const d=DIAS[idx], isToday=idx===todayIdx?1:0, linhas=[];
    d.anchors.forEach(a=>linhas.push(`<b>${a.t}</b> — ${a.n}`));
    d.tasks.forEach(t=>linhas.push(t.t));
    html+=`<details class="wday" data-today="${isToday}" ${isToday?"open":""}>
      <summary><span class="w-day">${d.nome}${isToday?" · hoje":""}</span><span class="w-eixo">${d.eixo}</span></summary>
      <div class="w-body">${linhas.map(l=>`<div>${l}</div>`).join("")}</div></details>`;
  });
  html+=`</div></details>`;
  alvo.innerHTML=html;

  /* O feed so e buscado com a aba NA FRENTE. renderSemana roda tambem no boot,
     com a aba escondida: sem esta guarda, todo carregamento da pagina baixaria
     vagas.json e chamadas.json — cerca de 340 KB — mesmo de quem nunca abre
     nem a Semana nem as Vagas. No celular, isso e a rede do bolso. Aberta a
     aba, o setView chama renderSemana de novo e a busca acontece ali. */
  if(!pz.temFeed && !VG_BUSCOU && !alvo.hidden){
    vgCarregar().then(function(){ try{ if(!alvo.hidden) renderSemana(); }catch(e){} });
  }
}
function setView(v){
  /* A SEMANA CONTINUA NA LISTA, sem botao na barra. A guarda do `if(b)` e o
     que permite isso: uma view alcancavel so pelo rodape nao tem aba para
     acender, e antes da Fase 4 esta linha teria estourado. */
  ["hoje","processos","revisao","semana","trilhos","vagas"].forEach(function(k){
    var el = document.getElementById("view-"+k);
    if(el) el.hidden = (k!==v);
    var b = document.getElementById("tab-"+k);
    if(b) b.classList.toggle("active", k===v);
  });
  if(v==="processos") renderProcessos();
  if(v==="revisao"){
    var alvoRev = document.getElementById("view-revisao");
    if(alvoRev) alvoRev.innerHTML =
      '<p class="plate-eyebrow">Revis\u00e3o</p>' + renderRevisao();
  }
  if(v==="trilhos") renderTrilhos();
  if(v==="semana") renderSemana();   /* os numeros mudam a cada marcacao */
  if(v==="vagas") vgAbrir();
  try{window.scrollTo(0,0);}catch(e){}}
function limparHoje(){checks={};save("cron:checks:"+dateKey,{});renderHoje();}

/* ==================== PAINEL VAGAS — Passo 4 ====================
   O ARQUIVO DESCREVE, O APARELHO DECIDE. dados/vagas.json e dados/chamadas.json
   dizem o que a oportunidade E; a triagem mora separada, em cron:triagem,
   indexada por id. Nenhuma coleta sobrescreve uma decisao sua — a mesma
   invariante do esquema v2, sem precisar do mesclarEntrada(), que foi feito
   para objetivos com sub-itens e nao para um feed.

   ADITIVO: nao le nem escreve nenhuma chave que ja existia.
   =============================================================== */
function vgMarcar(id, st){
  var t = vgTriagem();
  if((t[id] && t[id].st) === st) st = VG_ST.NOVO;   /* tocar de novo desmarca */
  /* `quando` continua sendo o dia, que e o que a tela mostra; `em` e o
     instante, e existe porque sem ele nao ha como decidir quem venceu
     quando o Mac e o celular marcam a mesma vaga no mesmo dia. */
  var agora = new Date();
  t[id] = {st:st, quando:ymd(agora), em:agora.toISOString()};
  vgSalvarTriagem(t);
  enfileirarToque("triagem", {vid:id, st:st});
  vgRender();
}
function vgEsc(s){ return String(s==null?"":s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

/* Os criterios_*.json sao ASCII de proposito — lidos por Python, editados a
   mao, comparados sem acento. O que aparece na tela e portugues, entao a
   traducao acontece aqui, na borda. */
function vgL(s){ return VG_LBL[s] || s; }
function vgGrupo(i){ return i.bloco || i.forma; }

function vgCard(i){
  var st = vgEstado(i.id);
  var cls = "vg-card st-" + st + (i.vencida ? " vencida" : "")
            + (i.veredicto==="rejeitado" ? " rejeitado" : "");
  var tags = [];
  if(i.vencida)                       tags.push('<span class="vg-tag venceu">venceu</span>');
  else if(i.urgente)                  tags.push('<span class="vg-tag urgente">⚠ '+
                                        (i.dias_ate_prazo===0?"hoje":i.dias_ate_prazo+" dia"+(i.dias_ate_prazo===1?"":"s"))+'</span>');
  else if(i.prazo)                    tags.push('<span class="vg-tag prazo">'+vgEsc(i.prazo)+
                                        (i.prazo_brando?" · brando":"")+'</span>');
  else                                tags.push('<span class="vg-tag duvida">sem prazo</span>');
  if(i.novo && st===VG_ST.NOVO)       tags.push('<span class="vg-tag novo">novo</span>');
  if(i.relevancia==="nicho")          tags.push('<span class="vg-tag nicho">núcleo</span>');
  if(i.relevancia==="nao confirmada") tags.push('<span class="vg-tag duvida">área não confirmada</span>');
  if(i.relevancia==="aberto")         tags.push('<span class="vg-tag">AOS aberto</span>');
  /* Vagas 2 — o veredicto da MAQUINA, que e outro eixo da sua triagem: o
     arquivo descreve, o aparelho decide. Item coletado antes desta versao nao
     tem o campo, e nesse caso nada muda na tela. */
  if(i.veredicto==="revisar")         tags.push('<span class="vg-tag duvida" title="'+
                                        vgEsc(i.porque_veredicto||"")+'">revisar</span>');
  if(i.veredicto==="rejeitado")       tags.push('<span class="vg-tag" title="'+
                                        vgEsc(i.porque_veredicto||"")+'">rejeitado</span>');
  if(i.tipo)                          tags.push('<span class="vg-tag">'+vgEsc(vgL(i.tipo))+'</span>');
  if(i.esforco)                       tags.push('<span class="vg-tag">esforço '+vgEsc(vgL(i.esforco))+'</span>');
  if(i.elegibilidade && i.elegibilidade!=="Aberto")
                                      tags.push('<span class="vg-tag duvida">'+vgEsc(vgL(i.elegibilidade))+'</span>');
  if(i.idioma)                        tags.push('<span class="vg-tag">'+vgEsc(i.idioma)+'</span>');
  (i.marcas||[]).forEach(function(m){
    if(m.indexOf("alemao")>=0)        tags.push('<span class="vg-tag urgente">exige alemão fluente</span>');
    if(m.indexOf("texto pronto")>=0)  tags.push('<span class="vg-tag urgente">só com texto pronto</span>');
  });

  /* Chamada nao tem pais nem esforco: dossie de periodico nao tem geografia, e
     chamada nao se candidata — se submete. O verbo do botao muda junto. */
  var ehChamada = !!i.forma;
  var subtitulo = ehChamada ? (i.periodico || i.instituicao || "")
                            : [i.instituicao, i.uf, i.pais].filter(Boolean).join(" · ");
  var simTxt = ehChamada ? "Vou submeter" : "Vou me candidatar";
  var acoes = i.vencida
    ? '<button onclick="vgMarcar(\''+i.id+'\','+VG_ST.ARQ+')">Arquivar</button>'
    : '<button class="'+(st===VG_ST.SIM?"on-sim":"")+'" onclick="vgMarcar(\''+i.id+'\','+VG_ST.SIM+')">'+
        (st===VG_ST.SIM?"✓ "+simTxt.toLowerCase():simTxt)+'</button>'+
      '<button class="'+(st===VG_ST.NAO?"on-nao":"")+'" onclick="vgMarcar(\''+i.id+'\','+VG_ST.NAO+')">'+
        (st===VG_ST.NAO?"descartada":"Descartar")+'</button>';

  return '<div class="'+cls+'">'+
    '<div class="vg-t"><a href="'+vgEsc(i.url)+'" target="_blank" rel="noopener">'+vgEsc(i.titulo)+'</a></div>'+
    '<div class="vg-inst">'+vgEsc(subtitulo)+(i.link_e_da_lista?' · <i>link da lista</i>':'')+'</div>'+
    '<div class="vg-tags">'+tags.join("")+'</div>'+
    '<div class="vg-acoes">'+acoes+'</div>'+
  '</div>';
}

function vgRender(){
  var alvo = document.getElementById("view-vagas");
  if(!alvo) return;
  var itens = (VG_VAGAS.itens||[]).concat(VG_CHAMADAS.itens||[]);
  var mostrar = itens.filter(vgVisivel);
  var nUrg = itens.filter(function(i){return i.urgente && !i.vencida && vgEstado(i.id)!==VG_ST.NAO;}).length;
  var nNovo = itens.filter(function(i){return i.novo && vgEstado(i.id)===VG_ST.NOVO;}).length;
  var nSim = itens.filter(function(i){return vgEstado(i.id)===VG_ST.SIM;}).length;
  var quando = [VG_VAGAS._gerado_em, VG_CHAMADAS._gerado_em].filter(Boolean).sort().pop() || "";

  var h = '<div class="vg-topo">'+
    '<span class="vg-titulo">Vagas</span>'+
    '<span class="vg-resumo">'+mostrar.length+' na lista'+
      (nUrg?' · '+nUrg+' urgente'+(nUrg===1?'':'s'):'')+
      (nSim?' · '+nSim+' marcada'+(nSim===1?'':'s'):'')+'</span>'+
    '<span class="vg-atualizado">coletado em '+vgEsc(quando.slice(0,10)||"—")+'</span>'+
  '</div>';
  var nRev = itens.filter(function(i){
    return i.veredicto==="revisar" && vgEstado(i.id)!==VG_ST.NAO; }).length;
  var fs = [["abertas","Em aberto"],["novas","Novas ("+nNovo+")"],
            ["revisar","Revisar ("+nRev+")"],
            ["sim","Vou me candidatar ("+nSim+")"],["nao","Descartadas"],["tudo","Tudo"]];
  h += '<div class="vg-filtros">' + fs.map(function(f){
    return '<button class="'+(VG_FILTRO===f[0]?"on":"")+'" onclick="VG_FILTRO=\''+f[0]+'\';vgRender()">'+f[1]+'</button>';
  }).join("") + '</div>';

  if(!itens.length){
    h += '<div class="vg-vazio"><b>Nada coletado ainda.</b>'+
         'O Actions roda toda segunda às 8h e grava <code>dados/vagas.json</code> e '+
         '<code>dados/chamadas.json</code>.<br>Este painel enche sozinho na primeira rodada.</div>';
  } else if(!mostrar.length){
    h += '<div class="vg-vazio"><b>Nada neste filtro.</b>Toque em “Tudo” para ver a lista inteira.</div>';
  } else {
    VG_ORDEM.forEach(function(g){
      var doGrupo = mostrar.filter(function(i){return vgGrupo(i)===g;});
      if(!doGrupo.length) return;
      h += '<div class="vg-bloco"><h3>'+VG_GRUPOS[g]+'<span>'+doGrupo.length+'</span></h3>'+
           doGrupo.map(vgCard).join("") + '</div>';
    });
  }
  alvo.innerHTML = h;
}
function vgAbrir(){
  var pronto = vgCarregar();
  vgRender();
  pronto.then(function(mudou){ if(mudou) vgRender(); });
}
function renderBackupAviso(){
  var el=document.getElementById("backup-aviso"); if(!el) return;
  var u=LS("cron:ultimo-backup", null);
  if(!u){ el.textContent="Voc\u00ea ainda n\u00e3o exportou nenhum backup."; el.className="backup-aviso velho"; return; }
  var dias=-diasAte(u);
  el.textContent = dias<=0 ? "Backup exportado hoje." : "\u00daltimo backup h\u00e1 "+dias+" dia"+(dias===1?"":"s")+".";
  el.className = "backup-aviso"+(dias>30?" velho":"");
}

/* ==================== AVISOS — o botao (Fase 8) ====================
   Um botao so, que liga e desliga, e que diz sempre em que estado esta. Ele
   nao aparece quando o aparelho nao suporta (numa aba comum do iOS o
   PushManager nem existe) nem quando as chaves nao foram preenchidas. */
function renderAvisos(){
  var b = document.getElementById("btn-avisos");
  var nota = document.getElementById("avisos-estado");
  if(!b) return;
  if(!temPush() || !avisosConfigurados()){
    b.hidden = true;
    if(nota) nota.textContent = !avisosConfigurados()
      ? "Avisos ainda nao configurados neste Cronograma."
      : "Este aparelho nao aceita avisos. No iPhone, adicione o app \u00e0 Tela de In\u00edcio.";
    return;
  }
  b.hidden = false;
  b.className = "avisos";
  if(Notification.permission === "denied"){
    b.className = "avisos bloqueado";
    b.textContent = "avisos bloqueados nos Ajustes do aparelho";
    b.disabled = true;
    return;
  }
  b.disabled = false;
  inscricaoAtual().then(function(sub){
    if(sub){ b.className = "avisos ligado"; b.textContent = "\u2713 avisos ligados neste aparelho"; }
    else   { b.textContent = "Avisar neste aparelho"; }
  });
}
function alternarAvisos(){
  var b = document.getElementById("btn-avisos");
  var nota = document.getElementById("avisos-estado");
  var diz = function(m){ if(nota) nota.textContent = m; };
  if(Notification.permission === "denied"){
    diz("Libere as notifica\u00e7\u00f5es nos Ajustes do aparelho, para o Cronograma."); return;
  }
  if(b) b.disabled = true;
  inscricaoAtual().then(function(jaTem){
    if(jaTem) return desinscreverAvisos().then(function(){ diz("Avisos desligados neste aparelho."); });
    return inscreverAvisos().then(function(){ diz("Pronto. Os avisos chegam neste aparelho."); });
  }).catch(function(e){
    diz("N\u00e3o deu certo: " + ((e && e.message) || e));
  }).then(function(){
    if(b) b.disabled = false;
    renderAvisos();
  });
}
