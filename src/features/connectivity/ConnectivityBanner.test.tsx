import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ConnectivityBanner } from './ConnectivityBanner';

const initialOnline = navigator.onLine;

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: initialOnline });
});

describe('ConnectivityBanner', () => {
  it('announces when the browser loses connectivity', () => {
    render(<ConnectivityBanner />);
    expect(screen.queryByText(/No tienes conexión/)).not.toBeInTheDocument();

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    act(() => window.dispatchEvent(new Event('offline')));

    expect(screen.getByRole('status')).toHaveTextContent('No tienes conexión');
  });
});
