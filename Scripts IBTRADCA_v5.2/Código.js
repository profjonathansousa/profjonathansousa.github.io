// =====================================================
// IBTRADCA — 01_core_presenca.js
// Versão 5.1
//
// CORRIGE:
//  - Ordem REAL das colunas do Form_Respostas_Presenca:
//      A [0] = Carimbo de data/hora
//      B [1] = Disciplina
//      C [2] = Nome do Aluno
//      D [3] = Tempo de Aula          (1º Tempo / 2º Tempo)
//      E [4] = Estou presente?        (Sim / Não)
//      F [5] = Status                 (VALIDA / DUPLICADA / FORA_DO_HORARIO / MANUAL)
//  - Cruzamento por matrícula (IBTR-NNN) + normalização de nome
//  - Janela de horário lida de Configuracoes (E2/F2 e E3/F3)
//  - Anti-duplicação por tempo
//  - Lançamento manual de presença
//
//  v5.1:
//  - Alteração manual de status de presença (secretaria):
//    getRegistrosPresencaAluno() + alterarStatusPresenca_()
// =====================================================


// =====================================================
// NORMALIZAÇÃO DE TEXTO
// =====================================================
function normalizar_(texto) {
  if (texto === null || texto === undefined) return "";
  return texto
    .toString()
    .replace(/–|—|―/g, "-")  // todos os traços viram hífen simples
    .replace(/\s+/g, " ")
    .replace(/\.\s*$/, "")                   // remove ponto final
    .trim()
    .toUpperCase();
}

// Extrai o nome PURO de uma disciplina, removendo o código "IBTR-DNN — "
// se ele existir. Diferentes telas do sistema gravam a disciplina ora
// com código (ex: arquivamento), ora sem (ex: Forms de notas/presença),
// então qualquer comparação de disciplina entre abas diferentes deve
// sempre passar por aqui antes de normalizar_(), nunca comparar o texto
// bruto diretamente.
function nomePuroDisciplina_(texto) {
  var s = String(texto || "").trim();
  var m = s.match(/^IBTR-D\d+\s*[—\-]\s*(.+)$/i);
  return m ? m[1].trim() : s;
}

// Extrai SÓ a matrícula (IBTR-NNN) de qualquer formato de aluno.
// Aceita "IBTR-001 — NOME", "IBTR-001—NOME", "IBTR-001 - NOME", "IBTR-001"
function extrairMatricula_(textoAluno) {
  if (!textoAluno) return "";
  var m = String(textoAluno).toUpperCase().match(/IBTR-\d+/);
  return m ? m[0].trim() : "";
}

function converterTimestamp_(raw) {
  if (raw instanceof Date) return raw;
  if (typeof raw === "number") {
    return new Date(Math.round((raw - 25569) * 86400 * 1000));
  }
  return new Date(raw);
}

// =====================================================
// LÊ JANELAS DE HORÁRIO da aba Configuracoes
// E2/F2 = 1º Tempo (início/fim) | E3/F3 = 2º Tempo (início/fim)
// Retorna minutos-do-dia. Fallback amplo se vazio.
// =====================================================
function obterJanelasHorario_() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var abaCfg   = planilha.getSheetByName("Configuracoes");
  var tz       = Session.getScriptTimeZone();

  function celMin(cel, fallback) {
    if (!abaCfg) return fallback;
    var v = abaCfg.getRange(cel).getValue();
    if (v instanceof Date) {
      return v.getHours() * 60 + v.getMinutes();
    }
    if (typeof v === "string" && v.indexOf(":") > -1) {
      var p = v.split(":");
      return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    }
    if (typeof v === "number") {           // fração de dia (0–1)
      return Math.round(v * 24 * 60);
    }
    return fallback;
  }

  return {
    "1º Tempo": { ini: celMin("E2", 0),    fim: celMin("F2", 1439) },
    "2º Tempo": { ini: celMin("E3", 0),    fim: celMin("F3", 1439) }
  };
}

// =====================================================
// LÊ CRITÉRIOS ACADÊMICOS da aba Configuracoes
// C2 = nota mínima para aprovação (padrão: 7)
// C5 = % mínimo de frequência para aprovação (padrão: 75)
// Fallback nos valores padrão se a célula estiver vazia ou inválida.
// Usada por TODOS os pontos do sistema que decidem situação de
// aprovação/pendência — nunca comparar contra 7 ou 75 fixo no código.
// =====================================================
function obterCriteriosAcademicos_() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var abaCfg   = planilha.getSheetByName("Configuracoes");

  function numOuFallback(cel, fallback) {
    if (!abaCfg) return fallback;
    var v = abaCfg.getRange(cel).getValue();
    var n = Number(v);
    return (v !== "" && !isNaN(n) && n > 0) ? n : fallback;
  }

  return {
    notaMinima: numOuFallback("C2", 7),
    freqMinima: numOuFallback("C5", 75)
  };
}

function dentroDaJanela_(dataObj, tempo, janelas) {
  var j = janelas[tempo];
  if (!j) return true;                      // tempo desconhecido → não bloqueia
  var min = dataObj.getHours() * 60 + dataObj.getMinutes();
  return min >= j.ini && min <= j.fim;
}


// =====================================================
// TRIGGER onFormSubmit — carimba STATUS na coluna F
// INSTALE via instalarTriggerPresenca() (ver 05_setup.js)
// =====================================================
function aoEnviarPresenca_(e) {
  var planilha     = SpreadsheetApp.getActiveSpreadsheet();
  var abaRespostas = planilha.getSheetByName("Form_Respostas_Presenca");
  var janelas      = obterJanelasHorario_();

  var linha = e && e.range ? e.range.getRow() : abaRespostas.getLastRow();

  var dataObj    = converterTimestamp_(abaRespostas.getRange(linha, 1).getValue());
  var disciplina = abaRespostas.getRange(linha, 2).getValue();
  var aluno      = abaRespostas.getRange(linha, 3).getValue();
  var tempo      = abaRespostas.getRange(linha, 4).getValue();

  var matricula = extrairMatricula_(aluno);
  var hoje      = Utilities.formatDate(dataObj, Session.getScriptTimeZone(), "dd/MM/yyyy");

  var status;

  // 1) Fora da janela de horário?
  if (!dentroDaJanela_(dataObj, tempo, janelas)) {
    status = "FORA_DO_HORARIO";
  } else {
    // 2) Duplicada? (mesma matrícula + disciplina + tempo + dia, já VÁLIDA/MANUAL)
    var dados      = abaRespostas.getDataRange().getValues();
    var jaTemValida = false;

    for (var i = 1; i < dados.length; i++) {
      if ((i + 1) === linha) continue;       // ignora a própria linha
      var dObj  = converterTimestamp_(dados[i][0]);
      var dDia  = Utilities.formatDate(dObj, Session.getScriptTimeZone(), "dd/MM/yyyy");
      var dMat  = extrairMatricula_(dados[i][2]);
      var dTemp = dados[i][3];
      var dStat = dados[i][5];

      if (
        dDia === hoje &&
        dMat === matricula && matricula !== "" &&
        normalizar_(dados[i][1]) === normalizar_(disciplina) &&
        dTemp === tempo &&
        (dStat === "VALIDA" || dStat === "MANUAL")
      ) {
        jaTemValida = true;
        break;
      }
    }
    status = jaTemValida ? "DUPLICADA" : "VALIDA";
  }

  abaRespostas.getRange(linha, 6).setValue(status);
}


// =====================================================
// LANÇAMENTO MANUAL DE PRESENÇA
// Chamado pelo sidebar via _lancarPresencaManual(matricula, tempo, dataStr)
// Ignora janela de horário (é a exceção administrativa).
// =====================================================
function lancarPresencaManual_(matricula, tempo, dataStr) {
  var planilha     = SpreadsheetApp.getActiveSpreadsheet();
  var abaRespostas = planilha.getSheetByName("Form_Respostas_Presenca");
  var abaAlunos    = planilha.getSheetByName("Cadastro_Alunos");
  var tz           = Session.getScriptTimeZone();

  matricula = String(matricula || "").trim().toUpperCase();
  if (!matricula) return { ok: false, msg: "Matrícula vazia." };
  if (tempo !== "1º Tempo" && tempo !== "2º Tempo")
    return { ok: false, msg: "Tempo inválido." };

  var disciplina = obterDisciplinaAtiva_();
  if (!disciplina) return { ok: false, msg: "Nenhuma disciplina ativa." };

  // Monta nome completo a partir do cadastro
  var alunos = abaAlunos.getRange(2, 1, abaAlunos.getLastRow() - 1, 4).getValues();
  var nomeCompleto = "";
  for (var i = 0; i < alunos.length; i++) {
    if (String(alunos[i][0]).trim().toUpperCase() === matricula) {
      nomeCompleto = alunos[i][0] + " — " + alunos[i][1];
      break;
    }
  }
  if (!nomeCompleto) return { ok: false, msg: "Matrícula não encontrada: " + matricula };

  // Data alvo
  var dataObj;
  if (dataStr) {
    var p = dataStr.split("/");                        // dd/MM/yyyy
    dataObj = new Date(p[2], p[1] - 1, p[0], 12, 0, 0);
  } else {
    dataObj = new Date();
  }
  var diaAlvo = Utilities.formatDate(dataObj, tz, "dd/MM/yyyy");

  // Já existe presença válida/manual para esse aluno+tempo+dia+disciplina?
  var dados = abaRespostas.getDataRange().getValues();
  for (var k = 1; k < dados.length; k++) {
    var dDia = Utilities.formatDate(converterTimestamp_(dados[k][0]), tz, "dd/MM/yyyy");
    if (
      dDia === diaAlvo &&
      extrairMatricula_(dados[k][2]) === matricula &&
      normalizar_(dados[k][1]) === normalizar_(disciplina) &&
      dados[k][3] === tempo &&
      (dados[k][5] === "VALIDA" || dados[k][5] === "MANUAL")
    ) {
      return { ok: false, msg: nomeCompleto + " já tem presença no " + tempo + " (" + diaAlvo + ")." };
    }
  }

  abaRespostas.appendRow([dataObj, disciplina, nomeCompleto, tempo, "Sim", "MANUAL"]);
  abaRespostas.getRange(abaRespostas.getLastRow(), 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");

  return { ok: true, msg: "Presença MANUAL lançada:\n" + nomeCompleto + " — " + tempo + " (" + diaAlvo + ")" };
}

// Wrapper para o sidebar
function _lancarPresencaManual(matricula, tempo, dataStr) {
  return lancarPresencaManual_(matricula, tempo, dataStr);
}


// =====================================================
// ABONAR FALTA
// Localiza a falta já registrada (gerada por fecharAula) para o
// aluno+disciplina+tempo+dia, e muda o status dela para ABONADA.
// Não cria linha nova — preserva o registro original para auditoria,
// só anexa o motivo do abono. Falta abonada não conta nem como
// presença nem como falta no cálculo de frequência (ver
// consolidarFrequencia).
// =====================================================
function abonarFalta_(matricula, tempo, dataStr, motivo) {
  var planilha     = SpreadsheetApp.getActiveSpreadsheet();
  var abaRespostas = planilha.getSheetByName("Form_Respostas_Presenca");
  var abaAlunos    = planilha.getSheetByName("Cadastro_Alunos");
  var tz           = Session.getScriptTimeZone();

  matricula = String(matricula || "").trim().toUpperCase();
  if (!matricula) return { ok: false, msg: "Matrícula vazia." };
  if (tempo !== "1º Tempo" && tempo !== "2º Tempo")
    return { ok: false, msg: "Tempo inválido." };
  if (!motivo || !motivo.trim())
    return { ok: false, msg: "Motivo é obrigatório." };

  var disciplina = obterDisciplinaAtiva_();
  if (!disciplina) return { ok: false, msg: "Nenhuma disciplina ativa." };

  // Nome completo a partir do cadastro, para mensagens de retorno
  var alunos = abaAlunos.getRange(2, 1, abaAlunos.getLastRow() - 1, 4).getValues();
  var nomeCompleto = "";
  for (var i = 0; i < alunos.length; i++) {
    if (String(alunos[i][0]).trim().toUpperCase() === matricula) {
      nomeCompleto = alunos[i][0] + " — " + alunos[i][1];
      break;
    }
  }
  if (!nomeCompleto) return { ok: false, msg: "Matrícula não encontrada: " + matricula };

  // Data alvo
  var dataObj;
  if (dataStr) {
    var p = dataStr.split("/");                        // dd/MM/yyyy
    dataObj = new Date(p[2], p[1] - 1, p[0], 12, 0, 0);
  } else {
    dataObj = new Date();
  }
  var diaAlvo = Utilities.formatDate(dataObj, tz, "dd/MM/yyyy");

  // Garante que a coluna G (Motivo do Abono) existe
  garantirColunaMotivoAbono_(abaRespostas);

  // Localiza a falta já registrada para esse aluno+disciplina+tempo+dia
  var dados = abaRespostas.getDataRange().getValues();
  for (var k = 1; k < dados.length; k++) {
    var dDia = Utilities.formatDate(converterTimestamp_(dados[k][0]), tz, "dd/MM/yyyy");
    if (
      dDia === diaAlvo &&
      extrairMatricula_(dados[k][2]) === matricula &&
      normalizar_(dados[k][1]) === normalizar_(disciplina) &&
      dados[k][3] === tempo
    ) {
      var statusAtual = dados[k][5];

      if (statusAtual === "ABONADA") {
        return { ok: false, msg: nomeCompleto + " já tem falta abonada no " + tempo + " (" + diaAlvo + ")." };
      }
      if (statusAtual === "VALIDA" || statusAtual === "MANUAL") {
        return { ok: false, msg: nomeCompleto + " esteve presente no " + tempo + " (" + diaAlvo + ") — não há falta para abonar." };
      }
      if (statusAtual !== "FALTA") {
        return { ok: false, msg: "Registro encontrado não é uma falta válida para abono (status: " + statusAtual + ")." };
      }

      // Atualiza o status para ABONADA e grava o motivo na coluna G
      abaRespostas.getRange(k + 1, 6).setValue("ABONADA");
      abaRespostas.getRange(k + 1, 7).setValue(motivo.trim());

      return {
        ok: true,
        msg: "Falta abonada com sucesso:\n" + nomeCompleto + " — " + tempo + " (" + diaAlvo + ")\nMotivo: " + motivo.trim()
      };
    }
  }

  return {
    ok: false,
    msg: "Nenhuma falta encontrada para " + nomeCompleto + " no " + tempo + " (" + diaAlvo + ").\n" +
         "Confirme se \"Fechar aula\" já foi executado para esse dia."
  };
}

function garantirColunaMotivoAbono_(abaRespostas) {
  var cabecalho = abaRespostas.getRange(1, 7).getValue();
  if (String(cabecalho).trim() !== "Motivo do Abono") {
    abaRespostas.getRange(1, 7).setValue("Motivo do Abono");
    abaRespostas.getRange(1, 7).setBackground("#B40000").setFontColor("#FFFFFF").setFontWeight("bold");
  }
}

// Wrapper para o sidebar
function _abonarFalta(matricula, tempo, dataStr, motivo) {
  return abonarFalta_(matricula, tempo, dataStr, motivo);
}


// =====================================================
// obterDisciplinaAtiva_ (inalterado, exceto comentário)
// =====================================================
function obterDisciplinaAtiva_() {
  var planilha       = SpreadsheetApp.getActiveSpreadsheet();
  var abaDisciplinas = planilha.getSheetByName("Cadastro_Disciplinas");

  var dados = abaDisciplinas
    .getRange(2, 1, abaDisciplinas.getLastRow() - 1, 6)
    .getValues();

  var ativas = [];
  dados.forEach(function(linha) {
    if (linha[5] == "Ativo") ativas.push(linha[0] + " — " + linha[1]);
  });

  if (ativas.length == 0) {
    SpreadsheetApp.getUi().alert("Nenhuma disciplina ativa encontrada.");
    return null;
  }
  if (ativas.length == 1) return ativas[0];

  // Mais de uma disciplina ativa: pede para digitar o número, mas com
  // texto mais guiado e confirmação do que foi escolhido antes de seguir
  // (o Apps Script nativo só permite até 3 botões fixos em ui.alert,
  // então uma lista numerada com confirmação é a forma mais clara
  // possível sem sair do diálogo nativo do Google Sheets).
  var ui    = SpreadsheetApp.getUi();
  var lista = ativas.map(function(d, i) { return "  " + (i + 1) + ")  " + d; }).join("\n");

  while (true) {
    var resp = ui.prompt(
      "Várias disciplinas ativas — qual você quer usar?",
      "Existe mais de uma disciplina ativa no sistema.\n\n" +
      "Digite APENAS O NÚMERO da disciplina desejada e clique OK:\n\n" +
      lista,
      ui.ButtonSet.OK_CANCEL
    );
    if (resp.getSelectedButton() != ui.Button.OK) return null;

    var idx = parseInt(resp.getResponseText().trim()) - 1;
    if (isNaN(idx) || idx < 0 || idx >= ativas.length) {
      ui.alert("Número inválido", "Digite um número entre 1 e " + ativas.length + ".", ui.ButtonSet.OK);
      continue;  // pede de novo em vez de simplesmente desistir
    }

    var confirma = ui.alert(
      "Confirmar disciplina",
      "Você escolheu:\n\n" + ativas[idx] + "\n\nEstá correto?",
      ui.ButtonSet.YES_NO
    );
    if (confirma == ui.Button.YES) return ativas[idx];
    // Se não confirmar, volta para a tela de escolha
  }
}


// =====================================================
// FECHAR AULA — CORRIGIDO
// Lê presença em E[4], tempo em D[3]. Só conta status VALIDA/MANUAL.
// Quem não tem presença válida no tempo → recebe falta (Sim em "Não").
// Aceita dataStr opcional (dd/MM/yyyy) para fechar aulas de dias anteriores.
// =====================================================
function fecharAula(dataStr) {
  var planilha     = SpreadsheetApp.getActiveSpreadsheet();
  var abaAlunos    = planilha.getSheetByName("Cadastro_Alunos");
  var abaRespostas = planilha.getSheetByName("Form_Respostas_Presenca");

  var disciplina = obterDisciplinaAtiva_();
  if (!disciplina) return;

  var tz = Session.getScriptTimeZone();

  // Data alvo: usa a data recebida do sidebar, ou hoje como fallback
  var dataAlvo;
  if (dataStr && dataStr.trim()) {
    var p = dataStr.trim().split("/");            // dd/MM/yyyy
    dataAlvo = new Date(p[2], p[1] - 1, p[0], 12, 0, 0);
  } else {
    dataAlvo = new Date();
  }
  var diaAlvo = Utilities.formatDate(dataAlvo, tz, "dd/MM/yyyy");

  var respostas = abaRespostas.getDataRange().getValues();

  var presentes1 = {};   // matrícula → true
  var presentes2 = {};
  var jaFechado1 = false;
  var jaFechado2 = false;

  for (var i = 1; i < respostas.length; i++) {
    var dataResp = Utilities.formatDate(converterTimestamp_(respostas[i][0]), tz, "dd/MM/yyyy");
    if (dataResp !== diaAlvo) continue;
    if (normalizar_(nomePuroDisciplina_(respostas[i][1])) !== normalizar_(nomePuroDisciplina_(disciplina))) continue;

    var mat      = extrairMatricula_(respostas[i][2]);
    var tempo    = respostas[i][3];        // D
    var presente = respostas[i][4];        // E
    var status   = respostas[i][5];        // F

    // Presença que conta: qualquer marcação "Sim" (inclusive FORA_DO_HORARIO e DUPLICADA)
    // — esses status são mantidos para levantamento e exibição no relatório,
    // mas não geram falta durante a fase de adaptação do sistema.
    var contaPresenca =
      presente === "Sim" &&
      status !== "FALTA" && status !== "ABONADA";

    if (contaPresenca) {
      if (tempo === "1º Tempo") presentes1[mat] = true;
      if (tempo === "2º Tempo") presentes2[mat] = true;
    }

    // Falta já registrada manualmente pelo fechamento anterior?
    if (presente === "Não") {
      if (tempo === "1º Tempo") jaFechado1 = true;
      if (tempo === "2º Tempo") jaFechado2 = true;
    }
  }

  if (jaFechado1 && jaFechado2) {
    SpreadsheetApp.getUi().alert("As faltas de " + diaAlvo + " para " + disciplina + " já foram registradas.");
    return;
  }

  var alunos = abaAlunos.getRange(2, 1, abaAlunos.getLastRow() - 1, 4).getValues();
  var novas  = [];
  var f1 = 0, f2 = 0;
  // Carimbo de data/hora usa a data da aula (meio-dia), não o momento atual
  var carimboDaAula = new Date(dataAlvo.getFullYear(), dataAlvo.getMonth(), dataAlvo.getDate(), 12, 0, 0);

  for (var j = 0; j < alunos.length; j++) {
    if (alunos[j][3] !== "Ativo") continue;
    var mat2          = String(alunos[j][0]).trim().toUpperCase();
    var identificacao = alunos[j][0] + " — " + alunos[j][1];

    if (!jaFechado1 && !presentes1[mat2]) {
      novas.push([carimboDaAula, disciplina, identificacao, "1º Tempo", "Não", "FALTA"]);
      f1++;
    }
    if (!jaFechado2 && !presentes2[mat2]) {
      novas.push([carimboDaAula, disciplina, identificacao, "2º Tempo", "Não", "FALTA"]);
      f2++;
    }
  }

  if (novas.length > 0) {
    var ult = abaRespostas.getLastRow();
    abaRespostas.getRange(ult + 1, 1, novas.length, 6).setValues(novas);
    abaRespostas.getRange(ult + 1, 1, novas.length, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
  }

  SpreadsheetApp.getUi().alert(
    "Faltas registradas para: " + disciplina + "\n" +
    "Data da aula: " + diaAlvo + "\n\n" +
    "1º Tempo: " + f1 + " falta(s)\n" +
    "2º Tempo: " + f2 + " falta(s)\n\n" +
    "Total lançado: " + novas.length + " linha(s)."
  );
}


// =====================================================
// CONSOLIDAR FREQUÊNCIA — CORRIGIDO
// Presença em E[4]. DUPLICADA e FORA_DO_HORARIO contam como presença (fase de adaptação).
// =====================================================
function consolidarFrequencia() {
  var planilha     = SpreadsheetApp.getActiveSpreadsheet();
  var abaRespostas = planilha.getSheetByName("Form_Respostas_Presenca");
  var abaResultado = planilha.getSheetByName("Frequencia_Consolidada");

  abaResultado.clear();
  abaResultado.appendRow([
    "Disciplina", "Aluno", "Presenças", "Faltas",
    "Total de Tempos", "Frequência %", "Situação", "Faltas Abonadas"
  ]);

  var respostas   = abaRespostas.getDataRange().getValues();
  var consolidado = {};
  // Deduplicação de presenças: garante que múltiplas marcações do mesmo
  // aluno no mesmo tempo+dia (VALIDA, DUPLICADA, FORA_DO_HORARIO) contem
  // como uma única presença. Chave: matrícula|tempo|dia.
  var presencasVistas = {};

  for (var i = 1; i < respostas.length; i++) {
    var dataTs     = respostas[i][0];      // A
    var disciplina = respostas[i][1];      // B
    var aluno      = respostas[i][2];      // C
    var tempo      = respostas[i][3];      // D
    var presente   = respostas[i][4];      // E
    var status     = respostas[i][5];      // F

    if (!disciplina || !aluno || !presente) continue;

    var mat   = extrairMatricula_(aluno);
    var chave = normalizar_(disciplina) + "|" + mat;
    if (!consolidado[chave]) {
      consolidado[chave] = {
        disciplina: disciplina,
        aluno:      aluno,
        presencas:  0,
        faltas:     0,
        abonadas:   0
      };
    }

    // Falta ABONADA: conta separadamente, não entra em presenças nem faltas.
    if (status === "ABONADA") {
      consolidado[chave].abonadas++;
      continue;
    }

    if (presente === "Sim") {
      // Deduplicação: DUPLICADA e FORA_DO_HORARIO contam como presença,
      // mas múltiplas marcações do mesmo aluno no mesmo tempo+dia = 1 presença.
      var tz      = Session.getScriptTimeZone();
      var dia     = Utilities.formatDate(converterTimestamp_(dataTs), tz, "dd/MM/yyyy");
      var chaveDia = mat + "|" + tempo + "|" + dia;
      if (!presencasVistas[chaveDia]) {
        presencasVistas[chaveDia] = true;
        consolidado[chave].presencas++;
      }
    }
    if (presente === "Não") consolidado[chave].faltas++;
  }

  var criterios = obterCriteriosAcademicos_();
  var linhas = [];
  for (var chave in consolidado) {
    var item  = consolidado[chave];
    var total = item.presencas + item.faltas;
    var freq  = total > 0 ? (item.presencas / total) * 100 : 0;
    var sit   = freq < criterios.freqMinima ? "RISCO DE PENDÊNCIA" : "REGULAR";
    linhas.push([
      item.disciplina, item.aluno, item.presencas, item.faltas,
      total, freq.toFixed(1) + "%", sit, item.abonadas
    ]);
  }

  // Ordena alfabeticamente por nome do aluno (coluna B, índice 1),
  // independentemente da data de cadastro do aluno.
  linhas.sort(function(a, b) {
    return _chaveNomeAlunoPres_(a[1]).localeCompare(_chaveNomeAlunoPres_(b[1]), "pt");
  });

  if (linhas.length > 0) {
    var ini = abaResultado.getLastRow() + 1;
    abaResultado.getRange(ini, 1, linhas.length, 8).setValues(linhas);
    for (var r = 0; r < linhas.length; r++) {
      var cor = linhas[r][6] === "RISCO DE PENDÊNCIA" ? "#FCE4D6" : "#E2EFDA";
      abaResultado.getRange(ini + r, 7).setBackground(cor);
    }
  }

  abaResultado.getRange(1, 1, 1, 8)
    .setBackground("#B40000").setFontColor("#FFFFFF").setFontWeight("bold");
  abaResultado.autoResizeColumns(1, 8);

  SpreadsheetApp.getUi().alert("Frequência consolidada com sucesso.");
}

// Chave de ordenação alfabética por NOME do aluno a partir de
// "IBTR-004 — NOME" — remove a matrícula para ordenar pelo nome real.
function _chaveNomeAlunoPres_(alunoCompleto) {
  var s = String(alunoCompleto || "");
  s = s.replace(/^\s*IBTR-\d+\s*[—\-]*\s*/i, "");
  return normalizar_(s);
}


// =====================================================
// RELATÓRIO DE FREQUÊNCIA DO DIA
// Lista quem esteve presente/ausente no dia escolhido, por tempo.
// Aceita dataStr opcional (dd/MM/yyyy); padrão = hoje.
// =====================================================
function gerarRelatorioFrequenciaDia(dataStr) {
  var planilha     = SpreadsheetApp.getActiveSpreadsheet();
  var abaRespostas = planilha.getSheetByName("Form_Respostas_Presenca");
  var tz           = Session.getScriptTimeZone();

  var hoje;
  if (dataStr && dataStr.trim()) {
    var p = dataStr.trim().split("/");
    var d = new Date(p[2], p[1] - 1, p[0], 12, 0, 0);
    hoje = Utilities.formatDate(d, tz, "dd/MM/yyyy");
  } else {
    hoje = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy");
  }

  var disciplina = obterDisciplinaAtiva_();
  if (!disciplina) return;

  var respostas = abaRespostas.getDataRange().getValues();

  // matrícula → {nome, t1:'P/F/-', t2:'P/F/-'}
  var mapa = {};
  for (var i = 1; i < respostas.length; i++) {
    var dia = Utilities.formatDate(converterTimestamp_(respostas[i][0]), tz, "dd/MM/yyyy");
    if (dia !== hoje) continue;
    if (normalizar_(nomePuroDisciplina_(respostas[i][1])) !== normalizar_(nomePuroDisciplina_(disciplina))) continue;

    var mat    = extrairMatricula_(respostas[i][2]);
    var nome   = String(respostas[i][2]);
    var tempo  = respostas[i][3];
    var pres   = respostas[i][4];
    var status = respostas[i][5];
    // DUPLICADA e FORA_DO_HORARIO contam como presença (fase de adaptação)
    // Apenas FALTA registrada pelo fecharAula é tratada como ausência aqui
    if (status === "FALTA") continue;

    if (!mapa[mat]) mapa[mat] = { nome: nome, t1: "—", t2: "—" };
    var marca = pres === "Sim" ? "Presente" : "Falta";
    if (tempo === "1º Tempo") mapa[mat].t1 = marca;
    if (tempo === "2º Tempo") mapa[mat].t2 = marca;
  }

  // Ordena pelas chaves por NOME do aluno (alfabético), não por matrícula
  var chaves = Object.keys(mapa).sort(function(a, b) {
    return normalizar_(mapa[a].nome.replace(/^\s*IBTR-\d+\s*[—\-]*\s*/i, ""))
      .localeCompare(normalizar_(mapa[b].nome.replace(/^\s*IBTR-\d+\s*[—\-]*\s*/i, "")), "pt");
  });
  if (chaves.length === 0) {
    _abrirRelatorioHTML_("Frequência do dia — " + hoje, disciplina,
      '<div class="vazio">Nenhum registro de presença para hoje (' + hoje + ').</div>');
    return;
  }

  var linhas = "";
  var p1 = 0, p2 = 0;
  chaves.forEach(function(mat) {
    var r = mapa[mat];
    if (r.t1 === "Presente") p1++;
    if (r.t2 === "Presente") p2++;
    function cel(v) {
      var cor = v === "Presente" ? "#E2EFDA" : (v === "Falta" ? "#FCE4D6" : "#FFFFFF");
      return '<td style="text-align:center;background:' + cor + '">' + v + '</td>';
    }
    linhas += '<tr><td>' + r.nome + '</td>' + cel(r.t1) + cel(r.t2) + '</tr>';
  });

  var conteudo =
    '<table><thead><tr>' +
    '<th>Aluno</th>' +
    '<th style="text-align:center">1º Tempo</th>' +
    '<th style="text-align:center">2º Tempo</th>' +
    '</tr></thead><tbody>' + linhas + '</tbody></table>' +
    '<div class="resumo"><strong>Disciplina:</strong> ' + disciplina +
    ' &nbsp;|&nbsp; <strong>Presentes 1º T:</strong> ' + p1 +
    ' &nbsp;|&nbsp; <strong>Presentes 2º T:</strong> ' + p2 +
    ' &nbsp;|&nbsp; <strong>Total alunos:</strong> ' + chaves.length + '</div>';

  _abrirRelatorioHTML_("Frequência do dia — " + hoje, disciplina, conteudo);
}
function _gerarRelatorioFrequenciaDia(dataStr) { gerarRelatorioFrequenciaDia(dataStr); return "ok"; }


// =====================================================
// ATUALIZAR FORMULÁRIO (inalterado na lógica)
// =====================================================
function atualizarFormulario() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();

  var abaDisc = planilha.getSheetByName("Cadastro_Disciplinas");
  var dDisc   = abaDisc.getRange(2, 1, abaDisc.getLastRow() - 1, 6).getValues();
  var listaDisc = [];
  dDisc.forEach(function(l) { if (l[5] == "Ativo") listaDisc.push(l[0] + " — " + l[1]); });

  var abaAl = planilha.getSheetByName("Cadastro_Alunos");
  var dAl   = abaAl.getRange(2, 1, abaAl.getLastRow() - 1, 4).getValues();
  var listaAl = [];
  dAl.forEach(function(l) { if (l[3] == "Ativo") listaAl.push(l[0] + " — " + l[1]); });

  var form = FormApp.openById("1Q2WQgbiyWuouV-o14laXHRvapOrkFrSHN24rK_uan-g");
  var perguntas = form.getItems(FormApp.ItemType.LIST);

  // setChoiceValues() não aceita array vazio (lança "Array vazio: values").
  // Isso acontece naturalmente quando nenhuma disciplina/aluno está ativo
  // no momento (ex: entre o fim de uma disciplina e o início da próxima).
  // Nesse caso, usa um placeholder em vez de travar a atualização do form.
  var PLACEHOLDER_DISC = "— Nenhuma disciplina ativa no momento —";
  var PLACEHOLDER_AL   = "— Nenhum aluno ativo no momento —";

  perguntas[0].asListItem().setChoiceValues(listaDisc.length > 0 ? listaDisc : [PLACEHOLDER_DISC]);
  perguntas[1].asListItem().setChoiceValues(listaAl.length   > 0 ? listaAl   : [PLACEHOLDER_AL]);
  perguntas[2].asListItem().setChoiceValues(["1º Tempo", "2º Tempo"]);
}

// Wrapper para uso manual via menu — mostra confirmação visual.
// atualizarFormulario() em si fica silenciosa porque agora roda
// automaticamente em segundo plano nos cadastros (Novo/Ativar/Inativar
// Aluno e Disciplina), onde um alert no meio do fluxo seria intrusivo.
function atualizarFormularioComAviso() {
  atualizarFormulario();
  SpreadsheetApp.getUi().alert("Formulário atualizado com sucesso.");
}


// =====================================================
// CORREÇÃO DE TIMESTAMPS (inalterado)
// =====================================================
function corrigirExibicaoTimestamps() {
  var abaRespostas = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName("Form_Respostas_Presenca");
  var ult = abaRespostas.getLastRow();
  if (ult < 2) { SpreadsheetApp.getUi().alert("Nenhum dado encontrado."); return; }
  abaRespostas.getRange(2, 1, ult - 1, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
  SpreadsheetApp.getUi().alert("Formato de hora corrigido em " + (ult - 1) + " linha(s).");
}


// =====================================================
// ALTERAR STATUS DE PRESENÇA (secretaria)
//
// Caso de uso: o aluno marcou presença fora do horário (status
// FORA_DO_HORARIO) por um motivo justo, e a secretaria SABE que ele
// esteve na aula. Para que essa presença passe a contar / o relatório
// fique fiel à realidade, a secretaria altera o status daquele registro.
//
// Diferente do lançamento manual e do abono, aqui NÃO se cria linha
// nova nem se depende da disciplina ATIVA hoje: o sistema lista os
// registros que o aluno REALMENTE tem naquela data (a disciplina vem
// da própria lista de presença do dia — ativa ou não), e a secretaria
// escolhe qual linha alterar e para qual status.
//
// Fluxo no sidebar:
//   1) getRegistrosPresencaAluno(matricula, dataStr)
//        → devolve os registros do aluno naquela data
//          [{ linha, disciplina, tempo, presente, status }]
//   2) _alterarStatusPresenca(matricula, dataStr, disciplina, tempo, novoStatus)
//        → reescreve a coluna F (Status) da linha exata
// =====================================================

// Status permitidos na alteração manual.
var STATUS_PRESENCA_VALIDOS = ["VALIDA", "MANUAL", "FORA_DO_HORARIO", "DUPLICADA", "FALTA", "ABONADA"];

// Retorna os registros de presença de um aluno numa data específica.
// A disciplina exibida é a que REALMENTE está gravada na lista de
// presença daquela data (resolve o descompasso quando a disciplina
// daquela aula já foi inativada). Chamado pelo sidebar.
function getRegistrosPresencaAluno(matricula, dataStr) {
  var planilha     = SpreadsheetApp.getActiveSpreadsheet();
  var abaRespostas = planilha.getSheetByName("Form_Respostas_Presenca");
  var tz           = Session.getScriptTimeZone();

  matricula = extrairMatricula_(matricula);
  if (!matricula) return [];
  if (!dataStr || !dataStr.trim()) return [];

  var p = dataStr.trim().split("/");                 // dd/MM/yyyy
  var d = new Date(p[2], p[1] - 1, p[0], 12, 0, 0);
  var diaAlvo = Utilities.formatDate(d, tz, "dd/MM/yyyy");

  var dados = abaRespostas.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < dados.length; i++) {
    var dia = Utilities.formatDate(converterTimestamp_(dados[i][0]), tz, "dd/MM/yyyy");
    if (dia !== diaAlvo) continue;
    if (extrairMatricula_(dados[i][2]) !== matricula) continue;

    out.push({
      linha:      i + 1,                         // linha real na planilha
      // hora da marcação: é o que distingue duas linhas do mesmo
      // aluno no mesmo tempo (aluno que marcou presença duas vezes)
      hora:       Utilities.formatDate(converterTimestamp_(dados[i][0]), tz, "HH:mm"),
      disciplina: String(dados[i][1]),
      tempo:      String(dados[i][3]),
      presente:   String(dados[i][4]),
      status:     String(dados[i][5] || "")
    });
  }
  return out;
}

// Altera o status de UM registro de presença já existente.
// Localiza a linha exata por matrícula + data + disciplina + tempo e
// reescreve apenas a coluna F (Status). Não cria linha nova.
//
// Coerência de status:
//  - Ao mudar PARA ABONADA sem motivo prévio, grava um motivo padrão
//    na coluna G (a coluna de Motivo do Abono), para não deixar a
//    planilha inconsistente. (Para registrar o motivo real, use o
//    fluxo "Abonar falta".)
//  - Ao mudar DE ABONADA para outro status, limpa a coluna G.
//  - Ao mudar PARA FALTA, ajusta a coluna E (presente) para "Não".
//  - Ao mudar para um status de presença (VALIDA/MANUAL/FORA_DO_HORARIO/
//    DUPLICADA), ajusta a coluna E para "Sim".
function alterarStatusPresenca_(matricula, dataStr, disciplina, tempo, novoStatus) {
  var planilha     = SpreadsheetApp.getActiveSpreadsheet();
  var abaRespostas = planilha.getSheetByName("Form_Respostas_Presenca");
  var tz           = Session.getScriptTimeZone();

  matricula  = extrairMatricula_(matricula);
  novoStatus = String(novoStatus || "").trim().toUpperCase();

  if (!matricula)                                  return { ok: false, msg: "Selecione um aluno." };
  if (!dataStr || !dataStr.trim())                 return { ok: false, msg: "Informe a data da aula." };
  if (!disciplina || !String(disciplina).trim())   return { ok: false, msg: "Selecione a disciplina." };
  if (tempo !== "1º Tempo" && tempo !== "2º Tempo") return { ok: false, msg: "Tempo inválido." };
  if (STATUS_PRESENCA_VALIDOS.indexOf(novoStatus) === -1)
    return { ok: false, msg: "Status inválido: " + novoStatus };

  var p = dataStr.trim().split("/");
  var d = new Date(p[2], p[1] - 1, p[0], 12, 0, 0);
  var diaAlvo = Utilities.formatDate(d, tz, "dd/MM/yyyy");

  var dados = abaRespostas.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    var dia = Utilities.formatDate(converterTimestamp_(dados[i][0]), tz, "dd/MM/yyyy");
    if (dia !== diaAlvo) continue;
    if (extrairMatricula_(dados[i][2]) !== matricula) continue;
    if (normalizar_(nomePuroDisciplina_(dados[i][1])) !== normalizar_(nomePuroDisciplina_(disciplina))) continue;
    if (String(dados[i][3]) !== tempo) continue;

    var linha         = i + 1;
    var statusAntigo  = String(dados[i][5] || "");
    var nomeCompleto  = String(dados[i][2]);

    if (statusAntigo === novoStatus) {
      return { ok: false, msg: nomeCompleto + " já está com status " + novoStatus + " no " + tempo + " (" + diaAlvo + ")." };
    }

    // Ajusta a coluna E (presente) para ficar coerente com o status
    if (novoStatus === "FALTA") {
      abaRespostas.getRange(linha, 5).setValue("Não");
    } else if (novoStatus === "ABONADA") {
      // Falta abonada: presença fica "Não" (é uma ausência justificada)
      abaRespostas.getRange(linha, 5).setValue("Não");
      // Garante coluna G e grava motivo padrão se estiver vazia
      garantirColunaMotivoAbono_(abaRespostas);
      var motivoAtual = String(abaRespostas.getRange(linha, 7).getValue() || "").trim();
      if (!motivoAtual) {
        abaRespostas.getRange(linha, 7).setValue("Abono lançado pela secretaria (alteração de status)");
      }
    } else {
      // VALIDA / MANUAL / FORA_DO_HORARIO / DUPLICADA → presença "Sim"
      abaRespostas.getRange(linha, 5).setValue("Sim");
    }

    // Se estava ABONADA e virou outra coisa, limpa o motivo (col G)
    if (statusAntigo === "ABONADA" && novoStatus !== "ABONADA") {
      var cabG = String(abaRespostas.getRange(1, 7).getValue() || "").trim();
      if (cabG === "Motivo do Abono") abaRespostas.getRange(linha, 7).clearContent();
    }

    // Reescreve o status (coluna F)
    abaRespostas.getRange(linha, 6).setValue(novoStatus);

    return {
      ok: true,
      msg: "Status alterado com sucesso:\n" + nomeCompleto + " — " + tempo + " (" + diaAlvo + ")\n" +
           statusAntigo + " → " + novoStatus + "\n\n" +
           "Rode \"Consolidar frequência\" para atualizar os relatórios."
    };
  }

  return {
    ok: false,
    msg: "Nenhum registro encontrado para esse aluno na data/disciplina/tempo informados.\n" +
         "Confira se a data está correta e se o aluno realmente marcou presença nessa aula."
  };
}

// Wrappers para o sidebar
function _getRegistrosPresencaAluno(matricula, dataStr) {
  return getRegistrosPresencaAluno(matricula, dataStr);
}
function _alterarStatusPresenca(matricula, dataStr, disciplina, tempo, novoStatus) {
  return alterarStatusPresenca_(matricula, dataStr, disciplina, tempo, novoStatus);
}


// =====================================================
// WRAPPERS para o sidebar
// =====================================================
function _fecharAula(dataStr)    { fecharAula(dataStr);    return "ok"; }
function _atualizarFormulario()  { atualizarFormulario();  return "ok"; }
function _consolidarFrequencia() { consolidarFrequencia(); return "ok"; }
