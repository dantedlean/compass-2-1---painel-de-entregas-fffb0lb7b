migrate(
  (app) => {
    const email = 'dante@dlean.com.br'
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', email)
      return
    } catch (_) {}

    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const record = new Record(users)
    record.setEmail(email)
    record.setPassword('Compass2@2026')
    record.setVerified(true)
    record.set('name', 'Dante')
    app.save(record)
  },
  (app) => {
    try {
      app.delete(app.findAuthRecordByEmail('_pb_users_auth_', 'dante@dlean.com.br'))
    } catch (_) {}
  },
)
