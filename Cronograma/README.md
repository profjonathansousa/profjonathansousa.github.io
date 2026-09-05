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
| `scripts/estado_notificador.json` | o que já foi avisado |

**Estrutura e estado são coisas separadas.** A mesclagem da estrutura nunca
sobrescreve progresso, conclusão ou ciclo de vida.

---

## Como o código é carregado

Até a Fase 7 tudo morava num `index.html` de 4.989 linhas. Agora ele é um shell
e o código está em cinco arquivos, carregados **nesta ordem**:

```
css/cronograma.css
js/00-config.js  →  js/10-nucleo.js  →  js/20-regras.js  →  js/30-render.js  →  js/40-app.js
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

### Previsto e ainda não implementado

- **Aprender com os descartes das vagas** (Vagas 3): registrar motivo
  estruturado para calibrar os filtros com o comportamento real.
- **Remoção automática dos itens de veredicto `rejeitado`** de `dados/vagas.json`
  — hoje eles permanecem, marcados, para auditoria.
- **Dependências entre projetos.** Não existem no dado, e a Fase 3 não as
  inventou. A única dependência real hoje é `prova: "estrela"` — etapa travada
  esperando decisão sua.
- **Sincronização de `cron:hoje-dispensados` e `cron:checks:`.** Ficaram
  deliberadamente **fora** da Fase 6B, pelas razões da seção *Sincronização*:
  não são equivalentes à retomada adiada, e `cron:checks:` é local **por
  decisão**, não pendência a saldar. Sincronizá-los é escolha de produto.
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
