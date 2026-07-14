function setActive(buttons, active) {
  buttons.forEach((button) => {
    button.classList.toggle('active', button === active)
    button.setAttribute('aria-pressed', button === active ? 'true' : 'false')
  })
}

function setupPersonaSwitches() {
  document.querySelectorAll('[data-persona-switch]').forEach((group) => {
    const buttons = Array.from(group.querySelectorAll('button[data-persona]'))
    const root = group.closest('[data-persona-root]') || document

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const persona = button.getAttribute('data-persona')
        setActive(buttons, button)
        root.querySelectorAll('[data-persona-panel]').forEach((panel) => {
          panel.classList.toggle('hidden', panel.getAttribute('data-persona-panel') !== persona)
        })
      })
    })
  })
}

function setupTileSelection() {
  document.querySelectorAll('[data-selectable-tiles]').forEach((grid) => {
    const tiles = Array.from(grid.querySelectorAll('.tile'))
    const label = document.querySelector(grid.getAttribute('data-select-label') || '')
    tiles.forEach((tile) => {
      tile.addEventListener('click', () => {
        tiles.forEach((item) => item.classList.remove('selected'))
        tile.classList.add('selected')
        if (label) label.textContent = tile.getAttribute('data-drill') || tile.querySelector('.top')?.textContent || 'Filtered'
      })
    })
  })
}

function setupSegmentedControls() {
  document.querySelectorAll('.seg').forEach((seg) => {
    const buttons = Array.from(seg.querySelectorAll('button'))
    buttons.forEach((button) => {
      button.addEventListener('click', () => setActive(buttons, button))
    })
  })
}

function setupMockRoutes() {
  document.querySelectorAll('[data-mock-app]').forEach((app) => {
    const pages = Array.from(app.querySelectorAll('[data-route]'))
    const links = Array.from(app.querySelectorAll('[data-route-link]'))
    const defaultRoute = app.getAttribute('data-default-route') || pages[0]?.getAttribute('data-route')
    const routeTitle = app.querySelector('[data-route-title]:not([data-route-link])')
    const routeSub = app.querySelector('[data-route-subtitle]:not([data-route-link])')

    function routeFromHash() {
      const hash = window.location.hash.replace(/^#/, '')
      if (hash && pages.some((page) => page.getAttribute('data-route') === hash)) return hash
      return defaultRoute
    }

    function show(route) {
      app.querySelectorAll('[data-drawer]').forEach((drawer) => drawer.classList.add('hidden'))
      const currentPage = pages.find((page) => page.getAttribute('data-route') === route)
      const parentRoute = currentPage?.getAttribute('data-route-parent')
      const titleFallback = currentPage?.getAttribute('data-route-name') || currentPage?.querySelector('h1')?.textContent?.trim() || route
      const subtitleFallback = currentPage?.getAttribute('data-route-subtitle') || ''
      let titleSet = false
      let subtitleSet = false

      pages.forEach((page) => {
        page.classList.toggle('hidden', page.getAttribute('data-route') !== route)
      })
      links.forEach((link) => {
        const linkRoute = link.getAttribute('data-route-link')
        const active = linkRoute === route || (parentRoute && linkRoute === parentRoute)
        link.classList.toggle('active', active)
        if (active && linkRoute === route && routeTitle) {
          routeTitle.textContent = link.getAttribute('data-route-name') || link.textContent.trim()
          titleSet = true
        }
        if (active && linkRoute === route && routeSub) {
          routeSub.textContent = link.getAttribute('data-route-subtitle') || ''
          subtitleSet = true
        }
      })
      if (!titleSet && routeTitle) routeTitle.textContent = titleFallback
      if (!subtitleSet && routeSub) routeSub.textContent = subtitleFallback
    }

    links.forEach((link) => {
      link.addEventListener('click', (event) => {
        const route = link.getAttribute('data-route-link')
        if (!route) return
        event.preventDefault()
        window.location.hash = route
        show(route)
      })
    })

    window.addEventListener('hashchange', () => show(routeFromHash()))
    show(routeFromHash())
  })
}

function setupActionDrawers() {
  document.querySelectorAll('[data-mock-app]').forEach((app) => {
    const drawers = Array.from(app.querySelectorAll('[data-drawer]'))
    if (!drawers.length) return
    const drawerIds = new Set(drawers.map((drawer) => drawer.getAttribute('data-drawer')))

    function closeDrawers() {
      drawers.forEach((drawer) => drawer.classList.add('hidden'))
    }

    app.querySelectorAll('a[href^="#"]').forEach((link) => {
      const target = link.getAttribute('href')?.replace(/^#/, '')
      if (!drawerIds.has(target)) return
      link.addEventListener('click', (event) => {
        event.preventDefault()
        drawers.forEach((drawer) => {
          drawer.classList.toggle('hidden', drawer.getAttribute('data-drawer') !== target)
        })
      })
    })

    app.querySelectorAll('[data-drawer-link]').forEach((control) => {
      const target = control.getAttribute('data-drawer-link')
      if (!drawerIds.has(target)) return
      control.addEventListener('click', () => {
        drawers.forEach((drawer) => {
          drawer.classList.toggle('hidden', drawer.getAttribute('data-drawer') !== target)
        })
      })
    })

    app.querySelectorAll('[data-drawer-close]').forEach((control) => {
      control.addEventListener('click', closeDrawers)
    })

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDrawers()
    })
  })
}

document.addEventListener('DOMContentLoaded', () => {
  setupPersonaSwitches()
  setupTileSelection()
  setupSegmentedControls()
  setupMockRoutes()
  setupActionDrawers()
})
