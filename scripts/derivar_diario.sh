#!/bin/bash
# derivar_diario.sh — o que o launchd chama uma vez por dia, no Mac.
#
# DERIVA, COMMITA E EMPURRA. Nada aqui decide o que marcar: quem decide e o
# derivar_do_pipeline.py, lendo o artefato. Este arquivo so cuida do entorno —
# o ambiente, o git e o silencio quando nao ha nada a fazer.
#
# O SEGREDO NAO MORA AQUI, NEM NO .plist, NEM NO REPOSITORIO. O launchd nao le
# o seu ~/.zshrc, entao as credenciais vem de um arquivo fora do repositorio,
# so seu, que este script carrega:
#
#     mkdir -p ~/.config/cronograma
#     cat > ~/.config/cronograma/env <<'FIM'
#     export SUPABASE_URL="https://<projeto>.supabase.co/rest/v1"
#     export SUPABASE_SECRET_KEY="<a chave de servico>"
#     FIM
#     chmod 600 ~/.config/cronograma/env
#
# Sem esse arquivo o derivar_do_pipeline.py recusa e diz por que — que e o
# comportamento certo, e nao uma falha a esconder.
set -u

REPO="${REPO_PORTAL:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/03_PROJETO/PORTAL}"
AMBIENTE="$HOME/.config/cronograma/env"

[ -f "$AMBIENTE" ] && . "$AMBIENTE"

cd "$REPO" || { echo "repositorio nao encontrado: $REPO"; exit 1; }

# TRAZER ANTES DE ESCREVER. A pasta e um clone que sincroniza pelo iCloud e pelo
# git ao mesmo tempo; comecar por um pull evita empurrar em cima de um remoto
# que ja andou. Falha de rede nao aborta: o derivar continua valendo local.
git pull --rebase --quiet 2>/dev/null || echo "aviso: git pull falhou; seguindo com o que ha aqui"

python3 scripts/derivar_do_pipeline.py --aplicar
codigo=$?

# SILENCIO QUANDO NAO HA NADA. `git commit` sem mudanca devolve erro, e um
# agendamento que reclama todo dia vira ruido que se aprende a ignorar.
if [ -n "$(git status --porcelain -- Cronograma/toques Cronograma/estado.json)" ]; then
  git add -- Cronograma/toques Cronograma/estado.json
  git commit -q -m "derivacao: etapas fechadas pelo artefato"
  git push -q || echo "aviso: git push falhou; o commit esta local"
  echo "commitado e empurrado."
fi

exit $codigo
