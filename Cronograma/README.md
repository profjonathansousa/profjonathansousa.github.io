# Cronograma

Hub pessoal de rotina, trabalho acadêmico, projetos e oportunidades.

O objetivo **não** é uma agenda rígida. É um sistema que acompanha uma vida
dinâmica sem deixar desaparecer o que importa.

> **O usuário define o que importa. O sistema organiza, acompanha o estado,
> recupera o que ficou para trás e reduz a fricção para voltar.**

Usado principalmente pelo celular. Qualquer alteração preserva isso.

---

## A regra que organiza tudo

**O ARQUIVO DESCREVE, O APARELHO DECIDE.**

Os arquivos de dados dizem o que as coisas *são*. O que você *decidiu* mora no
aparelho e viaja por toques. Os dois eixos convivem e nunca se sobrescrevem.

```
entrada.json ──► estrutura (quais peças, quais etapas, os títulos)
                      │
                      ├──► mesclarEntrada() ──► localStorage do aparelho
                      │
estado.json  ──► progresso (st, vida, quando)
      ▲
      │  escrito SÓ por scripts/dobrar_toques.py
      │
  Cronograma/toques/  ◄── a página enfileira; nunca escreve no estado.json
```

---

## As abas

| Aba | O que é |
|---|---|
| **Hoje** | execução do dia: prioridades, rotinas, retomadas, datas, indicador de vagas |
| **Processos** | a estrutura completa dos trabalhos complexos em curso: o TOEFL e os projetos de Trilho já iniciados |
| **Trilhos** | estruturas de longo prazo: esteira de artigos, PhD, pós-doc, concursos, técnico |
| **Vagas** | triagem de oportunidades acadêmicas coletadas semanalmente |

A **revisão dominical** não tem aba: no domingo ela abre dentro do Hoje, e nos
outros dias fica no rodapé ("Revisão da semana").

A **Semana** continua existindo inteira, com toda a sua lógica — ela apenas
perdeu o lugar na barra para Processos, porque cinco abas não cabem num
telefone. A revisão dominical é o digest de revisão; o acesso à antiga Semana
permanece no rodapé como "A semana em números".

---

## Hoje

Cinco blocos, nesta ordem:

### 1. Prioridades

> **Fonte de verdade (Fase 9B).** A prioridade continua morando em
> `cron:prioridades:AAAA-Wnn` no aparelho, mas o estado **compartilhado** passou
> a ser o `cron_estado` do Supabase, domínio `prioridade`, chave
> `AAAA-Wnn/prid`. Quando a sincronia está ligada, uma alteração aparece no
> outro aparelho em segundos, sem recarregar. O caminho de toques continua
> emitindo em paralelo até a Fase 9G. Ver *Fase 9 — Estado compartilhado
> online*.
O que **você** elegeu para a semana. Sempre no topo. Duas formas:

- **de trilho** — aponta para um projeto; o texto exibido é o **estágio real do
  Trilho**, lido a cada desenho;
- **livre** — um texto seu, com caixa.

Chave ISO por semana (`2026-W36`): você elege na segunda e vale até domingo.

**Cumprir é um fato da prioridade, e não do dia.** A conclusão mora no campo
`feito_em` da própria prioridade — a data em que você a marcou —, e não no
`cron:checks:AAAA-MM-DD` das rotinas. A diferença não é de arrumação:

- a **rotina** é por dia de propósito. Amanhã é outra rotina, e quando a semana
  gira aquela volta a aparecer, porque ela é uma rotina;
- a **prioridade** é da semana e se cumpre uma vez. Guardada no `cron:checks`,
  a marca de ontem era procurada na chave de hoje e não era achada: a prioridade
  cumprida reaparecia por cumprir todo dia.

**Na tela**: sem `feito_em`, aparece normal; `feito_em` **de hoje**, aparece
marcada — ver algo sumir no instante do toque é perder a confirmação de que o
toque valeu; `feito_em` **anterior a hoje**, sai do Hoje. *Sair da tela não é
sumir*: ela continua na semana e continua contada como cumprida na revisão de
domingo. O que muda é só o que disputa a sua atenção hoje.

**A prioridade de trilho não entra nessa regra.** Ela é o projeto da semana:
fechar uma etapa a faz avançar para a seguinte, não sair. Ela deixa a tela
quando a semana acaba.

**Atravessa aparelhos** pelo toque `prioridade` (ver Sincronização), `feito_em`
incluído: cumprir no computador aparece cumprido no celular.

**Precedência**: `prioridadesDoDia()` devolve `{manuais, sugeridas}` e os dois
blocos são desenhados separados, manuais primeiro. Ver *Motor de prioridades*.

### 2. Rotinas
As tarefas fixas do dia (`DIAS[diaDaSemana].tasks`). Marcação por data
(`cron:checks:AAAA-MM-DD`), local ao aparelho.

Duas regras duras:

- **Não existe "Planejar a semana" como tarefa.** Planejar é o que o bloco de
  Prioridades faz.
- **A rotina não escolhe um Trilho.** Ela diz *o que* fazer; a prioridade diz
  *em qual projeto*. Um painel com mais de um projeto ativo nunca tem estágio
  escolhido automaticamente (`trilhoSemEscolha`).

#### Rotinas não marcadas — fora da tela

Havia aqui um `<details>` recolhido com as rotinas dos últimos sete dias que
ficaram sem marca, com botões de marcar e dispensar. **Ele não é mais desenhado
no Hoje**: a chamada `renderAtrasadas()` está comentada em `js/30-render.js`.

**A implementação continua inteira** — `renderAtrasadas`, `atrasadas`,
`marcarAtrasada`, `dispensarAtrasada`, `podarDispensados`, `ATRASO_DIAS` e a
chave `cron:hoje-dispensados` —, e voltar é descomentar uma linha.

Ela fica por uma razão que não é sentimental: **`atrasadas()` não pertence só a
esse painel.** A revisão dominical a chama para montar o bloco *Ficou para trás*
(`revisaoDaSemana`, em `js/20-regras.js`), e apagá-la levaria junto um pedaço do
domingo. Retirar o painel da tela não muda nada disso: nenhuma rotina, nenhuma
marcação, nenhum dado.

### 2b. Motor de prioridades

Quando você não preencheu as três vagas, o sistema **sugere** — no máximo duas,
e nunca ultrapassando três no total.

```
0 manuais → 2 sugestões      2 manuais → 1 sugestão
1 manual  → 2 sugestões      3 manuais → 0
```

**Classifica, não pontua.** Nenhuma soma, nenhum corte numérico — a primeira
regra que casa vence, e a classe vai para a tela junto do motivo:

| # | Classe | Quando | Motivo exibido |
|---|---|---|---|
| 1 | URGENTE | mês-alvo (`proj.mes`) vencido ou a ≤45 dias | "atrasado 1 mês" |
| 2 | DECISÃO | etapa atual é `prova: estrela` | "depende de uma decisão sua" |
| 3 | RETOMADA | ≥14 dias sem avanço (`sub.em`) | "18 dias sem avanço" |
| 4 | ESTRATÉGICO | painel `peso: alto` **e já começado**, ou priorizado nas últimas 4 semanas | "prioridade estratégica" |
| 5 | EM CURSO | etapa atual com `st: 1` | "começado e não terminado" |
| — | NORMAL | o resto | não é sugerido |

Desempate: classe → prazo (asc) → dias parado (desc) → peso do painel →
`painel/projId` alfabético. A última chave garante resultado **estável**: nada
aleatório, nada dependente da hora.

Fora sempre: concluído · sem etapa aberta · adiado com `voltar_em` futuro ·
abandonado · inaplicável · já é prioridade manual · dispensado · já visível numa
rotina.

**Peso alto não elege sozinho.** Um painel estratégico com doze projetos dentro
não diz qual importa hoje. Exige-se vínculo real: o projeto já começou, ou você
já o escolheu à mão recentemente.

**Sugestão não é decisão.** É derivada a cada desenho e nunca gravada. "Adotar"
chama `addPrioridadeTrilho()` — o mecanismo e o toque que já existiam. "Agora
não" grava em `cron:retomadas-adiadas`, a mesma chave das retomadas: dispensar
num lugar silencia nos dois.

`sinaisDeProcesso()` devolve `[]` — é por ali que os Processos (Fase 4) entram,
sem tocar no núcleo do motor.

O único botão a girar se você discordar: `peso` em `PAINEIS`, uma palavra por
painel.

### 3. Retomadas
Projeto importante sem avanço há 14 dias ou mais. **Lembrete, não cobrança** — e
nunca vira prioridade sozinha.

A data vem de `sub.em`, que já atravessa aparelhos. Quatro filtros evitam o
falso abandono: só projeto já começado; `vida` adiado/abandonado/inaplicável
fica de fora; `voltar_em` no futuro é respeitado; concluído sai.

O texto é sempre "N dias sem avanço" + **o estágio real do Trilho**.

### 4. Datas importantes
Cinco eventos futuros na primeira tela, da mais próxima para a mais distante,
com o contador grande. As demais ficam atrás de "ver todas" e **nunca são
apagadas** de `cron:eventos`.

Cada evento é endereçado pelo **id**, nunca pelo índice da tela.

### 5. Indicador de Vagas
Uma linha (`6 novas · 2 para revisar`). A triagem inteira continua na aba Vagas.

---

## Revisão dominical

**Domingo é informação. Segunda é decisão.**

No domingo o Hoje abre com a revisão da semana que termina. Ela mostra o que
aconteceu, o que ficou aberto e o que merece atenção — e para aí. **Não escolhe
prioridade, não cria tarefa e não diz o que fazer na semana que vem.**

> "Patriotismo ficou 18 dias sem avanço" é informação.
> "Trabalhe em Patriotismo" seria decidir por você.

Quatro blocos, uma tela de celular:

| Bloco | O que traz |
|---|---|
| **Concluído** | etapas de trilho fechadas, metas, prioridades cumpridas, rotinas marcadas |
| **Ficou para trás** | prioridades sem avanço, rotinas não marcadas, sugestões não adotadas |
| **Atenção** | projetos parados (`retomadas()`) e o resumo dos processos |
| **Próxima semana** | datas, prazos e oportunidades nos próximos 14 dias — **lista o que vem, não o que fazer** |

### Cada coisa na sua fonte de verdade

Nenhuma heurística nova. O digest pergunta a quem já sabe:

| Item | Fonte |
|---|---|
| etapa de trilho | `cron:registro` (o diário) **+** `st` do subitem (o saldo) |
| prioridade livre | `feito_em`, na própria prioridade |
| rotina | `cron:checks`, pelo `atrasadas()` que já existia |
| meta | a própria meta, com o seu `done` |
| processo | `toeflFase()`, o resumo que o processo já publica |

**A regra das três condições** para "concluído nesta semana", e cada uma existe
por um caso real: o `cron:registro` grava os dois sentidos, e nas linhas reais
de 30/08 há `de=1 para=2` seguido de `de=2 para=0` no mesmo subitem, no mesmo
dia. Contar `para===2` ingenuamente diria duas etapas concluídas; a verdade é
zero. Então:

1. existe linha com `para===2` dentro da semana;
2. ela é o **último** movimento daquele subitem na semana;
3. o subitem está com `st===2` **agora**.

A 3 é o saldo, a 2 é o diário. Manter as duas preserva a distinção entre
registro histórico e estado atual: se discordarem, o item não entra.

### Manual, sugestão e rotina não se confundem

O digest rotula as três origens. Uma sugestão do motor aparece como *"o sistema
sugeriu X; não foi adotada"* — **nunca** como escolha sua. Sugestão adotada
some da lista por construção: o motor já exclui o que virou manual.

### Rotinas marcadas são deste aparelho

`cron:checks:` sempre foi local — marcar no computador não aparece no celular.
Por isso a linha diz **"9 rotinas concluídas · neste aparelho"**. Apresentar
esse número sem a ressalva seria dar dado local como estado de todos. As etapas
de trilho, metas, prioridades e eventos são sincronizados e aparecem sem
ressalva.

> **Isto tem prazo.** A ressalva descreve um limite técnico, não uma decisão de
> produto: `cron:checks:` era local porque sincronizá-lo custaria histórico
> permanente em repositório público. A Fase 9 remove esse custo, as rotinas
> passam a viajar, e **a ressalva sai da tela**. Ver *Fase 9 — Estado
> compartilhado online*.

### Nada é gravado

A revisão é **inteiramente derivada**: nenhuma chave nova de `localStorage`,
nenhum tipo de toque, nenhuma cópia do resumo. Calcular e desenhar duas vezes
não muda um byte do aparelho — há teste disso. E **não existe caixa para marcar
a revisão**: nada de `dom-revisao` ou `dom-planejar`. Ela acontece por existir.

---

## Processos

**Processo é a estrutura completa de um trabalho complexo. Hoje é a ação que
precisa ser feita agora.** Até a Fase 4 as duas coisas moravam na mesma tela: o
guia inteiro do TOEFL abria numa gaveta dentro do Hoje.

### TOEFL

A aba responde: em que fase estou · o que falta para fechá-la · o que é núcleo e
o que é reforço · qual o objetivo · se estou atrasado em relação ao calendário
original · se preciso recalibrar · qual é a ação concreta agora.

Três decisões do modelo, todas anteriores à Fase 4 e todas preservadas:

- **A fase anda pelo núcleo, não pelo calendário.** `currentFaseId()` devolve a
  primeira fase cujo núcleo não fechou. As datas do `TOEFL_PLANO` viraram aviso.
- **Núcleo × reforço.** `n:true` trava a fase seguinte; `n:false` vale a pena e
  não congela nada — é onde mora o que depende de terceiros.
- **Recalibrar não reescreve o plano.** `TOEFL_PLANO` é a memória do que se
  previu; a recalibragem acrescenta uma leitura.

> **O `id` de cada item do `TOEFL_GUIA` não pode mudar** — nem ser reaproveitado
> em outro item. Até a Fase 6A as marcações moravam em `cron:toefl-guia:<fase>`
> indexadas por **posição**, e o intocável era a ordem: reordenar moveria as
> marcações para os itens errados, em silêncio. Agora elas moram em
> `cron:toefl-guia` endereçadas pelo `id`, e o risco mudou de lugar — a ordem e
> o texto ficaram livres, o `id` é que é a identidade.

### A ponte Processo → Hoje

O Hoje não sabe o que o TOEFL faz na terça: **ele pergunta**.

```
TOEFL_SEMANA[diaDaSemana] ──► acaoDoDiaDoProcesso("toefl") ──► a linha do Hoje
```

As rotinas em `DIAS` carregam `processo:"toefl"` e nenhum texto. O `id` não
mudou — é dele que `cron:checks:` depende. Sem essa inversão, mover o guia de
aba teria sido só mudar HTML de lugar.

### Duas fontes, um contrato

`PROCESSOS` é uma lista com as funções de cada entrada (`resumo`, `acaoDoDia`,
`linhas`, `corpo`, `acoes`), todas já existentes no caso do TOEFL. Ela deixou de
ser *a* lista e passou a ser a lista dos processos **escritos à mão**. O que a
aba desenha é `processosVisiveis()`:

```
PROCESSOS (à mão: o TOEFL)        ──┐
                                     ├──► processosVisiveis() ──► aba Processos
projetos de Trilho iniciados       ──┘     (TOEFL primeiro, depois painel/projeto)
```

Um projeto de trilho vira processo por `processoDeTrilho(pid, pr)`, que adapta
**dados que já existiam**: `pr.t`, `pr.n`, os `subs` com `t`, `st`, `vida`, `em`,
`onde` e `prova`, mais o `estagioDoTrilho()` de sempre. **Nenhum metadado novo,
nenhum cadastro paralelo, nenhuma chave de `localStorage`, nenhum tipo de toque.**

**Iniciado é uma definição só.** `projetoComecou(pr)` — algum subitem com `em`
preenchido ou `st > 0` — é a mesma regra que o motor de prioridades e as
retomadas já aplicavam. Nomeá-la é o que impede a aba de discordar do motor
sobre o mesmo projeto. Concluído fica de fora.

**O processo derivado é somente leitura.** `acaoDoDia()` devolve `null` e
`acoes()` devolve vazio, as duas por decisão:

- um artigo não tem semana como o `TOEFL_SEMANA`, e inventar uma seria inventar
  metadado. Por isso **Processos nunca cria tarefa diária**;
- concluir etapa continua sendo do Trilho, do Hoje e do pipeline, pelo toque
  `registro`. Um segundo lugar de marcar seria um segundo mecanismo de conclusão.

**A medida honesta é "X de Y etapas".** O campo `sub.medida` (`{feito, total}`)
existe no esquema e já é desenhado nos Trilhos, mas está **vazio nos 78 subitens
reais** — usá-lo aqui seria inventar tamanho. Ele continua opcional e vazio;
preenchê-lo é trabalho do Cowork, não desta tela. Subitem `inaplicavel` sai da
conta: não é etapa que falta, é etapa que não existe para aquele projeto.

O texto de cada etapa é **verbatim** o do trilho. `prova: "estrela"` aparece como
*depende de você* e `prova: "maquina"` como *pelo pipeline*; `onde` aparece com o
valor que tem (escrivaninha, celular, cowork). A ordem da lista é estável —
painel e projeto, sem heurística de "estágio mais avançado" que mudaria a tela a
cada marcação.

---

## Contexto: casa / fora de casa

Só dois estados. Fora de casa significa que o telefone é o que existe.

**Restringe, não pontua.** Uma prioridade sua continua no topo esteja você onde
estiver — só ganha o aviso "pede computador". Rebaixar a escolha do usuário por
causa do lugar seria o sistema decidindo por ele.

---

## Trilhos

Estruturas de longo prazo. `estagioDoTrilho(painel, projeto)` devolve o primeiro
subitem não concluído, pulando "não se aplica".

**O Hoje nunca inventa o estágio de um projeto.** O texto exibido é o do
subitem, verbatim. Nunca "trabalhar no artigo".

### Conclusão automática

```
pipeline de produção do texto
   └─► etapa concluída
        └─► scripts/dobrar_toques.py --registrar painel/projeto/etapa --para 2
             └─► Cronograma/toques/
                  └─► dobra ──► estado.json
                       └─► a página desce pelo relógio ──► Hoje e Trilhos
```

Você não precisa voltar ao Cronograma para marcar o que o pipeline fechou.

**`prova: "estrela"`** marca a etapa cuja conclusão é decisão sua. O
`--registrar` **recusa** essas etapas (só com `--forcar`), porque o relógio do
Cowork venceria a sua decisão e a apagaria. O Hoje mostra o selo "depende de
você" nelas.

Nunca criar um segundo mecanismo de conclusão.

---

## Sincronização

> Esta seção descreve o mecanismo **em produção** — toques, `dobrar_toques.py` e
> `estado.json`. Ele continua inteiro e continua sendo a verdade operacional. O
> mecanismo que o sucede está em *Fase 9 — Estado compartilhado online*, e não
> desliga este antes da etapa 9G.

Sete coisas atravessam aparelhos, cada uma com um tipo de toque:

| Tipo | Vai para | Chave |
|---|---|---|
| `registro` | `itens` | `painel/projeto/subitem` |
| `triagem` | `triagem` | id da vaga |
| `meta` | `metas` | `AAAA-MM/id` |
| `evento` | `eventos` | id do evento |
| `prioridade` | `prioridades` | `AAAA-Wnn/id` |
| `toefl` | `toefl` | `id` do item do guia |
| `retomada` | `retomadas` | `painel/projeto` |

**O progresso do TOEFL atravessa aparelhos desde a Fase 6A.** Fechar o núcleo
no computador avança a fase no celular. O mapa é `cron:toefl-guia`, plano e
endereçado pelo `id`: `{iid: {feito, em}}`. O toque leva o mínimo —
`{iid, feito}` —, sem fase, sem texto e sem índice: os dois primeiros moram no
`TOEFL_GUIA`, que é estrutura da página, e o aparelho que desenha os lê de lá.

**Não há lápide `del` aqui**, e a exceção tem razão: o item do guia não é coisa
que você cria, é estrutura — não pode ser apagado, só marcado ou desmarcado.
Desmarcar viaja como `feito:false` com instante próprio. **Ausência não é
`false`**: é "nunca decidido".

*Migração.* As marcas antigas por posição sobem uma vez por aparelho, guardadas
por `cron:toefl-migrado`, com o instante-piso `TOEFL_EM` — bem no passado, para
nunca vencerem uma marca feita depois. **Só o que é exatamente `true` sobe**: se
a ausência viajasse como `false`, um aparelho que migrasse mais tarde apagaria
marca legítima de outro. Como só sobem as verdadeiras, dois aparelhos migrando
em ordens diferentes produzem **união**, nunca subtração. As chaves antigas
`cron:toefl-guia:<fase>` **não são apagadas**: ficam como rede de segurança.

**O silêncio da retomada atravessa desde a Fase 6B.** Dispensar uma retomada
no celular cala no Mac. O mapa é `cron:retomadas-adiadas`, agora
`{painel/projeto: {ate, em}}`, e o toque leva só `{pid, projId, ate}` — sem
título, sem estágio, sem texto: o projeto é lido do trilho no aparelho que
desenha.

O `ate` é **data absoluta, não duração**. Um toque que chega três dias depois
carrega a data que foi decidida; se viajasse "+14 dias", a latência da rede
mudaria o resultado.

**Não há lápide aqui**, e a razão é própria: não existe operação de
dessilenciar. A entrada morre pela data que ela mesma carrega, e vencida ela
some dos dois leitores — `retomadas()` e `motorDePrioridades()` — sem toque
nenhum. A chave é compartilhada com o "agora não" das sugestões do motor, como
sempre foi: silenciar num lugar silencia nos dois, agora entre aparelhos também.

*Migração.* Converter e publicar são coisas diferentes: **toda** entrada vira
`{ate, em}` e continua no aparelho, mas **só as que ainda calam viram toque** —
publicar uma silenciada vencida seria história pública permanente por nada.
Guardada por `cron:retomadas-migrado`, com o piso `RETOMADA_EM`.

*Migração das prioridades cumpridas (04/09).* As marcas que ficaram no
`cron:checks` da semana corrente viram `feito_em` na própria prioridade, uma vez
por aparelho, guardada por `cron:prio-feito-migrado`. **Não publica toque**, e
essa é a diferença em relação às duas migrações acima: `cron:checks:` sempre foi
local *por decisão* — é a ressalva "neste aparelho" da revisão dominical —, e
uma marca que nunca atravessou aparelho não pode passar a atravessar
retroativamente. Ela só muda de gaveta, dentro do aparelho. A chave antiga
**não é apagada**, pela mesma razão da migração do TOEFL.

**A recalibragem continua local.** `cron:toefl-recalibrado` é cache de uma
derivação — `calcularRecalibragem()` a refaz a partir do plano, da fase corrente
e do que falta, e as duas últimas agora sincronizam. Sincronizar a leitura seria
sincronizar valor derivado. Não existe tipo de toque `recalibrado`.

`cron:checks:` (**só rotinas**, desde 04/09), `cron:hoje-dispensados` e
`cron:contexto` (casa/fora) seguem locais, cada um pela sua razão. O lugar onde você está é um fato físico
do aparelho. O dia marcado é do aparelho por decisão — a revisão dominical
exibe a ressalva "neste aparelho". E `cron:hoje-dispensados` **não é equivalente
à retomada adiada**: ela endereça um projeto durável e vale até uma data; ele
endereça a ocorrência de uma rotina numa data passada, vale sete dias, é podado
na escrita e **depende de `cron:checks:`** — dispensar só faz sentido sobre uma
rotina não marcada, e "não marcada" é fato local. Sincronizar algo projetado
para ser esquecido em sete dias custaria histórico permanente, em repositório
público, por um valor que morre numa semana.

Regras invioláveis:

- a página **enfileira toques**; nunca escreve em `estado.json`;
- `estado.json` é escrito **só** por `scripts/dobrar_toques.py`;
- vence o relógio, item a item — toque atrasado entra no histórico mas não
  manda no estado;
- apagar deixa **lápide** (`del: true`): ausência não é desconhecimento;
- toque de tipo desconhecido não é descartado — vai para o histórico;
- **nada** se perde: o histórico nunca é podado.

**A prioridade de trilho não carrega o texto da etapa** — carrega o endereço
(`painel` + `projId`). O estágio é lido no aparelho que desenha. Se o texto
viajasse, o celular mostraria a etapa de quando a prioridade foi criada.

**`feito_em` viaja como data, e não como booleano.** A regra de tela depende de
*quando* a prioridade foi cumprida; um booleano obrigaria cada aparelho a
adivinhar o dia, e o aparelho que recebesse a marca no dia seguinte a exibiria
como se fosse de hoje. Vazio é "não cumprida" — é o valor de quem nunca foi
marcada e o de quem foi desmarcada, que para a tela são a mesma coisa.

> O repositório é público. Só suba o que pode ser público. O histórico nunca é
> podado: um título publicado uma vez fica público para sempre.

---

## Fase 9 — Estado compartilhado online

A Fase 8 fechou o ciclo de notificação. A Fase 9 muda a coisa de baixo: **o
estado do Cronograma deixa de pertencer ao aparelho e passa a pertencer à
conta.** Qualquer alteração feita em qualquer aba, em qualquer aparelho, chega
aos outros quase imediatamente — não porque cada painel ganhou sincronização
própria, mas porque passa a existir *uma* infraestrutura de estado que todos os
painéis usam.

O desenho até aqui era:

```
GitHub  →  toques/  →  dobrar_toques.py  →  estado.json  →  aparelhos
```

O desenho da Fase 9 é:

```
                      Supabase / PostgreSQL
                    estado · registro · base
                              │
                 ┌────────Realtime─────────┐
                 │            │            │
              iPhone         Mac         Cowork
               cache        cache       (pipeline)
```

### Por que não bastava consertar Prioridades

O sintoma que abriu a fase foi uma prioridade marcada no Mac e não vista no
iPhone. O diagnóstico foi outro: **o problema não é de nenhum painel, é da
forma como todos sincronizam.** A auditoria contou

- **13 pontos de escrita** chamando `enfileirarToque()` em três arquivos;
- **8 blocos aplicadores** escritos à mão dentro de `buscarEstado()`.

São **dois caminhos cabeados à mão por domínio**, e cada domínio novo custa mais
dois. Consertar Prioridades teria sido um nono bloco.

Mas a auditoria achou também a boa notícia: **os sete domínios que já viajavam
obedeciam à mesma regra, letra por letra** — chave por id, valor com `em`, vence
o relógio item a item, empate fica como está, lápide onde há remoção, "receber
não é tocar". A abstração já existia de fato; só não existia em código. A Fase 9
não inventa um contrato de sincronização: **extrai** um que sete domínios já
cumprem. E o `estado.json` atual é o oráculo contra o qual verificá-la.

### A auditoria do estado mutável

Todo dado do Cronograma, com o seu escritor, o seu destino e a decisão da fase.

**Atravessa aparelhos hoje** — vira domínio de `cron_estado`:

| Dado | Chave local | Escritor | Domínio na Fase 9 |
|---|---|---|---|
| progresso do subitem (`st`, `vida`, `motivo`) | `cron:<painel>` | `logar()` | `item` |
| triagem de vagas | `cron:triagem` | `vgMarcar` | `triagem` |
| metas do mês | `cron:metas:AAAA-MM` | `editMeta` | `meta` |
| datas importantes | `cron:eventos` | `editEv` | `evento` |
| prioridades da semana | `cron:prioridades:AAAA-Wnn` | `editPrioridade` | `prioridade` |
| guia do TOEFL | `cron:toefl-guia` | `marcarGuia` | `toefl` |
| retomadas silenciadas | `cron:retomadas-adiadas` | `adiarRetomada` | `retomada` |
| registro datado | `cron:registro` | `logar()` | tabela `cron_registro` |

**Não atravessa hoje, e deveria** — a lacuna que a fase fecha:

| Dado | Chave local | Escritor | Por que não viajava |
|---|---|---|---|
| criar / renomear projeto e subitem | `cron:<painel>` | `addProj`, `addSub`, `editProj`, `editSub` | nunca emitiu toque: a estrutura era do `entrada.json` |
| arquivar / restaurar | `cron:arquivo` | `delProj`, `delSub`, `restaurarArquivo` | mecanismo próprio, fora do toque |
| rotinas marcadas | `cron:checks:AAAA-MM-DD` | `toggleCheck` | histórico público permanente por um valor semanal |
| avisos dispensados | `cron:hoje-dispensados`, `cron:metas-aviso:AAAA-MM` | `dispensarAtrasada`, `dispensarAviso` | idem |

**Continua local, e a razão sobrevive:**

| Dado | Razão |
|---|---|
| `cron:contexto` (casa/fora) | é um fato **físico** do aparelho. Sincronizá-lo faria o Mac em casa achar que saiu |
| `cron:aparelho` | é a identidade do aparelho; compartilhá-la a destruiria |
| `sync:token` | é segredo, e nunca sai daqui |

**Não sincroniza porque é derivado ou cache** — sincronizar valor derivado é
sincronizar consequência em vez de causa: `cron:toefl-recalibrado`,
`cron:feed-cache`, `cron:la-fora`, `cron:entrada`, `cron:entrada-aplicada`.

**Não sincroniza porque é estado de tela:** `cron:paineis-open`,
`cron:painel-open:*`, `cron:processo-open:*`, `cron:toefl-guia-open`,
`cron:grade-open`, `cron:atrasadas-open`, `cron:retomadas-open`,
`cron:eventos-tudo`.

**Não sincroniza porque é maquinaria local:** `cron:schema-versao`, os
`cron:*-migrado`, `cron:*-seed`, `cron:relogio`, `cron:relogio-bases`,
`cron:toques`, `cron:ultimo-backup` e os arquivos de registro excedente.

### As quatro decisões

**1. Conta única, autenticada — e-mail e senha, cadastro público desligado.**

A Fase 8 pôde usar a chave *publishable* — pública por desenho, versionada em
`js/00-config.js`, num repositório público — porque a RLS de
`cron_push_inscricao` permite **apenas INSERT** e não devolve linha nenhuma.
Não há o que ler.

A Fase 9 é o oposto: existe para ser lida e reescrita. Com uma política aberta
ao `anon`, essa mesma chave versionada daria o Cronograma inteiro a qualquer
pessoa. Por isso **nada em `cron_estado.sql` é acessível ao `anon`**: toda
política exige `authenticated` **e** `dono = auth.uid()`.

Senha, e não magic link: o link exige SMTP e o e-mail embutido do plano
gratuito é limitado a poucos envios por hora — você descobriria isso sem sessão
no iPhone, no pior momento. Senha é uma chamada, a sessão persiste e se renova,
e a conta é criada à mão uma vez.

**2. O relógio continua sendo o do aparelho.**

Com um Postgres na frente, a tentação é usar `now()` como relógio do LWW. Seria
um erro: uma marcação feita **offline** às 9h e enviada às 18h venceria a
marcação legítima das 17h no outro aparelho — a fila offline passaria a
corromper o estado em vez de preservá-lo. É a mesma razão pela qual as migrações
da Fase 6 publicaram com instante **antigo**.

`em` é o instante monotônico do aparelho, gerado por `instanteDoToque()`, e é ele
que decide. `servidor_em` existe e é **auditoria**: nunca decide nada.

A diferença em relação ao que havia é que "vence o relógio" deixa de ser uma
promessa cumprida por oito trechos de JavaScript e passa a ser **recusada pelo
servidor**: um `UPDATE` cujo `em` não seja estritamente mais novo é descartado
em silêncio por um gatilho — que é literalmente a regra escrita.

**3. A base privada muda o que pode viajar.**

Três remendos existiam só porque o repositório é público e o histórico nunca é
podado, e nenhuma dessas razões sobrevive a uma base privada:

- o **`motivo` volta a viajar**. O `semMotivo()` e o rótulo *"motivo registrado
  no outro aparelho"* saem;
- o **título de evento privado volta a viajar**. O campo `priv` deixa de ser
  uma amputação e vira preferência de exibição;
- **`cron:checks:` e os avisos dispensados passam a viajar.** A ressalva
  *"neste aparelho"* da revisão dominical **sai da tela**: ela nunca foi um
  objetivo de produto, era a racionalização de um limite técnico. Marcar uma
  rotina no Mac e o iPhone mostrar o dia incompleto é exatamente a discordância
  que faz alguém deixar de confiar no app.

Consequência que vale registrar: com as rotinas viajando, o motor de prioridades
passa a divergir entre aparelhos **apenas** por contexto e por relógio — que é a
divergência correta e desejada. **Sincronizam-se as fontes de verdade; os
derivados continuam sendo recalculados em cada aparelho**, como já eram.

**4. Uma linha por item, nunca um JSON gigante.**

Marcar uma etapa não pode reescrever todos os trilhos — nem no tráfego, nem no
Realtime, nem no conflito. `cron_estado` é genérica na **forma**
(`dominio` + `chave` + `valor`), mas a granularidade é a do **item**: cada
subitem, cada meta, cada vaga é uma linha própria, com relógio próprio e evento
Realtime próprio.

A forma genérica é o que permite **um** aplicador em vez de oito, e é uma
tradução mecânica do `estado.json` — o que torna a etapa de escrita dupla
verificável linha a linha. Onde a estrutura justificar tabela própria, ela ganha
tabela própria: é o caso do registro e da base da estrutura.

### Os dois escritores dos Trilhos

O pipeline e você escrevendo nos mesmos Trilhos era o risco arquitetural da
fase. A auditoria o dividiu em dois, e só um deles é problema.

**Marcar já é de dois escritores hoje, e funciona.** O
`dobrar_toques.py --registrar` publica com `aparelho: "cowork"` e entra pela
mesma porta que o iPhone — o pipeline **é um aparelho como os outros**, sem
caminho privilegiado, e o LWW resolve. E a fronteira do que a máquina pode
afirmar já está no dado: `--registrar` **recusa** subitem de `prova: "estrela"`,
que é como o `mapa_portal.json` marca as etapas cuja conclusão é decisão do
autor e não artefato. Nada disso muda na Fase 9.

**Estruturar é onde o conflito mora**, e havia ali um defeito latente:

```
10-nucleo.js:104   if(novo.t && novo.t!==alvo.t){ alvo.t=novo.t; mudou=true; }
```

O `mesclarEntrada()` conclui que discordância significa desatualização. Mas
discordância também pode significar **que você editou**: hoje, renomear um
projeto à mão é desfeito pela próxima publicação do pipeline, em silêncio. Isso
não é consequência da Fase 9 — é verdade desde a Fase 4; a Fase 9 apenas o torna
visível, ao dar ao rename um caminho de sincronização.

A causa é o merge ser de **duas vias**. A correção é uma terceira, e ela já
existe pela metade: o `entrada.json` publicado *é* a base do pipeline, e o app já
guarda a marca da última versão aplicada (`cron:entrada-aplicada`). Falta
guardar os **valores**, e é o que a tabela `cron_estrutura_base` faz:

```
o campo mudou no entrada.json desde a última publicação?
   não  → não escreve. O que você editou à mão sobrevive.
   sim  → você também mudou esse campo depois?
          não → escreve. É atualização legítima do pipeline.
          sim → conflito real: vence o relógio, e fica registrado.
```

**Não há hierarquia entre escritores. Cada um manda no que efetivamente mexeu.**
E quem escreve a base é só o pipeline: a RLS dá ao app apenas `SELECT`. Se o app
pudesse reescrevê-la, poderia forjar *"o pipeline nunca mudou isso"* e o merge de
três vias viraria de duas outra vez.

`item` e `estrutura_sub` são **linhas separadas do mesmo subitem** por isso: o
pipeline escreve estrutura, você escreve progresso, e no caso comum eles nem
tocam na mesma linha.

### O que deixou de ser caso especial

Apagar um projeto ou subitem tinha mecanismo próprio: `splice` do array mais uma
gaveta paralela (`cron:arquivo`) indexada por **posição** — que se desloca. Era,
a rigor, um segundo mecanismo de remoção, e não viajava.

O esquema v2 já declarava `arquivado` como valor de `vida` desde a reforma, e
nunca o usava: em produção só apareciam `ativo`, `adiado`, `abandonado` e
`inaplicavel`. Unificar os dois — **arquivar é `vida = "arquivado"`, restaurar é
`vida = "ativo"`** — converte apagamento e restauração em atualizações de campo
comuns, que o LWW já sabe resolver e que já viajam pelo toque `registro`. A aba
Arquivo passa a ser um **filtro**, não uma gaveta.

Somem o `cron:arquivo`, a fragilidade dos índices e um caso especial da
sincronização. É migração de dado existente, com a disciplina de sempre:
versionada, nada descartado, chave antiga preservada como rede de segurança.

### O esquema

`sql/cron_estado.sql`. Três tabelas; `cron_push_inscricao` fica intocada.

| Tabela | O quê | Escrita por |
|---|---|---|
| `cron_estado` | estado corrente, uma linha por item, onze domínios | app e pipeline |
| `cron_registro` | histórico datado, append-only, chaveado pelo id do toque | app e pipeline |
| `cron_estrutura_base` | o que o pipeline publicou por último (merge de três vias) | **só** o pipeline |

Os onze domínios de `cron_estado`, com a chave de cada um:

| Domínio | Chave | Valor |
|---|---|---|
| `item` | `painel/projeto/subitem` | `{st, vida, motivo, voltar_em, vidaDesde}` |
| `estrutura_proj` | `painel/projeto` | `{t, n, mes}` |
| `estrutura_sub` | `painel/projeto/subitem` | `{t, n, onde, prova, medida, ordem}` |
| `triagem` | id da vaga | `{st}` |
| `meta` | `AAAA-MM/id` | `{t, done, de}` |
| `evento` | id do evento | `{t, data, priv}` |
| `prioridade` | `AAAA-Wnn/id` | `{tipo, painel, projId, t, feito_em}` |
| `toefl` | id do item do guia | `{feito}` |
| `retomada` | `painel/projeto` | `{ate}` |
| `rotina` | `AAAA-MM-DD/idDaRotina` | `{feito}` |
| `dispensa` | `rotina/AAAA-MM-DD/id` ou `meta-aviso/AAAA-MM` | `{}` |

A lista é fechada por um `CHECK`, e a rigidez é de propósito: acrescentar
domínio é uma migração de uma linha, e o arquivo passa a ser a documentação
executável do que atravessa aparelhos.

**A lápide fica.** `del` é uma coluna, não um `DELETE`: um aparelho que só volta
a abrir daqui a um mês precisa saber que a meta foi **apagada**, e não que nunca
a viu — senão ele a recria na próxima subida. Ausência não é desconhecimento,
como sempre.

**A poda existe agora, e é limitada.** `rotina` e `dispensa` têm `expira_em`;
`cron_podar()` as remove, chamada pelo Actions com a chave *secret*.
`atrasadas()` lê no máximo `ATRASO_DIAS` para trás e a revisão dominical lê a
semana corrente — marcação de rotina com 90 dias não é lida por ninguém. **O
registro e as lápides continuam sem poda**: "nada se perde" vale para decisão,
não para o rastro de uma rotina que morreu de velha.

### Duas exigências que só aparecem com Realtime

**O catch-up não é robustez opcional — é o caminho principal.** O Safari do
iPhone mata o WebSocket em segundo plano. O caso real ali não é "recebe o
evento", é "reconecta e busca o delta ao voltar". É para isso que existe o
índice `cron_estado_delta` sobre `servidor_em`, e é a única coisa para que
`servidor_em` serve.

**O render precisa esperar o campo em foco.** Metade da edição do app é
`contenteditable` com `onblur`. Hoje isso é seguro porque `buscarEstado()` só
roda no boot, no `online` e no `visibilitychange`. Com Realtime, uma mudança
remota dispararia `renderTrilhos()` no meio de você digitar, e o `innerText` que
o `onblur` leria já teria sido substituído. A camada de sincronização adia o
render enquanto houver foco em campo editável.

### Ordem de implementação

| Etapa | O quê |
|---|---|
| **9A** | infraestrutura: autenticação, RLS, esquema, leitura, escrita, Realtime, reconexão, catch-up por delta, fila offline, guarda de foco no render |
| **9B** | **Prioridades** ponta a ponta — ver *9B, implementada*, abaixo |
| **9C** | prioridades, metas e eventos: lápide, períodos, `feito_em` e a repercussão entre painéis |
| **9D** | vagas, retomadas, registro, rotinas e dispensas |
| **9E** | trilhos: progresso e estrutura, com o merge de três vias e a unificação do arquivamento |
| **9F** | **escrita dupla e prova de equivalência**: os dois caminhos ativos, com comparação diária entre `estado.json` e as tabelas |
| **9G** | desativação do caminho GitHub, só depois de 9F limpa em dois ou mais aparelhos |

**O plano previa TOEFL como 9B, e foi trocado por Prioridades**, por decisão de
09/09. O argumento a favor do TOEFL era o mínimo de domínio em volta; o que
decidiu contra ele foi que Prioridades é o domínio cuja falta de sincronia
imediata abriu a Fase 9 — e é o único que exercita **os cinco verbos** (criar,
editar, marcar, desmarcar, apagar), a lápide e a chave composta de uma vez. A
infraestrutura ficou provada por um domínio difícil em vez de um fácil.

**9F é a etapa que mais reduz risco**, e é a que faltava no desenho original.
"Comprovadamente correto" não é uma impressão: é a comparação diária entre o
`estado.json` produzido pelo caminho antigo e as tabelas produzidas pelo novo.
O arnês já existe — `scripts/teste_sincronia.py` já atravessa a fronteira dos
dois aparelhos com o código de verdade dos dois lados.

**O caminho do GitHub não é desligado antes da 9G.** Ele funciona, contém muita
lógica de reconciliação testada, e é o registro de auditoria. Ele sai quando o
novo estiver provado, não quando estiver pronto.

### O que a Fase 9 aposenta

Quando 9G fechar, saem: o PAT do GitHub guardado no `localStorage` de cada
aparelho (`sync:token`), a fila `cron:toques` e o teto de reconstruções do Pages
que ditava o lote, o `semMotivo()`, a regra "toque meu não desce nunca" (toda
linha do registro passa a ter chave primária, por construção), a gaveta
`cron:arquivo` e a ressalva *"neste aparelho"*.

### 9A — a infraestrutura, implementada

`js/15-sync.js`, entre o núcleo e as regras. **Nenhum domínio está conectado** —
esse é o critério de parada de 9A — e **nada aqui desliga o GitHub**.

**Está desligada por padrão.** Sem `cron:sync-ligado`, `SYNC.iniciar()` devolve
na primeira linha e o aparelho segue exatamente como sempre foi. É o que torna
esta fase acrescentável a um aplicativo em uso: ligar é uma decisão, não efeito
colateral de atualizar.

**O SDK entra por injeção**, e só quando a sincronia está ligada — nunca por uma
tag no `index.html`. Três razões: o app é um PWA que precisa abrir sem rede e um
script de terceiro no `<head>` é ponto de falha na abertura; o `teste_hoje.js` lê
a lista de `<script src>` do próprio HTML e carrega do disco, e uma URL absoluta
ali quebraria o teste; e CDN fora do ar tem de significar "sem sincronia
online", nunca "aplicativo quebrado".

A superfície:

| Função | O quê |
|---|---|
| `SYNC.iniciar()` | o ciclo: sessão → carga → assinatura → drenagem |
| `SYNC.entrar(email, senha)` / `SYNC.sair()` | sessão, com `persistSession` |
| `SYNC.salvarAlteracao(dominio, chave, valor, opts)` | a subida: fila primeiro, rede depois |
| `SYNC.aplicarRemoto(linha)` | a descida: o único caminho de entrada |
| `SYNC.assinarDominio(dominio, fn)` | **é por aqui que a Fase 9B entra** |
| `SYNC.assinarMudancas()` | o canal Realtime |
| `SYNC.reconectar()` / `SYNC.buscarDelta()` | recuperação |
| `SYNC.drenarFila()` / `SYNC.agendarDrenagem()` | a fila offline |
| `SYNC.pedirRender(nomes)` | o render centralizado, com guarda de foco |
| `SYNC.venceRemoto(emLocal, emRemoto)` | **o relógio, numa função só** |

Três chaves locais novas, e cada uma tem um papel que as outras não têm:

| Chave | Papel |
|---|---|
| `cron:sync-fila` | o que este aparelho decidiu e ainda não foi persistido |
| `cron:sync-cache` | a última verdade conhecida, item a item, com o `em` de cada uma |
| `cron:sync-marca` | até onde as entregas chegaram — o ponto de partida do catch-up |

**Nenhuma delas é estado de domínio.** O cache guarda o que veio do servidor; o
que a tela desenha continua em `cron:pipeline`, `cron:metas:…` e companhia. A
ponte entre os dois é o aplicador de cada domínio, e ele só existe a partir de 9B.

#### O fluxo

```
aparelho A                    Supabase                   aparelho B
   │                             │                            │
 decide                          │                            │
   │                             │                            │
 cache otimista                  │                            │
 cron:sync-fila  ──── upsert ───▶│                            │
   │                       gatilho do relógio                 │
   │                    (em <= old.em ? descarta)             │
   │                             │                            │
 confirmado                      ├──── Realtime ─────────────▶│
   │                             │                     aplicarRemoto
 sai da fila                     │                       1. é minha?
                                 │                       2. marca avança
                                 │                       3. eco próprio?
                                 │                       4. relógio
                                 │                       5. cache
                                 │                       6. aplicador (9B+)
                                 │                            │
                                 │                      pedirRender()
                                 │                            │
                                 │                    guarda de foco
                                 │                            │
                                 │                        renderX()
```

**A ordem dos seis passos da descida é a correção**, e o passo 2 em especial: a
marca de entrega avança **antes** das recusas de eco e de relógio. Uma linha
recusada por ser minha, ou por ser velha, foi entregue do mesmo jeito — se a
marca só avançasse no caminho feliz, ela ficaria para trás e o catch-up
rebuscaria o mesmo trecho para sempre.

#### Offline e reconexão

Grava-se primeiro, tenta-se depois. A decisão está guardada no instante em que
foi tomada, e a rede é problema do aplicativo. A fila **só é cortada depois da
persistência confirmada**, e é cortada **por id, nunca por posição** — a mesma
lição que a fila de toques já aprendeu, porque cortar os N primeiros supõe que a
fila não mudou durante o envio, e ela muda.

**Recusa do relógio não é falha.** Se o servidor já tem valor mais novo, o
gatilho descarta o nosso e devolve sucesso. Está certo: a nossa alteração perdeu
por ser mais velha, que é a regra — e ela sai da fila.

A reconexão tem ordem, e a ordem é o ponto:

1. o canal de pé outra vez;
2. o que se perdeu, pelo **delta**;
3. o que este aparelho decidiu e ainda não subiu.

Drenar antes de buscar faria uma decisão local vencer, **por acidente de ordem**,
uma decisão remota mais nova.

**Nunca se confia só no Realtime.** No iPhone o Safari mata o WebSocket quando o
app vai para segundo plano: ali o caso normal não é "recebe o evento", é
"reconecta e descobre o que perdeu". O delta é o caminho principal, não o
remendo. E ele relê com **sobreposição** de 30s, porque ordem de *commit* não é
ordem de `servidor_em`: uma transação que começou antes e terminou depois pode
ter `servidor_em` menor do que uma já lida, e cairia no buraco entre duas
leituras. Reler não custa nada — `aplicarRemoto` é idempotente.

#### O render não destrói o que se está digitando

Metade da edição deste app é `contenteditable` com `onblur`. Um `renderTrilhos()`
disparado no meio de uma digitação troca o nó sob o cursor, e o `onblur` lê um
texto que já não existe. Hoje isso não acontece porque `buscarEstado()` só roda
no boot, no `online` e no `visibilitychange`; com Realtime, passa a poder
acontecer a qualquer segundo.

`SYNC.pedirRender()` acumula os pedidos e descarrega quando é seguro. **Adia
enquanto houver foco em campo editável e enquanto uma drenagem estiver em
curso. Não adia por fila cheia** — uma fila parada por falta de rede congelaria
a tela para sempre, o que troca um problema raro por um permanente.

#### O isolamento em relação ao CONTAS_CASA

O projeto Supabase é **o mesmo**, e deve continuar sendo. O isolamento não vem de
separar projetos; vem de três coisas:

1. **Espaço de nomes.** Todo objeto do Cronograma nasce com o prefixo `cron_`.
   O CONTAS_CASA tem `push_inscricao`; o Cronograma tem `cron_push_inscricao`.
   Nenhuma colisão, e nenhum objeto da casa é lido, alterado ou referenciado.
2. **RLS presa ao dono.** Toda política do Cronograma exige
   `dono = auth.uid() and cron_e_dono()`, e nenhuma é do papel `anon`.
3. **A allowlist `cron_dono`.** A autenticação é compartilhada no nível do
   projeto — **mas estar autenticado não faz de ninguém dono de um Cronograma**.
   Sem ela, `dono = auth.uid()` daria isolamento de leitura correto e ainda assim
   deixaria qualquer conta do projeto *criar* linhas de Cronograma. Isolamento
   por acidente não é isolamento.

O Realtime é **acrescentado**, nunca recriado: o CONTAS_CASA já publica
`lancamento` e `modelo`, e um `drop publication` os derrubaria.

O bloco 14 do `teste_sync.js` verifica isso mecanicamente contra a lista real de
objetos da casa, em vez de confiar em ter lido o arquivo com atenção.

#### O que ainda é do GitHub

**Tudo.** `enviarToques`, `gravarNoGitHub`, `buscarEstado`, `buscarEntrada`,
`checkUpdate` e o workflow `dobrar-toques.yml` continuam intactos e continuam
sendo a verdade operacional. Os ouvintes de `online`, `visibilitychange` e
`pagehide` do `40-app.js` não foram tocados: a camada nova acrescentou os seus
próprios, incluindo um `offline`, que o aplicativo não tinha.

### 9B — Prioridades online, implementada

O primeiro domínio a usar a camada. **Uma prioridade criada, editada, marcada,
desmarcada ou apagada num aparelho aparece no outro sem recarregar**, e sem
passar pelo GitHub.

#### Um escritor, e ele já existia

As cinco operações — `addPrioridadeTrilho`, `addPrioridadeLivre`,
`editPrioridade`, `togglePrioridadeFeita`, `delPrioridade` — **já passavam todas
por `tocarPrioridade()`**. Foi ali, e só ali, que o caminho online entrou. A 9B
não criou um segundo escritor porque não precisou de um.

**O mesmo instante vai nos dois caminhos.** O `iso` nasce do
`instanteDoToque()`, o relógio monotônico do aparelho, e é o que o toque já
levava; passá-lo ao `SYNC` em vez de deixá-lo gerar outro garante que os dois
digam a mesma coisa sobre *quando* a decisão foi tomada. Sem isso a comparação
da Fase 9F não teria sentido — e, pior, o mesmo ato poderia vencer por um
caminho e perder pelo outro.

**O payload sai do `dadosDaPrioridade()`**, e não de um objeto montado à mão.
Montar de novo repetiria o defeito do `dadosDoEvento` de 29/08: no dia em que um
campo novo começasse a viajar, um dos dois montadores ficaria para trás.

#### Um merge, usado pelas duas descidas

A 9B deu às prioridades uma **segunda** descida (o Realtime) ao lado da que já
existia (o `estado.json`). Duas descidas para o mesmo dado são exatamente o
defeito que este repositório já pagou uma vez — então o merge foi extraído para
`mesclarPrioridade(lista, prid, r)`, em `10-nucleo.js`, e **as duas o chamam**:
`aplicarPrioridadesDoEstado` num laço, `aplicarPrioridadeOnline` uma vez. Se a
regra mudar, muda para os dois no mesmo ato.

Isso importa por um caso concreto do período de convivência: o caminho legado
pode aplicar algo mais novo **por fora** do cache do `SYNC`. O relógio do `SYNC`
não veria; o `em` do item local vê. **Duas guardas, e a segunda não é lógica
paralela — é a mesma função.**

#### Por registro, nunca por semana

A chave é `AAAA-Wnn/prid`, e a identidade lógica da prioridade é `sem + prid`: o
mesmo `prid` pode existir em semanas diferentes, e a lista local é por semana.
**Só o item alterado é tocado** — duas prioridades da mesma semana, alteradas em
dois aparelhos, não se atropelam. O servidor guarda duas linhas, não um retrato
da semana.

| Verbo | O que viaja |
|---|---|
| criar | a linha inteira, com `tipo`, `painel`, `projId`, `t` |
| editar | a linha, com o `t` novo |
| marcar | `feito_em` com a **data**, nunca um booleano |
| desmarcar | `feito_em: ""` — **ausência do campo nunca é desmarcação** |
| apagar | `del: true` — lápide, nunca ausência de linha |

`feito_em` é data e não booleano pela razão de sempre: a regra de tela depende
de *quando* foi cumprida — hoje fica marcada, amanhã sai —, e um booleano
obrigaria cada aparelho a adivinhar o dia.

#### Offline, reconexão e a tela

Tudo pela 9A, sem nada novo: a decisão entra na fila antes da rede, a fila
sobrevive a recarregar a página, e a reconexão traz canal → delta → fila, nessa
ordem. Um aparelho que chega depois recupera pelo delta.

A alteração local é **otimista** (a tela mostra antes de o servidor confirmar) e
a remota chama `renderHoje()` pelo `SYNC.pedirRender()` — portanto **com a
guarda de foco**: nada é redesenhado enquanto houver um `contenteditable` em
edição.

#### O que a 9B não mudou

O motor de prioridades, as regras do Hoje, Trilhos, TOEFL, Vagas, Metas,
Eventos, Retomadas, `cron:checks`, o Web Push e **todo o caminho de
toques/GitHub**. `tocarPrioridade` continua emitindo o toque legado em toda
operação, e `aplicarPrioridadesDoEstado` continua existindo e funcionando. Os
dois caminhos convivem até a Fase 9G.

**Nenhuma alteração no esquema foi necessária:** o domínio `prioridade`, a chave
`AAAA-Wnn/id` e a coluna `del` já estavam em `sql/cron_estado.sql` desde a 9A.

#### Testes

`scripts/teste_sync.js`, seções 15 a 23 — dois aparelhos de verdade contra o
mesmo servidor de mentira, exercitando o caminho inteiro: ação da tela →
`tocarPrioridade` → `SYNC` → gatilho do relógio → Realtime →
`aplicarPrioridadeOnline` → `cron:prioridades` do outro aparelho.

A seção 23 é de arquitetura, e é a que quebra se alguém acrescentar um segundo
escritor: verifica que existe **um** `SYNC.salvarAlteracao("prioridade", …)` no
código, que ele está dentro do `tocarPrioridade`, que há **uma** implementação de
`mesclarPrioridade` e que as duas descidas a usam.

### O esquema em produção

Aplicado em **07/09**, no mesmo projeto Supabase do CONTAS_CASA. O que existe
agora: `cron_dono`, `cron_estado`, `cron_registro`, `cron_estrutura_base`,
`cron_e_dono()`, `cron_estado_relogio()`, `cron_podar()` e 7 políticas. A
allowlist tem **uma** linha.

**A casa ficou intacta**, verificado antes e depois: 34 lançamentos, 20 modelos,
2 perfis, 16 políticas e 9 funções, iguais. O Realtime passou de
`lancamento, modelo` para `cron_estado, cron_registro, lancamento, modelo` —
acréscimo, não substituição.

*Provado contra o banco, não só contra o teste:*

| Caso | Resultado |
|---|---|
| Jonathan (na allowlist) lê o próprio estado | vê a linha, `cron_e_dono()` = true |
| Diva (autenticada, fora da allowlist) lê o Cronograma | **0 linhas**, `cron_e_dono()` = false |
| Diva insere em `cron_estado` | **bloqueado** |
| Diva se declara dona em `cron_dono` | **bloqueado** |
| Diva lê os próprios lançamentos da casa | **34 — o isolamento está no lugar certo** |
| `anon` lê `cron_estado` | **bloqueado** |
| `anon` executa `cron_e_dono()` | **bloqueado** |
| `anon` insere em `cron_push_inscricao` (Fase 8) | **funciona, como deve** |
| Gravar `em` antigo por cima de `em` novo | **o gatilho descartou o atrasado** |

*Uma correção que o linter do Supabase pegou.* O arquivo dizia
`revoke all on function public.cron_e_dono() from anon`, e isso **não basta**: o
Postgres concede `EXECUTE` a `PUBLIC` ao criar a função, e `anon` herda de
`PUBLIC`. A função ficava exposta em `/rest/v1/rpc/cron_e_dono` para quem tem a
chave publishable. Não havia vazamento — sem sessão ela devolve sempre `false` —,
mas a intenção declarada era negar. Corrigido com `revoke ... from public`. O
`cron_podar()` já revogava de `public` e por isso passou limpo.

### 9C-0 e 9C-1 — o caminho legado corrigido antes de conectar

Duas correções que **não conectam nada**: Metas e Eventos continuam viajando só
pelo caminho de toques. Existem para que a 9C-2 não tenha de depurar dois
sistemas ao mesmo tempo.

#### O relógio de Metas e Eventos

`tocarMeta()` e `tocarEvento()` não devolviam nada, e cada caller carimbava o
`em` com o próprio `new Date()`. O `instanteDoToque()` é **monotônico**: quando
duas ações caem no mesmo milissegundo ele desempata somando 1ms, e o relógio de
parede do caller não acompanha.

**Medido antes da correção**, com `new Date()` e `Date.now()` congelados juntos
— congelar só um mediria a instrumentação, não o mecanismo:

| Ação | `em` do caller | `quando` do toque |
|---|---|---|
| 1ª no milissegundo | `…000Z` | `…000Z` — coincidem |
| 2ª no mesmo ms | `…000Z` | `…001Z` — **divergem** |
| 3ª no mesmo ms | `…000Z` | `…002Z` — **divergem** |

Prioridades: **zero divergências**, em qualquer posição — o `tocarPrioridade` da
9B devolve o iso desde o primeiro dia.

O pior caso era o `trazerTodas()`: N metas nascendo com **um `agora`
compartilhado**, enquanto o relógio dava a cada toque um instante próprio.

Enquanto só existe o caminho do GitHub isso é quase inócuo — a descida reescreve
o item com o mesmo conteúdo. **A partir do momento em que o `em` decide quem
vence**, um `em` local mais antigo do que o instante publicado faz o próprio ato
voltar como se fosse novidade de fora. Por isso a correção vem antes.

A regra passa a ser, nos três domínios: ação → funil → `enfileirarToque` →
devolve o ISO → o caller grava esse ISO em `em`.

Uma exceção documentada: renomear um evento **privado que já subiu** não emite
toque — e aí o `em` avança com o relógio de parede mesmo, porque não há instante
publicado a copiar. É o único caminho de escrita destes domínios que
legitimamente carimba o próprio tempo.

#### O segundo escritor

`publicarAcervo` chamava `enfileirarToque` direto, contornando os funis:

```
antes:  meta 2 escritores · evento 2 escritores · prioridade 1
depois: meta 1 escritor   · evento 1 escritor   · prioridade 1
```

Os funis ganharam um parâmetro `quandoISO` para que o piso `ACERVO_EM` coubesse
neles. O payload não mudou um byte: o que `publicarAcervo` montava à mão era
idêntico, campo por campo, ao que o funil monta.

#### A vista da Revisão

`renderRevisao()` **devolve** HTML; quem o pintava era o `setView`, e só ele.
Com a aba Revisão aberta, uma prioridade marcada no outro aparelho chegava,
entrava no `cron:prioridades` e não aparecia — a tela só mudava ao sair e voltar
da aba. O aplicador remoto pedia `renderHoje`, que escreve em `view-hoje`, e
naquele momento `view-hoje` está `hidden`.

`renderVistaRevisao()` repinta `view-revisao`, e **só se ela estiver na frente**.

> **`renderSemana` não entrou nesta correção**, e a auditoria da 9C estava errada
> ao dizer que a revisão morava nele: a linha estava dentro do `setView`.
> Verificado no corpo real da função — `renderSemana` não lê `getPrio`,
> `getMetas` nem `getEventos`, e não tem o que atualizar. A regra da 9C-1 é a
> **menor repercussão correta**.

#### Testes

`teste_sync.js`, seções 26 a 28. O harness ganhou um relógio congelável que
substitui `new Date()` **e** `Date.now()` juntos. A seção 27 é arquitetural e
quebra se um segundo escritor voltar, ou se metas/eventos passarem a escrever
online antes da hora.

### 9C-2 — Metas online

O **segundo domínio** na camada. Eventos continuam legados.

**A chave é `AAAA-MM/mid`**, e a unidade de sincronização é a meta, nunca o mês.
Duas metas do mesmo mês, alteradas em dois aparelhos, não se atropelam: o
servidor guarda duas linhas, não um retrato do mês.

O mês entra na **chave** e não no valor por causa do `trazerMeta`: ele *move*
uma meta de um mês para outro, e com o mês na chave mover é **criar + lápide** —
duas linhas, semântica explícita. Se o mês fosse um campo do valor, mover seria
um update ambíguo.

| Verbo | O que viaja |
|---|---|
| criar / editar | `{t, done, de}` |
| concluir / desconcluir | `done` — **`feito_em` não entrou nesta fase** |
| excluir | `del: true` — lápide, nunca ausência de linha |
| trazer | criação no destino **e** lápide na origem, nessa ordem |

`em` **não entra no valor**: é coluna do `cron_estado`, e é por ela que o gatilho
decide. Duplicá-lo no `jsonb` criaria duas fontes para o mesmo fato.

#### Um merge, duas descidas

`mesclarMeta(lista, mid, r)` foi extraído de dentro do `buscarEstado()` e é
chamado por `aplicarMetasDoEstado` (legado) e `aplicarMetaOnline` (9C-2) — o
mesmo movimento que a 9B fez com as prioridades.

A regra foi copiada **letra por letra**, e a fidelidade importa mais do que a
elegância: a meta *não* substitui o item inteiro como a prioridade faz. O `t` só
é sobrescrito quando vem preenchido, o `de` só é escrito quando vem (nunca
apagado), e o `done` é sempre sobrescrito porque `false` é um valor legítimo.
Mudar isso seria mudar regra de negócio, e a 9C-2 não muda nenhuma.

#### Os renders, mínimos

| | |
|---|---|
| `renderMetas` | sempre — repinta o próprio `#metas-wrap` no lugar |
| `renderVistaRevisao` | sempre — a revisão **lê `getMetas`** (conta as metas concluídas na semana), e a função devolve na primeira linha quando a aba não está visível |
| `renderHoje` | **só no domingo** — o único dia em que a revisão é desenhada dentro do Hoje. Nos outros dias o Hoje não lê meta nenhuma: o aviso da esteira e as pendências moram dentro do `renderMetas` |
| `renderSemana` | **nunca** — verificado que não lê `getMetas` |

#### Offline, reconexão e `trazerMeta`

Tudo pela 9A. O cenário testado é o cruzado: o Mac sem rede altera uma meta, o
celular altera outra, o Mac reconecta — o delta traz a do celular **antes** de a
fila subir, e nada se perde.

`trazerMeta` enfileira **duas** operações. Sem rede, as duas ficam e sobem
juntas. Se só a primeira subisse, o outro aparelho veria a meta **duas vezes** —
visível e auto-corrigível na drenagem seguinte — em vez de nenhuma vez. A ordem
criar-antes-de-apagar existe para isso.

`trazerTodas` traz **todas** as pendências, inclusive a semente do `ROTEIRO`
daquele mês: `metaEhSementeIntocada` vale só para o acervo, não para
`pendencias()`. Cada meta trazida recebe o **seu** instante — a correção da
9C-0 continua valendo aqui, que era o pior caso dela.

#### Sem alteração no esquema

`sql/cron_estado.sql` **não foi tocado**. O domínio `meta`, a chave `AAAA-MM/id`
e a coluna `del` já estavam desde a 9A. Nada foi aplicado ao banco.

#### Testes

`teste_sync.js`, seções 29 a 36 — os 20 casos, com dois aparelhos contra o mesmo
servidor de mentira. A seção 36 é arquitetural: quebra se um segundo escritor de
meta aparecer, se surgir uma segunda `mesclarMeta`, ou se `renderSemana` for
acrescentado sem dependência.

### 9C-3 — Eventos online

O **terceiro domínio** na camada. A chave é o **próprio id do evento**, sem
composição: diferente da meta, o evento não pertence a um período.

**Mudar a data é uma edição, não um "mover".** O `id` é estável e `data` é um
campo do valor — não há criação no destino nem lápide na origem, porque não há
origem: é o mesmo evento, noutro dia. Uma linha só no servidor.

| Verbo | O que viaja |
|---|---|
| criar / editar | `{data, priv}` **e `t` só quando o evento é público** |
| mudar a data | o campo `data`, na mesma linha |
| marcar privado | `priv` — a marca sempre viaja |
| excluir | `del: true` — lápide, nunca ausência de linha |

**Não há concluir/desconcluir**: o modelo do evento é `{id, t, data, em, priv}` —
não existe `done`, e a 9C-3 não inventou um.

#### A privacidade não foi ampliada, e a garantia é estrutural

O payload online sai do **mesmo `d`** que o toque legado leva, e `dadosDoEvento`
**não monta** o campo `t` quando o evento é privado. O título privado não chega
ao Supabase pelo simples fato de não existir no payload — não há um segundo
lugar onde alguém possa esquecer de filtrar.

A **9C-4** move essa fronteira sem abrir a pública — ver abaixo.

Duas cláusulas do merge protegem isso e **não podem ser "simplificadas"**:

- `if(!r.data) return false` — evento sem data é ignorado; a data é o que faz o
  evento existir.
- `if(!r.priv && typeof r.t === "string")` — o título só é escrito quando
  **viajou**. Num evento privado o nome local é a única cópia que existe. O
  `typeof` importa: string vazia é um título legítimo (apagado de propósito),
  **ausência** do campo é "não viajou". Trocar por `if(r.t)` transformaria
  apagar um título em não-fazer-nada.

#### Os renders, mínimos

Os mesmos três da meta, pela mesma medição: `renderEventos` sempre (repinta o
próprio `#eventos`, e o aviso de dias restantes se recalcula sozinho),
`renderVistaRevisao` sempre (a `revisaoDaSemana` **lê `getEventos`** para a
seção "próxima semana"), e `renderHoje` **só no domingo**. `renderSemana`
nunca — verificado que não lê `getEventos`.

#### Sem alteração no esquema

`sql/cron_estado.sql` **não foi tocado**: o domínio `evento`, a chave textual e
a coluna `del` já existiam desde a 9A. Nada aplicado ao banco.

#### Testes

`teste_sync.js`, seções 37 a 42. A seção 40 é inteira sobre a fronteira de
privacidade: verifica que a marca sobe, que o título **não** sobe, que o título
que o outro aparelho já tinha não é apagado pela descida, e que renomear um
privado já publicado não gera escrita online.

### 9C-4 — O título de evento privado, online

**O título de um evento privado passa a sincronizar entre os aparelhos do dono,
sem entrar no caminho público.** Havia dois títulos possíveis e agora há dois
destinos, com uma diferença de exatamente um campo:

| | payload legado (GitHub) | registro online (Supabase) |
|---|---|---|
| evento público | `data`, `priv`, **`t`** | `data`, `priv`, **`t`** |
| evento privado | `data`, `priv` | `data`, `priv`, **`t`** |
| lápide | `del` | `del`, **sem `t`** |

#### Por que `cron_estado` é lugar seguro para ele

Não é "porque não é o GitHub". São duas propriedades, e as duas foram
verificadas:

1. **Os dois canos são disjuntos.** O `estado.json` é escrito pelo
   `dobrar_toques.py` a partir dos *toques*; nada em `cron_estado` alcança o
   repositório, nem o `entrada.json`, nem o `cron:la-fora`. O título privado não
   entra no toque, logo não existe caminho por onde chegar lá — e há **dois
   guardas independentes** nesse cano: `dadosDoEvento` não monta o campo, e a
   dobra o recusa outra vez.
2. **A RLS de `cron_estado`** exige `dono = auth.uid() AND cron_e_dono()`, e não
   há política nenhuma para o papel `anon`. Provado contra o banco em produção:
   uma conta autenticada fora da allowlist enxerga **zero linhas**.

O título privado fica visível para os aparelhos **autenticados como o dono**, e
para mais ninguém. É o mesmo modelo de acesso que a 9A definiu.

| Pergunta | Resposta |
|---|---|
| aparece em `estado.json`? | não — o toque não o carrega |
| em `entrada.json`? | não — é escrito pelo pipeline, não pelo app |
| em `cron:la-fora`? | não — ali há um **booleano**, nunca o texto |
| no payload legado? | não — dois guardas independentes |
| em `cron_estado`? | **sim**, e é o ponto: privado por RLS |
| alguém não autorizado recebe? | não — sem política para `anon` |
| um aparelho autorizado recupera ao reconectar? | sim, pelo delta |
| voltar a público converge? | sim — `dadosDoEvento` volta a montar o `t` |

#### As três mudanças de código

- **`tocarEvento`** passa o título ao registro online lendo de `ev.t`, e **não**
  de `d.t`: o `d` é o payload público, e nele o campo não existe quando privado.
  São dois payloads de propósito, e a diferença entre eles está neste único
  lugar.
- **`mesclarEvento`** perdeu a cláusula `!r.priv`: o título entra **quando
  viajou**, não quando "é público". Aquela cláusula era cinto sobre suspensório
  — o `typeof r.t === "string"` já recusava sozinho, porque o payload legado não
  monta o campo. Com o online passando a carregá-lo, ela deixaria de ser
  redundante e viraria um **bloqueio**.
- **`editEv`** ganhou o modo `soOnline`: renomear um privado que já subiu não
  gera toque (seria uma reconstrução do Pages à toa) mas **atualiza o registro
  online**. Era a lacuna que a 9C-3 deixou.

Efeito colateral bem-vindo: esse modo pede o instante ao mesmo relógio
monotônico, e com isso **desaparece a última exceção da 9C-0** — não há mais
nenhum caminho de escrita destes domínios carimbando o próprio `new Date()`.

#### Sem alteração no esquema

`sql/cron_estado.sql` **não foi tocado**. Nenhuma tabela nova, nenhuma coluna
nova: o `valor jsonb` já comportava o campo, e a RLS que o protege já existia.

### 9D (1 de 5) — Triagem das Vagas online

O **quarto domínio** na camada, e o primeiro da Fase 9D. Retomadas, registro,
rotinas e dispensas continuam legados.

**A chave é o id da vaga** — `philjobs-31649` —, que é estável e sobrevive à
coleta semanal: `dados/vagas.json` é reescrito inteiro toda segunda, e a decisão
não se perde porque nunca morou lá. O valor leva **só `{st}`**.

**Veredicto e triagem continuam sendo dois eixos.** O veredicto é do coletor e
vem no arquivo; a triagem é a sua decisão. A 9D transporta **apenas a decisão** —
nada de veredicto, título, prazo ou url. Há teste para cada um desses campos.

**Não há lápide, e a ausência é do domínio.** Descartar uma vaga **não a apaga do
lote**: ela continua em `dados/vagas.json`. "Não marcada" é um estado
(`VG_ST.NOVO`, `st` 0) e viaja como qualquer outro — é assim que *desmarcar*
atravessa aparelhos.

#### Duas correções que vieram junto

**O `vgMarcar` carimbava o próprio `em`** com `new Date()`, enquanto o toque
usava o `instanteDoToque()`. É a mesma divergência que a 9C-0 mediu e corrigiu em
metas e eventos, e que aqui ainda existia — marcar várias vagas em sequência é
exatamente o caso em que o monotônico desempata e o relógio de parede não
acompanha. Agora o instante vem do funil, e o `quando` (o dia que a tela mostra)
é derivado dele.

**Havia dois escritores**: o `vgMarcar` e a `migrarTriagemUmaVez`, que publicava
as marcações anteriores à sincronia chamando `enfileirarToque` direto. A migração
passou a usar o funil — e com isso aquelas marcações antigas entram **também** no
estado online.

#### Os renders, todos comprovados

| | Por quê |
|---|---|
| `renderVistaVagas` | `vgRender` lê `vgEstado` — só redesenha com a aba na frente |
| `renderHoje` | `renderVagasIndicador` → `contagemDeVagas` → `vgEstado` |
| **`renderSemana`** | **lê `vgEstado`** — o primeiro domínio em que ele entra |
| `renderVistaRevisao` | `revisaoDaSemana` lê `vgEstado` |

`renderSemana` ficou de fora nas fases 9C-2 e 9C-3 porque não lia meta nem
evento. Lê triagem, e por isso entra — por prova, não por segurança. E
`renderHoje` entra **todo dia**, e não só no domingo como nas metas, porque o
indicador de vagas do Hoje depende da triagem sempre.

#### Sem alteração no esquema

`sql/cron_estado.sql` **não foi tocado**: o domínio `triagem` e a chave por id da
vaga já existiam desde a 9A. Nada aplicado ao banco.

#### Testes

`teste_sync.js`, seções 46 a 50 — os casos A a O. A seção 50 é arquitetural e
quebra se um segundo escritor voltar, se surgir uma segunda `mesclarTriagem`, ou
se um domínio ainda não autorizado passar a escrever online.

### 9D (2 de 5) — Retomadas silenciadas online

O **quinto domínio**. Registro, rotinas e dispensas continuam legados.

**A chave é `painel/projeto`** e o valor leva **só o `ate`** — a data absoluta até
a qual o projeto fica silenciado. O título e o estágio são lidos do trilho no
aparelho que desenha, e nunca viajam: é a regra da Fase 6B, que esta fase não
muda.

**O `ate` é data absoluta, não duração.** Um toque que chega três dias depois
carrega a data que foi decidida; se viajasse "+14 dias", a latência da rede
mudaria o resultado.

**Não há lápide, e a razão é própria do domínio:** não existe operação de
*dessilenciar*. A entrada morre pela data que ela mesma carrega — vencida, some
dos dois leitores sem toque nenhum.

#### Uma cláusula que não pode ser simplificada

```js
var emLocal = (loc && typeof loc === "object") ? (loc.em || "") : "";
```

A entrada local pode ser uma **string** — a forma anterior à Fase 6B, que o
`migrarRetomadas` converte. Entre o carregamento e a migração ela existe, e ler
pelas duas formas evita que um aparelho que falhe na migração passe a ignorar
silêncios que ele mesmo pôs. Trocar por `loc.em` daria `undefined`, o `>=` seria
sempre falso, e qualquer linha remota venceria. Há teste para esse caso.

#### O que já estava certo

**O `em` não precisou de correção.** O `adiarRetomada` sempre gravou o instante
devolvido pelo toque — ao contrário do `vgMarcar` da 9D.1, que carimbava o
próprio. Não havia divergência de relógio neste domínio: faltava só o caminho
online e o escritor único.

**Havia dois escritores**: `adiarRetomada` e `migrarRetomadas`. A migração passou
pelo funil, e com isso os silêncios anteriores à sincronia entram também no
estado online.

#### Os renders, ambos comprovados

| | Por quê |
|---|---|
| `renderHoje` | `renderRetomadas()` lê `retomadas()`, **e** `renderPrioridades` → `motorDePrioridades()` lê `retomadasAdiadas()` |
| `renderVistaRevisao` | `revisaoDaSemana` lê `retomadas()` **e** `motorDePrioridades()` |

**`renderSemana` não entra** — verificado que não lê retomada nenhuma. É o
inverso da 9D.1, onde ele entrou por ler `vgEstado`. E `renderHoje` entra **todo
dia**, porque o bloco de retomadas está sempre no Hoje.

#### Sem alteração no esquema

`sql/cron_estado.sql` **não foi tocado**. Nada aplicado ao banco.

#### Testes

`teste_sync.js`, seções 51 a 54.

### 9D (3 de 5) — Registro datado online

O **sexto domínio** a sair do caminho legado, e o primeiro que **não é um
domínio do `cron_estado`**. Rotinas e dispensas continuam legadas.

#### Por que ele tem tabela própria

O registro **não é estado corrente**. Não existe "vence o mais recente" para
ele: cada linha vale por si e a lista só cresce. As três peças que governam
todos os outros domínios — o relógio, o cache e a lápide — existem para decidir
entre *versões do mesmo fato*, e aqui não há versões. Fechar uma etapa e depois
recuá-la são **dois fatos**, e os dois ficam.

Por isso a linha vai para `cron_registro`, que já existia desde a 9A, e por isso
ela **não passa** pelo `salvarAlteracao`, pelo `aplicarRemoto` nem pelo
`assinarDominio`. `registro` não está — e não deve estar — na lista de domínios
do `SINCRONIA.DOMINIOS`: o `CHECK` do Postgres na `cron_estado` não o conhece.

| | estado corrente | registro datado |
|---|---|---|
| tabela | `cron_estado` | `cron_registro` |
| chave | `(dono, domínio, chave)` | `(dono, id do toque)` |
| relógio | `em`, LWW por aparelho | não tem |
| lápide | `del` | não tem |
| escrita | `upsert` | `insert ... on conflict do nothing` |
| assinatura | `SYNC.assinarDominio` | `SYNC.assinarRegistro` |

#### A chave é o id do toque, e é isso que faz os dois caminhos conviverem

A linha em `cron_registro` tem como chave primária **o mesmo id do toque** que o
caminho do GitHub grava em `tid` ao receber pelo `historico`. Consequência: uma
linha que desceu pelo Supabase **já está vista** quando o `estado.json` trouxer
o mesmo toque, e vice-versa. Os dois caminhos convivem até a 9G sem duplicar
linha, e sem precisarem saber um do outro — a chave basta.

Para isso a fórmula do id saiu de dentro do `enfileirarToque` e virou
`idDoToque(iso)`, usada pelos dois. Duas fórmulas iguais em dois lugares seriam
uma divergência esperando acontecer.

#### O motivo viaja — e só por aqui

O `semMotivo()` corta o motivo do toque porque **aquele** repositório é público e
nunca podado. A razão é do repositório, não do registro. Esta base é privada, a
coluna `motivo` foi criada para isto na 9A, e não mandá-la custaria informação: o
caminho legado ao menos avisa que *existe* um motivo do outro lado
("motivo registrado no outro aparelho"), e o online, com a coluna vazia, avisaria
**menos** do que o legado. O rótulo continua sendo do caminho do GitHub, onde ele
é a única coisa que dá para dizer.

#### Uma fila, duas marcas

A subida do registro entra na **mesma fila** (`cron:sync-fila`), com a mesma
drenagem, o mesmo corte por id e o mesmo teto. Duas filas seriam dois mecanismos
de offline, e o segundo seria o que ninguém exercita. O ponto de entrada virou
um só, `syncEnfileirar()`.

A **marca de entrega**, ao contrário, é própria: `cron:sync-marca-reg`. O
`servidor_em` de `cron_registro` e o de `cron_estado` são sequências
independentes; uma marca só faria a entrega de uma tabela adiantar o ponto de
partida da outra, e o catch-up da segunda pularia o que ficasse entre as duas
leituras.

O Realtime, esse sim, é **um canal só** com dois `.on`: um canal por tabela
seriam dois WebSockets a manter de pé, dois a morrer no segundo plano do Safari
e dois a reconectar, sem nada a ganhar.

#### `on conflict do nothing`, e não um upsert

O `grant` da `cron_registro` é `select, insert` — sem `update`, de propósito:
linha de histórico não se reescreve. Um upsert de verdade seria negado pelo
Postgres. E reenviar a mesma linha depois de uma drenagem que caiu no meio tem
de ser **silêncio**, não erro: um erro ali travaria a fila para sempre no mesmo
item.

#### Os três renders

| | Por quê |
|---|---|
| `renderRegistro` | é o painel do registro, dentro de Trilhos |
| `renderSemana` | chama `ritmoDoRegistro()`, que lê `getReg()` |
| `renderVistaRevisao` | `revisaoDaSemana` lê `getReg()` |

São **três**, e não o `renderRegistro` sozinho que a descida legada chama. A
assimetria do caminho legado é anterior a esta fase e não foi tocada.

#### Sem alteração no esquema

`sql/cron_estado.sql` **não foi tocado**: a `cron_registro`, suas políticas, seu
`grant` e sua entrada na publicação do Realtime existem desde a 9A. Nada
aplicado ao banco.

#### Testes

`teste_sync.js`, seções 55 a 58. O Supabase de mentira ganhou a segunda tabela,
com a chave primária de verdade, e **recusa** um upsert em `cron_registro` que
não peça `on conflict do nothing` — um servidor de teste mais permissivo do que
o real não prova nada. O canal falso passou a guardar um callback por tabela:
guardar só o último faria o teste do registro passar e o do estado sumir sem
ninguém perceber.

### 9D (4 de 5) — Rotinas do dia online

O **sétimo domínio**, e o primeiro que **não tinha caminho legado nenhum**.
Dispensas continuam legadas.

#### A marca de rotina nunca atravessou aparelho

Não havia toque `rotina` nem seção no `estado.json`: `cron:checks:AAAA-MM-DD`
sempre foi local, e o código dizia isso em três lugares. A razão estava
registrada e era boa — *"histórico permanente em repositório público por um
valor que morre numa semana"*. Numa base privada e podável a razão não
sobrevive, e o que sobra é a discordância: marcar uma rotina no Mac e o iPhone
mostrar o dia incompleto é exatamente o tipo de coisa que faz alguém deixar de
confiar no app.

Logo: **não há caminho legado a preservar aqui, só um a estrear**. Nenhum toque
`rotina` foi inventado — o caminho do GitHub sai na 9G, e não é hora de lhe
acrescentar mecanismo. Há teste que verifica justamente isso.

#### Um funil onde havia três escritores

`toggleCheck`, `marcarAtrasada` e `limparHoje` gravavam `cron:checks` cada um
por conta própria. Enquanto a marca era local isso não custava nada; a partir do
momento em que ela viaja, três escritores seriam três chances de uma marca ficar
só num aparelho. Os três passam agora por `tocarRotina(dia, id, feito)`.

**`limparHoje` deixou de esvaziar a gaveta.** Zerar o objeto apagava as marcas
sem dizer a ninguém que elas caíram: o outro aparelho continuaria mostrando o
dia cheio, e a próxima descida traria tudo de volta. Agora cada id vira
`{feito:false}` — e para quem lê (`if(ck[id])`) `false` e ausência são a mesma
coisa, então nada muda na tela.

#### Sem lápide, e a ausência é do domínio

**"Não marcada" é um estado**, e é assim que *desmarcar* atravessa aparelhos —
mesmo desenho da triagem da 9D.1. A lápide existe para dizer "isto foi apagado";
aqui não se apaga nada, alterna-se um booleano.

#### `expira_em`, porque a marca morre de velha

É o único domínio, com `dispensa`, que preenche `expira_em`: **90 dias contados
a partir do dia da marca**, não do envio. `atrasadas()` lê sete dias para trás e
a revisão lê a semana corrente — marca de rotina com mais de 90 dias não é lida
por ninguém, e o `cron_podar()` a leva. Isso não contraria *"nada se perde"*:
aquilo vale para decisão, e a marca do dia não é uma.

#### O relógio mora no cache, e é suficiente

`cron:checks:` é `{id: booleano}` e **nunca guardou instante** — não há, e não
deve haver, um `mesclar*` comparando `em` local. Quem decide é o cache da
camada, no `aplicarRemoto`, que já recusou o que não é mais novo antes de o
aplicador ser chamado. A regra não tem furo porque `cron:sync-cache` e
`cron:checks:` moram no **mesmo** localStorage: somem juntos e voltam juntos —
o mesmo argumento que sustenta "toque meu não desce nunca" no registro.

#### A cópia em memória

`checks` é uma cópia em memória do dia de hoje, lida uma vez no carregamento.
Gravar em `cron:checks` sem atualizá-la faria o `renderHoje` repintar o valor
velho e a marca recebida sumir da tela. O funil e o aplicador atualizam os dois.

#### Os dois renders

| | Por quê |
|---|---|
| `renderHoje` | as caixas do dia e o bloco "ficou para trás" (`atrasadas()`) |
| `renderVistaRevisao` | `revisaoDaSemana` conta as rotinas concluídas |

**`renderSemana` não entra** — verificado que não lê `cron:checks`.

#### O rótulo "neste aparelho" saiu

A revisão dominical dizia *"3 rotinas concluídas · neste aparelho"*. A ressalva
existia porque o número era local; agora não é. Mantê-la seria dizer ao leitor
uma coisa que o programa não faz mais.

#### Sem alteração no esquema

`sql/cron_estado.sql` **não foi tocado**: `rotina` está no `CHECK` de domínios,
o contrato da chave (`AAAA-MM-DD/idDaRotina`) e do valor (`{feito}`) está escrito
lá desde a 9A, e o `expira_em` e o `cron_podar()` foram feitos para este caso.
Nada aplicado ao banco.

#### Testes

`teste_sync.js`, seções 59 e 60.

### 9D (5 de 5) — Dispensas online, e a Fase 9D fechada

O **oitavo domínio**, e o par exato da 9D.4: `cron:hoje-dispensados` também
nunca atravessou aparelho, pela mesma razão registrada no esquema, e também
**estreia em vez de migrar**. Nenhum toque `dispensa` foi inventado.

Com ela a **Fase 9D está completa**: vagas, retomadas, registro, rotinas e
dispensas. Sete domínios de estado mais a tabela do registro.

#### As duas formas da chave

| | forma |
|---|---|
| no aparelho | `AAAA-MM-DD\|id` (barra vertical) |
| no estado online | `rotina/AAAA-MM-DD/id` |

O prefixo não é enfeite: a tabela guarda os dois tipos de dispensa na mesma
chave composta. O esquema prevê desde a 9A uma segunda forma,
`meta-aviso/AAAA-MM`, que **nada ainda escreve** — e o aplicador a **ignora**
em vez de adivinhar. Gravar um formato que nenhum leitor entende sujaria a
gaveta sem ninguém notar. Uma chave de três partes com o prefixo errado é o
caso que só a checagem do prefixo pega, e há teste para ele.

#### Sem lápide

Não existe "desdispensar". A entrada some sozinha quando o dia sai da janela de
sete dias, e do servidor pelo `expira_em` — **90 dias a partir do dia
dispensado**, a mesma vida da marca de rotina, pelo mesmo `rotinaExpira()`.

#### A poda local continua onde estava

`podarDispensados()` corta as entradas com mais de sete dias, e continua sendo
chamada **na escrita**, dentro do funil — nada mudou nisso. Ela e o `expira_em`
do servidor fazem trabalhos diferentes: uma limpa a gaveta deste aparelho, o
outro impede que a tabela guarde para sempre o rastro de uma rotina que morreu
de velha.

#### Um render

`renderHoje`, e só. `atrasadas()` é o único leitor da chave, e ele desenha no
bloco "ficou para trás" do Hoje.

#### Sem alteração no esquema

`sql/cron_estado.sql` **não foi tocado**: `dispensa` está no `CHECK` desde a 9A,
com as duas formas da chave e o `expira_em` já escritos lá. Nada aplicado ao
banco.

#### Testes

`teste_sync.js`, seções 61 e 62.

### 9E — Trilhos: o progresso online, e a estrutura que ficou

Dois domínios conectados — **`item`** (progresso) e **`toefl`** (o guia) — e
dois **deliberadamente não conectados**: `estrutura_proj` e `estrutura_sub`.
Nove domínios de estado no ar, mais a tabela do registro.

#### Os dois escritores reais, e onde está a autoridade

Este é o único domínio da Fase 9 em que dois escritores já são verdade **hoje**:
você, no aparelho, e o pipeline, pelo `dobrar_toques.py --registrar`, que
escreve um toque com aparelho `"cowork"` e entra pela mesma porta que o iPhone.

A regra de desempate é o relógio — mas **a autoridade não é "quem chegou por
último"**, e a distinção importa. O que impede o relógio de apagar uma decisão
sua não é o desempate: é a **fronteira do que a máquina pode afirmar**, e ela
está no dado, **antes de qualquer escrita**. O `--registrar` **recusa** subitem
de prova `"estrela"` — as etapas cuja conclusão é decisão do autor. Sobre elas o
pipeline não opina, então não há conflito a desempatar. Nas outras, progresso é
fato verificável (o artefato existe ou não existe), e ali o mais recente manda
mesmo.

**A 9E não move essa fronteira para o desempate, e não torna o pipeline um
escritor do Supabase.** Ele continua no caminho legado, como mais um aparelho —
que é exatamente o que a dupla escrita preserva até a 9G. Há teste para cada uma
dessas quatro afirmações.

#### O `em` do subitem vinha do relógio errado

`marcarSub` e `ciclarVida` carimbavam `x.em = new Date().toISOString()`, o
relógio de parede, enquanto o toque nascia do `instanteDoToque()`, o monotônico.
Duas consequências, ambas reais e ambas medidas:

- duas mudanças no mesmo milissegundo recebiam o **mesmo** `x.em`, e a segunda
  perdia o desempate contra a primeira;
- o aparelho e o toque passavam a **discordar sobre quando aquilo aconteceu**.

É a mesma divergência que a 9C-0 mediu em metas e eventos e a 9D.1 corrigiu no
`vgMarcar`. O `tocarItem` agora toma o instante do `logar()`, que é quem fala
com o relógio — uma fonte, três consumidores: o subitem, o toque legado e a
linha do `cron_estado`.

#### Progresso não cria estrutura

O aplicador do `item` exige que o subitem **exista** neste aparelho. Progresso
de peça que o aparelho não conhece não tem onde pousar, e inventá-la seria criar
estrutura pelo caminho do progresso — exatamente a separação que o esquema
mantém ao dar linhas distintas a `item` e `estrutura_sub`.

#### O motivo viaja, e só por aqui

Mesma decisão da 9D.3: o `semMotivo()` corta o motivo do caminho do GitHub
porque **aquele** repositório é público. A base é privada, a coluna está no
contrato, e o rótulo "motivo registrado no outro aparelho" continua sendo do
caminho legado, onde ele é a única coisa que dá para dizer.

#### O que a 9E NÃO fez, e por quê

**`estrutura_proj` e `estrutura_sub` não foram conectadas.** Ligar a estrutura
sem o merge de três vias seria ligá-la errado, e o pedido era explícito: não
simplificar o merge. Faltam **dois pré-requisitos**, nenhum deles código deste
branch:

1. **A `cron_estrutura_base` precisa ser escrita**, e quem a escreve é o
   pipeline, do Actions, com a chave `service_role`. O app tem `SELECT` e mais
   nada — e essa ausência é o ponto: se ele pudesse reescrever a base, poderia
   forjar "o pipeline nunca mudou isso" e o merge de três vias viraria de duas
   outra vez. Isso exige um segredo novo no Actions, que é decisão sua.
2. **O `cron:arquivo` precisa ser aposentado** em favor de `vida='arquivado'`,
   como o próprio esquema declara. Hoje `delProj`/`delSub` fazem `splice` no
   array e guardam numa gaveta paralela **indexada por posição** — que se
   desloca. Apagar e restaurar não têm como atravessar aparelhos nessa forma.

Enquanto isso não existe, o defeito conhecido continua sendo o de sempre e **não
piorou**: renomear um projeto à mão é desfeito pela próxima publicação do
pipeline, em silêncio. Isso é verdade desde a Fase 4 e não é consequência da
Fase 9.

#### Sem alteração no esquema

`sql/cron_estado.sql` **não foi tocado**: `item` e `toefl` estão no `CHECK`
desde a 9A, com chave e valor já escritos lá, e a `cron_estrutura_base` continua
intacta, esperando a fase que a use. Nada aplicado ao banco.

#### Testes

`teste_sync.js`, seções 63 a 65. Os guardas de lista de domínios passaram a
varrer também o `20-regras.js`: o funil do TOEFL mora lá, e um guarda que só
lesse o `30-render.js` diria que o domínio não está conectado.

### 9F — A prova da escrita dupla

    node scripts/prova_dupla_escrita.js

A Fase 9 mantém **dois caminhos vivos de propósito**: o de sempre (toque →
GitHub → `estado.json`) e o novo (`cron_estado` no Supabase). Conviver não é
concordar. Esta é a fase que cobra o preço de tê-los mantido: uma prova
automatizada e determinística de que os dois dizem a **mesma coisa** sobre a
mesma decisão.

**Não é mais uma bateria de testes de unidade.** O `teste_sync.js` prova cada
domínio por dentro; a prova da 9F olha para a **fronteira** entre os dois
caminhos, e só para ela. Por isso mora num arquivo próprio, com um vocabulário
próprio — `COERENTE` / `DIVERGE` — e um veredicto único no fim.

**O harness é o mesmo, importado e não copiado.** O `teste_sync.js` passou a
exportar o Supabase de mentira (`module.exports`, com a execução dos testes
guardada por `require.main === module`). Um segundo servidor falso seria um
segundo a manter de acordo com o Postgres, e no dia em que divergissem a prova
mediria o falso.

#### Os dez critérios

| | O que prova |
|---|---|
| 1 | uma decisão humana produz o **mesmo `em`** nos dois caminhos, domínio a domínio |
| 2 | o que desce do Supabase **não vira toque** |
| 3 | o que desce do `estado.json` **não vira escrita online** |
| 4 | o LWW é determinístico quando os dois caminhos discordam sobre o mesmo item |
| 5 | a decisão de 9h, drenada às 18h, **não vence** a das 17h |
| 6 | o `toefl` é booleano e não transporta estrutura nem texto |
| 7 | o `item` é progresso, e **progresso não cria estrutura** |
| 8 | o pipeline continua escrevendo pelo caminho legado, e **não fala com o Supabase** |
| 9 | a fronteira do `prova: "estrela"` continua **antes da escrita**, e não no desempate |
| 10 | o registro é append-only, e é provado **fora** do LWW |

O critério 1 compara **três cópias** do instante — o aparelho, o toque e a linha
online. As três, e não duas: a cópia do aparelho é a que decide o LWW local, e
foi exatamente ela que divergia antes da correção da 9E.

O critério 9 é o que a Fase 9E mais precisava por escrito: o merge do `item`
**não conhece** `estrela`, `prova` nem `cowork` — e essa ignorância é o desenho.
A decisão do autor não é protegida por uma regra de quem vence; é protegida pela
recusa do `--registrar`, antes de qualquer escrita.

O critério 10 existe porque o registro **não é LWW**: uma linha de 2020 que
chega depois das de hoje não é recusada por ser velha, é aceita por ser outra.
Provar append-only com o vocabulário do LWW seria provar a coisa errada.

#### O que a prova não cobre, e por quê

`estrutura_proj` e `estrutura_sub` **não entram**. Não foram conectados, e
deliberadamente (ver 9E). Provar coerência de quem não escreve seria provar o
vazio — e a prova diz isso explicitamente, em vez de silenciar.

#### Como ela foi validada

Três mutações, e cada uma faz a prova falhar com saída 1: fazer o `em` do
aparelho divergir do toque; tirar a deduplicação por id do registro; e mandar o
`toefl` carregar o texto do item. A primeira revelou uma lacuna na própria
prova — ela comparava o toque e a linha online, mas não a cópia do aparelho —, e
o critério 1 foi corrigido antes de a fase fechar.

#### Sem alteração no esquema, e sem escritor novo

`sql/` **não foi tocado**. Nenhum domínio novo, nenhum funil novo, nenhuma
mudança no merge de três vias. A 9F **só mede**.

### 9G-0 — Pré-requisitos para aposentar o GitHub

Duas coisas bloqueavam a 9G. Esta etapa resolve **uma** e documenta por que a
outra não pode ser resolvida por código.

#### Parte A — o segundo escritor ganhou caminho online ✅

O `--registrar` sempre foi um escritor **real**, e não um espelho: ele afirma um
fato que só ele verifica (o artefato existe), pela mesma porta por onde o iPhone
entra. Até aqui essa porta era só o arquivo de toque — o que faria dele um órfão
no dia em que o caminho do GitHub saísse.

Agora ele publica o **mesmo toque** também no estado compartilhado: uma linha
`item` em `cron_estado` e uma linha em `cron_registro`, com o **id do toque**
como chave primária — a mesma ponte da 9D.3, que faz as duas descidas
reconhecerem a mesma linha sem duplicá-la.

O que continua exatamente como era:

| | |
|---|---|
| a fronteira `prova: "estrela"` | a recusa acontece **antes**, no `registrar()`, e nada no publicador a alcança |
| o `em` | o mesmo instante nos dois caminhos — sem isso a prova da 9F não teria o que comparar |
| a autoridade | assina como `cowork` também online: um aparelho, não uma autoridade |
| a separação | publica `item`, e **um domínio só**. Nunca estrutura |
| o LWW | o gatilho `cron_estado_relogio()` descarta o `em` atrasado: o pipeline não desfaz decisão mais recente sua |
| terceiro escritor | nenhum — é a mesma função `registrar()` |

**O toque é o artefato durável.** Publicar vem **depois** de gravar, e é melhor
esforço: rede fora ou credenciais ausentes fazem o comando dizer o que não fez e
seguir. O caminho do GitHub fica inteiro.

**Nenhum segredo novo.** `SUPABASE_URL` (repository *variable*) e
`SUPABASE_SECRET_KEY` (*secret*, papel `service_role`) **já existem** e já são
usadas pelo `avisos/enviar.mjs`. O `dobrar-toques.yml` passou a recebê-las no
ambiente do job. O uuid do dono vem da própria `cron_dono` — dois donos é
ambiguidade, e o pipeline para e diz, em vez de escolher.

#### Parte B — a estrutura continua bloqueada, por duas decisões suas ⛔

Não improvisei. Os dois pontos abaixo não são de código:

**B1 — não existe, neste repositório, quem publique o `entrada.json`.** O
`dobrar_toques.py` apenas o **lê** (`procurar_na_entrada`); nada aqui o escreve.
A `cron_estrutura_base` guarda *o que o pipeline publicou da última vez*, e essa
é a informação inteira do merge de três vias. Preenchê-la a partir de um arquivo
que o pipeline não publicou seria **forjar a base** — exatamente o que o
`sql/cron_estado.sql` avisa: com uma base forjada, o merge de três vias vira de
duas outra vez, e em silêncio. Enquanto o publicador do `entrada.json` não
estiver neste repositório (ou não escrever a base ele mesmo), não há onde
ancorar a terceira via.

**B2 — aposentar o `cron:arquivo` exige decidir o que fazer com o que já está
arquivado.** Hoje `delProj`/`delSub` fazem `splice` no array e guardam numa
gaveta paralela indexada por **posição** — e as posições já se deslocaram desde
que cada entrada foi guardada. Migrar para `vida='arquivado'` muda, aparelho por
aparelho, o que cada um mostra, de forma irreversível; e essas entradas **nunca
viajaram**, então cada aparelho tem as suas. É uma decisão sobre o seu arquivo
real, não sobre o código. E fazer só a parte fácil seria aposentar o
`cron:arquivo` **pela metade**, que é o que você proibiu.

#### Testes

A prova da 9F teve o **critério 8 reescrito**, e ficou mais forte: em vez de
"o pipeline não fala com o Supabase" — afirmação que esta etapa supera —, ele
agora verifica que, falando, o pipeline continua afirmando um fato seu: mesmo
`em`, mesmo id, um domínio só, assinatura de aparelho, gravação antes da
publicação e credenciais só do ambiente.

### 9G-0 B1 — A publicação da estrutura, e a base que a registra

    python3 scripts/dobrar_toques.py --publicar-estrutura /caminho/entrada-nova.json

#### O elo que faltava tinha um nome

O `entrada.json` **não é gerado por script nenhum** — o próprio arquivo diz quem
o escreve: `"_escritor": "Cowork. Não editar à mão."`. A cadeia é
`pipeline → mapa_portal.json → Cowork → entrada.json → commit`, e os dois
primeiros elos vivem fora deste repositório. Foi por isso que a busca por um
gerador não achou nada: o publicador **é o Cowork**, o mesmo agente que roda o
`--registrar`.

Com isso o bloqueio se dissolve, e a solução fica simétrica à da Parte A: assim
como o `--registrar` grava o toque **e** publica o `item` no mesmo ato, o
`--publicar-estrutura` grava o `entrada.json` **e** registra a
`cron_estrutura_base` no mesmo ato.

#### Por que os dois têm de ser um ato só

A base guarda *o que o pipeline publicou da última vez* — é a **terceira via**.
Publicar o arquivo sem registrar a base deixaria a base **mentindo**: dizendo
"o pipeline nunca mexeu nisso" sobre um campo que ele acabou de mexer. E base
que mente é pior do que base nenhuma, porque o merge de três vias voltaria a ser
de duas **sem ninguém perceber**.

Daí a ordem, que é a garantia:

1. o arquivo novo é escrito num **temporário**, ao lado do definitivo;
2. a base é substituída **inteira, numa transação só**;
3. só então o temporário toma o lugar do `entrada.json`.

Falhou a base → o temporário cai e **nada muda**: o arquivo anterior e a base
anterior continuam de acordo um com o outro. Por isso, ao contrário do
`--registrar`, aqui publicar **não é melhor esforço**: sem credenciais o comando
**recusa**, em vez de publicar metade.

**E o passo 2 é uma chamada só, de propósito.** A primeira versão gravava num
`POST` e retirava numa sequência de `DELETE`s — operações independentes. Uma
falha entre elas deixaria a base **pela metade** enquanto o `entrada.json` antigo
continuava no disco: a base afirmando que o pipeline publicou uma coisa que ele
não publicou, e o merge de três vias decidindo com base nisso, em silêncio.
Compensar depois não resolve, porque a compensação também pode falhar.

A substituição inteira mora agora numa função do banco,
`cron_publicar_estrutura(dono, gerado_em, linhas)`, e o PostgREST executa cada
chamada dentro de uma transação: **ou a base passa a ser exatamente a estrutura
publicada, ou continua sendo exatamente a anterior**. Não há terceiro estado — é
o que torna verdadeira a garantia que o comando anuncia.

Duas defesas moram nela, e as duas são contra perda de dado:

- **array vazio é recusado**, e não tratado como "publicar nada": uma publicação
  vazia apagaria a base inteira, e quase sempre significa arquivo malformado a
  montante;
- a retirada usa `not exists`, e não `not in`: com `not in`, uma `chave` nula no
  array faria a retirada devolver zero linhas e não acontecer — em silêncio.

**Só a `service_role` pode chamá-la**, como o `cron_podar()`. Se o app pudesse,
poderia reescrever a base e forjar "o pipeline nunca mudou isso" — a mesma razão
pela qual a tabela não tem política de escrita.

#### O que a base registra

| | chave | valor |
|---|---|---|
| projeto | `painel/proj` | `t, n, mes` |
| subitem | `painel/proj/sub` | `t, n, onde, prova, medida, ordem` |

Só isso, e carimbado com o `_gerado_em` **da publicação**. Nem os filhos nem o
id entram no valor — a chave já diz quem é. E **exatamente** a estrutura
publicada: a peça que sai do arquivo sai da base, por `DELETE` explícito. Deixar
a linha de uma peça que não é mais publicada faria a base afirmar que o pipeline
ainda a publica.

**A base nasce da primeira publicação real.** Nada lê o `entrada.json` do disco
para "preencher" a base — semear seria afirmar que o pipeline publicou algo que
talvez nunca tenha publicado.

#### A regra de três vias existe, e ainda não está ligada

`mesclarEstrutura(local, entrada, base, temBase)` implementa a regra, campo a
campo, e tem teste para os três casos: **só você mexeu** (o rename sobrevive),
**só o pipeline mexeu** (atualização legítima entra), **os dois mexeram** (conflito
real, registrado). Sem base, ela cai em duas vias — que é o certo para uma peça
publicada pela primeira vez.

**O `mesclarEntrada()` continua de duas vias**, e a espera é deliberada: contra
uma base **vazia**, "o pipeline nunca mudou nada" é verdade sobre tudo, e a regra
concluiria que nenhuma atualização legítima pode escrever — a estrutura pararia
de chegar. Ela é ligada quando a base existir de verdade, isto é, depois da
primeira publicação real.

#### O navegador continua só lendo

A `cron_estrutura_base` dá ao app `SELECT` e mais nada, e a ausência de política
de escrita é o ponto: se ele pudesse reescrevê-la, poderia forjar "o pipeline
nunca mudou isso". Há teste para as duas metades — que o SQL não tem política de
escrita, e que nenhum arquivo do aplicativo escreve nela.

#### O que esta etapa NÃO fez

**B2 continua aberto**: `cron:arquivo`, `delProj`, `delSub` e o arquivamento por
índice estão exatamente como estavam. `estrutura_proj` e `estrutura_sub`
continuam sem escritor no aplicativo.

#### Testes

`scripts/teste_publicar_estrutura.py` sobe um PostgREST de mentira em localhost e
exercita o comando de verdade: a base nascendo vazia, a republicação que retira o
que saiu, a falha **antes** e a recusa **dentro** da transação (nenhuma das duas
publica metade), a ausência de credenciais e as estruturas inválidas. O servidor
falso **emula a transação** e recusa qualquer escrita que não seja a RPC — um
servidor que aplicasse pela metade provaria o contrário do que o teste afirma. `teste_sync.js`, seções 66 e 67, cobrem a regra de três
vias e quem pode escrever a base.

### Como ligar, e o que a tela diz

Em **Sincronização**, abaixo do bloco do token do GitHub, há **Estado online**:
e-mail, senha, *Entrar* e *Sair*. É a conta do Contas de Casa — o projeto
Supabase é o mesmo — mas os dados não se misturam: o Cronograma só é visível
para a conta que está na `cron_dono`.

Até aqui `SYNC.entrar()` existia desde a 9A e **nada o chamava**: a camada estava
no ar e era inalcançável de dentro do aplicativo. Num PWA de iPhone não há
console, então "existe a função" não é o mesmo que "dá para ligar".

A frase abaixo dos botões diz o que está acontecendo, e não um rótulo:

| Situação | O que a tela diz |
|---|---|
| desligada | *as prioridades continuam viajando pelos toques* |
| ligada | *chegam aos outros aparelhos em segundos* |
| offline | *nada se perde: sobe quando a rede voltar*, com a contagem da fila |
| conta errada | *esta conta não é dona deste Cronograma* |

A última linha existe por causa da allowlist: sem ela, "não entrei" e "entrei com
a conta da casa" pareceriam a mesma coisa na tela.

**Sair não apaga a fila.** O que foi decidido continua guardado e sobe quando
você entrar de novo — sair é parar de sincronizar, não desistir do que foi
decidido. O aviso de confirmação diz quantas alterações estão esperando.

> **A sessão mora em `sync:sessao`, fora do prefixo `cron:`**, e isso é
> segurança, não estilo. O `coletarDados()` varre toda chave que comece com
> `cron:` para dentro do backup exportado, excluindo só o que casa com
> `/token/i`. Uma sessão guardada sob `cron:` iria para o `.json` que se baixa e
> às vezes se manda por e-mail — com JWT e *refresh token* dentro. É a mesma
> razão pela qual o token do GitHub é `sync:token` e não `cron:token`.

### Estado atual

**9A concluída: infraestrutura no ar.**
**9B concluída: Prioridades é o primeiro domínio conectado, e há tela para ligá-lo.** Falta aplicar o `sql/cron_estado.sql` ao projeto e popular a
`cron_dono` — as duas coisas são operações de banco, feitas uma vez:

```sql
insert into public.cron_dono (uid, rotulo)
select id, 'jonathan' from auth.users where email = '<o seu e-mail>';
```

Depois disso, ligar num aparelho é `SYNC.entrar(email, senha)`. **Enquanto o SQL
não for aplicado e a sincronia não for ligada, nada muda**: `tocarPrioridade`
verifica `SYNC.ligado()` antes de escrever online, e sem isso um aparelho que
nunca entrou acumularia fila para sempre, sem nada que a drenasse.

**9C ainda não começou.** Metas, Eventos, TOEFL, Vagas, Retomadas, Trilhos e
Rotinas continuam viajando só pelo caminho de toques.

---

## Vagas

Cadeia: **coleta → validação da extração → classificação → triagem**.

`scripts/coletor.py` roda toda segunda pelo `agentes-semanais.yml` e escreve em
`dados/`, `eventos/` e `scripts/estado_coletor.json`.

Dois eixos, que não se confundem:

- **`veredicto`** (da máquina): `relevante` / `revisar` / `rejeitado`;
- **`cron:triagem`** (sua): candidatar / descartar / arquivar.

`AOS: Open` nunca é eliminado e nunca é promovido — vai para **revisar**.
Extração suspeita também.

---

## Avisos

**Domingo é informação, segunda é decisão — e o telefone só toca quando há o que
dizer.** No máximo **um** aviso de vagas e **um** de datas por execução, sempre
agregados. Nunca um por tarefa: quem recebe um aviso por item aprende a ignorar
todos.

```
navegador (PWA na Tela de Início)
  └─ botão "Avisar neste aparelho" → pushManager.subscribe(VAPID pública)
       └─ INSERT em cron_push_inscricao        (o anon insere; ninguém lê)

GitHub Actions — avisos.yml, diário às 13h UTC
  └─ lê dados/vagas.json, eventos/vagas_<data>.json e Cronograma/estado.json
  └─ SELECT nas inscrições com service_role    (só ela enxerga)
  └─ web-push → 404/410 apaga a linha morta
  └─ grava as identidades em scripts/estado_notificador.json
```

**Duas fontes, e só duas.** Vagas com `veredicto: "relevante"` do lote da
semana, e eventos públicos dentro de 14 dias. **Retomadas ficam de fora**: o
progresso dos subitens é local por aparelho — `estado.itens` carrega uma fração
deles —, e o servidor não tem como calculá-las. Não se inventa sincronização
para viabilizá-las.

**Evento com o cadeado fechado (`priv:true`) sai por inteiro.** Não vira aviso,
não empresta o título, não empresta a data e não vira "1 compromisso": a
existência dele também é informação. O filtro é o primeiro de todos, não um
cuidado na hora de escrever o texto.

**Veredicto ausente não é "notificar tudo".** O campo só passou a existir com a
Vagas 2; dado coletado antes dela não tem veredicto, e tratar a ausência como
relevante encheria o telefone de uma vez.

### Deduplicação

Identidades `vagas:<data-do-lote>` e `evento:<id>:<data>`, guardadas em
`scripts/estado_notificador.json` — **só identidades, nunca endpoints**. E a
identidade **só é gravada se algo chegou**: envio que falhou em todos os
aparelhos não conta como enviado, e a execução seguinte tenta de novo. É a
diferença entre "já avisei" e "tentei avisar".

### O service worker não tem `fetch`

`Cronograma/sw.js` tem `push` e `notificationclick`, e mais nada. **A ausência
do ouvinte de `fetch` é o ponto**, não um esquecimento: sem ele o worker não
intercepta requisição nenhuma, e `estado.json`, `entrada.json` e
`api.github.com` passam direto. Com cache, `estado.json` — que é mesma origem —
seria servido velho e a dobra pareceria não ter chegado. Por isso não há cache,
e por isso não há funcionamento offline. Há teste que falha se um `fetch`
aparecer ali.

### Segredos

| O quê | Onde |
|---|---|
| URL do projeto, chave **publishable**, VAPID **pública** | `js/00-config.js`, versionadas |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SUPABASE_SECRET_KEY` | GitHub Secrets |
| endpoint, `p256dh`, `auth` | **só na tabela** — nunca no repositório |

As chaves seguem o modelo atual do Supabase: **publishable** no navegador,
**secret** no Actions. `anon` e `service_role` continuam existindo no
`sql/cron_push.sql`, mas ali são **papéis do Postgres**, não nomes de chave — a
publishable resolve para `anon` e a secret para `service_role`, com as mesmas
permissões de sempre. Por isso a troca não alterou uma linha das políticas.

O endpoint é uma **URL-capacidade**: quem o tem notifica aquele aparelho. Como o
repositório é público e o histórico nunca é podado, ele não entra em arquivo
versionado em forma nenhuma — nem em `estado.json`, nem no
`estado_notificador.json`, nem em Secret. Há teste que varre os arquivos
versionados atrás de endpoint e de credencial.

**Sem login, sem usuários, e ainda assim com RLS.** O Cronograma é de uma pessoa
só: a tabela não tem `casa_id`, `perfil_id` nem política presa a `auth.uid()`, e
as inscrições pertencem à própria aplicação. Mas a RLS fica, porque a anon key é
pública: o anon **só insere**; ler, atualizar e apagar é da `service_role`, que
mora nos Secrets e roda só no Actions. O INSERT público foi analisado e aceito —
o efeito máximo de uma linha falsa é um envio que falha, e o limpador de 404/410
a remove.

**Desinscrever é só no aparelho.** `sub.unsubscribe()` mata o endpoint; a linha
sai no envio seguinte, pelo 404/410. Dar `delete` ao anon deixaria qualquer um
apagar as inscrições.

**No iPhone só funciona com o app na Tela de Início** (iOS 16.4+). Numa aba
comum do Safari o `PushManager` não existe e o botão nem aparece — a limitação é
do sistema.

**Nada disto tocou as fases anteriores:** nenhum tipo de toque novo (seguem
sete), nenhuma seção nova no `estado.json`, nenhuma chave nova de
`localStorage` — a fonte da verdade da inscrição é o próprio `PushManager` —, e
`dobrar_toques.py`, `coletor.py` e os dois workflows existentes não foram
tocados.

---

## Arquivos

| Caminho | O quê |
|---|---|
| `Cronograma/index.html` | o shell: só o HTML e as tags que carregam o resto |
| `Cronograma/css/cronograma.css` | os estilos |
| `Cronograma/js/00-config.js` | constantes, sementes e chaves de `localStorage` |
| `Cronograma/js/10-nucleo.js` | armazenamento, aparelho, entrada, estado, toques, sincronização |
| `Cronograma/js/15-sync.js` | Fase 9A: estado online, fila offline, Realtime, render seguro |
| `Cronograma/js/20-regras.js` | domínio: trilhos, prioridades, retomadas, processos, TOEFL, vagas, revisão |
| `Cronograma/js/30-render.js` | os `render*` e os handlers presos ao DOM |
| `Cronograma/js/40-app.js` | bootstrap: migrações, sementes, primeiros desenhos, ouvintes |
| `Cronograma/entrada.json` | estrutura das peças. Escrita pelo Cowork |
| `Cronograma/estado.json` | estado consolidado. Escrito só pelo dobrar_toques |
| `Cronograma/toques/` | fila de eventos |
| `scripts/dobrar_toques.py` | consolida os toques |
| `scripts/coletor.py` | coletor semanal de vagas e chamadas |
| `criterios_vagas.json`, `criterios_chamadas.json` | critérios (na raiz) |
| `dados/`, `eventos/` | saída do coletor |
| `Cronograma/sw.js` | service worker: só push e notificationclick |
| `Cronograma/manifest.webmanifest`, `Cronograma/icones/` | o que o iOS exige para instalar o app |
| `avisos/enviar.mjs` | o emissor dos avisos, roda só no Actions |
| `sql/cron_push.sql` | a tabela das inscrições, com RLS |
| `sql/cron_estado.sql` | Fase 9A: estado, registro e base da estrutura, com RLS |
| `scripts/prova_dupla_escrita.js` | Fase 9F: a prova de que os dois caminhos concordam |
| `scripts/teste_publicar_estrutura.py` | Fase 9G-0 B1: a publicação da estrutura e a base |
| `scripts/estado_notificador.json` | o que já foi avisado |

**Estrutura e estado são coisas separadas.** A mesclagem da estrutura nunca
sobrescreve progresso, conclusão ou ciclo de vida.

---

## Como o código é carregado

Até a Fase 7 tudo morava num `index.html` de 4.989 linhas. Agora ele é um shell
e o código está em cinco arquivos, carregados **nesta ordem**:

```
css/cronograma.css
js/00-config.js  →  js/10-nucleo.js  →  js/15-sync.js  →  js/20-regras.js  →  js/30-render.js  →  js/40-app.js
```

**A ordem é parte da arquitetura**, não uma conveniência: cada arquivo lê do
anterior. São **scripts clássicos, não ES Modules** — é o escopo global
compartilhado que mantém a superfície pública intacta, e é dele que dependem os
`onclick` do HTML gerado.

**O critério da divisão:** se uma função produz a resposta sem tocar no DOM, ela
mora em `20-regras.js` e não em `30-render.js` — mesmo quando devolve HTML.
`40-app.js` é o único com código executável de topo.

A refatoração mudou **onde** o código mora e nada do que ele faz: nenhuma função
renomeada, nenhuma chave de `localStorage` criada ou alterada, nenhum tipo de
toque novo, nenhuma regra de CSS reescrita.

---

## Testes

```bash
python3 scripts/teste_coletor.py     # pipeline de vagas
node     scripts/teste_hoje.js       # Hoje, Processos e motor; dois aparelhos
python3 scripts/teste_sincronia.py   # round-trip real página → dobra → página
node     scripts/teste_sync.js       # Fase 9A: relógio, fila offline, Realtime, RLS
node     scripts/prova_dupla_escrita.js  # Fase 9F: os dois caminhos dizem o mesmo?
python3  scripts/teste_publicar_estrutura.py  # Fase 9G-0 B1: entrada.json + a base
```

O `teste_hoje.js` lê do próprio `index.html` a lista de `<script src>`, carrega
os cinco arquivos **na ordem em que o HTML os declara** e avalia o resultado num
contexto do `vm`, com `localStorage` e `document` de mentira. O que se testa é o
código que vai para o ar, não uma cópia dele — e acrescentar ou reordenar um
arquivo na aplicação não deixa o teste medindo outra coisa.

---

## Roadmap

| Fase | Estado |
|---|---|
| 0 — Auditoria e documentação | concluída |
| 1 — Vagas (extração, validação, veredicto) | concluída |
| 2 — Hoje 2.0 | concluída |
| 3 — Motor de prioridades (prazo, importância, inatividade, contexto) | concluída |
| 4 — Aba Processos (TOEFL primeiro) | concluída |
| 5 — Revisão dominical (digest curto) | concluída |
| 6A — Sincronização do guia do TOEFL (toque `toefl`, identidade por `id`) | concluída |
| 6B — Sincronização das retomadas silenciadas (toque `retomada`) | concluída |
| 7 — Refatoração (dividir o `index.html`) | concluída |
| 8 — Notificações (Web Push) | concluída |
| 9A — Estado online: esquema e infraestrutura | concluída (desligada por padrão) |
| 9B — Prioridades online (primeiro domínio na camada) | concluída |
| 9C-0/9C-1 — relógio, escritor único e repercussão da Revisão | concluídas |
| 9C-2 — Metas online (segundo domínio na camada) | concluída |
| 9C-3 — Eventos online (terceiro domínio) | concluída |
| 9C-4 — título de evento privado no caminho online | concluída |
| 9D.1 — Triagem das Vagas online | concluída |
| 9D.2 — Retomadas silenciadas online | concluída |
| 9D.3 — Registro datado online (tabela própria) | concluída |
| 9D.4 — Rotinas do dia online (primeira estreia sem caminho legado) | concluída |
| 9D.5 — Dispensas online (fecha a Fase 9D) | concluída |
| 9E — Trilhos: `item` e `toefl` online | concluída |
| 9E (estrutura) — `estrutura_proj`, `estrutura_sub` e o merge de três vias | bloqueada: ver acima |
| 9F — Prova da escrita dupla | concluída |
| 9G-0 A — pipeline com caminho online | concluída |
| 9G-0 B1 — publicação da estrutura + `cron_estrutura_base` | concluída |
| 9G-0 B2 — aposentar o `cron:arquivo` | aberta: decisão sobre o arquivo real |
| 9G — desativação do caminho do GitHub | não iniciada |

### Previsto e ainda não implementado

- **Aprender com os descartes das vagas** (Vagas 3): registrar motivo
  estruturado para calibrar os filtros com o comportamento real.
- **Remoção automática dos itens de veredicto `rejeitado`** de `dados/vagas.json`
  — hoje eles permanecem, marcados, para auditoria.
- **Dependências entre projetos.** Não existem no dado, e a Fase 3 não as
  inventou. A única dependência real hoje é `prova: "estrela"` — etapa travada
  esperando decisão sua.
- **Sincronização de `cron:hoje-dispensados` e `cron:checks:`.** Ficaram fora
  da Fase 6B porque sincronizá-los custaria histórico permanente em repositório
  público por um valor que morre numa semana. **Decidido na Fase 9: os dois
  passam a viajar**, com poda por `expira_em`, assim que a base privada existir.
- **Sinais de Processo** alimentando o motor de prioridades, pelo seam
  `sinaisDeProcesso()`, que devolve `[]`.
- **Processo Notre Dame.** A estrutura o recebe sem refatoração; ele não existe.

---

## Princípios que não devem ser violados

1. Não transformar Trilhos em calendário rígido.
2. Não substituir a descrição acadêmica dos Trilhos por rótulos genéricos.
3. Não criar "Planejar a semana" como rotina.
4. Não fazer o sistema escolher um Trilho só porque há tarefa acadêmica no dia.
5. Não criar notificações excessivas.
6. Não eliminar o painel de Vagas.
7. Não colocar a triagem de Vagas dentro do digest dominical.
8. Não quebrar o GitHub Actions semanal.
9. Não quebrar o mecanismo de toques.
10. Não criar um segundo mecanismo de conclusão.
11. Não editar `estado.json` diretamente.
12. Não apagar datas antigas porque a tela mostra cinco.
13. Não colocar dados pessoais sensíveis no repositório público.
14. **Prioridade manual prevalece sobre prioridade automática.**
15. O sistema deve ajudar a lembrar, não criar trabalho administrativo.
