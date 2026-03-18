// Registers <model-viewer> ONCE globally (prevents duplicate errors)
if (!customElements.get('model-viewer')) {
  await import('@google/model-viewer');
}

export {};