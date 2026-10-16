// A person's Modules (PREVIEW — ship state `preview`, dev launch only; see lib/ship-gate.ts): per module,
// whether this person is in and why. Real today: the module's release status and whether the person's
// access levels admit it. Not connected yet: the Org switch and a personal Allow/Block, so they are never
// shown as fetched ("— · Not connected"). Preview settings is an isolated in-memory model; Save stays
// disabled and nothing reaches the shell. Allow never beats Org off, Not released or the access level.
// Contract: R/handover/module-switches.md (§Where it lives).
import { Link } from 'react-router-dom'
import { PreviewBadge } from '@/components/preview/preview-badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'
import {
  admittedTo, effectiveAvailability, moduleFacts, previewOrgEnabled, previewOverride,
  type AvailabilityReason, type PersonModuleOverride,
} from '@/lib/module-switches-preview'
import { useModulePreview } from '@/lib/use-module-switches-preview'
import './person-modules-card.css'

const REASON_KEY: Record<AvailabilityReason, MessageKey> = {
  available: 'admin.modules.reason.available',
  notReleased: 'admin.modules.notReleased',
  orgOff: 'admin.modules.reason.orgOff',
  blocked: 'admin.modules.reason.blocked',
  accessRequired: 'admin.modules.reason.accessRequired',
}

export function PersonModulesCard({ person }: { person: AdminPersonRow }) {
  const t = useT()
  const { model, open, leave, setOverride } = useModulePreview()
  const facts = moduleFacts()
  const preview = model !== null
  const title = t('admin.modules.title')
  return (
    <section className="person-card person-modules" aria-label={title}>
      <div className="person-card__head">
        <h2 className="person-card__title">{title}</h2>
        <Button variant="outline" className="person-card__change" onClick={preview ? leave : open}>
          {t(preview ? 'admin.modules.leavePreview' : 'admin.modules.openPreview')}
        </Button>
      </div>
      {preview && <p className="person-modules__badge"><PreviewBadge /></p>}
      <ul className="person-card__list">
        {facts.map((fact) => {
          const name = t(fact.labelKey)
          const admitted = admittedTo(fact.id, person.access_roles)
          const override: PersonModuleOverride = model ? previewOverride(model, person.id, fact.id) : 'inherit'
          const result = effectiveAvailability({ released: fact.released, orgEnabled: model ? previewOrgEnabled(model, fact.id) : true, override, admitted })
          // Outside the preview only the two real facts can be stated; anything else would be a guessed default.
          const real = !fact.released || !admitted
          const state = preview || real ? t(REASON_KEY[result.reason]) : null
          return (
            <li key={fact.id} className="person-card__item person-modules__row">
              <span className="person-card__item-text">
                <span className="person-card__name">{name}</span>
                <span className={`person-card__meta${preview && result.available ? ' person-modules__on' : ''}`}>
                  {state ?? <span className="person-modules__nc">{t('admin.modules.notConnectedShort')}</span>}
                </span>
              </span>
              {preview && fact.released && (
                <div className="person-modules__select">
                  <Select
                    aria-label={t('admin.modules.overrideOf', { module: name })}
                    value={override}
                    fullWidth
                    onChange={(e) => setOverride(person.id, fact.id, e.target.value as PersonModuleOverride)}
                  >
                    <option value="inherit">{t('admin.modules.inherit')}</option>
                    <option value="allow">{t('admin.modules.allow')}</option>
                    <option value="block">{t('admin.modules.block')}</option>
                  </Select>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="person-card__meaning">{t(preview ? 'admin.modules.person.previewMeaning' : 'admin.modules.person.meaning')}</p>
      <Link className="person-card__link person-modules__org-link" to="/admin/modules">{t('admin.modules.person.orgLink')}</Link>
      {preview && (
        <div className="person-modules__save">
          <Button variant="primary" disabled>{t('admin.modules.savePerson')}</Button>
          <span className="person-card__meta">{t('admin.modules.notConnected')}</span>
        </div>
      )}
    </section>
  )
}
