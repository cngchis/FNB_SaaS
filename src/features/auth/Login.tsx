import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { apiConfig } from '../../api/config'
import { login, logout, useSessionStore } from '../../api/auth'
import { errorMessage } from '../../api/recordAdapter'

const credentialsSchema = z.object({
  tenant_slug: z.string().trim().min(1, 'Nhập mã cửa hàng.'),
  email: z.email('Email chưa hợp lệ.'),
  password: z.string().min(1, 'Nhập mật khẩu.'),
})
type Credentials = z.infer<typeof credentialsSchema>

export function AuthGuard() {
  const session = useSessionStore((state) => state.session)
  const location = useLocation()
  const [acknowledgedDemo, setAcknowledgedDemo] = useState(false)
  if (!apiConfig.useMock && !session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  const connected = [
    '/management', '/management/', '/management/reports/sales', '/management/reports/finance', '/management/reports/end-of-day','/management/menu-items', '/management/customers', '/management/customer-groups', '/management/rooms', '/management/suppliers', '/management/purchases', '/management/invoices', '/management/cashbook', '/pos'].includes(location.pathname)
  return <><Outlet />{!apiConfig.useMock && !connected && !acknowledgedDemo && <div className="toast" role="status">Trang này vẫn dùng dữ liệu demo; chưa kết nối API nghiệp vụ.<button className="button button-secondary" type="button" onClick={() => setAcknowledgedDemo(true)}>Đã hiểu</button></div>}</>
}

export function Login() {
  const session = useSessionStore((state) => state.session)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Credentials>()
  const [failure, setFailure] = useState('')
  const [leaving, setLeaving] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const requested: unknown = location.state?.from
  const destination = typeof requested === 'string' && /^\/(management(?:\/|$)|pos$)/.test(requested) ? requested : '/management/menu-items'
  if (apiConfig.useMock) return <Navigate to="/management" replace />

  const submit = handleSubmit(async (values) => {
    setFailure('')
    const parsed = credentialsSchema.safeParse(values)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) setError(issue.path[0] as keyof Credentials, { message: issue.message })
      return
    }
    try { await login(parsed.data); navigate(destination, { replace: true }) }
    catch (error) { setFailure(errorMessage(error)) }
  })
  const signOut = async () => {
    setLeaving(true); setFailure('')
    try { await logout() } catch { setFailure('Phiên trên thiết bị đã kết thúc. Chưa xác nhận được đăng xuất trên server.') }
    finally { setLeaving(false) }
  }
  return <main className="auth-page"><section className="modal-card auth-card">
    <h1>{session ? 'Tài khoản cửa hàng' : 'Đăng nhập'}</h1>
    <p>{session ? `${session.user.display_name} · ${session.stores.find((store) => store.id === session.store_id)?.name ?? ''}` : 'Đăng nhập để quản lý dữ liệu cửa hàng trên hệ thống.'}</p>
    {failure && <p className="form-error" role="alert">{failure}</p>}
    {session ? <div className="modal-actions"><button className="button button-secondary" type="button" disabled={leaving} onClick={() => void signOut()}>Đăng xuất</button><button className="button button-primary" type="button" onClick={() => navigate(destination)}>Tiếp tục</button></div> : <form onSubmit={submit}>
      <label className="form-label">Mã cửa hàng<input autoComplete="organization" autoFocus {...register('tenant_slug')} required /></label>{errors.tenant_slug && <p className="form-error" role="alert">{errors.tenant_slug.message}</p>}
      <label className="form-label">Email<input type="email" autoComplete="username" {...register('email')} required /></label>{errors.email && <p className="form-error" role="alert">{errors.email.message}</p>}
      <label className="form-label">Mật khẩu<input type="password" autoComplete="current-password" {...register('password')} required /></label>{errors.password && <p className="form-error" role="alert">{errors.password.message}</p>}
      <p>Phiên chỉ lưu trong bộ nhớ. Tải lại trang sẽ cần đăng nhập lại.</p>
      <div className="modal-actions"><button className="button button-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</button></div>
    </form>}
  </section></main>
}
