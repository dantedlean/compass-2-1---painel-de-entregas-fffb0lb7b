// 0009 - Leitura PÚBLICA do rascunho/SMKT (restaura comportamento do 0007).
// O pipeline de deploy re-executou migrações no banco vivo e a leitura dos
// reprogramming_events voltou a exigir login — isso quebra o pullPublic do
// Andon (viewer e modo sem-login não carregam o rascunho do servidor).
// ESCRITA permanece admin-only (0008). Os dados são operacionais (códigos, PV,
// qtds, SMKT) — sem dado pessoal; já eram públicos por design do 0007.
migrate(
  (app) => {
    const ev = app.findCollectionByNameOrId('reprogramming_events')
    ev.listRule = ''
    ev.viewRule = ''
    app.save(ev)
  },
  (app) => {
    const ev = app.findCollectionByNameOrId('reprogramming_events')
    ev.listRule = "@request.auth.id != ''"
    ev.viewRule = "@request.auth.id != ''"
    app.save(ev)
  },
)
