import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CaptureControl, CaptureQuantityControl, CaptureRow, CaptureTable } from './capture-row'

afterEach(cleanup)

type Item = { id: string; name: string; kind: string }
const items: Item[] = [
  { id: 'a', name: 'RAW - Anchor Red Cheese Cheddar Slice Quick Melt 1.2 kg', kind: 'RAW' },
  { id: 'b', name: 'Beef Patty', kind: 'WIP' },
]

function table(extra: Partial<React.ComponentProps<typeof CaptureTable<Item>>> = {}) {
  return (
    <CaptureTable<Item>
      caption="Items"
      columns={{ item: 'Item', figures: ['Plan', 'Stock'], controls: [{ label: 'Add now' }], action: 'Quick fill' }}
      rows={items}
      renderRow={item => (
        <CaptureRow
          id={item.id}
          name={item.name}
          kind={item.kind}
          figures={item.id === 'a' ? [{ label: 'Plan', value: '12', unit: 'Batch @50porsi' }, { label: 'Stock', value: '0', unit: 'Batch @50porsi' }] : []}
          controls={[{ node: <CaptureControl><input inputMode="decimal" aria-label={`Quantity for ${item.name}`} /><span className="cap-unit">GR</span></CaptureControl> }]}
          action={item.id === 'a' ? <button type="button">Add photo</button> : null}
          detail={item.id === 'b' ? <p>Needs a note</p> : null}
        />
      )}
      {...extra}
    />
  )
}

describe('CaptureTable / CaptureRow: one row anatomy for every Café entry list', () => {
  it('is a table with one header row and one row per item, each naming its item and kind', () => {
    render(table())
    const grid = screen.getByRole('table', { name: 'Items' })
    expect(within(grid).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Item', 'Plan', 'Stock', 'Add nowUnit', 'Quick fill'])
    const rows = within(grid).getAllByRole('row').filter(row => row.classList.contains('cap-row'))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveAccessibleName(/RAW.*Anchor Red Cheese Cheddar Slice Quick Melt 1.2 kg/)
  })

  it('gives every row the same cells, so a row with no figure or action still keeps its tracks', () => {
    render(table())
    const rows = screen.getAllByRole('row').filter(row => row.classList.contains('cap-row'))
    for (const row of rows) {
      expect(row.querySelectorAll('.cap-fig')).toHaveLength(2)
      expect(row.querySelectorAll('.cap-row__control')).toHaveLength(1)
      expect(row.querySelectorAll('.cap-row__action')).toHaveLength(1)
    }
    expect(rows[1].querySelector('.cap-fig__num')).toBeNull()
    expect(within(rows[0]).getByRole('button', { name: 'Add photo' })).toBeInTheDocument()
  })

  it('puts a figure next to its unit and says its name for stacked lists', () => {
    render(table())
    const row = screen.getAllByRole('row').filter(r => r.classList.contains('cap-row'))[0]
    const figure = row.querySelector('.cap-fig')!
    expect(figure.querySelector('.cap-fig__label')).toHaveTextContent('Plan')
    expect(figure.querySelector('.cap-fig__num')).toHaveTextContent('12')
    expect(figure.querySelector('.cap-fig__unit')).toHaveTextContent('Batch @50porsi')
  })

  it('puts the category after the name on a wide list: no meta line of its own', () => {
    render(
      <CaptureTable<Item>
        caption="Items"
        columns={{ item: 'Item', controls: [{ label: 'Received' }] }}
        rows={[items[1]]}
        renderRow={item => <CaptureRow id={item.id} name={item.name} kind={item.kind} category="Kitchen" controls={[{ node: <CaptureControl><input aria-label="Qty" /></CaptureControl> }]} />}
      />,
    )
    const row = screen.getAllByRole('row').filter(r => r.classList.contains('cap-row'))[0]
    expect(row.querySelector('.cap-row__line .cap-row__cat')).toHaveTextContent('Kitchen')
    expect(row.querySelector('.cap-row__meta')).toBeNull()
    expect(row).toHaveAccessibleName(/Beef Patty/)
    expect(row).not.toHaveAccessibleName(/Kitchen/)
  })

  it('on a stacked list puts the category first in the one muted line with the figures', () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 300, height: 10, top: 0, left: 0, right: 300, bottom: 10, x: 0, y: 0, toJSON: () => ({}) })
    render(
      <CaptureTable<Item>
        caption="Items"
        columns={{ item: 'Item', figures: ['Stock'], controls: [{ label: 'Add now' }] }}
        rows={[items[1]]}
        renderRow={item => <CaptureRow id={item.id} name={item.name} category="Kitchen" figures={[{ label: 'Stock', value: '0', unit: 'KG' }]} controls={[{ node: <CaptureControl><input aria-label="Qty" /></CaptureControl> }]} />}
      />,
    )
    const line = document.querySelector('.cap-row__figures')!
    expect(line.firstElementChild).toHaveTextContent('Kitchen')
    expect(line.querySelector('.cap-fig')).toHaveTextContent('Stock0KG')
    expect(document.querySelector('.cap-row__line .cap-row__cat')).toBeNull()
    rect.mockRestore()
  })

  it('shows a detail line only when a row has something to say', () => {
    render(table())
    expect(screen.getByText('Needs a note').closest('.cap-row__detail')).not.toBeNull()
    expect(document.querySelectorAll('.cap-row__detail')).toHaveLength(1)
  })

  it('collapses and expands a group, keeping its count', () => {
    render(table({ rows: undefined, groups: [{ key: 'g', label: 'Planned today', rows: items }] }))
    expect(screen.getAllByRole('row').filter(r => r.classList.contains('cap-row'))).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /Planned today/ }))
    expect(screen.queryAllByRole('row').filter(r => r.classList.contains('cap-row'))).toHaveLength(0)
    expect(screen.getByText('(2)')).toBeInTheDocument()
  })

  it('says why there is nothing to enter, with the filters still reachable', () => {
    render(table({ rows: [], state: 'empty', emptyLabel: 'No items match' }))
    expect(screen.getByText('No items match')).toBeInTheDocument()
  })

  it('offers a retry when the list could not load', () => {
    const onRetry = vi.fn()
    render(table({ state: 'error', onRetry }))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('CaptureQuantityControl', () => {
  it('types a quantity and shows the fixed unit', () => {
    const onChange = vi.fn()
    render(<CaptureQuantityControl id="q" itemName="Beef Patty" quantityFor="Quantity for Beef Patty" value="" unitName="GR" onQuantityChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Quantity for Beef Patty' }), { target: { value: '12' } })
    expect(onChange).toHaveBeenCalledWith('12')
    expect(screen.getByRole('textbox', { name: 'Quantity for Beef Patty' })).toHaveAccessibleDescription('GR')
  })

  it.each([
    ['EN', 'Quantity for Beef Patty', 'Enter a positive quantity'],
    ['ID', 'Jumlah untuk Beef Patty', 'Masukkan jumlah positif'],
  ])('describes the quantity with its unit and any error in %s', (_language, quantityFor, error) => {
    const { rerender } = render(<CaptureQuantityControl id="q" itemName="Beef Patty" quantityFor={quantityFor} value="" unitName="GR" onQuantityChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: quantityFor })).toHaveAccessibleDescription('GR')
    rerender(<>
      <CaptureQuantityControl id="q" itemName="Beef Patty" quantityFor={quantityFor} value="-1" unitName="KG" invalid describedById="quantity-error" onQuantityChange={vi.fn()} />
      <p id="quantity-error">{error}</p>
    </>)
    expect(screen.getByRole('textbox', { name: quantityFor })).toHaveAccessibleDescription(`KG ${error}`)
  })

  it('offers a change-unit choice only when the item has more than one unit', () => {
    const onToggle = vi.fn(), onUnit = vi.fn()
    const units = [{ id: '1', name: 'GR' }, { id: '2', name: 'KG' }]
    const { rerender } = render(<CaptureQuantityControl id="q" itemName="Beef Patty" quantityFor="Quantity" value="" unitName="GR" units={units} selectedUnitId="1" onQuantityChange={vi.fn()} onToggleUnit={onToggle} onUnitChange={onUnit} />)
    fireEvent.click(screen.getByRole('button', { name: /change unit/i }))
    expect(onToggle).toHaveBeenCalled()
    rerender(<CaptureQuantityControl id="q" itemName="Beef Patty" quantityFor="Quantity" value="" unitName="GR" units={units} selectedUnitId="1" changingUnit onQuantityChange={vi.fn()} onToggleUnit={onToggle} onUnitChange={onUnit} />)
    fireEvent.click(screen.getByRole('radio', { name: 'KG' }))
    expect(onUnit).toHaveBeenCalledWith('2')
    rerender(<CaptureQuantityControl id="q" itemName="Beef Patty" quantityFor="Quantity" value="" unitName="GR" units={[units[0]]} onQuantityChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /change unit/i })).toBeNull()
  })
})
