import { describe, it, expect } from 'vitest';
import { render, screen } from './test/render';
import App from './App';

describe('App', () => {
  it('should render the app', () => {
    render(<App />);
    expect(document.body).toBeInTheDocument();
  });

  it('should render the project selector initially', () => {
    render(<App />);
    expect(screen.getByText('Welcome to DNA')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
  });
});
