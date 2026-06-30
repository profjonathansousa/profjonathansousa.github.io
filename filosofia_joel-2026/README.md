# Portal de Filosofia · C.E. Prof. Joel de Oliveira · 2026

**Prof. Dr. Jonathan Sousa** · Filosofia · SEEDUC-RJ  
**GitHub Pages:** [profjonathansousa.github.io/filosofia_joel-2026](https://profjonathansousa.github.io/filosofia_joel-2026/)

---

## Sobre o projeto

Portal estudantil de filosofia para 6 turmas do Ensino Médio do C.E. Professor Joel de Oliveira (SEEDUC-RJ), cobrindo o 2º e 3º Trimestres de 2026. Cada turma tem uma página própria com cronograma de aulas, descrição das avaliações e links para os materiais de estudo em PDF.

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

| Arquivo | Turma | Horário | Unidade 1 |
|---|---|---|---|
| `em1_quinta.html` | IMAT_CN_1002 | Quinta 10h35–12h15 | Mito e Filosofia |
| `em2_quinta.html` | IF_SE_2001 | Quinta 08h40–10h20 | Instrumentos do Pensar Filosófico |
| `em3_3003_quinta.html` | IF_SE_3003 | Quinta 07h00–08h40 | A Dimensão Ética |
| `em3_3006_quinta.html` | IT_GD_3006 | Quinta 12h45–14h25 | A Dimensão Ética |
| `em3_3001_sexta.html` | IF_SE_3001 | Sexta 07h00–08h40 | A Dimensão Ética |
| `em3_3002_sexta.html` | IT_GD_3002 | Sexta 08h40–10h20 | A Dimensão Ética |

---

## Modelo de avaliação por série

### EM1 e EM2 — Modelo Padrão (5,0 pts)

| Tipo | Qtd | Nível | Valor | Total |
|---|---|---|---|---|
| Múltipla escolha (5 opções) | 3 | Fácil | 1,0 pt | 3,0 pts |
| Discursiva intermediária | 1 | Intermediário | 1,0 pt | 1,0 pt |
| Discursiva difícil | 1 | Difícil | 1,0 pt | 1,0 pt |
| **TOTAL** | | | | **5,0 pts** |

### EM3 — Modelo ENEM (5,0 pts)

| Tipo | Qtd | Descrição | Total |
|---|---|---|---|
| Texto motivador | 1 | Trecho filosófico ou situação-problema | — |
| Questões objetivas (modelo ENEM) | 10 | Competências C1–C5, uma por questão | 5,0 pts |
| **TOTAL** | | | **5,0 pts** |

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

*Última atualização: 29 jun 2026*
