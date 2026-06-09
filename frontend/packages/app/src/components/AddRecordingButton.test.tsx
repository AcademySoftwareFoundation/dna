import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../test/render';
import userEvent from '@testing-library/user-event';
import { AddRecordingButton } from './AddRecordingButton';

describe('AddRecordingButton', () => {
  it('renders the labelled button', () => {
    render(<AddRecordingButton onClick={() => {}} />);
    expect(
      screen.getByRole('button', { name: 'Add Recording' })
    ).toBeInTheDocument();
  });

  it('fires onClick when pressed', async () => {
    const onClick = vi.fn();
    render(<AddRecordingButton onClick={onClick} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Add Recording' })
    );
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is set', () => {
    render(<AddRecordingButton onClick={() => {}} disabled />);
    expect(
      screen.getByRole('button', { name: 'Add Recording' })
    ).toBeDisabled();
  });
});
