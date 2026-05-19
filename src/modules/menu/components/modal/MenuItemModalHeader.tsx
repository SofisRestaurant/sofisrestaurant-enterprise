// =============================================================================
// Legacy header export — superseded by MenuItemModalHero in the customer modal.
// Kept for import stability; delegates to the same visual language as Hero.
// =============================================================================

import type { ModalHeaderProps } from '@/domain/menu/menu-modal.types';
import { MenuItemModalHero } from './MenuItemModalHero';

export function MenuItemModalHeader({
  name,
  categoryLabel,
  isPopular,
  basePriceLabel,
  extrasLabel,
  onClose: _onClose,
  closeBtnRef: _closeBtnRef,
  headerPriceLabel: _headerPriceLabel,
}: ModalHeaderProps) {
  return (
    <MenuItemModalHero
      titleId="menu-item-modal-title"
      categoryLabel={categoryLabel}
      name={name}
      description=""
      isPopular={isPopular}
      basePriceLabel={basePriceLabel}
      extrasLabel={extrasLabel}
      preflightOk={false}
      preflightLoading={false}
    />
  );
}
