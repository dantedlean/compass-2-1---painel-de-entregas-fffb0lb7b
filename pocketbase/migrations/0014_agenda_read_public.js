// 0014 - Restauro da leitura pública da agenda (Dante 10/10): o card "Programação firme"
// ficou invisível para quem não está logado (Opção B de 06/10 + token expirado).
// Leitura (list/view) volta a ser PÚBLICA; ESCRITA continua admin-only (0008/0012).
migrate(
  (app) => {
    const ev = app.findCollectionByNameOrId('reprogramming_events')
    ev.listRule = ''
    ev.viewRule = ''
    app.save(ev)
  },
  (app) => {
    const R_AUTH = "@request.auth.id != ''"
    const ev = app.findCollectionByNameOrId('reprogramming_events')
    ev.listRule = R_AUTH
    ev.viewRule = R_AUTH
    app.save(ev)
  },
)
