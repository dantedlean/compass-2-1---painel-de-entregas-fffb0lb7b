import pb from '@/lib/pocketbase/client'
import type { RecordModel } from 'pocketbase'

export type PlanningCycleStatus = 'draft' | 'open' | 'closed' | 'archived'
export type PlanningSource = 'manual' | 'maxiprod' | 'import' | 'pulso'
export type PlanningItemStatus = 'pending' | 'producing' | 'produced' | 'fulfilled' | 'cancelled'
export type ProductionDeclarationStatus = 'draft' | 'confirmed' | 'cancelled'
export type SyncRunStatus = 'running' | 'succeeded' | 'partial' | 'failed'

export interface PlanningCycle extends RecordModel {
  name: string
  status: PlanningCycleStatus
  start_date: string
  end_date: string
  source: PlanningSource
  source_version: string
  notes: string
  created_by?: string
}

export interface PlanningItem extends RecordModel {
  cycle_id: string
  external_key: string
  product_code: string
  product_name: string
  pv_number: string
  client_name: string
  company_name: string
  delivery_date: string
  planned_week: string
  quantity: number
  produced_quantity?: number
  unit_value?: number
  total_value?: number
  status: PlanningItemStatus
  source_system: PlanningSource
  source_record_id?: string
  is_freight?: boolean
  rigid_date?: string
  notes?: string
}

export interface ProductionDeclaration extends RecordModel {
  cycle_id: string
  production_date: string
  product_code: string
  product_name?: string
  quantity: number
  allocation?: Record<string, unknown>
  source: PlanningSource
  status: ProductionDeclarationStatus
  declared_by?: string
  notes?: string
}

export interface SyncRun extends RecordModel {
  cycle_id?: string
  source: PlanningSource
  started_at: string
  finished_at?: string
  status: SyncRunStatus
  rows_read?: number
  rows_created?: number
  rows_updated?: number
  rows_removed?: number
  error_message?: string
  parameters?: Record<string, unknown>
}

export interface ReprogrammingEvent extends RecordModel {
  cycle_id: string
  event_type: 'scenario' | 'actual' | 'import' | 'system'
  occurred_at: string
  reason: string
  source?: string
  changes: Record<string, unknown>
  before_snapshot?: Record<string, unknown>
  created_by?: string
}

export interface CreateCycleInput {
  name: string
  status?: PlanningCycleStatus
  start_date: string
  end_date: string
  source?: PlanningSource
  source_version?: string
  notes?: string
}

export interface CreateProductionDeclarationInput {
  cycle_id: string
  production_date: string
  product_code: string
  product_name?: string
  quantity: number
  allocation?: Record<string, unknown>
  source?: PlanningSource
  status?: ProductionDeclarationStatus
  notes?: string
}

export interface CreatePlanningItemInput {
  cycle_id: string
  external_key: string
  product_code: string
  product_name: string
  pv_number?: string
  client_name?: string
  company_name?: string
  delivery_date: string
  planned_week: string
  quantity: number
  produced_quantity?: number
  unit_value?: number
  total_value?: number
  status?: PlanningItemStatus
  source_system?: PlanningSource
  source_record_id?: string
  is_freight?: boolean
  rigid_date?: string
  notes?: string
}

function requireAuth() {
  if (!pb.authStore.isValid) {
    throw new Error('É necessário entrar no Compass 2.0 para acessar os dados.')
  }
}

export async function listPlanningCycles(): Promise<PlanningCycle[]> {
  requireAuth()
  return pb
    .collection('planning_cycles')
    .getFullList<PlanningCycle>({ sort: '-start_date,-created' })
}

export async function createPlanningCycle(input: CreateCycleInput): Promise<PlanningCycle> {
  requireAuth()
  return pb.collection('planning_cycles').create<PlanningCycle>({
    ...input,
    status: input.status ?? 'draft',
    source: input.source ?? 'manual',
    source_version: input.source_version ?? '',
    notes: input.notes ?? '',
    created_by: pb.authStore.record?.id,
  })
}

export async function listPlanningItems(cycleId: string): Promise<PlanningItem[]> {
  requireAuth()
  return pb.collection('planning_items').getFullList<PlanningItem>({
    filter: pb.filter('cycle_id = {:cycleId}', { cycleId }),
    sort: 'delivery_date,product_name,pv_number',
  })
}

export async function createPlanningItem(input: CreatePlanningItemInput): Promise<PlanningItem> {
  requireAuth()
  const unitValue = input.unit_value ?? 0
  return pb.collection('planning_items').create<PlanningItem>({
    ...input,
    pv_number: input.pv_number ?? '',
    client_name: input.client_name ?? '',
    company_name: input.company_name ?? '',
    produced_quantity: input.produced_quantity ?? 0,
    unit_value: unitValue,
    total_value: input.total_value ?? input.quantity * unitValue,
    status: input.status ?? 'pending',
    source_system: input.source_system ?? 'manual',
    source_record_id: input.source_record_id ?? '',
    is_freight: input.is_freight ?? false,
    rigid_date: input.rigid_date ?? '',
    notes: input.notes ?? '',
  })
}

export async function listSyncRuns(cycleId: string): Promise<SyncRun[]> {
  requireAuth()
  return pb.collection('sync_runs').getFullList<SyncRun>({
    filter: pb.filter('cycle_id = {:cycleId}', { cycleId }),
    sort: '-started_at,-created',
  })
}

export interface SyncMaxiProdResult {
  ok: boolean
  sync_run_id?: string
  rows_read?: number
  rows_created?: number
  rows_updated?: number
  rows_removed?: number
  skipped_zero_balance?: number
  skipped_without_delivery_date?: number
  read_only?: boolean
  code?: string
  message?: string
}

export async function syncMaxiProd(cycleId: string): Promise<SyncMaxiProdResult> {
  requireAuth()
  return pb.send<SyncMaxiProdResult>('/backend/v1/compass2/sync-maxiprod', {
    method: 'POST',
    body: JSON.stringify({ cycle_id: cycleId }),
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function listProductionDeclarations(
  cycleId: string,
): Promise<ProductionDeclaration[]> {
  requireAuth()
  return pb.collection('production_declarations').getFullList<ProductionDeclaration>({
    filter: pb.filter('cycle_id = {:cycleId}', { cycleId }),
    sort: 'production_date,product_code',
  })
}

export async function createProductionDeclaration(
  input: CreateProductionDeclarationInput,
): Promise<ProductionDeclaration> {
  requireAuth()
  return pb.collection('production_declarations').create<ProductionDeclaration>({
    ...input,
    allocation: input.allocation ?? {},
    source: input.source ?? 'manual',
    status: input.status ?? 'draft',
    notes: input.notes ?? '',
    declared_by: pb.authStore.record?.id,
  })
}

export async function recordReprogrammingEvent(input: {
  cycle_id: string
  event_type: ReprogrammingEvent['event_type']
  occurred_at: string
  reason: string
  source?: string
  changes: Record<string, unknown>
  before_snapshot?: Record<string, unknown>
}): Promise<ReprogrammingEvent> {
  requireAuth()
  return pb.collection('reprogramming_events').create<ReprogrammingEvent>({
    ...input,
    source: input.source ?? 'compass-2.0',
    created_by: pb.authStore.record?.id,
  })
}

export async function listReprogrammingEvents(cycleId: string): Promise<ReprogrammingEvent[]> {
  requireAuth()
  return pb.collection('reprogramming_events').getFullList<ReprogrammingEvent>({
    filter: pb.filter('cycle_id = {:cycleId}', { cycleId }),
    sort: '-occurred_at,-created',
  })
}

/* ==================== Faturamento — NFs emitidas (sync a cada 15 min) ==================== */

export interface FaturamentoNf extends RecordModel {
  nf_number: string
  company_cnpj: string
  company_name: string
  issue_date: string
  issue_day: string
  total_value: number
  freight_value: number
  client_name: string
  city: string
  uf: string
  fiscal_op: string
  items?: Array<{ cod: string; desc: string; qtd: number; valor: number; classe: string }>
}

export async function listFaturamentoNfs(): Promise<FaturamentoNf[]> {
  return pb
    .collection('faturamento_nfs')
    .getFullList<FaturamentoNf>({ sort: '-issue_day,-nf_number', batch: 200 })
}

/* ==================== Supermercado (SMKT) — produtos prontos ==================== */
/* Alocação = baixa do produto pronto do SMKT para um PV, registrando a NF de saída.
   Persistida como reprogramming_events (event_type 'actual') — histórico auditável. */

export interface SmktAllocation {
  id: string
  cycle_id: string
  product_code: string
  product_name: string
  pv_number: string
  client_name: string
  quantity: number
  nf_number: string
  allocated_at: string
  reason: string
}

export async function listSmktAllocations(cycleId: string): Promise<SmktAllocation[]> {
  requireAuth()
  const rows = await pb.collection('reprogramming_events').getFullList<ReprogrammingEvent>({
    filter: pb.filter("cycle_id = {:cycleId} && event_type = 'actual' && source = 'smkt'", {
      cycleId,
    }),
    sort: '-created',
    batch: 200,
  })
  return rows.map((row) => {
    const c = (row.changes || {}) as Record<string, string>
    return {
      id: row.id,
      cycle_id: row.cycle_id,
      product_code: String(c.product_code || ''),
      product_name: String(c.product_name || ''),
      pv_number: String(c.pv_number || ''),
      client_name: String(c.client_name || ''),
      quantity: Number(c.quantity || 0),
      nf_number: String(c.nf_number || ''),
      allocated_at: row.occurred_at,
      reason: row.reason || '',
    }
  })
}

export async function createSmktAllocation(input: {
  cycle_id: string
  product_code: string
  product_name: string
  pv_number: string
  client_name: string
  quantity: number
  nf_number: string
  notes?: string
}): Promise<ReprogrammingEvent> {
  requireAuth()
  return pb.collection('reprogramming_events').create<ReprogrammingEvent>({
    cycle_id: input.cycle_id,
    event_type: 'actual',
    occurred_at: new Date().toISOString(),
    source: 'smkt',
    reason:
      input.notes ||
      `Baixa SMKT → PV ${input.pv_number}${input.nf_number ? ` · NF ${input.nf_number}` : ''}`,
    changes: {
      product_code: input.product_code,
      product_name: input.product_name,
      pv_number: input.pv_number,
      client_name: input.client_name,
      quantity: input.quantity,
      nf_number: input.nf_number,
    },
    before_snapshot: { field: 'smkt_balance', value: input.quantity },
    created_by: pb.authStore.record?.id,
  })
}
