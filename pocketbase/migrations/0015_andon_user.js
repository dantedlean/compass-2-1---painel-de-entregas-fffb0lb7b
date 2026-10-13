migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    // usuário do Andon (pedido Dante 13/10) — admin: pode programar/apontar
    const email = 'andon@dlean.com.br'
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', email)
      // já existe — garante papel/senha
      const u0 = app.findAuthRecordByEmail('_pb_users_auth_', email)
      if (u0.get('role') !== 'admin') {
        u0.set('role', 'admin')
        app.save(u0)
      }
      return
    } catch (_) {}
    const record = new Record(users)
    record.setEmail(email)
    record.setVerified(true)
    record.set('emailVisibility', true)
    record.set('name', 'Andon Produção')
    record.setPassword('Andon@2026')
    record.set('role', 'admin')
    app.save(record)
  },
  (app) => {
    try {
      app.delete(app.findAuthRecordByEmail('_pb_users_auth_', 'andon@dlean.com.br'))
    } catch (_) {}
  },
)
