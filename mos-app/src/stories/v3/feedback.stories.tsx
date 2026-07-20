import type { Meta, StoryObj } from '@storybook/react-vite'
import { ErrorState, EmptyState, LoadingShell, SkeletonRows } from '@/components/ui/state-kit'
import { PlanQtyCell } from '@/components/kitchen/plan-qty-cell'
import { PlanQtyStepper } from '@/components/kitchen/plan-qty-stepper'

export const v3Matrix = {
  jobs: [
    "feedback.empty-variants",
    "feedback.error-retry",
    "feedback.loading-skeleton",
    "feedback.saving-saved",
    "feedback.validation-retry",
  ],
  states: [
    "empty.quiet",
    "empty.next-step",
    "empty.awaiting",
    "empty.blank",
    "error.retry",
    "loading.skeleton-rows",
    "loading.shell",
    "feedback.saving",
    "feedback.saved",
    "feedback.validation-retry",
  ],
  responsive: ["desktop1280", "intermediate", "phone390"],
  canonicalImports: [
    { symbol: "EmptyState", file: "mos-app/src/components/ui/state-kit.tsx", importPath: "@/components/ui/state-kit" },
    { symbol: "ErrorState", file: "mos-app/src/components/ui/state-kit.tsx", importPath: "@/components/ui/state-kit" },
    { symbol: "SkeletonRows", file: "mos-app/src/components/ui/state-kit.tsx", importPath: "@/components/ui/state-kit" },
    { symbol: "LoadingShell", file: "mos-app/src/components/ui/state-kit.tsx", importPath: "@/components/ui/state-kit" },
    { symbol: "PlanQtyStepper", file: "mos-app/src/components/kitchen/plan-qty-stepper.tsx", importPath: "@/components/kitchen/plan-qty-stepper" },
    { symbol: "PlanQtyCell", file: "mos-app/src/components/kitchen/plan-qty-cell.tsx", importPath: "@/components/kitchen/plan-qty-cell" },
  ],
  scope: { applicationMigration: false, representativeAcceptance: false, futureIssue4Host: false },
} as const

const meta = {
  title: 'Feedback',
  excludeStories: /^v3Matrix$/,
  parameters: { docs: { description: { component: 'The shared state kit owns quiet, awaiting, error, skeleton, loading, saving, and saved language.' } } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const EmptyStateVariants: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="feedback-empty-title">
        <h2 id="feedback-empty-title" className="v3-story-section__title">Empty state variants</h2>
        <div className="v3-story-grid--two v3-story-grid">
          <EmptyState variant="quiet" title="All tasks are caught up" copy="No open Gordi tasks need attention in this view." />
          <EmptyState variant="next-step" title="Start the next roast plan" copy="Add the first production step for the next café dispatch." />
          <EmptyState variant="awaiting" title="Waiting for today's signal" copy="The shift lead has not filed the 09:00 update yet." />
          <EmptyState variant="blank" title="No reference notes" copy="This record does not have a reference note yet." />
        </div>
      </section>
    </div>
  ),
}

export const ErrorAndRetry: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="feedback-error-title">
        <h2 id="feedback-error-title" className="v3-story-section__title">Error, validation, and retry</h2>
        <ErrorState message="The café dispatch queue could not be refreshed." onRetry={() => undefined} retryLabel="Retry queue" />
        <ErrorState message="Task title is required before this record can be saved." onRetry={() => undefined} retryLabel="Review task" />
      </section>
    </div>
  ),
}

export const LoadingShells: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="feedback-loading-title">
        <h2 id="feedback-loading-title" className="v3-story-section__title">Loading shell and skeleton rows</h2>
        <LoadingShell count={4} label="Loading Gordi task queue" />
        <SkeletonRows count={3} />
      </section>
    </div>
  ),
}

export const SavingAndSaved: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="feedback-saving-title">
        <h2 id="feedback-saving-title" className="v3-story-section__title">Saving and saved treatment</h2>
        <div className="v3-story-stack">
          <div className="v3-story-row">
            <span className="v3-story-label">Phone planning</span>
            <PlanQtyStepper itemName="Kopi Susu Gula Aren" qty={8} saving onSave={() => undefined} disabled={false} />
            <PlanQtyStepper itemName="Cold Brew" qty={12} saving={false} justSaved onSave={() => undefined} disabled={false} />
          </div>
          <div className="v3-story-row">
            <span className="v3-story-label">Desktop planning</span>
            <PlanQtyCell itemName="Kopi Susu Gula Aren" qty={8} saving onSave={() => undefined} disabled={false} />
            <PlanQtyCell itemName="Cold Brew" qty={12} saving={false} justSaved onSave={() => undefined} disabled={false} />
          </div>
        </div>
      </section>
    </div>
  ),
}
