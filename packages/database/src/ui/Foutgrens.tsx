/** Vangt een onverwachte fout in één weergave op, zodat de rest van de werkruimte (en de werkkopie) blijft werken. */
import { Component, type ReactNode } from "react";

export class Foutgrens extends Component<{ children: ReactNode }, { fout: Error | null }> {
  state = { fout: null as Error | null };
  static getDerivedStateFromError(fout: Error) {
    return { fout };
  }
  render() {
    if (!this.state.fout) return this.props.children;
    return (
      <div className="melding fout" role="alert">
        <p>Deze weergave liep vast: {this.state.fout.message}</p>
        <p>De werkkopie is niet aangetast. Kies een ander object of probeer het opnieuw.</p>
        <button onClick={() => this.setState({ fout: null })}>Opnieuw proberen</button>
      </div>
    );
  }
}
