// 0010 - Gate de leitura da agenda e do SMKT (Dante 06/10): rascunho e SMKT
// passam a exigir login (admin ou viewer). Anônimo continua vendo carteira,
// faturamento e semanas (base estática + faturamento_nfs públicas).
// Escrita continua admin-only (0008).
migrate(
  (app) => {
    const R_AUTH = "@request.auth.id != ''"
    const ev = app.findCollectionByNameOrId('reprogramming_events')
    ev.listRule = R_AUTH
    ev.viewRule = R_AUTH
    app.save(ev)
  },
  (app) => {
    const ev = app.findCollectionByNameOrId('reprogramming_events')
    ev.listRule = ''
    ev.viewRule = ''
    app.save(ev)
  },
)
