migrate(
  (app) => {
    const email = 'analista.projetos@painel.local'
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', email)
      return
    } catch (_) {}

    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const record = new Record(users)
    record.set('username', 'analista_projetos')
    record.setEmail(email)
    record.setVerified(true)
    record.set('emailVisibility', true)
    record.set('name', 'Analista de Projetos')
    record.setPassword('Dlean@2019')
    app.save(record)
  },
  (app) => {
    try {
      app.delete(app.findAuthRecordByEmail('_pb_users_auth_', 'analista.projetos@painel.local'))
    } catch (_) {}
  },
)
