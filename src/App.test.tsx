import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

// Phaser is a browser-only renderer and probes real canvas features at module
// load; jsdom has no 2D context. Stub the module so the always-on board shell
// can be tested headlessly (GameCanvas's own canvas probe still bails out).
vi.mock('phaser', () => {
  class Scene {}
  class Game {
    scale = { resize: () => {} };
    scene = { add: () => {} };
    canvas = document.createElement('canvas');
    destroy = () => {};
  }
  return {
    default: {
      AUTO: 0,
      Scene,
      Game,
      Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    },
  };
});

// The combat demo is a lazy dev fixture; stub it so jsdom never touches it.
vi.mock('./app/CombatDemo', () => ({
  default: () => <div data-testid="combat-demo" />,
}));

describe('App shell (Phase 6A always-on board)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the always-on board with the Story tab active by default', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'AI-DM Tactical RPG' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'World board' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('form', { name: 'Story setup' })).toBeInTheDocument();
    // The old Narrative DM / Combat Demo production tabs are gone.
    expect(screen.queryByRole('tab', { name: 'Narrative DM' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Combat Demo' })).not.toBeInTheDocument();
  });

  it('switches to the Details and World tabs', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(
      screen.getByText(/Click any actor on the board to inspect them here/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'World' }));
    expect(screen.getByRole('region', { name: 'Current location' })).toBeInTheDocument();
    expect(screen.getByText('West Wing Hallway')).toBeInTheDocument();
  });

  it('opens the combat demo only as a dev fixture and returns to the board', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Combat Demo \(dev fixture\)/ }));
    expect(await screen.findByTestId('combat-demo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the World Board' }));
    expect(screen.getByRole('region', { name: 'World board' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
  });
});
