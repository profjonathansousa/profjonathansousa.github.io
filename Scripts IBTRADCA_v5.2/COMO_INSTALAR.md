# IBTRADCA — v5.2
## Presença em lote + exclusão de registro

Duas funções novas no painel, na seção **Presença**:

| Botão | O que mudou |
|---|---|
| **3. Lançar presença manual** | agora aceita **vários alunos e os dois tempos de uma vez**, com filtro |
| **7. Excluir registro de presença** | **novo** — apaga marcação repetida ou feita por engano |

---

## Arquivos para atualizar no Apps Script

São 4 arquivos. Abra a planilha → **Extensões → Apps Script** e:

1. **`09_presenca_lote.js`** — arquivo **NOVO**.
   No editor: `+` ao lado de "Arquivos" → **Script** → nome `09_presenca_lote` →
   apague o conteúdo padrão e cole o arquivo inteiro.

2. **`sidebar_ibtradca_html.html`** — substitua o conteúdo inteiro do arquivo
   `sidebar_ibtradca_html` existente.

3. **`Código.js`** — substitua o conteúdo inteiro.
   (mudança pequena: `getRegistrosPresencaAluno` passa a devolver também a **hora**
   da marcação, para dar para distinguir duas linhas do mesmo aluno no mesmo tempo)

4. **`centro_controle.js`** — substitua o conteúdo inteiro.
   (mudança pequena: a aba `Log_Exclusoes_Presenca` entra na lista de abas que o
   botão "Mostrar abas" exibe)

Depois: **Salvar** (💾) e recarregar a planilha (F5). Nenhuma permissão nova
é pedida e nada precisa ser feito no Google Forms.

---

## 1. Lançar presença manual — vários alunos

Ao abrir, o painel já carrega **a lista de alunos com a situação da aula de hoje**:

```
IBTR-002  BRUNO LIMA        1P  2–
IBTR-003  CARLA DIAS        1F  2–
IBTR-004  DANIEL ROCHA      1A  2–
```

- `1P` / `2P` — já tem presença nesse tempo
- `1F` / `2F` — tem falta registrada (o "Fechar aula" já rodou)
- `1A` / `2A` — falta abonada
- `1–` / `2–` — nenhum registro ainda

Para lançar a presença dos 18 alunos novos:

1. Confira a data (vazio = hoje) e clique **Atualizar** se mudar a data.
2. Deixe **1º Tempo** e **2º Tempo** marcados — lança os dois de uma vez.
3. Deixe marcado **"Somente quem ainda não tem presença"** — a lista passa a
   mostrar só quem falta.
4. **Marcar todos** → **Lançar presença**.

O filtro de texto procura por nome ou matrícula, e "Marcar todos" marca apenas
quem está visível no filtro do momento.

### Cuidado que o sistema toma sozinho

- **Não duplica**: quem já tem presença naquele tempo é pulado.
- **Falta virando presença**: se o "Fechar aula" já tinha lançado a falta, a
  linha da falta é **convertida** em `MANUAL` em vez de criar uma segunda linha.
  Isso importa: na consolidação, presenças repetidas são deduplicadas, mas
  **faltas não** — sem essa conversão o aluno ficaria com presença *e* falta no
  mesmo tempo, e o percentual dele cairia.
- **Abono é respeitado**: quem está com `ABONADA` é pulado (para desfazer um
  abono, use o botão 6).
- No fim aparece um resumo: quantas foram lançadas, quantas faltas viraram
  presença, quem foi pulado.

Depois de lançar, rode **4. Consolidar frequência**.

---

## 2. Excluir registro de presença (botão 7)

Dois modos de busca:

- **Por aluno** — escolha o aluno e a data, e veja todas as linhas dele naquele dia.
- **Somente marcações duplicadas** — marque essa caixa e veja, de uma vez, **todos
  os alunos do dia que têm mais de uma linha no mesmo tempo**. É o caminho para
  limpar quem marcou duas vezes.

Cada linha aparece com **tempo · hora · status**, e as repetidas levam a etiqueta
`dup`. A hora é o que distingue uma marcação da outra. Marque o que vai sair,
clique **Excluir selecionados** e confirme na tela seguinte.

### Proteções

- Antes de apagar, o sistema **reconfere** que a linha ainda é a mesma que foi
  listada (data + aluno + disciplina + tempo). Se alguém mexeu na planilha no
  meio do caminho, ele recusa e pede para refazer a busca — em vez de apagar a
  linha errada.
- Toda linha apagada é copiada para a aba **`Log_Exclusoes_Presenca`** (criada
  automaticamente, oculta), com data da exclusão e usuário. Dá para reconstruir
  o registro se a exclusão tiver sido engano.
- A busca **não** se limita à disciplina ativa: dá para apagar marcação de
  disciplina já encerrada.

Depois de excluir, rode **4. Consolidar frequência**.

---

## Observação sobre as marcações em duplicidade

Vale saber, antes de sair apagando: a **consolidação já trata disso**.
`consolidarFrequencia` conta presenças únicas por aluno + tempo + dia, então
quem marcou duas vezes **não** aparece com duas presenças no relatório final.
A exclusão serve para deixar a lista de presença limpa e o relatório do dia
fiel — não para corrigir um número errado de frequência.
