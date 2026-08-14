import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

// The combat demo is a lazy chunk; stub it so jsdom never touches Phaser.
vi.mock('./app/CombatDemo', () => ({
  default: () => <div data-testid="combat-demo" />,
}));

describe('App shell', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the narrative DM by default', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'AI-DM Tactical RPG' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Narrative DM' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('form', { name: 'Story setup' })).toBeInTheDocument();
  });

  it('switches to the lazily loaded combat demo', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Combat Demo' }));
    expect(await screen.findByTestId('combat-demo')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Combat Demo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
