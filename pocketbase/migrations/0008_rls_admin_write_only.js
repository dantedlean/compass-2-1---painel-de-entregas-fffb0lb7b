// 0008 - Fecho RLS completo (Dante 06/10): viewer e anônimo NÃO escrevem em NADA.
// Complementa 0007 (reprogramming_events + faturamento_nfs):
// - Escrita (create/update/delete) SOMENTE para usuário autenticado com role='admin'
//   (mais estrito que 0007, que aceitava qualquer não-viewer — fecha usuários sem papel).
// - users: anônimo não cria conta (createRule=null) e o próprio dono não edita o
//   próprio registro (mata a auto-promoção viewer->admin pela API).
// - Leitura permanece como está: eventos/NFs públicas (pullPublic do Andon),
//   coleções de planejamento só com login.
migrate(
  (app) => {
    const W_RULE = "@request.auth.id != '' && @request.auth.role = 'admin'"
    const R_AUTH = "@request.auth.id != ''"

    const setRules = function (col, list, view, create, update, del) {
      if (list !== undefined) col.listRule = list
      if (view !== undefined) col.viewRule = view
      if (create !== undefined) col.createRule = create
      if (update !== undefined) col.updateRule = update
      if (del !== undefined) col.deleteRule = del
      app.save(col)
    }

    setRules(
      app.findCollectionByNameOrId('planning_cycles'),
      undefined,
      undefined,
      W_RULE,
      W_RULE,
      W_RULE,
    )
    setRules(
      app.findCollectionByNameOrId('planning_items'),
      undefined,
      undefined,
      W_RULE,
      W_RULE,
      W_RULE,
    )
    setRules(
      app.findCollectionByNameOrId('production_declarations'),
      undefined,
      undefined,
      W_RULE,
      W_RULE,
      W_RULE,
    )
    setRules(
      app.findCollectionByNameOrId('sync_runs'),
      undefined,
      undefined,
      W_RULE,
      W_RULE,
      W_RULE,
    )

    // re-tighten: eventos e NFs passam de "não-viewer" para "admin" explícito
    setRules(
      app.findCollectionByNameOrId('reprogramming_events'),
      undefined,
      undefined,
      W_RULE,
      W_RULE,
      W_RULE,
    )
    setRules(
      app.findCollectionByNameOrId('faturamento_nfs'),
      undefined,
      undefined,
      W_RULE,
      W_RULE,
      W_RULE,
    )

    // users: fecha escalação de privilégio
    const u = app.findCollectionByNameOrId('_pb_users_auth_')
    setRules(
      u,
      R_AUTH,
      R_AUTH,
      null,
      "id = @request.auth.id && @request.auth.role = 'admin'",
      "id = @request.auth.id && @request.auth.role = 'admin'",
    )
  },
  (app) => {
    const A = "@request.auth.id != ''"
    const setRules = function (col, list, view, create, update, del) {
      col.listRule = list
      col.viewRule = view
      col.createRule = create
      col.updateRule = update
      col.deleteRule = del
      app.save(col)
    }
    setRules(app.findCollectionByNameOrId('planning_cycles'), A, A, A, A, A)
    setRules(app.findCollectionByNameOrId('planning_items'), A, A, A, A, A)
    setRules(app.findCollectionByNameOrId('production_declarations'), A, A, A, A, A)
    setRules(app.findCollectionByNameOrId('sync_runs'), A, A, A, A, A)
    setRules(
      app.findCollectionByNameOrId('reprogramming_events'),
      '',
      '',
      W_RULE2(),
      W_RULE2(),
      W_RULE2(),
    )
    setRules(
      app.findCollectionByNameOrId('faturamento_nfs'),
      '',
      '',
      W_RULE2(),
      W_RULE2(),
      W_RULE2(),
    )
    function W_RULE2() {
      return "@request.auth.id != '' && @request.auth.role != 'viewer'"
    }
    const u = app.findCollectionByNameOrId('_pb_users_auth_')
    setRules(
      u,
      'id = @request.auth.id',
      'id = @request.auth.id',
      '',
      'id = @request.auth.id',
      'id = @request.auth.id',
    )
  },
)
