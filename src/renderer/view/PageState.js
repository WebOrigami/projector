// Mixin to handle page state in the project window
export default function PageState(Base) {
  return class extends Base {
    loaded() {
      super.loaded?.();
    }
  };
}
