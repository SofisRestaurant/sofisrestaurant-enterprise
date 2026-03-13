import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HeroSection } from '@/components/home/HeroSection';

function renderHero(overrides?: {
  onPrimaryCtaClick?: () => void;
  onSecondaryCtaClick?: () => void;
}) {
  return render(
    <MemoryRouter>
      <HeroSection
        onPrimaryCtaClick={overrides?.onPrimaryCtaClick}
        onSecondaryCtaClick={overrides?.onSecondaryCtaClick}
      />
    </MemoryRouter>,
  );
}

describe('HeroSection', () => {
  it('renders primary heading and tagline', () => {
    renderHero();

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent("Sofi's Restaurant");

    expect(
      screen.getByText(/authentic flavors/i),
    ).toBeInTheDocument();
  });

  it('renders CTA buttons with correct labels', () => {
    renderHero();

    expect(
      screen.getByRole('link', { name: /view menu/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /make reservation/i }),
    ).toBeInTheDocument();
  });

  it('invokes analytics callbacks when CTAs are clicked', () => {
    const primarySpy = vi.fn();
    const secondarySpy = vi.fn();

    renderHero({
      onPrimaryCtaClick: primarySpy,
      onSecondaryCtaClick: secondarySpy,
    });

    fireEvent.click(
      screen.getByRole('link', { name: /view menu/i }),
    );
    fireEvent.click(
      screen.getByRole('link', { name: /make reservation/i }),
    );

    expect(primarySpy).toHaveBeenCalledTimes(1);
    expect(secondarySpy).toHaveBeenCalledTimes(1);
  });

  it('marks hero as a banner landmark for accessibility', () => {
    renderHero();

    const banner = screen.getByRole('banner');
    expect(banner).toBeInTheDocument();
  });
});

