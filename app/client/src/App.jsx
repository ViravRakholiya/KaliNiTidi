import { useStore } from "./store.js";
import Lobby from "./components/Lobby.jsx";
import Table from "./components/Table.jsx";
import { Toasts, Reveal } from "./components/Toasts.jsx";
import PartnerModal from "./components/modals/PartnerModal.jsx";
import SettingsModal from "./components/modals/SettingsModal.jsx";
import ScoresModal from "./components/modals/ScoresModal.jsx";
import GameOverModal from "./components/modals/GameOverModal.jsx";

export default function App() {
  const screen = useStore((s) => s.screen);
  const overlay = useStore((s) => s.overlay);
  return (
    <>
      {screen === "table" ? <Table /> : <Lobby />}
      {overlay === "partner" ? <PartnerModal /> : null}
      {overlay === "settings" ? <SettingsModal /> : null}
      {overlay === "scores" ? <ScoresModal /> : null}
      {overlay === "over" ? <GameOverModal /> : null}
      <Reveal />
      <Toasts />
    </>
  );
}
