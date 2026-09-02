/* Envia um aviso de teste para todos os aparelhos inscritos.
   Não lê vagas, não lê eventos e NÃO MEXE NA DEDUPLICAÇÃO: existe só para
   provar que a corrente inteira funciona. */
import webpush from 'web-push';
import { enviarAviso } from './enviar.mjs';

const URL_BASE = process.env.SUPABASE_URL, CHAVE = process.env.SUPABASE_SERVICE_ROLE;
if (!URL_BASE || !CHAVE) { console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE.'); process.exit(1); }
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:ninguem@exemplo.com',
                        process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

const cabecalho = { apikey: CHAVE, Authorization: 'Bearer ' + CHAVE, 'Content-Type': 'application/json' };
const api = async (caminho, opcoes = {}) => {
  const r = await fetch(URL_BASE + '/rest/v1' + caminho, { ...opcoes, headers: cabecalho });
  if (!r.ok) throw new Error(caminho + ' -> ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.status === 204 ? null : r.json();
};

const inscricoes = await api('/cron_push_inscricao?select=id,endpoint,p256dh,auth,falhas');
console.log('aparelhos inscritos: ' + inscricoes.length);
if (!inscricoes.length) { console.log('ninguem inscrito — nada a testar.'); process.exit(0); }

const r = await enviarAviso(
  { titulo: 'Cronograma', corpo: 'Teste de aviso. Se chegou, a corrente inteira funciona.',
    tag: 'teste', url: './index.html' },
  inscricoes, { webpush, api, log: (m) => console.log(m) });
console.log('entregues: ' + r.entregues + ' | mortos removidos: ' + r.mortos + ' | falhas: ' + r.falhos);
if (r.falhos > 0) process.exitCode = 1;
