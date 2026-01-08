import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Theme } from '@radix-ui/themes';
import App from './App';

describe('App', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
  });

  it('should render the app', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Theme>
          <App />
        </Theme>
      </QueryClientProvider>
    );

    expect(screen.getByText('DNA Application')).toBeInTheDocument();
  });

  it('should display loading state initially', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Theme>
          <App />
        </Theme>
      </QueryClientProvider>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should display data after loading', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Theme>
          <App />
        </Theme>
      </QueryClientProvider>
    );

    // Use findByText which automatically waits for the element to appear
    expect(
      await screen.findByText('Hello from DNA App!', {}, { timeout: 2000 })
    ).toBeInTheDocument();
  });
});
