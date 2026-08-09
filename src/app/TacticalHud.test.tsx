import { act, fireEvent, render, screen } from '@testing-library/react';
import { FIREBALL_ID, FORCE_PUSH_ID, PUNCH_ID } from '../game/abilities/catalog';
import { TacticalEngine } from '../game/combat/engine';
import TacticalHud from './TacticalHud';

function createEngine(): TacticalEngine {
  return new TacticalEngine({
    units: [
      {
        id: 'hero',
        name: 'Hero',
        team: 'PLAYER',
        controller: 'PLAYER',
        hp: 5,
        maxHp: 5,
        movement: 3,
        position: { x: 0, y: 0 },
        abilityIds: [PUNCH_ID, FIREBALL_ID, FORCE_PUSH_ID],
      },
      {
        id: 'enemy',
        name: 'Enemy',
        team: 'ENEMY',
        controller: 'AI',
        hp: 3,
        maxHp: 3,
        movement: 2,
        position: { x: 1, y: 0 },
        abilityIds: [PUNCH_ID],
      },
    ],
  });
}

describe('TacticalHud', () => {
  it('shows and selects the abilities assigned to the selected unit', () => {
    const engine = createEngine();
    engine.selectUnit('hero');
    render(<TacticalHud engine={engine} />);

    expect(screen.getByRole('button', { name: /Punch/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Fireball/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Force Push/ })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /Fireball/ }));
    expect(engine.state.selectedAbilityId).toBe(FIREBALL_ID);
    expect(screen.getByRole('button', { name: /Fireball/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/Blast enemies within 1 tile/)).toBeInTheDocument();
  });

  it('reacts to engine commands and disables action abilities after use', () => {
    const engine = createEngine();
    engine.selectUnit('hero');
    render(<TacticalHud engine={engine} />);

    act(() => {
      engine.useAbility('hero', PUNCH_ID, { kind: 'UNIT', unitId: 'enemy' });
    });

    expect(screen.getByText(/Action 0/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Punch/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Fireball/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Force Push/ })).toBeDisabled();
  });
});
