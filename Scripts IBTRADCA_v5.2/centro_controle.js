// =====================================================
// IBTRADCA — 05_setup_menu.js
// Versão 5.1
//
// MUDANÇAS:
//  - Seção "Presença" reordenada: Atualizar Formulário PRIMEIRO,
//    depois Fechar Aula, depois Consolidar Frequência.
//    (Ordem correta de operação: sincronizar → fechar → consolidar)
//  - Novos itens: Cadastrar Professor, PDF Professores,
//    Relatório de Frequência do Dia, Lançar Presença Manual
//  - Instalador do trigger onFormSubmit (carimba status)
//
//  v5.1:
//  - Novo item em "Manutenção do Histórico":
//    "Remover Registro do Histórico" (removerRegistroHistorico)
// =====================================================

function onOpen() {
  var planilha  = SpreadsheetApp.getActiveSpreadsheet();
  var abaInicio = planilha.getSheetByName("Início");
  if (abaInicio) planilha.setActiveSheet(abaInicio);

  SpreadsheetApp.getUi()
    .createMenu("IBTRADCA")
    .addItem("Abrir painel de controle", "abrirPainel")
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu("Cadastros")
      .addItem("Cadastrar/Alterar Aluno", "cadastrarAluno")
      .addItem("Cadastrar/Alterar Disciplina", "cadastrarDisciplina")
      .addItem("Cadastrar/Alterar Professor", "abrirPainel"))
    .addSubMenu(SpreadsheetApp.getUi().createMenu("Presença")
      .addItem("1. Fechar Aula", "fecharAula")
      .addItem("2. Consolidar Frequência", "consolidarFrequencia")
      .addSeparator()
      .addItem("Lançar Presença Manual", "lancarPresencaManualMenu")
      .addItem("Relatório de Frequência do Dia", "gerarRelatorioFrequenciaDia")
      .addItem("Forçar atualização do Formulário", "atualizarFormularioComAviso"))
    .addSubMenu(SpreadsheetApp.getUi().createMenu("Notas")
      .addItem("Consolidar Notas", "consolidarNotas")
      .addItem("Resultado Final", "gerarResultadoFinal")
      .addItem("Arquivar Disciplina", "arquivarDisciplina"))
    .addSubMenu(SpreadsheetApp.getUi().createMenu("Relatórios PDF")
      .addItem("PDF — Alunos (Todos)", "gerarPDFAlunos")
      .addItem("PDF — Alunos Ativos", "_gerarPDFAlunosAtivos")
      .addItem("PDF — Alunos Inativos", "_gerarPDFAlunosInativos")
      .addItem("PDF — Disciplinas", "gerarPDFDisciplinas")
      .addItem("PDF — Professores", "gerarPDFTodosProfessores")
      .addItem("PDF — Histórico por Aluno", "gerarPDFHistoricoAluno"))
    .addSubMenu(SpreadsheetApp.getUi().createMenu("Consultas")
      .addItem("Histórico do Aluno", "consultarHistoricoAluno"))
    .addSubMenu(SpreadsheetApp.getUi().createMenu("Manutenção do Histórico")
      .addItem("Prévia de Importação (Excel)", "previsualizarImportacao")
      .addItem("Executar Importação (Excel)", "executarImportacao")
      .addSeparator()
      .addItem("Prévia — Limpar Disciplinas Duplicadas", "_limparRedundanciasHistoricoPrevia")
      .addItem("Executar — Limpar Disciplinas Duplicadas", "_limparRedundanciasHistoricoExecutar")
      .addSeparator()
      .addItem("Prévia — Remover Linhas Fantasma", "_removerLinhasFantasmaHistoricoPrevia")
      .addItem("Executar — Remover Linhas Fantasma", "_removerLinhasFantasmaHistoricoExecutar")
      .addSeparator()
      .addItem("Remover Registro do Histórico", "removerRegistroHistorico")
      .addSeparator()
      .addItem("Corrigir Formato de % Frequência", "_corrigirFormatoFrequenciaHistorico")
      .addItem("Recalcular Situação (após mudar critérios)", "_recalcularSituacaoHistorico")
      .addItem("Sincronizar Relatórios do Histórico", "sincronizarDoHistorico"))
    .addSeparator()
    .addItem("Mostrar/Ocultar abas", "alternarAbasSenha")
    .addToUi();

  abrirPainel();
}

function abrirPainel() {
  var html = HtmlService.createHtmlOutputFromFile("sidebar_ibtradca_html")
    .setTitle("IBTRADCA").setWidth(280);
  SpreadsheetApp.getUi().showSidebar(html);
}


// =====================================================
// INSTALA TRIGGER onOpen (uma vez)
// =====================================================
function instalarTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === "onOpen") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onOpen")
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onOpen()
    .create();
  Logger.log("Trigger onOpen instalado com sucesso.");
}


// =====================================================
// INSTALA TRIGGER onFormSubmit (carimba status de presença)
// Pode ser executado diretamente do editor do Apps Script.
// =====================================================
function instalarTriggerPresenca() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === "aoEnviarPresenca_") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("aoEnviarPresenca_")
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onFormSubmit()
    .create();
  Logger.log("Trigger aoEnviarPresenca_ instalado com sucesso.");
}


// =====================================================
// GARANTE cabeçalho da coluna F (Status) em Form_Respostas_Presenca
// Execute uma vez.
// =====================================================
function prepararColunaStatus() {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Form_Respostas_Presenca");
  aba.getRange("F1").setValue("Status");
  aba.getRange("F1").setBackground("#B40000").setFontColor("#FFFFFF").setFontWeight("bold");
  SpreadsheetApp.getUi().alert("Coluna F (Status) preparada.");
}


// =====================================================
// LANÇAR PRESENÇA MANUAL via menu (versão prompt)
// O sidebar usa a versão modal (_lancarPresencaManual)
// =====================================================
function lancarPresencaManualMenu() {
  var ui = SpreadsheetApp.getUi();
  var rM = ui.prompt("Presença Manual (1/2)", "Matrícula (ex: IBTR-003):", ui.ButtonSet.OK_CANCEL);
  if (rM.getSelectedButton() != ui.Button.OK) return;
  var rT = ui.prompt("Presença Manual (2/2)", "Tempo (digite 1 ou 2):", ui.ButtonSet.OK_CANCEL);
  if (rT.getSelectedButton() != ui.Button.OK) return;
  var tempo = rT.getResponseText().trim() === "2" ? "2º Tempo" : "1º Tempo";
  var res = lancarPresencaManual_(rM.getResponseText(), tempo, null);
  ui.alert(res.ok ? "Sucesso" : "Atenção", res.msg, ui.ButtonSet.OK);
}


// =====================================================
// CONTROLE DE ABAS
// =====================================================
var ABAS_SISTEMA = [
  "Cadastro_Alunos", "Cadastro_Disciplinas", "Cadastro_Professores",
  "Form_Respostas_Presenca", "Frequencia_Consolidada", "Form_Respostas_Notas",
  "Notas_Consolidadas", "Resultado_Final", "Historico_Consolidado",
  "Listas_Auxiliares", "Configuracoes", "Log_Exclusoes_Presenca"
];

function getEstadoAbas() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var ocultas = 0;
  ABAS_SISTEMA.forEach(function(nome){
    var aba = planilha.getSheetByName(nome);
    if (aba && aba.isSheetHidden()) ocultas++;
  });
  return ocultas >= Math.floor(ABAS_SISTEMA.length / 2) ? "ocultas" : "visiveis";
}

function alternarAbasSenha() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt("Acesso restrito", "Digite a senha:", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() != ui.Button.OK) return;
  if (r.getResponseText() != "12345") { ui.alert("Senha incorreta."); return; }
  _alternarAbas("12345");
}

function _alternarAbas(senha) {
  if (senha !== "12345") return "senha_incorreta";
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var estado = getEstadoAbas();
  ABAS_SISTEMA.forEach(function(nome){
    var aba = planilha.getSheetByName(nome);
    if (!aba) return;
    if (estado === "visiveis") aba.hideSheet(); else aba.showSheet();
  });
  var abaInicio = planilha.getSheetByName("Início");
  if (abaInicio) { abaInicio.showSheet(); planilha.setActiveSheet(abaInicio); }
  return estado === "visiveis" ? "ocultas" : "visiveis";
}

// Dados dos cards do Início (chamado pelo sidebar)
function getDadosCards() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var totalAtivos = 0;
  try {
    var abaAlunos = planilha.getSheetByName("Cadastro_Alunos");
    if (abaAlunos && abaAlunos.getLastRow() > 1) {
      abaAlunos.getRange(2, 4, abaAlunos.getLastRow()-1, 1).getValues()
        .forEach(function(r){ if (String(r[0]).trim() == "Ativo") totalAtivos++; });
    }
  } catch(e) {}

  // Lista TODAS as disciplinas ativas (não só a primeira), cada uma marcada
  // se já tem alguma nota REAL (maior que zero) lançada em Notas_Consolidadas
  // — sinal de que precisa ser arquivada (útil quando há mais de uma
  // disciplina ativa simultaneamente, ex: nota atrasada lançada numa
  // disciplina que não é mais a "corrente").
  var discsAtivas = [];  // [{ codigo, nome, precisaArquivar }]
  try {
    var abaDisc = planilha.getSheetByName("Cadastro_Disciplinas");

    // Notas_Consolidadas pode guardar a disciplina COM ou SEM código,
    // dependendo de como o Forms de notas estava configurado no momento
    // de cada lançamento — por isso a comparação remove o código de
    // ambos os lados (nomePuroDisciplina_) antes de normalizar.
    var nomesComNotaReal = {};  // nome puro de disciplina normalizado → true
    var abaNotas = planilha.getSheetByName("Notas_Consolidadas");
    if (abaNotas && abaNotas.getLastRow() > 1) {
      var dn = abaNotas.getRange(2, 2, abaNotas.getLastRow() - 1, 4).getValues();
      // B=Disciplina(0) C=Prova(1) D=Trabalho(2) E=Media(3)
      dn.forEach(function(r) {
        var disc = r[0];
        var media = Number(r[3]) || 0;
        if (disc && media > 0) nomesComNotaReal[normalizar_(nomePuroDisciplina_(String(disc)))] = true;
      });
    }

    if (abaDisc && abaDisc.getLastRow() > 1) {
      var dd = abaDisc.getDataRange().getValues();
      for (var i = 1; i < dd.length; i++) {
        if (String(dd[i][5]).trim() == "Ativo") {
          var codigo = dd[i][0], nome = dd[i][1];
          var precisaArquivar = !!nomesComNotaReal[normalizar_(nomePuroDisciplina_(nome))];
          discsAtivas.push({ codigo: codigo, nome: nome, precisaArquivar: precisaArquivar });
        }
      }
    }
  } catch(e) {}

  var ultimaAula = "—";
  try {
    var abaResp = planilha.getSheetByName("Form_Respostas_Presenca");
    if (abaResp && abaResp.getLastRow() > 1) {
      var rd = abaResp.getRange(2, 1, abaResp.getLastRow()-1, 1).getValues();
      var ms = 0;
      rd.forEach(function(r){ if (r[0]) { var t = new Date(r[0]).getTime(); if (t > ms) ms = t; } });
      if (ms > 0) ultimaAula = Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), "dd/MM/yyyy");
    }
  } catch(e) {}

  return { alunos: totalAtivos, discsAtivas: discsAtivas, ultimaAula: ultimaAula };
}

// Logo do IBTR em base64, para inserir no cabeçalho do Dashboard
// (aba Início). Fundo removido (transparente), redimensionada para
// caber na faixa azul do título sem distorcer.
var LOGO_DASHBOARD_BASE64 = "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";

function inserirLogoDashboard_(aba) {
  // Inserir uma única vez: usa Document Properties para lembrar que a
  // logo já foi colocada, evitando empilhar imagens duplicadas toda
  // vez que o painel lateral recarrega (atualizarCardsInicio roda a
  // cada abertura do sidebar).
  var props = PropertiesService.getDocumentProperties();
  if (props.getProperty("LOGO_DASHBOARD_INSERIDA") === "sim") return;

  try {
    var bytes = Utilities.base64Decode(LOGO_DASHBOARD_BASE64);
    var blob  = Utilities.newBlob(bytes, "image/png", "logo_ibtr.png");

    // Posiciona a logo sobre a faixa azul do título (linha 2 do layout,
    // coluna B), ao lado esquerdo do texto "IBTRADCA — Sistema Acadêmico".
    aba.insertImage(blob, 2, 2)
      .setWidth(62)
      .setHeight(52)
      .setAnchorCellXOffset(4)
      .setAnchorCellYOffset(4);

    props.setProperty("LOGO_DASHBOARD_INSERIDA", "sim");
  } catch (e) {
    // Falha silenciosa: a logo é decorativa, não deve travar o painel
    // se por algum motivo a inserção falhar (ex: aba protegida).
  }
}

function atualizarCardsInicio() {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Início");
  if (!aba) return;

  inserirLogoDashboard_(aba);

  var d = getDadosCards();

  aba.getRange("B7:D7").setValue(d.alunos);
  aba.getRange("H7:J7").setValue(d.ultimaAula);

  // Card de disciplina(s) ativa(s) — célula mesclada E7:G7.
  // Quando há mais de uma disciplina ativa e alguma já tem nota lançada
  // (precisa ser arquivada), cada linha mostra o nome e, se for o caso,
  // " — Arquivar" em vermelho/negrito ao final.
  var celDisc = aba.getRange("E7:G7");
  celDisc.setWrap(true).setVerticalAlignment("middle");

  if (d.discsAtivas.length === 0) {
    celDisc.setValue("—");
  } else if (d.discsAtivas.length === 1 && !d.discsAtivas[0].precisaArquivar) {
    // Caso simples (mais comum): uma única disciplina ativa, sem pendência
    celDisc.setValue(d.discsAtivas[0].nome);
  } else {
    // Múltiplas disciplinas ativas, ou alguma com nota pendente de arquivar:
    // monta rich text com quebras de linha e o aviso "Arquivar" em vermelho
    var texto = "";
    var partes = []; // { texto, negrito, cor }

    d.discsAtivas.forEach(function(disc, idx) {
      if (idx > 0) texto += "\n";
      var inicioLinha = texto.length;
      texto += disc.nome;
      partes.push({ start: inicioLinha, end: texto.length, cor: null, negrito: false });

      if (disc.precisaArquivar) {
        var inicioAviso = texto.length;
        texto += "  ⚠ Arquivar";
        partes.push({ start: inicioAviso, end: texto.length, cor: "#C5221F", negrito: true });
      }
    });

    var builder = SpreadsheetApp.newRichTextValue().setText(texto);
    partes.forEach(function(p) {
      if (p.cor) {
        builder.setTextStyle(p.start, p.end, SpreadsheetApp.newTextStyle()
          .setForegroundColor(p.cor).setBold(true).build());
      }
    });
    celDisc.setRichTextValue(builder.build());
  }

  // Ajusta a altura da linha 7 para caber todas as disciplinas listadas
  // (o layout original previa só uma linha de texto nesse card)
  var alturaBase = 68;
  var alturaPorLinha = 26;
  var novaAltura = d.discsAtivas.length > 1
    ? alturaBase + (d.discsAtivas.length - 1) * alturaPorLinha
    : alturaBase;
  aba.setRowHeight(7, novaAltura);

  // Sub do card (E8:G8) — código da primeira disciplina, ou contagem se houver várias
  var subTexto = "—";
  if (d.discsAtivas.length === 1) subTexto = d.discsAtivas[0].codigo;
  else if (d.discsAtivas.length > 1) subTexto = d.discsAtivas.length + " disciplinas ativas";
  aba.getRange("E8:G8").setValue(subTexto);
}


// =====================================================
// WRAPPERS de cadastro
// =====================================================
function _cadastrarAluno()       { cadastrarAluno();       return "ok"; }
function _cadastrarDisciplina()  { cadastrarDisciplina();  return "ok"; }

// =====================================================
// LEITURA E GRAVAÇÃO DE TODAS AS CONFIGURAÇÕES DO SISTEMA
// Chamado pelo sidebar via _lerConfiguracoes() e _salvarConfiguracoes(dados)
//
// Campos na aba Configuracoes:
//   C2 = nota mínima para aprovação        (número, ex: 7)
//   C5 = % mínimo de frequência            (número, ex: 60)
//   E2 = início 1º Tempo (HH:MM)
//   F2 = fim 1º Tempo    (HH:MM)
//   E3 = início 2º Tempo (HH:MM)
//   F3 = fim 2º Tempo    (HH:MM)
//
// Horários vazios = sem restrição de janela (dia inteiro válido).
// =====================================================
function _lerConfiguracoes() {
  var abaCfg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Configuracoes");
  if (!abaCfg) return { notaMinima: 7, freqMinima: 60, t1ini: "", t1fim: "", t2ini: "", t2fim: "" };

  function lerNum(cel, fallback) {
    var v = abaCfg.getRange(cel).getValue();
    var n = Number(v);
    return (v !== "" && !isNaN(n) && n > 0) ? n : fallback;
  }

  function lerHora(cel) {
    var v = abaCfg.getRange(cel).getValue();
    if (v instanceof Date) {
      var h = v.getHours(), m = v.getMinutes();
      return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
    }
    if (typeof v === "string" && v.indexOf(":") > -1) return v.trim();
    if (typeof v === "number" && v > 0 && v < 1) {
      var totalMin = Math.round(v * 24 * 60);
      var hh = Math.floor(totalMin / 60), mm = totalMin % 60;
      return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
    }
    return "";
  }

  return {
    notaMinima: lerNum("C2", 7),
    freqMinima: lerNum("C5", 60),
    t1ini: lerHora("E2"),
    t1fim: lerHora("F2"),
    t2ini: lerHora("E3"),
    t2fim: lerHora("F3")
  };
}

function _salvarConfiguracoes(dados) {
  var abaCfg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Configuracoes");
  if (!abaCfg) return { ok: false, msg: "Aba Configuracoes não encontrada." };

  function gravarNum(cel, valor) {
    var n = Number(valor);
    if (!isNaN(n) && n > 0) abaCfg.getRange(cel).setValue(n).setNumberFormat("0.##");
  }

  function gravarHora(cel, valor) {
    if (!valor || !valor.trim()) {
      abaCfg.getRange(cel).clearContent();
      return;
    }
    abaCfg.getRange(cel).setValue(valor.trim()).setNumberFormat("@");
  }

  try {
    gravarNum("C2", dados.notaMinima);
    gravarNum("C5", dados.freqMinima);
    gravarHora("E2", dados.t1ini);
    gravarHora("F2", dados.t1fim);
    gravarHora("E3", dados.t2ini);
    gravarHora("F3", dados.t2fim);
    return { ok: true, msg: "Configurações salvas com sucesso." };
  } catch(e) {
    return { ok: false, msg: "Erro ao salvar: " + e.message };
  }
}
