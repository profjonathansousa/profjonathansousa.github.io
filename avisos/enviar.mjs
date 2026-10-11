/* Cronograma — avisos por Web Push (Fase 8).
   Roda no GitHub Actions, nunca no navegador. Entra com a chave SECRET, que
   resolve para o papel service_role e ignora a RLS de propósito: é o único que
   pode ler as inscrições.

   QUATRO FONTES:
     · o resumo do dia (avisos/dia.mjs) — prioridades e rotinas, em quatro
       momentos: 06:30, 13:00, 19:00 e 23:00;
     · vagas relevantes do lote novo (arquivo do coletor);
     · chamadas relevantes ainda não triadas (arquivo do coletor);
     · eventos públicos do `cron_estado` (domínio `evento`) que entraram na
       janela.

   UM AVISO POR ASSUNTO, cada um agregando o seu. Nunca um por vaga ou por
   evento: quem recebe um aviso por item aprende a ignorar todos.

   O QUE JÁ FOI AVISADO MORA NO SUPABASE (`cron_aviso_enviado`), e não mais num
   commit por aviso. O scripts/estado_notificador.json ficou congelado e só é
   lido: ele guarda o que foi avisado antes da troca.

   Variáveis esperadas:
     SUPABASE_URL, SUPABASE_SECRET_KEY,
     VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
   Opcionais:
     HOJE=2026-09-10  força a data (para testar)
     MOMENTO=manha    força o momento do resumo (manha, tarde, noite, fim)
     SECO=1           calcula e mostra, mas não envia e não grava nada
*/
/* O DIA É O DE SÃO PAULO. O runner do GitHub vive em UTC, e o resumo das 23h
   sai às 02h UTC — já "amanhã" para ele. Fixado antes de qualquer Date. */
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

import fs from 'node:fs';
import path from 'node:path';
import * as DIA from './dia.mjs';

export const JANELA_DIAS = 14;   /* mesmo horizonte da revisão dominical */
export const TTL = 12 * 3600;

/* ---------- datas ---------- */
export function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
         '-' + String(d.getDate()).padStart(2, '0');
}
export function diasAte(dataISO, hojeISO) {
  const a = new Date(hojeISO + 'T00:00:00Z').getTime();
  const b = new Date(String(dataISO).slice(0, 10) + 'T00:00:00Z').getTime();
  if (!isFinite(a) || !isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/* ---------- o lote de vagas ----------
   O lote é o arquivo mais recente que a coleta escreveu em eventos/. É ele que
   dá a identidade `vagas:<data>` e é ele que define o que é "novo": item cujo
   `visto_em` é o dia do lote. */
export function loteMaisRecente(nomes) {
  const datas = (nomes || [])
    .map((n) => (n.match(/^vagas_(\d{4}-\d{2}-\d{2})\.json$/) || [])[1])
    .filter(Boolean).sort();
  return datas.length ? datas[datas.length - 1] : null;
}

/* VEREDICTO AUSENTE NÃO É "NOTIFICAR TUDO". O campo só passou a existir com a
   Vagas 2; um dado coletado antes dela não tem veredicto nenhum, e tratar a
   ausência como relevante encheria o telefone de uma vez só. */
export function vagasDoLote(itens, lote) {
  if (!lote) return [];
  return (itens || []).filter((i) =>
    i && i.veredicto === 'relevante' && String(i.visto_em || '').slice(0, 10) === lote);
}

export function montarAvisoVagas(vagas, lote) {
  const n = vagas.length;
  if (n === 0) return null;
  const titulo = n === 1 ? '1 vaga relevante' : n + ' vagas relevantes';
  const nomes = vagas.slice(0, 3).map((v) => v.titulo || v.instituicao || v.id).filter(Boolean);
  const resto = n - nomes.length;
  const corpo = nomes.join(' · ') + (resto > 0 ? ' e mais ' + resto : '');
  return { titulo, corpo, tag: 'vagas', url: './index.html#vagas', id: 'vagas:' + lote };
}

/* ---------- chamadas ----------
   A IDENTIDADE É DO ITEM, e não do lote. As chamadas curadas são revistas a
   cada coleta e ganham `visto_em` novo toda semana; contar por lote faria a
   mesma chamada de fluxo contínuo tocar o telefone toda segunda.

   SÓ O QUE VOCÊ AINDA NÃO TRIOU. Uma chamada que você já marcou — candidatar,
   descartar ou arquivar — não precisa de lembrete. E nada vencido: a carência
   de 21 dias do coletor serve para você arquivar, não para ser avisado. */
export function chamadasParaAvisar(itens, triagem, hojeISO) {
  return (itens || []).filter((i) => {
    if (!i || !i.id || i.veredicto !== 'relevante') return false;
    if (i.vencida || i.descartado) return false;
    const st = (triagem || {})[i.id];
    if (st && st !== 0) return false;
    if (i.prazo) {
      const d = diasAte(i.prazo, hojeISO);
      if (d !== null && d < 0) return false;
    }
    return true;
  });
}

export function montarAvisoChamadas(chamadas, hojeISO) {
  const n = chamadas.length;
  if (n === 0) return null;
  const titulo = n === 1 ? '1 chamada relevante' : n + ' chamadas relevantes';
  /* O prazo mais curto primeiro: é ele que pode passar sem ser visto. */
  const ord = chamadas.slice().sort((a, b) => {
    const da = a.prazo ? diasAte(a.prazo, hojeISO) : 9999;
    const db = b.prazo ? diasAte(b.prazo, hojeISO) : 9999;
    return da - db;
  });
  const nomes = ord.slice(0, 3).map((c) => {
    const t = c.titulo || c.instituicao || c.id;
    if (!c.prazo) return t;
    const d = diasAte(c.prazo, hojeISO);
    return t + ' (' + (d === 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : 'vence em ' + d + ' dias') + ')';
  });
  const resto = n - nomes.length;
  const corpo = nomes.join(' · ') + (resto > 0 ? ' e mais ' + resto : '');
  return { titulo, corpo, tag: 'chamadas', url: './index.html#vagas',
           ids: chamadas.map((c) => 'chamada:' + c.id) };
}

export function triagemDeLinhas(linhas) {
  const t = {};
  (linhas || []).forEach((l) => {
    if (l && l.dominio === 'triagem' && l.chave) t[l.chave] = (l.valor && l.valor.st) || 0;
  });
  return t;
}

/* ---------- eventos ----------
   EVENTO PRIVADO SAI POR INTEIRO. Não entra na contagem, não empresta a data e
   não vira "1 compromisso" — a existência dele também é informação. Por isso o
   filtro é o primeiro de todos, e não um cuidado na hora de escrever o texto. */
export function eventosNaJanela(eventos, hojeISO, janela) {
  const dias = (typeof janela === 'number') ? janela : JANELA_DIAS;
  const out = [];
  Object.keys(eventos || {}).forEach((eid) => {
    const e = eventos[eid];
    if (!e || e.del) return;
    if (e.priv) return;                       /* privado: fora, sem exceção */
    if (!e.data) return;
    const d = diasAte(e.data, hojeISO);
    if (d === null || d < 0 || d > dias) return;
    out.push({ id: eid, t: e.t || '', data: String(e.data).slice(0, 10), dias: d });
  });
  out.sort((a, b) => (a.dias - b.dias) || (a.id < b.id ? -1 : 1));
  return out;
}

/* A FONTE DOS EVENTOS É O `cron_estado`, e não o `estado.json` (Fase 9G-1).
   Até aqui o notificador lia o arquivo que a dobra publica — o que amarrava o
   aviso diário ao caminho do GitHub e era a única dependência que impedia
   desligá-lo. Agora ele lê a mesma tabela que o aplicativo escreve, com a
   `service_role` que este arquivo JÁ usa para as inscrições. Nenhuma chave
   nova, nenhuma infraestrutura nova.

   NÃO HÁ VOLTA AO ARQUIVO. Um fallback silencioso para o `estado.json` faria o
   aviso continuar "funcionando" com dados congelados no dia em que a leitura
   falhasse — que é pior do que falhar: o job ficaria verde avisando o passado.
   O `api()` lança em qualquer resposta que não seja ok, e o job cai.

   A LÁPIDE É A COLUNA `del`. Evento apagado num aparelho não pode voltar a
   virar aviso, e é a coluna que diz isso — a mesma regra que o aplicativo usa. */
export function eventosDeLinhas(linhas) {
  const fora = {};
  (linhas || []).forEach((l) => {
    if (!l || !l.chave) return;
    const v = l.valor || {};
    fora[l.chave] = { t: v.t || '', data: v.data || '', priv: !!v.priv, del: !!l.del };
  });
  return fora;
}

/* Traz os eventos do dono do Cronograma. Dois donos seria ambiguidade, e o
   notificador para em vez de escolher — mesma regra do publicador da estrutura. */
export async function buscarDono(api) {
  const donos = await api('/cron_dono?select=uid&limit=2');
  if (!Array.isArray(donos) || donos.length !== 1) {
    throw new Error('cron_dono tem ' + ((donos || []).length) + ' linha(s); esperava exatamente 1');
  }
  return donos[0].uid;
}
export async function buscarEventos(api, uid) {
  const dono = uid || await buscarDono(api);
  const linhas = await api('/cron_estado?select=chave,valor,del&dominio=eq.evento&dono=eq.' + dono);
  return eventosDeLinhas(linhas);
}
/* As linhas na forma que o aplicativo recebe pelo delta, e na MESMA ordem
   (servidor_em): o relógio do SYNC decide entre versões, mas a ordem é a dele. */
export async function buscarLinhas(api, uid, dominios) {
  return api('/cron_estado?select=dominio,chave,valor,del,em,aparelho,servidor_em' +
             '&dono=eq.' + uid + '&dominio=in.(' + dominios.join(',') + ')&order=servidor_em.asc');
}

export function montarAvisoEventos(eventos) {
  const n = eventos.length;
  if (n === 0) return null;
  const titulo = n === 1 ? '1 data se aproximando' : n + ' datas se aproximando';
  const corpo = eventos.slice(0, 3).map((e) =>
    (e.t || 'sem título') + ' · ' + (e.dias === 0 ? 'hoje' : e.dias === 1 ? 'amanhã' : 'em ' + e.dias + ' dias')
  ).join(' — ') + (n > 3 ? ' e mais ' + (n - 3) : '');
  return { titulo, corpo, tag: 'eventos', url: './index.html', ids: eventos.map((e) => 'evento:' + e.id + ':' + e.data) };
}

/* ---------- o que sobra depois da dedup ---------- */
export function jaEnviado(estado, id) {
  return !!(estado && estado.enviados && estado.enviados[id]);
}
export function decidir(dados, estado, hojeISO) {
  /* SEM EVENTOS NÃO É "NENHUM EVENTO". Antes eles vinham do `lerDados` e
     estavam sempre presentes; agora vêm da rede, e a ausência da chave só pode
     significar que alguém esqueceu de buscá-los. Emudecer aqui faria o aviso
     de datas sumir sem ninguém notar. */
  if (!dados || !dados.eventos || typeof dados.eventos !== 'object') {
    throw new Error('decidir: faltam os eventos — use buscarEventos(api) antes.');
  }
  const avisos = [];
  /* O resumo do dia vem pronto (ele precisa do aplicativo carregado, e isso é
     do principal) e entra primeiro: é o único que tem hora certa. */
  if (dados.dia && !dados.dia.ids.some((id) => jaEnviado(estado, id))) avisos.push(dados.dia);
  const av = montarAvisoVagas(vagasDoLote(dados.vagas, dados.lote), dados.lote);
  if (av && !jaEnviado(estado, av.id)) avisos.push({ ...av, ids: [av.id] });
  if (Array.isArray(dados.chamadas)) {
    const novas = chamadasParaAvisar(dados.chamadas, dados.triagem, hojeISO)
      .filter((c) => !jaEnviado(estado, 'chamada:' + c.id));
    const ac = montarAvisoChamadas(novas, hojeISO);
    if (ac) avisos.push(ac);
  }
  const nosPrazos = eventosNaJanela(dados.eventos, hojeISO).filter(
    (e) => !jaEnviado(estado, 'evento:' + e.id + ':' + e.data));
  const ae = montarAvisoEventos(nosPrazos);
  if (ae) avisos.push(ae);
  return avisos;
}

/* ---------- envio ----------
   404 e 410 querem dizer "esse aparelho não existe mais": apaga, não insiste.
   Qualquer outro erro fica registrado e a inscrição continua.

   A IDENTIDADE SÓ É GRAVADA SE ALGO CHEGOU. Envio que falhou em todos os
   aparelhos não conta como enviado, e a execução seguinte tenta de novo — é a
   diferença entre "já avisei" e "tentei avisar". */
export async function enviarAviso(aviso, inscricoes, dep) {
  const carga = JSON.stringify({ titulo: aviso.titulo, corpo: aviso.corpo, tag: aviso.tag, url: aviso.url });
  /* O resumo do dia vai com urgência alta: o iPhone entrega na hora, e não
     quando lhe convier poupar bateria. E com TTL curto: o da manhã não serve à
     tarde. Os outros seguem como sempre. */
  const opcoes = { TTL: aviso.ttl || TTL };
  if (aviso.urgencia) opcoes.urgency = aviso.urgencia;
  let entregues = 0, mortos = 0, falhos = 0;
  for (const i of inscricoes) {
    const alvo = { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } };
    try {
      await dep.webpush.sendNotification(alvo, carga, opcoes);
      entregues++;
      await dep.api('/cron_push_inscricao?id=eq.' + i.id, { method: 'PATCH',
        body: JSON.stringify({ ultimo_envio: new Date().toISOString(), falhas: 0, ultimo_erro: null }) });
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await dep.api('/cron_push_inscricao?id=eq.' + i.id, { method: 'DELETE' });
        mortos++;
        dep.log('  inscricao morta, removida');
      } else {
        falhos++;
        dep.log('  falhou: ' + (e.statusCode || '') + ' ' + String(e.message || '').slice(0, 120));
        await dep.api('/cron_push_inscricao?id=eq.' + i.id, { method: 'PATCH',
          body: JSON.stringify({ falhas: (i.falhas || 0) + 1,
                                 ultimo_erro: String(e.statusCode || e.message).slice(0, 200) }) });
      }
    }
  }
  return { entregues, mortos, falhos };
}

/* O LOG DO ACTIONS É PÚBLICO, porque o repositório é. Vagas, chamadas e
   datas públicas já são públicas — o texto delas pode ir ao log. O resumo do
   dia NÃO: as prioridades e as rotinas moram numa base privada justamente para
   não morar num repositório aberto, e escrevê-las no log as publicaria por
   outra porta. Dele, o log mostra só o título (que vem do 00-config.js, já
   versionado) e o tamanho. */
export function textoDoLog(aviso) {
  if (aviso.tag === 'dia') {
    return aviso.titulo + ' — [corpo omitido: ' + String(aviso.corpo || '').split('\n').length +
           ' linha(s); o log do Actions é público]';
  }
  return aviso.titulo + ' — ' + aviso.corpo;
}

export async function rodar(dados, estado, inscricoes, hojeISO, dep) {
  const avisos = decidir(dados, estado, hojeISO);
  const novo = { enviados: { ...((estado && estado.enviados) || {}) } };
  let total = { entregues: 0, mortos: 0, falhos: 0 };
  for (const aviso of avisos) {
    dep.log(textoDoLog(aviso));
    if (dep.seco) continue;
    const r = await enviarAviso(aviso, inscricoes, dep);
    total = { entregues: total.entregues + r.entregues, mortos: total.mortos + r.mortos,
              falhos: total.falhos + r.falhos };
    if (r.entregues > 0) aviso.ids.forEach((id) => { novo.enviados[id] = hojeISO; });
  }
  return { avisos, estado: novo, ...total };
}

/* ---------- leitura do repositório e execução ---------- */
/* SÓ O QUE MORA EM ARQUIVO: as vagas e o lote, que são do coletor e não têm
   nada com a sincronia. Os EVENTOS não vêm mais daqui — ver buscarEventos(). E
   não são preenchidos com `{}` de consolo: quem monta os dados tem de ir
   buscá-los, e esquecer disso quebra em vez de emudecer. */
export function lerDados(raiz, hojeISO) {
  const j = (p, d) => { try { return JSON.parse(fs.readFileSync(path.join(raiz, p), 'utf8')); } catch (e) { return d; } };
  const itensDe = (arq) => (Array.isArray(arq) ? arq : (arq.itens || []));
  const itens = itensDe(j('dados/vagas.json', {}));
  const chamadas = itensDe(j('dados/chamadas.json', {}));
  let nomes = [];
  try { nomes = fs.readdirSync(path.join(raiz, 'eventos')); } catch (e) { nomes = []; }
  return { vagas: itens, chamadas, lote: loteMaisRecente(nomes), hoje: hojeISO };
}

/* ---------- o que já foi avisado ----------
   A TABELA É A FONTE, e o arquivo antigo é só lido. Até aqui cada aviso virava
   um commit no main com um `git push` sem nova tentativa, fora do grupo de
   concorrência dos outros jobs: numa segunda em que a coleta gravasse no mesmo
   minuto, o job caía e o mesmo aviso voltava no dia seguinte. Com quatro
   resumos por dia, seriam quatro commits por dia. */
export async function lerEnviados(api, legado) {
  const enviados = { ...((legado && legado.enviados) || {}) };
  const linhas = await api('/cron_aviso_enviado?select=id,enviado_em');
  (linhas || []).forEach((l) => { enviados[l.id] = l.enviado_em; });
  return { enviados };
}
export async function gravarEnviados(api, ids, hojeISO) {
  if (!ids.length) return;
  await api('/cron_aviso_enviado', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(ids.map((id) => ({ id, enviado_em: hojeISO })))
  });
}

/* O instante que o resumo descreve. Com HOJE e MOMENTO (teste à mão), é a hora
   daquele momento naquele dia; sem eles, é agora. */
export function instanteDoResumo(agora, hojeISO, momento) {
  if (!hojeISO) return agora;
  const [y, m, d] = hojeISO.split('-').map(Number);
  const mo = DIA.MOMENTOS.find((x) => x.id === momento);
  const [hh, mm] = (mo ? mo.hora : '12:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

async function principal() {
  const webpush = (await import('web-push')).default;
  const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const URL_BASE = process.env.SUPABASE_URL, CHAVE = process.env.SUPABASE_SECRET_KEY;
  const SECO = process.env.SECO === '1';
  const pedido = (process.env.MOMENTO || '').trim();
  if (pedido && !DIA.MOMENTOS.some((m) => m.id === pedido)) {
    console.error('MOMENTO desconhecido: ' + pedido + ' (use manha, tarde, noite ou fim)'); process.exit(1);
  }
  const agora = instanteDoResumo(new Date(), process.env.HOJE, pedido);
  const hojeISO = ymd(agora);
  const momento = pedido || DIA.momentoDaHora(agora);
  if (!URL_BASE || !CHAVE) { console.error('Faltam SUPABASE_URL / SUPABASE_SECRET_KEY.'); process.exit(1); }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:ninguem@exemplo.com',
                          process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const cabecalho = { apikey: CHAVE, Authorization: 'Bearer ' + CHAVE, 'Content-Type': 'application/json' };
  const api = async (caminho, opcoes = {}) => {
    const r = await fetch(URL_BASE + '/rest/v1' + caminho,
                          { ...opcoes, headers: { ...cabecalho, ...(opcoes.headers || {}) } });
    if (!r.ok) throw new Error(caminho + ' -> ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return (r.status === 204 || r.status === 201) ? null : r.json();
  };
  let legado = { enviados: {} };
  try { legado = JSON.parse(fs.readFileSync(path.join(RAIZ, 'scripts', 'estado_notificador.json'), 'utf8')); } catch (e) {}
  const estado = await lerEnviados(api, legado);

  const dados = lerDados(RAIZ, hojeISO);
  const uid = await buscarDono(api);
  dados.eventos = await buscarEventos(api, uid);   /* Fase 9G-1: do cron_estado */
  const linhas = await buscarLinhas(api, uid, DIA.DOMINIOS_DO_DIA.concat(['triagem']));
  dados.triagem = triagemDeLinhas(linhas);

  if (momento) {
    const fonte = DIA.fonteDoApp(RAIZ);
    const entrada = fs.readFileSync(path.join(RAIZ, 'Cronograma', 'entrada.json'), 'utf8');
    const doDia = linhas.filter((l) => l.dominio !== 'triagem');
    const hoje = DIA.resumoDoDia(DIA.carregarApp({ fonte, entrada, linhas: doDia, instante: agora.getTime() }));
    const amanha = momento === 'fim'
      ? DIA.resumoDoDia(DIA.carregarApp({ fonte, entrada, linhas: doDia, instante: DIA.instanteDeAmanha(agora) }))
      : null;
    dados.dia = DIA.montarAvisoDoDia(momento, hoje, amanha);
  }

  const inscricoes = await api('/cron_push_inscricao?select=id,endpoint,p256dh,auth,falhas');
  console.log('hoje: ' + hojeISO + ' | momento: ' + (momento || 'nenhum') +
              ' | lote de vagas: ' + (dados.lote || 'nenhum') +
              ' | aparelhos inscritos: ' + inscricoes.length);
  if (momento && !dados.dia) console.log('resumo do dia: nada aberto, nada a dizer.');
  const r = await rodar(dados, estado, inscricoes, hojeISO,
                        { webpush, api, log: (m) => console.log(m), seco: SECO });
  if (!r.avisos.length) console.log('nada a avisar.');
  const novos = Object.keys(r.estado.enviados).filter((id) => !estado.enviados[id]);
  if (!SECO) await gravarEnviados(api, novos, hojeISO);
  console.log('avisos: ' + r.avisos.length + ' | entregues: ' + r.entregues +
              ' | mortos removidos: ' + r.mortos + ' | falhas: ' + r.falhos);
  if (r.falhos > 0) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith('enviar.mjs')) await principal();
