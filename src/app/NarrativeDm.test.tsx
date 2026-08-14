import { act, fireEvent, render, screen } from '@testing-library/react';
import { DemoProvider } from '../ai/demoProvider';
import type {
  AIProvider,
  DialogueResponse,
  NarrativeResponse,
  StructuredResponse,
} from '../ai/provider';
import NarrativeDm from './NarrativeDm';

const OPENING: NarrativeResponse = {
  narration: 'The bell rings. You are Maya, a student with telekinesis, standing in the corridor.',
  situation: 'A quiet unease hangs over the school.',
  unresolvedThreads: ['Find the lights'],
  proposal: null,
};

const TURN_REPLY: NarrativeResponse = {
  narration: 'You move — "I open the locker." The story continues.',
  situation: 'The locker creaks open.',
  unresolvedThreads: ['Find the lights'],
  proposal: null,
};

const PROPOSAL: NarrativeResponse = {
  narration: 'The hall monitor blocks your path.',
  situation: 'Blocked at the gym doors.',
  unresolvedThreads: ['Attend the assembly'],
  proposal: {
    id: 'expulsion-threat',
    summary: 'Maya is threatened with permanent expulsion.',
    details: 'One more incident means permanent removal.',
    situationAfter: 'Maya is on the expulsion list.',
  },
};

/** Provider with a scripted queue: shift() per call; Error entries throw. */
class ScriptedProvider implements AIProvider {
  label = 'Scripted';
  constructor(private readonly queue: Array<NarrativeResponse | Error>) {}

  async generateNarrative(): Promise<NarrativeResponse> {
    await new Promise((resolve) => setTimeout(resolve, 1));
    const next = this.queue.shift();
    if (next instanceof Error) {
      throw next;
    }
    return next ?? TURN_REPLY;
  }

  generateStructured(): Promise<StructuredResponse> {
    return Promise.reject(new Error('unused'));
  }

  generateDialogue(): Promise<DialogueResponse> {
    return Promise.reject(new Error('unused'));
  }
}

async function startStory(provider: AIProvider, name = 'Maya') {
  const view = render(<NarrativeDm provider={provider} />);
  fireEvent.change(screen.getByLabelText('Character name'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Archetype'), {
    target: { value: 'student with telekinesis' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Start Story' }));
  await screen.findByText(/The bell rings/);
  return view;
}

describe('NarrativeDm', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the provider label and requires name + archetype to start', () => {
    render(<NarrativeDm provider={new DemoProvider()} />);
    expect(screen.getByText(/Provider: Demo \(offline/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Story' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Character name'), { target: { value: 'Maya' } });
    expect(screen.getByRole('button', { name: 'Start Story' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Archetype'), { target: { value: 'student' } });
    expect(screen.getByRole('button', { name: 'Start Story' })).toBeEnabled();
  });

  it('starts a story and shows a loading status while the opening is pending', async () => {
    let resolveOpening!: (r: NarrativeResponse) => void;
    const openingPromise = new Promise<NarrativeResponse>((resolve) => {
      resolveOpening = resolve;
    });
    const provider = new ScriptedProvider([]);
    const generate = vi.spyOn(provider, 'generateNarrative').mockReturnValue(openingPromise);

    render(<NarrativeDm provider={provider} />);
    fireEvent.change(screen.getByLabelText('Character name'), { target: { value: 'Maya' } });
    fireEvent.change(screen.getByLabelText('Archetype'), { target: { value: 'student' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start Story' }));

    expect(screen.getByText('The DM is opening the scene…')).toBeInTheDocument();

    await act(async () => {
      resolveOpening(OPENING);
    });
    expect(await screen.findByText(/The bell rings/)).toBeInTheDocument();
    expect(generate).toHaveBeenCalledOnce();
  });

  it('sends several messages with the demo provider and advances the turn count', async () => {
    await startStory(new DemoProvider());
    expect(screen.getByText(/Turn 0/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Your action or words'), {
      target: { value: 'I open the locker.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByText('The DM is thinking…')).toBeInTheDocument();
    expect((await screen.findAllByText(/Riley Vasquez/)).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Your action or words'), {
      target: { value: 'I look at Riley.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect((await screen.findAllByText(/mandatory assembly/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Turn 2/)).toBeInTheDocument();
  });

  it('shows an error with retry that does not duplicate the player message', async () => {
    const provider = new ScriptedProvider([OPENING, new Error('boom'), TURN_REPLY]);
    await startStory(provider);

    fireEvent.change(screen.getByLabelText('Your action or words'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    expect(screen.getAllByText('hello')).toHaveLength(1);
    expect(screen.getByLabelText('Your action or words')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/The story continues/)).toBeInTheDocument();
    expect(screen.getAllByText('hello')).toHaveLength(1); // still no duplicate
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces an opening failure and allows retrying', async () => {
    const provider = new ScriptedProvider([new Error('gateway down'), OPENING]);
    render(<NarrativeDm provider={provider} />);
    fireEvent.change(screen.getByLabelText('Character name'), { target: { value: 'Maya' } });
    fireEvent.change(screen.getByLabelText('Archetype'), { target: { value: 'student' } });

    fireEvent.click(screen.getByRole('button', { name: 'Start Story' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('gateway down');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/The bell rings/)).toBeInTheDocument();
  });

  it('gates a proposed major change behind explicit approval', async () => {
    const provider = new ScriptedProvider([OPENING, TURN_REPLY, PROPOSAL]);
    await startStory(provider);

    fireEvent.change(screen.getByLabelText('Your action or words'), { target: { value: 'step forward' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText(/The story continues/);

    fireEvent.change(screen.getByLabelText('Your action or words'), { target: { value: 'stay calm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const proposal = await screen.findByRole('region', { name: 'Proposed major change' });
    expect(proposal).toHaveTextContent('permanent expulsion');
    expect(screen.getByLabelText('Your action or words')).toBeDisabled();

    // The proposal is not canon yet.
    expect(screen.getByText('Blocked at the gym doors.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText(/Approved: Maya is threatened/)).toBeInTheDocument();
    expect(screen.getByText('Maya is on the expulsion list.')).toBeInTheDocument();
    expect(screen.getByLabelText('Your action or words')).toBeEnabled();
  });

  it('resumes a saved story on remount and keeps chatting', async () => {
    const first = new DemoProvider();
    const firstRender = await startStory(first);
    fireEvent.change(screen.getByLabelText('Your action or words'), { target: { value: 'I open the locker.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect((await screen.findAllByText(/Riley Vasquez/)).length).toBeGreaterThan(0);
    firstRender.unmount();

    // Fresh component = fresh hook; story must be restored from localStorage.
    render(<NarrativeDm provider={new DemoProvider()} />);
    expect(screen.getByText(/The bell rings/)).toBeInTheDocument();
    expect(screen.getAllByText(/I open the locker\./).length).toBeGreaterThan(0);
    expect(screen.getByText(/Turn 1/)).toBeInTheDocument();
    expect(screen.getAllByText(/Riley Vasquez/).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Your action or words'), { target: { value: 'I follow her.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect((await screen.findAllByText(/mandatory assembly/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Turn 2/)).toBeInTheDocument();
  });

  it('starts a brand-new story after New Story', async () => {
    await startStory(new DemoProvider());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'New Story' }));
    expect(screen.getByRole('form', { name: 'Story setup' })).toBeInTheDocument();
    expect(screen.queryByText(/The bell rings/)).not.toBeInTheDocument();
    confirm.mockRestore();
  });
});
