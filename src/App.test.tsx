import { render, screen } from '@testing-library/react';
import App from './App';

// Phaser needs a real canvas/WebGL context — not available in jsdom.
// Mock the canvas host so the shell can be tested without a browser.
vi.mock('./app/GameCanvas', () => ({
  default: () => <div data-testid="game-canvas" />,
}));

describe('App shell', () => {
  it('renders the title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'AI-DM Tactical RPG' })).toBeInTheDocument();
    expect(screen.getByTestId('game-canvas')).toBeInTheDocument();
  });
});
