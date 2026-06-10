import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    document.title = 'Gordi MOS — Management OS'
  }, [])

  return (
    <main className="min-h-screen bg-background text-foreground p-6">
      <h1 className="text-[24px] font-bold tracking-[-0.02em] leading-[1.2]">
        Gordi MOS
      </h1>
    </main>
  )
}
