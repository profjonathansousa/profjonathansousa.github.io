/* CRONOGRAMA — 10-nucleo.js
   Infraestrutura: localStorage, aparelho, entrada, estado, toques, relogio,
   sincronizacao com o GitHub e as migracoes. E aqui que mora o mecanismo pelo
   qual o ARQUIVO DESCREVE e o APARELHO DECIDE.

   Carrega depois de 00-config.js e antes de tudo o mais. */
const now = new Date();
const todayIdx = now.getDay();
const dateKey = ymd(now);
const monthKey = now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0");
function ymd(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function LS(k,def){try{const v=localStorage.getItem(k);return v===null?def:JSON.parse(v);}catch(e){return def;}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}

/* ================== ESQUEMA v2 — Passo 2 da reforma ==================
   Dois eixos independentes:
     st   — progresso : 0 a fazer · 1 em andamento · 2 concluída
     vida — ciclo     : ativo · adiado · abandonado · arquivado
   Nada é descartado em lugar nenhum:
     · o que passa do teto do registro       -> cron:registro-arquivo
     · o que você remove de um painel        -> cron:arquivo (com restaurar)
     · o histórico que não casar na migração -> cron:registro-antigo
   O log passa a ser gravado por id, com o título fotografado no momento:
   renomear um item deixa de orfanar o histórico.
   ==================================================================== */

function normSub(x){
  if(!x || typeof x!=="object") return x;
  if(typeof x.st!=="number") x.st = 0;
  if(!x.vida) x.vida = "ativo";
  if(!("motivo" in x)) x.motivo = "";
  if(!("voltar_em" in x)) x.voltar_em = "";
  if(!("vidaDesde" in x)) x.vidaDesde = "";
  /* Instante da ultima mudanca FEITA NESTE APARELHO. E o que permite decidir,
     item a item, se o que vem do estado.json e mais novo do que o daqui. */
  if(!("em" in x)) x.em = "";
  if(!("origem" in x)) x.origem = "semente";
  /* campos do mapa_portal.json — ficam vazios até o Passo 4 preenchê-los */
  if(!("onde" in x)) x.onde = "";
  if(!("prova" in x)) x.prova = "";
  if(!("medida" in x)) x.medida = null;   /* {feito, total} */
  return x;
}
function normProj(p){
  if(!p || typeof p!=="object") return p;
  if(!p.vida) p.vida = "ativo";
  if(!("origem" in p)) p.origem = "semente";
  if(!Array.isArray(p.subs)) p.subs = [];
  p.subs.forEach(normSub);
  return p;
}
function chaveTitulo(p,s){
  return String(p||"").trim().toLowerCase()+" ␟ "+String(s||"").trim().toLowerCase();
}
function indiceDeTitulos(){
  var idx={};
  PAINEIS.forEach(function(P){
    var projs;
    try{ projs = LS(P.key, JSON.parse(JSON.stringify(P.seed))); }catch(e){ projs = []; }
    (projs||[]).forEach(function(p){
      (p.subs||[]).forEach(function(x){ idx[chaveTitulo(p.t, x.t)] = {pid:P.id, projId:p.id, subId:x.id}; });
    });
  });
  return idx;
}
/* Migração única, versionada. Casa o histórico antigo pelo texto e converte
   para id. O que não casar NÃO é descartado: vai para cron:registro-antigo. */
function migrarEsquema(){
  if(LS("cron:schema-versao", 1) >= SCHEMA_VERSAO) return;
  PAINEIS.forEach(function(P){
    var v = LS(P.key, null);
    if(v && v.forEach){ v.forEach(normProj); save(P.key, v); }
  });
  var reg = LS("cron:registro", []) || [];
  var idx = indiceDeTitulos();
  var novos = [], orfaos = [];
  reg.forEach(function(o){
    if(!o) return;
    if(o.projId){ novos.push(o); return; }               /* já está no esquema novo */
    var achado = idx[chaveTitulo(o.p, o.s)];
    if(achado){
      novos.push({d:o.d, pid:achado.pid, projId:achado.projId, subId:achado.subId,
                  projT:o.p, subT:o.s, de:null, para:o.st, vida:"ativo", motivo:""});
    } else {
      orfaos.push(o);
    }
  });
  save("cron:registro", novos);
  if(orfaos.length) save("cron:registro-antigo", (LS("cron:registro-antigo", [])||[]).concat(orfaos));
  save("cron:schema-versao", SCHEMA_VERSAO);
  save("cron:migracao-relatorio", {quando:new Date().toISOString(), migradas:novos.length, orfas:orfaos.length});
}
/* Entrada externa (Passo 4): o arquivo manda na ESTRUTURA, o aparelho guarda
   o que é dele. st e vida NUNCA são tocados por aqui. */
function mesclarEntrada(){
  var ent = LS("cron:entrada", null);
  if(!ent || !ent.paineis) return;
  var aplicou = false;
  Object.keys(ent.paineis).forEach(function(pid){
    if(!painelDef(pid)) return;
    var atuais = getProjs(pid), mudou = false, porId = {};
    atuais.forEach(function(p){ porId[p.id]=p; });
    (ent.paineis[pid]||[]).forEach(function(novo){
      if(!novo || !novo.id) return;
      var alvo = porId[novo.id];
      if(!alvo){
        /* Entrada sem titulo e ATUALIZACAO de peca existente, nunca criacao: o
           arquivo de renomeacao manda so id e subs. Sem esta guarda, um aparelho
           a que faltasse uma peca ganharia um projeto sem nome e sem mes — e um
           projeto sem mes desliga a ordenacao do painel inteiro. */
        if(!novo.t) return;
        atuais.push(normProj(Object.assign({}, novo, {origem:"entrada"}))); mudou=true; return;
      }
      if(novo.t && novo.t!==alvo.t){ alvo.t=novo.t; mudou=true; }
      if(novo.n && novo.n!==alvo.n){ alvo.n=novo.n; mudou=true; }
      var subsPorId={}; (alvo.subs||[]).forEach(function(s){ subsPorId[s.id]=s; });
      (novo.subs||[]).forEach(function(ns){
        if(!ns || !ns.id) return;
        var as = subsPorId[ns.id];
        if(!as){ alvo.subs.push(normSub(Object.assign({}, ns, {origem:"entrada"}))); mudou=true; return; }
        ["t","n","onde","prova","medida"].forEach(function(campo){
          if((campo in ns) && JSON.stringify(ns[campo])!==JSON.stringify(as[campo])){ as[campo]=ns[campo]; mudou=true; }
        });
      });
    });
    if(mudou){
      /* Peca nova entra pela ponta certa. Sem isto, um artigo de agosto
         acrescentado hoje apareceria depois de julho de 2027, porque a mesclagem
         empurra para o fim da lista. So reordena quando TODO projeto do painel
         tem mes — a esteira tem; os outros paineis nao, e ficam como estavam. */
      if(atuais.every(function(x){ return typeof x.mes === "string" && x.mes; })){
        atuais.sort(function(a,b){ return a.mes===b.mes ? (a.id<b.id?-1:1) : (a.mes<b.mes?-1:1); });
      }
      setProjs(pid, atuais); aplicou = true;
    }
  });
  /* Guarda a marca do PROPRIO arquivo, nao a hora da mesclagem: e assim que a
     proxima carga sabe que ja aplicou esta versao e nao precisa remesclar. */
  save("cron:entrada-aplicada", ent._gerado_em || new Date().toISOString());
  return aplicou;
}
/* ---- Arquivo: remover deixa de destruir ---- */
function getArquivo(){ return LS("cron:arquivo", []) || []; }
function arquivar(pid, item, tipo, ondeEstava){
  var a = getArquivo();
  a.push({quando:new Date().toISOString(), d:ymd(now), pid:pid, tipo:tipo, ondeEstava:ondeEstava||null, item:item});
  save("cron:arquivo", a);
}
function restaurarArquivo(k){
  var a = getArquivo(), it = a[k];
  if(!it) return;
  var p = getProjs(it.pid);
  if(it.tipo==="projeto"){
    p.push(normProj(it.item));
  } else {
    var alvo = null, procurado = it.ondeEstava && it.ondeEstava.projId;
    for(var i=0;i<p.length;i++){ if(p[i].id===procurado){ alvo=p[i]; break; } }
    if(!alvo){ alert("O item que continha esta subtarefa não existe mais no painel. Restaure-o primeiro."); return; }
    alvo.subs.push(normSub(it.item));
  }
  setProjs(it.pid, p);
  a.splice(k,1); save("cron:arquivo", a);
  renderPainel(it.pid); renderArquivo(); sincronizarHoje(it.pid);
}
let checks = LS("cron:checks:"+dateKey, {});
function guiaStore(){ return LS(TOEFL_GUIA_KEY, {}) || {}; }
function aplicarToeflDoEstado(est){
  if(!est || !est.toefl) return false;
  var st = guiaStore(), mudou = false;
  Object.keys(est.toefl).forEach(function(iid){
    var r = est.toefl[iid];
    if(!r || !r.quando) return;
    var loc = st[iid];
    if(loc && (loc.em || "") >= r.quando) return;   /* empate fica como esta */
    st[iid] = {feito: !!r.feito, em: r.quando};
    mudou = true;
  });
  if(mudou) save(TOEFL_GUIA_KEY, st);
  return mudou;
}
function migrarGuiaToefl(){
  if(LS(TOEFL_MIGRADO_KEY, false)) return 0;
  var st = guiaStore(), n = 0;
  TOEFL_FASES.forEach(function(fid){
    var g = TOEFL_GUIA[fid]; if(!g) return;
    var velho = LS("cron:toefl-guia:"+fid, {}) || {};
    g.itens.forEach(function(it, i){
      if(velho[i] !== true) return;
      if(st[it.id] && st[it.id].feito) return;
      st[it.id] = {feito:true, em:TOEFL_EM};
      enfileirarToque("toefl", {iid:it.id, feito:true}, TOEFL_EM);
      n++;
    });
  });
  save(TOEFL_GUIA_KEY, st);
  save(TOEFL_MIGRADO_KEY, true);
  return n;
}

/* ---- RECALIBRAR ----
   Nao mexe em tarefa nenhuma: refaz a CONTA. Pega o que falta da fase
   corrente em diante, divide pelos dias que restam ate a prova e devolve o
   numero honesto de tarefas por semana. As janelas novas saem da mesma
   divisao, proporcionais ao que sobrou em cada fase — quem tem mais pendente
   fica com mais dias.

   O TOEFL_PLANO nao e reescrito, de proposito: ele e a memoria do que se
   previu, e e contra ela que o aviso compara. Recalibrar acrescenta uma
   leitura nova; nao apaga a antiga. */
function getMetas(k){k=k||mesAtivo;
  return LS("cron:metas:"+k, k===MES_INICIO ? JSON.parse(JSON.stringify(METAS_DEFAULT)) : []);}
function setMetas(m,k){save("cron:metas:"+(k||mesAtivo),m);}
function getEventos(){return LS("cron:eventos", JSON.parse(JSON.stringify(EVENTOS_DEFAULT)));}
function setEventos(e){save("cron:eventos",e);}
/* ---- Painéis de projetos: estado persistente, sem data ---- */
function painelDef(pid){ for(var i=0;i<PAINEIS.length;i++){ if(PAINEIS[i].id===pid) return PAINEIS[i]; } return null; }
function getProjs(pid){ var P=painelDef(pid); var v=LS(P.key, JSON.parse(JSON.stringify(P.seed))); if(v&&v.forEach) v.forEach(normProj); return v; }
function setProjs(pid,v){ save(painelDef(pid).key, v); }
function getTec(){return getProjs("tecnico");}
function setTec(p){setProjs("tecnico",p);}
function abertos(){return LS("cron:paineis-open",{});}
function projAberto(pid,id,emAnd){var a=abertos(),k=pid+"/"+id;return (k in a)?a[k]:emAnd;}
function setProjAberto(pid,id,v){var a=abertos();a[pid+"/"+id]=v;save("cron:paineis-open",a);}
/* ================= A ESCRITA DO SUBITEM MORA AQUI, E SO AQUI =================
   Ate agora o cycleSub era o unico jeito de mudar o `st` de um subitem, e ele
   so sabia falar por indice (painel, posicao do projeto, posicao do subitem).
   A aba Hoje passou a marcar o MESMO subitem, e o caminho dela e por id.

   A tentacao seria escrever um segundo caminho. Nao: e exatamente o defeito do
   `dadosDoEvento` em 29/08 — o botao do acervo montava o proprio payload, e
   ficou para tras no dia em que o titulo passou a viajar. Dois escritores do
   mesmo dado significa que um dia um deles nao aprende o que o outro aprendeu.

   Entao ha um escritor so. Quem chama decide QUAL estado; este decide COMO se
   escreve — gravar o `em`, chamar o logar(), e portanto gerar UM toque do tipo
   `itens`, que ja existe e ja viaja. O cycleSub virou quem calcula o proximo
   estado do ciclo, e nada mais.

   Devolve null quando nao houve mudanca: marcar o que ja estava marcado nao e
   um toque, e um toque a toa vira uma linha a toa no registro dos dois
   aparelhos. E a mesma guarda que o editEv ganhou em 29/08.
   ============================================================================ */
function getPrio(sem){ var v = LS("cron:prioridades:" + (sem||semanaAtual), []); return (v&&v.forEach)?v:[]; }
function setPrio(lista, sem){ save("cron:prioridades:" + (sem||semanaAtual), lista); }

/* Os dados que viajam. O texto da ETAPA nunca entra aqui — ver o bloco acima.
   `t` e o rotulo da prioridade livre, ou o titulo do projeto como legenda. */
function aplicarPrioridadesDoEstado(est){
  if(!est || !est.prioridades) return false;
  var porSemana = {};
  Object.keys(est.prioridades).forEach(function(k){
    var corte = k.indexOf("/");
    if(corte < 0) return;
    (porSemana[k.slice(0,corte)] = porSemana[k.slice(0,corte)] || [])
      .push({prid:k.slice(corte+1), r:est.prioridades[k]});
  });
  var mudou = false;
  Object.keys(porSemana).forEach(function(sem){
    var lista = getPrio(sem), mudouSem = false;
    porSemana[sem].forEach(function(o){
      var r = o.r;
      if(!r || !r.quando) return;
      var j = -1;
      for(var n=0;n<lista.length;n++){ if(lista[n].id === o.prid){ j = n; break; } }
      if(j > -1 && (lista[j].em || "") >= r.quando) return;
      if(r.del){ if(j > -1){ lista.splice(j,1); mudouSem = true; } return; }
      var novo = {id:o.prid, tipo:r.tipo || "livre", painel:r.painel || "",
                  projId:r.projId || "", t:r.t || "", em:r.quando};
      if(j < 0) lista.push(novo); else lista[j] = novo;
      mudouSem = true;
    });
    if(mudouSem){ setPrio(lista, sem); mudou = true; }
  });
  return mudou;
}

/* ============== MOTOR DE PRIORIDADES — Fase 3 ==============
   CLASSIFICA, NAO PONTUA. Nenhuma soma, nenhum peso somado, nenhum corte
   numerico — a mesma decisao que o coletor de vagas tomou na v2, e pela mesma
   razao: nota e opaca. Aqui cada sugestao carrega a CLASSE que a elegeu e o
   MOTIVO em portugues, e as duas coisas vao para a tela.

   A HIERARQUIA E ABSOLUTA: manual > sugestao > rotina. O motor nao remove, nao
   rebaixa e nao substitui nada que voce escolheu. Ele so preenche o que sobrou
   de um teto de tres, e o teto e o ponto: uma tela com dez "prioridades" nao
   tem prioridade nenhuma.

   O QUE NAO EXISTE E NAO FOI INVENTADO. A auditoria de 2026-09-01 procurou
   importancia, consequencia e dependencia no dado, e achou o seguinte:
     · importancia: NAO existia. Ganhou uma palavra por painel (PAINEIS.peso) e
       um sinal derivado — projeto que VOCE priorizou nas ultimas 4 semanas.
     · consequencia: NAO existe como campo, e nao virou um. Perder uma janela
       datada E a consequencia, e ela ja e a classe URGENTE.
     · dependencia entre projetos: NAO existe no dado. A unica dependencia real
       e o `prova: "estrela"`, que diz "travado esperando uma decisao sua" — e
       essa e a classe DECISAO.
   Descartados de proposito: prazo escrito em prosa no campo `n` (parsear prosa
   foi exatamente o defeito da ANPOF na Fase 1), cron:eventos (tem data, nao
   tem vinculo com projeto: ligar por texto seria inventar) e os prazos das
   vagas (nao sao projetos de trilho, e ja tem indicador proprio).
   ============================================================= */
function retomadasAdiadas(){ return LS(RETOMADA_KEY, {}) || {}; }
/* Le o `ate` aceitando as duas formas. A antiga so aparece entre o carregamento
   e a migracao, mas ler pelos dois caminhos evita que um aparelho que falhe na
   migracao passe a ignorar silencios que ele mesmo pos. */
function migrarRetomadas(){
  if(LS(RETOMADA_MIGRADO_KEY, false)) return 0;
  var m = retomadasAdiadas(), hojeStr = ymd(now), out = {}, n = 0;
  Object.keys(m).forEach(function(chave){
    var r = m[chave];
    if(typeof r !== "string"){ out[chave] = r; return; }   /* ja convertida */
    out[chave] = {ate:r, em:RETOMADA_EM};                  /* convertida, fica */
    if(!(r > hojeStr)) return;                             /* vencida: nao sobe */
    var corte = chave.indexOf("/");
    if(corte < 0) return;
    enfileirarToque("retomada", {pid:chave.slice(0, corte),
                                 projId:chave.slice(corte + 1), ate:r}, RETOMADA_EM);
    n++;
  });
  save(RETOMADA_KEY, out);
  save(RETOMADA_MIGRADO_KEY, true);
  return n;
}
/* A DESCIDA. Molde do aplicarToeflDoEstado: mais novo manda, empate fica como
   esta, mais antigo e ignorado. Nao emite toque — receber nao e tocar. */
function aplicarRetomadasDoEstado(est){
  if(!est || !est.retomadas) return false;
  var m = retomadasAdiadas(), mudou = false;
  Object.keys(est.retomadas).forEach(function(chave){
    var r = est.retomadas[chave];
    if(!r || !r.quando || !r.ate) return;
    var loc = m[chave];
    var emLocal = (loc && typeof loc === "object") ? (loc.em || "") : "";
    if(loc && emLocal >= r.quando) return;
    m[chave] = {ate:r.ate, em:r.quando};
    mudou = true;
  });
  if(mudou) save(RETOMADA_KEY, m);
  return mudou;
}

function getToques(){ return LS("cron:toques", []) || []; }
function setToques(f){ save("cron:toques", f); }

/* ENVIO AUTOMATICO, COM ESPERA CURTA.
   Antes, os toques so subiam ao abrir a pagina: quem marcava e fechava a aba
   deixava a fila parada ate a proxima abertura. Agora cada toque agenda um
   envio, e um toque novo adia o envio agendado. Marcar dez itens seguidos
   continua sendo UM commit — que e o que protege o limite de reconstrucoes
   do Pages, a razao pela qual o lote existe. */
var ENVIO_TIMER = null;
function agendarEnvio(){
  try{
    if(ENVIO_TIMER) clearTimeout(ENVIO_TIMER);
    ENVIO_TIMER = setTimeout(function(){ ENVIO_TIMER = null; enviarToques(true); }, ENVIO_ESPERA);
  }catch(e){}
}

/* Identidade do aparelho: nasce no primeiro toque e não muda mais. Serve para o
   Cowork saber de onde veio cada toque, e para dois aparelhos que tocam no mesmo
   segundo não gerarem o mesmo nome de arquivo. */
function aparelhoId(){
  var a = LS("cron:aparelho", null);
  if(!a){ a = Math.random().toString(36).slice(2,8); save("cron:aparelho", a); }
  return a;
}

/* ================= RELOGIO MONOTONICO DO APARELHO =================
   O id do toque nasce do instante. Dois toques no mesmo milissegundo geravam
   o mesmo id — e trazerTodas() produz 2xN toques num laco, todos no mesmo
   milissegundo. A dobra descartaria os repetidos como "ja vistos", ou os
   contaria duas vezes; de um jeito ou de outro, o id deixa de identificar.

   O GUARDA MORA AQUI, na geracao, e nao em quem chama. Assim vale para
   trazerMeta, trazerTodas e para qualquer laco que venha depois, sem que
   ninguem precise lembrar de somar milissegundo na mao.

   POR APARELHO, e nao por aba: a marca fica no localStorage, entao duas abas
   do mesmo navegador nao entregam o mesmo instante. Nao ha tranca entre abas,
   mas a leitura e sincrona e a janela fica desprezivel perto da que havia.

   AS BASES EXPLICITAS SAO CONTADAS A PARTE. A migracao publica com instante
   ANTIGO de proposito (§8.2 do briefing de 27/08): se houvesse um contador
   unico, um toque de agora empurraria a migracao para o presente e mataria a
   retroacao — que existe justamente para o toque antigo NAO vencer o recente.
   ================================================================= */

function instanteDoToque(quandoISO){
  if(quandoISO){
    var base = new Date(quandoISO).getTime();
    if(!isFinite(base)) base = Date.now();
    var chave = String(base);
    var mapa = LS(RELOGIO_BASES_KEY, {}) || {};
    /* Primeira vez nesta base: comeca no piso, ou logo depois do ultimo
       instante que o estado.json publicado ja mostra naquele mesmo piso. A
       segunda metade cobre o aparelho que publicou ANTES desta correcao
       existir e nao tem o mapa: a memoria dele esta la fora, no estado.json. */
    var v = (chave in mapa) ? mapa[chave] + 1 : Math.max(base, pisoJaGasto(base) + 1);
    mapa[chave] = v;
    save(RELOGIO_BASES_KEY, mapa);
    return v;
  }
  var agora = Date.now();
  var ultimo = LS(RELOGIO_KEY, 0);
  if(typeof ultimo !== "number" || !isFinite(ultimo)) ultimo = 0;
  if(ultimo - agora > RELOGIO_FOLGA) ultimo = 0;
  var ms = (agora <= ultimo) ? ultimo + 1 : agora;
  save(RELOGIO_KEY, ms);
  return ms;
}

/* Hora de verdade, não a do carregamento da página: o `now` do topo é fixado
   quando o app abre, e um celular que passa a noite aberto carimbaria ontem.

   Devolve o instante que usou, em ISO. Quem migra precisa gravar no aparelho
   exatamente o mesmo instante que subiu no toque — se o relogio deslocar um
   milissegundo e o aparelho guardar o outro valor, os dois passam a discordar
   sobre quando aquilo aconteceu. */
function enfileirarToque(tipo, dados, quandoISO){
  /* quandoISO existe para UM caso: publicar, uma vez, o que ja estava
     marcado no aparelho antes de este mecanismo existir. Sem ele, uma
     marcacao de semana passada subiria com a data de hoje e venceria uma
     marcacao recente feita no outro aparelho. */
  var iso = new Date(instanteDoToque(quandoISO)).toISOString();
  var f = getToques();
  f.push({ v:TOQUES_SCHEMA,
           id: iso.replace(/[:.]/g,"-") + "-" + aparelhoId(),
           quando: iso,
           aparelho: aparelhoId(),
           app: APP_VERSION,
           tipo: tipo,
           dados: dados });
  if(f.length > TOQUES_TETO){
    var sobra = f.slice(0, f.length - TOQUES_TETO);
    f = f.slice(-TOQUES_TETO);
    save("cron:toques-excedente", (LS("cron:toques-excedente", [])||[]).concat(sobra));
  }
  setToques(f);
  renderToquesAviso();
  agendarEnvio();
  return iso;
}

/* Só desenha se o elemento existir. A tela de ajustes ainda não foi construída,
   e a ausência dela não pode derrubar um toque. */

function getToken(){ try{ return localStorage.getItem(TOKEN_KEY) || ""; }catch(e){ return ""; } }

function salvarToken(){
  var el = document.getElementById("sync-token");
  var t = (el.value || "").trim();
  if(!t){ alert("Cole o token antes de salvar."); return; }
  if(t.indexOf("github_pat_") !== 0 && t.indexOf("ghp_") !== 0){
    if(!confirm("Isso não parece um token do GitHub (eles começam com github_pat_ ou ghp_). Salvar assim mesmo?")) return;
  }
  try{ localStorage.setItem(TOKEN_KEY, t); }catch(e){ alert("Não foi possível guardar o token neste aparelho."); return; }
  el.value = "";
  renderSyncEstado();
}

function removerToken(){
  if(!confirm("Remover o token deste aparelho? Os toques continuam na fila até você colar outro.")) return;
  try{ localStorage.removeItem(TOKEN_KEY); }catch(e){}
  renderSyncEstado();
}

/* Mostra os quatro últimos caracteres, e só. Serve para você conferir que a
   colagem funcionou e qual token está aqui, sem exibir o token. */
function semMotivo(linha){
  var c = {};
  for(var k in linha){ if(k !== "motivo") c[k] = linha[k]; }
  c.temMotivo = !!(linha.motivo && String(linha.motivo).trim());
  return c;
}

/* ================== ENVIO DOS TOQUES ==================
   Um arquivo NOVO por envio, pela API do GitHub. Arquivo já enviado nunca é
   editado: é isso, e só isso, que torna o desenho à prova de conflito quando o
   celular e o Mac tocam o mesmo item no mesmo dia. Quem concilia é o Cowork, ao
   dobrar tudo em estado.json.

   GRANULARIDADE. O desenho original dizia "um arquivo por toque". Mantive a
   propriedade que importa (arquivo novo, nunca editado) mas juntando os toques
   pendentes num lote por envio, porque cada gravação pela API é um commit no
   main, e cada commit no main é uma reconstrução do GitHub Pages. Marcar dez
   etapas seguidas seriam dez reconstruções do site, e o Pages tem limite.
   Para voltar ao literal, troque TOQUES_POR_ARQUIVO para "um".
   ====================================================== */
function paraBase64(obj){
  var bytes = new TextEncoder().encode(JSON.stringify(obj, null, 1));
  var bin = ""; for(var i=0;i<bytes.length;i++){ bin += String.fromCharCode(bytes[i]); }
  return btoa(bin);
}

/* O NOME CARREGA A IDENTIDADE DO LOTE INTEIRO.
   Era aqui o defeito. Com o nome derivado so de fila[0], um 422 provava apenas
   que o PRIMEIRO toque ja subira — e a fila inteira era cortada mesmo assim,
   levando junto tudo que tivesse entrado atras dele. O codigo sempre supos que
   o nome identifica o que esta dentro; isso valia no modo "um" e deixou de
   valer quando o lote entrou, sem que o nome acompanhasse.
   Com o nome derivado do CONJUNTO, 422 volta a significar o que se supunha:
   um arquivo com este nome so pode ter sido escrito por um envio com
   exatamente estes toques, nesta ordem.
   O prefixo continua sendo o instante do primeiro toque, para que a pasta siga
   ordenada por tempo — a ordem de leitura da dobra depende disso. */
function nomeDoLote(fila){
  return fila[0].id + "-" + fila.length + "-" + impressaoDeIds(fila) + ".json";
}
/* FNV-1a de 32 bits sobre os ids, em ordem. Nao e criptografia: e uma
   impressao curta e estavel do conjunto, calculada sem depender de
   crypto.subtle, que e assincrono e exige contexto seguro. */
function impressaoDeIds(fila){
  var s = fila.map(function(t){ return t.id; }).join("|");
  var h = 0x811c9dc5;
  for(var i=0;i<s.length;i++){
    h ^= s.charCodeAt(i);
    h = (h + (h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24)) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

/* CORTE DE TEMPO. Uma conexão pendurada nunca resolve a promessa do fetch, e
   sem corte o ENVIANDO nunca voltava a false: a aba parava de enviar até ser
   recarregada. O aborto cai no .catch abaixo e vira status 0 — "sem rede" —,
   que descreve exatamente o que aconteceu, e deixa a fila intacta. */

function gravarNoGitHub(nome, corpo, mensagem){
  /* O corpo primeiro, e só depois o relógio: se paraBase64 falhar, ele falha
     antes de existir temporizador algum para ficar solto por aí. */
  var corpoJson = JSON.stringify({ message: mensagem, content: paraBase64(corpo), branch: GH_RAMO });
  var ctl = null, corte = null;
  try{ ctl = new AbortController(); }catch(e){ ctl = null; }
  if(ctl) corte = setTimeout(function(){ try{ ctl.abort(); }catch(e){} }, ENVIO_TIMEOUT);
  var solta = function(){ if(corte){ clearTimeout(corte); corte = null; } };
  var pedido = {
    method: "PUT",
    headers: { "Authorization": "Bearer " + getToken(),
               "Accept": "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28" },
    body: corpoJson
  };
  if(ctl) pedido.signal = ctl.signal;
  return fetch("https://api.github.com/repos/"+GH_DONO+"/"+GH_REPO+"/contents/"+GH_PASTA+"/"+nome, pedido)
    .then(function(res){
      solta();
      if(res.status === 201 || res.status === 200) return {ok:true};
      /* 422 é o que a API responde quando o arquivo já existe e não veio sha.
         O nome carrega agora a identidade do LOTE INTEIRO — primeiro id,
         quantidade e impressão dos ids —, então um arquivo com este nome só
         pode ter sido escrito por um envio com exatamente estes toques. É
         reenvio do que já subiu, e não falha. */
      if(res.status === 422) return {ok:true, jaEstava:true};
      return res.text().catch(function(){return "";}).then(function(t){
        return {ok:false, status:res.status, msg:(t||"").slice(0,300)};
      });
    })
    .catch(function(e){
      solta();
      return {ok:false, status:0, msg:String(e && e.message || e)};
    });
}

function explicarFalha(f, enviados){
  var base = enviados ? enviados + " toque(s) subiram antes da falha; o resto continua na fila.\n\n"
                      : "Nada subiu; a fila está intacta.\n\n";
  if(f.status === 0)   return base + "Sem rede, ou o GitHub não respondeu a tempo. Tente de novo quando houver sinal.";
  if(f.status === 401) return base + "O GitHub recusou o token. Ele expirou, foi revogado, ou foi colado incompleto. Cole outro em Sincronização.";
  if(f.status === 403) return base + "Token sem permissão para gravar. Ele precisa de Contents: Read and write neste repositório — e só disso.";
  if(f.status === 404) return base + "Repositório ou caminho não encontrado: " + GH_DONO + "/" + GH_REPO + ". Se o token não enxerga este repositório, o GitHub responde 404 em vez de 403.";
  if(f.status === 409) return base + "Conflito no ramo " + GH_RAMO + ". Tente de novo em alguns segundos.";
  return base + "O GitHub respondeu " + f.status + ". " + (f.msg || "");
}

var ENVIANDO = false;

/* silencioso = disparado pelo app (ao abrir, ao voltar a rede). Sem alertas:
   um aviso de erro no meio de uma aula não ajuda ninguém. O contador da tela
   de Sincronização continua contando a verdade. */
function enviarToques(silencioso){
  if(ENVIANDO) return Promise.resolve();
  if(!getToken()){ if(!silencioso) alert("Cole o token primeiro, aqui em Sincronização."); return Promise.resolve(); }
  var fila = getToques();
  if(!fila.length){ if(!silencioso) alert("Nada esperando envio."); return Promise.resolve(); }

  ENVIANDO = true; renderToquesAviso();

  /* Cada pacote diz QUAIS ids ele leva. E por eles, e nao por contagem, que a
     fila e cortada depois. */
  var pacotes;
  if(TOQUES_POR_ARQUIVO === "um"){
    pacotes = fila.map(function(t){ return {nome:t.id+".json", corpo:t, ids:[t.id],
             msg:"toque: "+((t.dados && t.dados.subT) || t.tipo)+" ("+t.aparelho+")"}; });
  } else {
    pacotes = [{ nome: nomeDoLote(fila), ids: fila.map(function(t){ return t.id; }),
                 corpo: { v:TOQUES_SCHEMA, lote:fila[0].id, quando:new Date().toISOString(),
                          aparelho:aparelhoId(), app:APP_VERSION, toques:fila },
                 msg: "toques: " + fila.length + " de " + aparelhoId() }];
  }

  var subiram = {}, enviados = 0, falha = null;
  /* Em ordem e parando na primeira falha: o que não subiu continua na fila,
     na ordem em que aconteceu. */
  var cadeia = Promise.resolve();
  pacotes.forEach(function(pc){
    cadeia = cadeia.then(function(){
      if(falha) return;
      return gravarNoGitHub(pc.nome, pc.corpo, pc.msg).then(function(r){
        if(!r.ok){ falha = r; return; }
        pc.ids.forEach(function(id){ subiram[id] = 1; });
        enviados += pc.ids.length;
      });
    });
  });

  /* A trava tem de cair pelos dois caminhos. Sem o segundo ramo do then, uma
     exceção inesperada na cadeia deixava ENVIANDO em true para o resto da vida
     da aba, e nada mais subia até um recarregamento. */
  var terminar = function(){ ENVIANDO = false; renderToquesAviso(); };

  return cadeia.then(function(){
    /* CORTA POR ID, NÃO POR POSIÇÃO. O slice(enviados) de antes supunha que os
       N primeiros da fila atual eram os que subiram — suposição que cai por
       terra se um toque novo entrou no meio do envio, ou se outra aba do mesmo
       aparelho já cortou a fila. Remover exatamente os ids que subiram não
       depende de suposição nenhuma. */
    if(enviados) setToques(getToques().filter(function(t){ return !subiram[t.id]; }));
    terminar();
    if(falha && !silencioso) alert(explicarFalha(falha, enviados));
  }, function(err){
    terminar();
    try{ console.error("envio de toques falhou:", err); }catch(e){}
    if(!silencioso) alert("Não foi possível enviar agora. A fila está intacta e sobe na próxima tentativa.");
  });
}

/* ---- Registro: histórico datado, só cresce ---- */
function getReg(){return LS("cron:registro", []) || [];}
/* Grava por id, com o título fotografado no momento. Registra também o
   RECUO (voltar para "a fazer"), que antes sumia. O que passa do teto
   não é descartado: vai para cron:registro-arquivo. */
function logar(pid, proj, sub, de, para){
  var r=getReg();
  var linha={d:ymd(now), pid:pid, projId:proj.id, subId:sub.id,
             projT:proj.t, subT:sub.t, de:(de===undefined?null:de), para:para,
             vida:sub.vida||"ativo", motivo:sub.motivo||""};
  r.push(linha);
  if(r.length>REG_TETO){
    var excedente=r.slice(0, r.length-REG_TETO);
    r=r.slice(-REG_TETO);
    save("cron:registro-arquivo", (LS("cron:registro-arquivo", [])||[]).concat(excedente));
  }
  save("cron:registro", r);
  /* A fila leva a MESMA linha que o registro guarda: uma fonte, dois
     consumidores. Se um dia o registro mudar de forma, o toque muda junto. */
  enfileirarToque("registro", semMotivo(linha));
}
function escapeHtml(s){return (s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
var VG_FILTRO = "abertas";
var VG_VAGAS = {itens:[]}, VG_CHAMADAS = {itens:[]}, VG_BUSCOU = false;

function vgTriagem(){ return LS("cron:triagem", {}) || {}; }
function vgSalvarTriagem(t){ save("cron:triagem", t); }

/* MIGRACAO, UMA VEZ POR APARELHO.
   O toque so publica marcacao NOVA. Uma vaga marcada antes desta versao
   existe so no aparelho que a marcou, e nao viajaria nunca — foi o que
   aconteceu com tres "vou me candidatar" em 27/08. Esta rotina publica,
   uma unica vez, o que ja estava aqui.

   A DATA E A DA MARCACAO, nao a de agora: a triagem antiga guardava o dia
   em `quando`, e e ele que vai no toque, ao meio-dia UTC. Assim o relogio
   continua decidindo direito, e uma marcacao recente do outro aparelho nao
   e atropelada por uma antiga que so agora subiu. O milissegundo somado por
   item existe porque o id do toque nasce do instante: duas marcacoes do
   mesmo dia gerariam o mesmo id, e a dobra descartaria a segunda como ja
   vista. */
function migrarTriagemUmaVez(){
  try{
    if(LS("cron:triagem-publicada", false)) return;
    var t = LS("cron:triagem", {}) || {};
    var vids = Object.keys(t), n = 0;
    vids.forEach(function(vid){
      var r = t[vid];
      if(!r || !r.st) return;      /* st 0 e ausencia de marca */
      if(r.em) return;             /* ja nasceu com instante: ja viaja */
      var dia = (r.quando && /^\d{4}-\d{2}-\d{2}$/.test(r.quando)) ? r.quando : ymd(new Date());
      var em = new Date(new Date(dia + "T12:00:00.000Z").getTime() + n).toISOString();
      r.em = em; t[vid] = r;
      enfileirarToque("triagem", {vid:vid, st:r.st}, em);
      n++;
    });
    save("cron:triagem", t);
    save("cron:triagem-publicada", true);
    if(n) console.log("triagem: " + n + " marcacao(oes) anterior(es) publicada(s).");
  }catch(e){ console.error("migracao da triagem falhou:", e); }
}
function vgEstado(id){ var t = vgTriagem()[id]; return t ? (t.st||0) : 0; }

function vgBuscar(u){
  return fetch(u, {cache:"no-store"})
    .then(function(r){ return r.ok ? r.json() : null; })
    .catch(function(){ return null; });
}

/* Cache primeiro, rede depois. No metro o painel abre com o que ja tinha em
   vez de abrir vazio; se a rede responder, atualiza e regrava o cache.

   CARREGAR E DESENHAR VIRARAM DUAS COISAS. O painel da aba Semana tambem
   precisa dos prazos, e ate agora o feed so era buscado por quem abrisse a aba
   Vagas: quem fosse direto para a Semana veria uma lista vazia sem saber por
   que. Agora uma funcao carrega e devolve promessa, a outra desenha. */
function vgCarregar(){
  var cache = LS("cron:feed-cache", null);
  if(cache){
    VG_VAGAS = cache.vagas || {itens:[]};
    VG_CHAMADAS = cache.chamadas || {itens:[]};
  }
  if(VG_BUSCOU) return Promise.resolve(false);
  VG_BUSCOU = true;
  return Promise.all([vgBuscar("../dados/vagas.json"), vgBuscar("../dados/chamadas.json")])
    .then(function(r){
      if(r[0]) VG_VAGAS = r[0];
      if(r[1]) VG_CHAMADAS = r[1];
      if(r[0] || r[1]){ save("cron:feed-cache", {vagas:VG_VAGAS, chamadas:VG_CHAMADAS,
                                                 quando:new Date().toISOString()}); return true; }
      return false;
    });
}

/* ---- Backup: exportar / importar todos os dados cron: ---- */
function coletarDados(){
  const d={};
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    /* Cinto e suspensório: a chave do token já mora fora do prefixo cron:,
       e ainda assim nada que se pareça com token é varrido para um backup. */
    if(k && k.indexOf("cron:")===0 && !/token/i.test(k)){ d[k]=localStorage.getItem(k); }
  }
  return d;
}
function exportarDados(){
  save("cron:ultimo-backup", ymd(new Date()));
  renderBackupAviso();
  const payload={_app:"Cronograma", _versao:APP_VERSION, _data:new Date().toISOString(), dados:coletarDados()};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download="cronograma-backup-"+ymd(new Date())+".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function importarDados(input){
  const file=input.files && input.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=function(){
    try{
      const parsed=JSON.parse(reader.result);
      const dados=parsed && parsed.dados ? parsed.dados : parsed;
      const chaves=Object.keys(dados||{}).filter(k=>k.indexOf("cron:")===0);
      if(!chaves.length){ alert("Backup inválido: nenhum dado do Cronograma encontrado."); input.value=""; return; }
      if(!confirm("Importar "+chaves.length+" itens deste backup? As marcações atuais serão substituídas pelas do arquivo.")){ input.value=""; return; }
      chaves.forEach(k=>{ try{ localStorage.setItem(k, dados[k]); }catch(e){} });
      alert("Backup importado. O app vai recarregar.");
      location.reload();
    }catch(e){ alert("Não foi possível ler o arquivo: "+e.message); }
    input.value="";
  };
  reader.readAsText(file);
}
/* ---- Atualização automática + puxar para atualizar ---- */
function baseUrl(){return location.pathname;}
async function checkUpdate(){
  try{
    const res = await fetch(baseUrl()+"?ping="+Date.now(), {cache:"no-store"});
    const txt = await res.text();
    const m = txt.match(/APP_VERSION\s*=\s*"([^"]+)"/);
    if(m && m[1] !== APP_VERSION){ location.replace(baseUrl()+"?v="+m[1]); }
  }catch(e){/* sem rede: segue com a versão atual */}
}
function buscarEntrada(){
  return fetch("entrada.json?v=" + Date.now(), {cache:"no-store"})
    .then(function(r){ return r.ok ? r.json() : null; })
    .catch(function(){ return null; })
    .then(function(ent){
      if(!ent || !ent.paineis) return;
      var marca = ent._gerado_em || "";
      if(marca && marca === LS("cron:entrada-aplicada", null)) return;
      save("cron:entrada", ent);
      if(mesclarEntrada()){ renderOrdo(); renderHoje(); renderSemana(); renderTrilhos(); }
    });
}
/* ---- Estado: o que os OUTROS aparelhos marcaram ----
   Os toques sobem, o Cowork dobra em estado.json, e e aqui que eles descem. Sem
   isto o painel e um por aparelho: voce marca no celular e o Mac nao sabe.

   Vence o relogio, item a item. Cada subitem carrega `em`, o instante da ultima
   mudanca feita NESTE aparelho; o estado.json carrega `quando`, o instante da
   ultima mudanca conhecida por todos. Mais novo manda, e empate fica como esta.

   Isto NAO gera toque. Receber nao e tocar: chamar logar() aqui criaria um eco
   que voltaria a subir a cada carregamento, para sempre. */
function buscarEstado(){
  return fetch("estado.json?v=" + Date.now(), {cache:"no-store"})
    .then(function(r){ return r.ok ? r.json() : null; })
    .catch(function(){ return null; })
    .then(function(est){
      if(!est) return;
      /* Fotografia do que o estado.json ja contem, para o contador do acervo.
         Fora dos if() de cada secao de proposito: "publicado, e vazio" precisa
         ficar gravado tanto quanto "publicado, e cheio". */
      try{
        var laFora = {metas:{}, eventos:{}, piso:0};
        var pisoMs = new Date(ACERVO_EM).getTime(), lim = pisoMs + 86400000;
        var olha = function(q){
          var ms = new Date(q).getTime();
          if(isFinite(ms) && ms >= pisoMs && ms < lim && ms > laFora.piso) laFora.piso = ms;
        };
        var sm = est.metas || {};
        Object.keys(sm).forEach(function(k){ laFora.metas[k] = sm[k].quando || ""; olha(sm[k].quando); });
        /* Do evento a fotografia guarda mais do que o instante: se o titulo ja
           esta la fora e se a marca de privado ja chegou. E o que permite o
           botao do acervo saber que falta publicar um titulo, ou que falta
           retirar um que agora e privado. */
        var se = est.eventos || {};
        Object.keys(se).forEach(function(k){
          laFora.eventos[k] = {q: se[k].quando || "", t: !!(se[k].t), p: !!se[k].priv};
          olha(se[k].quando);
        });
        (est.historico || []).forEach(function(x){ if(x) olha(x.quando); });
        save(ACERVO_LA_FORA_KEY, laFora);
      }catch(e){}
      var mudou = false;
      if(est.itens) PAINEIS.forEach(function(P){
        var projs = getProjs(P.id), mudouAqui = false;
        (projs||[]).forEach(function(pr){
          (pr.subs||[]).forEach(function(x){
            normSub(x);
            var r = est.itens[P.id + "/" + pr.id + "/" + x.id];
            if(!r || !r.quando) return;
            if((x.em || "") >= r.quando) return;
            if(typeof r.st === "number") x.st = r.st;
            if(r.vida) x.vida = r.vida;
            /* O motivo nao viaja: e texto livre e o repositorio e publico. Quem
               recebe ve a marca e sabe onde esta a razao, em vez de ver um
               motivo velho do proprio aparelho colado numa marca nova. */
            x.motivo = r.temMotivo ? "motivo registrado no outro aparelho" : "";
            x.em = r.quando;
            mudouAqui = true;
          });
        });
        if(mudouAqui){ setProjs(P.id, projs); mudou = true; }
      });
      /* ---- Vagas: a triagem tambem desce ----
         Mesma regra do relogio, vaga a vaga. O id da vaga e estavel
         (philjobs-31649), entao a triagem sobrevive a coleta semanal, que
         reescreve dados/vagas.json inteiro toda segunda. */
      if(est.triagem){
        var tri = LS("cron:triagem", {}) || {}, mudouTri = false;
        Object.keys(est.triagem).forEach(function(vid){
          var r = est.triagem[vid];
          if(!r || !r.quando) return;
          var atual = tri[vid];
          if(atual && (atual.em || "") >= r.quando) return;
          tri[vid] = {st:r.st, quando:String(r.quando).slice(0,10), em:r.quando};
          mudouTri = true;
        });
        if(mudouTri){
          save("cron:triagem", tri);
          try{
            var abaVg = document.getElementById("view-vagas");
            if(abaVg && !abaVg.hidden && typeof vgRender === "function") vgRender();
          }catch(e){}
        }
      }
      /* ---- Metas do mes ----
         Chave e "AAAA-MM/id". Meta desconhecida entra; meta com lapide sai;
         meta conhecida so muda se o que vem de fora for mais novo do que a
         ultima mudanca feita aqui. */
      if(est.metas){
        var porMesR = {};
        Object.keys(est.metas).forEach(function(k){
          var corte = k.indexOf("/");
          if(corte < 0) return;
          var mes = k.slice(0, corte);
          (porMesR[mes] = porMesR[mes] || []).push({mid:k.slice(corte+1), r:est.metas[k]});
        });
        var mudouAlgumaMeta = false;
        Object.keys(porMesR).forEach(function(mes){
          var lista = getMetas(mes), mudouMes = false;
          porMesR[mes].forEach(function(o){
            var r = o.r;
            if(!r || !r.quando) return;
            var j = -1;
            for(var n=0;n<lista.length;n++){ if(lista[n].id === o.mid){ j = n; break; } }
            if(j > -1 && (lista[j].em || "") >= r.quando) return;
            if(r.del){ if(j > -1){ lista.splice(j,1); mudouMes = true; } return; }
            if(j < 0){ lista.push({id:o.mid, t:r.t||"", done:!!r.done, de:r.de||undefined, em:r.quando}); }
            else { lista[j].t = r.t || lista[j].t; lista[j].done = !!r.done;
                   if(r.de) lista[j].de = r.de; lista[j].em = r.quando; }
            mudouMes = true;
          });
          if(mudouMes){ setMetas(lista, mes); mudouAlgumaMeta = true; }
        });
        if(mudouAlgumaMeta){ try{ renderMetas(); }catch(e){} }
      }
      /* ---- Datas importantes ----
         Chave e o id do evento. SO A DATA ATRAVESSA: o titulo fica no aparelho
         que o escreveu, porque o repositorio e publico e o historico nunca e
         podado. Evento novo nasce aqui sem nome, e a tela mostra um marcador
         apagado no lugar do titulo.
         O aviso de dias restantes nao precisa de nada: renderEventos recalcula
         diasAte() e o proximo evento a cada chamada, entao basta chamar. */
      if(est.eventos){
        var evs = getEventos(), mudouEv = false;
        Object.keys(est.eventos).forEach(function(eid){
          var r = est.eventos[eid];
          if(!r || !r.quando) return;
          var j = -1;
          for(var n=0;n<evs.length;n++){ if(evs[n].id === eid){ j = n; break; } }
          if(j > -1 && (evs[j].em || "") >= r.quando) return;
          if(r.del){ if(j > -1){ evs.splice(j,1); mudouEv = true; } return; }
          if(!r.data) return;
          /* O titulo so e escrito quando ele viajou. Num evento privado o nome
             local e a UNICA copia que existe: sobrescreve-lo com vazio apagaria
             o que voce escreveu aqui. Por isso a marca desce sempre, e o titulo
             so quando vem junto. */
          if(j < 0){
            evs.push({id:eid, t:(!r.priv && typeof r.t === "string") ? r.t : "",
                      data:r.data, em:r.quando, priv:!!r.priv});
          } else {
            evs[j].data = r.data;
            evs[j].priv = !!r.priv;
            if(!r.priv && typeof r.t === "string") evs[j].t = r.t;
            evs[j].em = r.quando;
          }
          mudouEv = true;
        });
        if(mudouEv){ setEventos(evs); try{ renderEventos(); }catch(e){} }
      }
      /* ---- Prioridades da semana (Fase 2) ----
         O que voce elegeu no computador chega aqui, e vice-versa. */
      if(aplicarPrioridadesDoEstado(est)){ try{ renderHoje(); }catch(e){} }
      /* ---- Guia do TOEFL (Fase 6A) ----
         Chave e o `id` do item. Vence o relogio, item a item: mais novo manda,
         empate fica como esta, mais antigo e ignorado. Nao ha lapide — o item
         nao pode ser apagado, so marcado ou desmarcado —, entao feito:false que
         chega mais novo desmarca aqui, e e para isso que ele viaja.

         NAO GERA TOQUE: receber nao e tocar. Chamar marcarGuia() aqui criaria
         um eco que voltaria a subir a cada carregamento, para sempre — a mesma
         razao dos subitens e do registro. */
      if(aplicarToeflDoEstado(est)){ try{ renderProcessos(); }catch(e){} mudou = true; }
      /* ---- Retomadas silenciadas (Fase 6B) ----
         Dispensar num aparelho cala nos dois. So a data viaja. */
      if(aplicarRetomadasDoEstado(est)) mudou = true;
      /* ---- Registro datado: a metade que faltava ----
         A subida ja existia inteira. logar() passa a MESMA linha que grava em
         cron:registro para o toque, e a dobra guarda o toque cru no `historico`
         do estado.json. Nada descia: o registro era o unico dos cinco que subia
         e nao voltava, e cada aparelho via so a propria metade do dia.

         NAO HA SECAO NOVA NO estado.json. O registro nao e estado corrente, e
         lista que so cresce: nao existe "vence o mais recente" para ele, cada
         linha vale por si. A fonte, aqui, e o proprio `historico`.

         DUAS COISAS DECIDEM SE UMA LINHA ENTRA:

         1. O id do toque, gravado na linha recebida como `tid`. E por ele que
            reler o mesmo estado.json dez vezes nao cria dez linhas.
         2. O aparelho. TOQUE MEU NAO DESCE NUNCA. logar() grava a linha e
            enfileira o toque no mesmo ato, entao um toque com o meu aparelho
            ja tem a linha aqui, por construcao — inclusive as linhas escritas
            antes de isto existir, que nao tem `tid` nenhum e que a regra 1
            sozinha deixaria entrar em duplicata. Sao 5 no iPhone e 6 no Mac
            [VERIFICADO nos backups de 29/08], entao o caso e real, e nao
            hipotetico. E a regra nao tem furo porque `cron:aparelho` e
            `cron:registro` moram no MESMO localStorage: somem juntos e voltam
            juntos. Um aparelho que perdesse o registro perderia tambem a
            identidade, nasceria com outra, e receberia o proprio passado como
            se fosse de fora — o que e o comportamento certo.

         ISTO AMARRA O REGISTRO AO `historico`, e a amarra e a divida deste
         bloco: enquanto o historico nunca for podado (achado 7, adiado), nada
         muda; no dia em que for, a poda leva junto o registro DOS OUTROS
         aparelhos. O que sobrevive a uma poda e so o que este aparelho
         escreveu, porque so isso mora em cron:registro por direito proprio.

         Nao chama logar(): receber nao e tocar, pela mesma razao dos subitens
         logo acima. Um logar() aqui subiria de volta o que acabou de descer,
         e o eco nao pararia mais. */
      if(Array.isArray(est.historico)){
        var meuAparelho = aparelhoId();
        var reg = getReg(), tidsVistos = {}, recebidas = [];
        reg.forEach(function(o){ if(o && o.tid) tidsVistos[o.tid] = true; });
        est.historico.forEach(function(t){
          if(!t || t.tipo !== "registro" || !t.id) return;
          if(tidsVistos[t.id]) return;
          if(t.aparelho === meuAparelho) return;
          var d = t.dados || {};
          if(!d.subId) return;
          tidsVistos[t.id] = true;
          recebidas.push({d:d.d, pid:d.pid, projId:d.projId, subId:d.subId,
                          projT:d.projT, subT:d.subT,
                          de:(d.de === undefined ? null : d.de), para:d.para,
                          vida:d.vida || "ativo",
                          /* O motivo nao viaja, e nao deve: e texto livre e o
                             repositorio e publico — o toque leva so a marca de
                             que existe um. A linha recebida ganha rotulo
                             proprio, como o subitem ja ganhava, para dizer onde
                             a razao esta em vez de mostrar um motivo velho
                             deste aparelho colado numa marca de outro. */
                          motivo: d.temMotivo ? "motivo registrado no outro aparelho" : "",
                          tid: t.id});
        });
        if(recebidas.length){
          /* Reordena por `d`, a data de origem: uma linha do celular de ontem
             entra ANTES da que este aparelho escreveu hoje, e nao no fim da
             lista. A ordenacao e estavel, entao dentro do mesmo dia o que ja
             estava aqui continua na frente do que acabou de chegar. */
          var todas = reg.concat(recebidas);
          todas.sort(function(a,b){
            var x = (a && a.d) || "", y = (b && b.d) || "";
            return x < y ? -1 : (x > y ? 1 : 0);
          });
          /* Mesmo teto do logar(), e mesmo destino para o excedente: o registro
             so cresce, mas nada e descartado. */
          if(todas.length > REG_TETO){
            save("cron:registro-arquivo",
                 (LS("cron:registro-arquivo", []) || []).concat(todas.slice(0, todas.length - REG_TETO)));
            todas = todas.slice(-REG_TETO);
          }
          save("cron:registro", todas);
          try{ renderRegistro(); }catch(e){}
        }
      }
      try{ renderAcervoEstado(); }catch(e){}
      if(mudou){ renderOrdo(); renderHoje(); renderSemana(); renderTrilhos(); }
    });
}

/* Estrutura primeiro, progresso depois: um item precisa existir para receber
   estado. E de novo quando a rede volta, porque quem abriu offline abriu velho. */
var ULTIMA_BUSCA = 0;

/* ==================== AVISOS — a mecanica (Fase 8) ====================
   NAO HA CHAVE NOVA NO localStorage AQUI, e a ausencia e deliberada: quem sabe
   se este aparelho esta inscrito e o proprio PushManager. Guardar uma copia
   local criaria uma segunda verdade, que diverge no dia em que o navegador
   descartar a inscricao sozinho — e ele descarta.

   O ENDPOINT NUNCA VOLTA PARA O REPOSITORIO. Ele vai para a tabela do Supabase
   e para de existir aqui. E uma URL-capacidade: quem a tem notifica este
   aparelho, e o historico do repositorio nunca e podado. */
function temPush(){
  return typeof navigator !== "undefined" && "serviceWorker" in navigator &&
         typeof PushManager !== "undefined" && typeof Notification !== "undefined";
}
/* A chave VAPID viaja em base64url e o subscribe() quer bytes. */
function chaveVapid(){
  var b64 = (AVISOS.VAPID + "=".repeat((4 - AVISOS.VAPID.length % 4) % 4))
              .replace(/-/g, "+").replace(/_/g, "/");
  var cru = atob(b64), arr = new Uint8Array(cru.length);
  for(var i=0;i<cru.length;i++) arr[i] = cru.charCodeAt(i);
  return arr;
}
function registrarServiceWorker(){
  if(!temPush()) return Promise.resolve(null);
  return navigator.serviceWorker.register("sw.js").catch(function(){ return null; });
}
function inscricaoAtual(){
  if(!temPush()) return Promise.resolve(null);
  return navigator.serviceWorker.getRegistration().then(function(reg){
    return reg ? reg.pushManager.getSubscription() : null;
  }).catch(function(){ return null; });
}
/* INSERT e a unica coisa que o anon pode fazer. Endpoint repetido devolve
   conflito, que aqui e sucesso: quer dizer que este aparelho ja esta inscrito. */
function publicarInscricao(sub){
  var j = sub.toJSON();
  return fetch(AVISOS.URL + "/rest/v1/cron_push_inscricao", {
    method: "POST",
    headers: { apikey: AVISOS.CHAVE, Authorization: "Bearer " + AVISOS.CHAVE,
               "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ endpoint: sub.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
                           aparelho: (navigator.userAgent.indexOf("iPhone") >= 0 ? "iPhone" : "outro") })
  }).then(function(r){
    if(r.ok || r.status === 409) return true;
    return r.text().then(function(t){ throw new Error(r.status + " " + t.slice(0,120)); });
  });
}
function inscreverAvisos(){
  return Notification.requestPermission().then(function(permissao){
    if(permissao !== "granted") throw new Error("sem permissao");
    return navigator.serviceWorker.ready;
  }).then(function(reg){
    return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveVapid() });
  }).then(function(sub){
    return publicarInscricao(sub).catch(function(e){
      /* Nao deixa inscricao orfa: se o registro falhou, desfaz no navegador. */
      return sub.unsubscribe().then(function(){ throw e; });
    });
  });
}
/* DESINSCREVER E SO NO APARELHO. O anon nao pode apagar a linha — dar-lhe
   delete deixaria qualquer um apagar as inscricoes. Cancelada aqui, a
   inscricao morre, e o proximo envio recebe 404/410: e o emissor que remove a
   linha, no Actions, com a service_role. */
function desinscreverAvisos(){
  return inscricaoAtual().then(function(sub){ return sub ? sub.unsubscribe() : false; });
}
