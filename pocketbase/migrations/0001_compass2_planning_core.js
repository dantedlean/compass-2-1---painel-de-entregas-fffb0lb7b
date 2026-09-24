migrate(
  (app) => {
    const planningCycles = new Collection({
      name: 'planning_cycles',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'name', type: 'text', required: true, max: 120 },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['draft', 'open', 'closed', 'archived'],
          maxSelect: 1,
        },
        { name: 'start_date', type: 'date', required: true },
        { name: 'end_date', type: 'date', required: true },
        {
          name: 'source',
          type: 'select',
          required: true,
          values: ['manual', 'maxiprod', 'import', 'pulso'],
          maxSelect: 1,
        },
        { name: 'source_version', type: 'text', max: 120 },
        { name: 'notes', type: 'text', max: 4000 },
        {
          name: 'created_by',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_planning_cycles_status_dates ON planning_cycles (status, start_date, end_date)',
      ],
    })
    app.save(planningCycles)

    const planningItems = new Collection({
      name: 'planning_items',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'cycle_id',
          type: 'relation',
          required: true,
          collectionId: planningCycles.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'external_key', type: 'text', required: true, max: 180 },
        { name: 'product_code', type: 'text', required: true, max: 80 },
        { name: 'product_name', type: 'text', required: true, max: 240 },
        { name: 'pv_number', type: 'text', max: 80 },
        { name: 'client_name', type: 'text', max: 240 },
        { name: 'company_name', type: 'text', max: 160 },
        { name: 'delivery_date', type: 'date', required: true },
        { name: 'planned_week', type: 'text', required: true, max: 20 },
        { name: 'quantity', type: 'number', required: true, min: 0, onlyInt: true },
        { name: 'produced_quantity', type: 'number', min: 0, onlyInt: true },
        { name: 'unit_value', type: 'number', min: 0 },
        { name: 'total_value', type: 'number', min: 0 },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['pending', 'producing', 'produced', 'fulfilled', 'cancelled'],
          maxSelect: 1,
        },
        {
          name: 'source_system',
          type: 'select',
          required: true,
          values: ['maxiprod', 'manual', 'pulso', 'import'],
          maxSelect: 1,
        },
        { name: 'source_record_id', type: 'text', max: 120 },
        { name: 'is_freight', type: 'bool' },
        { name: 'rigid_date', type: 'date' },
        { name: 'notes', type: 'text', max: 4000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_planning_items_cycle_external ON planning_items (cycle_id, external_key)',
        'CREATE INDEX idx_planning_items_week ON planning_items (cycle_id, planned_week)',
        'CREATE INDEX idx_planning_items_product ON planning_items (cycle_id, product_code)',
        'CREATE INDEX idx_planning_items_delivery ON planning_items (cycle_id, delivery_date)',
        'CREATE INDEX idx_planning_items_status ON planning_items (cycle_id, status)',
      ],
    })
    app.save(planningItems)

    const productionDeclarations = new Collection({
      name: 'production_declarations',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'cycle_id',
          type: 'relation',
          required: true,
          collectionId: planningCycles.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'production_date', type: 'date', required: true },
        { name: 'product_code', type: 'text', required: true, max: 80 },
        { name: 'product_name', type: 'text', max: 240 },
        { name: 'quantity', type: 'number', required: true, min: 0, onlyInt: true },
        { name: 'allocation', type: 'json', maxSize: 200000 },
        {
          name: 'source',
          type: 'select',
          required: true,
          values: ['manual', 'pulso', 'maxiprod', 'import'],
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['draft', 'confirmed', 'cancelled'],
          maxSelect: 1,
        },
        {
          name: 'declared_by',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'notes', type: 'text', max: 4000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_production_declarations_cycle_date ON production_declarations (cycle_id, production_date)',
        'CREATE INDEX idx_production_declarations_product ON production_declarations (cycle_id, product_code)',
      ],
    })
    app.save(productionDeclarations)

    const reprogrammingEvents = new Collection({
      name: 'reprogramming_events',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'cycle_id',
          type: 'relation',
          required: true,
          collectionId: planningCycles.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'event_type',
          type: 'select',
          required: true,
          values: ['scenario', 'actual', 'import', 'system'],
          maxSelect: 1,
        },
        { name: 'occurred_at', type: 'date', required: true },
        { name: 'reason', type: 'text', required: true, max: 1000 },
        { name: 'source', type: 'text', max: 160 },
        { name: 'changes', type: 'json', required: true, maxSize: 300000 },
        { name: 'before_snapshot', type: 'json', maxSize: 300000 },
        {
          name: 'created_by',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_reprogramming_events_cycle_date ON reprogramming_events (cycle_id, occurred_at DESC)',
      ],
    })
    app.save(reprogrammingEvents)

    const syncRuns = new Collection({
      name: 'sync_runs',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'cycle_id',
          type: 'relation',
          collectionId: planningCycles.id,
          maxSelect: 1,
        },
        {
          name: 'source',
          type: 'select',
          required: true,
          values: ['maxiprod', 'pulso', 'manual'],
          maxSelect: 1,
        },
        { name: 'started_at', type: 'date', required: true },
        { name: 'finished_at', type: 'date' },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['running', 'succeeded', 'partial', 'failed'],
          maxSelect: 1,
        },
        { name: 'rows_read', type: 'number', min: 0, onlyInt: true },
        { name: 'rows_created', type: 'number', min: 0, onlyInt: true },
        { name: 'rows_updated', type: 'number', min: 0, onlyInt: true },
        { name: 'rows_removed', type: 'number', min: 0, onlyInt: true },
        { name: 'error_message', type: 'text', max: 4000 },
        { name: 'parameters', type: 'json', maxSize: 100000 },
        {
          name: 'created_by',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_sync_runs_status_started ON sync_runs (status, started_at DESC)',
        'CREATE INDEX idx_sync_runs_cycle ON sync_runs (cycle_id, started_at DESC)',
      ],
    })
    app.save(syncRuns)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('sync_runs'))
    app.delete(app.findCollectionByNameOrId('reprogramming_events'))
    app.delete(app.findCollectionByNameOrId('production_declarations'))
    app.delete(app.findCollectionByNameOrId('planning_items'))
    app.delete(app.findCollectionByNameOrId('planning_cycles'))
  },
)
