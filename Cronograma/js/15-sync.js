/* CRONOGRAMA — 15-sync.js
   Fase 9A: a camada de estado compartilhado online. UMA infraestrutura de
   sincronização, que os painéis passarão a usar — e não uma sincronização por
   painel. Ver README, "Fase 9 — Estado compartilhado online".

   ESTE ARQUIVO NÃO LIGA NADA. Nenhum domínio está conectado: a Fase 9A entrega
   a infraestrutura, e 9B em diante conecta um domínio de cada vez, pelo
   assinarDominio(). O caminho toques -> GitHub -> estado.json continua sendo a
   verdade operacional até a Fase 9G, e nada aqui o desliga.

   E ESTÁ DESLIGADO POR PADRÃO. Sem cron:sync-ligado, iniciar() devolve na
   primeira linha e o aparelho segue exatamente como sempre foi. É o que torna
   esta fase acrescentável a um app em uso: ligar é uma decisão, não um efeito
   colateral de atualizar.

   Carrega depois de 10-nucleo.js — de onde vêm LS, save, ymd, aparelhoId e o
   instanteDoToque — e antes de 20-regras.js. NÃO tem código de topo: quem
   inicia é o 40-app.js, como todo o resto. */

/* Estado do módulo. Tudo começa desligado e vazio: um aparelho que nunca
   entrou é indistinguível de um que não tem rede. */
var SYNC_CLI         = null;   /* cliente do SDK, ou null */
var SYNC_CANAL       = null;   /* canal Realtime, ou null */
var SYNC_DONO        = null;   /* uuid do usuário autenticado */
var SYNC_APLICADORES = {};     /* dominio -> function(linha) -> [nomes de render] */
var SYNC_PEDIDOS     = {};     /* nomes de render acumulados */
var SYNC_TIMER       = null;
var SYNC_DRENANDO    = false;
var SYNC_SITUACAO    = "desligado";  /* desligado|conectando|sem-dono|pronto|offline|erro */
var SYNC_ULTIMO_ERRO = "";
var SYNC_ESPERANDO_FOCO = false;

var SYNC = {};

/* ==================== ARMAZENAMENTO LOCAL ====================
   Três chaves, e cada uma tem um papel que as outras não têm:

     cron:sync-fila   — o que este aparelho decidiu e ainda não foi persistido.
                        É a garantia de que uma alteração feita sem rede não se
                        perde. Só sai daqui depois de confirmada.
     cron:sync-cache  — a última verdade conhecida, item a item, com o `em` de
                        cada uma. É contra ele que o relógio decide, e é o que
                        permite abrir offline mostrando o que se sabia.
     cron:sync-marca  — até onde as entregas já chegaram (um servidor_em). É o
                        ponto de partida do catch-up.

   NENHUMA DELAS É ESTADO DE DOMÍNIO. O cache guarda o que veio do servidor; o
   estado que a tela desenha continua morando onde sempre morou (cron:pipeline,
   cron:metas:..., etc.). Quem faz a ponte entre os dois é o aplicador de cada
   domínio, e ele só existe a partir da Fase 9B. */
function syncFila(){ var v = LS(SYNC_FILA_KEY, []); return (v && v.forEach) ? v : []; }
function syncSalvarFila(f){ save(SYNC_FILA_KEY, f); }
function syncCache(){ var v = LS(SYNC_CACHE_KEY, {}); return (v && typeof v === "object") ? v : {}; }
function syncSalvarCache(c){ save(SYNC_CACHE_KEY, c); }
function syncMarca(){ return LS(SYNC_MARCA_KEY, "") || ""; }
function syncSalvarMarca(m){ if(m && m > syncMarca()) save(SYNC_MARCA_KEY, m); }

/* O ␟ é o mesmo separador do chaveTitulo() no 10-nucleo.js, e pela mesma razão:
   não aparece em id nenhum, então a chave composta nunca é ambígua. */
SYNC.chave = function(dominio, chave){ return dominio + "␟" + chave; };

SYNC.dominioValido = function(d){ return SINCRONIA.DOMINIOS.indexOf(d) >= 0; };

/* ==================== O RELÓGIO ====================
   A regra inteira da Fase 9, numa função. Vale a pena ela ser UMA:

     · mais novo manda;
     · empate fica como está;
     · mais antigo é ignorado.

   Até aqui essa regra vivia reescrita em oito lugares do buscarEstado(), cada
   um com o seu `if((x.em||"") >= r.quando) return;`. Um deles com o comparador
   trocado passaria meses despercebido. Agora há um comparador só — e o
   servidor guarda o mesmo invariante, no gatilho cron_estado_relogio.

   COMPARAÇÃO DE TEXTO, e não de Date: os dois lados são ISO-8601 em UTC, que é
   ordenável lexicograficamente. Sem parse, sem fuso, sem NaN. */
SYNC.venceRemoto = function(emLocal, emRemoto){
  if(!emRemoto) return false;             /* sem instante não vence nada */
  return String(emRemoto) > String(emLocal || "");
};

/* Toque meu não desce. "Receber não é tocar" já era regra do buscarEstado(); o
   Realtime a torna mais urgente, porque a volta agora fecha em milissegundos e
   um eco vira laço, não incômodo.

   DUAS CAMADAS, de propósito. Esta é a primeira e é explícita. A segunda é o
   próprio relógio: a escrita otimista já gravou o mesmo `em` no cache, então o
   eco também não seria mais novo. Uma protege quando a outra falha — se o
   aparelho perder o cron:aparelho, o relógio ainda segura. */
SYNC.ecoProprio = function(linha){
  try{ return !!(linha && linha.aparelho && linha.aparelho === aparelhoId()); }
  catch(e){ return false; }
};

/* ==================== A DESCIDA ====================
   O único caminho pelo qual estado externo entra neste aparelho. Devolve
   sempre {aplicou, motivo} — nunca lança —, porque ele roda dentro de um
   ouvinte de WebSocket, e exceção ali derruba o canal em silêncio.

   A ORDEM DOS SEIS PASSOS É A CORREÇÃO. Em particular, a marca de entrega
   avança ANTES das recusas de eco e de relógio: uma linha recusada por ser
   minha, ou por ser velha, foi ENTREGUE do mesmo jeito. Se a marca só
   avançasse no caminho feliz, ela ficaria para trás e o catch-up rebuscaria
   para sempre o mesmo trecho. */
SYNC.aplicarRemoto = function(linha){
  if(!linha || !linha.dominio || !linha.chave) return {aplicou:false, motivo:"linha sem endereço"};

  /* 1. É minha? O filtro do Realtime e a RLS já garantem, mas confiar em um
        filtro remoto para decidir o que entra no armazenamento local seria
        confiar em quem está do outro lado do cabo. */
  if(SYNC_DONO && linha.dono && linha.dono !== SYNC_DONO) return {aplicou:false, motivo:"dono alheio"};
  if(!SYNC.dominioValido(linha.dominio)) return {aplicou:false, motivo:"domínio desconhecido"};

  /* 2. A entrega chegou, seja qual for o destino dela. */
  syncSalvarMarca(linha.servidor_em);

  /* 3. Eco do próprio aparelho. */
  if(SYNC.ecoProprio(linha)) return {aplicou:false, motivo:"eco do próprio aparelho"};

  /* 4. O relógio. */
  var k = SYNC.chave(linha.dominio, linha.chave);
  var cache = syncCache(), atual = cache[k];
  if(atual && !SYNC.venceRemoto(atual.em, linha.em)) return {aplicou:false, motivo:"não é mais novo"};

  /* 5. O cache passa a conhecer. A lápide é GUARDADA, não apagada: ausência não
        é desconhecimento, e um aparelho que só reabre daqui a um mês precisa
        saber que aquilo foi apagado — senão ele o recria na subida seguinte. */
  cache[k] = {valor: linha.valor || {}, del: !!linha.del,
              em: linha.em, aparelho: linha.aparelho || ""};
  syncSalvarCache(cache);

  /* 6. O domínio, se já tiver dono. Até a Fase 9B nenhum tem: a linha fica no
        cache esperando quem a consuma, e a tela não se mexe. O aplicador NÃO
        enfileira toque e NÃO reescreve online — receber não é tocar. */
  var aplicador = SYNC_APLICADORES[linha.dominio];
  if(aplicador){
    try{
      var renders = aplicador(linha) || [];
      if(renders.length) SYNC.pedirRender(renders);
    }catch(e){
      try{ console.error("sync: aplicador de " + linha.dominio + " falhou:", e); }catch(e2){}
      return {aplicou:false, motivo:"aplicador falhou"};
    }
  }
  return {aplicou:true, motivo:""};
};

/* Como um domínio entra na Fase 9B em diante. A função recebe a linha e devolve
   a lista de renders que a mudança exige — é assim que uma alteração em Trilhos
   pode pedir renderTrilhos() E renderHoje(), que é o cruzamento entre painéis
   que a Fase 9 promete. */
SYNC.assinarDominio = function(dominio, fn){
  if(!SYNC.dominioValido(dominio)) throw new Error("domínio desconhecido: " + dominio);
  SYNC_APLICADORES[dominio] = fn;
};

/* ==================== A SUBIDA ====================
   A FILA ANTES DA REDE, SEMPRE. Grava-se primeiro, tenta-se depois. É o que
   torna "offline" indistinguível de "online" do ponto de vista de quem usa: a
   decisão está guardada no instante em que foi tomada, e a rede é problema do
   aplicativo.

   O INSTANTE VEM DO instanteDoToque(), o mesmo relógio monotônico dos toques.
   Não é conveniência: é o que permite à Fase 9F comparar os dois caminhos item
   a item. Dois relógios diferentes tornariam a comparação sem sentido. */
SYNC.salvarAlteracao = function(dominio, chave, valor, opts){
  opts = opts || {};
  if(!SYNC.dominioValido(dominio)) throw new Error("domínio desconhecido: " + dominio);
  if(chave === undefined || chave === null || chave === "") throw new Error("alteração sem chave");

  var em = opts.em || new Date(instanteDoToque(opts.quando)).toISOString();
  var item = {
    id: em.replace(/[:.]/g, "-") + "-" + aparelhoId() + "-" + dominio,
    dominio: dominio,
    chave: String(chave),
    valor: valor || {},
    del: !!opts.del,
    em: em,
    aparelho: aparelhoId(),
    expira_em: opts.expira_em || null
  };

  /* Cache otimista: quem decidiu vê a própria decisão na hora, e o relógio já
     passa a recusar qualquer eco dela. */
  var cache = syncCache();
  cache[SYNC.chave(dominio, item.chave)] =
    {valor:item.valor, del:item.del, em:em, aparelho:item.aparelho};
  syncSalvarCache(cache);

  var fila = syncFila();
  fila.push(item);
  /* Mesmo desenho do TOQUES_TETO: o que passa do teto não é descartado. */
  if(fila.length > SINCRONIA.FILA_TETO){
    var sobra = fila.slice(0, fila.length - SINCRONIA.FILA_TETO);
    fila = fila.slice(-SINCRONIA.FILA_TETO);
    save("cron:sync-fila-excedente", (LS("cron:sync-fila-excedente", []) || []).concat(sobra));
  }
  syncSalvarFila(fila);

  SYNC.agendarDrenagem();
  return item;
};

/* AGENDAR, E NAO DRENAR NA HORA. Duas razões:

   · marcar dez itens seguidos tem de ser UMA subida, não dez — é o mesmo
     motivo do agendarEnvio() dos toques, e a mesma forma: um agendamento novo
     adia o anterior;
   · drenar de dentro do salvarAlteracao() deixava uma promessa solta que
     ninguém aguardava, e quem chamasse drenarFila() logo depois pegava a trava
     SYNC_DRENANDO levantada e recebia "já drenando" — sem ter drenado. Uma
     corrida silenciosa entre a decisão e o envio dela. */
var SYNC_DRENAGEM_TIMER = null;
SYNC.agendarDrenagem = function(){
  try{
    if(SYNC_DRENAGEM_TIMER) clearTimeout(SYNC_DRENAGEM_TIMER);
    SYNC_DRENAGEM_TIMER = setTimeout(function(){
      SYNC_DRENAGEM_TIMER = null;
      SYNC.drenarFila();
    }, SINCRONIA.DRENAGEM_ESPERA);
  }catch(e){ SYNC.drenarFila(); }
};

/* Um upsert por item pendente, em ordem, parando na primeira falha — o que não
   subiu continua na fila, na ordem em que aconteceu.

   CORTA POR ID, NUNCA POR POSIÇÃO. É a lição que a fila de toques já aprendeu
   (ver enviarToques no 10-nucleo.js): cortar os N primeiros supõe que a fila
   não mudou durante o envio, e ela muda — outra aba, um toque novo no meio.

   RECUSA DO RELÓGIO NÃO É FALHA. Se o servidor já tem valor mais novo, o
   gatilho descarta o nosso e devolve sucesso sem linha. Está certo: a nossa
   alteração perdeu por ser mais velha, que é a regra. Ela sai da fila. */
SYNC.drenarFila = function(){
  if(SYNC_DRENANDO) return Promise.resolve({enviados:0, motivo:"já drenando"});
  var fila = syncFila();
  if(!fila.length) return Promise.resolve({enviados:0, motivo:"fila vazia"});
  if(!SYNC.pronto()) return Promise.resolve({enviados:0, motivo:"sem sessão: a fila espera"});

  SYNC_DRENANDO = true;
  var subiram = [], falha = null;
  var cadeia = Promise.resolve();
  fila.forEach(function(it){
    cadeia = cadeia.then(function(){
      if(falha) return;
      return SYNC.persistir(it).then(function(r){
        if(r && r.ok) subiram.push(it.id); else falha = r || {erro:"desconhecido"};
      });
    });
  });

  var terminar = function(){ SYNC_DRENANDO = false; };
  return cadeia.then(function(){
    if(subiram.length){
      var vistos = {};
      subiram.forEach(function(id){ vistos[id] = 1; });
      syncSalvarFila(syncFila().filter(function(x){ return !vistos[x.id]; }));
    }
    terminar();
    if(falha){
      SYNC_SITUACAO = "offline";
      SYNC_ULTIMO_ERRO = String((falha && falha.erro) || "");
    }
    return {enviados:subiram.length, falha:falha};
  }, function(e){
    terminar();
    SYNC_SITUACAO = "offline";
    SYNC_ULTIMO_ERRO = String((e && e.message) || e);
    return {enviados:subiram.length, falha:{erro:SYNC_ULTIMO_ERRO}};
  });
};

SYNC.persistir = function(it){
  if(!SYNC.pronto()) return Promise.resolve({ok:false, erro:"sem sessão"});
  return SYNC_CLI.from(SINCRONIA.TABELA).upsert({
    dono: SYNC_DONO, dominio: it.dominio, chave: it.chave,
    valor: it.valor, del: it.del, em: it.em,
    aparelho: it.aparelho, expira_em: it.expira_em || null
  }, {onConflict: "dono,dominio,chave"}).then(function(r){
    if(r && r.error) return {ok:false, erro:r.error.message || String(r.error)};
    return {ok:true};
  }, function(e){
    return {ok:false, erro:String((e && e.message) || e)};
  });
};

/* ==================== A LEITURA ====================
   Página a página, porque uma conta com anos de uso não cabe num pedido só. */
SYNC.carregarEstado = function(dominios){
  if(!SYNC.pronto()) return Promise.resolve({lidas:0, motivo:"sem sessão"});
  var alvo = (dominios && dominios.length) ? dominios : SINCRONIA.DOMINIOS;
  var lidas = 0, aplicadas = 0;
  var pagina = function(de){
    var q = SYNC_CLI.from(SINCRONIA.TABELA).select("*")
      .eq("dono", SYNC_DONO).in("dominio", alvo)
      .order("servidor_em", {ascending:true})
      .range(de, de + SINCRONIA.LOTE - 1);
    return q.then(function(r){
      if(r && r.error) throw new Error(r.error.message || String(r.error));
      var linhas = (r && r.data) || [];
      linhas.forEach(function(l){ lidas++; if(SYNC.aplicarRemoto(l).aplicou) aplicadas++; });
      if(linhas.length === SINCRONIA.LOTE) return pagina(de + SINCRONIA.LOTE);
      return null;
    });
  };
  return pagina(0).then(function(){
    return {lidas:lidas, aplicadas:aplicadas};
  }, function(e){
    SYNC_SITUACAO = "offline";
    SYNC_ULTIMO_ERRO = String((e && e.message) || e);
    return {lidas:lidas, aplicadas:aplicadas, erro:SYNC_ULTIMO_ERRO};
  });
};

/* O DELTA, e por que ele existe. Nunca se deve confiar só no Realtime para não
   perder evento: no iPhone, o Safari mata o WebSocket assim que o app vai para
   segundo plano, e o caso NORMAL ali não é "recebe o evento" — é "reconecta e
   descobre o que perdeu". O delta é o caminho principal, não o remendo.

   A SOBREPOSIÇÃO NÃO É PARANOIA. A marca é um servidor_em, mas ordem de COMMIT
   não é ordem de servidor_em: uma transação que começou antes e terminou depois
   pode ter servidor_em menor do que uma já lida, e cairia no buraco entre duas
   leituras. Reler alguns segundos a mais fecha o buraco, e reler não custa
   nada — aplicarRemoto é idempotente, o relógio recusa o que já foi aplicado. */
SYNC.buscarDelta = function(){
  if(!SYNC.pronto()) return Promise.resolve({lidas:0, motivo:"sem sessão"});
  var marca = syncMarca();
  if(!marca) return SYNC.carregarEstado();
  var desde = new Date(new Date(marca).getTime() - SINCRONIA.SOBREPOSICAO).toISOString();
  var lidas = 0, aplicadas = 0;
  return SYNC_CLI.from(SINCRONIA.TABELA).select("*")
    .eq("dono", SYNC_DONO).gte("servidor_em", desde)
    .order("servidor_em", {ascending:true})
    .then(function(r){
      if(r && r.error) throw new Error(r.error.message || String(r.error));
      ((r && r.data) || []).forEach(function(l){
        lidas++; if(SYNC.aplicarRemoto(l).aplicou) aplicadas++;
      });
      return {lidas:lidas, aplicadas:aplicadas, desde:desde};
    }, function(e){
      SYNC_SITUACAO = "offline";
      SYNC_ULTIMO_ERRO = String((e && e.message) || e);
      return {lidas:lidas, aplicadas:aplicadas, erro:SYNC_ULTIMO_ERRO};
    });
};

/* ==================== REALTIME ==================== */
SYNC.assinarMudancas = function(){
  if(!SYNC.pronto()) return Promise.resolve({assinado:false, motivo:"sem sessão"});
  try{ if(SYNC_CANAL) SYNC_CLI.removeChannel(SYNC_CANAL); }catch(e){}
  SYNC_CANAL = SYNC_CLI.channel("cron-estado-" + SYNC_DONO)
    .on("postgres_changes",
        {event:"*", schema:"public", table:SINCRONIA.TABELA, filter:"dono=eq." + SYNC_DONO},
        function(msg){
          /* DELETE não traz `new`. Não usamos DELETE (a lápide é uma coluna),
             mas a poda de rotina/dispensa usa — e ali o certo é ignorar: o item
             expirou de velho, não foi decidido por ninguém. */
          var l = msg && (msg.new || msg.record);
          if(!l) return;
          SYNC.aplicarRemoto(l);
        })
    .subscribe(function(status){
      if(status === "SUBSCRIBED"){
        SYNC_SITUACAO = "pronto";
        /* O BURACO ENTRE A LEITURA E A ASSINATURA. Entre carregarEstado() e o
           canal ficar de pé há uma janela em que uma mudança do outro aparelho
           não é nem lida nem recebida. Um delta logo após assinar a fecha. */
        SYNC.buscarDelta();
      } else if(status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED"){
        SYNC_SITUACAO = "offline";
        SYNC.agendarReconexao();
      }
    });
  return Promise.resolve({assinado:true});
};

/* ==================== RECONEXÃO ====================
   A ordem importa e é esta:
     1. o canal de pé outra vez;
     2. o que se perdeu, pelo delta;
     3. o que este aparelho decidiu e ainda não subiu.
   Só então o aparelho está sincronizado. Drenar antes de buscar faria uma
   decisão local vencer, por acidente de ordem, uma decisão remota mais nova. */
var SYNC_RECONEXAO_TIMER = null;
var SYNC_ULTIMA_RECONEXAO = 0;
SYNC.reconectar = function(forcar){
  if(!SYNC.pronto()) return Promise.resolve({motivo:"sem sessão"});
  var agora = Date.now();
  if(!forcar && agora - SYNC_ULTIMA_RECONEXAO < 5000) return Promise.resolve({motivo:"recente"});
  SYNC_ULTIMA_RECONEXAO = agora;
  return SYNC.assinarMudancas()
    .then(function(){ return SYNC.buscarDelta(); })
    .then(function(d){
      return SYNC.drenarFila().then(function(f){
        if(!d.erro && !f.falha) SYNC_SITUACAO = "pronto";
        return {delta:d, fila:f};
      });
    });
};
SYNC.agendarReconexao = function(ms){
  try{
    if(SYNC_RECONEXAO_TIMER) clearTimeout(SYNC_RECONEXAO_TIMER);
    SYNC_RECONEXAO_TIMER = setTimeout(function(){
      SYNC_RECONEXAO_TIMER = null;
      SYNC.reconectar(true);
    }, ms || 5000);
  }catch(e){}
};

/* ==================== RENDER SEGURO ====================
   Uma mudança externa NÃO pode destruir o que se está fazendo. Metade da edição
   deste app é contenteditable com onblur (o título do projeto, o da meta, o do
   evento, o da prioridade): um renderTrilhos() disparado no meio de uma
   digitação troca o nó sob o cursor, e o onblur lê o texto que já não existe.

   Hoje isso não acontece porque buscarEstado() só roda no boot, no online e no
   visibilitychange. Com Realtime, passa a poder acontecer a qualquer segundo.

   O QUE ADIA E O QUE NÃO ADIA. Adia enquanto houver foco num campo editável, e
   enquanto uma drenagem estiver em curso. NÃO adia por fila cheia: uma fila
   parada por falta de rede congelaria a tela para sempre, o que troca um
   problema raro por um permanente. */
SYNC.editando = function(){
  try{
    if(typeof document === "undefined" || !document.activeElement) return false;
    var el = document.activeElement;
    if(el.isContentEditable) return true;
    var t = String(el.tagName || "").toLowerCase();
    return t === "input" || t === "textarea" || t === "select";
  }catch(e){ return false; }
};

SYNC.podeRenderizar = function(){ return !SYNC.editando() && !SYNC_DRENANDO; };

SYNC.pedirRender = function(nomes){
  if(typeof nomes === "string") nomes = [nomes];
  (nomes || []).forEach(function(n){ if(n) SYNC_PEDIDOS[n] = true; });
  try{
    if(SYNC_TIMER) clearTimeout(SYNC_TIMER);
    SYNC_TIMER = setTimeout(function(){
      SYNC_TIMER = null;
      SYNC.descarregarRender();
    }, SINCRONIA.RENDER_ESPERA);
  }catch(e){ SYNC.descarregarRender(); }
  return Object.keys(SYNC_PEDIDOS);
};

SYNC.descarregarRender = function(forcar){
  var nomes = Object.keys(SYNC_PEDIDOS);
  if(!nomes.length) return {renderizados:[], adiado:false};
  if(!forcar && !SYNC.podeRenderizar()){
    SYNC.esperarFoco();
    return {renderizados:[], adiado:true, pendentes:nomes};
  }
  SYNC_PEDIDOS = {};
  var feitos = [];
  nomes.forEach(function(n){
    var fn = null;
    try{ fn = (typeof globalThis !== "undefined" ? globalThis : this)[n]; }catch(e){}
    if(typeof fn === "function"){
      try{ fn(); feitos.push(n); }
      catch(e){ try{ console.error("sync: render " + n + " falhou:", e); }catch(e2){} }
    }
  });
  return {renderizados:feitos, adiado:false};
};

/* Um ouvinte só, rearmado, e não um por adiamento: sem a trava, dez eventos
   adiados pendurariam dez ouvintes no mesmo focusout. */
SYNC.esperarFoco = function(){
  if(SYNC_ESPERANDO_FOCO) return;
  try{
    if(typeof document === "undefined" || !document.addEventListener) return;
    SYNC_ESPERANDO_FOCO = true;
    var solta = function(){
      document.removeEventListener("focusout", solta);
      SYNC_ESPERANDO_FOCO = false;
      setTimeout(function(){ SYNC.descarregarRender(); }, SINCRONIA.RENDER_ESPERA);
    };
    document.addEventListener("focusout", solta);
  }catch(e){ SYNC_ESPERANDO_FOCO = false; }
};

/* ==================== SESSÃO ====================
   O SDK entra por injeção e só aqui. Falhar em carregá-lo é um resultado
   possível e previsto: devolve null, a sincronia não liga, e o aplicativo
   segue inteiro pelo caminho de sempre. */
SYNC.configurado = function(){
  return !!(typeof SINCRONIA !== "undefined" && SINCRONIA.URL && SINCRONIA.CHAVE);
};
SYNC.ligado = function(){ return !!LS(SYNC_LIGADO_KEY, false); };
SYNC.pronto = function(){ return !!(SYNC_CLI && SYNC_DONO); };
SYNC.situacao = function(){
  return {situacao:SYNC_SITUACAO, dono:SYNC_DONO, ligado:SYNC.ligado(),
          fila:syncFila().length, marca:syncMarca(), erro:SYNC_ULTIMO_ERRO,
          aparelho:(function(){ try{ return aparelhoId(); }catch(e){ return ""; } })()};
};

SYNC.carregarSDK = function(){
  try{
    if(typeof globalThis !== "undefined" && globalThis.supabase && globalThis.supabase.createClient){
      return Promise.resolve(globalThis.supabase);
    }
    if(typeof document === "undefined" || !document.createElement) return Promise.resolve(null);
  }catch(e){ return Promise.resolve(null); }
  return new Promise(function(resolve){
    try{
      var s = document.createElement("script");
      s.src = SINCRONIA.SDK;
      s.async = true;
      s.onload = function(){ resolve(globalThis.supabase || null); };
      s.onerror = function(){ resolve(null); };
      document.head.appendChild(s);
    }catch(e){ resolve(null); }
  });
};

SYNC.conectar = function(){
  if(SYNC_CLI) return Promise.resolve(SYNC_CLI);
  return SYNC.carregarSDK().then(function(sdk){
    if(!sdk || !sdk.createClient){
      SYNC_SITUACAO = "offline";
      SYNC_ULTIMO_ERRO = "SDK indisponível";
      return null;
    }
    /* A CHAVE DA SESSAO MORA FORA DO PREFIXO cron:, e isso e seguranca, nao
       estilo. O coletarDados() varre TODA chave que comece com "cron:" para
       dentro do backup exportado, excluindo so o que casa com /token/i. Uma
       sessao guardada em "cron:sync-sessao" — como esta ate a Fase 9B — seria
       varrida junto: o JWT e o refresh token iriam para um arquivo .json que
       se baixa, se guarda e as vezes se manda por e-mail.
       E exatamente a razao pela qual o TOKEN_KEY do GitHub e "sync:token" e
       nao "cron:token". A sessao segue a mesma regra. */
    SYNC_CLI = sdk.createClient(SINCRONIA.URL, SINCRONIA.CHAVE, {
      auth: {persistSession:true, autoRefreshToken:true, storageKey:SYNC_SESSAO_KEY}
    });
    return SYNC_CLI;
  });
};

/* SÓ ESTAR AUTENTICADO NÃO BASTA. Este projeto Supabase é compartilhado com o
   CONTAS_CASA, que já tem os seus próprios usuários. Uma conta de lá que
   entrasse aqui teria auth.uid() válido e, sem esta verificação, veria um
   Cronograma vazio e começaria a criá-lo. Quem decide é a cron_dono, e a
   verificação é do servidor: a RLS recusa mesmo se este código mentir. */
SYNC.souDono = function(){
  if(!SYNC_CLI || !SYNC_DONO) return Promise.resolve(false);
  return SYNC_CLI.from(SINCRONIA.TABELA_DONO).select("uid").eq("uid", SYNC_DONO).limit(1)
    .then(function(r){ return !!(r && !r.error && r.data && r.data.length); },
          function(){ return false; });
};

SYNC.entrar = function(email, senha){
  return SYNC.conectar().then(function(cli){
    if(!cli) return {ok:false, erro:"não foi possível carregar o SDK"};
    return cli.auth.signInWithPassword({email:email, password:senha}).then(function(r){
      if(r && r.error) return {ok:false, erro:r.error.message};
      save(SYNC_LIGADO_KEY, true);
      return SYNC.retomarSessao().then(function(s){ return {ok:!!s.dono, erro:s.erro || ""}; });
    });
  });
};

SYNC.sair = function(){
  save(SYNC_LIGADO_KEY, false);
  try{ if(SYNC_CANAL && SYNC_CLI) SYNC_CLI.removeChannel(SYNC_CANAL); }catch(e){}
  SYNC_CANAL = null; SYNC_DONO = null; SYNC_SITUACAO = "desligado";
  if(!SYNC_CLI) return Promise.resolve({ok:true});
  return SYNC_CLI.auth.signOut().then(function(){ return {ok:true}; }, function(){ return {ok:true}; });
};

SYNC.retomarSessao = function(){
  if(!SYNC_CLI) return Promise.resolve({dono:null, erro:"sem cliente"});
  return SYNC_CLI.auth.getSession().then(function(r){
    var s = r && r.data && r.data.session;
    if(!s || !s.user){ SYNC_SITUACAO = "desligado"; return {dono:null}; }
    SYNC_DONO = s.user.id;
    return SYNC.souDono().then(function(sim){
      if(!sim){
        SYNC_DONO = null;
        SYNC_SITUACAO = "sem-dono";
        SYNC_ULTIMO_ERRO = "esta conta não é dona de um Cronograma";
        return {dono:null, erro:SYNC_ULTIMO_ERRO};
      }
      SYNC_SITUACAO = "conectando";
      return {dono:SYNC_DONO};
    });
  }, function(e){
    SYNC_SITUACAO = "erro";
    SYNC_ULTIMO_ERRO = String((e && e.message) || e);
    return {dono:null, erro:SYNC_ULTIMO_ERRO};
  });
};

/* ==================== O CICLO ====================
   DESLIGADO POR PADRÃO, e a primeira linha é o que garante isso. Um aparelho
   que atualiza para esta versão não muda de comportamento: continua no caminho
   de toques, exatamente como antes, até alguém entrar de propósito.

   E NADA AQUI DESLIGA O GITHUB. Os ouvintes de online e visibilitychange do
   40-app.js continuam intactos e continuam chamando enviarToques e
   buscarEstado. Os dois caminhos convivem — é o que a Fase 9F vai medir. */
SYNC.iniciar = function(){
  if(!SYNC.configurado()) return Promise.resolve({ligado:false, motivo:"não configurado"});
  if(!SYNC.ligado())      return Promise.resolve({ligado:false, motivo:"desligado neste aparelho"});
  return SYNC.conectar().then(function(cli){
    if(!cli) return {ligado:false, motivo:SYNC_ULTIMO_ERRO || "sem SDK"};
    return SYNC.retomarSessao().then(function(s){
      if(!s.dono) return {ligado:false, motivo:s.erro || "sem sessão"};
      SYNC.ouvir();
      return SYNC.carregarEstado()
        .then(function(){ return SYNC.assinarMudancas(); })
        .then(function(){ return SYNC.drenarFila(); })
        .then(function(){
          if(SYNC_SITUACAO === "conectando") SYNC_SITUACAO = "pronto";
          return {ligado:true, situacao:SYNC.situacao()};
        });
    });
  });
};

/* Ouvintes PRÓPRIOS, acrescentados aos que já existem. Não mexo nos do
   40-app.js: eles são do caminho do GitHub e continuam sendo dele. O `offline`
   é novo no aplicativo — até aqui só havia `online`. */
var SYNC_OUVINDO = false;
SYNC.ouvir = function(){
  if(SYNC_OUVINDO) return;
  try{
    if(typeof window === "undefined" || !window.addEventListener) return;
    SYNC_OUVINDO = true;
    window.addEventListener("online",  function(){ SYNC.reconectar(true); });
    window.addEventListener("offline", function(){ SYNC_SITUACAO = "offline"; });
    if(typeof document !== "undefined" && document.addEventListener){
      document.addEventListener("visibilitychange", function(){
        if(document.visibilityState === "visible") SYNC.reconectar();
      });
    }
  }catch(e){ SYNC_OUVINDO = false; }
};
