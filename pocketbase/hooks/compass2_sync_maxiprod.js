routerAdd(
  'POST',
  '/backend/v1/compass2/sync-maxiprod',
  (e) => {
    const body = e.requestInfo().body || {}
    const cycleId = String(body.cycle_id || '')
    if (!/^[a-z0-9]{15}$/.test(cycleId)) {
      return e.badRequestError('Ciclo de planejamento inválido.')
    }

    const startedAt = new Date().toISOString()
    const syncCollection = $app.findCollectionByNameOrId('sync_runs')
    const syncRun = new Record(syncCollection)
    syncRun.set('cycle_id', cycleId)
    syncRun.set('source', 'maxiprod')
    syncRun.set('started_at', startedAt)
    syncRun.set('status', 'running')
    syncRun.set('rows_read', 0)
    syncRun.set('rows_created', 0)
    syncRun.set('rows_updated', 0)
    syncRun.set('rows_removed', 0)
    syncRun.set('parameters', {
      read_only: true,
      cnpjs: ['33518000000137', '33518000000218', '51743790000136', '45758498000194'],
      delivery_date_source: 'item.entregaData or item.entregaPrevisaoData',
    })
    syncRun.set('created_by', e.auth.id)
    $app.save(syncRun)

    const token = $secrets.get('MAXIPROD_TOKEN') || ''
    if (!token) {
      syncRun.set('status', 'failed')
      syncRun.set('finished_at', new Date().toISOString())
      syncRun.set('error_message', 'Secret MAXIPROD_TOKEN não cadastrado neste backend.')
      $app.save(syncRun)
      return e.json(424, {
        ok: false,
        code: 'MAXIPROD_TOKEN_MISSING',
        message:
          'A integração está preparada, mas o secret MAXIPROD_TOKEN ainda não foi cadastrado no Compass 2.0.',
        sync_run_id: syncRun.id,
      })
    }

    try {
      $app.findRecordById('planning_cycles', cycleId)

      const cnpjs = ['33518000000137', '33518000000218', '51743790000136', '45758498000194']
      const cnpjFilter = '"' + cnpjs.join('","') + '"'
      const queryBase =
        '{itensDosPedidosDeVendas(take:2000,skip:SKIP,where:{pedidoDeVenda:{estado:{eq:APROVADO},minhaEmpresa:{cnpjOuCpf:{in:[' +
        cnpjFilter +
        ']}}}}){items{id,quantidade,quantidadeAFaturar,quantidadeFaturada,valorUnitario,entregaData,entregaPrevisaoData,descricao,item{codigo,descricao},pedidoDeVenda{numero,cliente{apelido},minhaEmpresa{apelido,cnpjOuCpf}}}}}'
      const maxiprodItems = []
      let skip = 0
      let rowsRead = 0
      let skippedNoDate = 0
      let skippedZeroBalance = 0

      while (true) {
        const query = queryBase.replace('SKIP', String(skip))
        const response = $http.send({
          url: 'https://api.maxiprod.com.br/graphql/',
          method: 'POST',
          headers: {
            Authorization: 'basic ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: query }),
          timeout: 60,
        })
        if (response.statusCode < 200 || response.statusCode >= 300) {
          syncRun.set('status', 'failed')
          syncRun.set('finished_at', new Date().toISOString())
          syncRun.set(
            'error_message',
            'MaxiProd retornou HTTP ' + String(response.statusCode) + '.',
          )
          $app.save(syncRun)
          return e.json(502, { ok: false, code: 'MAXIPROD_HTTP_ERROR', sync_run_id: syncRun.id })
        }

        const payload = response.json || JSON.parse(new TextDecoder().decode(response.body))
        if (payload.errors && payload.errors.length) {
          syncRun.set('status', 'failed')
          syncRun.set('finished_at', new Date().toISOString())
          syncRun.set('error_message', 'MaxiProd GraphQL retornou erro de consulta.')
          $app.save(syncRun)
          return e.json(502, { ok: false, code: 'MAXIPROD_GRAPHQL_ERROR', sync_run_id: syncRun.id })
        }

        const page =
          (payload.data &&
            payload.data.itensDosPedidosDeVendas &&
            payload.data.itensDosPedidosDeVendas.items) ||
          []
        rowsRead += page.length
        for (const item of page) maxiprodItems.push(item)
        if (page.length < 2000) break
        skip += 2000
      }

      const isoWeek = (date) => {
        const work = new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
        )
        const day = (work.getUTCDay() + 6) % 7
        work.setUTCDate(work.getUTCDate() - day + 3)
        const firstThursday = work.getTime()
        const firstWeek = new Date(Date.UTC(work.getUTCFullYear(), 0, 4))
        const week = 1 + Math.round((firstThursday - firstWeek.getTime()) / 604800000)
        return String(work.getUTCFullYear()) + '-W' + (week < 10 ? '0' : '') + String(week)
      }

      const nowBrt = new Date(Date.now() - 10800000)
      const currentMonday = new Date(
        Date.UTC(nowBrt.getUTCFullYear(), nowBrt.getUTCMonth(), nowBrt.getUTCDate()),
      )
      currentMonday.setUTCDate(currentMonday.getUTCDate() - ((currentMonday.getUTCDay() + 6) % 7))

      const existing = $app.findRecordsByFilter(
        'planning_items',
        'cycle_id = "' + cycleId + '"',
        '',
        5000,
        0,
      )
      const byExternalKey = {}
      for (const record of existing) byExternalKey[record.getString('external_key')] = record
      const planningCollection = $app.findCollectionByNameOrId('planning_items')
      let rowsCreated = 0
      let rowsUpdated = 0
      const seenKeys = {}

      for (const item of maxiprodItems) {
        const balance = Number(item.quantidadeAFaturar || 0)
        if (balance <= 0) {
          skippedZeroBalance += 1
          continue
        }
        const product = item.item || {}
        const pv = item.pedidoDeVenda || {}
        const company = pv.minhaEmpresa || {}
        // Regra validada 25/09: item com NF parcial (quantidadeFaturada>0) tem entregaData
        // travada na data original no ERP -> usa a previsao; item sem NF -> entregaData.
        const edRaw = String(item.entregaData || '').slice(0, 10)
        const pdRaw = String(item.entregaPrevisaoData || '').slice(0, 10)
        const qtdFaturada = Number(item.quantidadeFaturada || 0)
        const rawDate = qtdFaturada > 0 && pdRaw ? pdRaw : edRaw || pdRaw
        if (!rawDate) {
          skippedNoDate += 1
          continue
        }
        const deliveryDate = new Date(rawDate + 'T00:00:00Z')
        if (isNaN(deliveryDate.getTime())) {
          skippedNoDate += 1
          continue
        }
        const companyCnpj = String(company.cnpjOuCpf || '')
        const externalKey =
          companyCnpj + '|' + String(pv.numero || '') + '|' + String(item.id || '')
        const productCode = String(product.codigo || '')
        const productName = String(product.descricao || item.descricao || '')
        const unitValue = Number(item.valorUnitario || 0)
        const isFreight = productCode === '00043' || productCode.indexOf('50') === 0
        const plannedWeek = deliveryDate < currentMonday ? 'ATRASADO' : isoWeek(deliveryDate)
        const values = {
          cycle_id: cycleId,
          external_key: externalKey,
          product_code: productCode || '?',
          product_name: productName,
          pv_number: String(pv.numero || ''),
          client_name: String((pv.cliente || {}).apelido || ''),
          company_name: String(company.apelido || companyCnpj),
          delivery_date: rawDate + ' 00:00:00.000Z',
          planned_week: plannedWeek,
          quantity: Math.round(balance),
          unit_value: unitValue,
          total_value: balance * unitValue,
          source_system: 'maxiprod',
          source_record_id: String(item.id || ''),
          is_freight: isFreight,
        }
        seenKeys[externalKey] = true
        let record = byExternalKey[externalKey]
        if (!record) {
          record = new Record(planningCollection)
          record.set('status', 'pending')
          record.set('produced_quantity', 0)
          rowsCreated += 1
        } else {
          rowsUpdated += 1
        }
        for (const field in values) record.set(field, values[field])
        $app.save(record)
      }

      syncRun.set('status', 'succeeded')
      syncRun.set('finished_at', new Date().toISOString())
      syncRun.set('rows_read', rowsRead)
      syncRun.set('rows_created', rowsCreated)
      syncRun.set('rows_updated', rowsUpdated)
      syncRun.set('rows_removed', 0)
      syncRun.set('parameters', {
        read_only: true,
        cnpjs: cnpjs,
        delivery_date_source: 'item.entregaData or item.entregaPrevisaoData',
        skipped_zero_balance: skippedZeroBalance,
        skipped_without_delivery_date: skippedNoDate,
        not_seen_records_are_preserved: true,
      })
      $app.save(syncRun)
      return e.json(200, {
        ok: true,
        sync_run_id: syncRun.id,
        rows_read: rowsRead,
        rows_created: rowsCreated,
        rows_updated: rowsUpdated,
        rows_removed: 0,
        skipped_zero_balance: skippedZeroBalance,
        skipped_without_delivery_date: skippedNoDate,
        read_only: true,
      })
    } catch (error) {
      syncRun.set('status', 'failed')
      syncRun.set('finished_at', new Date().toISOString())
      syncRun.set('error_message', 'Falha controlada na sincronização MaxiProd.')
      $app.save(syncRun)
      $app
        .logger()
        .error(
          'Compass 2.0 MaxiProd sync failed',
          'sync_run_id',
          syncRun.id,
          'error',
          String(error),
        )
      return e.json(500, { ok: false, code: 'SYNC_FAILED', sync_run_id: syncRun.id })
    }
  },
  $apis.requireAuth(),
)
