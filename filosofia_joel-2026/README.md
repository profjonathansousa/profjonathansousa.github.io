# Portal de Filosofia · C.E. Prof. Joel de Oliveira · 2026

**Prof. Dr. Jonathan Sousa** · Filosofia · SEEDUC-RJ  
**GitHub Pages:** [profjonathansousa.github.io/filosofia_joel-2026](https://profjonathansousa.github.io/filosofia_joel-2026/)

---

## Sobre o projeto

Portal estudantil de filosofia para 6 turmas do Ensino Médio do C.E. Professor Joel de Oliveira (SEEDUC-RJ), cobrindo o 2º e o 3º Trimestres de 2026. Cada turma tem uma página própria com cronograma de aulas, descrição das avaliações e links para os materiais de estudo em PDF.

---

## Estrutura de arquivos

```
filosofia_joel-2026/
│
├── index.html                  # Portal de entrada · seleção de turma
├── style.css                   # Folha de estilos global (dark + light mode)
│
├── em1_quinta.html             # 1º Ano · IMAT_CN_1002 · Quinta 10h35
├── em2_quinta.html             # 2º Ano · IF_SE_2001  · Quinta 08h40
├── em3_3003_quinta.html        # 3º Ano · IF_SE_3003  · Quinta 07h00
├── em3_3006_quinta.html        # 3º Ano · IT_GD_3006  · Quinta 12h45
├── em3_3001_sexta.html         # 3º Ano · IF_SE_3001  · Sexta  07h00
├── em3_3002_sexta.html         # 3º Ano · IT_GD_3002  · Sexta  08h40
│
├── ponto-cego/                 # Ponto Cego · núcleo extraclasse
│   ├── index.html              # entrada do núcleo
│   ├── _modelo-sessao.html     # molde da página de sessão (não é publicado)
│   └── sessao-N.html           # uma por sessão, criada depois do encontro
│
└── pdf/
    ├── em1/
    │   ├── Programa_EM1_2026_2-3Trim.pdf
    │   ├── TextoBase_EM1_U1.pdf
    │   └── TesteMeio_Aluno_EM1_U1_exposicao-comentada.pdf
    ├── em2/
    │   ├── Programa_EM2_2026_2-3Trim.pdf
    │   ├── TextoBase_EM2_U1.pdf
    │   └── TesteMeio_Aluno_EM2_U1_mapa-conceitual.pdf
    └── em3/
        ├── Programa_EM3_2026_2-3Trim.pdf
        ├── TextoBase_EM3_U1.pdf
        └── TesteMeio_Aluno_EM3_U1_debate-filosofico.pdf
```

---

## Turmas e conteúdos

| Arquivo | Turma | Horário | Unidade 2 · 3º Trimestre |
|---|---|---|---|
| `em1_quinta.html` | IMAT_CN_1002 | Quinta 10h35–12h15 | O que é o Ser Humano? |
| `em2_quinta.html` | IF_SE_2001 | Quinta 08h40–10h20 | Filosofia e Ciência |
| `em3_3003_quinta.html` | IF_SE_3003 | Quinta 07h00–08h40 | A Dimensão Política |
| `em3_3006_quinta.html` | IT_GD_3006 | Quinta 12h45–14h25 | A Dimensão Política |
| `em3_3001_sexta.html` | IF_SE_3001 | Sexta 07h00–08h40 | A Dimensão Política |
| `em3_3002_sexta.html` | IT_GD_3002 | Sexta 08h40–10h20 | A Dimensão Política |

---

## Modelo de avaliação por série

> **Atualizado em 2026-09-12.** A nota é do **trimestre**, não de cada unidade: a escola
> marca uma Semana de Provas única e cobra o modelo da prova em data fixa.

### Composição da nota do trimestre

| Instrumento | Valor | Soma |
|---|---|---|
| Teste de Meio — performático, na 3ª aula de conteúdo | 3,0 | sim |
| Avaliação Final do trimestre | 5,0 | sim |
| Prova de Recuperação — 10 objetivas × 0,2 | 2,0 | sim |
| **TOTAL** | **10,0** | |
| Teste de Meio — trabalho escrito | até 3,0 | **não — compensatório** |

### EM1 e EM2 — Avaliação Final, Modelo Padrão (5,0 pts)

| Tipo | Qtd | Nível | Valor | Total |
|---|---|---|---|---|
| Múltipla escolha (5 opções) | 7 | 4 fáceis, 3 intermediárias | 0,5 pt | 3,5 pts |
| Discursiva | 1 | Difícil | 1,5 pt | 1,5 pt |
| **TOTAL** | | | | **5,0 pts** |

### EM3 — Avaliação Final, Modelo ENEM (5,0 pts)

| Tipo | Qtd | Descrição | Total |
|---|---|---|---|
| Texto motivador | 1 | Trecho filosófico ou situação-problema | — |
| Questões objetivas (modelo ENEM) | 10 | 0,5 pt cada · competências C1–C5 | 5,0 pts |
| **TOTAL** | | | **5,0 pts** |

O valor de cada questão aparece no título da questão. O gabarito é sempre documento
separado.

---

## Histórico de versões

### v1.0 — Junho 2026 · Lançamento inicial
- Criação do portal com 6 páginas de turma + `index.html`
- Cronograma completo de 2º e 3º Trimestres para todas as turmas
- Status automático de aulas via JavaScript (`data-date`): concluída · esta semana · futura
- Cores de acento diferenciadas por série: verde (EM1) · azul (EM2) · roxo (EM3)
- Navbar fixa com navegação entre turmas
- Descrição completa das Avaliações de Meio por turma
- Seção de professor com e-mail institucional
- PDFs hospedados no repositório sob `pdf/em1/`, `pdf/em2/`, `pdf/em3/`

### v1.1 — 28 jun 2026 · PDFs linkados + light mode
- **Links dos materiais de estudo** conectados aos PDFs do GitHub Pages em todas as 6 páginas, na ordem: Programa da Disciplina → Texto-base → Avaliação de Meio
- Todos os links abrem em nova aba (`target="_blank"`)
- **`prefers-color-scheme`** implementado em `style.css`: o site detecta automaticamente a preferência do dispositivo e exibe tema escuro (padrão) ou tema claro — sem botão, sem JavaScript

### v1.2 — 29 jun 2026 · Estrutura de avaliação corrigida
- **Avaliação Final atualizada** em todas as turmas: pontuação corrigida de 10,0 pts para 5,0 pts
- EM1 e EM2: descrição atualizada para o modelo Padrão (3 múltipla escolha + 2 discursivas)
- EM3: descrição atualizada para o modelo ENEM (texto motivador + 10 questões objetivas C1–C5)
- **Botão "Avaliação Final"** removido da seção Materiais de Estudo em todas as páginas (PDF não disponibilizado previamente à prova)

### v1.3 — 23 set 2026 · Ponto Cego
- **Ponto Cego**: área do núcleo extraclasse em `ponto-cego/`, com página de entrada, molde de sessão, cartão «Fora da aula» no index e pílula própria na navbar
- **Navbar em duas linhas até 820px**: marca e Ponto Cego em cima, turmas embaixo. Em 360px a barra fixa caiu de 149px para 87px
- **Hero do index no tema claro**: «Portal de Filosofia» sumia (texto escuro sobre fundo escuro)

---

## Como atualizar o cronograma

Cada aula no cronograma é um `<div class="aula-item">`. Para aulas com data definida, adicione o atributo `data-date="YYYY-MM-DD"` — o JavaScript calcula o status automaticamente. Aulas sem `data-date` (férias, sem-aula, avisos) não são afetadas pelo script.

```html
<!-- Aula com data → status automático -->
<div class="aula-item" data-date="2026-08-27">
  <div class="aula-date">27 ago</div>
  <div class="aula-body">
    <div class="aula-topic">Início U2 — Título da aula</div>
    <div class="aula-detail">Descrição breve</div>
  </div>
</div>

<!-- Sem aula → sem data-date, classe manual -->
<div class="aula-item sem-aula">
  <div class="aula-date">10 set</div>
  <div class="aula-body">
    <div class="aula-topic" style="color:#FBBF24;">COC</div>
  </div>
</div>
```

### Classes disponíveis para `aula-item`

| Classe | Uso |
|---|---|
| *(sem classe)* + `data-date` | Aula futura — status calculado automaticamente |
| `concluida` | Forçar como concluída (sem `data-date`) |
| `atual` | Forçar como esta semana |
| `ferias` | Período de férias |
| `sem-aula` | Evento escolar, feriado, COC etc. |
| `aviso` | Semana de provas, Avalia RJ etc. |

---

## Como adicionar um novo PDF

1. Faça upload do arquivo na pasta correta (`pdf/em1/`, `pdf/em2/` ou `pdf/em3/`)
2. No HTML da turma correspondente, adicione um `mat-btn` na seção Materiais de Estudo:

```html
<a href="https://profjonathansousa.github.io/filosofia_joel-2026/pdf/em1/NomeDoArquivo.pdf"
   class="mat-btn" target="_blank" rel="noopener">
  <div>
    <div class="mat-name">Nome visível do material</div>
    <div class="mat-type">PDF · Descrição breve</div>
  </div>
  <div class="mat-icon">⬇️</div>
</a>
```

---

## Ponto Cego — núcleo extraclasse

Área do núcleo de filosofia fora da aula, em `ponto-cego/`. Não é turma: tem cor própria
(os tokens `--pc-*` do `style.css`, definidos no tema escuro e no claro) e entra na navbar
depois de um divisor. As páginas do núcleo usam `<body class="pc-pagina">`.

O núcleo publica a pergunta em que parou, não o que concluiu. Na página de cada sessão, o
elemento mais pesado é o impasse.

### Publicar uma sessão (até 48 horas depois do encontro)

O checklist completo está no comentário do topo de `ponto-cego/_modelo-sessao.html`. Cada
publicação mexe em quatro arquivos:

1. `ponto-cego/sessao-N.html`, copiado do molde;
2. `ponto-cego/sessao-(N-1).html`, cujo gancho vira link para a sessão nova;
3. `ponto-cego/index.html`: pergunta vigente, cronograma e lista de sessões publicadas;
4. `index.html`: a pergunta e a data do cartão «Fora da aula».

Antes do commit, rode `python3 scripts/teste_ponto_cego.py` e só publique com zero falhas.
O script confere links, a pergunta vigente igual onde aparece, a regra de revelação,
marcadores esquecidos, os blocos que nunca se cortam (impasse, gancho, responda), a navbar,
as cores e o vocabulário.

### Regras que valem também para o repositório

O repositório é público, e o histórico guarda tudo o que um dia foi comitado, mesmo depois
de apagado. Por isso:

- **Nenhum tema antes da hora.** Cada tema aparece só depois de revelado, no fim da sessão
  anterior: nem em comentário, nem em arquivo de dados, nem em mensagem de commit.
- **Nenhum nome de aluno.** O crédito fica no impresso.
- **Nenhuma nota de trabalho em Markdown no repositório.** O GitHub Pages publica `.md`
  como página, este README inclusive. As notas das sessões ficam no vault.
- **Do texto lido, só autor, obra, locus e a frase-chave.**
- **O endereço de uma sessão não muda depois que o QR do cartaz foi impresso.**

---

*Última atualização: 23 set 2026*

---

## Pendências conhecidas · 2026-09-12

- **Nome dos Programas em PDF.** O Portal publica `Programa_EM*_2026_2-3Trim.pdf`; o vault
  usa `Programa_EM*_2026_2-4Bim.md`. Um dos dois nomes está errado, e o conteúdo do vault
  é organizado por bimestre. Resolver antes de republicar os PDFs.
- **PDFs da U2 pendentes:** textos-base das três séries e as versões de aluno dos novos
  Testes de Meio.
- **Unidade 3 não será ministrada em 2026.** Decisão registrada em `CONCLUIDO_EM.md`.
- **Tema claro das turmas · 23/09.** No tema claro, o título do cabeçalho de cada turma
  some: `--header-from` e `--header-to` só têm os tons escuros. A correção é redefinir
  esses dois tokens e `--accent2` dentro de `@media (prefers-color-scheme: light)` em cada
  página. Fora de produção por decisão do autor.
- **Status das aulas e fuso · 23/09.** O script das turmas monta a data com
  `new Date('aaaa-mm-dd')`, que o JavaScript lê como UTC: em Brasília, a aula do dia aparece
  como «✓ Concluída» desde a meia-noite. A correção é `new Date(ano, mês - 1, dia)`. Fora de
  produção por decisão do autor.
