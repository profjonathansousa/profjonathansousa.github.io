// =====================================================
// IBTRADCA — 09_presenca_lote.js
// Versão 5.2
//
// Complementa o 01_core_presenca (Código.js) com três fluxos que o
// painel precisava e não existiam:
//
//  1) LANÇAMENTO MANUAL EM LOTE
//     Vários alunos e os dois tempos de uma só vez. Lê a aba de
//     respostas UMA vez e grava tudo em UMA operação, em vez de um
//     appendRow por aluno (18 alunos × 2 tempos = 36 gravações no
//     modelo antigo, que estoura o tempo de execução do Apps Script).
//
//     Regra importante: se o aluno JÁ TEM uma falta lançada pelo
//     "Fechar aula" naquele tempo/dia, a linha da falta é CONVERTIDA
//     em MANUAL em vez de criar uma segunda linha. Sem isso o aluno
//     ficaria com presença E falta no mesmo tempo, o que derruba o
//     percentual dele na consolidação (lá, presenças são deduplicadas
//     por aluno+tempo+dia, mas faltas não).
//
//  2) SITUAÇÃO DA DATA
//     Devolve, para cada aluno do cadastro, o que já existe naquela
//     data (presente / falta / abonada / sem registro), para o painel
//     poder filtrar "somente quem ainda não tem presença".
//
//  3) EXCLUSÃO DE REGISTRO DE PRESENÇA
//     Apaga a linha de uma marcação indevida ou duplicada. Antes de
//     apagar, confere que a linha ainda é exatamente a que foi
//     listada na busca (a planilha pode ter mudado no meio do
//     caminho) e guarda uma cópia em Log_Exclusoes_Presenca.
// =====================================================


// Status que, na prática, valem como presença no sistema.
// DUPLICADA e FORA_DO_HORARIO entram aqui porque fecharAula e
// consolidarFrequencia já os tratam como presença (fase de adaptação).
var STATUS_QUE_VALEM_PRESENCA = ["VALIDA", "MANUAL", "FORA_DO_HORARIO", "DUPLICADA"];

var ABA_LOG_EXCLUSOES = "Log_Exclusoes_Presenca";


// =====================================================
// Converte "dd/MM/yyyy" (ou vazio = hoje) em { data, dia }.
// Retorna null se a data for inválida — evita que um erro de
// digitação vire uma data silenciosamente errada (new Date("31/13")).
// =====================================================
function _diaAlvoPresenca_(dataStr) {
  var tz = Session.getScriptTimeZone();
  var texto = String(dataStr || "").trim();

  if (!texto) {
    var agora = new Date();
    return { data: agora, dia: Utilities.formatDate(agora, tz, "dd/MM/yyyy") };
  }

  var m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;

  var dd = Number(m[1]), mm = Number(m[2]), aaaa = Number(m[3]);
  var d = new Date(aaaa, mm - 1, dd, 12, 0, 0);
  if (d.getDate() !== dd || d.getMonth() !== (mm - 1) || d.getFullYear() !== aaaa) return null;

  return { data: d, dia: Utilities.formatDate(d, tz, "dd/MM/yyyy") };
}

function _ehStatusDePresenca_(status) {
  return STATUS_QUE_VALEM_PRESENCA.indexOf(String(status || "").trim().toUpperCase()) !== -1;
}


// =====================================================
// SITUAÇÃO DE PRESENÇA DE UMA DATA (todos os alunos)
//
// Usada pelo painel para mostrar, ao lado de cada aluno, o que já
// existe naquela aula — e para o filtro "só quem falta marcar".
//
// Retorno:
//   { ok, disciplina, dia, alunos: [{ matricula, nome, situacao,
//                                     t1, t2, t1status, t2status }] }
//   t1/t2: "P" presente | "F" falta | "A" abonada | "" sem registro
// =====================================================
function getSituacaoPresencaData(dataStr) {
  var planilha     = SpreadsheetApp.getActiveSpreadsheet();
  var abaRespostas = planilha.getSheetByName("Form_Respostas_Presenca");
  var tz           = Session.getScriptTimeZone();

  var alvo = _diaAlvoPresenca_(dataStr);
  if (!alvo) return { ok: false, msg: "Data inválida. Use o formato dd/mm/aaaa." };

  var disciplina = obterDisciplinaAtiva_();
  if (!disciplina) return { ok: false, msg: "Nenhuma disciplina ativa." };

  var mapa  = {};   // matrícula → { t1, t2, t1status, t2status }
  var dados = abaRespostas.getDataRange().getValues();

  for (var i = 1; i < dados.length; i++) {
    var dia = Utilities.formatDate(converterTimestamp_(dados[i][0]), tz, "dd/MM/yyyy");
    if (dia !== alvo.dia) continue;
    if (normalizar_(nomePuroDisciplina_(dados[i][1])) !== normalizar_(nomePuroDisciplina_(disciplina))) continue;

    var mat = extrairMatricula_(dados[i][2]);
    if (!mat) continue;

    var campo = dados[i][3] === "1º Tempo" ? "t1" : (dados[i][3] === "2º Tempo" ? "t2" : "");
    if (!campo) continue;

    var status = String(dados[i][5] || "").trim().toUpperCase();
    var marca  = _ehStatusDePresenca_(status) ? "P" : (status === "ABONADA" ? "A" : "F");

    if (!mapa[mat]) mapa[mat] = { t1: "", t2: "", t1status: "", t2status: "" };

    // Presença ganha de qualquer outra marca: se o aluno tem uma falta
    // do fechamento E uma presença lançada depois, o que vale é a presença.
    if (mapa[mat][campo] !== "P") {
      mapa[mat][campo] = marca;
      mapa[mat][campo + "status"] = status;
    }
  }

  var alunos = getListaAlunos().map(function(a) {
    var s = mapa[String(a.codigo).trim().toUpperCase()] || { t1: "", t2: "", t1status: "", t2status: "" };
    return {
      matricula: a.codigo,
      nome:      a.nome,
      situacao:  a.situacao,
      t1:        s.t1,
      t2:        s.t2,
      t1status:  s.t1status,
      t2status:  s.t2status
    };
  });

  return { ok: true, disciplina: disciplina, dia: alvo.dia, alunos: alunos };
}


// =====================================================
// LANÇAMENTO MANUAL DE PRESENÇA EM LOTE
//
// matriculas : array de "IBTR-NNN" (ou "IBTR-NNN — NOME")
// tempos     : array com "1º Tempo" e/ou "2º Tempo"
// dataStr    : "dd/MM/yyyy" ou vazio (= hoje)
// disciplina : opcional — quando o painel já resolveu a disciplina
//              (evita perguntar duas vezes se houver mais de uma ativa)
//
// Ignora a janela de horário (é a exceção administrativa), como o
// lançamento manual individual.
// =====================================================
function lancarPresencaManualLote_(matriculas, tempos, dataStr, disciplina) {
  var planilha     = SpreadsheetApp.getActiveSpreadsheet();
  var abaRespostas = planilha.getSheetByName("Form_Respostas_Presenca");
  var abaAlunos    = planilha.getSheetByName("Cadastro_Alunos");
  var tz           = Session.getScriptTimeZone();

  // ---------- validação de entrada ----------
  matriculas = (matriculas || []).map(function(m) {
    return extrairMatricula_(m) || String(m || "").trim().toUpperCase();
  }).filter(function(m) { return !!m; });

  // remove repetidos (o mesmo aluno marcado duas vezes na lista)
  var vistos = {};
  matriculas = matriculas.filter(function(m) {
    if (vistos[m]) return false;
    vistos[m] = true;
    return true;
  });

  if (matriculas.length === 0) return { ok: false, msg: "Selecione ao menos um aluno." };

  tempos = (tempos || []).filter(function(t) { return t === "1º Tempo" || t === "2º Tempo"; });
  if (tempos.length === 0) return { ok: false, msg: "Selecione ao menos um tempo." };

  var alvo = _diaAlvoPresenca_(dataStr);
  if (!alvo) return { ok: false, msg: "Data inválida. Use o formato dd/mm/aaaa." };

  disciplina = String(disciplina || "").trim();
  if (!disciplina) disciplina = obterDisciplinaAtiva_();
  if (!disciplina) return { ok: false, msg: "Nenhuma disciplina ativa." };

  // ---------- cadastro de alunos (nome completo p/ a coluna C) ----------
  var nomePorMatricula = {};
  if (abaAlunos.getLastRow() > 1) {
    abaAlunos.getRange(2, 1, abaAlunos.getLastRow() - 1, 4).getValues().forEach(function(l) {
      var cod = String(l[0]).trim().toUpperCase();
      if (cod) nomePorMatricula[cod] = l[0] + " — " + l[1];
    });
  }

  // ---------- fotografia da aba de respostas (uma leitura só) ----------
  var dados      = abaRespostas.getDataRange().getValues();
  var registros  = {};    // "MAT|Tempo" → [ { linha, status, presente } ]

  for (var i = 1; i < dados.length; i++) {
    var dia = Utilities.formatDate(converterTimestamp_(dados[i][0]), tz, "dd/MM/yyyy");
    if (dia !== alvo.dia) continue;
    if (normalizar_(nomePuroDisciplina_(dados[i][1])) !== normalizar_(nomePuroDisciplina_(disciplina))) continue;

    var mat = extrairMatricula_(dados[i][2]);
    if (!mat) continue;

    var chave = mat + "|" + dados[i][3];
    if (!registros[chave]) registros[chave] = [];
    registros[chave].push({
      linha:    i + 1,
      status:   String(dados[i][5] || "").trim().toUpperCase(),
      presente: String(dados[i][4] || "").trim()
    });
  }

  // ---------- decide o que fazer com cada aluno × tempo ----------
  var novas          = [];   // linhas novas a acrescentar
  var converter      = [];   // faltas que viram presença MANUAL
  var jaTinham       = [];
  var abonados       = [];
  var naoEncontrados = [];

  var carimbo = dataStr && String(dataStr).trim()
    ? new Date(alvo.data.getFullYear(), alvo.data.getMonth(), alvo.data.getDate(), 12, 0, 0)
    : new Date();

  matriculas.forEach(function(mat) {
    var nomeCompleto = nomePorMatricula[mat];
    if (!nomeCompleto) { naoEncontrados.push(mat); return; }

    tempos.forEach(function(tempo) {
      var lista = registros[mat + "|" + tempo] || [];

      var temPresenca = false, linhaFalta = 0, temAbono = false;
      lista.forEach(function(r) {
        if (_ehStatusDePresenca_(r.status) || r.presente === "Sim") temPresenca = true;
        if (r.status === "ABONADA") temAbono = true;
        if (r.status === "FALTA" && !linhaFalta) linhaFalta = r.linha;
      });

      if (temPresenca) { jaTinham.push(nomeCompleto + " (" + tempo + ")"); return; }
      if (temAbono)    { abonados.push(nomeCompleto + " (" + tempo + ")"); return; }

      if (linhaFalta) {
        // Converte a falta existente em presença MANUAL — não cria linha nova.
        converter.push({ linha: linhaFalta, nome: nomeCompleto, tempo: tempo });
      } else {
        novas.push([carimbo, disciplina, nomeCompleto, tempo, "Sim", "MANUAL"]);
      }
    });
  });

  // ---------- grava ----------
  // Conversões: reescreve as colunas E e F de uma vez só. Ler e
  // devolver o bloco inteiro custa 2 chamadas, contra 2 por linha.
  if (converter.length > 0) {
    var ultima = abaRespostas.getLastRow();
    var bloco  = abaRespostas.getRange(2, 5, ultima - 1, 2).getValues();
    converter.forEach(function(c) {
      bloco[c.linha - 2][0] = "Sim";
      bloco[c.linha - 2][1] = "MANUAL";
    });
    abaRespostas.getRange(2, 5, ultima - 1, 2).setValues(bloco);
  }

  if (novas.length > 0) {
    var inicio = abaRespostas.getLastRow() + 1;
    abaRespostas.getRange(inicio, 1, novas.length, 6).setValues(novas);
    abaRespostas.getRange(inicio, 1, novas.length, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
  }

  // ---------- resumo ----------
  var total = novas.length + converter.length;
  var linhasMsg = [];
  linhasMsg.push("Disciplina: " + disciplina);
  linhasMsg.push("Data: " + alvo.dia + "  ·  " + tempos.join(" + "));
  linhasMsg.push("");
  linhasMsg.push("Presenças lançadas: " + total +
                 (converter.length ? " (sendo " + converter.length + " falta(s) convertida(s) em presença)" : ""));
  if (jaTinham.length)       linhasMsg.push("Já tinham presença: " + jaTinham.length);
  if (abonados.length)       linhasMsg.push("Pulados por terem falta ABONADA: " + abonados.length);
  if (naoEncontrados.length) linhasMsg.push("Matrícula não encontrada: " + naoEncontrados.join(", "));
  if (total > 0)             linhasMsg.push("\nRode \"Consolidar frequência\" para atualizar os relatórios.");

  return {
    ok: total > 0,
    lancadas:   total,
    convertidas: converter.length,
    jaTinham:   jaTinham,
    abonados:   abonados,
    naoEncontrados: naoEncontrados,
    msg: (total > 0 ? "Presença em lote concluída.\n\n" : "Nada foi lançado.\n\n") + linhasMsg.join("\n")
  };
}


// =====================================================
// BUSCA DE REGISTROS PARA EXCLUSÃO
//
// dataStr           : "dd/MM/yyyy" (obrigatória)
// matricula         : "IBTR-NNN" ou vazio (= todos os alunos)
// somenteDuplicadas : true → só devolve aluno+disciplina+tempo que
//                     aparecem em mais de uma linha naquele dia
//
// Não filtra por disciplina ativa de propósito: a marcação indevida
// pode ser de uma disciplina que já foi encerrada.
//
// Retorno: [{ linha, dia, hora, matricula, aluno, disciplina, tempo,
//             presente, status, duplicada }]
// =====================================================
function buscarRegistrosPresencaParaExcluir_(dataStr, matricula, somenteDuplicadas) {
  var planilha     = SpreadsheetApp.getActiveSpreadsheet();
  var abaRespostas = planilha.getSheetByName("Form_Respostas_Presenca");
  var tz           = Session.getScriptTimeZone();

  var alvo = _diaAlvoPresenca_(dataStr);
  if (!alvo) return { ok: false, msg: "Data inválida. Use o formato dd/mm/aaaa." };

  matricula = extrairMatricula_(matricula);
  if (!matricula && !somenteDuplicadas) {
    return { ok: false, msg: "Escolha um aluno ou marque \"somente marcações duplicadas\"." };
  }

  var dados = abaRespostas.getDataRange().getValues();
  var achados = [];
  var contagem = {};   // "MAT|DISC|Tempo" → nº de linhas no dia

  for (var i = 1; i < dados.length; i++) {
    var dt = converterTimestamp_(dados[i][0]);
    if (Utilities.formatDate(dt, tz, "dd/MM/yyyy") !== alvo.dia) continue;

    var mat = extrairMatricula_(dados[i][2]);
    if (!mat) continue;
    if (matricula && mat !== matricula) continue;

    var chave = mat + "|" + normalizar_(nomePuroDisciplina_(dados[i][1])) + "|" + String(dados[i][3]);
    contagem[chave] = (contagem[chave] || 0) + 1;

    achados.push({
      linha:      i + 1,
      dia:        alvo.dia,
      hora:       Utilities.formatDate(dt, tz, "HH:mm"),
      matricula:  mat,
      aluno:      String(dados[i][2]),
      disciplina: String(dados[i][1]),
      tempo:      String(dados[i][3]),
      presente:   String(dados[i][4] || ""),
      status:     String(dados[i][5] || ""),
      _chave:     chave
    });
  }

  achados.forEach(function(r) { r.duplicada = contagem[r._chave] > 1; });

  if (somenteDuplicadas) {
    achados = achados.filter(function(r) { return r.duplicada; });
  }

  achados.sort(function(a, b) {
    var na = _chaveNomeAlunoPres_(a.aluno), nb = _chaveNomeAlunoPres_(b.aluno);
    if (na !== nb) return na.localeCompare(nb, "pt");
    if (a.tempo !== b.tempo) return a.tempo < b.tempo ? -1 : 1;
    return a.linha - b.linha;
  });

  return { ok: true, dia: alvo.dia, registros: achados };
}


// =====================================================
// EXCLUSÃO DE REGISTROS DE PRESENÇA
//
// registros: [{ linha, dia, matricula, disciplina, tempo }] — exatamente
// como vieram de buscarRegistrosPresencaParaExcluir_.
//
// Cada linha é reconferida antes de sumir: se alguém mexeu na planilha
// depois da busca, o número da linha pode apontar para outro registro,
// e apagar a linha errada aqui é irreversível.
//
// Apaga de baixo para cima para os índices não se deslocarem.
// Uma cópia de cada linha apagada vai para Log_Exclusoes_Presenca.
// =====================================================
function excluirRegistrosPresenca_(registros) {
  var planilha     = SpreadsheetApp.getActiveSpreadsheet();
  var abaRespostas = planilha.getSheetByName("Form_Respostas_Presenca");
  var tz           = Session.getScriptTimeZone();

  registros = registros || [];
  if (registros.length === 0) return { ok: false, msg: "Nenhum registro selecionado." };

  var ordenados = registros.slice().sort(function(a, b) { return Number(b.linha) - Number(a.linha); });

  var apagados = [];
  var recusados = [];
  var paraLog = [];

  ordenados.forEach(function(reg) {
    var linha = Number(reg.linha);
    if (!linha || linha < 2 || linha > abaRespostas.getLastRow()) {
      recusados.push("linha " + reg.linha + " não existe mais");
      return;
    }

    var v = abaRespostas.getRange(linha, 1, 1, 7).getValues()[0];
    var dia = Utilities.formatDate(converterTimestamp_(v[0]), tz, "dd/MM/yyyy");

    var confere =
      dia === String(reg.dia) &&
      extrairMatricula_(v[2]) === extrairMatricula_(reg.matricula) &&
      normalizar_(nomePuroDisciplina_(v[1])) === normalizar_(nomePuroDisciplina_(reg.disciplina)) &&
      String(v[3]) === String(reg.tempo);

    if (!confere) {
      recusados.push(String(reg.aluno || reg.matricula) + " — " + reg.tempo);
      return;
    }

    paraLog.push([
      new Date(),
      (function() { try { return Session.getActiveUser().getEmail() || "—"; } catch (e) { return "—"; } })(),
      v[0], v[1], v[2], v[3], v[4], v[5], v[6] || ""
    ]);

    abaRespostas.deleteRow(linha);
    apagados.push(String(v[2]) + " — " + String(v[3]) + " [" + String(v[5] || "—") + "]");
  });

  if (paraLog.length > 0) _registrarExclusoesPresenca_(paraLog);

  var msg = [];
  if (apagados.length) {
    msg.push("Registro(s) excluído(s): " + apagados.length);
    msg.push(apagados.slice(0, 8).join("\n"));
    if (apagados.length > 8) msg.push("… e mais " + (apagados.length - 8) + ".");
    msg.push("\nRode \"Consolidar frequência\" para atualizar os relatórios.");
  }
  if (recusados.length) {
    msg.push((apagados.length ? "\n" : "") + "Não excluído(s) — a planilha mudou desde a busca, refaça a busca:");
    msg.push(recusados.join("\n"));
  }

  return { ok: apagados.length > 0, excluidos: apagados.length, msg: msg.join("\n") };
}

// Guarda o que foi apagado. A exclusão em si é definitiva na aba de
// respostas; este log é o que permite reconstruir o registro depois
// se a exclusão tiver sido um engano.
function _registrarExclusoesPresenca_(linhas) {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba      = planilha.getSheetByName(ABA_LOG_EXCLUSOES);

  if (!aba) {
    aba = planilha.insertSheet(ABA_LOG_EXCLUSOES);
    aba.appendRow([
      "Excluído em", "Usuário", "Carimbo original", "Disciplina",
      "Aluno", "Tempo", "Presente", "Status", "Motivo do Abono"
    ]);
    aba.getRange(1, 1, 1, 9).setBackground("#B40000").setFontColor("#FFFFFF").setFontWeight("bold");
    aba.setFrozenRows(1);
    aba.hideSheet();
  }

  var inicio = aba.getLastRow() + 1;
  aba.getRange(inicio, 1, linhas.length, 9).setValues(linhas);
  aba.getRange(inicio, 1, linhas.length, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
  aba.getRange(inicio, 3, linhas.length, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
}


// =====================================================
// WRAPPERS para o painel (google.script.run)
// =====================================================
function _getSituacaoPresencaData(dataStr) {
  return getSituacaoPresencaData(dataStr);
}
function _lancarPresencaManualLote(matriculas, tempos, dataStr, disciplina) {
  return lancarPresencaManualLote_(matriculas, tempos, dataStr, disciplina);
}
function _buscarRegistrosPresencaParaExcluir(dataStr, matricula, somenteDuplicadas) {
  return buscarRegistrosPresencaParaExcluir_(dataStr, matricula, somenteDuplicadas);
}
function _excluirRegistrosPresenca(registros) {
  return excluirRegistrosPresenca_(registros);
}
