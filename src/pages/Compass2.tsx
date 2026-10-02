import { useEffect, useMemo, useState, type FormEvent } from 'react'
import pb from '@/lib/pocketbase/client'
import {
  createPlanningCycle,
  createPlanningItem,
  createProductionDeclaration,
  listPlanningCycles,
  listPlanningItems,
  listProductionDeclarations,
  listReprogrammingEvents,
  listSmktAllocations,
  listSmktEntradas,
  listSyncRuns,
  listFaturamentoNfs,
  createSmktAllocation,
  createSmktEntrada,
  recordReprogrammingEvent,
  syncMaxiProd,
  type FaturamentoNf,
  type PlanningCycle,
  type PlanningItem,
  type ProductionDeclaration,
  type ReprogrammingEvent,
  type SmktAllocation,
  type SmktEntrada,
  type SyncRun,
} from '@/services/compass2'

const emptyCycle = { name: '', start_date: '', end_date: '', notes: '' }
const emptyDeclaration = {
  production_date: '',
  product_code: '',
  product_name: '',
  quantity: '1',
  notes: '',
}
const emptyItem = {
  external_key: '',
  product_code: '',
  product_name: '',
  pv_number: '',
  client_name: '',
  company_name: '',
  delivery_date: '',
  planned_week: '',
  quantity: '1',
  unit_value: '0',
  notes: '',
}
const emptyEvent = { external_key: '', reason: '', field: 'delivery_date', before: '', after: '' }

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
}

// Fretes NÃO são produtos: não aparecem como opção de baixa do Supermercado.
// Mesma regra dos relatórios: 00043, 501-506, palavras de veículo (exceto carrinho/cart/carro).
function isFreightRow(row: PlanningItem) {
  const code = (row.product_code || '').trim()
  const desc = `${row.product_name || ''}`.toLowerCase()
  if (row.is_freight) return true
  if (code === '00043') return true
  if (/^50[1-6]-/.test(code)) return true
  const pal = ['frete', 'caminhao', 'caminhão', 'vuc', 'carreta', 'toco', 'truck']
  const exc = ['carrinho', 'cart', 'carro']
  const hasPal = pal.some((p) => desc.includes(p))
  const hasExc = exc.some((e) => desc.includes(e))
  return hasPal && !hasExc
}

function dateLabel(value?: string) {
  if (!value) return '—'
  const [year, month, day] = value.slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function money(value = 0) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Compass2() {
  const [authenticated, setAuthenticated] = useState(pb.authStore.isValid)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cycles, setCycles] = useState<PlanningCycle[]>([])
  const [cycleId, setCycleId] = useState('')
  const [items, setItems] = useState<PlanningItem[]>([])
  const [declarations, setDeclarations] = useState<ProductionDeclaration[]>([])
  const [events, setEvents] = useState<ReprogrammingEvent[]>([])
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([])
  const [smktAllocs, setSmktAllocs] = useState<SmktAllocation[]>([])
  const [nfs, setNfs] = useState<FaturamentoNf[]>([])
  const [weekTab, setWeekTab] = useState('')
  const [smktForm, setSmktForm] = useState({
    product_code: '',
    pv_number: '',
    quantity: '1',
    nf_number: '',
    notes: '',
  })
  const [smktEntradas, setSmktEntradas] = useState<SmktEntrada[]>([])
  const [smktEntradaForm, setSmktEntradaForm] = useState({
    product_code: '',
    product_name: '',
    quantity: '1',
    data: '',
    notes: '',
  })
  const [pvQuery, setPvQuery] = useState('')
  const [cycleForm, setCycleForm] = useState(emptyCycle)
  const [declarationForm, setDeclarationForm] = useState(emptyDeclaration)
  const [itemForm, setItemForm] = useState(emptyItem)
  const [eventForm, setEventForm] = useState(emptyEvent)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selectedCycle = cycles.find((cycle) => cycle.id === cycleId)
  const pendingQuantity = useMemo(
    () => items.reduce((total, item) => total + item.quantity - (item.produced_quantity || 0), 0),
    [items],
  )
  const pendingValue = useMemo(
    () =>
      items.reduce(
        (total, item) =>
          total +
          Math.max(
            0,
            (item.total_value || 0) - (item.produced_quantity || 0) * (item.unit_value || 0),
          ),
        0,
      ),
    [items],
  )
  const declaredQuantity = declarations.reduce((total, row) => total + row.quantity, 0)

  // ── SMKT — entradas manuais agrupadas por produto ──
  const smktEntradaGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        code: string
        name: string
        qty: number
        valor: number
        registros: number
        rows: SmktEntrada[]
      }
    >()
    for (const entrada of smktEntradas) {
      const key = entrada.product_code || '—'
      const cur = groups.get(key) || {
        code: key,
        name: entrada.product_name || '',
        qty: 0,
        valor: 0,
        registros: 0,
        rows: [],
      }
      cur.qty += entrada.quantity
      cur.valor += entrada.quantity * (entrada.unit_value || 0)
      cur.registros += 1
      cur.rows.push(entrada)
      groups.set(key, cur)
    }
    return Array.from(groups.values()).sort((a, b) => b.valor - a.valor)
  }, [smktEntradas])

  // ── Semanas (visão de reagendamento) ──
  const weekGroups = useMemo(() => {
    const groups = new Map<string, PlanningItem[]>()
    for (const row of items) {
      const key = row.planned_week || '—'
      const list = groups.get(key) || []
      list.push(row)
      groups.set(key, list)
    }
    const order = (week: string) => (week === 'ATRASADO' ? '0' : week)
    return Array.from(groups.entries())
      .sort((a, b) => order(a[0]).localeCompare(order(b[0])))
      .map(([week, rows]) => {
        const total = rows.reduce((sum, row) => sum + (row.total_value || 0), 0)
        const qty = rows.reduce((sum, row) => sum + row.quantity, 0)
        const pvs = new Set(rows.map((row) => `${row.pv_number}|${row.company_name}`)).size
        return { week, rows, total, qty, pvs }
      })
  }, [items])

  // ── Faturamento (NFs emitidas, sync a cada 15 min) ──
  const fatMetrics = useMemo(() => {
    const brt = new Date(Date.now() - 3 * 3600 * 1000)
    const curY = brt.getUTCFullYear()
    const curM = brt.getUTCMonth() + 1
    const mesPrefix = `${curY}-${String(curM).padStart(2, '0')}`
    const mesNfs = nfs.filter((row) => row.issue_day.startsWith(mesPrefix))
    const mesValor = mesNfs.reduce((sum, row) => sum + (row.total_value || 0), 0)
    const anoValor = nfs.reduce((sum, row) => sum + (row.total_value || 0), 0)
    const byDay = new Map<string, { qtd: number; valor: number }>()
    for (const row of mesNfs) {
      const day = row.issue_day
      const cur = byDay.get(day) || { qtd: 0, valor: 0 }
      cur.qtd += 1
      cur.valor += row.total_value || 0
      byDay.set(day, cur)
    }
    const daily = Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, v]) => ({ day, ...v }))
    const byMonth = new Map<string, { qtd: number; valor: number }>()
    for (const row of nfs) {
      const mk = row.issue_day.slice(0, 7)
      const cur = byMonth.get(mk) || { qtd: 0, valor: 0 }
      cur.qtd += 1
      cur.valor += row.total_value || 0
      byMonth.set(mk, cur)
    }
    const monthly = Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, ...v }))
    const diasUteis = (ini: string, fim: string) => {
      let n = 0
      const d = new Date(`${ini}T00:00:00Z`)
      const e = new Date(`${fim}T00:00:00Z`)
      while (d <= e) {
        const wd = d.getUTCDay()
        if (wd > 0 && wd < 6) n += 1
        d.setUTCDate(d.getUTCDate() + 1)
      }
      return n
    }
    const hoje = brt.toISOString().slice(0, 10)
    const mesDu = diasUteis(`${mesPrefix}-01`, hoje)
    const anoDu = diasUteis(`${curY}-01-01`, hoje)
    return {
      mesLabel: `${String(curM).padStart(2, '0')}/${curY}`,
      mesQtd: mesNfs.length,
      mesValor,
      anoQtd: nfs.length,
      anoValor,
      daily,
      monthly,
      mediaDiaUtilMes: mesDu ? Math.round(mesValor / mesDu) : 0,
      mediaDiaUtilAno: anoDu ? Math.round(anoValor / anoDu) : 0,
    }
  }, [nfs])

  async function loadCycle(nextCycleId: string) {
    if (!nextCycleId) {
      setItems([])
      setDeclarations([])
      setEvents([])
      setSyncRuns([])
      setSmktAllocs([])
      setNfs([])
      setSmktEntradas([])
      return
    }
    const [
      nextItems,
      nextDeclarations,
      nextEvents,
      nextSyncRuns,
      nextAllocs,
      nextNfs,
      nextEntradas,
    ] = await Promise.all([
      listPlanningItems(nextCycleId),
      listProductionDeclarations(nextCycleId),
      listReprogrammingEvents(nextCycleId),
      listSyncRuns(nextCycleId),
      listSmktAllocations(nextCycleId),
      listFaturamentoNfs().catch(() => [] as FaturamentoNf[]),
      listSmktEntradas(nextCycleId),
    ])
    setItems(nextItems)
    setDeclarations(nextDeclarations)
    setEvents(nextEvents)
    setSyncRuns(nextSyncRuns)
    setSmktAllocs(nextAllocs)
    setNfs(nextNfs)
    setSmktEntradas(nextEntradas)
  }

  async function loadWorkspace(preferredCycleId?: string) {
    const nextCycles = await listPlanningCycles()
    setCycles(nextCycles)
    // Default: ciclo operacional aberto mais recente (nao o de homologacao/draft)
    const openCycle = nextCycles
      .filter((cycle) => cycle.status === 'open')
      .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))[0]
    const nextCycleId = preferredCycleId || cycleId || openCycle?.id || nextCycles[0]?.id || ''
    setCycleId(nextCycleId)
    await loadCycle(nextCycleId)
  }

  useEffect(() => {
    if (pb.authStore.isValid)
      void loadWorkspace().catch((loadError) => setError(errorMessage(loadError)))
  }, [])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await pb.collection('users').authWithPassword(email, password)
      setAuthenticated(true)
      await loadWorkspace()
      setNotice('Backend conectado. Esta tela ainda não escreve no MaxiProd.')
    } catch (loginError) {
      setError(errorMessage(loginError))
    } finally {
      setBusy(false)
    }
  }

  function logout() {
    pb.authStore.clear()
    setAuthenticated(false)
    setCycles([])
    setCycleId('')
    setItems([])
    setDeclarations([])
    setEvents([])
    setSyncRuns([])
    setSmktAllocs([])
    setNfs([])
    setSmktEntradas([])
  }

  async function createCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const created = await createPlanningCycle(cycleForm)
      setCycleForm(emptyCycle)
      setNotice('Ciclo persistido no backend.')
      await loadWorkspace(created.id)
    } catch (createError) {
      setError(errorMessage(createError))
    } finally {
      setBusy(false)
    }
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cycleId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await createPlanningItem({
        cycle_id: cycleId,
        external_key: itemForm.external_key,
        product_code: itemForm.product_code,
        product_name: itemForm.product_name,
        pv_number: itemForm.pv_number,
        client_name: itemForm.client_name,
        company_name: itemForm.company_name,
        delivery_date: itemForm.delivery_date,
        planned_week: itemForm.planned_week,
        quantity: Number(itemForm.quantity),
        unit_value: Number(itemForm.unit_value),
        notes: itemForm.notes,
      })
      setItemForm(emptyItem)
      setNotice('Item de planejamento persistido no ciclo.')
      await loadCycle(cycleId)
    } catch (createError) {
      setError(errorMessage(createError))
    } finally {
      setBusy(false)
    }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cycleId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await recordReprogrammingEvent({
        cycle_id: cycleId,
        event_type: 'scenario',
        occurred_at: new Date().toISOString(),
        reason: eventForm.reason,
        changes: {
          external_key: eventForm.external_key,
          field: eventForm.field,
          before: eventForm.before,
          after: eventForm.after,
        },
        before_snapshot: {
          external_key: eventForm.external_key,
          field: eventForm.field,
          value: eventForm.before,
        },
      })
      setEventForm(emptyEvent)
      setNotice(
        'Reprogramação registrada no histórico auditável. Nenhuma data foi alterada no MaxiProd.',
      )
      await loadCycle(cycleId)
    } catch (createError) {
      setError(errorMessage(createError))
    } finally {
      setBusy(false)
    }
  }

  async function syncCycle() {
    if (!cycleId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await syncMaxiProd(cycleId)
      if (!result.ok) {
        setNotice(result.message || 'Sincronização não executada.')
      } else {
        setNotice(
          `Sincronização somente leitura concluída: ${result.rows_created || 0} novos, ${result.rows_updated || 0} atualizados.`,
        )
      }
      await loadCycle(cycleId)
    } catch (syncError) {
      setError(errorMessage(syncError))
      await loadCycle(cycleId).catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  async function createDeclaration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cycleId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await createProductionDeclaration({
        cycle_id: cycleId,
        production_date: declarationForm.production_date,
        product_code: declarationForm.product_code,
        product_name: declarationForm.product_name,
        quantity: Number(declarationForm.quantity),
        notes: declarationForm.notes,
      })
      setDeclarationForm(emptyDeclaration)
      setNotice('Produção declarada persistida como cenário operacional.')
      await loadCycle(cycleId)
    } catch (createError) {
      setError(errorMessage(createError))
    } finally {
      setBusy(false)
    }
  }

  async function createAlloc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cycleId) return
    const item = items.find((row) => row.product_code === smktForm.product_code)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await createSmktAllocation({
        cycle_id: cycleId,
        product_code: smktForm.product_code,
        product_name: item?.product_name || smktForm.product_code,
        pv_number: smktForm.pv_number,
        client_name: item?.client_name || '',
        quantity: Number(smktForm.quantity),
        nf_number: smktForm.nf_number,
        notes: smktForm.notes,
      })
      setSmktForm({ product_code: '', pv_number: '', quantity: '1', nf_number: '', notes: '' })
      setNotice('Baixa do Supermercado persistida: PV + NF registrados no histórico auditável.')
      await loadCycle(cycleId)
    } catch (allocError) {
      setError(errorMessage(allocError))
    } finally {
      setBusy(false)
    }
  }

  async function createEntrada(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cycleId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await createSmktEntrada({
        cycle_id: cycleId,
        product_code: smktEntradaForm.product_code,
        product_name: smktEntradaForm.product_name,
        quantity: Number(smktEntradaForm.quantity),
        data: smktEntradaForm.data,
        notes: smktEntradaForm.notes,
      })
      setSmktEntradaForm({ product_code: '', product_name: '', quantity: '1', data: '', notes: '' })
      setNotice('Entrada manual no Supermercado persistida no histórico auditável.')
      await loadCycle(cycleId)
    } catch (entradaError) {
      setError(errorMessage(entradaError))
    } finally {
      setBusy(false)
    }
  }

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">
            Dlean · Compass 2.1
          </p>
          <h1 className="mt-3 text-3xl font-bold">Entrar no workspace</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            O Andon (painel provisório) continua no link original. Esta rota é o workspace
            definitivo de planejamento.
          </p>
          <form className="mt-8 space-y-4" onSubmit={login}>
            <label className="block text-sm text-slate-300">
              E-mail
              <input
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-cyan-400"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="block text-sm text-slate-300">
              Senha
              <input
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-cyan-400"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error && (
              <p className="rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">
                {error}
              </p>
            )}
            <button
              className="w-full rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-60"
              disabled={busy}
              type="submit"
            >
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">
              Dlean · Compass 2.1
            </p>
            <h1 className="mt-1 text-2xl font-bold">Planejamento operacional</h1>
            <p className="mt-1 text-sm text-slate-400">
              Produto · batelada · semana · realizado · exceções
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-emerald-800 bg-emerald-950/50 px-3 py-1 text-xs text-emerald-300 sm:inline-flex">
              ● Backend conectado
            </span>
            <button
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              onClick={logout}
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {notice}
          </div>
        )}
        <section className="grid gap-4 md:grid-cols-3">
          <Metric label="Ciclos persistidos" value={cycles.length} note="janelas operacionais" />
          <Metric
            label="Itens no ciclo"
            value={items.length}
            note={`${pendingQuantity} unidades pendentes · ${money(pendingValue)}`}
          />
          <Metric
            label="Produção declarada"
            value={declaredQuantity}
            note={`${declarations.length} declarações no ciclo`}
          />
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionTitle
            eyebrow="Reagendamento"
            title="Entregas por semana"
            tag="itens do ciclo · somente leitura"
          />
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Itens agrupados pela semana planejada (data de entrega no nível do item, fonte
            MaxiProd). Atrasado = entrega anterior à semana corrente. Clique numa semana para ver os
            itens.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {weekGroups.map((group) => (
              <button
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  weekTab === group.week
                    ? 'border-cyan-700 bg-cyan-700 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
                key={group.week}
                onClick={() => setWeekTab(weekTab === group.week ? '' : group.week)}
                type="button"
              >
                {group.week === 'ATRASADO' ? 'Atrasado' : group.week.replace('2026-W', 'S')} ·{' '}
                {money(group.total)}
              </button>
            ))}
            {weekGroups.length === 0 && (
              <span className="text-sm text-slate-500">Nenhum item no ciclo.</span>
            )}
          </div>
          {weekTab && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Produto</th>
                    <th className="px-2 py-2">PV</th>
                    <th className="px-2 py-2">Cliente</th>
                    <th className="px-2 py-2">Empresa</th>
                    <th className="px-2 py-2">Entrega</th>
                    <th className="px-2 py-2">Qtd.</th>
                    <th className="px-2 py-2">Valor</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(weekGroups.find((group) => group.week === weekTab)?.rows || []).map((row) => (
                    <tr className="border-b border-slate-100" key={row.id}>
                      <td className="px-2 py-2">
                        <strong className="font-mono">{row.product_code}</strong>{' '}
                        <span className="text-slate-500">{row.product_name}</span>
                      </td>
                      <td className="px-2 py-2 font-semibold">{row.pv_number || '—'}</td>
                      <td className="px-2 py-2">{row.client_name || '—'}</td>
                      <td className="px-2 py-2">{row.company_name}</td>
                      <td className="px-2 py-2">{dateLabel(row.delivery_date)}</td>
                      <td className="px-2 py-2">{row.quantity}</td>
                      <td className="px-2 py-2">{money(row.total_value || 0)}</td>
                      <td className="px-2 py-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5">{row.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionTitle
            eyebrow="Faturamento"
            title="NFs emitidas — atualização a cada 15 min"
            tag="somente leitura · MaxiProd"
          />
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <Metric
              label={`Mês ${fatMetrics.mesLabel}`}
              value={fatMetrics.mesValor}
              note={`${fatMetrics.mesQtd} NFs · média ${money(fatMetrics.mediaDiaUtilMes)}/dia útil`}
            />
            <Metric
              label={`Acumulado ${fatMetrics.mesLabel.slice(3)}`}
              value={fatMetrics.anoValor}
              note={`${fatMetrics.anoQtd} NFs · média ${money(fatMetrics.mediaDiaUtilAno)}/dia útil`}
            />
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
              <p className="text-sm text-slate-500">
                Faturamento por mês — {fatMetrics.mesLabel.slice(3)}
              </p>
              <div className="mt-3 space-y-1.5">
                {fatMetrics.monthly.map((month) => {
                  const max = Math.max(...fatMetrics.monthly.map((m) => m.valor), 1)
                  return (
                    <div className="flex items-center gap-2 text-xs" key={month.month}>
                      <span className="w-12 shrink-0 text-slate-500">
                        {month.month.slice(5)}/{month.month.slice(0, 4)}
                      </span>
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-3 rounded-full bg-blue-600"
                          style={{ width: `${Math.max(2, (100 * month.valor) / max)}%` }}
                        />
                      </div>
                      <span className="w-24 shrink-0 text-right font-semibold">
                        {money(month.valor)}
                      </span>
                      <span className="w-12 shrink-0 text-right text-slate-500">
                        {month.qtd} NF
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2">NF</th>
                  <th className="px-2 py-2">Data</th>
                  <th className="px-2 py-2">Empresa</th>
                  <th className="px-2 py-2">Cliente</th>
                  <th className="px-2 py-2">Destino</th>
                  <th className="px-2 py-2">Valor</th>
                </tr>
              </thead>
              <tbody>
                {nfs.slice(0, 25).map((row) => (
                  <tr
                    className="border-b border-slate-100"
                    key={`${row.company_cnpj}-${row.nf_number}`}
                  >
                    <td className="px-2 py-2 font-semibold">{row.nf_number}</td>
                    <td className="px-2 py-2">{dateLabel(row.issue_day)}</td>
                    <td className="px-2 py-2">{row.company_name}</td>
                    <td className="px-2 py-2">{row.client_name || '—'}</td>
                    <td className="px-2 py-2">
                      {row.city ? `${row.city}${row.uf ? `/${row.uf}` : ''}` : '—'}
                    </td>
                    <td className="px-2 py-2 font-semibold">{money(row.total_value || 0)}</td>
                  </tr>
                ))}
                {nfs.length === 0 && (
                  <tr>
                    <td className="px-2 py-5 text-center text-slate-500" colSpan={6}>
                      Nenhuma NF carregada ainda — o sync a cada 15 min popula esta lista.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle eyebrow="Camada 1" title="Ciclo de planejamento" tag="persistido" />
            <form className="mt-5 space-y-3" onSubmit={createCycle}>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                placeholder="Nome — ex.: Semana 40 / WARD"
                value={cycleForm.name}
                onChange={(event) => setCycleForm({ ...cycleForm, name: event.target.value })}
                required
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <DateInput
                  label="Início"
                  value={cycleForm.start_date}
                  onChange={(value) => setCycleForm({ ...cycleForm, start_date: value })}
                />
                <DateInput
                  label="Fim"
                  value={cycleForm.end_date}
                  onChange={(value) => setCycleForm({ ...cycleForm, end_date: value })}
                />
              </div>
              <textarea
                className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                placeholder="Premissas e observações"
                value={cycleForm.notes}
                onChange={(event) => setCycleForm({ ...cycleForm, notes: event.target.value })}
              />
              <button
                className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                disabled={busy}
                type="submit"
              >
                Criar ciclo
              </button>
            </form>
            <label className="mt-6 block border-t border-slate-200 pt-5 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Ciclo ativo
              <select
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900"
                value={cycleId}
                onChange={(event) => {
                  setCycleId(event.target.value)
                  void loadCycle(event.target.value).catch((loadError) =>
                    setError(errorMessage(loadError)),
                  )
                }}
              >
                <option value="">Selecione um ciclo</option>
                {cycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.name} · {dateLabel(cycle.start_date)}–{dateLabel(cycle.end_date)}
                  </option>
                ))}
              </select>
            </label>
            {selectedCycle && (
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                <div className="flex justify-between">
                  <span>Status</span>
                  <strong className="text-slate-900">{selectedCycle.status}</strong>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>Origem</span>
                  <strong className="text-slate-900">{selectedCycle.source}</strong>
                </div>
                <button
                  className="mt-4 w-full rounded-lg border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-60"
                  disabled={busy}
                  onClick={() => void syncCycle()}
                  type="button"
                >
                  {busy ? 'Sincronizando…' : 'Sincronizar MaxiProd — somente leitura'}
                </button>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Lê PVs aprovados e saldo por item. Não altera datas, OPs, estoque ou faturamento.
                </p>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle eyebrow="Camada 2" title="Produção declarada" tag="sem efeito no ERP" />
            {!cycleId ? (
              <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                Crie ou selecione um ciclo para registrar produção.
              </p>
            ) : (
              <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={createDeclaration}>
                <DateInput
                  label="Data de produção"
                  value={declarationForm.production_date}
                  onChange={(value) =>
                    setDeclarationForm({ ...declarationForm, production_date: value })
                  }
                />
                <NumberInput
                  label="Quantidade"
                  value={declarationForm.quantity}
                  onChange={(value) => setDeclarationForm({ ...declarationForm, quantity: value })}
                />
                <TextInput
                  label="Código do produto"
                  value={declarationForm.product_code}
                  placeholder="ex.: 404-0001"
                  onChange={(value) =>
                    setDeclarationForm({ ...declarationForm, product_code: value })
                  }
                  required
                />
                <TextInput
                  label="Produto"
                  value={declarationForm.product_name}
                  placeholder="ex.: Berenice"
                  onChange={(value) =>
                    setDeclarationForm({ ...declarationForm, product_name: value })
                  }
                />
                <textarea
                  className="min-h-20 rounded-lg border border-slate-300 px-3 py-2.5 text-sm sm:col-span-2"
                  placeholder="Motivo ou observação"
                  value={declarationForm.notes}
                  onChange={(event) =>
                    setDeclarationForm({ ...declarationForm, notes: event.target.value })
                  }
                />
                <button
                  className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60 sm:col-span-2"
                  disabled={busy}
                  type="submit"
                >
                  Registrar produção declarada
                </button>
              </form>
            )}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Metric
                label="Saldo pendente importado"
                value={pendingQuantity}
                note={money(pendingValue)}
              />
              <Metric
                label="Declarações no ciclo"
                value={declarations.length}
                note="cenário operacional"
              />
            </div>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionTitle
            eyebrow="Registro auditável"
            title="Produção declarada no ciclo"
            tag="manual → Pulso depois"
          />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Produto</th>
                  <th className="px-3 py-2">Qtd.</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Observação</th>
                </tr>
              </thead>
              <tbody>
                {declarations.map((row) => (
                  <tr className="border-b border-slate-100" key={row.id}>
                    <td className="px-3 py-3">{dateLabel(row.production_date)}</td>
                    <td className="px-3 py-3 font-mono text-xs">{row.product_code}</td>
                    <td className="px-3 py-3">{row.quantity}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                        {row.status}
                      </span>
                    </td>
                    <td className="max-w-xs truncate px-3 py-3 text-slate-500">
                      {row.notes || '—'}
                    </td>
                  </tr>
                ))}
                {declarations.length === 0 && (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-500" colSpan={6}>
                      Nenhuma produção declarada neste ciclo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionTitle
            eyebrow="Camada 2.1"
            title="Supermercado — entrada manual de estoque"
            tag="histórico auditável"
          />
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Registra a entrada de produto pronto no Supermercado (produção alocada direto ou ajuste
            manual). Fica no histórico auditável — não movimenta o MaxiProd.
          </p>
          {!cycleId ? (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Selecione um ciclo para registrar a entrada.
            </p>
          ) : (
            <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={createEntrada}>
              <label className="text-xs font-medium text-slate-600">
                Produto (catálogo do ciclo)
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={smktEntradaForm.product_code}
                  onChange={(event) => {
                    const code = event.target.value
                    const sample = items.find((row) => row.product_code === code)
                    setSmktEntradaForm({
                      ...smktEntradaForm,
                      product_code: code,
                      product_name: sample?.product_name || '',
                      unit_value:
                        sample?.unit_value != null
                          ? String(sample.unit_value)
                          : smktEntradaForm.unit_value,
                    })
                  }}
                  required
                >
                  <option value="">— escolha o produto —</option>
                  {Array.from(
                    new Set(
                      items.filter((row) => !isFreightRow(row)).map((row) => row.product_code),
                    ),
                  )
                    .sort()
                    .map((code) => {
                      const sample = items.find((row) => row.product_code === code)
                      return (
                        <option key={code} value={code}>
                          {code} · {(sample?.product_name || '').slice(0, 40)}
                        </option>
                      )
                    })}
                </select>
              </label>
              <NumberInput
                label="Quantidade"
                value={smktEntradaForm.quantity}
                onChange={(value) => setSmktEntradaForm({ ...smktEntradaForm, quantity: value })}
              />
              <NumberInput
                label="Valor unitário (R$)"
                value={smktEntradaForm.unit_value}
                onChange={(value) => setSmktEntradaForm({ ...smktEntradaForm, unit_value: value })}
              />
              <label className="text-xs font-medium text-slate-600">
                Data da entrada
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  type="date"
                  value={smktEntradaForm.data}
                  onChange={(event) =>
                    setSmktEntradaForm({ ...smktEntradaForm, data: event.target.value })
                  }
                />
              </label>
              <TextInput
                label="Observação (opcional)"
                value={smktEntradaForm.notes}
                placeholder="ex.: produção de terça não declarada"
                onChange={(value) => setSmktEntradaForm({ ...smktEntradaForm, notes: value })}
              />
              <button
                className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60 sm:col-span-2"
                disabled={busy}
                type="submit"
              >
                Registrar entrada no Supermercado
              </button>
            </form>
          )}
          <div className="mt-6 space-y-2">
            {smktEntradaGroups.map((group) => {
              const open = smktEntradaOpen === group.code
              return (
                <div key={group.code} className="rounded-xl border border-slate-200">
                  <button
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
                    onClick={() => setSmktEntradaOpen(open ? '' : group.code)}
                    type="button"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400">{open ? '▾' : '▸'}</span>
                      <strong className="font-mono">{group.code}</strong>
                      <span className="text-slate-500">{group.name}</span>
                    </span>
                    <span className="flex items-center gap-4 text-xs">
                      <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                        {group.registros} entrada(s)
                      </span>
                      <span className="font-semibold text-slate-700">{group.qty} un</span>
                      <span className="font-semibold text-slate-900">{money(group.valor)}</span>
                    </span>
                  </button>
                  {open && (
                    <table className="w-full min-w-[640px] text-left text-xs">
                      <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-2">Data da entrada</th>
                          <th className="px-4 py-2">Qtd.</th>
                          <th className="px-4 py-2">V. unitário</th>
                          <th className="px-4 py-2">V. total</th>
                          <th className="px-4 py-2">Observação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((entrada) => (
                          <tr className="border-b border-slate-100" key={entrada.id}>
                            <td className="px-4 py-2">{dateLabel(entrada.data || undefined)}</td>
                            <td className="px-4 py-2 font-semibold">{entrada.quantity}</td>
                            <td className="px-4 py-2">{money(entrada.unit_value)}</td>
                            <td className="px-4 py-2">
                              {money(entrada.quantity * entrada.unit_value)}
                            </td>
                            <td className="px-4 py-2 text-slate-500">{entrada.reason || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })}
            {smktEntradas.length === 0 && (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                Nenhuma entrada manual registrada neste ciclo.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionTitle
            eyebrow="Camada 2.1.1"
            title="Supermercado — baixa de produto pronto"
            tag="PV + NF registrados"
          />
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Registra a saída do produto pronto do Supermercado para um PV. A baixa fica no histórico
            auditável com o nº da NF — a baixa no MaxiProd continua sendo o fluxo próprio de NF.
          </p>
          {!cycleId ? (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Selecione um ciclo para registrar a baixa.
            </p>
          ) : (
            <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={createAlloc}>
              <label className="text-xs font-medium text-slate-600">
                Produto (catálogo do ciclo)
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={smktForm.product_code}
                  onChange={(event) =>
                    setSmktForm({ ...smktForm, product_code: event.target.value })
                  }
                  required
                >
                  <option value="">— escolha o produto —</option>
                  {Array.from(
                    new Set(
                      items.filter((row) => !isFreightRow(row)).map((row) => row.product_code),
                    ),
                  )
                    .sort()
                    .map((code) => {
                      const sample = items.find((row) => row.product_code === code)
                      return (
                        <option key={code} value={code}>
                          {code} · {(sample?.product_name || '').slice(0, 40)}
                        </option>
                      )
                    })}
                </select>
              </label>
              <TextInput
                label="PV de destino"
                value={smktForm.pv_number}
                placeholder="ex.: 549"
                onChange={(value) => setSmktForm({ ...smktForm, pv_number: value })}
                required
              />
              <NumberInput
                label="Quantidade"
                value={smktForm.quantity}
                onChange={(value) => setSmktForm({ ...smktForm, quantity: value })}
              />
              <TextInput
                label="Nº da NF (opcional)"
                value={smktForm.nf_number}
                placeholder="ex.: 2451"
                onChange={(value) => setSmktForm({ ...smktForm, nf_number: value })}
              />
              <textarea
                className="min-h-16 rounded-lg border border-slate-300 px-3 py-2.5 text-sm sm:col-span-2"
                placeholder="Observação (opcional)"
                value={smktForm.notes}
                onChange={(event) => setSmktForm({ ...smktForm, notes: event.target.value })}
              />
              <button
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 sm:col-span-2"
                disabled={busy}
                type="submit"
              >
                Registrar baixa do Supermercado
              </button>
            </form>
          )}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2">Quando</th>
                  <th className="px-2 py-2">Produto</th>
                  <th className="px-2 py-2">PV</th>
                  <th className="px-2 py-2">Qtd.</th>
                  <th className="px-2 py-2">NF</th>
                  <th className="px-2 py-2">Observação</th>
                </tr>
              </thead>
              <tbody>
                {smktAllocs.map((alloc) => (
                  <tr className="border-b border-slate-100" key={alloc.id}>
                    <td className="px-2 py-2">{dateLabel(alloc.allocated_at)}</td>
                    <td className="px-2 py-2">
                      <strong className="font-mono">{alloc.product_code}</strong>
                      <br />
                      <span className="text-slate-500">{alloc.product_name}</span>
                    </td>
                    <td className="px-2 py-2 font-semibold">{alloc.pv_number || '—'}</td>
                    <td className="px-2 py-2">{alloc.quantity}</td>
                    <td className="px-2 py-2">
                      {alloc.nf_number ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">
                          NF {alloc.nf_number}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="max-w-[220px] truncate px-2 py-2 text-slate-500">
                      {alloc.reason}
                    </td>
                  </tr>
                ))}
                {smktAllocs.length === 0 && (
                  <tr>
                    <td className="px-2 py-5 text-center text-slate-500" colSpan={6}>
                      Nenhuma baixa do Supermercado registrada neste ciclo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionTitle
            eyebrow="Camada 2.2"
            title="Produtos a Faturar — pesquisa por PV"
            tag="somente leitura"
          />
          <div className="mt-4">
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              placeholder="Digite o nº do PV (ou parte do cliente/produto)… ex.: 549, SHOPEE, BERENICE"
              value={pvQuery}
              onChange={(event) => setPvQuery(event.target.value)}
            />
          </div>
          {pvQuery.trim() && (
            <div className="mt-4 space-y-3">
              {(() => {
                const q = pvQuery.trim().toUpperCase()
                const hits = items.filter((row) =>
                  `${row.pv_number} ${row.client_name} ${row.product_code} ${row.product_name} ${row.company_name}`
                    .toUpperCase()
                    .includes(q),
                )
                if (!hits.length)
                  return (
                    <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                      Nenhum item encontrado para “{pvQuery}”.
                    </p>
                  )
                const byPv = new Map<string, typeof hits>()
                for (const row of hits) {
                  const key = `${row.pv_number}|${row.company_name}`
                  const list = byPv.get(key) || []
                  list.push(row)
                  byPv.set(key, list)
                }
                return Array.from(byPv.values()).map((rows) => {
                  const total = rows.reduce((sum, row) => sum + (row.total_value || 0), 0)
                  const qty = rows.reduce((sum, row) => sum + row.quantity, 0)
                  return (
                    <div key={rows[0].id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <strong className="text-sm">PV {rows[0].pv_number || '—'}</strong>{' '}
                          <span className="text-xs text-slate-500">
                            · {rows[0].client_name} · {rows[0].company_name}
                          </span>
                        </div>
                        <div className="text-sm">
                          <strong>{money(total)}</strong>{' '}
                          <span className="text-xs text-slate-500">
                            · {qty} un · {rows.length} item(ns)
                          </span>
                        </div>
                      </div>
                      <table className="mt-3 w-full text-left text-xs">
                        <thead className="border-b border-slate-100 uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="py-1.5">Produto</th>
                            <th className="py-1.5">Entrega</th>
                            <th className="py-1.5">Semana</th>
                            <th className="py-1.5">Qtd.</th>
                            <th className="py-1.5">Valor</th>
                            <th className="py-1.5">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr className="border-b border-slate-50" key={row.id}>
                              <td className="py-1.5">
                                <strong className="font-mono">{row.product_code}</strong>{' '}
                                <span className="text-slate-500">{row.product_name}</span>
                              </td>
                              <td className="py-1.5">{dateLabel(row.delivery_date)}</td>
                              <td className="py-1.5">{row.planned_week}</td>
                              <td className="py-1.5">{row.quantity}</td>
                              <td className="py-1.5">{money(row.total_value || 0)}</td>
                              <td className="py-1.5">
                                <span className="rounded-full bg-slate-100 px-2 py-0.5">
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle
              eyebrow="Camada 3"
              title="Itens do ciclo"
              tag="manual / importação futura"
            />
            {!cycleId ? (
              <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                Selecione um ciclo para cadastrar um item.
              </p>
            ) : (
              <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={createItem}>
                <TextInput
                  label="Chave externa"
                  value={itemForm.external_key}
                  placeholder="ex.: PV554|404-0001|DLEAN"
                  onChange={(value) => setItemForm({ ...itemForm, external_key: value })}
                  required
                />
                <TextInput
                  label="Código"
                  value={itemForm.product_code}
                  placeholder="ex.: 404-0001"
                  onChange={(value) => setItemForm({ ...itemForm, product_code: value })}
                  required
                />
                <TextInput
                  label="Produto"
                  value={itemForm.product_name}
                  placeholder="Nome do produto"
                  onChange={(value) => setItemForm({ ...itemForm, product_name: value })}
                  required
                />
                <TextInput
                  label="PV"
                  value={itemForm.pv_number}
                  placeholder="ex.: 554"
                  onChange={(value) => setItemForm({ ...itemForm, pv_number: value })}
                />
                <TextInput
                  label="Cliente"
                  value={itemForm.client_name}
                  placeholder="Cliente / destino"
                  onChange={(value) => setItemForm({ ...itemForm, client_name: value })}
                />
                <TextInput
                  label="Empresa"
                  value={itemForm.company_name}
                  placeholder="DLEAN / VINHEDO / ..."
                  onChange={(value) => setItemForm({ ...itemForm, company_name: value })}
                />
                <DateInput
                  label="Entrega"
                  value={itemForm.delivery_date}
                  onChange={(value) => setItemForm({ ...itemForm, delivery_date: value })}
                />
                <TextInput
                  label="Semana planejada"
                  value={itemForm.planned_week}
                  placeholder="ex.: 2026-W39"
                  onChange={(value) => setItemForm({ ...itemForm, planned_week: value })}
                  required
                />
                <NumberInput
                  label="Quantidade"
                  value={itemForm.quantity}
                  onChange={(value) => setItemForm({ ...itemForm, quantity: value })}
                />
                <label className="text-xs font-medium text-slate-600">
                  Valor unitário
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemForm.unit_value}
                    onChange={(event) =>
                      setItemForm({ ...itemForm, unit_value: event.target.value })
                    }
                  />
                </label>
                <textarea
                  className="min-h-16 rounded-lg border border-slate-300 px-3 py-2.5 text-sm sm:col-span-2"
                  placeholder="Observação / origem do dado"
                  value={itemForm.notes}
                  onChange={(event) => setItemForm({ ...itemForm, notes: event.target.value })}
                />
                <button
                  className="rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-60 sm:col-span-2"
                  disabled={busy}
                  type="submit"
                >
                  Adicionar item ao ciclo
                </button>
              </form>
            )}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Produto</th>
                    <th className="px-2 py-2">PV</th>
                    <th className="px-2 py-2">Entrega</th>
                    <th className="px-2 py-2">Semana</th>
                    <th className="px-2 py-2">Qtd.</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr className="border-b border-slate-100" key={item.id}>
                      <td className="px-2 py-2">
                        <strong>{item.product_code}</strong>
                        <br />
                        <span className="text-slate-500">{item.product_name}</span>
                      </td>
                      <td className="px-2 py-2">{item.pv_number || '—'}</td>
                      <td className="px-2 py-2">{dateLabel(item.delivery_date)}</td>
                      <td className="px-2 py-2">{item.planned_week}</td>
                      <td className="px-2 py-2">{item.quantity}</td>
                      <td className="px-2 py-2">{item.status}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td className="px-2 py-5 text-center text-slate-500" colSpan={6}>
                        Nenhum item persistido neste ciclo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle
              eyebrow="Camada 4"
              title="Reprogramação auditável"
              tag="cenário · sem ERP"
            />
            {!cycleId ? (
              <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                Selecione um ciclo para registrar um cenário.
              </p>
            ) : (
              <form className="mt-5 space-y-3" onSubmit={createEvent}>
                <TextInput
                  label="Chave do item"
                  value={eventForm.external_key}
                  placeholder="ex.: PV554|404-0001|DLEAN"
                  onChange={(value) => setEventForm({ ...eventForm, external_key: value })}
                  required
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-600">
                    Campo alterado
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      value={eventForm.field}
                      onChange={(event) =>
                        setEventForm({ ...eventForm, field: event.target.value })
                      }
                    >
                      <option value="delivery_date">Data de entrega</option>
                      <option value="planned_week">Semana planejada</option>
                      <option value="quantity">Quantidade</option>
                      <option value="status">Status</option>
                    </select>
                  </label>
                  <TextInput
                    label="Valor anterior"
                    value={eventForm.before}
                    placeholder="Valor atual"
                    onChange={(value) => setEventForm({ ...eventForm, before: value })}
                    required
                  />
                </div>
                <TextInput
                  label="Novo valor"
                  value={eventForm.after}
                  placeholder="Valor do cenário"
                  onChange={(value) => setEventForm({ ...eventForm, after: value })}
                  required
                />
                <textarea
                  className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                  placeholder="Motivo da reprogramação"
                  value={eventForm.reason}
                  onChange={(event) => setEventForm({ ...eventForm, reason: event.target.value })}
                  required
                />
                <button
                  className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                  disabled={busy}
                  type="submit"
                >
                  Registrar cenário de reprogramação
                </button>
              </form>
            )}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Quando</th>
                    <th className="px-2 py-2">Item</th>
                    <th className="px-2 py-2">Alteração</th>
                    <th className="px-2 py-2">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => {
                    const change = event.changes as {
                      external_key?: string
                      field?: string
                      before?: string
                      after?: string
                    }
                    return (
                      <tr className="border-b border-slate-100" key={event.id}>
                        <td className="px-2 py-2">{dateLabel(event.occurred_at)}</td>
                        <td className="px-2 py-2 font-mono">{change.external_key || '—'}</td>
                        <td className="px-2 py-2">
                          {change.field}: {change.before || '—'} → {change.after || '—'}
                        </td>
                        <td className="max-w-[220px] truncate px-2 py-2 text-slate-500">
                          {event.reason}
                        </td>
                      </tr>
                    )
                  })}
                  {events.length === 0 && (
                    <tr>
                      <td className="px-2 py-5 text-center text-slate-500" colSpan={4}>
                        Nenhum evento registrado neste ciclo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionTitle
            eyebrow="Integração"
            title="Execuções de sincronização"
            tag="somente leitura"
          />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2">Início</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Lidas</th>
                  <th className="px-2 py-2">Novas</th>
                  <th className="px-2 py-2">Atualizadas</th>
                  <th className="px-2 py-2">Erro / parâmetros</th>
                </tr>
              </thead>
              <tbody>
                {syncRuns.map((run) => (
                  <tr className="border-b border-slate-100" key={run.id}>
                    <td className="px-2 py-2">{dateLabel(run.started_at)}</td>
                    <td className="px-2 py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-1">{run.status}</span>
                    </td>
                    <td className="px-2 py-2">{run.rows_read || 0}</td>
                    <td className="px-2 py-2">{run.rows_created || 0}</td>
                    <td className="px-2 py-2">{run.rows_updated || 0}</td>
                    <td className="max-w-[360px] truncate px-2 py-2 text-slate-500">
                      {run.error_message || (run.parameters ? 'leitura registrada' : '—')}
                    </td>
                  </tr>
                ))}
                {syncRuns.length === 0 && (
                  <tr>
                    <td className="px-2 py-5 text-center text-slate-500" colSpan={6}>
                      Nenhuma sincronização executada neste ciclo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
          <strong>Limite desta etapa:</strong> o workspace persiste planejamento, itens,
          declarações, cenários e baixas do Supermercado (PV + NF). Não altera o MaxiProd, não cria
          OP e ainda não baixa materiais no Pulso.
        </footer>
      </div>
    </main>
  )
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  )
}

function SectionTitle({ eyebrow, title, tag }: { eyebrow: string; title: string; tag: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-bold">{title}</h2>
      </div>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{tag}</span>
    </div>
  )
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <input
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </label>
  )
}

function TextInput({
  label,
  value,
  placeholder,
  onChange,
  required = false,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <input
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </label>
  )
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <input
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        type="number"
        min="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </label>
  )
}
