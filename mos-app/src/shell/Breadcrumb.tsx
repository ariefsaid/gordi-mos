import { useLocation } from 'react-router-dom'
import { sectionForPath } from './sections'

export default function Breadcrumb() {
  const { pathname } = useLocation()
  const section = sectionForPath(pathname)

  return (
    <span style={{ fontSize: 13 }}>
      <span className="text-muted-foreground">Gordi MOS</span>
      <span className="mx-[7px]" aria-hidden="true">›</span>
      {section && (
        <b className="text-foreground font-semibold">{section.label}</b>
      )}
    </span>
  )
}
