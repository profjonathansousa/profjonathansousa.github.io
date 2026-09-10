/* CRONOGRAMA — 10-nucleo.js
   Infraestrutura: localStorage, aparelho, entrada, relogio, os merges de cada
   dominio, as descidas online e as migracoes. E aqui que mora o mecanismo pelo
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
     · o que você remove de um painel        -> vida='arquivado' na própria peça
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
/* ====== O MERGE DE TRES VIAS DA ESTRUTURA — A REGRA (Fase 9G-0 B1) ======

   LIGADA DESDE A PRIMEIRA PUBLICACAO REAL. Ate ela existir, o mesclarEntrada()
   era de DUAS vias por necessidade: contra uma base vazia, "o pipeline nunca
   mudou nada" e verdade sobre tudo, e a regra concluiria que NENHUMA
   atualizacao legitima pode escrever — a estrutura pararia de chegar. Por isso
   a terceira via e consultada CAMPO A CAMPO: onde a baseline nao conhece o
   campo, o merge continua sendo de duas vias, que e o certo para uma peca
   publicada pela primeira vez.

   O DEFEITO QUE ELA CORRIGE. Hoje, discordancia entre o entrada.json e o
   aparelho so pode significar "o aparelho esta desatualizado":

       if(novo.t && novo.t!==alvo.t){ alvo.t=novo.t; }

   Mas discordancia tambem pode significar QUE VOCE EDITOU. Renomear um projeto
   a mao e desfeito pela proxima publicacao, em silencio — verdade desde a Fase
   4, e nao consequencia da Fase 9.

   A CAUSA E O MERGE SER DE DUAS VIAS, e a correcao e uma terceira: o que o
   pipeline publicou da ultima vez. Com ela, campo a campo:

       o campo mudou no entrada.json desde a ultima publicacao?
          nao  -> nao escreve. O que voce editou a mao sobrevive.
          sim  -> voce tambem mudou esse campo depois?
                  nao -> escreve. E atualizacao legitima do pipeline.
                  sim -> conflito real: vence o relogio, e fica registrado.

   NAO HA HIERARQUIA ENTRE ESCRITORES. Cada um manda no que efetivamente mexeu.

   Devolve {escreve, conflito}: `escreve` e se o valor da entrada deve entrar;
   `conflito` marca o caso em que os dois mexeram no mesmo campo — quem chama
   registra, porque conflito silencioso e o que esta fase existe para acabar. */
function mesclarEstrutura(local, entrada, base, temBase){
  var mesmo = function(a, b){ return JSON.stringify(a) === JSON.stringify(b); };
  /* SEM BASE, DUAS VIAS: e o comportamento de hoje, e e o certo enquanto a
     terceira via nao existir para aquela chave. Uma peca publicada pela
     primeira vez cai aqui, e deve mesmo entrar. */
  if(!temBase) return {escreve: !mesmo(entrada, local), conflito: false};

  var pipelineMexeu = !mesmo(entrada, base);
  var voceMexeu     = !mesmo(local, base);

  if(!pipelineMexeu) return {escreve: false, conflito: false};  /* a sua edicao fica */
  if(!voceMexeu)     return {escreve: true,  conflito: false};  /* atualizacao legitima */
  /* Os dois mexeram no MESMO campo. Vence o relogio — e aqui o relogio e a
     publicacao, que carrega `gerado_em`; quem chama compara e registra. */
  return {escreve: true, conflito: true};
}

/* A copia local da baseline. Vazia enquanto a sincronia nunca tiver conectado —
   e vazia e o caso em que tudo cai em duas vias, como antes desta fase. */
function estruturaBase(){ var v = LS(BASE_ESTRUTURA_KEY, {}); return (v && typeof v === "object") ? v : {}; }

/* CONFLITO NAO PODE SER SILENCIOSO. O merge escreve — vence o relogio da
   publicacao —, mas o que foi sobrescrito fica registrado, com o valor que era
   seu. E a diferenca entre "o pipeline atualizou" e "o pipeline apagou o que
   voce escreveu e ninguem soube". */
function registrarConflitoEstrutura(chave, campo, seu, doPipeline){
  try{
    var lista = LS(BASE_CONFLITOS_KEY, []) || [];
    lista.push({quando: new Date(instanteDoToque()).toISOString(),
                chave: chave, campo: campo, seu: seu, pipeline: doPipeline});
    if(lista.length > BASE_CONFLITOS_TETO) lista = lista.slice(-BASE_CONFLITOS_TETO);
    save(BASE_CONFLITOS_KEY, lista);
  }catch(e){}
}

/* A pergunta de tres vias para UM campo. `temBase` e por CAMPO, e nao por
   linha: a baseline de um projeto pode existir sem conhecer o `t` — foi o que
   a primeira publicacao real gravou, porque o entrada.json so traz `id` no
   nivel do projeto. Onde ela nao conhece, duas vias. */
function entradaPodeEscrever(chave, campo, local, daEntrada, linhaBase){
  var val = linhaBase && linhaBase.valor;
  var temBase = !!(val && typeof val === "object" && (campo in val));
  var r = mesclarEstrutura(local, daEntrada, temBase ? val[campo] : null, temBase);
  if(r.conflito) registrarConflitoEstrutura(chave, campo, local, daEntrada);
  return r.escreve;
}

function mesclarEntrada(){
  var ent = LS("cron:entrada", null);
  if(!ent || !ent.paineis) return;
  var aplicou = false;
  var base = estruturaBase();
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
      /* A guarda de sempre (so escreve o que a entrada traz de verdade) mais a
         terceira via: o campo mudou desde a ultima publicacao? */
      var kProj = pid + "/" + novo.id, bProj = base[kProj];
      if(novo.t && novo.t!==alvo.t &&
         entradaPodeEscrever(kProj, "t", alvo.t, novo.t, bProj)){ alvo.t=novo.t; mudou=true; }
      if(novo.n && novo.n!==alvo.n &&
         entradaPodeEscrever(kProj, "n", alvo.n, novo.n, bProj)){ alvo.n=novo.n; mudou=true; }
      var subsPorId={}; (alvo.subs||[]).forEach(function(s){ subsPorId[s.id]=s; });
      (novo.subs||[]).forEach(function(ns){
        if(!ns || !ns.id) return;
        var as = subsPorId[ns.id];
        if(!as){ alvo.subs.push(normSub(Object.assign({}, ns, {origem:"entrada"}))); mudou=true; return; }
        var kSub = kProj + "/" + ns.id, bSub = base[kSub];
        ["t","n","onde","prova","medida"].forEach(function(campo){
          if(!(campo in ns)) return;
          if(JSON.stringify(ns[campo])===JSON.stringify(as[campo])) return;
          if(!entradaPodeEscrever(kSub, campo, as[campo], ns[campo], bSub)) return;
          as[campo]=ns[campo]; mudou=true;
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
/* ---- Arquivo: remover deixa de destruir, e deixa de mudar de lugar ----

   ATE A FASE 9G-0 B2 arquivar era um MECANISMO PROPRIO: splice no array mais
   uma gaveta paralela (`cron:arquivo`) indexada por POSICAO. Duas consequencias
   ruins, e as duas reais:

     · a posicao se desloca. O `indice` era gravado e nunca lido — restaurar
       empurrava a peca para o fim —, mas o `k` do botao da tela era a posicao
       na gaveta, e a tela inteira dependia dela;
     · a gaveta e local por construcao. Arquivar no Mac nao arquivava no
       celular, e a peca continuava viva la.

   AGORA E `vida = 'arquivado'`, um valor que o esquema v2 ja declarava e nunca
   usava. A peca fica onde esta, com um campo a mais; a aba Arquivo e um FILTRO;
   restaurar e voltar o campo para 'ativo'. Para SUBITENS isso atravessa
   aparelhos de graca, porque `vida` ja e campo do dominio `item` e ja viaja
   pelo LWW (Fase 9E). Para PROJETOS continua local, porque `estrutura_proj` e
   {t, n, mes} e a estrutura ainda nao e dominio online. */
function estaArquivado(x){ return !!(x && x.vida === "arquivado"); }
/* O que a tela e o motor devem enxergar. NAO se aplica ao getProjs(), de
   proposito: 15 pontos fazem setProjs(getProjs(...)), e um getProjs filtrado
   apagaria as arquivadas do armazenamento na primeira volta. */
function vivos(lista){ return (lista || []).filter(function(x){ return !estaArquivado(x); }); }

/* A aba Arquivo, agora uma visao e nao uma gaveta. Devolve as pecas arquivadas
   de todos os paineis, projeto e subitem, com o endereco por ID. */
function arquivados(){
  var fora = [];
  PAINEIS.forEach(function(P){
    (getProjs(P.id) || []).forEach(function(p){
      if(estaArquivado(p)){
        fora.push({pid:P.id, tipo:"projeto", projId:p.id, t:p.t || "", de:"", vidaDesde:p.vidaDesde || ""});
        return;   /* subitem de projeto arquivado nao entra duas vezes */
      }
      (p.subs || []).forEach(function(x){
        if(!estaArquivado(x)) return;
        fora.push({pid:P.id, tipo:"subtarefa", projId:p.id, subId:x.id,
                   t:x.t || "", de:p.t || "", vidaDesde:x.vidaDesde || ""});
      });
    });
  });
  return fora;
}

/* MIGRACAO, UMA VEZ POR APARELHO. Cada entrada da gaveta antiga volta para o
   painel com vida='arquivado' — a peca inteira, como estava. Nada se inventa: o
   `item` guardado E a peca. Nada se perde: se alguma entrada nao puder voltar
   (um subitem cujo projeto-pai nao existe mais), a migracao NAO acontece, a
   gaveta fica intacta e o relatorio diz o que travou. Meia migracao seria pior
   do que nenhuma.

   NAO PUBLICA TOQUE. O arquivamento antigo nunca atravessou aparelho, e uma
   decisao que nunca viajou nao pode passar a viajar retroativamente — mesma
   regra da migracao das prioridades (ver PRIO_MIGRADO_KEY). */
function migrarArquivo(){
  var antigo = LS("cron:arquivo", null);
  if(!antigo || !antigo.forEach || !antigo.length){
    if(antigo) localStorage.removeItem("cron:arquivo");   /* gaveta vazia: some */
    return {migrados:0, travados:[]};
  }
  var porPainel = {}, travados = [];
  antigo.forEach(function(it){
    if(!it || !it.item || !it.item.id) return;
    var pid = it.pid;
    if(!porPainel[pid]) porPainel[pid] = getProjs(pid) || [];
    var p = porPainel[pid];
    if(it.tipo === "projeto"){
      var existe = p.some(function(x){ return x.id === it.item.id; });
      /* Ja voltou por outro caminho (o pipeline republicou): a copia arquivada
         e redundante, e a peca viva manda. Nao e perda — e a mesma peca. */
      if(existe) return;
      var novo = normProj(it.item); novo.vida = "arquivado";
      p.push(novo);
      return;
    }
    var alvo = null;
    for(var i=0;i<p.length;i++){ if(p[i].id === (it.ondeEstava && it.ondeEstava.projId)){ alvo = p[i]; break; } }
    if(!alvo){ travados.push(it); return; }
    if((alvo.subs || []).some(function(x){ return x.id === it.item.id; })) return;
    var ns = normSub(it.item); ns.vida = "arquivado";
    alvo.subs.push(ns);
  });
  if(travados.length) return {migrados:0, travados:travados};
  var n = 0;
  Object.keys(porPainel).forEach(function(pid){ setProjs(pid, porPainel[pid]); n++; });
  localStorage.removeItem("cron:arquivo");
  save("cron:arquivo-migrado", {quando:new Date().toISOString(), entradas:antigo.length});
  return {migrados:antigo.length, paineis:n, travados:[]};
}
let checks = LS("cron:checks:"+dateKey, {});
function guiaStore(){ return LS(TOEFL_GUIA_KEY, {}) || {}; }
/* ====== O MERGE DE UM ITEM DO GUIA — UMA IMPLEMENTACAO SO (Fase 9E) ======
   Mesma razao do mesclarPrioridade: a 9E deu ao TOEFL um SEGUNDO caminho de
   descida (o Realtime), ao lado do estado.json. Duas descidas para o mesmo dado
   com duas copias da regra e o defeito que este repositorio ja pagou uma vez.

   O `r` chega na forma {quando, feito} — a do estado.json. A linha do Supabase
   e convertida na entrada, para que a forma do banco nao vaze para dentro da
   regra. NAO HA LAPIDE: o item do guia nao pode ser apagado, so marcado ou
   desmarcado, e `feito:false` que chega mais novo desmarca aqui. */
function mesclarToefl(st, iid, r){
  if(!r || !r.quando) return false;
  var loc = st[iid];
  if(loc && (loc.em || "") >= r.quando) return false;   /* empate fica como esta */
  st[iid] = {feito: !!r.feito, em: r.quando};
  return true;
}
/* A descida do guia pelo caminho online (Fase 9E). Receber nao e tocar: nao
   passa pelo marcarGuia, nao enfileira toque e nao reescreve online. */
function aplicarToeflOnline(linha){
  if(!linha || !linha.chave) return [];
  var st = guiaStore();
  if(!mesclarToefl(st, String(linha.chave),
                   {quando: linha.em, feito: linha.valor && linha.valor.feito})) return [];
  save(TOEFL_GUIA_KEY, st);
  return ["renderProcessos"];
}
function migrarGuiaToefl(){
  if(LS(TOEFL_MIGRADO_KEY, false)) return 0;
  var n = 0;
  TOEFL_FASES.forEach(function(fid){
    var g = TOEFL_GUIA[fid]; if(!g) return;
    var velho = LS("cron:toefl-guia:"+fid, {}) || {};
    g.itens.forEach(function(it, i){
      if(velho[i] !== true) return;
      /* Rele a cada volta: o funil grava o store, entao uma copia presa antes
         do laco ficaria defasada e reescreveria por cima. */
      var st = guiaStore();
      if(st[it.id] && st[it.id].feito) return;
      /* PELO FUNIL, e nao pelo enfileirarToque direto: eram dois escritores do
         guia, e so um deles subia ao estado online. */
      marcarGuia(it.id, true, TOEFL_EM);
      n++;
    });
  });
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

/* ====== O MERGE DE UM ITEM DO TRILHO — UMA IMPLEMENTACAO SO (Fase 9E) ======

   ESTE E O DOMINIO DE DOIS ESCRITORES REAIS, e o unico da Fase 9 em que isso ja
   e verdade hoje: voce, no aparelho, e o pipeline, pelo
   `dobrar_toques.py --registrar`, que escreve um toque com aparelho "cowork" e
   entra pela mesma porta que o iPhone.

   A AUTORIDADE NAO E "QUEM CHEGOU POR ULTIMO" — e isso importa dizer, porque a
   regra AQUI e mesmo o relogio. O que impede o relogio de apagar uma decisao
   sua nao e o desempate: e a FRONTEIRA DO QUE A MAQUINA PODE AFIRMAR, e ela
   esta no dado, antes de qualquer escrita. O --registrar RECUSA subitem de
   prova "estrela" — as etapas cuja conclusao e decisao do autor. O pipeline nao
   opina sobre elas, entao nao ha conflito a desempatar. Nas outras, progresso e
   fato verificavel (o artefato existe ou nao existe), e ali o mais recente
   manda mesmo. A 9E NAO MEXE NESSA FRONTEIRA, e nao a move para o desempate.

   O `r` chega na forma {quando, st, vida, motivo} — a do estado.json, com o
   motivo ja resolvido por quem chama. MUTA O SUBITEM E DEVOLVE SE MUDOU. */
function mesclarItem(x, r){
  if(!x || !r || !r.quando) return false;
  if((x.em || "") >= r.quando) return false;      /* empate fica como esta */
  if(typeof r.st === "number") x.st = r.st;
  if(r.vida) x.vida = r.vida;
  x.motivo = (typeof r.motivo === "string") ? r.motivo : "";
  if(typeof r.voltar_em === "string") x.voltar_em = r.voltar_em;
  if(typeof r.vidaDesde === "string") x.vidaDesde = r.vidaDesde;
  x.em = r.quando;
  return true;
}

/* A descida do progresso pelo caminho online (Fase 9E). A chave e
   painel/projeto/subitem, e o subitem tem de EXISTIR aqui: progresso de peca
   que este aparelho nao conhece nao tem onde pousar, e inventa-la seria criar
   estrutura pelo caminho do progresso — exatamente a separacao que o esquema
   mantem. Ela chega pela estrutura, que e outro dominio.

   RECEBER NAO E TOCAR: nao chama marcarSub nem logar. */
function aplicarItemOnline(linha){
  if(!linha || !linha.chave) return [];
  var partes = String(linha.chave).split("/");
  if(partes.length !== 3) return [];
  var projs = getProjs(partes[0]);
  if(!projs || !projs.forEach) return [];
  var alvo = null;
  projs.forEach(function(pr){
    if(pr.id !== partes[1]) return;
    (pr.subs || []).forEach(function(x){ if(x.id === partes[2]) alvo = x; });
  });
  if(!alvo) return [];
  var v = linha.valor || {};
  if(!mesclarItem(normSub(alvo), {quando: linha.em, st: v.st, vida: v.vida,
                                  motivo: v.motivo, voltar_em: v.voltar_em,
                                  vidaDesde: v.vidaDesde})) return [];
  setProjs(partes[0], projs);
  /* Os mesmos quatro que a descida do estado.json ja dispara quando um item
     muda: o progresso de um subitem atravessa o aplicativo inteiro. */
  return ["renderOrdo", "renderHoje", "renderSemana", "renderTrilhos"];
}

/* ============ O MERGE DE UMA PRIORIDADE — UMA IMPLEMENTACAO SO ============
   A Fase 9B deu um SEGUNDO caminho de descida as prioridades (o Realtime do
   Supabase), ao lado do que ja existia (o estado.json). Duas descidas para o
   mesmo dado sao exatamente o defeito que este repositorio ja pagou uma vez —
   o `dadosDoEvento` de 29/08, em que o botao do acervo montava o proprio
   payload e ficou para tras no dia em que o titulo passou a viajar.

   Entao o merge mora aqui, e so aqui. Enquanto houve duas descidas, o
   aplicarPrioridadesDoEstado (legado) chamava num laco e o
   aplicarPrioridadeOnline (Fase 9B) uma vez; a 9G-3 aposentou a primeira e
   sobrou a segunda, mas o merge continua separado dela — e o que permite
   testa-lo sem rede, e o que impede que uma terceira descida, se um dia
   houver, nasca com regra propria.

   O `r` guarda a forma {quando, tipo, painel, projId, t, feito_em, del}, que
   era a do estado.json, e nao a da linha do Supabase. Converter na entrada
   custa tres linhas e evita que a forma do banco vaze para dentro da regra.

   MUTA A LISTA E DEVOLVE SE MUDOU. Quem chama grava, porque quem chama sabe se
   esta gravando uma semana ou varias. */
function mesclarPrioridade(lista, prid, r){
  if(!r || !r.quando) return false;
  var j = -1;
  for(var n=0;n<lista.length;n++){ if(lista[n].id === prid){ j = n; break; } }
  /* O RELOGIO, item a item. Vale para as duas descidas, e e o que impede que
     uma linha atrasada de um caminho desfaca o que o outro acabou de aplicar
     — o caso real enquanto os dois convivem, ate a Fase 9G. */
  if(j > -1 && (lista[j].em || "") >= r.quando) return false;
  if(r.del){ if(j > -1){ lista.splice(j,1); return true; } return false; }
  /* `feito_em` entra aqui e nao pode faltar: este `novo` SUBSTITUI o item
     inteiro. Se o campo nao viesse, uma descida qualquer apagaria a
     conclusao que este aparelho registrou. Ausencia no estado e "nao
     feita", que e o valor certo para uma prioridade nunca marcada e para
     uma desmarcada — os dois chegam como "". */
  var novo = {id:prid, tipo:r.tipo || "livre", painel:r.painel || "",
              projId:r.projId || "", t:r.t || "",
              feito_em:r.feito_em || "", em:r.quando};
  if(j < 0) lista.push(novo); else lista[j] = novo;
  return true;
}

/* ============ A DESCIDA ONLINE DAS PRIORIDADES — Fase 9B ============
   O aplicador que o SYNC.assinarDominio("prioridade", ...) registra. Recebe UMA
   linha do cron_estado e devolve a lista de renders que ela exige.

   O QUE ELE NAO FAZ, e cada omissao e uma regra:
     · nao decide sozinho quem vence. O relogio do SYNC ja recusou a linha
       velha antes de chegar aqui, e o mesclarPrioridade recusa de novo contra
       o `em` do item local — que e o que protege o caso em que o caminho
       legado aplicou algo mais novo por fora do cache do SYNC;
     · nao enfileira toque. Receber nao e tocar: um toque aqui subiria de volta
       o que acabou de descer, e com Realtime o eco nao levaria minutos para
       fechar o laco, levaria milissegundos;
     · nao reescreve online. Pelo mesmo motivo;
     · nao substitui a semana. A chave e "AAAA-Wnn/prid" e so aquele item e
       tocado — duas prioridades da mesma semana, alteradas em dois aparelhos,
       nao se atropelam.

   A CHAVE CARREGA A SEMANA porque a identidade logica da prioridade e
   `sem + prid`: o mesmo prid pode existir em semanas diferentes, e a lista
   local e por semana (cron:prioridades:AAAA-Wnn). */
function aplicarPrioridadeOnline(linha){
  if(!linha || !linha.chave) return [];
  var corte = String(linha.chave).indexOf("/");
  if(corte < 0) return [];
  var sem = String(linha.chave).slice(0, corte);
  var prid = String(linha.chave).slice(corte + 1);
  if(!sem || !prid) return [];
  var v = linha.valor || {};
  var lista = getPrio(sem);
  var mudou = mesclarPrioridade(lista, prid, {
    quando: linha.em, del: !!linha.del,
    tipo: v.tipo, painel: v.painel, projId: v.projId,
    t: v.t, feito_em: v.feito_em
  });
  if(!mudou) return [];
  setPrio(lista, sem);
  /* renderHoje cobre a aba Hoje — e, no domingo, a revisao desenhada dentro
     dela. A aba Revisao e OUTRA view (view-revisao), pintada so pelo setView:
     com ela na frente, a mudanca chegava e nao aparecia. Ver a Fase 9C-1.
     O renderVistaRevisao devolve na primeira linha quando a aba nao esta
     visivel, entao no caso comum isto nao custa nada. */
  return ["renderHoje", "renderVistaRevisao"];
}

/* ============ O MERGE DE UMA META — UMA IMPLEMENTACAO SO (Fase 9C-2) ============
   Mesmo movimento que a 9B fez com o mesclarPrioridade, e pela mesma razao: a
   meta passou a ter DUAS descidas (o estado.json e o Realtime), e duas descidas
   para o mesmo dado e o defeito que este repositorio ja pagou uma vez.

   A REGRA E COPIADA LETRA POR LETRA do que estava dentro do buscarEstado, e a
   fidelidade importa mais do que a elegancia. Em particular, a meta NAO
   substitui o item inteiro como a prioridade faz:

     · `t` so e sobrescrito quando vem preenchido  (`r.t || lista[j].t`);
     · `de` so e escrito quando vem                (`if(r.de)`), nunca apagado;
     · `done` e sempre sobrescrito, porque false e um valor legitimo.

   Mudar isso seria mudar regra de negocio, e a 9C-2 nao muda nenhuma.

   MUTA A LISTA E DEVOLVE SE MUDOU. Quem chama grava, porque quem chama sabe se
   esta gravando um mes ou varios. */
function mesclarMeta(lista, mid, r){
  if(!r || !r.quando) return false;
  var j = -1;
  for(var n=0;n<lista.length;n++){ if(lista[n].id === mid){ j = n; break; } }
  /* O relogio, item a item. Vale para as duas descidas — e e o que impede que
     uma linha atrasada de um caminho desfaca o que o outro acabou de aplicar,
     o caso real enquanto os dois convivem, ate a Fase 9G. */
  if(j > -1 && (lista[j].em || "") >= r.quando) return false;
  if(r.del){ if(j > -1){ lista.splice(j,1); return true; } return false; }
  if(j < 0){ lista.push({id:mid, t:r.t||"", done:!!r.done, de:r.de||undefined, em:r.quando}); }
  else { lista[j].t = r.t || lista[j].t; lista[j].done = !!r.done;
         if(r.de) lista[j].de = r.de; lista[j].em = r.quando; }
  return true;
}

/* ============ A DESCIDA ONLINE DAS METAS — Fase 9C-2 ============
   O aplicador que o SYNC.assinarDominio("meta", ...) registra. Molde do
   aplicarPrioridadeOnline, com as mesmas quatro omissoes deliberadas: nao
   decide sozinho quem vence, nao enfileira toque, nao reescreve online e nao
   substitui o mes.

   A CHAVE CARREGA O MES porque a identidade logica da meta e `mes + mid`, e
   porque `trazerMeta` MOVE uma meta de um mes para outro — com o mes na chave,
   mover e criar mais lapide, duas linhas, semantica explicita. Se o mes fosse
   um campo do valor, mover seria um update ambiguo.

   OS RENDERS SAO OS MINIMOS QUE A DEPENDENCIA JUSTIFICA:
     · renderMetas sempre — ele repinta o proprio #metas-wrap no lugar;
     · renderVistaRevisao sempre — a revisao LE getMetas (revisaoDaSemana conta
       as metas concluidas na semana), e devolve na primeira linha quando a aba
       nao esta visivel, entao no caso comum nao custa nada;
     · renderHoje SO NO DOMINGO, que e o unico dia em que a revisao e desenhada
       dentro da aba Hoje. Nos outros dias o Hoje nao le meta nenhuma — o aviso
       da esteira e as pendencias moram dentro do renderMetas.
   NAO chama renderSemana: verificado que ele nao le getMetas. */
function aplicarMetaOnline(linha){
  if(!linha || !linha.chave) return [];
  var corte = String(linha.chave).indexOf("/");
  if(corte < 0) return [];
  var mes = String(linha.chave).slice(0, corte);
  var mid = String(linha.chave).slice(corte + 1);
  if(!mes || !mid) return [];
  var v = linha.valor || {};
  var lista = getMetas(mes);
  var mudou = mesclarMeta(lista, mid, {
    quando: linha.em, del: !!linha.del,
    t: v.t, done: v.done, de: v.de
  });
  if(!mudou) return [];
  setMetas(lista, mes);
  var renders = ["renderMetas", "renderVistaRevisao"];
  if(todayIdx === 0) renders.push("renderHoje");
  return renders;
}

/* ============ O MERGE DE UM EVENTO — UMA IMPLEMENTACAO SO (Fase 9C-3) ============
   Terceiro dominio a passar por este movimento, depois de prioridade (9B) e
   meta (9C-2), e pela mesma razao: o evento passou a ter DUAS descidas.

   A REGRA E COPIADA LETRA POR LETRA do que estava dentro do buscarEstado, e
   duas clausulas em especial NAO PODEM SER "SIMPLIFICADAS":

     · `if(!r.data) return;` — evento sem data e ignorado. A data e o que faz o
       evento existir; um registro sem ela nao tem o que desenhar.

     · O TITULO SO E ESCRITO QUANDO VIAJOU. Num evento privado o nome local e a
       UNICA copia que existe — sobrescreve-lo com vazio apagaria o que voce
       escreveu neste aparelho. Por isso a marca `priv` desce sempre, e o `t`
       so quando vem junto: `if(!r.priv && typeof r.t === "string")`.
       O `typeof` importa: string vazia e um titulo legitimo (apagado de
       proposito); AUSENCIA do campo e "nao viajou". Trocar por `if(r.t)`
       transformaria apagar um titulo em nao-fazer-nada.

   A Fase 9C-3 NAO amplia privacidade nenhuma: o que sobe continua saindo do
   dadosDoEvento, que omite o `t` inteiro quando priv. Resolver a replicacao de
   titulo privado e a 9C-4.

   MUTA A LISTA E DEVOLVE SE MUDOU. */
function mesclarEvento(evs, eid, r){
  if(!r || !r.quando) return false;
  var j = -1;
  for(var n=0;n<evs.length;n++){ if(evs[n].id === eid){ j = n; break; } }
  if(j > -1 && (evs[j].em || "") >= r.quando) return false;
  if(r.del){ if(j > -1){ evs.splice(j,1); return true; } return false; }
  if(!r.data) return false;
  if(j < 0){
    evs.push({id:eid, t:(typeof r.t === "string") ? r.t : "",
              data:r.data, em:r.quando, priv:!!r.priv});
  } else {
    evs[j].data = r.data;
    evs[j].priv = !!r.priv;
    /* O TITULO ENTRA QUANDO VIAJOU, e nao quando "e publico" — a mudanca da
       Fase 9C-4. A clausula `!r.priv` que estava aqui era cinto sobre
       suspensorio: o payload LEGADO nao monta o `t` de um evento privado, entao
       `typeof r.t === "string"` ja o recusava sozinho. Com o caminho online
       passando a carregar o titulo privado, aquela clausula deixaria de ser
       redundante e passaria a ser um BLOQUEIO: o nome chegaria e seria
       descartado.

       O `typeof` continua sendo o que decide, e continua importando: string
       vazia e um titulo legitimo (apagado de proposito); AUSENCIA do campo e
       "nao viajou". Trocar por `if(r.t)` transformaria apagar um titulo em
       nao-fazer-nada. */
    if(typeof r.t === "string") evs[j].t = r.t;
    evs[j].em = r.quando;
  }
  return true;
}

/* ============ A DESCIDA ONLINE DOS EVENTOS — Fase 9C-3 ============
   Molde do aplicarMetaOnline, com as mesmas omissoes deliberadas.

   A CHAVE E O PROPRIO ID, sem composicao: diferente da meta, o evento nao
   pertence a um periodo. E MUDAR A DATA E UMA EDICAO, e nao um `mover`: o `id`
   e estavel e a `data` e um campo do valor. Nao ha criacao no destino nem
   lapide na origem, porque nao ha origem — e o mesmo evento, noutro dia.

   OS RENDERS SAO OS MESMOS TRES DA META, pela mesma medicao:
     · renderEventos sempre — repinta o proprio #eventos no lugar, e o aviso de
       dias restantes se recalcula sozinho (diasAte a cada chamada);
     · renderVistaRevisao sempre — a revisaoDaSemana LE getEventos para a secao
       "proxima semana", e a funcao devolve na primeira linha quando a aba nao
       esta visivel;
     · renderHoje SO NO DOMINGO, o unico dia em que a revisao e desenhada
       dentro dele.
   NAO chama renderSemana: verificado que ele nao le getEventos. */
function aplicarEventoOnline(linha){
  if(!linha || !linha.chave) return [];
  var eid = String(linha.chave);
  if(!eid) return [];
  var v = linha.valor || {};
  var evs = getEventos();
  /* O `t` so entra no `r` quando o valor REALMENTE o traz. Repassar
     `v.t` sempre transformaria "nao viajou" (undefined) em... undefined, que o
     mesclarEvento ja trata; mas ser explicito aqui deixa a fronteira visivel no
     lugar onde ela e decidida. */
  var r = {quando: linha.em, del: !!linha.del, data: v.data, priv: !!v.priv};
  if(Object.prototype.hasOwnProperty.call(v, "t")) r.t = v.t;
  if(!mesclarEvento(evs, eid, r)) return [];
  setEventos(evs);
  var renders = ["renderEventos", "renderVistaRevisao"];
  if(todayIdx === 0) renders.push("renderHoje");
  return renders;
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
    /* PELO FUNIL, e nao por um enfileirarToque proprio: ate a Fase 9D.2 esta
       era a SEGUNDA escrita de retomada, como a migracao da triagem era na
       9D.1. Passando por aqui, o silencio antigo publicado por esta migracao
       entra tambem no estado online. */
    tocarRetomada(chave.slice(0, corte), chave.slice(corte + 1), r, RETOMADA_EM);
    n++;
  });
  save(RETOMADA_KEY, out);
  save(RETOMADA_MIGRADO_KEY, true);
  return n;
}
/* A DESCIDA. Molde do aplicarToeflDoEstado: mais novo manda, empate fica como
   esta, mais antigo e ignorado. Nao emite toque — receber nao e tocar. */
/* ============ O MERGE DE UMA RETOMADA — UMA IMPLEMENTACAO SO (Fase 9D.2) ============
   Quinto dominio a passar por este movimento. A regra e copiada letra por letra
   do que estava dentro do aplicarRetomadasDoEstado, e uma clausula em especial
   NAO pode ser simplificada:

     var emLocal = (loc && typeof loc === "object") ? (loc.em || "") : "";

   A entrada local pode ser uma STRING — e a forma antiga, de antes da Fase 6B,
   que o migrarRetomadas converte. Entre o carregamento e a migracao ela existe,
   e o comentario do migrarRetomadas diz por que ler pelas duas formas: um
   aparelho que falhe na migracao passaria a ignorar silencios que ele mesmo
   pos. Trocar por `loc.em` daria undefined e o `>=` seria sempre falso.

   NAO HA LAPIDE, e a razao e propria do dominio: nao existe operacao de
   DESSILENCIAR. A entrada morre pela data que ela mesma carrega — vencida, ela
   some dos dois leitores sem toque nenhum.

   O `ate` E DATA ABSOLUTA, e nao duracao. Um toque que chega tres dias depois
   carrega a data que foi decidida; se viajasse "+14 dias", a latencia da rede
   mudaria o resultado. */
function mesclarRetomada(m, chave, r){
  if(!r || !r.quando || !r.ate) return false;
  var loc = m[chave];
  var emLocal = (loc && typeof loc === "object") ? (loc.em || "") : "";
  if(loc && emLocal >= r.quando) return false;
  m[chave] = {ate:r.ate, em:r.quando};
  return true;
}

/* ============ A DESCIDA ONLINE DAS RETOMADAS — Fase 9D.2 ============
   Molde dos quatro anteriores. A chave e `painel/projeto`, e o valor leva so o
   `ate`: o titulo e o estagio do projeto sao lidos do trilho no aparelho que
   desenha, e nunca viajam — e a regra da Fase 6B, que esta fase nao muda.

   OS RENDERS SAO DOIS, e ambos comprovados por leitura:
     · renderHoje — o renderRetomadas() le retomadas(), e o renderPrioridades
       passa pelo motorDePrioridades(), que le retomadasAdiadas() para saber o
       que esta silenciado. Entra TODO DIA, e nao so no domingo como nas metas;
     · renderVistaRevisao — a revisaoDaSemana le retomadas() E
       motorDePrioridades().
   NAO chama renderSemana: verificado que ele nao le retomada nenhuma — ao
   contrario da triagem da 9D.1, que ele le. */
function aplicarRetomadaOnline(linha){
  if(!linha || !linha.chave) return [];
  var chave = String(linha.chave);
  if(chave.indexOf("/") < 0) return [];
  var v = linha.valor || {};
  var m = retomadasAdiadas();
  if(!mesclarRetomada(m, chave, {quando: linha.em, ate: v.ate})) return [];
  save(RETOMADA_KEY, m);
  return ["renderHoje", "renderVistaRevisao"];
}


/* ENVIO AUTOMATICO, COM ESPERA CURTA.
   Antes, os toques so subiam ao abrir a pagina: quem marcava e fechava a aba
   deixava a fila parada ate a proxima abertura. Agora cada toque agenda um
   envio, e um toque novo adia o envio agendado. Marcar dez itens seguidos
   continua sendo UM commit — que e o que protege o limite de reconstrucoes
   do Pages, a razao pela qual o lote existe. */

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
    /* Primeira vez nesta base: comeca no proprio piso. Ate a 9G-3 havia uma
       segunda metade aqui — o pisoJaGasto(), que lia do cron:la-fora o maior
       instante que o estado.json publicado ja mostrava naquele mesmo piso. Ela
       existia para o botao do acervo, que podia reemitir um id que a dobra ja
       tinha visto. O botao e a fotografia sairam juntos na 9G-3, e as bases
       explicitas que restam (TOEFL_EM, RETOMADA_EM, MIGRA_EM) sao migracoes de
       uma vez por aparelho, com mapa proprio desde o primeiro uso. */
    var v = (chave in mapa) ? mapa[chave] + 1 : base;
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

/* O ID DE UM TOQUE, numa formula so. Ate a Fase 9D.3 ele era construido dentro
   do enfileirarToque e nao saia de la; agora o registro online usa o MESMO id
   como chave primaria em cron_registro, e e essa coincidencia que faz os dois
   caminhos de descida — GitHub e Supabase — reconhecerem a mesma linha e nao
   duplicarem. Duas formulas iguais em dois lugares seriam uma divergencia
   esperando acontecer. */
function idDoToque(iso){ return String(iso).replace(/[:.]/g,"-") + "-" + aparelhoId(); }

/* O INSTANTE DE UMA DECISAO, e o que sobrou do enfileirarToque (Fase 9G-2).

   A fila de toques saiu: cada decisao ja sobe pelo SYNC, e manter a segunda
   subida seria manter o caminho que esta fase existe para cortar. O que NAO
   podia sair e o relogio — os funis precisam do instante monotonico, e e o
   mesmo `em` que vai para o cron_estado.

   Hora de verdade, nao a do carregamento da pagina: o `now` do topo e fixado
   quando o app abre, e um celular que passa a noite aberto carimbaria ontem.

   O `quandoISO` existe para UM caso: publicar, uma vez, o que ja estava
   marcado no aparelho antes de o mecanismo existir. Sem ele, uma marcacao de
   semana passada subiria com a data de hoje e venceria uma marcacao recente
   feita no outro aparelho. */
function instanteISO(quandoISO){
  return new Date(instanteDoToque(quandoISO)).toISOString();
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
  var iso = instanteISO();
  /* O ID CONTINUA SENDO O DO TOQUE, e a formula nao mudou depois que os dois
     caminhos do GitHub sairam (9G-2 e 9G-3): e por esse id que o `tid` dedupe
     o que o pipeline registrar pelo --registrar, que continua escrevendo. */
  try{
    if(typeof SYNC !== "undefined" && SYNC.ligado()){
      SYNC.registrar(linha, {id: idDoToque(iso)});
    }
  }catch(e){ try{ console.error("sync: registro nao subiu:", e); }catch(e2){} }
  return iso;
}

/* A descida do registro pelo caminho online (Fase 9D.3).

   NAO HA MESCLA, e a ausencia dela e o desenho: o registro nao e estado
   corrente. Nao existe versao mais nova de uma linha de historico — existe
   outra linha. Por isso aqui nao ha relogio, nao ha lapide e nao ha LWW: ha
   uma pergunta so, "esta linha ja esta aqui?", e a resposta e o id do toque.

   E O MESMO `tid` DO CAMINHO DO GITHUB. Uma linha que entrou por aqui ja tem
   tid, entao a descida do estado.json a reconhece e nao a repete; uma que
   entrou por la ja tem tid, entao esta a reconhece e nao a repete. Os dois
   caminhos convivem sem acordo entre eles, so pela chave.

   RECEBER NAO E TOCAR: nao chama logar(), nao enfileira toque e nao reescreve
   online. Um logar() aqui subiria de volta o que acabou de descer. */
function aplicarRegistroOnline(linha){
  if(!linha || !linha.id || !linha.sub_id || !linha.d) return [];
  var reg = getReg();
  for(var i = 0; i < reg.length; i++){
    if(reg[i] && reg[i].tid === linha.id) return [];
  }
  var nova = {d: String(linha.d).slice(0, 10),
              pid: linha.pid, projId: linha.proj_id, subId: linha.sub_id,
              projT: linha.projT || linha.proj_t || "",
              subT: linha.subT || linha.sub_t || "",
              de: (linha.de === undefined || linha.de === null) ? null : linha.de,
              para: linha.para,
              vida: linha.vida || "ativo",
              /* O motivo vem inteiro: a base e privada e a coluna existe. O
                 rotulo "motivo registrado no outro aparelho" continua sendo do
                 caminho do GitHub, onde ele e a unica coisa que da para dizer. */
              motivo: linha.motivo || "",
              tid: linha.id};
  /* Ordena por `d`, a data de origem, e nao pela de chegada: uma linha do
     celular de ontem entra ANTES da que este aparelho escreveu hoje. A
     ordenacao e estavel, entao dentro do mesmo dia o que ja estava aqui
     continua na frente — mesma regra da descida pelo estado.json. */
  var todas = reg.concat([nova]);
  todas.sort(function(a, b){
    var x = (a && a.d) || "", y = (b && b.d) || "";
    return x < y ? -1 : (x > y ? 1 : 0);
  });
  /* Mesmo teto do logar(), e mesmo destino para o excedente: o registro so
     cresce, mas nada e descartado. */
  if(todas.length > REG_TETO){
    save("cron:registro-arquivo",
         (LS("cron:registro-arquivo", []) || []).concat(todas.slice(0, todas.length - REG_TETO)));
    todas = todas.slice(-REG_TETO);
  }
  save("cron:registro", todas);
  /* Tres telas leem o registro, e nao uma: o painel (renderRegistro), o ritmo
     semanal (ritmoDoRegistro, dentro do renderSemana) e a revisao da semana
     (revisaoDaSemana). */
  return ["renderRegistro", "renderSemana", "renderVistaRevisao"];
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
      /* PELO FUNIL, e nao por um enfileirarToque proprio: ate a Fase 9D esta
         era a SEGUNDA escrita de triagem, como o publicarAcervo era para meta e
         evento antes da 9C-0. Passando por aqui, a marcacao antiga publicada
         por esta migracao entra tambem no estado online. */
      tocarTriagem(vid, r.st, em);
      n++;
    });
    save("cron:triagem", t);
    save("cron:triagem-publicada", true);
    if(n) console.log("triagem: " + n + " marcacao(oes) anterior(es) publicada(s).");
  }catch(e){ console.error("migracao da triagem falhou:", e); }
}
/* ====== AS DECISOES ANTERIORES AO CORTE, PUBLICADAS UMA VEZ ======
   Uma decisao tomada antes de a 9G-3 desligar o GitHub tem `em` e nao tem
   linha online: o funil carimbou o instante e o toque subiu para o
   estado.json, que ninguem mais le. Medido em 10/09: 103 vagas triadas num
   aparelho, DUAS linhas de triagem no banco. Nada se perdeu — nada subiu.

   POR QUE NAO SERVE O migrarTriagemUmaVez. Ele pula quem ja tem `em`
   ("ja nasceu com instante: ja viaja"). Essa premissa valia enquanto havia
   DOIS caminhos: ter instante significava ter viajado por um deles. Com um
   caminho so, ter instante nao diz nada sobre estar no estado compartilhado.

   O INSTANTE PUBLICADO E O VERDADEIRO, e e isso que torna esta rotina segura
   de rodar nos dois aparelhos. Nao ha piso inventado como no botao do acervo,
   porque aqui NAO E PRECISO: a decisao antiga guardou o `em` de quando foi
   tomada. Republicar com ele deixa o relogio decidir vaga a vaga, item a item
   — a decisao mais recente vence, venha de onde vier. Uma marca antiga nao
   atropela uma recente do outro aparelho, e uma republicacao repetida nao
   muda nada, porque o servidor recusa o que nao e mais novo.

   O CRITERIO E O `em`, E NAO O `st`. Ter instante quer dizer que houve uma
   decisao; `st = 0` com instante e uma vaga DESMARCADA de proposito, que
   precisa viajar tanto quanto uma marcada. Sem instante e "nunca decidido", e
   isso nao se publica: publicar ausencia como decisao apagaria a marca
   legitima do outro aparelho.

   RECEBER NAO E TOCAR, E REPUBLICAR NAO E DECIDIR: nao chama logar(), nao
   carimba tempo novo e nao cria linha de registro. As linhas de registro
   daquelas decisoes ja existem aqui, escritas no dia em que foram tomadas.

   SO CORRE COM A SINCRONIA LIGADA, e a trava so e gravada quando correu de
   verdade: um aparelho que abrir a pagina deslogado tenta de novo depois. */
function publicarDecisoesAntigas(){
  var fora = {triagem:0, itens:0, correu:false};
  try{
    if(LS(PUBLICADO_ONLINE_KEY, false)) return fora;
    if(typeof SYNC === "undefined" || !SYNC.ligado()) return fora;

    var tri = vgTriagem();
    Object.keys(tri).forEach(function(vid){
      var r = tri[vid];
      if(!r || !r.em) return;                 /* sem instante: nunca decidido */
      /* PELO ESCRITOR, E NAO PELO FUNIL. O tocarTriagem pede um instante ao
         relogio monotonico, e o relogio, para uma base ja usada, devolve o
         seguinte: duas decisoes que dividem o mesmo `em` sairiam daqui com
         instantes deslocados, e republicar duas vezes deslocaria de novo.
         Republicar nao e decidir — o instante ja existe, e o que se quer e
         repeti-lo exatamente. */
      if(escreverTriagemOnline(vid, r.st || 0, r.em)) fora.triagem++;
    });

    PAINEIS.forEach(function(P){
      var projs = getProjs(P.id) || [];
      projs.forEach(function(pr){
        (pr.subs || []).forEach(function(sx){
          var x = normSub(sx);
          if(!x.em) return;                   /* sem instante: nunca decidido */
          if(escreverItemOnline(P.id, pr.id, x, x.em)) fora.itens++;
        });
      });
    });

    save(PUBLICADO_ONLINE_KEY, true);
    fora.correu = true;
    if(fora.triagem || fora.itens)
      console.log("publicadas " + fora.triagem + " decisao(oes) de triagem e " +
                  fora.itens + " de subitem que estavam so neste aparelho.");
  }catch(e){ console.error("publicacao das decisoes antigas falhou:", e); }
  return fora;
}

/* ============ O MERGE DE UMA TRIAGEM — UMA IMPLEMENTACAO SO (Fase 9D) ============
   Quarto dominio a passar por este movimento, depois de prioridade, meta e
   evento. A regra e copiada letra por letra do que estava dentro do
   buscarEstado.

   NAO HA LAPIDE AQUI, e a ausencia e do dominio, nao um esquecimento: descartar
   uma vaga NAO a apaga do lote. A vaga continua existindo em dados/vagas.json,
   que e escrito pelo coletor; o que a triagem guarda e so a DECISAO de quem le.
   "Nao marcada" e um estado (VG_ST.NOVO, st 0) e viaja como qualquer outro —
   e assim que desmarcar atravessa aparelhos.

   O `quando` E DERIVADO, e nao um segundo relogio: e o dia do proprio instante.
   A tela mostra o dia; o `em` decide quem vence. */
function mesclarTriagem(tri, vid, r){
  if(!r || !r.quando) return false;
  var atual = tri[vid];
  if(atual && (atual.em || "") >= r.quando) return false;
  tri[vid] = {st:r.st, quando:String(r.quando).slice(0,10), em:r.quando};
  return true;
}

/* ============ A DESCIDA ONLINE DA TRIAGEM — Fase 9D ============
   Molde dos tres anteriores. A chave e o ID DA VAGA, que e estavel
   (philjobs-31649) e sobrevive a coleta semanal — dados/vagas.json e reescrito
   inteiro toda segunda, e a decisao nao se perde porque nunca morou la.

   O VEREDICTO NAO VIAJA POR AQUI. Ele e do coletor, vem em dados/vagas.json e
   e recalculado a cada coleta; a triagem e a decisao do usuario. Os dois eixos
   nao se confundem, e esta fase nao os mistura.

   OS QUATRO RENDERS SAO TODOS COMPROVADOS por leitura de vgEstado():
     · renderVistaVagas  -> vgRender               (a aba Vagas)
     · renderHoje        -> renderVagasIndicador -> contagemDeVagas
     · renderSemana      -> vgEstado, na linha dos prazos
     · renderVistaRevisao-> revisaoDaSemana

   ESTE E O PRIMEIRO DOMINIO EM QUE renderSemana ENTRA, e entra por prova: nas
   fases 9C-2 e 9C-3 ele ficou de fora porque nao lia meta nem evento. Le
   triagem. E o renderHoje entra TODO DIA, e nao so no domingo como nas metas,
   porque o indicador de vagas do Hoje depende da triagem sempre. */
/* A descida das rotinas (Fase 9D.4).

   NAO HA MESCLA COM `em` LOCAL, e a ausencia e do formato: `cron:checks:` e
   `{id: booleano}` e nunca guardou instante. Quem decide o relogio aqui e o
   cache da camada, no aplicarRemoto, que ja recusou o que nao e mais novo
   antes de chegar neste ponto. A regra nao tem furo porque `cron:sync-cache` e
   `cron:checks:` moram no MESMO localStorage: somem juntos e voltam juntos —
   o mesmo argumento que sustenta "toque meu nao desce nunca" no registro.

   SEM LAPIDE: `{feito:false}` e um estado, e e assim que DESMARCAR atravessa.

   RECEBER NAO E TOCAR: nao passa pelo tocarRotina, nao escreve online e nao
   volta a subir. */
function aplicarRotinaOnline(linha){
  if(!linha || !linha.chave) return [];
  var chave = String(linha.chave), corte = chave.indexOf("/");
  if(corte < 0) return [];
  var dia = chave.slice(0, corte), id = chave.slice(corte + 1);
  if(!dia || !id) return [];
  var feito = !!(linha.valor && linha.valor.feito);
  var ck = LS("cron:checks:"+dia, {}) || {};
  if(!!ck[id] === feito) return [];          /* nada mudou: nao repinta a toa */
  ck[id] = feito;
  save("cron:checks:"+dia, ck);
  /* O `checks` em memoria e do dia de hoje. Sem esta linha o renderHoje
     repintaria a copia velha e a marca recebida sumiria da tela. */
  if(dia === dateKey) checks = ck;
  /* Dois renders, e so dois: o Hoje (as caixas e o "ficou para tras") e a
     revisao da semana (a contagem de rotinas concluidas). O renderSemana nao
     le cron:checks. */
  return ["renderHoje", "renderVistaRevisao"];
}

/* A descida das dispensas (Fase 9D.5).

   TRADUZ A CHAVE: `rotina/AAAA-MM-DD/id` vira `AAAA-MM-DD|id`. Uma chave de
   outra forma — a `meta-aviso/AAAA-MM` que o esquema preve e que nada ainda
   escreve — e IGNORADA, e nao adivinhada: gravar um formato que nenhum leitor
   entende sujaria a gaveta sem ninguem notar.

   SEM MESCLA COM `em` LOCAL, e sem lapide, pelas mesmas razoes da rotina: a
   entrada e `{chave: true}` e nunca guardou instante, quem decide o relogio e o
   cache da camada, e dispensar nao tem operacao inversa.

   RECEBER NAO E TOCAR: nao passa pelo tocarDispensa e nao volta a subir. */
function aplicarDispensaOnline(linha){
  if(!linha || !linha.chave) return [];
  var partes = String(linha.chave).split("/");
  if(partes.length !== 3 || partes[0] !== "rotina") return [];
  var dia = partes[1], id = partes[2];
  if(!dia || !id) return [];
  var disp = LS(ATRASO_KEY, {}) || {};
  var k = dia + "|" + id;
  if(disp[k]) return [];                     /* ja dispensada: nao repinta a toa */
  disp[k] = true;
  save(ATRASO_KEY, disp);
  /* UM render, e so um: `atrasadas()` e lida pelo bloco "ficou para tras" do
     Hoje, e por mais ninguem. */
  return ["renderHoje"];
}

function aplicarTriagemOnline(linha){
  if(!linha || !linha.chave) return [];
  var v = linha.valor || {};
  var tri = vgTriagem();
  if(!mesclarTriagem(tri, String(linha.chave), {quando: linha.em, st: v.st})) return [];
  vgSalvarTriagem(tri);
  return ["renderVistaVagas", "renderHoje", "renderSemana", "renderVistaRevisao"];
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
/* ONDE A VERSAO MORA E ONDE ELA E PROCURADA TEM DE SER O MESMO LUGAR. Ate a
   Fase 7 o APP_VERSION estava dentro do <script> do index.html, e era o HTML
   que esta funcao lia. A divisao em cinco arquivos levou a constante para o
   js/00-config.js e ninguem mudou a busca: o match passou a devolver null
   sempre, e o app parou de se atualizar sozinho — em silencio, que e o pior
   modo de parar. Agora a busca aponta para o arquivo onde a constante esta.

   O caminho e relativo ao documento, e nao a baseUrl(): serve tanto para
   /Cronograma/ quanto para /Cronograma/index.html. */
async function checkUpdate(){
  try{
    const res = await fetch("js/00-config.js?ping="+Date.now(), {cache:"no-store"});
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
/* TRAVA DE 20s DA VOLTA A ABA. Nasceu para a descida do estado.json, que saiu
   na 9G-3; o que ela guarda agora e o checkUpdate(), que e uma busca de rede
   como a outra era. Sem ela, alternar de aplicativo no celular pediria a
   versao a cada toque na tela. */
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
