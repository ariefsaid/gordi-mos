import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../theme/theme-provider');
import { useThemeContext } from '@/theme/theme-provider';

import { AppearanceControl } from './appearance-control';

const mockUseThemeContext = vi.mocked(useThemeContext);

function makeMatchMedia(dark: boolean) {
  return {
    matches: dark,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockReturnValue(
    makeMatchMedia(false) as unknown as MediaQueryList
  );
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * AC-138: Appearance control in the account menu.
 */
describe('AC-138: AppearanceControl — theme switcher radios', () => {
  it('renders three menuitemradio options: Light, Dark, System', () => {
    mockUseThemeContext.mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme: vi.fn(),
    });
    render(<AppearanceControl />);
    const radios = screen.getAllByRole('menuitemradio');
    expect(radios).toHaveLength(3);
    expect(screen.getByRole('menuitemradio', { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /dark/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /system/i })).toBeInTheDocument();
  });

  it('aria-checked reflects current chosen theme (light selected)', () => {
    mockUseThemeContext.mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme: vi.fn(),
    });
    render(<AppearanceControl />);
    expect(screen.getByRole('menuitemradio', { name: /light/i })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('menuitemradio', { name: /dark/i })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.getByRole('menuitemradio', { name: /system/i })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('aria-checked reflects current chosen theme (dark selected)', () => {
    mockUseThemeContext.mockReturnValue({
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme: vi.fn(),
    });
    render(<AppearanceControl />);
    expect(screen.getByRole('menuitemradio', { name: /dark/i })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('menuitemradio', { name: /light/i })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('aria-checked reflects current chosen theme (system selected)', () => {
    mockUseThemeContext.mockReturnValue({
      theme: 'system',
      resolvedTheme: 'light',
      setTheme: vi.fn(),
    });
    render(<AppearanceControl />);
    expect(screen.getByRole('menuitemradio', { name: /system/i })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('clicking Light calls setTheme("light")', async () => {
    const setTheme = vi.fn();
    mockUseThemeContext.mockReturnValue({
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme,
    });
    const user = userEvent.setup();
    render(<AppearanceControl />);
    await user.click(screen.getByRole('menuitemradio', { name: /light/i }));
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  it('clicking Dark calls setTheme("dark")', async () => {
    const setTheme = vi.fn();
    mockUseThemeContext.mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme,
    });
    const user = userEvent.setup();
    render(<AppearanceControl />);
    await user.click(screen.getByRole('menuitemradio', { name: /dark/i }));
    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('clicking System calls setTheme("system")', async () => {
    const setTheme = vi.fn();
    mockUseThemeContext.mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme,
    });
    const user = userEvent.setup();
    render(<AppearanceControl />);
    await user.click(screen.getByRole('menuitemradio', { name: /system/i }));
    expect(setTheme).toHaveBeenCalledWith('system');
  });

  it('has an "Appearance" label visible to identify the group', () => {
    mockUseThemeContext.mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme: vi.fn(),
    });
    render(<AppearanceControl />);
    // The group label text must be present
    expect(screen.getByText(/appearance/i)).toBeInTheDocument();
  });
});
