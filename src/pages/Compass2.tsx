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
  recordReprogrammingEvent,
  type PlanningCycle,
  type PlanningItem,
  type ProductionDeclaration,
  type ReprogrammingEvent,
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
const emptyEvent = { reason: '', field: 'delivery_date', before: '', after: '' }

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
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

  async function loadCycle(nextCycleId: string) {
    if (!nextCycleId) {
      setItems([])
      setDeclarations([])
      setEvents([])
      return
    }
    const [nextItems, nextDeclarations, nextEvents] = await Promise.all([
      listPlanningItems(nextCycleId),
      listProductionDeclarations(nextCycleId),
      listReprogrammingEvents(nextCycleId),
    ])
    setItems(nextItems)
    setDeclarations(nextDeclarations)
    setEvents(nextEvents)
  }

  async function loadWorkspace(preferredCycleId?: string) {
    const nextCycles = await listPlanningCycles()
    setCycles(nextCycles)
    const nextCycleId = preferredCycleId || cycleId || nextCycles[0]?.id || ''
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

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">
            Dlean · Compass 2.0
          </p>
          <h1 className="mt-3 text-3xl font-bold">Entrar no workspace</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            O painel público continua no link original. Esta rota é o primeiro workspace persistido.
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
              Dlean · Compass 2.0
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
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Data</th>
                  <th className="px-3 py-3">Produto</th>
                  <th className="px-3 py-3">Código</th>
                  <th className="px-3 py-3">Qtd.</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Observação</th>
                </tr>
              </thead>
              <tbody>
                {declarations.map((row) => (
                  <tr className="border-b border-slate-100" key={row.id}>
                    <td className="px-3 py-3">{dateLabel(row.production_date)}</td>
                    <td className="px-3 py-3 font-medium">{row.product_name || '—'}</td>
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

        <footer className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
          <strong>Limite desta etapa:</strong> o workspace persiste planejamento, itens, declarações
          e cenários. Não altera o MaxiProd, não cria OP e ainda não baixa materiais no Pulso.
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
        min="1"
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </label>
  )
}
