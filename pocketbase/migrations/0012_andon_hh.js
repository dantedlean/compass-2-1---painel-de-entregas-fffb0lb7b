// 0012 - Andon Produção hora a hora (Dante 07/10): coleção andon_hh guarda os
// apontamentos rápidos por hora (event_type/changes/source no MESMO formato dos
// reprogramming_events — snapshot completo, último vence).
// LEITURA PÚBLICA (TV da fábrica sem login, como faturamento_nfs — Dante 06/10 Opção B
// só fechou a AGENDA/SMKT; o andon hora a hora é leitura de chão).
// ESCRITA admin-only (mesma regra do 0008) — viewer/anônimo não gravam.
migrate(
  (app) => {
    const W_RULE = "@request.auth.id != '' && @request.auth.role = 'admin'"
    const col = new Collection({
      name: 'andon_hh',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: W_RULE,
      updateRule: W_RULE,
      deleteRule: W_RULE,
      fields: [
        { name: 'event_type', type: 'select', values: ['system'], maxSelect: 1 },
        { name: 'occurred_at', type: 'date', required: true },
        { name: 'reason', type: 'text', max: 500 },
        { name: 'source', type: 'text', max: 60 },
        { name: 'changes', type: 'json', required: true, maxSize: 300000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_andon_hh_created ON andon_hh (created DESC)'],
    })
    app.save(col)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('andon_hh'))
  },
)
