migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!users.fields.getByName('role')) {
      users.fields.add(new SelectField({ name: 'role', values: ['admin', 'viewer'], maxSelect: 1 }))
      app.save(users)
    }
    // Dante = admin (pode editar) — idempotente
    try {
      const dante = app.findAuthRecordByEmail('_pb_users_auth_', 'dante@dlean.com.br')
      if (dante && dante.get('role') !== 'admin') {
        dante.set('role', 'admin')
        app.save(dante)
      }
    } catch (_) {}
    // usuário somente-visualização (vê todas as abas, sem editar)
    const email = 'consultas@dlean.com.br'
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', email)
      return
    } catch (_) {}
    const record = new Record(users)
    record.setEmail(email)
    record.setVerified(true)
    record.set('emailVisibility', true)
    record.set('name', 'Consultas (somente visualização)')
    record.setPassword('Dlean@2019')
    record.set('role', 'viewer')
    app.save(record)
  },
  (app) => {
    try {
      app.delete(app.findAuthRecordByEmail('_pb_users_auth_', 'consultas@dlean.com.br'))
    } catch (_) {}
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    if (users.fields.getByName('role')) {
      users.fields.removeByName('role')
      app.save(users)
    }
  },
)
