import TopBar from "./TopBar.jsx";
import PartnerBar from "./PartnerBar.jsx";
import Seats from "./Seats.jsx";
import Center from "./Center.jsx";
import MeBar from "./MeBar.jsx";
import Hand from "./Hand.jsx";
import Actions from "./Actions.jsx";

export default function Table() {
  return (
    <section className="screen active">
      <TopBar />
      <PartnerBar />
      <div className="felt">
        <div className="table-surface" />
        <Seats />
        <Center />
      </div>
      <div className="myarea">
        <MeBar />
        <Hand />
        <Actions />
      </div>
    </section>
  );
}
