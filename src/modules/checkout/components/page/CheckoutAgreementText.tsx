export function CheckoutAgreementText({ isGuest }: { isGuest: boolean }) {
  return (
    <p className="text-center text-[11px] leading-5 text-ink-400">
      By placing an order, you agree to Sofi&apos;s payment terms and confirm that no changes can be
      made after the order is placed.
      {isGuest &&
        ' If you enter an email, we may use it for your receipt and optional rewards setup.'}
    </p>
  );
}
