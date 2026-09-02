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
| **Processos** | a estrutura completa de um trabalho complexo. Hoje: o TOEFL |
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
- **livre** — um texto seu, com caixa por dia.

Chave ISO por semana (`2026-W36`): você elege na segunda e vale até domingo.

**Atravessa aparelhos** pelo toque `prioridade` (ver Sincronização).

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
| prioridade livre | `cron:checks`, o mecanismo de sempre |
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

### Sem abstração genérica

`PROCESSOS` é uma lista com quatro funções por entrada (`resumo`, `acaoDoDia`,
`corpo`, `acoes`), todas já existentes no caso do TOEFL. Notre Dame implementa
as mesmas quatro e entra na lista. Generalizar antes do segundo caso é como se
inventa a abstração errada.

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

Seis coisas atravessam aparelhos, cada uma com um tipo de toque:

| Tipo | Vai para | Chave |
|---|---|---|
| `registro` | `itens` | `painel/projeto/subitem` |
| `triagem` | `triagem` | id da vaga |
| `meta` | `metas` | `AAAA-MM/id` |
| `evento` | `eventos` | id do evento |
| `prioridade` | `prioridades` | `AAAA-Wnn/id` |
| `toefl` | `toefl` | `id` do item do guia |

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

**A recalibragem continua local.** `cron:toefl-recalibrado` é cache de uma
derivação — `calcularRecalibragem()` a refaz a partir do plano, da fase corrente
e do que falta, e as duas últimas agora sincronizam. Sincronizar a leitura seria
sincronizar valor derivado. Não existe tipo de toque `recalibrado`.

`cron:checks:` (rotinas) e `cron:contexto` (casa/fora) seguem locais, cada um
pela sua razão: o dia marcado é do aparelho, e o lugar onde você está é um fato
físico dele.

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

## Arquivos

| Caminho | O quê |
|---|---|
| `Cronograma/index.html` | interface, estilos e lógica |
| `Cronograma/entrada.json` | estrutura das peças. Escrita pelo Cowork |
| `Cronograma/estado.json` | estado consolidado. Escrito só pelo dobrar_toques |
| `Cronograma/toques/` | fila de eventos |
| `scripts/dobrar_toques.py` | consolida os toques |
| `scripts/coletor.py` | coletor semanal de vagas e chamadas |
| `criterios_vagas.json`, `criterios_chamadas.json` | critérios (na raiz) |
| `dados/`, `eventos/` | saída do coletor |

**Estrutura e estado são coisas separadas.** A mesclagem da estrutura nunca
sobrescreve progresso, conclusão ou ciclo de vida.

---

## Testes

```bash
python3 scripts/teste_coletor.py     # pipeline de vagas
node     scripts/teste_hoje.js       # Hoje, Processos e motor; dois aparelhos
python3 scripts/teste_sincronia.py   # round-trip real página → dobra → página
```

O `teste_hoje.js` avalia o `<script>` do `index.html` de verdade num contexto do
`vm`, com `localStorage` e `document` de mentira. O que se testa é o código que
vai para o ar, não uma cópia dele.

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
| 6B — Sincronização de retomadas e do estado do Hoje | a fazer |
| 7 — Notificações | a fazer |
| 8 — Refatoração (dividir o index.html) | a fazer |

### Previsto e ainda não implementado

- **Notificações push para novas vagas e oportunidades acadêmicas, prazos
  importantes e retomadas relevantes.** Requisito registrado desde a Fase 2 e
  reafirmado na Fase 5: a implementação pertence à **Fase 7** e nenhuma fase
  anterior a antecipa. **Não** criar notificação para cada tarefa.
- **Aprender com os descartes das vagas** (Vagas 3): registrar motivo
  estruturado para calibrar os filtros com o comportamento real.
- **Remoção automática dos itens de veredicto `rejeitado`** de `dados/vagas.json`
  — hoje eles permanecem, marcados, para auditoria.
- **Dependências entre projetos.** Não existem no dado, e a Fase 3 não as
  inventou. A única dependência real hoje é `prova: "estrela"` — etapa travada
  esperando decisão sua.
- **Sincronização das retomadas adiadas e do estado do Hoje**
  (`cron:retomadas-adiadas`, `cron:hoje-dispensados` e, se decidido,
  `cron:checks:`). Pertence à **Fase 6B**. Dispensar uma retomada num aparelho
  ainda não silencia no outro. `cron:checks:` é local **por decisão** — a
  revisão dominical exibe a ressalva "neste aparelho" —, e sincronizá-lo é
  escolha a tomar, não pendência a saldar.
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
