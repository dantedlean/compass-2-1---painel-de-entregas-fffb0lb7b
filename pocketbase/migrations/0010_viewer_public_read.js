// 0010 - Restaura LEITURA pública do rascunho/SMKT do Andon e das NFs (Dante 06/10).
// O pipeline de deploy do Skip re-executa migrações no banco vivo e o estado posto
// por migrações antigas pode reverter (list/view voltaram a exigir login, quebrando
// o pullPublic do modo leitura). Escrita continua admin-only (0008) — nada muda aí.
migrate(
  (app) => {
    const ev = app.findCollectionByNameOrId('reprogramming_events')
    ev.listRule = ''
    ev.viewRule = ''
    app.save(ev)
    const nfs = app.findCollectionByNameOrId('faturamento_nfs')
    nfs.listRule = ''
    nfs.viewRule = ''
    app.save(nfs)
  },
  (app) => {
    const A = "@request.auth.id != ''"
    const ev = app.findCollectionByNameOrId('reprogramming_events')
    ev.listRule = A
    ev.viewRule = A
    app.save(ev)
    const nfs = app.findCollectionByNameOrId('faturamento_nfs')
    nfs.listRule = A
    nfs.viewRule = A
    app.save(nfs)
  },
)
