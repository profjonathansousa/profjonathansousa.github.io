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
| **Semana** | números da semana. Pouco usada — a revisão real é o digest de domingo (Fase 5) |
| **Trilhos** | estruturas de longo prazo: esteira de artigos, PhD, pós-doc, concursos, técnico |
| **Vagas** | triagem de oportunidades acadêmicas coletadas semanalmente |

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

Cinco coisas atravessam aparelhos, cada uma com um tipo de toque:

| Tipo | Vai para | Chave |
|---|---|---|
| `registro` | `itens` | `painel/projeto/subitem` |
| `triagem` | `triagem` | id da vaga |
| `meta` | `metas` | `AAAA-MM/id` |
| `evento` | `eventos` | id do evento |
| `prioridade` | `prioridades` | `AAAA-Wnn/id` |

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
node     scripts/teste_hoje.js       # Hoje 2.0, dois aparelhos simulados
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
| 4 — Aba Processos (TOEFL primeiro) | a fazer |
| 5 — Revisão dominical (digest curto) | a fazer |
| 6 — Sincronização completa (retomadas, processos, estado do Hoje) | a fazer |
| 7 — Notificações | a fazer |
| 8 — Refatoração (dividir o index.html) | a fazer |

### Previsto e ainda não implementado

- **Notificações push para novas vagas e oportunidades acadêmicas.** Requisito
  registrado; a implementação pertence à Fase 7 e não faz parte da Fase 2.
  Notificar prazos importantes e retomadas relevantes entra junto. **Não** criar
  notificação para cada tarefa.
- **Aprender com os descartes das vagas** (Vagas 3): registrar motivo
  estruturado para calibrar os filtros com o comportamento real.
- **Remoção automática dos itens de veredicto `rejeitado`** de `dados/vagas.json`
  — hoje eles permanecem, marcados, para auditoria.
- **Dependências entre projetos.** Não existem no dado, e a Fase 3 não as
  inventou. A única dependência real hoje é `prova: "estrela"` — etapa travada
  esperando decisão sua.
- **Sinais de Processo** (TOEFL, candidatura Notre Dame) alimentando o motor,
  pelo seam `sinaisDeProcesso()`. Pertence à Fase 4.

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
