interface PageHeadProps {
  title: string
  subtitle?: string
}

export default function PageHead({ title, subtitle }: PageHeadProps) {
  return (
    <div className="mb-[22px]">
      <h1
        className="font-bold text-foreground"
        style={{ fontSize: 24, lineHeight: 1.2, letterSpacing: '-0.02em' }}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="text-muted-foreground mt-[6px]" style={{ fontSize: 14 }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}
