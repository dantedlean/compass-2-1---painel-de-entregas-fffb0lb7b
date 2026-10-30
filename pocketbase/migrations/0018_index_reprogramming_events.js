migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('reprogramming_events')
    // Adiciona índice composto para cobrir as consultas de sincronização do Andon:
    // filter: cycle_id='...' && event_type='...' && source='...' sort: -created
    col.addIndex('idx_reprog_events_sync', false, 'cycle_id, event_type, source, created DESC', '')
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('reprogramming_events')
    col.removeIndex('idx_reprog_events_sync')
    app.save(col)
  },
)
