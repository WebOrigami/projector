export default function CommandFeatures(Base) {
  return class extends Base {
    render(state, changed) {
      super.render?.(state, changed);

      if (changed.operationInProgress) {
        window.progressScrim.style.display = state.operationInProgress
          ? "block"
          : "none";
      }
    }
  };
}
