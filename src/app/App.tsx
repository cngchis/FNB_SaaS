import { Navigate, Route, Routes } from 'react-router-dom'
import { ManagementLayout } from '../components/ManagementLayout'
import { Dashboard } from '../features/dashboard/Dashboard'
import { Inventory } from '../features/inventory/Inventory'
import { Orders } from '../features/orders/Orders'
import { ManagementRecordPage } from '../features/management/ManagementRecordPage'
import { managementModules } from '../features/management/moduleConfig'
import { Reports } from '../features/reports/Reports'
import { POS } from '../features/pos/POS'

export default function App() {
  return (
    <Routes>
      <Route element={<ManagementLayout />}>
        <Route path="/management" element={<Dashboard />} />
        <Route path="/management/inventory" element={<Inventory />} />
        <Route path="/management/stock-check" element={<Inventory stockCheck />} />
        <Route path="/management/orders" element={<Orders />} />
        {managementModules.map((module) => <Route key={module.id} path={module.path} element={<ManagementRecordPage moduleId={module.id} />} />)}
        <Route path="/management/reports/end-of-day" element={<Reports reportId="end-of-day" />} />
        <Route path="/management/reports/sales" element={<Reports reportId="sales" />} />
        <Route path="/management/reports/goods" element={<Reports reportId="goods" />} />
        <Route path="/management/reports/finance" element={<Reports reportId="finance" />} />
      </Route>
      <Route path="/pos" element={<POS />} />
      <Route path="*" element={<Navigate to="/management" replace />} />
    </Routes>
  )
}
