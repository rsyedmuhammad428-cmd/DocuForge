import { Navigate, Route, Routes } from 'react-router'
import { CompressPage } from '../features/compress/CompressPage'
import { ConvertPage } from '../features/convert/ConvertPage'
import { HomePage } from '../features/home/HomePage'
import { MergePage } from '../features/merge/MergePage'
import { OcrPage } from '../features/ocr/OcrPage'
import { OrganizePage } from '../features/organize/OrganizePage'
import { ToolPlaceholderPage } from '../features/placeholder/ToolPlaceholderPage'
import { NAV_ITEMS } from '../features/registry'
import { RecentPage } from '../features/recent/RecentPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { SplitPage } from '../features/split/SplitPage'
import { AppLayout } from './AppLayout'

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="merge" element={<MergePage />} />
        <Route path="split" element={<SplitPage />} />
        <Route path="organize" element={<OrganizePage />} />
        <Route path="convert" element={<ConvertPage />} />
        <Route path="compress" element={<CompressPage />} />
        <Route path="ocr" element={<OcrPage />} />
        <Route path="recent" element={<RecentPage />} />
        <Route path="settings" element={<SettingsPage />} />
        {NAV_ITEMS.filter((item) => item.status === 'in-development').map((item) => (
          <Route key={item.id} path={item.path} element={<ToolPlaceholderPage item={item} />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
