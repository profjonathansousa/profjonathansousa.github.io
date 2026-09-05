/* CRONOGRAMA — 00-config.js
   Constantes, configuracoes e estruturas estaticas. Nada aqui executa logica:
   sao os dados que descrevem as pecas (DIAS, PAINEIS, as sementes dos paineis,
   o TOEFL) e os nomes das chaves de localStorage.

   A ORDEM DE CARGA E PARTE DA ARQUITETURA: este arquivo vem primeiro porque
   todos os outros leem daqui. Ver index.html. */
/* ==================== AVISOS — Fase 8 ====================
   As tres coisas publicas do Web Push. Nenhuma delas e segredo:

   - a URL e a chave PUBLISHABLE so dizem "sou um visitante deste projeto".
     Ela e o modelo atual do Supabase e substitui a antiga anon key, com as
     MESMAS baixas permissoes: quem decide o que se pode fazer continua sendo a
     RLS, em sql/cron_push.sql, que permite APENAS inserir. Ler, atualizar e
     apagar inscricao e da chave SECRET, que mora em GitHub Secrets e roda so
     no Actions;
   - a chave VAPID publica e publica por desenho: e ela que o navegador usa
     para amarrar a inscricao a este emissor. A PRIVADA nunca entra aqui.

   ENQUANTO ESTIVEREM VAZIAS o botao de avisos nao aparece — avisosConfigurados()
   e quem decide, e a ausencia de configuracao nao pode quebrar tela nenhuma. */
const AVISOS = {
  URL:   "https://mcwgiqwbbgdltzqgopcq.supabase.co",
  CHAVE: "sb_publishable_-k508GkeJm6-5fFp0KhBTg_7r0P8vTT",
  /* A publica do par gerado em 04/09. A PRIVADA nao esta aqui e nunca estara:
     ela mora no Secret VAPID_PRIVATE_KEY e so o Actions a ve. */
  VAPID: "BFtj6rzJSQXtACGAi-aX4-o8K-Ezr7GqIx6qz3zYuTjmGPhbaERTyxWHi3SotPKvBVVB71nMslj-cqTOmjKURJM"
};

const APP_VERSION = "2026-09-05-toefl9d";
/* `link` e `painel` NAO sao a mesma coisa, e a diferenca e a Fase 2 inteira.

   `painel` e so o botao: leva ao trilho e nao escolhe nada.
   `link`  e o botao MAIS um estagio desenhado ao vivo — e ele so sobrevive
           onde nao ha escolha a fazer (ver trilhoSemEscolha).

   O que saiu daqui em 2026-09-01, e por que:

   · "Planejar a semana" (seg-plan) foi removida. Planejar nao e tarefa: e o
     que o bloco de PRIORIDADES faz. Uma caixa que voce marca por ter pensado
     na semana nao move a semana.
   · seg-acad, ter-art, sex-esc e sab-consol perderam o `link`. Eram rotinas
     academicas que apontavam para um painel com DOZE artigos dentro, e o
     Hoje escolhia o primeiro do array — sempre o mesmo, para sempre. A rotina
     continua dizendo O QUE fazer ("Escrita academica"); QUAL artigo e decisao
     sua, e ela mora nas Prioridades.
   · `ctx:"computador"` marca a rotina que o telefone nao resolve. Fora de
     casa isso vira um aviso, nunca um rebaixamento.
   · `processo:"toefl"` (Fase 4) e a inversao: a rotina nao carrega mais o
     texto do que fazer — ela diz de QUE PROCESSO o dia depende, e o texto e
     pedido ao processo na hora de desenhar. Os cinco textos do TOEFL saem
     daqui e vao para o TOEFL_SEMANA, letra por letra. E o mesmo movimento do
     `link`/`painel`: quem sabe o conteudo e quem e dono dele. */
const DIAS = {
  1:{nome:"Segunda", eixo:"Abertura ministerial & planejamento", anchors:[],
     tasks:[
       {id:"seg-min", t:"Manutenção ministerial", n:"Pendências da igreja, mensagens, o que ficou aberto"},
       {id:"seg-acad", t:"Produção acadêmica leve", n:"Reabrir o artigo, uma ideia, um parágrafo", painel:"leituras"},
       {id:"seg-toefl", processo:"toefl", tag:"pulverizado"}
     ], uber:"Cowork quando der, nas duas janelas (~6–7h e ~14h30)"},
  2:{nome:"Terça", eixo:"Internacionalização — produção", anchors:[],
     tasks:[
       {id:"ter-art", t:"Artigo: escrever e expandir", n:"Bloco principal do dia. Aumentar páginas do recorte ativo", painel:"pipeline", ctx:"computador"},
       {id:"ter-phd", t:"PhD no exterior", n:"Alvos por polo, SOP, writing sample, cartas, contato com docentes", link:"candidatura"},
       {id:"ter-pos", t:"Pós-doutorado", n:"FAPERJ (janela de dezembro a janeiro), FAPESP e exterior", link:"posdoc"},
       {id:"ter-toefl", processo:"toefl", tag:"pulverizado"}
     ], uber:"Cowork quando der. Na fase de sprint: Momento 1 da EBD aqui"},
  3:{nome:"Quarta", eixo:"Preparo Joel de Oliveira", anchors:[],
     tasks:[
       {id:"qua-aula", t:"Preparar aulas", n:"O preparo de quinta já cobre a sexta (as duas turmas são 3º ano)", tag:"exclusivo", ctx:"computador"},
       {id:"qua-aval", t:"Preparar e revisar avaliações", n:"Correções, provas, o que vence na semana", ctx:"computador"},
       {id:"qua-outras", t:"Revisar EM1 / EM2 se houver", n:"Só o que a semana pedir"},
       {id:"qua-toefl", processo:"toefl", tag:"pulverizado"}
     ], uber:"Cowork quando der."},
  4:{nome:"Quinta", eixo:"Aula no Joel de Oliveira",
     anchors:[{t:"7h–14h30", n:"Aula no C.E. Prof. Joel de Oliveira"}],
     tasks:[
       {id:"qui-rec", t:"Livre a partir das 16h", n:"Uber da tarde, descanso ou uma tarefa leve já definida"},
       {id:"qui-toefl", processo:"toefl", tag:"pulverizado"}
     ], uber:"Só à tarde/noite (a manhã é aula). Cowork curto"},
  5:{nome:"Sexta", eixo:"Aula + escrita acadêmica",
     anchors:[{t:"7h–10h30", n:"Aula no Joel (3º ano) — preparada na quarta"}],
     tasks:[
       {id:"sex-esc", t:"Escrita acadêmica", n:"Na janela livre 11h30–15h00. O artigo é o dono do dia até sair", tag:"âncora", painel:"pipeline", ctx:"computador"},
       {id:"sex-toefl", processo:"toefl", tag:"pulverizado"}
     ], uber:"Depois das 15h. Cowork quando der"},
  6:{nome:"Sábado", eixo:"Consolidação, pós-doc & técnico", anchors:[], tecnico:true,
     tasks:[
       {id:"sab-agentes", t:"Processar o que os agentes trouxeram", n:"Chamadas de publicação, vagas de pós-doc e concursos da semana", link:"concursos"},
       {id:"sab-consol", t:"Consolidar a semana", n:"O que andou, o que fica para a próxima", painel:"pipeline"},
       {id:"sab-tec", t:"Bloco técnico", n:"Dar andamento a 1 projeto: Sites, Canais dark, Ordo App, Workshop", link:"tecnico", ctx:"computador"}
     ], uber:"Cowork quando der, nas duas janelas"},
  0:{nome:"Domingo", eixo:"EBD, igreja & descanso",
     anchors:[{t:"9h00", n:"Escola Bíblica Dominical — IBFC"}],
     tasks:[
       {id:"dom-igreja", t:"Igreja", n:"Culto, ministério, presença"},
       {id:"dom-desc", t:"Descanso", n:"Domingo já traz a revisão da semana; aqui é só descanso."}
     ], uber:"Descanso. Sem Uber, sem TOEFL"}
};
const ORDEM_SEMANA = [1,2,3,4,5,6,0];
const EVENTOS_DEFAULT = [{id:"e1", t:"Projeto Acolher — evento de casais", data:"2026-08-22"},{id:"e-toefl", t:"Prova TOEFL", data:"2026-11-30"}];
const METAS_DEFAULT = [
  {id:"m1", t:"Artigo \"Patriotismo Cristão\": ajustar e expandir páginas", done:false},
  {id:"m2", t:"Pós-doc: enviar 1 candidatura", done:false},
  {id:"m3", t:"Construir o agente de chamadas de publicação", done:false},
  {id:"m4", t:"Construir o agente de vagas e concursos", done:false},
  {id:"m5", t:"TOEFL: completar 1 simulado no formato 2026", done:false},
  {id:"m6", t:"TOEFL: subir Reading e Writing para 24+", done:false}
];
// Bloco técnico: projetos de médio/longo prazo. Estado persiste entre dias (chave sem data).
// Cada subtarefa tem st: 0=a fazer, 1=em andamento, 2=concluída.
const TECNICO_DEFAULT = [
  {id:"p1", t:"Sites", subs:[
    {id:"s11", t:"Revisar índex principal", st:0},
    {id:"s12", t:"Revisar cronograma", st:0},
    {id:"s13", t:"Revisar Joel de Oliveira", st:0},
    {id:"s14", t:"Criar novos", st:0}
  ]},
  {id:"p2", t:"Canais dark (YouTube)", subs:[
    {id:"s21", t:"Definir linha editorial do Canal 1", st:0},
    {id:"s22", t:"Primeiro roteiro-piloto", st:0}
  ]},
  {id:"p3", t:"Ordo App", subs:[
    {id:"s31", t:"Liberar espaço em disco (~15–20 GB livres)", st:0},
    {id:"s32", t:"Instalar ferramentas base (Node.js + pnpm) e criar a pasta", st:0},
    {id:"s33", t:"Criar contas gratuitas (GitHub, Supabase, Vercel)", st:0},
    {id:"s34", t:"Montar o esqueleto (Next.js) e publicar \"olá mundo\" no ar", st:0},
    {id:"s35", t:"Criar o banco de dados com isolamento (RLS)", st:0},
    {id:"s36", t:"Login e cadastro de instituto (multi-tenant)", st:0},
    {id:"s37", t:"Configurações do instituto (critérios ajustáveis)", st:0},
    {id:"s38", t:"Cadastros — alunos, disciplinas, professores", st:0},
    {id:"s39", t:"Presença — link público + registro", st:0},
    {id:"s3a", t:"Fechar aula e consolidar frequência", st:0},
    {id:"s3b", t:"Notas e situação/resultado final", st:0},
    {id:"s3c", t:"Arquivar disciplina e histórico do aluno", st:0},
    {id:"s3d", t:"Dashboard", st:0},
    {id:"s3e", t:"Testar de ponta a ponta simulando um instituto real", st:0}
  ]},
  {id:"p4", t:"Workshop (estudos bíblicos com IA)", subs:[
    {id:"s41", t:"Definir plataforma (pagamento + Meet + Forms)", st:0},
    {id:"s42", t:"Escrever texto de divulgação", st:0},
    {id:"s43", t:"Montar kit de prompts (PDF 1 página)", st:0},
    {id:"s44", t:"Montar checklist de verificação doutrinária", st:0},
    {id:"s45", t:"Montar folha do aluno", st:0},
    {id:"s46", t:"Definir data e abrir inscrições (turma piloto)", st:0}
  ]}
];
const PIPELINE_DEFAULT = [
  {id:"a01", t:"Ago · A consciência em Lutero e Spinoza", mes:"2026-08", n:"JAAR ou MTSR. Writing sample do Polo B. Obriga Asad, Mahmood, Sullivan e Hurd.", subs:[
    {id:"a01-1", t:"Tese em 1 parágrafo + periódico-alvo", st:0},
    {id:"a01-2", t:"Bibliografia (3 primárias · 3 comentadores × 2 · 6 temáticas)", st:0},
    {id:"a01-3", t:"Janela 1 · argumento e estrutura de seções", st:0},
    {id:"a01-4", t:"Janelas 2 e 3 · redação", st:0},
    {id:"a01-5", t:"Revisão de estilo + ABNT NBR 10520", st:0},
    {id:"a01-6", t:"Pronto para submeter", st:0}
  ]},
  {id:"a02", t:"Set · A categoria de \"religião\" e a primeira modernidade", mes:"2026-09", n:"MTSR ou Numen (Brill). Spinoza e Hobbes. Obriga Nongbri, Masuzawa, Harrison e J. Z. Smith.", subs:[
    {id:"a02-1", t:"Tese em 1 parágrafo + periódico-alvo", st:0},
    {id:"a02-2", t:"Bibliografia (3 primárias · 3 comentadores × 2 · 6 temáticas)", st:0},
    {id:"a02-3", t:"Janela 1 · argumento e estrutura de seções", st:0},
    {id:"a02-4", t:"Janelas 2 e 3 · redação", st:0},
    {id:"a02-5", t:"Revisão de estilo + ABNT NBR 10520", st:0},
    {id:"a02-6", t:"Pronto para submeter", st:0}
  ]},
  {id:"a03", t:"Out · A genealogia do secular e a Reforma", mes:"2026-10", n:"Religion ou JAAR. Taylor lido a partir de Lutero. Obriga Taylor e Casanova.", subs:[
    {id:"a03-1", t:"Tese em 1 parágrafo + periódico-alvo", st:0},
    {id:"a03-2", t:"Bibliografia (3 primárias · 3 comentadores × 2 · 6 temáticas)", st:0},
    {id:"a03-3", t:"Janela 1 · argumento e estrutura de seções", st:0},
    {id:"a03-4", t:"Janelas 2 e 3 · redação", st:0},
    {id:"a03-5", t:"Revisão de estilo + ABNT NBR 10520", st:0},
    {id:"a03-6", t:"Pronto para submeter", st:0}
  ]},
  {id:"a04", t:"Nov · O método exegético em Lutero", mes:"2026-11", n:"MTSR ou Síntese. Mês do TOEFL e das submissões: peça sem leitura nova. Também é carta de entrevista.", subs:[
    {id:"a04-1", t:"Tese em 1 parágrafo + periódico-alvo", st:0},
    {id:"a04-2", t:"Bibliografia (3 primárias · 3 comentadores × 2 · 6 temáticas)", st:0},
    {id:"a04-3", t:"Janela 1 · argumento e estrutura de seções", st:0},
    {id:"a04-4", t:"Janelas 2 e 3 · redação", st:0},
    {id:"a04-5", t:"Revisão de estilo + ABNT NBR 10520", st:0},
    {id:"a04-6", t:"Pronto para submeter", st:0}
  ]},
  {id:"a05", t:"Dez · Interpretação bíblica em Lutero e Spinoza", mes:"2026-12", n:"Religion ou Journal of Early Modern Studies. Obriga Sheehan.", subs:[
    {id:"a05-1", t:"Tese em 1 parágrafo + periódico-alvo", st:0},
    {id:"a05-2", t:"Bibliografia (3 primárias · 3 comentadores × 2 · 6 temáticas)", st:0},
    {id:"a05-3", t:"Janela 1 · argumento e estrutura de seções", st:0},
    {id:"a05-4", t:"Janelas 2 e 3 · redação", st:0},
    {id:"a05-5", t:"Revisão de estilo + ABNT NBR 10520", st:0},
    {id:"a05-6", t:"Pronto para submeter", st:0}
  ]},
  {id:"a06", t:"Jan · Tolerância e libertas philosophandi", mes:"2027-01", n:"JAAR ou Intellectual History Review. Crítica da liberdade religiosa.", subs:[
    {id:"a06-1", t:"Tese em 1 parágrafo + periódico-alvo", st:0},
    {id:"a06-2", t:"Bibliografia (3 primárias · 3 comentadores × 2 · 6 temáticas)", st:0},
    {id:"a06-3", t:"Janela 1 · argumento e estrutura de seções", st:0},
    {id:"a06-4", t:"Janelas 2 e 3 · redação", st:0},
    {id:"a06-5", t:"Revisão de estilo + ABNT NBR 10520", st:0},
    {id:"a06-6", t:"Pronto para submeter", st:0}
  ]},
  {id:"a07", t:"Fev · Spinoza, eco do luteranismo?", mes:"2027-02", n:"JAAR ou Kriterion. Em chave genealogica, não de influência. Schmitt, Blumenberg e Löwith.", subs:[
    {id:"a07-1", t:"Tese em 1 parágrafo + periódico-alvo", st:0},
    {id:"a07-2", t:"Bibliografia (3 primárias · 3 comentadores × 2 · 6 temáticas)", st:0},
    {id:"a07-3", t:"Janela 1 · argumento e estrutura de seções", st:0},
    {id:"a07-4", t:"Janelas 2 e 3 · redação", st:0},
    {id:"a07-5", t:"Revisão de estilo + ABNT NBR 10520", st:0},
    {id:"a07-6", t:"Pronto para submeter", st:0}
  ]},
  {id:"a08", t:"Mar · Aspectos ético-políticos do comentário aos Gálatas", mes:"2027-03", n:"Journal of Religious Ethics. Herdt, Stout e Schweiker. Embrião do pós-doc. Absorve \"a questão ética no luteranismo\".", subs:[
    {id:"a08-1", t:"Tese em 1 parágrafo + periódico-alvo", st:0},
    {id:"a08-2", t:"Bibliografia (3 primárias · 3 comentadores × 2 · 6 temáticas)", st:0},
    {id:"a08-3", t:"Janela 1 · argumento e estrutura de seções", st:0},
    {id:"a08-4", t:"Janelas 2 e 3 · redação", st:0},
    {id:"a08-5", t:"Revisão de estilo + ABNT NBR 10520", st:0},
    {id:"a08-6", t:"Pronto para submeter", st:0}
  ]},
  {id:"a09", t:"Abr · A teologia da glória como crítica da ideologia", mes:"2027-04", n:"Numen ou International Journal of Public Theology. Dobradinha com o ensaio Berggruen, que está nas metas do mês.", subs:[
    {id:"a09-1", t:"Tese em 1 parágrafo + periódico-alvo", st:0},
    {id:"a09-2", t:"Bibliografia (3 primárias · 3 comentadores × 2 · 6 temáticas)", st:0},
    {id:"a09-3", t:"Janela 1 · argumento e estrutura de seções", st:0},
    {id:"a09-4", t:"Janelas 2 e 3 · redação", st:0},
    {id:"a09-5", t:"Revisão de estilo + ABNT NBR 10520", st:0},
    {id:"a09-6", t:"Pronto para submeter", st:0}
  ]},
  {id:"a10", t:"Mai · Ebeling: a palavra como evento e os atos de fala", mes:"2027-05", n:"Síntese ou Estudos Teológicos. Absorve a ideia de \"proclamação\".", subs:[
    {id:"a10-1", t:"Tese em 1 parágrafo + periódico-alvo", st:0},
    {id:"a10-2", t:"Bibliografia (3 primárias · 3 comentadores × 2 · 6 temáticas)", st:0},
    {id:"a10-3", t:"Janela 1 · argumento e estrutura de seções", st:0},
    {id:"a10-4", t:"Janelas 2 e 3 · redação", st:0},
    {id:"a10-5", t:"Revisão de estilo + ABNT NBR 10520", st:0},
    {id:"a10-6", t:"Pronto para submeter", st:0}
  ]},
  {id:"a11", t:"Jun · As faculdades da alma de Aristóteles em Lutero", mes:"2027-06", n:"Cadernos de Filosofia Alemã ou Analytica.", subs:[
    {id:"a11-1", t:"Tese em 1 parágrafo + periódico-alvo", st:0},
    {id:"a11-2", t:"Bibliografia (3 primárias · 3 comentadores × 2 · 6 temáticas)", st:0},
    {id:"a11-3", t:"Janela 1 · argumento e estrutura de seções", st:0},
    {id:"a11-4", t:"Janelas 2 e 3 · redação", st:0},
    {id:"a11-5", t:"Revisão de estilo + ABNT NBR 10520", st:0},
    {id:"a11-6", t:"Pronto para submeter", st:0}
  ]},
  {id:"a12", t:"Jul · Spinoza, um filósofo do processo (E1p34)", mes:"2027-07", n:"Cadernos Espinosanos ou Journal of Early Modern Studies. Absorve \"conatus e agência\".", subs:[
    {id:"a12-1", t:"Tese em 1 parágrafo + periódico-alvo", st:0},
    {id:"a12-2", t:"Bibliografia (3 primárias · 3 comentadores × 2 · 6 temáticas)", st:0},
    {id:"a12-3", t:"Janela 1 · argumento e estrutura de seções", st:0},
    {id:"a12-4", t:"Janelas 2 e 3 · redação", st:0},
    {id:"a12-5", t:"Revisão de estilo + ABNT NBR 10520", st:0},
    {id:"a12-6", t:"Pronto para submeter", st:0}
  ]}
];
const LEITURAS_DEFAULT = [
  {id:"l1", t:"A · Clássicos fundadores", n:"Leitura seletiva e boas sínteses. Servem de pano de fundo que a virada crítica problematiza.", subs:[
    {id:"l1-1", t:"Durkheim · As formas elementares da vida religiosa", st:0},
    {id:"l1-2", t:"Weber · A ética protestante; Sociologia da religião (ponte natural)", st:0},
    {id:"l1-3", t:"Otto · O sagrado", st:0},
    {id:"l1-4", t:"James · As variedades da experiência religiosa", st:0},
    {id:"l1-5", t:"Eliade · O sagrado e o profano (e por que é criticado)", st:0},
    {id:"l1-6", t:"W. C. Smith · The Meaning and End of Religion", st:0}
  ]},
  {id:"l2", t:"B · A virada crítica", n:"Prioridade máxima. Se o tempo for escasso, é aqui que ele deve ser investido.", subs:[
    {id:"l2-1", t:"J. Z. Smith · Imagining Religion; Map Is Not Territory (inegociável)", st:0},
    {id:"l2-2", t:"Asad · Genealogies of Religion + introdução de Formations (inegociável)", st:0},
    {id:"l2-3", t:"Masuzawa · The Invention of World Religions", st:0},
    {id:"l2-4", t:"Nongbri · Before Religion", st:0},
    {id:"l2-5", t:"McCutcheon · Manufacturing Religion; Critics, Not Caretakers", st:0},
    {id:"l2-6", t:"Geertz · Religion as a Cultural System (dominar o debate Geertz–Asad)", st:0}
  ]},
  {id:"l3", t:"C · O debate sobre o secular", n:"Sua ponte mais forte: é onde Lutero e Spinoza rendem de imediato.", subs:[
    {id:"l3-1", t:"Taylor · A Secular Age, ao menos introdução e partes I e V (inegociável)", st:0},
    {id:"l3-2", t:"Casanova · Public Religions in the Modern World", st:0},
    {id:"l3-3", t:"Mahmood · Politics of Piety; Religious Difference in a Secular Age", st:0},
    {id:"l3-4", t:"Harrison · The Territories of Science and Religion", st:0}
  ]},
  {id:"l4", t:"D · Ética religiosa", n:"Lar disciplinar do pós-doc. Periódico próprio: Journal of Religious Ethics.", subs:[
    {id:"l4-1", t:"Stout · Ethics After Babel; Democracy and Tradition", st:0},
    {id:"l4-2", t:"Herdt · Putting On Virtue", st:0},
    {id:"l4-3", t:"Schweiker · ética teológica comparada", st:0},
    {id:"l4-4", t:"Stalnaker · Overcoming Our Evil", st:0}
  ]},
  {id:"l5", t:"E · Correntes contemporâneas", n:"Panorama, leitura leve. Reconhecer os contornos para não soar datado.", subs:[
    {id:"l5-1", t:"Orsi · religião vivida", st:0},
    {id:"l5-2", t:"Morgan · cultura material e visual da religião", st:0},
    {id:"l5-3", t:"Boyer · Religion Explained", st:0},
    {id:"l5-4", t:"Chidester e Richard King · crítica pós-colonial do campo", st:0},
    {id:"l5-5", t:"Douglas e Turner · vocabulário ritual básico", st:0}
  ]},
  {id:"l6", t:"F · Infraestrutura e periódicos", n:"Contínuo e em paralelo a tudo.", subs:[
    {id:"l6-1", t:"Guide to the Study of Religion (Braun e McCutcheon)", st:0},
    {id:"l6-2", t:"Critical Terms for Religious Studies (Mark C. Taylor)", st:0},
    {id:"l6-3", t:"Sharpe · Comparative Religion: A History", st:0},
    {id:"l6-4", t:"Acompanhar sumários e resenhas: JAAR, MTSR, Religion e JRE", st:0}
  ]}
];
const CANDIDATURA_DEFAULT = [
  {id:"c1", t:"Alvos e fit", n:"A decisão não é do comitê, é dos docentes da área. Fit é correspondência concreta, não retórica.", subs:[
    {id:"c1-1", t:"Montar lista de 5 a 8 alvos, marcando cada um como Polo A ou Polo B", st:0},
    {id:"c1-2", t:"Identificar a área ou subcampo correto em cada programa", st:0},
    {id:"c1-3", t:"Listar 2 a 4 docentes por área e ler 2 a 3 textos recentes de cada", st:0},
    {id:"c1-4", t:"Identificar o tema transversal que clica com vários docentes ao mesmo tempo", st:0}
  ]},
  {id:"c2", t:"Statement of Purpose", n:"Documento decisivo. Coerência entre biografia e interesse acadêmico, com pergunta fresh.", subs:[
    {id:"c2-1", t:"Reduzir a uma pergunta central nítida, no primeiro terço da carta", st:0},
    {id:"c2-2", t:"Reforçar o enquadramento \"expansão, não repetição\"", st:0},
    {id:"c2-3", t:"Garantir what + why para cada docente citado", st:0},
    {id:"c2-4", t:"Decidir o caso Whitford (ler o livro ou rebaixar a menção)", st:0},
    {id:"c2-5", t:"Derivar a segunda versão da SOP para o Polo B, mais analítica", st:0}
  ]},
  {id:"c3", t:"Writing sample", n:"Quase tão decisivo quanto a SOP. Precisa tratar do mesmo tema da carta.", subs:[
    {id:"c3-1", t:"Polo A: Christian Patriotism from Luther (coerente com a SOP da Baylor)", st:0},
    {id:"c3-2", t:"Polo B: A consciência em Lutero e Spinoza (peça de agosto na esteira)", st:0},
    {id:"c3-3", t:"Revisão profissional nativa de inglês (eliminário na prática)", st:0}
  ]},
  {id:"c4", t:"Cartas de recomendação", n:"De quem pode avaliar capacidade de pesquisa, não vocação ministerial.", subs:[
    {id:"c4-1", t:"Solicitar a Christine Helmer com antecedência (recomendante-chave)", st:0},
    {id:"c4-2", t:"Selecionar mais 2 que atestem pesquisa (UFRJ e UERJ)", st:0},
    {id:"c4-3", t:"Evitar que o conjunto dependa de cartas eclesiásticas", st:0}
  ]},
  {id:"c5", t:"Contato prévio", n:"É você, candidato, quem toma a iniciativa de escrever.", subs:[
    {id:"c5-1", t:"Escrever a docentes-alvo mencionando o vínculo com Helmer e o Logic & Luther", st:0},
    {id:"c5-2", t:"Avaliar visita a campus onde for viável", st:0}
  ]},
  {id:"c6", t:"Itens formais", n:"Confirmar programa a programa. Nada aqui é genérico.", subs:[
    {id:"c6-1", t:"Confirmar exigência e nota mínima de TOEFL por programa", st:0},
    {id:"c6-2", t:"Verificar CV, transcripts, número de cartas e taxas em cada portal", st:0},
    {id:"c6-3", t:"Revisão profissional final de todos os textos submetidos", st:0}
  ]},
  {id:"c7", t:"Entrevista", n:"Três perguntas já pegaram você na Baylor. Falta formulação ensaiada, não conteúdo.", subs:[
    {id:"c7-1", t:"Ensaiar em inglês a defesa do segundo doutorado, com a versão de uma frase", st:0},
    {id:"c7-2", t:"Preparar 2 a 3 leituras para discutir a fundo (Asad ou Taylor; Chaves; Yadav)", st:0},
    {id:"c7-3", t:"Formular o programa coerente que reúne artigo, pós-doc e Lutero–Spinoza", st:0},
    {id:"c7-4", t:"Preparar 2 a 3 perguntas para fazer aos entrevistadores", st:0}
  ]}
];
const CONCURSOS_DEFAULT = [
  {id:"k1", t:"Provas", n:"Prontidão contínua, não calendário: os editais surgem em datas imprevisíveis.", subs:[
    {id:"k1-1", t:"Treinar dissertação cronometrada de 4h (a escrita é o portão eliminatório)", st:0},
    {id:"k1-2", t:"Montar 3 a 4 aulas de 50 a 60 min nas subareas (didática, peso 3)", st:0},
    {id:"k1-3", t:"Preparar a arguição: defender memorial e plano de trabalho", st:0}
  ]},
  {id:"k2", t:"Documentação", n:"Títulos têm peso 3, e a produção dos últimos 8 anos tem peso 4, o mais alto do edital.", subs:[
    {id:"k2-1", t:"Montar memorial em PDF único (o edital não aceita links alteráveis)", st:0},
    {id:"k2-2", t:"Organizar a documentação integral de títulos", st:0},
    {id:"k2-3", t:"Documentar vínculos a grupos e eventos (Colóquio UERJ; Leibniz e Spinoza UFRJ)", st:0}
  ]},
  {id:"k3", t:"Plano de trabalho", n:"O conteúdo muda a cada edital; o que se reaproveita é a estrutura.", subs:[
    {id:"k3-1", t:"Montar a versão-base, seções 2 a 5", st:0},
    {id:"k3-2", t:"Deixar a seção 1 e as ementas para re-sintonizar por edital", st:0},
    {id:"k3-3", t:"Enviar o modelo detalhado para refinar o template", st:0}
  ]},
  {id:"k4", t:"Livro da tese", n:"O edital pontua livros e capítulos, e a tese já é a matéria-prima.", subs:[
    {id:"k4-1", t:"Avaliar a conversão da tese em livro", st:0},
    {id:"k4-2", t:"Definir editora e prazo", st:0}
  ]}
];
const POSDOC_DEFAULT = [
  {id:"pd1", t:"FAPERJ · Pós-doutorado Nota 10 (PDR-10)", n:"Via principal. Chamada anual: em 2025 o lançamento foi em 10/12, com submissão até 19/01/26 e resultado final a partir de 21/05/26. Bolsa de R$ 6.500 mais R$ 1.000 de bancada, 12 meses renováveis. Seu vínculo temporário na SEEDUC está entre as exceções do edital, e os dois artigos publicados como primeiro autor cumprem a elegibilidade.", subs:[
    {id:"pd1-1", t:"Conferir o edital novo quando sair (dezembro): datas e limite de titulação", st:0},
    {id:"pd1-2", t:"Identificar supervisor elegível: vínculo no RJ, PPG conceito 4 a 7, e PQ 1, 2 ou Sênior do CNPq ou Cientista do Nosso Estado", st:0},
    {id:"pd1-3", t:"Fechar acordo com o supervisor (é ele quem submete no SisFAPERJ)", st:0},
    {id:"pd1-4", t:"Separar os dois artigos de primeiro autor e anotar os DOI", st:0},
    {id:"pd1-5", t:"Atualizar o Lattes (a avaliação cobre os últimos 5 anos)", st:0},
    {id:"pd1-6", t:"Redigir o projeto no formato do edital: resumo, abstract, introdução, justificativa, objetivos, método, resultados esperados, bibliografia", st:0},
    {id:"pd1-7", t:"Carta de anuência do coordenador do PPG", st:0},
    {id:"pd1-8", t:"Termo de anuência do dirigente máximo da instituição (Anexo 4)", st:0},
    {id:"pd1-9", t:"Declaração de responsabilidade (Anexo 3), marcando o vínculo docente temporário", st:0},
    {id:"pd1-10", t:"Cadastro no SisFAPERJ atualizado", st:0},
    {id:"pd1-11", t:"Ata de defesa ou diploma digitalizado", st:0},
    {id:"pd1-12", t:"Submeter dentro da janela", st:0}
  ]},
  {id:"pd2", t:"FAPESP · Bolsa de Pós-Doutorado (condicional)", n:"Fluxo contínuo o ano todo, análise de cerca de 75 dias. Mas a bolsa exige dedicação exclusiva sem vínculo empregatício, e supervisor e instituição sede em São Paulo. Só é viável com licença e mudança de estado. Decida a viabilidade antes de escrever qualquer coisa.", subs:[
    {id:"pd2-1", t:"Decidir se licença e mudança de estado são viáveis (porta de entrada)", st:0},
    {id:"pd2-2", t:"Identificar supervisor com vínculo empregatício em instituição de São Paulo", st:0},
    {id:"pd2-3", t:"Escolher grupo distinto do da UFRJ (conta como prioridade no desempate)", st:0},
    {id:"pd2-4", t:"Súmula curricular no modelo FAPESP", st:0},
    {id:"pd2-5", t:"Histórico escolar oficial do doutorado", st:0},
    {id:"pd2-6", t:"Plano de Gestão de Dados (até 2 páginas)", st:0},
    {id:"pd2-7", t:"Plano de desenvolvimento do pós-doutorado (modelo do SAGe)", st:0},
    {id:"pd2-8", t:"Prever estágio BEPE no exterior (quesito positivo; casa com Helmer)", st:0},
    {id:"pd2-9", t:"Cadastro no SAGe atualizado", st:0}
  ]},
  {id:"pd3", t:"Pós-doc no exterior", n:"Cresce do embrião de Gálatas, que é a peça de março de 2027 na esteira. Escreve-se o projeto uma vez e ele serve aos dois lados.", subs:[
    {id:"pd3-1", t:"Extrair o projeto do artigo de Gálatas (amor, lei e justiça)", st:0},
    {id:"pd3-2", t:"Mapear programas e supervisores em religious ethics", st:0},
    {id:"pd3-3", t:"Alinhar aos interlocutores: Herdt, Stout e Schweiker", st:0},
    {id:"pd3-4", t:"Confirmar o Journal of Religious Ethics como veículo do artigo", st:0}
  ]},
  {id:"pd4", t:"Documentos comuns", n:"Servem aos três caminhos e também ao memorial de concurso.", subs:[
    {id:"pd4-1", t:"Lattes atualizado e revisado", st:0},
    {id:"pd4-2", t:"Currículo em inglês", st:0},
    {id:"pd4-3", t:"Ata de defesa e diploma digitalizados", st:0},
    {id:"pd4-4", t:"Projeto de pesquisa em versão português e inglesa", st:0},
    {id:"pd4-5", t:"Lista de publicações com DOI", st:0}
  ]}
];
/* O `peso` entrou na Fase 3 e e A UNICA coisa que o motor de prioridades nao
   conseguiu deduzir do dado que ja existia.

   A auditoria de 2026-09-01 procurou importancia estrategica em todo lugar:
   nao ha campo de importancia em projeto nenhum, em painel nenhum. Ha prazo
   (so no pipeline, pelo `mes`), ha atividade (`sub.em`), ha ciclo de vida
   (`vida`), ha travamento por decisao do autor (`prova: "estrela"`) — e nada
   sobre o que importa mais.

   Em vez de criar uma segunda base de dados, uma palavra por painel, aqui, na
   mesma constante que ja define os paineis. E declarativo, cabe na tela, e e o
   unico botao que voce precisa girar se discordar do que o motor sugere.

   ALTO   o que decide os proximos dois anos: sair do pais, o pos-doc, e a
          esteira de artigos, que e o que sustenta os dois.
   MEDIO  o que precisa estar pronto quando a janela abrir.
   BAIXO  o que pode esperar sem que nada se perca.

   O peso NAO e o unico caminho para uma sugestao: um projeto de painel medio
   ou baixo continua podendo aparecer por prazo, por decisao travada ou por
   inatividade. O peso decide a classe ESTRATEGICO e desempata o resto. */
const PAINEIS = [
  {id:"pipeline",   key:"cron:pipeline",   titulo:"Esteira de artigos",   sub:"12 peças · ago/26 a jul/27", seed:PIPELINE_DEFAULT,   aberto:true,  peso:"alto"},
  {id:"leituras",   key:"cron:leituras",   titulo:"Leituras · religious studies", sub:"mapa do campo", seed:LEITURAS_DEFAULT,   aberto:false, peso:"medio"},
  {id:"candidatura",key:"cron:candidatura",titulo:"Doutorado no exterior (PhD)", sub:"dossê, cartas e entrevista", seed:CANDIDATURA_DEFAULT, aberto:false, peso:"alto"},
  {id:"posdoc",     key:"cron:posdoc",     titulo:"Pós-doutorado",       sub:"FAPERJ, FAPESP e exterior", seed:POSDOC_DEFAULT, aberto:false, peso:"alto"},
  {id:"concursos",  key:"cron:concursos",  titulo:"Concursos no Brasil",  sub:"prontidão contínua", seed:CONCURSOS_DEFAULT,  aberto:false, peso:"medio"},
  {id:"tecnico",    key:"cron:tecnico",    titulo:"Bloco técnico",       sub:"projetos", seed:TECNICO_DEFAULT,    aberto:false, peso:"baixo"}
];
const SCHEMA_VERSAO = 2;
const REG_TETO = 600;
const VIDA_ORDEM = ["ativo","adiado","abandonado"];
const VIDA_LBL = {ativo:"", adiado:"adiada", abandonado:"abandonada", arquivada:"arquivada",
                  arquivado:"arquivada", inaplicavel:"n\u00e3o se aplica"};
/* "inaplicavel" NAO entra em VIDA_ORDEM de proposito: e estado que so chega pela
   entrada (cron:entrada), nunca por toque. Existe para a peca que nasce de um
   texto ja escrito, onde etapas do pipeline (brainstorm, mapa argumentativo) nao
   tem o que fazer. Nao e "abandonada": ninguem abandonou nada, a etapa e que nao
   cabe. Um item inaplicavel sai da conta de progresso e nao vira "proxima etapa". */
const ATRASO_DIAS = 7;
const ATRASO_KEY = "cron:hoje-dispensados";
/* A chave de dispensa so precisa viver os sete dias da janela: passado isso o
   item ja saiu por conta propria e a marca vira lixo. Podar na escrita evita
   que o mapa cresca para sempre por causa de um bloco cujo proposito e
   justamente esquecer. */
const CHK='<svg viewBox="0 0 24 24"><polyline points="4 12 10 18 20 6"/></svg>';
/* Plano TOEFL — as datas do desenho original. NAO SAO MAIS GATILHO.
   Ate 30/08 elas decidiam a fase: passou de 17/08, voce estava na Fase 2,
   tivesse feito o diagnostico ou nao. Isso mentia nos dois sentidos —
   empurrava para a frente quem estava atrasado e nao servia para nada de
   quem estava adiantado. Agora quem decide a fase e o NUCLEO cumprido, e
   estas datas viram AVISO: "o calendario original previa X desde Y". */
const TOEFL_PLANO = {
  inicio: "2026-07-20",   // começo do preparo
  fase2:  "2026-08-17",   // o calendário original punha a Fase 2 aqui
  fase3:  "2026-10-26",   // o calendário original punha a Fase 3 aqui
  prova:  "2026-11-30"    // dia da prova — esta continua sendo uma data dura
};
/* ============== O QUE O TOEFL MANDA FAZER EM CADA DIA — Fase 4 ==============
   OS CINCO TEXTOS ABAIXO SAO OS QUE JA EXISTIAM, LETRA POR LETRA. Eles moravam
   dentro do DIAS, um em cada dia da semana, e foram MOVIDOS para ca — nao
   reescritos. Nenhuma palavra de conteudo pedagogico mudou nesta fase.

   POR QUE MUDARAM DE ENDERECO: a separacao da Fase 4 e que PROCESSOS guarda a
   estrutura e HOJE executa. Enquanto o texto da tarefa morava no DIAS, o Hoje
   sabia sozinho o que o TOEFL faz na terca — ou seja, a rotina carregava uma
   decisao que e do processo. Agora o Hoje PERGUNTA, e o processo responde.
   Sem isto, mover o guia de aba teria sido mudar HTML de lugar.

   A COMPETENCIA E DO DIA DA SEMANA, e nao da fase. Tornar a acao sensivel a
   fase (simulado na Fase 3, fundamentos na Fase 1) seria conteudo novo, e a
   Fase 4 nao inventa conteudo. Fica registrado como possibilidade, nao como
   promessa. */
const TOEFL_SEMANA = {
  1:{comp:"Reading",
     t:"TOEFL · Reading: exercício + revisão dos erros",
     n:"TestReady, seção Reading Practice. Fazer o exercício e revisar cada erro. ~20 min"},
  2:{comp:"Listening",
     t:"TOEFL · Listening: prática + 4 quadrantes",
     n:"TestReady, seção Listening Practice, com o método dos 4 quadrantes. ~20 min"},
  3:{comp:"Vocabulário",
     t:"TOEFL · Vocabulário (Anki) + shadowing",
     n:"Baralho Academic Word List no Anki, depois shadowing de um áudio em inglês. ~15 min"},
  4:{comp:"Writing",
     t:"TOEFL · Writing: um texto completo",
     n:"TestReady, seção Writing Practice, alternando Write an Email e Academic Discussion. ~20 min"},
  5:{comp:"Speaking",
     t:"TOEFL · Speaking (PREP) ou 1 simulado",
     n:"TestReady, seção Speaking Practice, esqueleto PREP. A cada 2–3 semanas, troque por um simulado completo no Magoosh. ~30 min"},
  6:null,   /* sabado e domingo o plano nao pede TOEFL, e isso e do plano: */
  0:null    /* "Descanso. Sem Uber, sem TOEFL". */
};

/* ================== D0: A ESTREIA DO PLANO — Fase 9A ==================
   A DATA EM QUE O TOEFL PASSA A PEDIR ALGO. Antes dela o processo nao pede
   nada, as cinco rotinas nao aparecem no Hoje e o aviso do calendario cala.

   O QUE ELA NAO E. Ela NAO remapeia o plano. TOEFL_SEMANA e indexada por DIA
   DA SEMANA, nao por posicao numa sequencia — segunda e Reading com D0 aqui ou
   tres semanas adiante. Nao ha o que deslocar, e por isso esta constante nao
   toca em uma linha do plano. Ela serve a duas coisas so: dizer a partir de
   quando o painel cobra, e dar as metricas um marco de onde comecar a contar.

   POR QUE E UMA CONSTANTE ESCRITA A MAO, e nao derivada da "entrada em
   producao". Derivar exigiria gravar a data no primeiro carregamento, e isso e
   local por aparelho: o Mac aberto numa quarta e o iPhone aberto no sabado
   calculariam segundas diferentes, e como o registro de estudo atravessa
   aparelhos as metricas passariam a discordar. Uma constante e uma verdade so.
   E a casa ja faz assim — MES_INICIO, ACERVO_EM, TEC_SEED, METAS_SEED.

   PODE ESTAR NO PASSADO. D0 nao e prazo de entrega: se o painel ficar pronto
   depois, a semana simplesmente aparece em curso. Nao ha divida a saldar. */
const TOEFL_D0 = "2026-09-07";   /* segunda-feira */

/* ================== PARA ONDE O BOTAO LEVA — Fase 9A ==================
   A TABELA DE ROTEAMENTO, e so isso. Ela responde "onde eu clico", que e a
   unica coisa que o plano nao diz por dia: os `links` do TOEFL_GUIA sao por
   FASE, e o `n` de cada dia nomeia o recurso em prosa ("TestReady, secao
   Listening Practice") sem endereco.

   O QUE E DECLARADO AQUI E O QUE E DERIVADO DO PLANO. Declarado: o rotulo do
   recurso e a URL. Derivado: a duracao, que sai do proprio texto do plano pelo
   "~NN min" que ja esta la (ver toeflMinutos, em 20-regras.js). Repetir o
   numero aqui criaria dois lugares dizendo quanto dura a terca.

   OS ROTULOS SAO RESTATEMENT, NAO CONTEUDO NOVO: cada um repete o que o `n`
   daquele dia ja nomeia. Nenhuma atividade, habilidade, ordem ou duracao foi
   inventada nesta fase.

   QUARTA NAO TEM URL, DE PROPOSITO. O Anki e aplicativo, nao pagina, e o plano
   nao define endereco para ele. Sem URL o painel mostra a instrucao e nao
   desenha botao de abrir — inventar um endereco seria inventar plano. Se um
   dia um esquema `anki://` for adotado, e uma linha aqui e nada mais. */
const TOEFL_RECURSO = {
  1:{rec:"TestReady · Reading Practice",   url:"https://testready.ets.org"},
  2:{rec:"TestReady · Listening Practice", url:"https://testready.ets.org"},
  3:{rec:"Anki · baralho Academic Word List", url:""},
  4:{rec:"TestReady · Writing Practice",   url:"https://testready.ets.org"},
  5:{rec:"TestReady · Speaking Practice",  url:"https://testready.ets.org"}
};

/* ================== O REGISTRO DE ESTUDO — Fase 9B ==================
   ACONTECIMENTOS, E NAO CONTADORES. O armazem guarda um registro por vez que
   voce estudou; "4 contatos nesta semana" e derivado deles a cada desenho.
   Guardar o numero em vez do fato daria uma tela que ninguem consegue auditar:
   4 contatos vindos de onde?

   A CHAVE E `<data>/<aparelho>/<n>`, e as tres partes tem funcao. A DATA porque
   a pergunta que o sistema faz e sempre sobre um dia. O APARELHO porque na 9C
   isto atravessa, e dois aparelhos que registrassem o primeiro estudo do mesmo
   dia produziriam a mesma chave — um apagaria o outro na dobra, em silencio.
   O `n` porque o dia pode ter mais de um registro: comecei, e depois continuei.

   NAO E `cron:checks:`. Aquilo marca a OCORRENCIA de uma rotina numa data, e
   e local por decisao; isto e a execucao do estudo, com duracao e habilidade,
   e na 9C vai atravessar aparelhos. Sao fatos diferentes, e o commit que os
   misturasse tornaria impossivel separa-los depois. */
const TOEFL_ESTUDO_KEY = "cron:toefl-estudo";
/* O PISO DO CONTATO. Nao e uma atividade curta inventada: e quanto da atividade
   PREVISTA basta para o dia contar. O plano manda 20 minutos de Listening; isto
   diz que comecar ja vale. */
const TOEFL_CONTATO_MIN = 10;
/* Sem cronometro nesta versao, por decisao: sessao aberta, app fechado no meio
   e recuperacao de estado sao a peca mais cara do desenho e a que menos entrega.
   Duracoes conhecidas resolvem o mesmo com um toque. A lista cobre os numeros
   que o proprio plano usa — 15, 20 e 30 — mais o piso e as extensoes. */
const TOEFL_DURACOES = [10, 15, 20, 30, 45, 60];
/* A META NAO E CONTEUDO NOVO: e o plano reenunciado. Ele tem cinco dias uteis
   com atividade e dois de descanso, entao cinco contatos por semana e exatamente
   cumprir o plano — nao um alvo por cima dele. */
const TOEFL_META_SEMANA = 5;

const TOEFL_FASES = ["f1","f2","f3"];
const TOEFL_ROTULO = {
  f1:{fase:"Fase 1 · Fundamentos", foco:"Formato 2026, diagnóstico, vocabulário, notas e templates."},
  f2:{fase:"Fase 2 · Drilagem dirigida", foco:"Reading e Writing (técnica) e firmar Listening, sempre cronometrado."},
  f3:{fase:"Fase 3 · Simulados & refino", foco:"Provas completas no formato 2026, ritmo e feedback em Speaking."}
};
const TOEFL_GUIA = {
  f1:{
    titulo:"Fase 1 · Fundamentos",
    meta:"Dominar o formato 2026, ter um template por tarefa (Speaking e Writing), um método de notas de Listening, o Anki rodando e saber quais 2 seções puxam a nota para baixo.",
    itens:[
      {id:"f1-conta", t:"Criar conta gratuita no TestReady", n:true},
      {id:"f1-sample40", t:"Fazer a experiência oficial de 40 min (formato 2026)", n:false},
      {id:"f1-rubricas", t:"Ler as rubricas de Speaking e Writing", n:false},
      {id:"f1-diagnostico", t:"Simulado-diagnóstico completo e cronometrado (anotar as 4 notas)", n:true},
      {id:"f1-anki", t:"Instalar o Anki + baralho Academic Word List", n:false},
      {id:"f1-tpl-writing", t:"Montar template de Writing: Write an Email + Academic Discussion", n:true},
      {id:"f1-notas-listening", t:"Definir o método de notas de Listening", n:true},
      {id:"f1-rot-speaking", t:"Montar roteiro de Speaking: Listen and Repeat + Take an Interview", n:false}
    ],
    links:[
      {t:"TestReady — portal oficial da ETS", u:"https://testready.ets.org"},
      {t:"Sample oficial de 40 min", u:"https://www.ets.org/toefl/test-takers/ibt/prepare/sample-test.html"},
      {t:"Simulado grátis no formato 2026 (Magoosh)", u:"https://magoosh.com/toefl/toefl-practice-test/"},
      {t:"PDF de prova 2026 (TST Prep)", u:"https://tstprep.com/articles/toefl/complete-practice-test-for-the-toefl-test/"}
    ]
  },
  f2:{
    titulo:"Fase 2 · Drilagem dirigida",
    meta:"Volume focado nas 2 seções mais fracas — as que o diagnóstico apontou. Alvo: subir Reading e Writing para 24+ e firmar Listening.",
    itens:[
      {id:"f2-reading", t:"Reading: drills cronometrados + revisar cada erro por tipo", n:true},
      {id:"f2-writing", t:"Writing: 2 tarefas por semana, cronometradas, com feedback", n:true},
      {id:"f2-listening", t:"Listening: 1 set por dia com notas ativas", n:true},
      {id:"f2-speaking", t:"Speaking: gravar e comparar com exemplares (sábado)", n:false},
      {id:"f2-simulado", t:"1 simulado a cada 2–3 semanas", n:true},
      {id:"f2-anki", t:"Anki diário", n:false}
    ],
    links:[
      {t:"TestReady — Section Practice (feedback + exemplos)", u:"https://testready.ets.org"},
      {t:"Simulado grátis 2026 (Magoosh)", u:"https://magoosh.com/toefl/toefl-practice-test/"},
      {t:"Estratégias por seção (TST Prep)", u:"https://tstprep.com/articles/toefl/complete-practice-test-for-the-toefl-test/"}
    ]
  },
  f3:{
    titulo:"Fase 3 · Simulados & refino",
    meta:"Provas completas, ritmo e feedback. Reserve a última semana para taper (revisão leve e descanso).",
    itens:[
      {id:"f3-simulado", t:"1 simulado completo por semana no formato 2026", n:true},
      {id:"f3-revisao", t:"Revisar cada simulado por tipo de erro", n:true},
      {id:"f3-tutor", t:"Speaking e Writing: buscar feedback externo (tutor)", n:false},
      {id:"f3-timing", t:"Fixar o timing de cada seção", n:true},
      {id:"f3-taper", t:"Semana final: revisão leve + descanso (sem simulado pesado na véspera)", n:false}
    ],
    links:[
      {t:"TestReady — provas oficiais (TPO)", u:"https://testready.ets.org"},
      {t:"Simulado grátis 2026 (Magoosh)", u:"https://magoosh.com/toefl/toefl-practice-test/"}
    ]
  }
};
/* ---- O progresso do guia atravessa aparelhos (Fase 6A) ----
   MAPA PLANO, endereçado pelo `id` do item: {iid:{feito, em}}. O `em` e o
   instante da ultima mudanca feita NESTE aparelho, e e contra ele que o
   estado.json e comparado na descida — a mesma regra de relogio dos outros
   cinco tipos, item a item.

   A chave antiga (cron:toefl-guia:<fase>) NAO e apagada: a migracao le dela
   uma vez e a deixa onde esta, como rede de segurança. */
const TOEFL_GUIA_KEY = "cron:toefl-guia";
const TOEFL_MIGRADO_KEY = "cron:toefl-migrado";
/* Piso fixo da migracao, no molde do ACERVO_EM: a marca antiga sobe com um
   instante bem no passado, para nunca vencer uma marca feita de verdade depois
   que a sincronizacao passou a existir. */
const TOEFL_EM = "2026-01-01T00:00:00.000Z";
const RECALIBRE_KEY = "cron:toefl-recalibrado";
const PROCESSOS = [
  {id:"toefl", titulo:"TOEFL",
   resumo:    function(){ return toeflFase(); },        /* fase, dias, foco */
   /* O SEGUNDO ARGUMENTO E A DATA, E ELE EXISTE PARA O TESTE (Fase 9A). Sem
      ele a resposta dependeria do relogio de parede e nenhum teste poderia
      provar os dois lados do D0. Ausente, vale hoje.

      O PLANO NAO MUDOU: quem responde continua sendo TOEFL_SEMANA[dia], letra
      por letra. O D0 so decide SE a pergunta e feita, nunca o que ela responde. */
   acaoDoDia: function(dia, hojeISO){
     if(!toeflComecou(hojeISO)) return null;
     return TOEFL_SEMANA[dia] || null;
   },
   corpo:     function(){ return renderGuia(); },
   /* As tres linhas de cabecalho SAIRAM do renderProcessos e vieram para ca,
      sem uma palavra mudada. Elas sempre foram do TOEFL — objetivo, fase e
      foco — e ficar no laco obrigaria todo processo novo a ter prova, fase e
      foco, que um artigo nao tem. */
   linhas:    function(r){
     if(!r) return "";
     return '<div class="proc-linha"><span class="pl-r">Objetivo</span>'+
           /* O ano aparece SO aqui. O fmtData do resto do app omite o ano de
              proposito — datas proximas nao precisam dele —, mas o objetivo do
              processo e a unica data dura do TOEFL, e uma prova sem ano nao e
              um objetivo. Nao e formato novo: e o mesmo fmtData com o ano
              colado, na frase em portugues. */
           '<span class="pl-v">Prova em '+fmtData(TOEFL_PLANO.prova)+
             ' de '+TOEFL_PLANO.prova.slice(0,4)+'</span></div>'+
           '<div class="proc-linha"><span class="pl-r">Fase</span>'+
           '<span class="pl-v">'+escapeHtml(r.fase)+' \u00b7 '+
             (r.falta ? r.falta+" no n\u00facleo faltando" : "n\u00facleo cumprido")+'</span></div>'+
           '<div class="proc-linha"><span class="pl-r">Foco</span>'+
           '<span class="pl-v">'+escapeHtml(r.foco)+'</span></div>';
   },
   acoes:     function(){
     return '<button class="g-acao" onclick="recalibrarToefl()">Recalibrar o que falta at\u00e9 ' +
            fmtData(TOEFL_PLANO.prova) + '</button>'; }}
];
var TRILHO_PROVA = {estrela:"depende de voc\u00ea", maquina:"pelo pipeline"};
var REVISAO_HORIZONTE = 14;   /* dias de "proxima semana" para datas e prazos */
/* ---- Metas: navegação por mês, meses novos nascem vazios ---- */
const MES_INICIO = "2026-07";
const ACERVO_EM = "2026-01-01T00:00:00.000Z";

/* FOTOGRAFIA DO QUE JA ESTA LA FORA.
   Gravada pela mesclagem a cada leitura do estado.json. Existe para o contador
   distinguir dois casos que o campo `em` sozinho nao separa:
     · esta meta tem instante porque ja foi publicada ou recebida  -> nao conta
     · esta meta tem instante mas nunca chegou ao estado.json      -> CONTA
   O segundo caso e real: um toque destruido pelo defeito do 422 (achado 1,
   corrigido em 29/08) deixava a meta com instante e sem nunca ter viajado. Sem
   esta fotografia ela ficaria encalhada em silencio, para sempre. */
const ACERVO_LA_FORA_KEY = "cron:la-fora";

/* O maior instante ja publicado dentro do mesmo dia daquele piso. Serve para
   o relogio nao reemitir um id que o estado.json ja conhece. */
const EVENTOS_NA_TELA = 5;
const ST_LBL=["A fazer","Em andamento","Concluída"];
var MOTOR_TETO_TOTAL = 3;      /* manuais + sugeridas, nunca mais que isto */
var MOTOR_TETO_SUGESTOES = 2;  /* sugestao e curta e seletiva, ou vira lista */
var MOTOR_PRAZO_DIAS = 45;     /* dentro disto o mes-alvo ja aperta */

/* A ordem E a regra. Primeira que casar vence, e nenhuma soma com a seguinte. */
var MOTOR_CLASSES = ["URGENTE", "DECISAO", "RETOMADA", "ESTRATEGICO", "EM CURSO"];
var MOTOR_PESO_ORDEM = {alto: 0, medio: 1, baixo: 2};

/* Ultimo dia do mes-alvo. O `mes` do pipeline ("2026-09") e a unica data dura
   que existe num projeto de trilho — e ela e de verdade: e o calendario da
   esteira, uma peca pronta por mes. */
var RETOMADA_DIAS = 14;
var RETOMADA_KEY = "cron:retomadas-adiadas";
/* ---- O SILENCIO ATRAVESSA APARELHOS (Fase 6B) ----
   Dispensar uma retomada era a ultima decisao sua sobre um objeto duravel que
   nao viajava: silenciar no celular e ser cobrado no Mac pelo mesmo projeto.

   A forma mudou de {chave: "AAAA-MM-DD"} para {chave: {ate, em}}. O `ate` e a
   data ate quando calar; o `em` e o instante da ultima mudanca FEITA AQUI, e e
   contra ele que o estado.json e comparado — a mesma regra de relogio dos
   outros tipos.

   O `ate` E DATA ABSOLUTA, e nao duracao, de proposito: um toque que chega tres
   dias depois carrega a data que foi decidida, e nao "+14 dias" recontados na
   chegada. Se fosse duracao, a latencia da rede mudaria o resultado.

   NAO EXISTE DESSILENCIAR, e por isso nao ha lapide: a entrada morre pela data
   que ela mesma carrega. */
var RETOMADA_MIGRADO_KEY = "cron:retomadas-migrado";
/* Piso fixo da migracao, no molde do TOEFL_EM: a silenciada antiga sobe bem no
   passado, para nunca vencer uma decisao tomada depois que isto passou a
   existir. */
var RETOMADA_EM = "2026-01-01T00:00:00.000Z";
/* A PRIORIDADE FEITA NAO E UMA MARCA DO DIA. Ate 04/09 a prioridade livre era
   marcada no `cron:checks:AAAA-MM-DD`, o mecanismo das ROTINAS — e a rotina e
   por dia de proposito: amanha e outra rotina, e quando a semana gira aquela
   volta, porque ela e uma rotina. A prioridade nao: ela e da SEMANA, mora no
   `cron:prioridades:AAAA-Wnn`, e cumprida uma vez. Guardada no cron:checks, a
   marca de ontem era procurada na chave de hoje e nao era achada: a prioridade
   cumprida reaparecia por cumprir todo dia.

   Agora a conclusao mora NA PROPRIA PRIORIDADE, no campo `feito_em` — a data
   em que voce a marcou. Nao e uma marca do dia: e um fato dela.

   Esta chave marca a mudanca de lugar, uma vez por aparelho. A migracao NAO
   publica toque: `cron:checks:` sempre foi local por decisao (ver a ressalva
   "neste aparelho" da revisao dominical), e uma marca que nunca atravessou
   aparelho nao pode passar a atravessar retroativamente. Ela so muda de
   gaveta, aqui dentro. */
var PRIO_MIGRADO_KEY = "cron:prio-feito-migrado";
const TOQUES_SCHEMA = 1;
const TOQUES_TETO = 500;
const ENVIO_ESPERA = 4000;
const RELOGIO_KEY = "cron:relogio";
/* Um relogio de aparelho errado, e depois corrigido, deixaria a marca gravada
   no futuro — e dali em diante todo toque daqui venceria todo toque do outro
   aparelho, para sempre. Passando desta folga, a marca e descartada. */
const RELOGIO_FOLGA = 86400000;   /* 24h */
/* AS BASES TAMBEM MORAM NO DISCO, e nao so em memoria.
   Ficaram em memoria ate 29/08 e isso era um furo no proprio principio deste
   relogio: recarregar a pagina zerava o contador, e a migracao seguinte sobre
   o MESMO piso regenerava os ids ja gastos pela anterior. Medido: o acervo de
   metas gastou 2026-01-01T00:00:00.000Z ate .006Z; a publicacao dos eventos,
   depois de um recarregamento, saiu com .000Z e .001Z outra vez, e a dobra
   descartou os dois como "ja vistos". Os eventos nunca teriam viajado.
   O mapa e pequeno por construcao: so ganha chave quem chama enfileirarToque
   com instante explicito, e isso e a migracao da triagem (uma vez, uma base
   por dia de marcacao) e o botao do acervo (uma base, o piso). */
const RELOGIO_BASES_KEY = "cron:relogio-bases";
const TOKEN_KEY = "sync:token";
const GH_DONO  = "profjonathansousa";
const GH_REPO  = "profjonathansousa.github.io";
const GH_RAMO  = "main";
const GH_PASTA = "Cronograma/toques";
const TOQUES_POR_ARQUIVO = "lote";   /* "lote" | "um" */

/* btoa não aceita acento. UTF-8 -> bytes -> base64 é o caminho que não corrompe
   "Prolegômenos" nem "Espírito". */
const ENVIO_TIMEOUT = 20000;
const FASE_LBL = {livre:"produção livre", ebd1:"sprint EBD · Momento 1", ebd2:"sprint EBD · Momento 2"};
const ROMANOS = ["I","II","III","IV"];
var VG_ST = {NOVO:0, SIM:1, NAO:2, ARQ:3};
var VG_LBL = {
  "pos-doc":"pós-doc", "senior":"sênior",
  "Alto":"alto", "Medio":"médio", "Baixo":"baixo",
  "Aberto":"aberto", "Restrito":"restrito",
  "Provavel c/ patrocinio":"provável c/ patrocínio",
  "dossie":"dossiê", "periodico":"periódico"
};

var VG_GRUPOS = {
  A:"Brasil — efetivo e pós-doc",
  B:"Brasil — substituto e visitante",
  C:"Internacional",
  publicacao:"Chamadas — dossiês, special issues, volumes",
  evento:"Chamadas — eventos com publicação"
};
var VG_ORDEM = ["A","B","C","publicacao","evento"];
const TEC_SEED = "2026-07-28-limpa";
const METAS_SEED = "2027-07-esteira-12";
const ROTEIRO = {
  "2026-08":["Entrega de agosto: A consciência em Lutero e Spinoza, pronta para submeter (JAAR/MTSR)"],
  "2026-09":["Entrega de setembro: A categoria de \"religião\" e a primeira modernidade, pronta para submeter (MTSR/Numen)"],
  "2026-10":["Entrega de outubro: A genealogia do secular e a Reforma, pronta para submeter (Religion/JAAR)"],
  "2026-11":["Entrega de novembro: O método exegético em Lutero, pronto para submeter (MTSR/Síntese)"],
  "2026-12":["Entrega de dezembro: Interpretação bíblica em Lutero e Spinoza, pronta para submeter (Religion/JEMS)"],
  "2027-01":["Entrega de janeiro: Tolerância e libertas philosophandi, pronta para submeter (JAAR/IHR)"],
  "2027-02":["Entrega de fevereiro: Spinoza, eco do luteranismo?, pronta para submeter (JAAR/Kriterion)"],
  "2027-03":["Entrega de março: Gálatas ético-político, pronto para submeter (Journal of Religious Ethics)"],
  "2027-04":["Entrega de abril: A teologia da glória como crítica da ideologia, pronta para submeter (Numen/IJPT)",
           "Ensaio Berggruen: escrever e submeter (meta única do mês)"],
  "2027-05":["Entrega de maio: Ebeling, a palavra como evento e os atos de fala, pronto para submeter (Síntese/Estudos Teológicos)"],
  "2027-06":["Entrega de junho: As faculdades da alma de Aristóteles em Lutero, pronto para submeter (Cad. de Filosofia Alemã/Analytica)"],
  "2027-07":["Entrega de julho: Spinoza, um filósofo do processo (E1p34), pronto para submeter (Cadernos Espinosanos/JEMS)"]
};
