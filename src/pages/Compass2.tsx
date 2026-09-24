import { useEffect, useMemo, useState, type FormEvent } from 'react'
import pb from '@/lib/pocketbase/client'
import {
  createPlanningCycle,
  createProductionDeclaration,
  listPlanningCycles,
  listPlanningItems,
  listProductionDeclarations,
  type PlanningCycle,
  type PlanningItem,
  type ProductionDeclaration,
} from '@/services/compass2'

const emptyCycle = { name: '', start_date: '', end_date: '', notes: '' }
const emptyDeclaration = {
  production_date: '',
  product_code: '',
  product_name: '',
  quantity: '1',
  notes: '',
}

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
  const [cycleForm, setCycleForm] = useState(emptyCycle)
  const [declarationForm, setDeclarationForm] = useState(emptyDeclaration)
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
      return
    }
    const [nextItems, nextDeclarations] = await Promise.all([
      listPlanningItems(nextCycleId),
      listProductionDeclarations(nextCycleId),
    ])
    setItems(nextItems)
    setDeclarations(nextDeclarations)
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
        <footer className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
          <strong>Limite desta etapa:</strong> o workspace persiste planejamento e declaração. Não
          altera o MaxiProd, não cria OP e ainda não baixa materiais no Pulso.
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
