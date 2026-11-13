import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useSessionStore } from '../../api/auth'
import { categoriesRepository, menuItemsRepository, type ProductDTO } from '../../api/catalog'
import { purchasesRepository, suppliersRepository, receiptInputSchema, receiptSchema, type ReceiptInput } from '../../api/purchasing'
import { errorMessage } from '../../api/recordAdapter'
import { ApiError } from '../../api/http'

type Receipt = z.infer<typeof receiptSchema>
export type PurchaseLine = { product: Pick<ProductDTO, 'id' | 'name' | 'sku' | 'base_unit'>; quantity: number; cost: number }

export function usePurchaseWorkspace() {
  const session = useSessionStore((state) => state.session)!
  const scope = `${session.tenant_id}:${session.store_id}:${session.user.id}`
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const saved = useRef<Receipt | null>(null)
  const pendingCreate = useRef<{ input: ReceiptInput; key: string; lines: PurchaseLine[] } | null>(null)
  const [lines, setLines] = useState<PurchaseLine[]>([])
  const [supplier, setSupplier] = useState('')
  const [note, setNote] = useState('')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => { const timer = window.setTimeout(() => setSearch(query.trim()), 300); return () => window.clearTimeout(timer) }, [query])
  const [showAll, setShowAll] = useState(false)
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState(false)
  const keys = useRef(new Map<string, string>())
  const checkScope = () => {
    const current = useSessionStore.getState().session
    if (!current || `${current.tenant_id}:${current.store_id}:${current.user.id}` !== scope) throw new Error('Phiên đã thay đổi. Vui lòng thử lại.')
  }
  const keyFor = (signature: string) => {
    let key = keys.current.get(signature)
    if (!key) { key = crypto.randomUUID(); keys.current.set(signature, key) }
    return key
  }
  const run = async (action: () => Promise<void>) => {
    if (locked.current) return
    locked.current = true; setBusy(true); setFailure(''); setNotice('')
    try { checkScope(); await action(); checkScope(); return true } catch (error) { setFailure(errorMessage(error)); return false }
    finally { locked.current = false; setBusy(false) }
  }
  const history = useQuery({ queryKey: ['api', scope, 'purchases', 'list', page], queryFn: ({ signal }) => purchasesRepository.list({ page, page_size: 6 }, signal) })
  const suppliers = useQuery({ queryKey: ['api', scope, 'suppliers', 'purchase-options'], enabled: creating, queryFn: async ({ signal }) => {
    const items = []; let page = 1; let pages = 1
    do { const result = await suppliersRepository.list({ page, page_size: 100 }, signal); items.push(...result.items); pages = result.pagination.total_pages; page++ } while (page <= pages)
    return items
  } })
  const categories = useQuery({ queryKey: ['api', scope, 'categories'], enabled: creating, queryFn: ({ signal }) => categoriesRepository.list(signal) })
  const products = useQuery({ queryKey: ['api', scope, 'purchase-products', search, showAll, category], enabled: creating && (showAll || !!search), queryFn: async ({ signal }) => {
    const items: ProductDTO[] = []; let page = 1; let pages = 1
    do {
      const result = await menuItemsRepository.list({ page, page_size: 100, search, category_id: category || undefined, product_type: 'goods' }, signal)
      items.push(...result.items.filter((item) => item.tracks_stock)); pages = result.pagination.total_pages; page++
    } while (page <= pages)
    return items
  } })
  const invalidate = () => client.invalidateQueries({ queryKey: ['api', scope] })
  const load = (value: Receipt) => {
    saved.current = value; setReceipt(value); setSupplier(value.supplier_id); setNote(value.note)
    setLines(value.items.map((item) => ({ product: { id: item.product_id, name: item.name, sku: item.sku, base_unit: item.unit }, quantity: item.quantity, cost: item.cost_vnd })))
    setQuery(''); setShowAll(false); setCategory(''); setCreating(true)
  }
  const start = () => {
    if (pendingCreate.current) { setFailure('Phiếu trước chưa xác định kết quả lưu. Vui lòng mở lại thao tác lưu và thử lại trước khi tạo phiếu mới.'); setCreating(true); return }
    saved.current = null; setReceipt(null); setSupplier(''); setNote(''); setLines([]); setQuery(''); setShowAll(false); setCategory(''); setFailure(''); setNotice(''); setCreating(true)
  }
  const open = (id: string) => run(async () => {
    if (pendingCreate.current) throw new Error('Phiếu trước chưa xác định kết quả lưu. Vui lòng thử lại thao tác lưu trước khi mở phiếu khác.')
    const result = await purchasesRepository.get(id); checkScope(); load(result)
  })
  const add = (product: ProductDTO) => setLines((current) => current.some((line) => line.product.id === product.id) ? current : [...current, { product, quantity: 1, cost: product.cost_vnd ?? 0 }])
  const remember = (id: string, version: number, input: ReceiptInput, source: PurchaseLine[]) => {
    const current = saved.current
    const snapshot: Receipt = { id, version, code: current?.code ?? '—', status: 'draft', total_vnd: input.items.reduce((sum, item) => sum + item.quantity * item.cost_vnd, 0), note: input.note, supplier_id: input.supplier_id, supplier: suppliers.data?.find((item) => item.id === input.supplier_id)?.name ?? '', branch: '', creator: session.user.display_name, created_at: current?.created_at ?? new Date().toISOString(), posted_at: null, items: input.items.map((item) => {
      const product = source.find((line) => line.product.id === item.product_id)!.product
      return { id: product.id, product_id: product.id, name: product.name, sku: product.sku, unit: product.base_unit, quantity: item.quantity, cost_vnd: item.cost_vnd, total_vnd: item.quantity * item.cost_vnd }
    }) }
    saved.current = snapshot; setReceipt(snapshot)
  }
  const save = (post: boolean) => run(async () => {
    // Resolve an uncertain creation before sending edits, even if the form changed.
    // A changed payload must never turn a lost response into a second receipt.
    if (pendingCreate.current) {
      const pending = pendingCreate.current
      let result
      try { result = await purchasesRepository.save(pending.input, pending.key) }
      catch (error) {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) pendingCreate.current = null
        throw error
      }
      checkScope(); remember(result.id, result.version, pending.input, pending.lines)
      keys.current.delete(JSON.stringify(['save', scope, undefined, pending.input]))
      pendingCreate.current = null
    }
    const current = saved.current
    if (current?.status === 'posted') throw new Error('Phiếu nhập đã xác nhận không thể sửa.')
    if (!supplier) throw new Error('Vui lòng chọn nhà cung cấp.')
    const input = receiptInputSchema.parse({ supplier_id: supplier, note, version: current?.version ?? 0, items: lines.map((line) => ({ product_id: line.product.id, quantity: line.quantity, cost_vnd: line.cost })) })
    const unchanged = current && current.supplier_id === input.supplier_id && current.note === input.note && JSON.stringify(current.items.map((item) => ({ product_id: item.product_id, quantity: item.quantity, cost_vnd: item.cost_vnd }))) === JSON.stringify(input.items)
    let id = current?.id; let version = current?.version
    if (!unchanged) {
      const signature = JSON.stringify(['save', scope, id, input])
      const key = keyFor(signature)
      if (!id) pendingCreate.current = { input, key, lines }
      let result
      try { result = await purchasesRepository.save(input, key, id) }
      catch (error) {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) pendingCreate.current = null
        throw error
      }
      checkScope()
      // Keep the confirmed identity even if fetching the snapshot or posting fails.
      id = result.id; version = result.version
      remember(id, version, input, lines); pendingCreate.current = null; keys.current.delete(signature)
    }
    if (!id || !version) throw new Error('Không tìm thấy phiếu nhập.')
    if (post) {
      const signature = JSON.stringify(['post', scope, id, version])
      await purchasesRepository.post(id, version, keyFor(signature)); checkScope(); keys.current.delete(signature)
    }
    const result = await purchasesRepository.get(id); checkScope(); load(result)
    setConfirm(false); setNotice(post ? `Đã xác nhận nhập kho ${result.code}.` : `Đã lưu nháp ${result.code}.`)
    await invalidate()
  })
  const createSupplier = (form: FormData) => run(async () => {
    const input = { name: String(form.get('name') ?? '').trim(), contact: String(form.get('contact') ?? ''), phone: String(form.get('phone') ?? ''), address: String(form.get('address') ?? ''), note: '', version: 0 }
    const signature = JSON.stringify(['supplier', input])
    const result = await suppliersRepository.save(input, keyFor(signature)); checkScope(); keys.current.delete(signature)
    setSupplier(result.id); await invalidate()
  })
  const createProduct = (form: FormData) => run(async () => {
    const money = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
    const name = z.string().trim().min(1).parse(form.get('name'))
    const product = await menuItemsRepository.save({ name, category_id: String(form.get('category') || '') || null, product_type: 'goods', menu_type: 'other', base_unit: 'Cái', price_vnd: money.parse(form.get('price')), cost_vnd: money.parse(form.get('cost')), tracks_stock: true, is_visible: true, is_extra: false, earns_points: true, availability: 'available', image_url: null, attributes: [], units: [] })
    checkScope(); add(product); await invalidate()
  })
  const reload = () => run(async () => {
    if (saved.current && window.confirm('Tải lại phiếu? Các thay đổi chưa lưu sẽ bị mất.')) { const result = await purchasesRepository.get(saved.current.id); checkScope(); load(result) }
    await Promise.all([history.refetch(), ...(creating ? [suppliers.refetch(), categories.refetch(), ...(query.trim() || showAll ? [products.refetch()] : [])] : [])])
  })
  const total = lines.reduce((sum, line) => sum + line.quantity * line.cost, 0)
  return { scope, session, reload, page, setPage, history, suppliers, categories, products, creating, setCreating, receipt, lines, setLines, supplier, setSupplier, note, setNote, query, setQuery, showAll, setShowAll, category, setCategory, busy, failure, notice, confirm, setConfirm, start, open, add, save, createSupplier, createProduct, total, readOnly: receipt?.status === 'posted', error: failure || (history.error || suppliers.error || categories.error || products.error ? errorMessage(history.error || suppliers.error || categories.error || products.error) : '') }
}
